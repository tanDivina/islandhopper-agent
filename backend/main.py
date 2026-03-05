import os
import json
import base64
import asyncio
import random
import urllib.parse
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
from google import genai
from google.genai import types
from google.cloud import firestore

app = FastAPI(title="Island Hopper: Multimodal Concierge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize GenAI and Firestore Clients
client = genai.Client()
# Using async client for FastAPI/WebSocket compatibility
db = firestore.AsyncClient(project="islandhopper-agent-2026")

class PartnerIntake(BaseModel):
    name: str
    category: str
    whatsapp: str
    specialty: str
    pricing_policy: str

@app.post("/api/intake")
async def submit_intake(partner: PartnerIntake):
    doc_ref = db.collection("pending_contacts").document()
    await doc_ref.set(partner.model_dump())
    return {"status": "success", "message": "Partner submitted for review."}

@app.get("/api/admin/pending")
async def get_pending():
    docs = db.collection("pending_contacts").stream()
    pending_list = []
    async for doc in docs:
        item = doc.to_dict()
        item["id"] = doc.id
        pending_list.append(item)
    return pending_list

@app.post("/api/admin/approve")
async def approve_partner(data: dict):
    doc_id = data.get("id")
    if not doc_id:
        return {"status": "error", "message": "Invalid ID."}
        
    doc_ref = db.collection("pending_contacts").document(doc_id)
    doc = await doc_ref.get()
    
    if doc.exists:
        partner_data = doc.to_dict()
        category = partner_data["category"]
        
        # Add to official Knowledge Base
        kb_ref = db.collection("knowledge_base").document()
        new_entry = {
            "category": category,
            "name": partner_data["name"],
            "specialty": partner_data["specialty"],
            "whatsapp": partner_data["whatsapp"],
            "pricing_policy": partner_data["pricing_policy"],
            "availability": "Confirmed Partner"
        }
        await kb_ref.set(new_entry)
        
        # Remove from pending queue
        await doc_ref.delete()
        return {"status": "success"}
    return {"status": "error", "message": "Document not found."}

@app.post("/api/admin/reject")
async def reject_partner(data: dict):
    doc_id = data.get("id")
    if doc_id:
        await db.collection("pending_contacts").document(doc_id).delete()
    return {"status": "success"}


# --- Cognitive Memory Agent ---
class MemoryAgent:
    """Mimics human memory consolidation by extracting permanent traits from ephemeral conversations."""
    @staticmethod
    async def consolidate_memory(traveler_id: str, new_transcript: list):
        if not new_transcript:
            return
            
        profile_ref = db.collection("traveler_profiles").document(traveler_id)
        doc = await profile_ref.get()
        existing_profile = doc.to_dict() if doc.exists else {}
                
        prompt = f"""
        You are the Cognitive Memory Agent for a luxury travel concierge.
        Your job is to read the latest conversation transcript and update the user's permanent profile.
        Only extract rigid facts, preferences, limitations, or recurring themes (e.g., 'vegan', 'hates boats', 'loves luxury', 'traveling with kids').
        Do not save ephemeral logistical questions.
        
        Existing Profile: {json.dumps(existing_profile)}
        New Transcript: {json.dumps(new_transcript)}
        
        Output the updated profile strictly as a JSON object containing key-value string pairs.
        """
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model='gemini-3.1-flash-lite-preview',
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            updated_profile = json.loads(response.text)
            await profile_ref.set(updated_profile)
            print(f"Memory Consolidated for {traveler_id} in Firestore")
        except Exception as e:
            print(f"Memory Agent Error: {e}")

# --- Director Agent ---
class DirectorAgent:
    @staticmethod
    async def generate_script(itinerary_data: list) -> str:
        prompt = f"Generate a premium travel magazine title for this itinerary: {json.dumps(itinerary_data)}. Return only the title."
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model='gemini-3.1-flash-lite-preview',
                contents=prompt
            )
            return response.text.strip()
        except Exception:
            return "Your Paradise Found"

