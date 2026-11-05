// A play is called on tap, never at the start of a swipe. The deck stays mounted
// while its cards change, so it can consume the compatibility click after a drag.
export function swipePageDelta(dx,dy,width=300){
 const threshold=Math.min(64,Math.max(32,width*.12));
 return Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.25?(dx<0?1:-1):0;
}

export function bindHuddleSwipe(deck,navigate){
 let gesture=null,blockClick=false;
 const reset=()=>{const cards=deck.querySelector('.playcards');if(cards)cards.style.transform='';deck.classList.remove('dragging');gesture=null;};
 deck.addEventListener('pointerdown',event=>{
  if(gesture||event.pointerType==='mouse'&&event.button!==0)return;
  blockClick=false;
  if(!event.target.closest?.('.playcards'))return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0,axis:null};
 });
 deck.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  gesture.dx=event.clientX-gesture.x;gesture.dy=event.clientY-gesture.y;
  const x=Math.abs(gesture.dx),y=Math.abs(gesture.dy);
  if(!gesture.axis&&Math.max(x,y)>10){
   if(x>y*1.25)gesture.axis='x';else if(y>x*1.25)gesture.axis='y';
  }
  if(gesture.axis!=='x')return;
  if(event.cancelable)event.preventDefault();
  blockClick=true;
  try{deck.setPointerCapture(event.pointerId);}catch{}
  deck.classList.add('dragging');
  const cards=deck.querySelector('.playcards');
  if(cards)cards.style.transform=`translateX(${Math.max(-52,Math.min(52,gesture.dx*.35))}px)`;
 });
 deck.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  const delta=gesture.axis==='y'?0:swipePageDelta(dx,dy,deck.getBoundingClientRect().width);
  if(Math.hypot(dx,dy)>10)blockClick=true;
  if(blockClick&&event.cancelable)event.preventDefault();
  reset();
  if(delta)navigate(delta);
 });
 deck.addEventListener('pointercancel',event=>{if(gesture&&event.pointerId===gesture.id){blockClick=true;reset();}});
 deck.addEventListener('lostpointercapture',event=>{
  // Touch starts with implicit capture on the card's child. Transferring it to
  // the deck bubbles that child's lost event here; the gesture is still ours.
  if(event.target===deck&&gesture&&event.pointerId===gesture.id){blockClick=true;reset();}
 });
 deck.addEventListener('click',event=>{
  if(!blockClick||event.detail===0)return;
  event.preventDefault();event.stopImmediatePropagation();
 },true);
 deck.addEventListener('keydown',event=>{
  if(['SELECT','INPUT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();event.stopPropagation();
  navigate(event.key==='ArrowRight'?1:-1,{keyboard:true});
 });
}
