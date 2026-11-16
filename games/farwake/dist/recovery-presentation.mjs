/** Receipt-driven presentation: repeated network snapshots cannot restart a wake-up. */
export class RecoveryTransition{
 constructor(){this.reset();}
 reset(){this.identity=null;this.receipt=null;this.phase='idle';this.age=0;this.ready=false;this.destination=null;}
 get active(){return this.phase!=='idle';}
 update(state,delta,{playing=true,reducedMotion=false}={}){
  if(!playing){this.reset();return this.view(reducedMotion);}
  const identity=state.seed+':'+(state.multiplayer?.captainId||'solo');
  const receipt=state.medicalRecovery,down=state.person?.health<=0||state.person?.down===true;
  if(identity!==this.identity){this.reset();this.identity=identity;this.receipt=receipt?.id||null;if(receipt?.wakeUntil>state.stats.time){this.begin();this.ready=!down;this.destination=receipt.destination;}}
  if(receipt?.id&&receipt.id!==this.receipt){this.receipt=receipt.id;if(!this.active)this.begin();else if(this.phase==='lost')this.age=0;this.ready=!down;this.destination=receipt.destination;}
  if(down&&!this.active)this.begin();
  if(down)this.ready=false;
  // Recovery always needs an authoritative healthy state and a medical receipt.
  if(this.active&&!down&&receipt?.id===this.receipt&&this.destination)this.ready=true;
  let finished=false;
  if(this.active){this.age+=Math.max(0,Math.min(.1,delta));
   if(this.phase==='lost'&&this.ready&&this.age>=2.5){this.phase='waking';this.age=0;}
   else if(this.phase==='waking'&&this.age>=3.8){this.phase='idle';finished=true;}
  }
  return{...this.view(reducedMotion),finished,destination:this.destination};
 }
 begin(){this.phase='lost';this.age=0;this.ready=false;this.destination=null;}
 view(reducedMotion=false){
  const t=Math.min(1,this.age/3.8);
  // A tentative first opening closes once, then opens fully without flashes.
  const opening=this.phase==='waking'?(reducedMotion?t:t<.25?Math.sin(t/.25*Math.PI)*.15:Math.pow((t-.25)/.75,1.35)):0;
  return{active:this.active,phase:this.phase,opening,reducedMotion};
 }
}
export function createRecoveryPresentation({element,app,audio,onBegin=()=>{},onFinish=()=>{}}){
 const transition=new RecoveryTransition();let active=false;
 return{
  get active(){return transition.active;},
  update(state,dt,options){
   const view=transition.update(state,dt,options);
   if(view.active!==active){active=view.active;audio.setRecoveryMuted(active);app.inert=active;document.body.classList.toggle('recovering',active);if(active)onBegin();}
   element.hidden=!view.active;element.dataset.phase=view.phase;element.dataset.reduced=String(view.reducedMotion);element.style.setProperty('--eye-open',String(view.opening));
   element.querySelector('p').hidden=view.phase!=='lost';
   if(view.finished)onFinish(view.destination);
   return view;
  }
 };
}
