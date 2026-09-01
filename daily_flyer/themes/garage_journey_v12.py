from __future__ import annotations

import json

from daily_flyer.themes import garage_journey_v11 as base

THEME_NAME = "garage_journey_v12"
THEME_CONFIG = base.THEME_CONFIG

# Catalog availability is separate from ownership. A fresh browser owns nothing.
VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES]
for vehicle in VEHICLES:
    vehicle["default_in_garage"] = False

MANAGE_MODAL = r'''
  <div class="gj-manage-modal" role="dialog" aria-modal="true" aria-label="Build or manage your garage">
    <div class="gj-manage-box">
      <div class="gj-manage-head">
        <div><span class="gj-kicker">GARAGE BUILDER</span><h3>Build your garage.</h3><p>Choose the vehicles that belong in <em>My Garage</em>. The full inventory stays available whenever you want to change it.</p></div>
        <button class="gj-manage-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="gj-manage-toolbar"><span data-gj-selected-count>0 selected</span><button type="button" data-gj-clear>Clear selection</button></div>
      <div class="gj-manage-grid"></div>
      <div class="gj-manage-actions">
        <button class="gj-manage-cancel" type="button">Cancel</button>
        <button class="gj-manage-save" type="button">Save My Garage</button>
      </div>
    </div>
  </div>
'''

