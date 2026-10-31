/** Authored menu, mission-opening and section score. Never a combat playlist. */
import { CUES_BY_ID, MENU_SCORE } from './music-cues.mjs';
const MAX_CUE_SECONDS=56;
const DUCK_EVENTS=new Set(['enemy-warning','enemy-shot','hurt','explosion','teleport','provoked','boss-phase','shield-open','shield-hit','heal','heal-interrupt','ricochet']);
const RELIEF_EVENTS=new Set(['refuge','transit','transit-activated','checkpoint','relay','power']);
const LOCAL_EVENTS=new Set(['record','hurt','refuge','transit']);
const level=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;

export class BreachMusic {
  constructor({enabled=true,volume=.45,fetcher=globalThis.fetch?.bind(globalThis)}={}) {
    this.enabled=!!enabled;this.volume=level(volume,.45);this.fetcher=fetcher;
    this.context=null;this.output=null;this.playing=false;this.menu=false;
    this.menuActivated=false;this.menuMuted=false;this.menuUsed=false;
    this.time=0;this.cooldownUntil=0;this.suppressedUntil=0;this.duckUntil=0;
    this.completed=new Set();this.visited=new Set();this.openingUsed=false;this._initialized=false;
    this._candidate=null;this._scene={};this._pressure=0;this._guardian=false;
    this._buffers=new Map();this._loads=new Map();this._pending=null;this._active=null;this._sources=new Set();this._generation=0;
  }
  attach(context,output) {
    if(context===this.context && output===this.output)return;
    this._interrupt();
    if(context!==this.context){
      this._buffers.clear();this._loads.clear();
      for(const cue of this._sources){cue.source.onended=null;try{cue.source.stop();}catch(_){}try{cue.source.disconnect();cue.gain.disconnect();}catch(_){}}
      this._sources.clear();
    }
    this.context=context || null;this.output=output || null;
  }
  configure({enabled=this.enabled,volume=this.volume}={}) {
    this.enabled=!!enabled;this.volume=level(volume,this.volume);
    if(!this.enabled || !this.volume){this._interrupt();this._discard();}
    else if(this._active)this._setLevel(.15);
  }
  setPlaying(value) {
    const next=!!value;
    if(next!==this.playing){this._interrupt();if(!next)this._discard();}
    this.playing=next;
    if(next)this.setMenu(false);
  }
  setMenu(value) {
    const next=!!value;
    if(next===this.menu)return;
    if(this._pending?.kind==='menu' || this._active?.kind==='menu')this._interrupt();
    this.menu=next;
    if(next)this.menuUsed=false;
  }
  activateMenu() {this.menuActivated=true;}
  toggleMenu() {
    if(!this.enabled || !this.volume)return;
    this.menuActivated=true;
    if(this._active?.kind==='menu' || this._pending?.kind==='menu') {this.menuMuted=true;this._interrupt();}
    else {this.menuMuted=false;this.menuUsed=false;}
  }
  updateMenu({blocked=false}={}) {
    if(!this.menu || this.playing)return;
    if(blocked || !this.enabled || !this.volume){if(this._active?.kind==='menu' || this._pending?.kind==='menu')this._interrupt();return;}
    if(this.menuActivated && !this.menuMuted && !this.menuUsed && !this._active && !this._pending && !this._sources.size && this._readyContext()) {
      this.menuUsed=true;this._requestCue({...MENU_SCORE,kind:'menu',scope:'menu'});
    }
  }
  reset({retry=false,snapshot=null}={}) {
    if(this._active?.kind!=='menu' && this._pending?.kind!=='menu')this._interrupt();
    this._candidate=null;this._initialized=false;this._scene={};
    if(!retry){
      this.completed=new Set((Array.isArray(snapshot?.completed)?snapshot.completed:[]).filter(x=>typeof x==='string').slice(0,64));
      this.visited=new Set((Array.isArray(snapshot?.visited)?snapshot.visited:[]).filter(x=>typeof x==='string').slice(0,64));
      this.openingUsed=!!snapshot?.openingUsed;this.cooldownUntil=0;
    }else this.openingUsed=true;
    this.suppressedUntil=this.time+(retry?8:0);this.duckUntil=this.time;
  }
  snapshot() {return {completed:[...this.completed],visited:[...this.visited],openingUsed:this.openingUsed};}
  _discard() {if(this._candidate)this.completed.add(this._candidate.scope);this._candidate=null;}
  events(events, listener = null) {
    if (!Array.isArray(events)) return;
    for (const event of events) {
      if (!event || typeof event.type !== 'string') continue;
      if (LOCAL_EVENTS.has(event.type) && event.playerId && listener?.id && event.playerId !== listener.id) continue;
      const spatial = listener && Number.isFinite(listener.x) && Number.isFinite(listener.z) && Number.isFinite(event.x) && Number.isFinite(event.z);
      if (spatial && Math.hypot(event.x - listener.x, event.z - listener.z) > 14) continue;
      if (event.type === 'record' || RELIEF_EVENTS.has(event.type)) {
        this.suppressedUntil = Math.max(this.suppressedUntil, this.time + (event.type === 'record' ? 12 : 8));
        this._interrupt();
      } else if (DUCK_EVENTS.has(event.type)) {
        this.duckUntil = Math.max(this.duckUntil, this.time + 1.2);
        if (this._active) this._setLevel(.035);
      }
    }
  }


