from __future__ import annotations

"""
Galaxy Granite Daily.

A deliberately simple Daily Flyer theme that behaves like a lightweight blog:
one useful homeowner article, a few related topics, a concise project process,
and a clear route back to the Galaxy Granite website.
"""

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_CONFIG = {
    "page_title": "Galaxy Granite Journal — Countertop Ideas & Project Guidance",
    "header_title": "Countertop Ideas, Made Simple",
    "header_subtitle": (
        '<div class="gg-hero-copy">'
        '<p>A simple daily read from the world of countertops: practical guidance, '
        'material ideas, project planning, and details that help homeowners make confident choices.</p>'
        '<nav class="gg-blog-nav" aria-label="Journal navigation">'
        '<button type="button" data-gg-day="-1">← Previous topic</button>'
        '<a href="https://www.galaxygranite.com/blog/">Visit the full blog</a>'
        '<button type="button" data-gg-day="1">Next topic →</button>'
        '</nav>'
        '</div>'
    ),
    "footer_text": (
        "Galaxy Granite Journal is a Daily Flyer concept: a much simpler companion page "
        "for useful posts and topics related to countertops, materials, and installation."
    ),
    "hero_kicker": "Galaxy Granite • Simple Blog Concept",
    "hero_summary_pill": "Ideas • Materials • Planning • Care",
}


