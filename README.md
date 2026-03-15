# 🏝️ Island Hopper: The Multimodal Soul of Bocas del Toro

**Tagline:** Authentic Afro-Caribbean hospitality, powered by Gemini Live and Multimodal RAG.

Island Hopper is a voice-first multimodal concierge designed to bridge the "digital disconnect" in local tourism. It restores authenticity by replacing stiff corporate bots with a warm Afro-Caribbean persona and directly connects travelers with certified "Conscious Captains" in Bocas del Toro, Panama.

---

## 🏆 Hackathon Bonus: Automated Deployment
We have automated our entire deployment pipeline using Google Cloud Build and Cloud Run.
*   **Infrastructure-as-Code:** See `deploy.sh` in the root directory.
*   **Deployment Command:** `./deploy.sh` (Requires gcloud CLI and project permissions).

---

## 🧪 Reproducible Testing Instructions for Judges

To experience the full power of Island Hopper, please follow these steps:

### 1. The Concierge Experience (Traveler View)
*   **URL:** [https://islandhopper-agent-2026-305893181793.us-central1.run.app](https://islandhopper-agent-2026-305893181793.us-central1.run.app)
*   **Step 1 (Start):** Click the centered microphone button to begin.
*   **Step 2 (Visual Discovery):** Wait 3 seconds. The concierge will greet you and automatically trigger a **Visual Discovery Slideshow**.
*   **Step 3 (Multimodal Feedback):** Tap "Love it" or "Pass" on the cards (Sloths, Dolphins, Mangroves). This data is sent back to the agent to build your "Vibe Profile."
*   **Step 4 (Voice Planning):** Say: *"I'm staying for 3 days. I love wildlife but want to avoid the crowds."*
*   **Step 5 (Visual Sync):** Ask: *"What does Zapatilla Island look like?"* The agent will query the **Multimodal Vector RAG** to find an authentic photo instead of generating AI art.
*   **Step 6 (Interruption):** Try talking over the agent. She will stop immediately to listen to your new request.
*   **Step 7 (Finalize):** Say *"Finalize my trip"* to trigger the **Director Agent's** cinematic summary.

### 2. Partner Onboarding (Captain View)
*   **URL:** [https://islandhopper-agent-2026-305893181793.us-central1.run.app/intake.html](https://islandhopper-agent-2026-305893181793.us-central1.run.app/intake.html)
*   **Step 1 (Voice Intake):** Click **"REGISTER BY VOICE"**. 
*   **Step 2 (Speech-to-Data):** Record a message in **Spanish or English**: *"Soy el Capitán Juan, mi whatsapp es +507 61234567 y hago tours de buceo por 50 dólares."*
*   **Step 3 (AI Extraction):** Click **"SEND FOR REVIEW"**. Our backend uses **Gemini 3.1 Pro** to parse that audio into a structured database entry automatically.

### 3. Admin Review (Manager View)
*   **URL:** [https://islandhopper-agent-2026-305893181793.us-central1.run.app/admin.html](https://islandhopper-agent-2026-305893181793.us-central1.run.app/admin.html)
*   **Action:** Review the pending voice and manual submissions. Clicking **"Approve"** automatically generates a **Multimodal Embedding** for that captain and moves them into the live RAG database.

---

## 🛠️ Tech Stack
*   **Core AI:** Gemini 3.1 Pro, Gemini 2.5 Flash Native Audio.
*   **Visuals:** Imagen 3.0 (with automated curator logic).
*   **Search:** Gemini Embedding 2 (Natively Multimodal Vector Search).
*   **Framework:** Agent Development Kit (ADK) for Python.
*   **Database:** Google Firestore (for Cognitive Memory and RAG).
*   **Hosting:** Google Cloud Run.
