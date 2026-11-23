import { createGame, rebuildNavigationGrid } from './sim.mjs';
import { syncBuildingDamage } from './destruction.mjs';
import { getSolidWalls } from './building-geometry.mjs';
import { movementSpeed } from './squad-roles.mjs';
import { PROTOCOL, INPUT_HZ, THROW_ACTIONS, cleanInput, EMPTY_INPUT, normalizeRoomCode, validRoomCode } from './coop-protocol.mjs';
import { SnapshotDeltaDecoder } from './snapshot-delta.mjs';

// Adapted from Farwake's network.mjs transport: latest-input coalescing,
// backpressure, authenticated session recovery, separate delta baselines,
// bounded prediction, and delayed remote interpolation. CHALK's movement and
// four-person room projection are deliberately independent of Farwake's ships.
export const COOP_SESSION_KEY = 'dfe-chalk-coop-v1';
const MAX_PREDICTION_MS = 220;
const MAX_HISTORY_MS = 650;
const EDGE_LIFETIME_MS = 350;
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const defaultStorage = () => { try { return globalThis.sessionStorage; } catch { return undefined; } };
const actorCollections = ['squad', 'enemies', 'civilians', 'survivors', 'vehicles'];
const staticKeys = new Set(['world', 'grid', 'stages', '__proto__', 'constructor', 'prototype']);
const angleBetween = (from, to, fraction) => from + Math.atan2(Math.sin(to-from), Math.cos(to-from)) * fraction;

export function socketURL(value = globalThis.location?.origin) {
  const url = new URL(value || 'http://localhost:3000', globalThis.location?.href || 'http://localhost:3000');
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('The squad server address is invalid.');
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  if (url.pathname === '/' || !url.pathname) url.pathname = '/ws';
  url.hash = ''; url.search = '';
  return url.href;
}

export function readCoopSession(storage = defaultStorage()) {
  try {
    const value = JSON.parse(storage?.getItem(COOP_SESSION_KEY) || 'null');
    if (!value || !validRoomCode(value.code) || typeof value.playerId !== 'string' || !value.playerId || value.playerId.length > 120 ||
      typeof value.token !== 'string' || value.token.length < 16 || value.token.length > 512) return null;
    return { code: normalizeRoomCode(value.code), playerId: value.playerId, token: value.token };
  } catch { return null; }
}

/** Cosmetic movement only. Damage, ammunition, rescue, and mission work stay authoritative. */
export function predictMovement(actor, input, seconds, world) {
  const result = { ...actor };
  if (!actor || actor.alive === false || actor.downed || !world || !Number.isFinite(seconds) || seconds <= 0) return result;
  const controls = cleanInput(input), duration = Math.min(seconds, MAX_PREDICTION_MS / 1000);
  const radius = finite(actor.radius, 13), width = finite(world.width, 2400), height = finite(world.height, 1900);
  const free = (x, y) => x >= radius && y >= radius && x <= width-radius && y <= height-radius &&
    !getSolidWalls(world).some(b => x >= b.x-radius && x <= b.x+b.w+radius && y >= b.y-radius && y <= b.y+b.h+radius);
  result.observing = actor.role === 'grenadier' && controls.observe;
  const speed = movementSpeed(result, controls.sprint);
  for (let remaining = duration; remaining > 0;) {
    const dt = Math.min(1/60, remaining); remaining -= dt;
    const x = clamp(result.x + controls.moveX * speed * dt, radius, width-radius);
    const y = clamp(result.y + controls.moveY * speed * dt, radius, height-radius);
    if (free(x, result.y)) result.x = x;
    if (free(result.x, y)) result.y = y;
  }
  if (controls.aimX !== null && controls.aimY !== null && Math.hypot(controls.aimX-result.x, controls.aimY-result.y) > 2) {
    result.angle = Math.atan2(controls.aimY-result.y, controls.aimX-result.x);
  } else if (Math.hypot(controls.moveX, controls.moveY) > .05 && !controls.fire) result.angle = Math.atan2(controls.moveY, controls.moveX);
  result.moving = Math.hypot(controls.moveX, controls.moveY) > .05;
  return result;
}

