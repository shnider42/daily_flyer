const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class FlightAudio {
  constructor(settings){this.settings=settings;this.ctx=null;this.active=false;this.lastGun=0;this.lastWarning=0;this.aircraft=null;this.status='ready';}
  async unlock(){
    if(!this.settings.sound)return;
    try{
      if(!this.ctx){
        const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC){this.status='unavailable';return;}
        this.ctx=new AC();const c=this.ctx;
        this.master=c.createGain();this.master.gain.value=0;this.compressor=c.createDynamicsCompressor();this.master.connect(this.compressor);this.compressor.connect(c.destination);
        this.engine=c.createGain();this.engine.gain.value=0;this.engine.connect(this.master);
        this.osc=c.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=60;this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=400;this.osc.connect(this.filter);this.filter.connect(this.engine);this.osc.start();
        this.sub=c.createOscillator();this.sub.type='sine';this.sub.frequency.value=30;this.subGain=c.createGain();this.subGain.gain.value=.35;this.sub.connect(this.subGain);this.subGain.connect(this.engine);this.sub.start();
        this.pulse=c.createOscillator();this.pulse.frequency.value=10;this.pulseGain=c.createGain();this.pulseGain.gain.value=.025;this.pulse.connect(this.pulseGain);this.pulseGain.connect(this.engine.gain);this.pulse.start();
        const b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){const white=Math.random()*2-1;last=(last+.02*white)/1.02;d[i]=last*3.5;}
        this.noiseBuffer=b;this.windSrc=c.createBufferSource();this.windSrc.buffer=b;this.windSrc.loop=true;this.windFilter=c.createBiquadFilter();this.windFilter.type='highpass';this.windFilter.frequency.value=250;this.wind=c.createGain();this.wind.gain.value=0;this.windSrc.connect(this.windFilter);this.windFilter.connect(this.wind);this.wind.connect(this.master);this.windSrc.start();
      }
      if(this.ctx.state!=='running')await this.ctx.resume();this.status=this.ctx.state==='running'?'ready':'needs-gesture';this.sync();
    }catch{this.status='needs-gesture';}
  }
  setSettings(s){this.settings=s;this.sync();}
  sync(){if(!this.ctx)return;const c=this.ctx,t=c.currentTime;this.master.gain.setTargetAtTime(this.settings.sound&&this.active?this.settings.volume/100*.55:0,t,.08);}
  setActive(v){this.active=v;this.sync();}
  update(sim,dt){
    if(!this.ctx||!this.active)return;const p=sim.player,c=this.ctx,t=c.currentTime,a=sim.aircraft||{};const jet=['f4','harrier','a10','f15','f16','f22','b2'].some(k=>(p.aircraft||sim.mission.aircraft||'').includes(k));
    const throttle=p.engine?p.throttle||0:0,eng=p.engine?this.settings.engineVolume/100*(.07+throttle*.12):0;
    this.engine.gain.setTargetAtTime(eng,t,.12);this.osc.frequency.setTargetAtTime(jet?70+throttle*150:42+throttle*65,t,.12);this.sub.frequency.setTargetAtTime(jet?40+throttle*65:21+throttle*32,t,.12);this.filter.frequency.setTargetAtTime(jet?450+throttle*1250:180+throttle*580,t,.12);this.pulse.frequency.setTargetAtTime(jet?80:8+throttle*18,t,.12);this.pulseGain.gain.setTargetAtTime(p.engine&&!jet?.015:0,t,.1);this.wind.gain.setTargetAtTime(clamp(p.speed/450,0,.42)*this.settings.engineVolume/100,t,.2);
    if(p.stalled&&t-this.lastWarning>1.8){this.tone(200,.14,'triangle',.06);this.lastWarning=t;}
  }
  tone(freq,duration=.15,type='sine',volume=.1,slide=0){if(!this.ctx||!this.settings.sound)return;const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume*this.settings.effectsVolume/100,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start();o.stop(t+duration+.03);o.onended=()=>{o.disconnect();g.disconnect();};}
  noise(duration=.2,volume=.3,freq=700){if(!this.ctx||!this.settings.sound)return;const c=this.ctx,t=c.currentTime,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noiseBuffer;f.type='lowpass';f.frequency.value=freq;g.gain.setValueAtTime(volume*this.settings.effectsVolume/100,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f);f.connect(g);g.connect(this.master);s.start();s.stop(t+duration+.02);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};}
  cue(kind){if(!this.active)return;const t=this.ctx?.currentTime||0;switch(kind){case'gun':if(t-this.lastGun>.095){this.noise(.09,.32,1800);this.tone(80,.05,'triangle',.05,30);this.lastGun=t;}break;case'cannon':this.noise(.23,.48,1150);this.tone(105,.2,'triangle',.12,28);break;case'heavycannon':this.noise(.7,.68,550);this.tone(78,.65,'sine',.25,23);break;case'explosion':case'hit':this.noise(.65,.75,750);this.tone(65,.5,'sine',.17,22);break;case'missile':case'payload':this.noise(.45,.35,1700);break;case'lock':this.tone(1000,.14,'sine',.075);break;case'warning':this.tone(640,.25,'triangle',.08,520);break;case'success':this.tone(440,.4,'sine',.1);setTimeout(()=>this.tone(660,.5,'sine',.1),160);break;case'radio':this.noise(.1,.12,2400);break;default:this.tone(480,.08,'sine',.04);}}
}
