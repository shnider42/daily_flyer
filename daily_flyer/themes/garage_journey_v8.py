from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import garage_journey_v7 as base

THEME_NAME = "garage_journey_v8"
THEME_CONFIG = base.THEME_CONFIG
VEHICLES = base.VEHICLES

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v8 — neutral Garage Journey shell, per-vehicle identities, floating nav */
body{--gj-accent:#c5c2b8;--gj-accent-soft:#8b8f8c;--gj-surface:#111313;--gj-surface-2:#171919;--gj-line:rgba(255,255,255,.14)}
.hero-wrap::before{background:linear-gradient(90deg,#dedbd2 0 28%,#7d8282 28% 52%,#343737 52% 76%,#111 76%)}
.hero-kicker,.gj-kicker{color:#c5c2b8}.gj-add:hover,.gj-edit-profile:hover{border-color:#c5c2b8;background:rgba(197,194,184,.06)}
.gj-home-overview{--action-accent:#a9ada8}.gj-home-journey{--action-accent:#c2b79b}.gj-home-glovebox{--action-accent:#d8d6cf}.gj-home-workshop{--action-accent:#8f9a9b;background:linear-gradient(140deg,rgba(143,154,155,.09),rgba(255,255,255,.018))}

body.gj-theme-bmw{--gj-accent:#0066b1;--gj-accent-soft:#5ca9dc;background:radial-gradient(circle at 78% 7%,rgba(0,102,177,.18),transparent 30rem),linear-gradient(rgba(6,13,20,.975),rgba(7,11,15,.99)),repeating-linear-gradient(0deg,transparent 0 35px,rgba(255,255,255,.022) 36px),#071018}
body.gj-theme-bmw .hero-wrap::before{background:linear-gradient(90deg,#0066b1 0 35%,#00a2e8 35% 54%,#f4f4f2 54% 75%,#17191b 75%)}
body.gj-theme-bmw .hero-kicker,body.gj-theme-bmw .gj-kicker,body.gj-theme-bmw .gj-back,body.gj-theme-bmw .gj-detail-back{color:#63b8ed}
body.gj-theme-bmw .gj-car-title{background:linear-gradient(145deg,#071522,#0b1117)}
body.gj-theme-bmw .gj-profile-status{border-color:rgba(99,184,237,.22)}
body.gj-theme-bmw .gj-edit-profile:hover{border-color:#0066b1;background:rgba(0,102,177,.11)}
body.gj-theme-bmw .gj-home-overview{--action-accent:#0066b1}
body.gj-theme-bmw .gj-home-journey{--action-accent:#00a2e8}
body.gj-theme-bmw .gj-home-glovebox{--action-accent:#e9eef1}
body.gj-theme-bmw .gj-home-workshop{--action-accent:#6aa8d8;background:linear-gradient(140deg,rgba(0,102,177,.16),rgba(255,255,255,.018))}
body.gj-theme-bmw .gj-profile-save{border-color:#0066b1!important;background:#0066b1!important}
body.gj-theme-bmw .gj-profile-form input:focus,body.gj-theme-bmw .gj-profile-form select:focus{border-color:#63b8ed}
body.gj-theme-bmw .gj-overview-jumps em,body.gj-theme-bmw .gj-home-go{color:var(--action-accent,#63b8ed)}

body.gj-theme-porsche{--gj-accent:#d5001c;--gj-accent-soft:#c7a96b;background:radial-gradient(circle at 80% 7%,rgba(213,0,28,.14),transparent 29rem),radial-gradient(circle at 15% 20%,rgba(183,151,91,.07),transparent 24rem),linear-gradient(rgba(16,12,13,.98),rgba(10,10,10,.995)),#0d0b0c}
body.gj-theme-porsche .hero-wrap::before{background:linear-gradient(90deg,#d5001c 0 31%,#b79a5e 31% 52%,#ece9e1 52% 73%,#111 73%)}
body.gj-theme-porsche .hero-kicker,body.gj-theme-porsche .gj-kicker,body.gj-theme-porsche .gj-back,body.gj-theme-porsche .gj-detail-back{color:#c7a96b}
body.gj-theme-porsche .gj-car-title{background:linear-gradient(145deg,#171011,#0d0d0d)}
body.gj-theme-porsche .gj-profile-status{border-color:rgba(213,0,28,.22)}
body.gj-theme-porsche .gj-edit-profile:hover{border-color:#d5001c;background:rgba(213,0,28,.09)}
body.gj-theme-porsche .gj-home-overview{--action-accent:#d5001c}
body.gj-theme-porsche .gj-home-journey{--action-accent:#b79a5e}
body.gj-theme-porsche .gj-home-glovebox{--action-accent:#ece9e1}
body.gj-theme-porsche .gj-home-workshop{--action-accent:#d5001c;background:linear-gradient(140deg,rgba(213,0,28,.13),rgba(183,154,94,.035))}
body.gj-theme-porsche .gj-profile-save{border-color:#d5001c!important;background:#d5001c!important}
body.gj-theme-porsche .gj-profile-form input:focus,body.gj-theme-porsche .gj-profile-form select:focus{border-color:#c7a96b}
body.gj-theme-porsche .gj-workshop-badge{color:#e2c78f;border-color:rgba(199,169,107,.5)}

.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,12,.68);backdrop-filter:blur(16px) saturate(125%);-webkit-backdrop-filter:blur(16px) saturate(125%);box-shadow:0 10px 30px rgba(0,0,0,.18)}
.gj-floatnav button{min-height:38px;padding:0 13px;border:0;background:transparent;color:#d8dad8;font:inherit;font-size:.64rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}
.gj-floatnav button:hover,.gj-floatnav button:focus-visible{outline:none;background:rgba(255,255,255,.08);color:#fff}.gj-floatnav .gj-nav-home{border-left:1px solid rgba(255,255,255,.12)}
body.gj-theme-bmw .gj-floatnav{border-color:rgba(99,184,237,.28);background:rgba(5,15,24,.72)}body.gj-theme-bmw .gj-floatnav button:hover{background:rgba(0,102,177,.18)}
body.gj-theme-porsche .gj-floatnav{border-color:rgba(199,169,107,.28);background:rgba(17,10,11,.74)}body.gj-theme-porsche .gj-floatnav button:hover{background:rgba(213,0,28,.13)}
@media(max-width:650px){.gj-floatnav{top:8px}.gj-floatnav button{min-height:36px;padding:0 10px;font-size:.58rem}}
'''

EXTRA_JS = base.EXTRA_JS + r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const body=document.body;
  function clearVehicleTheme(){body.classList.remove('gj-theme-bmw','gj-theme-porsche');}
  function setVehicleTheme(key){clearVehicleTheme();if(key==='e46_330ci_2004')body.classList.add('gj-theme-bmw');if(key==='porsche_718_cayman_gt4_2023')body.classList.add('gj-theme-porsche');}
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-car]');if(open)setVehicleTheme(open.dataset.openCar);
    if(event.target.closest('.gj-back'))clearVehicleTheme();
  },true);

  if(!document.querySelector('.gj-floatnav')){
    const nav=document.createElement('nav');nav.className='gj-floatnav';nav.setAttribute('aria-label','Garage Journey navigation');
    nav.innerHTML='<button type="button" class="gj-nav-back">← Back</button><button type="button" class="gj-nav-home">⌂ Garage Home</button>';
    document.body.appendChild(nav);
    nav.querySelector('.gj-nav-back').addEventListener('click',()=>{
      const detail=root.querySelector('.gj-detail-view.is-active');if(detail){root.querySelector('.gj-detail-back')?.click();return;}
      const car=root.querySelector('[data-view="car"].is-active');if(car){root.querySelector('.gj-back')?.click();return;}
      try{const ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin){history.back();return;}}catch(error){}
      location.href='/?theme=garage';
    });
    nav.querySelector('.gj-nav-home').addEventListener('click',()=>{
      const car=root.querySelector('[data-view="car"].is-active');if(car){root.querySelector('.gj-back')?.click();clearVehicleTheme();return;}
      clearVehicleTheme();window.scrollTo({top:0,behavior:'smooth'});
    });
  }
})();
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    del seed
    return PageContext(
        page_title=THEME_CONFIG["page_title"],
        header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"],
        today_str=today.strftime("%A, %B %d, %Y"),
        cards=[CardItem(card_type="garage_journey", eyebrow="", title="", body=base._garage_body())],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "theme_name":THEME_NAME,"date_key":today.strftime("%m-%d"),"hero_kicker":THEME_CONFIG["hero_kicker"],
            "hero_summary_pill":THEME_CONFIG["hero_summary_pill"],"extra_css":EXTRA_CSS,"extra_js":EXTRA_JS,
            "extra_head_html":'<meta name="theme-color" content="#101111">',
        },
    )
