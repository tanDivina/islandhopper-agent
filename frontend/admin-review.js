var ws = null;
var isLive = false;
var audioContext = null;
var stream = null;
var processor = null;
var nextPlayTime = 0;
var activeSources = [];
var approvedCount = 0;
var rejectedCount = 0;
var transcriptBuffer = '';
var transcriptFlushTimer = null;
var captainCache = {};

var startReviewBtn = document.getElementById('startReviewBtn');
var agentConversation = document.getElementById('agentConversation');
var agentControls = document.getElementById('agentControls');
var transcriptText = document.getElementById('transcriptText');
var textInput = document.getElementById('textInput');
var sendTextBtn = document.getElementById('sendTextBtn');
var endSessionBtn = document.getElementById('endSessionBtn');
var queueList = document.getElementById('queueList');
var detailPanel = document.getElementById('detailPanel');
var micDot = document.getElementById('micDot');
var statusLabel = document.getElementById('statusLabel');
var pendingCountEl = document.getElementById('pendingCount');
var approvedCountEl = document.getElementById('approvedCount');
var rejectedCountEl = document.getElementById('rejectedCount');

function stopAllAudio() {
    activeSources.forEach(function(s) { try { s.stop(); } catch(e) {} });
    activeSources = [];
    if (audioContext) nextPlayTime = audioContext.currentTime;
}

function playPCM(base64Data) {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    try {
        var binaryString = atob(base64Data);
        var len = binaryString.length;
        var arrayBuffer = new ArrayBuffer(len);
        var uint8View = new Uint8Array(arrayBuffer);
        for (var i = 0; i < len; i++) uint8View[i] = binaryString.charCodeAt(i);
        var dataView = new DataView(arrayBuffer);
        var numSamples = Math.floor(len / 2);
        var float32Data = new Float32Array(numSamples);
        for (var i = 0; i < numSamples; i++) {
            float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;
        }
        var buffer = audioContext.createBuffer(1, numSamples, 24000);
        buffer.copyToChannel(float32Data, 0);
        var source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        var now = audioContext.currentTime;
        if (nextPlayTime < now) nextPlayTime = now;
        source.start(nextPlayTime);
        activeSources.push(source);
        nextPlayTime += buffer.duration;
        source.onended = function() {
            activeSources = activeSources.filter(function(s) { return s !== source; });
        };
    } catch (err) { console.error("Playback error", err); }
}

function addMessage(text, type) {
    var welcomeEl = agentConversation.querySelector('.agent-welcome');
    if (welcomeEl) welcomeEl.remove();

    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble msg-' + type;
    bubble.textContent = text;
    agentConversation.appendChild(bubble);
    agentConversation.scrollTop = agentConversation.scrollHeight;
}

function updateQueueItem(docId, status) {
    var item = document.querySelector('.queue-item[data-id="' + docId + '"]');
    if (!item) return;

    item.classList.remove('active');
    item.classList.add(status);

    var statusEl = item.querySelector('.queue-item-status');
    if (statusEl) {
        statusEl.textContent = status === 'approved' ? 'Approved' : 'Rejected';
    } else {
        statusEl = document.createElement('div');
        statusEl.className = 'queue-item-status';
        statusEl.textContent = status === 'approved' ? 'Approved' : 'Rejected';
        item.appendChild(statusEl);
    }
}

function renderReviewCard(data) {
    detailPanel.innerHTML = '';
    captainCache[data.doc_id] = data;

    var card = document.createElement('div');
    card.className = 'detail-card';
    card.dataset.id = data.doc_id;

    card.innerHTML =
        '<div class="detail-card-header">' +
            '<span class="detail-card-name">' + escapeHtml(data.name) + '</span>' +
            '<span class="detail-card-badge">' + escapeHtml(data.category) + '</span>' +
        '</div>' +
        '<div class="detail-field">' +
            '<div class="detail-label">WhatsApp</div>' +
            '<div class="detail-value">' + escapeHtml(data.whatsapp) + '</div>' +
        '</div>' +
        '<div class="detail-field">' +
            '<div class="detail-label">Specialty</div>' +
            '<div class="detail-value">' + escapeHtml(data.specialty) + '</div>' +
        '</div>' +
        '<div class="detail-field">' +
            '<div class="detail-label">Pricing Policy</div>' +
            '<div class="detail-pricing">' + escapeHtml(data.pricing_policy) + '</div>' +
        '</div>' +
        '<div class="detail-assessment">' +
            '<div class="detail-assessment-label">Agent Assessment</div>' +
            '<div class="detail-assessment-text">' + escapeHtml(data.assessment) + '</div>' +
        '</div>' +
        '<div class="detail-actions">' +
            '<button class="action-approve" onclick="directApprove(\'' + data.doc_id + '\')">Approve</button>' +
            '<button class="action-ask" onclick="askCaptain(\'' + data.doc_id + '\')">Ask Captain</button>' +
            '<button class="action-reject" onclick="directReject(\'' + data.doc_id + '\')">Reject</button>' +
        '</div>';

    detailPanel.appendChild(card);

    var queueItem = document.querySelector('.queue-item[data-id="' + data.doc_id + '"]');
    if (!queueItem) {
        addQueueItem(data.doc_id, data.name, data.category);
    }
    document.querySelectorAll('.queue-item').forEach(function(el) { el.classList.remove('active'); });
    var activeItem = document.querySelector('.queue-item[data-id="' + data.doc_id + '"]');
    if (activeItem) activeItem.classList.add('active');
}

