/* Small gesture-unlocked sound effects. No remote audio, music, or autoplay. */
export class AudioEngine {
  constructor() {
    this.context = null; this.master = null; this.enabled = true; this.lastEventId = -1;
  }
  unlock() {
    if (!this.context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      try { this.context = new Audio(); this.master = this.context.createGain(); this.master.gain.value = this.enabled ? .3 : 0; this.master.connect(this.context.destination); }
      catch { this.context = null; return; }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }
  setEnabled(value) {
    this.enabled = !!value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.enabled ? .3 : 0, this.context.currentTime, .025);
  }
  _tone(freq, duration, volume = .1, type = 'sine', delay = 0, end = freq) {
    const a=this.context;if(!a||!this.enabled||a.state!=='running')return;
    const at=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();o.type=type;
    o.frequency.setValueAtTime(freq,at);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.006);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.connect(g);g.connect(this.master);o.start(at);o.stop(at+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  _noise(duration=.12,volume=.12,lowpass=1700) {
    const a=this.context;if(!a||!this.enabled||a.state!=='running')return;
    const n=Math.ceil(a.sampleRate*duration),buffer=a.createBuffer(1,n,a.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*(1-i/n);
    const src=a.createBufferSource(),g=a.createGain(),f=a.createBiquadFilter();src.buffer=buffer;f.type='lowpass';f.frequency.value=lowpass;
    g.gain.value=volume;src.connect(f);f.connect(g);g.connect(this.master);src.start();src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();};
  }
  menuClick() { this._tone(460,.065,.065,'sine',0,700); }
  event(event) {
    if(!event||event.id===this.lastEventId)return;this.lastEventId=event.id;
    switch(event.type) {
      case 'pass':case 'bump':case 'dig':case 'hit':this._tone(190,.13,.26,'sine',0,70);this._noise(.05,.09,1000);break;
      case 'set':this._tone(330,.1,.12,'sine',0,190);this._noise(.04,.055,1600);break;
      case 'spike':this._tone(150,.15,.32,'triangle',0,50);this._noise(.075,.25,2200);break;
      case 'serve':this._tone(240,.14,.22,'sine',0,80);this._noise(.07,.13,1600);break;
      case 'block':case 'net':this._tone(130,.14,.18,'triangle',0,65);this._noise(.08,.18,1300);break;
      case 'dive':this._noise(.25,.18,700);break;
      case 'point':case 'score':this._tone(1046,.14,.10,'sine');this._tone(1397,.22,.08,'sine',.1);break;
      case 'setWon':this._tone(523,.22,.1);this._tone(659,.22,.1,'sine',.12);this._tone(784,.38,.1,'sine',.24);break;
      case 'match':case 'matchWon':this._tone(523,.26,.12);this._tone(659,.26,.12,'sine',.14);this._tone(784,.26,.12,'sine',.28);this._tone(1047,.6,.12,'sine',.44);break;
    }
  }
}