# --- Island Hopper Tools ---
island_tools = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="check_weather",
            description="Checks the weather forecast for Bocas del Toro.",
            parameters=types.Schema(
                type="OBJECT",
                properties={"day": types.Schema(type="STRING")},
                required=["day"]
            )
        ),
        types.FunctionDeclaration(
            name="get_verified_local_contact",
            description="Retrieves verified WhatsApp numbers and pricing for local guides from the database.",
            parameters=types.Schema(
                type="OBJECT",
                properties={"service": types.Schema(type="STRING", description="The requested service category, e.g., 'boat captain', 'surf lesson', 'sloth guide'")},
                required=["service"]
            )
        ),
        types.FunctionDeclaration(
            name="generate_whatsapp_handoff",
            description="Generates a seamless WhatsApp link to connect the tourist with a captain. The agent MUST translate the booking summary into Spanish BEFORE passing it to this tool's 'spanish_message' parameter.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "captain_whatsapp": types.Schema(type="STRING", description="The captain's phone number, e.g., +50761234567"),
                    "spanish_message": types.Schema(type="STRING", description="A polite booking request translated into Spanish, detailing the dates, number of people, and the service needed.")
                },
                required=["captain_whatsapp", "spanish_message"]
            )
        ),
        types.FunctionDeclaration(
            name="generate_activity_image",
            description="Generates a high-quality visual preview of an activity or accommodation.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "prompt": types.Schema(type="STRING"),
                    "activity_id": types.Schema(type="STRING")
                },
                required=["prompt"]
            )
        ),
        types.FunctionDeclaration(
            name="update_itinerary_ui",
            description="Updates the visual itinerary on the sidebar workspace.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "itinerary": types.Schema(
                        type="ARRAY",
                        items=types.Schema(
                            type="OBJECT",
                            properties={
                                "day_name": types.Schema(type="STRING"),
                                "activities": types.Schema(
                                    type="ARRAY",
                                    items=types.Schema(
                                        type="OBJECT",
                                        properties={
                                            "id": types.Schema(type="STRING"),
                                            "description": types.Schema(type="STRING"),
                                            "image_keyword": types.Schema(type="STRING")
                                        },
                                        required=["description", "image_keyword"]
                                    )
                                )
                            },
                            required=["day_name", "activities"]
                        )
                    )
                },
                required=["itinerary"]
            )
        ),
        types.FunctionDeclaration(
            name="generate_cinematic_slideshow",
            description="Orchestrates the cinematic summary reveal.",
            parameters=types.Schema(type="OBJECT", properties={})
        )
    ]
)

BASE_SYSTEM_INSTRUCTION = """
You are 'Island Hopper', the premier Multimodal Bocas del Toro Concierge. 
Your mission is to solve the complex travel logistics of Bocas del Toro.
Persona: Elite, professional, and knowledgeable. Speak/write with a warm, exclusive tone.
Protocol: 
1. Call update_itinerary_ui immediately for any plan change. 
2. If a user asks what a location, activity, or hotel looks like, immediately call `generate_activity_image`.
3. SEAMLESS HANDOFF: When a user decides on a captain or guide, offer to connect them. If they say yes, translate the booking details into Spanish and call `generate_whatsapp_handoff` to create a pre-filled WhatsApp link. Explain to the user that they don't need to speak Spanish, as you have prepared the message for them.
"""

