import {COMBAT_AUDIO_LIMITS,COMBAT_SOUND_SECONDS,synthesizeCombatSound,combatCueProfile} from './combat-audio.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,fallback=0)=>Number.isFinite(x)?x:fallback;
const AMBIENCE_HEADROOM=.55/.8;
export class FlightAudio {
  constructor(settings){
    this.settings=settings;this.ctx=null;this.active=false;this.lastGun=-Infinity;this.lastWarning=-Infinity;
    this.aircraft=null;this.status='ready';this.voices=new Set();this.lastCombat={hit:-Infinity,explosion:-Infinity};
    this.duckUntil=0;this.duckLevel=1;this.variation=0;
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
        this.osc=c.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=60;this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=400;this.osc.connect(this.filter);this.filter.connect(this.engine);this.osc.start();
        this.sub=c.createOscillator();this.sub.type='sine';this.sub.frequency.value=30;this.subGain=c.createGain();this.subGain.gain.value=.35;this.sub.connect(this.subGain);this.subGain.connect(this.engine);this.sub.start();
        this.pulse=c.createOscillator();this.pulse.frequency.value=10;this.pulseGain=c.createGain();this.pulseGain.gain.value=.025;this.pulse.connect(this.pulseGain);this.pulseGain.connect(this.engine.gain);this.pulse.start();
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
  setSettings(s){this.settings=s;this.sync();if(!s.sound||s.effectsVolume===0)this._stopEffects();}
  sync(){
    if(!this.ctx)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.sound&&this.active?clamp(finite(this.settings.volume,60),0,100)/100*.8:0,t,.035);
    this.effects.gain.setTargetAtTime(clamp(finite(this.settings.effectsVolume,70),0,100)/100,t,.02);
  }
  setActive(v){if(this.active===v)return;this.active=v;if(!v)this._stopEffects();this.sync();}
  update(sim,dt){
    if(!this.ctx||!this.active)return;const p=sim.player,c=this.ctx,t=c.currentTime;
    const jet=['f4','harrier','a10','f15','f16','f22','b2'].some(k=>(p.aircraft||sim.mission.aircraft||'').includes(k));
    const living=finite(p.health,100)>0&&!p.crashed&&p.alive!==false,engine=!!p.engine&&living;
    const throttle=engine?p.throttle||0:0,eng=engine?this.settings.engineVolume/100*(.07+throttle*.12)*AMBIENCE_HEADROOM:0;
    this.engine.gain.setTargetAtTime(eng,t,living?.12:.035);this.osc.frequency.setTargetAtTime(jet?70+throttle*150:42+throttle*65,t,.12);this.sub.frequency.setTargetAtTime(jet?40+throttle*65:21+throttle*32,t,.12);this.filter.frequency.setTargetAtTime(jet?450+throttle*1250:180+throttle*580,t,.12);this.pulse.frequency.setTargetAtTime(jet?80:8+throttle*18,t,.12);this.pulseGain.gain.setTargetAtTime(engine&&!jet?.015:0,t,.1);this.wind.gain.setTargetAtTime(living?clamp(p.speed/450,0,.42)*this.settings.engineVolume/100*AMBIENCE_HEADROOM:0,t,living?.2:.035);
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
