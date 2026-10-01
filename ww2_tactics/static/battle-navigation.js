/* One home control and one preferences surface, shared by every battle layout.
   They live outside layout-owned anchors so resizing cannot strand a control. */
'use strict';
(()=>{
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 const header=document.querySelector('body>header'),home=$('homeBattles'),manual=$('rulesButton');
 const manualAnchor=document.createComment('home field manual');manual.before(manualAnchor);
 const nav=node('nav','battleNavigation');nav.setAttribute('aria-label','Home and display settings');nav.hidden=true;
 const view=node('button','battleViewOpen','View');view.type='button';view.setAttribute('aria-haspopup','dialog');view.setAttribute('aria-controls','battleViewSettings');view.setAttribute('aria-expanded','false');
 home.textContent='Home';home.setAttribute('aria-label','Home — saved battles and multiplayer lobby');home.title='Home — your battle stays saved';
 home.dataset.help='Return to your saved battles and the multiplayer lobby. This does not resign or end your turn.';
 view.title='Display settings and help';view.dataset.help='Change Simple view, Dad mode, terrain and unit pictures, or open the learning guide.';
 nav.append(home,view);header.prepend(nav);
 const dialog=node('dialog','battleViewSettings');dialog.setAttribute('aria-labelledby','battleViewTitle');
 const heading=node('div');heading.className='battle-view-heading';
 const close=node('button','battleViewSettingsClose','Back to map');close.type='button';close.autofocus=true;
 heading.append(node('h2','battleViewTitle','View & help'),close);dialog.append(heading);
 const tools=$('playTools');dialog.append(tools);document.body.append(dialog);
 function group(title,ids){const section=node('section');section.className='battle-view-group';section.append(node('h3',null,title));for(const id of ids)if($(id))section.append($(id));tools.append(section);return section;}
 const layout=group('Display',['simpleToggle','dadModeToggle']);
 const note=node('p',null,'Simple view keeps descriptions short. Full detail shows the numbers. Experimental gives more space to the map.');layout.append(note);
 group('Map & units',['terrainToggle','unitStyleToggle']);
 const guides=group('Map guides',['rangeGuideToggle','intelligenceView','sectorNavigator']);
 const help=group('Help',['guideToggle']);
 function open(){
  if(nav.hidden)return;
  if(playbackSession){playbackSession.paused=true;clearTimeout(playbackTimer);$('pausePlayback').textContent='Resume';}
  for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
  if(!dialog.open)dialog.showModal();view.setAttribute('aria-expanded','true');
 }
 view.onclick=open;close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{view.setAttribute('aria-expanded','false');if(!nav.hidden&&!document.querySelector('dialog[open]'))view.focus({preventScroll:true});});
 // Only a full click on the backdrop dismisses it; dragging out of a setting
 // must not unexpectedly close the menu or click a hex underneath.
 let backdropDown=false;
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 dialog.addEventListener('pointerdown',e=>{backdropDown=e.target===dialog&&outside(e);});
 dialog.addEventListener('click',e=>{if(backdropDown&&e.target===dialog&&outside(e))dialog.close();backdropDown=false;});
 function sync(){
  const active=!!state&&!$('game').hidden&&!lobbyMode;
  document.body.classList.toggle('battle-navigation-active',active);nav.hidden=!active;
  if(!active){if(dialog.open)dialog.close();header.prepend(nav);manualAnchor.after(manual);return;}
  const destination=$('experimentalDesktopTop')||$('mobileBattleTop')||header;
  if(nav.parentElement!==destination)destination.prepend(nav);
  if(manual.parentElement!==help)help.append(manual);
  guides.hidden=![...guides.querySelectorAll('button')].some(b=>!b.hidden);
 }
 // Moving these nodes never submits an order, changes targeting, or touches
 // the map camera. Keep the dialog itself mounted across preference changes.
 document.addEventListener('ww2:before-layout',()=>header.prepend(nav));
 for(const event of ['ww2:render','ww2:playback','ww2:layout','ww2:dad-mode'])document.addEventListener(event,sync);
 window.addEventListener('resize',()=>requestAnimationFrame(sync));
 new MutationObserver(sync).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 window.ww2BattleNavigation={open,openContaining(n){if(dialog.contains(n)){open();return true;}return false;}};
 sync();
})();
