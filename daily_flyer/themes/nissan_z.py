from __future__ import annotations

ENABLE_DYNAMIC_WORD = False

THEME_CONFIG = {
    "page_title": "Nissan Z Daily — Heritage, horsepower, and garage lore",
    "header_title": "Nissan Z Daily 🏁",
    "header_subtitle": "A Daily Flyer theme for the Z-car family: 240Z roots, Fairlady heritage, turbo eras, chassis codes, and enthusiast garage notes.",
    "footer_text": "Built on Daily Flyer. Nissan Z theme prototype.",
    "hero_kicker": "Daily Flyer • Z-Car Edition",
    "hero_summary_pill": "Heritage • specs • driver notes",

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

    "min_optional_cards": 3,
    "max_optional_cards": 5,

    "extra_css": """
    :root {
        --bg: #08090b;
        --bg-deep: #020304;
        --bg-soft: #11141a;
        --card: rgba(14, 16, 21, 0.82);
        --card-strong: rgba(22, 24, 30, 0.92);
        --ink: #f5f7fa;
        --ink-soft: #c9d0d8;
        --muted: #a0a9b4;
        --irish-green: #e53935;
        --gold: #d7dde6;
        --teal: #9aa7b8;
        --blue: #c62828;
    }

    body {
        background:
            radial-gradient(circle at 12% 8%, rgba(229,57,53,0.28), transparent 28%),
            radial-gradient(circle at 86% 18%, rgba(215,221,230,0.18), transparent 26%),
            linear-gradient(120deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 100%),
            linear-gradient(180deg, #151820 0%, #08090b 48%, #020304 100%);
        background-size: auto, auto, 34px 34px, auto;
    }

    header.hero {
        background:
            linear-gradient(110deg, rgba(229,57,53,0.22), rgba(255,255,255,0.04) 34%, rgba(0,0,0,0.20) 68%, rgba(215,221,230,0.10)),
            radial-gradient(circle at 85% 22%, rgba(229,57,53,0.22), transparent 24%),
            linear-gradient(160deg, rgba(18,20,27,0.98), rgba(7,8,11,0.92));
    }

    header.hero::after {
        content: "Z";
        position: absolute;
        right: clamp(18px, 8vw, 86px);
        bottom: -0.18em;
        font-size: clamp(8rem, 22vw, 18rem);
        font-weight: 900;
        font-style: italic;
        letter-spacing: -0.16em;
        color: rgba(255,255,255,0.055);
        line-height: 0.8;
        pointer-events: none;
    }

    .hero h1 {
        max-width: 13ch;
        text-transform: uppercase;
    }

    .hero-kicker,
    .hero-pill {
        border-color: rgba(229,57,53,0.22);
        background: rgba(255,255,255,0.055);
    }

    .card::after {
        background: linear-gradient(90deg, #e53935, #f2f4f8, #5f6875);
    }

    .card--word {
        background: linear-gradient(180deg, rgba(229,57,53,0.18), rgba(255,255,255,0.025)), var(--card-strong);
    }

    .card--history {
        background: linear-gradient(180deg, rgba(215,221,230,0.14), rgba(255,255,255,0.02)), var(--card-strong);
    }

    .card--did_you_know,
    .card--nissan_z_connection {
        background: linear-gradient(180deg, rgba(198,40,40,0.16), rgba(255,255,255,0.02)), var(--card-strong);
    }

    .card--sport,
    .card--phrase {
        background:
            linear-gradient(135deg, rgba(255,255,255,0.05), rgba(229,57,53,0.08)),
            var(--card);
    }

    a { color: #ffb4ad; }
    """,
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
    "08-17": {
        "body": "2021 — Nissan revealed the modern Z for the U.S. market, bringing back a turbocharged six-cylinder Z with an available manual transmission. The RZ34 leaned hard into heritage cues while updating the car around modern performance hardware.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)",
    },
    "10-22": {
        "body": "1969 — The original Fairlady Z / Datsun 240Z era began around the 1969 Tokyo Motor Show period. The S30 formula helped make the Z famous: handsome proportions, inline-six character, usable performance, and a price point that reached real enthusiasts.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_S30",
    },
}