/** Preserve map identity: the renderer bakes it once, while dynamic flags update in place. */
export class CoopStateHydrator {
  constructor() { this.reset(); }
  reset() { this.game = null; this.epoch = null; this.actorId = null; }
  apply(packet, playerId) {
    if (!packet?.init || !packet.state || !packet.room) return null;
    const epoch = `${packet.room.code}:${packet.init.epoch}`;
    const changedEpoch = !this.game || epoch !== this.epoch;
    if (changedEpoch) {
      this.game = createGame({ seed: packet.init.seed, mission: packet.init.mission, difficulty: packet.init.difficulty, campaign: packet.init.campaign });
      this.epoch = epoch;
    }
    const game = this.game;
    for (const [key, value] of Object.entries(packet.state)) if (!staticKeys.has(key)) game[key] = clone(value);
    const changedGeometry=syncBuildingDamage(game.world,game.destruction).changed;
    if(changedGeometry)rebuildNavigationGrid(game);
    if (Array.isArray(packet.worldProps)) {
      // Keep both world and props arrays stable; cached static city art stays valid.
      for (let i=0; i<packet.worldProps.length; i++) {
        const source = packet.worldProps[i];
        if (!source || typeof source !== 'object') continue;
        const target = game.world.props[i] || (game.world.props[i] = {});
        for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key];
        for (const [key,value] of Object.entries(source)) if (!staticKeys.has(key)) target[key] = clone(value);
      }
      game.world.props.length = packet.worldProps.length;
    }
    const local = packet.room.players?.find(peer => peer.id === playerId) || packet.room.players?.find(peer => peer.id === packet.selfId);
    const actorId = local?.actorId ?? packet.actorId;
    const role = local?.role || (game.squad.find(actor => actor.id === actorId)?.role === 'leader' ? 'leader' : 'member');
    const changedActor = this.actorId !== actorId;
    game.playerId = actorId; game.role = role; game.coop = true;
    game.multiplayer = { code: packet.room.code, selfId: playerId || packet.selfId, hostId: packet.room.hostId, players: clone(packet.room.players || []) };
    this.actorId = actorId;
    return { game, changedEpoch, changedActor, changedGeometry };
  }
}

/** Farwake-style bounded render delay; a late connection never slows another peer. */
export class SquadInterpolator {
  constructor({ delayMs = 80 } = {}) { this.baseDelayMs = delayMs; this.reset(); }
  reset() { this.frames = []; this.delayMs = this.baseDelayMs; this.lastArrival = null; this.jitter = 0; }
  push(state, at, arrival = at) {
    if (!Number.isFinite(at)) return;
    const latest = this.frames.at(-1);
    if (latest && at < latest.at) return;
    const groups = Object.fromEntries(actorCollections.map(key => [key, clone(state[key] || [])]));
    const frame = { at, groups };
    if (latest?.at === at) { this.frames[this.frames.length-1] = frame; return; }
    if (latest && this.lastArrival !== null) {
      const interval = Math.max(0, at-latest.at);
      const variation = Math.abs((arrival-this.lastArrival)-interval);
      this.jitter += (variation-this.jitter) * .1;
      this.delayMs = clamp(Math.max(this.baseDelayMs, Math.min(interval*1.05, 110)) + this.jitter, this.baseDelayMs, 160);
    }
    this.lastArrival = arrival; this.frames.push(frame);
    if (this.frames.length > 20) this.frames.shift();
  }
  apply(game, now, localActorId) {
    if (!this.frames.length) return;
    const target = now-this.delayMs, latest = this.frames.at(-1);
    let left=this.frames[0], right=left;
    for (const frame of this.frames) {
      if (frame.at <= target) left=frame;
      if (frame.at >= target) { right=frame; break; }
      right=frame;
    }
    const blend = right.at > left.at ? clamp((target-left.at)/(right.at-left.at),0,1) : 1;
    for (const key of actorCollections) for (const actor of game[key] || []) {
      if (key === 'squad' && actor.id === localActorId) continue;
      const current = latest.groups[key].find(a => a.id === actor.id);
      if (!current) continue;
      const a = left.groups[key].find(a => a.id === actor.id) || current;
      const b = right.groups[key].find(a => a.id === actor.id) || a;
      const transition = a.alive !== current.alive || b.alive !== current.alive || a.downed !== current.downed || b.downed !== current.downed ||
        Math.hypot(a.x-current.x,a.y-current.y)>150 || Math.hypot(b.x-current.x,b.y-current.y)>150;
      actor.x = transition ? current.x : a.x+(b.x-a.x)*blend;
      actor.y = transition ? current.y : a.y+(b.y-a.y)*blend;
      actor.angle = transition ? current.angle : angleBetween(finite(a.angle),finite(b.angle),blend);
    }
  }
}

