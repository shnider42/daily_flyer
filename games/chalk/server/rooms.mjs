// Small invitation rooms using Farwake's single-authority, authenticated-session model.
import {randomBytes} from 'node:crypto';
import {createGame,stepCoop,setHumanPlayers,issueCoopOrder,placePing,requestFieldSupport,getFieldSupportStatus,requestArmorOrder,chooseStoryOption,campaignOutcome,getNextCampaignMission,MISSIONS,DIFFICULTIES} from '../public/sim.mjs';
import {publicVehicleView} from '../public/armored-vehicles.mjs';
import {squadCanSeePoint} from '../public/visibility.mjs';
import {SnapshotDeltaEncoder} from '../public/snapshot-delta.mjs';
import {normalizeSquadRoles,validSquadRoles,isSquadCommander} from '../public/squad-roles.mjs';
import {PROTOCOL,MAX_HUMANS,SIMULATION_HZ,SNAPSHOT_HZ,INPUT_TIMEOUT_MS,DISCONNECT_GRACE_MS,HOST_PROMOTION_MS,
  normalizeRoomCode,validRoomCode,cleanInput,EMPTY_INPUT,THROW_ACTIONS,newRoomCode,newPlayerId,newSecret,secretHash,verifySecret,cleanName} from './protocol.mjs';

const emptyActions=()=>({reload:false,smoke:false,grenade:false,frag:false,flashbang:false,throwTargets:{}});

const actorView = actor => {
  const {path,pathTimer,pathTarget,target,senseTimer,sensedAt,perceivedTargetId,lastKnown,lastSeenAt,flankGoal,flankSide,nextFlankAt,flankExpiresAt,flankHoldUntil,flankReached,flankPlannedAt,settleTime,navStalled,lastDanger,nextShelterPlanAt,shelterRevision,shelterAssigned,wasAwaitingAid,shelterBlockedFor,lastThreatSoundId,coverPoint,coverShelter,nextCoverPlanAt,coverRevision,coverAnchor,formationGoal,formationOrderKey,nextFormationAt,fieldGoal,fieldHome,fieldPost,fieldWaiting,fieldCohesion,fieldSlot,fieldRetreat,fieldContactPoint,fieldAidTargetId,fieldAidAt,fieldBandageProgress,fieldCovering,fieldRecovered,home,...view}=actor;
  return view;
};
const stateFields=['missionIndex','mission','difficulty','seed','time','status','endReason','stageIndex','stageCount',
  'progress','radio','stats','order','leaderOrder','phaseTime','objective','convoyIndex','convoyClear','convoyCleared',
  'waitUntil','helpRequested','helpTargetId','aidTimer','coop','lastShot','interactionPrompt','interactionPrompts','humanIds','story','campaign','destruction','operation','pings','squadRoles','convoyVehicleIds'];
const statusOf = room => room.status==='lobby'?'lobby':room.game.status;
const validMission = value => Number.isInteger(value)&&value>=0&&value<MISSIONS.length;
const validDifficulty = value => Object.hasOwn(DIFFICULTIES,value);
const aliases={swapRoles:'swap_roles',returnLobby:'return_lobby',selectSoldier:'select_soldier'};

