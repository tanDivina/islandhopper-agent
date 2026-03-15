import asyncio
import os
import json
import httpx
from google import genai
from google.genai import types
from google.cloud import firestore

PROJECT_ID = "islandhopper-agent-2026"
os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"

db = firestore.AsyncClient(project=PROJECT_ID)
client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")

EMBEDDING_MODEL = "gemini-embedding-2-preview"
DIMENSIONS = 768 # Matryoshka dimensionality for efficiency

async def get_embedding(content):
    """Generates embedding for text or multimodal list."""
    try:
        res = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=content,
            config=types.EmbedContentConfig(output_dimensionality=DIMENSIONS)
        )
        return res.embeddings[0].values
    except Exception as e:
        print(f"Embedding error for content: {e}")
        if hasattr(e, 'response'):
            print(f"Response: {e.response}")
        return None

async def index_partners():
    print("Indexing Partners...")
    docs = db.collection("knowledge_base").stream()
    async for doc in docs:
        data = doc.to_dict()
        # Combine name, specialty, and category for a rich semantic profile
        text_to_embed = f"Partner: {data['name']}. Category: {data['category']}. Specialty: {data['specialty']}. Pricing: {data['pricing_policy']}"
        embedding = await get_embedding(text_to_embed)
        if embedding:
            await db.collection("knowledge_base").document(doc.id).update({
                "embedding": embedding
            })
            print(f"  - Indexed {data['name']}")

async def index_assets():
    print("Indexing Assets Registry...")
    registry_path = os.path.join(os.path.dirname(__file__), "assets_registry.json")
    with open(registry_path, "r") as f:
        registry = json.load(f)
    
    indexed_locations = []
    async with httpx.AsyncClient() as http_client:
        for loc in registry["locations"]:
            print(f"  - Indexing asset: {loc['tags'][0]}...")
            
            # Fetch image bytes for multimodal embedding
            img_bytes = None
            try:
                img_res = await http_client.get(loc["url"], timeout=10.0)
                img_bytes = img_res.content
            except Exception as e:
                print(f"    Error fetching image {loc['url']}: {e}")

            if img_bytes:
                # Multimodal embedding: Image + Caption
                content = [
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    loc["caption"]
                ]
                
                embedding = await get_embedding(content)
                if embedding:
                    loc["embedding"] = embedding
                    indexed_locations.append(loc)
                else:
                    print(f"    Multimodal embedding failed for {loc['tags'][0]}, trying text-only.")
                    embedding = await get_embedding(loc["caption"])
                    if embedding:
                        loc["embedding"] = embedding
                        indexed_locations.append(loc)
            else:
                # Text only if image fetch failed
                embedding = await get_embedding(loc["caption"])
                if embedding:
                    loc["embedding"] = embedding
                    indexed_locations.append(loc)

    # Save indexed registry back
    with open(registry_path, "w") as f:
        json.dump({"locations": indexed_locations}, f, indent=4)
    print("Assets indexing complete.")

async def main():
    await index_partners()
    await index_assets()

if __name__ == "__main__":
    asyncio.run(main())
