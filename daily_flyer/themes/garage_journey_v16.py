from __future__ import annotations

from daily_flyer.themes import garage_journey_v15 as base

THEME_NAME = "garage_journey_v16"
THEME_CONFIG = base.THEME_CONFIG
VEHICLES = base.VEHICLES

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v16 — mobile scroll stabilization + real photos in Garage Builder */
.gj-manage-photo{position:relative;overflow:hidden;background:#111}
.gj-manage-photo-img{display:block;width:100%;height:100%;object-fit:cover}
.gj-manage-photo:has(.gj-manage-photo-img){background-image:none!important}

@media(max-width:760px){
  html,body{max-width:100%;overflow-x:hidden}
  body{padding-bottom:0!important}
  html.gj-scroll-locked{overflow:hidden!important;overscroll-behavior:none}
  body.gj-scroll-locked{position:fixed;left:0;right:0;width:100%;overflow:hidden!important;overscroll-behavior:none}

  .gj-shell{overflow:visible!important;padding-bottom:0!important}
  .gj-view[data-view="garage"]{padding-bottom:24px}
  .gj-view[data-view="car"]{padding-bottom:calc(94px + env(safe-area-inset-bottom))}

  /* The floating nav is only useful once a vehicle is open. */
  .gj-floatnav{display:none!important}
  body.gj-in-vehicle:not(.gj-scroll-locked) .gj-floatnav{display:flex!important;top:auto!important;bottom:calc(9px + env(safe-area-inset-bottom));left:50%;width:min(calc(100vw - 24px),360px);transform:translateX(-50%);justify-content:stretch}
  body.gj-in-vehicle .gj-floatnav button{flex:1;min-width:0}

  /* One scrolling region inside the Garage Builder. */
  .gj-manage-modal,.gj-tour-modal,.gj-profile-modal,.gj-modal{overscroll-behavior:contain;touch-action:pan-y}
  .gj-manage-box{display:flex!important;flex-direction:column;height:min(92dvh,92svh);max-height:none!important;overflow:hidden!important}
  .gj-manage-head,.gj-manage-toolbar,.gj-manage-actions{flex:0 0 auto}
  .gj-manage-grid{flex:1 1 auto;min-height:0;overflow-y:auto!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:20px}
  .gj-manage-actions{position:relative!important;bottom:auto!important;z-index:2}

  .gj-tour-box,.gj-profile-box,.gj-modal-box{max-height:92dvh!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  .gj-tour-actions,.gj-profile-actions{position:relative!important;bottom:auto!important}

  .gj-manage-card{min-width:0;overflow:hidden}
  .gj-manage-photo{height:auto;min-height:118px}
  .gj-manage-photo-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .gj-manage-copy{min-width:0}
  .gj-manage-copy strong,.gj-manage-copy p{overflow-wrap:anywhere}

  /* Avoid animated page jumps fighting touch scrolling on phone. */
  .gj-detail-view{scroll-margin-top:12px}
}
'''

MOBILE_FIX_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const body=document.body;
  const html=document.documentElement;
  const carView=root.querySelector('[data-view="car"]');
  const modals=[...root.querySelectorAll('.gj-manage-modal,.gj-tour-modal,.gj-profile-modal,.gj-modal')];
  const data=JSON.parse(root.querySelector('#gj-data')?.textContent||'[]');
  let lockedY=0;

  function hydrateManager(){
    root.querySelectorAll('.gj-manage-card[data-manage-key]').forEach(card=>{
      const v=data.find(item=>item.key===card.dataset.manageKey);
      const photo=card.querySelector('.gj-manage-photo');
      if(!v||!photo||!v.photo_url)return;
      let img=photo.querySelector('.gj-manage-photo-img');
      if(!img){
        img=document.createElement('img');
        img.className='gj-manage-photo-img';
        img.loading='eager';
        img.decoding='async';
        photo.replaceChildren(img);
      }
      if(img.getAttribute('src')!==v.photo_url)img.src=v.photo_url;
      img.alt=`${v.year} ${v.make} ${v.model}`;
    });
  }

  function anyModalOpen(){return modals.some(modal=>modal.classList.contains('is-open'));}
  function syncScrollLock(){
    const open=anyModalOpen();
    const locked=body.classList.contains('gj-scroll-locked');
    if(open&&!locked){
      lockedY=window.scrollY||document.documentElement.scrollTop||0;
      body.style.top=`-${lockedY}px`;
      body.classList.add('gj-scroll-locked');
      html.classList.add('gj-scroll-locked');
    }else if(!open&&locked){
      body.classList.remove('gj-scroll-locked');
      html.classList.remove('gj-scroll-locked');
      body.style.top='';
      window.scrollTo(0,lockedY);
    }
  }

  function syncVehicleState(){
    body.classList.toggle('gj-in-vehicle',!!carView?.classList.contains('is-active'));
  }

  modals.forEach(modal=>new MutationObserver(()=>{syncScrollLock();hydrateManager();}).observe(modal,{attributes:true,attributeFilter:['class']}));
  if(carView)new MutationObserver(syncVehicleState).observe(carView,{attributes:true,attributeFilter:['class']});

  document.addEventListener('click',()=>requestAnimationFrame(()=>{
    hydrateManager();
    syncScrollLock();
    syncVehicleState();
  }),true);

  window.addEventListener('pageshow',()=>{hydrateManager();syncScrollLock();syncVehicleState();});
  hydrateManager();syncScrollLock();syncVehicleState();
})();
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS

    js = context.metadata.get("extra_js", "")
    js = js.replace(
        '<div class="gj-manage-photo" style="${photoStyle(v)}"></div>',
        '<div class="gj-manage-photo"><img class="gj-manage-photo-img" src="${esc(v.photo_url)}" alt="${esc(v.year+\' \'+v.make+\' \'+v.model)}" loading="eager" decoding="async"></div>',
    )
    js = js.replace(
        "scrollIntoView({behavior:'smooth',block:'start'})",
        "scrollIntoView({behavior:window.matchMedia('(max-width:760px)').matches?'auto':'smooth',block:'start'})",
    )
    js = js.replace(
        "window.scrollTo({top:0,behavior:'smooth'})",
        "window.scrollTo({top:0,behavior:window.matchMedia('(max-width:760px)').matches?'auto':'smooth'})",
    )
    context.metadata["extra_js"] = js + MOBILE_FIX_JS
    return context
