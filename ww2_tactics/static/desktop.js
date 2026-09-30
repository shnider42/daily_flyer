/* Desktop presentation only. Move existing controls; never duplicate game actions. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const desktop=matchMedia('(min-width: 1100px)'), game=document.getElementById('game'), lobby=document.getElementById('lobby');
 const wrap=document.getElementById('mapWrap');
 let mounts=[], originals=[], active=false, battle=null, zoom=1, scale=1, drag=null, suppressClick=false, resizeFrame, measured='',orderUnit=null;
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
  document.getElementById('desktopZoomValue').textContent=`${Math.round(zoom*100)}%`;
  document.getElementById('desktopZoomOut').disabled=zoom<=1;
  document.getElementById('desktopZoomIn').disabled=zoom>=3.5;
  const key=[box.width,box.height,wrap.clientWidth,wrap.clientHeight,zoom].join(':');
  if(key===measured)return;measured=key;
  const previous=scale;
  const centerX=(wrap.scrollLeft+wrap.clientWidth/2)/previous,centerY=(wrap.scrollTop+wrap.clientHeight/2)/previous;
  const fit=Math.min((wrap.clientWidth-32)/box.width,(wrap.clientHeight-32)/box.height);
  scale=Math.max(.1,fit)*zoom;
  wrap.style.setProperty('--desktop-map-width',`${box.width*scale}px`);
  wrap.scrollLeft=centerX*scale-wrap.clientWidth/2;wrap.scrollTop=centerY*scale-wrap.clientHeight/2;
 }
 function focus(unit,svg=activeSvg(),onlyIfOutside=false){
  if(!active||!unit||game.hidden)return;
  const [x,y]=center(...unit.pos),ratio=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
  // Small maps fit in full. Detail views keep the chosen unit centered.
  const field=svg.getBoundingClientRect(),viewport=wrap.getBoundingClientRect();
  const px=field.left+x*ratio,py=field.top+y*ratio;
  if(onlyIfOutside&&px>viewport.left+30&&px<viewport.right-30&&py>viewport.top+30&&py<viewport.bottom-30)return;
  wrap.scrollTo({left:wrap.scrollLeft+field.left-viewport.left+x*ratio-wrap.clientWidth/2,top:wrap.scrollTop+field.top-viewport.top+y*ratio-wrap.clientHeight/2,behavior:'auto'});
 }
 function changeZoom(value,point=null){
  const before=activeSvg().getBoundingClientRect(),oldScale=scale;
  zoom=Math.max(1,Math.min(3.5,value));measure();
  if(point){
   const after=activeSvg().getBoundingClientRect();
   wrap.scrollLeft+=after.left+(point.x-before.left)*scale/oldScale-point.x;
   wrap.scrollTop+=after.top+(point.y-before.top)*scale/oldScale-point.y;
  }else if(zoom===1)wrap.scrollTo(0,0);
 }
 function sync(){
  if(!active||!state||game.hidden)return;
  document.querySelector('.desktop-header-tag').textContent=state.scenario?.theater?`${state.scenario.theater} / ${state.air_version?'AIR PLAYTEST':'TACTICAL OPERATIONS'}`:state.naval_version?'PACIFIC / NAVAL OPERATIONS':'WESTERN FRONT / TACTICAL OPERATIONS';
  const key=`${state.code}:${state.battle_number||1}`;
  const changed=key!==battle;
  if(changed){
   battle=key;const box=activeSvg().viewBox.baseVal,fit=Math.min((wrap.clientWidth-32)/box.width,(wrap.clientHeight-32)/box.height);
   zoom=state.scenario?.platoons?Math.min(3.5,Math.max(1.75,Math.ceil(.85/fit*4)/4)):1;
  }
  document.getElementById('findUnit').hidden=!selected;
  document.getElementById('desktopMapSize').textContent=`${state.map[0].length} × ${state.map.length} HEXES`;
  const troops=state.units.filter(u=>u.side===state.side);
  document.getElementById('desktopForceSummary').textContent=`${troops.filter(u=>u.hp>0).length} units active · ${names[state.side]}`;
  const visible=troops.filter(u=>platoonFilter==='all'||u.platoon===platoonFilter);
  document.querySelectorAll('#roster button').forEach((button,index)=>{
   button.querySelector('.desktop-unit-meta')?.remove();const unit=visible[index];if(!unit)return;
   button.append(el('span','desktop-unit-meta',unit.hp>0?`${kinds[unit.kind]} · ${state.naval_version&&unit.kind!=='amphibious'?'Hull':'Strength'} ${unit.hp} · ${String.fromCharCode(65+unit.pos[0])}${unit.pos[1]+1}`:'Lost'));
  });
  document.getElementById('desktopOrderTitle').textContent=playbackSession?'Opponent’s turn':'Unit orders';
  document.getElementById('desktopPlaybackNote').hidden=!playbackSession;
  document.getElementById('desktopActionDock').hidden=!!playbackSession;
  if(selected!==orderUnit){document.querySelector('.desktop-orders').scrollTop=0;orderUnit=selected;}
  measure();
  if(changed&&state.scenario?.platoons)focus(troops.find(u=>u.hp>0&&u.kind===(state.naval_version?'carrier':'leader')));
 }
 function activate(){
  document.dispatchEvent(new Event('ww2:before-layout'));
  if(active)return;active=true;document.body.classList.add('desktop-mode');
  const tag=el('span','desktop-header-tag','WESTERN FRONT / TACTICAL OPERATIONS');document.querySelector('header .brand').after(tag);mounts.push(tag);
  group(game,'desktop-briefing',['.game-title','.status-line','#rulesetBadge','#turnBanner','#playTools']);
  const layout=el('div','desktop-layout');game.append(layout);mounts.push(layout);
  const force=group(layout,'desktop-forces',['#platoonFilters','#roster'],'Task force');
  const summary=el('p','desktop-force-summary');summary.id='desktopForceSummary';force.querySelector('h2').after(summary);
  const note=el('p','desktop-playback-note','The computer’s orders are playing on the map. Pause or step through them in the right panel.');note.id='desktopPlaybackNote';note.hidden=true;force.append(note);
  force.append(el('p','desktop-force-tip','Choose a platoon to highlight its units. Select a counter or a unit here to issue orders.'));
  const field=group(layout,'desktop-battlefield',['.mission','#missionHint','.map-tools','#mapWrap','.team-legend','.terrain-legend']);
  const mapHead=el('div','desktop-map-heading');mapHead.append(el('h2','','Battlefield'));const size=el('span','');size.id='desktopMapSize';mapHead.append(size);field.prepend(mapHead);
  const camera=el('div','desktop-camera');mounts.push(camera);
  for(const [id,label,title,fn] of [['desktopZoomOut','−','Zoom out',()=>changeZoom(zoom-.25)],['desktopZoomIn','+','Zoom in',()=>changeZoom(zoom+.25)],['desktopFit','Fit map','Show the whole battlefield',()=>changeZoom(1)],['desktopExpand','Widen map','Widen map',()=>{
   const on=layout.classList.toggle('map-expanded');$('desktopExpand').setAttribute('aria-pressed',String(on));$('desktopExpand').textContent=on?'Show roster':'Widen map';
  }]]){
   const button=el('button','',label);button.id=id;button.type='button';button.setAttribute('aria-label',title);button.dataset.help=id==='desktopExpand'?'Hide the task-force list to give the map more space. Unit orders stay accessible. Select again to restore the roster.':id==='desktopFit'?'Fit every hex in the viewport. This changes your view, not movement range. Shortcut: 0 when the map is focused.':title+'. You can also scroll over the map to zoom around the pointer.';button.onclick=fn;if(id==='desktopExpand')button.setAttribute('aria-pressed','false');camera.append(button);
  }
  const value=el('span','desktop-zoom-value');value.id='desktopZoomValue';camera.insertBefore(value,camera.children[1]);
  const cameraHint=el('p','desktop-camera-hint','Scroll to zoom · drag to pan · Find centers your unit');wrap.after(cameraHint);mounts.push(cameraHint);
  $('findUnit').dataset.help='Center the selected unit without changing zoom. Selecting a unit already in view keeps the map still.';
  $('nextUnit').dataset.help='Select the next unit. This does not spend actions or end your turn.';
  $('end').dataset.help='Finish your turn and let the opponent act. Unused AP bank according to this battle’s rules.';
  field.querySelector('.map-tools').append(camera);
  wrap.tabIndex=0;wrap.setAttribute('aria-label','Battlefield viewport. Scroll to zoom, drag to pan; plus and minus to zoom; zero fits the map.');
  const commands=el('section','desktop-command-column');layout.append(commands);mounts.push(commands);
  const orders=group(commands,'desktop-orders',['#waiting','#incoming','#supportStatus','#playbackPanel','#orders','#combat','#simpleOutcome','#battleReport','#rematchProposal','#replayTurn','#computerReview','.journal'],'Unit orders');
  orders.querySelector('h2').id='desktopOrderTitle';
  const dock=group(commands,'desktop-action-dock',['#nextUnit','#end']);dock.id='desktopActionDock';
  group(game,'desktop-footer',['#battleOptions','#seriesScore']);
  sync();
  document.dispatchEvent(new Event('ww2:layout'));
 }
 function deactivate(){
  if(!active)return;active=false;drag=null;document.body.classList.remove('desktop-mode');
  document.querySelectorAll('.desktop-unit-meta').forEach(node=>node.remove());
  for(const [node,marker] of originals){marker.replaceWith(node);}originals=[];
  for(const node of mounts)node.remove();mounts=[];
  wrap.style.removeProperty('--desktop-map-width');wrap.removeAttribute('tabindex');wrap.removeAttribute('aria-label');wrap.classList.remove('desktop-panning');battle=null;measured='';orderUnit=null;
  for(const id of ['findUnit','nextUnit','end'])delete $(id).dataset.help;
  // Reapply original map sizing and unit focus after crossing into the mobile layout.
  if(state&&!game.hidden){if(playbackSession)drawPlayback();else render();}
 }
 window.ww2Desktop={get active(){return active;},focus,ensureVisible:u=>focus(u,activeSvg(),true),zoomBy:factor=>changeZoom(zoom*factor)};
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
   measure();
  });
 }).observe(wrap);
 wrap.addEventListener('wheel',event=>{
  if(!active||game.hidden||event.altKey||event.metaKey)return;
  event.preventDefault();
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?wrap.clientHeight:1);
  changeZoom(zoom*Math.exp(-Math.max(-120,Math.min(120,delta))*.0025),{x:event.clientX,y:event.clientY});
 },{passive:false});
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