GALAXY_GRANITE_CSS = """
:root {
    --gg-ink: #151515;
    --gg-charcoal: #272727;
    --gg-stone: #6e6b66;
    --gg-paper: #fbfaf7;
    --gg-warm: #eee8dc;
    --gg-gold: #b79255;
    --gg-gold-soft: #e7d8bc;
    --gg-line: rgba(21, 21, 21, 0.12);
    --gg-shadow: 0 18px 48px rgba(34, 31, 26, 0.10);
    color-scheme: light;
}

html,
body {
    color-scheme: light !important;
}

body {
    font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    color: var(--gg-ink) !important;
    background:
        radial-gradient(circle at 82% 8%, rgba(183, 146, 85, 0.13), transparent 24rem),
        linear-gradient(180deg, #f4f1eb 0 170px, var(--gg-paper) 170px 100%) !important;
}

.site-bg {
    display: none !important;
}

body::before,
body::after {
    content: none !important;
}

.hero-wrap {
    padding-top: 24px !important;
}

header.hero {
    position: relative;
    min-height: 390px;
    padding: clamp(2.4rem, 5vw, 4.8rem) clamp(1.4rem, 5vw, 4.8rem) !important;
    border: 1px solid rgba(255, 255, 255, 0.10) !important;
    border-radius: 6px !important;
    color: #ffffff !important;
    background:
        linear-gradient(105deg, rgba(15, 15, 15, 0.97), rgba(38, 37, 34, 0.91)),
        repeating-linear-gradient(118deg, transparent 0 28px, rgba(255,255,255,0.025) 28px 30px) !important;
    box-shadow: var(--gg-shadow) !important;
    overflow: hidden;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

header.hero::before {
    content: "";
    position: absolute;
    inset: 0 0 0 auto;
    width: min(42%, 480px);
    background:
        radial-gradient(ellipse at 28% 24%, rgba(255,255,255,0.18), transparent 26%),
        radial-gradient(ellipse at 74% 68%, rgba(183,146,85,0.24), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0));
    clip-path: polygon(22% 0, 100% 0, 100% 100%, 0 100%);
    pointer-events: none;
}

header.hero::after {
    content: "";
    position: absolute;
    top: 0;
    right: 12%;
    width: 2px;
    height: 100%;
    background: linear-gradient(180deg, transparent, rgba(231,216,188,0.65), transparent);
    transform: rotate(14deg);
    pointer-events: none;
}

.hero-kicker,
.hero h1,
.hero .subtitle,
.hero-meta {
    position: relative;
    z-index: 2;
    max-width: min(780px, 76%);
}

.hero-kicker {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--gg-gold-soft) !important;
    font-size: 0.76rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.16em !important;
    text-transform: uppercase;
}

.hero h1 {
    margin-top: 1.05rem !important;
    color: #ffffff !important;
    font-family: "Cormorant Garamond", Georgia, serif !important;
    font-size: clamp(3rem, 7vw, 6.2rem) !important;
    font-weight: 600 !important;
    line-height: 0.93 !important;
    letter-spacing: -0.045em !important;
    text-shadow: none !important;
}

.hero h1::after {
    content: "";
    display: block;
    width: 86px;
    height: 3px;
    margin-top: 1rem;
    background: var(--gg-gold);
}

.hero .subtitle,
.gg-hero-copy p {
    color: rgba(255, 255, 255, 0.83) !important;
    font-size: clamp(1rem, 1.4vw, 1.16rem) !important;
    line-height: 1.72 !important;
}

.gg-hero-copy p {
    margin: 0;
}

.gg-blog-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 1.25rem;
}

.gg-blog-nav button,
.gg-blog-nav a,
.gg-inline-link,
.gg-cta-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0.64rem 0.9rem;
    border: 1px solid rgba(255,255,255,0.20);
    border-radius: 2px;
    background: rgba(255,255,255,0.07);
    color: #ffffff !important;
    font: inherit;
    font-size: 0.84rem;
    font-weight: 750;
    text-decoration: none !important;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.gg-blog-nav button:hover,
.gg-blog-nav a:hover {
    background: rgba(255,255,255,0.14);
    border-color: rgba(231,216,188,0.72);
    transform: translateY(-1px);
}

.hero-pill {
    border: 1px solid rgba(255,255,255,0.16) !important;
    background: rgba(255,255,255,0.08) !important;
    color: #ffffff !important;
}

main {
    padding-top: 30px !important;
    padding-bottom: 40px !important;
}

.card {
    min-height: 220px;
    padding: clamp(1.25rem, 2vw, 1.7rem) !important;
    border: 1px solid var(--gg-line) !important;
    border-radius: 5px !important;
    background: rgba(255,255,255,0.96) !important;
    color: var(--gg-ink) !important;
    box-shadow: 0 12px 32px rgba(34,31,26,0.065) !important;
    transform: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

.card:hover {
    transform: none !important;
    border-color: rgba(183,146,85,0.42) !important;
    box-shadow: 0 18px 40px rgba(34,31,26,0.09) !important;
}

.card::before {
    background: none !important;
}

.card::after {
    height: 4px !important;
    background: var(--gg-gold) !important;
}

.card-head {
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--gg-line);
}

.eyebrow {
    color: var(--gg-gold) !important;
    font-size: 0.73rem !important;
    font-weight: 850 !important;
    letter-spacing: 0.13em !important;
    text-transform: uppercase;
}

.card h2,
.card h3,
.card-title {
    color: var(--gg-ink) !important;
    font-family: "Cormorant Garamond", Georgia, serif !important;
    letter-spacing: -0.025em !important;
}

.card-body {
    color: #3b3935 !important;
    line-height: 1.72 !important;
}

.card-body p {
    margin: 0 0 0.95rem;
}

.card--gg_feature {
    grid-column: span 8;
    min-height: 440px;
}

.card--gg_project_note {
    grid-column: span 4;
    background: linear-gradient(180deg, #2c2b29, #1f1f1e) !important;
    color: #ffffff !important;
}

.card--gg_project_note .card-head {
    border-color: rgba(255,255,255,0.12);
}

.card--gg_project_note h2,
.card--gg_project_note h3,
.card--gg_project_note .card-title,
.card--gg_project_note .card-body {
    color: #ffffff !important;
}

.card--gg_project_note .card-body {
    color: rgba(255,255,255,0.78) !important;
}

.card--gg_topic {
    grid-column: span 4;
}

.card--gg_process,
.card--gg_cta {
    grid-column: span 12;
}

.card--gg_process {
    background: linear-gradient(180deg, #f6f2ea, #ffffff) !important;
}

.card--gg_cta {
    min-height: 180px;
    background: linear-gradient(115deg, #171717, #34312d) !important;
}

.card--gg_cta .card-head {
    border-color: rgba(255,255,255,0.12);
}

.card--gg_cta h2,
.card--gg_cta h3,
.card--gg_cta .card-title,
.card--gg_cta .card-body {
    color: #ffffff !important;
}

.card--gg_cta .card-body {
    color: rgba(255,255,255,0.82) !important;
}

.gg-post-meta,
.gg-topic-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 1rem;
}

.gg-chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0.3rem 0.6rem;
    border: 1px solid rgba(183,146,85,0.34);
    border-radius: 999px;
    background: #faf6ee;
    color: #695636;
    font-size: 0.74rem;
    font-weight: 760;
}

.gg-dek {
    margin: 0 0 1.2rem !important;
    color: var(--gg-stone);
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: clamp(1.35rem, 2.2vw, 1.85rem);
    line-height: 1.3;
}

.gg-takeaways {
    margin: 1.2rem 0 1.35rem;
    padding: 1rem 1.1rem 0.95rem 2.1rem;
    border-left: 3px solid var(--gg-gold);
    background: #faf7f1;
}

.gg-takeaways li + li {
    margin-top: 0.5rem;
}

.gg-inline-link,
.gg-cta-link {
    border-color: var(--gg-ink);
    background: var(--gg-ink);
    color: #ffffff !important;
}

.gg-inline-link:hover,
.gg-cta-link:hover {
    background: #383632;
    transform: translateY(-1px);
}

.gg-note {
    padding: 1.05rem;
    border: 1px solid rgba(255,255,255,0.13);
    background: rgba(255,255,255,0.055);
    font-size: 1.02rem;
}

.gg-note strong {
    color: var(--gg-gold-soft);
}

.gg-topic-excerpt {
    margin-bottom: 1rem !important;
}

.gg-process-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
}

.gg-process-step {
    padding: 1rem;
    border: 1px solid var(--gg-line);
    background: rgba(255,255,255,0.74);
}

.gg-process-number {
    display: block;
    margin-bottom: 0.45rem;
    color: var(--gg-gold);
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 2rem;
    font-weight: 650;
}

.gg-process-step strong {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--gg-ink);
}

.gg-cta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.1rem;
}

.gg-cta-row p {
    max-width: 720px;
    margin: 0 !important;
}

footer {
    color: #5b5750 !important;
}

@media (max-width: 920px) {
    .hero-kicker,
    .hero h1,
    .hero .subtitle,
    .hero-meta {
        max-width: 100%;
    }

    header.hero::before,
    header.hero::after {
        opacity: 0.55;
    }

    .card--gg_feature,
    .card--gg_project_note,
    .card--gg_topic {
        grid-column: span 12;
    }
}

@media (max-width: 720px) {
    .hero-wrap {
        padding-top: 12px !important;
    }

    header.hero {
        min-height: 0;
        padding: 2rem 1.15rem !important;
    }

    .hero h1 {
        font-size: clamp(2.7rem, 14vw, 4.4rem) !important;
    }

    .gg-blog-nav {
        display: grid;
        grid-template-columns: 1fr;
    }

    .gg-blog-nav button,
    .gg-blog-nav a {
        width: 100%;
    }

    .gg-process-grid {
        grid-template-columns: 1fr;
    }

    .gg-cta-row {
        align-items: stretch;
        flex-direction: column;
    }

    .gg-cta-link {
        width: 100%;
    }
}
"""


