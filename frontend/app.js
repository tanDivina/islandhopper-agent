let ws = null;
let mediaRecorder = null;
let isLive = false;
let ambientAudio = null;
let currentImages = [];
let slideshowInterval;
let ambientStarted = false;
let mode = 'voice'; 
let gestureEnabled = false;
let gestureStream = null;

// DOM Elements
const introHero = document.getElementById('introHero');
const startPlanningBtn = document.getElementById('startPlanningBtn');
const statusText = document.getElementById('status');
const emptyState = document.getElementById('emptyState');
const itineraryGrid = document.getElementById('itineraryGrid');
const cinematicPlayer = document.getElementById('cinematicPlayer');
const customCursor = document.getElementById('customCursor');
const conciergeAvatar = document.getElementById('conciergeAvatar');
const modeToggle = document.getElementById('modeToggle');
const modeIcon = document.getElementById('modeIcon');
const modeText = document.getElementById('modeText');
const gestureToggle = document.getElementById('gestureToggle');
const gestureContainer = document.getElementById('gestureContainer');
const gestureVideo = document.getElementById('gestureVideo');
const textInputContainer = document.getElementById('textInputContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');

// Modal Elements
const infoModal = document.getElementById('infoModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close-modal');
const navItems = document.querySelectorAll('.nav-item');

// Data for modals
const modalData = {
    'Verified Guides': {
        title: 'Verified Captains & Guides',
        content: `
            <p style="margin-bottom: 1rem;">In Bocas del Toro, most guides are also boat captains. Here are our verified local experts:</p>
            <ul class="modal-list">
                <li>
                    <div>
                        <strong>Captain Jose</strong><br>
                        <span style="font-size: 0.8rem; opacity: 0.7;">Expert in Zapatilla & Snorkeling</span>
                    </div>
                    <button class="contact-btn">WhatsApp</button>
                </li>
                <li>
                    <div>
                        <strong>Guide Maria (Green Path)</strong><br>
                        <span style="font-size: 0.8rem; opacity: 0.7;">Sloth Spotting & Jungle Treks</span>
                    </div>
                    <button class="contact-btn">WhatsApp</button>
                </li>
                 <li>
                    <div>
                        <strong>Captain Leo</strong><br>
                        <span style="font-size: 0.8rem; opacity: 0.7;">Surf Breaks & Starfish Beach</span>
                    </div>
                    <button class="contact-btn">WhatsApp</button>
                </li>
            </ul>
        `
    },
    'Local Water Taxis': {
        title: 'Local Water Taxis',
        content: `
             <p style="margin-bottom: 1rem;">Standard rates and verified captains for inter-island transport.</p>
            <ul class="modal-list">
                <li>
                    <div>
                        <strong>Bocas Town to Carenero</strong><br>
                        <span style="font-size: 0.8rem; opacity: 0.7;">$2 - $3 USD (Daytime)</span>
                    </div>
                </li>
                <li>
                    <div>
                        <strong>Bocas Town to Bastimentos (Old Bank)</strong><br>
                        <span style="font-size: 0.8rem; opacity: 0.7;">$5 USD (Daytime)</span>
                    </div>
                </li>
                 <li>
                    <div>
                        <strong>Bocas Town to Red Frog Beach</strong><br>
                        <span style="font-size: 0.8rem; opacity: 0.7;">$8 - $10 USD</span>
                    </div>
                </li>
            </ul>
             <p style="margin-top: 1rem; font-size: 0.8rem; color: var(--brushed-gold);">*Night rates (after 8 PM) are typically double. Always confirm price before boarding.</p>
        `
    },
    'Weather Updates': {
        title: 'Bocas Weather Outlook',
        content: `
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">⛅</div>
                <h3 style="color: var(--white); margin-bottom: 0.5rem;">Partly Cloudy, Brief Showers</h3>
                <p style="font-size: 1.2rem; color: var(--brushed-gold);">82°F / 28°C</p>
            </div>
            <p style="line-height: 1.6;"><strong>Concierge Note:</strong> Tropical weather changes quickly. Morning boat tours to Zapatilla are recommended. Afternoon showers are common but usually pass quickly. Surf conditions at Carenero are currently optimal.</p>
        `
    }
};

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const key = e.target.textContent.trim();
        if (modalData[key]) {
            modalTitle.textContent = modalData[key].title;
            modalBody.innerHTML = modalData[key].content;
            infoModal.style.display = 'block';
        }
    });
});

