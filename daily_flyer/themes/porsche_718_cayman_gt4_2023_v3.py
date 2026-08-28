from __future__ import annotations

from daily_flyer.themes import porsche_718_cayman_gt4_2023_v2 as base

THEME_NAME = "porsche_718_cayman_gt4_2023_v3"

EXTRA_CSS = base.EXTRA_CSS + r'''
/* Porsche GT identity — black/graphite, Guards-red family, warm metallic accent */
:root{--irish-green:#d5001c;--blue:#d5001c;--teal:#c7a96b}
body{background:radial-gradient(circle at 83% 5%,rgba(213,0,28,.15),transparent 29rem),radial-gradient(circle at 12% 18%,rgba(183,154,94,.075),transparent 24rem),linear-gradient(rgba(15,10,11,.985),rgba(9,9,9,.995)),repeating-linear-gradient(0deg,transparent 0 35px,rgba(255,255,255,.018) 36px),#0d0b0c}
.hero-wrap::before{background:linear-gradient(90deg,#d5001c 0 34%,#b79a5e 34% 54%,#ece9e1 54% 74%,#111 74%)}
.hero-kicker,.eyebrow,.e46-search-kicker,.e46-work-kicker,.e46-system-index,.e46-component-group,.e46-source-type{color:#c7a96b}
.e46-system:hover,.e46-system:focus-visible,.e46-ref:hover,.e46-component-card:hover,.e46-component-card:focus-visible{background:rgba(213,0,28,.10)}
.e46-system.is-best::after{background:#d5001c}.e46-search-shell{border-color:rgba(199,169,107,.50);box-shadow:0 0 0 1px rgba(213,0,28,.14),0 16px 50px rgba(0,0,0,.30)}
.e46-search:focus{outline-color:#c7a96b}.e46-open,.e46-result-rank,.e46-component-open,.e46-component-back,.e46-component-source>span:last-child{color:#d9bb7d!important}
.e46-ref:hover,.e46-component-source:hover{border-color:#c7a96b}.e46-data-note{border-left-color:#d5001c;background:rgba(213,0,28,.075)}
.e46-work-details,.e46-component-details{background:linear-gradient(145deg,#171112,#111111)}
.e46-schematic-mark{color:#d9bb7d}.e46-fitment{color:#9b9186}.e46-home-specs>div{background:rgba(183,154,94,.025)}
.e46-component-stamp{color:rgba(85,61,38,.16)}

.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px;border:1px solid rgba(199,169,107,.28);background:rgba(17,10,11,.74);backdrop-filter:blur(16px) saturate(125%);-webkit-backdrop-filter:blur(16px) saturate(125%);box-shadow:0 10px 30px rgba(0,0,0,.22)}
.gj-floatnav button{min-height:38px;padding:0 13px;border:0;background:transparent;color:#eee9df;font:inherit;font-size:.64rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.gj-floatnav button+button{border-left:1px solid rgba(199,169,107,.18)}.gj-floatnav button:hover,.gj-floatnav button:focus-visible{outline:none;background:rgba(213,0,28,.14);color:#fff}
@media(max-width:650px){.gj-floatnav{top:8px}.gj-floatnav button{min-height:36px;padding:0 10px;font-size:.58rem}}
'''

EXTRA_JS = base.EXTRA_JS + r'''
(function(){
  if(document.querySelector('.gj-floatnav'))return;
  const nav=document.createElement('nav');nav.className='gj-floatnav';nav.setAttribute('aria-label','Garage Journey navigation');
  nav.innerHTML='<button type="button" class="gj-nav-back">← Back</button><button type="button" class="gj-nav-home">⌂ Garage Home</button>';
  document.body.appendChild(nav);
  function garage(){location.href='/?theme=garage';}
  nav.querySelector('.gj-nav-back').addEventListener('click',()=>{
    try{const ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin){history.back();return;}}catch(error){}
    garage();
  });
  nav.querySelector('.gj-nav-home').addEventListener('click',garage);
})();
'''


def build_theme_page(date_str: str | None = None, seed: int | None = None):
    context = base.build_theme_page(date_str=date_str, seed=seed)
    context.metadata["theme_name"] = THEME_NAME
    context.metadata["extra_css"] = EXTRA_CSS
    context.metadata["extra_js"] = EXTRA_JS
    context.metadata["extra_head_html"] = '<meta name="theme-color" content="#0d0b0c">'
    return context
