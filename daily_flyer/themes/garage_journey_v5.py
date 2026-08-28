from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import garage_journey_v4 as base


THEME_NAME = "garage_journey_v5"
THEME_CONFIG = {
    **base.THEME_CONFIG,
    "header_subtitle": "A visual home for every car you own — its identity, history, paperwork, and technical knowledge.",
}
VEHICLES = [dict(vehicle) for vehicle in base.VEHICLES]

BMW_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/2004_BMW_330Ci_Coupe.jpg/1024px-2004_BMW_330Ci_Coupe.jpg"
BMW_PHOTO_SOURCE = "https://commons.wikimedia.org/wiki/File:2004_BMW_330Ci_Coupe.jpg"
for vehicle in VEHICLES:
    if vehicle["key"] == "e46_330ci_2004":
        vehicle["photo_url"] = BMW_PHOTO
        vehicle["photo_credit"] = "Hugh Llewelyn / CC BY-SA 2.0"
        vehicle["photo_source"] = BMW_PHOTO_SOURCE
    else:
        vehicle["photo_url"] = ""
        vehicle["photo_credit"] = ""
        vehicle["photo_source"] = ""


OVERVIEW_SECTION = r'''
    <section class="gj-detail-view" data-detail="overview">
      <div class="gj-detail-top"><button class="gj-detail-back" type="button">← Vehicle home</button><span class="gj-detail-path">Vehicle / Overview</span></div>
      <div class="gj-detail-heading gj-overview-heading">
        <div><span class="gj-kicker">OVERVIEW</span><h3>The car today.</h3></div>
        <p>The live snapshot for this specific Garage vehicle. Missing information is intentional: Garage Journey should show what is known, what is not, and what changed over time.</p>
      </div>

      <div class="gj-overview-primary">
        <div class="gj-overview-identity">
          <span class="gj-overview-label">GARAGE VEHICLE</span>
          <strong data-ov-name>Vehicle</strong>
          <p data-ov-config>Configuration</p>
          <div class="gj-overview-state"><span class="gj-state-dot"></span><span data-ov-state-label>Profile started</span></div>
        </div>
        <div class="gj-odometer">
          <span class="gj-overview-label">CURRENT MILEAGE</span>
          <strong data-ov-mileage>— — —, — — —</strong>
          <p data-ov-mileage-note>Not recorded yet</p>
        </div>
      </div>

      <div class="gj-overview-facts">
        <div><span>VIN</span><strong data-ov-vin>Not recorded</strong><small>Identifies the exact car</small></div>
        <div><span>Transmission</span><strong data-ov-transmission>Not recorded</strong><small>Important for fitment and configuration</small></div>
        <div><span>Production / build</span><strong data-ov-build>Not recorded</strong><small>Useful for revision-specific parts</small></div>
        <div><span>Acquired</span><strong data-ov-acquired>Not recorded</strong><small>Where this Garage Journey begins</small></div>
      </div>

      <div class="gj-overview-columns">
        <section class="gj-overview-block">
          <div class="gj-overview-block-head"><span class="gj-kicker">PROFILE COMPLETENESS</span><strong data-completion-label>Start with the facts you already know.</strong></div>
          <div class="gj-completion-track"><span data-completion-bar></span></div>
          <div class="gj-overview-tasks">
            <div><span class="gj-task-mark">01</span><p><strong>Identify the exact car</strong><small>VIN, mileage, transmission and production/build date.</small></p></div>
            <div><span class="gj-task-mark">02</span><p><strong>Record where its story starts</strong><small>Acquisition date or the earliest history you have.</small></p></div>
            <div><span class="gj-task-mark">03</span><p><strong>Give it a useful current state</strong><small>Driving, project, stored, needs work, sold, or whatever actually fits.</small></p></div>
          </div>
        </section>

        <section class="gj-overview-block">
          <div class="gj-overview-block-head"><span class="gj-kicker">RECENT / NEXT</span><strong>The living side of the vehicle.</strong></div>
          <div class="gj-overview-activity">
            <div><span>PROFILE</span><p><strong>Garage vehicle created</strong><small>This car has its own identity separate from reusable model knowledge.</small></p></div>
            <div><span>NEXT</span><p><strong>Add the first real Journey event</strong><small>Service, repair, modification, problem, purchase milestone or historical record.</small></p></div>
            <div><span>ATTENTION</span><p><strong>Service attention will live here</strong><small>Eventually derived from mileage, time and recorded Journey history.</small></p></div>
          </div>
        </section>
      </div>

      <div class="gj-overview-jumps">
        <button type="button" data-open-detail="journey"><span>JOURNEY</span><strong>See the car's story</strong><em>→</em></button>
        <button type="button" data-open-detail="glovebox"><span>GLOVEBOX</span><strong>Open records & documents</strong><em>→</em></button>
        <a data-ov-workshop-link href="#"><span>WORKSHOP</span><strong>Technical knowledge</strong><em>→</em></a>
      </div>
    </section>
'''

