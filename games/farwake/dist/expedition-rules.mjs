/** Persistent planetary interiors. These same rules serve solo and shared captains. */
import { generateSurface, isWalkable } from './surface.mjs';
import { explorationLocation, createSiteState, inspectSiteRecord, claimSiteReward, stepSiteEncounter } from './exploration.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const range=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const near=(surface,person,id,types)=>surface.entities.find(entity=>(!id||entity.id===id)&&types.includes(entity.type)&&!entity.hidden&&range(entity,person)<=46);
const validNumber=value=>typeof value==='number'&&Number.isFinite(value);

export const ExpeditionRules={
  _restoreExploration(){
    const active=this.state.exploration;
    if(!active){if(this.state.interior?.kind==='site'){this.state.locationId=this.state.interior.location?.parentId||this.state.lastBodyId;this.state.interior=null;}return;}
    const body=this.system.bodies.find(value=>value.id===active.bodyId),location=body&&explorationLocation(body,active.siteId,this.state.seed);
    if(!location||this.state.mode!=='person'){
      this.state.exploration=null;
      if(this.state.interior?.kind==='site'){this.state.interior=null;this.state.locationId=body?.id||this.state.lastBodyId;}
      return;
    }
    const key=`${this.state.systemId}:${body.id}:${location.site.id}`;
    const encounter=createSiteState(location.site,this.state.explorationRecords[key]||active.encounter);
    this.state.explorationRecords[key]=encounter;
    const outdoor=generateSurface(body,this.state.seed,this.state.flags),back=active.returnPosition;
    const returnPosition=back&&validNumber(back.x)&&validNumber(back.y)&&isWalkable(outdoor,back.x,back.y)?{x:back.x,y:back.y}:{...outdoor.spawn};
    this.state.exploration={key,bodyId:body.id,siteId:location.site.id,returnPosition,encounter};
    this.state.interior={kind:'site',location};this.state.locationId=location.id;
    const surface=this._expeditionSurface();if(!isWalkable(surface,this.state.person.x,this.state.person.y))Object.assign(this.state.person,surface.spawn);
  },
  _expeditionSurface(){
    if(!this.state.exploration||this.state.interior?.kind!=='site')return null;
    const location=this.state.interior.location,key=this.state.exploration.key;
    if(this._expeditionMap?.key!==key)this._expeditionMap={key,value:generateSurface(location,this.state.seed,this.state.flags)};
    return this._expeditionMap.value;
  },
  enterSite(siteId){
    if(this.state.mode!=='person'||this.state.interior||this.state.person.health<=0)return this._fail('Reach an entrance on foot first.','mode');
    if(this.state.pendingEncounter)return this._fail('Finish your current conversation first.','encounter');
    const body=this.system.bodies.find(value=>value.id===this.state.locationId),location=body&&explorationLocation(body,siteId,this.state.seed);
    if(!location)return this._fail('There is no entrance to that place here.','target');
    const outdoor=generateSurface(body,this.state.seed,this.state.flags),entrance=outdoor.entities.find(entity=>entity.type==='siteEntrance'&&entity.data?.siteId===siteId);
    if(!entrance||range(entrance,this.state.person)>46)return this._fail('Walk to the entrance before going inside.','distance');
    const key=`${this.state.systemId}:${body.id}:${siteId}`,encounter=this._sharedWorld&&this.state.explorationRecords[key]?this.state.explorationRecords[key]:createSiteState(location.site,this.state.explorationRecords[key]);
    encounter.visited++;
    this.state.explorationRecords[key]=encounter;
    this.state.exploration={key,bodyId:body.id,siteId,returnPosition:{x:this.state.person.x,y:this.state.person.y},encounter};
    this.state.interior={kind:'site',location};this.state.locationId=location.id;
    const surface=this._expeditionSurface();Object.assign(this.state.person,surface.spawn,{weaponDrawn:encounter.monsters.some(monster=>monster.health>0),moving:false});
    this.recordActivity('explore',{token:`entered:${key}`});
    if(encounter.visited===1)this._log(location.name,location.site.story,'exploration');
    this._event('site-entered',{text:`${location.name} · ${location.site.summary}`,siteId,atmosphere:location.site.atmosphere});
    return this._ok({body:location,text:location.site.story});
  },
  exitSite(){
    const surface=this._expeditionSurface();if(!surface)return this._fail('You are not inside a surface site.','mode');
    if(this.state.person.health<=0)return this._fail('Your emergency beacon is calling for help.','incapacitated');
    if(!near(surface,this.state.person,null,['siteExit']))return this._fail('Return to the marked entrance to leave.','distance');
    return this._returnFromSite(false);
  },
  _returnFromSite(recovered=false){
    const active=this.state.exploration;if(!active)return this._fail('No surface site to leave.','mode');
    const body=this.system.bodies.find(value=>value.id===active.bodyId);if(!body)return this._fail('The landing zone is unavailable.','location');
    this.state.explorationRecords[active.key]=active.encounter;
    this.state.interior=null;this.state.locationId=body.id;this.state.mode='person';this.state.exploration=null;
    const surface=generateSurface(body,this.state.seed,this.state.flags),back=recovered?surface.spawn:active.returnPosition;
    Object.assign(this.state.person,isWalkable(surface,back?.x,back?.y)?back:surface.spawn,{weaponDrawn:false,aimTargetId:null,moving:false,down:false});
    if(recovered){const cost=Math.floor(this.state.credits*.1);this.state.credits-=cost;this.state.person.health=Math.max(1,Math.round((this.state.person.maxHealth||100)*.35));this._event('rescue',{text:`A field team returned you to the landing zone. Recovery cost ${cost} cr. Your ship and discoveries remain where you left them.`});}
    else this._event('site-exited',{text:`Back outside · ${body.name}`});
    this._siteDownTime=0;this._refreshJobs();
    return this._ok({body,text:recovered?'Recovered at the landing zone.':`You step back onto ${body.name}.`});
  },
  siteAction(entityId,action='inspect',optionId){
    const active=this.state.exploration,surface=this._expeditionSurface();
    if(!active||!surface||this.state.person.health<=0)return this._fail('Enter this place on foot first.','mode');
    const entity=near(surface,this.state.person,entityId,['siteRecord','siteCache','siteChoice']);
    if(!entity)return this._fail('Move closer to that object.','distance');
    const site=this.state.interior.location.site;
    if(entity.type==='siteRecord'&&action==='inspect'){
      const result=inspectSiteRecord(site,entity.data.recordId);if(result.ok){const first=this.recordActivity('explore',{token:`record:${active.key}:${entity.data.recordId}`});if(first.first)this._log(result.title,result.text,'exploration');}return result;
    }
    if(entity.type==='siteChoice'&&action==='inspect'){
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
    this.recordActivity('explore',{token:`claimed:${active.key}:${entity.id}`});this._refreshJobs();
    this._log(entity.name,result.text,'exploration');this._event('site-reward',{...result});
    return result;
  },
  explorationParticipant(input={}){
    return{id:this.playerId,name:this._playerName||this.state.captainName||'Captain',person:this.state.person,input,damageMultiplier:this.characterEffects.sidearmDamage,sidearmCooldownMultiplier:this.characterEffects.sidearmCooldown};
  },
  stepExploration(dt,input={}){
    const active=this.state.exploration,surface=this._expeditionSurface();if(!active||!surface)return;
    const events=stepSiteEncounter(active.encounter,[this.explorationParticipant(input)],dt,surface);
    this.recordExplorationEvents(events);
    if(this.state.person.health<=0){this._siteDownTime=(this._siteDownTime||0)+dt;if(this._siteDownTime>=2.5)this._returnFromSite(true);}else this._siteDownTime=0;
  },
  recordExplorationEvents(events){
    for(const event of events){
      this.events.push(event);
      if(event.attackerId===this.playerId){const field=event.type==='person-shot'?'personShots':event.type==='person-hit'?'personHits':event.type==='boarder-down'?'personKills':null;if(field)this.state.stats[field]=(this.state.stats[field]||0)+1;}
    }
  }
};
