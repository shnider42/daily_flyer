from __future__ import annotations

from html import escape

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date


THEME_NAME = "garage_journey"

THEME_CONFIG = {
    "page_title": "Garage Journey",
    "header_title": "GARAGE JOURNEY",
    "header_subtitle": "Your cars, their history, and the technical knowledge behind them — all in one place.",
    "footer_text": (
        "Garage Journey proof of concept. Vehicle-specific technical information remains linked to original sources; "
        "personal vehicle history, documents, and workshop records will become persistent Garage data in later iterations."
    ),
    "hero_kicker": "MY GARAGE // DIGITAL GLOVEBOX // WORKSHOP",
    "hero_summary_pill": "GARAGE • JOURNEY • GLOVEBOX • WORKSHOP",
}


VEHICLES = [
    {
        "key": "e46_330ci_2004",
        "catalog_label": "BMW E46",
        "year": "2004",
        "make": "BMW",
        "model": "330Ci",
        "trim": "Coupe",
        "powertrain": "M54B30 • 3.0L inline-six",
        "platform": "E46",
        "accent": "#1c69d4",
        "workshop_url": "/?theme=e46_owner_companion_v5",
        "workshop_status": "DEEP WORKSHOP AVAILABLE",
        "default_in_garage": True,
        "profile_status": "VIN • mileage • transmission • production month still to record",
        "story": "This is the first Garage Journey vehicle and the proving ground for deep diagrams, fitment, diagnosis, sources, and component-level workshop navigation.",
    },
    {
        "key": "focus_st_2015",
        "catalog_label": "Focus ST",
        "year": "2015",
        "make": "Ford",
        "model": "Focus ST",
        "trim": "Hatchback",
        "powertrain": "2.0L EcoBoost",
        "platform": "Focus ST",
        "accent": "#4e9b71",
        "workshop_url": "",
        "workshop_status": "WORKSHOP SHELL ONLY",
        "default_in_garage": False,
        "profile_status": "POC vehicle definition • personal history not populated",
        "story": "A second vehicle definition used to prove that Garage Journey is not secretly an E46-only product. The same Overview, Journey, Glovebox, and Workshop shell applies here.",
    },
]


