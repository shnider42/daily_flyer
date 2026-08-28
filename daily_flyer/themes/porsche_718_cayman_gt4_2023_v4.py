from __future__ import annotations

from daily_flyer.themes import porsche_718_cayman_gt4_2023_v3 as base

THEME_NAME = "porsche_718_cayman_gt4_2023_v4"
THEME_CONFIG = base.THEME_CONFIG

FONT_HEAD = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
)

EXTRA_CSS = base.EXTRA_CSS + r'''
:root{--gj-display:"Barlow Condensed","Arial Narrow",sans-serif;--gj-body:"Manrope",Arial,sans-serif;--gj-mono:"IBM Plex Mono",Consolas,monospace}
body{font-family:var(--gj-body);letter-spacing:-.01em}.hero h1{font-family:var(--gj-display);font-weight:800;letter-spacing:-.02em;line-height:.79}.hero-kicker,.eyebrow,.e46-search-kicker,.e46-system-index,.e46-source-type,.e46-work-kicker,.e46-component-group{font-family:var(--gj-mono);letter-spacing:.08em}
.card{border-radius:26px 6px 26px 6px!important;overflow:hidden}.card--porsche_systems{background:transparent!important;border:0!important;overflow:visible!important}
.e46-index-head{gap:30px}.e46-index-head h2,.e46-work-title,.e46-component-title{font-family:var(--gj-display);font-weight:700;letter-spacing:-.015em}
.e46-search-shell{border-radius:999px;padding:5px 8px 5px 16px;background:rgba(255,255,255,.04)}.e46-search{font-family:var(--gj-body)}.e46-search-clear{border-radius:999px;font-family:var(--gj-mono)}
.e46-search-results{border-radius:17px 4px 17px 4px;overflow:hidden}.e46-result{border-bottom-color:rgba(255,255,255,.075)}
.e46-system-grid{gap:15px;border:0}.e46-system{min-height:310px;border:1px solid rgba(199,169,107,.16);border-radius:26px 6px 26px 6px;background:linear-gradient(150deg,rgba(183,154,94,.055),rgba(255,255,255,.012));overflow:hidden;transition:transform .22s ease,background .22s ease,border-color .22s ease,box-shadow .22s ease}.e46-system:hover,.e46-system:focus-visible{transform:translateY(-4px) rotate(.16deg);border-color:rgba(213,0,28,.38);box-shadow:0 20px 54px rgba(0,0,0,.22)}
.e46-system-image{border-bottom:0!important;min-height:145px}.e46-schematic{background:radial-gradient(circle at 50% 48%,rgba(213,0,28,.10),transparent 58%),linear-gradient(145deg,#181111,#0c0b0b)}.e46-schematic-mark{font-family:var(--gj-display);font-weight:800;font-size:clamp(3.5rem,7vw,6.5rem);letter-spacing:-.025em}.e46-system-copy{padding:23px}.e46-system-copy h3{font-family:var(--gj-display);font-size:2rem;font-weight:700;letter-spacing:-.01em}.e46-system-copy p{line-height:1.5}.e46-open{font-family:var(--gj-mono)}
.e46-workshop,.e46-component-view{border:1px solid rgba(199,169,107,.15);border-radius:28px 7px 28px 7px;overflow:hidden;box-shadow:0 25px 74px rgba(0,0,0,.22)}.e46-work-details,.e46-component-details{padding:34px}.e46-ref-actions{gap:9px}.e46-ref{border:1px solid rgba(199,169,107,.14);border-radius:14px 4px 14px 4px;background:rgba(183,154,94,.025)}
.e46-component-grid{gap:8px}.e46-component{border:1px solid rgba(199,169,107,.13);border-radius:999px;background:rgba(183,154,94,.025);font-family:var(--gj-mono);font-size:.62rem}.e46-component-nav{gap:10px}.e46-component-card{border:1px solid rgba(199,169,107,.14);border-radius:17px 4px 17px 4px;background:linear-gradient(145deg,rgba(183,154,94,.035),rgba(255,255,255,.008));transition:transform .2s ease,background .2s ease}.e46-component-card:hover{transform:translateY(-3px)}
.e46-source-strip{gap:10px}.e46-source-tile{border:1px solid rgba(199,169,107,.14);border-radius:17px 4px 17px 4px;background:linear-gradient(145deg,rgba(183,154,94,.035),rgba(255,255,255,.008));transition:transform .2s ease}.e46-source-tile:hover{transform:translateY(-3px)}
.e46-back{border-radius:999px;font-family:var(--gj-mono)}.gj-floatnav{border-radius:999px!important}.gj-floatnav button{font-family:var(--gj-mono)}
@keyframes shop-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}.e46-system{animation:shop-rise .46s cubic-bezier(.2,.8,.2,1) both}.e46-system:nth-child(2){animation-delay:.04s}.e46-system:nth-child(3){animation-delay:.08s}.e46-system:nth-child(4){animation-delay:.12s}.e46-system:nth-child(5){animation-delay:.16s}.e46-system:nth-child(6){animation-delay:.20s}.e46-system:nth-child(7){animation-delay:.24s}
@media(prefers-reduced-motion:reduce){.e46-system,.e46-source-tile,.e46-component-card{animation:none!important;transition:none!important}}
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS
    context.metadata["extra_head_html"] = FONT_HEAD + context.metadata.get("extra_head_html", "")
    return context
