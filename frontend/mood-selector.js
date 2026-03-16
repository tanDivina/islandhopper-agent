(function() {
    'use strict';

    var selectedMoods = [];
    var selectedCategories = ['all'];
    var onCompleteCb = null;

    function init(options) {
        onCompleteCb = options.onComplete;
        selectedMoods = [];
        selectedCategories = ['all'];
        bindMoodChips();
        bindFilterChips();
        bindContinueButtons();
    }

    function bindMoodChips() {
        var chips = document.querySelectorAll('.mood-chip');
        for (var i = 0; i < chips.length; i++) {
            (function(chip) {
                chip.onclick = function() {
                    chip.classList.toggle('selected');
                    var mood = chip.dataset.mood;
                    var idx = selectedMoods.indexOf(mood);
                    if (idx > -1) {
                        selectedMoods.splice(idx, 1);
                    } else {
                        selectedMoods.push(mood);
                    }
                    document.getElementById('moodContinueBtn').disabled = selectedMoods.length === 0;
                };
            })(chips[i]);
        }
    }

    function bindFilterChips() {
        var chips = document.querySelectorAll('.filter-chip');
        for (var i = 0; i < chips.length; i++) {
            (function(chip) {
                chip.onclick = function() {
                    var cat = chip.dataset.category;
                    if (cat === 'all') {
                        var allChips = document.querySelectorAll('.filter-chip');
                        for (var j = 0; j < allChips.length; j++) allChips[j].classList.remove('active');
                        chip.classList.add('active');
                        selectedCategories = ['all'];
                    } else {
                        document.querySelector('.filter-chip[data-category="all"]').classList.remove('active');
                        chip.classList.toggle('active');
                        selectedCategories = [];
                        var activeChips = document.querySelectorAll('.filter-chip.active');
                        for (var k = 0; k < activeChips.length; k++) {
                            selectedCategories.push(activeChips[k].dataset.category);
                        }
                        if (selectedCategories.length === 0) {
                            document.querySelector('.filter-chip[data-category="all"]').classList.add('active');
                            selectedCategories = ['all'];
                        }
                    }
                };
            })(chips[i]);
        }
    }

    function bindContinueButtons() {
        document.getElementById('moodContinueBtn').addEventListener('click', function() {
            document.getElementById('moodSelector').style.display = 'none';
            document.getElementById('categoryFilters').style.display = 'flex';
        });

        document.getElementById('filterStartBtn').addEventListener('click', function() {
            document.getElementById('categoryFilters').style.display = 'none';
            if (onCompleteCb) {
                onCompleteCb({
                    moods: selectedMoods,
                    categories: selectedCategories
                });
            }
        });
    }

    function resetUI() {
        var moodChips = document.querySelectorAll('.mood-chip');
        for (var i = 0; i < moodChips.length; i++) moodChips[i].classList.remove('selected');
        document.getElementById('moodContinueBtn').disabled = true;

        var filterChips = document.querySelectorAll('.filter-chip');
        for (var j = 0; j < filterChips.length; j++) filterChips[j].classList.remove('active');
        document.querySelector('.filter-chip[data-category="all"]').classList.add('active');

        selectedMoods = [];
        selectedCategories = ['all'];
    }

    window.IslandHopper = window.IslandHopper || {};
    window.IslandHopper.MoodSelector = {
        init: init,
        getSelections: function() { return { moods: selectedMoods, categories: selectedCategories }; },
        resetUI: resetUI
    };
})();