HISTORY_WEEK_EVENTS = [
    {
        "month": 1,
        "day": 1,
        "title": "S30 Sets the Template",
        "body": "The Datsun 240Z reached buyers for the 1970 model year and helped define what an attainable Japanese sports car could be. Its long hood, hatchback practicality, and inline-six power made the Z name stick fast.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_S30",
    },
    {
        "month": 3,
        "day": 1,
        "title": "280ZX Goes Grand Touring",
        "body": "The S130-generation 280ZX shifted the Z toward a more comfort-focused grand touring personality. It kept the Z silhouette but added more refinement, technology, and daily usability.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_S130",
    },
    {
        "month": 5,
        "day": 1,
        "title": "350Z Revival",
        "body": "After a pause in the U.S. market, the 350Z revived the Z name for a new era. The Z33 generation put the focus back on a front-engine, rear-drive coupe with a strong V6 and relatively simple enthusiast appeal.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_350Z",
    },
    {
        "month": 7,
        "day": 1,
        "title": "370Z Sharpens the Formula",
        "body": "The 370Z shortened and tightened the 350Z formula while adding a larger 3.7-liter V6. It became one of the longest-running modern Z generations and kept the analog coupe vibe alive.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_370Z",
    },
    {
        "month": 8,
        "day": 17,
        "title": "Modern Z Reveal",
        "body": "The RZ34 Nissan Z reveal emphasized heritage without simply copying the past. Round headlight references, a fastback profile, and turbo power all nodded back to earlier Z eras.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)",
    },
    {
        "month": 9,
        "day": 1,
        "title": "Z32 Technology Era",
        "body": "The Z32 300ZX became a technology showcase for the Z family, especially in twin-turbo form. Its shape, multi-link suspension, and high-output V6 made it one of the defining Japanese performance cars of the 1990s.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX",
    },
    {
        "month": 10,
        "day": 22,
        "title": "Original Z Heritage",
        "body": "The first Z-car generation gave Nissan a global sports-car icon. Enthusiasts still use the S30 as the emotional reference point for what a Z should look and feel like.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_Z-car",
    },
    {
        "month": 11,
        "day": 1,
        "title": "Z31 Turbo Character",
        "body": "The Z31 300ZX brought wedge-shaped 1980s styling and widespread V6 identity to the Z line. Turbo versions helped carry the Z into the boost era before the more rounded Z32 arrived.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX",
    },
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
    {
        "title": "S30: The Origin Story",
        "body": "The S30 is the emotional center of the Z universe. It gave the line the long-hood fastback silhouette, approachable performance, and global reputation that later generations kept referencing.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_S30",
    },
    {
        "title": "Z31: The Wedge Years",
        "body": "The Z31 300ZX made the Z feel unmistakably 1980s, with angular styling, V6 identity, and turbocharged versions that carried the badge into a new performance decade.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX",
    },
    {
        "title": "Z32: The Tech Hero",
        "body": "The Z32 300ZX was sleek, complex, and serious. Twin-turbo models showed how far the Z could move from simple sports coupe toward high-performance technology showcase.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_300ZX",
    },
    {
        "title": "Z33: The Comeback",
        "body": "The 350Z brought the Z name back with a simpler front-engine, rear-drive formula. It mattered because it made the Z feel attainable and relevant again.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_350Z",
    },
    {
        "title": "Z34: Analog Holdout",
        "body": "The 370Z stuck around long enough to become a symbol of old-school coupe character. Hydraulic steering feel, compact dimensions, and naturally aspirated V6 personality became part of its appeal.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_370Z",
    },
    {
        "title": "RZ34: Heritage Remix",
        "body": "The modern Z combines a turbocharged V6 with heritage design references and an available manual transmission. It is less a clean-sheet reset than a deliberate remix of the Z story.",
        "source_url": "https://en.wikipedia.org/wiki/Nissan_Z_(RZ34)",
    },
]


BACKGROUND_CADENCE = "daily"
BACKGROUNDS = []
