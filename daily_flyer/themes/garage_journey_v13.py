from __future__ import annotations

import json

from daily_flyer.themes import garage_journey_v12 as base

THEME_NAME = "garage_journey_v13"
THEME_CONFIG = base.THEME_CONFIG

CORVETTE_PHOTO = "https://images.classic.com/vehicles/5f106cabe204d8450fcb1e02fa553a262e290e96?fit=crop&h=676&w=1200"
CORVETTE_SOURCE = "https://www.classic.com/veh/1985-chevrolet-corvette-coupe-l98-1g1yy0784f5119763-4VvrdD4/"

VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES]
VEHICLES.append({
    "key": "corvette_c4_1985",
    "catalog_label": "Corvette C4",
    "year": "1985",
    "make": "Chevrolet",
    "model": "Corvette",
    "trim": "Base Coupe • Bright Red (RPO 81)",
    "powertrain": "5.7L L98 Tuned-Port Injection V8 • 230 hp / 330 lb-ft",
    "platform": "C4",
    "accent": "#d51f2e",
    "workshop_url": "/?theme=corvette_c4_workshop",
    "workshop_status": "DEEP WORKSHOP AVAILABLE",
    "default_in_garage": False,
    "profile_status": "VIN • mileage • transmission • RPOs • original/modified state still to record",
    "story": "A Bright Red 1985 Corvette joins Garage Journey as an early C4: L98 Tuned-Port Injection, digital cockpit, composite-spring chassis, personal history, documents, and a full technical Workshop.",
    "photo_url": CORVETTE_PHOTO,
    "photo_credit": "Representative red 1985 Chevrolet Corvette Coupe / CLASSIC.COM",
    "photo_source": CORVETTE_SOURCE,
})

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v13 — fifth full Garage vehicle: Bright Red 1985 Corvette C4 */
.gj-vehicle:has(.gj-open-car[data-open-car="corvette_c4_1985"]) .gj-vehicle-visual{
  background-image:linear-gradient(180deg,rgba(9,6,7,.02),rgba(9,6,7,.10) 55%,rgba(9,6,7,.82)),url("''' + CORVETTE_PHOTO + r'''");
  background-position:center 48%;background-size:cover
}
.gj-vehicle:has(.gj-open-car[data-open-car="corvette_c4_1985"]) .gj-vehicle-visual::before,
.gj-vehicle:has(.gj-open-car[data-open-car="corvette_c4_1985"]) .gj-vehicle-visual::after,
.gj-vehicle:has(.gj-open-car[data-open-car="corvette_c4_1985"]) .gj-wheel{display:none}
.gj-car-art[data-mark="C4"]{
  background-image:linear-gradient(90deg,rgba(9,6,7,.02),rgba(9,6,7,.20)),url("''' + CORVETTE_PHOTO + r'''");
  background-size:cover;background-position:center 48%
}
.gj-car-art[data-mark="C4"]::before{display:none}.gj-car-art[data-mark="C4"]::after{content:"1985 C4";right:20px;bottom:12px;padding:6px 11px;border-radius:999px;background:rgba(0,0,0,.45);color:rgba(255,255,255,.92);font-family:var(--gj-mono);font-size:.62rem;letter-spacing:.10em;backdrop-filter:blur(6px)}

body.gj-theme-corvette{--gj-accent:#d51f2e;--gj-accent-soft:#f0b4b8;background:radial-gradient(circle at 80% 7%,rgba(213,31,46,.22),transparent 30rem),radial-gradient(circle at 13% 19%,rgba(245,245,238,.045),transparent 22rem),linear-gradient(rgba(12,9,10,.985),rgba(8,7,8,.998)),#090708}
body.gj-theme-corvette .hero-wrap::before{background:linear-gradient(90deg,#d51f2e 0 46%,#f3f0e8 46% 64%,#232327 64%)}
body.gj-theme-corvette .hero-kicker,body.gj-theme-corvette .gj-kicker,body.gj-theme-corvette .gj-back,body.gj-theme-corvette .gj-detail-back{color:#f0b4b8}
body.gj-theme-corvette .gj-car-title{background:linear-gradient(145deg,#1b1113,#0c0b0c)}
body.gj-theme-corvette .gj-profile-status{border-color:rgba(240,180,184,.23)}
body.gj-theme-corvette .gj-edit-profile:hover{border-color:#d51f2e;background:rgba(213,31,46,.12)}
body.gj-theme-corvette .gj-home-overview{--action-accent:#d51f2e}
body.gj-theme-corvette .gj-home-journey{--action-accent:#f3f0e8}
body.gj-theme-corvette .gj-home-glovebox{--action-accent:#8b8b91}
body.gj-theme-corvette .gj-home-workshop{--action-accent:#ef8b94;background:linear-gradient(140deg,rgba(213,31,46,.18),rgba(245,245,238,.02))}
body.gj-theme-corvette .gj-profile-save{border-color:#d51f2e!important;background:#d51f2e!important}
body.gj-theme-corvette .gj-profile-form input:focus,body.gj-theme-corvette .gj-profile-form select:focus{border-color:#f0b4b8}
body.gj-theme-corvette .gj-floatnav{border-color:rgba(240,180,184,.28);background:rgba(10,7,8,.76)}body.gj-theme-corvette .gj-floatnav button:hover{background:rgba(213,31,46,.20)}
@media(min-width:901px){.gj-garage-grid:has(.gj-open-car[data-open-car="corvette_c4_1985"])>.gj-vehicle{grid-column:span 6}.gj-garage-grid:has(.gj-open-car[data-open-car="corvette_c4_1985"])>.gj-empty{grid-column:span 12;min-height:150px}}
'''

CORVETTE_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const body=document.body;
  function clearCorvette(){body.classList.remove('gj-theme-corvette');}
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-car]');
    if(open){clearCorvette();if(open.dataset.openCar==='corvette_c4_1985')body.classList.add('gj-theme-corvette');}
    if(event.target.closest('.gj-back'))clearCorvette();
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
        "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':(v.platform==='S550'?'GT':'ST'));}",
        "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':(v.platform==='S550'?'GT':(v.platform==='C4'?'C4':'ST')));}",
    )
    context.metadata["extra_js"] = js + CORVETTE_JS

    if context.cards:
        body = _replace_vehicle_data(context.cards[0].body)
        body = body.replace(
            "Choose from the fully built BMW 330Ci, Porsche Cayman GT4, Mustang GT and Focus ST.",
            "Choose from the fully built BMW 330Ci, Porsche Cayman GT4, Mustang GT, Focus ST and 1985 Corvette C4.",
        )
        photo_note = (
            '<p class="gj-photo-note">Corvette representative photo: '
            f'<a href="{CORVETTE_SOURCE}" target="_blank" rel="noopener noreferrer">'
            'red 1985 Chevrolet Corvette Coupe ↗</a></p>'
        )
        insert_at = body.rfind('</div>')
        if insert_at != -1:
            body = body[:insert_at] + photo_note + body[insert_at:]
        context.cards[0].body = body
    return context
