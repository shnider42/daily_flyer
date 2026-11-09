import { playbackSession, bindAudioActivation } from "./device-audio.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

// Original, procedural sound beds. Low-rate stereo buffers are ample for the
// distant crowd's bandwidth and avoid building thousands of live voice nodes.
function crowdBuffer(context, voices = false) {
  const rate = 16000,
    seconds = voices ? 4.7 : 7.3,
    buffer = context.createBuffer(2, Math.floor(rate * seconds), rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = (voices ? 613 : 977) + channel * 193,
      low = 0,
      darker = 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const people = Array.from({ length: 7 }, (_, i) => ({
      phase: random() * Math.PI * 2,
      pitch: 86 + random() * 119 + i * 2,
      pace: 0.55 + random() * 1.8,
      offset: random() * Math.PI * 2,
    }));
    for (let i = 0; i < data.length; i++) {
      const t = i / rate,
        white = random() * 2 - 1;
      low = low * 0.94 + white * 0.06;
      darker = darker * 0.992 + white * 0.008;
      const murmur = (low * 3.5 + darker * 4 + white * 0.08) *
        (0.58 + 0.16 * Math.sin(t * 1.37 + channel) +
          0.09 * Math.sin(t * 3.09 + 1.7));
      let cloud = 0;
      if (voices) {
        for (const person of people) {
          person.phase += (Math.PI * 2 * person.pitch / rate) *
            (1 + 0.018 * Math.sin(t * 4.1 + person.offset));
          if (person.phase > Math.PI * 2) person.phase -= Math.PI * 2;
          const syllable = Math.max(0, Math.sin(t * person.pace * Math.PI * 2 + person.offset));
          cloud += (Math.sin(person.phase) * 0.56 +
            Math.sin(person.phase * 2) * 0.27 +
            Math.sin(person.phase * 3) * 0.12) * syllable * syllable;
        }
      }
      // Short fades remove the loop seam while overlapping independent beds
      // keep it from sounding like a repeated recording.
      const seam = Math.min(1, i / 240, (data.length - 1 - i) / 240);
      data[i] = (voices ? cloud / 13 + murmur * 0.35 : murmur) * seam;
    }
  }
  return buffer;
}

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.effects = null;
    this.crowd = null;
    this.last = 0;
    this.energy = 0;
    this.scene = null;
    this.audible = true;
    this.crowdActive = false;
    this.lastMix = -1;
    bindAudioActivation(() => this.unlock(), { enabled: () => settings.sound });
    // rAF may stop entirely in a background tab; silence must not wait for it.
    this.onVisibility = () => {
      if (globalThis.document?.hidden) this.silence();
      else this.mix(true);
    };
    globalThis.document?.addEventListener("visibilitychange", this.onVisibility);
  }
  unlock() {
    if (!this.settings.sound) return;
    try {
      playbackSession();
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        this.effects = this.ctx.createGain();
        this.effects.connect(this.master);
      }
      if (this.ctx.state !== "running")
        Promise.resolve(this.ctx.resume()).then(() => this.mix(true)).catch(() => {});
      this.mix(true);
    } catch {
      // Some mobile routes are unavailable until the next trusted activation.
    }
  }
  level(node, value, seconds = 0.12) {
    if (!node || !this.ctx || node._level === value) return;
    const now = this.ctx.currentTime;
    node._level = value;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(value, now, seconds);
  }
  buildCrowd() {
    if (this.crowd || !this.ctx || this.ctx.state !== "running") return;
    const context = this.ctx,
      bus = context.createGain(),
      bed = context.createGain(),
      voices = context.createGain();
    bus.gain.value = bed.gain.value = voices.gain.value = 0;
    bed.connect(bus);
    voices.connect(bus);
    bus.connect(this.master);
    const sources = [];
    for (const [isVoice, destination, frequency, pan] of [
      [false, bed, 1150, -0.2],
      [true, voices, 2000, 0.2],
    ]) {
      const source = context.createBufferSource(),
        filter = context.createBiquadFilter();
      source.buffer = crowdBuffer(context, isVoice);
      source.loop = true;
      source.playbackRate.value = isVoice ? 0.97 : 1;
      filter.type = "lowpass";
      filter.frequency.value = frequency;
      filter.Q.value = 0.55;
      source.connect(filter);
      if (context.createStereoPanner) {
        const position = context.createStereoPanner();
        position.pan.value = pan;
        filter.connect(position);
        position.connect(destination);
      } else filter.connect(destination);
      source.start();
      sources.push(source);
    }
    // Two restrained, non-feedback reflections give cheers an arena tail.
    for (const [delayTime, amount] of [[0.071, 0.13], [0.137, 0.075]]) {
      const delay = context.createDelay(0.2),
        echo = context.createGain();
      delay.delayTime.value = delayTime;
      echo.gain.value = amount;
      bus.connect(delay);
      delay.connect(echo);
      echo.connect(this.master);
    }
    this.crowd = { bus, bed, voices, sources };
  }
  update(game, { paused = false, menu = false, dt = 1 / 60 } = {}) {
    this.scene = { game, paused: Boolean(paused), menu: Boolean(menu) };
    this.energy *= Math.exp(-clamp(finite(dt, 1 / 60), 0, 0.25) / 1.8);
    this.mix();
  }
  mix(force = false) {
    const hidden = Boolean(globalThis.document?.hidden),
      scene = this.scene,
      game = scene?.game,
      volume = this.settings.crowd === false ? 0 :
        clamp(finite(this.settings.crowd, 0.55), 0, 1);
    this.audible = Boolean(this.settings.sound) && !hidden &&
      (!scene || (!!game && !scene.paused && !scene.menu));
    this.crowdActive = this.audible && game?.sport === "hockey" &&
      game.phase !== "finished" && volume > 0;
    if (!this.ctx || this.ctx.state !== "running") return;
    if (this.audible !== this.previousAudible) force = true;
    this.previousAudible = this.audible;
    this.level(this.master, this.audible ? 1 : 0, this.audible ? 0.04 : 0.008);
    if (this.crowdActive) this.buildCrowd();
    if (!this.crowd) return;
    if (!this.crowdActive || !volume) {
      this.level(this.crowd.bus, 0, 0.015);
      return;
    }
    if (!force && this.ctx.currentTime - this.lastMix < 0.07) return;
    this.lastMix = this.ctx.currentTime;
    const puck = game.ball || {},
      height = finite(game.rules?.height, 1400),
      depth = clamp(finite(puck.y, height / 2) / height, 0, 1),
      danger = Math.max(0, 1 - Math.min(depth, 1 - depth) / 0.25),
      pace = clamp(Math.hypot(finite(puck.vx), finite(puck.vy)) / 1100, 0, 1),
      action = Math.min(1, this.energy + danger * 0.17 + pace * 0.1 + (game.fight ? 0.3 : 0));
    this.level(this.crowd.bus, volume, 0.18);
    this.level(this.crowd.bed, 0.17 + action * 0.19, 0.16);
    this.level(this.crowd.voices, 0.055 + action * 0.4, 0.18);
  }
  silence() {
    this.audible = false;
    this.crowdActive = false;
    this.previousAudible = false;
    this.level(this.master, 0, 0.006);
    this.level(this.crowd?.bus, 0, 0.006);
  }
  tone(f, d = 0.08, type = "sine", volume = 0.08, slide = f, delay = 0) {
    if (!this.settings.sound || !this.ctx || this.ctx.state !== "running" ||
        !this.audible || globalThis.document?.hidden) return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain(),
      time = c.currentTime + Math.max(0, delay);
    o.type = type;
    o.frequency.setValueAtTime(f, time);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), time + d);
    g.gain.setValueAtTime(volume, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + d);
    o.connect(g);
    g.connect(this.effects);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(time);
    o.stop(time + d + 0.01);
  }
  clap(delay = 0, strength = 1) {
    if (!this.crowdActive || !this.ctx || !this.crowd) return;
    const c = this.ctx,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain(),
      buffer = c.createBuffer(1, 1600, 16000),
      samples = buffer.getChannelData(0),
      time = c.currentTime + delay;
    let seed = Math.floor(time * 100000) + 17;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = (seed / 2147483648 - 1) * Math.exp(-i / 250);
    }
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 1700;
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.13 * strength, time);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.crowd.bus);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time);
    source.stop(time + 0.11);
  }
  event(type, sport) {
    if (sport === "hockey" && this.audible) {
      const reaction = {
        goal: 1, save: 0.65, shot: 0.24, slapshot: 0.4, tackle: 0.4,
        hit: 0.4, board: 0.04, dump: 0.12, saucer: 0.08,
        "fight-challenge": 0.2, fight: 0.75, penalty: 0.3,
      }[type] || 0;
      this.energy = Math.min(1.25, this.energy + reaction);
      this.mix(true);
      if (type === "goal" || type === "save" || type === "fight") {
        this.clap(0.05, 0.8);
        this.clap(0.17, 0.6);
        this.clap(0.31, 0.85);
      }
    }
    if (type === "goal") {
      [0, 0.15, 0.3].forEach((delay, i) =>
        this.tone(sport === "hockey" ? 220 + i * 55 : 440 + i * 110,
          0.45, "triangle", 0.1, sport === "hockey" ? 220 + i * 55 : 440 + i * 110, delay));
      return;
    }
    if (type === "shot") this.tone(130, 0.1, "triangle", 0.08, 60);
    if (type === "slapshot") {
      this.tone(185, 0.045, "square", 0.055, 70);
      this.tone(75, 0.12, "triangle", 0.075, 25, 0.025);
    }
    if (type === "pass" || type === "saucer") this.tone(240, 0.04, "triangle", 0.035, 90);
    if (type === "dump") this.tone(260, 0.12, "triangle", 0.04, 90);
    if (type === "tackle" || type === "hit") this.tone(70, 0.14, "sawtooth", 0.05, 25);
    if (type === "poke") this.tone(300, 0.04, "triangle", 0.035, 130);
    if (type === "save") this.tone(160, 0.14, "triangle", 0.08, 60);
    if (["restart", "break", "finished", "penalty", "faceoff"].includes(type))
      this.tone(1700, 0.2, "sine", 0.035, 1400);
    if (type === "board" && performance.now() - this.last > 120) {
      this.last = performance.now();
      this.tone(330, 0.04, "triangle", 0.035, 120);
    }
  }
}