EXTRA_CSS = r"""
:root{--bg:#0d0e0e;--bg-deep:#080909;--bg-soft:#151717;--card:#f1f0eb;--card-strong:#faf9f5;--border:#2c2f30;--border-strong:#101212;--ink:#171919;--ink-soft:#444a4c;--muted:#73797c;--irish-green:#1c69d4;--gold:#dedbd2;--teal:#5aa9e6;--blue:#1c69d4;--radius-xl:0;--radius-lg:0;--radius-md:0;--max-width:1280px}
html{background:#0d0e0e}body{background:linear-gradient(rgba(12,13,13,.975),rgba(12,13,13,.985)),repeating-linear-gradient(0deg,transparent 0 35px,rgba(255,255,255,.025) 36px),repeating-linear-gradient(90deg,transparent 0 35px,rgba(255,255,255,.025) 36px),#0d0e0e;color:#f4f3ef;font-family:Arial,Helvetica,sans-serif}body::before,body::after{display:none}.hero-wrap{padding:0 18px}.hero-wrap::before{content:"";display:block;height:8px;max-width:var(--max-width);margin:0 auto;background:linear-gradient(90deg,#ef7f35 0 18%,#1c69d4 18% 36%,#5aa9e6 36% 54%,#f5f4ef 54% 72%,transparent 72%)}
header.hero{min-height:300px;padding:38px 0 30px;border:0;border-bottom:1px solid rgba(255,255,255,.17);border-radius:0;background:transparent;box-shadow:none;color:#f5f4ef;backdrop-filter:none;overflow:visible}header.hero::before{display:none}header.hero::after{content:"EST. WITH ONE CAR";position:absolute;right:0;bottom:31px;color:rgba(255,255,255,.13);font-size:clamp(.8rem,2vw,1.4rem);font-weight:900;letter-spacing:.18em}.hero-kicker{padding:0;border:0;border-radius:0;background:transparent;color:#ef9a62;font-size:.7rem;font-weight:900;letter-spacing:.17em}.hero h1{max-width:none;margin:.55rem 0 0;font-size:clamp(4rem,10.5vw,8.7rem);line-height:.77;letter-spacing:-.077em;font-weight:950;text-transform:uppercase}.hero .subtitle{max-width:760px;margin-top:24px;color:#d1d0cb;font-size:1.02rem;line-height:1.5}.hero-meta{margin-top:18px}.hero-meta .hero-pill:first-child{display:none}.hero-pill{padding:0;border:0;border-radius:0;background:transparent;color:#858b8e;font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
main{gap:0;padding-top:0}.card{grid-column:span 12;min-height:0;margin:0;padding:0;border:0;border-bottom:1px solid rgba(255,255,255,.14);border-radius:0;background:transparent;color:#f5f4ef;box-shadow:none;backdrop-filter:none;overflow:visible}.card:hover{transform:none;box-shadow:none}.card::before,.card::after{display:none}.card-head,.source{display:none}.body{color:#d3d2cd;font-size:.96rem;line-height:1.5}
.gj-shell{padding:38px 0 56px}.gj-topbar{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:38px}.gj-brand{font-size:.72rem;font-weight:900;letter-spacing:.17em;text-transform:uppercase;color:#8e9497}.gj-brand strong{color:#f2f1ed}.gj-add{border:1px solid rgba(255,255,255,.22);padding:11px 14px;background:transparent;color:#fff;font:inherit;font-size:.7rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;cursor:pointer}.gj-add:hover{border-color:#ef9a62;background:rgba(239,154,98,.07)}
.gj-view{display:none}.gj-view.is-active{display:block}.gj-section-head{display:grid;grid-template-columns:.42fr .58fr;gap:34px;align-items:end;margin-bottom:24px}.gj-kicker{display:block;margin-bottom:10px;color:#ef9a62;font-size:.66rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.gj-section-head h2{margin:0;color:#f6f4ef;font-size:clamp(2.4rem,5.5vw,5.4rem);line-height:.86;letter-spacing:-.065em;text-transform:uppercase}.gj-section-head p{max-width:650px;margin:0;color:#8f9598}.gj-garage-grid,.gj-catalog-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.16);border-left:1px solid rgba(255,255,255,.16)}
.gj-vehicle{--vehicle-accent:#1c69d4;position:relative;min-height:390px;display:flex;flex-direction:column;padding:0;border:0;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.025);color:#fff;text-align:left;overflow:hidden}.gj-vehicle-visual{position:relative;height:205px;display:flex;align-items:flex-end;padding:22px;background:linear-gradient(145deg,color-mix(in srgb,var(--vehicle-accent) 20%,#171919),#101111);overflow:hidden}.gj-vehicle-visual::before{content:"";position:absolute;width:68%;height:42%;left:16%;bottom:23%;border:3px solid color-mix(in srgb,var(--vehicle-accent) 56%,#fff);border-radius:52% 42% 18% 16%/58% 52% 25% 26%;transform:skewX(-7deg);opacity:.72}.gj-vehicle-visual::after{content:"";position:absolute;left:23%;right:23%;bottom:18%;height:27%;border-bottom:6px solid rgba(255,255,255,.58);border-radius:50%}.gj-wheel{position:absolute;bottom:25px;width:44px;height:44px;border:7px solid #0b0c0c;border-radius:50%;background:#777}.gj-wheel.left{left:25%}.gj-wheel.right{right:25%}.gj-vehicle-mark{position:relative;z-index:2;color:rgba(255,255,255,.12);font-size:clamp(3rem,7vw,6.5rem);font-weight:950;letter-spacing:-.07em;text-transform:uppercase}.gj-vehicle-copy{flex:1;padding:21px}.gj-vehicle-meta{display:flex;justify-content:space-between;gap:15px;color:#858b8e;font-size:.64rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.gj-vehicle h3{margin:10px 0 4px;color:#fff;font-size:2rem;line-height:.93;letter-spacing:-.05em}.gj-vehicle p{margin:0;color:#93999c;font-size:.83rem}.gj-open-car,.gj-add-car{margin-top:auto;display:flex;justify-content:space-between;gap:14px;padding:16px 21px;border:0;border-top:1px solid rgba(255,255,255,.15);background:transparent;color:#fff;font:inherit;font-size:.7rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.gj-open-car span:last-child,.gj-add-car span:last-child{color:var(--vehicle-accent)}.gj-open-car:hover,.gj-add-car:hover{background:color-mix(in srgb,var(--vehicle-accent) 10%,transparent)}.gj-empty{min-height:240px;display:grid;place-items:center;padding:30px;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.012);color:#6f7578;text-align:center}.gj-empty strong{display:block;margin-bottom:8px;color:#aeb2b3}.gj-divider{height:1px;margin:46px 0;background:rgba(255,255,255,.14)}
.gj-car-head{display:grid;grid-template-columns:.72fr 1.28fr;border:1px solid rgba(255,255,255,.16);margin-bottom:0}.gj-car-art{--vehicle-accent:#1c69d4;position:relative;min-height:390px;background:linear-gradient(145deg,color-mix(in srgb,var(--vehicle-accent) 22%,#171919),#0f1010);overflow:hidden}.gj-car-art::before{content:"";position:absolute;width:74%;height:39%;left:13%;top:27%;border:4px solid color-mix(in srgb,var(--vehicle-accent) 52%,#fff);border-radius:52% 42% 18% 16%/58% 52% 25% 26%;transform:skewX(-7deg);opacity:.75}.gj-car-art::after{content:"";position:absolute;inset:auto 12% 18px auto;color:rgba(255,255,255,.10);font-size:clamp(4rem,11vw,9rem);font-weight:950;letter-spacing:-.08em}.gj-car-art[data-mark="E46"]::after{content:"E46"}.gj-car-art[data-mark="ST"]::after{content:"ST"}.gj-car-title{padding:34px;display:flex;flex-direction:column;justify-content:flex-end;background:#141515}.gj-back{align-self:flex-start;margin-bottom:auto;border:0;padding:0;background:transparent;color:#ef9a62;font:inherit;font-size:.67rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase;cursor:pointer}.gj-car-code{color:#7b8184;font-size:.65rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.gj-car-title h2{margin:9px 0 6px;color:#fff;font-size:clamp(3.2rem,7vw,7rem);line-height:.8;letter-spacing:-.075em;text-transform:uppercase}.gj-car-title p{max-width:680px;margin:0;color:#9ea3a5}.gj-profile-status{margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,.14);color:#747b7e;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}
.gj-tabs{display:grid;grid-template-columns:repeat(4,1fr);border-left:1px solid rgba(255,255,255,.16)}.gj-tab{min-height:86px;padding:16px;border:0;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.02);color:#8d9396;text-align:left;font:inherit;cursor:pointer}.gj-tab strong{display:block;margin-bottom:5px;color:#fff;font-size:.88rem}.gj-tab span{font-size:.66rem}.gj-tab.is-active{background:rgba(239,154,98,.08);box-shadow:inset 0 3px #ef9a62}.gj-panel{display:none;padding:34px 0 10px}.gj-panel.is-active{display:block}.gj-panel-grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(255,255,255,.15);border-left:1px solid rgba(255,255,255,.15)}.gj-panel-card{min-height:190px;padding:20px;border-right:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.022)}.gj-panel-card .label{display:block;margin-bottom:20px;color:#6f777a;font-size:.62rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.gj-panel-card strong{display:block;margin-bottom:7px;color:#fff;font-size:1.2rem}.gj-panel-card p{margin:0;color:#858c8f;font-size:.8rem}.gj-panel-action{display:inline-flex;margin-top:18px;color:#7fb4e6!important;font-size:.68rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;text-decoration:none}.gj-timeline{border-top:1px solid rgba(255,255,255,.15)}.gj-event{display:grid;grid-template-columns:160px 1fr auto;gap:20px;align-items:start;padding:20px 0;border-bottom:1px solid rgba(255,255,255,.13)}.gj-event-date{color:#777e81;font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.gj-event strong{display:block;color:#fff}.gj-event p{margin:5px 0 0;color:#858c8f;font-size:.8rem}.gj-event-type{color:#ef9a62;font-size:.62rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.gj-workshop-cta{display:grid;grid-template-columns:.8fr 1.2fr;border:1px solid rgba(255,255,255,.16)}.gj-workshop-visual{min-height:290px;display:grid;place-items:center;background:#eeece5;color:#171919}.gj-workshop-visual span{font-size:clamp(4rem,12vw,9rem);font-weight:950;letter-spacing:-.08em;color:#d1cfc7}.gj-workshop-copy{padding:30px;background:#141515}.gj-workshop-copy h3{margin:0 0 8px;color:#fff;font-size:clamp(2.4rem,5vw,4.8rem);line-height:.85;letter-spacing:-.065em}.gj-workshop-copy p{margin:0;color:#8d9496}.gj-workshop-open{display:inline-flex;margin-top:24px;padding:13px 15px;border:1px solid #1c69d4;background:#1c69d4;color:#fff!important;text-decoration:none;font-size:.7rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.gj-workshop-disabled{display:inline-flex;margin-top:24px;padding:13px 15px;border:1px solid rgba(255,255,255,.16);color:#70777a;font-size:.7rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.gj-modal{position:fixed;inset:0;z-index:50;display:none;place-items:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(9px)}.gj-modal.is-open{display:grid}.gj-modal-box{width:min(900px,96vw);max-height:86vh;overflow:auto;border:1px solid rgba(255,255,255,.2);background:#111212;box-shadow:0 28px 100px rgba(0,0,0,.55)}.gj-modal-head{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:22px;border-bottom:1px solid rgba(255,255,255,.15)}.gj-modal-head h3{margin:0;color:#fff;font-size:1.7rem}.gj-close{border:0;background:transparent;color:#9ca1a3;font-size:1.4rem;cursor:pointer}.gj-catalog-grid{grid-template-columns:1fr}.gj-catalog-grid .gj-vehicle{min-height:320px}
@media(max-width:900px){.gj-section-head,.gj-car-head,.gj-workshop-cta{grid-template-columns:1fr}.gj-panel-grid{grid-template-columns:1fr 1fr}.gj-car-art{min-height:260px}.gj-tabs{grid-template-columns:1fr 1fr}}
@media(max-width:650px){header.hero::after{display:none}.hero h1{font-size:clamp(3.5rem,19vw,5.8rem)}.gj-shell{padding-top:28px}.gj-section-head{grid-template-columns:1fr}.gj-garage-grid,.gj-panel-grid{grid-template-columns:1fr}.gj-tabs{grid-template-columns:1fr}.gj-car-title{padding:23px}.gj-event{grid-template-columns:1fr}.gj-workshop-copy{padding:22px}}
"""


