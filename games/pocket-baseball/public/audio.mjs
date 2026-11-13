/** Small synthesized ballpark sounds. No asset downloads or audio before a gesture. */
export class BallparkAudio {
  constructor(enabled = true) { this.enabled = enabled; this.context = null; this.master = null; this.crowdNode = null; this.lastEvent = 0; }
  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = .42;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Gameplay remains available if a browser declines audio. */ }
  }
  setEnabled(enabled) { this.enabled = !!enabled; if (this.master) this.master.gain.setTargetAtTime(enabled ? .42 : 0, this.context.currentTime, .04); if (enabled) this.unlock(); }
  tone(frequency, duration = .12, volume = .1, type = 'sine', delay = 0, endFrequency = frequency) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay;
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),t+duration);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.005);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+duration+.02);
  }
  noise(duration, volume, {frequency = 1500, type = 'bandpass', delay = 0, attack = .002} = {}) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx=this.context,t=ctx.currentTime+delay,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.55;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+attack);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+duration+.03);
  }
  bat(quality = .6) { this.noise(.085,.55,{frequency:2400,type:'highpass'});this.tone(190+quality*110,.095,.22,'triangle',0,85);this.noise(.20,.12,{frequency:800}); }
  glove() { this.noise(.10,.26,{frequency:850,type:'lowpass'});this.tone(105,.07,.12,'sine',0,55); }
  whoosh() { this.noise(.14,.08,{frequency:1900,attack:.03}); }
  crowd(big = false) {
    this.noise(big?2.5:1.2,big?.17:.085,{frequency:1000,attack:big?.35:.2});
    if(big){this.tone(640,.65,.018,'sine',.3,700);this.tone(880,.45,.012,'sine',.5,740);}
  }
  organ() { const notes=[261.63,329.63,392,523.25,440,523.25];notes.forEach((n,i)=>{this.tone(n,.21,.075,'triangle',i*.14);this.tone(n*2,.17,.018,'sine',i*.14);}); }
  event(event) {
    if (!event) return;
    const type=event.type;
    if(type==='contact') this.bat(event.quality??.6);
    else if(type==='catch') this.glove();
    else if(type==='run') this.crowd(true);
    else if(type==='out') { this.tone(370,.11,.035,'triangle');this.crowd(false); }
    else if(type==='final') {this.organ();this.crowd(true);}
    else if(type==='half') this.organ();
  }
  suspend() { if(this.context?.state==='running') this.context.suspend().catch(()=>{}); }
}
