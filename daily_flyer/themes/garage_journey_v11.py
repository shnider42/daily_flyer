from __future__ import annotations

import json

from daily_flyer.themes import garage_journey_v10 as base

THEME_NAME = "garage_journey_v11"
THEME_CONFIG = base.THEME_CONFIG

# Performance Blue 2015 Focus ST representative photo.
FOCUS_PHOTO = "https://cdn.dealrimages.com/MB%2F2F%2F3Q%2FDUTW7AWGUCEGKI.jpg?h=500"
FOCUS_SOURCE = "https://www.zoomautousa.com/inventory/2015-ford-focus-st/267893"

VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES]
for vehicle in VEHICLES:
    if vehicle["key"] == "focus_st_2015":
        vehicle.update({
            "catalog_label": "Focus ST",
            "year": "2015",
            "make": "Ford",
            "model": "Focus ST",
            "trim": "5-door Hatchback",
            "powertrain": "2.0L turbocharged EcoBoost I-4 • 252 hp / 270 lb-ft",
            "platform": "MK3.5",
            "accent": "#4267c7",
            "workshop_url": "/?theme=focus_st_workshop",
            "workshop_status": "DEEP WORKSHOP AVAILABLE",
            "default_in_garage": True,
            "profile_status": "VIN • mileage • ST trim • build data • modification state still to record",
            "story": "A 2015 Ford Focus ST becomes Garage Journey's fourth deep vehicle: a compact Performance Blue hot hatch with personal history, documents, modifications, and a factory-grounded 2.0 EcoBoost technical Workshop.",
            "photo_url": FOCUS_PHOTO,
            "photo_credit": "Representative Performance Blue 2015 Focus ST",
            "photo_source": FOCUS_SOURCE,
        })

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v11 — full 2015 Focus ST / Performance Blue identity */
.gj-vehicle:has(.gj-open-car[data-open-car="focus_st_2015"]) .gj-vehicle-visual{
  background-image:linear-gradient(180deg,rgba(8,9,15,.02),rgba(8,9,15,.10) 55%,rgba(8,9,15,.80)),url("''' + FOCUS_PHOTO + r'''");
  background-position:center 48%;background-size:cover
}
.gj-vehicle:has(.gj-open-car[data-open-car="focus_st_2015"]) .gj-vehicle-visual::before,
.gj-vehicle:has(.gj-open-car[data-open-car="focus_st_2015"]) .gj-vehicle-visual::after,
.gj-vehicle:has(.gj-open-car[data-open-car="focus_st_2015"]) .gj-wheel{display:none}
.gj-car-art[data-mark="ST"]{
  background-image:linear-gradient(90deg,rgba(7,9,16,.02),rgba(7,9,16,.18)),url("''' + FOCUS_PHOTO + r'''");
  background-size:cover;background-position:center 48%
}
.gj-car-art[data-mark="ST"]::before{display:none}.gj-car-art[data-mark="ST"]::after{content:"FOCUS ST";right:20px;bottom:12px;padding:6px 11px;border-radius:999px;background:rgba(0,0,0,.42);color:rgba(255,255,255,.90);font-family:var(--gj-mono);font-size:.62rem;letter-spacing:.10em;backdrop-filter:blur(6px)}

body.gj-theme-focus{--gj-accent:#4267c7;--gj-accent-soft:#9bb7ff;background:radial-gradient(circle at 80% 7%,rgba(66,103,199,.23),transparent 30rem),radial-gradient(circle at 13% 19%,rgba(227,58,66,.055),transparent 22rem),linear-gradient(rgba(9,11,17,.982),rgba(8,9,13,.997)),#090a0f}
body.gj-theme-focus .hero-wrap::before{background:linear-gradient(90deg,#4267c7 0 37%,#88aaff 37% 56%,#e9ecf2 56% 76%,#e33a42 76%)}
body.gj-theme-focus .hero-kicker,body.gj-theme-focus .gj-kicker,body.gj-theme-focus .gj-back,body.gj-theme-focus .gj-detail-back{color:#9bb7ff}
body.gj-theme-focus .gj-car-title{background:linear-gradient(145deg,#12172a,#0b0d13)}
body.gj-theme-focus .gj-profile-status{border-color:rgba(155,183,255,.22)}
body.gj-theme-focus .gj-edit-profile:hover{border-color:#4267c7;background:rgba(66,103,199,.12)}
body.gj-theme-focus .gj-home-overview{--action-accent:#4267c7}
body.gj-theme-focus .gj-home-journey{--action-accent:#e33a42}
body.gj-theme-focus .gj-home-glovebox{--action-accent:#e8ebf1}
body.gj-theme-focus .gj-home-workshop{--action-accent:#88aaff;background:linear-gradient(140deg,rgba(66,103,199,.18),rgba(227,58,66,.025))}
body.gj-theme-focus .gj-profile-save{border-color:#4267c7!important;background:#4267c7!important}
body.gj-theme-focus .gj-profile-form input:focus,body.gj-theme-focus .gj-profile-form select:focus{border-color:#9bb7ff}
body.gj-theme-focus .gj-floatnav{border-color:rgba(155,183,255,.28);background:rgba(8,10,17,.76)}body.gj-theme-focus .gj-floatnav button:hover{background:rgba(66,103,199,.20)}
@media(min-width:901px){.gj-garage-grid:has(.gj-open-car[data-open-car="focus_st_2015"])>.gj-vehicle{grid-column:span 6}.gj-garage-grid:has(.gj-open-car[data-open-car="focus_st_2015"])>.gj-empty{grid-column:span 12;min-height:150px}}
'''

FOCUS_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const body=document.body;
  function clearFocus(){body.classList.remove('gj-theme-focus');}
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-car]');
    if(open){clearFocus();if(open.dataset.openCar==='focus_st_2015')body.classList.add('gj-theme-focus');}
    if(event.target.closest('.gj-back'))clearFocus();
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
    context.metadata["extra_js"] = context.metadata.get("extra_js", "") + FOCUS_JS

    if context.cards:
        body = _replace_vehicle_data(context.cards[0].body)
        body = body.replace(
            "BMW E46 + Porsche 982 + Mustang S550 workshops live",
            "BMW E46 + Porsche 982 + Mustang S550 + Focus ST workshops live",
        )
        photo_note = (
            '<p class="gj-photo-note">Focus ST representative photo: '
            f'<a href="{FOCUS_SOURCE}" target="_blank" rel="noopener noreferrer">'
            '2015 Focus ST in Performance Blue ↗</a></p>'
        )
        insert_at = body.rfind('</div>')
        if insert_at != -1:
            body = body[:insert_at] + photo_note + body[insert_at:]
        context.cards[0].body = body
    return context
