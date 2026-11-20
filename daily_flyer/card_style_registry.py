from __future__ import annotations

import json


CARD_SURFACES = {
    "paper": "Warm paper surface",
    "glass": "Translucent glass surface",
    "broadcast": "Sports broadcast surface",
    "museum": "Dark museum surface",
    "watercolor": "Soft translucent watercolor surface",
    "newsroom": "Light print/newsroom surface",
    "neon": "Dark neon surface",
    "terminal": "Command-console surface",
    "dark_panel": "Plain dark motion-test surface",
    "book": "Book/page surface",
}

CARD_FRAMES = {
    "soft": "Default soft card frame",
    "rounded_glass": "Large rounded glass frame",
    "sticker": "Sticker-like white border frame",
    "square_print": "Hard-edged print frame",
    "terminal_panel": "Hard rectangular terminal frame",
    "organic": "Organic rounded watercolor frame",
    "neon_panel": "Rounded neon panel frame",
    "hinged_panel": "Top-hinged panel frame",
    "flipbook_spine": "Left-spine page/card frame",
}

CARD_MOTIONS = {
    "none": "No motion",
    "drift": "Slow floating/breathing motion",
    "hinge": "Top-hinged entrance and hover",
    "spotlight": "Mouse-tracked spotlight/tilt",
    "cascade": "Physical panel entrance and offset hover",
    "flipbook": "Page/card-face motion",
}

# Temporary bridge from current visual-lab style names to modular card classes.
# This is intentionally theme-agnostic: any theme can eventually assign these same
# surface/frame/motion triples without knowing about Irish Today.
CARD_STYLE_ASSIGNMENTS = {
    "paper": {"surface": "paper", "frame": "soft", "motion": "none"},
    "glass": {"surface": "glass", "frame": "rounded_glass", "motion": "none"},
    "broadcast": {"surface": "broadcast", "frame": "soft", "motion": "none"},
    "museum": {"surface": "museum", "frame": "soft", "motion": "none"},
    "sticker": {"surface": "paper", "frame": "sticker", "motion": "none"},
    "watercolor": {"surface": "watercolor", "frame": "organic", "motion": "none"},
    "newsroom": {"surface": "newsroom", "frame": "square_print", "motion": "none"},
    "neon": {"surface": "neon", "frame": "neon_panel", "motion": "none"},
    "terminal": {"surface": "terminal", "frame": "terminal_panel", "motion": "none"},
    "drift": {"surface": "dark_panel", "frame": "soft", "motion": "drift"},
    "hinge": {"surface": "dark_panel", "frame": "hinged_panel", "motion": "hinge"},
    "spotlight": {"surface": "dark_panel", "frame": "soft", "motion": "spotlight"},
    "cascade": {"surface": "newsroom", "frame": "square_print", "motion": "cascade"},
    "flipbook": {"surface": "book", "frame": "flipbook_spine", "motion": "flipbook"},
}

STRICT_SAMPLE_SURFACE_FRAME_KEYS = sorted(CARD_STYLE_ASSIGNMENTS)
STRICT_SAMPLE_MOTION_KEYS = sorted(key for key in CARD_MOTIONS if key != "none")


