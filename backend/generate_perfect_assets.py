import asyncio
import os
import json
import logging
import base64
from google import genai
from google.genai import types
from google.cloud import firestore
from google.cloud import storage

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("generate_assets")

PROJECT_ID = "islandhopper-agent-2026"
BUCKET_NAME = "islandhopper-public-assets"
IMAGEN_MODEL = "imagen-3.0-generate-002"
EMBEDDING_MODEL = "gemini-embedding-2-preview"
DIMENSIONS = 768

os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"

db = firestore.AsyncClient(project=PROJECT_ID)
client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")
storage_client = storage.Client(project=PROJECT_ID)

ASSETS_TO_GENERATE = [
    {
        "name": "sloth_discovery.jpg",
        "prompt": "A cinematic, close-up photo of a three-toed sloth hanging from a lush green tropical branch in the jungles of Panama, soft morning sunlight, high-end travel magazine style.",
        "tags": ["discovery", "sloth", "wildlife", "jungle"],
        "caption": "Meet the slowest residents of our islands—the three-toed sloths living in the wild canopy."
    },
    {
        "name": "frog_discovery.jpg",
        "prompt": "A realistic macro photo of a tiny bright red poison dart frog on a large tropical leaf, vibrant colors, shallow depth of field, Bocas del Toro wildlife.",
        "tags": ["discovery", "frog", "wildlife", "nature"],
        "caption": "The famous 'Red Frogs' of Bastimentos. Tiny, vibrant, and a true icon of our biodiversity."
    },
    {
        "name": "manatee_discovery.jpg",
        "prompt": "A breathtaking underwater photo of a gentle manatee swimming through clear turquoise mangrove channels, sunlight rays piercing the water, cinematic nature photography.",
        "tags": ["discovery", "manatee", "wildlife", "remote"],
        "caption": "A rare glimpse of the gentle manatees that hide in our secret, protected mangrove lagoons."
    },
    {
        "name": "dolphin_discovery.jpg",
        "prompt": "A group of dolphins jumping out of clear blue Caribbean water at sunset, a small boat in the background, tropical paradise, high action wildlife photo.",
        "tags": ["discovery", "dolphin", "wildlife", "ocean"],
        "caption": "Watching pods of dolphins play in the calm waters of Dolphin Bay is a must-see experience."
    },
    {
        "name": "mangrove_snorkeling.jpg",
        "prompt": "First-person perspective of snorkeling through crystal clear mangrove roots, vibrant sponges and small fish, tropical sunlight through the water, adventurous travel photography.",
        "tags": ["discovery", "mangrove", "snorkeling", "adventure"],
        "caption": "Snorkeling through the 'underwater forests' of the mangroves—a colorful hidden world."
    },
    {
        "name": "zapatilla_beach.jpg",
        "prompt": "Aerial cinematic view of an uninhabited tropical island with white sand beaches and crystal clear turquoise water, Zapatilla island style, luxury travel escape.",
        "tags": ["discovery", "beach", "zapatilla", "remote"],
        "caption": "Zapatilla Island: The dream of an uninhabited paradise, exactly as you imagined it."
    }
]

async def get_embedding(content):
    res = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=content,
        config=types.EmbedContentConfig(output_dimensionality=DIMENSIONS)
    )
    return res.embeddings[0].values

async def run():
    bucket = storage_client.bucket(BUCKET_NAME)
    
    for item in ASSETS_TO_GENERATE:
        logger.info(f"Generating perfect asset: {item['name']}")
        
        try:
            # 1. Generate with Imagen
            response = client.models.generate_images(
                model=IMAGEN_MODEL,
                prompt=item["prompt"],
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio='16:9',
                    add_watermark=False
                )
            )
            
            if response.generated_images:
                img_bytes = response.generated_images[0].image.image_bytes
                
                # 2. Upload to GCS
                blob = bucket.blob(item["name"])
                blob.upload_from_string(img_bytes, content_type="image/jpeg")
                public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{item['name']}"
                
                # 3. Generate Embedding
                content = [
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    item["caption"]
                ]
                embedding = await get_embedding(content)
                
                # 4. Save to Firestore
                asset_id = item["name"].replace(".", "_")
                await db.collection("visual_assets").document(asset_id).set({
                    "url": public_url,
                    "tags": item["tags"],
                    "caption": item["caption"],
                    "embedding": embedding,
                    "is_real": True, # Marked as 'real' because they are our curated high-quality assets
                    "indexed_at": firestore.SERVER_TIMESTAMP
                })
                logger.info(f"Successfully created and indexed {item['name']}")
                
        except Exception as e:
            logger.error(f"Failed to generate {item['name']}: {e}")

if __name__ == "__main__":
    asyncio.run(run())
