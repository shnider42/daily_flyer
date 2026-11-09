/* An original, gesture-unlocked station soundscape. No network or media files. */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export class Soundscape {
  constructor() {
    this.context=null;
    this.enabled=true;
    this.volume=.55;
    this.paused=true;
    this.disposed=false;
    this.player={x:0,z:0,yaw:0};
    this.room='';
    this.chapter=0;
    this.clock=0;
    this.footClock=0;
    this.footIndex=0;
    this.mixClock=0;
    this.nextAmbient=8;
    this.seed=72341;
    this.nodes=new Set();
    this.cooldowns=new Map();
  }

  random() {
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    return this.seed/4294967296;
  }

  async unlock() {
    if(this.disposed)return false;
    if(!this.context) {
      const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!AudioContext)return false;
      try {
        this.context=new AudioContext({latencyHint:'interactive'});
        this.buildGraph();
      } catch {
        this.context=null;
        return false;
      }
    }
    try {
      if(this.context.state!=='running')await this.context.resume();
      // Safari also benefits from a one-sample source started inside the gesture.
      const tick=this.context.createBufferSource();
      tick.buffer=this.context.createBuffer(1,1,this.context.sampleRate);
      tick.connect(this.context.destination);tick.start();
      tick.onended=()=>tick.disconnect();
      this.applyMaster();
      return this.context.state==='running';
    } catch { return false; }
  }

  buildGraph() {
    const c=this.context;
    this.master=c.createGain();this.master.gain.value=0;
    this.limiter=c.createDynamicsCompressor();
    this.limiter.threshold.value=-12;
    this.limiter.knee.value=12;
    this.limiter.ratio.value=7;
    this.limiter.attack.value=.006;
    this.limiter.release.value=.18;
    this.master.connect(this.limiter);this.limiter.connect(c.destination);
    this.fx=c.createGain();this.fx.gain.value=.8;this.fx.connect(this.master);
    this.reverbSend=c.createGain();this.reverbSend.gain.value=.12;
    this.convolver=c.createConvolver();
    const impulse=c.createBuffer(2,Math.floor(c.sampleRate*.85),c.sampleRate);
    for(let ch=0;ch<2;ch++){
      const samples=impulse.getChannelData(ch);
      for(let i=0;i<samples.length;i++)samples[i]=(this.random()*2-1)*Math.pow(1-i/samples.length,3.2)*.35;
    }
    this.convolver.buffer=impulse;
    this.reverbSend.connect(this.convolver);this.convolver.connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
    const samples=this.noise.getChannelData(0);
    let previous=0;
    for(let i=0;i<samples.length;i++){
      previous=(previous+.025*(this.random()*2-1))/1.025;
      samples[i]=previous*5+(this.random()*2-1)*.15;
    }

    this.humGain=c.createGain();this.humGain.gain.value=.035;this.humGain.connect(this.master);
    this.humOscillators=[];
    for(const frequency of [43,58.3,86.2]){
      const oscillator=c.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;
      const gain=c.createGain();gain.gain.value=frequency>80?.17:.42;
      oscillator.connect(gain);gain.connect(this.humGain);oscillator.start();
      this.humOscillators.push({oscillator,gain});
    }
    this.air=c.createBufferSource();this.air.buffer=this.noise;this.air.loop=true;
    this.airFilter=c.createBiquadFilter();this.airFilter.type='lowpass';this.airFilter.frequency.value=480;
    this.airGain=c.createGain();this.airGain.gain.value=.035;
    this.air.connect(this.airFilter);this.airFilter.connect(this.airGain);this.airGain.connect(this.master);this.air.start();
    this.applyMaster();
  }

  applyMaster() {
    if(!this.master||this.context?.state==='closed')return;
    const t=this.context.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled&&!this.paused?this.volume:0,t,.045);
  }

  setEnabled(value) {this.enabled=!!value;this.applyMaster();}
  setVolume(value) {this.volume=clamp(Number(value)||0,0,1);this.applyMaster();}
  setPaused(value) {
    this.paused=!!value;
    this.footClock=0;
    if(this.paused)this.nextAmbient=this.clock+6+this.random()*8;
    this.applyMaster();
  }

  isReady() {return !!this.context&&!this.disposed&&this.enabled&&!this.paused&&this.context.state==='running';}

  spatial(options={}) {
    if(!Number.isFinite(options.x)||!Number.isFinite(options.z))return {pan:options.pan||0,attenuation:1};
    const dx=options.x-this.player.x,dz=options.z-this.player.z;
    const distance=Math.hypot(dx,dz);
    const rightX=Math.cos(this.player.yaw),rightZ=-Math.sin(this.player.yaw);
    return {pan:clamp((dx*rightX+dz*rightZ)/Math.max(2,distance),-.9,.9),attenuation:1/(1+distance*.1)};
  }

  output(pan=0) {
    const c=this.context;
    let panner;
    if(c.createStereoPanner){panner=c.createStereoPanner();panner.pan.value=clamp(pan,-1,1);}
    else {
      panner=c.createPanner();panner.panningModel='equalpower';panner.distanceModel='linear';
      panner.setPosition(pan,0,1-Math.abs(pan));
    }
    panner.connect(this.fx);panner.connect(this.reverbSend);
    return panner;
  }

  noiseShot(duration,volume,frequency,options={}) {
    if(!this.isReady())return;
    const c=this.context,t=c.currentTime+(options.delay||0);
    const {pan,attenuation}=this.spatial(options);
    const source=c.createBufferSource();source.buffer=this.noise;source.loop=true;
    source.playbackRate.value=options.rate||1;
    const filter=c.createBiquadFilter();filter.type=options.filter||'lowpass';filter.frequency.value=frequency;filter.Q.value=options.q||.6;
    const gain=c.createGain();gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime(Math.max(.00001,volume*attenuation),t+Math.min(.012,duration*.1));
    gain.gain.exponentialRampToValueAtTime(.00001,t+duration);
    const out=this.output(pan);
    source.connect(filter);filter.connect(gain);gain.connect(out);
    source.start(t,this.random());source.stop(t+duration+.02);
    const entry={source,filter,gain,out};this.nodes.add(entry);
    source.onended=()=>{for(const node of Object.values(entry))try{node.disconnect();}catch{}this.nodes.delete(entry);};
  }

  tone(frequency,duration,volume,options={}) {
    if(!this.isReady())return;
    const c=this.context,t=c.currentTime+(options.delay||0);
    const {pan,attenuation}=this.spatial(options);
    const source=c.createOscillator();source.type=options.type||'sine';source.frequency.setValueAtTime(frequency,t);
    if(options.to)source.frequency.exponentialRampToValueAtTime(Math.max(20,options.to),t+duration);
    const gain=c.createGain();gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime(Math.max(.00001,volume*attenuation),t+.008);
    gain.gain.exponentialRampToValueAtTime(.00001,t+duration);
    const out=this.output(pan);source.connect(gain);gain.connect(out);
    source.start(t);source.stop(t+duration+.02);
    const entry={source,gain,out};this.nodes.add(entry);
    source.onended=()=>{for(const node of Object.values(entry))try{node.disconnect();}catch{}this.nodes.delete(entry);};
  }

  step({water=false,running=false,crouching=false}={}) {
    if(!this.isReady())return;
    const room=typeof this.room==='object'?(this.room.kind||this.room.name||''):String(this.room);
    const metal=/gantry|workshop|catwalk|core|grate|dock/i.test(room);
    const wet=water||/intake|pump|sump/i.test(room);
    const intensity=(crouching?.45:running?1:.72)*(.86+this.random()*.28);
    const pan=(this.footIndex++%2?1:-1)*.15;
    this.tone(metal?91:58,.13,.075*intensity,{pan,to:metal?62:39});
    this.noiseShot(metal?.1:.08,.18*intensity,metal?2300:670,{pan,filter:metal?'bandpass':'lowpass',q:metal?1.7:.6,rate:.85+this.random()*.3});
    this.noiseShot(.095,.065*intensity,wet?1500:900,{pan:-pan,delay:.055,rate:.9+this.random()*.3});
    if(wet)this.noiseShot(.24,.15*intensity,1800,{pan,filter:'bandpass',q:.5,delay:.025});
    if(metal)this.tone(210+this.random()*45,.22,.025*intensity,{pan,delay:.015,to:190});
  }

  update(dt,{chapter=0,room='',water=false,moving=false,running=false,crouching=false,threat=0,player}={}) {
    if(player)this.player={...this.player,...player};
    this.room=room;this.chapter=chapter;
    if(!this.isReady())return;
    const step=Math.min(.1,Math.max(0,Number(dt)||0));
    this.clock+=step;
    const c=this.context,t=c.currentTime;
    const danger=clamp(Number(threat)||0,0,1);
    const roomName=typeof room==='object'?(room.kind||room.name||''):String(room);
    this.mixClock-=step;
    if(this.mixClock<=0){
      this.mixClock=.2;
      const machine=/core|pump|gantry|workshop/i.test(roomName);
      const mix=[
        [this.humGain.gain,(machine?.05:.025)+danger*.018],
        [this.airGain.gain,water?.065:.028],
        [this.airFilter.frequency,water?1100:480],
        [this.reverbSend.gain,/gantry|core|pump/i.test(roomName)?.23:.09]
      ];
      for(const [param,target] of mix){param.cancelScheduledValues(t);param.setTargetAtTime(target,t,.8);}
    }

    if(moving){
      this.footClock+=step;
      const cadence=crouching?.68:running?.32:.49;
      if(this.footClock>=cadence){this.footClock%=cadence;this.step({water,running,crouching});}
    } else this.footClock=Math.min(this.footClock,.18);

    if(this.clock>=this.nextAmbient){
      this.nextAmbient=this.clock+8+this.random()*13;
      const pan=this.random()>.5?.65:-.65;
      if(water||this.random()<.42){
        this.tone(470+this.random()*220,.18,.025,{pan,to:150,delay:.02});
        this.noiseShot(.45,.035,1700,{pan,filter:'bandpass',q:2});
      } else {
        this.tone(78+this.random()*25,.6,.055,{pan,to:45});
        this.noiseShot(.22,.05,550,{pan});
        if(this.random()>.45)this.tone(61,.45,.035,{pan,delay:.38,to:38});
      }
      if(Number(chapter)>1&&this.random()>.55){
        this.noiseShot(1.8,.026,650,{pan,filter:'bandpass',q:5,delay:.9});
        this.tone(119,1.5,.013,{pan,to:87,delay:.9});
      }
    }
  }

  play(name,options={}) {
    if(!this.isReady())return;
    const now=this.context.currentTime;
    const minimum={enemy:.5,tool:.15,damage:.25,footstep:.15,water:.2}[name]||.07;
    if(now-(this.cooldowns.get(name)??-100)<minimum)return;
    this.cooldowns.set(name,now);
    const level=clamp(Number(options.intensity)||1,.1,2);
    const o={...options};
    switch(name){
      case 'door':case 'gate':
        this.noiseShot(1.15,.16*level,680,{...o,filter:'bandpass',q:1.8});
        this.tone(69,.85,.12*level,{...o,to:48});
        this.noiseShot(.16,.2*level,1500,{...o,delay:.9});
        break;
      case 'valve':case 'switch':case 'breaker':
        this.noiseShot(.12,.18*level,1800,{...o,filter:'bandpass',q:1});
        this.tone(115,.18,.08*level,{...o,to:72});
        if(name==='valve')this.noiseShot(.7,.07*level,900,{...o,delay:.06,filter:'bandpass',q:2.4});
        break;
      case 'tool':case 'pulse':
        this.tone(190,.3,.1*level,{...o,type:'triangle',to:43});
        this.noiseShot(.2,.17*level,2300,{...o,filter:'bandpass',q:1.5});
        this.tone(640,.12,.045*level,{...o,to:150});
        break;
      case 'enemy':case 'threat':
        this.tone(66,.8,.11*level,{...o,to:39});
        this.noiseShot(.7,.09*level,550,{...o,filter:'bandpass',q:4});
        break;
      case 'damage':case 'hurt':
        this.noiseShot(.18,.24*level,550,o);
        this.tone(58,.4,.13*level,{...o,to:27});
        break;
      case 'success':case 'complete':
        this.tone(220,.45,.07*level,o);
        this.tone(330,.65,.06*level,{...o,delay:.12});
        this.tone(440,.8,.04*level,{...o,delay:.27});
        break;
      case 'pickup':case 'note':
        this.noiseShot(.12,.08*level,1700,o);
        this.tone(390,.18,.045*level,o);
        this.tone(590,.22,.035*level,{...o,delay:.09});
        break;
      case 'locked':case 'error':
        this.tone(136,.16,.07*level,{...o,type:'triangle'});
        this.tone(118,.19,.06*level,{...o,type:'triangle',delay:.16});
        break;
      case 'water':case 'drain':
        this.noiseShot(1.8,.22*level,750,{...o,filter:'bandpass',q:.6});
        this.tone(49,1.4,.08*level,{...o,to:30});
        break;
      case 'jump':
        this.noiseShot(.14,.085*level,750,o);break;
      case 'land':
        this.noiseShot(.18,.18*level,650,o);this.tone(52,.2,.07*level,{...o,to:32});break;
      case 'flashlight':
        this.noiseShot(.035,.1*level,2000,o);break;
      case 'alarm':
        this.tone(310,.65,.055*level,{...o,to:360});
        this.tone(310,.65,.045*level,{...o,to:360,delay:.85});break;
      case 'footstep':this.step(options);break;
      default:this.noiseShot(.09,.07*level,950,o);
    }
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;
    for(const entry of this.nodes){try{entry.source.stop();}catch{}for(const node of Object.values(entry))try{node.disconnect();}catch{}}
    this.nodes.clear();
    for(const {oscillator,gain} of this.humOscillators||[]){try{oscillator.stop();oscillator.disconnect();gain.disconnect();}catch{}}
    try{this.air?.stop();}catch{}
    for(const node of [this.air,this.airFilter,this.airGain,this.humGain,this.fx,this.reverbSend,this.convolver,this.master,this.limiter])try{node?.disconnect();}catch{}
    if(this.context&&this.context.state!=='closed')this.context.close().catch(()=>{});
    this.context=null;
  }
}
