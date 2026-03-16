let ws = null;
let isLive = false;

// Mobile sidebar toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
}

if (mobileMenuBtn) mobileMenuBtn.onclick = openSidebar;
if (sidebarOverlay) sidebarOverlay.onclick = closeSidebar;

// Audio Variables
let audioContext = null;
let stream = null;
let processor = null;
let nextPlayTime = 0;
let activeSources = []; // Track active sources for interruption

// DOM Elements
const introHero = document.getElementById('introHero');
const startPlanningBtn = document.getElementById('startPlanningBtn');
const restartBtn = document.getElementById('restartBtn');
const statusText = document.getElementById('status');
const conciergeAvatar = document.getElementById('conciergeAvatar');
const visualizerContainer = document.getElementById('visualizerContainer');
const voiceVisualizer = document.getElementById('voiceVisualizer');
const resumeAudioBtn = document.getElementById('resumeAudioBtn');
const itineraryGrid = document.getElementById('itineraryGrid');
const emptyState = document.getElementById('emptyState');
const cinematicPlayer = document.getElementById('cinematicPlayer');
const cinematicTitle = document.getElementById('cinematicTitle');
const cinematicImageContainer = document.getElementById('cinematicImageContainer');
const closeCinematicBtn = document.getElementById('closeCinematicBtn');
const micIndicator = document.getElementById('micIndicator');
const micDot = document.getElementById('micDot');

// Discovery Elements
const discoveryOverlay = document.getElementById('discoveryOverlay');
const discoveryImage = document.getElementById('discoveryImage');
const discoveryCaption = document.getElementById('discoveryCaption');
const discoveryNo = document.getElementById('discoveryNo');
const discoveryYes = document.getElementById('discoveryYes');

let discoveryItems = [];
let discoveryIndex = 0;
let discoveryLikes = [];

// Transcript Tracking
let sessionTranscripts = [];
const transcriptBar = document.getElementById('transcriptBar');
const transcriptText = document.getElementById('transcriptText');
let transcriptBuffer = '';
let transcriptFlushTimer = null;

function handleDiscoveryStart(items) {
    discoveryItems = items;
    discoveryIndex = 0;
    discoveryLikes = [];
    discoveryOverlay.classList.add('active');
    showNextDiscoveryItem();
}

function showNextDiscoveryItem() {
    if (discoveryIndex >= discoveryItems.length) {
        discoveryOverlay.classList.remove('active');
        // Send results back to agent
        ws.send(JSON.stringify({ 
            type: "discovery_results", 
            likes: discoveryLikes 
        }));
        return;
    }
    const item = discoveryItems[discoveryIndex];
    discoveryImage.src = item.url;
    discoveryCaption.textContent = item.caption;
}

discoveryYes.onclick = () => {
    discoveryLikes.push(discoveryItems[discoveryIndex].tags);
    discoveryIndex++;
    showNextDiscoveryItem();
};

discoveryNo.onclick = () => {
    discoveryIndex++;
    showNextDiscoveryItem();
};