EDIT_MODAL = r'''
  <div class="gj-profile-modal" role="dialog" aria-modal="true" aria-label="Edit vehicle profile">
    <form class="gj-profile-box">
      <div class="gj-profile-head">
        <div><span class="gj-kicker">GARAGE VEHICLE</span><h3>Edit vehicle</h3></div>
        <button class="gj-profile-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="gj-profile-form">
        <label><span>Nickname</span><input name="nickname" type="text" maxlength="40" placeholder="Optional"></label>
        <label><span>Current mileage</span><input name="mileage" type="number" min="0" max="2000000" step="1" inputmode="numeric" placeholder="e.g. 142318"></label>
        <label class="wide"><span>VIN</span><input name="vin" type="text" maxlength="17" autocomplete="off" placeholder="17-character VIN"></label>
        <label><span>Transmission</span><select name="transmission"><option value="">Not recorded</option><option>Manual</option><option>Automatic</option><option>DCT / dual-clutch</option><option>CVT</option><option>Other</option></select></label>
        <label><span>Production / build</span><input name="build_date" type="month"></label>
        <label><span>Current status</span><select name="status"><option value="">Not set</option><option>Driving</option><option>Needs work</option><option>Project</option><option>Stored</option><option>Off the road</option><option>Sold</option><option>Other</option></select></label>
        <label><span>Acquired</span><input name="acquired_date" type="date"></label>
        <label class="wide"><span>Color / description</span><input name="color" type="text" maxlength="60" placeholder="Optional"></label>
      </div>
      <div class="gj-profile-message" aria-live="polite"></div>
      <div class="gj-profile-actions">
        <button class="gj-profile-cancel" type="button">Cancel</button>
        <button class="gj-profile-save" type="submit">Save vehicle</button>
      </div>
    </form>
  </div>
'''


def _replace_overview(body: str) -> str:
    start = body.find('    <section class="gj-detail-view" data-detail="overview">')
    end = body.find('    <section class="gj-detail-view" data-detail="journey">')
    if start == -1 or end == -1 or end <= start:
        return body
    return body[:start] + OVERVIEW_SECTION + "\n" + body[end:]


def _garage_body() -> str:
    body = _replace_overview(base._garage_body())
    body = body.replace(
        '<div class="gj-garage-grid"></div>',
        '''<div class="gj-garage-summary">
          <div><span>YOUR GARAGE</span><strong data-gj-count>1 vehicle</strong></div>
          <div><span>TECHNICAL DEPTH</span><strong>BMW E46 workshop live</strong></div>
          <div><span>STORAGE</span><strong>Local proof of concept</strong></div>
        </div>
        <div class="gj-garage-grid"></div>
        <p class="gj-photo-note">Representative BMW photo: <a href="''' + BMW_PHOTO_SOURCE + '''" target="_blank" rel="noopener noreferrer">Hugh Llewelyn / Wikimedia Commons, CC BY-SA 2.0 ↗</a></p>''',
    )
    body = body.replace(
        '<div class="gj-profile-status"></div>',
        '<div class="gj-profile-status"></div><button class="gj-edit-profile" type="button">Edit vehicle</button>',
    )
    idx = body.rfind("</div>")
    if idx != -1:
        body = body[:idx] + EDIT_MODAL + "\n" + body[idx:]
    return body


