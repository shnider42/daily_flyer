"""Add the C8 Z06 without changing the v16 recovery implementation."""
from __future__ import annotations

import json

from daily_flyer.themes import garage_journey_v16 as base

THEME_NAME = 'garage_journey_v17'
THEME_CONFIG = base.THEME_CONFIG
PHOTO_ROOT = ('https://media.chevrolet.com/content/dam/Media/images/US/Vehicles/'
              'Chevrolet/Cars/Corvette_Z06/2023/Product/Vehicle/')
PHOTO_SOURCE = ('https://media.chevrolet.com/media/us/en/chevrolet/home.detail.html/'
                'content/Pages/news/us/en/2021/oct/1026-corvette-z06.html')
HERO = PHOTO_ROOT + '2023-Chevrolet-Corvette-Z06-012.jpg'
REAR = PHOTO_ROOT + '2023-Chevrolet-Corvette-Z06-013.jpg'
INTERIOR = PHOTO_ROOT + '2023-Chevrolet-Corvette-Z06-014.jpg'
PHOTO_CREDIT = 'Chevrolet / General Motors — representative 2023 C8 Z06 press photography'
VEHICLE_KEY = 'corvette_c8_z06_2024'
VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES] + [{
    'key': VEHICLE_KEY,
    'catalog_label': 'Corvette Z06',
    'year': '2024',
    'make': 'Chevrolet',
    'model': 'Corvette Z06',
    'trim': '2LZ / Red Mist Metallic Tintcoat',
    'platform': 'C8',
    'powertrain': 'LT6 5.5L flat-plane-crank V8 • 670 hp / 460 lb-ft • 8-speed DCT • RWD',
    'accent': '#861d35',
    'workshop_url': '/?theme=corvette_z06_workshop',
    'workshop_status': 'DEEP WORKSHOP AVAILABLE',
    'default_in_garage': False,
    'profile_status': 'VIN • mileage • body style • interior • Z07 • brakes • wheels still to confirm',
    'story': 'Red Mist Metallic Tintcoat over the wide C8 Z06 body, with a naturally aspirated LT6, '
             'eight-speed dual-clutch transmission and rear-wheel drive. This 2024 2LZ has its own '
             'owner profile and dedicated Workshop. Body style, interior, Z07, brake material, '
             'wheel construction, aero and front lift are unconfirmed.',
    'photo_url': HERO,
    'photo_credit': PHOTO_CREDIT,
    'photo_alt': 'Red Mist Metallic C8 Corvette Z06 — representative 2023 GM press photograph',
    'photo_source': PHOTO_SOURCE,
    'rear_photo_url': REAR,
    'interior_photo_url': INTERIOR,
    'interior_photo_source': PHOTO_SOURCE,
}]

EXTRA_CSS = base.EXTRA_CSS + r'''
/* C8-only styling; v16 scroll and modal rules remain in force. */
body.gj-theme-z06{--gj-accent:#861d35;--gj-accent-soft:#efb3be;background:radial-gradient(circle at 80% 6%,rgba(134,29,53,.24),transparent 32rem),#0b0c0f}
body.gj-theme-z06 .hero-wrap::before{background:linear-gradient(90deg,#861d35 0 46%,#c2c7cc 46% 62%,#282b30 62%)}
body.gj-theme-z06 .gj-car-title{background:repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 1px,transparent 1px 5px),linear-gradient(145deg,#21141a,#101115)}
body.gj-theme-z06 .gj-car-title h2{font-size:clamp(2.8rem,5.6vw,5.4rem);overflow-wrap:anywhere}
body.gj-theme-z06 .gj-car-code{line-height:1.7;overflow-wrap:anywhere}
body.gj-theme-z06 .gj-kicker,body.gj-theme-z06 .gj-back,body.gj-theme-z06 .gj-detail-back{color:#efb3be}
body.gj-theme-z06 .gj-home-workshop{--action-accent:#efb3be;background:linear-gradient(140deg,rgba(134,29,53,.24),rgba(255,255,255,.02))}
body.gj-theme-z06 .gj-floatnav{border-color:rgba(239,179,190,.3);background:rgba(12,13,16,.9)}
.gj-car-art[data-mark="Z06"]{background:#141419}
.gj-car-art[data-mark="Z06"]::before{display:none}
.gj-car-art[data-mark="Z06"]::after{content:"LT6 / Z06";font-size:1rem;color:#fff;background:#181319b8;padding:6px 10px;right:16px;bottom:12px}
.gj-z06-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}
.gj-z06-gallery figure{margin:0;min-width:0;background:#121317;border:1px solid #343036;border-radius:18px 5px;overflow:hidden}
.gj-z06-gallery img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover}
.gj-z06-gallery figcaption{padding:12px;color:#c4c5cb;font-size:.73rem;line-height:1.5}
.gj-z06-gallery a,.gj-z06-photo-note a{color:#efb3be}
.gj-z06-photo-note{font-size:.72rem;line-height:1.6;color:#b9bbc2}
.gj-z06-image-failed{position:relative;background:#17151a!important;background-image:none!important;min-height:140px}
.gj-z06-image-failed::before,.gj-z06-image-failed::after{display:none!important}
.gj-z06-fallback{position:absolute;inset:0;display:grid;place-content:center;padding:22px;text-align:center;color:#efb3be;font-size:.85rem;line-height:1.5;z-index:2;background:#17151a}
.gj-z06-gallery .gj-z06-fallback{position:relative;aspect-ratio:3/2}
@media(max-width:760px){
 .gj-z06-gallery{grid-template-columns:1fr}
 body.gj-theme-z06 .gj-car-title h2{font-size:clamp(2.7rem,12vw,4.2rem);line-height:.95}
 .gj-manage-card[data-manage-key="corvette_c8_z06_2024"] .gj-manage-meta{flex-wrap:wrap;gap:5px}
}
'''

