import os
import json
import base64
import asyncio
import urllib.parse
import logging
from typing import List, Dict
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google.adk.agents.llm_agent import Agent
from google.adk.runners import Runner
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents.run_config import RunConfig
from google.genai import types
from google import genai
from google.cloud import firestore

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("islandhopper")

# --- Pydantic Models ---
class PartnerSubmission(BaseModel):
    name: str
    category: str
    whatsapp: str
    specialty: str
    pricing_policy: str

class AdminAction(BaseModel):
    doc_id: str

class VetChatMessage(BaseModel):
    doc_id: str
    message: str
    history: list = []

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Clients
PROJECT_ID = "islandhopper-agent-2026"
os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"

db = firestore.AsyncClient(project=PROJECT_ID)
genai_client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")

# Models
LIVE_MODEL = 'gemini-live-2.5-flash-native-audio'
PLANNING_MODEL = 'gemini-3.1-pro-preview'
MEMORY_MODEL = 'gemini-3.1-flash-lite-preview'
IMAGEN_MODEL = 'imagen-3.0-generate-002'
EMBEDDING_MODEL = 'gemini-embedding-2-preview'

# Shared state per session
active_websockets = {}
session_transcripts = {}
discovery_triggered = set() 

def cosine_similarity(v1, v2):
    v1 = np.array(v1); v2 = np.array(v2)
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

# --- Intake & Admin API ---

