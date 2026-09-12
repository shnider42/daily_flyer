from __future__ import annotations

import json

from daily_flyer.themes import garage_journey_v13 as base

THEME_NAME = "garage_journey_v14"
THEME_CONFIG = base.THEME_CONFIG

Z_EXTERIOR = "https://content.homenetiol.com/2000157/2065512/0x0/67d45b2c92e44b5d88a5fdf084e1f35a.jpg"
Z_EXTERIOR_SOURCE = "https://www.airporthonda.com/viewdetails/cpo/jn1bz4bh7rm365146/2024-nissan-z-2dr-car"
Z_INTERIOR = "https://www.parkplaceltd.com/inventoryphotos/16712/jn1bz4bh4rm362849/ip/8.jpg?bg-color=FFFFFF&timestamp=2025-11-24T19%3A55%3A14Z&width=800"
Z_INTERIOR_SOURCE = "https://www.parkplaceltd.com/used-Bellevue-2024-Nissan-Z-Performance-JN1BZ4BH4RM362849"

VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES]
VEHICLES.append({
    "key": "nissan_z_2024_performance",
    "catalog_label": "Nissan Z",
    "year": "2024",
    "make": "Nissan",
    "model": "Z",
    "trim": "Performance • Black Diamond Pearl / Red Leather",
    "powertrain": "3.0L twin-turbo VR30DDTT V6 • 400 hp / 350 lb-ft",
    "platform": "RZ34",
    "accent": "#d6202f",
    "workshop_url": "/?theme=nissan_z_workshop",
    "workshop_status": "DEEP WORKSHOP AVAILABLE",
    "default_in_garage": False,
    "profile_status": "VIN • mileage • transmission • build data • modification state still to record",
    "story": "A Black Diamond Pearl 2024 Nissan Z Performance joins Garage Journey with the red leather interior, VR30DDTT twin-turbo V6, rear-wheel drive, mechanical limited-slip differential, personal records, and a full technical Workshop.",
    "photo_url": Z_EXTERIOR,
    "photo_credit": "Representative Black Diamond Pearl 2024 Nissan Z Performance",
    "photo_source": Z_EXTERIOR_SOURCE,
    "interior_photo_url": Z_INTERIOR,
    "interior_photo_source": Z_INTERIOR_SOURCE,
})

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v14 — 2024 Nissan Z Performance + reliable real <img> vehicle photography */
.gj-vehicle-visual{position:relative;overflow:hidden}
.gj-vehicle-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0;opacity:1}
.gj-vehicle-mark,.gj-owned-pill,.gj-remove-car{position:relative;z-index:3}
.gj-car-art{position:relative;overflow:hidden}
.gj-car-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0}
.gj-car-art::after{z-index:3!important}
.gj-z-gallery{display:grid;grid-template-columns:1.35fr .65fr;gap:10px;margin:14px 0 0}
.gj-z-gallery figure{margin:0;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:18px 5px 18px 5px;background:#111}
.gj-z-gallery img{display:block;width:100%;height:240px;object-fit:cover}.gj-z-gallery figure:last-child img{object-position:center 58%}
.gj-z-gallery figcaption{padding:9px 11px;color:#747b7d;font-family:var(--gj-mono);font-size:.5rem;letter-spacing:.08em;text-transform:uppercase}

body.gj-theme-nissan{--gj-accent:#d6202f;--gj-accent-soft:#ff8f98;background:radial-gradient(circle at 82% 5%,rgba(214,32,47,.18),transparent 30rem),radial-gradient(circle at 14% 19%,rgba(255,255,255,.04),transparent 22rem),linear-gradient(rgba(8,9,11,.985),rgba(5,6,8,.998)),#07080a}
body.gj-theme-nissan .hero-wrap::before{background:linear-gradient(90deg,#d6202f 0 38%,#f4f4f4 38% 54%,#35383c 54% 72%,#050607 72%)}
body.gj-theme-nissan .hero-kicker,body.gj-theme-nissan .gj-kicker,body.gj-theme-nissan .gj-back,body.gj-theme-nissan .gj-detail-back{color:#ff8f98}
body.gj-theme-nissan .gj-car-title{background:linear-gradient(145deg,#15171b,#0a0b0e)}
body.gj-theme-nissan .gj-profile-status{border-color:rgba(255,143,152,.22)}
body.gj-theme-nissan .gj-edit-profile:hover{border-color:#d6202f;background:rgba(214,32,47,.11)}
body.gj-theme-nissan .gj-home-overview{--action-accent:#d6202f}
body.gj-theme-nissan .gj-home-journey{--action-accent:#efefef}
body.gj-theme-nissan .gj-home-glovebox{--action-accent:#8b9199}
body.gj-theme-nissan .gj-home-workshop{--action-accent:#ff7b86;background:linear-gradient(140deg,rgba(214,32,47,.17),rgba(255,255,255,.018))}
body.gj-theme-nissan .gj-profile-save{border-color:#d6202f!important;background:#d6202f!important}
body.gj-theme-nissan .gj-profile-form input:focus,body.gj-theme-nissan .gj-profile-form select:focus{border-color:#ff8f98}
body.gj-theme-nissan .gj-floatnav{border-color:rgba(255,143,152,.27);background:rgba(7,8,10,.78)}
body.gj-theme-nissan .gj-floatnav button:hover{background:rgba(214,32,47,.18)}
@media(max-width:760px){.gj-z-gallery{grid-template-columns:1fr;gap:8px}.gj-z-gallery img{height:205px}.gj-vehicle-photo,.gj-car-photo{transform:translateZ(0);backface-visibility:hidden}}
'''

PHOTO_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const data=JSON.parse(root.querySelector('#gj-data')?.textContent||'[]');
  const byKey=key=>data.find(v=>v.key===key);
  function imageForCard(card){
    const btn=card.querySelector('[data-open-car],[data-add-car]');
    const v=btn?byKey(btn.dataset.openCar||btn.dataset.addCar):null;
    const visual=card.querySelector('.gj-vehicle-visual');if(!v||!visual||!v.photo_url)return;
    let img=visual.querySelector('.gj-vehicle-photo');
    if(!img){img=document.createElement('img');img.className='gj-vehicle-photo';img.loading='eager';img.decoding='async';visual.prepend(img);}
    if(img.src!==v.photo_url)img.src=v.photo_url;
    img.alt=`${v.year} ${v.make} ${v.model}`;
  }
  function hydrateCards(scope=root){scope.querySelectorAll('.gj-vehicle').forEach(imageForCard);}
  hydrateCards();
  const garageGrid=root.querySelector('.gj-garage-grid');
  if(garageGrid)new MutationObserver(()=>hydrateCards(garageGrid)).observe(garageGrid,{childList:true});
  const catalogGrid=root.querySelector('.gj-catalog-grid');
  if(catalogGrid)new MutationObserver(()=>hydrateCards(catalogGrid)).observe(catalogGrid,{childList:true});

  function setDetailPhoto(key){
    const v=byKey(key);const art=root.querySelector('.gj-car-art');if(!v||!art)return;
    let img=art.querySelector('.gj-car-photo');
    if(!img){img=document.createElement('img');img.className='gj-car-photo';img.decoding='async';art.prepend(img);}
    if(v.photo_url){img.src=v.photo_url;img.alt=`${v.year} ${v.make} ${v.model}`;img.hidden=false;}else{img.hidden=true;img.removeAttribute('src');}
  }
  root.addEventListener('click',event=>{const open=event.target.closest('[data-open-car]');if(open)setDetailPhoto(open.dataset.openCar);},true);
})();
'''

NISSAN_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const body=document.body;
  function clear(){body.classList.remove('gj-theme-nissan');root.querySelector('.gj-z-gallery')?.remove();}
  function gallery(){
    const carHome=root.querySelector('.gj-car-home');if(!carHome||root.querySelector('.gj-z-gallery'))return;
    const g=document.createElement('div');g.className='gj-z-gallery';
    g.innerHTML=`<figure><img loading="eager" decoding="async" src="''' + Z_EXTERIOR + r'''" alt="Black 2024 Nissan Z Performance"><figcaption>Black Diamond Pearl / Performance exterior</figcaption></figure><figure><img loading="eager" decoding="async" src="''' + Z_INTERIOR + r'''" alt="Red interior in a Nissan Z Performance"><figcaption>Red leather / synthetic-suede interior</figcaption></figure>`;
    carHome.parentNode.insertBefore(g,carHome);
  }
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-car]');
    if(open){clear();if(open.dataset.openCar==='nissan_z_2024_performance'){body.classList.add('gj-theme-nissan');gallery();}}
    if(event.target.closest('.gj-back'))clear();
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
        "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':(v.platform==='S550'?'GT':(v.platform==='C4'?'C4':'ST')));}",
        "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':(v.platform==='S550'?'GT':(v.platform==='C4'?'C4':(v.platform==='RZ34'?'Z':'ST'))));}",
    )
    context.metadata["extra_js"] = js + PHOTO_JS + NISSAN_JS
    if context.cards:
        body = _replace_vehicle_data(context.cards[0].body)
        body = body.replace(
            "Choose from the fully built BMW 330Ci, Porsche Cayman GT4, Mustang GT, Focus ST and 1985 Corvette C4.",
            "Choose from the fully built BMW 330Ci, Porsche Cayman GT4, Mustang GT, Focus ST, 1985 Corvette C4 and 2024 Nissan Z Performance.",
        )
        note=(
            '<p class="gj-photo-note">Nissan Z representative photos: '
            f'<a href="{Z_EXTERIOR_SOURCE}" target="_blank" rel="noopener noreferrer">Black Diamond Pearl exterior ↗</a> • '
            f'<a href="{Z_INTERIOR_SOURCE}" target="_blank" rel="noopener noreferrer">red Performance interior ↗</a></p>'
        )
        insert_at=body.rfind('</div>')
        if insert_at!=-1: body=body[:insert_at]+note+body[insert_at:]
        context.cards[0].body=body
    return context
