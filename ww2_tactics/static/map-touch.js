/* The battlefield owns touch gestures; browser zoom remains available elsewhere. */
'use strict';
(()=>{
 const wrap=document.getElementById('mapWrap');
 let gesture=null,blockedUntil=0,battle=null;
 const svg=()=>document.getElementById('playbackMap')||document.getElementById('map');
 const midpoint=touches=>({x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2});
 const span=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
 function clearCamera(){wrap.classList.remove('touch-camera');wrap.style.removeProperty('--touch-map-width');wrap.style.removeProperty('--touch-map-height');}
 function begin(touches){
  if(touches.length>=2){
   const field=svg(),matrix=field.getScreenCTM();if(!matrix)return;
   const point=midpoint(touches),anchor=new DOMPoint(point.x,point.y).matrixTransform(matrix.inverse());
   const width=field.viewBox.baseVal.width*Math.hypot(matrix.a,matrix.b);
   gesture={type:'pinch',distance:Math.max(1,span(touches)),width,anchor,moved:true};
   blockedUntil=performance.now()+700;
   if(!window.ww2Desktop?.active){
    wrap.style.setProperty('--touch-map-height',`${wrap.getBoundingClientRect().height}px`);
    wrap.style.setProperty('--touch-map-width',`${width}px`);
    wrap.classList.add('touch-camera','enlarged');
    $('zoom').textContent=state?.scenario?.platoons?'Overview':'Fit map −';$('zoom').setAttribute('aria-pressed','true');
    anchorAt(anchor,point);
   }
  }else if(touches.length===1){
   gesture={type:'pan',id:touches[0].identifier,x:touches[0].clientX,y:touches[0].clientY,left:wrap.scrollLeft,top:wrap.scrollTop,moved:false};
  }
 }
 function anchorAt(anchor,point){
  const matrix=svg().getScreenCTM();if(!matrix)return;
  const screen=new DOMPoint(anchor.x,anchor.y).matrixTransform(matrix);
  wrap.scrollLeft+=screen.x-point.x;wrap.scrollTop+=screen.y-point.y;
 }
 wrap.addEventListener('touchstart',event=>{
  if(event.touches.length>=2){event.preventDefault();begin(event.touches);}
  else{blockedUntil=0;begin(event.touches);}
 },{passive:false});
 wrap.addEventListener('touchmove',event=>{
  if(!gesture)return;
  if(event.touches.length>=2){
   event.preventDefault();if(gesture.type!=='pinch')begin(event.touches);
   const point=midpoint(event.touches),field=svg();
   const wanted=gesture.width*span(event.touches)/gesture.distance;
   if(window.ww2Desktop?.active){
    window.ww2Desktop.zoomBy(wanted/field.getBoundingClientRect().width);
   }else{
    const width=Math.max(wrap.clientWidth,Math.min(Math.max(wrap.clientWidth*6,field.viewBox.baseVal.width*2),wanted));
    wrap.style.setProperty('--touch-map-width',`${width}px`);
   }
   anchorAt(gesture.anchor,point);blockedUntil=performance.now()+700;
  }else if(event.touches.length===1&&gesture.type==='pan'){
   const touch=event.touches[0],dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y;
   if(!gesture.moved&&Math.hypot(dx,dy)<6)return;
   event.preventDefault();gesture.moved=true;blockedUntil=performance.now()+700;
   wrap.scrollLeft=gesture.left-dx;wrap.scrollTop=gesture.top-dy;
  }
 },{passive:false});
 function finish(event){
  const moved=!!gesture?.moved;
  if(moved){event.preventDefault();blockedUntil=performance.now()+700;}
  if(event.touches.length){begin(event.touches);if(gesture)gesture.moved=moved;}else gesture=null;
 }
 wrap.addEventListener('touchend',finish,{passive:false});
 wrap.addEventListener('touchcancel',()=>{gesture=null;blockedUntil=performance.now()+700;},{passive:true});
 // Safari's gesture events also need local cancellation, without disabling page zoom.
 for(const name of ['gesturestart','gesturechange','gestureend'])wrap.addEventListener(name,event=>event.preventDefault(),{passive:false});
 wrap.addEventListener('click',event=>{if(performance.now()<blockedUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 $('zoom').addEventListener('click',clearCamera,true);
 document.addEventListener('ww2:before-layout',clearCamera);
 document.addEventListener('ww2:render',()=>{
  const key=`${state?.code}:${state?.battle_number}`;
  if(key!==battle){clearCamera();gesture=null;battle=key;}
 });
})();
