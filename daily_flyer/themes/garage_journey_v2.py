from __future__ import annotations

import json
from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import garage_journey as base


THEME_NAME = "garage_journey_v2"
THEME_CONFIG = {
    **base.THEME_CONFIG,
    "header_subtitle": "Your cars, their story, their paperwork, and the knowledge to understand them — all in one place.",
}
VEHICLES = base.VEHICLES


EXTRA_CSS = base.EXTRA_CSS + r"""
/* Garage Journey v2 — vehicle home becomes the primary navigation surface. */
.gj-car-head{grid-template-columns:.78fr 1.22fr;border-color:rgba(255,255,255,.18)}
.gj-car-art{min-height:330px}.gj-car-title{padding:30px}.gj-car-title h2{font-size:clamp(3rem,6.4vw,6.2rem)}
.gj-profile-status{max-width:720px}
.gj-car-home{padding:34px 0 14px}
.gj-home-intro{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:18px}
.gj-home-intro h3{margin:0;color:#fff;font-size:clamp(2rem,4vw,3.8rem);line-height:.9;letter-spacing:-.055em;text-transform:uppercase}
.gj-home-intro p{max-width:530px;margin:0;color:#83898c;font-size:.82rem}
.gj-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.16);border-left:1px solid rgba(255,255,255,.16)}
.gj-home-action{--action-accent:#ef9a62;position:relative;min-height:235px;display:flex;flex-direction:column;padding:24px;border:0;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.022);color:#fff;text-align:left;text-decoration:none;cursor:pointer;overflow:hidden;transition:background .16s ease,transform .16s ease}
.gj-home-action::before{content:"";width:50px;height:5px;margin-bottom:22px;background:var(--action-accent)}
.gj-home-action::after{content:attr(data-index);position:absolute;right:16px;top:7px;color:rgba(255,255,255,.055);font-size:7rem;font-weight:950;line-height:1;letter-spacing:-.08em}
.gj-home-action:hover,.gj-home-action:focus-visible{outline:none;transform:translateY(-2px);background:linear-gradient(135deg,color-mix(in srgb,var(--action-accent) 13%,transparent),rgba(255,255,255,.025));text-decoration:none}
.gj-home-action .gj-home-label{position:relative;z-index:1;color:#777e81;font-size:.61rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.gj-home-action strong{position:relative;z-index:1;display:block;margin:8px 0 7px;color:#fff;font-size:clamp(1.7rem,3vw,2.7rem);line-height:.92;letter-spacing:-.045em}
.gj-home-action p{position:relative;z-index:1;max-width:420px;margin:0;color:#8e9497;font-size:.81rem;line-height:1.45}
.gj-home-go{position:relative;z-index:1;margin-top:auto;padding-top:24px;color:var(--action-accent);font-size:.68rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.gj-home-overview{--action-accent:#ef9a62}.gj-home-journey{--action-accent:#d7b35d}.gj-home-glovebox{--action-accent:#8fa3aa}.gj-home-workshop{--action-accent:#5aa9e6;background:linear-gradient(140deg,rgba(28,105,212,.13),rgba(255,255,255,.018))}
.gj-home-workshop strong{font-size:clamp(2rem,3.4vw,3rem)}
.gj-workshop-badge{position:relative;z-index:2;display:inline-flex;align-self:flex-start;margin-top:12px;padding:5px 7px;border:1px solid color-mix(in srgb,var(--action-accent) 60%,transparent);color:#8dc1ed;font-size:.56rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.gj-car-snapshot{display:grid;grid-template-columns:repeat(4,1fr);margin-top:18px;border-top:1px solid rgba(255,255,255,.13);border-left:1px solid rgba(255,255,255,.13)}
.gj-snapshot-item{min-height:92px;padding:15px;border-right:1px solid rgba(255,255,255,.13);border-bottom:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.014)}
.gj-snapshot-item span{display:block;margin-bottom:8px;color:#6f777a;font-size:.57rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
.gj-snapshot-item strong{display:block;color:#d9dbda;font-size:.87rem;line-height:1.2}
.gj-detail-view{display:none;padding:34px 0 8px}.gj-detail-view.is-active{display:block}
.gj-detail-top{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:20px}
.gj-detail-back{padding:0;border:0;background:transparent;color:#ef9a62;font:inherit;font-size:.65rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;cursor:pointer}
.gj-detail-path{color:#676e71;font-size:.61rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.gj-detail-heading{display:grid;grid-template-columns:.42fr .58fr;gap:28px;align-items:end;margin-bottom:22px}
.gj-detail-heading h3{margin:0;color:#fff;font-size:clamp(2.4rem,5vw,4.8rem);line-height:.86;letter-spacing:-.06em;text-transform:uppercase}
.gj-detail-heading p{max-width:600px;margin:0;color:#858c8f}
.gj-detail-grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(255,255,255,.15);border-left:1px solid rgba(255,255,255,.15)}
.gj-detail-card{min-height:180px;padding:20px;border-right:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.02)}
.gj-detail-card .label{display:block;margin-bottom:20px;color:#6e7679;font-size:.59rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.gj-detail-card strong{display:block;margin-bottom:7px;color:#fff;font-size:1.16rem}.gj-detail-card p{margin:0;color:#838a8d;font-size:.79rem;line-height:1.45}
.gj-journey-line{border-top:1px solid rgba(255,255,255,.15)}.gj-journey-item{display:grid;grid-template-columns:150px 1fr auto;gap:18px;padding:19px 0;border-bottom:1px solid rgba(255,255,255,.13)}.gj-journey-item span:first-child{color:#72797c;font-size:.65rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.gj-journey-item strong{display:block;color:#fff}.gj-journey-item p{margin:4px 0 0;color:#81888b;font-size:.79rem}.gj-journey-type{color:#d7b35d;font-size:.59rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.gj-tabs,.gj-panel{display:none!important}
@media(max-width:900px){.gj-home-intro,.gj-detail-heading{display:block}.gj-home-intro p,.gj-detail-heading p{margin-top:14px}.gj-car-snapshot{grid-template-columns:repeat(2,1fr)}.gj-detail-grid{grid-template-columns:1fr 1fr}}
@media(max-width:650px){.gj-home-grid,.gj-detail-grid,.gj-car-snapshot{grid-template-columns:1fr}.gj-home-action{min-height:205px}.gj-home-action::after{font-size:5.3rem}.gj-journey-item{grid-template-columns:1fr}.gj-car-home{padding-top:24px}}
"""


