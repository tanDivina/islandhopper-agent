import asyncio
import os
import base64
from google.adk.agents.llm_agent import Agent
from google.adk.runners import Runner
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents.run_config import RunConfig
from google.genai import types

async def test_adk_streaming():
    # Setup Vertex AI Environment
    os.environ["GOOGLE_CLOUD_PROJECT"] = "islandhopper-agent-2026"
    os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
    
    # Correct Vertex AI Live model
    LIVE_MODEL = 'gemini-live-2.5-flash-native-audio'

    agent = Agent(
        name="test_agent",
        model=LIVE_MODEL,
        instruction="You are a helpful assistant. Greet the user warmly and introduce yourself as the island concierge."
    )

    # 2. Setup Runner and Session
    session_service = InMemorySessionService()
    runner = Runner(
        app_name="TestApp", 
        agent=agent, 
        session_service=session_service,
        auto_create_session=True
    )
    
    # 3. Initialize the LiveRequestQueue
    live_request_queue = LiveRequestQueue()

    # 4. Configure for AUDIO ONLY (Native Audio model requirement)
    # Enable transcriptions to see if we get text events
    config = RunConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription=types.AudioTranscriptionConfig()
    )

    print(f"Starting ADK streaming test with model: {LIVE_MODEL}...")
    
    # 5. Start the live stream
    async def run_session():
        try:
            async for event in runner.run_live(
                user_id="test_user",
                session_id="test_session",
                live_request_queue=live_request_queue,
                run_config=config
            ):
                # Handle audio content
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.inline_data:
                            print(f"Received Audio chunk: {len(part.inline_data.data)} bytes")
                
                # Check for transcriptions in the event fields (LlmResponse)
                if event.input_transcription:
                    print(f"User Transcription: {event.input_transcription.text}")
                if event.output_transcription:
                    print(f"Model Transcription: {event.output_transcription.text}")
                
                if event.interrupted:
                    print("Model Interrupted")

        except Exception as e:
            print(f"Streaming error: {e}")

    # Start the runner task
    runner_task = asyncio.create_task(run_session())
    
    # 6. Send a message through the queue
    user_input = types.Content(
        role="user", 
        parts=[types.Part.from_text(text="Hello! Are you there?")]
    )
    
    await asyncio.sleep(5) # Give it a moment to connect
    print("Sending user input...")
    live_request_queue.send_content(user_input)
    
    # Wait for the response
    await asyncio.sleep(25)
    print("Closing queue...")
    live_request_queue.close()
    await runner_task
    print("Test complete.")

if __name__ == "__main__":
    asyncio.run(test_adk_streaming())