EXTRA_JS = r"""
(function(){
  const root=document.querySelector('.gj-shell');
  if(!root)return;
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
  let membership;
  try{membership=JSON.parse(localStorage.getItem(storageKey)||'null');}catch(error){membership=null;}
  if(!Array.isArray(membership))membership=data.filter(v=>v.default_in_garage).map(v=>v.key);

  function save(){try{localStorage.setItem(storageKey,JSON.stringify(membership));}catch(error){}}
  function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function vehicleByKey(key){return data.find(v=>v.key===key);}

  function vehicleCard(v,inGarage){
    const mark=v.platform==='E46'?'E46':'ST';
    return `<article class="gj-vehicle" style="--vehicle-accent:${esc(v.accent)}">
      <div class="gj-vehicle-visual"><span class="gj-vehicle-mark">${esc(mark)}</span><span class="gj-wheel left"></span><span class="gj-wheel right"></span></div>
      <div class="gj-vehicle-copy"><div class="gj-vehicle-meta"><span>${esc(v.catalog_label)}</span><span>${esc(v.year)}</span></div><h3>${esc(v.make)} ${esc(v.model)}</h3><p>${esc(v.powertrain)}</p></div>
      ${inGarage?`<button class="gj-open-car" type="button" data-open-car="${esc(v.key)}"><span>Open Journey</span><span>→</span></button>`:`<button class="gj-add-car" type="button" data-add-car="${esc(v.key)}"><span>Add to Garage</span><span>＋</span></button>`}
    </article>`;
  }

  function renderGarage(){
    const current=data.filter(v=>membership.includes(v.key));
    garageGrid.innerHTML=current.map(v=>vehicleCard(v,true)).join('') + '<button class="gj-empty" type="button" data-open-catalog><span><strong>＋ Add another vehicle</strong>Choose a vehicle definition, then make it yours.</span></button>';
    bindGarageActions();
  }

  function renderCatalog(){
    const available=data.filter(v=>!membership.includes(v.key));
    modalGrid.innerHTML=available.length?available.map(v=>vehicleCard(v,false)).join(''):'<div class="gj-empty"><span><strong>Everything in this POC catalog is already in your Garage.</strong>More vehicle definitions come next.</span></div>';
    modalGrid.querySelectorAll('[data-add-car]').forEach(btn=>btn.addEventListener('click',()=>{membership.push(btn.dataset.addCar);save();renderGarage();renderCatalog();modal.classList.remove('is-open');}));
  }

  function bindGarageActions(){
    garageGrid.querySelectorAll('[data-open-car]').forEach(btn=>btn.addEventListener('click',()=>openCar(btn.dataset.openCar)));
    garageGrid.querySelectorAll('[data-open-catalog]').forEach(btn=>btn.addEventListener('click',showCatalog));
  }

  function showCatalog(){renderCatalog();modal.classList.add('is-open');}
  openCatalog.forEach(btn=>btn.addEventListener('click',showCatalog));
  if(closeModal)closeModal.addEventListener('click',()=>modal.classList.remove('is-open'));
  if(modal)modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('is-open');});

  function openCar(key){
    const v=vehicleByKey(key);if(!v)return;
    carView.querySelector('.gj-car-art').style.setProperty('--vehicle-accent',v.accent);
    carView.querySelector('.gj-car-art').dataset.mark=v.platform==='E46'?'E46':'ST';
    carView.querySelector('.gj-car-code').textContent=`${v.year} // ${v.platform} // ${v.trim}`;
    carView.querySelector('.gj-car-name').textContent=`${v.make} ${v.model}`;
    carView.querySelector('.gj-car-story').textContent=v.story;
    carView.querySelector('.gj-profile-status').textContent=v.profile_status;
    carView.querySelector('[data-overview-identity]').innerHTML=`<strong>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</strong><p>${esc(v.trim)} • ${esc(v.powertrain)}</p>`;
    carView.querySelector('[data-overview-platform]').innerHTML=`<strong>${esc(v.platform)}</strong><p>Shared vehicle knowledge layer. Personal Garage history will sit on top of this definition.</p>`;
    const workshop=carView.querySelector('.gj-workshop-slot');
    workshop.innerHTML=v.workshop_url?`<div class="gj-workshop-cta"><div class="gj-workshop-visual"><span>${esc(v.platform)}</span></div><div class="gj-workshop-copy"><span class="gj-kicker">${esc(v.workshop_status)}</span><h3>Technical Workshop</h3><p>Search systems, components, symptoms, diagrams, fitment, parts, and original source material for this vehicle.</p><a class="gj-workshop-open" href="${esc(v.workshop_url)}">Open ${esc(v.platform)} workshop →</a></div></div>`:`<div class="gj-workshop-cta"><div class="gj-workshop-visual"><span>${esc(v.platform)}</span></div><div class="gj-workshop-copy"><span class="gj-kicker">${esc(v.workshop_status)}</span><h3>Technical Workshop</h3><p>The vehicle shell is real; the deep workshop knowledge base has not been built for this vehicle yet.</p><span class="gj-workshop-disabled">Workshop not populated yet</span></div></div>`;
    root.querySelectorAll('.gj-tab').forEach((tab,i)=>tab.classList.toggle('is-active',i===0));
    root.querySelectorAll('.gj-panel').forEach((panel,i)=>panel.classList.toggle('is-active',i===0));
    garageView.classList.remove('is-active');carView.classList.add('is-active');window.scrollTo({top:0,behavior:'smooth'});
  }

  root.querySelectorAll('.gj-tab').forEach(tab=>tab.addEventListener('click',()=>{
    root.querySelectorAll('.gj-tab').forEach(t=>t.classList.toggle('is-active',t===tab));
    root.querySelectorAll('.gj-panel').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.panel===tab.dataset.tab));
  }));
  if(back)back.addEventListener('click',()=>{carView.classList.remove('is-active');garageView.classList.add('is-active');window.scrollTo({top:0,behavior:'smooth'});});

  renderGarage();
})();
"""