MODULAR_CARD_STYLE_CSS = r"""
/* Modular card style layer.

   These df-card-* classes are the beginning of the cross-theme card styling API.
   For now, the Irish Today visual lab emits them alongside its older it-card-style-*
   classes. Later, any theme can assign these classes directly.

   Class families:
     df-card-surface-*  = material/color/texture
     df-card-frame-*    = border/shape/frame treatment
     df-card-motion-*   = animation/interaction behavior
*/
.card[data-df-card-style-ready="true"] {
    --df-card-surface: initial;
    --df-card-frame: initial;
    --df-card-motion: none;
}

.df-card-motion-none { --df-card-motion: none; }
.df-card-motion-drift { --df-card-motion: drift; }
.df-card-motion-hinge { --df-card-motion: hinge; }
.df-card-motion-spotlight { --df-card-motion: spotlight; }
.df-card-motion-cascade { --df-card-motion: cascade; }
.df-card-motion-flipbook { --df-card-motion: flipbook; }

.df-card-frame-sticker { --df-card-frame: sticker; }
.df-card-frame-square_print { --df-card-frame: square_print; }
.df-card-frame-terminal_panel { --df-card-frame: terminal_panel; }
.df-card-frame-flipbook_spine { --df-card-frame: flipbook_spine; }
.df-card-frame-rounded_glass { --df-card-frame: rounded_glass; }
.df-card-frame-organic { --df-card-frame: organic; }
.df-card-frame-hinged_panel { --df-card-frame: hinged_panel; }
.df-card-frame-neon_panel { --df-card-frame: neon_panel; }
.df-card-frame-soft { --df-card-frame: soft; }

.df-card-surface-paper { --df-card-surface: paper; }
.df-card-surface-glass { --df-card-surface: glass; }
.df-card-surface-broadcast { --df-card-surface: broadcast; }
.df-card-surface-museum { --df-card-surface: museum; }
.df-card-surface-watercolor { --df-card-surface: watercolor; }
.df-card-surface-newsroom { --df-card-surface: newsroom; }
.df-card-surface-neon { --df-card-surface: neon; }
.df-card-surface-terminal { --df-card-surface: terminal; }
.df-card-surface-dark_panel { --df-card-surface: dark_panel; }
.df-card-surface-book { --df-card-surface: book; }

/* Surface/frame implementations. These intentionally remain generic enough that
   any future theme can use the same class families without knowing about Irish Today. */
main > .card[data-df-card-style-ready="true"].df-card-surface-paper {
    background: repeating-linear-gradient(0deg, rgba(78,55,24,0.04) 0 1px, transparent 1px 7px), rgba(255,247,225,0.92) !important;
    color: #172018 !important;
    border-color: rgba(78,55,24,0.28) !important;
}
main > .card[data-df-card-style-ready="true"].df-card-surface-paper .body { color: #314336 !important; }

main > .card[data-df-card-style-ready="true"].df-card-surface-glass {
    background: linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045)), rgba(6,20,28,0.68) !important;
    border-color: rgba(255,255,255,0.24) !important;
    color: #ecf6f3 !important;
}

main > .card[data-df-card-style-ready="true"].df-card-surface-broadcast {
    background: repeating-linear-gradient(90deg, rgba(255,255,255,0.032) 0 2px, transparent 2px 28px), rgba(5,33,22,0.90) !important;
    border-color: rgba(53,233,133,0.30) !important;
    color: #f4fff8 !important;
}

main > .card[data-df-card-style-ready="true"].df-card-surface-museum {
    background: rgba(18,16,15,0.92) !important;
    border-color: rgba(214,184,128,0.24) !important;
    color: #f7efe0 !important;
}

main > .card[data-df-card-style-ready="true"].df-card-surface-watercolor {
    background: rgba(255,255,252,0.78) !important;
    border-color: rgba(72,132,127,0.24) !important;
    color: #163238 !important;
}
main > .card[data-df-card-style-ready="true"].df-card-surface-watercolor .body { color: #37565d !important; }

main > .card[data-df-card-style-ready="true"].df-card-surface-newsroom {
    background: #fffdf7 !important;
    border-color: #111 !important;
    color: #111 !important;
}
main > .card[data-df-card-style-ready="true"].df-card-surface-newsroom .body { color: #343434 !important; }

main > .card[data-df-card-style-ready="true"].df-card-surface-neon {
    background: rgba(9,9,31,0.90) !important;
    border-color: rgba(83,232,255,0.28) !important;
    color: #f7fbff !important;
    box-shadow: 0 0 42px rgba(83,232,255,0.13), 0 28px 70px rgba(0,0,0,0.34) !important;
}

main > .card[data-df-card-style-ready="true"].df-card-surface-terminal {
    background: rgba(1,8,5,0.94) !important;
    border-color: rgba(78,255,139,0.30) !important;
    color: #d8ffe7 !important;
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important;
}
main > .card[data-df-card-style-ready="true"].df-card-surface-terminal h2,
main > .card[data-df-card-style-ready="true"].df-card-surface-terminal .body {
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace !important;
}

main > .card[data-df-card-style-ready="true"].df-card-surface-dark_panel {
    background: rgba(10,25,19,0.90) !important;
    border-color: rgba(181,228,196,0.22) !important;
    color: #ecf6f3 !important;
}

main > .card[data-df-card-style-ready="true"].df-card-surface-book {
    background: #241f19 !important;
    border-color: rgba(255,255,255,0.14) !important;
    color: #f7efe0 !important;
}

main > .card[data-df-card-style-ready="true"].df-card-frame-soft { border-radius: 22px !important; }
main > .card[data-df-card-style-ready="true"].df-card-frame-rounded_glass { border-radius: 34px !important; }
main > .card[data-df-card-style-ready="true"].df-card-frame-sticker {
    border-radius: 30px 18px 34px 20px !important;
    border-width: 3px !important;
    border-color: rgba(255,255,255,0.76) !important;
    box-shadow: 0 14px 0 rgba(0,0,0,0.18), 0 24px 56px rgba(0,0,0,0.32) !important;
}
main > .card[data-df-card-style-ready="true"].df-card-frame-square_print {
    border-radius: 0 !important;
    border: 2px solid #111 !important;
    box-shadow: 8px 8px 0 rgba(17,17,17,0.14) !important;
}
main > .card[data-df-card-style-ready="true"].df-card-frame-terminal_panel {
    border-radius: 0 !important;
    border: 1px solid rgba(78,255,139,0.30) !important;
}
main > .card[data-df-card-style-ready="true"].df-card-frame-organic { border-radius: 38px 28px 44px 30px !important; }
main > .card[data-df-card-style-ready="true"].df-card-frame-neon_panel { border-radius: 24px !important; }
main > .card[data-df-card-style-ready="true"].df-card-frame-hinged_panel {
    border-radius: 6px !important;
    transform-origin: top center !important;
}
main > .card[data-df-card-style-ready="true"].df-card-frame-flipbook_spine {
    border-radius: 10px 26px 26px 10px !important;
    border-left: 10px solid rgba(255,255,255,0.18) !important;
    box-shadow: 22px 22px 50px rgba(0,0,0,0.28), inset 8px 0 18px rgba(0,0,0,0.22) !important;
    transform-origin: left center !important;
}

@keyframes df-card-drift {
    0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
    50% { transform: translate3d(0, -10px, 0) rotate(-0.25deg); }
}

@keyframes df-card-hinge-in {
    from { opacity: 0; transform: perspective(900px) rotateX(-16deg) translateY(-18px); transform-origin: top center; }
    to { opacity: 1; transform: perspective(900px) rotateX(0deg) translateY(0); transform-origin: top center; }
}

@keyframes df-card-cascade-in {
    from { opacity: 0; transform: translate3d(-28px, 22px, 0) rotate(-1.2deg); }
    to { opacity: 1; transform: translate3d(0, 0, 0) rotate(0); }
}

@keyframes df-card-flipbook-breathe {
    0%, 100% { transform: perspective(1200px) rotateY(0deg); }
    50% { transform: perspective(1200px) rotateY(-1.4deg); }
}

@media (min-width: 981px) {
    main > .card.df-card-motion-drift {
        animation: df-card-drift 5.6s ease-in-out infinite !important;
    }
    main > .card.df-card-motion-drift:nth-of-type(2n) { animation-delay: -1.7s !important; }
    main > .card.df-card-motion-drift:nth-of-type(3n) { animation-delay: -3.1s !important; }

    main > .card.df-card-motion-hinge {
        animation: df-card-hinge-in 680ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
        transform-origin: top center !important;
    }
    main > .card.df-card-motion-hinge:hover,
    main > .card.df-card-motion-hinge:focus-within {
        transform: perspective(900px) rotateX(4deg) translateY(-4px) !important;
    }

    main > .card.df-card-motion-spotlight::before {
        background: radial-gradient(circle at var(--df-card-mx, 50%) var(--df-card-my, 50%), rgba(255,255,255,0.22), transparent 9rem) !important;
        opacity: 1 !important;
    }
    main > .card.df-card-motion-spotlight:hover,
    main > .card.df-card-motion-spotlight:focus-within {
        transform: translateY(-3px) rotateX(var(--df-card-tilt-y, 0deg)) rotateY(var(--df-card-tilt-x, 0deg)) !important;
    }

    main > .card.df-card-motion-cascade {
        animation: df-card-cascade-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
    }
    main > .card.df-card-motion-cascade:nth-of-type(2n) { animation-delay: 90ms !important; }
    main > .card.df-card-motion-cascade:nth-of-type(3n) { animation-delay: 180ms !important; }
    main > .card.df-card-motion-cascade:hover,
    main > .card.df-card-motion-cascade:focus-within {
        transform: translate(-3px, -3px) !important;
        box-shadow: 14px 14px 0 rgba(0,0,0,0.20) !important;
    }

    main > .card.df-card-motion-flipbook {
        animation: df-card-flipbook-breathe 4.8s ease-in-out infinite !important;
        transform-origin: left center !important;
    }
    main > .card.df-card-motion-flipbook:hover,
    main > .card.df-card-motion-flipbook:focus-within {
        transform: perspective(1200px) rotateY(-6deg) translateX(4px) !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    main > .card[class*="df-card-motion-"] {
        animation: none !important;
        transform: none !important;
    }
}

.it-card-debug-panel {
    position: fixed;
    z-index: 9999;
    left: 50%;
    bottom: 5.2rem;
    transform: translateX(-50%);
    width: min(96vw, 72rem);
    max-height: min(58vh, 38rem);
    display: none;
    overflow: auto;
    padding: 0.7rem;
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,0.16);
    background: rgba(4, 14, 12, 0.94);
    color: #f4fff8;
    box-shadow: 0 22px 70px rgba(0,0,0,0.46);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
}
html[data-visual-lab-style="custom_cards"] .it-card-debug-panel,
body[data-visual-lab-style="custom_cards"] .it-card-debug-panel { display: block; }
.it-card-debug-panel h3 { margin: 0 0 0.2rem; font-size: 0.95rem; }
.it-card-debug-note { margin: 0 0 0.65rem; color: rgba(244,255,248,0.72); font-size: 0.78rem; line-height: 1.4; }
.it-card-debug-grid { display: grid; gap: 0.45rem; }
.it-card-debug-row {
    display: grid;
    grid-template-columns: minmax(9rem, 1.35fr) repeat(3, minmax(7rem, 1fr));
    gap: 0.4rem;
    align-items: center;
    padding: 0.45rem;
    border-radius: 14px;
    background: rgba(255,255,255,0.055);
    border: 1px solid rgba(255,255,255,0.08);
}
.it-card-debug-title { min-width: 0; font-size: 0.76rem; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.it-card-debug-row select {
    width: 100%;
    border: 1px solid rgba(255,255,255,0.13);
    border-radius: 10px;
    padding: 0.42rem 0.48rem;
    background: rgba(0,0,0,0.34);
    color: #f4fff8;
    font: inherit;
    font-size: 0.75rem;
}
.it-card-debug-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; }
.it-card-debug-actions button {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 999px;
    padding: 0.5rem 0.7rem;
    background: rgba(255,255,255,0.08);
    color: #f4fff8;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 850;
    cursor: pointer;
}
.it-card-debug-actions button:hover,
.it-card-debug-actions button:focus-visible { background: rgba(255,255,255,0.92); color: #092016; }
@media (max-width: 720px) {
    .it-card-debug-panel { bottom: 8.2rem; }
    .it-card-debug-row { grid-template-columns: 1fr; }
}
"""


