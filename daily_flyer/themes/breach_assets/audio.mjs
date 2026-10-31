/** Original game audio: procedural effects and a lazy, same-origin music cue. */
import { BreachMusic } from './music.mjs';
import { musicScene } from './music-cues.mjs';
import { MusicPreview } from './music-preview.mjs';

// Local, active threats only: no music radar for enemies behind doors or walls,
// neutral security, a far-away co-op encounter, or a downed listener.
export function musicPressure(game) { return musicThreats(game).pressure; }
export function musicThreats(game) {
  const player = game?.state?.player;
  if (!player || player.health <= 0 || player.alive === false) return {pressure:0, guardian:false};
  let pressure = 0, guardian = false;
  // Inspect visible guardians first so a crowd cannot hide their learning window.
  for (const guardians of [true, false]) for (const enemy of game.state.enemies || []) {
    if (!!enemy.guardian !== guardians) continue;
    if (!enemy.active || !game.isHostileToPlayer(enemy)
        || Math.hypot(enemy.x-player.x, enemy.z-player.z) > 10) continue;
    if (!game.hasLineOfSight(player.x, player.z, enemy.x, enemy.z)) continue;
    pressure += enemy.guardian ? 3 : 1; guardian ||= !!enemy.guardian;
    if (pressure >= 3) return {pressure, guardian};
  }
  return {pressure, guardian};
}

