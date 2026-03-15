import json
import asyncio
from google.cloud import firestore

PROJECT_ID = "islandhopper-agent-2026"

async def seed_data():
    db = firestore.AsyncClient(project=PROJECT_ID)
    
    with open('knowledge_base.json', 'r') as f:
        data = json.load(f)
        
    contacts = data.get('contacts', {})
    
    print(f"Seeding Firestore for project: {PROJECT_ID}")
    
    for category, providers in contacts.items():
        print(f"Adding category: {category}")
        for provider in providers:
            # Add category to the provider document for easier filtering
            provider['category'] = category
            # Use name as a simple unique ID or let Firestore generate one
            doc_id = provider.get('name').replace(' ', '_').lower()
            
            await db.collection("knowledge_base").document(doc_id).set(provider)
            print(f"  - Added provider: {provider['name']}")
            
    print("Seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed_data())
