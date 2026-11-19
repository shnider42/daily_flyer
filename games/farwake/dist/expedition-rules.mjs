/** Persistent planetary interiors. These same rules serve solo and shared captains. */
import { generateSurface, isWalkable } from './surface.mjs';
import { explorationLocation, createSiteState, inspectSiteRecord, claimSiteReward, stepSiteEncounter, resetSiteBoss } from './exploration.mjs';
import { militarySiteLocation } from './military-sites.mjs';
import { fieldSurfaceView } from './floodworks.mjs';
import { WARZONE_GROUND_SITE_ID, isWarzoneGroundBody, catchUpWarzoneGround, normalizeWarzoneGroundStories, warzoneGroundStoryAction, warzoneGroundSurfaceView } from './warzone-ground.mjs';
import { inspectStoryChoice, storySurfaceView } from './expedition-story-rules.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const range=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const near=(surface,person,id,types)=>surface.entities.find(entity=>(!id||entity.id===id)&&types.includes(entity.type)&&!entity.hidden&&range(entity,person)<=46);
const validNumber=value=>typeof value==='number'&&Number.isFinite(value);

export const ExpeditionRules={
  _restoreExploration(){
    this.state.warzoneStories=normalizeWarzoneGroundStories(this.state.warzoneStories);
    const active=this.state.exploration;
    if(!active){if(this.state.mode==='person'&&!this.state.interior&&isWarzoneGroundBody(this.state.locationId)){this.activateWarzoneSurface({preservePosition:false});return;}if(this.state.interior?.kind==='site'){this.state.locationId=this.state.interior.location?.parentId||this.state.lastBodyId;this.state.interior=null;}return;}
    const body=this.system.bodies.find(value=>value.id===active.bodyId),candidate=body&&explorationLocation(body,active.siteId,this.state.seed),context=candidate&&militarySiteLocation(this,body,candidate,{allowPaused:true}),location=context?.ok?context.location:null;
    if(!location||this.state.mode!=='person'){
      this.state.exploration=null;
      if(this.state.interior?.kind==='site'){this.state.interior=null;this.state.locationId=body?.id||this.state.lastBodyId;}
      return;
    }
    const key=context.key,prior=this.state.explorationRecords[key]||active.encounter;
    const relayUpgrade=location.site.quietEarth&&prior?.quietEarth?.version!==1;
    const encounter=createSiteState(location.site,prior);
    if(encounter.field)location.field=encounter.field;
    if(location.site.military)location.evacuated=encounter.objectives?.rescue===true;
    this.state.explorationRecords[key]=encounter;
    const outdoorMap=generateSurface(body,this.state.seed,this.state.flags),back=active.returnPosition;
    const returnPosition=back&&validNumber(back.x)&&validNumber(back.y)&&isWalkable(outdoorMap,back.x,back.y)?{x:back.x,y:back.y}:{...outdoorMap.spawn};
    const outdoor=location.site.outdoor===true;
    this.state.exploration={key,bodyId:body.id,siteId:location.site.id,returnPosition,encounter,...(outdoor?{outdoor:true}:{})};
    this.state.interior=outdoor?null:{kind:'site',location};this.state.locationId=outdoor?body.id:location.id;
    const surface=this._expeditionSurface();if(relayUpgrade||!isWalkable(surface,this.state.person.x,this.state.person.y))Object.assign(this.state.person,surface.spawn);
  },
  activateWarzoneSurface({preservePosition=true}={}){
    const s=this.state;if(s.mode!=='person'||s.interior||!isWarzoneGroundBody(s.locationId))return false;
    if(s.exploration?.outdoor&&s.exploration.bodyId===s.locationId)return s.exploration;
    const body=this.system.bodies.find(value=>value.id===s.locationId),location=body&&explorationLocation(body,WARZONE_GROUND_SITE_ID,s.seed),context=location&&militarySiteLocation(this,body,location);if(!context?.ok)return false;
    const key=context.key,prior=s.explorationRecords[key],encounter=this._sharedWorld&&prior?prior:createSiteState(location.site,prior);
    encounter.visited++;s.explorationRecords[key]=encounter;s.exploration={key,bodyId:body.id,siteId:WARZONE_GROUND_SITE_ID,outdoor:true,returnPosition:null,encounter};
    s.warzoneStories||=normalizeWarzoneGroundStories();const surface=this._expeditionSurface();
    if(!this._sharedWorld){const previous=encounter.warzoneGround.lastSoloAt,now=s.stats.time||0;if(previous!==null)catchUpWarzoneGround(encounter,Math.max(0,now-previous),surface);encounter.warzoneGround.lastSoloAt=now;}
    if(!preservePosition||!isWalkable(surface,s.person.x,s.person.y))Object.assign(s.person,surface.spawn,{moving:false});
    if(encounter.visited===1)this._log('Vey · Ashfall Front',location.site.story,'exploration');
    return s.exploration;
  },
  releaseWarzoneSurface(){
    const active=this.state.exploration;if(!active?.outdoor)return false;
    this.state.explorationRecords[active.key]=active.encounter;if(!this._sharedWorld)active.encounter.warzoneGround.lastSoloAt=this.state.stats.time||0;
    this.state.exploration=null;this._expeditionMap=null;return true;
  },
  _expeditionSurface(){
    const active=this.state.exploration;if(!active||!active.outdoor&&this.state.interior?.kind!=='site')return null;
    const location=active.outdoor?this.system.bodies.find(body=>body.id===active.bodyId):this.state.interior.location,encounter=active.encounter;if(!location)return null;
    if(encounter.field)location.field=encounter.field;
    const key=`${this.state.exploration.key}:${!!active.outdoor}:${!!location.evacuated}:${encounter.field?.revision||0}`;
    if(this._expeditionMap?.key!==key)this._expeditionMap={key,value:generateSurface(location,this.state.seed,this.state.flags)};
    return warzoneGroundSurfaceView(storySurfaceView(fieldSurfaceView(this._expeditionMap.value,encounter),encounter),this.state.warzoneStories);
  },
  enterSite(siteId){
    if(this.state.mode!=='person'||this.state.interior||this.state.person.health<=0)return this._fail('Reach an entrance on foot first.','mode');
    if(this.state.pendingEncounter)return this._fail('Finish your current conversation first.','encounter');
    const body=this.system.bodies.find(value=>value.id===this.state.locationId),candidate=body&&explorationLocation(body,siteId,this.state.seed);
    if(!candidate)return this._fail('There is no entrance to that place here.','target');
    if(candidate.site.outdoor)return this._fail('Ashfall is Vey’s open surface. The battle is already outside your landing shuttle.','outdoor');
    const context=militarySiteLocation(this,body,candidate);if(!context?.ok)return this._fail(context?.reason||'This deployment is not assigned to you.',context?.code||'military-orders');
    const location=context.location;
    const outdoor=generateSurface(body,this.state.seed,this.state.flags),entrance=outdoor.entities.find(entity=>entity.type==='siteEntrance'&&entity.data?.siteId===siteId);
    if(!entrance||range(entrance,this.state.person)>46)return this._fail('Walk to the entrance before going inside.','distance');
    const key=context.key,encounter=this._sharedWorld&&this.state.explorationRecords[key]?this.state.explorationRecords[key]:createSiteState(location.site,this.state.explorationRecords[key]);
    if(encounter.field)location.field=encounter.field;
    if(location.site.military)location.evacuated=encounter.objectives?.rescue===true;
    if(!this._sharedWorld)resetSiteBoss(encounter);
    encounter.visited++;
    this.state.explorationRecords[key]=encounter;
    this.state.exploration={key,bodyId:body.id,siteId,returnPosition:{x:this.state.person.x,y:this.state.person.y},encounter};
    this.state.interior={kind:'site',location};this.state.locationId=location.id;
    const surface=this._expeditionSurface();
    if(encounter.warzoneGround&&!this._sharedWorld){const previous=encounter.warzoneGround.lastSoloAt,now=this.state.stats.time||0;if(previous!==null)catchUpWarzoneGround(encounter,Math.max(0,now-previous),surface);encounter.warzoneGround.lastSoloAt=now;}
    Object.assign(this.state.person,surface.spawn,{moving:false});
    this.state.person.weaponDrawn=true;
    this.recordActivity('explore',{token:`entered:${key}`});
    if(encounter.visited===1)this._log(location.name,location.site.story,'exploration');
    this._event('site-entered',{text:`${location.name} · ${location.site.summary}`,siteId,atmosphere:location.site.atmosphere});
    return this._ok({body:location,text:location.site.story});
  },
  exitSite(){
    const surface=this._expeditionSurface();if(!surface)return this._fail('You are not inside a surface site.','mode');
    if(this.state.exploration?.outdoor)return this._fail('You are already outdoors on Vey. Return to the landing shuttle to board or depart.','outdoor');
    if(this.state.person.health<=0)return this._fail('Your emergency beacon is calling for help.','incapacitated');
    if(!near(surface,this.state.person,null,['siteExit']))return this._fail('Return to the marked entrance to leave.','distance');
    return this._returnFromSite(false);
  },
  _returnFromSite(recovered=false){
    const active=this.state.exploration;if(!active)return this._fail('No surface site to leave.','mode');
    if(recovered)return this.recoverMedicalCasualty(undefined,{sourceKind:'ground-casualty'});
    const body=this.system.bodies.find(value=>value.id===active.bodyId);if(!body)return this._fail('The landing zone is unavailable.','location');
    this.state.explorationRecords[active.key]=active.encounter;
    if(active.encounter.warzoneGround&&!this._sharedWorld)active.encounter.warzoneGround.lastSoloAt=this.state.stats.time||0;
    this.state.interior=null;this.state.locationId=body.id;this.state.mode='person';this.state.exploration=active.outdoor?active:null;
    if(!this._sharedWorld)resetSiteBoss(active.encounter);
    const surface=generateSurface(body,this.state.seed,this.state.flags),back=active.returnPosition;
    Object.assign(this.state.person,isWalkable(surface,back?.x,back?.y)?back:surface.spawn,{weaponDrawn:false,aimTargetId:null,moving:false,down:false});
    this._event('site-exited',{text:`Back outside · ${body.name}`});
    this._siteDownTime=0;this._refreshJobs();
    return this._ok({body,text:`You step back onto ${body.name}.`});
  },
  siteAction(entityId,action='inspect',optionId){
    const active=this.state.exploration,surface=this._expeditionSurface();
    if(!active||!surface||this.state.person.health<=0||this.state.person.down)return this._fail('Enter this place on foot while conscious first.','mode');
    const entity=near(surface,this.state.person,entityId,['siteRecord','siteCache','siteChoice']);
    if(!entity)return this._fail('Move closer to that object.','distance');
    const site=surface.site;
    if(site.warzone||site.crosswindSupport){const reply=warzoneGroundStoryAction(this,entity,action,optionId);if(reply)return reply;}
    if(entity.type==='siteRecord'&&action==='inspect'){
      if(site.military&&entity.data.recordId===site.objectiveId){
        if(active.encounter.monsters.some(enemy=>enemy.health>0))return this._fail(site.training?'Hit all three range targets before checking the qualification terminal.':'Clear the armed threat before completing this objective.','military-threat');
        if(site.watch&&!active.encounter.cleared)return this._fail('The watch is still in progress. Keep the post until the relief section checks in.','military-watch');
        if(site.watch&&(this.state.militaryCareer?.active?.evidence?.watch?.value||0)+1e-6<site.watch.seconds)return this._fail('Complete your own time on watch before signing this field log.','military-participation');
        active.encounter.objectives||={};active.encounter.objectives[site.objectiveId]=true;
        if(site.objectiveId==='rescue')this.state.interior.location.evacuated=true;
        this.observeMilitaryEvent?.('ground-objective',{operationId:site.operationId,siteId:site.id,objectiveId:site.objectiveId,amount:1,token:`${site.operationId}:objective:${site.objectiveId}`});
      }
      const result=inspectSiteRecord(site,entity.data.recordId,active.encounter);if(result.ok){const first=this.recordActivity('explore',{token:`record:${active.key}:${entity.data.recordId}`});if(first.first)this._log(result.title,result.text,'exploration');}return result;
    }
    if(entity.type==='siteChoice'&&action==='inspect'){
      if(site.expedition)return inspectStoryChoice(active.encounter,site,entity.data.choiceId);
      const choice=site.choices.find(item=>item.id===entity.data.choiceId);if(!choice)return this._fail('No decision is available here.','target');
      return this._ok({title:choice.name,text:choice.text,choice:clone(choice),chosen:active.encounter.choices[choice.id]||null});
    }
    if(entity.type==='siteCache'&&action!=='collect'||entity.type==='siteChoice'&&action!=='choose')return this._fail('That action does not apply to this object.','action');
    if(!['siteCache','siteChoice'].includes(entity.type))return this._fail('There is nothing to recover here.','target');
    // Resolve rewards against authored content, then commit atomically after cargo checks.
    const draft=clone(active.encounter),result=claimSiteReward(draft,site,entity.type==='siteCache'?entity.data.cacheId:entity.data.choiceId,entity.type==='siteChoice'?optionId:undefined);
    if(!result.ok)return result;
    if(this.cargoUsed+(result.ore||0)+(result.crystal||0)>this.state.ship.cargoCap)return this._fail('Your hold is full. Make room before recovering these supplies.','cargo');
    Object.assign(active.encounter,draft);
    this.state.credits+=result.credits||0;this.state.cargo.ore+=result.ore||0;this.state.cargo.crystal+=result.crystal||0;
    if(result.heal)this.state.person.health=Math.min(this.state.person.maxHealth||100,this.state.person.health+result.heal);
    if(site.expedition&&result.rep){
      const applied={};
      for(const[faction,value]of Object.entries(result.rep))if(Object.hasOwn(this.state.rep,faction)&&Number.isFinite(value)){
        const before=this.state.rep[faction],after=Math.max(-100,Math.min(100,before+value));this.state.rep[faction]=after;if(after!==before)applied[faction]=after-before;
      }
      result.rep=applied;if(result.effects?.rep)result.effects.rep={...applied};
    }
    if(result.completed!==false)this.recordActivity('explore',{token:`claimed:${active.key}:${entity.id}`});this._refreshJobs();
    this._log(entity.name,result.text,'exploration');this._event('site-reward',{...result});
    return result;
  },
  explorationParticipant(input={}){
    return{protected:this.medicalRecoveryActive(),id:this.playerId,name:this._playerName||this.state.captainName||'Captain',person:this.state.person,input,damageMultiplier:this.characterEffects.sidearmDamage,sidearmCooldownMultiplier:this.characterEffects.sidearmCooldown,...(this.state.exploration?.encounter?.warzoneGround?{factionId:this.warzoneFaction?.()||null,hostileFactions:this.state.warzone?.hostileFactions||[],stories:this.state.warzoneStories,onWarzoneAggression:(factionId,details)=>this.recordWarzoneAggression?.(factionId,details)}:{})};
  },
  stepExploration(dt,input={}){
    const active=this.state.exploration,surface=this._expeditionSurface();if(!active||!surface)return;
    const events=stepSiteEncounter(active.encounter,[this.explorationParticipant(input)],dt,surface);
    this.recordExplorationEvents(events);
    if(active.encounter.warzoneGround&&!this._sharedWorld)active.encounter.warzoneGround.lastSoloAt=this.state.stats.time||0;
    this.recordMilitaryFieldPresence?.(dt);
    if(this.state.person.health<=0){this._siteDownTime=(this._siteDownTime||0)+dt;if(this._siteDownTime>=2.5)this._returnFromSite(true);}else this._siteDownTime=0;
  },
  recordExplorationEvents(events){
    const active=this.state.exploration,site=this.state.interior?.location?.site||(active?.outdoor?{warzone:true}:null);
    for(const event of events){
      const groundFaction=site?.warzone&&event.factionId,hostileFactions=this.warzoneHostilities?.()||[];
      this.events.push(groundFaction?{...event,team:hostileFactions.includes(groundFaction)?'hostile':this.warzoneFaction?.()===groundFaction?'friendly':'neutral'}:event);
      if(event.attackerId===this.playerId){const training=active?.encounter.monsters.find(enemy=>enemy.id===event.targetId)?.trainingTarget,field=event.type==='person-shot'?'personShots':event.type==='person-hit'?'personHits':event.type==='boarder-down'&&!training?'personKills':null;if(field)this.state.stats[field]=(this.state.stats[field]||0)+1;}
      if(site?.military&&active&&event.type==='person-hit'&&event.attackerId===this.playerId&&event.siteId===active.encounter.id&&active.encounter.monsters.some(enemy=>enemy.id===event.targetId))this.observeMilitaryEvent?.('ground-hit',{operationId:site.operationId,siteId:site.id,objectiveId:site.training?'hits':'damage',amount:site.training?1:event.damage,token:site.training?event.targetId:event.id});
    }
    if(site?.military&&active?.encounter.cleared)this.observeMilitaryEvent?.('ground-clear',{operationId:site.operationId,siteId:site.id,objectiveId:'clear',amount:1,token:`${site.operationId}:clear`});
  }
};