closeModal.addEventListener('click', () => {
    infoModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target == infoModal) {
        infoModal.style.display = 'none';
    }
});

function initAmbientAudio() {
    if (!ambientAudio) {
        // Use a more reliable source or silence the error if it fails
        ambientAudio = new Audio('https://www.soundjay.com/misc/sounds/beach-waves-01.mp3');
        ambientAudio.loop = true;
        ambientAudio.volume = 0.3;
        ambientAudio.onerror = () => { console.warn("Ambient audio failed to load. Proceeding in silence."); };
    }
}

function getEmojiForActivity(text) {
    const lower = text.toLowerCase();
    if (lower.includes('chocolate') || lower.includes('cacao')) return '🍫';
    if (lower.includes('sloth') || lower.includes('monkey')) return '🦥';
    if (lower.includes('beach') || lower.includes('starfish') || lower.includes('zapatilla')) return '🏖️';
    if (lower.includes('boat') || lower.includes('taxi') || lower.includes('captain')) return '🚤';
    if (lower.includes('snork') || lower.includes('dive') || lower.includes('fish')) return '🐠';
    if (lower.includes('surf') || lower.includes('wave')) return '🏄';
    if (lower.includes('hike') || lower.includes('jungle')) return '🌴';
    return '📍';
}

function renderMessage(text, sender) {
    chatMessages.style.display = 'flex';
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderImageMessage(base64Image, promptText) {
    chatMessages.style.display = 'flex';
    const msgDiv = document.createElement('div');
    msgDiv.className = `message agent image-message`;
    msgDiv.innerHTML = `
        <img src="${base64Image}" alt="${promptText}" style="width: 100%; border-radius: 8px; border: 1px solid var(--brushed-gold); margin-bottom: 0.5rem;" />
        <p style="font-size: 0.8rem; color: var(--brushed-gold); font-style: italic;">Generated: ${promptText}</p>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderWhatsAppButton(link, previewText) {
    chatMessages.style.display = 'flex';
    const msgDiv = document.createElement('div');
    msgDiv.className = `message agent`;
    msgDiv.innerHTML = `
        <p style="margin-bottom: 1rem; font-weight: bold;">I have prepared the message in Spanish for the captain!</p>
        <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-left: 3px solid var(--brushed-gold); font-style: italic; font-size: 0.9rem; margin-bottom: 1rem;">
            "${previewText}"
        </div>
        <a href="${link}" target="_blank" style="display: inline-block; background: #25D366; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: bold; font-family: 'Outfit';">
            📱 Send via WhatsApp
        </a>
    `;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderItinerary(itinerary) {
    if (!itinerary || itinerary.length === 0) return;
    
    emptyState.style.display = 'none';
    itineraryGrid.style.display = 'block';
    itineraryGrid.innerHTML = ''; 
    currentImages = [];

    itinerary.forEach((day, index) => {
        const dayNum = (index + 1).toString().padStart(2, '0');
        const daySection = document.createElement('div');
        daySection.className = 'itinerary-day-section';
        
        const dayMarker = document.createElement('div');
        dayMarker.className = 'day-marker';
        dayMarker.textContent = `DAY ${dayNum}`;
        daySection.appendChild(dayMarker);

        const activitiesWrapper = document.createElement('div');
        activitiesWrapper.className = 'day-activities-wrapper';

        day.activities.forEach(act => {
            const desc = act.description || act;
            const keyword = act.image_keyword || 'tropical-luxury';
            const emoji = getEmojiForActivity(desc);
            const imageUrl = `https://picsum.photos/seed/${keyword}/1200/800`;
            currentImages.push(imageUrl);

            const card = document.createElement('div');
            card.className = 'day-card';
            card.innerHTML = `
                <div class="gesture-badge" style="display:none">Selected</div>
                <img src="${imageUrl}" class="activity-image" alt="${keyword}" />
                <div class="activity-header">
                    <div class="activity-icon">${emoji}</div>
                    <div class="activity-text">${desc}</div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                card.classList.toggle('selected-gesture');
                const badge = card.querySelector('.gesture-badge');
                badge.style.display = card.classList.contains('selected-gesture') ? 'block' : 'none';
            });

            activitiesWrapper.appendChild(card);
        });

        daySection.appendChild(activitiesWrapper);
        itineraryGrid.appendChild(daySection);
    });
}

function getOrSetTravelerId() {
    let id = localStorage.getItem('islandHopper_travelerId');
    if (!id) {
        id = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('islandHopper_travelerId', id);
    }
    return id;
}

async function startSession() {
    statusText.textContent = "Connecting to Island Hopper Concierge...";
    
    if (!ambientStarted) {
        initAmbientAudio();
        if (ambientAudio) {
            ambientAudio.play().catch(e => console.warn("Audio blocked."));
        }
        ambientStarted = true;
    }

    introHero.classList.add('hidden');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/live`;
        
        ws = new WebSocket(wsUrl); 
        
        ws.onopen = () => {
            // Send Handshake with Traveler ID for Cognitive Memory
            const travelerId = getOrSetTravelerId();
            ws.send(JSON.stringify({ type: "init", traveler_id: travelerId }));

            isLive = true;
            if (ambientAudio) ambientAudio.volume = 0.1;
            startPlanningBtn.classList.add('recording');
            statusText.textContent = "Concierge Connected. Start talking or typing.";
            
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
                     const reader = new FileReader();
                     reader.readAsDataURL(e.data);
                     reader.onloadend = () => { 
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            const base64 = reader.result.split(',')[1];
                            ws.send(JSON.stringify({ type: "audio", data: base64 })); 
                        }
                     };
                }
            };

            if (mode === 'voice') {
                mediaRecorder.start(1000);
            }
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "ui_update") {
                renderItinerary(msg.itinerary);
            } else if (msg.type === "audio" && mode === 'voice') {
                playAudioBase64(msg.data);
            } else if (msg.type === "play_video") {
                playCinematicVideo(msg.summary);
            } else if (msg.type === "text_response") {
                renderMessage(msg.text, 'agent');
            } else if (msg.type === "image_generated") {
                renderImageMessage(msg.image_data, msg.prompt);
            } else if (msg.type === "whatsapp_handoff") {
                renderWhatsAppButton(msg.link, msg.message);
            } else if (msg.type === "error") {
                statusText.textContent = "Concierge Error: " + msg.message;
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
            statusText.textContent = "Connection Error.";
        };

        ws.onclose = (event) => {
            isLive = false;
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            startPlanningBtn.classList.remove('recording');
            if (!statusText.textContent.includes("Error")) {
                statusText.textContent = "Session ended.";
            }
        };

    } catch (err) {
        console.error("Session start error:", err);
        statusText.textContent = "Access Denied: Microphone required.";
    }
}

