import asyncio
import base64
import traceback

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from google import genai
from google.genai import types

from .config import GemiliveSettings


def create_router(settings: GemiliveSettings) -> APIRouter:
    """
    Build and return the FastAPI router for the /ws/live endpoint.
    Called once at mount time with a resolved config.
    """
    router = APIRouter()

    _client = genai.Client(
        api_key=settings.google_api_key,
        http_options={"api_version": "v1beta"},
    )

    # Ensure model name has the required "models/" prefix
    _model = settings.model if settings.model.startswith("models/") else f"models/{settings.model}"

    async def _receive_from_client(ws: WebSocket, session) -> None:
        try:
            while True:
                data = await ws.receive_json()

                if "text" in data:
                    if settings.debug_mode:
                        print(f"[gemilive] text → Gemini: {data['text']}")
                    await session.send_client_content(
                        turns=types.Content(
                            role="user",
                            parts=[types.Part.from_text(text=data["text"])],
                        ),
                        turn_complete=True,
                    )

                elif "realtimeInput" in data:
                    for chunk in data["realtimeInput"].get("mediaChunks", []):
                        mime_type = chunk.get("mimeType")
                        b64_data = chunk.get("data")
                        if not mime_type or not b64_data:
                            continue
                        decoded = base64.b64decode(b64_data)
                        if mime_type.startswith("audio/"):
                            await session.send_realtime_input(
                                audio=types.Blob(mime_type="audio/pcm", data=decoded)
                            )
                        elif mime_type.startswith("image/") or mime_type.startswith("video/"):
                            await session.send_realtime_input(
                                video=types.Blob(mime_type=mime_type, data=decoded)
                            )

        except WebSocketDisconnect:
            pass
        except Exception as e:
            if settings.debug_mode:
                print(f"[gemilive] client receive error: {e}")
                traceback.print_exc()

    async def _receive_from_gemini(ws: WebSocket, session) -> None:
        try:
            while True:
                turn = session.receive()
                async for response in turn:
                    if response.session_resumption_update is not None:
                        continue
                    if getattr(response, "data", None):
                        await ws.send_json({
                            "type": "audio",
                            "mimeType": "audio/pcm",
                            "data": base64.b64encode(response.data).decode("utf-8"),
                        })
                    if getattr(response, "text", None):
                        await ws.send_json({"type": "text", "text": response.text})
                await ws.send_json({"type": "turn_complete"})

        except asyncio.CancelledError:
            pass
        except Exception as e:
            if settings.debug_mode:
                print(f"[gemilive] Gemini receive error: {e}")
                traceback.print_exc()

    @router.websocket("/ws/live")
    async def live_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()

        # --- Setup phase: read system prompt from client, merge with server-side ---
        try:
            setup_msg = await websocket.receive_json()
            client_prompt = setup_msg.get("setup", {}).get("system_prompt", "")

            # Server-side prompt wins; client prompt is appended as extra context
            if settings.system_prompt and client_prompt:
                full_prompt = f"{settings.system_prompt}\n\nAdditional context: {client_prompt}"
            else:
                full_prompt = settings.system_prompt or client_prompt or ""

        except Exception as e:
            if settings.debug_mode:
                print(f"[gemilive] setup error: {e}")
            await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
            return

        # --- Build Gemini session config ---
        speech_config = None
        if settings.voice:
            speech_config = types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.voice)
                )
            )

        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            **({"system_instruction": types.Content(parts=[types.Part.from_text(text=full_prompt)])} if full_prompt else {}),
            **({"speech_config": speech_config} if speech_config else {}),
        )

        # --- Connect to Gemini and run bidirectional streaming ---
        try:
            print(f"[gemilive] connecting → {_model}")
            async with _client.aio.live.connect(model=_model, config=config) as session:
                print("[gemilive] connected")
                client_task = asyncio.create_task(_receive_from_client(websocket, session))
                gemini_task = asyncio.create_task(_receive_from_gemini(websocket, session))

                _, pending = await asyncio.wait(
                    [client_task, gemini_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()

        except Exception as e:
            if settings.debug_mode:
                print(f"[gemilive] Gemini connection error: {e}")
            if websocket.client_state.name == "CONNECTED":
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR)

    return router
