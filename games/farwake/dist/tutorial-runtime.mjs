import { GuidanceController, guidanceProfileKey } from './guidance.mjs';

export const GUIDE_STORAGE_KEY='dfe.farwake.action-guide.v1';
const length=(x,y)=>Math.hypot(Number(x)||0,Number(y)||0);
const angleDelta=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

/** Browser persistence and evidence collection; never edits a voyage or sends input. */
export class TutorialRuntime {
  constructor({storage=null,nonce=String(Date.now())}={}) {
    this.storage=storage;this.nonce=nonce;this.serial=0;this.profiles={};this.sessions=new Map();this.controller=null;this.context=null;this.gestures=new Map();this.fireSerial=0;this.fireHeld=false;this.savedRevision=-1;this.time=0;this.fireEpisodes=[];this.shotEpisodes=new Map();
    try{const value=JSON.parse(storage?.getItem(GUIDE_STORAGE_KEY)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))this.profiles=value;}catch{}
  }
  select({seed,captainId,realmId,testId=null,mode='simple'}={}) {
    const profileId=guidanceProfileKey({seed,captainId,realmId,testId}),testMode=testId!==null;
    if(this.controller?.profileId!==profileId){
      this.flush();const state=testMode?this.sessions.get(profileId):this.profiles[profileId];
      this.controller=new GuidanceController({profileId,state,mode,testMode});this.context=null;this.gestures.clear();this.fireHeld=false;this.fireEpisodes=[];this.shotEpisodes.clear();this.savedRevision=this.controller.revision;
    }
    if(this.controller.mode!==mode)this.controller.setMode(mode);
    return this.controller;
  }
  update(context) {if(!this.controller)return null;this.context={...context,profileId:this.controller.profileId,testMode:this.controller.testMode};const prompt=this.controller.update(this.context);this.flush();return prompt;}
  present(prompt,context=this.context,options={}) {if(!this.controller||!context)return null;const shown=this.controller.present(prompt,{...context,profileId:this.controller.profileId,testMode:this.controller.testMode},options);this.flush();return shown;}
  record(action,id=null,context=this.context) {
    if(!this.controller||!context)return false;
    const changed=this.controller.record({action,id:id??`${this.nonce}:${++this.serial}`,success:true,device:context.device,profileId:this.controller.profileId,testMode:this.controller.testMode},context);
    if(changed)this.flush();return changed;
  }
  flush(){
    const controller=this.controller;if(!controller||this.savedRevision===controller.revision)return;
    this.savedRevision=controller.revision;const state=controller.exportState();
    if(controller.testMode){this.sessions.set(controller.profileId,state);return;}
    // A small bounded set of public profile IDs, separate from saves/passports.
    delete this.profiles[controller.profileId];this.profiles[controller.profileId]=state;
    const keys=Object.keys(this.profiles);for(const key of keys.slice(0,Math.max(0,keys.length-16)))delete this.profiles[key];
    try{this.storage?.setItem(GUIDE_STORAGE_KEY,JSON.stringify(this.profiles));}catch{}
  }
  reset(flow='all'){if(this.controller?.resetProgress(flow)){this.gestures.clear();this.fireHeld=false;this.fireEpisodes=[];this.shotEpisodes.clear();this.flush();return true;}return false;}
  /** A sustained input only counts after observable motion, once per gesture. */
  observe(input={},before,after,dt,{active=true,combat=false}={}) {
    this.time+=Math.max(0,Number(dt)||0);
    if(!active||!this.controller||!this.context||!before||!after||before.mode!==after.mode){this.gestures.clear();this.fireHeld=false;return;}
    if(input.fire&&!this.fireHeld){this.fireSerial++;this.fireEpisodes.push({id:`${this.nonce}:fire:${this.fireSerial}`,mode:after.mode,at:this.time,context:{...this.context}});if(this.fireEpisodes.length>16)this.fireEpisodes.shift();}
    this.fireHeld=!!input.fire;
    if(this.fireHeld&&this.fireEpisodes.length)this.fireEpisodes.at(-1).at=this.time;
    const onFoot=after.mode==='person',ship=after.ship||{},oldShip=before.ship||{},person=after.person||{},oldPerson=before.person||{};
    const speed=length(ship.vx,ship.vy),oldSpeed=length(oldShip.vx,oldShip.vy);
    const evidence={
      'flight-thrust':{held:!onFoot&&input.thrust>.12,moved:Math.abs(speed-oldSpeed)>.002||length(ship.x-oldShip.x,ship.y-oldShip.y)>.02},
      'flight-turn':{held:!onFoot&&Math.abs(input.turn||0)>.12,moved:angleDelta(ship.angle||0,oldShip.angle||0)>.0002},
      'flight-strafe':{held:!onFoot&&Math.abs(input.strafe||0)>.12,moved:Math.abs((ship.vx-oldShip.vx)*-Math.sin(ship.angle||0)+(ship.vy-oldShip.vy)*Math.cos(ship.angle||0))>.002},
      'flight-brake':{held:!onFoot&&(input.brake||input.thrust<-.1),moved:oldSpeed>2&&speed<oldSpeed-.003},
      'person-move':{held:onFoot&&length(input.x,input.y)>.12,moved:!person.down&&person.health>0&&length(person.x-oldPerson.x,person.y-oldPerson.y)>.02},
      'person-aim':{held:onFoot&&!this.context.gunnery?.active&&combat&&input.aiming,moved:!person.down&&person.health>0&&length(input.aimX,input.aimY)>.2}
    };
    for(const [action,value]of Object.entries(evidence)){
      if(!value.held){this.gestures.delete(action);continue;}
      let gesture=this.gestures.get(action);if(!gesture){gesture={time:0,done:false,id:`${this.nonce}:gesture:${++this.serial}`};this.gestures.set(action,gesture);}
      if(gesture.done)continue;if(value.moved)gesture.time+=Math.min(.1,Math.max(0,dt));
      if(gesture.time>=(action==='person-aim'?.22:.45)){gesture.done=true;this.record(action,gesture.id);}
    }
  }
  shot(event,{local=false,mode='ship'}={}) {
    if(!local||!this.context||!event.id)return;
    const shotId=String(event.id).replace(/:hit$/,''),known=this.shotEpisodes.get(shotId);
    // A server confirmation can follow release. Match a recent real trigger,
    // then keep the shot identity for its hit instead of counting every pulse.
    const episode=known??(event.type==='person-hit'?null:[...this.fireEpisodes].reverse().find(e=>e.mode===mode&&this.time-e.at<=2));
    if(!episode)return;
    if(!known){this.shotEpisodes.set(shotId,episode);if(this.shotEpisodes.size>96)this.shotEpisodes.delete(this.shotEpisodes.keys().next().value);}
    if(event.type==='shot'&&episode.context.gunnery?.active)this.record('gunnery-fire',episode.id,episode.context);
    else if(event.type==='shot'&&mode==='ship')this.record('ship-fire',episode.id,episode.context);
    if(event.type==='person-shot')this.record('person-fire',episode.id,episode.context);
    if(event.type==='person-hit')this.record('person-hit',episode.id,episode.context);
  }
}
