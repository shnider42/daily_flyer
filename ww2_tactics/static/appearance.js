/* Apply the saved site appearance before styles load. This preference is local
   to the browser; it never changes the battlefield or submits a game order. */
'use strict';
(()=>{
 const key='ww2-appearance',root=document.documentElement;
 const normalize=value=>value==='light'?'light':'dark';
 let appearance='dark';
 try{appearance=normalize(localStorage.getItem(key));}catch{}
 function apply(value){
  appearance=normalize(value);root.dataset.theme=appearance;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',appearance==='dark'?'#171e1b':'#f4f1e8');
  const toggle=document.getElementById('appearanceToggle');
  if(toggle){toggle.setAttribute('aria-pressed',String(appearance==='dark'));toggle.title=appearance==='dark'?'Use daylight colors':'Use night colors';}
 }
 apply(appearance);
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.key===null?'dark':event.newValue);});
 function ready(){
  const toggle=document.getElementById('appearanceToggle');if(!toggle)return;
  const anchor=document.createComment('site appearance control');toggle.before(anchor);
  toggle.addEventListener('click',()=>{
   apply(appearance==='dark'?'light':'dark');
   try{localStorage.setItem(key,appearance);}catch{}
  });
  function place(){
   // Battle layouts replace the main header. Keep the same control available
   // through their shared View menu, then restore it when returning home.
   const game=document.getElementById('game');
   const display=document.getElementById('battleViewSettings')?.querySelector('#layoutControl')?.closest('.battle-view-group');
   if(game&&!game.hidden&&!document.body.classList.contains('home-screen')&&display){
    if(toggle.parentElement!==display)display.append(toggle);
   }else if(anchor.parentNode&&toggle.previousSibling!==anchor)anchor.after(toggle);
  }
  apply(appearance);place();
  for(const event of ['ww2:render','ww2:playback','ww2:layout'])document.addEventListener(event,place);
  document.addEventListener('ww2:before-layout',()=>{if(anchor.parentNode)anchor.after(toggle);});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
