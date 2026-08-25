from __future__ import annotations

from daily_flyer.models import PageContext
from daily_flyer.themes import magic_duel as base_theme


THEME_CONFIG = dict(base_theme.THEME_CONFIG)
THEME_CONFIG.update(
    {
        "page_title": "Magic Duel — Tabletop Visual Lab",
        "header_title": "Magic Duel",
        "header_subtitle": (
            "A tactile tabletop pass for the playable duel: cloth, wood, brass, parchment, "
            "physical card motion, and subtle arcane lighting instead of dashboard glass."
        ),
        "footer_text": (
            "Daily Flyer • Magic Duel tabletop visual lab • Original placeholder cards and frame treatment; "
            "not affiliated with or endorsed by Wizards of the Coast."
        ),
        "hero_kicker": "Daily Flyer • Tabletop Visual Lab",
        "hero_summary_pill": "Physical cards • playmat • brass • parchment • restrained motion",
    }
)

BACKGROUND_CADENCE = "daily"
BACKGROUNDS: list[dict] = []


TABLETOP_HEAD = r"""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
"""


TABLETOP_CSS = r"""
/* Magic Duel tabletop visual lab.
   The direction is deliberately physical: felt, wood, brass and card stock.
   No copied Magic card frames, logos, mana symbols, or artwork. */
:root {
    --md-wood-dark: #120d0a;
    --md-wood-mid: #2a1c13;
    --md-wood-warm: #4a3220;
    --md-felt: #17251f;
    --md-felt-dark: #0d1713;
    --md-brass: #b89a5b;
    --md-brass-bright: #dcc27e;
    --md-parchment: #ded0aa;
    --md-parchment-dark: #8b7956;
    --md-ink: #201b14;
}

body {
    background:
        radial-gradient(circle at 12% 8%, rgba(96, 53, 151, 0.18), transparent 22rem),
        radial-gradient(circle at 88% 16%, rgba(154, 74, 36, 0.15), transparent 20rem),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 6px),
        repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 2px, transparent 2px 11px),
        linear-gradient(180deg, #21150f 0%, #0d0907 100%) !important;
}

body::before {
    width: 34rem !important;
    height: 34rem !important;
    top: -14rem !important;
    left: 8vw !important;
    opacity: 0.22 !important;
    background: conic-gradient(
        from 25deg,
        rgba(224,211,174,0.15),
        rgba(82,130,175,0.14),
        rgba(72,59,78,0.16),
        rgba(169,67,47,0.13),
        rgba(79,132,83,0.14),
        rgba(224,211,174,0.15)
    ) !important;
    border-radius: 50%;
    filter: blur(36px) !important;
}

body::after {
    width: 28rem !important;
    height: 28rem !important;
    right: -8rem !important;
    top: 42vh !important;
    opacity: 0.18 !important;
    background: radial-gradient(circle, rgba(219,184,101,0.28), transparent 68%) !important;
}

header.hero {
    border-radius: 14px !important;
    border: 1px solid rgba(220,194,126,0.30) !important;
    background:
        linear-gradient(90deg, rgba(220,194,126,0.05), transparent 22%, transparent 78%, rgba(220,194,126,0.05)),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 7px),
        linear-gradient(145deg, #231812, #120e0c 68%, #1a1210) !important;
    box-shadow:
        inset 0 0 0 4px rgba(0,0,0,0.30),
        inset 0 0 0 5px rgba(220,194,126,0.08),
        0 24px 70px rgba(0,0,0,0.42) !important;
}

header.hero::before {
    background:
        linear-gradient(90deg, transparent, rgba(220,194,126,0.08), transparent),
        radial-gradient(circle at 50% 0%, rgba(118,84,161,0.14), transparent 44%) !important;
}

.hero h1,
.md-title,
.md-player-name,
.md-card-name {
    font-family: "Cinzel", Georgia, "Times New Roman", serif !important;
}

.hero h1 {
    color: #ead9aa;
    text-shadow: 0 2px 0 #090604, 0 0 32px rgba(188,151,82,0.18) !important;
    letter-spacing: 0.015em !important;
}

.hero .subtitle,
.hero-pill,
.hero-kicker {
    font-family: "Crimson Pro", Georgia, serif;
}

.hero-kicker,
.hero-pill {
    border-radius: 4px !important;
    border-color: rgba(220,194,126,0.20) !important;
    background: rgba(11,8,7,0.54) !important;
    color: #cabd9f !important;
}

.card--magic_game {
    background: transparent !important;
    border: 0 !important;
    box-shadow: none !important;
}
.card--magic_game > .card-head {
    display: none !important;
}
.card--magic_game > .body {
    color: inherit !important;
}
.card--magic_game:hover {
    transform: none !important;
    box-shadow: none !important;
}

.magic-duel {
    padding: 0.35rem 0 1.25rem !important;
    color: #eee5d0 !important;
    font-family: "Crimson Pro", Georgia, serif !important;
}

.md-shell {
    position: relative;
    max-width: 1220px !important;
    gap: 0 !important;
    padding: 14px;
    border: 1px solid rgba(197,157,90,0.28);
    border-radius: 16px;
    background:
        linear-gradient(90deg, rgba(255,255,255,0.02), transparent 2%, transparent 98%, rgba(255,255,255,0.018)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 5px),
        linear-gradient(180deg, #352318, #1a120e 46%, #100b09 100%);
    box-shadow:
        inset 0 0 0 5px rgba(8,5,4,0.62),
        inset 0 0 36px rgba(0,0,0,0.48),
        0 34px 90px rgba(0,0,0,0.52);
}

.md-shell::after {
    content: "";
    pointer-events: none;
    position: absolute;
    inset: 7px;
    border: 1px solid rgba(220,194,126,0.10);
    border-radius: 10px;
    z-index: 4;
}

.md-topbar,
.md-playerbar,
.md-log-panel {
    position: relative;
    z-index: 5;
    border-radius: 5px !important;
    border: 1px solid rgba(190,154,91,0.26) !important;
    background:
        repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 8px),
        linear-gradient(180deg, #241913, #15100d) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), 0 5px 16px rgba(0,0,0,0.26) !important;
}

.md-topbar {
    margin: 2px 2px 8px;
    min-height: 64px;
    padding: 0.75rem 0.95rem 0.75rem 1.05rem !important;
    overflow: hidden;
}

.md-topbar::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: linear-gradient(180deg, #72519a, #b58a48, #4c7b57);
    opacity: 0.82;
}

.md-title {
    color: #e5d2a0 !important;
    font-size: 1.03rem !important;
    letter-spacing: 0.04em !important;
    text-transform: uppercase;
}

.md-subtitle {
    color: #998d78 !important;
    font-size: 0.82rem !important;
    letter-spacing: 0.02em;
}

.md-arcane-wells {
    display: inline-flex;
    gap: 0.3rem;
    margin-top: 0.38rem;
    padding: 0.24rem 0.38rem;
    border: 1px solid rgba(220,194,126,0.12);
    border-radius: 999px;
    background: rgba(0,0,0,0.18);
}
.md-arcane-well {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.25);
    box-shadow: inset 0 0 5px rgba(255,255,255,0.22), 0 0 7px currentColor;
}
.md-arcane-well:nth-child(1) { color: #e8dfbd; background: #d8cfad; }
.md-arcane-well:nth-child(2) { color: #5a9bc6; background: #477fa8; }
.md-arcane-well:nth-child(3) { color: #6b6071; background: #312d35; }
.md-arcane-well:nth-child(4) { color: #bd6149; background: #9f4938; }
.md-arcane-well:nth-child(5) { color: #6d9d69; background: #4f7d53; }

.md-playerbar {
    margin: 0 2px;
    border-left: 0 !important;
    border-right: 0 !important;
    border-radius: 0 !important;
    padding: 0.62rem 0.9rem !important;
}

.md-avatar {
    position: relative;
    width: 46px !important;
    height: 46px !important;
    border: 2px solid #7b663e !important;
    border-radius: 50% !important;
    background:
        radial-gradient(circle at 35% 28%, rgba(255,255,255,0.13), transparent 24%),
        radial-gradient(circle at center, #30263a, #151018 72%) !important;
    box-shadow: inset 0 0 0 3px #18100c, 0 4px 10px rgba(0,0,0,0.32);
}

.md-player-name {
    color: #dfc995 !important;
    letter-spacing: 0.025em;
}

.md-player-meta {
    color: #948a7a !important;
    font-family: "Crimson Pro", Georgia, serif;
    font-size: 0.86rem !important;
}

.md-life {
    min-width: 78px !important;
    padding: 0.5rem 0.65rem !important;
    border-radius: 50% 50% 46% 54% / 52% 48% 54% 46% !important;
    border: 2px solid #937342 !important;
    color: #f0d9a4 !important;
    font-family: "Cinzel", Georgia, serif;
    background:
        radial-gradient(circle at 36% 28%, rgba(255,255,255,0.25), transparent 18%),
        radial-gradient(circle at 50% 62%, #6f1f24, #260a0d 72%) !important;
    box-shadow:
        inset 0 0 0 3px #25150f,
        inset 0 -8px 16px rgba(0,0,0,0.32),
        0 4px 12px rgba(0,0,0,0.36) !important;
    text-shadow: 0 1px 2px #000;
}

.md-board {
    position: relative;
    z-index: 2;
    gap: 0 !important;
    overflow: hidden;
    border-left: 1px solid rgba(93,115,91,0.36);
    border-right: 1px solid rgba(93,115,91,0.36);
    background:
        radial-gradient(circle at 50% 50%, transparent 0 88px, rgba(190,154,91,0.08) 89px 90px, transparent 91px 116px, rgba(190,154,91,0.055) 117px 118px, transparent 119px),
        conic-gradient(from 0deg at 50% 50%, rgba(218,202,157,0.025), transparent 8%, rgba(92,139,174,0.025) 18%, transparent 28%, rgba(85,72,92,0.032) 40%, transparent 50%, rgba(165,74,54,0.028) 62%, transparent 72%, rgba(77,128,83,0.032) 84%, transparent 94%),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.008) 0 1px, transparent 1px 5px),
        repeating-linear-gradient(90deg, rgba(0,0,0,0.018) 0 1px, transparent 1px 9px),
        linear-gradient(90deg, #14201a, #192820 48%, #132019) !important;
    box-shadow: inset 0 0 56px rgba(0,0,0,0.42);
}

.md-board::before {
    content: "";
    position: absolute;
    z-index: 0;
    pointer-events: none;
    width: 220px;
    height: 220px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(12deg);
    opacity: 0.11;
    background:
        linear-gradient(45deg, transparent 48.8%, #d4bd7e 49% 51%, transparent 51.2%),
        linear-gradient(-45deg, transparent 48.8%, #d4bd7e 49% 51%, transparent 51.2%);
    border: 1px solid #d4bd7e;
    border-radius: 50%;
    box-shadow: 0 0 0 28px rgba(212,189,126,0.08), 0 0 0 29px rgba(212,189,126,0.20);
}

.md-zone {
    position: relative;
    z-index: 2;
    min-height: 138px;
    padding: 0.78rem 0.9rem 0.9rem !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}

.md-zone[data-table-role="opponent-hand"] {
    min-height: 108px;
    background: linear-gradient(180deg, rgba(58,23,26,0.24), transparent 92%) !important;
}
.md-zone[data-table-role="opponent-battlefield"] {
    border-bottom: 1px dashed rgba(218,199,145,0.16) !important;
    background: linear-gradient(180deg, rgba(76,32,35,0.13), transparent 82%) !important;
}
.md-zone[data-table-role="player-battlefield"] {
    border-top: 1px dashed rgba(218,199,145,0.14) !important;
    background: linear-gradient(0deg, rgba(30,62,45,0.13), transparent 82%) !important;
}
.md-zone[data-table-role="player-hand"] {
    min-height: 208px;
    background: linear-gradient(0deg, rgba(22,16,12,0.30), transparent 76%) !important;
}

.md-zone-title {
    margin-bottom: 0.68rem !important;
    color: #a99b7e !important;
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.67rem !important;
    letter-spacing: 0.13em !important;
    text-shadow: 0 1px 0 #000;
}
.md-zone-title > span:last-child {
    color: #817968;
    font-family: "Crimson Pro", Georgia, serif;
    font-size: 0.82rem;
    letter-spacing: 0.02em;
    text-transform: none;
}

.md-cards {
    position: relative;
    z-index: 2;
    min-height: 158px !important;
    gap: 0.18rem !important;
    overflow-x: auto;
    overflow-y: visible;
    padding: 0.55rem 0.45rem 0.8rem !important;
    scrollbar-color: rgba(190,154,91,0.32) rgba(0,0,0,0.12);
}
.md-cards--compact {
    min-height: 102px !important;
    padding-top: 0.2rem !important;
}

.md-card {
    --card-accent: #7c687e;
    --card-accent-soft: #4a3d4b;
    --md-fan-rotate: 0deg;
    --md-fan-y: 0px;
    --md-tap-rotate: 0deg;
    --md-tilt-x: 0deg;
    --md-tilt-y: 0deg;
    --md-lift: 0px;
    --foil-x: 50%;
    --foil-y: 50%;
    flex: 0 0 138px !important;
    min-height: 194px !important;
    padding: 7px !important;
    gap: 5px !important;
    border-radius: 9px !important;
    border: 1px solid #0c0908 !important;
    color: #241d16 !important;
    background:
        linear-gradient(145deg, rgba(255,255,255,0.11), transparent 24%),
        linear-gradient(180deg, color-mix(in srgb, var(--card-accent) 62%, #33281e), color-mix(in srgb, var(--card-accent-soft) 56%, #17110e)) !important;
    box-shadow:
        inset 0 0 0 2px rgba(231,218,181,0.12),
        inset 0 0 0 4px rgba(10,8,7,0.44),
        0 5px 8px rgba(0,0,0,0.34),
        0 13px 22px rgba(0,0,0,0.20) !important;
    transform-style: preserve-3d;
    transform:
        perspective(900px)
        translateY(calc(var(--md-fan-y) + var(--md-lift)))
        rotateZ(calc(var(--md-fan-rotate) + var(--md-tap-rotate)))
        rotateX(var(--md-tilt-y))
        rotateY(var(--md-tilt-x)) !important;
    transform-origin: center 76%;
    transition: transform 150ms ease, filter 150ms ease, box-shadow 150ms ease !important;
}

.md-card--land {
    --card-accent: #66785a;
    --card-accent-soft: #394735;
}
.md-card--creature {
    --card-accent: #745f82;
    --card-accent-soft: #41364a;
}
.md-card--spell {
    --card-accent: #527691;
    --card-accent-soft: #2e465b;
}

.md-card::before {
    content: "";
    position: absolute;
    inset: 1px;
    pointer-events: none;
    z-index: 8;
    border-radius: 8px;
    opacity: 0;
    background:
        radial-gradient(circle at var(--foil-x) var(--foil-y), rgba(255,255,255,0.30), transparent 18%),
        linear-gradient(115deg, transparent 25%, rgba(224,199,255,0.10) 38%, rgba(160,220,255,0.09) 48%, rgba(255,207,142,0.08) 58%, transparent 73%);
    mix-blend-mode: screen;
    transition: opacity 140ms ease;
}

.md-card:hover::before,
.md-card:focus-within::before {
    opacity: 0.72;
}

.md-card[data-clickable="true"]:hover {
    --md-lift: -11px;
    z-index: 30;
    border-color: #c4a967 !important;
    box-shadow:
        inset 0 0 0 2px rgba(245,230,186,0.16),
        inset 0 0 0 4px rgba(10,8,7,0.42),
        0 8px 14px rgba(0,0,0,0.35),
        0 19px 30px rgba(0,0,0,0.30),
        0 0 0 1px rgba(197,167,99,0.20) !important;
}

.md-card.is-tapped {
    --md-tap-rotate: 8deg;
    opacity: 0.78 !important;
    filter: saturate(0.72) brightness(0.84);
}

.md-card.is-selected {
    --md-lift: -8px;
    border-color: #d6ae58 !important;
    box-shadow:
        inset 0 0 0 2px rgba(255,235,183,0.16),
        0 7px 15px rgba(0,0,0,0.36),
        0 0 0 2px rgba(219,174,77,0.30),
        0 0 26px rgba(201,105,54,0.24) !important;
}

.md-card-name {
    min-height: 28px;
    display: flex;
    align-items: center;
    padding: 4px 28px 4px 6px;
    border: 1px solid rgba(25,18,12,0.34);
    border-radius: 4px;
    color: #201910 !important;
    background:
        repeating-linear-gradient(0deg, rgba(73,54,27,0.035) 0 1px, transparent 1px 5px),
        linear-gradient(90deg, rgba(236,223,188,0.92), rgba(194,177,136,0.88)) !important;
    font-size: 0.72rem !important;
    line-height: 1.05 !important;
    text-shadow: 0 1px rgba(255,255,255,0.38);
    box-shadow: inset 0 1px rgba(255,255,255,0.25);
}

.md-card-cost {
    top: 10px !important;
    right: 10px !important;
    width: 25px !important;
    height: 25px !important;
    border: 2px solid #6d5835 !important;
    color: #2a2117 !important;
    background:
        radial-gradient(circle at 35% 28%, #fff7d9, #ba9d5b 62%, #70582f) !important;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.38), 0 1px 3px rgba(0,0,0,0.55);
    font-family: "Cinzel", Georgia, serif;
}

.md-card-art {
    position: relative;
    min-height: 83px !important;
    border: 2px solid rgba(17,12,9,0.58) !important;
    border-radius: 3px !important;
    overflow: hidden;
    color: rgba(255,255,255,0.90);
    background:
        radial-gradient(circle at 72% 22%, color-mix(in srgb, var(--card-accent) 74%, white), transparent 18%),
        radial-gradient(circle at 28% 72%, color-mix(in srgb, var(--card-accent-soft) 86%, black), transparent 34%),
        repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px),
        linear-gradient(145deg, color-mix(in srgb, var(--card-accent) 70%, #1b1714), #12100e) !important;
    box-shadow: inset 0 0 22px rgba(0,0,0,0.30);
    text-shadow: 0 3px 8px rgba(0,0,0,0.48);
}

.md-card-art::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
        linear-gradient(115deg, transparent 0 36%, rgba(255,255,255,0.08) 39%, transparent 43%),
        radial-gradient(circle at 50% 50%, transparent 45%, rgba(0,0,0,0.26) 100%);
    pointer-events: none;
}

.md-card-text {
    min-height: 48px;
    padding: 6px 6px 8px;
    border: 1px solid rgba(65,47,25,0.36);
    border-radius: 3px;
    color: #2f291e !important;
    background:
        repeating-linear-gradient(0deg, rgba(82,60,30,0.033) 0 1px, transparent 1px 5px),
        linear-gradient(180deg, rgba(229,217,184,0.96), rgba(199,185,149,0.94)) !important;
    font-family: "Crimson Pro", Georgia, serif !important;
    font-size: 0.69rem !important;
    line-height: 1.20 !important;
    box-shadow: inset 0 1px rgba(255,255,255,0.30);
}

.md-card-pt {
    position: absolute;
    right: 8px;
    bottom: 7px;
    min-width: 34px;
    padding: 0.18rem 0.34rem !important;
    border: 1px solid #5d4829 !important;
    border-radius: 4px !important;
    color: #221a11 !important;
    background: linear-gradient(180deg, #dfcc96, #aa8e55) !important;
    box-shadow: inset 0 1px rgba(255,255,255,0.28), 0 1px 3px rgba(0,0,0,0.45);
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.70rem !important;
}

.md-card.is-sick::after {
    right: 7px !important;
    bottom: auto !important;
    top: 40px !important;
    z-index: 9;
    padding: 0.16rem 0.3rem !important;
    border: 1px solid rgba(255,226,163,0.28);
    border-radius: 3px !important;
    color: #e6d4a9 !important;
    background: rgba(62,45,33,0.88) !important;
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.48rem !important;
    letter-spacing: 0.08em;
}

[data-zone="player-hand"] {
    align-items: flex-end !important;
    justify-content: center;
    padding-top: 0.9rem !important;
}
[data-zone="player-hand"] .md-card {
    margin-right: -18px;
    transform-origin: center 120%;
}
[data-zone="player-hand"] .md-card:last-child {
    margin-right: 0;
}
[data-zone="player-hand"] .md-card:hover {
    z-index: 40;
}

.md-card-back {
    position: relative;
    flex: 0 0 78px !important;
    min-height: 112px !important;
    border-radius: 7px !important;
    border: 2px solid #352719 !important;
    background:
        radial-gradient(circle at 50% 50%, transparent 0 16px, rgba(211,177,99,0.30) 17px 18px, transparent 19px 27px, rgba(117,81,154,0.22) 28px 29px, transparent 30px),
        conic-gradient(from 22deg, #1b1520, #34203b, #1e2934, #38251d, #183026, #1b1520) !important;
    box-shadow:
        inset 0 0 0 3px #0c0908,
        inset 0 0 0 4px rgba(211,177,99,0.24),
        inset 0 0 20px rgba(0,0,0,0.42),
        0 5px 10px rgba(0,0,0,0.34) !important;
    transform: rotate(var(--back-rotate, 0deg));
}
.md-card-back::before,
.md-card-back::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(45deg);
    width: 28px;
    height: 28px;
    border: 1px solid rgba(219,190,116,0.32);
}
.md-card-back::after {
    transform: translate(-50%, -50%) rotate(0deg);
    width: 14px;
    height: 14px;
    border-color: rgba(219,190,116,0.48);
}

.md-toolbar {
    position: relative;
    z-index: 7;
    margin: 0 !important;
    padding: 0.62rem 0.82rem !important;
    border: 0 !important;
    border-top: 1px solid rgba(195,158,89,0.30) !important;
    border-bottom: 1px solid rgba(195,158,89,0.30) !important;
    border-radius: 0 !important;
    background:
        repeating-linear-gradient(90deg, rgba(255,255,255,0.014) 0 1px, transparent 1px 7px),
        linear-gradient(180deg, #2b2019, #18120f) !important;
    box-shadow: inset 0 1px rgba(255,255,255,0.025), 0 2px 8px rgba(0,0,0,0.28) !important;
}

.md-phase {
    gap: 0 !important;
    border: 1px solid rgba(183,145,81,0.28);
    border-radius: 3px;
    overflow: hidden;
    width: fit-content;
    background: rgba(0,0,0,0.20);
}
.md-phase-step {
    position: relative;
    min-width: 68px;
    border: 0 !important;
    border-right: 1px solid rgba(183,145,81,0.16) !important;
    border-radius: 0 !important;
    padding: 0.32rem 0.52rem !important;
    color: #776e60 !important;
    background: transparent !important;
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.56rem !important;
    letter-spacing: 0.07em;
    text-align: center;
}
.md-phase-step:last-child { border-right: 0 !important; }
.md-phase-step.is-active {
    color: #ead6a2 !important;
    background: linear-gradient(180deg, rgba(191,149,71,0.18), rgba(191,149,71,0.06)) !important;
    box-shadow: inset 0 -2px #c5a45f;
}

.md-status {
    margin-top: 0.4rem;
    max-width: 62ch;
    color: #a69b87 !important;
    font-family: "Crimson Pro", Georgia, serif;
    font-style: italic;
}

.md-btn {
    border-radius: 3px !important;
    border: 1px solid #725d39 !important;
    color: #dfcfaa !important;
    background:
        linear-gradient(180deg, rgba(255,255,255,0.045), transparent 40%),
        linear-gradient(180deg, #302318, #1c1511) !important;
    box-shadow: inset 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.34);
    font-family: "Cinzel", Georgia, serif !important;
    font-size: 0.67rem !important;
    letter-spacing: 0.045em;
    text-transform: uppercase;
}
.md-btn--primary {
    border-color: #98783e !important;
    color: #f0dcaa !important;
    background: linear-gradient(180deg, #5a4526, #2e2317) !important;
}
.md-btn:hover:not(:disabled) {
    background: linear-gradient(180deg, #624c2c, #2d2116) !important;
    border-color: #c0a15c !important;
    box-shadow: inset 0 1px rgba(255,255,255,0.08), 0 3px 8px rgba(0,0,0,0.38), 0 0 12px rgba(190,152,76,0.10) !important;
}

.md-mana {
    color: #9fc49c !important;
}

.md-log-panel {
    margin: 8px 2px 0;
    border-radius: 4px !important;
    background:
        repeating-linear-gradient(0deg, rgba(73,54,27,0.032) 0 1px, transparent 1px 5px),
        linear-gradient(180deg, #d3c49f, #ad9c78) !important;
    border-color: #6c5937 !important;
    color: #2a241b !important;
    box-shadow: inset 0 0 0 3px rgba(68,48,27,0.12), 0 5px 15px rgba(0,0,0,0.30) !important;
}
.md-log-panel .md-zone-title,
.md-log-panel .md-zone-title > span:last-child {
    color: #61543c !important;
    text-shadow: none !important;
}
.md-log {
    color: #4b4030 !important;
    font-family: "Crimson Pro", Georgia, serif;
    font-size: 0.84rem !important;
}
.md-log-entry strong {
    color: #2a2118 !important;
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.69rem;
}

.md-rules {
    position: relative;
    z-index: 5;
    margin: 9px 3px 2px !important;
    padding: 0.7rem 0.85rem;
    border-top: 1px solid rgba(181,146,84,0.16);
    color: #796e5e !important;
    font-family: "Crimson Pro", Georgia, serif;
    font-size: 0.79rem !important;
}

.md-empty {
    color: rgba(194,181,148,0.42) !important;
    font-family: "Cinzel", Georgia, serif;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

@keyframes md-card-deal-in {
    from { opacity: 0; transform: perspective(900px) translateY(22px) rotateZ(-2deg) rotateX(8deg); }
    to { opacity: 1; }
}

.md-card[data-tabletop-ready="true"] {
    animation: md-card-deal-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: var(--md-deal-delay, 0ms);
}

@media (prefers-reduced-motion: reduce) {
    .md-card[data-tabletop-ready="true"] {
        animation: none !important;
        transition: none !important;
    }
}

@media (max-width: 820px) {
    .md-shell { padding: 8px; }
    .md-card { flex-basis: 122px !important; min-height: 178px !important; }
    [data-zone="player-hand"] { justify-content: flex-start; }
    [data-zone="player-hand"] .md-card { margin-right: -10px; }
    .md-phase-step { min-width: 0; }
}

@media (max-width: 560px) {
    .md-zone { padding-left: 0.55rem !important; padding-right: 0.55rem !important; }
    .md-card { flex-basis: 112px !important; min-height: 169px !important; }
    .md-card-text { font-size: 0.64rem !important; }
    .md-toolbar { align-items: stretch !important; }
    .md-actions { width: 100%; }
    .md-actions .md-btn { flex: 1 1 auto; }
}
"""