MODULAR_CARD_STYLE_JS = f"""
(function () {{
    const assignments = {json.dumps(CARD_STYLE_ASSIGNMENTS, sort_keys=True)};
    const strictSampleSurfaceFrameKeys = {json.dumps(STRICT_SAMPLE_SURFACE_FRAME_KEYS, sort_keys=True)};
    const strictSampleMotionKeys = {json.dumps(STRICT_SAMPLE_MOTION_KEYS, sort_keys=True)};
    const surfaces = {json.dumps(sorted(CARD_SURFACES), sort_keys=True)};
    const frames = {json.dumps(sorted(CARD_FRAMES), sort_keys=True)};
    const motions = {json.dumps(sorted(CARD_MOTIONS), sort_keys=True)};
    const surfaceLabels = {json.dumps(CARD_SURFACES, sort_keys=True)};
    const frameLabels = {json.dumps(CARD_FRAMES, sort_keys=True)};
    const motionLabels = {json.dumps(CARD_MOTIONS, sort_keys=True)};

    function currentStyle() {{
        const params = new URLSearchParams(window.location.search || '');
        return (params.get('style') || document.documentElement.getAttribute('data-visual-lab-style') || '').toLowerCase();
    }}

    function syncDocumentStyleFromUrl() {{
        const style = currentStyle();
        if (style === 'custom_cards') {{
            document.documentElement.setAttribute('data-visual-lab-style', style);
            if (document.body) document.body.setAttribute('data-visual-lab-style', style);
        }}
    }}

    function hashString(value) {{
        let hash = 2166136261;
        for (let i = 0; i < value.length; i += 1) {{
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }}
        return hash >>> 0;
    }}

    function seededShuffle(items, seedText) {{
        let seed = hashString(seedText || 'df-card-style');
        const deck = items.slice();
        function next() {{
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }}
        for (let i = deck.length - 1; i > 0; i -= 1) {{
            const j = Math.floor(next() * (i + 1));
            const tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }}
        return deck;
    }}

    function sampleSeed() {{
        const params = new URLSearchParams(window.location.search || '');
        const date = params.get('date') || '';
        const seed = params.get('seed') || '';
        const heroDate = document.querySelector('.hero-pill') ? document.querySelector('.hero-pill').textContent : '';
        return [date, seed, heroDate].join('|');
    }}

    function validOr(value, allowed, fallback) {{
        return allowed.indexOf(value) >= 0 ? value : fallback;
    }}

    function encodeCardAssignment(assignment) {{
        return [assignment.surface, assignment.frame, assignment.motion].join('.');
    }}

    function parseCardAssignment(value, fallback) {{
        const parts = (value || '').split('.');
        return {{
            surface: validOr(parts[0], surfaces, fallback.surface || 'paper'),
            frame: validOr(parts[1], frames, fallback.frame || 'soft'),
            motion: validOr(parts[2], motions, fallback.motion || 'none')
        }};
    }}

    function removeModularClasses(card) {{
        surfaces.forEach((key) => card.classList.remove('df-card-surface-' + key));
        frames.forEach((key) => card.classList.remove('df-card-frame-' + key));
        motions.forEach((key) => card.classList.remove('df-card-motion-' + key));
        delete card.dataset.dfCardSurface;
        delete card.dataset.dfCardFrame;
        delete card.dataset.dfCardMotion;
        delete card.dataset.dfCardStyleReady;
        delete card.dataset.dfCardSurfaceFrameSource;
    }}

    function applyAssignment(card, assignment, sourceKey) {{
        if (!assignment) return;
        removeModularClasses(card);
        const surface = assignment.surface || 'paper';
        const frame = assignment.frame || 'soft';
        const motion = assignment.motion || 'none';
        card.classList.add('df-card-surface-' + surface);
        card.classList.add('df-card-frame-' + frame);
        card.classList.add('df-card-motion-' + motion);
        card.dataset.dfCardSurface = surface;
        card.dataset.dfCardFrame = frame;
        card.dataset.dfCardMotion = motion;
        card.dataset.dfCardStyleReady = 'true';
        if (sourceKey) card.dataset.dfCardSurfaceFrameSource = sourceKey;
    }}

    function legacyStyleKeyForCard(card, pageStyle) {{
        if ((pageStyle === 'sample' || pageStyle === 'strict_sample') && card.dataset.visualCardStyle) {{
            return card.dataset.visualCardStyle;
        }}
        if (assignments[pageStyle]) return pageStyle;
        return '';
    }}

    function strictSampleAssignmentForCard(card, index) {{
        const seed = sampleSeed();
        const surfaceFrameDeck = seededShuffle(strictSampleSurfaceFrameKeys, seed + '|strict-sample|surface-frame');
        const motionDeck = seededShuffle(strictSampleMotionKeys, seed + '|strict-sample|motion');
        const visualKey = card.dataset.visualCardStyle && assignments[card.dataset.visualCardStyle]
            ? card.dataset.visualCardStyle
            : surfaceFrameDeck[index % surfaceFrameDeck.length];
        const sourceAssignment = assignments[visualKey] || assignments.paper;
        const motion = motionDeck[index % motionDeck.length] || 'drift';
        return {{
            sourceKey: visualKey,
            assignment: {{
                surface: sourceAssignment.surface || 'paper',
                frame: sourceAssignment.frame || 'soft',
                motion: motion
            }}
        }};
    }}

    function defaultCustomAssignmentForCard(index) {{
        const seed = sampleSeed();
        const surfaceFrameDeck = seededShuffle(strictSampleSurfaceFrameKeys, seed + '|custom-cards|surface-frame');
        const motionDeck = seededShuffle(motions, seed + '|custom-cards|motion');
        const visualKey = surfaceFrameDeck[index % surfaceFrameDeck.length];
        const sourceAssignment = assignments[visualKey] || assignments.paper;
        return {{
            surface: sourceAssignment.surface || 'paper',
            frame: sourceAssignment.frame || 'soft',
            motion: motionDeck[index % motionDeck.length] || 'none'
        }};
    }}

    function customAssignmentForCard(index) {{
        const params = new URLSearchParams(window.location.search || '');
        const fallback = defaultCustomAssignmentForCard(index);
        return parseCardAssignment(params.get('c' + (index + 1)), fallback);
    }}

    function applyModularCardStyles() {{
        syncDocumentStyleFromUrl();
        const pageStyle = currentStyle();
        document.querySelectorAll('main > .card').forEach((card, index) => {{
            if (pageStyle === 'custom_cards') {{
                applyAssignment(card, customAssignmentForCard(index), 'custom_cards');
                return;
            }}

            if (pageStyle === 'strict_sample') {{
                const strictAssignment = strictSampleAssignmentForCard(card, index);
                applyAssignment(card, strictAssignment.assignment, strictAssignment.sourceKey);
                return;
            }}

            const key = legacyStyleKeyForCard(card, pageStyle);
            if (!key || !assignments[key]) {{
                removeModularClasses(card);
                return;
            }}
            applyAssignment(card, assignments[key], key);
        }});
    }}

    function makeSelect(options, value, labelMap) {{
        const select = document.createElement('select');
        options.forEach((key) => {{
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key.replace(/_/g, ' ') + (labelMap && labelMap[key] ? ' — ' + labelMap[key] : '');
            if (key === value) option.selected = true;
            select.appendChild(option);
        }});
        return select;
    }}

    function cardLabel(card, index) {{
        const title = card.querySelector('h2') ? card.querySelector('h2').textContent.trim() : '';
        const eyebrow = card.querySelector('.eyebrow') ? card.querySelector('.eyebrow').textContent.trim() : '';
        return 'Card ' + (index + 1) + (eyebrow ? ' • ' + eyebrow : '') + (title ? ' • ' + title : '');
    }}

    function mountCustomCardsPanel() {{
        if (document.querySelector('.it-card-debug-panel')) return;
        const panel = document.createElement('section');
        panel.className = 'it-card-debug-panel';
        panel.setAttribute('aria-label', 'Per-card visual debug controls');
        panel.innerHTML = '<h3>Per-card visual controls</h3><p class="it-card-debug-note">Debug only. Each row writes compact URL params such as c1=glass.rounded_glass.drift. Use Apply URL + reload for a clean refresh, or Apply now for quick testing.</p>';

        const grid = document.createElement('div');
        grid.className = 'it-card-debug-grid';
        const rows = [];
        document.querySelectorAll('main > .card').forEach((card, index) => {{
            const assignment = customAssignmentForCard(index);
            const row = document.createElement('div');
            row.className = 'it-card-debug-row';
            row.dataset.cardIndex = String(index + 1);
            const title = document.createElement('div');
            title.className = 'it-card-debug-title';
            title.textContent = cardLabel(card, index);
            title.title = title.textContent;
            const surfaceSelect = makeSelect(surfaces, assignment.surface, surfaceLabels);
            const frameSelect = makeSelect(frames, assignment.frame, frameLabels);
            const motionSelect = makeSelect(motions, assignment.motion, motionLabels);
            surfaceSelect.dataset.kind = 'surface';
            frameSelect.dataset.kind = 'frame';
            motionSelect.dataset.kind = 'motion';
            row.appendChild(title);
            row.appendChild(surfaceSelect);
            row.appendChild(frameSelect);
            row.appendChild(motionSelect);
            grid.appendChild(row);
            rows.push({{ index, row, surfaceSelect, frameSelect, motionSelect }});
        }});
        panel.appendChild(grid);

        function writeUrlFromControls(reload) {{
            const url = new URL(window.location.href);
            url.searchParams.set('style', 'custom_cards');
            rows.forEach((entry) => {{
                const assignment = {{
                    surface: entry.surfaceSelect.value,
                    frame: entry.frameSelect.value,
                    motion: entry.motionSelect.value
                }};
                url.searchParams.set('c' + (entry.index + 1), encodeCardAssignment(assignment));
            }});
            if (reload) window.location.href = url.toString();
            else {{
                window.history.replaceState({{}}, '', url.toString());
                document.documentElement.setAttribute('data-visual-lab-style', 'custom_cards');
                if (document.body) document.body.setAttribute('data-visual-lab-style', 'custom_cards');
                applyModularCardStyles();
            }}
        }}

        const actions = document.createElement('div');
        actions.className = 'it-card-debug-actions';
        const applyNow = document.createElement('button');
        applyNow.type = 'button';
        applyNow.textContent = 'Apply now';
        applyNow.addEventListener('click', () => writeUrlFromControls(false));
        const applyReload = document.createElement('button');
        applyReload.type = 'button';
        applyReload.textContent = 'Apply URL + reload';
        applyReload.addEventListener('click', () => writeUrlFromControls(true));
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Reset card params';
        reset.addEventListener('click', () => {{
            const url = new URL(window.location.href);
            Array.from(url.searchParams.keys()).forEach((key) => {{ if (/^c\d+$/.test(key)) url.searchParams.delete(key); }});
            url.searchParams.set('style', 'custom_cards');
            window.location.href = url.toString();
        }});
        actions.appendChild(applyNow);
        actions.appendChild(applyReload);
        actions.appendChild(reset);
        panel.appendChild(actions);
        document.body.appendChild(panel);
    }}

    function scheduleApply() {{
        syncDocumentStyleFromUrl();
        applyModularCardStyles();
        if (currentStyle() === 'custom_cards') mountCustomCardsPanel();
        window.setTimeout(() => {{
            applyModularCardStyles();
            if (currentStyle() === 'custom_cards') mountCustomCardsPanel();
        }}, 120);
    }}

    document.addEventListener('pointermove', function (event) {{
        const card = event.target && event.target.closest ? event.target.closest('.card.df-card-motion-spotlight') : null;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
        const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
        card.style.setProperty('--df-card-mx', x.toFixed(2) + '%');
        card.style.setProperty('--df-card-my', y.toFixed(2) + '%');
        card.style.setProperty('--df-card-tilt-x', ((x - 50) / 20).toFixed(2) + 'deg');
        card.style.setProperty('--df-card-tilt-y', ((50 - y) / 24).toFixed(2) + 'deg');
    }}, {{ passive: true }});

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApply);
    else scheduleApply();

    const observer = new MutationObserver(() => {{
        applyModularCardStyles();
        if (currentStyle() === 'custom_cards') mountCustomCardsPanel();
    }});
    if (document.documentElement) {{
        observer.observe(document.documentElement, {{ attributes: true, attributeFilter: ['data-visual-lab-style'] }});
    }}
    if (document.body) {{
        observer.observe(document.body, {{ attributes: true, attributeFilter: ['data-visual-lab-style'] }});
    }}
    window.addEventListener('popstate', scheduleApply);
}})();
"""
