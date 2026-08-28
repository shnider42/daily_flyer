from __future__ import annotations

import json

from daily_flyer.themes import garage_journey_v9 as base
from daily_flyer.themes import garage_journey_v6 as catalog_base

THEME_NAME = "garage_journey_v10"
THEME_CONFIG = base.THEME_CONFIG

MUSTANG_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/2016_Ford_Mustang_GT_%2874784%29.jpg/960px-2016_Ford_Mustang_GT_%2874784%29.jpg"
MUSTANG_SOURCE = "https://commons.wikimedia.org/wiki/File:2016_Ford_Mustang_GT_(74784).jpg"

VEHICLES = [dict(vehicle) for vehicle in catalog_base.VEHICLES]
VEHICLES.append({
    "key": "mustang_gt_2016",
    "catalog_label": "Mustang GT",
    "year": "2016",
    "make": "Ford",
    "model": "Mustang GT",
    "trim": "Fastback",
    "powertrain": "5.0L Ti-VCT Gen-2 Coyote V8 • 435 hp",
    "platform": "S550",
    "accent": "#2f6db3",
    "workshop_url": "/?theme=mustang_gt_workshop",
    "workshop_status": "DEEP WORKSHOP AVAILABLE",
    "default_in_garage": True,
    "profile_status": "VIN • mileage • transmission • build data still to record",
    "story": "A 2016 Mustang GT adds a third genuinely deep Garage Journey vehicle: S550 chassis, Gen-2 Coyote technical knowledge, personal history, documents, and a full Workshop.",
    "photo_url": MUSTANG_PHOTO,
    "photo_credit": "Calreyn88 / CC BY-SA 4.0",
    "photo_source": MUSTANG_SOURCE,
})

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v10 — third full Garage vehicle: 2016 Mustang GT */
.gj-vehicle:has(.gj-open-car[data-open-car="mustang_gt_2016"]) .gj-vehicle-visual{
  background-image:linear-gradient(180deg,rgba(8,10,13,.02),rgba(8,10,13,.10) 55%,rgba(8,10,13,.80)),url("''' + MUSTANG_PHOTO + r'''");
  background-position:center 50%;background-size:cover
}
.gj-vehicle:has(.gj-open-car[data-open-car="mustang_gt_2016"]) .gj-vehicle-visual::before,
.gj-vehicle:has(.gj-open-car[data-open-car="mustang_gt_2016"]) .gj-vehicle-visual::after,
.gj-vehicle:has(.gj-open-car[data-open-car="mustang_gt_2016"]) .gj-wheel{display:none}
.gj-car-art[data-mark="GT"]{
  background-image:linear-gradient(90deg,rgba(8,10,13,.02),rgba(8,10,13,.18)),url("''' + MUSTANG_PHOTO + r'''");
  background-size:cover;background-position:center 50%
}
.gj-car-art[data-mark="GT"]::before{display:none}.gj-car-art[data-mark="GT"]::after{content:"5.0 GT";right:20px;bottom:12px;padding:6px 11px;border-radius:999px;background:rgba(0,0,0,.42);color:rgba(255,255,255,.88);font-family:var(--gj-mono);font-size:.62rem;letter-spacing:.10em;backdrop-filter:blur(6px)}