def _vehicle_json() -> str:
    import json
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
      <p>A Garage vehicle is more than a make/model/year. It is the car's identity, history, paperwork, maintenance, modifications, problems, milestones, and the technical knowledge needed to work on it.</p>
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

    <div class="gj-tabs" role="tablist">
      <button class="gj-tab is-active" type="button" data-tab="overview"><strong>Overview</strong><span>Identity / state / essentials</span></button>
      <button class="gj-tab" type="button" data-tab="journey"><strong>Journey</strong><span>History / repairs / milestones</span></button>
      <button class="gj-tab" type="button" data-tab="glovebox"><strong>Glovebox</strong><span>Documents / receipts / records</span></button>
      <button class="gj-tab" type="button" data-tab="workshop"><strong>Workshop</strong><span>Technical knowledge / sources</span></button>
    </div>

    <div class="gj-panel is-active" data-panel="overview">
      <div class="gj-section-head"><div><span class="gj-kicker">OVERVIEW</span><h2>The car at a glance.</h2></div><p>The overview eventually becomes the live snapshot: mileage, current status, next service items, known issues, build state, and quick links into the car's history.</p></div>
      <div class="gj-panel-grid">
        <div class="gj-panel-card" data-overview-identity><span class="label">Vehicle identity</span></div>
        <div class="gj-panel-card" data-overview-platform><span class="label">Knowledge definition</span></div>
        <div class="gj-panel-card"><span class="label">Garage profile</span><strong>Personal layer</strong><p>VIN, mileage, ownership dates, nickname, photos, configuration, modifications, and status will live here.</p></div>
      </div>
    </div>

    <div class="gj-panel" data-panel="journey">
      <div class="gj-section-head"><div><span class="gj-kicker">JOURNEY</span><h2>The story of this car.</h2></div><p>A chronological record that can be useful as maintenance history, build journal, troubleshooting memory, or simply the story you hand to the next owner.</p></div>
      <div class="gj-timeline">
        <div class="gj-event"><span class="gj-event-date">Garage Journey</span><div><strong>Vehicle profile created</strong><p>The first event exists conceptually; persistent history comes after the product shell is proven.</p></div><span class="gj-event-type">PROFILE</span></div>
        <div class="gj-event"><span class="gj-event-date">Future</span><div><strong>Service / repair / modification event</strong><p>Mileage, parts, labor, photos, notes, receipts, linked workshop components, and source references.</p></div><span class="gj-event-type">EVENT</span></div>
      </div>
    </div>

    <div class="gj-panel" data-panel="glovebox">
      <div class="gj-section-head"><div><span class="gj-kicker">DIGITAL GLOVEBOX</span><h2>The paperwork, without the envelope.</h2></div><p>The intentionally non-enthusiast side of Garage Journey: a clean home for the things people already keep in a glovebox, folder, email, or kitchen drawer.</p></div>
      <div class="gj-panel-grid">
        <div class="gj-panel-card"><span class="label">Manuals</span><strong>Owner / service references</strong><p>Vehicle manuals and useful model-specific documents.</p></div>
        <div class="gj-panel-card"><span class="label">Receipts</span><strong>Parts / labor</strong><p>Receipts can later attach directly to Journey events and components.</p></div>
        <div class="gj-panel-card"><span class="label">Records</span><strong>Service history</strong><p>Invoices, inspection sheets, tire records, alignments, and previous-owner paperwork.</p></div>
      </div>
    </div>

    <div class="gj-panel" data-panel="workshop">
      <div class="gj-section-head"><div><span class="gj-kicker">WORKSHOP</span><h2>Know the car. Work on the car.</h2></div><p>This is where the E46 work we have already built belongs: shared technical knowledge underneath the personal Garage vehicle.</p></div>
      <div class="gj-workshop-slot"></div>
    </div>
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
