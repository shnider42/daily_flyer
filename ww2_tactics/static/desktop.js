/* Desktop presentation only. Move existing controls; never duplicate game actions. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const desktop=matchMedia('(min-width: 1100px)'), game=document.getElementById('game'), lobby=document.getElementById('lobby');
 const wrap=document.getElementById('mapWrap');
 let mounts=[], originals=[], active=false, battle=null, zoom=1, scale=1, drag=null, suppressClick=false, resizeFrame;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text)node.textContent=text;return node;};
 function move(node,destination){
  if(!node)return;
  const marker=document.createComment('desktop layout anchor');node.before(marker);originals.push([node,marker]);destination.append(node);
 }
 function group(parent,cls,nodes,title){
  const section=el('section',cls);if(title)section.append(el('h2','desktop-panel-title',title));
  parent.append(section);mounts.push(section);for(const node of nodes)move(typeof node==='string'?document.querySelector(node):node,section);return section;
 }
 function activeSvg(){return document.getElementById('playbackMap')||document.getElementById('map');}
 function measure(){
  if(!active||game.hidden)return;
  const svg=activeSvg(),box=svg.viewBox.baseVal;if(!box.width||!wrap.clientWidth)return;
  const previous=scale;
  const centerX=(wrap.scrollLeft+wrap.clientWidth/2)/previous,centerY=(wrap.scrollTop+wrap.clientHeight/2)/previous;
  const fit=Math.min((wrap.clientWidth-32)/box.width,(wrap.clientHeight-32)/box.height);
  scale=Math.max(.1,fit)*zoom;
  wrap.style.setProperty('--desktop-map-width',`${box.width*scale}px`);
  wrap.scrollLeft=centerX*scale-wrap.clientWidth/2;wrap.scrollTop=centerY*scale-wrap.clientHeight/2;
  document.getElementById('desktopZoomValue').textContent=`${Math.round(zoom*100)}%`;
  document.getElementById('desktopZoomOut').disabled=zoom<=1;
  document.getElementById('desktopZoomIn').disabled=zoom>=3.5;
 }
 function focus(unit,svg=activeSvg()){
  if(!active||!unit||game.hidden)return;
  const [x,y]=center(...unit.pos),ratio=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
  // Small maps fit in full. Detail views keep the chosen unit centered.
  const field=svg.getBoundingClientRect(),viewport=wrap.getBoundingClientRect();
  wrap.scrollTo({left:wrap.scrollLeft+field.left-viewport.left+x*ratio-wrap.clientWidth/2,top:wrap.scrollTop+field.top-viewport.top+y*ratio-wrap.clientHeight/2,behavior:'auto'});
 }
 function changeZoom(value){
  zoom=Math.max(1,Math.min(3.5,value));measure();
  if(zoom===1)wrap.scrollTo(0,0);
 }
 function sync(){
  if(!active||!state||game.hidden)return;
  const key=`${state.code}:${state.battle_number||1}`;
  const changed=key!==battle;
  if(changed){
   battle=key;const box=activeSvg().viewBox.baseVal,fit=Math.min((wrap.clientWidth-32)/box.width,(wrap.clientHeight-32)/box.height);
   zoom=state.scenario?.platoons?Math.min(3.5,Math.max(1.75,Math.ceil(.85/fit*4)/4)):1;
  }
  document.getElementById('findUnit').hidden=!selected;
  document.getElementById('desktopMapSize').textContent=`${state.map[0].length} × ${state.map.length} HEXES`;
  const troops=state.units.filter(u=>u.side===state.side);
  document.getElementById('desktopForceSummary').textContent=`${troops.filter(u=>u.hp>0).length} units in the field · ${names[state.side]}`;
  const visible=troops.filter(u=>platoonFilter==='all'||u.platoon===platoonFilter);
  document.querySelectorAll('#roster button').forEach((button,index)=>{
   button.querySelector('.desktop-unit-meta')?.remove();const unit=visible[index];if(!unit)return;
   button.append(el('span','desktop-unit-meta',unit.hp>0?`${kinds[unit.kind]} · Strength ${unit.hp} · ${String.fromCharCode(65+unit.pos[0])}${unit.pos[1]+1}`:'Eliminated'));
  });
  document.getElementById('desktopOrderTitle').textContent=playbackSession?'Opponent’s turn':'Unit orders';
  document.getElementById('desktopPlaybackNote').hidden=!playbackSession;
  document.getElementById('desktopActionDock').hidden=!!playbackSession;
  measure();
  if(changed&&state.scenario?.platoons)focus(troops.find(u=>u.hp>0&&u.kind==='leader'));
 }
 function activate(){
  if(active)return;active=true;document.body.classList.add('desktop-mode');
  const tag=el('span','desktop-header-tag','WESTERN FRONT / TACTICAL OPERATIONS');document.querySelector('header .brand').after(tag);mounts.push(tag);
  group(game,'desktop-briefing',['.game-title','.status-line','#turnBanner']);
  const layout=el('div','desktop-layout');game.append(layout);mounts.push(layout);
  const force=group(layout,'desktop-forces',['#platoonFilters','#roster'],'Task force');
  const summary=el('p','desktop-force-summary');summary.id='desktopForceSummary';force.querySelector('h2').after(summary);
  const note=el('p','desktop-playback-note','The computer’s orders are playing on the map. Pause or step through them in the right panel.');note.id='desktopPlaybackNote';note.hidden=true;force.append(note);
  force.append(el('p','desktop-force-tip','Choose a platoon to highlight its units. Select a counter or a unit here to issue orders.'));
  const field=group(layout,'desktop-battlefield',['.mission','#missionHint','.map-tools','#mapWrap','.team-legend','.terrain-legend']);
  const mapHead=el('div','desktop-map-heading');mapHead.append(el('h2','','Battlefield'));const size=el('span','');size.id='desktopMapSize';mapHead.append(size);field.prepend(mapHead);
  const camera=el('div','desktop-camera');mounts.push(camera);
  for(const [id,label,title,fn] of [['desktopZoomOut','−','Zoom out',()=>changeZoom(zoom-.25)],['desktopZoomIn','+','Zoom in',()=>changeZoom(zoom+.25)],['desktopFit','Fit map','Show the whole battlefield',()=>changeZoom(1)]]){
   const button=el('button','',label);button.id=id;button.type='button';button.title=title;button.setAttribute('aria-label',title);button.onclick=fn;camera.append(button);
  }
  const value=el('span','desktop-zoom-value');value.id='desktopZoomValue';camera.insertBefore(value,camera.children[1]);
  camera.append(el('span','desktop-pan-hint','Drag to pan · + / − to zoom'));
  field.querySelector('.map-tools').append(camera);
  wrap.tabIndex=0;wrap.setAttribute('aria-label','Battlefield viewport. Drag to pan; plus and minus to zoom; zero fits the map.');
  const commands=el('section','desktop-command-column');layout.append(commands);mounts.push(commands);
  const orders=group(commands,'desktop-orders',['#waiting','#incoming','#supportStatus','#playbackPanel','#orders','#combat','#battleReport','#rematchProposal','#replayTurn','#computerReview','.journal'],'Unit orders');
  orders.querySelector('h2').id='desktopOrderTitle';
  const dock=group(commands,'desktop-action-dock',['#nextUnit','#end']);dock.id='desktopActionDock';
  group(game,'desktop-footer',['.match-tools','#seriesScore']);
  group(lobby,'desktop-lobby-intro',[lobby.querySelector('.eyebrow'),lobby.querySelector('h1'),lobby.querySelector('.intro'),lobby.querySelector('.brief:not(#scenarioBrief)'),lobby.querySelector(':scope > .footnote')]);
  group(lobby,'desktop-lobby-setup',[lobby.querySelector('label[for="scenarioSelect"]'),'#scenarioSelect','#scenarioPreview','#scenarioBrief','#create','#createSolo'],'Choose your operation');
  group(lobby,'desktop-lobby-return',['#savedSessions','#joinForm','#recoverForm'],'Return to the field');
  sync();
 }
 function deactivate(){
  if(!active)return;active=false;drag=null;document.body.classList.remove('desktop-mode');
  document.querySelectorAll('.desktop-unit-meta').forEach(node=>node.remove());
  for(const [node,marker] of originals){marker.replaceWith(node);}originals=[];
  for(const node of mounts)node.remove();mounts=[];
  wrap.style.removeProperty('--desktop-map-width');wrap.removeAttribute('tabindex');wrap.removeAttribute('aria-label');wrap.classList.remove('desktop-panning');battle=null;
  // Reapply original map sizing and unit focus after crossing into the mobile layout.
  if(state&&!game.hidden){if(playbackSession)drawPlayback();else render();}
 }
 window.ww2Desktop={get active(){return active;},focus};
 desktop.addEventListener('change',()=>desktop.matches?activate():deactivate());
 document.addEventListener('ww2:render',sync);
 document.addEventListener('ww2:playback',()=>{if(active){document.getElementById('desktopOrderTitle').textContent='Opponent’s turn';document.getElementById('desktopPlaybackNote').hidden=false;document.getElementById('desktopActionDock').hidden=true;measure();}});
 let lastWidth=0,lastHeight=0;
 new ResizeObserver(()=>{
  if(wrap.clientWidth===lastWidth&&wrap.clientHeight===lastHeight)return;
  lastWidth=wrap.clientWidth;lastHeight=wrap.clientHeight;cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(()=>{
   if(!active||game.hidden)return;
   const box=activeSvg().viewBox.baseVal,fit=Math.min((wrap.clientWidth-32)/box.width,(wrap.clientHeight-32)/box.height);
   if(zoom>1&&fit>0)zoom=Math.min(3.5,Math.max(1,Math.round(scale/fit*4)/4));
   measure();if(selected&&!playbackSession)focus(state?.units.find(u=>u.id===selected));
  });
 }).observe(wrap);
 wrap.addEventListener('pointerdown',event=>{
  if(!active||event.pointerType==='touch'||event.button!==0)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:wrap.scrollLeft,top:wrap.scrollTop,moved:false};suppressClick=false;
 });
 wrap.addEventListener('pointermove',event=>{
  if(!drag||!active||event.pointerId!==drag.id)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<6)return;
  if(!drag.moved){drag.moved=true;wrap.setPointerCapture(event.pointerId);wrap.classList.add('desktop-panning');}
  wrap.scrollLeft=drag.left-dx;wrap.scrollTop=drag.top-dy;event.preventDefault();
 });
 function finishDrag(){if(!drag)return;suppressClick=drag.moved;if(wrap.hasPointerCapture(drag.id))wrap.releasePointerCapture(drag.id);drag=null;wrap.classList.remove('desktop-panning');}
 wrap.addEventListener('pointerup',finishDrag);wrap.addEventListener('pointercancel',finishDrag);
 wrap.addEventListener('pointerleave',()=>{if(drag&&!drag.moved)drag=null;});
 wrap.addEventListener('click',event=>{if(active&&suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 wrap.addEventListener('keydown',event=>{
  if(!active||event.target!==wrap)return;
  if(['+','=','-','0'].includes(event.key)){event.preventDefault();changeZoom(event.key==='0'?1:zoom+(event.key==='-'?-.25:.25));}
  const directions={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]};
  if(directions[event.key]){event.preventDefault();wrap.scrollBy(...directions[event.key]);}
 });
 if(desktop.matches)activate();
});
