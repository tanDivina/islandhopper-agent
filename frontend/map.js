(function() {
    'use strict';

    var mapInstance = null;
    var markersLayer = null;
    var overlayEl = null;
    var isOpen = false;

    var BOCAS_CENTER = [9.34, -82.24];
    var DEFAULT_ZOOM = 12;

    var LOCATIONS = [
        {
            name: 'Zapatilla Island',
            lat: 9.2500,
            lng: -82.0550,
            category: 'relaxation',
            icon: 'beach',
            description: 'Uninhabited white-sand paradise in the Bastimentos National Marine Park. Crystal-clear water, nesting sea turtles, and zero crowds.',
            image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop',
            activities: ['Snorkeling', 'Sunbathing', 'Turtle watching'],
            captain: 'Captain Jose'
        },
        {
            name: 'Dolphin Bay',
            lat: 9.2250,
            lng: -82.2590,
            category: 'wildlife',
            icon: 'wildlife',
            description: 'A calm, sheltered bay where pods of bottlenose dolphins play in the morning light. Best visited early before the boats arrive.',
            image: 'https://images.unsplash.com/photo-1564731071754-001b53a902fb?q=80&w=800&auto=format&fit=crop',
            activities: ['Dolphin watching', 'Kayaking', 'Photography'],
            captain: 'Captain Jose'
        },
        {
            name: 'Red Frog Beach',
            lat: 9.2440,
            lng: -82.1776,
            category: 'wildlife',
            icon: 'wildlife',
            description: 'Home to the tiny red poison dart frog. A jungle trail leads to a stunning surf beach on Bastimentos Island.',
            image: 'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?q=80&w=800&auto=format&fit=crop',
            activities: ['Frog spotting', 'Surfing', 'Jungle hiking'],
            captain: 'Guide Maria (Green Path Tours)'
        },
        {
            name: 'Starfish Beach',
            lat: 9.4052,
            lng: -82.3252,
            category: 'relaxation',
            icon: 'beach',
            description: 'Shallow turquoise waters filled with orange starfish. A must-see spot with beachside restaurants serving fresh ceviche.',
            image: 'https://images.unsplash.com/photo-1535916707207-35f97e715e1c?q=80&w=800&auto=format&fit=crop',
            activities: ['Starfish viewing', 'Snorkeling', 'Beach dining'],
            captain: 'Captain Miguel'
        },
        {
            name: 'Mangrove Island',
            lat: 9.2750,
            lng: -82.2300,
            category: 'adventure',
            icon: 'adventure',
            description: 'Snorkel through tangled mangrove roots teeming with juvenile fish, seahorses, and colorful sponges. A hidden underwater garden.',
            image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?q=80&w=800&auto=format&fit=crop',
            activities: ['Snorkeling', 'Kayaking', 'Eco tours'],
            captain: 'Captain Jose'
        },
        {
            name: 'Carenero Island',
            lat: 9.3410,
            lng: -82.2350,
            category: 'adventure',
            icon: 'adventure',
            description: 'Just a 2-minute water taxi from Bocas Town. Known for beginner-friendly surf breaks, funky bars, and a laid-back vibe.',
            image: 'https://images.unsplash.com/photo-1502680390548-bdbac40a5751?q=80&w=800&auto=format&fit=crop',
            activities: ['Surfing', 'Dining', 'Nightlife'],
            captain: 'Bocas Surf Academy (Leo)'
        },
        {
            name: 'Bastimentos Village',
            lat: 9.3290,
            lng: -82.1700,
            category: 'culture',
            icon: 'culture',
            description: 'An Afro-Caribbean village built on stilts over the water. Experience authentic local culture, reggae rhythms, and homemade coconut bread.',
            image: 'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?q=80&w=800&auto=format&fit=crop',
            activities: ['Cultural tours', 'Sloth spotting', 'Local cuisine'],
            captain: 'Guide Maria (Green Path Tours)'
        },
        {
            name: 'San San Pond Sak Wetlands',
            lat: 9.5280,
            lng: -82.5148,
            category: 'wildlife',
            icon: 'wildlife',
            description: 'A protected RAMSAR wetland on the mainland. Manatees, caimans, river otters, and over 60 bird species thrive in these freshwater lagoons.',
            image: 'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?q=80&w=800&auto=format&fit=crop',
            activities: ['Manatee watching', 'Bird watching', 'Canoe tours'],
            captain: null
        },
        {
            name: 'Monkey Island',
            lat: 9.2200,
            lng: -82.0700,
            category: 'wildlife',
            icon: 'wildlife',
            description: 'A tiny island where white-faced capuchin monkeys swing from the trees. They are accustomed to visitors and make for incredible photo opportunities.',
            image: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?q=80&w=800&auto=format&fit=crop',
            activities: ['Monkey watching', 'Photography', 'Boat tour'],
            captain: 'Captain Miguel'
        },
        {
            name: 'Cayo Coral',
            lat: 9.2433,
            lng: -82.1449,
            category: 'adventure',
            icon: 'adventure',
            description: 'A vibrant coral reef just below the surface. Snorkel among parrotfish, angelfish, and sea fans in some of the best reef in the archipelago.',
            image: 'https://images.unsplash.com/photo-1546026423-cc4642628d2b?q=80&w=800&auto=format&fit=crop',
            activities: ['Snorkeling', 'Diving', 'Glass-bottom boat'],
            captain: 'Bocas Dive Center'
        },
        {
            name: 'Finca Montezuma Chocolate Farm',
            lat: 9.2247,
            lng: -82.2591,
            category: 'culture',
            icon: 'culture',
            description: 'A family-run organic cacao farm. Learn the bean-to-bar process, taste raw cacao fruit, and sample handmade chocolate in the jungle.',
            image: 'https://images.unsplash.com/photo-1481391319762-47dff72954d9?q=80&w=800&auto=format&fit=crop',
            activities: ['Chocolate tasting', 'Farm tour', 'Indigenous culture'],
            captain: null
        }
    ];

    var CATEGORY_COLORS = {
        relaxation: '#00CED1',
        wildlife: '#4CAF50',
        adventure: '#FF6B6B',
        culture: '#D4AF37'
    };

    var CATEGORY_ICONS = {
        beach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="3"/><path d="M3 21h18l-3-9H6L3 21z"/></svg>',
        wildlife: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C7 2 3 6 3 11c0 3 1.5 5.5 4 7.5V22h10v-3.5c2.5-2 4-4.5 4-7.5 0-5-4-9-9-9z"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>',
        adventure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>',
        culture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>'
    };

    function createMarkerIcon(location) {
        var color = CATEGORY_COLORS[location.category] || '#D4AF37';
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">' +
            '<defs><filter id="s" x="-20%" y="-10%" width="140%" height="130%">' +
            '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/></filter></defs>' +
            '<path d="M18 47C18 47 33 30 33 18A15 15 0 0 0 3 18C3 30 18 47 18 47Z" ' +
            'fill="' + color + '" stroke="#061F1A" stroke-width="1.5" filter="url(#s)"/>' +
            '<circle cx="18" cy="18" r="8" fill="#061F1A" opacity="0.3"/>' +
            '<circle cx="18" cy="18" r="6" fill="white" opacity="0.9"/>' +
            '</svg>';

        return L.divIcon({
            html: '<div class="map-marker-icon">' + svg + '</div>',
            className: 'map-custom-marker',
            iconSize: [36, 48],
            iconAnchor: [18, 48],
            popupAnchor: [0, -44]
        });
    }

    function createPopupContent(location) {
        var color = CATEGORY_COLORS[location.category] || '#D4AF37';
        var activitiesHtml = '';
        for (var i = 0; i < location.activities.length; i++) {
            activitiesHtml += '<span class="map-popup-tag">' + location.activities[i] + '</span>';
        }

        var captainHtml = '';
        if (location.captain) {
            captainHtml = '<div class="map-popup-captain">' +
                '<span class="map-popup-captain-label">Local Guide:</span> ' + location.captain +
                '</div>';
        }

        return '<div class="map-popup-card">' +
            '<div class="map-popup-image-wrap">' +
                '<img src="' + location.image + '" alt="' + location.name + '" class="map-popup-image" />' +
                '<span class="map-popup-category" style="background:' + color + '">' + location.category + '</span>' +
            '</div>' +
            '<div class="map-popup-body">' +
                '<h3 class="map-popup-title">' + location.name + '</h3>' +
                '<p class="map-popup-desc">' + location.description + '</p>' +
                '<div class="map-popup-tags">' + activitiesHtml + '</div>' +
                captainHtml +
                '<button class="map-popup-ask-btn" data-location="' + location.name + '">Ask Concierge</button>' +
            '</div>' +
            '</div>';
    }

    function initMap() {
        if (mapInstance) return;

        overlayEl = document.getElementById('mapOverlay');
        var mapContainer = document.getElementById('mapContainer');
        if (!mapContainer) return;

        mapInstance = L.map(mapContainer, {
            center: BOCAS_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false,
            attributionControl: false
        });

        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

        L.control.attribution({ position: 'bottomleft', prefix: false })
            .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>')
            .addTo(mapInstance);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(mapInstance);

        markersLayer = L.layerGroup().addTo(mapInstance);
        addMarkers('all');
        bindFilterButtons();
        bindPopupEvents();
    }

    function addMarkers(category) {
        markersLayer.clearLayers();

        for (var i = 0; i < LOCATIONS.length; i++) {
            var loc = LOCATIONS[i];
            if (category !== 'all' && loc.category !== category) continue;

            var marker = L.marker([loc.lat, loc.lng], {
                icon: createMarkerIcon(loc)
            });

            marker.bindPopup(createPopupContent(loc), {
                maxWidth: 320,
                minWidth: 280,
                className: 'map-custom-popup',
                closeButton: true,
                autoPan: true,
                autoPanPaddingTopLeft: [20, 80],
                autoPanPaddingBottomRight: [20, 20]
            });

            markersLayer.addLayer(marker);
        }
    }

    function bindFilterButtons() {
        var filterBar = document.getElementById('mapFilterBar');
        if (!filterBar) return;

        filterBar.addEventListener('click', function(e) {
            var btn = e.target.closest('.map-filter-btn');
            if (!btn) return;

            var btns = filterBar.querySelectorAll('.map-filter-btn');
            for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
            btn.classList.add('active');

            addMarkers(btn.dataset.filter);
        });
    }

    function bindPopupEvents() {
        mapInstance.on('popupopen', function() {
            setTimeout(function() {
                var askBtns = document.querySelectorAll('.map-popup-ask-btn');
                for (var i = 0; i < askBtns.length; i++) {
                    askBtns[i].onclick = function() {
                        var locationName = this.getAttribute('data-location');
                        close();
                        if (typeof askConcierge === 'function') {
                            askConcierge('Tell me everything about ' + locationName + ' in Bocas del Toro. What can I do there, how do I get there, and what should I know?');
                        }
                    };
                }
            }, 50);
        });
    }

    function open() {
        if (isOpen) return;
        isOpen = true;
        if (!overlayEl) overlayEl = document.getElementById('mapOverlay');
        if (!overlayEl) return;

        overlayEl.classList.add('active');

        if (!mapInstance) {
            initMap();
        }

        setTimeout(function() {
            if (mapInstance) mapInstance.invalidateSize();
        }, 350);
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        if (overlayEl) overlayEl.classList.remove('active');
    }

    function toggle() {
        if (isOpen) close();
        else open();
    }

    window.IslandHopper = window.IslandHopper || {};
    window.IslandHopper.Map = {
        init: initMap,
        open: open,
        close: close,
        toggle: toggle,
        getLocations: function() { return LOCATIONS; }
    };
})();
