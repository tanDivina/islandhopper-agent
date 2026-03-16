(function() {
    'use strict';

    var hands = null;
    var camera = null;
    var videoEl = null;
    var statusEl = null;
    var promptEl = null;
    var isActive = false;
    var swipeCallback = null;

    var lastWristX = null;
    var wristHistory = [];
    var GESTURE_COOLDOWN = 1000;
    var SWIPE_VELOCITY_THRESHOLD = 0.12;
    var lastSwipeTime = 0;
    var HISTORY_LENGTH = 4;

    function init(options) {
        videoEl = options.videoEl;
        statusEl = options.statusEl;
        swipeCallback = options.onSwipe;

        if (isMobile()) return;

        showCameraPrompt();
    }

    function isMobile() {
        return 'ontouchstart' in window && window.innerWidth < 1024;
    }

    function showCameraPrompt() {
        if (!videoEl || !videoEl.parentElement) return;

        promptEl = document.createElement('div');
        promptEl.className = 'gesture-prompt';
        promptEl.innerHTML =
            '<p>Enable hand gestures to swipe?</p>' +
            '<div class="gesture-prompt-btns">' +
                '<button class="gesture-allow-btn">Allow Camera</button>' +
                '<button class="gesture-skip-btn">Skip</button>' +
            '</div>';

        videoEl.parentElement.appendChild(promptEl);

        promptEl.querySelector('.gesture-allow-btn').addEventListener('click', function() {
            promptEl.remove();
            promptEl = null;
            requestCamera();
        });

        promptEl.querySelector('.gesture-skip-btn').addEventListener('click', function() {
            promptEl.remove();
            promptEl = null;
        });
    }

    function requestCamera() {
        if (typeof Hands === 'undefined') {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.textContent = 'Gesture library loading...';
            }
            setTimeout(requestCamera, 500);
            return;
        }

        try {
            hands = new Hands({
                locateFile: function(file) {
                    return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file;
                }
            });
            hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 0,
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.5
            });
            hands.onResults(onResults);

            navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' }
            }).then(function(stream) {
                videoEl.srcObject = stream;
                videoEl.style.display = 'block';
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.textContent = 'Wave your hand to swipe!';
                }

                camera = new Camera(videoEl, {
                    onFrame: function() {
                        return hands.send({ image: videoEl });
                    },
                    width: 320,
                    height: 240
                });
                camera.start();
                isActive = true;
            }).catch(function() {
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.textContent = 'Camera denied - use mouse to drag';
                }
            });
        } catch (e) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.textContent = 'Gesture tracking unavailable';
            }
        }
    }

    function onResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            lastWristX = null;
            wristHistory = [];
            return;
        }

        var landmarks = results.multiHandLandmarks[0];
        var wristX = landmarks[0].x;

        wristHistory.push(wristX);
        if (wristHistory.length > HISTORY_LENGTH) {
            wristHistory.shift();
        }

        if (wristHistory.length >= HISTORY_LENGTH) {
            var totalDelta = wristHistory[wristHistory.length - 1] - wristHistory[0];
            var now = Date.now();

            if (Math.abs(totalDelta) > SWIPE_VELOCITY_THRESHOLD && (now - lastSwipeTime) > GESTURE_COOLDOWN) {
                if (isHandOpen(landmarks)) {
                    var direction = totalDelta > 0 ? 'left' : 'right';
                    if (swipeCallback) swipeCallback(direction);
                    lastSwipeTime = now;
                    wristHistory = [];

                    if (statusEl) {
                        statusEl.textContent = direction === 'right' ? 'LOVE!' : 'PASS!';
                        setTimeout(function() {
                            statusEl.textContent = 'Wave your hand to swipe!';
                        }, 600);
                    }
                }
            }
        }

        lastWristX = wristX;
    }

    function isHandOpen(landmarks) {
        var tips = [8, 12, 16, 20];
        var pips = [6, 10, 14, 18];
        var extended = 0;
        for (var i = 0; i < tips.length; i++) {
            if (landmarks[tips[i]].y < landmarks[pips[i]].y) extended++;
        }
        return extended >= 3;
    }

    function destroy() {
        isActive = false;
        if (camera) {
            try { camera.stop(); } catch(e) {}
            camera = null;
        }
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(function(t) { t.stop(); });
            videoEl.srcObject = null;
            videoEl.style.display = 'none';
        }
        if (statusEl) statusEl.style.display = 'none';
        if (promptEl) {
            promptEl.remove();
            promptEl = null;
        }
        hands = null;
        lastWristX = null;
        wristHistory = [];
    }

    window.IslandHopper = window.IslandHopper || {};
    window.IslandHopper.GestureTracker = {
        init: init,
        destroy: destroy,
        isActive: function() { return isActive; }
    };
})();