async function toggleGestureMode() {
    if (!gestureEnabled) {
        try {
            gestureStream = await navigator.mediaDevices.getUserMedia({ video: true });
            gestureVideo.srcObject = gestureStream;
            gestureContainer.style.display = 'block';
            gestureEnabled = true;
            gestureToggle.classList.add('recording');
            statusText.textContent = "Gesture Control Active.";
        } catch (err) {
            alert("Camera permissions required.");
        }
    } else {
        if (gestureStream) {
            gestureStream.getTracks().forEach(track => track.stop());
        }
        gestureVideo.srcObject = null;
        gestureContainer.style.display = 'none';
        gestureEnabled = false;
        gestureToggle.classList.remove('recording');
    }
}

function sendTextQuery() {
    const text = userInput.value.trim();
    if (text && ws && ws.readyState === WebSocket.OPEN) {
        renderMessage(text, 'user');
        ws.send(JSON.stringify({ type: "text", data: text }));
        userInput.value = '';
    }
}

let audioQueue = Promise.resolve();
async function playAudioBase64(base64Data) {
    audioQueue = audioQueue.then(async () => {
        const audio = new Audio(base64Data);
        if (conciergeAvatar) conciergeAvatar.classList.add('is-speaking');
        
        await new Promise((resolve) => {
            audio.onended = () => {
                if (conciergeAvatar) conciergeAvatar.classList.remove('is-speaking');
                resolve();
            };
            audio.onerror = () => {
                if (conciergeAvatar) conciergeAvatar.classList.remove('is-speaking');
                resolve();
            };
            audio.play().catch((e) => {
                console.warn("Playback blocked", e);
                if (conciergeAvatar) conciergeAvatar.classList.remove('is-speaking');
                resolve();
            });
        });
    });
}