body.gj-theme-mustang{--gj-accent:#2f6db3;--gj-accent-soft:#b8c9dd;background:radial-gradient(circle at 80% 7%,rgba(47,109,179,.17),transparent 30rem),radial-gradient(circle at 13% 19%,rgba(181,31,50,.055),transparent 22rem),linear-gradient(rgba(9,13,18,.98),rgba(8,9,11,.995)),#090b0e}
body.gj-theme-mustang .hero-wrap::before{background:linear-gradient(90deg,#2f6db3 0 32%,#f0f1f2 32% 52%,#b51f32 52% 64%,#34383d 64%)}
body.gj-theme-mustang .hero-kicker,body.gj-theme-mustang .gj-kicker,body.gj-theme-mustang .gj-back,body.gj-theme-mustang .gj-detail-back{color:#b8c9dd}
body.gj-theme-mustang .gj-car-title{background:linear-gradient(145deg,#111924,#0b0e12)}
body.gj-theme-mustang .gj-profile-status{border-color:rgba(184,201,221,.21)}
body.gj-theme-mustang .gj-edit-profile:hover{border-color:#2f6db3;background:rgba(47,109,179,.11)}
body.gj-theme-mustang .gj-home-overview{--action-accent:#2f6db3}
body.gj-theme-mustang .gj-home-journey{--action-accent:#b51f32}
body.gj-theme-mustang .gj-home-glovebox{--action-accent:#e6e9ec}
body.gj-theme-mustang .gj-home-workshop{--action-accent:#88add4;background:linear-gradient(140deg,rgba(47,109,179,.15),rgba(181,31,50,.025))}
body.gj-theme-mustang .gj-profile-save{border-color:#2f6db3!important;background:#2f6db3!important}
body.gj-theme-mustang .gj-profile-form input:focus,body.gj-theme-mustang .gj-profile-form select:focus{border-color:#b8c9dd}
body.gj-theme-mustang .gj-floatnav{border-color:rgba(184,201,221,.26);background:rgba(8,12,17,.75)}body.gj-theme-mustang .gj-floatnav button:hover{background:rgba(47,109,179,.18)}
@media(min-width:901px){.gj-garage-grid:has(.gj-open-car[data-open-car="mustang_gt_2016"])>.gj-vehicle{grid-column:span 4}.gj-garage-grid:has(.gj-open-car[data-open-car="mustang_gt_2016"])>.gj-empty{grid-column:span 12;min-height:150px}}
'''

EXTRA_JS_ADDON = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const body=document.body;
  function clearMustang(){body.classList.remove('gj-theme-mustang');}
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-car]');
    if(open&&open.dataset.openCar==='mustang_gt_2016'){body.classList.add('gj-theme-mustang');}
    else if(open){clearMustang();}
    if(event.target.closest('.gj-back'))clearMustang();
  },true);
})();
'''


def _replace_vehicle_data(body: str) -> str:
    marker = '<script id="gj-data" type="application/json">'
    start = body.find(marker)
    if start == -1:
        return body
    content_start = start + len(marker)
    end = body.find('</script>', content_start)
    if end == -1:
        return body
    payload = json.dumps(VEHICLES).replace('</', '<\\/')
    return body[:content_start] + payload + body[end:]


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS

    js = context.metadata.get("extra_js", "")
    js = js.replace(
        "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':'ST');}",
        "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':(v.platform==='S550'?'GT':'ST'));}",
    )
    js = js.replace(
        "if(!Array.isArray(membership))membership=data.filter(v=>v.default_in_garage).map(v=>v.key);",
        "if(!Array.isArray(membership))membership=data.filter(v=>v.default_in_garage).map(v=>v.key);data.filter(v=>v.default_in_garage).forEach(v=>{if(!membership.includes(v.key))membership.push(v.key);});save();",
    )
    context.metadata["extra_js"] = js + EXTRA_JS_ADDON

    if context.cards:
        body = _replace_vehicle_data(context.cards[0].body)
        body = body.replace(
            "BMW E46 + Porsche 982 workshops live",
            "BMW E46 + Porsche 982 + Mustang S550 workshops live",
        )
        photo_note = (
            '<p class="gj-photo-note">Mustang representative photo: '
            f'<a href="{MUSTANG_SOURCE}" target="_blank" rel="noopener noreferrer">'
            'Calreyn88 / Wikimedia Commons, CC BY-SA 4.0 ↗</a></p>'
        )
        insert_at = body.rfind('</div>')
        if insert_at != -1:
            body = body[:insert_at] + photo_note + body[insert_at:]
        context.cards[0].body = body
    return context
