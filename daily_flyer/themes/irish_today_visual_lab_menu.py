from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import irish_today_visual_lab_more as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
BACKGROUND_CADENCE = getattr(base_theme, "BACKGROUND_CADENCE", "daily")
BACKGROUNDS = getattr(base_theme, "BACKGROUNDS", [])


VISUAL_LAB_MENU_CSS = r"""
/* Categorized visual lab ribbon. Replaces the long flat style list with compact hover menus. */
.it-visual-lab-controls {
    width: min(94vw, 58rem) !important;
    align-items: center !important;
    overflow: visible !important;
    gap: 0.42rem !important;
    border-radius: 28px !important;
}

.it-visual-lab-controls > button[data-style] {
    display: none !important;
}

.it-visual-lab-menu {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.38rem;
}

.it-visual-lab-group {
    position: relative;
}

.it-visual-lab-group-trigger,
.it-visual-lab-controls [data-visual-day-action="previous"] {
    appearance: none;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 999px;
    padding: 0.5rem 0.72rem;
    background: rgba(255,255,255,0.075);
    color: #f4fff8;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 850;
    letter-spacing: 0.02em;
    cursor: pointer;
    white-space: nowrap;
}

.it-visual-lab-group-trigger::after {
    content: " ▾";
    opacity: 0.72;
}

.it-visual-lab-group.is-active > .it-visual-lab-group-trigger,
.it-visual-lab-group:focus-within > .it-visual-lab-group-trigger,
.it-visual-lab-group:hover > .it-visual-lab-group-trigger {
    background: rgba(255,255,255,0.92);
    color: #092016;
    border-color: rgba(255,255,255,0.95);
}

.it-visual-lab-options {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.55rem);
    transform: translateX(-50%) translateY(0.3rem);
    min-width: 11.5rem;
    display: grid;
    gap: 0.28rem;
    padding: 0.48rem;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.16);
    background: rgba(4, 14, 12, 0.92);
    box-shadow: 0 18px 58px rgba(0,0,0,0.42);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
}

.it-visual-lab-group:hover .it-visual-lab-options,
.it-visual-lab-group:focus-within .it-visual-lab-options,
.it-visual-lab-group.is-open .it-visual-lab-options {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(-50%) translateY(0);
}

.it-visual-lab-option {
    appearance: none;
    width: 100%;
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 12px;
    padding: 0.52rem 0.62rem;
    background: rgba(255,255,255,0.06);
    color: #f4fff8;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 760;
    text-align: left;
    cursor: pointer;
}

.it-visual-lab-option:hover,
.it-visual-lab-option:focus-visible,
.it-visual-lab-option[aria-pressed="true"] {
    background: rgba(255,255,255,0.92);
    color: #092016;
    outline: none;
}

.it-visual-lab-option-note {
    display: block;
    margin-top: 0.16rem;
    font-size: 0.66rem;
    font-weight: 650;
    opacity: 0.66;
}

.it-visual-lab-current {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.48rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(143,230,203,0.22);
    background: rgba(143,230,203,0.10);
    color: rgba(244,255,248,0.86);
    font-size: 0.72rem;
    font-weight: 800;
    white-space: nowrap;
}

.it-visual-lab-current strong {
    color: #fff;
    font-weight: 950;
}

@media (max-width: 720px) {
    .it-visual-lab-controls {
        width: min(96vw, 28rem) !important;
        border-radius: 22px !important;
    }
    .it-visual-lab-menu {
        width: 100%;
        gap: 0.32rem;
    }
    .it-visual-lab-group-trigger,
    .it-visual-lab-controls [data-visual-day-action="previous"],
    .it-visual-lab-current {
        font-size: 0.70rem !important;
        padding: 0.44rem 0.52rem !important;
    }
    .it-visual-lab-options {
        min-width: 10.5rem;
    }
}
"""