function handleDayMarker(dayNumber) {
    const marker = document.createElement('div');
    marker.className = 'day-marker-container';
    marker.style.cssText = "grid-column: 1 / -1; margin-top: 2rem; margin-bottom: 1rem; border-bottom: 2px solid var(--brushed-gold); padding-bottom: 0.5rem; animation: fadeIn 1s ease;";
    marker.innerHTML = `<h2 class="day-marker-title">Day ${dayNumber.toString().padStart(2, '0')}</h2>`;
    
    itineraryGrid.appendChild(marker);
    itineraryGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    marker.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleImage(data, caption, isReal = false, url = null) {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'day-card';
    imgContainer.style.animation = 'fadeIn 0.8s ease forwards';
    
    const imgSrc = url ? url : `data:image/png;base64,${data}`;
    const badgeText = isReal ? "Authentic Local Photo" : "AI-Generated Visual";
    const badgeColor = isReal ? "#25D366" : "var(--brushed-gold)";

    imgContainer.innerHTML = `
        <div style="position:relative;">
            <img src="${imgSrc}" style="width:100%; border-radius:4px; border:1px solid ${badgeColor}; display:block;">
            <div style="position:absolute; top:10px; right:10px; background:${badgeColor}; color:black; padding:2px 8px; font-size:10px; font-weight:bold; border-radius:10px; text-transform:uppercase;">
                ${badgeText}
            </div>
        </div>
        <div style="margin-top:15px;">
            <p style="font-size:14px; line-height:1.5; color:white; font-family:'Outfit', sans-serif;">
                ${caption || "Visualizing your island escape..."}
            </p>
        </div>
    `;
    itineraryGrid.appendChild(imgContainer);
    itineraryGrid.style.display = 'grid';
    emptyState.style.display = 'none';
}

function handleWhatsApp(url, text) {
    const waContainer = document.createElement('div');
    waContainer.className = 'day-card';
    waContainer.style.border = '2px solid #25D366';
    waContainer.innerHTML = `
        <h3 style="color:#25D366; margin-bottom:10px;">Ready to Book?</h3>
        <p style="margin-bottom:15px; font-size:14px;">${text}</p>
        <a href="${url}" target="_blank" style="display:inline-block; background:#25D366; color:white; padding:10px 20px; border-radius:25px; text-decoration:none; font-weight:bold;">Send WhatsApp Message</a>
    `;
    itineraryGrid.appendChild(waContainer);
    itineraryGrid.style.display = 'grid';
    emptyState.style.display = 'none';
}

function handleFinalItinerary(title, summary) {
    cinematicTitle.textContent = title;
    cinematicImageContainer.innerHTML = `<p style="color:white; font-size:18px; line-height:1.6;">${summary}</p>`;
    cinematicPlayer.classList.add('active');
}

closeCinematicBtn.onclick = () => cinematicPlayer.classList.remove('active');

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    }
}

function stopAllAudio() {
    activeSources.forEach(s => {
        try { s.stop(); } catch(e) {}
    });
    activeSources = [];
    nextPlayTime = audioContext.currentTime;
    if (conciergeAvatar) conciergeAvatar.classList.remove('is-speaking');
}

function playPCM(base64Data) {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();

    try {
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const arrayBuffer = new ArrayBuffer(len);
        const uint8View = new Uint8Array(arrayBuffer);
        for (let i = 0; i < len; i++) uint8View[i] = binaryString.charCodeAt(i);
        
        const dataView = new DataView(arrayBuffer);
        const numSamples = Math.floor(len / 2);
        const float32Data = new Float32Array(numSamples);
        
        for (let i = 0; i < numSamples; i++) {
            float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;
        }
        
        const buffer = audioContext.createBuffer(1, numSamples, 24000);
        buffer.copyToChannel(float32Data, 0);
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        
        const now = audioContext.currentTime;
        if (nextPlayTime < now) nextPlayTime = now;
        source.start(nextPlayTime);
        
        activeSources.push(source);
        nextPlayTime += buffer.duration;

        if (conciergeAvatar) {
            conciergeAvatar.classList.add('is-speaking');
        }

        source.onended = () => {
            activeSources = activeSources.filter(s => s !== source);
            if (activeSources.length === 0) {
                conciergeAvatar.classList.remove('is-speaking');
            }
        };
    } catch (err) { console.error("Playback error", err); }
}

