# 🏗️ Island Hopper: System Architecture

Island Hopper is built on a modern, event-driven architecture designed for real-time multimodal AI interactions. It leverages the latest Google Gemini Live API and Google Cloud services to deliver a robust, scalable concierge experience.

---

## 🧩 High-Level Components

### 1. Frontend (Client-Side)
A lightweight, zero-build vanilla web interface focused on real-time performance and device accessibility.
*   **Technologies:** HTML5, CSS3 (Custom Variables/Vanilla), Vanilla JavaScript.
*   **Core APIs:**
    *   `WebSocket API`: Maintains a persistent bidirectional connection with the backend for streaming audio, text, and UI commands.
    *   `MediaRecorder API`: Captures user microphone input and chunks it into `audio/webm` blobs for the Live Agent.
    *   `Web Storage API (localStorage)`: Silently manages a unique `traveler_id` to enable Cognitive Memory without requiring a formal login system.
*   **Dynamic UI Engine:** Listens for custom JSON events (`ui_update`, `image_generated`, `whatsapp_handoff`) to dynamically render the itinerary grid, inject AI-generated images, and trigger the cinematic video overlay.

### 2. Backend (FastAPI Application)
A high-performance asynchronous Python server that orchestrates the AI models, handles WebSocket connections, and manages the database state.
*   **Framework:** `FastAPI` running on `uvicorn` (ASGI).
*   **Endpoints:**
    *   `WS /live`: The primary multimodal connection for travelers.
    *   `WS /live/intake`: The specialized voice-native connection for Captain onboarding.
    *   `POST /api/intake`, `GET /api/admin/pending`, `POST /api/admin/approve`: RESTful routes for the Human-in-the-Loop admin dashboard.

### 3. Database Layer (Google Cloud Firestore)
A fully managed NoSQL document database used for persistent, scalable state management across container restarts.
*   **Collections:**
    *   `knowledge_base`: The "Grounded Reality" database containing verified captain data, pricing policies, and availability. (Queried via RAG).
    *   `pending_contacts`: The quarantine queue for unverified captain intake submissions.
    *   `traveler_profiles`: The "Memory Bank" storing synthesized JSON profiles of returning users.

---

## 🤖 The Multi-Model AI Orchestration

Island Hopper routes specific tasks to the most optimized Google GenAI model to balance latency, cost, and capability:

1.  **The Live Concierge (`gemini-2.5-flash-native-audio`)**
    *   **Role:** The primary conversational engine.
    *   **Why:** This preview model processes raw audio natively (no STT/TTS middleman), allowing for incredibly low latency and seamless bilingual switching (e.g., English to Spanish) mid-conversation.
2.  **The Cognitive Synthesizer (`gemini-3.1-flash-lite`)**
    *   **Role:** Background processing and summarization.
    *   **Why:** Highly efficient for processing large text blocks. Used by the `MemoryAgent` to read session transcripts and extract permanent traveler traits, and by the `DirectorAgent` to generate cinematic itinerary titles.
3.  **The Visual Creator (`imagen-3.0-generate-002`)**
    *   **Role:** On-demand image generation.
    *   **Why:** Creates stunning, realistic 16:9 previews of Bocas del Toro locations in real-time when the traveler asks "What does that look like?"

---

## 🔄 Core Data Flows

### Flow A: The Traveler Experience (Cognitive Memory + RAG)
1.  **Handshake:** User opens the app; `app.js` retrieves/creates a `traveler_id` and sends it to `/live`.
2.  **Memory Injection:** Backend queries Firestore for the `traveler_id`. If a profile exists, it is injected into the Gemini `SYSTEM_INSTRUCTION`.
3.  **Live Session:** User speaks. Audio is streamed to Gemini.
4.  **RAG Query:** Gemini calls the `get_verified_local_contact` tool. Backend queries the Firestore `knowledge_base` and returns accurate pricing policies.
5.  **Visual Sync:** Gemini calls `update_itinerary_ui` or `generate_activity_image`. Backend sends JSON to frontend to update the DOM.
6.  **Handoff:** User agrees to book. Gemini translates the request to Spanish and calls `generate_whatsapp_handoff`. Frontend displays the `wa.me` button.
7.  **Consolidation:** User disconnects. The `MemoryAgent` reads the transcript, uses Flash-Lite to extract new facts, and updates the Firestore profile.

### Flow B: Supply-Side Intake (Human-in-the-Loop)
1.  **Voice Intake:** A Captain connects to `/live/intake`.
2.  **Extraction:** The bilingual agent asks questions, extracting Name, WhatsApp, and complex Pricing Policies.
3.  **Quarantine:** The agent calls `submit_captain_profile`. Data is saved to the `pending_contacts` Firestore collection.
4.  **Review:** Admin reviews the submission via the `/admin.html` dashboard.
5.  **Approval:** Admin clicks "Approve". Backend moves the data from `pending_contacts` into the live `knowledge_base`.

---

## 🚀 Deployment
*   **Infrastructure:** Deployed as a Dockerized container on **Google Cloud Run** (managed, serverless platform).
*   **Environment:** Injects the `GOOGLE_API_KEY` securely via Cloud Run environment variables.
*   **Authentication:** Utilizes default Google Cloud service accounts to seamlessly authenticate with the connected Firestore database.