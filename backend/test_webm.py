import os
from google import genai
from google.genai import types
import asyncio

async def test():
    client = genai.Client(http_options={'api_version': 'v1alpha'})
    config = types.LiveConnectConfig(
        system_instruction=types.Content(parts=[types.Part.from_text(text="You are a helpful assistant.")]),
        response_modalities=["AUDIO"]
    )
    try:
        async with client.aio.live.connect(model='gemini-2.0-flash-exp', config=config) as s:
            print("Connected.")
            
            # Send dummy webm
            dummy_webm = b'\x00' * 1024
            await s.send(input={"data": dummy_webm, "mime_type": "audio/webm"})
            print("webm sent ok")
            
            async for response in s.receive():
                print("Received:", response)
                break
    except Exception as e:
        print("ERROR:", e)
        
asyncio.run(test())