@app.post("/api/intake")
async def partner_intake(submission: PartnerSubmission):
    try:
        text_to_embed = f"Captain: {submission.name}. Category: {submission.category}. Specialty: {submission.specialty}. Pricing: {submission.pricing_policy}"
        res = genai_client.models.embed_content(model=EMBEDDING_MODEL, contents=text_to_embed, config=types.EmbedContentConfig(output_dimensionality=768))
        await db.collection("partner_submissions").add({**submission.dict(), "status": "pending", "embedding": res.embeddings[0].values, "submitted_at": firestore.SERVER_TIMESTAMP})
        return {"status": "success"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/pending")
async def get_pending_submissions():
    try:
        docs = db.collection("partner_submissions").where("status", "==", "pending").stream()
        results = []
        async for doc in docs:
            d = doc.to_dict(); d["id"] = doc.id
            if "embedding" in d: del d["embedding"]
            results.append(d)
        return results
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/approve")
async def approve_submission(action: AdminAction):
    try:
        doc_ref = db.collection("partner_submissions").document(action.doc_id)
        doc = await doc_ref.get()
        if not doc.exists: raise HTTPException(status_code=404, detail="Not found")
        data = doc.to_dict()
        if data.get("status") != "pending": raise HTTPException(status_code=409, detail="Already processed")
        await db.collection("knowledge_base").add({"name": data["name"], "category": data["category"], "whatsapp": data["whatsapp"], "specialty": data["specialty"], "pricing_policy": data["pricing_policy"], "embedding": data.get("embedding"), "verified": True})
        await doc_ref.update({"status": "approved"})
        return {"status": "approved"}
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/reject")
async def reject_submission(action: AdminAction):
    try:
        doc_ref = db.collection("partner_submissions").document(action.doc_id)
        doc = await doc_ref.get()
        if not doc.exists: raise HTTPException(status_code=404, detail="Not found")
        data = doc.to_dict()
        if data.get("status") != "pending": raise HTTPException(status_code=409, detail="Already processed")
        await doc_ref.update({"status": "rejected"})
        return {"status": "rejected"}
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

VETTING_SYSTEM_PROMPT = """You are the Island Hopper Vetting Agent. Your job is to help an admin review a captain/partner application for Bocas del Toro, Panama.

You have been given the captain's submission data. Your role:
1. Analyze the submission for completeness, red flags, and quality
2. Generate smart follow-up questions the admin should ask the captain
3. Provide a clear recommendation (approve, needs more info, or reject) with reasoning
4. Answer any questions the admin has about the submission

Be direct, professional, and thorough. Focus on:
- Is the pricing transparent and fair for the Bocas del Toro market?
- Does the specialty description sound legitimate and specific?
- Are there any safety concerns?
- Is the WhatsApp number formatted correctly for Panama (+507)?
- Does the category match what they describe?
- Would a tourist have a good experience based on this info?

Always respond in a structured, helpful way. Keep answers concise."""

@app.post("/api/admin/vet")
async def vet_submission(msg: VetChatMessage):
    try:
        doc_ref = db.collection("partner_submissions").document(msg.doc_id)
        doc = await doc_ref.get()
        if not doc.exists: raise HTTPException(status_code=404, detail="Not found")
        data = doc.to_dict()
        if "embedding" in data: del data["embedding"]

        captain_context = (
            f"Captain Name: {data.get('name', 'N/A')}\n"
            f"Category: {data.get('category', 'N/A')}\n"
            f"WhatsApp: {data.get('whatsapp', 'N/A')}\n"
            f"Specialty: {data.get('specialty', 'N/A')}\n"
            f"Pricing Policy: {data.get('pricing_policy', 'N/A')}\n"
            f"Submitted via: {'Voice Interview' if data.get('is_voice') else 'Written Form'}"
        )

        contents = [
            types.Content(role="user", parts=[types.Part.from_text(
                text=f"Here is a new captain application to review:\n\n{captain_context}\n\nAdmin question: {msg.message}"
            )])
        ]

        if msg.history:
            full_contents = []
            for h in msg.history:
                role = "user" if h.get("role") == "user" else "model"
                full_contents.append(types.Content(role=role, parts=[types.Part.from_text(text=h["text"])]))
            full_contents.append(types.Content(role="user", parts=[types.Part.from_text(text=msg.message)]))
            contents = full_contents

        response = genai_client.models.generate_content(
            model=PLANNING_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=VETTING_SYSTEM_PROMPT,
                temperature=0.3
            )
        )
        return {"response": response.text}
    except HTTPException: raise
    except Exception as e:
        logger.error(f"Vetting error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Tools for Intake Agent ---

async def submit_partner_interview(name: str, category: str, whatsapp: str, specialty: str, pricing_policy: str):
    """Submits the final extracted data from a captain interview for review."""
    logger.info(f"VOICE_INTAKE_SUBMISSION: {name}")
    try:
        text_to_embed = f"Captain: {name}. Category: {category}. Specialty: {specialty}. Pricing: {pricing_policy}"
        res = genai_client.models.embed_content(model=EMBEDDING_MODEL, contents=text_to_embed, config=types.EmbedContentConfig(output_dimensionality=768))
        await db.collection("partner_submissions").add({
            "name": name, "category": category, "whatsapp": whatsapp,
            "specialty": specialty, "pricing_policy": pricing_policy,
            "status": "pending", "embedding": res.embeddings[0].values,
            "is_voice": True, "submitted_at": firestore.SERVER_TIMESTAMP
        })
        return "SUCCESS: Profile submitted for review."
    except Exception as e:
        return f"ERROR: {str(e)}"

# --- Tools for Review Agent ---

review_agent_websockets = {}

async def fetch_pending_submissions():
    """Fetches all pending captain submissions for review. Call this at the start of a review session."""
    try:
        docs = db.collection("partner_submissions").where("status", "==", "pending").stream()
        results = []
        async for doc in docs:
            d = doc.to_dict(); d["id"] = doc.id
            if "embedding" in d: del d["embedding"]
            results.append(d)
        return json.dumps(results) if results else "No pending submissions right now."
    except Exception as e:
        return f"ERROR: {str(e)}"

async def get_submission_details(doc_id: str):
    """Gets full details of a specific submission by its document ID."""
    try:
        doc_ref = db.collection("partner_submissions").document(doc_id)
        doc = await doc_ref.get()
        if not doc.exists: return "Submission not found."
        d = doc.to_dict(); d["id"] = doc.id
        if "embedding" in d: del d["embedding"]
        return json.dumps(d)
    except Exception as e:
        return f"ERROR: {str(e)}"

async def approve_captain(doc_id: str, review_notes: str):
    """Approves a captain submission and adds them to the verified knowledge base. Include review_notes summarizing why approved."""
    try:
        doc_ref = db.collection("partner_submissions").document(doc_id)
        doc = await doc_ref.get()
        if not doc.exists: return "Submission not found."
        data = doc.to_dict()
        if data.get("status") != "pending": return "Already processed."
        await db.collection("knowledge_base").add({
            "name": data["name"], "category": data["category"], "whatsapp": data["whatsapp"],
            "specialty": data["specialty"], "pricing_policy": data["pricing_policy"],
            "embedding": data.get("embedding"), "verified": True
        })
        await doc_ref.update({"status": "approved", "review_notes": review_notes})
        ws = review_agent_websockets.get("admin")
        if ws:
            await ws.send_text(json.dumps({"type": "captain_approved", "doc_id": doc_id, "name": data["name"]}))
        return f"SUCCESS: {data['name']} has been approved and added to the knowledge base."
    except Exception as e:
        return f"ERROR: {str(e)}"

async def reject_captain(doc_id: str, review_notes: str):
    """Rejects a captain submission. Include review_notes explaining why rejected."""
    try:
        doc_ref = db.collection("partner_submissions").document(doc_id)
        doc = await doc_ref.get()
        if not doc.exists: return "Submission not found."
        data = doc.to_dict()
        if data.get("status") != "pending": return "Already processed."
        await doc_ref.update({"status": "rejected", "review_notes": review_notes})
        ws = review_agent_websockets.get("admin")
        if ws:
            await ws.send_text(json.dumps({"type": "captain_rejected", "doc_id": doc_id, "name": data["name"]}))
        return f"SUCCESS: {data['name']} has been rejected."
    except Exception as e:
        return f"ERROR: {str(e)}"

async def send_review_card(doc_id: str, name: str, category: str, whatsapp: str, specialty: str, pricing_policy: str, assessment: str):
    """Sends a visual review card to the admin UI showing the captain's details and your assessment. Call this for each captain you are reviewing."""
    ws = review_agent_websockets.get("admin")
    if ws:
        await ws.send_text(json.dumps({
            "type": "review_card",
            "doc_id": doc_id,
            "name": name,
            "category": category,
            "whatsapp": whatsapp,
            "specialty": specialty,
            "pricing_policy": pricing_policy,
            "assessment": assessment
        }))
    return "Card displayed."

# --- Multi-Agent Setup ---

INTAKE_SYSTEM_INSTRUCTION = """
You are the 'Island Hopper' Partner Onboarding Agent.
Your goal is to help local captains and guides register their tours using their voice.
Persona: Warm, helpful, and patient. Speak the language the user speaks (English or Spanish).

YOUR TASK:
1. Greet the partner warmly.
2. Ask for their Name, WhatsApp, the Types of Tours they do, and their Pricing.
3. Be conversational—don't just list questions. Ask them one by one.
4. If they interrupt you, stop immediately and address their input.
5. Once you have all the info, confirm it with them.
6. When they say 'yes' or 'finish', call 'submit_partner_interview'.
"""

REVIEW_SYSTEM_INSTRUCTION = """
You are the Island Hopper Review Agent — an experienced tourism quality controller for Bocas del Toro, Panama.
You help the admin review captain/guide submissions by asking the RIGHT questions and giving sharp assessments.

IMPORTANT: The admin uses buttons on the UI to approve, reject, or contact captains. Your job is to ANALYZE and ADVISE, not to execute actions. Do NOT call approve_captain or reject_captain unless the admin explicitly asks you to via voice.

YOUR WORKFLOW:
1. When the session starts, call 'fetch_pending_submissions' to get all pending captains.
2. For EACH pending submission, analyze it and call 'send_review_card' with your assessment.
3. Present each captain one at a time. For each one:
   a. Give a brief summary of who they are (2 sentences max)
   b. Flag specific concerns or highlights
   c. Suggest what questions the admin should ask the captain before approving, such as:
      - "I'd ask about their boat safety equipment and capacity"
      - "Their pricing for full-day tours seems below market — worth verifying"
      - "No issues here — this one looks solid if you're ready to approve"
   d. Wait for the admin to decide using the buttons or voice
4. When the admin says they approved or rejected someone, acknowledge briefly and move to the next captain.
5. If the admin asks you to approve or reject via voice, you may call the tools directly.
6. After processing all captains, give a brief summary.

WHAT TO CHECK:
- WhatsApp number format (+507 for Panama)
- Pricing clarity — can the AI quote travelers from this info?
- Specialty specificity — is it real Bocas del Toro knowledge?
- Red flags: copied text, unrealistic claims, missing critical details
- Safety: boat capacity, life vests, licenses mentioned?

PERSONALITY:
- Professional but conversational. You are an expert reviewer, not a robot.
- Be opinionated — if something looks off, say so directly. If it looks great, say that too.
- Speak concisely. The admin is busy. Keep responses under 3 sentences unless asked for more.
- If the admin asks you to skip or batch-approve, respect that.
"""

# Registry Load
with open(os.path.join(os.path.dirname(__file__), "assets_registry.json"), "r") as f:
    ASSETS_REGISTRY = json.load(f)

# --- WebSocket Endpoints ---

@app.websocket("/live/partner-intake")
async def live_partner_intake(websocket: WebSocket):
    await websocket.accept()
    
    intake_agent = Agent(
        name="IntakeAgent", 
        model=LIVE_MODEL, 
        instruction=INTAKE_SYSTEM_INSTRUCTION, 
        tools=[submit_partner_interview]
    )
    runner = Runner(app_name="IntakeApp", agent=intake_agent, session_service=InMemorySessionService(), auto_create_session=True)
    live_request_queue = LiveRequestQueue()
    run_config = RunConfig(
        response_modalities=["AUDIO"], 
        output_audio_transcription=types.AudioTranscriptionConfig(),
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")))
    )

    async def run_session():
        try:
            async for event in runner.run_live(user_id="partner", session_id="intake_session", live_request_queue=live_request_queue, run_config=run_config):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.inline_data:
                            await websocket.send_text(json.dumps({"type": "audio", "data": base64.b64encode(part.inline_data.data).decode('utf-8')}))
                if event.interrupted:
                    await websocket.send_text(json.dumps({"type": "interrupted"}))
        except: pass

    async def handle_msgs():
        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)
                if msg.get("type") == "audio":
                    live_request_queue.send_realtime(types.Blob(mime_type="audio/pcm;rate=16000", data=base64.b64decode(msg["data"])))
                elif msg.get("type") == "finish":
                    live_request_queue.send_content(types.Content(role="user", parts=[types.Part.from_text(text="I am finished. Please summarize and submit my profile.")]))
        except WebSocketDisconnect:
            live_request_queue.close()

    asyncio.create_task(run_session())
    await handle_msgs()

