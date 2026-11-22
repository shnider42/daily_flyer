// Restrained, procedural field audio. No samples, music, or synthesized speech.
export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.noise = null;
    this.voices = new Set();
    this.ambience = null;
    this.unavailable = false;
    this.lastState = null;
    this.seenEffects = new WeakSet();
    this.effectIds = new Set();
    this.lastShots = 0;
    this.lastRadio = null;
    this.lastHealth = null;
    this.shotBudget = 4;
    this.elapsed = 0;
    this.nextDistant = 6;
  }

  async unlock() {
    if (this.unavailable) return false;
    try {
      if (!this.context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) {
          this.unavailable = true;
          return false;
        }
        const context = this.context = new AudioContextClass();
        const master = this.master = context.createGain();
        master.gain.value = this.enabled ? 0.34 : 0;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -17;
        limiter.knee.value = 10;
        limiter.ratio.value = 7;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.14;
        master.connect(limiter);
        limiter.connect(context.destination);
        // Shared two-second noise buffer keeps weapon/ambience allocation small.
        this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      // Safari, locked audio sessions, and unavailable devices remain playable.
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? 0.34 : 0, now, 0.015);
    if (!this.enabled) this.stop();
  }

  _ready() {
    return this.enabled && this.context && this.context.state === 'running';
  }

  _voice({ duration = 0.1, gain = 0.08, frequency = 0, endFrequency,
    lowpass = 6000, highpass = 100, pan = 0, delay = 0, attack = 0.002 } = {}) {
    if (!this._ready() || this.voices.size >= 24) return;
    const context = this.context;
    const start = context.currentTime + delay;
    const source = frequency ? context.createOscillator() : context.createBufferSource();
    const envelope = context.createGain();
    const low = context.createBiquadFilter();
    const high = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = lowpass;
    low.Q.value = 0.5;
    high.type = 'highpass';
    high.frequency.value = highpass;
    high.Q.value = 0.5;
    if (frequency) {
      source.type = 'sine';
      source.frequency.setValueAtTime(frequency, start);
      if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    } else source.buffer = this.noise;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(Math.min(0.22, gain), start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(high);
    high.connect(low);
    low.connect(envelope);
    let panner = null;
    if (context.createStereoPanner) {
      panner = context.createStereoPanner();
      panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
      envelope.connect(panner);
      panner.connect(this.master);
    } else envelope.connect(this.master);
    const voice = { source, envelope, low, high, panner };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      for (const node of [source, envelope, low, high, panner]) {
        if (node) { try { node.disconnect(); } catch {} }
      }
    };
    if (frequency) source.start(start);
    else source.start(start, Math.random() * 0.8);
    source.stop(start + duration + 0.025);
  }

  _startAmbience() {
    if (!this._ready() || this.ambience) return;
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = 0.65;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 470;
    low.Q.value = 0.4;
    const high = context.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 75;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.025, context.currentTime + 0.8);
    source.connect(low);
    low.connect(high);
    high.connect(gain);
    gain.connect(this.master);
    const ambience = { source, low, high, gain };
    this.ambience = ambience;
    source.onended = () => {
      for (const node of [source, low, high, gain]) {
        try { node.disconnect(); } catch {}
      }
    };
    source.start();
  }

  _shot(effect, player, distant = false) {
    if (this.shotBudget < 1 || !player) return;
    this.shotBudget -= 1;
    const distance = Math.hypot((effect.x ?? player.x) - player.x, (effect.y ?? player.y) - player.y);
    if (distance > 1100) return;
    const attenuation = distant ? 0.17 : Math.max(0.08, 1 / (1 + distance / 135));
    const pan = ((effect.x ?? player.x) - player.x) / 600;
    const lowpass = distant ? 1100 : Math.max(1300, 6500 - distance * 7);
    this._voice({ duration: 0.085, gain: 0.17 * attenuation, highpass: 850, lowpass, pan });
    this._voice({ duration: 0.13, gain: 0.12 * attenuation, highpass: 80, lowpass: 950, pan });
  }

  _radio() {
    this._voice({ duration: 0.065, gain: 0.045, highpass: 800, lowpass: 2600 });
    this._voice({ duration: 0.07, gain: 0.055, frequency: 920, endFrequency: 850,
      highpass: 300, lowpass: 1700, delay: 0.025 });
    this._voice({ duration: 0.045, gain: 0.025, highpass: 1200, lowpass: 2400, delay: 0.1 });
  }

  click() {
    this._voice({ duration: 0.035, gain: 0.035, highpass: 950, lowpass: 2000 });
  }

  tick(state, dt = 0) {
    if (!state) return;
    const player = state.squad?.find(actor => actor.id === state.playerId);
    const shots = Number(state.stats?.shots) || 0;
    const radio = state.radio?.at(-1);
    const radioId = radio?.id ?? (radio ? `${radio.time}:${radio.text}` : null);
    const freshState = state !== this.lastState;
    if (freshState) {
      this.stop();
      this.lastState = state;
      this.seenEffects = new WeakSet();
      this.effectIds.clear();
      this.lastShots = shots;
      this.lastRadio = radioId;
      this.lastHealth = player?.hp ?? null;
      this.elapsed = 0;
      this.nextDistant = 6 + Math.random() * 5;
      this.shotBudget = 4;
    }
    const seconds = Math.max(0, Math.min(0.25, Number(dt) || 0));
    this.elapsed += seconds;
    this.shotBudget = Math.min(4, this.shotBudget + seconds * 16);
    const playing = state.status === 'playing';
    const audible = playing && this._ready() && !freshState;
    if (playing) this._startAmbience();
    else if (this.ambience || this.voices.size) this.stop();

    let newMuzzles = 0;
    let newImpacts = 0;
    for (const effect of state.effects || []) {
      if (!effect || typeof effect !== 'object') continue;
      const seen = effect.id != null ? this.effectIds.has(effect.id) : this.seenEffects.has(effect);
      if (seen) continue;
      if (effect.id != null) this.effectIds.add(effect.id);
      else this.seenEffects.add(effect);
      if (effect.type === 'muzzle' || effect.type === 'shot') {
        newMuzzles++;
        if (audible) this._shot(effect, player);
      } else if (effect.type === 'hit' && audible && player && newImpacts < 2) {
        const distance = Math.hypot(effect.x - player.x, effect.y - player.y);
        if (distance < 180) {
          this._voice({ duration: 0.055, gain: 0.035 / (1 + distance / 60),
            highpass: 700, lowpass: 3300, pan: (effect.x - player.x) / 250 });
          newImpacts++;
        }
      } else if (effect.type === 'explosion' && audible && player) {
        const distance = Math.hypot(effect.x - player.x, effect.y - player.y);
        if (distance < 900) this._voice({ duration: 0.6, gain: 0.18 / (1 + distance / 130),
          highpass: 40, lowpass: 650, attack: 0.008, pan: (effect.x - player.x) / 600 });
      }
    }
    // Bounded history; effect object tracking needs no manual retention at all.
    if (this.effectIds.size > 600) this.effectIds = new Set([...this.effectIds].slice(-300));
    if (audible && !newMuzzles && shots > this.lastShots) {
      const count = Math.min(2, shots - this.lastShots);
      for (let i = 0; i < count; i++) this._shot(player || {}, player);
    }
    if (audible && radioId != null && radioId !== this.lastRadio) this._radio();
    if (audible && player && this.lastHealth != null && player.hp < this.lastHealth) {
      this._voice({ duration: 0.17, gain: 0.12, frequency: 76, endFrequency: 42,
        highpass: 20, lowpass: 300, attack: 0.004 });
      this._voice({ duration: 0.09, gain: 0.055, highpass: 350, lowpass: 1900 });
    }
    if (audible && this.elapsed >= this.nextDistant) {
      this.nextDistant = this.elapsed + 6 + Math.random() * 8;
      // Distant fire only accompanies an active combat area, not quiet insertion.
      const activeArea = player && state.time > 10 && (state.enemies || []).some(enemy =>
        enemy.alive !== false && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 700);
      if (activeArea) this._shot({ x: player.x + (Math.random() < 0.5 ? -450 : 450), y: player.y }, player, true);
    }
    this.lastShots = shots;
    this.lastRadio = radioId;
    this.lastHealth = player?.hp ?? null;
  }

  stop() {
    const now = this.context?.currentTime ?? 0;
    if (this.ambience) {
      const ambience = this.ambience;
      this.ambience = null;
      ambience.gain.gain.cancelScheduledValues(now);
      ambience.gain.gain.setTargetAtTime(0, now, 0.025);
      try { ambience.source.stop(now + 0.12); } catch {}
    }
    for (const voice of this.voices) {
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, 0.006);
      try { voice.source.stop(now + 0.03); } catch {}
    }
    this.voices.clear();
  }
}
