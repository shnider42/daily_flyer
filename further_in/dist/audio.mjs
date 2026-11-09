// Original procedural sound. No external media, samples, or network requests.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export class Sound{
  constructor(){
    this.ctx=null;
    this.volume=.65;
    this.muted=false;
    this.nodes=new Set();
    this.state=null;
    this.phase=null;
    this.lastStep=0;
    this.whisperClock=.6;
    this.lastChoices=0;
    this.gardenStarted=false;
    this.serviceClock=4.5;
  }

  async unlock(){
    if(!this.ctx){
      const A=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!A)return;
      this.ctx=new A();
      const c=this.ctx;
      this.master=c.createGain();
      this.master.gain.value=this.muted?0:this.volume;
      const limiter=c.createDynamicsCompressor();
      limiter.threshold.value=-12;
      limiter.knee.value=16;
      limiter.ratio.value=6;
      this.master.connect(limiter);
      limiter.connect(c.destination);
      this.whispers=c.createGain();
      this.whispers.connect(this.master);
      this.noise=c.createBuffer(1,c.sampleRate*3,c.sampleRate);
      const data=this.noise.getChannelData(0);
      let last=0;
      for(let i=0;i<data.length;i++){
        last=(last+Math.random()*.08-.04)*.98;
        data[i]=last;
      }
      this.setupBed();
    }
    if(this.ctx.state!=='running')await this.ctx.resume();
  }

  setupBed(){
    const c=this.ctx;
    this.hum=c.createGain();
    this.hum.gain.value=0;
    this.hum.connect(this.master);
    for(const f of[60,120,179.8]){
      const o=c.createOscillator(),g=c.createGain();
      o.type='sine';
      o.frequency.value=f;
      g.gain.value=f===60?.5:.15;
      o.connect(g);
      g.connect(this.hum);
      o.start();
    }
    this.air=c.createGain();
    this.air.gain.value=0;
    this.air.connect(this.master);
    const source=c.createBufferSource(),filt=c.createBiquadFilter();
    source.buffer=this.noise;
    source.loop=true;
    filt.type='lowpass';
    filt.frequency.value=420;
    source.connect(filt);
    filt.connect(this.air);
    source.start();
  }

  // Keep the ambient graph; discard sounds and clocks from the previous attempt.
  reset(state=null){
    this.stopVoices();
    this.state=state;
    this.phase=null;
    this.lastStep=state?.step||0;
    this.whisperClock=.6;
    this.lastChoices=state?.choices||0;
    this.gardenStarted=false;
    this.serviceClock=4.5;
    if(this.ctx){
      const t=this.ctx.currentTime;
      for(const node of[this.hum,this.air,this.whispers]){
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(node===this.whispers?1:0,t);
      }
    }
  }

  syncState(state){
    if(!state)return;
    if(state!==this.state)this.reset(state);
    if(state.phase===this.phase)return;
    this.phase=state.phase;
    // The beautiful room must end with the blackout, including its sustained tones.
    if(state.phase!=='garden')this.stopVoices('garden');
    if(state.phase==='blackout'||state.phase==='ghost'){
      this.stopVoices('whisper');
      this.whisperClock=state.phase==='ghost'?.65:.6;
    }
    if(state.phase==='blackout'&&this.ctx){
      const t=this.ctx.currentTime;
      for(const node of[this.hum,this.air]){
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(0,t);
      }
    }
  }

  setPaused(paused){
    this.muted=paused;
    if(this.ctx)this.master.gain.setTargetAtTime(paused?0:this.volume,this.ctx.currentTime,.08);
  }

  setVolume(volume){
    this.volume=clamp(Number(volume)||0,0,1);
    if(this.ctx&&!this.muted)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.1);
  }

  track(source,gain,nodes,tag){
    const voice={source,gain,nodes,tag,cleaned:false};
    this.nodes.add(voice);
    source.onended=()=>this.forget(voice);
    return voice;
  }

  forget(voice){
    if(voice.cleaned)return;
    voice.cleaned=true;
    this.nodes.delete(voice);
    for(const node of voice.nodes){try{node.disconnect();}catch{}}
  }

  stopVoices(tag){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    for(const voice of [...this.nodes]){
      if(tag&&voice.tag!==tag)continue;
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(0,t);
      try{voice.source.stop(t);}catch{}
      this.forget(voice);
    }
  }

  panner(pan){
    const node=this.ctx.createStereoPanner?.()||this.ctx.createGain();
    if(node.pan)node.pan.value=clamp(pan,-1,1);
    return node;
  }

  tone(f,end,duration,volume=.1,type='sine',pan=0,tag='effect'){
    if(!this.ctx||this.ctx.state!=='running'||this.muted)return;
    const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain(),p=this.panner(pan);
    duration=Math.max(.04,duration);
    o.type=type;
    o.frequency.setValueAtTime(Math.max(1,f),t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,end),t+duration);
    g.gain.setValueAtTime(.001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.002,volume),t+.025);
    g.gain.exponentialRampToValueAtTime(.001,t+duration);
    o.connect(g);
    g.connect(p);
    p.connect(tag==='whisper'?this.whispers:this.master);
    this.track(o,g,[o,g,p],tag);
    o.start();
    o.stop(t+duration+.03);
  }

  breath(duration=.7,volume=.1,freq=1200,pan=0,tag='effect'){
    if(!this.ctx||this.ctx.state!=='running'||this.muted)return;
    const c=this.ctx,t=c.currentTime,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=this.panner(pan);
    duration=Math.max(.04,duration);
    n.buffer=this.noise;
    n.loop=true;
    f.type='bandpass';
    f.frequency.setValueAtTime(freq,t);
    f.frequency.linearRampToValueAtTime(freq*.55,t+duration);
    f.Q.value=2;
    g.gain.setValueAtTime(.001,t);
    g.gain.linearRampToValueAtTime(volume,t+duration*.2);
    for(let i=1;i<=4;i++)g.gain.linearRampToValueAtTime(volume*(i%2?.35:.9),t+duration*(.2+i*.14));
    g.gain.linearRampToValueAtTime(0,t+duration);
    n.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(tag==='whisper'?this.whispers:this.master);
    this.track(n,g,[n,f,g,p],tag);
    n.start(t,Math.random());
    n.stop(t+duration+.02);
  }

  event(type,state=this.state){
    this.syncState(state);
    if(!this.ctx||this.ctx.state!=='running'||this.muted)return;
    // Before the pursuit the yellow rooms have no footsteps, tool buzz, or ambient creature cues.
    if(state?.level===2&&!state.chasing&&!['pickup','screech'].includes(type))return;
    if(type==='door'){
      this.tone(115,44,.42,.13,'triangle');
      this.breath(.2,.18,450);
    }
    if(type==='door-close'){
      this.tone(84,38,.3,.10,'triangle',.3);
      this.breath(.18,.13,340,.3);
    }
    if(type==='distant'){
      this.tone(54,28,2.6,.085,'sine',-.7);
      this.breath(1.5,.06,320,.8);
    }
    if(type==='screech'){
      this.tone(890,168,1.5,.12,'sawtooth');
      this.tone(1260,322,1.3,.07,'square',-.3);
      this.breath(1.6,.42,2300,.5);
    }
    if(type==='pulse'){
      this.tone(68,160,.24,.2,'triangle');
      this.breath(.28,.3,1700);
    }
    if(type==='fall'){
      this.breath(1.1,.45,330);
      this.tone(100,21,1.1,.14);
    }
    if(type==='caught'||type==='medal'){
      this.tone(48,25,.55,.2);
      this.breath(.7,.25,500);
    }
    if(type==='ghost'){
      // This continues the whispers; only floor two has the sudden mechanical scream.
      this.breath(2.3,.32,1700,-.5,'whisper');
      this.tone(92,91,3,.09,'sine',0,'whisper');
    }
    if(type==='cut')this.tone(60,16,.45,.07);
    if(type==='release')for(const f of[146.8,220,293.7])this.tone(f,f,3.5,.06);
    if(type==='pickup')this.tone(440,550,.12,.04);
    if(type==='valve'){
      this.tone(118,72,.34,.055,'triangle',-.15);
      this.breath(.42,.12,520,-.15);
    }
    if(type==='drain'){
      this.breath(4,.16,360,.25);
      this.tone(57,32,3.5,.07,'sine');
    }
    if(type==='generator-on'){
      this.tone(34,60,1.1,.065,'triangle',-.35);
      this.breath(.9,.075,210,-.35);
    }
    if(type==='generator-off'){
      this.tone(60,24,.65,.045,'triangle',-.35);
      this.breath(.15,.04,470);
    }
    if(type==='attention'){
      // A scrape through a partition, not another pursuit-floor scream.
      this.breath(.72,.14,950,.65);
      this.tone(78,57,.45,.035,'triangle',.65);
    }
    if(type==='inspection'){
      this.breath(.13,.07,720,.3);
      this.tone(92,61,.12,.035,'triangle');
    }
    if(type==='latch'||type==='safe'){
      this.tone(109,44,.17,.045,'triangle');
      this.breath(.12,.065,410);
    }
    if(type==='transit'){
      this.tone(51,36,1.1,.055,'sine');
      this.breath(.8,.08,290);
    }
  }

  update(s,rawDt){
    this.syncState(s);
    if(!this.ctx||this.ctx.state!=='running'||this.muted)return;
    const dt=clamp(Number(rawDt)||0,0,.1),t=this.ctx.currentTime;
    if(s.status!=='playing'){
      this.hum.gain.setTargetAtTime(0,t,.08);
      this.air.gain.setTargetAtTime(0,t,.08);
      this.whispers.gain.setTargetAtTime(0,t,.08);
      return;
    }
    let hum=0,air=.04,whisperGain=1;
    if(s.level===1){hum=.025;air=.05;}
    if(s.level===2){hum=.07+.006*Math.sin(s.time*1.2);air=0;}
    if(s.level===4){
      hum=.012;air=.027;
      this.serviceClock-=dt;
      if(this.serviceClock<=0&&!s.transition){
        this.serviceClock=6.2+Math.random()*2.8;
        if((s.puzzle?.water||0)>.1){
          this.tone(610,380,.11,.018,'sine',Math.sin(s.time)*.65);
          this.breath(.14,.025,1600,Math.sin(s.time)*.65);
        }
      }
    }
    if(s.level===5){
      // The motor is a usable cue: its quieter phase stays audible without headphones.
      hum=s.puzzle?.hum ? .095+.009*Math.sin(s.time*9) : .001;
      air=s.puzzle?.hum ? .018 : .007;
    }
    if(s.level===6){hum=.008;air=.025;}
    if(s.phase==='garden'){
      air=.025;
      if(!this.gardenStarted){
        this.gardenStarted=true;
        const remaining=Math.max(.1,4.8-s.phaseTime);
        this.tone(392,392,remaining,.04,'sine',0,'garden');
        this.tone(493.9,493.9,remaining,.025,'sine',0,'garden');
      }
    }
    if(s.phase==='blackout'){hum=0;air=0;}
    if(s.level===3&&s.phase==='doors'){
      hum=.009;
      air=.04;
      if(s.choices!==this.lastChoices){
        this.lastChoices=s.choices;
        this.whisperClock=Math.min(this.whisperClock,.5);
      }
      if(s.choices>=3&&!s.transition){
        const intensity=clamp(s.choices-3,0,6);
        this.whisperClock-=dt;
        if(this.whisperClock<=0){
          this.whisperClock=Math.max(.85,3-intensity*.4)+Math.random()*.45;
          this.breath(1.1+Math.random()*.8,.13+intensity*.075,1200+Math.random()*1600,Math.random()*2-1,'whisper');
          this.tone(145+Math.random()*50,88,.8,.007+intensity*.003,'triangle',Math.random()*2-1,'whisper');
        }
      }
    }
    if(s.phase==='ghost'){
      const progress=clamp((s.stare||0)/4.5,0,1);
      whisperGain=1-progress;
      air=.1*whisperGain;
      this.whisperClock-=dt;
      if(this.whisperClock<=0&&whisperGain>.02){
        this.whisperClock=.7;
        this.breath(.75,.35,1600,Math.sin(s.time),'whisper');
      }
    }
    this.hum.gain.setTargetAtTime(hum,t,.15);
    this.air.gain.setTargetAtTime(air,t,.18);
    // A separate bus fades already-playing whispers as well as newly scheduled ones.
    this.whispers.gain.setTargetAtTime(whisperGain,t,.12);
    const footsteps=s.phase!=='garden'&&s.phase!=='blackout'&&!(s.level===2&&!s.chasing)&&!s.transition;
    if(!footsteps||s.moving<.075||s.step<this.lastStep)this.lastStep=s.step;
    else if(s.step-this.lastStep>1.45){
      this.lastStep=s.step;
      const water=s.level===4&&(s.puzzle?.water||0)>.15&&s.player&&
        (s.waterAreas||[]).some(a=>Math.abs(s.player.x-a.x)<a.width/2&&Math.abs(s.player.z-a.z)<a.depth/2);
      this.breath(water?.19:.11,water?.12:.16,water?780:260,0,'footstep');
      this.tone(water?112:90,45,.09,.035,'sine',0,'footstep');
    }
  }
}
