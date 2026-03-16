(function() {
    'use strict';

    var SWIPE_THRESHOLD = 100;
    var ROTATION_FACTOR = 0.12;
    var MAX_VISIBLE = 3;

    var cardStackEl = null;
    var cardCounterEl = null;
    var items = [];
    var currentIndex = 0;
    var likes = [];
    var dislikes = [];
    var onCompleteCb = null;
    var onReactionCb = null;

    var isDragging = false;
    var startX = 0;
    var currentDeltaX = 0;
    var activeCard = null;
    var feedbackLike = null;
    var feedbackPass = null;

    function init(discoveryItems, options) {
        cardStackEl = options.container;
        cardCounterEl = document.getElementById('cardCounter');
        onCompleteCb = options.onComplete;
        onReactionCb = options.onReaction;
        items = discoveryItems;
        currentIndex = 0;
        likes = [];
        dislikes = [];

        cardStackEl.querySelectorAll('.swipe-card').forEach(function(c) { c.remove(); });
        preloadImages();
        renderVisibleCards();
        updateCounter();
    }

    function preloadImages() {
        for (var i = 0; i < Math.min(items.length, 5); i++) {
            var img = new Image();
            img.src = items[i].url;
        }
    }

    function renderVisibleCards() {
        cardStackEl.querySelectorAll('.swipe-card').forEach(function(c) { c.remove(); });

        var count = Math.min(MAX_VISIBLE, items.length - currentIndex);
        for (var i = count - 1; i >= 0; i--) {
            var itemIdx = currentIndex + i;
            if (itemIdx >= items.length) continue;
            var card = createCardElement(items[itemIdx], itemIdx);
            cardStackEl.appendChild(card);

            if (i === 0) {
                attachPointerListeners(card);
                activeCard = card;
                feedbackLike = card.querySelector('.swipe-feedback.like');
                feedbackPass = card.querySelector('.swipe-feedback.pass');
            } else {
                var scale = 1 - (i * 0.05);
                var yOffset = i * 10;
                card.style.transform = 'scale(' + scale + ') translateY(' + yOffset + 'px)';
                card.style.zIndex = MAX_VISIBLE - i;
                card.style.pointerEvents = 'none';
            }
        }

        if (currentIndex < items.length && activeCard) {
            activeCard.style.zIndex = MAX_VISIBLE + 1;
        }
    }

    function createCardElement(item, idx) {
        var card = document.createElement('div');
        card.className = 'swipe-card';
        card.dataset.index = idx;
        card.innerHTML =
            '<div class="swipe-feedback like">LOVE</div>' +
            '<div class="swipe-feedback pass">PASS</div>' +
            '<img src="' + item.url + '" alt="' + (item.caption || '') + '" draggable="false">' +
            '<div class="swipe-card-info">' +
                '<h3>' + (item.caption || '') + '</h3>' +
                '<div class="swipe-card-actions">' +
                    '<button class="reaction-btn" data-action="tell-more">Tell me more</button>' +
                    '<button class="reaction-btn" data-action="how-much">How much?</button>' +
                    '<button class="reaction-btn" data-action="add-itinerary">Add to itinerary</button>' +
                '</div>' +
            '</div>';

        var btns = card.querySelectorAll('.reaction-btn');
        for (var b = 0; b < btns.length; b++) {
            (function(btn) {
                btn.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (onReactionCb) onReactionCb(item, btn.dataset.action);
                });
            })(btns[b]);
        }

        return card;
    }

    function attachPointerListeners(card) {
        card.addEventListener('pointerdown', onPointerDown);
    }

    function onPointerDown(e) {
        if (e.target.closest('.reaction-btn')) return;
        isDragging = true;
        startX = e.clientX;
        currentDeltaX = 0;
        activeCard = e.currentTarget;
        activeCard.setPointerCapture(e.pointerId);
        activeCard.style.transition = 'none';
        feedbackLike = activeCard.querySelector('.swipe-feedback.like');
        feedbackPass = activeCard.querySelector('.swipe-feedback.pass');

        activeCard.addEventListener('pointermove', onPointerMove);
        activeCard.addEventListener('pointerup', onPointerUp);
        activeCard.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        currentDeltaX = e.clientX - startX;
        var rotation = currentDeltaX * ROTATION_FACTOR;
        activeCard.style.transform = 'translateX(' + currentDeltaX + 'px) rotate(' + rotation + 'deg)';

        activeCard.classList.remove('glow-right', 'glow-left');
        if (currentDeltaX > 20) {
            activeCard.classList.add('glow-right');
        } else if (currentDeltaX < -20) {
            activeCard.classList.add('glow-left');
        }

        var progress = Math.min(Math.abs(currentDeltaX) / SWIPE_THRESHOLD, 1);
        if (currentDeltaX > 0 && feedbackLike) {
            feedbackLike.style.opacity = progress;
            feedbackPass.style.opacity = 0;
        } else if (currentDeltaX < 0 && feedbackPass) {
            feedbackPass.style.opacity = progress;
            feedbackLike.style.opacity = 0;
        }
    }

    function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;

        activeCard.removeEventListener('pointermove', onPointerMove);
        activeCard.removeEventListener('pointerup', onPointerUp);
        activeCard.removeEventListener('pointercancel', onPointerUp);

        if (Math.abs(currentDeltaX) >= SWIPE_THRESHOLD) {
            commitSwipe(currentDeltaX > 0 ? 'right' : 'left');
        } else {
            springBack();
        }
    }

    function commitSwipe(direction) {
        var card = activeCard;
        var item = items[currentIndex];

        if (direction === 'right') {
            likes.push(item.tags);
            card.classList.add('exit-right');
        } else {
            dislikes.push(item.tags);
            card.classList.add('exit-left');
        }

        card.addEventListener('transitionend', function handler() {
            card.removeEventListener('transitionend', handler);
            card.remove();
            currentIndex++;
            updateCounter();

            if (currentIndex >= items.length) {
                if (onCompleteCb) onCompleteCb({ likes: likes, dislikes: dislikes });
            } else {
                renderVisibleCards();
            }
        });
    }

    function springBack() {
        if (!activeCard) return;
        activeCard.classList.remove('glow-right', 'glow-left');
        activeCard.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        activeCard.style.transform = 'translateX(0) rotate(0)';
        if (feedbackLike) feedbackLike.style.opacity = 0;
        if (feedbackPass) feedbackPass.style.opacity = 0;

        activeCard.addEventListener('transitionend', function handler() {
            activeCard.removeEventListener('transitionend', handler);
            activeCard.style.transition = '';
        });
    }

    function triggerSwipe(direction) {
        if (!activeCard || currentIndex >= items.length) return;
        activeCard.style.transition = 'none';

        var targetX = direction === 'right' ? SWIPE_THRESHOLD + 50 : -(SWIPE_THRESHOLD + 50);
        var rotation = targetX * ROTATION_FACTOR;
        activeCard.style.transform = 'translateX(' + targetX + 'px) rotate(' + rotation + 'deg)';

        if (direction === 'right') {
            activeCard.classList.add('glow-right');
            if (feedbackLike) feedbackLike.style.opacity = 1;
        } else {
            activeCard.classList.add('glow-left');
            if (feedbackPass) feedbackPass.style.opacity = 1;
        }

        setTimeout(function() {
            commitSwipe(direction);
        }, 200);
    }

    function updateCounter() {
        if (!cardCounterEl) return;
        var display = Math.min(currentIndex + 1, items.length);
        cardCounterEl.textContent = display + ' / ' + items.length;
    }

    window.IslandHopper = window.IslandHopper || {};
    window.IslandHopper.SwipeEngine = {
        init: init,
        triggerSwipe: triggerSwipe,
        getResults: function() { return { likes: likes, dislikes: dislikes }; }
    };
})();
