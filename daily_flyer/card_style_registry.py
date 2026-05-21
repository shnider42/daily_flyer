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
"""


MODULAR_CARD_STYLE_JS = f"""
(function () {{
    const assignments = {json.dumps(CARD_STYLE_ASSIGNMENTS, sort_keys=True)};
    const strictSampleSurfaceFrameKeys = {json.dumps(STRICT_SAMPLE_SURFACE_FRAME_KEYS, sort_keys=True)};
    const strictSampleMotionKeys = {json.dumps(STRICT_SAMPLE_MOTION_KEYS, sort_keys=True)};
    const surfaces = {json.dumps(sorted(CARD_SURFACES), sort_keys=True)};
    const frames = {json.dumps(sorted(CARD_FRAMES), sort_keys=True)};
    const motions = {json.dumps(sorted(CARD_MOTIONS), sort_keys=True)};

    function currentStyle() {{
        const params = new URLSearchParams(window.location.search || '');
        return (params.get('style') || document.documentElement.getAttribute('data-visual-lab-style') || '').toLowerCase();
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

    function applyModularCardStyles() {{
        const pageStyle = currentStyle();
        document.querySelectorAll('main > .card').forEach((card, index) => {{
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

    function scheduleApply() {{
        applyModularCardStyles();
        window.setTimeout(applyModularCardStyles, 120);
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

    const observer = new MutationObserver(() => applyModularCardStyles());
    if (document.documentElement) {{
        observer.observe(document.documentElement, {{ attributes: true, attributeFilter: ['data-visual-lab-style'] }});
    }}
    if (document.body) {{
        observer.observe(document.body, {{ attributes: true, attributeFilter: ['data-visual-lab-style'] }});
    }}
    window.addEventListener('popstate', scheduleApply);
}})();
"""
