/** Original procedural audio. No downloaded recordings or background network calls. */
export class BreachAudio {
  constructor(enabled = true) { this.enabled = enabled; this.context = null; this.master = null; this.hum = null; this.playing = false; }
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.gain.value = .24; this.master.connect(this.context.destination);
        this.hum = this.context.createGain(); this.hum.gain.value = 0; this.hum.connect(this.master);
        const low = this.context.createOscillator(); low.type = 'sine'; low.frequency.value = 44; low.connect(this.hum); low.start();
        const upper = this.context.createOscillator(); upper.type = 'triangle'; upper.frequency.value = 66.2;
        const quiet = this.context.createGain(); quiet.gain.value = .12; upper.connect(quiet); quiet.connect(this.hum); upper.start();
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      this.setPlaying(this.playing);
    } catch (_) { /* Audio is optional. Gameplay must remain available. */ }
  }
  setEnabled(value) { this.enabled = !!value; if (this.master && this.context) this.master.gain.setTargetAtTime(value ? .24 : 0, this.context.currentTime, .06); if (value) this.unlock(); }
  setPlaying(value) { this.playing = value; if (this.hum && this.context) this.hum.gain.setTargetAtTime(value && this.enabled ? .065 : 0, this.context.currentTime, .2); }
  tone(frequency, duration = .12, volume = .3, end = frequency, type = 'sine', delay = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context, at = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, at); osc.frequency.exponentialRampToValueAtTime(Math.max(15,end), at + duration);
    gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(volume, at + .008); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(at); osc.stop(at + duration + .03);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  noise(duration, volume, frequency = 1200) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context, buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate), samples = buffer.getChannelData(0);
    for(let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter(); source.buffer = buffer;
    filter.type = 'lowpass'; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  events(events) {
    for(const event of events) {
      switch(event.type) {
        case 'shot': this.noise(event.weapon === 'shotgun' ? .27 : .13, event.weapon === 'shotgun' ? 1.2 : .65, event.weapon === 'shotgun' ? 2600 : 1800); this.tone(event.weapon === 'shotgun' ? 110 : 145, .15, .4, 30, 'triangle'); break;
        case 'hit': this.tone(170, .06, .13, 75, 'square'); break;
        case 'hurt': this.noise(.18, .4, 400); this.tone(60, .18, .5, 35, 'sine'); break;
        case 'pickup': this.tone(440, .1, .17, 660, 'triangle'); this.tone(880, .13, .1, 880, 'sine', .07); break;
        case 'door': this.noise(.55, .2, 500); this.tone(75, .45, .14, 110, 'sawtooth'); break;
        case 'power': this.tone(90, 1, .23, 180, 'triangle'); this.tone(660, .15, .16, 660, 'sine', .7); break;
        case 'relay': [392,587,784].forEach((f,i)=>this.tone(f,.18,.14,f,'sine',i*.1)); break;
        case 'checkpoint': this.tone(520, .15, .15, 520); this.tone(780, .2, .15, 780, 'sine', .16); break;
        case 'secret': [330,440,660].forEach((f,i)=>this.tone(f,.25,.17,f,'triangle',i*.12)); break;
        case 'death': this.tone(160, .9, .4, 25, 'triangle'); break;
        case 'win': [262,330,392,523].forEach((f,i)=>this.tone(f,.5,.2,f,'triangle',i*.16)); break;
      }
    }
  }
}