TABLETOP_JS = r"""
(function () {
    const root = document.getElementById("magic-duel-root");
    if (!root) return;

    let decorateQueued = false;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function addArcaneWells() {
        const topbar = root.querySelector(".md-topbar");
        if (!topbar || topbar.querySelector(".md-arcane-wells")) return;
        const wells = document.createElement("div");
        wells.className = "md-arcane-wells";
        wells.title = "Five-color visual motif only; colored mana is not implemented yet.";
        wells.setAttribute("aria-label", "Five-color visual motif");
        wells.innerHTML = Array.from({ length: 5 }, () => '<span class="md-arcane-well" aria-hidden="true"></span>').join("");
        const copy = topbar.firstElementChild;
        if (copy) copy.appendChild(wells);
    }

    function labelZones() {
        const roles = ["opponent-hand", "opponent-battlefield", "player-battlefield", "player-hand"];
        root.querySelectorAll(".md-board > .md-zone").forEach((zone, index) => {
            if (roles[index]) zone.dataset.tableRole = roles[index];
        });
    }

    function fanCards() {
        const hand = Array.from(root.querySelectorAll('[data-zone="player-hand"] .md-card'));
        const center = (hand.length - 1) / 2;
        hand.forEach((card, index) => {
            const offset = index - center;
            card.style.setProperty("--md-fan-rotate", `${clamp(offset * 1.65, -6.5, 6.5)}deg`);
            card.style.setProperty("--md-fan-y", `${Math.abs(offset) * 2.2}px`);
        });

        const backs = Array.from(root.querySelectorAll(".md-zone[data-table-role=\"opponent-hand\"] .md-card-back"));
        const backCenter = (backs.length - 1) / 2;
        backs.forEach((card, index) => {
            const offset = index - backCenter;
            card.style.setProperty("--back-rotate", `${clamp(offset * 1.4, -5, 5)}deg`);
            card.style.marginRight = index === backs.length - 1 ? "0" : "-20px";
        });
    }

    function attachCardLight(card, index) {
        if (card.dataset.tabletopReady === "true") return;
        card.dataset.tabletopReady = "true";
        card.style.setProperty("--md-deal-delay", `${Math.min(index * 22, 180)}ms`);

        card.addEventListener("pointermove", (event) => {
            if (event.pointerType === "touch") return;
            const rect = card.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            card.style.setProperty("--foil-x", `${(x * 100).toFixed(1)}%`);
            card.style.setProperty("--foil-y", `${(y * 100).toFixed(1)}%`);
            card.style.setProperty("--md-tilt-x", `${((x - 0.5) * 6).toFixed(2)}deg`);
            card.style.setProperty("--md-tilt-y", `${((0.5 - y) * 5).toFixed(2)}deg`);
        });

        card.addEventListener("pointerleave", () => {
            card.style.setProperty("--md-tilt-x", "0deg");
            card.style.setProperty("--md-tilt-y", "0deg");
            card.style.setProperty("--foil-x", "50%");
            card.style.setProperty("--foil-y", "50%");
        });
    }

    function decorate() {
        decorateQueued = false;
        addArcaneWells();
        labelZones();
        fanCards();
        root.querySelectorAll(".md-card").forEach((card, index) => attachCardLight(card, index));
    }

    function queueDecorate() {
        if (decorateQueued) return;
        decorateQueued = true;
        requestAnimationFrame(decorate);
    }

    const observer = new MutationObserver(queueDecorate);
    observer.observe(root, { childList: true, subtree: true });
    queueDecorate();
})();
"""


def build_theme_page(
    date_str: str | None = None,
    seed: int | None = None,
) -> PageContext:
    context = base_theme.build_theme_page(date_str=date_str, seed=seed)
    context.page_title = THEME_CONFIG["page_title"]
    context.header_title = THEME_CONFIG["header_title"]
    context.header_subtitle = THEME_CONFIG["header_subtitle"]
    context.footer_text = THEME_CONFIG["footer_text"]
    context.metadata["theme_name"] = "magic_duel_tabletop"
    context.metadata["hero_kicker"] = THEME_CONFIG["hero_kicker"]
    context.metadata["hero_summary_pill"] = THEME_CONFIG["hero_summary_pill"]
    context.metadata["extra_head_html"] = TABLETOP_HEAD + (context.metadata.get("extra_head_html", "") or "")
    context.metadata["extra_css"] = (context.metadata.get("extra_css", "") or "") + "\n" + TABLETOP_CSS
    context.metadata["extra_js"] = (context.metadata.get("extra_js", "") or "") + "\n" + TABLETOP_JS
    return context