@app.websocket("/live/admin-review")
async def live_admin_review(websocket: WebSocket):
    await websocket.accept()
    review_agent_websockets["admin"] = websocket

    review_agent = Agent(
        name="ReviewAgent",
        model=LIVE_MODEL,
        instruction=REVIEW_SYSTEM_INSTRUCTION,
        tools=[fetch_pending_submissions, get_submission_details, approve_captain, reject_captain, send_review_card]
    )
    runner = Runner(app_name="ReviewApp", agent=review_agent, session_service=InMemorySessionService(), auto_create_session=True)
    live_request_queue = LiveRequestQueue()
    run_config = RunConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription=types.AudioTranscriptionConfig(),
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")))
    )

    async def run_review_session():
        try:
            async for event in runner.run_live(user_id="admin", session_id="review_session", live_request_queue=live_request_queue, run_config=run_config):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.inline_data:
                            await websocket.send_text(json.dumps({"type": "audio", "data": base64.b64encode(part.inline_data.data).decode('utf-8')}))
                if event.output_transcription and event.output_transcription.text:
                    await websocket.send_text(json.dumps({"type": "text_resp", "text": event.output_transcription.text}))
                if event.interrupted:
                    await websocket.send_text(json.dumps({"type": "interrupted"}))
        except: pass

    async def handle_review_msgs():
        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)
                if msg.get("type") == "audio":
                    live_request_queue.send_realtime(types.Blob(mime_type="audio/pcm;rate=16000", data=base64.b64decode(msg["data"])))
                elif msg.get("type") == "text_query":
                    live_request_queue.send_content(types.Content(role="user", parts=[types.Part.from_text(text=msg["text"])]))
        except WebSocketDisconnect:
            live_request_queue.close()
            review_agent_websockets.pop("admin", None)

    asyncio.create_task(run_review_session())
    await handle_review_msgs()

