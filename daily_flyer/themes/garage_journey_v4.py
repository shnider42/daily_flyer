from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date
from daily_flyer.themes import garage_journey_v3 as base


THEME_NAME = "garage_journey_v4"
THEME_CONFIG = base.THEME_CONFIG
VEHICLES = base.VEHICLES


OVERVIEW_SECTION = r'''
    <section class="gj-detail-view" data-detail="overview">
      <div class="gj-detail-top"><button class="gj-detail-back" type="button">← Vehicle home</button><span class="gj-detail-path">Vehicle / Overview</span></div>
      <div class="gj-detail-heading gj-overview-heading">
        <div><span class="gj-kicker">OVERVIEW</span><h3>The car today.</h3></div>
        <p>The fast answer to “what do I know about this car right now?” Unknown information is shown deliberately so the Garage profile gets more useful as the car's journey is recorded.</p>
      </div>

      <div class="gj-overview-primary">
        <div class="gj-overview-identity">
          <span class="gj-overview-label">GARAGE VEHICLE</span>
          <strong data-ov-name>Vehicle</strong>
          <p data-ov-config>Configuration</p>
          <div class="gj-overview-state"><span class="gj-state-dot"></span><span>Profile started</span></div>
        </div>
        <div class="gj-odometer">
          <span class="gj-overview-label">CURRENT MILEAGE</span>
          <strong>— — —, — — —</strong>
          <p>Not recorded yet</p>
        </div>
      </div>

      <div class="gj-overview-facts">
        <div><span>VIN</span><strong>Not recorded</strong><small>Identifies the exact car</small></div>
        <div><span>Transmission</span><strong>Not recorded</strong><small>Needed for fitment forks</small></div>
        <div><span>Production / build</span><strong>Not recorded</strong><small>Useful for revision-specific parts</small></div>
        <div><span>Current status</span><strong>Not set</strong><small>Driving / project / stored / needs work</small></div>
      </div>

      <div class="gj-overview-columns">
        <section class="gj-overview-block">
          <div class="gj-overview-block-head"><span class="gj-kicker">PROFILE COMPLETENESS</span><strong>Start with the facts you already know.</strong></div>
          <div class="gj-completion-track"><span></span></div>
          <div class="gj-overview-tasks">
            <div><span class="gj-task-mark">01</span><p><strong>Identify the exact car</strong><small>VIN, mileage, transmission and production/build date.</small></p></div>
            <div><span class="gj-task-mark">02</span><p><strong>Record where its story starts</strong><small>Purchase/acquisition or the earliest history you have.</small></p></div>
            <div><span class="gj-task-mark">03</span><p><strong>Put the paperwork somewhere useful</strong><small>Manuals, receipts, invoices and existing service records.</small></p></div>
          </div>
        </section>

        <section class="gj-overview-block">
          <div class="gj-overview-block-head"><span class="gj-kicker">RECENT / NEXT</span><strong>The living side of the vehicle.</strong></div>
          <div class="gj-overview-activity">
            <div><span>PROFILE</span><p><strong>Garage vehicle created</strong><small>This car now has a home separate from its generic vehicle knowledge.</small></p></div>
            <div><span>NEXT</span><p><strong>Add the first real event</strong><small>A service, repair, modification, problem, purchase milestone or historical record.</small></p></div>
            <div><span>ATTENTION</span><p><strong>Service attention will live here</strong><small>Upcoming work should eventually derive from mileage, time and Journey history.</small></p></div>
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


def _replace_overview(body: str) -> str:
    start = body.find('    <section class="gj-detail-view" data-detail="overview">')
    end = body.find('    <section class="gj-detail-view" data-detail="journey">')
    if start == -1 or end == -1 or end <= start:
        return body
    return body[:start] + OVERVIEW_SECTION + "\n" + body[end:]


def _garage_body() -> str:
    return _replace_overview(base._garage_body())


EXTRA_CSS = base.EXTRA_CSS + r'''
/* v4 — clickable vehicle visual + real Overview dashboard */
.gj-vehicle:has(.gj-open-car) .gj-vehicle-visual{cursor:pointer;transition:filter .16s ease,transform .16s ease}
.gj-vehicle:has(.gj-open-car) .gj-vehicle-visual:hover{filter:brightness(1.12)}
.gj-vehicle:has(.gj-open-car) .gj-vehicle-visual:hover .gj-vehicle-mark{color:rgba(255,255,255,.19)}
.gj-overview-heading{margin-bottom:20px}
.gj-overview-primary{display:grid;grid-template-columns:1.25fr .75fr;border-top:1px solid rgba(255,255,255,.16);border-left:1px solid rgba(255,255,255,.16)}
.gj-overview-identity,.gj-odometer{min-height:205px;padding:24px;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.025)}
.gj-overview-label{display:block;margin-bottom:24px;color:#737b7e;font-size:.61rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.gj-overview-identity>strong{display:block;color:#fff;font-size:clamp(2.2rem,4.6vw,4.5rem);line-height:.88;letter-spacing:-.06em}
.gj-overview-identity>p{margin:9px 0 0;color:#8e9598}
.gj-overview-state{display:flex;align-items:center;gap:8px;margin-top:25px;color:#aeb3b4;font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.gj-state-dot{width:8px;height:8px;border-radius:50%;background:#ef9a62;box-shadow:0 0 0 5px rgba(239,154,98,.09)}
.gj-odometer{display:flex;flex-direction:column;justify-content:center;background:#111313}.gj-odometer .gj-overview-label{margin-bottom:16px}.gj-odometer strong{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#e5e3dc;font-size:clamp(1.8rem,3.7vw,3.6rem);letter-spacing:.04em;white-space:nowrap}.gj-odometer p{margin:8px 0 0;color:#70777a;font-size:.72rem;text-transform:uppercase;letter-spacing:.1em}
.gj-overview-facts{display:grid;grid-template-columns:repeat(4,1fr);border-left:1px solid rgba(255,255,255,.16)}.gj-overview-facts>div{min-height:125px;padding:17px;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.014)}.gj-overview-facts span{display:block;margin-bottom:15px;color:#687073;font-size:.58rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.gj-overview-facts strong{display:block;color:#dadbd8;font-size:.9rem}.gj-overview-facts small{display:block;margin-top:7px;color:#676f72;font-size:.68rem;line-height:1.35}
.gj-overview-columns{display:grid;grid-template-columns:1fr 1fr;margin-top:28px;border-top:1px solid rgba(255,255,255,.16);border-left:1px solid rgba(255,255,255,.16)}.gj-overview-block{padding:23px;border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.02)}.gj-overview-block-head>strong{display:block;max-width:430px;color:#fff;font-size:1.2rem;line-height:1.25}.gj-completion-track{height:7px;margin:24px 0;background:#242728;overflow:hidden}.gj-completion-track span{display:block;width:18%;height:100%;background:linear-gradient(90deg,#ef9a62,#d7b35d)}
.gj-overview-tasks>div,.gj-overview-activity>div{display:grid;grid-template-columns:42px 1fr;gap:13px;padding:14px 0;border-top:1px solid rgba(255,255,255,.11)}.gj-task-mark,.gj-overview-activity>div>span{color:#727a7d;font-size:.58rem;font-weight:900;letter-spacing:.11em}.gj-overview-tasks p,.gj-overview-activity p{margin:0}.gj-overview-tasks strong,.gj-overview-activity strong{display:block;color:#d6d8d6;font-size:.84rem}.gj-overview-tasks small,.gj-overview-activity small{display:block;margin-top:4px;color:#70777a;font-size:.69rem;line-height:1.4}.gj-overview-activity>div{grid-template-columns:70px 1fr}.gj-overview-activity>div>span{color:#d7b35d}
.gj-overview-jumps{display:grid;grid-template-columns:repeat(3,1fr);margin-top:28px;border-top:1px solid rgba(255,255,255,.15);border-left:1px solid rgba(255,255,255,.15)}.gj-overview-jumps button,.gj-overview-jumps a{position:relative;min-height:130px;padding:18px;border:0;border-right:1px solid rgba(255,255,255,.15);border-bottom:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.018);color:#fff;text-align:left;text-decoration:none;font:inherit;cursor:pointer}.gj-overview-jumps button:hover,.gj-overview-jumps a:hover{background:rgba(28,105,212,.09);text-decoration:none}.gj-overview-jumps span{display:block;margin-bottom:17px;color:#6f777a;font-size:.58rem;font-weight:900;letter-spacing:.13em}.gj-overview-jumps strong{display:block;color:#fff;font-size:1rem}.gj-overview-jumps em{position:absolute;right:17px;bottom:16px;color:#74ace0;font-style:normal;font-weight:900}
@media(max-width:900px){.gj-overview-primary,.gj-overview-columns{grid-template-columns:1fr}.gj-overview-facts{grid-template-columns:1fr 1fr}}
@media(max-width:650px){.gj-overview-facts,.gj-overview-jumps{grid-template-columns:1fr}.gj-overview-identity,.gj-odometer{min-height:170px}.gj-odometer strong{font-size:1.9rem}}
'''


EXTRA_JS = base.EXTRA_JS + r'''
(function(){
  const root=document.querySelector('.gj-shell');if(!root)return;

  // The visual representation of a Garage vehicle is itself an entry point.
  root.addEventListener('click',event=>{
    const visual=event.target.closest('.gj-vehicle-visual');
    if(!visual)return;
    const card=visual.closest('.gj-vehicle');
    const open=card?.querySelector('.gj-open-car');
    if(open)open.click();
  });

  function refreshOverview(){
    const carView=root.querySelector('[data-view="car"]');if(!carView)return;
    const name=carView.querySelector('.gj-car-name')?.textContent||'Vehicle';
    const code=carView.querySelector('.gj-car-code')?.textContent||'';
    const powertrain=carView.querySelector('[data-snap-engine]')?.textContent||'';
    const overviewName=carView.querySelector('[data-ov-name]');
    const overviewConfig=carView.querySelector('[data-ov-config]');
    if(overviewName)overviewName.textContent=name;
    if(overviewConfig)overviewConfig.textContent=[code,powertrain].filter(Boolean).join(' • ');

    const homeWorkshop=carView.querySelector('.gj-home-workshop');
    const overviewWorkshop=carView.querySelector('[data-ov-workshop-link]');
    if(overviewWorkshop&&homeWorkshop){
      const href=homeWorkshop.getAttribute('href');
      if(href){overviewWorkshop.setAttribute('href',href);overviewWorkshop.style.opacity='1';overviewWorkshop.style.pointerEvents='auto';}
      else{overviewWorkshop.removeAttribute('href');overviewWorkshop.style.opacity='.45';overviewWorkshop.style.pointerEvents='none';}
    }
  }

  root.addEventListener('click',event=>{
    if(event.target.closest('[data-open-detail="overview"]'))refreshOverview();
  });
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
