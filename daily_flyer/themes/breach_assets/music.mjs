/** Continuous authored scores, with brief, explicit dramatic silences. */
import { CUES_BY_ID, MENU_SCORES } from './music-cues.mjs';
const MAX_CUE_SECONDS=56;
const DUCK_EVENTS=new Set(['enemy-warning','enemy-shot','hurt','explosion','teleport','provoked','boss-phase','shield-open','shield-hit','heal','heal-interrupt','ricochet']);
const RELIEF_EVENTS=new Set(['refuge','transit','transit-activated','checkpoint','relay','power']);
const DUCK_LEVEL=.55;
const LOCAL_EVENTS=new Set(['record','hurt','refuge','transit']);
const level=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;

export class BreachMusic {
  constructor({enabled=true,volume=.45,fetcher=globalThis.fetch?.bind(globalThis)}={}) {
    this.enabled=!!enabled;this.volume=level(volume,.45);this.fetcher=fetcher;
    this.context=null;this.output=null;this.playing=false;this.menu=false;
    this.menuActivated=false;this.menuMuted=false;this.menuIndex=0;
    this.menuError=false;this._menuRetryAt=0;
    this.time=0;this.suppressedUntil=0;this.duckUntil=0;this.readingUntil=0;
    this.completed=new Set();this.cursors=new Map();this.lastCue=null;this.openingUsed=false;this._initialized=false;
    this._opening=null;this._quiet=null;this._desired=null;this._scene={};this._entry=null;this._entryAt=0;
    this._bossScope=null;this._guardianDwell=0;this._scoreRetryAt=0;this._failed=new Map();this._blocked=false;
    this._buffers=new Map();this._loads=new Map();this._pending=null;this._active=null;this._sources=new Set();this._generation=0;
  }
  attach(context,output) {
    if(context===this.context && output===this.output)return;
    this._interrupt();
    if(context!==this.context){
      this._buffers.clear();this._loads.clear();this._failed.clear();this._menuRetryAt=0;
      for(const cue of this._sources){cue.source.onended=null;try{cue.source.stop();}catch(_){}try{cue.source.disconnect();cue.gain.disconnect();}catch(_){}}
      this._sources.clear();
    }
    this.context=context || null;this.output=output || null;
  }
  configure({enabled=this.enabled,volume=this.volume}={}) {
    this.enabled=!!enabled;this.volume=level(volume,this.volume);
    if(!this.enabled || !this.volume){this._interrupt();this._opening=null;}
    else if(this._active)this._setLevel(.15);
  }
  setPlaying(value) {
    const next=!!value;
    if(next!==this.playing){this._interrupt();if(!next)this._opening=null;}
    this.playing=next;
    if(next)this.setMenu(false);
  }
  setMenu(value) {
    const next=!!value;
    if(next===this.menu)return;
    if(this._pending?.kind==='menu' || this._active?.kind==='menu')this._interrupt();
    this.menu=next;
    if(next){this.menuIndex=0;this.menuError=false;this._menuRetryAt=0;}
  }
  activateMenu() {this.menuActivated=true;}
  toggleMenu({resume=false}={}) {
    if(!this.enabled || !this.volume)return;
    if(!resume && this.menuActivated && !this.menuMuted && !this.menuError) {this.menuMuted=true;this._interrupt();}
    else {this.menuMuted=false;this.menuError=false;this._menuRetryAt=0;}
    this.menuActivated=true;
  }
  updateMenu({blocked=false}={}) {
    if(!this.menu || this.playing)return;
    if(blocked || !this.enabled || !this.volume){if(this._active?.kind==='menu' || this._pending?.kind==='menu')this._interrupt();return;}
    const outgoing=this._active;
    const handoff=outgoing?.kind==='menu' && this._sources.size===1 && this.context.currentTime>=outgoing.endAt-outgoing.fade;
    if(this.menuActivated && !this.menuMuted && !this._pending && this._readyContext() && this.context.currentTime>=this._menuRetryAt &&
       ((!outgoing && !this._sources.size) || handoff)) {
      this._requestCue({...MENU_SCORES[this.menuIndex],menuIndex:this.menuIndex,kind:'menu',scope:'menu'});
    }
  }
  reset({retry=false,snapshot=null}={}) {
    if(this._active?.kind!=='menu' && this._pending?.kind!=='menu')this._interrupt(.4);
    this._initialized=false;this._scene={};this._opening=null;this._quiet=null;this._desired=null;this._entry=null;this._bossScope=null;this._guardianDwell=0;this._blocked=false;
    if(!retry){
      this.completed=new Set((Array.isArray(snapshot?.completed)?snapshot.completed:[]).filter(x=>typeof x==='string').slice(0,64));
      this.cursors=new Map(Object.entries(snapshot?.cursors&&typeof snapshot.cursors==='object'?snapshot.cursors:{}).filter(([key,n])=>key.length<120&&Number.isSafeInteger(n)&&n>=0).slice(0,64));
      this.lastCue=CUES_BY_ID.has(snapshot?.lastCue)?snapshot.lastCue:null;
      this.openingUsed=!!snapshot?.openingUsed;
    }else this.openingUsed=true;
    this.suppressedUntil=this.time+.5;this.duckUntil=this.time;this.readingUntil=this.time;this._scoreRetryAt=0;
  }
  snapshot(){return {version:2,completed:[...this.completed],openingUsed:this.openingUsed,cursors:Object.fromEntries(this.cursors),lastCue:this.lastCue};}
  events(events,listener=null){
    if(!Array.isArray(events))return;
    for(const event of events){
      if(!event||typeof event.type!=='string')continue;
      if(LOCAL_EVENTS.has(event.type)&&event.playerId&&listener?.id&&event.playerId!==listener.id)continue;
      const spatial=listener&&Number.isFinite(listener.x)&&Number.isFinite(listener.z)&&Number.isFinite(event.x)&&Number.isFinite(event.z);
      if(spatial&&Math.hypot(event.x-listener.x,event.z-listener.z)>14)continue;
      if(event.type==='record')this.readingUntil=Math.max(this.readingUntil,this.time+8);
      else if(RELIEF_EVENTS.has(event.type)||DUCK_EVENTS.has(event.type))this.duckUntil=Math.max(this.duckUntil,this.time+1.2);
      else continue;
      this._setLevel(.06);
    }
  }
  _mix(kind){return kind==='menu'?1:this.time<this.readingUntil?.3:this.time<this.duckUntil?DUCK_LEVEL:1;}
  _pick(profile){
    if(!profile?.cues?.length)return null;
    const first=(this.cursors.get(profile.scope)||0)%profile.cues.length,choices=[];
    for(let n=0;n<profile.cues.length;n++){
      const index=(first+n)%profile.cues.length,id=profile.cues[index];
      if(CUES_BY_ID.has(id)&&(this._failed.get(id)||0)<=this.time)choices.push({id,index});
    }
    return choices.find(c=>c.id!==this.lastCue)||choices[0]||null;
  }
  _prime(profile){
    const next=this._pick(profile),context=this.context;
    if(next&&this._readyContext()&&(this._loads.size<2||this._loads.has(next.id)))this.prepare(next.id).catch(()=>{if(this.context===context)this._failed.set(next.id,this.time+15);});
  }
  update({dt=0,pressure=0,guardian=false,scene={},alive=true,blocked=false}={}){
    try{
      this._scene=scene;this._blocked=blocked||!alive;
      if(!this.playing)return;
      if(this._blocked){this._opening=null;this._interrupt(.4);return;}
      const delta=Number.isFinite(dt)?Math.max(0,Math.min(.5,dt)):0;this.time+=delta;
      if(!this._initialized){
        this._initialized=true;
        if(scene.missionTime>5)this.openingUsed=true;
        if(!this.openingUsed&&scene.opening&&this.enabled&&this.volume)this._opening={cue:scene.opening,at:this.time,expires:this.time+18};
        this.openingUsed=true;
      }
      const quietScope=scene.quietBeat?`${scene.mission}:quiet:${scene.quietBeat.key}`:null;
      if(this._quiet?.scope!==quietScope)this._quiet=null;
      if(quietScope&&!this.completed.has(quietScope)){
        this.completed.add(quietScope);
        if(!pressure&&!guardian)this._quiet={scope:quietScope,until:this.time+Math.min(12,scene.quietBeat.seconds)};
      }
      if(pressure>0||guardian)this._quiet=null; // A dramatic pause never conceals a fight.
      if(scene.silence||this._quiet&&this.time<this._quiet.until){this._desired=null;this._interrupt(1.2);return;}
      const entry=`${scene.mission}:${scene.zone}`;
      if(entry!==this._entry){this._entry=entry;this._entryAt=this.time;this._guardianDwell=0;}
      const bossScope=scene.boss?`${scene.mission}:boss:${scene.boss.key}`:null;
      if(this._bossScope!==bossScope)this._bossScope=null;
      this._guardianDwell=guardian?this._guardianDwell+delta:0;
      if(bossScope&&this._guardianDwell>=(scene.boss.delay||1.5))this._bossScope=bossScope;
      const boss=!!bossScope&&this._bossScope===bossScope;
      const profile=boss?scene.boss:scene.rotation;
      const desired=profile?{...profile,scope:boss?bossScope:`${scene.mission}:${profile.key}`,kind:boss?'boss':'score'}:null;
      const changed=desired?.scope!==this._desired?.scope;
      this._desired=desired;
      if(this._pending&&!this._currentRequest(this._pending)){++this._generation;this._pending=null;}
      if(!this.enabled||!this.volume||!this._readyContext()){if(this._active)this._interrupt(.4);return;}
      if(this._active&&this._active.mix!==this._mix(this._active.kind))this._setLevel(.25);
      if(changed&&desired&&this._active)this._prime(desired);
      if(this._pending||this.time<this.suppressedUntil||this.time<this._scoreRetryAt)return;
      const active=this._active;
      if(active?.kind==='menu'||this._sources.size>(active?1:0))return;
      const bossChange=active&&desired&&(active.kind==='boss'||desired.kind==='boss')&&active.scope!==desired.scope;
      const handoff=active&&this.context.currentTime>=active.endAt-active.fade;
      if(active&&!bossChange&&!handoff)return;
      if(!active&&this._sources.size)return;
      if(!active&&this._opening&&this.time<=this._opening.expires&&!boss){
        if(this.time-this._opening.at<.6)return;
        this._requestCue({...this._opening,kind:'opening',scope:`${scene.mission}:opening`,level:1,fade:1.2});this._opening=null;return;
      }
      if(!desired||this.time-this._entryAt<.5)return;
      this._opening=null;
      const next=this._pick(desired);
      if(next)this._requestCue({...desired,cue:next.id,index:next.index,expires:Infinity});
    }catch(_){this._opening=null;this._interrupt(.4);}
  }
  _readyContext(){return this.context?.state==='running'&&this.output&&typeof this.context.createBufferSource==='function'&&typeof this.context.createGain==='function'&&typeof this.context.decodeAudioData==='function';}
  _currentRequest(request){
    if(this._pending!==request||request.generation!==this._generation||request.context!==this.context||!this.enabled||!this.volume||!this._readyContext())return false;
    if(request.kind==='menu')return this.menu&&!this.playing&&!this.menuMuted;
    if(!this.playing||this._blocked||this._scene.silence||this._quiet&&this.time<this._quiet.until||this.time>request.expires)return false;
    if(request.kind==='opening')return this._scene.mission===request.mission;
    return request.scope===this._desired?.scope;
  }
  _requestCue(passage){
    const request={...passage,id:passage.cue,mission:this._scene.mission,level:passage.level??1,expires:passage.expires??Infinity,generation:++this._generation,context:this.context};
    this._pending=request;
    Promise.resolve().then(async()=>{
      if(!this._currentRequest(request))return;
      const buffer=await this.prepare(request.id);
      if(!this._currentRequest(request))return;
      this._pending=null;this._start(buffer,request);
    }).catch(error=>{
      if(this._pending!==request)return;
      this._pending=null;
      if(request.kind==='menu'){this.menuError=true;this._menuRetryAt=this.context.currentTime+15;}
      else{if(error.message!=='Music busy')this._failed.set(request.id,this.time+15);this._scoreRetryAt=this.time+3;}
    });
  }
  // Loading and permission to play are separate. A missed section can leave a
  // useful cached buffer, but can never leave a delayed musical surprise.
  prepare(id = 'containment-pulse') {
    const definition = CUES_BY_ID.get(id), context = this.context;
    if (this._buffers.has(id)) return Promise.resolve(this._buffers.get(id));
    if (this._loads.has(id)) return this._loads.get(id);
    if (!definition || !context || typeof this.fetcher !== 'function') return Promise.reject(new Error('Music unavailable'));
    if(this._loads.size>=2)return Promise.reject(new Error('Music busy'));
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

  _start(buffer, request = {id:'containment-pulse',kind:'score',level:1,fade:1.2}) {
    let source = null, gain = null, cue = null;
    try {
      const c = this.context, at = c.currentTime;
      source = c.createBufferSource(); gain = c.createGain();
      source.buffer = buffer; source.loop = false; gain.gain.setValueAtTime(0, at);
      source.connect(gain); gain.connect(this.output);
      cue={id:request.id,kind:request.kind,scope:request.scope,fade:request.fade||1.2,endAt:at+Math.min(buffer.duration,MAX_CUE_SECONDS),level:request.level,source,gain,mix:this._mix(request.kind),stopped:false};
      // Decode before fading the outgoing phrase, so a slow download keeps music playing.
      if(this._active&&!this._active.stopped)this._fadeVoice(this._active,cue.fade);
      this._active = cue; this._sources.add(cue);
      source.onended = () => {
        this._sources.delete(cue);
        if (this._active === cue) this._active = null;
        try { source.disconnect(); gain.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      };
      gain.gain.linearRampToValueAtTime(this.volume * cue.level * cue.mix, at + (request.fade||.8));
      if(request.fade){gain.gain.setValueAtTime(this.volume*cue.level*cue.mix,Math.max(at+request.fade,cue.endAt-request.fade));gain.gain.linearRampToValueAtTime(0,cue.endAt);}
      source.start(at); source.stop(at + Math.min(buffer.duration, MAX_CUE_SECONDS));
      if(request.kind==='menu'){
        this.menuError=false;this.menuIndex=(request.menuIndex+1)%MENU_SCORES.length;
        // Decode the other song during this phrase so the menu can crossfade
        // without a network gap. The shared cache still holds only two cues.
        this.prepare(MENU_SCORES[this.menuIndex].cue).catch(()=>{});
      }else{
        this.lastCue=request.id;
        if(request.cues)this.cursors.set(request.scope,(request.index+1)%request.cues.length);
        this._prime(this._desired);
      }

    } catch (_) {
      if (cue) { this._sources.delete(cue); if (this._active === cue) this._active = null; }
      try { source?.stop(); } catch (_) { /* A source may not have started. */ }
      try { source?.disconnect(); gain?.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      if(request.kind!=='menu'){this._failed.set(request.id,this.time+15);this._scoreRetryAt=this.time+3;}
      else {this.menuError=true;this._menuRetryAt=(this.context?.currentTime||0)+15;}
    }
  }

  _setLevel(seconds){
    if(!this.context)return;
    for(const cue of this._sources){
      if(cue.stopped)continue;
      try{
        const at=this.context.currentTime,param=cue.gain.gain;
        cue.mix=this._mix(cue.kind);
        param.cancelScheduledValues(at);param.setValueAtTime(param.value,at);
        param.linearRampToValueAtTime(this.volume*cue.level*cue.mix,at+seconds);
        if(cue.endAt>at+seconds){param.setValueAtTime(this.volume*cue.level*cue.mix,Math.max(at+seconds,cue.endAt-cue.fade));param.linearRampToValueAtTime(0,cue.endAt);}
      }catch(_){this._interrupt(.4);return;}
    }
  }
  _fadeVoice(voice,seconds){
    try{
      const at=this.context?.currentTime||0,param=voice.gain.gain;
      const end=Math.max(at,Math.min(voice.endAt,at+seconds));
      if(voice.stopped&&end>=voice.endAt)return;
      voice.stopped=true;voice.endAt=end;
      param.cancelScheduledValues(at);param.setValueAtTime(param.value,at);param.linearRampToValueAtTime(0,end);
      voice.source.stop(end);
    }catch(_){
      this._sources.delete(voice);
      try{voice.source.disconnect();voice.gain.disconnect();}catch(_){}
    }
  }
  _interrupt(seconds=.4){
    ++this._generation;this._pending=null;this._active=null;
    for(const voice of this._sources)this._fadeVoice(voice,seconds);
  }
}