# --- Main Concierge Tools ---

async def trigger_visual_discovery(traveler_id: str):
    if traveler_id in discovery_triggered: return "Discovery already done."
    ws = active_websockets.get(traveler_id)
    if not ws: return "Error."
    docs = db.collection("visual_assets").where("tags", "array_contains", "discovery").stream()
    clean_items = []
    async for doc in docs:
        d = doc.to_dict(); clean_items.append({"url": d["url"], "caption": d["caption"], "tags": d["tags"]})
    discovery_triggered.add(traveler_id)
    await ws.send_text(json.dumps({"type": "discovery_start", "items": clean_items}))
    return "SUCCESS."

async def add_day_marker(day_number: int, traveler_id: str):
    ws = active_websockets.get(traveler_id)
    if ws: await ws.send_text(json.dumps({"type": "day_marker", "day": day_number}))
    return "SUCCESS."

async def get_verified_local_contact(service: str):
    try:
        res = genai_client.models.embed_content(model=EMBEDDING_MODEL, contents=service, config=types.EmbedContentConfig(output_dimensionality=768))
        query_vec = res.embeddings[0].values
        docs = db.collection("knowledge_base").stream()
        results = []
        async for doc in docs:
            d = doc.to_dict()
            if "embedding" in d:
                score = cosine_similarity(query_vec, d["embedding"])
                if score > 0.6: results.append({"data": d, "score": score})
        results.sort(key=lambda x: x["score"], reverse=True)
        top_matches = [r["data"] for r in results[:3]]
        return json.dumps(top_matches) if top_matches else "No verified contacts."
    except: return "Error."