@app.websocket("/live")
async def live_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    init_data = await websocket.receive_text()
    init_msg = json.loads(init_data)
    traveler_id = init_msg.get("traveler_id", "anonymous")
    
    # Load Memory Profile from Firestore
    profile_ref = db.collection("traveler_profiles").document(traveler_id)
    doc = await profile_ref.get()
    memory_context = ""
    if doc.exists:
        profile_data = doc.to_dict()
        memory_context = f"\n\nIMPORTANT TRAVELER MEMORY:\n{json.dumps(profile_data)}"
        print(f"Loaded memory from Firestore for {traveler_id}")

    config = types.LiveConnectConfig(
        tools=[island_tools],
        system_instruction=types.Content(parts=[types.Part.from_text(BASE_SYSTEM_INSTRUCTION + memory_context)]),
        response_modalities=["AUDIO"],
    )

    try:
        async with client.aio.live.connect(model='gemini-2.5-flash-native-audio-preview-12-2025', config=config) as live_session:
            current_itinerary = []
            session_transcript = []

            async def receive_from_client():
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)
                        if msg.get("type") == "audio":
                            audio_bytes = base64.b64decode(msg.get("data"))
                            await live_session.send(input={"data": audio_bytes, "mime_type": "audio/webm"})
                        elif msg.get("type") == "text":
                            user_text = msg.get("data")
                            session_transcript.append(f"User: {user_text}")
                            await live_session.send(input=user_text)
                except WebSocketDisconnect:
                    pass

            async def receive_from_gemini():
                nonlocal current_itinerary
                try:
                    async for response in live_session.receive():
                        if response.server_content and response.server_content.model_turn:
                            for part in response.server_content.model_turn.parts:
                                if part.text:
                                    session_transcript.append(f"Agent: {part.text}")
                                    await websocket.send_text(json.dumps({"type": "text_response", "text": part.text}))

                                if part.executable_code or part.function_call:
                                    fc = part.function_call
                                    if fc.name == "check_weather":
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response={"forecast": "Sunny and clear."})]
                                        ))
                                    
                                    elif fc.name == "get_verified_local_contact":
                                        service = fc.args.get("service", "boat captain").lower()
                                        
                                        # Query Firestore Knowledge Base
                                        contacts_ref = db.collection("knowledge_base")
                                        # Very simple text matching logic for demo purposes
                                        query = contacts_ref.where(filter=firestore.FieldFilter("category", "==", service))
                                        docs = query.stream()
                                        
                                        matched_contacts = []
                                        async for d in docs:
                                            matched_contacts.append(d.to_dict())
                                            
                                        if matched_contacts:
                                            response_data = {"status": "success", "verified_contacts": matched_contacts}
                                        else:
                                            # Fallback: just return everything if exact match fails
                                            all_docs = contacts_ref.stream()
                                            all_c = [d.to_dict() async for d in all_docs]
                                            response_data = {"status": "success", "message": "Here are all available contacts.", "verified_contacts": all_c}
                                            
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response=response_data)]
                                        ))

                                    elif fc.name == "generate_whatsapp_handoff":
                                        phone = fc.args.get("captain_whatsapp", "").replace(" ", "").replace("-", "").replace("+", "")
                                        message = fc.args.get("spanish_message", "")
                                        encoded_message = urllib.parse.quote(message)
                                        wa_link = f"https://wa.me/{phone}?text={encoded_message}"
                                        
                                        # Send to frontend to display the button
                                        await websocket.send_text(json.dumps({
                                            "type": "whatsapp_handoff",
                                            "link": wa_link,
                                            "message": message
                                        }))
                                        
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response={"status": "WhatsApp link sent to user UI."})]
                                        ))
                                        
                                    elif fc.name == "update_itinerary_ui":
                                        current_itinerary = fc.args.get("itinerary", [])
                                        await websocket.send_text(json.dumps({"type": "ui_update", "itinerary": current_itinerary}))
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response={"status": "Synced"})]
                                        ))

                                    elif fc.name == "generate_activity_image":
                                        prompt = fc.args.get("prompt")
                                        activity_id = fc.args.get("activity_id", "chat-preview")
                                        try:
                                            image_result = await asyncio.to_thread(
                                                client.models.generate_images,
                                                model='imagen-3.0-generate-002',
                                                prompt=prompt,
                                                config=types.GenerateImagesConfig(
                                                    number_of_images=1,
                                                    output_mime_type="image/jpeg",
                                                    aspect_ratio="16:9"
                                                )
                                            )
                                            if image_result.generated_images:
                                                base64_img = base64.b64encode(image_result.generated_images[0].image.image_bytes).decode('utf-8')
                                                await websocket.send_text(json.dumps({
                                                    "type": "image_generated",
                                                    "activity_id": activity_id,
                                                    "image_data": f"data:image/jpeg;base64,{base64_img}",
                                                    "prompt": prompt
                                                }))
                                                response_data = {"status": "Image displayed."}
                                            else:
                                                response_data = {"status": "Generation failed."}
                                        except Exception as img_err:
                                            response_data = {"status": f"Generation failed: {str(img_err)}"}
                                            
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response=response_data)]
                                        ))
                                        
                                    elif fc.name == "generate_cinematic_slideshow":
                                        premium_title = await DirectorAgent.generate_script(current_itinerary)
                                        await websocket.send_text(json.dumps({"type": "play_video", "summary": premium_title}))
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response={"status": "Playing"})]
                                        ))

                                if part.inline_data:
                                    b64_audio = base64.b64encode(part.inline_data.data).decode('utf-8')
                                    await websocket.send_text(json.dumps({
                                        "type": "audio", 
                                        "data": f"data:{part.inline_data.mime_type};base64,{b64_audio}"
                                    }))
                except Exception as e:
                    print(f"Gemini error: {e}")
                    await websocket.send_text(json.dumps({"type": "error", "message": f"Gemini Session Error: {str(e)}"}))

            await asyncio.gather(receive_from_client(), receive_from_gemini())

    except Exception as e:
         print(f"Failed: {e}")
    finally:
         if 'session_transcript' in locals() and session_transcript:
             asyncio.create_task(MemoryAgent.consolidate_memory(traveler_id, session_transcript))
         
         if not websocket.client_state == 3: 
             await websocket.close()

