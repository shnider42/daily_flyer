// Original procedural soundtrack and Foley; no fetched audio or paid services.
export class HouseAudio {
  constructor(){this.enabled=true;this.volume=.6;this.ctx=null;this.step=0;this.next=0;}
  start(){try{if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.4*this.volume;this.master.connect(this.ctx.destination);const n=this.ctx.sampleRate*2,b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*.14;const rain=this.ctx.createBufferSource();rain.buffer=b;rain.loop=true;const low=this.ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=900;rain.connect(low);low.connect(this.master);rain.start();}this.ctx.resume();}catch{}}
  tone(freq,duration=.1,volume=.12,type='sine',slide=0){if(!this.ctx||!this.enabled)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration);}
  noise(duration=.1,volume=.3,filter=1200){if(!this.ctx||!this.enabled)return;const b=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*duration),this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();s.buffer=b;g.gain.value=volume;f.type='lowpass';f.frequency.value=filter;s.connect(f);f.connect(g);g.connect(this.master);s.start();}
  mute(){this.enabled=!this.enabled;if(this.master)this.master.gain.value=this.enabled?.4*this.volume:0;return this.enabled;}
  events(events,selfId){for(const e of events){
    if(e.type==='shot'){this.noise(e.weapon==='shotgun'?.22:.11,e.playerId===selfId?.6:.15,2000);this.tone(e.weapon==='shotgun'?90:145,.13,.3,'triangle',-65);}
    if(e.type==='hit'&&e.playerId===selfId)this.tone(e.head?950:650,.045,.12,'sine');
    if(e.type==='board'||e.type==='repair'){this.noise(.08,.2,700);this.tone(100,.08,.08,'triangle',-40);}
    if(e.type==='breach'){this.noise(.4,.3,1000);this.tone(100,.6,.15,'sawtooth',-55);}
    if(e.type==='hurt'&&e.playerId===selfId){this.noise(.14,.35,500);this.tone(80,.2,.25,'triangle',-30);}
    if(e.type==='reload'&&e.playerId===selfId)this.noise(.12,.15,3500);
    if(['purchase','revive','clear'].includes(e.type)){this.tone(330,.3,.16);setTimeout(()=>this.tone(495,.4,.14),100);}
    if(e.type==='wave'){this.tone(65,.9,.3,'triangle');setTimeout(()=>this.tone(69,.9,.25,'triangle'),180);}
  }}
  update(state){if(!this.ctx||!this.enabled||state.status!=='playing')return;const t=this.ctx.currentTime;if(t<this.next)return;this.next=t+(state.phase==='prep'?.6:.43);const notes=[220,261.63,329.63,246.94,220,196,164.81,196];this.tone(notes[this.step%8],.45,.045,'sine');if(this.step%4===0)this.tone(notes[this.step%8]/4,.7,.08,'triangle');this.step++;}
}
