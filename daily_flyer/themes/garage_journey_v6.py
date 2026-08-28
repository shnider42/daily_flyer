from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import garage_journey_v5 as base

THEME_NAME = "garage_journey_v6"
THEME_CONFIG = {
    **base.THEME_CONFIG,
    "header_subtitle": "A visual home for every car you own — identity, history, paperwork, and a deep technical workshop when you want it.",
}

BMW_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/2004_BMW_330Ci_Coupe.jpg/960px-2004_BMW_330Ci_Coupe.jpg"
BMW_SOURCE = "https://commons.wikimedia.org/wiki/File:2004_BMW_330Ci_Coupe.jpg"
PORSCHE_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/2020_Porsche_Cayman_GT4.jpg/960px-2020_Porsche_Cayman_GT4.jpg"
PORSCHE_SOURCE = "https://commons.wikimedia.org/wiki/File:2020_Porsche_Cayman_GT4.jpg"

VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES]
for vehicle in VEHICLES:
    if vehicle["key"] == "e46_330ci_2004":
        vehicle["photo_url"] = BMW_PHOTO
        vehicle["photo_credit"] = "hugh llewelyn / CC BY-SA 2.0"
        vehicle["photo_source"] = BMW_SOURCE

VEHICLES.append({
    "key": "porsche_718_cayman_gt4_2023",
    "catalog_label": "Porsche 718",
    "year": "2023",
    "make": "Porsche",
    "model": "718 Cayman GT4",
    "trim": "Coupe",
    "powertrain": "4.0L naturally aspirated flat-six • 414 hp",
    "platform": "982",
    "accent": "#d5001c",
    "workshop_url": "/?theme=porsche_gt4_workshop",
    "workshop_status": "DEEP WORKSHOP AVAILABLE",
    "default_in_garage": True,
    "profile_status": "VIN • mileage • transmission • brake option • build data still to record",
    "story": "A 2023 Porsche 718 Cayman GT4 becomes Garage Journey's second deep vehicle: personal history and documents on top of a factory-grounded 982 GT4 technical knowledge base.",
    "photo_url": PORSCHE_PHOTO,
    "photo_credit": "Calreyn88 / CC BY-SA 4.0",
    "photo_source": PORSCHE_SOURCE,
})


def _garage_body() -> str:
    body = base._garage_body()
    body = body.replace(
        '<div><span>TECHNICAL DEPTH</span><strong>BMW E46 workshop live</strong></div>',
        '<div><span>TECHNICAL DEPTH</span><strong>BMW E46 + Porsche 982 workshops live</strong></div>',
    )
    old_note = '<p class="gj-photo-note">Representative BMW photo: <a href="' + base.BMW_PHOTO_SOURCE + '" target="_blank" rel="noopener noreferrer">Hugh Llewelyn / Wikimedia Commons, CC BY-SA 2.0 ↗</a></p>'
    new_note = (
        '<p class="gj-photo-note">Representative vehicle photos: '
        '<a href="' + BMW_SOURCE + '" target="_blank" rel="noopener noreferrer">BMW — hugh llewelyn, CC BY-SA 2.0 ↗</a> • '
        '<a href="' + PORSCHE_SOURCE + '" target="_blank" rel="noopener noreferrer">Porsche — Calreyn88, CC BY-SA 4.0 ↗</a></p>'
    )
    body = body.replace(old_note, new_note)
    return body


EXTRA_CSS = base.EXTRA_CSS + r'''
/* v6 — verified BMW image URL + second deep Garage vehicle */
.gj-vehicle:has(.gj-open-car[data-open-car="e46_330ci_2004"]) .gj-vehicle-visual{
  background-image:linear-gradient(180deg,rgba(8,10,11,.02),rgba(8,10,11,.12) 55%,rgba(8,10,11,.78)),url("''' + BMW_PHOTO + r'''")!important;
  background-position:center 50%!important;background-size:cover!important
}
.gj-car-art[data-mark="E46"]{
  background-image:linear-gradient(90deg,rgba(8,10,11,.04),rgba(8,10,11,.18)),url("''' + BMW_PHOTO + r'''")!important;
  background-size:cover!important;background-position:center 50%!important
}
.gj-vehicle:has(.gj-open-car[data-open-car="porsche_718_cayman_gt4_2023"]) .gj-vehicle-visual{
  background-image:linear-gradient(180deg,rgba(8,10,11,.02),rgba(8,10,11,.10) 55%,rgba(8,10,11,.78)),url("''' + PORSCHE_PHOTO + r'''");
  background-position:center 55%;background-size:cover
}
.gj-vehicle:has(.gj-open-car[data-open-car="porsche_718_cayman_gt4_2023"]) .gj-vehicle-visual::before,
.gj-vehicle:has(.gj-open-car[data-open-car="porsche_718_cayman_gt4_2023"]) .gj-vehicle-visual::after,
.gj-vehicle:has(.gj-open-car[data-open-car="porsche_718_cayman_gt4_2023"]) .gj-wheel{display:none}
.gj-car-art[data-mark="GT4"]{
  background-image:linear-gradient(90deg,rgba(8,10,11,.03),rgba(8,10,11,.17)),url("''' + PORSCHE_PHOTO + r'''");
  background-size:cover;background-position:center 55%
}
.gj-car-art[data-mark="GT4"]::before{display:none}.gj-car-art[data-mark="GT4"]::after{content:"GT4";right:20px;bottom:12px;padding:6px 10px;background:rgba(0,0,0,.38);color:rgba(255,255,255,.84);font-size:1rem;letter-spacing:.12em;backdrop-filter:blur(6px)}
.gj-garage-grid:has(.gj-open-car[data-open-car="porsche_718_cayman_gt4_2023"]) .gj-vehicle h3{font-size:clamp(1.8rem,3.1vw,2.35rem)}
.gj-garage-grid>.gj-vehicle{transition:border-color .18s ease,transform .18s ease}.gj-garage-grid>.gj-vehicle:hover{border-color:rgba(255,255,255,.30);transform:translateY(-2px)}
'''

EXTRA_JS = base.EXTRA_JS
EXTRA_JS = EXTRA_JS.replace(
    "function mark(v){return v.platform==='E46'?'E46':'ST';}",
    "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':'ST');}",
)
EXTRA_JS = EXTRA_JS.replace("const storageKey='garage-journey-membership-v1';", "const storageKey='garage-journey-membership-v2';")


def _vehicle_json() -> str:
    import json
    return json.dumps(VEHICLES).replace("</", "<\\/")


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=[CardItem(card_type="garage_journey", eyebrow="", title="", body=_garage_body())],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name": THEME_NAME,
            "date_key": today.strftime("%m-%d"),
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_css": EXTRA_CSS,
            "extra_js": EXTRA_JS,
            "extra_head_html": '<meta name="theme-color" content="#0d0e0e">',
        },
    )
