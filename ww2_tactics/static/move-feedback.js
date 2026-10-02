/* Immediate acknowledgement of a legal destination, while the server retains
   authority over movement, hidden blockers, reaction fire, AP and dice. */
'use strict';
(()=>{
 let pending=null;
 function begin(body){
  if(body.kind!=='move'||busy||playbackSession||!state||state.turn!==state.side||state.winner)return ()=>{};
  const u=state.units.find(u=>u.id===body.unit&&u.side===state.side&&u.hp>0),move=state.legal[body.unit]?.moves.find(m=>m.pos[0]===body.pos?.[0]&&m.pos[1]===body.pos?.[1]);
  const counter=$('map')._counters?.get(body.unit);
  if(!u||!move||!counter)return ()=>{};
  const transform=counter.getAttribute('transform'),label=counter.getAttribute('aria-label'),[x,y]=center(...u.pos),[dx,dy]=center(...move.pos);
  const mark=element('g',{class:'move-pending-mark','aria-hidden':'true'});
  mark.append(element('circle',{cx:x,cy:y,r:21,class:'move-origin'}),element('circle',{cx:dx,cy:dy,r:27,class:'move-destination'}));
  $('map').append(mark);counter.classList.add('move-pending');
  counter.setAttribute('transform',`translate(${dx-x} ${dy-y}) ${transform||''}`);
  counter.setAttribute('aria-label',`${unitName(u)}. Moving to ${hexColumn(move.pos[0])}${move.pos[1]+1}; awaiting confirmation.`);
  $('moveStatus').textContent=`Moving ${unitTypeName(u)}…`;$('moveStatus').hidden=false;
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;mark.remove();counter.classList.remove('move-pending');if(transform===null)counter.removeAttribute('transform');else counter.setAttribute('transform',transform);if(label===null)counter.removeAttribute('aria-label');else counter.setAttribute('aria-label',label);$('moveStatus').hidden=true;pending=null;};
  pending=finish;return finish;
 }
 const status=document.createElement('p');status.id='moveStatus';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
 window.ww2MoveFeedback={begin,get pending(){return !!pending;}};
 // Layout teardown or leaving the battle must never leave a visual preview.
 document.addEventListener('ww2:before-layout',()=>pending?.());
 new MutationObserver(()=>{if($('game').hidden)pending?.();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
})();