GALAXY_GRANITE_JS = """
(function () {
    function shiftDate(delta) {
        const url = new URL(window.location.href);
        const raw = url.searchParams.get("date");
        const current = raw ? new Date(raw + "T12:00:00") : new Date();
        if (Number.isNaN(current.getTime())) return;
        current.setDate(current.getDate() + delta);
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, "0");
        const day = String(current.getDate()).padStart(2, "0");
        url.searchParams.set("date", year + "-" + month + "-" + day);
        if (!url.searchParams.get("theme")) {
            url.searchParams.set("theme", "galaxy_granite_daily");
        }
        window.location.href = url.toString();
    }

    document.querySelectorAll("[data-gg-day]").forEach(function (button) {
        button.addEventListener("click", function () {
            shiftDate(Number(button.dataset.ggDay || 0));
        });
    });
})();
"""


POSTS = [
    {
        "category": "Materials",
        "title": "Quartz or Granite? Start With How You Actually Use the Kitchen",
        "dek": "The best countertop choice is usually less about finding a universal winner and more about matching the material to the way your household cooks, cleans, gathers, and lives.",
        "paragraphs": [
            "Granite is a natural stone, so every slab carries its own movement, color variation, and mineral pattern. Quartz is engineered for a more controlled appearance and a broad range of consistent designs. Both can create an excellent kitchen when the selection fits the space and the owner’s expectations.",
            "Begin with the daily realities. Think about the amount of cooking, the likelihood of spills, the look you want across a long run of cabinets, and how comfortable you are with routine care. A showroom visit is valuable because small samples cannot fully show scale, movement, or how a surface reacts to your room’s lighting.",
        ],
        "takeaways": [
            "Choose from full slabs or large samples whenever possible.",
            "Use trivets and cutting boards regardless of the surface.",
            "Ask what care the exact material and manufacturer recommend.",
        ],
        "note": "Bring cabinet, floor, paint, and backsplash samples together. A stone can look very different when the surrounding colors are finally in the same light.",
        "url": "https://www.galaxygranite.com/natural-stone/",
        "link_label": "Browse natural stone",
        "tags": ["Granite", "Quartz", "Planning"],
    },
    {
        "category": "Project Planning",
        "title": "What to Have Ready Before a Countertop Template Appointment",
        "dek": "A smooth template starts before the measuring equipment comes out. Final decisions on cabinets, appliances, sinks, faucets, and overhangs reduce guesswork later.",
        "paragraphs": [
            "Countertops are fabricated to the conditions measured in the room, so the supporting cabinets should be installed, secured, and ready for accurate templating. Appliances that affect the countertop opening or clearance should be selected, and sink or cooktop specifications should be available.",
            "This is also the right time to confirm practical details: faucet holes, soap dispensers, backsplash plans, edge profile, seam preferences, and where people will sit at an island. The goal is not to make the appointment complicated. It is to prevent small unresolved choices from becoming costly changes after fabrication begins.",
        ],
        "takeaways": [
            "Confirm cabinets are installed and level.",
            "Have sink, cooktop, and faucet information available.",
            "Decide edge, backsplash, overhang, and accessory-hole details.",
        ],
        "note": "Write down every fixture that passes through the countertop. Faucet, sprayer, soap dispenser, filtered-water tap, and air switch are easy to forget when decisions are made separately.",
        "url": "https://www.galaxygranite.com/services/",
        "link_label": "See installation services",
        "tags": ["Template", "Measurements", "Installation"],
    },
    {
        "category": "Design Detail",
        "title": "Countertop Edges: The Small Choice You See Every Day",
        "dek": "An edge profile changes how thick, formal, soft, or modern a countertop feels—even when the slab itself stays exactly the same.",
        "paragraphs": [
            "Simple profiles such as pencil, eased, bevel, or quarter-radius edges keep the visual focus on the stone and often suit busy kitchens. More decorative profiles such as ogee, cove, or Dupont can add traditional character, especially on islands or furniture-style vanities.",
            "The decision should consider more than style. Think about cleaning, contact at high-traffic corners, the apparent thickness of the countertop, and whether the edge will continue around unusual shapes. Seeing a physical edge sample is far more useful than judging a small line drawing.",
        ],
        "takeaways": [
            "Simple edges tend to feel modern and understated.",
            "Rounded profiles can soften high-traffic corners.",
            "Decorative edges are strongest when they support the room’s overall style.",
        ],
        "note": "An island can use a more expressive edge while perimeter counters stay simple, but the two choices should still look intentional together.",
        "url": "https://www.galaxygranite.com/edge-profile/",
        "link_label": "Compare edge profiles",
        "tags": ["Edges", "Design", "Details"],
    },
    {
        "category": "Fabrication",
        "title": "Why Countertop Seams Are Planned, Not Merely Hidden",
        "dek": "A good seam strategy balances slab size, veining, cabinet support, access to the room, sink and cooktop openings, and the safest way to fabricate and install each piece.",
        "paragraphs": [
            "Large projects may require seams because slabs, doorways, stairwells, and installation paths all have physical limits. The strongest location is not always the least visible location, especially when an opening or unsupported span changes the structure of the piece.",
            "For patterned material, seam planning also involves visual flow. Fabricators look for ways to continue movement and avoid abrupt transitions where possible. A seam should be discussed as part of the layout rather than treated as a surprise discovered on installation day.",
        ],
        "takeaways": [
            "Review likely seam locations before fabrication.",
            "Ask how pattern movement will be handled.",
            "Remember that safe transport and support matter alongside appearance.",
        ],
        "note": "Photographs of the access path—from driveway to final room—can help identify tight corners, stairs, elevators, or door clearances early.",
        "url": "https://www.galaxygranite.com/featured-projects/",
        "link_label": "View completed projects",
        "tags": ["Seams", "Layout", "Craftsmanship"],
    },
    {
        "category": "Care",
        "title": "A Simple Countertop Care Routine Beats a Cabinet Full of Cleaners",
        "dek": "Most day-to-day care comes down to quick cleanup, a gentle cleaner appropriate for the surface, and avoiding habits that create unnecessary heat, impact, or abrasion.",
        "paragraphs": [
            "Use a soft cloth or sponge and follow the care guidance for the exact stone or engineered surface. Highly abrasive products and cleaners that are not intended for the material can dull finishes or damage protective treatments.",
            "Natural stone maintenance varies by stone and use, so ask whether and how often sealing is recommended. Engineered quartz is low-maintenance, but it is not an invitation to place hot cookware directly on the surface. Trivets, cutting boards, and prompt spill cleanup remain smart habits for any countertop.",
        ],
        "takeaways": [
            "Use cleaners approved for the exact surface.",
            "Wipe spills promptly, especially oils and strongly colored liquids.",
            "Protect against heat, knives, and heavy impact.",
        ],
        "note": "Keep the manufacturer or fabricator care sheet with your home records. It is more reliable than generic advice that treats every stone and finish the same.",
        "url": "https://www.galaxygranite.com/contact-us/",
        "link_label": "Ask about your material",
        "tags": ["Cleaning", "Maintenance", "Longevity"],
    },
    {
        "category": "Fixtures",
        "title": "Choose the Sink Before the Stone Is Fabricated",
        "dek": "The sink affects the cutout, faucet placement, cabinet fit, reveal style, and reinforcement around one of the most heavily used areas of the countertop.",
        "paragraphs": [
            "Undermount, drop-in, workstation, and apron-front sinks each create different fabrication and cabinet requirements. Even sinks that appear to share the same nominal size can have different templates, radii, clips, and accessory rails.",
            "Finalize the actual model rather than relying on a general description such as “a 33-inch sink.” Confirm which accessories need holes through the stone and whether the faucet has clearance from the backsplash, window trim, or raised ledge behind it.",
        ],
        "takeaways": [
            "Provide the exact sink model and template.",
            "Confirm faucet and accessory-hole locations.",
            "Check cabinet and clearance requirements before templating.",
        ],
        "note": "A workstation sink may include ledges and accessories that change how the reveal should be planned. Discuss those details rather than assuming a standard cutout.",
        "url": "https://www.galaxygranite.com/sinks/",
        "link_label": "Explore sink options",
        "tags": ["Sinks", "Faucets", "Cutouts"],
    },
    {
        "category": "Outdoor Spaces",
        "title": "Outdoor Countertops Need Material Choices Built Around Exposure",
        "dek": "Sun, temperature swings, moisture, food preparation, and seasonal shutdowns make an outdoor countertop a different design problem from an indoor kitchen.",
        "paragraphs": [
            "Start by discussing whether the area is covered, how much direct sunlight it receives, and whether it will remain exposed through New England winters. Material performance, finish, color stability, and maintenance should all be evaluated for that specific environment.",
            "The surrounding construction matters too. Cabinets, grills, supports, drainage, and expansion clearances must work together. An attractive slab cannot compensate for an enclosure or substrate that is not designed for outdoor conditions.",
        ],
        "takeaways": [
            "Describe sun, rain, freeze, and cover conditions honestly.",
            "Confirm every product is approved for exterior use.",
            "Plan grill clearances, support, drainage, and seasonal care together.",
        ],
        "note": "Take photos at several times of day. Direct sun and reflected light can change both the practical material choice and how the color reads outdoors.",
        "url": "https://www.galaxygranite.com/services/",
        "link_label": "Review project services",
        "tags": ["Outdoors", "Weather", "Durability"],
    },
    {
        "category": "Design Planning",
        "title": "Let the Countertop and Backsplash Share the Room",
        "dek": "The strongest combinations usually establish a clear lead. When the countertop has dramatic movement, the backsplash often works best as support rather than competition.",
        "paragraphs": [
            "Start with scale. A small sample of a veined slab may look quiet even though the full slab carries bold movement across several feet. Likewise, a patterned tile can become much busier once repeated across an entire wall.",
            "Bring the materials together under the room’s real lighting. Decide whether the backsplash should repeat a color, soften contrast, or create a deliberate second focal point. The goal is not that everything match; it is that the visual hierarchy feels intentional.",
        ],
        "takeaways": [
            "Judge patterns at the size they will actually occupy.",
            "Choose which surface should be the primary focal point.",
            "Review samples in daylight and evening lighting.",
        ],
        "note": "Do not finalize grout color in isolation. It can either calm a patterned backsplash or outline every tile and make the wall much more active.",
        "url": "https://www.galaxygranite.com/featured-projects/",
        "link_label": "See stones in finished rooms",
        "tags": ["Backsplash", "Color", "Veining"],
    },
    {
        "category": "Getting a Quote",
        "title": "What Makes an Early Countertop Quote More Useful",
        "dek": "A rough sketch, approximate dimensions, photographs, material direction, and the project address can turn a vague request into a much more productive first conversation.",
        "paragraphs": [
            "The first quote does not require a fabrication-ready drawing, but it should describe the project clearly enough to understand scope. Include islands, backsplashes, waterfalls, unusual shapes, sink and cooktop openings, and whether old countertops need to be removed.",
            "Photographs provide context that dimensions alone cannot: cabinet condition, access, wall geometry, existing appliances, and nearby finishes. The estimate can then become more precise after material selection and professional measurement.",
        ],
        "takeaways": [
            "Send a simple top-down sketch with approximate dimensions.",
            "Include wide room photos and closeups of unusual conditions.",
            "Mention removal, plumbing, backsplash, and special edge details.",
        ],
        "note": "Label every wall and countertop run on the sketch. A rough drawing becomes far easier to discuss when both homeowner and estimator can refer to the same names.",
        "url": "https://www.galaxygranite.com/contact-us/",
        "link_label": "Start a quote request",
        "tags": ["Quote", "Photos", "Scope"],
    },
    {
        "category": "Project Expectations",
        "title": "A Countertop Project Has Three Different Kinds of Decisions",
        "dek": "Design choices, technical choices, and scheduling choices overlap—but separating them makes the project easier to manage.",
        "paragraphs": [
            "Design decisions include color, pattern, finish, edge, and backsplash relationship. Technical decisions include sink model, faucet holes, appliance openings, support, seams, and overhangs. Scheduling decisions include cabinet readiness, template access, fabrication, installation, and any plumbing reconnection.",
            "Problems often occur when one category is treated as though it belongs to another—for example, choosing a sink for appearance without confirming cabinet fit, or scheduling a template before the cabinets are ready. A short checklist organized by these three categories keeps the project moving without turning it into a complicated system.",
        ],
        "takeaways": [
            "Design: slab, finish, edge, and surrounding colors.",
            "Technical: openings, support, seams, and clearances.",
            "Schedule: readiness, access, installation, and follow-up trades.",
        ],
        "note": "Assign one person to keep the final model numbers, drawings, approvals, and appointment details together. A single source of truth prevents old choices from resurfacing.",
        "url": "https://www.galaxygranite.com/services/",
        "link_label": "Understand the process",
        "tags": ["Checklist", "Decisions", "Timeline"],
    },
]