async function startSession() {
    statusText.textContent = "Connecting...";
    initAudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();
    
    introHero.classList.add('hidden');
    restartBtn.style.display = 'flex';
    micIndicator.style.display = 'flex';
    closeSidebar();

    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            } 
        });

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/live`;
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            let traveler_id = localStorage.getItem('traveler_id');
            if (!traveler_id) {
                traveler_id = "user_" + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('traveler_id', traveler_id);
            }
            
            ws.send(JSON.stringify({ type: "init", traveler_id: traveler_id }));
            isLive = true;
            statusText.textContent = "Concierge Listening...";
            
            // Visualizer
            visualizerContainer.style.display = 'flex';
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const ctx = voiceVisualizer.getContext('2d');
            
            const draw = () => {
                if (!isLive) return;
                requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);
                
                // Mic Activity Feedback
                let sum = 0;
                for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                micDot.style.background = avg > 30 ? '#25D366' : '#666'; // Green if sound detected

                ctx.clearRect(0, 0, voiceVisualizer.width, voiceVisualizer.height);
                ctx.fillStyle = '#D4AF37';
                let x = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const h = (dataArray[i] / 255) * voiceVisualizer.height * 1.5;
                    ctx.fillRect(x, voiceVisualizer.height - h, 10, h);
                    x += 15;
                }
            };
            draw();

            // PCM Capture at 16kHz
            processor = audioContext.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            
            const dummy = audioContext.createMediaStreamDestination();
            processor.connect(dummy);
            
            processor.onaudioprocess = (e) => {
                if (isLive && ws?.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const buffer = new ArrayBuffer(inputData.length * 2);
                    const view = new DataView(buffer);
                    for (let i = 0; i < inputData.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputData[i]));
                        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                    }
                    
                    const bytes = new Uint8Array(buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    ws.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
                }
            };
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "audio") {
                playPCM(msg.data);
            } else if (msg.type === "discovery_start") {
                handleDiscoveryStart(msg.items);
            } else if (msg.type === "day_marker") {
                handleDayMarker(msg.day);
            } else if (msg.type === "image") {
                handleImage(msg.data, msg.caption, msg.is_real, msg.url);
            } else if (msg.type === "whatsapp") {
                handleWhatsApp(msg.url, msg.text);
            } else if (msg.type === "itinerary_finalized") {
                handleFinalItinerary(msg.title, msg.summary);
            } else if (msg.type === "text_resp") {
                transcriptBar.style.display = 'flex';
                transcriptBuffer += msg.text;
                transcriptText.textContent = transcriptBuffer;
                clearTimeout(transcriptFlushTimer);
                transcriptFlushTimer = setTimeout(() => {
                    sessionTranscripts.push(transcriptBuffer);
                    transcriptBuffer = '';
                }, 3000);
            } else if (msg.type === "interrupted") {
                stopAllAudio();
                transcriptBuffer = '';
            } else if (msg.type === "error") {
                statusText.textContent = "Error: " + msg.message;
            }
        };

        ws.onclose = () => {
            isLive = false;
            if (processor) processor.disconnect();
            if (stream) stream.getTracks().forEach(t => t.stop());
            visualizerContainer.style.display = 'none';
            micIndicator.style.display = 'none';
            statusText.textContent = "Session ended.";
        };

    } catch (err) { 
        statusText.textContent = "Mic access denied."; 
    }
}

function restartSession() {
    if (ws) ws.close();
    localStorage.removeItem('traveler_id');
    itineraryGrid.innerHTML = '';
    itineraryGrid.style.display = 'none';
    emptyState.style.display = 'block';
    startSession();
}

// Attach initial listener
if (startPlanningBtn) {
    startPlanningBtn.onclick = () => {
        console.log("Start button clicked");
        if (isLive) {
            if (ws) ws.close();
        } else {
            startSession();
        }
    };
}

restartBtn.onclick = restartSession;

function askConcierge(question) {
    if (!isLive || !ws || ws.readyState !== WebSocket.OPEN) {
        statusText.textContent = "Start a session first, then try again.";
        return;
    }
    closeSidebar();
    ws.send(JSON.stringify({ type: "text_query", text: question }));
}

resumeAudioBtn.onclick = () => {
    if (audioContext) audioContext.resume();
    resumeAudioBtn.style.display = 'none';
};
