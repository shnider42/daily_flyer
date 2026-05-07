from __future__ import annotations

from urllib.parse import quote

from daily_flyer.themes.nissan_z_assets import BACKGROUND_IMAGE_DATA_URL

ENABLE_DYNAMIC_WORD = False


def _svg_image(title: str, subtitle: str, accent: str = "#d5ac62") -> str:
    """Return a self-contained stylized card image so Render never depends on remote image hosts."""
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="{title}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#050505"/>
          <stop offset="0.46" stop-color="#17120d"/>
          <stop offset="1" stop-color="#080706"/>
        </linearGradient>
        <radialGradient id="glow" cx="74%" cy="23%" r="65%">
          <stop offset="0" stop-color="{accent}" stop-opacity="0.38"/>
          <stop offset="0.55" stop-color="{accent}" stop-opacity="0.08"/>
          <stop offset="1" stop-color="{accent}" stop-opacity="0"/>
        </radialGradient>
        <filter id="shadow" x="-20%" y="-30%" width="140%" height="180%">
          <feDropShadow dx="0" dy="34" stdDeviation="28" flood-color="#000" flood-opacity="0.65"/>
        </filter>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <rect width="1600" height="900" fill="url(#glow)"/>
      <path d="M0 650 C240 580 460 560 720 600 C1000 642 1280 608 1600 520 L1600 900 L0 900 Z" fill="#0d0c0b" opacity="0.78"/>
      <g opacity="0.28">
        <path d="M90 220 H1510" stroke="#f2d08a" stroke-width="2"/>
        <path d="M90 310 H1510" stroke="#ffffff" stroke-width="1" opacity="0.25"/>
        <path d="M90 400 H1510" stroke="#ffffff" stroke-width="1" opacity="0.18"/>
        <path d="M220 110 V690" stroke="#ffffff" stroke-width="1" opacity="0.16"/>
        <path d="M520 90 V690" stroke="#ffffff" stroke-width="1" opacity="0.13"/>
        <path d="M980 90 V690" stroke="#ffffff" stroke-width="1" opacity="0.13"/>
        <path d="M1280 110 V690" stroke="#ffffff" stroke-width="1" opacity="0.16"/>
      </g>
      <g filter="url(#shadow)" transform="translate(118 332)">
        <path d="M142 296 C210 196 328 143 505 132 L747 119 C846 114 947 150 1055 227 L1228 241 C1294 246 1338 278 1370 337 L1325 377 L242 383 Z" fill="#1a1714"/>
        <path d="M252 270 C348 184 469 148 636 147 L741 147 C838 149 930 181 1034 239 L1162 250 C944 273 691 285 252 270 Z" fill="#2d2822"/>
        <path d="M512 151 C598 93 734 83 846 112 C899 126 956 168 1020 232 L742 214 Z" fill="#070707" opacity="0.88"/>
        <path d="M288 264 C358 209 470 179 617 171" stroke="{accent}" stroke-width="7" stroke-linecap="round" opacity="0.78"/>
        <path d="M1117 272 C1198 275 1260 294 1306 334" stroke="#d72f2f" stroke-width="10" stroke-linecap="round" opacity="0.74"/>
        <circle cx="412" cy="383" r="116" fill="#060606"/>
        <circle cx="412" cy="383" r="78" fill="none" stroke="{accent}" stroke-width="20"/>
        <circle cx="412" cy="383" r="24" fill="#151515" stroke="#e9d3a2" stroke-width="8"/>
        <circle cx="1064" cy="383" r="116" fill="#060606"/>
        <circle cx="1064" cy="383" r="78" fill="none" stroke="{accent}" stroke-width="20"/>
        <circle cx="1064" cy="383" r="24" fill="#151515" stroke="#e9d3a2" stroke-width="8"/>
        <path d="M392 383 H432 M412 363 V403 M1044 383 H1084 M1064 363 V403" stroke="#e9d3a2" stroke-width="9" stroke-linecap="round"/>
      </g>
      <text x="88" y="112" fill="#f7f3eb" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="900" letter-spacing="-1">{title}</text>
      <text x="92" y="168" fill="{accent}" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="4">{subtitle}</text>
      <text x="1364" y="814" fill="#ffffff" opacity="0.13" font-family="Inter, Arial, sans-serif" font-size="210" font-weight="900" font-style="italic">Z</text>
    </svg>
    """
    return "data:image/svg+xml;charset=utf-8," + quote(svg)


EXTRA_CSS = """
    :root {
        --bg: #090908;
        --bg-deep: #020202;
        --bg-soft: #151411;
        --card: rgba(13, 13, 13, 0.70);
        --card-strong: rgba(17, 16, 15, 0.82);
        --border: rgba(225, 190, 126, 0.14);
        --border-strong: rgba(225, 190, 126, 0.30);
        --ink: #f7f3eb;
        --ink-soft: #d4c8b8;
        --muted: #aa9880;
        --irish-green: #b08a45;
        --gold: #d5ac62;
        --teal: #67584a;
        --blue: #d72f2f;
        --shadow-lg: 0 30px 90px rgba(0,0,0,0.58);
        --shadow-md: 0 18px 44px rgba(0,0,0,0.40);
    }

    body {
        background:
            radial-gradient(circle at 18% 8%, rgba(210,165,88,0.18), transparent 30%),
            radial-gradient(circle at 78% 16%, rgba(215,47,47,0.16), transparent 26%),
            radial-gradient(circle at 50% 100%, rgba(255,255,255,0.08), transparent 34%),
            linear-gradient(180deg, #161411 0%, #080807 48%, #020202 100%);
    }

    .site-bg {
        background-image: linear-gradient(rgba(4, 4, 4, 0.18), rgba(4, 4, 4, 0.48)), url('__BG__') !important;
        background-position: center top !important;
        background-size: cover !important;
        filter: saturate(1.12) contrast(1.06) brightness(0.86) !important;
        transform: translateY(var(--bg-shift)) scale(1.08) !important;
        opacity: 1 !important;
    }

    body::before { width: 520px; height: 520px; top: -120px; left: -120px; background: radial-gradient(circle, rgba(213,172,98,0.20), transparent 70%); opacity: 0.38; }
    body::after { width: 440px; height: 440px; right: -120px; top: 210px; background: radial-gradient(circle, rgba(215,47,47,0.18), transparent 70%); opacity: 0.36; }

    header.hero {
        border-color: rgba(225,190,126,0.22);
        background:
            linear-gradient(110deg, rgba(0,0,0,0.72), rgba(18,16,13,0.58) 36%, rgba(87,58,34,0.20) 68%, rgba(215,47,47,0.12)),
            radial-gradient(circle at 80% 36%, rgba(213,172,98,0.22), transparent 28%),
            linear-gradient(160deg, rgba(17,17,16,0.84), rgba(6,6,6,0.76));
    }

    header.hero::after { content: "Z"; position: absolute; right: clamp(18px, 8vw, 86px); bottom: -0.18em; font-size: clamp(8rem, 22vw, 18rem); font-weight: 900; font-style: italic; letter-spacing: -0.16em; color: rgba(213,172,98,0.08); line-height: 0.8; pointer-events: none; }
    header.hero::before { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent), radial-gradient(circle at 14% 22%, rgba(213,172,98,0.14), transparent 22%), radial-gradient(circle at 88% 28%, rgba(215,47,47,0.13), transparent 24%); }
    .hero h1 { max-width: 13ch; text-transform: uppercase; }
    .hero-kicker, .hero-pill, .icon-badge { border-color: rgba(213,172,98,0.24); background: rgba(0,0,0,0.26); }

    .z-day-nav { position: relative; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 0.58rem; margin-top: 1.05rem; }
    .z-day-nav__label, .z-day-nav__link { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border-radius: 999px; border: 1px solid rgba(213,172,98,0.24); background: rgba(0,0,0,0.28); color: var(--ink); font-size: 0.88rem; line-height: 1; box-shadow: 0 10px 24px rgba(0,0,0,0.18); }
    .z-day-nav__label { padding: 0.63rem 0.82rem; color: var(--ink-soft); letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.72rem; font-weight: 800; }
    .z-day-nav__link { padding: 0.65rem 0.92rem; text-decoration: none; font-weight: 800; }
    .z-day-nav__link:hover { border-color: rgba(240,196,122,0.58); background: rgba(213,172,98,0.14); text-decoration: none; }
    .z-day-nav__link--today { background: linear-gradient(135deg, rgba(215,47,47,0.22), rgba(213,172,98,0.18)); }

    .card { border-color: rgba(225,190,126,0.15); background: linear-gradient(180deg, rgba(255,255,255,0.060), rgba(255,255,255,0.022)), rgba(12,12,12,0.74); }
    .card:hover { border-color: rgba(225,190,126,0.34); box-shadow: 0 24px 58px rgba(0,0,0,0.46); }
    .card::after { background: linear-gradient(90deg, #d72f2f, #d5ac62, #776452); }
    .card-image-wrap { border-color: rgba(213,172,98,0.22); background: rgba(0,0,0,0.30); }
    .card-image { background: #090807; }
    .card--word { background: linear-gradient(180deg, rgba(213,172,98,0.16), rgba(255,255,255,0.025)), var(--card-strong); }
    .card--history { background: linear-gradient(180deg, rgba(215,47,47,0.15), rgba(255,255,255,0.02)), var(--card-strong); }
    .card--did_you_know, .card--nissan_z_connection, .card--z_of_the_day, .card--z_games { background: linear-gradient(180deg, rgba(213,172,98,0.13), rgba(255,255,255,0.02)), var(--card-strong); }
    .card--z_of_the_day, .card--z_games, .card--nissan_z_connection { grid-column: span 6; }
    .card--sport, .card--phrase { background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(215,47,47,0.08)), var(--card); }
    a { color: #f0c47a; }

    @media (min-width: 981px) { main { padding-top: 22px; } .card--z_of_the_day { grid-column: span 7; } .card--nissan_z_connection { grid-column: span 5; } }
    @media (max-width: 980px) { .card, .card--word, .card--history, .card--did_you_know, .card--z_of_the_day, .card--z_games, .card--nissan_z_connection { grid-column: span 6 !important; } }
    @media (max-width: 720px) {
        .site-bg { background-position: center top !important; filter: saturate(1.08) contrast(1.02) brightness(0.74) !important; transform: translateY(var(--bg-shift)) scale(1.34) !important; }
        header.hero { padding: 30px 18px 24px; background: linear-gradient(160deg, rgba(0,0,0,0.82), rgba(20,17,13,0.72)), radial-gradient(circle at 80% 22%, rgba(213,172,98,0.18), transparent 26%); }
        .z-day-nav { gap: 0.45rem; } .z-day-nav__label { flex: 1 0 100%; min-height: 32px; } .z-day-nav__link { flex: 1 1 0; padding-inline: 0.72rem; font-size: 0.82rem; }
        main { grid-template-columns: 1fr !important; gap: 14px; padding: 12px 12px 22px; }
        .card, .card--word, .card--history, .card--did_you_know, .card--sport, .card--phrase, .card--nissan_z_connection, .card--z_of_the_day, .card--z_games { grid-column: 1 / -1 !important; min-height: unset !important; padding: 1rem; border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.052), rgba(255,255,255,0.018)), rgba(10,10,10,0.84) !important; }
        .card-head { gap: 0.75rem; margin-bottom: 0.7rem; } .icon-badge { width: 38px; height: 38px; border-radius: 12px; } .card-image-wrap { margin-top: 0; border-radius: 14px; } .card-image { aspect-ratio: 16 / 10; } .body { font-size: 0.95rem; line-height: 1.58; }
    }
""".replace("__BG__", BACKGROUND_IMAGE_DATA_URL)

EXTRA_JS = """
    (function () {
        const hero = document.querySelector("header.hero");
        if (!hero || document.querySelector(".z-day-nav")) return;
        function pad(value) { return String(value).padStart(2, "0"); }
        function parseDate(value) {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
            if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            const today = new Date();
            return new Date(today.getFullYear(), today.getMonth(), today.getDate());
        }
        function toIsoDate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
        function buildHref(offset, useToday) {
            const params = new URLSearchParams(window.location.search);
            const base = useToday ? parseDate(null) : parseDate(params.get("date"));
            base.setDate(base.getDate() + offset);
            params.set("theme", "nissan_z");
            params.set("date", toIsoDate(base));
            params.delete("seed");
            return `${window.location.pathname}?${params.toString()}`;
        }
        const nav = document.createElement("nav");
        nav.className = "z-day-nav";
        nav.setAttribute("aria-label", "Nissan Z Daily date navigation");
        nav.innerHTML = `
            <span class="z-day-nav__label">Daily controls</span>
            <a class="z-day-nav__link" href="${buildHref(-1, false)}" aria-label="Show previous day">← Previous day</a>
            <a class="z-day-nav__link z-day-nav__link--today" href="${buildHref(0, true)}" aria-label="Show today">Today</a>
            <a class="z-day-nav__link" href="${buildHref(1, false)}" aria-label="Show next day">Next day →</a>
        `;
        const heroMeta = hero.querySelector(".hero-meta");
        if (heroMeta) heroMeta.insertAdjacentElement("afterend", nav);
        else hero.appendChild(nav);
    })();
"""

THEME_CONFIG = {
    "page_title": "Nissan Z Daily — Heritage, horsepower, and garage lore",
    "header_title": "Nissan Z Daily 🏁",
    "header_subtitle": "A Daily Flyer theme for the Z-car family: 240Z roots, Fairlady heritage, turbo eras, chassis codes, video-game appearances, and enthusiast garage notes.",
    "footer_text": "Built on Daily Flyer. Nissan Z theme prototype.",
    "hero_kicker": "Daily Flyer • Z-Car Edition",
    "hero_summary_pill": "Heritage • specs • driver notes • game garage",
    "word_eyebrow": "Garage Term",
    "phrase_eyebrow": "Driver Note",
    "history_eyebrow": "Z History",
    "history_today_title": "This Day in Z History",
    "history_week_title": "This Week in Z History",
    "did_you_know_eyebrow": "Z Lore",
    "did_you_know_title": "Did You Know?",
    "sport_eyebrow": "Driver's Briefing",
    "sport_title": "Today's Garage Pick",
    "connection_eyebrow": "Generation Spotlight",
    "connection_title": "Z-Car Connection",
    "connection_card_type": "nissan_z_connection",
    "enable_word_card": True,
    "enable_phrase_card": True,
    "enable_history_card": True,
    "enable_did_you_know_card": True,
    "enable_sport_card": True,
    "enable_connection_card": True,
    "enable_county_card": False,
    "use_provider_sport": False,
    "use_provider_connection": False,
    "use_provider_county": False,
    "min_optional_cards": 5,
    "max_optional_cards": 7,
    "pinned_card_types": ["z_of_the_day", "nissan_z_connection"],
    "extra_css": EXTRA_CSS,
    "extra_js": EXTRA_JS,
}

WORDS = [
    {"native_text": "S30", "pronunciation": "ess-thirty", "english": "The original Z-car chassis family, best known through the Datsun 240Z, 260Z, and 280Z."},
    {"native_text": "Fairlady Z", "pronunciation": "fair-lay-dee zee", "english": "The Japanese-market name for the Z line; overseas cars were often sold as Datsun or Nissan Z models."},
    {"native_text": "Long hood, short deck", "pronunciation": "classic sports-car proportions", "english": "The visual formula that gives the Z its coupe stance: engine pushed ahead of the cabin, compact rear, and fastback energy."},
    {"native_text": "VG30DETT", "pronunciation": "vee-gee thirty dee-ee tee-tee", "english": "The twin-turbo V6 used in the Z32 300ZX Twin Turbo, a major technology leap for the Z family."},
    {"native_text": "VR30DDTT", "pronunciation": "vee-arr thirty dee-dee tee-tee", "english": "The twin-turbo V6 used in the modern RZ34 Nissan Z, tying the newest car back to the turbo-Z tradition."},
    {"native_text": "Heel-toe", "pronunciation": "driver footwork", "english": "A downshifting technique that matches engine speed while braking, keeping the car settled before turn-in."},
    {"native_text": "Apex", "pronunciation": "AY-peks", "english": "The clipping point of a corner; hit it cleanly and the Z feels tidy, balanced, and eager on exit."},
    {"native_text": "Limited-slip differential", "pronunciation": "L-S-D", "english": "A differential that helps both driven wheels share torque, especially useful when powering out of corners."},
    {"native_text": "T-top", "pronunciation": "tee-top", "english": "Removable roof panels that became a signature look on some Z31 and Z32 cars."},
    {"native_text": "2+2", "pronunciation": "two plus two", "english": "A longer Z-body layout with small rear seats, trading some pure coupe compactness for extra practicality."},
    {"native_text": "Boost", "pronunciation": "turbo pressure", "english": "Pressurized intake air from a turbocharger; in Z language, it usually means the fun is arriving quickly."},
    {"native_text": "Chassis code", "pronunciation": "platform shorthand", "english": "The internal generation label enthusiasts use: S30, S130, Z31, Z32, Z33, Z34, and RZ34."},
]

PHRASES = [
    {"native_text": "Respect the chassis code.", "pronunciation": "garage rule", "english": "Every Z generation has its own personality; the code is the shortcut to knowing which one you are talking about."},
    {"native_text": "Keep the long hood honest.", "pronunciation": "driver note", "english": "The Z shape looks dramatic, but the point is still balance, visibility, and confidence from the driver's seat."},
    {"native_text": "Save the manuals.", "pronunciation": "enthusiast motto", "english": "A reminder that a clutch pedal and a clean shift are still a huge part of the Z-car appeal."},
    {"native_text": "Grand touring counts too.", "pronunciation": "Z philosophy", "english": "Some Z cars lean raw and sporty; others lean comfortable and quick. Both sides are part of the lineage."},
    {"native_text": "Do not skip the tires.", "pronunciation": "first mod advice", "english": "Before chasing more power, the right tire setup often gives the biggest real-world improvement."},
    {"native_text": "The badge is small; the shadow is long.", "pronunciation": "heritage note", "english": "The Z does not need exotic-car drama to matter. Its reputation comes from decades of accessible performance."},
]

HISTORY_THIS_DAY = {
    "08-17": {"body": "2021 — Nissan revealed the modern Z for the U.S. market, bringing back a turbocharged six-cylinder Z with an available manual transmission. The RZ34 leaned hard into heritage cues while updating the car around modern performance hardware.", "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)"},
    "10-22": {"body": "1969 — The original Fairlady Z / Datsun 240Z era began around the 1969 Tokyo Motor Show period. The S30 formula helped make the Z famous: handsome proportions, inline-six character, usable performance, and a price point that reached real enthusiasts.", "source_url": "https://en.wikipedia.org/wiki/Nissan_S30"},
}

HISTORY_WEEK_EVENTS = [
    {"month": 1, "day": 1, "title": "S30 Sets the Template", "body": "The Datsun 240Z reached buyers for the 1970 model year and helped define what an attainable Japanese sports car could be. Its long hood, hatchback practicality, and inline-six power made the Z name stick fast.", "source_url": "https://en.wikipedia.org/wiki/Nissan_S30"},
    {"month": 3, "day": 1, "title": "280ZX Goes Grand Touring", "body": "The S130-generation 280ZX shifted the Z toward a more comfort-focused grand touring personality. It kept the Z silhouette but added more refinement, technology, and daily usability.", "source_url": "https://en.wikipedia.org/wiki/Nissan_S130"},
    {"month": 5, "day": 1, "title": "350Z Revival", "body": "After a pause in the U.S. market, the 350Z revived the Z name for a new era. The Z33 generation put the focus back on a front-engine, rear-drive coupe with a strong V6 and relatively simple enthusiast appeal.", "source_url": "https://en.wikipedia.org/wiki/Nissan_350Z"},
    {"month": 7, "day": 1, "title": "370Z Sharpens the Formula", "body": "The 370Z shortened and tightened the 350Z formula while adding a larger 3.7-liter V6. It became one of the longest-running modern Z generations and kept the analog coupe vibe alive.", "source_url": "https://en.wikipedia.org/wiki/Nissan_370Z"},
    {"month": 8, "day": 17, "title": "Modern Z Reveal", "body": "The RZ34 Nissan Z reveal emphasized heritage without simply copying the past. Round headlight references, a fastback profile, and turbo power all nodded back to earlier Z eras.", "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)"},
    {"month": 9, "day": 1, "title": "Z32 Technology Era", "body": "The Z32 300ZX became a technology showcase for the Z family, especially in twin-turbo form. Its shape, multi-link suspension, and high-output V6 made it one of the defining Japanese performance cars of the 1990s.", "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX"},
    {"month": 10, "day": 22, "title": "Original Z Heritage", "body": "The first Z-car generation gave Nissan a global sports-car icon. Enthusiasts still use the S30 as the emotional reference point for what a Z should look and feel like.", "source_url": "https://en.wikipedia.org/wiki/Nissan_Z-car"},
    {"month": 11, "day": 1, "title": "Z31 Turbo Character", "body": "The Z31 300ZX brought wedge-shaped 1980s styling and widespread V6 identity to the Z line. Turbo versions helped carry the Z into the boost era before the more rounded Z32 arrived.", "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX"},
]

DID_YOU_KNOW = [
    "The Z-car lineage is often discussed by chassis code because the personality shifts so much generation to generation: S30, S130, Z31, Z32, Z33, Z34, and RZ34 all mean something different to enthusiasts.",
    "The Fairlady Z name comes from Nissan's Japanese-market naming tradition; many export markets knew the same family through Datsun or Nissan Z badging.",
    "The original 240Z succeeded partly because it blended style, reliability, usable luggage space, and performance at a price many sports-car buyers could actually reach.",
    "The Z32 300ZX Twin Turbo became famous for combining big power with advanced 1990s engineering, but that also means clean examples often reward careful maintenance history.",
    "A stock-looking Z can still be deeply modified underneath. Suspension, bushings, tires, brakes, and differential changes often transform the car before any engine work does.",
    "The 350Z and 370Z helped keep the front-engine, rear-drive Japanese sports coupe alive during years when many affordable performance cars moved toward front-wheel drive or all-wheel drive.",
    "The modern Nissan Z's design borrows emotional cues from multiple eras rather than one car: S30-style round headlight impressions, Z32-style rear lighting influence, and classic fastback proportions.",
    "Z owners often debate whether the line is best understood as a sports car or a grand tourer. The honest answer is that Nissan has used both personalities across different generations.",
    "The 'Z' name carries a tuning culture around it: clean restorations, period-correct builds, drift setups, track builds, and tasteful street cars all live under the same umbrella.",
    "A manual transmission is not just a spec-sheet item for many Z fans. It is part of the car's identity as an accessible driver-focused coupe.",
]

SPORTS_SPOTLIGHT = [
    "Garage pick: compare the Z32 300ZX Twin Turbo and the RZ34 Nissan Z as two answers to the same question — what should a turbocharged Z feel like?",
    "Setup note: tires, brake fluid, and alignment often matter more than horsepower for making a Z enjoyable on a back road or track day.",
    "Design watch: the original S30 profile is still the reference — long hood, fastback roof, short tail, and just enough visual aggression.",
    "Ownership note: older Z cars can hide rust, tired bushings, old wiring, and deferred maintenance. The cleanest build usually starts with the cleanest shell.",
    "Weekend thought: a stock Z is not automatically boring. Sometimes the most satisfying version is the one that feels tight, healthy, and coherent.",
    "Mod path: start with maintenance, then tires and brakes, then suspension, then power. A Z that drives well beats a Z that only makes a number.",
]

CONNECTION_FACTS = [
    {"title": "S30: The Origin Story", "body": "The S30 is the emotional center of the Z universe. It gave the line the long-hood fastback silhouette, approachable performance, and global reputation that later generations kept referencing.", "source_url": "https://en.wikipedia.org/wiki/Nissan_S30"},
    {"title": "Z31: The Wedge Years", "body": "The Z31 300ZX made the Z feel unmistakably 1980s, with angular styling, V6 identity, and turbocharged versions that carried the badge into a new performance decade.", "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX"},
    {"title": "Z32: The Tech Hero", "body": "The Z32 300ZX was sleek, complex, and serious. Twin-turbo models showed how far the Z could move from simple sports coupe toward high-performance technology showcase.", "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX"},
    {"title": "Z33: The Comeback", "body": "The 350Z brought the Z name back with a simpler front-engine, rear-drive formula. It mattered because it made the Z feel attainable and relevant again.", "source_url": "https://en.wikipedia.org/wiki/Nissan_350Z"},
    {"title": "Z34: Analog Holdout", "body": "The 370Z stuck around long enough to become a symbol of old-school coupe character. Hydraulic steering feel, compact dimensions, and naturally aspirated V6 personality became part of its appeal.", "source_url": "https://en.wikipedia.org/wiki/Nissan_370Z"},
    {"title": "RZ34: Heritage Remix", "body": "The modern Z combines a turbocharged V6 with heritage design references and an available manual transmission. It is less a clean-sheet reset than a deliberate remix of the Z story.", "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)"},
]

EXTRA_CARD_POOLS = [
    {
        "card_type": "z_of_the_day",
        "eyebrow": "Z of the Day",
        "title": "Nissan Z year / car / fact",
        "items": [
            {"title": "1970 Datsun 240Z", "body": "The original U.S.-market 240Z is the cleanest expression of the Z idea: a simple inline-six, rear-wheel drive, hatchback practicality, and styling that looked far more expensive than it was.", "source_url": "https://en.wikipedia.org/wiki/Nissan_S30", "image_url": _svg_image("1970 Datsun 240Z", "S30 • original template")},
            {"title": "1984 300ZX Z31", "body": "The Z31 300ZX traded the early Z's rounded sports-car innocence for wedge-shaped 1980s confidence. It helped move the Z identity toward V6 power, turbo options, and grand-touring comfort.", "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX", "image_url": _svg_image("1984 300ZX Z31", "wedge era • turbo attitude", "#c08a43")},
            {"title": "1990 300ZX Z32", "body": "The Z32 reset the Z's image with a low, wide body and serious technology. Twin-turbo cars became the poster-child version, but the whole generation feels like Nissan aiming the Z at the top tier.", "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX", "image_url": _svg_image("1990 300ZX Z32", "tech hero • twin-turbo legend", "#d72f2f")},
            {"title": "2003 350Z", "body": "The 350Z brought the Z back after a U.S. market pause. It was not trying to be delicate; it was muscular, relatively simple, and built around front-engine, rear-drive fundamentals.", "source_url": "https://en.wikipedia.org/wiki/Nissan_350Z", "image_url": _svg_image("2003 350Z", "the comeback • Z33", "#d5ac62")},
            {"title": "2009 370Z", "body": "The 370Z tightened the 350Z formula with a shorter body, a larger V6, and a more compact feel. Over time it became a modern analog holdout in a world of increasingly digital performance cars.", "source_url": "https://en.wikipedia.org/wiki/Nissan_370Z", "image_url": _svg_image("2009 370Z", "analog holdout • Z34", "#b08a45")},
            {"title": "2023 Nissan Z", "body": "The modern Z uses turbo power and heritage styling to reconnect with multiple earlier eras at once. It is a modern car, but the emotional pitch is classic: coupe, manual option, rear-wheel drive, and boost.", "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)", "image_url": _svg_image("2023 Nissan Z", "RZ34 • heritage remix", "#d72f2f")},
        ],
    },
    {
        "card_type": "z_games",
        "eyebrow": "Z in Video Games",
        "title": "Digital Garage",
        "items": [
            {"title": "Gran Turismo Garage Staple", "body": "Gran Turismo helped turn Japanese performance cars into bedroom-wall cars for a generation of players. The Z fits that world perfectly because the series rewards learning generations, specs, tuning, and driving feel.", "source_url": "https://en.wikipedia.org/wiki/Gran_Turismo_(series)", "image_url": _svg_image("Gran Turismo", "digital garage • spec culture", "#d5ac62")},
            {"title": "Need for Speed: 350Z Energy", "body": "The 350Z became one of the cars people associate with the tuner-game era. In a Daily Flyer card, it is a great bridge between real Z heritage and the neon, body-kit, street-racing imagination of the early 2000s.", "source_url": "https://en.wikipedia.org/wiki/Nissan_350Z", "image_url": _svg_image("Need for Speed", "350Z • tuner era", "#d72f2f")},
            {"title": "Forza: Build It Your Way", "body": "Forza-style sandbox racing suits the Z because the car can be anything: restored classic, drift missile, track coupe, highway pull car, or photo-mode hero. That flexibility mirrors real Z ownership culture.", "source_url": "https://en.wikipedia.org/wiki/Forza_(series)", "image_url": _svg_image("Forza Builds", "restore • drift • track", "#b08a45")},
            {"title": "Tokyo Xtreme Racer Mood", "body": "The Z belongs naturally in highway-battle game culture: low coupe profile, strong tuning identity, and enough generations to create rival builds. It is the kind of car that feels right under city lights.", "source_url": "https://en.wikipedia.org/wiki/Tokyo_Xtreme_Racer", "image_url": _svg_image("Tokyo Xtreme", "night highway • rival builds", "#d5ac62")},
            {"title": "Drift Game Favorite", "body": "The Z33 and Z34 generations make sense in drift games because they are front-engine, rear-drive, reasonably powerful, and visually recognizable. A sideways Z is basically a shortcut to saying 'driver car.'", "source_url": "https://en.wikipedia.org/wiki/Nissan_Z-car", "image_url": _svg_image("Drift Game Favorite", "FR layout • sideways Z", "#d72f2f")},
        ],
    },
]

BACKGROUND_CADENCE = "daily"
BACKGROUNDS = [{"path": BACKGROUND_IMAGE_DATA_URL, "label": "User-provided Nissan Z studio background"}]