export class CoopClient {
  constructor({ url, onRoom = () => {}, onState = () => {}, onStatus = () => {}, onError = () => {},
    WebSocketImpl = globalThis.WebSocket, storage = defaultStorage(), now = monotonicNow, wallNow = () => Date.now(),
    autoReconnect = true, autoTimers = true, connectTimeoutMs = 65000 } = {}) {
    this.url = socketURL(url); this.WebSocketImpl = WebSocketImpl; this.storage = storage; this.now = now; this.wallNow = wallNow;
    this.onRoom=onRoom; this.onState=onState; this.onStatus=onStatus; this.onError=onError;
    this.autoReconnect=autoReconnect; this.autoTimers=autoTimers; this.connectTimeoutMs=connectTimeoutMs;
    this.connected=false; this._session=readCoopSession(storage); this._room=null; this.game=null;
    this.decoder=new SnapshotDeltaDecoder(); this.hydrator=new CoopStateHydrator(); this.interpolator=new SquadInterpolator();
    this._input={...EMPTY_INPUT}; this._edges={}; this._cancelActionsPending=false; this._history=[]; this._pending=new Map(); this._unacknowledged=[];
    this._sequence=0; this._commandSequence=0; this._generation=0; this._connecting=false; this._manualClose=false;
    this._reconnectAttempt=0; this._reconnecting=false; this._request=null; this._status='idle'; this._roomSignature=''; this._cancelConnect=null;
    this._lastMessageAt=0; this._lastInputAt=0; this._renderAt=null; this._authorityAt=null; this._authorityPlayer=null;
    this._receivedAt=0; this._latestState=null; this._latestTick=-1; this._latestEpoch=null; this._resyncRequested=false;
    this._correction={x:0,y:0}; this._rtt=0; this._clockOffset=0; this._clockKnown=false; this.skippedInputs=0;
  }
  get room() { return this._room; }
  get session() { return this._session ? {...this._session} : null; }
  get active() { return !!this._session || this._connecting; }
  get isHost() { return !!this._session && this._room?.hostId === this._session.playerId; }
  get localPlayer() { return this._room?.players?.find(peer => peer.id === this._session?.playerId) || null; }
  get role() { return this.localPlayer?.role || this.game?.role || 'leader'; }
  get latency() { return { rtt:this._rtt, interpolationMs:this.interpolator.delayMs, snapshotAgeMs:this._receivedAt ? Math.max(0,this.now()-this._receivedAt) : 0, skippedInputs:this.skippedInputs, bufferedBytes:this.socket?.bufferedAmount || 0 }; }
  async create({name='Player',role='leader',mission=0,difficulty='standard'}={}) {
    this._abandon();
    return this._open({type:'create',protocol:PROTOCOL,name:String(name).trim().slice(0,24)||'Player',role:role==='member'?'member':'leader',mission,difficulty});
  }
  async join({code,name='Player'}={}) {
    code=normalizeRoomCode(code);
    if (!validRoomCode(code)) throw this._report('Enter the six-character squad code. Check letters and numbers against the code your friend shared.');
    this._abandon();
    return this._open({type:'join',protocol:PROTOCOL,code,name:String(name).trim().slice(0,24)||'Player'});
  }
  async resume() {
    if (!this._session) return false;
    return this._open({type:'resume',protocol:PROTOCOL,...this._session});
  }
  _saveSession(value) {
    this._session=value ? {...value} : null;
    try { if (value) this.storage?.setItem(COOP_SESSION_KEY,JSON.stringify(value)); else this.storage?.removeItem(COOP_SESSION_KEY); } catch { /* Rejoin works in memory when browser storage is unavailable. */ }
  }
  _setStatus(state, reason='') { this._status=state; this.onStatus({state,reason,rtt:this._rtt}); }
  _report(reason) { const error=reason instanceof Error ? reason : new Error(String(reason)); this.onError(error); return error; }
  _updateRoom(room) {
    if (!room) { this._room=null; this._roomSignature=''; this.onRoom(null); return; }
    const previousActor=this.localPlayer?.actorId, previousRole=this.localPlayer?.role;
    this._room=clone(room);
    if (previousActor !== undefined && (previousActor !== this.localPlayer?.actorId || previousRole !== this.localPlayer?.role)) this.clearInput();
    const signature=JSON.stringify(room);
    if (signature !== this._roomSignature) { this._roomSignature=signature; this.onRoom(this._room); }
  }
  _open(request) {
    if (!this.WebSocketImpl) return Promise.reject(this._report('Online co-op is unavailable in this browser.'));
    this._cancelConnect?.(new Error('The previous squad connection was cancelled.'));
    clearTimeout(this._reconnectTimer); this._stopTimers();
    const previous=this.socket; const generation=++this._generation;
    this._manualClose=false; this._connecting=true; this.connected=false; this._request=request;
    this.decoder.reset(); this._resyncRequested=false; this._resetPrediction();
    try { previous?.close(1000,'Opening squad connection'); } catch {}
    this._setStatus(this._reconnecting?'reconnecting':'connecting',this._reconnecting?'Rejoining the squad…':'Connecting to the squad server…');
    return new Promise((resolve,reject) => {
      let settled=false, joined=false, timeout;
      const settle=(error,packet) => {
        if (settled) return; settled=true; clearTimeout(timeout);
        if (generation===this._generation) this._cancelConnect=null;
        error ? reject(error) : resolve(packet);
      };
      let socket;
      try { socket=new this.WebSocketImpl(this.url); this.socket=socket; }
      catch(error) { this._connecting=false; this._setStatus('error','Could not reach the squad server.'); reject(this._report(error)); return; }
      this._cancelConnect=error=>settle(error);
      timeout=setTimeout(() => {
        if (generation !== this._generation || joined) return;
        const error=this._report('The squad server has not answered yet. Try connecting again in a moment.');
        settle(error); this._connecting=false; this._setStatus('error',error.message);
        try { socket.close(1000,'Connection timed out'); } catch {}
      },this.connectTimeoutMs);
      socket.addEventListener('open',() => { if (generation===this._generation) socket.send(JSON.stringify(request)); });
      socket.addEventListener('message',event => {
        if (generation !== this._generation) return;
        this._lastMessageAt=this.now();
        let packet;
        try { if (typeof event.data !== 'string' || event.data.length>1000000) throw new Error('Invalid packet'); packet=JSON.parse(event.data); } catch { return; }
        if (!packet || typeof packet!=='object' || Array.isArray(packet)) return;
        if (packet.type==='joined') {
          const session=packet.session;
          if (!session || !validRoomCode(session.code) || !session.playerId || !session.token) return;
          joined=true; this.connected=true; this._connecting=false; this._reconnecting=false; this._reconnectAttempt=0;
          this._saveSession(session); this._sequence=0; this._unacknowledged=[]; this._input={...EMPTY_INPUT}; this._edges={}; this._cancelActionsPending=false;
          this._updateRoom(packet.room); this._setStatus('connected'); this._startTimers(); settle(null,packet);
        } else if (packet.type==='snapshot' && joined) this._snapshot(packet);
        else if (packet.type==='result') {
          const pending=this._pending.get(packet.id); if (!pending) return;
          clearTimeout(pending.timer); this._pending.delete(packet.id);
          if (packet.ok) pending.resolve(packet); else pending.reject(this._report(packet.reason||'The squad could not complete that command.'));
        } else if (packet.type==='pong') {
          const nowWall=this.wallNow(); this._rtt=clamp(nowWall-finite(packet.sentAt,nowWall),0,10000);
          if (Number.isFinite(packet.serverTime) && this._rtt<3000) {
            const offset=packet.serverTime-(finite(packet.sentAt,nowWall)+nowWall)/2;
            this._clockOffset=this._clockKnown ? this._clockOffset*.8+offset*.2 : offset; this._clockKnown=true;
          }
        } else if (packet.type==='closed' || packet.type==='replaced') {
          this._manualClose=true; this._saveSession(null); this._updateRoom(null); this._connecting=false; this.connected=false; this._stopTimers();
          this._resetPrediction(); this._rejectCommands('The squad connection ended before the command was confirmed.');
          const error=this._report(packet.reason || (packet.type==='replaced'?'This squad session was opened in another tab.':'This squad session has ended.'));
          this._setStatus('error',error.message); settle(error); try { socket.close(1000,'Session ended'); } catch {}
        } else if (packet.type==='error') {
          const error=this._report(packet.reason||'The squad server rejected this request.');
          if (!joined) {
            this._manualClose=true; this._connecting=false; this._saveSession(null); this._updateRoom(null);
            this._setStatus('error',error.message); settle(error); try { socket.close(1000,'Request rejected'); } catch {}
          }
        }
      });
      socket.addEventListener('error',() => {
        if (generation !== this._generation || joined) return;
        const error=new Error('Could not reach the squad server.'); settle(error);
      });
      socket.addEventListener('close',event => {
        if (generation !== this._generation) return;
        clearTimeout(timeout); this.connected=false; this._connecting=false; this._stopTimers(); this._resetPrediction();
        this._rejectCommands('Connection lost before the server confirmed this command.');
        if (!joined) settle(new Error(event.reason||'The squad connection closed.'));
        if (this._manualClose) return;
        if ([4001,4004,4009].includes(event.code)) {
          this._saveSession(null); this._updateRoom(null); this._setStatus('error',event.reason||'The squad session is no longer available.'); return;
        }
        if (this._session && this.autoReconnect) {
          this._reconnecting=true; this._setStatus('reconnecting','Connection interrupted. Your soldier is covered by AI while you reconnect.'); this._scheduleReconnect();
        } else this._setStatus('error',event.reason||'Could not connect to the squad server.');
      });
    });
  }
  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    const delay=Math.min(8000,500*2**this._reconnectAttempt++);
    this._reconnectTimer=setTimeout(() => { if (!this._manualClose && this._session) this.resume().catch(() => {}); },delay);
  }
  _startTimers() {
    this._stopTimers(); if (!this.autoTimers) return;
    this._inputTimer=setInterval(() => this._sendInput(),1000/INPUT_HZ);
    this._heartbeatTimer=setInterval(() => {
      if (!this.connected) return;
      // Browsers only allow 1000 or private 3000–4999 codes from close().
      if (this.now()-this._lastMessageAt>10000) { try { this.socket?.close(4000,'Connection stalled'); } catch {} return; }
      this._send({type:'ping',sentAt:this.wallNow()});
    },2500);
  }
  _stopTimers() { clearInterval(this._inputTimer); clearInterval(this._heartbeatTimer); }
  _send(packet) {
    if (this.socket?.readyState !== 1) return false;
    try { this.socket.send(JSON.stringify(packet)); return true; } catch { return false; }
  }
  input(controls={}) {
    if (!controls || !Object.keys(controls).length) { this.clearInput(); return; }
    const now=this.now(), input=cleanInput(controls);
    for (const type of ['reload','smoke','grenade','frag','flashbang']) if (input[type] && !this._edges[type]) this._edges[type]={at:now,
      aimX:input.throwTargets[type]?.x??input.throwAimX??input.aimX,aimY:input.throwTargets[type]?.y??input.throwAimY??input.aimY};
    this._input=input; this._lastInputAt=now;
  }
  clearInput() {
    this._input={...EMPTY_INPUT}; this._edges={}; this._lastInputAt=this.now(); this._history=[]; this._renderAt=this.now();
    this._cancelActionsPending=true;
    this._correction={x:0,y:0}; this._unacknowledged=[];
    if (this.connected) this._sendInput(true);
  }
  _sendInput(forceNeutral=false) {
    if(forceNeutral)this._cancelActionsPending=true;
    if (!this.connected || !this._room || this._room.status!=='playing') return false;
    if (this.socket?.bufferedAmount>0) { this.skippedInputs++; return false; }
    const now=this.now(), stale=now-this._lastInputAt>250;
    const cancelActions=this._cancelActionsPending||stale;
    const input=cancelActions ? {...EMPTY_INPUT} : {...this._input};
    input.throwTargets={};
    for (const type of ['reload','smoke','grenade','frag','flashbang']) input[type]=!cancelActions&&!!this._edges[type]&&now-this._edges[type].at<EDGE_LIFETIME_MS;
    // A captured mobile throw must retain its release target while ordinary
    // look/movement updates are coalesced. Keep that point separate from rifle aim.
    for(const type of THROW_ACTIONS)if(input[type])input.throwTargets[type]={x:this._edges[type].aimX,y:this._edges[type].aimY};
    const throwType=THROW_ACTIONS.find(type=>input[type]);
    if(throwType){input.throwAimX=this._edges[throwType].aimX;input.throwAimY=this._edges[throwType].aimY;}
    const frame={type:'input',seq:this._sequence+1,epoch:this._room.epoch,input,...(cancelActions?{cancelActions:true}:{})};
    if (!this._send(frame)) return false;
    this._sequence=frame.seq; this._cancelActionsPending=false;
    // A new press after clearInput belongs after the cancellation packet. Keep
    // it for the next send if backpressure delayed that explicit neutral frame.
    if(!cancelActions||stale)this._edges={};
    this._unacknowledged.push({seq:frame.seq,at:now});
    if (this._unacknowledged.length>80) this._unacknowledged.shift();
    return true;
  }
  _snapshot(wire) {
    const packet=this.decoder.decode(wire);
    if (!packet) { if (!this._resyncRequested) { this._resyncRequested=true; this._send({type:'resync'}); } return; }
    this._resyncRequested=false;
    const epoch=`${packet.room?.code}:${packet.init?.epoch}`;
    if (epoch===this._latestEpoch && Number.isFinite(packet.tick) && packet.tick<this._latestTick) return;
    this._latestEpoch=epoch; this._latestTick=finite(packet.tick,this._latestTick);
    const now=this.now(), oldGame=this.game, oldPlayer=oldGame?.squad?.find(actor => actor.id===oldGame.playerId);
    const displayed=oldPlayer ? {x:oldPlayer.x,y:oldPlayer.y} : null;
    this._updateRoom(packet.room);
    const hydrated=this.hydrator.apply(packet,this._session?.playerId); if (!hydrated) return;
    this.game=hydrated.game; this._latestState=clone(packet.state); this._receivedAt=now;
    this._sequence=Math.max(this._sequence,finite(packet.ack)); this._unacknowledged=this._unacknowledged.filter(frame => frame.seq>finite(packet.ack));
    if (!this._clockKnown && Number.isFinite(packet.serverTime)) { this._clockOffset=packet.serverTime-this.wallNow(); this._clockKnown=true; }
    const wireAge=Number.isFinite(packet.serverTime) ? clamp(this.wallNow()+this._clockOffset-packet.serverTime,0,MAX_PREDICTION_MS) : this._rtt/2;
    this._authorityAt=now-wireAge;
    const authoritative=this.game.squad.find(actor => actor.id===this.game.playerId);
    const transition=hydrated.changedEpoch||hydrated.changedActor||!this._authorityPlayer||this._authorityPlayer.downed!==authoritative?.downed||this._authorityPlayer.alive!==authoritative?.alive;
    if (transition) { this._resetPrediction(); this._authorityAt=now; this.interpolator.reset(); }
    else if(hydrated.changedGeometry){this._history=[];this._unacknowledged=[];this._renderAt=now;this._authorityAt=now;}
    this._authorityPlayer=authoritative ? {...authoritative} : null;
    const predicted=this._predictAt(now);
    const error=displayed&&predicted ? Math.hypot(displayed.x-predicted.x,displayed.y-predicted.y) : Infinity;
    if (transition||hydrated.changedGeometry||error>140) { this._correction={x:0,y:0}; if (error>140) { this._history=[]; this._input={...EMPTY_INPUT}; this._edges={}; } }
    else this._correction={x:displayed.x-predicted.x,y:displayed.y-predicted.y};
    this.interpolator.push(packet.state,this._authorityAt,now);
    this.onState(this.game);
  }
  _resetPrediction() {
    this._input={...EMPTY_INPUT}; this._edges={}; this._cancelActionsPending=false; this._history=[]; this._unacknowledged=[]; this._renderAt=null;
    this._authorityAt=null; this._authorityPlayer=null; this._correction={x:0,y:0}; this.interpolator.reset();
  }
  _predictAt(now) {
    if (!this._authorityPlayer || !this.game) return null;
    let actor={...this._authorityPlayer};
    if (!this.connected || this._room?.status!=='playing' || this._authorityAt===null) return actor;
    const end=Math.min(now,this._authorityAt+MAX_PREDICTION_MS);
    let cursor=this._authorityAt;
    for (const frame of this._history) {
      const from=Math.max(frame.from,cursor), to=Math.min(frame.to,end);
      if (to<=from) continue;
      actor=predictMovement(actor,frame.input,(to-from)/1000,this.game.world); cursor=to;
    }
    if (cursor<end && this._renderAt!==null) actor=predictMovement(actor,this._input,(end-Math.max(cursor,this._renderAt))/1000,this.game.world);
    return actor;
  }
  getState(dt=0) {
    if (!this.game) return null;
    const now=this.now(), from=this._renderAt ?? now-clamp(finite(dt)*1000,0,50);
    if (this.connected && this._room?.status==='playing' && now>from) this._history.push({from:Math.max(from,now-100),to:now,input:{...this._input}});
    this._renderAt=now;
    while (this._history.length && this._history[0].to<now-MAX_HISTORY_MS) this._history.shift();
    if (this._history.length>90) this._history.splice(0,this._history.length-90);
    this.interpolator.apply(this.game,now,this.game.playerId);
    const local=this.game.squad.find(actor => actor.id===this.game.playerId), predicted=this._predictAt(now);
    if (local && predicted) {
      const decay=Math.exp(-clamp(finite(dt),0,.1)*18); this._correction.x*=decay; this._correction.y*=decay;
      local.x=predicted.x+this._correction.x; local.y=predicted.y+this._correction.y; local.angle=predicted.angle; local.moving=predicted.moving;
    }
    // Expire short effects between authority packets; never repeat them as commands.
    const age=Math.min(.25,Math.max(0,(now-this._receivedAt)/1000));
    if (this._latestState?.effects) this.game.effects=this._latestState.effects.filter(effect => finite(effect.ttl)-age>0).map(effect=>({...effect,ttl:effect.ttl-age}));
    return this.game;
  }
  _command(type,args={}) {
    if (!this.connected || !this._room) return Promise.reject(this._report('Reconnect to your squad before issuing a command.'));
    if (this._pending.size>=16 || (this.socket?.bufferedAmount||0)>16384) return Promise.reject(this._report('The connection is busy. Wait a moment before trying that command.'));
    const id=`${this._generation}-${++this._commandSequence}`;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => { this._pending.delete(id); reject(this._report('The server has not confirmed this command. Check the squad connection before trying again.')); },15000);
      this._pending.set(id,{resolve,reject,timer});
      if (!this._send({type,id,epoch:this._room.epoch,...args})) { clearTimeout(timer); this._pending.delete(id); reject(this._report('The squad connection was interrupted.')); }
    });
  }
  order(type,point) { return this._command('order',{order:type,...(point?{point}: {})}); }
  storyChoice(decisionId,optionId) { return this._command('story_choice',{decisionId,optionId}); }
  continueOperation() { this.clearInput(); return this._command('continue_operation'); }
  start() { return this._command('start'); }
  restart() { return this._command('restart'); }
  configure({mission,difficulty}={}) { return this._command('configure',{...(mission!==undefined?{mission}:{}),...(difficulty?{difficulty}:{})}); }
  swapRoles() { this.clearInput(); return this._command('swap_roles'); }
  returnToLobby() { this.clearInput(); return this._command('return_lobby'); }
  _rejectCommands(reason) { for (const pending of this._pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); } this._pending.clear(); }
  _abandon() {
    this._cancelConnect?.(new Error('You left the squad before connecting.'));
    this._manualClose=true; clearTimeout(this._reconnectTimer); this._stopTimers();
    if (this.connected) this._send({type:'leave'});
    this.connected=false; this._connecting=false; ++this._generation;
    try { this.socket?.close(1000,'Left squad'); } catch {}
    this.socket=null; this._saveSession(null); this._rejectCommands('You left the squad.'); this._resetPrediction();
    this.decoder.reset(); this.hydrator.reset(); this.game=null; this._latestState=null; this._latestTick=-1; this._latestEpoch=null;
    this._room=null; this._roomSignature=''; this._reconnecting=false; this._reconnectAttempt=0;
  }
  leave() { this._abandon(); this.onRoom(null); this._setStatus('idle'); }
}