export class BreachAudio {
  constructor(enabled = true, { musicEnabled = true, musicVolume = .45 } = {}) {
    this.enabled = enabled; this.context = null; this.master = null; this.hum = null; this.playing = false;
    this.musicEnabled = musicEnabled;
    this.music = new BreachMusic({ enabled: enabled && musicEnabled, volume: musicVolume });
    this.preview = new MusicPreview(this.music); this.warmMission = null;
    this.pressureTimer = 0; this.pressure = 0; this.guardian = false; this.lastMusicStateTime = null;
  }
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context || this.context.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.gain.value = .24; this.master.connect(this.context.destination);
        this.music.attach(this.context, this.master);
        this.hum = this.context.createGain(); this.hum.gain.value = 0; this.hum.connect(this.master);
        const low = this.context.createOscillator(); low.type = 'sine'; low.frequency.value = 44; low.connect(this.hum); low.start();
        const upper = this.context.createOscillator(); upper.type = 'triangle'; upper.frequency.value = 66.2;
        const quiet = this.context.createGain(); quiet.gain.value = .12; upper.connect(quiet); quiet.connect(this.hum); upper.start();
      }
      // iOS may return from background with 'interrupted', not 'suspended'.
      const resumed = this.context.state !== 'running' && this.context.state !== 'closed' ? this.context.resume().catch(() => {}) : Promise.resolve();
      this.setPlaying(this.playing);
      return resumed;
    } catch (_) { /* Audio is optional. Gameplay must remain available. */ }
  }
  setEnabled(value) { if (!value) this.preview.stop(); this.enabled = !!value; this.music.configure({enabled:this.enabled && this.musicEnabled}); if (this.master && this.context) this.master.gain.setTargetAtTime(value ? .24 : 0, this.context.currentTime, .06); if (value) this.unlock(); }
  setMusic(enabled, volume) { this.preview.stop(); this.musicEnabled = !!enabled; this.music.configure({enabled:this.enabled && this.musicEnabled, volume}); }
  setPlaying(value) { this.preview.stop(); this.playing = !!value; this.music.setPlaying(this.playing); if (this.hum && this.context) this.hum.gain.setTargetAtTime(value && this.enabled ? .065 : 0, this.context.currentTime, .2); }
  testMusic(onStatus) {
    if (!this.enabled || !this.musicEnabled || !this.music.volume) { onStatus('Turn on Sound and Occasional music, and raise music volume to test.'); return; }
    const ready = this.unlock();
    return this.preview.play({context:this.context,output:this.master,volume:this.music.volume,ready,onStatus});
  }
  stopMusicTest() { this.preview.stop(); }
  resetMusic() { this.warmMission = null; this.pressureTimer = 0; this.pressure = 0; this.guardian = false; this.lastMusicStateTime = null; this.music.reset(); }
  updateMusic(game, dt, blocked = false) {
    try {
      // Co-op retries reuse the same view but rewind authoritative mission time.
      const time = game?.state?.time;
      if (Number.isFinite(time)) {
        if (this.lastMusicStateTime !== null && time < this.lastMusicStateTime - .1) this.resetMusic();
        this.lastMusicStateTime = time;
      }
      const player = game?.state?.player;
      const alive = !!player && player.health > 0 && player.alive !== false;
      this.pressureTimer -= dt;
      if (this.pressureTimer <= 0) { const threat = blocked || !alive ? {pressure:0,guardian:false} : musicThreats(game); this.pressure = threat.pressure; this.guardian = threat.guardian; this.pressureTimer = .25; }
      const scene = musicScene(game);
      if (this.playing && !blocked && alive && this.enabled && this.music.enabled && this.music.volume > 0 && this.context?.state === 'running' && this.warmMission !== scene.mission) {
        this.warmMission = scene.mission;
        // Prepare just one likely cue during the silent opening after Start.
        // Preparation never starts playback or changes encounter eligibility.
        this.music.prepare(scene.pool[0]).catch(() => {});
      }
      this.music.update({dt, pressure:this.pressure, guardian:this.guardian, scene, alive, blocked});
    } catch (_) { /* Music failures must never interrupt a run. */ }
  }
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
  events(events, listener = null) {
    this.music.events(events, listener);
    for(const event of events) {
      const encounter = ['containment-routed','enemy-warning','enemy-shot','teleport','provoked','boss-phase','shutter','ricochet','explosion','shield-hit','shield-open','heal','heal-interrupt'].includes(event.type);
      const distance = listener && Number.isFinite(event.x) && Number.isFinite(event.z) ? Math.hypot(event.x-listener.x,event.z-listener.z) : 0;
      if(encounter && distance > 14) continue;
      const volume = Math.max(.15, 1-distance/16);
      switch(event.type) {
        case 'record': this.tone(260,.3,.07,260,'triangle'); this.tone(257,.6,.045,190,'sine',.12); break;
        case 'containment-routed': this.tone(event.open?170:65,.8,.12*volume,event.open?45:170,'sine'); break;
        case 'shot':
          if(event.weapon==='arc') {
            this.noise(.14,.28,3100); this.tone(820,.2,.27,150,'sawtooth');
            this.tone(1240,.12,.12,480,'sine',.035);
          } else if(event.weapon==='ricochet') {
            this.noise(.1,.55,2900); this.tone(210,.1,.28,55,'triangle');
            this.tone(1040,.06,.08,720,'sine',.025);
          } else if(event.weapon==='grenade') {
            this.noise(.15,.55,850); this.tone(115,.2,.4,32,'sine');
          } else {
            this.noise(event.weapon === 'shotgun' ? .27 : .13, event.weapon === 'shotgun' ? 1.2 : .65, event.weapon === 'shotgun' ? 2600 : 1800);
            this.tone(event.weapon === 'shotgun' ? 110 : 145, .15, .4, 30, 'triangle');
          }
          break;
        case 'hit': this.tone(170, .06, .13, 75, 'square'); break;
        case 'ricochet': this.tone(1720,.11,.12*volume,640,'triangle'); this.noise(.06,.08*volume,3600); break;
        case 'explosion': this.noise(.46,.7*volume,1500); this.tone(75,.48,.45*volume,23,'sine'); break;
        case 'shield-hit': this.tone(960,.1,.16*volume,350,'sine'); this.noise(.06,.1*volume,2700); break;
        case 'shield-open': this.noise(.24,.1*volume,650); this.tone(300,.3,.1*volume,75,'triangle'); break;
        case 'heal': this.tone(480,.24,.08*volume,700,'sine'); this.tone(720,.18,.06*volume,960,'sine',.08); break;
        case 'heal-interrupt': this.noise(.12,.12*volume,2100); this.tone(690,.16,.08*volume,140,'triangle'); break;
        case 'hurt': this.noise(.18, .4, 400); this.tone(60, .18, .5, 35, 'sine'); break;
        case 'pickup': this.tone(440, .1, .17, 660, 'triangle'); this.tone(880, .13, .1, 880, 'sine', .07); break;
        case 'door': this.noise(.55, .2, 500); this.tone(75, .45, .14, 110, 'sawtooth'); break;
        case 'shutter':
          this.noise(.42,.2*volume,650);
          this.tone(event.open?55:120,.42,.16*volume,event.open?120:55,'triangle');
          this.tone(event.open?660:330,.1,.1*volume,event.open?660:330,'sine',.32);
          break;
        case 'power': this.tone(90, 1, .23, 180, 'triangle'); this.tone(660, .15, .16, 660, 'sine', .7); break;
        case 'relay': [392,587,784].forEach((f,i)=>this.tone(f,.18,.14,f,'sine',i*.1)); break;
        case 'checkpoint': this.tone(520, .15, .15, 520); this.tone(780, .2, .15, 780, 'sine', .16); break;
        case 'secret': [330,440,660].forEach((f,i)=>this.tone(f,.25,.17,f,'triangle',i*.12)); break;
        case 'enemy-warning':
          if(event.kind==='blink') { this.tone(190,.55,.12*volume,620,'sine'); this.tone(285,.55,.07*volume,930,'sine'); }
          else if(event.kind==='charge') this.tone(65,.7,.16*volume,135,'triangle');
          else if(event.kind==='volley') [165,220,330].forEach((f,i)=>this.tone(f,.13,.11*volume,f,'triangle',i*.16));
          else if(event.kind==='shot') this.tone(540,.16,.06*volume,610,'sine');
          else if(event.kind==='bash') this.tone(85,.6,.13*volume,180,'triangle');
          else if(event.kind==='heal') { this.tone(300,.65,.08*volume,600,'sine'); this.tone(450,.65,.05*volume,900,'sine'); }
          break;
        case 'enemy-shot': this.tone(event.faction==='security'?720:190,.12,.11*volume,event.faction==='security'?280:65,'triangle'); break;
        case 'teleport': this.noise(.16,.1*volume,1700); this.tone(760,.22,.12*volume,115,'sine'); break;
        case 'provoked': this.tone(630,.12,.13*volume,630,'square'); this.tone(420,.16,.1*volume,420,'square',.16); break;
        case 'boss-phase': if(event.phase==='recover') { this.noise(.45,.12*volume,650); this.tone(180,.5,.12*volume,55,'triangle'); } break;
        case 'death': this.tone(160, .9, .4, 25, 'triangle'); break;
        case 'win': [262,330,392,523].forEach((f,i)=>this.tone(f,.5,.2,f,'triangle',i*.16)); break;
      }
    }
  }
}