function addQueueItem(id, name, category) {
    var emptyEl = queueList.querySelector('.queue-empty');
    if (emptyEl) emptyEl.remove();

    if (document.querySelector('.queue-item[data-id="' + id + '"]')) return;

    var item = document.createElement('div');
    item.className = 'queue-item';
    item.dataset.id = id;
    item.innerHTML =
        '<div class="queue-item-name">' + escapeHtml(name) + '</div>' +
        '<div class="queue-item-category">' + escapeHtml(category) + '</div>';
    item.onclick = function() {
        if (captainCache[id]) {
            renderReviewCard(captainCache[id]);
        } else {
            sendText('Show me details for the captain with ID: ' + id);
        }
    };
    queueList.appendChild(item);
    updatePendingCount();
}

function updatePendingCount() {
    var pending = document.querySelectorAll('.queue-item:not(.approved):not(.rejected)').length;
    pendingCountEl.textContent = pending + ' pending';
    approvedCountEl.textContent = approvedCount + ' approved';
    rejectedCountEl.textContent = rejectedCount + ' rejected';
}

async function directApprove(docId) {
    var btn = document.querySelector('.detail-card[data-id="' + docId + '"] .action-approve');
    if (btn) { btn.disabled = true; btn.textContent = 'Approving...'; }
    try {
        var resp = await fetch('/api/admin/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_id: docId })
        });
        if (!resp.ok) {
            var err = await resp.json();
            throw new Error(err.detail || 'Failed');
        }
        approvedCount++;
        updateQueueItem(docId, 'approved');
        updatePendingCount();
        var name = captainCache[docId] ? captainCache[docId].name : 'Captain';
        addMessage(name + ' has been approved.', 'system success');
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendText('I just approved ' + name + '. Move to the next captain.');
        }
        showCardStatus(docId, 'approved');
    } catch (e) {
        addMessage('Failed to approve: ' + e.message, 'system error');
        if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
    }
}

async function directReject(docId) {
    var btn = document.querySelector('.detail-card[data-id="' + docId + '"] .action-reject');
    if (btn) { btn.disabled = true; btn.textContent = 'Rejecting...'; }
    try {
        var resp = await fetch('/api/admin/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_id: docId })
        });
        if (!resp.ok) {
            var err = await resp.json();
            throw new Error(err.detail || 'Failed');
        }
        rejectedCount++;
        updateQueueItem(docId, 'rejected');
        updatePendingCount();
        var name = captainCache[docId] ? captainCache[docId].name : 'Captain';
        addMessage(name + ' has been rejected.', 'system error');
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendText('I just rejected ' + name + '. Move to the next captain.');
        }
        showCardStatus(docId, 'rejected');
    } catch (e) {
        addMessage('Failed to reject: ' + e.message, 'system error');
        if (btn) { btn.disabled = false; btn.textContent = 'Reject'; }
    }
}

async function askCaptain(docId) {
    var data = captainCache[docId];
    if (!data) { addMessage('No captain data found.', 'system error'); return; }

    var btn = document.querySelector('.detail-card[data-id="' + docId + '"] .action-ask');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

    try {
        var resp = await fetch('/api/admin/vet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doc_id: docId,
                message: 'Generate 3-4 short, specific vetting questions I should ask this captain via WhatsApp before approving them. Questions should verify their legitimacy, safety practices, and pricing clarity. Format them as a numbered list in both English and Spanish.',
                history: []
            })
        });
        if (!resp.ok) throw new Error('Vet request failed');
        var result = await resp.json();
        var questions = result.response;

        addMessage('Vetting questions for ' + data.name + ':', 'agent');
        addMessage(questions, 'agent');

        var phone = (data.whatsapp || '').replace(/[^0-9+]/g, '').replace('+', '');
        if (phone) {
            var greeting = 'Hola ' + data.name + ', somos Island Hopper. Estamos revisando tu solicitud y tenemos algunas preguntas:';
            var waUrl = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(greeting);
            showWhatsAppLink(docId, waUrl, data.name);
        }

        if (btn) { btn.disabled = false; btn.textContent = 'Ask Captain'; }
    } catch (e) {
        addMessage('Failed to generate questions: ' + e.message, 'system error');
        if (btn) { btn.disabled = false; btn.textContent = 'Ask Captain'; }
    }
}