TOUR_MODAL = r'''
  <div class="gj-tour-modal" role="dialog" aria-modal="true" aria-label="Welcome to Garage Journey">
    <div class="gj-tour-box">
      <button class="gj-tour-close" type="button" aria-label="Close">×</button>
      <div class="gj-tour-title"><span class="gj-kicker">WELCOME TO GARAGE JOURNEY</span><h3>Start with the cars that are yours.</h3><p>Garage Journey has a vehicle library. <strong>My Garage</strong> is the smaller set you choose from that library.</p></div>
      <div class="gj-tour-steps">
        <div><span>01</span><strong>Build your garage</strong><p>Pick any of the available cars. Nothing is added automatically on a fresh browser.</p></div>
        <div><span>02</span><strong>Open a vehicle</strong><p>Each car has Overview, Journey, Glovebox and a deep technical Workshop.</p></div>
        <div><span>03</span><strong>Make it yours over time</strong><p>Profile details and future Journey history belong to your individual car; technical knowledge stays reusable.</p></div>
      </div>
      <div class="gj-tour-note">Proof of concept: Garage membership and vehicle profile fields are stored in this browser for now.</div>
      <div class="gj-tour-actions"><button class="gj-tour-skip" type="button">Explore first</button><button class="gj-tour-build" type="button">Build My Garage →</button></div>
    </div>
  </div>
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


def _upgrade_body(body: str) -> str:
    body = _replace_vehicle_data(body)
    body = body.replace(
        '<div class="gj-brand"><strong>Garage Journey</strong> / proof of concept</div>\n      <button class="gj-add" type="button" data-open-catalog>＋ Add vehicle</button>',
        '<div class="gj-brand"><strong>Garage Journey</strong> / proof of concept</div>\n      <div class="gj-garage-actions"><button class="gj-how" type="button" data-show-tour>How it works</button><button class="gj-add" type="button" data-open-catalog>Manage Garage</button></div>',
    )
    body = body.replace(
        '<div><span class="gj-kicker">MY GARAGE</span><h2>Your cars live here.</h2></div>',
        '<div><span class="gj-kicker" data-gj-home-kicker>MY GARAGE</span><h2 data-gj-home-title>Your cars live here.</h2></div>',
    )
    body = body.replace(
        '<p>Every car gets its own story, paperwork, identity, and workshop — while technical knowledge stays reusable across the same make/model/year.</p>',
        '<p data-gj-home-copy>Every car gets its own story, paperwork, identity, and workshop — while technical knowledge stays reusable across the same make/model/year.</p>',
    )
    insert_at = body.rfind('</div>')
    if insert_at != -1:
        body = body[:insert_at] + MANAGE_MODAL + TOUR_MODAL + body[insert_at:]
    return body


EXTRA_CSS = base.EXTRA_CSS + r'''
/* recovery v12 — explicit inventory vs My Garage + first-run onboarding */
.gj-garage-actions{display:flex;align-items:center;gap:8px}.gj-how{min-height:44px;padding:0 15px;border:0;border-radius:999px;background:transparent;color:#8d9392;font-family:var(--gj-mono);font-size:.58rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer}.gj-how:hover{color:#fff;background:rgba(255,255,255,.045)}
.gj-vehicle{position:relative}.gj-owned-pill{position:absolute;z-index:8;top:14px;left:14px;padding:7px 10px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(8,10,10,.62);backdrop-filter:blur(10px);color:#fff;font-family:var(--gj-mono);font-size:.52rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.gj-remove-car{position:absolute;z-index:9;top:14px;right:14px;padding:7px 10px;border:1px solid rgba(255,255,255,.17);border-radius:999px;background:rgba(8,10,10,.66);backdrop-filter:blur(10px);color:#bfc3c2;font-family:var(--gj-mono);font-size:.52rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer}.gj-remove-car:hover{border-color:rgba(226,106,106,.55);background:rgba(110,27,27,.68);color:#fff}
.gj-view[data-view="garage"].gj-is-empty .gj-section-head{margin-bottom:20px}.gj-view[data-view="garage"].gj-is-empty [data-gj-home-title]{font-size:clamp(3.7rem,8vw,7.5rem)}.gj-view[data-view="garage"].gj-is-empty .gj-empty{grid-column:span 12;min-height:310px;border-style:solid;background:radial-gradient(circle at 75% 35%,rgba(255,255,255,.055),transparent 22rem),rgba(255,255,255,.018)}.gj-view[data-view="garage"].gj-is-empty .gj-empty>span{max-width:520px}.gj-view[data-view="garage"].gj-is-empty .gj-empty strong{font-family:var(--gj-display);font-size:clamp(2.2rem,4vw,4rem);line-height:.95;letter-spacing:-.02em}.gj-view[data-view="garage"].gj-is-empty .gj-empty small{display:block;margin-top:12px;color:#858c8b;font-family:var(--gj-body);font-size:.78rem;line-height:1.6}
.gj-manage-modal,.gj-tour-modal{position:fixed;inset:0;z-index:180;display:none;place-items:center;padding:22px;background:rgba(3,5,5,.78);backdrop-filter:blur(18px) saturate(110%);-webkit-backdrop-filter:blur(18px) saturate(110%)}.gj-manage-modal.is-open,.gj-tour-modal.is-open{display:grid}.gj-manage-box{width:min(1180px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:34px 9px 34px 9px;background:#101212;box-shadow:0 36px 120px rgba(0,0,0,.48)}.gj-manage-head{display:flex;justify-content:space-between;gap:26px;padding:30px 32px 24px;border-bottom:1px solid rgba(255,255,255,.09)}.gj-manage-head h3,.gj-tour-title h3{margin:4px 0 8px;color:#fff;font-family:var(--gj-display);font-size:clamp(3rem,6vw,5.6rem);font-weight:800;line-height:.82;letter-spacing:-.025em}.gj-manage-head p,.gj-tour-title p{max-width:680px;margin:0;color:#8d9492;font-size:.82rem;line-height:1.65}.gj-manage-head em{color:#ddd;font-style:normal}.gj-manage-close,.gj-tour-close{flex:0 0 auto;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.055);color:#aaa;font-size:1.25rem;cursor:pointer}.gj-manage-close:hover,.gj-tour-close:hover{background:rgba(255,255,255,.10);color:#fff}.gj-manage-toolbar{display:flex;justify-content:space-between;align-items:center;padding:13px 32px;border-bottom:1px solid rgba(255,255,255,.07);color:#777f7d;font-family:var(--gj-mono);font-size:.58rem;text-transform:uppercase;letter-spacing:.08em}.gj-manage-toolbar button{border:0;background:transparent;color:#777f7d;font:inherit;cursor:pointer}.gj-manage-toolbar button:hover{color:#fff}
.gj-manage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px}.gj-manage-card{position:relative;min-height:260px;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:22px 6px 22px 6px;background:#141616;cursor:pointer;transition:transform .18s ease,border-color .18s ease}.gj-manage-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.23)}.gj-manage-card.is-selected{border-color:color-mix(in srgb,var(--vehicle-accent) 70%,white);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--vehicle-accent) 45%,transparent)}.gj-manage-photo{height:170px;background-size:cover;background-position:center;filter:saturate(.93)}.gj-manage-copy{padding:16px 18px 18px}.gj-manage-meta{display:flex;justify-content:space-between;gap:10px;color:#707876;font-family:var(--gj-mono);font-size:.52rem;letter-spacing:.08em;text-transform:uppercase}.gj-manage-copy strong{display:block;margin:5px 0 3px;color:#fff;font-family:var(--gj-display);font-size:2rem;font-weight:700;letter-spacing:-.02em}.gj-manage-copy p{margin:0;color:#858c8a;font-size:.69rem}.gj-manage-toggle{position:absolute;right:12px;top:12px;padding:8px 11px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(7,9,9,.72);backdrop-filter:blur(9px);color:#ccc;font-family:var(--gj-mono);font-size:.52rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.gj-manage-card.is-selected .gj-manage-toggle{border-color:transparent;background:var(--vehicle-accent);color:#fff}.gj-manage-actions{display:flex;justify-content:flex-end;gap:8px;padding:18px 22px 24px;border-top:1px solid rgba(255,255,255,.08)}.gj-manage-actions button,.gj-tour-actions button{min-height:44px;padding:0 17px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:transparent;color:#e7e8e5;font-family:var(--gj-mono);font-size:.58rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer}.gj-manage-save,.gj-tour-build{background:#e9e7df!important;border-color:#e9e7df!important;color:#111!important}.gj-manage-save:hover,.gj-tour-build:hover{background:#fff!important}
.gj-tour-box{position:relative;width:min(1000px,95vw);padding:38px;border:1px solid rgba(255,255,255,.14);border-radius:38px 10px 38px 10px;background:radial-gradient(circle at 86% 8%,rgba(255,255,255,.055),transparent 20rem),#101212;box-shadow:0 36px 120px rgba(0,0,0,.5)}.gj-tour-close{position:absolute;right:20px;top:20px}.gj-tour-title{padding-right:60px}.gj-tour-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:30px}.gj-tour-steps>div{min-height:190px;padding:20px;border:1px solid rgba(255,255,255,.09);border-radius:18px 5px 18px 5px;background:rgba(255,255,255,.018)}.gj-tour-steps span{display:block;margin-bottom:30px;color:#68706e;font-family:var(--gj-mono);font-size:.59rem}.gj-tour-steps strong{display:block;color:#fff;font-family:var(--gj-display);font-size:1.7rem;line-height:1}.gj-tour-steps p{margin:8px 0 0;color:#858c8a;font-size:.72rem;line-height:1.55}.gj-tour-note{margin-top:12px;padding:12px 15px;border-radius:12px;background:rgba(255,255,255,.025);color:#737a78;font-size:.66rem}.gj-tour-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
@media(max-width:760px){.gj-garage-actions{gap:3px}.gj-how{display:none}.gj-manage-grid,.gj-tour-steps{grid-template-columns:1fr}.gj-manage-box{max-height:94vh}.gj-manage-head{padding:24px 20px 18px}.gj-manage-grid{padding:12px}.gj-tour-box{padding:28px 18px 20px}.gj-tour-steps>div{min-height:140px}.gj-tour-actions{flex-direction:column-reverse}.gj-tour-actions button{width:100%}}
'''


EXTRA_JS = r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const data=JSON.parse(root.querySelector('#gj-data')?.textContent||'[]');
  const membershipKey='garage-journey-membership-v2';
  const tourKey='garage-journey-onboarding-v1';
  const garageView=root.querySelector('[data-view="garage"]');
  const garageGrid=root.querySelector('.gj-garage-grid');
  const manage=root.querySelector('.gj-manage-modal');
  const manageGrid=root.querySelector('.gj-manage-grid');
  const tour=root.querySelector('.gj-tour-modal');
  let draft=[];

  function esc(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function readMembership(){try{const parsed=JSON.parse(localStorage.getItem(membershipKey)||'[]');return Array.isArray(parsed)?parsed:[];}catch(error){return [];}}
  function writeMembership(value){try{localStorage.setItem(membershipKey,JSON.stringify(value));}catch(error){}}
  function mark(v){return v.platform||v.year||'CAR';}
  function photoStyle(v){const url=String(v.photo_url||'').replace(/["']/g,'');return url?`background-image:linear-gradient(180deg,rgba(5,7,7,.02),rgba(5,7,7,.28)),url("${url}")`:'';}

  function updateHomeState(){
    if(!garageView||!garageGrid)return;
    const cards=[...garageGrid.querySelectorAll('.gj-vehicle')].filter(card=>card.querySelector('[data-open-car]'));
    const empty=cards.length===0;
    garageView.classList.toggle('gj-is-empty',empty);
    const kicker=root.querySelector('[data-gj-home-kicker]');const title=root.querySelector('[data-gj-home-title]');const copy=root.querySelector('[data-gj-home-copy]');
    if(kicker)kicker.textContent=empty?'BUILD YOUR GARAGE':'MY GARAGE';
    if(title)title.textContent=empty?'Which cars are yours?':'Your cars live here.';
    if(copy)copy.textContent=empty?'Choose from the Garage Journey vehicle library. You can add, remove, and revisit cars at any time.':'These are the vehicles you selected from the Garage Journey library. Manage Garage changes membership without deleting your saved vehicle profile.';
    const emptyButton=garageGrid.querySelector('.gj-empty');
    if(emptyButton){
      const next=empty?'<span><strong>Build My Garage →</strong><small>Choose from the fully built BMW 330Ci, Porsche Cayman GT4, Mustang GT and Focus ST.</small></span>':'<span><strong>＋ Browse & manage vehicles</strong><small>Add another car or remove one from My Garage.</small></span>';
      if(emptyButton.innerHTML!==next)emptyButton.innerHTML=next;
    }
    root.querySelectorAll('.gj-garage-summary [data-gj-count]').forEach(node=>node.textContent=`${cards.length} vehicle${cards.length===1?'':'s'}`);
  }

  function decorateGarage(){
    if(!garageGrid)return;
    garageGrid.querySelectorAll('.gj-vehicle').forEach(card=>{
      const open=card.querySelector('[data-open-car]');if(!open)return;
      const key=open.dataset.openCar;
      if(!card.querySelector('.gj-owned-pill'))card.insertAdjacentHTML('afterbegin','<span class="gj-owned-pill">My Garage</span>');
      if(!card.querySelector('.gj-remove-car'))card.insertAdjacentHTML('beforeend',`<button class="gj-remove-car" type="button" data-remove-car="${esc(key)}" title="Remove from My Garage; you can add it back later">Remove</button>`);
    });
    updateHomeState();
  }

  function renderManager(){
    if(!manageGrid)return;
    const selected=new Set(draft);
    manageGrid.innerHTML=data.map(v=>{
      const on=selected.has(v.key);
      return `<button class="gj-manage-card${on?' is-selected':''}" type="button" data-manage-key="${esc(v.key)}" style="--vehicle-accent:${esc(v.accent)}"><span class="gj-manage-toggle">${on?'✓ In My Garage':'+ Add to Garage'}</span><div class="gj-manage-photo" style="${photoStyle(v)}"></div><div class="gj-manage-copy"><div class="gj-manage-meta"><span>${esc(v.catalog_label)}</span><span>${esc(v.year)} / ${esc(mark(v))}</span></div><strong>${esc(v.make)} ${esc(v.model)}</strong><p>${esc(v.powertrain)}</p></div></button>`;
    }).join('');
    const count=root.querySelector('[data-gj-selected-count]');if(count)count.textContent=`${draft.length} selected`;
  }

  function openManager(){draft=readMembership().filter(key=>data.some(v=>v.key===key));renderManager();manage?.classList.add('is-open');}
  function closeManager(){manage?.classList.remove('is-open');}
  function closeTour(){tour?.classList.remove('is-open');try{localStorage.setItem(tourKey,'seen');}catch(error){}}

  document.addEventListener('click',event=>{
    const catalog=event.target.closest('[data-open-catalog]');
    if(catalog&&root.contains(catalog)){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openManager();return;}
    const showTour=event.target.closest('[data-show-tour]');if(showTour){tour?.classList.add('is-open');return;}
    const remove=event.target.closest('[data-remove-car]');if(remove){event.preventDefault();event.stopPropagation();const key=remove.dataset.removeCar;writeMembership(readMembership().filter(item=>item!==key));location.reload();return;}
    const manageCard=event.target.closest('[data-manage-key]');if(manageCard){const key=manageCard.dataset.manageKey;draft=draft.includes(key)?draft.filter(item=>item!==key):[...draft,key];renderManager();return;}
    if(event.target.closest('.gj-manage-close')||event.target.closest('.gj-manage-cancel')){closeManager();return;}
    if(event.target.closest('[data-gj-clear]')){draft=[];renderManager();return;}
    if(event.target.closest('.gj-manage-save')){writeMembership(draft);try{localStorage.setItem(tourKey,'seen');}catch(error){}location.reload();return;}
    if(event.target.closest('.gj-tour-build')){closeTour();openManager();return;}
    if(event.target.closest('.gj-tour-skip')||event.target.closest('.gj-tour-close')){closeTour();return;}
  },true);
  manage?.addEventListener('click',event=>{if(event.target===manage)closeManager();});
  tour?.addEventListener('click',event=>{if(event.target===tour)closeTour();});

  // No MutationObserver: v11 renders the Garage synchronously before this script,
  // and membership changes reload the page. The old observer watched and mutated
  // the same subtree, creating a self-triggering loop in the browser.
  decorateGarage();
  try{if(!localStorage.getItem(tourKey))setTimeout(()=>tour?.classList.add('is-open'),350);}catch(error){}
})();
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS
    context.metadata["extra_js"] = context.metadata.get("extra_js", "") + EXTRA_JS
    if context.cards:
        context.cards[0].body = _upgrade_body(context.cards[0].body)
    return context