function playCinematicVideo(summary) {
    if (currentImages.length === 0) return;
    const title = document.getElementById('cinematicTitle');
    const imgContainer = document.getElementById('cinematicImageContainer');
    title.textContent = summary;
    imgContainer.innerHTML = '';
    currentImages.forEach((url, i) => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'cinematic-img';
        img.id = `cine-img-${i}`;
        imgContainer.appendChild(img);
    });
    cinematicPlayer.classList.add('active');
    title.classList.add('active');
    let currentIdx = 0;
    document.getElementById(`cine-img-0`).classList.add('active');
    slideshowInterval = setInterval(() => {
        const prev = document.getElementById(`cine-img-${currentIdx}`);
        if (prev) prev.classList.remove('active');
        currentIdx = (currentIdx + 1) % currentImages.length;
        const next = document.getElementById(`cine-img-${currentIdx}`);
        if (next) next.classList.add('active');
    }, 5000);
}

// --- Event Listeners ---
startPlanningBtn.addEventListener('click', () => {
    if (!isLive) {
        startSession();
    } else {
        if (ws) ws.close();
    }
});

modeToggle.addEventListener('click', () => {
    if (mode === 'voice') {
        mode = 'text';
        modeIcon.textContent = '⌨️';
        modeText.textContent = 'Text Mode';
        textInputContainer.style.display = 'flex';
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    } else {
        mode = 'voice';
        modeIcon.textContent = '🎙️';
        modeText.textContent = 'Voice Mode';
        textInputContainer.style.display = 'none';
        if (isLive && mediaRecorder && mediaRecorder.state === 'inactive') {
             mediaRecorder.start(1000);
        }
    }
});

gestureToggle.addEventListener('click', toggleGestureMode);
sendBtn.addEventListener('click', sendTextQuery);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendTextQuery();
});

document.getElementById('closeCinematicBtn').addEventListener('click', () => {
    cinematicPlayer.classList.remove('active');
    clearInterval(slideshowInterval);
});

document.addEventListener('mousemove', (e) => {
    customCursor.style.left = e.clientX + 'px';
    customCursor.style.top = e.clientY + 'px';
});

document.addEventListener('mouseover', (e) => {
    if (e.target.closest('button') || e.target.closest('.day-card') || e.target.closest('.nav-item')) {
        customCursor.classList.add('reveal');
    }
});

document.addEventListener('mouseout', (e) => {
    if (e.target.closest('button') || e.target.closest('.day-card') || e.target.closest('.nav-item')) {
        customCursor.classList.remove('reveal');
    }
});