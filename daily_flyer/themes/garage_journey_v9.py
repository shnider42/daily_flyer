from __future__ import annotations

from daily_flyer.themes import garage_journey_v8 as base

THEME_NAME = "garage_journey_v9"
THEME_CONFIG = base.THEME_CONFIG

FONT_HEAD = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
)

EXTRA_CSS = base.EXTRA_CSS + r'''
/* v9 — Garage Journey gets its own automotive/editorial design language. */
:root{
  --gj-display:"Barlow Condensed","Arial Narrow",sans-serif;
  --gj-body:"Manrope",Arial,sans-serif;
  --gj-mono:"IBM Plex Mono",Consolas,monospace;
  --gj-radius:30px 8px 30px 8px;
  --gj-radius-small:18px 5px 18px 5px;
}
body{font-family:var(--gj-body);letter-spacing:-.01em}
.hero-wrap{padding-top:18px}.hero-wrap::before{height:3px;opacity:.75}
header.hero{min-height:235px;padding:30px 0 26px}
.hero h1{font-family:var(--gj-display);font-weight:800;letter-spacing:-.035em;line-height:.78;font-size:clamp(4.4rem,10vw,8.8rem)}
.hero .subtitle{max-width:680px;font-size:.93rem;line-height:1.7;color:#aeb2b1}
.hero-kicker,.gj-kicker,.gj-brand,.gj-vehicle-meta,.gj-home-label,.gj-overview-label,.gj-snapshot-item span,.gj-detail-path,.gj-photo-note{font-family:var(--gj-mono);letter-spacing:.08em}

/* Landing: loose editorial spacing instead of a boxed dashboard. */
.gj-shell{padding-top:44px}.gj-topbar{margin-bottom:48px}.gj-section-head{grid-template-columns:.55fr .45fr;gap:60px;margin-bottom:30px}
.gj-section-head h2{font-family:var(--gj-display);font-weight:800;letter-spacing:-.025em;line-height:.82;font-size:clamp(3.2rem,6.8vw,6.6rem)}
.gj-section-head p{font-size:.9rem;line-height:1.75}
.gj-add{min-height:46px;padding:0 20px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.035);backdrop-filter:blur(10px);font-family:var(--gj-mono)}
.gj-add:hover{transform:translateY(-1px)}
.gj-garage-summary{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 24px;border:0}
.gj-garage-summary>div{min-height:0;padding:9px 13px;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.028)}
.gj-garage-summary span{display:inline;margin:0 8px 0 0;font-family:var(--gj-mono);font-size:.52rem}.gj-garage-summary strong{font-size:.72rem;font-weight:600}
.gj-garage-grid{gap:22px}
.gj-garage-grid>.gj-vehicle{border:1px solid rgba(255,255,255,.13);border-radius:var(--gj-radius);overflow:hidden;background:linear-gradient(145deg,rgba(255,255,255,.052),rgba(255,255,255,.016));box-shadow:0 22px 70px rgba(0,0,0,.18)}
.gj-garage-grid>.gj-empty{border:1px dashed rgba(255,255,255,.15);border-radius:var(--gj-radius);background:rgba(255,255,255,.015)}
.gj-vehicle{isolation:isolate}.gj-vehicle-visual{height:290px;border-radius:28px 6px 0 0;overflow:hidden;transition:filter .25s ease,background-size .45s ease}
.gj-vehicle-copy{padding:26px 28px 18px}.gj-vehicle h3{font-family:var(--gj-display);font-weight:700;font-size:clamp(2.4rem,4vw,3.5rem);letter-spacing:-.02em;line-height:.9}
.gj-vehicle p{font-size:.79rem;line-height:1.5}.gj-open-car{margin:0 14px 14px;padding:15px 17px;border:0;border-radius:14px 4px 14px 4px;background:rgba(255,255,255,.055);font-family:var(--gj-mono)}
.gj-open-car:hover{background:rgba(255,255,255,.095)}
.gj-vehicle-mark{border-radius:999px!important;padding:6px 11px!important;font-family:var(--gj-mono)!important;font-size:.62rem!important}
.gj-photo-note{padding-left:8px}

/* Vehicle home: layered object rather than a big bordered rectangle. */
.gj-car-head{position:relative;grid-template-columns:1.08fr .92fr;gap:0;border:0;border-radius:36px 9px 36px 9px;overflow:hidden;background:#101212;box-shadow:0 28px 90px rgba(0,0,0,.23)}
.gj-car-art{min-height:430px}.gj-car-title{padding:38px 42px;border-left:1px solid rgba(255,255,255,.09)}
.gj-car-title h2{font-family:var(--gj-display);font-weight:800;letter-spacing:-.025em;font-size:clamp(4rem,7vw,7.1rem)}
.gj-car-code{font-family:var(--gj-mono)}.gj-car-story{font-size:.84rem;line-height:1.65}.gj-profile-status{font-family:var(--gj-mono);font-size:.61rem;line-height:1.55}
.gj-edit-profile{border-radius:999px;padding:10px 16px;font-family:var(--gj-mono)}
.gj-car-home{padding-top:46px}.gj-home-intro{margin-bottom:24px}.gj-home-intro h3{font-family:var(--gj-display);font-size:clamp(2.7rem,5vw,4.8rem);letter-spacing:-.02em;font-weight:700}
.gj-home-grid{gap:14px;border:0}.gj-home-action{min-height:250px;padding:26px 28px;border:1px solid rgba(255,255,255,.11);border-radius:var(--gj-radius-small);background:linear-gradient(145deg,rgba(255,255,255,.04),rgba(255,255,255,.012));overflow:hidden}
.gj-home-action::before{width:38px;height:3px;border-radius:999px;margin-bottom:26px}.gj-home-action::after{font-family:var(--gj-display);font-weight:700;right:18px;top:6px;font-size:8rem;opacity:.7}
.gj-home-action strong{font-family:var(--gj-display);font-size:clamp(2.4rem,4vw,3.8rem);font-weight:700;letter-spacing:-.015em}
.gj-home-action p{max-width:360px;font-size:.79rem;line-height:1.55}.gj-home-go{font-family:var(--gj-mono)}
.gj-home-action:hover{transform:translateY(-4px) rotate(-.15deg);box-shadow:0 18px 44px rgba(0,0,0,.16)}
.gj-car-snapshot{gap:8px;margin-top:20px;border:0}.gj-snapshot-item{min-height:86px;padding:14px 16px;border:1px solid rgba(255,255,255,.09);border-radius:15px 4px 15px 4px;background:rgba(255,255,255,.018)}
.gj-snapshot-item strong{font-size:.78rem;font-weight:600}

/* Overview and detail pages: grouped surfaces, not spreadsheet cells. */
.gj-detail-heading h3,.gj-overview-heading h3{font-family:var(--gj-display);font-weight:700;letter-spacing:-.02em}
.gj-overview-primary{gap:12px;border:0}.gj-overview-identity,.gj-odometer{border:1px solid rgba(255,255,255,.11);border-radius:var(--gj-radius-small);background:rgba(255,255,255,.025)}
.gj-overview-identity>strong{font-family:var(--gj-display);font-weight:700;letter-spacing:-.02em}
.gj-odometer strong{font-family:var(--gj-mono);letter-spacing:.02em}
.gj-overview-facts{gap:8px;margin-top:8px;border:0}.gj-overview-facts>div{min-height:116px;border:1px solid rgba(255,255,255,.08);border-radius:14px 4px 14px 4px;background:rgba(255,255,255,.015)}
.gj-overview-facts span{font-family:var(--gj-mono)}
.gj-overview-columns{gap:14px;border:0}.gj-overview-block{border:1px solid rgba(255,255,255,.10);border-radius:var(--gj-radius-small);background:rgba(255,255,255,.02)}
.gj-overview-jumps{gap:8px;border:0}.gj-overview-jumps button,.gj-overview-jumps a{border:1px solid rgba(255,255,255,.09);border-radius:14px 4px 14px 4px;background:rgba(255,255,255,.016)}
.gj-detail-grid{gap:12px;border:0}.gj-detail-card{border:1px solid rgba(255,255,255,.09);border-radius:var(--gj-radius-small);background:rgba(255,255,255,.018)}
.gj-journey-line{border:0}.gj-journey-item{margin-bottom:8px;padding:18px 20px;border:1px solid rgba(255,255,255,.09);border-radius:14px 4px 14px 4px;background:rgba(255,255,255,.015)}

/* Modal and floating nav become softer cockpit surfaces. */
.gj-profile-modal,.gj-modal{backdrop-filter:blur(14px)}
.gj-profile-box,.gj-modal-box{border:1px solid rgba(255,255,255,.13);border-radius:28px 8px 28px 8px;overflow:hidden;background:rgba(16,18,18,.96)}
.gj-profile-form input,.gj-profile-form select{border-radius:12px 4px 12px 4px;background:rgba(255,255,255,.035)}
.gj-profile-actions button{border-radius:999px}
.gj-floatnav{border-radius:999px!important;padding:4px!important;box-shadow:0 12px 44px rgba(0,0,0,.25)!important}
.gj-floatnav button{border-radius:999px;font-family:var(--gj-mono)}.gj-floatnav .gj-nav-home{border-left:0!important}

/* Motion: restrained, mechanical, and optional. */
@keyframes gj-rise{from{opacity:0;transform:translateY(18px) scale(.992)}to{opacity:1;transform:none}}
@keyframes gj-slide{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
.gj-garage-grid>.gj-vehicle{animation:gj-rise .55s cubic-bezier(.2,.8,.2,1) both}.gj-garage-grid>.gj-vehicle:nth-child(2){animation-delay:.08s}.gj-garage-grid>.gj-empty{animation:gj-rise .55s .14s cubic-bezier(.2,.8,.2,1) both}
.gj-view[data-view="car"].is-active .gj-car-head{animation:gj-rise .48s cubic-bezier(.2,.8,.2,1) both}.gj-view[data-view="car"].is-active .gj-home-action{animation:gj-slide .42s both}.gj-view[data-view="car"].is-active .gj-home-action:nth-child(2){animation-delay:.05s}.gj-view[data-view="car"].is-active .gj-home-action:nth-child(3){animation-delay:.10s}.gj-view[data-view="car"].is-active .gj-home-action:nth-child(4){animation-delay:.15s}
@media(prefers-reduced-motion:reduce){.gj-garage-grid>*,.gj-car-head,.gj-home-action{animation:none!important;transition:none!important}}
@media(max-width:900px){.gj-section-head{grid-template-columns:1fr;gap:20px}.gj-car-title{padding:30px}.gj-car-art{min-height:340px}.gj-garage-summary{display:none}}
@media(max-width:650px){.gj-shell{padding-top:32px}.hero h1{font-size:clamp(4rem,18vw,6rem)}.gj-vehicle-visual{height:225px}.gj-car-head{border-radius:24px 6px 24px 6px}.gj-car-title{padding:24px}.gj-home-grid{gap:10px}.gj-home-action{min-height:210px;padding:22px}.gj-car-snapshot{gap:6px}}
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS
    context.metadata["extra_head_html"] = FONT_HEAD + context.metadata.get("extra_head_html", "")
    return context