export class CoopRooms {
  constructor({now=()=>Date.now(),maxRooms=16,idleMs=15*60*1000,emptyMs=60000,graceMs=DISCONNECT_GRACE_MS,
    hostPromotionMs=HOST_PROMOTION_MS,snapshotHz=SNAPSHOT_HZ,seed=()=>randomBytes(4).readUInt32LE()}={}){
    this.now=now;this.maxRooms=Math.max(1,Math.min(64,Number(maxRooms)||16));this.idleMs=idleMs;this.emptyMs=emptyMs;
    this.graceMs=graceMs;this.hostPromotionMs=hostPromotionMs;this.snapshotEvery=Math.max(1,Math.round(SIMULATION_HZ/snapshotHz));
    this.seed=seed;this.rooms=new Map();this.shuttingDown=false;
    this.metrics={snapshots:0,bytes:0,skipped:0,steps:0};
  }
  reject(peer,reason,code='unavailable',fatal=false){peer.send({type:'error',reason,code});if(fatal)peer.close?.(4001,reason.slice(0,100));return false;}
  result(peer,message,ok,reason=''){
    const packet={type:'result',id:message.id||null,ok,...(reason?{reason}:{})};
    if(message.id)peer.send(packet);else if(!ok)peer.send({type:'error',reason,code:'command'});
    return packet;
  }
  _newPlayer(slot,name){const token=newSecret();return {player:{id:newPlayerId(),name:cleanName(name,slot===0?'Squad leader':'Squad mate'),slot,
    tokenHash:secretHash(token),peer:null,seq:0,input:{...EMPTY_INPUT},actions:emptyActions(),lastInput:this.now(),disconnectedAt:null,commands:new Map()},token};}
  _newGame(room){
    room.seed=this.seed();room.epoch++;room.tick=0;
    room.game=createGame({mission:room.mission,difficulty:room.difficulty,role:'leader',seed:room.seed,campaign:room.campaign,squadRoles:room.squadRoles});
    for(const p of room.players){p.input={...EMPTY_INPUT};p.actions=emptyActions();p.lastInput=this.now();}
    this._syncHumans(room);
  }
  _syncHumans(room){setHumanPlayers(room.game,room.players.filter(p=>p.peer).map(p=>room.game.squad[p.slot].id));}
  _refreshAssignments(room){
    // The physical squad stays intact. A fresh epoch discards controls that were
    // sent for the previous ownership layout, including queued grenade releases.
    room.epoch++;
    for(const p of room.players){p.input={...EMPTY_INPUT};p.actions=emptyActions();p.lastInput=this.now();}
    this._syncHumans(room);
  }
  _publicRoom(room){
    return {code:room.code,hostId:room.hostId,leaderId:room.players.find(p=>isSquadCommander(room.game.squad[p.slot]))?.id||null,status:statusOf(room),
      mission:room.mission,difficulty:room.difficulty,squadRoles:[...room.squadRoles],epoch:room.epoch,reason:room.reason,capacity:MAX_HUMANS,
      players:room.players.map(p=>{const actor=room.game.squad[p.slot];return{id:p.id,name:p.name,actorId:actor.id,slot:p.slot,
        role:isSquadCommander(actor)?'leader':'member',soldierName:actor.name,specialty:actor.role,connected:!!p.peer,ready:!!p.peer};}),
      soldiers:room.game.squad.map((actor,slot)=>{const owner=room.players.find(p=>p.slot===slot);return{
        id:actor.id,slot,slotId:actor.slotId,name:actor.name,role:actor.role,commander:isSquadCommander(actor),alive:actor.alive,downed:actor.downed,
        claimedBy:owner?.id||null,connected:!!owner?.peer};})};
  }
  _attach(room,p,peer,token){
    if(p.peer&&p.peer!==peer){const old=p.peer;old.roomCode=null;old.playerId=null;
      old.send({type:'replaced',reason:'This player connected in another tab.'});old.close?.(4009,'Session replaced');}
    p.peer=peer;p.disconnectedAt=null;p.seq=0;p.input={...EMPTY_INPUT};p.actions=emptyActions();p.lastInput=this.now();p.commands.clear();
    peer.roomCode=room.code;peer.playerId=p.id;peer.deltaEncoder=new SnapshotDeltaEncoder();peer.lastFullAt=0;
    room.lastActivity=this.now();room.emptySince=null;this._syncHumans(room);
    peer.send({type:'joined',session:{code:room.code,playerId:p.id,token},room:this._publicRoom(room)});
    this.snapshot(room,{reset:true});
  }
  create(peer,message){
    if(this.rooms.size>=this.maxRooms)return this.reject(peer,'All squad rooms are busy. Try again shortly.','capacity',true);
    const mission=message.mission??0,difficulty=message.difficulty??'standard';
    if(!validMission(mission)||!validDifficulty(difficulty))return this.reject(peer,'Choose an available mission and difficulty.','configuration',true);
    if(message.squadRoles!==undefined&&!validSquadRoles(message.squadRoles))return this.reject(peer,'Choose an available loadout for each of the four soldiers.','configuration',true);
    let code;do{code=newRoomCode();}while(this.rooms.has(code));
    const {player,token}=this._newPlayer(message.role==='member'?1:0,message.name);
    const now=this.now(),room={code,hostId:player.id,players:[player],mission,difficulty,squadRoles:normalizeSquadRoles(message.squadRoles),epoch:0,seed:0,game:null,tick:0,transportTick:0,
      status:'lobby',campaign:null,reason:'Share the squad code to invite a friend.',createdAt:now,lastActivity:now,emptySince:null};
    this._newGame(room);this.rooms.set(code,room);this._attach(room,player,peer,token);return true;
  }
  join(peer,message,resume=false){
    const code=normalizeRoomCode(message.code),room=validRoomCode(code)?this.rooms.get(code):null;
    if(!room)return this.reject(peer,'That squad room ended or does not exist. Ask for a fresh code.','room-not-found',true);
    if(resume){
      const p=room.players.find(p=>p.id===message.playerId);
      if(!p||!verifySecret(message.token,p.tokenHash)||p.disconnectedAt!==null&&this.now()-p.disconnectedAt>this.graceMs)
        return this.reject(peer,'The reconnect pass expired or is invalid. Join again with the squad code.','invalid-session',true);
      this._attach(room,p,peer,message.token);return true;
    }
    if(room.players.length>=MAX_HUMANS)return this.reject(peer,'This room already has two human players.','room-full',true);
    const slot=room.game.squad.findIndex((actor,index)=>!room.players.some(p=>p.slot===index)&&(statusOf(room)!=='playing'||actor.alive&&!actor.downed));
    if(slot<0)return this.reject(peer,'No standing soldier is available to join. Ask your friend to return to the squad briefing.','no-soldier',true);
    const {player,token}=this._newPlayer(slot,message.name);
    room.players.push(player);room.reason=room.status==='lobby'?'Squad assembled. The host can deploy.':'Your squad mate joined the mission.';
    this._attach(room,player,peer,token);return true;
  }
  handle(peer,message){
    if(!message||typeof message!=='object'||Array.isArray(message)||typeof message.type!=='string')return;
    const type=aliases[message.type]||message.type;
    if(type==='ping'){peer.send({type:'pong',sentAt:Number.isFinite(message.sentAt)?message.sentAt:0,serverTime:this.now()});return;}
    if(this.shuttingDown)return this.reject(peer,'The squad service is restarting. Rejoin shortly.','restarting',true);
    if(['create','join','resume'].includes(type)){
      if(peer.roomCode)return this.reject(peer,'Leave your current squad before joining another.');
      if(message.protocol!==PROTOCOL)return this.reject(peer,'Refresh both game tabs to use the same version.','protocol',true);
      return type==='create'?this.create(peer,message):this.join(peer,message,type==='resume');
    }
    const room=this.rooms.get(peer.roomCode),p=room?.players.find(p=>p.id===peer.playerId);
    if(!room||p?.peer!==peer)return;
    room.lastActivity=this.now();
    if(type==='resync'){this.snapshot(room,{only:peer,reset:true});return;}
    if(type==='leave'){this.leave(peer);return;}
    if(type==='input'){
      if(!Number.isSafeInteger(message.seq)||message.seq<=p.seq||message.epoch!==room.epoch)return;
      const input=cleanInput(message.input);p.seq=message.seq;p.lastInput=this.now();
      if(statusOf(room)!=='playing'||message.cancelActions===true){p.input={...EMPTY_INPUT};p.actions=emptyActions();return;}
      p.actions.reload ||= input.reload;
      for(const action of THROW_ACTIONS){
        if(!input[action]||p.actions[action])continue;
        // Later ordinary aim packets must not redirect a pending release.
        const point=input.throwTargets[action]||{x:input.throwAimX??input.aimX,y:input.throwAimY??input.aimY};
        if(Number.isFinite(point.x)&&Number.isFinite(point.y))p.actions.throwTargets[action]={...point};
        p.actions[action]=true;
      }
      p.input={...input,reload:false,smoke:false,grenade:false,frag:false,flashbang:false};return;
    }
    if(message.id!==undefined&&(typeof message.id!=='string'||message.id.length<1||message.id.length>80))return this.reject(peer,'Invalid command identifier.','protocol');
    if(message.id&&p.commands.has(message.id)){peer.send(p.commands.get(message.id));return;}
    const finish=(ok,reason='')=>{const result=this.result(peer,message,ok,reason);if(message.id){p.commands.set(message.id,result);while(p.commands.size>64)p.commands.delete(p.commands.keys().next().value);}return ok;};
    if(message.epoch!==room.epoch)return finish(false,'The squad changed. Wait for the current mission state.');
    const host=p.id===room.hostId;
    if(['start','restart','configure','swap_roles','return_lobby','continue_operation'].includes(type)&&!host)return finish(false,'Only the room host can change this setting.');
    if(type==='configure'){
      if(room.status!=='lobby')return finish(false,'Return to the lobby before changing the mission.');
      const mission=message.mission??room.mission,difficulty=message.difficulty??room.difficulty,squadRoles=message.squadRoles===undefined?room.squadRoles:message.squadRoles;
      if(!validMission(mission)||!validDifficulty(difficulty))return finish(false,'Choose an available mission and difficulty.');
      if(!validSquadRoles(squadRoles))return finish(false,'Choose an available loadout for each of the four soldiers.');
      room.mission=mission;room.difficulty=difficulty;room.squadRoles=[...squadRoles];room.campaign=null;this._newGame(room);room.reason='Squad briefing updated.';
    }else if(type==='start'||type==='restart'){
      if(type==='start'&&room.status!=='lobby')return finish(false,'The mission has already started.');
      this._newGame(room);room.status='playing';room.reason='Stay together. Bring the squad home.';
    }else if(type==='continue_operation'){
      if(statusOf(room)!=='won'||getNextCampaignMission(room.mission)===null)return finish(false,'Finish this chapter before continuing to an available next chapter.');
      room.campaign=campaignOutcome(room.game);room.mission=getNextCampaignMission(room.mission);this._newGame(room);room.status='playing';
      room.reason='The operation continues. Earlier supply, fatigue and civilian outcomes carry into this chapter.';
    }else if(type==='return_lobby'){
      room.status='lobby';room.campaign=null;this._newGame(room);room.reason='Choose a fresh mission together.';
    }else if(type==='select_soldier'){
      if(room.status!=='lobby'&&statusOf(room)!=='playing')return finish(false,'Return to the squad briefing before choosing another soldier.');
      if(!Number.isSafeInteger(message.actorId))return finish(false,'Choose one of the four squad soldiers.');
      const slot=room.game.squad.findIndex(actor=>actor.id===message.actorId),actor=room.game.squad[slot];
      if(!actor)return finish(false,'That soldier is not in this squad.');
      const owner=room.players.find(member=>member.slot===slot&&member!==p);
      if(owner)return finish(false,owner.peer?`${actor.name} is controlled by ${owner.name}. Choose an available soldier.`:`${actor.name} is reserved while ${owner.name} reconnects.`);
      if(statusOf(room)==='playing'&&(!actor.alive||actor.downed))return finish(false,actor.alive?`${actor.name} is down. Choose a standing soldier.`:`${actor.name} has been lost. Choose a standing soldier.`);
      if(p.slot===slot)return finish(true);
      p.slot=slot;this._refreshAssignments(room);room.reason=`${p.name} now controls ${actor.name}. AI controls the soldier they left.`;
    }else if(type==='swap_roles'){
      // Preserve the older host swap control after either person chooses Ames
      // or Webb: exchange actual assignments, never apply two-slot arithmetic.
      const slots=room.players.length===2?[room.players[1].slot,room.players[0].slot]:[room.players[0].slot===0?1:0];
      if(statusOf(room)==='playing'&&slots.some(slot=>!room.game.squad[slot].alive||room.game.squad[slot].downed))return finish(false,'Both destination soldiers must be standing to exchange assignments.');
      room.players.forEach((member,index)=>member.slot=slots[index]);
      this._refreshAssignments(room);room.reason='Your assigned soldiers have been exchanged.';
    }else if(type==='story_choice'){
      if(statusOf(room)!=='playing')return finish(false,'Deploy before replying to a radio decision.');
      if(typeof message.decisionId!=='string'||message.decisionId.length>80||typeof message.optionId!=='string'||message.optionId.length>40)return finish(false,'Invalid radio choice.');
      if(!chooseStoryOption(room.game,message.decisionId,message.optionId,room.game.squad[p.slot].id))return finish(false,'That radio choice is unavailable to your soldier or has already been resolved.');
    }else if(type==='tactical_ping'){
      if(statusOf(room)!=='playing')return finish(false,'Deploy before marking a location.');
      const point=message.point;
      if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>room.game.world.width||point.y<0||point.y>room.game.world.height)return finish(false,'Choose a point inside the district.');
      const owner=room.game.squad[p.slot];
      if(!owner.alive||owner.downed)return finish(false,'Your soldier must be able to act to place a ping.');
      if(!placePing(room.game,point,owner.id))return finish(false,'Wait a moment before placing another ping.');
    }else if(type==='field_support'){
      if(statusOf(room)!=='playing')return finish(false,'Deploy before requesting support.');
      const point=message.point;
      if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>room.game.world.width||point.y<0||point.y>room.game.world.height)return finish(false,'Choose a point inside the district.');
      const owner=room.game.squad[p.slot];
      if(!owner.alive||owner.downed)return finish(false,'Your soldier must be able to act to request support.');
      if(!requestFieldSupport(room.game,point,owner.id))return finish(false,getFieldSupportStatus(room.game).text||'The relief team cannot accept that request.');
    }else if(type==='armor_order'){
      if(statusOf(room)!=='playing')return finish(false,'Deploy before giving armor orders.');
      if(!requestArmorOrder(room.game,message.order,room.game.squad[p.slot].id))return finish(false,'Only the acting squad commander can order available friendly armor.');
    }else if(type==='order'){
      if(statusOf(room)!=='playing')return finish(false,'Deploy before giving squad orders.');
      const order=message.order;
      if(!['move','follow','hold','assist','ready','wait','help'].includes(order))return finish(false,'Unknown squad order.');
      const point=message.point;
      if(order==='move'&&(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>room.game.world.width||point.y<0||point.y>room.game.world.height))return finish(false,'Choose a destination inside the district.');
      if(!issueCoopOrder(room.game,room.game.squad[p.slot].id,order,point))return finish(false,'That order is unavailable to your soldier.');
    }else return finish(false,'Unknown squad command.');
    finish(true);this.snapshot(room,{reset:!['tactical_ping','field_support'].includes(type)});return true;
  }
  snapshotFor(room,p){
    const state={};for(const key of stateFields)if(room.game[key]!==undefined)state[key]=room.game[key];
    for(const key of ['squad','civilians','survivors'])state[key]=room.game[key].map(actorView);
    state.enemies=room.game.enemies.filter(a=>a.visible).map(actorView);
    // Independent friendly squads do not lend their eyes to the player. Their
    // unseen positions and internal assignments remain on the authority.
    state.allies=(room.game.allies||[]).filter(a=>a.visible).map(actorView);
    state.support=getFieldSupportStatus(room.game);
    state.vehicles=room.game.vehicles.filter(v=>v.team!=='enemy'||squadCanSeePoint(room.game,v)).map(v=>({...publicVehicleView(v),visible:true}));
    for(const key of ['bullets','grenades','effects','soundEvents','smokes','bodies','bloodstains'])state[key]=room.game[key];
    const actor=room.game.squad[p.slot],actorId=actor.id;state.playerId=actorId;state.role=isSquadCommander(actor)?'leader':'member';
    return {type:'snapshot',tick:room.tick,serverTime:this.now(),selfId:p.id,actorId,ack:p.seq,
      init:{seed:room.seed,mission:room.mission,difficulty:room.difficulty,epoch:room.epoch,campaign:room.game.campaign,squadRoles:[...room.squadRoles]},
      room:this._publicRoom(room),state,worldProps:room.game.world.props};
  }
  snapshot(room,{only=null,reset=false}={}){
    for(const p of room.players){const peer=p.peer;if(!peer||only&&peer!==only)continue;
      // Reuse Farwake's rule: skipped sends do not establish a delta baseline.
      if(peer.bufferedAmount>0){this.metrics.skipped++;continue;}
      peer.deltaEncoder ||= new SnapshotDeltaEncoder();
      const prepared=peer.deltaEncoder.prepare(this.snapshotFor(room,p),{reset:reset||this.now()-(peer.lastFullAt||0)>=5000});
      if(peer.sendRaw(prepared.data)!==false){peer.deltaEncoder.commit(prepared);if(prepared.full)peer.lastFullAt=this.now();
        this.metrics.snapshots++;this.metrics.bytes+=Buffer.byteLength(prepared.data);}
    }
  }
  _promote(room,force=false){
    const host=room.players.find(p=>p.id===room.hostId);
    if(host?.peer)return false;
    if(!force&&host&&host.disconnectedAt!==null&&this.now()-host.disconnectedAt<this.hostPromotionMs)return false;
    const next=room.players.find(p=>p.peer);if(!next||next.id===room.hostId)return false;
    room.hostId=next.id;room.reason=`${next.name} is now the room host.`;return true;
  }
  disconnect(peer){
    const room=this.rooms.get(peer.roomCode),p=room?.players.find(p=>p.id===peer.playerId);
    if(!room||p?.peer!==peer)return;
    p.peer=null;p.disconnectedAt=this.now();p.input={...EMPTY_INPUT};p.actions=emptyActions();
    peer.roomCode=null;peer.playerId=null;this._syncHumans(room);
    room.reason=`${p.name} disconnected. AI has their soldier while they reconnect.`;
    if(!room.players.some(p=>p.peer))room.emptySince=this.now();
    this.snapshot(room,{reset:true});
  }
  leave(peer){
    const room=this.rooms.get(peer.roomCode),p=room?.players.find(p=>p.id===peer.playerId);if(!room||p?.peer!==peer)return;
    peer.send({type:'left',reason:'You left the squad.'});peer.roomCode=null;peer.playerId=null;p.peer=null;
    room.players=room.players.filter(member=>member!==p);this._syncHumans(room);this._promote(room,true);
    peer.close?.(1000,'Left squad');
    if(!room.players.some(p=>p.peer)){this.end(room,'The squad room is empty.');return;}
    room.reason='Your squad mate left. AI has taken their place.';this.snapshot(room,{reset:true});
  }
  step(dt=1/SIMULATION_HZ){
    const now=this.now();
    for(const room of [...this.rooms.values()]){
      if(now-room.lastActivity>this.idleMs||room.emptySince!==null&&now-room.emptySince>this.emptyMs){this.end(room,'This squad room expired. Create a fresh room.');continue;}
      let changed=this._promote(room);
      const retained=room.players.filter(p=>p.peer||p.disconnectedAt===null||now-p.disconnectedAt<=this.graceMs);
      if(retained.length!==room.players.length){room.players=retained;changed=true;this._syncHumans(room);this._promote(room,true);}
      room.transportTick++;
      if(statusOf(room)==='playing'&&room.players.some(p=>p.peer)){
        const inputs={};for(const p of room.players){if(!p.peer)continue;
          const fresh=now-p.lastInput<=INPUT_TIMEOUT_MS;
          inputs[room.game.squad[p.slot].id]=fresh?{...p.input,...p.actions}:{...EMPTY_INPUT};
          p.actions=emptyActions();}
        stepCoop(room.game,inputs,dt);room.tick++;this.metrics.steps++;
        if(room.game.status!=='playing'){room.reason=room.game.endReason||'Mission complete.';changed=true;}
      }
      if(changed||room.transportTick%this.snapshotEvery===0)this.snapshot(room,{reset:changed});
    }
  }
  end(room,reason,code=4004){
    for(const p of room.players){if(!p.peer)continue;const peer=p.peer;peer.send({type:'closed',reason});peer.roomCode=null;peer.playerId=null;peer.close?.(code,reason.slice(0,100));p.peer=null;}
    this.rooms.delete(room.code);
  }
  shutdown(){this.shuttingDown=true;for(const room of [...this.rooms.values()])this.end(room,'The squad service restarted. Create a fresh room.',1012);}
}
