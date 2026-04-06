import asyncio
import websockets
import json

async def connect_to_live_ai():
    url = "ws://localhost:8000/ws/live?token=app_token_1"
    
    try:
        async with websockets.connect(url) as ws:
            # 1. Send system prompt
            print("Connected. Sending setup...")
            await ws.send(json.dumps({
                "setup": {
                    "system_prompt": "You are a backend DevOps assistant. Help me debug python issues. Keep answers short."
                }
            }))
            
            # 2. Send text payload
            print("Sending query...")
            await ws.send(json.dumps({"text": "How do I reverse a string in python?"}))
            
            # 3. Receive responses
            print("Waiting for response...")
            while True:
                response = await ws.recv()
                data = json.loads(response)
                
                if data["type"] == "text":
                    print(f"AI: {data['text']}", end="", flush=True)
                elif data["type"] == "audio":
                    print(f"\n[Received {len(data['data'])} bytes of audio data]")
                elif data["type"] == "turn_complete":
                    print("\n[Finished]")
                    break
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(connect_to_live_ai())