EXTRA_CSS = base.EXTRA_CSS + r'''
/* v5 — photographic garage + editable vehicle profile */
body{background:radial-gradient(circle at 82% 5%,rgba(28,105,212,.08),transparent 27rem),radial-gradient(circle at 8% 18%,rgba(239,127,53,.055),transparent 24rem),linear-gradient(rgba(12,13,13,.98),rgba(12,13,13,.99)),repeating-linear-gradient(0deg,transparent 0 35px,rgba(255,255,255,.025) 36px),#0d0e0e}
header.hero{min-height:260px;padding-top:32px}.hero h1{font-size:clamp(3.8rem,9.2vw,8rem)}
.gj-shell{padding-top:28px}.gj-topbar{margin-bottom:28px}.gj-section-head{margin-bottom:18px}.gj-section-head h2{max-width:700px}
.gj-garage-summary{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:14px;border-top:1px solid rgba(255,255,255,.14);border-left:1px solid rgba(255,255,255,.14)}.gj-garage-summary>div{min-height:86px;padding:14px 16px;border-right:1px solid rgba(255,255,255,.14);border-bottom:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.014)}.gj-garage-summary span{display:block;margin-bottom:9px;color:#687073;font-size:.56rem;font-weight:900;letter-spacing:.13em}.gj-garage-summary strong{color:#d7dad9;font-size:.85rem}
.gj-garage-grid{grid-template-columns:repeat(12,minmax(0,1fr));border-left:0;border-top:0;gap:14px}.gj-garage-grid>.gj-vehicle{grid-column:span 8;border:1px solid rgba(255,255,255,.17);min-height:430px}.gj-garage-grid>.gj-empty{grid-column:span 4;border:1px solid rgba(255,255,255,.13);min-height:430px;background:linear-gradient(145deg,rgba(255,255,255,.022),rgba(255,255,255,.008))}.gj-garage-grid:has(.gj-vehicle:nth-child(2))>.gj-vehicle{grid-column:span 6}.gj-garage-grid:has(.gj-vehicle:nth-child(2))>.gj-empty{grid-column:span 12;min-height:170px}
.gj-vehicle{border-radius:0}.gj-vehicle-visual{height:255px;background:linear-gradient(145deg,color-mix(in srgb,var(--vehicle-accent) 20%,#171919),#101111);background-size:cover;background-position:center;isolation:isolate}.gj-vehicle-visual::before{z-index:0}.gj-vehicle-visual::after{z-index:0}.gj-vehicle-mark{z-index:2;align-self:flex-end;padding:6px 9px;background:rgba(0,0,0,.42);backdrop-filter:blur(5px);color:#fff;font-size:1rem;letter-spacing:.1em}
.gj-vehicle:has(.gj-open-car[data-open-car="e46_330ci_2004"]) .gj-vehicle-visual{background-image:linear-gradient(180deg,rgba(8,10,11,.03),rgba(8,10,11,.12) 55%,rgba(8,10,11,.74)),url("''' + BMW_PHOTO + r'''");background-position:center 54%}.gj-vehicle:has(.gj-open-car[data-open-car="e46_330ci_2004"]) .gj-vehicle-visual::before,.gj-vehicle:has(.gj-open-car[data-open-car="e46_330ci_2004"]) .gj-vehicle-visual::after,.gj-vehicle:has(.gj-open-car[data-open-car="e46_330ci_2004"]) .gj-wheel{display:none}.gj-vehicle-copy{padding:22px 23px}.gj-vehicle h3{font-size:2.35rem}.gj-open-car{padding:17px 23px}.gj-photo-note{margin:10px 0 0;color:#555e61;font-size:.63rem}.gj-photo-note a{color:#697477}
.gj-car-head{grid-template-columns:1.02fr .98fr;min-height:390px}.gj-car-art[data-mark="E46"]{background-image:linear-gradient(90deg,rgba(8,10,11,.05),rgba(8,10,11,.22)),url("''' + BMW_PHOTO + r'''");background-size:cover;background-position:center}.gj-car-art[data-mark="E46"]::before{display:none}.gj-car-art[data-mark="E46"]::after{content:"E46";right:20px;bottom:12px;padding:6px 10px;background:rgba(0,0,0,.35);color:rgba(255,255,255,.78);font-size:1rem;letter-spacing:.12em;backdrop-filter:blur(6px)}
.gj-edit-profile{align-self:flex-start;margin-top:20px;padding:10px 13px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#f1f0ec;font:inherit;font-size:.64rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.gj-edit-profile:hover{border-color:#ef9a62;background:rgba(239,154,98,.06)}
.gj-profile-modal{position:fixed;inset:0;z-index:80;display:none;place-items:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(10px)}.gj-profile-modal.is-open{display:grid}.gj-profile-box{width:min(760px,96vw);max-height:88vh;overflow:auto;border:1px solid rgba(255,255,255,.18);background:#111313;box-shadow:0 30px 90px rgba(0,0,0,.5)}.gj-profile-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.14)}.gj-profile-head h3{margin:0;color:#fff;font-size:1.8rem}.gj-profile-close{border:0;background:transparent;color:#999;font-size:1.4rem;cursor:pointer}
.gj-profile-form{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:22px}.gj-profile-form label{display:block;min-width:0}.gj-profile-form label.wide{grid-column:span 2}.gj-profile-form label>span{display:block;margin-bottom:7px;color:#747c7f;font-size:.61rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.gj-profile-form input,.gj-profile-form select{box-sizing:border-box;width:100%;min-height:46px;padding:0 12px;border:1px solid rgba(255,255,255,.18);border-radius:0;background:#171919;color:#fff;font:inherit;font-size:.9rem;outline:0}.gj-profile-form input:focus,.gj-profile-form select:focus{border-color:#5aa9e6}.gj-profile-message{min-height:22px;padding:0 22px;color:#e1b76a;font-size:.72rem}.gj-profile-actions{display:flex;justify-content:flex-end;gap:10px;padding:18px 22px 22px}.gj-profile-actions button{min-height:43px;padding:0 14px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#fff;font:inherit;font-size:.66rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.gj-profile-save{border-color:#1c69d4!important;background:#1c69d4!important}
.gj-overview-state[data-status="Driving"] .gj-state-dot{background:#70a87f;box-shadow:0 0 0 5px rgba(112,168,127,.09)}.gj-overview-state[data-status="Needs work"] .gj-state-dot,.gj-overview-state[data-status="Off the road"] .gj-state-dot{background:#d87961}
@media(max-width:900px){.gj-garage-grid>.gj-vehicle,.gj-garage-grid>.gj-empty{grid-column:span 12;min-height:330px}.gj-garage-summary{grid-template-columns:1fr 1fr}.gj-car-head{grid-template-columns:1fr}.gj-car-art{min-height:330px}}
@media(max-width:650px){.gj-garage-summary,.gj-profile-form{grid-template-columns:1fr}.gj-profile-form label.wide{grid-column:span 1}.gj-vehicle-visual{height:210px}.gj-profile-box{max-height:82vh}}
'''