EXTRA_JS = r"""
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const garageView=root.querySelector('[data-view="garage"]');
  const carView=root.querySelector('[data-view="car"]');
  const garageGrid=root.querySelector('.gj-garage-grid');
  const modal=root.querySelector('.gj-modal');
  const modalGrid=root.querySelector('.gj-catalog-grid');
  const openCatalog=[...root.querySelectorAll('[data-open-catalog]')];
  const closeModal=root.querySelector('.gj-close');
  const back=root.querySelector('.gj-back');
  const data=JSON.parse(root.querySelector('#gj-data').textContent);
  const storageKey='garage-journey-membership-v1';
  let membership,currentVehicle=null;
  try{membership=JSON.parse(localStorage.getItem(storageKey)||'null');}catch(error){membership=null;}
  if(!Array.isArray(membership))membership=data.filter(v=>v.default_in_garage).map(v=>v.key);

  function save(){try{localStorage.setItem(storageKey,JSON.stringify(membership));}catch(error){}}
  function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function vehicleByKey(key){return data.find(v=>v.key===key);}
  function mark(v){return v.platform==='E46'?'E46':'ST';}

  function vehicleCard(v,inGarage){
    return `<article class="gj-vehicle" style="--vehicle-accent:${esc(v.accent)}">
      <div class="gj-vehicle-visual"><span class="gj-vehicle-mark">${esc(mark(v))}</span><span class="gj-wheel left"></span><span class="gj-wheel right"></span></div>
      <div class="gj-vehicle-copy"><div class="gj-vehicle-meta"><span>${esc(v.catalog_label)}</span><span>${esc(v.year)}</span></div><h3>${esc(v.make)} ${esc(v.model)}</h3><p>${esc(v.powertrain)}</p></div>
      ${inGarage?`<button class="gj-open-car" type="button" data-open-car="${esc(v.key)}"><span>Open vehicle</span><span>→</span></button>`:`<button class="gj-add-car" type="button" data-add-car="${esc(v.key)}"><span>Add to Garage</span><span>＋</span></button>`}
    </article>`;
  }

  function renderGarage(){
    const current=data.filter(v=>membership.includes(v.key));
    garageGrid.innerHTML=current.map(v=>vehicleCard(v,true)).join('')+'<button class="gj-empty" type="button" data-open-catalog><span><strong>＋ Add another vehicle</strong>Choose a vehicle definition, then make it yours.</span></button>';
    garageGrid.querySelectorAll('[data-open-car]').forEach(btn=>btn.addEventListener('click',()=>openCar(btn.dataset.openCar)));
    garageGrid.querySelectorAll('[data-open-catalog]').forEach(btn=>btn.addEventListener('click',showCatalog));
  }
  function renderCatalog(){
    const available=data.filter(v=>!membership.includes(v.key));
    modalGrid.innerHTML=available.length?available.map(v=>vehicleCard(v,false)).join(''):'<div class="gj-empty"><span><strong>Everything in this POC catalog is already in your Garage.</strong>More vehicle definitions come next.</span></div>';
    modalGrid.querySelectorAll('[data-add-car]').forEach(btn=>btn.addEventListener('click',()=>{membership.push(btn.dataset.addCar);save();renderGarage();renderCatalog();modal.classList.remove('is-open');}));
  }
  function showCatalog(){renderCatalog();modal.classList.add('is-open');}
  openCatalog.forEach(btn=>btn.addEventListener('click',showCatalog));
  if(closeModal)closeModal.addEventListener('click',()=>modal.classList.remove('is-open'));
  if(modal)modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('is-open');});

  function resetHome(){
    root.querySelectorAll('.gj-detail-view').forEach(view=>view.classList.remove('is-active'));
    root.querySelector('.gj-car-home')?.removeAttribute('hidden');
  }
  function openDetail(name){
    root.querySelector('.gj-car-home')?.setAttribute('hidden','');
    root.querySelectorAll('.gj-detail-view').forEach(view=>view.classList.toggle('is-active',view.dataset.detail===name));
    carView.querySelector(`[data-detail="${name}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function openCar(key){
    const v=vehicleByKey(key);if(!v)return;currentVehicle=v;
    carView.querySelector('.gj-car-art').style.setProperty('--vehicle-accent',v.accent);
    carView.querySelector('.gj-car-art').dataset.mark=mark(v);
    carView.querySelector('.gj-car-code').textContent=`${v.year} // ${v.platform} // ${v.trim}`;
    carView.querySelector('.gj-car-name').textContent=`${v.make} ${v.model}`;
    carView.querySelector('.gj-car-story').textContent=v.story;
    carView.querySelector('.gj-profile-status').textContent=v.profile_status;
    carView.querySelector('[data-snap-car]').textContent=`${v.year} ${v.make} ${v.model}`;
    carView.querySelector('[data-snap-engine]').textContent=v.powertrain;
    carView.querySelector('[data-snap-profile]').textContent=v.profile_status;
    carView.querySelector('[data-snap-workshop]').textContent=v.workshop_url?'Deep workshop ready':'Workshop shell only';
    const workshopAction=carView.querySelector('.gj-home-workshop');
    if(v.workshop_url){workshopAction.href=v.workshop_url;workshopAction.classList.remove('is-disabled');workshopAction.querySelector('.gj-home-go').textContent=`Open ${v.platform} Workshop →`;workshopAction.querySelector('.gj-workshop-badge').textContent=v.workshop_status;}
    else{workshopAction.removeAttribute('href');workshopAction.classList.add('is-disabled');workshopAction.querySelector('.gj-home-go').textContent='Workshop not populated yet';workshopAction.querySelector('.gj-workshop-badge').textContent=v.workshop_status;}
    resetHome();garageView.classList.remove('is-active');carView.classList.add('is-active');window.scrollTo({top:0,behavior:'smooth'});
  }

  root.querySelectorAll('[data-open-detail]').forEach(btn=>btn.addEventListener('click',()=>openDetail(btn.dataset.openDetail)));
  root.querySelectorAll('.gj-detail-back').forEach(btn=>btn.addEventListener('click',resetHome));
  if(back)back.addEventListener('click',()=>{carView.classList.remove('is-active');garageView.classList.add('is-active');resetHome();window.scrollTo({top:0,behavior:'smooth'});});
  renderGarage();
})();
"""