INTAKE_SYSTEM_INSTRUCTION = """
You are the Island Hopper Captain Registration Agent.
Your job is to onboard local boat captains and guides in Bocas del Toro.
CRITICAL RULES:
- ALWAYS greet bilingually first (e.g., "Hello! Hola!").
- ALWAYS switch entirely to the language the captain starts speaking.
- Use local terminology (lancha, panga).
Your goal is to collect: Name, WhatsApp, Specialties, and Pricing Policy.
Confirm info, then IMMEDIATELY call the `submit_captain_profile` tool.
"""

intake_tools = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="submit_captain_profile",
            description="Saves the collected profile to the pending review queue.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "name": types.Schema(type="STRING"),
                    "whatsapp": types.Schema(type="STRING"),
                    "specialty": types.Schema(type="STRING"),
                    "pricing_policy": types.Schema(type="STRING")
                },
                required=["name", "whatsapp", "specialty", "pricing_policy"]
            )
        )
    ]
)

@app.websocket("/live/intake")
async def live_intake_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    config = types.LiveConnectConfig(
        tools=[intake_tools],
        system_instruction=types.Content(parts=[types.Part.from_text(INTAKE_SYSTEM_INSTRUCTION)]),
        response_modalities=["AUDIO"],
    )

    try:
        async with client.aio.live.connect(model='gemini-2.5-flash-native-audio-preview-12-2025', config=config) as live_session:
            async def receive_from_client():
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)
                        if msg.get("type") == "audio":
                            audio_bytes = base64.b64decode(msg.get("data"))
                            await live_session.send(input={"data": audio_bytes, "mime_type": "audio/webm"})
                except WebSocketDisconnect:
                    pass

            async def receive_from_gemini():
                try:
                    async for response in live_session.receive():
                        if response.server_content and response.server_content.model_turn:
                            for part in response.server_content.model_turn.parts:
                                if part.executable_code or part.function_call:
                                    fc = part.function_call
                                    if fc.name == "submit_captain_profile":
                                        # Save directly to Firestore Pending collection
                                        doc_ref = db.collection("pending_contacts").document()
                                        await doc_ref.set({
                                            "name": fc.args.get("name"),
                                            "category": "boat captain", 
                                            "whatsapp": fc.args.get("whatsapp"),
                                            "specialty": fc.args.get("specialty"),
                                            "pricing_policy": fc.args.get("pricing_policy")
                                        })
                                        
                                        await live_session.send(input=types.LiveClientToolResponse(
                                            function_responses=[types.FunctionResponse(id=fc.id or fc.name, name=fc.name, response={"status": "Saved."})]
                                        ))
                                        await websocket.send_text(json.dumps({"type": "success"}))

                                if part.inline_data:
                                    b64_audio = base64.b64encode(part.inline_data.data).decode('utf-8')
                                    await websocket.send_text(json.dumps({
                                        "type": "audio", 
                                        "data": f"data:{part.inline_data.mime_type};base64,{b64_audio}"
                                    }))
                except Exception:
                    pass

            await asyncio.gather(receive_from_client(), receive_from_gemini())

    except Exception:
         pass
    finally:
         if not websocket.client_state == 3: await websocket.close()

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../frontend"), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)