EXTRA_JS = base.EXTRA_JS + r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;
  const data=JSON.parse(root.querySelector('#gj-data')?.textContent||'[]');
  const modal=root.querySelector('.gj-profile-modal');const form=root.querySelector('.gj-profile-box');const edit=root.querySelector('.gj-edit-profile');const close=root.querySelector('.gj-profile-close');const cancel=root.querySelector('.gj-profile-cancel');const message=root.querySelector('.gj-profile-message');
  const storageKey='garage-journey-profiles-v1';let profiles={};try{profiles=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch(error){profiles={};}
  function saveProfiles(){try{localStorage.setItem(storageKey,JSON.stringify(profiles));}catch(error){}}
  function currentKey(){return root.querySelector('[data-view="car"]')?.dataset.vehicleKey||'';}function vehicleByKey(key){return data.find(v=>v.key===key);}function profileFor(key){return profiles[key]||{};}
  function formatMileage(value){const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n).toLocaleString('en-US'):'';}
  function formatMonth(value){if(!value)return '';const parts=value.split('-');if(parts.length!==2)return value;const y=Number(parts[0]),m=Number(parts[1]);if(!y||m<1||m>12)return value;return new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));}
  function formatDate(value){if(!value)return '';const p=value.split('-').map(Number);if(p.length!==3||!p[0]||!p[1]||!p[2])return value;return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(p[0],p[1]-1,p[2])));}
  function completion(profile){const fields=['mileage','vin','transmission','build_date','status','acquired_date','color'];return Math.round(fields.filter(k=>String(profile[k]||'').trim()).length/fields.length*100);}
  function applyProfile(){const key=currentKey();if(!key)return;const v=vehicleByKey(key);if(!v)return;const p=profileFor(key);const carView=root.querySelector('[data-view="car"]');const displayName=p.nickname?`${p.nickname} · ${v.make} ${v.model}`:`${v.make} ${v.model}`;const title=carView.querySelector('.gj-car-name');if(title)title.textContent=displayName;const code=carView.querySelector('.gj-car-code');if(code)code.textContent=`${v.year} // ${v.platform} // ${v.trim}`;const status=carView.querySelector('.gj-profile-status');if(status)status.textContent=[p.status||'Status not set',p.mileage?`${formatMileage(p.mileage)} mi`:'Mileage not recorded',p.transmission||'Transmission not recorded'].join(' • ');const ovName=carView.querySelector('[data-ov-name]');if(ovName)ovName.textContent=displayName;const ovConfig=carView.querySelector('[data-ov-config]');if(ovConfig)ovConfig.textContent=[`${v.year} ${v.make} ${v.model}`,v.trim,v.powertrain,p.color].filter(Boolean).join(' • ');const mile=carView.querySelector('[data-ov-mileage]');if(mile)mile.textContent=p.mileage?formatMileage(p.mileage):'— — —, — — —';const mileNote=carView.querySelector('[data-ov-mileage-note]');if(mileNote)mileNote.textContent=p.mileage?'miles recorded':'Not recorded yet';[['[data-ov-vin]','vin'],['[data-ov-transmission]','transmission']].forEach(([sel,k])=>{const el=carView.querySelector(sel);if(el)el.textContent=p[k]||'Not recorded';});const build=carView.querySelector('[data-ov-build]');if(build)build.textContent=formatMonth(p.build_date)||'Not recorded';const acquired=carView.querySelector('[data-ov-acquired]');if(acquired)acquired.textContent=formatDate(p.acquired_date)||'Not recorded';const state=carView.querySelector('.gj-overview-state');if(state)state.dataset.status=p.status||'';const stateLabel=carView.querySelector('[data-ov-state-label]');if(stateLabel)stateLabel.textContent=p.status||'Profile started';const pct=completion(p);const bar=carView.querySelector('[data-completion-bar]');if(bar)bar.style.width=`${pct}%`;const comp=carView.querySelector('[data-completion-label]');if(comp)comp.textContent=pct?`${pct}% of the basic Garage profile is recorded.`:'Start with the facts you already know.';}
  function openEditor(){const key=currentKey();if(!key||!form||!modal)return;const p=profileFor(key);['nickname','mileage','vin','transmission','build_date','status','acquired_date','color'].forEach(name=>{if(form.elements[name])form.elements[name].value=p[name]||'';});if(message)message.textContent='';modal.classList.add('is-open');}
  function closeEditor(){modal?.classList.remove('is-open');}edit?.addEventListener('click',openEditor);close?.addEventListener('click',closeEditor);cancel?.addEventListener('click',closeEditor);modal?.addEventListener('click',event=>{if(event.target===modal)closeEditor();});
  form?.addEventListener('submit',event=>{event.preventDefault();const key=currentKey();if(!key)return;const vin=String(form.elements.vin.value||'').trim().toUpperCase();if(vin&&vin.length!==17){if(message)message.textContent='VIN should be 17 characters, or leave it blank for now.';return;}const mileage=String(form.elements.mileage.value||'').trim();if(mileage&&(Number(mileage)<0||Number(mileage)>2000000)){if(message)message.textContent='Mileage looks outside the supported range.';return;}profiles[key]={nickname:String(form.elements.nickname.value||'').trim(),mileage,vin,transmission:form.elements.transmission.value,build_date:form.elements.build_date.value,status:form.elements.status.value,acquired_date:form.elements.acquired_date.value,color:String(form.elements.color.value||'').trim()};saveProfiles();applyProfile();closeEditor();});
  root.addEventListener('click',event=>{const open=event.target.closest('[data-open-car]');if(open){const car=root.querySelector('[data-view="car"]');if(car)car.dataset.vehicleKey=open.dataset.openCar;setTimeout(applyProfile,0);}const overview=event.target.closest('[data-open-detail="overview"]');if(overview)setTimeout(applyProfile,0);});
  const countNode=root.querySelector('[data-gj-count]');const garageGrid=root.querySelector('.gj-garage-grid');if(countNode&&garageGrid){const refreshCount=()=>{const n=garageGrid.querySelectorAll('.gj-vehicle').length;countNode.textContent=`${n} vehicle${n===1?'':'s'}`;};refreshCount();new MutationObserver(refreshCount).observe(garageGrid,{childList:true});}
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
        cards=[CardItem(card_type="garage_journey", eyebrow="", title="", body=_garage_body())],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={"theme_name":THEME_NAME,"date_key":today.strftime("%m-%d"),"hero_kicker":THEME_CONFIG["hero_kicker"],"hero_summary_pill":THEME_CONFIG["hero_summary_pill"],"extra_css":EXTRA_CSS,"extra_js":EXTRA_JS,"extra_head_html":'<meta name="theme-color" content="#0d0e0e">'},
    )