async def generate_activity_image(description: str, traveler_id: str):
    ws = active_websockets.get(traveler_id)
    if not ws: return "Error."
    try:
        res = genai_client.models.embed_content(model=EMBEDDING_MODEL, contents=description, config=types.EmbedContentConfig(output_dimensionality=768))
        query_vec = res.embeddings[0].values
        assets_docs = db.collection("visual_assets").stream()
        best_match = None; highest_score = 0
        async for doc in assets_docs:
            d = doc.to_dict()
            if "embedding" in d:
                score = cosine_similarity(query_vec, d["embedding"])
                if score > highest_score: highest_score = score; best_match = d
        if highest_score > 0.8 and best_match:
            await ws.send_text(json.dumps({"type": "image", "is_real": True, "url": best_match["url"], "caption": best_match["caption"]}))
            return "SUCCESS."
        response = genai_client.models.generate_images(model=IMAGEN_MODEL, prompt=description, config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio='16:9', add_watermark=False))
        if response.generated_images:
            img_b64 = base64.b64encode(response.generated_images[0].image.image_bytes).decode('utf-8')
            await ws.send_text(json.dumps({"type": "image", "is_real": False, "data": img_b64, "caption": "Island Hopper Visual"}))
            return "SUCCESS."
        return "ERROR."
    except: return "ERROR."

async def generate_whatsapp_handoff(captain_name: str, phone_number: str, message_in_spanish: str, traveler_id: str):
    url = f"https://wa.me/{phone_number.replace('+', '').replace(' ', '').replace('-', '')}?text={urllib.parse.quote(message_in_spanish)}"
    ws = active_websockets.get(traveler_id)
    if ws: await ws.send_text(json.dumps({"type": "whatsapp", "url": url, "text": f"Click to message {captain_name} in Spanish."}))
    return "SUCCESS."

async def finalize_itinerary(summary: str, traveler_id: str):
    try:
        res = genai_client.models.generate_content(model=PLANNING_MODEL, contents=f"Cinematic title for: {summary}. Title only.")
        ws = active_websockets.get(traveler_id)
        if ws: await ws.send_text(json.dumps({"type": "itinerary_finalized", "title": res.text.strip(), "summary": summary}))
        return "SUCCESS."
    except: return "ERROR."

# --- Main Concierge Endpoint ---

BASE_SYSTEM_INSTRUCTION = """
You are 'Island Hopper', an Afro-Caribbean female island concierge for Bocas del Toro, Panama.
You have a warm, friendly personality — like a trusted local friend who knows every hidden beach and captain by name.
Keep your responses concise and conversational. Never monologue. Short sentences, natural pauses.

STRICT WORKFLOW — follow exactly once, never repeat or loop:

STEP 1 — GREETING (do this ONCE):
  Say a brief, warm welcome (2 sentences max). Then IMMEDIATELY call 'trigger_visual_discovery'.
  Do NOT describe activities or give suggestions yet. Just greet and trigger discovery.

STEP 2 — WAIT FOR DISCOVERY RESULTS:
  After calling trigger_visual_discovery, STOP TALKING. Say something brief like "Take your time swiping through those — I'll be right here!"
  Do NOT suggest anything. Do NOT describe locations. Do NOT give an itinerary. Just wait.
  The system will send you discovery results when the traveler is done.

STEP 3 — BUILD THE PLAN (do this ONCE):
  When you receive discovery results (the user's likes), THEN and ONLY THEN:
  - Ask how many days they have (if unknown). Wait for their answer.
  - Once you know the days, present a day-by-day plan.
  - Call 'add_day_marker' for each day BEFORE describing that day's activities.
  - Call 'generate_activity_image' for each activity or location you mention.
  - Present each day briefly (2-3 sentences per activity), then pause for feedback.

STEP 4 — REFINE:
  If the traveler wants changes, adjust the specific part they mention. Do NOT re-present the entire itinerary.

STEP 5 — BOOKING:
  When they want to book, call 'get_verified_local_contact' to find a captain, then 'generate_whatsapp_handoff'.

STEP 6 — FINALIZE:
  When the traveler confirms they're happy, call 'finalize_itinerary' ONCE.

ABSOLUTE RULES:
- NEVER present the itinerary more than once. If you already gave it, refer back — don't repeat it.
- NEVER interrupt yourself to restart or re-deliver the plan.
- NEVER loop back to earlier steps.
- If the traveler asks a question mid-plan, answer it briefly, then continue where you left off.
- Keep each spoken response under 4 sentences. Be brief. Let the traveler lead.
- You are female. Use natural, warm language.
"""