# No new observer. Scoped capture-phase load/error handlers cover newly rendered
# manager/card images as well as detail images reused when changing vehicles.
Z06_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const key='corvette_c8_z06_2024';
  const v=JSON.parse(root.querySelector('#gj-data').textContent).find(item=>item.key===key);
  const isZ06=img=>img instanceof HTMLImageElement&&[v.photo_url,v.rear_photo_url,v.interior_photo_url].includes(img.getAttribute('src'));
  function clearFailure(img){
    img.style.removeProperty('visibility');
    img.parentElement?.classList.remove('gj-z06-image-failed');
    img.parentElement?.querySelector('.gj-z06-fallback')?.remove();
  }
  function failed(img){
    if(!isZ06(img))return;
    const parent=img.parentElement;if(!parent)return;
    img.style.visibility='hidden';parent.classList.add('gj-z06-image-failed');
    if(!parent.querySelector('.gj-z06-fallback')){
      const text=document.createElement('span');text.className='gj-z06-fallback';
      text.setAttribute('role','status');text.textContent='Corvette Z06 · Red Mist — photo unavailable';
      parent.appendChild(text);
    }
  }
  root.addEventListener('error',event=>failed(event.target),true);
  root.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement)clearFailure(event.target);},true);
  root.querySelectorAll('img').forEach(img=>{if(img.complete&&!img.naturalWidth)failed(img);});
  function clear(){
    document.body.classList.remove('gj-theme-z06');root.querySelector('.gj-z06-gallery')?.remove();
    root.querySelector('.gj-z06-photo-note')?.remove();
    const img=root.querySelector('.gj-car-photo');if(img)clearFailure(img);
  }
  function gallery(){
    const home=root.querySelector('.gj-car-home');if(!home)return;
    const grid=document.createElement('div');grid.className='gj-z06-gallery';
    const photos=[
      [v.photo_url,'Red Mist C8 Corvette Z06, rear three-quarter driving view','Red Mist Z06 exterior'],
      [v.rear_photo_url,'Red Mist C8 Corvette Z06 rear deck and spoiler detail','Z06 rear bodywork and spoiler detail'],
      [v.interior_photo_url,'Representative C8 Z06 cockpit with tan upholstery; owner interior unconfirmed','Representative cockpit — interior color unconfirmed']
    ];
    photos.forEach(([url,alt,caption])=>{
      const figure=document.createElement('figure');const img=document.createElement('img');
      img.alt=alt;img.loading='eager';img.decoding='async';img.src=url;
      const cap=document.createElement('figcaption');cap.textContent=caption;
      figure.append(img,cap);grid.appendChild(figure);
    });
    const note=document.createElement('p');note.className='gj-z06-photo-note';
    note.append('Chevrolet / General Motors. Representative 2023 C8 Z06 press photos in Red Mist; pictured convertible, trim and interior do not establish this 2024 car’s options. ');
    const source=document.createElement('a');source.href=v.photo_source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Photo source ↗';note.appendChild(source);
    home.before(grid,note);
  }
  root.addEventListener('click',event=>{
    const open=event.target.closest('[data-open-car]');
    if(open){clear();if(open.dataset.openCar===key){document.body.classList.add('gj-theme-z06');gallery();}}
    if(event.target.closest('.gj-back'))clear();
  },true);
})();
'''


def _replace_once(text: str, old: str, new: str) -> str:
    """Fail visibly if an inherited rendering hook changes, rather than mispatch JS."""
    if text.count(old) != 1:
        raise ValueError(f'Garage v17 expected one rendering hook: {old[:70]}')
    return text.replace(old, new, 1)


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata['theme_name'] = THEME_NAME
    context.metadata['extra_css'] = EXTRA_CSS
    body = context.cards[0].body
    marker = '<script id="gj-data" type="application/json">'
    start = body.index(marker) + len(marker)
    end = body.index('</script>', start)
    context.cards[0].body = body[:start] + json.dumps(VEHICLES).replace('</', '<\\/') + body[end:]
    js = context.metadata['extra_js']
    old = "function mark(v){return v.platform==='E46'?'E46':(v.platform==='982'?'GT4':(v.platform==='S550'?'GT':(v.platform==='C4'?'C4':(v.platform==='RZ34'?'Z':'ST'))));}"
    js = _replace_once(js, old, old.replace("return v.platform", "if(v.key==='corvette_c8_z06_2024')return 'Z06';return v.platform", 1))
    js = _replace_once(js, "function mark(v){return v.platform||v.year||'CAR';}",
                       "function mark(v){return v.key==='corvette_c8_z06_2024'?'Z06':(v.platform||v.year||'CAR');}")
    js = _replace_once(js, 'Choose from the fully built BMW 330Ci, Porsche Cayman GT4, Mustang GT and Focus ST.',
                       'Choose from seven complete vehicles: BMW 330Ci, Cayman GT4, Mustang GT, Focus ST, Corvette C4, Nissan Z and Corvette Z06.')
    alt_hook = 'img.alt=`${v.year} ${v.make} ${v.model}`;'
    if js.count(alt_hook) != 3:
        raise ValueError('Garage v17 image alt hooks changed')
    js = js.replace(alt_hook, 'img.alt=v.photo_alt||`${v.year} ${v.make} ${v.model}`;')
    context.metadata['extra_js'] = js + Z06_JS
    return context