  update({dt=0,pressure=0,guardian=false,scene={},alive=true,blocked=false}={}) {
    try {
      this._scene=scene;this._pressure=pressure;this._guardian=guardian;
      if(!this.playing)return;
      if(blocked || !alive){this._discard();this._interrupt();return;}
      const delta=Number.isFinite(dt)?Math.max(0,Math.min(.5,dt)):0;
      this.time+=delta;
      if(!this._initialized){
        this._initialized=true;
        if(scene.missionTime>5)this.openingUsed=true; // Continue / late co-op join.
        if(!this.openingUsed){
          this.openingUsed=true;
          if(scene.opening)this._candidate={key:'opening',cue:scene.opening,scope:`${scene.mission}:opening`,kind:'opening',at:this.time,delay:1.5,window:25,gap:25,fade:scene.openingFade};
        }
      }
      this.visited.add(`${scene.mission}:${scene.zone}`);
      if(scene.silence){this._discard();this._interrupt();return;}
      // A loaded cue may not follow its entry moment into another section.
      if(this._pending && !this._currentRequest(this._pending))this._interrupt();
      // Quiet horror textures yield to danger; ordinary passages finish their
      // written phrase through minor movement and changes in enemy count.
      if(this._active?.quiet && (pressure>0 || this._active.zone!==scene.zone))this._interrupt();
      if(this._active){
        if(this.context?.state!=='running')this._interrupt();
        else if(this._active.ducked!==(this.time<this.duckUntil))this._setLevel(.3);
      }
      const passage=scene.section?.priority&&!guardian?null:scene.section;
      if(passage?.priority&&guardian&&!this.completed.has(`${scene.mission}:${passage.key}`)&&(this._active||this._pending)){this._interrupt(2);this.cooldownUntil=this.time;}
      const scope=passage?`${scene.mission}:${passage.key}`:null;
      if(this._candidate?.kind==='section' && this._candidate.scope!==scope)this._discard();
      if(passage && !this.completed.has(scope) && this._candidate?.scope!==scope){
        // Never queue a second track behind an opening or another passage.
        if(this._candidate || this._active || this._pending || this.time<this.cooldownUntil&&!passage.priority)this.completed.add(scope);
        else if(!passage.visit || this.visited.has(`${scene.mission}:${passage.visit}`))
          this._candidate={...passage,scope,kind:'section',zone:scene.zone,at:this.time,eligible:0};
      }
      const candidate=this._candidate;
      if(!candidate)return;
      if(!this.enabled || !this.volume || this.time-candidate.at>candidate.window){this._discard();return;}
      const permitted=(!candidate.guardian || guardian) && (!candidate.danger || pressure>0) && (!candidate.quiet || pressure===0);
      if(candidate.guardian || candidate.danger)candidate.eligible=permitted?(candidate.eligible || 0)+delta:0;
      if(!permitted)return;
      const dwell=candidate.guardian || candidate.danger ? candidate.eligible : this.time-candidate.at;
      if(dwell<candidate.delay || this.time<this.suppressedUntil || this._sources.size || !this._readyContext())return;
      this.completed.add(candidate.scope);this._candidate=null;this._requestCue(candidate);
    }catch(_){this._discard();this._interrupt();}
  }
  _readyContext(){return this.context?.state==='running' && this.output && typeof this.context.createBufferSource==='function' && typeof this.context.createGain==='function' && typeof this.context.decodeAudioData==='function';}
  _currentRequest(request){
    if(this._pending!==request || request.generation!==this._generation || request.context!==this.context || !this.enabled || !this.volume || !this._readyContext())return false;
    if(request.kind==='menu')return this.menu && !this.playing && !this.menuMuted;
    if(!this.playing || this._scene.silence || this.time>request.expires)return false;
    if(request.kind==='opening')return this._scene.mission===request.mission;
    return `${this._scene.mission}:${this._scene.section?.key}`===request.scope && (!request.guardian || this._guardian) && (!request.danger || this._pressure>0) && (!request.quiet || this._pressure===0);
  }
  _requestCue(passage){
    const request={...passage,id:passage.cue,mission:this._scene.mission,cooldown:passage.gap ?? 25,level:passage.level ?? 1,expires:(passage.at ?? this.time)+(passage.window ?? 30),generation:++this._generation,context:this.context};
    this._pending=request;
    Promise.resolve().then(async()=>{
      if(!this._currentRequest(request))return;
      const buffer=await this.prepare(request.id);
      if(!this._currentRequest(request))return;
      this._pending=null;this._start(buffer,request);
    }).catch(()=>{if(this._pending===request)this._pending=null;});
  }
  // Loading and permission to play are separate. A missed section can leave a
  // useful cached buffer, but can never leave a delayed musical surprise.
  prepare(id = 'containment-pulse') {
    const definition = CUES_BY_ID.get(id), context = this.context;
    if (this._buffers.has(id)) return Promise.resolve(this._buffers.get(id));
    if (this._loads.has(id)) return this._loads.get(id);
    if (!definition || !context || typeof this.fetcher !== 'function' || this._loads.size >= 2) return Promise.reject(new Error('Music unavailable'));
    const loading = Promise.resolve().then(async () => {
      const response = await this.fetcher(definition.url, {credentials:'same-origin',mode:'same-origin'});
      if (!response?.ok) throw new Error('Music unavailable');
      const bytes = await response.arrayBuffer();
      if (context !== this.context) throw new Error('Audio changed');
      const buffer = await context.decodeAudioData(bytes);
      if (context !== this.context || !buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid music');
      this._buffers.delete(id); this._buffers.set(id,buffer);
      while (this._buffers.size > 2) this._buffers.delete(this._buffers.keys().next().value);
      return buffer;
    }).finally(() => { if (this._loads.get(id) === loading) this._loads.delete(id); });
    this._loads.set(id,loading);
    return loading;
  }

  _start(buffer, request = {id:'containment-pulse',kind:'section',cooldown:25,level:1}) {
    let source = null, gain = null, cue = null;
    try {
      const c = this.context, at = c.currentTime;
      source = c.createBufferSource(); gain = c.createGain();
      source.buffer = buffer; source.loop = false; gain.gain.setValueAtTime(0, at);
      source.connect(gain); gain.connect(this.output);
      cue = { id:request.id, kind:request.kind, cooldown:request.cooldown, zone:request.zone, quiet:request.quiet, fade:request.fade||.3, endAt:at+Math.min(buffer.duration,MAX_CUE_SECONDS), level:request.level, source, gain, ducked: request.kind !== 'menu' && this.time < this.duckUntil, stopped: false };
      this._active = cue; this._sources.add(cue);
      source.onended = () => {
        this._sources.delete(cue);
        if (this._active === cue) this._active = null;
        // Interrupted cues spent their quiet interval at the interruption.
        // Their delayed cleanup must not impose it on a newly reset mission.
        if(cue.kind!=='menu' && !cue.stopped)this.cooldownUntil = Math.max(this.cooldownUntil, this.time + cue.cooldown);
        try { source.disconnect(); gain.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      };
      gain.gain.linearRampToValueAtTime(this.volume * cue.level * (cue.ducked ? .25 : 1), at + (request.fade||.8));
      if(request.fade){gain.gain.setValueAtTime(this.volume*cue.level*(cue.ducked?.25:1),Math.max(at+request.fade,cue.endAt-request.fade));gain.gain.linearRampToValueAtTime(0,cue.endAt);}
      source.start(at); source.stop(at + Math.min(buffer.duration, MAX_CUE_SECONDS));

    } catch (_) {
      if (cue) { this._sources.delete(cue); if (this._active === cue) this._active = null; }
      try { source?.stop(); } catch (_) { /* A source may not have started. */ }
      try { source?.disconnect(); gain?.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      if(request.kind!=='menu')this.cooldownUntil = Math.max(this.cooldownUntil, this.time + 25);
    }
  }

  _setLevel(seconds) {
    const cue = this._active;
    if (!cue || !this.context) return;
    try {
      const at = this.context.currentTime, param = cue.gain.gain;
      cue.ducked = cue.kind !== 'menu' && this.time < this.duckUntil;
      param.cancelScheduledValues(at); param.setValueAtTime(param.value, at);
      param.linearRampToValueAtTime(this.volume * cue.level * (cue.ducked ? .25 : 1), at + seconds);
      if(cue.fade>.3&&cue.endAt>at+seconds){param.setValueAtTime(this.volume*cue.level*(cue.ducked?.25:1),Math.max(at+seconds,cue.endAt-cue.fade));param.linearRampToValueAtTime(0,cue.endAt);}
    } catch (_) { this._interrupt(); }
  }

  _interrupt(seconds=null) {
    ++this._generation;
    this._pending = null;
    const cue = this._active; this._active = null;
    // A download that never became audible has not spent the music budget.
    if (cue && cue.kind!=='menu')this.cooldownUntil = Math.max(this.cooldownUntil, this.time + cue.cooldown);
    if (!cue || cue.stopped) return;
    cue.stopped = true;
    try {
      const at = this.context?.currentTime || 0, param = cue.gain.gain,fade=seconds??cue.fade??.3;
      param.cancelScheduledValues(at); param.setValueAtTime(param.value, at); param.linearRampToValueAtTime(0, at + fade);
      cue.source.stop(at + fade);
    } catch (_) {
      this._sources.delete(cue);
      try { cue.source.disconnect(); cue.gain.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
    }
  }
}
