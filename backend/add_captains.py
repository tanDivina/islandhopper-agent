import asyncio
import os
import json
from google import genai
from google.genai import types
from google.cloud import firestore

PROJECT_ID = "islandhopper-agent-2026"
EMBEDDING_MODEL = "gemini-embedding-2-preview"
DIMENSIONS = 768

os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"

db = firestore.AsyncClient(project=PROJECT_ID)
client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")

async def get_embedding(text):
    try:
        res = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(output_dimensionality=DIMENSIONS)
        )
        return res.embeddings[0].values
    except Exception as e:
        print(f"Embedding error: {e}")
        return None

async def add_captains():
    with open("new_captains.json", "r") as f:
        captains = json.load(f)
    
    print(f"Adding {len(captains)} certified captains to RAG database...")
    
    for cap in captains:
        name = cap["name"]
        whatsapp = cap["whatsapp"]
        
        # Construct semantic profile
        specialty = "Certified Conscious Captain - Marine Conservation & Sustainable Tourism expert. Specialized in eco-friendly boat tours and wildlife awareness."
        pricing = "Contact for latest sustainable tour rates and availability."
        
        text_to_embed = f"Captain: {name}. Specialty: {specialty}. Category: boat captain. Pricing: {pricing}"
        
        embedding = await get_embedding(text_to_embed)
        
        if embedding:
            doc_id = name.lower().replace(" ", "_").replace("(", "").replace(")", "")
            await db.collection("knowledge_base").document(doc_id).set({
                "name": name,
                "whatsapp": whatsapp,
                "category": "boat captain",
                "specialty": specialty,
                "pricing_policy": pricing,
                "verified": True,
                "is_conscious_certified": True,
                "embedding": embedding
            })
            print(f"  - Added {name}")
        else:
            print(f"  - FAILED to add {name} (embedding failed)")

if __name__ == "__main__":
    asyncio.run(add_captains())