VISUAL_LAB_MENU_JS = r"""
(function () {
    const groups = [
        {
            key: 'transparent',
            label: 'Transparent',
            items: [
                ['glass', 'Glass', 'favorite'],
                ['watercolor', 'Watercolor', 'soft translucent'],
                ['spotlight', 'Spotlight', 'transparent + mouse light']
            ]
        },
        {
            key: 'dark',
            label: 'Dark',
            items: [
                ['terminal', 'Terminal', 'favorite / extreme'],
                ['museum', 'Museum', 'quiet dark'],
                ['neon', 'Neon', 'dark glow'],
                ['broadcast', 'Broadcast', 'sports dark'],
                ['drift', 'Drift', 'motion dark'],
                ['hinge', 'Hinge', 'motion dark'],
                ['flipbook', 'Flipbook', 'page motion']
            ]
        },
        {
            key: 'light',
            label: 'Light',
            items: [
                ['paper', 'Paper', 'warm flyer'],
                ['newsroom', 'Newsroom', 'print layout'],
                ['cascade', 'Cascade', 'print + motion']
            ]
        },
        {
            key: 'samples',
            label: 'Samples',
            items: [
                ['sample', 'Sample', 'mixed random'],
                ['strict_sample', 'Strict sample', 'no repeats per day']
            ]
        },
        {
            key: 'other',
            label: 'Other / Motion',
            items: [
                ['sticker', 'Sticker', 'favorite'],
                ['drift', 'Drift', 'slow float'],
                ['hinge', 'Hinge', 'top-hinge'],
                ['spotlight', 'Spotlight', 'mouse tracked'],
                ['cascade', 'Cascade', 'panel entry'],
                ['flipbook', 'Flipbook', 'page/card face']
            ]
        }
    ];

    const styleLabels = groups.reduce((map, group) => {
        group.items.forEach(([key, label]) => { map[key] = label; });
        return map;
    }, {});

    function currentStyle() {
        const params = new URLSearchParams(window.location.search || '');
        return (params.get('style') || document.documentElement.getAttribute('data-visual-lab-style') || 'paper').toLowerCase();
    }

    function setPressedStates(style) {
        document.querySelectorAll('.it-visual-lab-option[data-style]').forEach((button) => {
            button.setAttribute('aria-pressed', button.dataset.style === style ? 'true' : 'false');
        });
        document.querySelectorAll('.it-visual-lab-group').forEach((group) => {
            const isActive = !!group.querySelector('.it-visual-lab-option[aria-pressed="true"]');
            group.classList.toggle('is-active', isActive);
        });
        const current = document.querySelector('[data-visual-lab-current]');
        if (current) current.innerHTML = 'Current: <strong>' + (styleLabels[style] || style) + '</strong>';
    }

    function applyStyle(style) {
        const existingButton = document.querySelector('.it-visual-lab-controls > button[data-style="' + style + '"]');
        if (existingButton) existingButton.click();
        else {
            document.documentElement.setAttribute('data-visual-lab-style', style);
            if (document.body) document.body.setAttribute('data-visual-lab-style', style);
            const url = new URL(window.location.href);
            url.searchParams.set('style', style);
            window.history.replaceState({}, '', url.toString());
        }
        window.setTimeout(() => setPressedStates(style), 0);
    }

    function closeAllGroups(except) {
        document.querySelectorAll('.it-visual-lab-group.is-open').forEach((group) => {
            if (group !== except) group.classList.remove('is-open');
        });
    }

    function buildCategorizedMenu() {
        const controls = document.querySelector('.it-visual-lab-controls');
        if (!controls || controls.dataset.categorizedReady === 'true') return;
        controls.dataset.categorizedReady = 'true';

        const menu = document.createElement('div');
        menu.className = 'it-visual-lab-menu';
        menu.setAttribute('aria-label', 'Categorized Irish Today visual lab styles');

        const current = document.createElement('div');
        current.className = 'it-visual-lab-current';
        current.dataset.visualLabCurrent = 'true';
        menu.appendChild(current);

        groups.forEach((groupConfig) => {
            const group = document.createElement('div');
            group.className = 'it-visual-lab-group';
            group.dataset.visualLabGroup = groupConfig.key;

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'it-visual-lab-group-trigger';
            trigger.textContent = groupConfig.label;
            trigger.setAttribute('aria-haspopup', 'true');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.addEventListener('click', () => {
                const willOpen = !group.classList.contains('is-open');
                closeAllGroups(group);
                group.classList.toggle('is-open', willOpen);
                trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });
            group.appendChild(trigger);

            const options = document.createElement('div');
            options.className = 'it-visual-lab-options';
            options.setAttribute('role', 'menu');

            groupConfig.items.forEach(([key, label, note]) => {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'it-visual-lab-option';
                option.dataset.style = key;
                option.setAttribute('role', 'menuitemradio');
                option.innerHTML = label + (note ? '<span class="it-visual-lab-option-note">' + note + '</span>' : '');
                option.addEventListener('click', () => {
                    applyStyle(key);
                    group.classList.remove('is-open');
                    trigger.setAttribute('aria-expanded', 'false');
                });
                options.appendChild(option);
            });

            group.appendChild(options);
            menu.appendChild(group);
        });

        controls.appendChild(menu);
        setPressedStates(currentStyle());

        document.addEventListener('click', (event) => {
            if (event.target && event.target.closest && event.target.closest('.it-visual-lab-controls')) return;
            closeAllGroups(null);
            document.querySelectorAll('.it-visual-lab-group-trigger[aria-expanded="true"]').forEach((trigger) => {
                trigger.setAttribute('aria-expanded', 'false');
            });
        });
    }

    function boot() {
        buildCategorizedMenu();
        window.setTimeout(() => {
            buildCategorizedMenu();
            setPressedStates(currentStyle());
        }, 120);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)

    previous_css = context.metadata.get("extra_css", "") or ""
    previous_js = context.metadata.get("extra_js", "") or ""

    context.metadata.update(
        {
            "theme_name": "irish_today_visual_lab_menu",
            "extra_css": previous_css + VISUAL_LAB_MENU_CSS,
            "extra_js": previous_js + VISUAL_LAB_MENU_JS,
        }
    )
    return context
