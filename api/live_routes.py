
import asyncio
import json
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from google import genai
from google.genai import types
from core.config import settings
import traceback

router = APIRouter()
client = genai.Client(
    api_key=settings.google_api_key,
    http_options={"api_version": "v1beta"}
)

async def receive_from_client(ws: WebSocket, session):
    try:
        while True:
            data = await ws.receive_json()
            
            if "text" in data:
                print(f"[Client -> Gemini] Sending text: {data['text']}")
                await session.send_client_content(
                    turns=types.Content(role="user", parts=[types.Part.from_text(text=data["text"])]),
                    turn_complete=True
                )
                
            elif "realtimeInput" in data:
                media_chunks = data.get("realtimeInput", {}).get("mediaChunks", [])
                for chunk in media_chunks:
                    mime_type = chunk.get("mimeType")
                    b64_data = chunk.get("data")
                    if mime_type and b64_data:
                        decoded_data = base64.b64decode(b64_data)
                        if mime_type.startswith("audio/"):
                            await session.send_realtime_input(
                                audio=types.Blob(mime_type="audio/pcm", data=decoded_data)
                            )
                        elif mime_type.startswith("image/") or mime_type.startswith("video/"):
                            await session.send_realtime_input(
                                video=types.Blob(mime_type=mime_type, data=decoded_data)
                            )

                            
    except WebSocketDisconnect:
        print("Client websocket disconnected")
    except Exception as e:
        print(f"Error reading from client: {e}")
        traceback.print_exc()


async def receive_from_gemini(ws: WebSocket, session):
    try:
        print("[Gemini -> Client] Tailing Gemini responses...")
        while True:
            print("[Gemini -> Client] Waiting for next turn from Gemini...")
            turn = session.receive()
            print("[Gemini -> Client] Turn started. Receiving contents...")
            async for response in turn:
                # Full dump of what Gemini actually sends
                try:
                    dumped = response.model_dump(exclude_none=True)
                    print(f"[Gemini Raw] {dumped}")
                except Exception as de:
                    print(f"[Gemini Raw] {repr(response)} (dump error: {de})")

                # Ignore session bookkeeping signals — not content
                if response.session_resumption_update is not None:
                    continue

                if getattr(response, "data", None):
                    # Encode raw PCM audio from Gemini
                    b64_audio = base64.b64encode(response.data).decode("utf-8")
                    await ws.send_json({
                        "type": "audio",
                        "mimeType": "audio/pcm", # Gemini returns PCM
                        "data": b64_audio
                    })
                
                if getattr(response, "text", None):
                    await ws.send_json({"type": "text", "text": response.text})
            
            # The turn is complete when the async for loop finishes
            await ws.send_json({"type": "turn_complete"})
            
    except asyncio.CancelledError:
        pass
    except Exception as e:
        if settings.debug_mode:
            print(f"Error receiving from Gemini: {e}")
            traceback.print_exc()

@router.websocket("/ws/live")
async def live_ai_endpoint(websocket: WebSocket, token: str = Query(None)):
    # 1. Authentication
    valid_tokens = settings.valid_tokens
    if valid_tokens and token not in valid_tokens:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return
        
    await websocket.accept()
    
    # 2. Setup Phase 
    try:
        setup_msg = await websocket.receive_json()
        setup = setup_msg.get("setup", {})
        system_prompt = setup.get("system_prompt", "")
        greeting = setup.get("greeting", "Hello! Welcome. How can I help you today?")

        # Always add greeting instruction to system prompt
        full_system = f"{system_prompt}\n\nIMPORTANT: When you first connect, greet the user immediately and naturally based on your role.".strip() if system_prompt else "Greet the user immediately when you first connect."

        config = types.LiveConnectConfig(
            system_instruction=types.Content(parts=[types.Part.from_text(text=full_system)]),
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
        )
    except Exception as e:
        print(f"Setup error: {e}")
        await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
        return

    # 3. Connect to Gemini Live AI
    try:
        # Ensure model has proper prefix for Live API
        model_name = settings.model_name
        if not model_name.startswith("models/"):
            model_name = f"models/{model_name}"
        print(f"[WS] Connecting to Gemini Live (Model: {model_name})...")
        async with client.aio.live.connect(model=model_name, config=config) as session:
            print("[WS] Gemini Connected! Starting bidirectional audio streaming.")

            # Start bidirectional streaming immediately
            # The system prompt instructs Gemini to greet on first input
            client_task = asyncio.create_task(receive_from_client(websocket, session))
            gemini_task = asyncio.create_task(receive_from_gemini(websocket, session))

            done, pending = await asyncio.wait(
                [client_task, gemini_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            for p in pending:
                p.cancel()



                
    except Exception as e:
        if settings.debug_mode:
            print(f"Gemini connection error: {e}")
        if websocket.client_state.name == "CONNECTED":
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
