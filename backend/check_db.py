import asyncio
from google.cloud import firestore

async def check():
    db = firestore.AsyncClient(project='islandhopper-agent-2026')
    print("Checking Knowledge Base...")
    docs = db.collection('knowledge_base').limit(5).stream()
    async for doc in docs:
        print(f"ID: {doc.id} => {doc.to_dict()}")

if __name__ == "__main__":
    asyncio.run(check())
