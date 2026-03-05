# 🏝️ Island Hopper: The Multimodal Bocas del Toro Concierge

## 🏆 Hackathon Submission Highlights

This document tracks the advanced features and architectural decisions we implemented to align perfectly with the Gemini Live Agent Challenge requirements. Use these points for your Devpost submission or pitch video!

### 1. 🧠 Hybrid "Multi-Model" Architecture
We didn't just use one model; we orchestrated three distinct Gemini models to optimize for both latency and complex reasoning:
*   **The Live Concierge:** Powered by **`gemini-2.5-flash-native-audio`**. We chose the native audio preview model because it processes raw audio directly without a Speech-to-Text layer. This allows it to instantly detect language changes (English to Spanish) and emotional nuances, enabling real-time, low-latency voice conversations.
*   **The Director Agent:** Powered by **`gemini-3.1-flash-lite`**. When a trip is finalized, this model is invoked asynchronously to analyze the raw JSON itinerary and generate a premium, magazine-style cinematic title for the slideshow reveal.
*   **The Visual Creator:** Powered by **`imagen-3.0-generate-002`**. (See Gen Media Integration below).

### 2. 📸 Real-Time Gen Media Integration (Visual Sync)
Inspired by the `genmedia-live` sample app, Island Hopper is a truly multimodal creation tool. 
*   **Dynamic Visuals:** Instead of relying on static stock photos, the agent has a `generate_activity_image` tool. If a traveler asks, "What does an eco-lodge look like?", the agent generates a stunning, realistic 16:9 image on the fly and streams it directly into the chat UI.
*   **Visual Sync:** As the agent speaks, it triggers WebSocket commands to build an editorial-style itinerary grid on the user's screen synchronously.

### 3. 💾 Cognitive "Always-On" Memory (Firestore)
Inspired by Google's `always-on-memory-agent`, we built a system that mimics human memory consolidation to provide personalized luxury service without requiring user accounts.
*   **The Mechanism:** The frontend assigns a silent `Traveler ID` via local storage. The backend tracks the conversation transcript. When the user disconnects, a background task uses **Gemini 3.1 Flash-Lite** to read the transcript, extract rigid facts (e.g., "Vegan", "Gets seasick", "Luxury budget"), and saves this structured profile to **Google Cloud Firestore**.
*   **The Magic:** When the user returns, the backend fetches their Firestore profile and injects it into the system prompt. The agent instantly welcomes them back and filters future recommendations based on their known constraints.

### 4. 🎙️ Voice-Native Supply Side Intake (Bilingual)
We realized that local Bocas del Toro boat captains hate filling out complex web forms. To solve the "cold start" problem of building our local database, we built a **Voice-Native Intake Agent**.
*   **The Flow:** Captains tap a single microphone button on their phone.
*   **Bilingual Intelligence:** The agent greets them bilingually ("Hello! Hola!") and instantly locks into their preferred language, using local slang like "lancha" or "panga."
*   **Complex Extraction:** It patiently listens as captains describe their complex, nuanced pricing rules (e.g., "$20 base, plus $5/hr waiting, double at night") and extracts it into perfectly structured JSON.
*   **Human-in-the-Loop Security:** To prevent spam, hallucinations, or fake data from polluting the live AI, the intake tool does *not* write to the live database. Instead, it submits the profile to a quarantined `pending_contacts` Firestore collection. An admin must review and manually click "Approve" on a hidden dashboard before the captain is moved to the live `knowledge_base`.

### 5. 🌍 Grounded Reality (RAG Database)
The agent does not hallucinate prices or phone numbers.
*   We built a local RAG pipeline connected to **Google Cloud Firestore**. 
*   When a user requests a service, the `get_verified_local_contact` tool queries the `knowledge_base` collection. The agent then reads the complex "Pricing Policy" submitted by the captain and calculates the exact, accurate quote for the traveler on the fly.

### 6. 🤝 Seamless Bilingual Handoff (WhatsApp API)
We solved the "last mile" booking problem and the language barrier in one step.
*   **The Translation Engine:** When a tourist finalizes a booking, the Live Agent takes the agreed-upon details (dates, pax, price) and uses its native multilingual capability to draft a perfect booking request in *Spanish* (the captain's preferred language).
*   **The Click-to-Chat Handoff:** The agent uses a custom `generate_whatsapp_handoff` tool to dynamically URL-encode this Spanish message and generate a `wa.me` deep link. 
*   **The UX:** The user clicks a shiny "Send via WhatsApp" button in the chat, opening their native app with the Spanish message pre-filled and addressed to the correct captain. Zero typing, zero Spanish required by the tourist.

### 7. ✨ Zero-Click Spatial UX
*   **Gesture Control Ready:** Built an optional "Privacy Lens" that accesses the local camera. It demonstrates how users can select itinerary items using hand signs (processed entirely locally) for a futuristic, spatial computing feel.
*   **Voice-Reactive Avatar:** A high-fashion concierge avatar monitors the audio stream and pulses organically while the AI is speaking, giving the digital agent a physical presence.