async def consolidate_memory(traveler_id: str, transcript: str):
    try:
        prompt = f"Extract traveler preferences (JSON). Transcript: {transcript}"
        response = genai_client.models.generate_content(model=MEMORY_MODEL, contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json"))
        facts = json.loads(response.text)
        if facts: await db.collection("traveler_profiles").document(traveler_id).set({"facts": facts, "last_updated": firestore.SERVER_TIMESTAMP}, merge=True)
    except: pass

@app.websocket("/live")
async def live_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        init_data = await websocket.receive_text()
        init_msg = json.loads(init_data)
        traveler_id = init_msg.get("traveler_id", "anonymous")
    except: await websocket.close(); return
    active_websockets[traveler_id] = websocket
    session_transcripts[traveler_id] = []
    discovery_triggered.discard(traveler_id)
    current_instruction = BASE_SYSTEM_INSTRUCTION + f"\n\nTRAVELER_ID: {traveler_id}"
    try:
        profile_doc = await db.collection("traveler_profiles").document(traveler_id).get()
        if profile_doc.exists:
            facts = profile_doc.to_dict().get("facts", {})
            if facts: current_instruction += f"\n\nTRAVELER MEMORY: {json.dumps(facts)}"
    except: pass
    island_agent = Agent(name="IslandHopper", model=LIVE_MODEL, instruction=current_instruction, tools=[get_verified_local_contact, generate_activity_image, generate_whatsapp_handoff, finalize_itinerary, add_day_marker, trigger_visual_discovery])
    runner = Runner(app_name="IslandHopperApp", agent=island_agent, session_service=InMemorySessionService(), auto_create_session=True)
    live_request_queue = LiveRequestQueue()
    run_config = RunConfig(
        response_modalities=["AUDIO"], 
        output_audio_transcription=types.AudioTranscriptionConfig(),
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")))
    )
    async def run_adk_session():
        try:
            async for event in runner.run_live(user_id=traveler_id, session_id=f"session_{traveler_id}", live_request_queue=live_request_queue, run_config=run_config):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.inline_data: await websocket.send_text(json.dumps({"type": "audio", "data": base64.b64encode(part.inline_data.data).decode('utf-8')}))
                if event.input_transcription and event.input_transcription.text: session_transcripts[traveler_id].append(f"Traveler: {event.input_transcription.text}")
                if event.output_transcription and event.output_transcription.text:
                    txt = event.output_transcription.text
                    session_transcripts[traveler_id].append(f"AI: {txt}")
                    await websocket.send_text(json.dumps({"type": "text_resp", "text": txt}))
                if event.interrupted: await websocket.send_text(json.dumps({"type": "interrupted"}))
        except: pass
    async def handle_client_messages():
        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)
                if msg.get("type") == "audio": live_request_queue.send_realtime(types.Blob(mime_type="audio/pcm;rate=16000", data=base64.b64decode(msg["data"])))
                elif msg.get("type") == "text_query":
                    live_request_queue.send_content(types.Content(role="user", parts=[types.Part.from_text(text=msg["text"])]))
                elif msg.get("type") == "discovery_results":
                    likes = ", ".join([str(l) for l in msg.get("likes", [])])
                    live_request_queue.send_content(types.Content(role="user", parts=[types.Part.from_text(text=f"The discovery session is done. I loved: {likes}. Now suggest a day-by-day plan using the images tool for each spot.")]))
        except WebSocketDisconnect:
            full_t = "\n".join(session_transcripts.get(traveler_id, []))
            if full_t: asyncio.create_task(consolidate_memory(traveler_id, full_t))
            live_request_queue.close(); active_websockets.pop(traveler_id, None)
        except: live_request_queue.close(); active_websockets.pop(traveler_id, None)
    asyncio.create_task(run_adk_session())
    await handle_client_messages()

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../frontend"), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
