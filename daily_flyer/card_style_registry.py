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
"""


MODULAR_CARD_STYLE_JS = f"""
(function () {{
    const assignments = {json.dumps(CARD_STYLE_ASSIGNMENTS, sort_keys=True)};
    const surfaces = {json.dumps(sorted(CARD_SURFACES), sort_keys=True)};
    const frames = {json.dumps(sorted(CARD_FRAMES), sort_keys=True)};
    const motions = {json.dumps(sorted(CARD_MOTIONS), sort_keys=True)};

    function currentStyle() {{
        const params = new URLSearchParams(window.location.search || '');
        return (params.get('style') || document.documentElement.getAttribute('data-visual-lab-style') || '').toLowerCase();
    }}

    function removeModularClasses(card) {{
        surfaces.forEach((key) => card.classList.remove('df-card-surface-' + key));
        frames.forEach((key) => card.classList.remove('df-card-frame-' + key));
        motions.forEach((key) => card.classList.remove('df-card-motion-' + key));
        delete card.dataset.dfCardSurface;
        delete card.dataset.dfCardFrame;
        delete card.dataset.dfCardMotion;
        delete card.dataset.dfCardStyleReady;
    }}

    function applyAssignment(card, assignment) {{
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
    }}

    function legacyStyleKeyForCard(card, pageStyle) {{
        if ((pageStyle === 'sample' || pageStyle === 'strict_sample') && card.dataset.visualCardStyle) {{
            return card.dataset.visualCardStyle;
        }}
        if (assignments[pageStyle]) return pageStyle;
        return '';
    }}

    function applyModularCardStyles() {{
        const pageStyle = currentStyle();
        document.querySelectorAll('main > .card').forEach((card) => {{
            const key = legacyStyleKeyForCard(card, pageStyle);
            if (!key || !assignments[key]) {{
                removeModularClasses(card);
                return;
            }}
            applyAssignment(card, assignments[key]);
        }});
    }}

    function scheduleApply() {{
        applyModularCardStyles();
        window.setTimeout(applyModularCardStyles, 120);
    }}

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