function showWhatsAppLink(docId, url, name) {
    var card = document.querySelector('.detail-card[data-id="' + docId + '"]');
    if (!card) return;

    var existing = card.querySelector('.detail-whatsapp-link');
    if (existing) existing.remove();

    var link = document.createElement('a');
    link.className = 'detail-whatsapp-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = 'Open WhatsApp with ' + escapeHtml(name);
    card.appendChild(link);
}

function showCardStatus(docId, status) {
    var card = document.querySelector('.detail-card[data-id="' + docId + '"]');
    if (!card) return;

    var actions = card.querySelector('.detail-actions');
    if (actions) {
        actions.innerHTML =
            '<div class="detail-status-badge ' + status + '">' +
            (status === 'approved' ? 'Approved' : 'Rejected') +
            '</div>';
    }
}

function sendText(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'text_query', text: text }));
    addMessage(text, 'user');
    textInput.value = '';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function startReviewSession() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (audioContext.state === 'suspended') await audioContext.resume();

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });
    } catch (err) {
        addMessage('Microphone access is required for voice review.', 'system error');
        return;
    }

    agentControls.style.display = 'block';
    var welcomeEl = agentConversation.querySelector('.agent-welcome');
    if (welcomeEl) welcomeEl.remove();

    addMessage('Connecting to review agent...', 'system');

    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + window.location.host + '/live/admin-review');

    ws.onopen = function() {
        isLive = true;
        micDot.classList.add('active');
        statusLabel.textContent = 'Listening...';
        addMessage('Review session started. The agent will fetch pending submissions.', 'system success');

        var source = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        var dummy = audioContext.createMediaStreamDestination();
        processor.connect(dummy);

        processor.onaudioprocess = function(e) {
            if (!isLive || !ws || ws.readyState !== WebSocket.OPEN) return;
            var inputData = e.inputBuffer.getChannelData(0);

            var sum = 0;
            for (var k = 0; k < inputData.length; k++) sum += Math.abs(inputData[k]);
            var avg = sum / inputData.length;
            micDot.classList.toggle('active', avg > 0.01);

            var buffer = new ArrayBuffer(inputData.length * 2);
            var view = new DataView(buffer);
            for (var i = 0; i < inputData.length; i++) {
                var s = Math.max(-1, Math.min(1, inputData[i]));
                view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            var bytes = new Uint8Array(buffer);
            var binary = '';
            for (var j = 0; j < bytes.byteLength; j++) binary += String.fromCharCode(bytes[j]);
            ws.send(JSON.stringify({ type: 'audio', data: btoa(binary) }));
        };
    };

    ws.onmessage = function(event) {
        var msg = JSON.parse(event.data);

        if (msg.type === 'audio') {
            playPCM(msg.data);
        } else if (msg.type === 'text_resp') {
            transcriptBuffer += msg.text;
            transcriptText.textContent = transcriptBuffer;
            clearTimeout(transcriptFlushTimer);
            transcriptFlushTimer = setTimeout(function() {
                if (transcriptBuffer.trim()) {
                    addMessage(transcriptBuffer.trim(), 'agent');
                }
                transcriptBuffer = '';
                transcriptText.textContent = '';
            }, 3000);
        } else if (msg.type === 'review_card') {
            renderReviewCard(msg);
        } else if (msg.type === 'captain_approved') {
            approvedCount++;
            updateQueueItem(msg.doc_id, 'approved');
            updatePendingCount();
            addMessage(msg.name + ' has been approved.', 'system success');
            showCardStatus(msg.doc_id, 'approved');
        } else if (msg.type === 'captain_rejected') {
            rejectedCount++;
            updateQueueItem(msg.doc_id, 'rejected');
            updatePendingCount();
            addMessage(msg.name + ' has been rejected.', 'system error');
            showCardStatus(msg.doc_id, 'rejected');
        } else if (msg.type === 'interrupted') {
            stopAllAudio();
            transcriptBuffer = '';
            transcriptText.textContent = '';
        }
    };

    ws.onclose = function() {
        isLive = false;
        micDot.classList.remove('active');
        statusLabel.textContent = 'Disconnected';
        if (processor) processor.disconnect();
        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
        addMessage('Review session ended.', 'system');
    };
}

function endSession() {
    if (ws) ws.close();
    isLive = false;
    agentControls.style.display = 'none';
}

startReviewBtn.onclick = startReviewSession;
endSessionBtn.onclick = endSession;

sendTextBtn.onclick = function() {
    var text = textInput.value.trim();
    if (text) sendText(text);
};

textInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var text = textInput.value.trim();
        if (text) sendText(text);
    }
});
