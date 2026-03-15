import asyncio
import os
import json
import logging
from google import genai
from google.genai import types
from google.cloud import firestore
from google.cloud import storage

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_assets")

PROJECT_ID = "islandhopper-agent-2026"
BUCKET_NAME = "islandhopper-public-assets"
EMBEDDING_MODEL = "gemini-embedding-2-preview"
VISION_MODEL = "gemini-3.1-pro-preview"
DIMENSIONS = 768

os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"

db = firestore.AsyncClient(project=PROJECT_ID)
client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")
storage_client = storage.Client(project=PROJECT_ID)

async def get_embedding(content):
    try:
        res = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=content,
            config=types.EmbedContentConfig(output_dimensionality=DIMENSIONS)
        )
        return res.embeddings[0].values
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return None

async def analyze_image(image_bytes):
    """Uses Gemini 3.1 Pro Vision to auto-generate tags and captions."""
    prompt = """
    Analyze this photo of Bocas del Toro. 
    1. Give me 5 descriptive tags (e.g. sloth, jungle, beach, luxury).
    2. Write a 2-sentence luxury concierge caption.
    Return as JSON: {"tags": [], "caption": ""}
    """
    try:
        response = client.models.generate_content(
            model=VISION_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                prompt
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Vision error: {e}")
        return None

async def sync_bucket():
    bucket = storage_client.bucket(BUCKET_NAME)
    blobs = bucket.list_blobs()
    
    for blob in blobs:
        if not blob.name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            continue
            
        # Check if already indexed
        asset_id = blob.name.replace(".", "_")
        doc = await db.collection("visual_assets").document(asset_id).get()
        if doc.exists:
            logger.info(f"Skipping {blob.name} (already indexed)")
            continue
            
        logger.info(f"Processing new asset: {blob.name}")
        image_bytes = blob.download_as_bytes()
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob.name}"
        
        # 1. Auto-Analyze with Vision
        analysis = await analyze_image(image_bytes)
        if not analysis: continue
        
        # 2. Generate Multimodal Embedding
        content = [
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            analysis["caption"]
        ]
        embedding = await get_embedding(content)
        
        # 3. Save to Firestore
        if embedding:
            await db.collection("visual_assets").document(asset_id).set({
                "url": public_url,
                "tags": analysis["tags"],
                "caption": analysis["caption"],
                "embedding": embedding,
                "is_real": True,
                "indexed_at": firestore.SERVER_TIMESTAMP
            })
            logger.info(f"Successfully indexed {blob.name}")

async def migrate_existing():
    """Migrates the hardcoded assets to Firestore."""
    logger.info("Migrating existing registry...")
    path = os.path.join(os.path.dirname(__file__), "assets_registry.json")
    with open(path, "r") as f:
        registry = json.load(f)
        
    for loc in registry["locations"]:
        # We use the URL as ID for registry items
        asset_id = loc["url"].split("/")[-1].split("?")[0].replace(".", "_")
        await db.collection("visual_assets").document(asset_id).set({
            **loc,
            "indexed_at": firestore.SERVER_TIMESTAMP
        })
    logger.info("Migration complete.")

if __name__ == "__main__":
    import sys
    if "migrate" in sys.argv:
        asyncio.run(migrate_existing())
    else:
        asyncio.run(sync_bucket())
