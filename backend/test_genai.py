import os
from google import genai
from google.genai import types
import asyncio

async def test():
    client = genai.Client(vertexai=True, project="islandhopper-agent-2026", location="us-central1")
    config = types.LiveConnectConfig(
        system_instruction=types.Content(parts=[types.Part.from_text(text="You are a helpful assistant.")]),
    )
    model_id = 'gemini-live-2.5-flash-native-audio'
    print(f"Connecting to {model_id} via Vertex AI...")
    try:
        async with client.aio.live.connect(model=model_id, config=config) as s:
            print("Connected successfully.")
            
            # Using audio= argument as per inspection
            await s.send_realtime_input(audio=types.Blob(mime_type="audio/pcm;rate=16000", data=b'\x00'*1024))
            print("Audio chunk sent.")
            
            async for response in s.receive():
                print("Received response.")
                break
    except Exception as e:
        print("ERROR:", e)
        
asyncio.run(test())
