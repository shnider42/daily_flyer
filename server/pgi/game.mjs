import {Game,clamp} from '../../daily_flyer/themes/pocket_gridiron_assets/engine.js';
import {buildTeam} from '../../daily_flyer/themes/pocket_gridiron_assets/roster.js';
import {seededRandom} from '../../daily_flyer/themes/pocket_gridiron_assets/rules.js';
import {readFileSync} from 'node:fs';
const roster=JSON.parse(readFileSync(new URL('../../daily_flyer/themes/pocket_gridiron_assets/rosters.json',import.meta.url)));
const neutral={x:0,y:0};
export class DuelGame extends Game {
 constructor(home,away,length='quick',seed=1){super(buildTeam(home,roster),buildTeam(away,roster),'pro',seededRandom(seed),{length});this.actorTeam=null;this.epoch=1;this.calls=[null,null];this.playClock=25;this.events=[];}
 get userOffense(){return this.actorTeam==null||this.actorTeam===this.offense;}
 get userKicking(){return !!this.special&&(this.actorTeam==null?['kick_ready','kick_charge','kick_accuracy'].includes(this.phase):this.actorTeam===this.special.kickingTeam);}
 isHumanDefender(p){return p===this.defenders[this.selected];}
 autoPenalty(){return false;}
 asTeam(team,fn){this.actorTeam=team;try{return fn();}finally{this.actorTeam=null;}}
 beginDrive(...args){super.beginDrive(...args);this.calls=[null,null];this.playClock=25;this.epoch=(this.epoch||0)+1;}
 beginGoal(...args){super.beginGoal(...args);this.playClock=25;this.epoch=(this.epoch||0)+1;}
 beginKick(...args){super.beginKick(...args);this.playClock=20;this.epoch=(this.epoch||0)+1;}
 startTurnover(...args){super.startTurnover(...args);this.epoch++;}
 move(p,...args){if(this.isHumanDefender(p)&&!this.defenseMoving)return;return super.move(p,...args);}
 chooseFor(team,id){
  if(this.paused||!['call','ready'].includes(this.phase))return false;
  const book=team===this.offense?this.offensePlays:this.defensePlays;
  if(!book.some(p=>p.id===id))return false;
  this.calls[team]=id;
  if(this.calls.every(Boolean)){
   this.play=this.calls[this.offense];this.defense=this.calls[1-this.offense];const selected=this.selected;
   this.setFormation();this.selected=selected;this.phase='ready';this.epoch++;
  }
  return true;
 }
 command(team,name,args=[]){
  if(this.paused)return false;
  if(name==='choose')return this.chooseFor(team,args[0]);
  if(name==='changePlay')return false;
  return this.asTeam(team,()=>{
   if(name==='snap')return team===this.offense&&this.snap(team);
   if(name==='throwTo')return team===this.offense&&this.throwTo(args[0],vector(args[1]));
   if(name==='burst')return this.burst();
   if(name==='breakTackle')return team===this.offense&&this.breakTackle();
   if(name==='switchDefender')return team!==this.offense&&this.switchDefender(args[0]==='cycle'?'cycle':'nearest');
   if(name==='selectDefender')return team!==this.offense&&this.selectDefender(args[0]);
   if(name==='kick')return team===this.offense&&this.kick(args[0]);
   if(name==='kickAction')return this.special?.kickingTeam===team&&this.kickAction();
   if(name==='aim'&&this.special?.kickingTeam===team&&['kick_ready','kick_charge','kick_accuracy'].includes(this.phase)){this.special.aim=clamp(Number(args[0])||0,-1,1);return true;}
   if(name==='fairCatch')return team===this.offense&&this.fairCatch();
   if(name==='resolvePenalty')return this.phase==='penalty'&&this.penaltyReview?.beneficiary===team&&this.resolvePenalty(args[0]===true);
   return false;
  });
 }
 tickBoth(dt,inputs=[neutral,neutral]){
  if(this.paused||['halftime','final'].includes(this.phase))return;
  dt=clamp(dt,0,.05);const off=vector(inputs[this.offense]),def=vector(inputs[1-this.offense]);
  if(['call','ready','kick_ready','kick_charge','kick_accuracy','penalty'].includes(this.phase)){
   this.playClock-=dt;
   if(this.playClock<=0){
    if(this.phase==='penalty')this.resolvePenalty(true);
    else if(this.phase.startsWith('kick_'))this.special.goal?this.launchGoal(1,.5):this.launchKick(.72,this.special.aim);
    else {for(const team of [0,1])if(!this.calls[team])this.chooseFor(team,team===this.offense?this.offensePlays[0].id:this.defensePlays[0].id);if(this.phase==='ready')this.snap(this.offense);}
   }
  }
  if(this.phase==='ready'||this.isLive||this.isLoose||['kick_flight','kick_loose'].includes(this.phase)){
   const d=this.defenders[this.selected];this.defenseMoving=true;
   if(this.diveLeft>0)this.move(d,d.dx,d.dy,d.speed*2,dt);
   else this.move(d,def.x,def.y,d.speed*(this.phase==='ready'?.75:this.diveCooldown>1.1?.48:1.12),dt);
   this.defenseMoving=false;
  }
  super.tick(dt,['kick_ready','kick_charge','kick_accuracy'].includes(this.phase)?vector(inputs[this.special.kickingTeam]):off);
 }
 snapshot(team){
  const {teams,rng,events,actorTeam,history,...data}=this;
  const state=JSON.parse(JSON.stringify(data));state.carrierIndex=this.players.indexOf(this.carrier);delete state.carrier;
  if(state.pass?.target){state.pass.targetIndex=this.players.indexOf(this.pass.target);delete state.pass.target;}
  if(state.loose?.fumbler){state.loose.fumblerIndex=this.players.indexOf(this.loose.fumbler);delete state.loose.fumbler;}
  state.calls=this.calls.map((v,i)=>i===team?v:!!v);
  if(team!==this.offense)state.play='slants';else state.defense='zone';
  return state;
 }
}
export function vector(v){let x=Number(v?.x),y=Number(v?.y);if(!Number.isFinite(x))x=0;if(!Number.isFinite(y))y=0;const n=Math.max(1,Math.hypot(x,y));return {x:x/n,y:y/n};}
