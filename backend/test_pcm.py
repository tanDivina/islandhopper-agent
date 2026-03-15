import os
from google import genai
from google.genai import types
import asyncio

async def test():
    client = genai.Client()
    config = types.LiveConnectConfig(
        system_instruction=types.Content(parts=[types.Part.from_text(text="You are a helpful assistant.")]),
        response_modalities=["AUDIO"]
    )
    try:
        async with client.aio.live.connect(model='gemini-2.5-flash-native-audio-preview-12-2025', config=config) as s:
            print("Connected.")
            dummy_pcm = b'\x00' * 1024
            await s.send(input={"data": dummy_pcm, "mime_type": "audio/pcm;rate=16000"})
            print("pcm sent ok")
            async for response in s.receive():
                print("Received:", response)
                break
    except Exception as e:
        print("ERROR:", e)

asyncio.run(test())