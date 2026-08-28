from __future__ import annotations

from daily_flyer.themes import e46_owner_companion_v5 as base

THEME_NAME = "e46_owner_companion_v6"

EXTRA_CSS = base.EXTRA_CSS + r'''
/* BMW identity — roundel blue, white, graphite; technical rather than M-branded */
:root{--irish-green:#0066b1;--blue:#0066b1;--teal:#63b8ed}
body{background:radial-gradient(circle at 84% 6%,rgba(0,102,177,.18),transparent 30rem),linear-gradient(rgba(5,13,20,.98),rgba(8,11,14,.995)),repeating-linear-gradient(0deg,transparent 0 35px,rgba(255,255,255,.022) 36px),repeating-linear-gradient(90deg,transparent 0 35px,rgba(255,255,255,.016) 36px),#071018}
.hero-wrap::before{background:linear-gradient(90deg,#0066b1 0 36%,#00a2e8 36% 54%,#f4f4f2 54% 76%,#17191b 76%)}
.hero-kicker,.eyebrow,.e46-search-kicker,.e46-work-kicker,.e46-system-index,.e46-component-group,.e46-source-type{color:#63b8ed}
.e46-system:hover,.e46-system:focus-visible,.e46-ref:hover,.e46-component-card:hover,.e46-component-card:focus-visible{background:rgba(0,102,177,.11)}
.e46-system.is-best::after{background:#0066b1}.e46-search-shell{border-color:rgba(99,184,237,.50);box-shadow:0 0 0 1px rgba(0,102,177,.15),0 16px 50px rgba(0,0,0,.27)}
.e46-search:focus{outline-color:#63b8ed}.e46-open,.e46-result-rank,.e46-component-open,.e46-component-back,.e46-component-source>span:last-child{color:#63b8ed!important}
.e46-ref:hover,.e46-component-source:hover{border-color:#63b8ed}.e46-data-note{border-left-color:#0066b1;background:rgba(0,102,177,.08)}
.e46-work-details,.e46-component-details{background:linear-gradient(145deg,#101922,#111416)}
.e46-schematic-mark{color:#63b8ed}.e46-fitment{color:#8797a4}

.gj-floatnav{position:fixed;z-index:120;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px;border:1px solid rgba(99,184,237,.28);background:rgba(5,15,24,.72);backdrop-filter:blur(16px) saturate(125%);-webkit-backdrop-filter:blur(16px) saturate(125%);box-shadow:0 10px 30px rgba(0,0,0,.2)}
.gj-floatnav button{min-height:38px;padding:0 13px;border:0;background:transparent;color:#e4edf3;font:inherit;font-size:.64rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.gj-floatnav button+button{border-left:1px solid rgba(99,184,237,.18)}.gj-floatnav button:hover,.gj-floatnav button:focus-visible{outline:none;background:rgba(0,102,177,.20);color:#fff}
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
    context.metadata["extra_head_html"] = '<meta name="theme-color" content="#071018">'
    return context
