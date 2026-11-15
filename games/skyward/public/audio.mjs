import {COMBAT_AUDIO_LIMITS,COMBAT_SOUND_SECONDS,synthesizeCombatSound,combatCueProfile} from './combat-audio.mjs';
import {ENGINE_LAYER_NAMES,engineProfile,synthesizeEngineLayers,engineMix} from './engine-audio.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,fallback=0)=>Number.isFinite(x)?x:fallback;
const AMBIENCE_HEADROOM=.55/.8;
const ENGINE_CACHE_SIZE=5;
const PREVIEW_SECONDS=3.35;

function disconnectBank(bank){
  for(const {source,level} of bank.layers.values()){source.disconnect();level.disconnect();}
  bank.filter.disconnect();bank.gain.disconnect();
}

export class FlightAudio {
  constructor(settings){
    this.settings=settings;this.ctx=null;this.active=false;this.lastGun=-Infinity;this.lastWarning=-Infinity;
    this.status='ready';this.voices=new Set();this.lastCombat={hit:-Infinity,explosion:-Infinity};
    this.duckUntil=0;this.duckLevel=1;this.variation=0;
    this.engineBuffers=new Map();this.engineBank=null;this.retiringBank=null;this.enginePreview=null;this.previewRequest=0;
    this.engineLevel=0;this.windLevel=0;
    this.power=0;this.engineWasRunning=false;
  }
  async unlock(){
    if(!this.settings.sound)return;
    try{
      if(!this.ctx){
        const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC){this.status='unavailable';return;}
        this.ctx=new AC();const c=this.ctx;
        this.master=c.createGain();this.master.gain.value=0;this.compressor=c.createDynamicsCompressor();
        this.compressor.threshold.value=-11;this.compressor.knee.value=10;this.compressor.ratio.value=7;
        this.compressor.attack.value=.002;this.compressor.release.value=.18;
        this.master.connect(this.compressor);this.compressor.connect(c.destination);
        this.ambience=c.createGain();this.ambience.gain.value=1;this.ambience.connect(this.master);
        this.effects=c.createGain();this.effects.gain.value=0;this.effects.connect(this.master);
        this.engine=c.createGain();this.engine.gain.value=0;this.engine.connect(this.ambience);
        this.previewEngineGain=c.createGain();this.previewEngineGain.gain.value=0;this.previewEngineGain.connect(this.ambience);
        const b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=b.getChannelData(0),white=c.createBuffer(1,c.sampleRate*2,c.sampleRate),w=white.getChannelData(0);let last=0;
        for(let i=0;i<d.length;i++){const sample=Math.random()*2-1;last=(last+.02*sample)/1.02;d[i]=last*3.5;w[i]=sample;}
        this.noiseBuffer=white;this.windSrc=c.createBufferSource();this.windSrc.buffer=b;this.windSrc.loop=true;
        this.windFilter=c.createBiquadFilter();this.windFilter.type='highpass';this.windFilter.frequency.value=250;
        this.wind=c.createGain();this.wind.gain.value=0;this.windSrc.connect(this.windFilter);this.windFilter.connect(this.wind);this.wind.connect(this.ambience);this.windSrc.start();
        this.combatBuffers={};for(const kind of Object.keys(COMBAT_SOUND_SECONDS)){
          const samples=synthesizeCombatSound(kind,c.sampleRate),buffer=c.createBuffer(1,samples.length,c.sampleRate);buffer.getChannelData(0).set(samples);this.combatBuffers[kind]=buffer;
        }
      }
      if(this.ctx.state!=='running')await this.ctx.resume();this.status=this.ctx.state==='running'?'ready':'needs-gesture';this.sync();
    }catch{this.status='needs-gesture';}
  }
  setSettings(s){this.settings=s;if(!s.sound)this.stopEnginePreview();this.sync();if(!s.sound||s.effectsVolume===0)this._stopEffects();}
  sync(){
    if(!this.ctx)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.sound&&(this.active||this.enginePreview)?clamp(finite(this.settings.volume,60),0,100)/100*.8:0,t,.035);
    this.effects.gain.setTargetAtTime(clamp(finite(this.settings.effectsVolume,70),0,100)/100,t,.02);
    this.previewEngineGain.gain.setTargetAtTime(this._engineVolume(),t,.04);
  }
  setActive(v){
    if(this.active===v)return;
    this.active=v;
    if(v)this.stopEnginePreview();
    if(!v){
      this._stopEffects();
      if(this.ctx){
        const t=this.ctx.currentTime;
        this._setFlightLevels(0,0,t,.045,.07);
        this._releaseFlightBank(t);
      }
    }
    this.sync();
  }
  _engineVolume(){return .41*AMBIENCE_HEADROOM*clamp(finite(this.settings.engineVolume,60),0,100)/100;}
  _setFlightLevels(engine,wind,t,engineSlew,windSlew){
    if(engine!==this.engineLevel){
      this.engineLevel=engine;this.engine.gain.setTargetAtTime(engine,t,engineSlew);
    }
    if(wind!==this.windLevel&&(wind===0||Math.abs(wind-this.windLevel)>.0015)){
      this.windLevel=wind;this.wind.gain.setTargetAtTime(wind,t,windSlew);
    }
  }
  _buffersFor(aircraft){
    const cached=this.engineBuffers.get(aircraft);
    if(cached){this.engineBuffers.delete(aircraft);this.engineBuffers.set(aircraft,cached);return cached;}
    const samples=synthesizeEngineLayers(aircraft),buffers=new Map();
    for(const name of ENGINE_LAYER_NAMES){
      const pcm=samples[name],buffer=this.ctx.createBuffer(1,pcm.length,samples.sampleRate);
      buffer.getChannelData(0).set(pcm);buffers.set(name,buffer);
    }
    this.engineBuffers.set(aircraft,buffers);
    if(this.engineBuffers.size>ENGINE_CACHE_SIZE)this.engineBuffers.delete(this.engineBuffers.keys().next().value);
    return buffers;
  }
  _makeBank(aircraft,output,t){
    const c=this.ctx,filter=c.createBiquadFilter(),gain=c.createGain(),layers=new Map();
    filter.type='lowpass';filter.Q.value=.36;filter.connect(gain);gain.gain.value=0;gain.connect(output);
    const bank={aircraft,profile:engineProfile(aircraft),filter,gain,layers,targets:new Map(),onEnd:null};
    for(const [name,buffer] of this._buffersFor(aircraft)){
      const source=c.createBufferSource(),level=c.createGain();source.buffer=buffer;source.loop=true;
      level.gain.value=0;source.connect(level);level.connect(filter);source.start(t);
      layers.set(name,{source,level});
    }
    layers.get('core').source.onended=()=>{
      disconnectBank(bank);
      if(this.retiringBank===bank)this.retiringBank=null;
      bank.onEnd?.();
    };
    return bank;
  }
  _silenceBank(bank,t,fade=.045){
    if(!bank)return;
    bank.gain.gain.cancelScheduledValues(t);
    bank.gain.gain.setTargetAtTime(0,t,fade);
    for(const {source} of bank.layers.values())try{source.stop(t+fade*4);}catch{}
  }
  _releaseFlightBank(t){
    if(!this.engineBank)return;
    this._silenceBank(this.retiringBank,t,.002);
    this.retiringBank=this.engineBank;
    this._silenceBank(this.retiringBank,t,.032);
    this.engineBank=null;
  }
  _flightBank(aircraft,t){
    if(this.engineBank?.aircraft===aircraft)return this.engineBank;
    this._releaseFlightBank(t);
    this.engineBank=this._makeBank(aircraft,this.engine,t);
    return this.engineBank;
  }
  _applyEngineMix(bank,mix,t,seconds=.075){
    const target=(param,value,epsilon)=>{
      if(bank.targets.has(param)&&Math.abs(value-bank.targets.get(param))<=epsilon)return;
      param.setTargetAtTime(value,t,seconds);
      bank.targets.set(param,value);
    };
    target(bank.gain.gain,mix.gain,.006);
    target(bank.filter.frequency,mix.cutoff,0);
    for(const [name,{source,level}] of bank.layers){
      target(source.playbackRate,mix[name].rate,.003);
      target(level.gain,mix[name].gain,.006);
    }
  }
  async previewEngine(aircraft,{camera=this.settings.camera}={}){
    this.stopEnginePreview();
    const request=this.previewRequest;
    await this.unlock();
    if(request!==this.previewRequest||this.status!=='ready'||!this.ctx||!this.settings.sound||this.ctx.state!=='running')return false;
    const t=this.ctx.currentTime,bank=this._makeBank(aircraft||'avro504',this.previewEngineGain,t);
    this.enginePreview=bank;
    bank.onEnd=()=>{if(this.enginePreview===bank){this.enginePreview=null;this.sync();}};
    this.sync();
    const sequence=[[0,.08,.06],[.48,.96,.38],[1.77,.68,.38],[2.64,.20,.22]];
    for(const [at,power,slew] of sequence)this._applyEngineMix(bank,engineMix(bank.profile,{power,speed:power*196,camera}),t+at,slew);
    this._silenceBank(bank,t+PREVIEW_SECONDS-.24,.06);
    return true;
  }
  stopEnginePreview(){
    this.previewRequest++;
    if(!this.enginePreview)return;
    this._silenceBank(this.enginePreview,this.ctx.currentTime,.03);
    this.enginePreview=null;this.sync();
  }
  update(sim,dt,{camera=this.settings.camera}={}){
    if(!this.ctx||!this.active||this.enginePreview)return;
    const p=sim.player,t=this.ctx.currentTime,aircraft=p.aircraft||sim.mission.aircraft||'avro504';
    const living=finite(p.health,100)>0&&!p.crashed&&p.alive!==false;
    const underCanopy=p.bailout?.phase==='descending',engine=!!p.engine&&living&&!underCanopy;
    const engineVolume=this._engineVolume();
    if(engine){
      const changed=this.engineBank?.aircraft!==aircraft,bank=this._flightBank(aircraft,t);
      const throttle=clamp(finite(p.throttle),0,1);
      if(changed||!this.engineWasRunning)this.power=p.onGround?0:throttle;
      const slew=(throttle>=this.power?bank.profile.spool:bank.profile.spool*.67);
      this.power+=(throttle-this.power)*(1-Math.exp(-clamp(finite(dt),0,.25)/slew));
      this._applyEngineMix(bank,engineMix(bank.profile,{power:this.power,speed:p.speed,verticalSpeed:p.verticalSpeed,
        health:p.health/Math.max(1,finite(sim.aircraft?.health,120)),camera}),t);
    }else this._releaseFlightBank(t);
    this.engineWasRunning=engine;
    const cabin=camera==='cockpit'||camera==='gunner',airspeed=clamp(finite(p.speed)/470,0,1);
    const wind=living?engineVolume*(underCanopy?.19:(cabin?.31:.60)*airspeed**1.24):0;
    this._setFlightLevels(engine?engineVolume:0,wind,t,engine?.075:.09,living?.18:.035);
    if(t>=this.duckUntil&&this.duckLevel<1){this.duckLevel=1;this.ambience.gain.setTargetAtTime(1,t,.16);}
    if(living&&p.stalled&&t-this.lastWarning>1.8){this.tone(200,.14,'triangle',.06);this.lastWarning=t;}
  }
  _audible(){return !!(this.ctx&&this.ctx.state==='running'&&this.active&&this.settings.sound&&finite(this.settings.effectsVolume,70)>0&&finite(this.settings.volume,60)>0);}
  _stopEffects(){
    for(const voice of [...this.voices])voice.stop();
    if(this.ambience){this.duckUntil=0;this.duckLevel=1;this.ambience.gain.cancelScheduledValues(this.ctx.currentTime);this.ambience.gain.setTargetAtTime(1,this.ctx.currentTime,.025);}
  }
  _voice(kind,duration,gain,pan=0,priority=3,delay=0){
    if(!this._audible()||gain<=0)return null;
    if(this.voices.size>=COMBAT_AUDIO_LIMITS.voices){
      const oldest=[...this.voices].sort((a,b)=>a.priority-b.priority||a.at-b.at)[0];
      if(oldest.priority>priority)return null;oldest.stop();
    }
    const c=this.ctx,t=c.currentTime+delay,g=c.createGain(),nodes=[g];g.gain.setValueAtTime(gain,t);
    if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=clamp(pan,-.85,.85);g.connect(p);p.connect(this.effects);nodes.push(p);}else g.connect(this.effects);
    const voice={kind,priority,at:t,end:t+duration,gain:g,nodes,sources:[],finished:false};
    const finish=()=>{if(voice.finished)return;voice.finished=true;this.voices.delete(voice);for(const node of voice.nodes)node.disconnect();};
    voice.finish=finish;voice.stop=()=>{for(const source of voice.sources)try{source.stop(c.currentTime);}catch{}finish();};
    this.voices.add(voice);return voice;
  }
  _duck(amount,seconds){
    if(amount<=0)return;const t=this.ctx.currentTime;this.duckLevel=Math.min(this.duckLevel,1-clamp(amount,0,.85));this.duckUntil=Math.max(this.duckUntil,t+seconds);
    this.ambience.gain.cancelScheduledValues(t);this.ambience.gain.setTargetAtTime(this.duckLevel,t,.008);
  }
  _combat(kind,details={}){
    if(!this._audible())return false;const t=this.ctx.currentTime,hit=['hit','major-hit','heavyhit'].includes(kind),group=hit?'hit':kind;
    const profile=combatCueProfile(kind,details);if(profile.intensity<=0)return false;
    const interval=hit?COMBAT_AUDIO_LIMITS.hitInterval:kind==='explosion'?COMBAT_AUDIO_LIMITS.explosionInterval:kind==='gun'?.095:.06;
    // A major strike can interrupt a preceding light rattle rather than vanish
    // behind a burst of bullets; other duplicates in one packet are coalesced.
    if(t-finite(this.lastCombat[group],-Infinity)<interval&&!(hit&&profile.sound==='heavyhit'&&this.lastHitSound!=='heavyhit'))return false;
    const buffer=this.combatBuffers[profile.sound];if(!buffer)return false;
    const rate=[1,.97,1.045,.94][this.variation++%4]*profile.playbackRate,duration=buffer.duration/rate;
    const voice=this._voice(kind,duration,profile.gain,profile.pan,profile.priority);if(!voice)return false;
    const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter();s.buffer=buffer;s.playbackRate.value=rate;f.type='lowpass';f.frequency.value=profile.lowpass;f.Q.value=.45;
    s.connect(f);f.connect(voice.gain);voice.nodes.push(s,f);voice.sources.push(s);s.onended=voice.finish;s.start(t);s.stop(t+duration+.01);
    this.lastCombat[group]=t;if(hit)this.lastHitSound=profile.sound;this._duck(profile.duck,profile.duckSeconds);return true;
  }
  tone(freq,duration=.15,type='sine',volume=.1,slide=0,delay=0){
    const voice=this._voice('tone',duration+.03,1,0,5,delay);if(!voice)return;
    const c=this.ctx,t=voice.at,o=c.createOscillator();o.type=type;o.frequency.value=freq;
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+duration);
    voice.gain.gain.setValueAtTime(0,t);voice.gain.gain.linearRampToValueAtTime(volume,t+.008);voice.gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(voice.gain);voice.nodes.push(o);voice.sources.push(o);o.onended=voice.finish;o.start(t);o.stop(t+duration+.03);
  }
  noise(duration=.2,volume=.3,freq=700){
    const voice=this._voice('noise',duration+.02,volume);if(!voice)return;
    const c=this.ctx,t=voice.at,s=c.createBufferSource(),f=c.createBiquadFilter();s.buffer=this.noiseBuffer;f.type='lowpass';f.frequency.value=freq;
    voice.gain.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f);f.connect(voice.gain);voice.nodes.push(s,f);voice.sources.push(s);s.onended=voice.finish;s.start(t);s.stop(t+duration+.02);
  }
  cue(kind,details={}){
    if(!this._audible())return;const t=this.ctx.currentTime;
    switch(kind){
      case'gun':if(this._combat('gun',details))this.lastGun=t;break;
      case'cannon':case'heavycannon':case'explosion':case'nuclear':case'hit':case'major-hit':case'heavyhit':this._combat(kind,details);break;
      case'missile':case'payload':this.noise(.45,.35,1700);break;
      case'lock':this.tone(1000,.14,'sine',.075);break;
      case'warning':this.tone(640,.25,'triangle',.08,520);break;
      case'success':this.tone(440,.4,'sine',.1);this.tone(660,.5,'sine',.1,0,.16);break;
      case'radio':this.noise(.1,.1,2400);break;
      default:this.tone(480,.08,'sine',.04);
    }
  }
}
