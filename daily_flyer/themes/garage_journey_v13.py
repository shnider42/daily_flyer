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

/* Mobile is a distinct composition, not a squeezed desktop layout. */
@media(max-width:760px){
  html,body{max-width:100%;overflow-x:hidden}
  body{padding-bottom:calc(78px + env(safe-area-inset-bottom))}
  .hero-wrap{padding-top:6px}
  header.hero{min-height:0;padding:22px 0 18px}
  .hero h1{font-size:clamp(3.35rem,16vw,5rem);line-height:.82}
  .hero .subtitle{max-width:34rem;font-size:.79rem;line-height:1.55}
  .hero-kicker{font-size:.6rem}

  .gj-shell{padding-top:20px;padding-bottom:16px}
  .gj-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:26px}
  .gj-brand{font-size:0;white-space:nowrap}.gj-brand strong{font-size:.68rem;letter-spacing:.09em}
  .gj-garage-actions{gap:5px}.gj-how{display:none}.gj-add{min-height:40px;padding:0 13px;font-size:.55rem;white-space:nowrap}
  .gj-section-head{display:block;margin-bottom:18px}.gj-section-head h2{font-size:clamp(3rem,15vw,4.5rem);line-height:.84}.gj-section-head p{margin:13px 0 0;font-size:.8rem;line-height:1.55}
  .gj-garage-summary{display:none}

  .gj-garage-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:14px!important}
  .gj-garage-grid>.gj-vehicle,.gj-garage-grid>.gj-empty{grid-column:1/-1!important;width:100%;min-width:0}
  .gj-garage-grid>.gj-vehicle{border-radius:22px 6px 22px 6px;box-shadow:0 14px 40px rgba(0,0,0,.2)}
  .gj-vehicle-visual{height:205px;border-radius:21px 5px 0 0}
  .gj-vehicle-copy{padding:18px 18px 12px}.gj-vehicle h3{font-size:clamp(2.2rem,11vw,3rem);line-height:.9}.gj-vehicle p{font-size:.72rem;line-height:1.45}
  .gj-open-car{display:block;width:calc(100% - 20px);margin:0 10px 10px;padding:14px 15px;text-align:left}
  .gj-owned-pill{top:10px;left:10px;padding:6px 8px;font-size:.48rem}.gj-remove-car{top:10px;right:10px;padding:6px 8px;font-size:.48rem}
  .gj-view[data-view="garage"].gj-is-empty .gj-empty{min-height:210px;padding:24px 20px}.gj-view[data-view="garage"].gj-is-empty .gj-empty strong{font-size:2.3rem}.gj-view[data-view="garage"].gj-is-empty .gj-empty small{font-size:.72rem}

  .gj-car-head{display:flex!important;flex-direction:column;grid-template-columns:1fr!important;border-radius:24px 6px 24px 6px}
  .gj-car-art{min-height:235px;height:235px}.gj-car-title{padding:22px 20px 24px;border-left:0;border-top:1px solid rgba(255,255,255,.09)}
  .gj-car-title h2{font-size:clamp(3.35rem,16vw,4.8rem);line-height:.84}.gj-car-code{font-size:.58rem}.gj-car-story{font-size:.77rem;line-height:1.55}.gj-profile-status{font-size:.56rem}.gj-edit-profile{width:100%;text-align:center;margin-top:4px}
  .gj-car-home{padding-top:26px}.gj-home-intro{margin-bottom:16px}.gj-home-intro h3{font-size:clamp(2.55rem,12vw,3.6rem);line-height:.88}.gj-home-intro p{font-size:.77rem;line-height:1.5}
  .gj-home-grid{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
  .gj-home-action{grid-column:1/-1!important;min-height:155px;padding:20px 20px 18px}.gj-home-action::before{margin-bottom:18px}.gj-home-action::after{top:1px;right:12px;font-size:5.5rem}.gj-home-action strong{font-size:2.45rem}.gj-home-action p{font-size:.72rem;line-height:1.45}.gj-home-go{font-size:.58rem}
  .gj-car-snapshot{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}.gj-snapshot-item{min-width:0;min-height:76px;padding:12px}.gj-snapshot-item span{font-size:.5rem}.gj-snapshot-item strong{font-size:.72rem;overflow-wrap:anywhere}

  .gj-overview-primary,.gj-overview-columns,.gj-detail-grid{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
  .gj-overview-identity,.gj-odometer,.gj-overview-block,.gj-detail-card{grid-column:1/-1!important}
  .gj-overview-identity,.gj-odometer{padding:18px}.gj-overview-identity>strong{font-size:2.1rem}.gj-odometer strong{font-size:1.65rem}
  .gj-overview-facts{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}.gj-overview-facts>div{min-width:0;min-height:94px;padding:13px}.gj-overview-facts strong{overflow-wrap:anywhere}
  .gj-overview-jumps{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}.gj-overview-jumps button,.gj-overview-jumps a{min-width:0;padding:14px 12px}
  .gj-detail-heading h3,.gj-overview-heading h3{font-size:clamp(2.7rem,12vw,3.8rem)}
  .gj-detail-card,.gj-overview-block{padding:18px}.gj-journey-item{padding:15px 16px}

  .gj-profile-modal,.gj-modal{padding:0;align-items:flex-end}.gj-profile-box,.gj-modal-box{width:100%;max-width:none;max-height:92svh;border-radius:24px 24px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom)}
  .gj-profile-form{grid-template-columns:1fr!important}.gj-profile-form input,.gj-profile-form select{min-height:46px;font-size:16px}.gj-profile-actions{position:sticky;bottom:0;padding-bottom:calc(12px + env(safe-area-inset-bottom));background:rgba(16,18,18,.97)}

  .gj-manage-modal,.gj-tour-modal{padding:0;place-items:end center;background:rgba(3,5,5,.72)}
  .gj-manage-box,.gj-tour-box{width:100%;max-width:none;max-height:92svh;border-radius:26px 26px 0 0;border-bottom:0}
  .gj-manage-head{padding:23px 18px 17px}.gj-manage-head h3,.gj-tour-title h3{font-size:clamp(3rem,14vw,4.2rem);line-height:.84}.gj-manage-head p,.gj-tour-title p{font-size:.75rem;line-height:1.5}.gj-manage-toolbar{padding:11px 18px}
  .gj-manage-grid{grid-template-columns:1fr!important;gap:9px;padding:12px}
  .gj-manage-card{display:grid;grid-template-columns:112px minmax(0,1fr);min-height:118px;border-radius:16px 5px 16px 5px}.gj-manage-photo{height:auto;min-height:118px}.gj-manage-copy{padding:16px 13px}.gj-manage-copy strong{padding-right:28px;font-size:1.65rem}.gj-manage-copy p{font-size:.63rem}.gj-manage-meta{font-size:.47rem}.gj-manage-toggle{top:8px;right:8px;padding:6px 8px;font-size:.46rem}
  .gj-manage-actions{position:sticky;bottom:0;z-index:3;padding:13px 14px calc(13px + env(safe-area-inset-bottom));background:rgba(16,18,18,.98)}.gj-manage-actions button{flex:1}
  .gj-tour-box{padding:26px 18px calc(18px + env(safe-area-inset-bottom))}.gj-tour-title{padding-right:42px}.gj-tour-steps{grid-template-columns:1fr;gap:7px;margin-top:20px}.gj-tour-steps>div{min-height:0;padding:15px 16px}.gj-tour-steps span{margin-bottom:10px}.gj-tour-steps strong{font-size:1.5rem}.gj-tour-steps p{font-size:.68rem}.gj-tour-note{font-size:.61rem}.gj-tour-actions{display:grid;grid-template-columns:1fr;gap:7px;margin-top:16px}.gj-tour-actions button{width:100%}

  .gj-floatnav{top:auto!important;bottom:calc(9px + env(safe-area-inset-bottom));left:50%;width:min(calc(100vw - 24px),360px);transform:translateX(-50%);justify-content:stretch;padding:4px!important;background:rgba(10,12,12,.88)!important;box-shadow:0 10px 36px rgba(0,0,0,.38)!important}
  .gj-floatnav button{flex:1;min-height:42px;padding:0 10px!important;font-size:.55rem!important}.gj-floatnav .gj-nav-home{border-left:1px solid rgba(255,255,255,.1)!important}
  .gj-photo-note{font-size:.52rem;line-height:1.5;overflow-wrap:anywhere}
}

@media(max-width:420px){
  .hero h1{font-size:3.35rem}.gj-section-head h2{font-size:3.05rem}
  .gj-vehicle-visual{height:185px}.gj-car-art{min-height:210px;height:210px}.gj-car-title h2{font-size:3.35rem}
  .gj-car-snapshot,.gj-overview-facts{grid-template-columns:1fr!important}
  .gj-overview-jumps{grid-template-columns:1fr!important}
  .gj-manage-card{grid-template-columns:96px minmax(0,1fr)}.gj-manage-photo{min-height:112px}.gj-manage-copy strong{font-size:1.48rem}
}
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