def _vehicle_json() -> str:
    return json.dumps(VEHICLES).replace("</", "<\\/")


def _garage_body() -> str:
    return f'''
<div class="gj-shell">
  <script id="gj-data" type="application/json">{_vehicle_json()}</script>

  <section class="gj-view is-active" data-view="garage">
    <div class="gj-topbar">
      <div class="gj-brand"><strong>Garage Journey</strong> / proof of concept</div>
      <button class="gj-add" type="button" data-open-catalog>＋ Add vehicle</button>
    </div>
    <div class="gj-section-head">
      <div><span class="gj-kicker">MY GARAGE</span><h2>Your cars live here.</h2></div>
      <p>Every car gets its own story, paperwork, identity, and workshop — while technical knowledge stays reusable across the same make/model/year.</p>
    </div>
    <div class="gj-garage-grid"></div>
  </section>

  <section class="gj-view" data-view="car">
    <div class="gj-car-head">
      <div class="gj-car-art" data-mark="E46"></div>
      <div class="gj-car-title">
        <button class="gj-back" type="button">← My Garage</button>
        <span class="gj-car-code"></span>
        <h2 class="gj-car-name"></h2>
        <p class="gj-car-story"></p>
        <div class="gj-profile-status"></div>
      </div>
    </div>

    <div class="gj-car-home">
      <div class="gj-home-intro">
        <div><span class="gj-kicker">VEHICLE HOME</span><h3>Where do you want to go?</h3></div>
        <p>This is the command center for this specific car. Personal history and records live beside reusable technical knowledge.</p>
      </div>

      <div class="gj-home-grid">
        <button class="gj-home-action gj-home-overview" data-index="01" type="button" data-open-detail="overview">
          <span class="gj-home-label">CAR TODAY</span><strong>Overview</strong><p>Identity, configuration, current state, mileage, ownership and the essentials you want at a glance.</p><span class="gj-home-go">Open overview →</span>
        </button>
        <button class="gj-home-action gj-home-journey" data-index="02" type="button" data-open-detail="journey">
          <span class="gj-home-label">THE STORY</span><strong>Journey</strong><p>Repairs, maintenance, problems, modifications, milestones, photos and the chronology of this car.</p><span class="gj-home-go">Open journey →</span>
        </button>
        <button class="gj-home-action gj-home-glovebox" data-index="03" type="button" data-open-detail="glovebox">
          <span class="gj-home-label">THE PAPERWORK</span><strong>Glovebox</strong><p>Manuals, receipts, invoices, service sheets, tire records and everything normally stuffed into a folder.</p><span class="gj-home-go">Open glovebox →</span>
        </button>
        <a class="gj-home-action gj-home-workshop" data-index="04" href="#">
          <span class="gj-home-label">TECHNICAL KNOWLEDGE</span><strong>Workshop</strong><p>Search systems, components, symptoms, diagrams, fitment, parts and original technical sources.</p><span class="gj-workshop-badge">WORKSHOP</span><span class="gj-home-go">Open workshop →</span>
        </a>
      </div>

      <div class="gj-car-snapshot">
        <div class="gj-snapshot-item"><span>Vehicle</span><strong data-snap-car></strong></div>
        <div class="gj-snapshot-item"><span>Powertrain</span><strong data-snap-engine></strong></div>
        <div class="gj-snapshot-item"><span>Garage profile</span><strong data-snap-profile></strong></div>
        <div class="gj-snapshot-item"><span>Technical knowledge</span><strong data-snap-workshop></strong></div>
      </div>
    </div>

    <section class="gj-detail-view" data-detail="overview">
      <div class="gj-detail-top"><button class="gj-detail-back" type="button">← Vehicle home</button><span class="gj-detail-path">Vehicle / Overview</span></div>
      <div class="gj-detail-heading"><div><span class="gj-kicker">OVERVIEW</span><h3>The car today.</h3></div><p>A concise live snapshot. This eventually becomes the first place to check mileage, status, upcoming service, configuration and open issues.</p></div>
      <div class="gj-detail-grid">
        <div class="gj-detail-card"><span class="label">Identity</span><strong>2004 BMW 330Ci</strong><p>E46 coupe • M54B30 3.0L inline-six.</p></div>
        <div class="gj-detail-card"><span class="label">Profile completion</span><strong>Needs vehicle data</strong><p>VIN, production month, transmission, mileage and ownership dates still need to be recorded.</p></div>
        <div class="gj-detail-card"><span class="label">Current state</span><strong>Garage-specific</strong><p>Status, known issues, next work and recent activity belong to this individual car — not the generic E46 definition.</p></div>
      </div>
    </section>

    <section class="gj-detail-view" data-detail="journey">
      <div class="gj-detail-top"><button class="gj-detail-back" type="button">← Vehicle home</button><span class="gj-detail-path">Vehicle / Journey</span></div>
      <div class="gj-detail-heading"><div><span class="gj-kicker">JOURNEY</span><h3>The story of this car.</h3></div><p>A timeline that can be useful as maintenance history, build journal, troubleshooting memory or the history handed to the next owner.</p></div>
      <div class="gj-journey-line">
        <div class="gj-journey-item"><span>Garage Journey</span><div><strong>Vehicle profile created</strong><p>The BMW becomes the first individual car inside the Garage Journey proof of concept.</p></div><span class="gj-journey-type">PROFILE</span></div>
        <div class="gj-journey-item"><span>Next</span><div><strong>Real vehicle events</strong><p>Service, repair, failure, modification and milestone entries will eventually carry mileage, photos, parts, notes and documents.</p></div><span class="gj-journey-type">EVENT</span></div>
      </div>
    </section>

    <section class="gj-detail-view" data-detail="glovebox">
      <div class="gj-detail-top"><button class="gj-detail-back" type="button">← Vehicle home</button><span class="gj-detail-path">Vehicle / Glovebox</span></div>
      <div class="gj-detail-heading"><div><span class="gj-kicker">DIGITAL GLOVEBOX</span><h3>Everything you would keep.</h3></div><p>The non-enthusiast side is deliberate: the site's value should survive even if somebody never opens the Workshop.</p></div>
      <div class="gj-detail-grid">
        <div class="gj-detail-card"><span class="label">Manuals</span><strong>Owner & vehicle documents</strong><p>Owner manuals, quick references and model-specific documentation.</p></div>
        <div class="gj-detail-card"><span class="label">Receipts</span><strong>Parts & labor</strong><p>Receipts later attach to Journey events, maintenance items and individual components.</p></div>
        <div class="gj-detail-card"><span class="label">Records</span><strong>Service history</strong><p>Invoices, inspections, alignments, tire records and previous-owner paperwork.</p></div>
      </div>
    </section>
  </section>

  <div class="gj-modal" role="dialog" aria-modal="true" aria-label="Vehicle catalog">
    <div class="gj-modal-box">
      <div class="gj-modal-head"><div><span class="gj-kicker">VEHICLE CATALOG // POC</span><h3>Choose a vehicle definition</h3></div><button class="gj-close" type="button" aria-label="Close">×</button></div>
      <div class="gj-catalog-grid"></div>
    </div>
  </div>
</div>
'''


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
