import os
import asyncio
from google import genai
from google.genai import types

async def test():
    try:
        # Test Vertex AI initialization directly
        client = genai.Client(vertexai=True, project="islandhopper-agent-2026", location="us-central1")
        config = types.LiveConnectConfig(
            system_instruction=types.Content(parts=[types.Part.from_text(text="You are a helpful assistant.")]),
            response_modalities=["AUDIO"]
        )
        print("Client initialized. Attempting connection...")
        async with client.aio.live.connect(model='gemini-2.5-flash-native-audio-preview-12-2025', config=config) as s:
            print("Connected successfully via Vertex AI!")
            async for response in s.receive():
                print("Received:", response)
                break
    except Exception as e:
        print("ERROR:", type(e).__name__, str(e))

asyncio.run(test())