def _chips(labels: list[str]) -> str:
    return '<div class="gg-post-meta">' + "".join(
        f'<span class="gg-chip">{label}</span>' for label in labels
    ) + "</div>"


def _takeaways(items: list[str]) -> str:
    return '<ul class="gg-takeaways">' + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


def _article_body(post: dict) -> str:
    paragraphs = "".join(f"<p>{paragraph}</p>" for paragraph in post["paragraphs"])
    return (
        _chips(post["tags"])
        + f'<p class="gg-dek">{post["dek"]}</p>'
        + paragraphs
        + _takeaways(post["takeaways"])
        + f'<a class="gg-inline-link" href="{post["url"]}">{post["link_label"]} →</a>'
    )


def _related_body(post: dict) -> str:
    return (
        f'<div class="gg-topic-meta"><span class="gg-chip">{post["category"]}</span></div>'
        f'<p class="gg-topic-excerpt">{post["dek"]}</p>'
        f'<a class="gg-inline-link" href="{post["url"]}">Explore this topic →</a>'
    )


def _process_body() -> str:
    return """
    <div class="gg-process-grid">
        <div class="gg-process-step">
            <span class="gg-process-number">1</span>
            <strong>Get a Quote</strong>
            <span>Share the project scope, approximate dimensions, photos, and material direction.</span>
        </div>
        <div class="gg-process-step">
            <span class="gg-process-number">2</span>
            <strong>Measure the Project</strong>
            <span>Once the space is ready, on-site measurements create the digital template used for fabrication.</span>
        </div>
        <div class="gg-process-step">
            <span class="gg-process-number">3</span>
            <strong>Fabricate &amp; Install</strong>
            <span>After measurements and details are finalized, the stone is fabricated and scheduled for installation.</span>
        </div>
    </div>
    """


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    selector = seed if seed is not None else today.toordinal()
    selected_index = selector % len(POSTS)
    featured = POSTS[selected_index]
    related = [
        POSTS[(selected_index + offset) % len(POSTS)]
        for offset in (1, 3, 6)
    ]

    cards = [
        CardItem(
            card_type="gg_feature",
            eyebrow=f'Today’s Article • {featured["category"]}',
            title=featured["title"],
            body=_article_body(featured),
        ),
        CardItem(
            card_type="gg_project_note",
            eyebrow="Project Note",
            title="One detail worth discussing early",
            body=f'<div class="gg-note"><strong>From today’s topic:</strong><br>{featured["note"]}</div>',
        ),
        *[
            CardItem(
                card_type="gg_topic",
                eyebrow="Related Topic",
                title=post["title"],
                body=_related_body(post),
            )
            for post in related
        ],
        CardItem(
            card_type="gg_process",
            eyebrow="The Simple Process",
            title="Quote → Measure → Fabricate & Install",
            body=_process_body(),
        ),
        CardItem(
            card_type="gg_cta",
            eyebrow="Have a Project in Mind?",
            title="Turn the idea into a useful first conversation",
            body=(
                '<div class="gg-cta-row">'
                '<p>Send Galaxy Granite a sketch, approximate dimensions, photographs, '
                'and any material ideas you already have. The first step can stay simple.</p>'
                '<a class="gg-cta-link" href="https://www.galaxygranite.com/contact-us/">Get a Quote →</a>'
                '</div>'
            ),
        ),
    ]

    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=cards,
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": "galaxy_granite_daily",
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": GALAXY_GRANITE_CSS,
            "extra_js": GALAXY_GRANITE_JS,
            "extra_head_html": (
                '<link rel="preconnect" href="https://fonts.googleapis.com">'
                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
                '<meta name="color-scheme" content="light">'
                '<meta name="theme-color" content="#f4f1eb">'
                '<meta name="description" content="A simple Galaxy Granite blog concept with practical countertop ideas, planning guidance, and related topics.">'
            ),
        },
    )
