// Field audio: credited recordings with bounded procedural fallbacks.
// Source attribution and editing notes are in audio/CREDITS.txt.
import { buildingAt } from './building-geometry.mjs';
import { environmentAt, eventEnvironment, reverbImpulseData } from './audio-environments.mjs';
import { streetReflectionPlan } from './street-reflections.mjs';
import { fallbackReportData, IMPACT_PROFILES, impactProfile, impactReportData } from './weapon-reports.mjs';
import { cityAmbienceProfile, createCityAmbience, advanceCityAmbience } from './city-ambience.mjs';
import { VOICE_SAMPLE_FILES, VOICE_LINES } from './squad-voice-lines.mjs';
import { createVoiceDirector, chooseVoiceLine, squadVoiceCategory, findVoiceSpeaker, squadVoiceRoute, fieldVoiceRoute,
  FIELD_RADIO_SPEAKER, createFieldRadioDirector, fieldRadioCue, voicePolicy } from './squad-voice.mjs';
import { flashIntensity } from './hand-grenades.mjs';
import { roleProfile } from './squad-roles.mjs';
import { SOUND_SPEED_MPS, WORLD_UNITS_PER_METRE, MAX_PENDING_ARRIVALS, ARRIVAL_LOOKAHEAD,
  ARRIVAL_LATE_TOLERANCE, acousticSourceTime, acousticArrivalTime, acousticTravelDelay, acousticHearingRange,
  distantCombatMix, reportProfile, reportBurstMix } from './acoustics.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const MASTER_GAIN = .44;
const SAMPLE_FILES = {
  rifle: 'rifle-report-bank.wav', support: 'saw-report-bank.wav', hostile: 'hostile-shot.mp3', rotor: 'rotor-loop.mp3', wind: 'wind.mp3',
  radio: 'radio-chatter.mp3', commandGo: 'command-go.mp3', commandMove: 'command-move.mp3',
  pain1: 'pain-1.mp3', pain2: 'pain-2.mp3', fear1: 'fear-1.mp3', fear2: 'fear-2.mp3',
  footStone: 'footsteps-stone-bank.wav', footDirt: 'footsteps-dirt-bank.wav', dog: 'ambient-dog.wav',
  ...VOICE_SAMPLE_FILES,
};
const SCENES = new Set(['menu', 'mission', 'paused']);

export class GameAudio {
  constructor() {
    this.enabled = true; this.context = null; this.master = null; this.noise = null;
    this.levels = { master: 1, effects: 1, ambience: 1, distress: .65, reflections: .8, squad: .85, ringing: .35 }; this.effectsBus = null; this.ambienceBus = null; this.distressBus = null;
    this.reverbBanks = {}; this.reverbBuffers = {}; this.reflectionsNeedFlush = false; this.listenerEnvironment = null;
    this.environmentTimer = 0; this.environmentKey = ''; this.lastAcousticSpace = null;
    this.nextStreetEchoAt = 0;
    this.voices = new Set(); this.loops = new Map(); this.samples = new Map(); this.sampleStatus = {};
    this.fallbackReports = new Map(); this.reportTurns = new Map(); this.reportBursts = new Map(); this.earlyReflectionBus = null; this.lastReport = null;
    this.impactBuffers = new Map(); this.impactTurn = 0;
    this.unavailable = false; this.lastState = null; this.lastPlayerId = null; this.lastHealth = null;
    this.lastEventId = 0; this.seenEffects = new WeakSet(); this.effectIds = new Set();
    this.lastShots = 0; this.lastRadio = null; this.shotBudget = 8;
    this.distantShotBudget = 4; this.threatShotBudget = 4; this.distantShooters = new Map();
    this.footTravel = new Map(); this.vehiclePositions = new Map(); this.diagnosticTime = 0;
    this.footstepBuffers = new Map(); this.footstepTurn = 0; this.cityDirector = null; this.cityPasses = [];
    this.scene = 'paused'; this.menuBus = null; this.missionAmbienceBus = null;
    this.menuTimer = null; this.menuSchedule = null; this.lastMenuVoice = null;
    this.voiceDirector = createVoiceDirector(); this.activeSpeech = null; this.lastSpeech = null; this.lastCarrierAt = -Infinity;
    this.fieldRadioDirector = createFieldRadioDirector();
    this.speechReverbBanks = {}; this.speechReflectionsNeedFlush = false; this.speechMixTimer = 0;
    this.lastFlashKey = null;
    this.hitTimes = new Map(); this.painTimes = new Map(); this.fearTimes = new Map(); this.hostileVoiceTimes = new Map();
    this.lastPainTime = -Infinity; this.lastFearTime = -Infinity; this.lastHostileVoiceTime = -Infinity; this.foregroundUntil = 0;
    this.lastSceneKey = null; this.lastStateTime = -Infinity; this.painVariant = 0; this.fearVariant = 0;
    this.pendingArrivals = []; this.arrivalTrace = []; this.eventDelay = 0; this.lastNearPassTime = -Infinity;
    this.propagationStats = { queued: 0, delivered: 0, late: 0, dropped: 0, cancelled: 0 };
    this.presentationAnchor = null; this.transportEpoch = null; this.needsLiveCursor = false;
    this.hidden = Boolean(globalThis.document?.hidden); this.lifecycleAttached = false;
    this.onVisibility = () => { this.hidden = Boolean(globalThis.document?.hidden); if (this.hidden) this.stop(); else this._syncScene(); };
    this.onContextState = () => { if (this.context?.state !== 'running') this.stop(); else this._syncScene(); };
  }

  async unlock() {
    if (this.unavailable) return false;
    try {
      this.hidden = Boolean(globalThis.document?.hidden);
      if (!this.context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) { this.unavailable = true; return false; }
        const context = this.context = new AudioContextClass({ latencyHint: 'interactive' });
        this.master = context.createGain(); this.master.gain.value = this.enabled ? MASTER_GAIN * this.levels.master : 0;
        this.effectsBus = context.createGain(); this.effectsBus.gain.value = this.levels.effects;
        this.ambienceBus = context.createGain(); this.ambienceBus.gain.value = this.levels.ambience;
        this.hearingFilter = context.createBiquadFilter(); this.hearingFilter.type = 'lowpass'; this.hearingFilter.frequency.value = 20000;
        this.hearingGain = context.createGain(); this.hearingGain.gain.value = 1;
        this.effectsBus.connect(this.hearingFilter); this.ambienceBus.connect(this.hearingFilter);
        this.hearingFilter.connect(this.hearingGain); this.hearingGain.connect(this.master);
        this.squadBus = context.createGain(); this.squadBus.gain.value = this.levels.squad; this.squadBus.connect(this.effectsBus);
        this.ringingBus = context.createGain(); this.ringingBus.gain.value = this.levels.ringing * this.levels.effects; this.ringingBus.connect(this.master);
        this.earlyReflectionBus = context.createGain(); this.earlyReflectionBus.gain.value = this.levels.reflections;
        this.reflectionListeningFilter = context.createBiquadFilter(); this.reflectionListeningFilter.type = 'lowpass';
        this.reflectionListeningFilter.frequency.value = 16000;
        this.reflectionListeningGain = context.createGain(); this.reflectionListeningGain.gain.value = 1;
        this.earlyReflectionBus.connect(this.reflectionListeningFilter); this.reflectionListeningFilter.connect(this.reflectionListeningGain);
        this.reflectionListeningGain.connect(this.effectsBus);
        this.distressBus = context.createGain(); this.distressBus.gain.value = this.levels.distress; this.distressBus.connect(this.effectsBus);
        this.menuBus = context.createGain(); this.menuBus.gain.value = 0; this.menuBus.connect(this.ambienceBus);
        this.missionAmbienceBus = context.createGain(); this.missionAmbienceBus.gain.value = 0; this.missionAmbienceBus.connect(this.ambienceBus);
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 10;
        limiter.attack.value = .002; limiter.release.value = .16;
        this.master.connect(limiter); limiter.connect(context.destination);
        this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const noise = this.noise.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
        this._makeReflections(); this._makeSpeechReflections(); this._makeReports(); this._makeImpacts(); this._makeEngine(); this._makeRumble(); this._makeFire(); this._makeCrack(); this._makeCityFoley();
        context.addEventListener?.('statechange', this.onContextState);
        if (!this.lifecycleAttached) { globalThis.document?.addEventListener?.('visibilitychange', this.onVisibility); this.lifecycleAttached = true; }
        void this._loadSamples();
      }
      if (!this.hidden && this.context.state !== 'running' && this.context.state !== 'closed') await this.context.resume();
      this._syncScene();
      this._diagnostics(); return this.context.state === 'running';
    } catch { this._diagnostics(); return false; }
  }

  async _loadSamples() {
    await Promise.all(Object.entries(SAMPLE_FILES).map(async ([key, file]) => {
      this.sampleStatus[key] = 'loading'; this._diagnostics();
      try {
        const response = await fetch(new URL(`./audio/${file}`, import.meta.url));
        if (!response.ok) throw new Error('Audio asset unavailable');
        const bytes = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(bytes);
        if (!buffer.length || !Number.isFinite(buffer.duration)) throw new Error('Invalid audio');
        this.samples.set(key, buffer); this.sampleStatus[key] = 'ready';
      } catch { this.sampleStatus[key] = 'fallback'; }
      this._diagnostics();
    }));
  }

  _diagnostics() {
    if (!globalThis.document?.documentElement) return;
    const data = document.documentElement.dataset;
    data.audioContext = this.context?.state || (this.unavailable ? 'unavailable' : 'locked');
    data.audioSamples = Object.keys(SAMPLE_FILES).map(k => `${k}:${this.sampleStatus[k] || 'pending'}`).join(',');
    data.audioVoices = String(this.voices.size);
    data.audioLoops = String(this.loops.size);
    data.audioScene = this.scene;
    data.audioMenuScheduler = this.menuTimer == null ? 'stopped' : 'running';
    data.audioPending = String(this.pendingArrivals.length);
    data.audioPropagation = `${SOUND_SPEED_MPS}m/s@${WORLD_UNITS_PER_METRE}units/m`;
    data.audioArrivals = JSON.stringify({ ...this.propagationStats, last: this.arrivalTrace.at(-1) || null });
    data.audioEnvironment = this.listenerEnvironment?.kind || 'open';
    data.audioReflections = JSON.stringify({ room:this.reverbBanks.room?.output.gain.value||0, street:this.reverbBanks.street?.output.gain.value||0,
      exterior:this.reverbBanks.exterior?.output.gain.value||0, source:this.lastAcousticSpace?.sourceKind||null, occluded:this.lastAcousticSpace?.occluded||false });
    data.audioGunfire = JSON.stringify(this.lastReport);
    data.audioCity = JSON.stringify({ phase: this.lastState ? cityAmbienceProfile(this.lastState).phase : null,
      passes: this.cityPasses.length, voices: [...this.voices].filter(v => v.bus === 'ambience').length,
      fires: this.lastState?.world?.ambientFires?.length || 0 });
    data.audioSpeech = JSON.stringify(this.activeSpeech ? { line: this.activeSpeech.line.id, text: this.activeSpeech.line.text,
      speakerId: this.activeSpeech.actorId, route: this.activeSpeech.route.mode, active: true } : { ...this.lastSpeech, active: false });
    data.audioFlash = JSON.stringify({ cutoff: this.hearingFilter?.frequency.value || 20000,
      ringing: [...this.voices].some(voice => voice.kind === 'flash-ringing') });
  }

  _makeSpeechReflections() {
    const c = this.context;
    if (!c || !this.squadBus) return;
    for (const kind of ['room', 'street']) {
      const old = this.speechReverbBanks[kind];
      if (old) for (const node of Object.values(old)) node.disconnect?.();
      const input = c.createGain(), convolver = c.createConvolver(), output = c.createGain();
      input.gain.value = 1; convolver.normalize = false; convolver.buffer = this.reverbBuffers[kind]; output.gain.value = 0;
      input.connect(convolver); convolver.connect(output); output.connect(this.squadBus);
      this.speechReverbBanks[kind] = { input, convolver, output };
      const activeSend = this.activeSpeech?.sends[kind];
      if (activeSend) { activeSend.disconnect(); activeSend.connect(input); }
    }
    this.speechReflectionsNeedFlush = false;
  }

  _clearSpeech() {
    this._stopVoices(voice => voice.bus === 'squad'); this.activeSpeech = null;
    const now = this.context?.currentTime || 0;
    for (const bank of Object.values(this.speechReverbBanks)) {
      bank.output.gain.cancelScheduledValues(now); bank.output.gain.setTargetAtTime(0, now, .01);
    }
    this.speechReflectionsNeedFlush = true;
  }

  _makeReports() {
    const c = this.context;
    for (const weapon of ['rifle', 'support', 'hostile', 'hostile_support', 'sniper', 'vehicle-mg', 'tank-cannon']) {
      const data = fallbackReportData(c.sampleRate, weapon), buffer = c.createBuffer(1, data.length, c.sampleRate);
      buffer.getChannelData(0).set(data); this.fallbackReports.set(weapon, buffer);
    }
  }

  _makeImpacts() {
    const c = this.context;
    for (const material of Object.keys(IMPACT_PROFILES)) for (let variant = 0; variant < 3; variant++) {
      const data = impactReportData(c.sampleRate, material, variant), buffer = c.createBuffer(1, data.length, c.sampleRate);
      buffer.getChannelData(0).set(data); this.impactBuffers.set(`${material}:${variant}`, buffer);
    }
  }

  _makeReflectionBank(kind) {
    const c = this.context;
    if(!this.reverbBuffers[kind]) {
      const channels=reverbImpulseData(c.sampleRate,kind),buffer=c.createBuffer(2,channels[0].length,c.sampleRate);
      channels.forEach((channel,i)=>buffer.getChannelData(i).set(channel)); this.reverbBuffers[kind]=buffer;
    }
    const old=this.reverbBanks[kind];
    if(old)for(const node of Object.values(old))node.disconnect?.();
    const input=c.createGain(),filter=c.createBiquadFilter(),convolver=c.createConvolver(),output=c.createGain();
    input.gain.value=1; filter.type='lowpass';filter.frequency.value=kind==='room'?3100:2500;
    convolver.normalize=false;convolver.buffer=this.reverbBuffers[kind]; output.gain.value=0;
    input.connect(filter);filter.connect(convolver);output.connect(this.effectsBus);
    // Filtering after convolution also muffles the energy already in flight
    // when the listener runs through a doorway; input filtering cannot do that.
    if(kind==='exterior') {
      const listeningFilter=c.createBiquadFilter();listeningFilter.type='lowpass';listeningFilter.frequency.value=16000;
      convolver.connect(listeningFilter);listeningFilter.connect(output);
      this.reverbBanks[kind]={input,filter,convolver,output,listeningFilter};
    } else {convolver.connect(output);this.reverbBanks[kind]={input,filter,convolver,output};}
  }

  _makeReflections() {
    for(const kind of ['room','street','exterior'])this._makeReflectionBank(kind);
    // Retain these aliases for existing diagnostics and voice-route inspection.
    this.reverbInput=this.reverbBanks.room.input;this.reverbReturn=this.reverbBanks.room.output;
    this.reflectionsNeedFlush=false;this.environmentKey='';this.environmentTimer=0;
  }

  _clearReflections() {
    // Early facade returns are scheduled voices, so muting only the shared
    // convolvers would leave those old taps audible after a pause or slider0.
    this._stopVoices(voice => voice.bus === 'reflection', .012);
    this.nextStreetEchoAt=0;
    if(this.reflectionsNeedFlush)return;
    const now=this.context?.currentTime||0;
    for(const bank of Object.values(this.reverbBanks)) {bank.output.gain.cancelScheduledValues(now);bank.output.gain.setTargetAtTime(0,now,.012);}
    // Reconnect the nodes with cached kernels on resume. An old convolution
    // tail must not reappear after a very short pause, mute, or listener swap.
    this.reflectionsNeedFlush=true;
  }

  _mixReflections(state, player, dt) {
    if(!this.context||this.levels.master===0||this.levels.effects===0||this.levels.reflections===0)return;
    if(this.reflectionsNeedFlush)this._makeReflections();
    this.environmentTimer-=dt;
    const house=buildingAt(state.world,player);
    const key=`${state.seed}:${state.missionIndex}:${state.world?.geometryRevision||0}:${house?.id||house?.x||'out'}:${Math.floor(player.x/16)}:${Math.floor(player.y/16)}`;
    if(this.environmentKey===key&&this.environmentTimer>0)return;
    this.environmentKey=key;this.environmentTimer=.12;
    const env=this.listenerEnvironment=environmentAt(state.world,player),now=this.context.currentTime;
    // Keep the same convolution and scheduled facade returns across a doorway.
    // Only the listener's transfer changes. Pause/mute/swap still clear history.
    this.reflectionListeningGain.gain.setTargetAtTime(env.exteriorListeningGain,now,.18);
    this.reflectionListeningFilter.frequency.setTargetAtTime(env.exteriorListeningCutoff,now,.2);
    for(const kind of ['room','street']) {
      const bank=this.reverbBanks[kind];
      bank.output.gain.setTargetAtTime(env[`${kind}Return`]*this.levels.reflections,now,.16);
      bank.filter.frequency.setTargetAtTime(env[`${kind}Cutoff`],now,.2);
    }
    const bank=this.reverbBanks.exterior;
    bank.output.gain.setTargetAtTime(env.exteriorReturn*this.levels.reflections,now,.18);
    bank.filter.frequency.setTargetAtTime(env.exteriorCutoff,now,.2);
    bank.listeningFilter.frequency.setTargetAtTime(env.exteriorListeningCutoff,now,.2);
  }

  _makeEngine() {
    const c = this.context, length = c.sampleRate * 2;
    this.engine = c.createBuffer(1, length, c.sampleRate);
    const data = this.engine.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate;
      data[i] = Math.sin(t * Math.PI * 2 * 48) * .3 + Math.sin(t * Math.PI * 2 * 96) * .13
        + Math.sin(t * Math.PI * 2 * 144) * .06 + (Math.random() * 2 - 1) * .045;
    }
  }

  _makeRumble() {
    const c = this.context, length = Math.floor(c.sampleRate * 4);
    this.rumble = c.createBuffer(1, length, c.sampleRate);
    const data = this.rumble.getChannelData(0); let low = 0, body = 0;
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate, noise = Math.random() * 2 - 1;
      low = low * .994 + noise * .006; body = body * .91 + noise * .09;
      const envelope = Math.min(1, t / .085) * Math.exp(-t * 1.45);
      data[i] = clamp((low * 4.5 + body * .65 + Math.sin(t * 2 * Math.PI * 43) * .05) * envelope, -.8, .8);
    }
  }

  _makeFire() {
    const c = this.context, length = c.sampleRate * 2;
    this.fire = c.createBuffer(1, length, c.sampleRate);
    const data = this.fire.getChannelData(0); let low = 0, crackle = 0;
    for (let i = 0; i < length; i++) {
      const n = Math.random() * 2 - 1;
      low = low * .96 + n * .04;
      if (Math.random() < 7 / c.sampleRate) crackle = .2 + Math.random() * .45;
      crackle *= .993;
      data[i] = low * .55 + n * (.035 + crackle);
    }
  }

  _makeCrack() {
    const c = this.context, length = Math.ceil(c.sampleRate * .055);
    this.crack = c.createBuffer(1, length, c.sampleRate);
    const data = this.crack.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate;
      // A short bipolar pressure transient with a rapidly decaying broadband
      // edge. It has no pitched oscillator or looping pass-by effect.
      const wave = t < .0024 ? (1 - t / .0012) * .65 : 0;
      data[i] = clamp(wave + (Math.random() * 2 - 1) * .27 * Math.exp(-t * 145), -.9, .9);
    }
  }

  _makeCityFoley() {
    const c = this.context;
    // Quiet, cached sole contacts are the offline fallback. One source per step
    // replaces the paired sharp noise clicks; no oscillator is used for feet.
    for (const surface of ['stone', 'earth']) for (let variant = 0; variant < 4; variant++) {
      const length = Math.ceil(c.sampleRate * .2), buffer = c.createBuffer(1, length, c.sampleRate), data = buffer.getChannelData(0);
      let seed = 8219 + variant * 7919 + (surface === 'earth' ? 191 : 0), low = 0, grit = 0;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 4294967296 * 2 - 1, t = i / c.sampleRate;
        low = low * .82 + noise * .18; grit = grit * .35 + noise * .65;
        data[i] = (low * 1.1 * Math.exp(-t * 42) + grit * (surface === 'earth' ? .045 : .018) * Math.exp(-t * 22)) * Math.min(1, t / .004);
      }
      this.footstepBuffers.set(`${surface}:${variant}`, buffer);
    }
    // A low city horizon and a sparse sheet-metal rattle, never speech or music.
    this.cityBed = c.createBuffer(1, c.sampleRate * 8, c.sampleRate);
    const horizon = this.cityBed.getChannelData(0); let low = 0, seed = 93812;
    for (let i = 0; i < horizon.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      low = low * .986 + (seed / 4294967296 * 2 - 1) * .014;
      const t = i / c.sampleRate;
      horizon[i] = low * 2.8 * (.7 + .12 * Math.sin(t * Math.PI / 2)) * Math.min(1, t / .12, (8-t) / .12);
    }
    this.cityMetal = c.createBuffer(1, Math.ceil(c.sampleRate * .8), c.sampleRate);
    const metal = this.cityMetal.getChannelData(0);
    for (let i = 0; i < metal.length; i++) {
      const t = i / c.sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      metal[i] = ((seed / 4294967296 * 2 - 1) * .14 * Math.exp(-t * 25) +
        Math.sin(t * 2 * Math.PI * 417) * .06 * Math.exp(-t * 13) +
        Math.sin(t * 2 * Math.PI * 1093) * .025 * Math.exp(-t * 18)) * Math.min(1, t / .002);
    }
  }

  // Scene selection never unlocks audio. Call unlock() from a user gesture first.
  setScene(scene) {
    if (!SCENES.has(scene)) return this.scene;
    if (this.scene === scene) return this.scene;
    this._cancelMenuScheduler(); this.scene = scene;
    this._syncScene(); this._diagnostics(); return this.scene;
  }

  _cancelMenuScheduler() {
    if (this.menuTimer != null) clearInterval(this.menuTimer);
    this.menuTimer = null; this.menuSchedule = null;
  }

  _syncScene() {
    if (!this.context) return;
    const now = this.context.currentTime, ready = this._ready();
    for (const [bus, active] of [[this.menuBus, this.scene === 'menu'], [this.missionAmbienceBus, this.scene === 'mission']]) {
      bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(ready && active ? 1 : 0, now, .18);
    }
    if (!ready || this.scene === 'paused') { this.stop(); return; }
    const menu = this.scene === 'menu';
    for (const key of [...this.loops.keys()]) if (key.startsWith('menu:') !== menu) this._stopLoop(key, .55);
    this._stopVoices(voice => menu ? voice.bus !== 'menu' : voice.bus === 'menu', .22);
    if (!menu || this.levels.master === 0 || this.levels.ambience === 0) {
      this._cancelMenuScheduler();
      if (menu) {
        for (const key of [...this.loops.keys()]) if (key.startsWith('menu:')) this._stopLoop(key);
        this._stopVoices(voice => voice.bus === 'menu');
      }
      return;
    }
    if (this.menuTimer == null) {
      this.menuSchedule = { radioAt: now + 1.6, impactAt: now + 7 + Math.random() * 5,
        rotorAt: now + 2.5, rotorStart: null, rotorDuration: 24, startedAt: now, voiceUntil: now, firstVoice: true };
      this._menuAmbience();
      this.menuTimer = setInterval(() => this._menuAmbience(), 250);
    }
  }

  _menuAmbience() {
    if (!this._ready() || this.scene !== 'menu') { this._cancelMenuScheduler(); return; }
    const schedule = this.menuSchedule; if (!schedule) return;
    const now = this.context.currentTime, elapsed = now - schedule.startedAt;
    const wind = this.samples.get('wind'), breeze = .85 + Math.sin(elapsed * .16) * .1 + Math.sin(elapsed * .041) * .05;
    const speechDuck = now < schedule.voiceUntil ? .42 : 1;
    this._loop('menu:wind', wind || this.noise, { gain: (wind ? .06 : .028) * breeze * (speechDuck < 1 ? .7 : 1), lowpass: 1550, highpass: 85, rate: wind ? 1 : .72, bus: 'menu' });
    if (schedule.rotorStart == null && now >= schedule.rotorAt) {
      schedule.rotorStart = now; schedule.rotorDuration = 22 + Math.random() * 8;
      schedule.rotorAt = now + schedule.rotorDuration + 25 + Math.random() * 22;
    }
    if (schedule.rotorStart != null) {
      const phase = (now - schedule.rotorStart) / schedule.rotorDuration;
      if (phase >= 1) { this._stopLoop('menu:rotor', .65); schedule.rotorStart = null; }
      else {
        const rotor = this.samples.get('rotor');
        if (rotor) this._loop('menu:rotor', rotor, { gain: .065 * Math.sin(Math.PI * phase) * speechDuck, lowpass: 1250 + Math.sin(Math.PI * phase) * 450,
          highpass: 45, pan: -.65 + phase * 1.3, rate: .96, bus: 'menu' });
      }
    }
    if (now >= schedule.radioAt) {
      // Background radio is texture; orders belong to actual squad actions.
      if (schedule.firstVoice && !this.samples.has('radio') && elapsed < 5) schedule.radioAt = now + .25;
      else { this._menuRadio(schedule.firstVoice); schedule.firstVoice = false; schedule.radioAt = now + 11 + Math.random() * 13; }
    }
    if (now >= schedule.impactAt) { this._menuImpact(); schedule.impactAt = now + 19 + Math.random() * 18; }
    this._diagnostics();
  }

  _menuRadio(first = false) {
    const key = 'radio';
    const buffer = this.samples.get(key), pan = -.3 + Math.random() * .6;
    this._voice({ duration: .11, gain: .022, lowpass: 2200, highpass: 650, pan, bus: 'menu', priority: -2, attack: .015 });
    if (buffer) {
      this.lastMenuVoice = key;
      const duration = key === 'radio' ? 3.2 + Math.random() * 1.7 : buffer.duration;
      const offset = key === 'radio' ? Math.random() * Math.max(0, buffer.duration - duration - .1) : 0;
      if (this.menuSchedule) this.menuSchedule.voiceUntil = this.context.currentTime + duration + .3;
      this._voice({ buffer, duration, offset, delay: .07, gain: key === 'radio' ? .2 : .24,
        lowpass: key === 'radio' ? 2200 : 2700, highpass: 420, pan, attack: .055, bus: 'menu', priority: -2 });
      this._voice({ duration: .1, delay: duration + .1, gain: .017, lowpass: 1700, highpass: 750, pan, attack: .015, bus: 'menu', priority: -2 });
    } else {
      // A restrained carrier/squelch fallback, not synthesized intelligible speech.
      for (let i = 0; i < 7; i++) this._voice({ duration: .09 + Math.random() * .12, delay: .1 + i * .17,
        gain: .009 + Math.random() * .009, lowpass: 1500 + Math.random() * 650, highpass: 500 + Math.random() * 250,
        pan, attack: .02, bus: 'menu', priority: -2 });
    }
  }

  _menuImpact() {
    const pan = (Math.random() < .5 ? -1 : 1) * (.3 + Math.random() * .35);
    this._voice({ buffer: this.rumble, duration: 3.8, gain: .1, lowpass: 370, highpass: 35, pan, attack: .085, bus: 'menu', priority: -2 });
    this._voice({ duration: .38, delay: .11, gain: .018, lowpass: 850, highpass: 120, pan, attack: .035, bus: 'menu', priority: -2 });
  }

  setEnabled(enabled) {
    if (this.enabled !== Boolean(enabled) && this.lastState) this.needsLiveCursor = true;
    this.enabled = Boolean(enabled);
    this._applyLevels();
    if (!this.enabled) this.stop();
    else this._syncScene();
    this._diagnostics();
  }

  setLevels(levels = {}) {
    const effectsAudible = this.levels.master > 0 && this.levels.effects > 0;
    const reflectionsAudible = this.levels.reflections > 0;
    for (const key of ['master', 'effects', 'ambience', 'distress', 'reflections', 'squad', 'ringing']) {
      if (Number.isFinite(levels?.[key])) this.levels[key] = clamp(levels[key], 0, 1);
    }
    this._applyLevels();
    if (this.context && reflectionsAudible !== (this.levels.reflections > 0)) this._makeSpeechReflections();
    if (effectsAudible !== (this.levels.master > 0 && this.levels.effects > 0)) {
      this._cancelArrivals();
      if (this.lastState) this.needsLiveCursor = true;
    }
    if (this.levels.master === 0 || this.levels.effects === 0 || this.levels.reflections === 0) this._clearReflections();
    this.environmentKey='';
    if (this.levels.master === 0 || this.levels.effects === 0) this._stopVoices(voice => voice.bus !== 'menu' && voice.bus !== 'ambience');
    if (this.levels.distress === 0) this._stopVoices(voice => voice.bus === 'distress');
    if (this.levels.master === 0 || this.levels.effects === 0 || this.levels.squad === 0) this._clearSpeech();
    if (this.levels.master === 0 || this.levels.effects === 0 || this.levels.ringing === 0) this._stopVoices(voice => voice.bus === 'ringing');
    if (this.levels.reflections === 0) {
      const now = this.context?.currentTime || 0;
      for (const bank of Object.values(this.speechReverbBanks)) bank.output.gain.setTargetAtTime(0, now, .018);
    }
    if (this.levels.master === 0 || this.levels.ambience === 0) {
      this.cityDirector = null; this.cityPasses.length = 0;
      this._stopVoices(voice => voice.bus === 'ambience');
      for (const key of [...this.loops.keys()]) if (!key.startsWith('menu:')) this._stopLoop(key);
    }
    this._syncScene();
    this._diagnostics();
    return { ...this.levels };
  }

  _applyLevels() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    for (const [node, value] of [
      [this.master, this.enabled ? MASTER_GAIN * this.levels.master : 0],
      [this.effectsBus, this.levels.effects], [this.ambienceBus, this.levels.ambience],
      [this.distressBus, this.levels.distress],
      [this.squadBus, this.levels.squad], [this.ringingBus, this.levels.ringing * this.levels.effects],
      [this.earlyReflectionBus, this.levels.reflections],
    ]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(now); node.gain.setTargetAtTime(value, now, .018);
    }
  }

  _ready() { return Boolean(this.enabled && !this.hidden && this.context?.state === 'running'); }

  _voice({ buffer = null, duration = .1, gain = .08, frequency = 0, endFrequency,
    lowpass = 6500, highpass = 60, pan = 0, delay = 0, attack = .0015,
    rate = 1, wet = 0, space = null, priority = 0, bus = 'effects', offset = 0, actorId = null, kind = null, tone = null } = {}) {
    if (!this._ready() || this.levels.master === 0 || bus === 'distress' && this.levels.distress === 0 ||
      bus === 'squad' && this.levels.squad === 0 || bus === 'ringing' && this.levels.ringing === 0 ||
      (bus === 'ambience' || bus === 'menu') && this.levels.ambience === 0 ||
      bus === 'reflection' && this.levels.reflections === 0 ||
      bus !== 'menu' && bus !== 'ambience' && this.levels.effects === 0) return;
    if (this.voices.size >= 32) {
      // Evict the least important/quietest source first. Insertion order must
      // not cut a nearby report while a quieter distant return is available.
      const victim = [...this.voices].filter(v => v.priority < priority)
        .sort((a, b) => a.priority - b.priority || a.gain - b.gain || b.start - a.start)[0];
      if (!victim) return;
      const now = this.context.currentTime;
      victim.envelope.gain.cancelScheduledValues(now); victim.envelope.gain.setTargetAtTime(0, now, .0015);
      try { victim.source.stop(now + .008); } catch {}
      this.voices.delete(victim);
    }
    const c = this.context, start = c.currentTime + Math.max(0, delay) + this.eventDelay;
    const sample = Boolean(buffer); offset = sample ? clamp(offset, 0, Math.max(0, buffer.duration - .02)) : 0;
    duration = Math.max(.015, sample ? Math.min(duration, (buffer.duration - offset) / rate) : duration);
    // Clean recorded reports need transient headroom without raising the noise,
    // ambience or impact caps. The shared output limiter still owns mix peaks.
    gain = clamp(gain, 0, kind === 'report' ? 1.2 : .55);
    const source = frequency ? c.createOscillator() : c.createBufferSource();
    const envelope = c.createGain(), low = c.createBiquadFilter(), high = c.createBiquadFilter();
    low.type = 'lowpass'; low.frequency.value = lowpass; low.Q.value = .55;
    high.type = 'highpass'; high.frequency.value = highpass; high.Q.value = .55;
    if (frequency) {
      source.type = 'sine'; source.frequency.setValueAtTime(frequency, start);
      if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    } else { source.buffer = buffer || this.noise; source.playbackRate.value = rate; }
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(gain, start + attack);
    if (sample) { envelope.gain.setValueAtTime(gain, start + Math.max(attack, duration - .035)); envelope.gain.linearRampToValueAtTime(0, start + duration); }
    else envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    let body = null;
    source.connect(high);
    if (tone && Number.isFinite(tone.frequency) && Number.isFinite(tone.gain)) {
      body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = clamp(tone.frequency, 80, c.sampleRate * .45);
      body.Q.value = clamp(tone.q || .65, .4, 1); body.gain.value = clamp(tone.gain, -3, 3);
      high.connect(body); body.connect(low);
    } else high.connect(low);
    low.connect(envelope);
    let panner = null;
    if (c.createStereoPanner) { panner = c.createStereoPanner(); panner.pan.value = clamp(pan, -.9, .9); envelope.connect(panner); }
    const output = panner || envelope;
    output.connect(bus === 'menu' ? this.menuBus : bus === 'distress' ? this.distressBus : bus === 'ambience' ? this.missionAmbienceBus :
      bus === 'reflection' ? this.earlyReflectionBus : bus === 'squad' ? this.squadBus : bus === 'ringing' ? this.ringingBus : this.effectsBus);
    const sends=[];
    // Distress has its own volume path; a shared effects reverb must not bypass it.
    if (wet && bus === 'effects' && this.levels.reflections > 0) {
      const mix=space||{room:this.listenerEnvironment?.enclosure||0,street:1-(this.listenerEnvironment?.enclosure||0)*.75};
      for(const kind of ['room','street'])if(mix[kind]>.015&&this.reverbBanks[kind]) {
        const send=c.createGain();send.gain.value=clamp(wet*mix[kind],0,.85);output.connect(send);send.connect(this.reverbBanks[kind].input);sends.push(send);
      }
      if(kind==='report'&&mix.exterior>.015&&this.reverbBanks.exterior) {
        const send=c.createGain();send.gain.value=clamp(wet*mix.exterior,0,.75);
        output.connect(send);send.connect(this.reverbBanks.exterior.input);sends.push(send);
      }
    }
    const voice = { source, envelope, output, priority, gain, bus, actorId, kind, start, end: start + duration, space, nodes: [source, envelope, low, high, body, panner, ...sends] };
    this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); for (const n of voice.nodes) if (n) { try { n.disconnect(); } catch {} } };
    if (frequency) source.start(start); else if (sample) source.start(start, offset); else source.start(start, Math.random() * .8);
    source.stop(start + duration + .015);
    return voice;
  }

  _loop(key, buffer, { gain = 0, lowpass = 1000, highpass = 40, pan = 0, rate = 1, bus = 'mission' } = {}) {
    if (!this._ready() || !buffer || this.levels.master === 0 || this.levels.ambience === 0) return;
    let loop = this.loops.get(key);
    if (loop && loop.buffer !== buffer) { this._stopLoop(key); loop = null; }
    const c = this.context;
    if (!loop) {
      const source = c.createBufferSource(), volume = c.createGain(), low = c.createBiquadFilter(), high = c.createBiquadFilter();
      source.buffer = buffer; source.loop = true; source.playbackRate.value = rate;
      low.type = 'lowpass'; low.frequency.value = lowpass; high.type = 'highpass'; high.frequency.value = highpass;
      volume.gain.value = 0; source.connect(high); high.connect(low); low.connect(volume);
      let panner = null;
      const destination = bus === 'menu' ? this.menuBus : this.missionAmbienceBus;
      if (c.createStereoPanner) { panner = c.createStereoPanner(); volume.connect(panner); panner.connect(destination); }
      else volume.connect(destination);
      loop = { buffer, source, volume, low, high, panner }; this.loops.set(key, loop);
      source.onended = () => { for (const node of [source, volume, low, high, panner]) if (node) { try { node.disconnect(); } catch {} } };
      source.start();
    }
    const now = c.currentTime;
    loop.volume.gain.setTargetAtTime(clamp(gain, 0, .15), now, .18);
    loop.low.frequency.setTargetAtTime(lowpass, now, .15);
    loop.source.playbackRate.setTargetAtTime(rate, now, .2);
    loop.panner?.pan.setTargetAtTime(clamp(pan, -.85, .85), now, .14);
  }

  _stopLoop(key, fade = .13) {
    const loop = this.loops.get(key); if (!loop) return;
    this.loops.delete(key); const now = this.context?.currentTime || 0;
    loop.volume.gain.cancelScheduledValues(now); loop.volume.gain.setTargetAtTime(0, now, fade / 5);
    try { loop.source.stop(now + fade); } catch {}
  }

  _spatial(event, player, world = null) {
    const source={x:event.x??player.x,y:event.y??player.y},d=distance(source,player);
    const space=eventEnvironment(world,source,player),occluded=space.occluded;
    this.lastAcousticSpace=space;
    const distant = distantCombatMix(event.type, d, occluded);
    return { d, gain: distant.gain * (occluded ? .48 : 1) / (1 + (d / 165) ** 1.25), pan: ((event.x ?? player.x) - player.x) / 390,
      lowpass: Math.min(distant.lowpass, occluded ? 1350 : 10000, clamp(10000 / (1 + d / 270), 550, 10000)),
      distant: distant.distant, occluded, space };
  }

  _presentationTime(state, timing = {}) {
    const time = Number.isFinite(state.time) ? state.time : 0, now = this.context?.currentTime || 0;
    if (Number.isFinite(timing.presentationTime)) return clamp(timing.presentationTime, time, time + .5);
    if (!state.coop) return time;
    if (!this.presentationAnchor || this.presentationAnchor.time !== time) this.presentationAnchor = { time, at: now };
    // Co-op snapshots are less frequent than rendering. A monotonic audio
    // clock keeps arrivals moving between packets without unbounded prediction.
    return time + clamp(now - this.presentationAnchor.at, 0, .25);
  }

  _cancelArrivals() {
    this.propagationStats.cancelled += this.pendingArrivals.length;
    this.pendingArrivals.length = 0;
  }

  _queueEvent(event, player, state, presentationTime) {
    const point = event.type === 'near_pass' ? { ...event, x: event.closestX ?? event.x, y: event.closestY ?? event.y } : event;
    const d = distance({ x: point.x ?? player.x, y: point.y ?? player.y }, player);
    if (!Number.isFinite(d) || d > acousticHearingRange(event.type, state.world)) return;
    if (event.type === 'near_pass' && (event.victimId !== player.id || !Number.isFinite(event.speedMps) ||
      !Number.isFinite(event.missDistance) || event.missDistance < 0 || event.missDistance > 100)) return;
    const own = event.type === 'victim_hit' ? (event.victimId ?? event.actorId) === player.id
      : event.actorId === player.id && event.type !== 'near_pass';
    const local = own && ['shot', 'grenade_launch', 'grenade_throw', 'reload_start', 'reload_end', 'victim_hit'].includes(event.type);
    const sourceTime = acousticSourceTime(event, state.time);
    const arrival = local ? sourceTime : acousticArrivalTime(point, player, state.time);
    const remaining = arrival - presentationTime;
    const lateTolerance = local ? .3 : ARRIVAL_LATE_TOLERANCE;
    if (!Number.isFinite(remaining) || sourceTime > presentationTime + .1 || remaining > acousticTravelDelay(acousticHearingRange(event.type, state.world)) + .12 ||
      remaining < -lateTolerance) {
      this.propagationStats.late++; return;
    }
    const priority = event.type === 'near_pass' || own && event.type === 'victim_hit' ? 5
      : own && event.type === 'shot' ? 4 : ['explosion', 'flashbang'].includes(event.type) || event.type === 'shot' && event.weapon === 'tank-cannon' ||
        event.type === 'shot' && event.team === 'enemy' && d < 360 || event.type === 'impact' && d < 140 ? 3
        : event.team === 'squad' ? 2 : 1;
    const pending = { event: { ...point, sourceTime }, at: (this.context?.currentTime || 0) + remaining,
      arrival, sourceTime, distance: d, priority, listenerId: player.id, lateTolerance };
    if (this.pendingArrivals.length >= MAX_PENDING_ARRIVALS) {
      let victim = -1;
      for (let i = 0; i < this.pendingArrivals.length; i++) {
        const candidate = this.pendingArrivals[i];
        if (candidate.priority < priority && (victim < 0 || candidate.priority < this.pendingArrivals[victim].priority ||
          candidate.priority === this.pendingArrivals[victim].priority && candidate.distance > this.pendingArrivals[victim].distance)) victim = i;
      }
      this.propagationStats.dropped++;
      if (victim < 0) return;
      this.pendingArrivals.splice(victim, 1);
    }
    this.pendingArrivals.push(pending); this.propagationStats.queued++;
  }

  _drainArrivals(state, player) {
    const now = this.context?.currentTime || 0;
    this.pendingArrivals.sort((a, b) => a.at - b.at || b.priority - a.priority);
    while (this.pendingArrivals.length && this.pendingArrivals[0].at <= now + ARRIVAL_LOOKAHEAD) {
      const pending = this.pendingArrivals.shift();
      if (pending.listenerId !== player.id || now - pending.at > pending.lateTolerance) {
        this.propagationStats.late++; continue;
      }
      this.eventDelay = Math.max(0, pending.at - now);
      try { this._event(pending.event, player, state); }
      finally { this.eventDelay = 0; }
      this.propagationStats.delivered++;
      this.arrivalTrace.push({ id: pending.event.id, type: pending.event.type, source: +pending.sourceTime.toFixed(4),
        arrival: +pending.arrival.toFixed(4), distance: Math.round(pending.distance), at: +Math.max(now, pending.at).toFixed(4) });
      if (this.arrivalTrace.length > 16) this.arrivalTrace.shift();
    }
  }

  _shot(event, player, state = this.lastState) {
    if (!player) return;
    const spatial = this._spatial(event, player, state?.world), own = event.actorId === player.id;
    if (spatial.d > acousticHearingRange('shot', state?.world)) return;
    const weapon = event.weapon || (event.team === 'enemy' ? 'hostile' : 'rifle'), cannon = weapon === 'tank-cannon';
    const distant = !own && spatial.d > 650;
    const closeThreat = !own && event.team === 'enemy' && spatial.d < 360 && !spatial.occluded;
    // A real, slow cannon report has blast priority. Distant automatic rifles
    // cannot consume its admission; the shared voice/arrival caps still apply.
    if (!own && !cannon && (distant ? this.distantShotBudget : closeThreat ? this.threatShotBudget : this.shotBudget) < 1) return;
    if (distant && !cannon) {
      const at = this.context.currentTime + this.eventDelay, last = this.distantShooters.get(event.actorId) ?? -Infinity;
      if (at - last < .105) return;
      this.distantShooters.set(event.actorId, at);
      if (this.distantShooters.size > 64) this.distantShooters.delete(this.distantShooters.keys().next().value);
      this.distantShotBudget = Math.max(0, this.distantShotBudget - 1);
    } else if (closeThreat && !cannon) this.threatShotBudget = Math.max(0, this.threatShotBudget - 1);
    else if (!own && !cannon) this.shotBudget = Math.max(0, this.shotBudget - 1);
    const profile = reportProfile(weapon), recorded = this.samples.get(profile.sample);
    const sample = recorded || this.fallbackReports.get(weapon) || this.fallbackReports.get('rifle');
    if (!sample) return;
    const gain = own ? 1 : spatial.gain;
    const pan = own ? 0 : spatial.pan;
    const rate = profile.rate * (.998 + Math.random() * .004);
    const priority = own ? 4 : cannon || closeThreat ? 3 : distant ? 1 : 2;
    const key = `${event.actorId ?? event.team ?? 'unknown'}:${weapon}`, variants = recorded ? profile.offsets : [0];
    const sourceTime = acousticSourceTime(event, this.context.currentTime + this.eventDelay), previous = this.reportBursts.get(key);
    const interval = previous ? sourceTime - previous.time : Infinity;
    if (cannon && interval >= 0 && interval < 1.8) return;
    const continuation = interval > .02 && interval <= profile.burstWindow ? Math.min(8, previous.continuation + 1) : 0;
    const burst = reportBurstMix(weapon, continuation);
    let turn = this.reportTurns.get(key);
    if (turn === undefined) turn = [...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % variants.length;
    const offset = variants[turn % variants.length], next = variants[turn % variants.length + 1] ?? sample.duration;
    // A bank slot is a hard source boundary. Its neighbor must never become
    // an extra audible shot when rates, tails or profiles change later.
    const duration = Math.min(profile.duration, (Math.min(sample.duration, next) - offset - .008) / rate);
    if (!(duration > .015)) return;
    this.reportTurns.set(key, (turn + 1) % variants.length);
    if (this.reportTurns.size > 128) this.reportTurns.delete(this.reportTurns.keys().next().value);
    const direct = this._voice({ buffer: sample, offset, duration, gain: profile.gain * gain * burst.gain,
      rate, attack: profile.attack, highpass: profile.highpass, lowpass: own ? profile.lowpass : Math.min(profile.lowpass, spatial.lowpass),
      tone: profile.tone, pan, wet: profile.wet * burst.wet, space: spatial.space, priority, actorId: event.actorId, kind: 'report' });
    if (!direct) return;
    this.reportBursts.set(key, { time: sourceTime, continuation });
    if (this.reportBursts.size > 128) this.reportBursts.delete(this.reportBursts.keys().next().value);
    if (own) this.foregroundUntil = Math.max(this.foregroundUntil, this.context.currentTime + this.eventDelay + .25);
    // Distant reports retain the shared room/street response; nearby exchanges
    // get the discrete facade returns. This bounds a busy district's node load.
    const taps = this.levels.reflections > 0 && !distant ? streetReflectionPlan(state?.world, event, player) : [];
    const now=this.context.currentTime+this.eventDelay;let earlyReflections=0,lateEchoes=0,lateEchoDelayMs=null;
    for (const tap of taps) {
      const late=tap.kind==='late';
      // Long pending echoes consume voices before they start. A dense SAW burst
      // must not reserve the mix for returns that displace incoming gunfire.
      if(late&&(now<this.nextStreetEchoAt||[...this.voices].filter(v=>v.kind==='street-echo').length>=2))continue;
      const reflected=this._voice({ buffer: sample, offset, duration: Math.min(duration, profile.reflectionDuration),
        rate, attack: late?.0025:.001, gain: profile.gain * gain * burst.wet * tap.gain, highpass: late?160:120, lowpass: tap.lowpass,
        pan: tap.pan, delay: tap.delay, priority: 0, bus: 'reflection', actorId: event.actorId, kind: late?'street-echo':'street-reflection' });
      if(!reflected)continue;
      if(late){lateEchoes++;lateEchoDelayMs=Math.round(tap.delay*1000);this.nextStreetEchoAt=now+.24;}
      else earlyReflections++;
    }
    this.lastReport = { weapon, sample: recorded ? profile.sample : 'fallback', variant: turn % variants.length,
      earlyReflections,lateEchoes,lateEchoDelayMs,exteriorTail:spatial.space.exterior>.015&&this.levels.reflections>0,
      source: spatial.space.sourceKind, occluded: spatial.occluded, continuation, directGain: direct.gain, closeThreat };
  }

  _nearPass(event, player, state) {
    if (event.victimId !== player.id || !Number.isFinite(event.speedMps) || event.speedMps <= SOUND_SPEED_MPS ||
      !Number.isFinite(event.missDistance) || event.missDistance < 0 || event.missDistance > 100 || player.alive === false) return;
    const now = (this.context?.currentTime || 0) + this.eventDelay;
    if (now - this.lastNearPassTime < .075) return;
    const point = { x: event.closestX ?? event.x, y: event.closestY ?? event.y };
    const s = this._spatial(point, player, state?.world), close = clamp(1 - event.missDistance / 110, .1, 1);
    if (s.d > 100 || s.occluded) return;
    this.lastNearPassTime = now;
    this._voice({ buffer: this.crack, duration: .055, gain: .19 * close, highpass: 700,
      lowpass: 10000, pan: clamp((point.x - player.x) / 38, -.75, .75), priority: 5, actorId: player.id, kind: 'near-pass' });
    this.foregroundUntil = Math.max(this.foregroundUntil, now + .22);
  }

  _impact(event, player, state) {
    const s = this._spatial(event, player, state?.world);
    if (s.d > acousticHearingRange('impact', state?.world)) return;
    const p = impactProfile(event.material), variant = Math.abs(Number.isSafeInteger(event.id) ? event.id : this.impactTurn++) % 3;
    const buffer = this.impactBuffers.get(`${p.material}:${variant}`); if (!buffer) return;
    const active = [...this.voices].filter(voice => voice.surfaceImpact);
    // Dense cover fire cannot fill the mixer with debris. Keep the closer
    // contacts when the surface-foley allowance is already occupied.
    if (active.length >= 8) {
      const farthest = active.sort((a, b) => b.impactDistance - a.impactDistance || a.start - b.start)[0];
      if (s.d >= farthest.impactDistance) return;
      this._stopVoices(voice => voice === farthest, .008);
    }
    const voice = this._voice({ buffer, duration: buffer.duration, gain: p.gain * s.gain,
      highpass: p.highpass, lowpass: Math.min(p.lowpass, s.lowpass), pan: s.pan,
      wet: p.wet, space: s.space, attack: .0004, priority: s.d < 140 ? 3 : 0,
      actorId: event.sourceActorId ?? event.actorId, kind: `${p.material}-impact` });
    if (voice) { voice.surfaceImpact = true; voice.impactDistance = s.d; }
  }

  _cooldown(map, key, now, seconds) {
    if (now - (map.get(key) ?? -Infinity) < seconds) return false;
    map.set(key, now);
    if (map.size > 128) map.delete(map.keys().next().value);
    return true;
  }

  _victimAlive(event, state) {
    if (event.alive === false) return false;
    const id = event.victimId ?? event.actorId;
    // A late network batch may contain an earlier hit followed by a death.
    for (const actors of [state?.squad, state?.allies, state?.enemies, state?.civilians, state?.survivors]) {
      const actor = actors?.find(a => a.id === id);
      if (actor) return actor.alive !== false;
    }
    return event.alive === true;
  }

  _victimHit(event, player, state) {
    const alive = this._victimAlive(event, state), id = event.victimId ?? event.actorId;
    if (!alive) this._stopVoices(voice => voice.bus === 'distress' && voice.actorId === id, .015);
    const s = this._spatial(event, player, state?.world), own = (event.victimId ?? event.actorId) === player.id;
    if (s.d > (s.occluded ? 290 : 470)) return;
    const now = (this.context?.currentTime || 0) + this.eventDelay;
    if (!this._cooldown(this.hitTimes, id, now, .09)) return;
    const gain = own ? 1 : s.gain, pan = own ? 0 : s.pan, priority = own ? 4 : event.team === 'squad' ? 2 : 1;
    // Cloth/gear impact is separate from a bullet passing nearby or striking masonry.
    this._voice({ duration: .055, gain: (own ? .19 : .12) * gain, highpass: 180,
      lowpass: Math.min(2200, s.lowpass), pan, priority });
    this._voice({ duration: event.cause === 'blast' ? .19 : .115, gain: (own ? .14 : .07) * gain,
      frequency: own ? 91 : 126, endFrequency: 42, highpass: 25, lowpass: 340, pan, priority });
    this.foregroundUntil = Math.max(this.foregroundUntil, now + .65);
    if (!alive || this.levels.distress === 0 ||
      now - this.lastPainTime < (own ? .18 : .38) || !this._cooldown(this.painTimes, id, now, 1.1)) return;
    const sample = this.samples.get(++this.painVariant % 2 ? 'pain1' : 'pain2');
    if (!sample) return; // Failed recordings leave grounded foley, never a synthetic scream.
    this.lastPainTime = now;
    const rate = .97 + Math.random() * .06;
    this._voice({ buffer: sample, duration: sample.duration / rate, gain: (own ? .43 : .29) * gain,
      lowpass: own ? 7800 : s.lowpass, highpass: 100, pan, rate, delay: .015, attack: .004,
      bus: 'distress', priority: own ? 4 : 2, actorId: id });
  }

  _civilianFear(event, player, state) {
    if (!this._victimAlive(event, state) || event.downed || this.levels.distress === 0) return;
    const s = this._spatial(event, player, state?.world), now = (this.context?.currentTime || 0) + this.eventDelay;
    if (s.d > (s.occluded ? 300 : 530) || now - this.lastFearTime < 4.5 ||
      now - this.lastPainTime < .65 || !this._cooldown(this.fearTimes, event.victimId ?? event.actorId, now, 12)) return;
    const sample = this.samples.get(++this.fearVariant % 2 ? 'fear1' : 'fear2');
    if (!sample) return;
    this.lastFearTime = now;
    const rate = .97 + Math.random() * .06, night = (state?.mission?.lighting==='night'||!state?.mission?.lighting&&state?.missionIndex===2) ? .8 : 1;
    this._voice({ buffer: sample, duration: Math.min(1.15, sample.duration / rate), gain: .26 * s.gain * night,
      lowpass: s.lowpass, highpass: 160, pan: s.pan, rate, attack: .012, bus: 'distress', priority: 1,
      actorId: event.victimId ?? event.actorId });
  }

  _hostileShout(event, player, state) {
    if (event.team !== 'enemy' || event.alive !== true || event.downed || this.levels.distress === 0 ||
      !Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
    // The source may be absent from a co-op actor snapshot. Use the physical
    // event, while a later fatal event can still cancel an obsolete call.
    if ((state?.soundEvents || []).some(hit => hit.type === 'victim_hit' && hit.alive === false &&
      (hit.victimId ?? hit.actorId) === event.actorId && acousticSourceTime(hit) >= acousticSourceTime(event))) return;
    const s = this._spatial(event, player, state?.world), now = (this.context?.currentTime || 0) + this.eventDelay;
    if (s.d > (s.occluded ? 340 : acousticHearingRange('hostile_shout', state?.world)) ||
      now - this.lastHostileVoiceTime < 9 || now - this.lastPainTime < .8 || now - this.lastFearTime < .8 ||
      !this._cooldown(this.hostileVoiceTimes, event.actorId, now, 42)) return;
    // Reuse the credited HaelDB nonverbal alarm performances, not squad words,
    // injury sounds, radio recordings, or an invented language/accent.
    const sample = this.samples.get(event.variant === 1 ? 'fear2' : 'fear1');
    if (!sample) return;
    this.lastHostileVoiceTime = now;
    this._voice({ buffer: sample, duration: Math.min(1.15, sample.duration), gain: .34 * s.gain,
      lowpass: Math.min(5800, s.lowpass), highpass: 210, pan: s.pan, rate: 1, attack: .009,
      wet: .16, space: s.space, bus: 'distress', priority: 1, actorId: event.actorId, kind: 'hostile-shout' });
  }

  _event(event, player, state = this.lastState) {
    if (event.type === 'field_voice') {
      const speaker = state?.allies?.find(actor => actor.id === event.actorId);
      const category = ({ regroup:'move', moving:'move', support:'suppression', grenade:'frag' })[event.category] || event.category;
      if (speaker && !speaker.downed) this._say(category, speaker, player, state);
      return;
    }
    if (!player) return;
    if (event.type === 'shot') { this._shot(event, player, state); this._combatSpeech(event, player, state); return; }
    if (event.type === 'near_pass') { this._nearPass(event, player, state); this._combatSpeech(event, player, state); return; }
    if (event.type === 'impact') { this._impact(event, player, state); return; }
    if (event.type === 'victim_hit') { this._victimHit(event, player, state); return; }
    if (event.type === 'civilian_fear') { this._civilianFear(event, player, state); return; }
    if (event.type === 'hostile_shout') { this._hostileShout(event, player, state); return; }
    const s = this._spatial(event, player, state?.world); if (s.d > acousticHearingRange(event.type, state?.world)) return;
    const own = event.actorId === player.id, gain = own ? 1 : s.gain * .65;
    if (event.type === 'grenade_throw') {
      this._voice({ buffer: this.cityMetal, duration: .07, gain: .035 * gain, highpass: 700, lowpass: 4800,
        pan: s.pan, priority: own ? 2 : 0, kind: 'grenade-pin' });
      this._voice({ duration: .13, gain: .025 * gain, highpass: 160, lowpass: 1600,
        delay: .055, pan: s.pan, priority: own ? 2 : 0, kind: 'grenade-throw' });
    } else if (event.type === 'flashbang') {
      this._voice({ buffer: this.crack, duration: .055, gain: .36 * s.gain, highpass: 300,
        lowpass: Math.min(6700, s.lowpass), pan: s.pan, wet: .24, space: s.space, priority: 3, kind: 'flashbang-pop' });
      this._voice({ duration: .18, gain: .18 * s.gain, highpass: 100, lowpass: Math.min(2400, s.lowpass),
        pan: s.pan, wet: .34, space: s.space, delay: .025, priority: 2, kind: 'flashbang-body' });
    } else if (event.type === 'grenade_launch') {
      this._voice({ duration: .12, gain: .23 * gain, highpass: 65, lowpass: 1000, pan: s.pan, wet: .32, space:s.space, priority: own ? 3 : 1 });
      this._voice({ duration: .16, gain: .12 * gain, frequency: 145, endFrequency: 48, highpass: 30, lowpass: 480, pan: s.pan, priority: own ? 3 : 1 });
    } else if (event.type === 'explosion') {
      this._voice({ duration: .17, gain: .48 * s.gain, highpass: 90, lowpass: Math.min(4200,s.lowpass), pan: s.pan, wet: .48, space:s.space, priority: 3 });
      this._voice({ duration: .65, gain: .25 * s.gain, highpass: 28, lowpass: 480, delay: .035, pan: s.pan, wet: .28, space:s.space, priority: 2 });
      this._voice({ duration: .38, gain: .17 * s.gain, frequency: 80, endFrequency: 30, highpass: 20, lowpass: 260, pan: s.pan, priority: 2 });
      this._voice({ buffer: this.rumble, duration: event.breached ? 1.75 : .95, gain: (event.breached ? .18 : .1) * s.gain,
        highpass: 35, lowpass: Math.min(900, s.lowpass), delay: .055, pan: s.pan, attack: .02, priority: 1 });
      if (event.breached) {
        // One tail for an actual opened wall, never one sound per dust sprite.
        this._voice({ duration: .38, gain: .085 * s.gain, highpass: 360, lowpass: Math.min(2900, s.lowpass), delay: .14, pan: s.pan, wet: .12, space:s.space, priority: 1 });
        this._voice({ duration: .15, gain: .045 * s.gain, highpass: 110, lowpass: Math.min(1500, s.lowpass), delay: .43, pan: s.pan, priority: 0 });
      }
    } else if (event.type === 'reload_start') {
      this._voice({ duration: .06, gain: .09 * gain, highpass: 650, lowpass: 3200, pan: s.pan, priority: own ? 2 : 0 });
      this._voice({ duration: .15, gain: .065 * gain, highpass: 300, lowpass: 1800, delay: .19, pan: s.pan });
      this._voice({ duration: .05, gain: .055 * gain, highpass: 950, lowpass: 3700, delay: .43, pan: s.pan });
      this._combatSpeech(event, player, state);
    } else if (event.type === 'reload_end') {
      this._voice({ duration: .075, gain: .1 * gain, highpass: 500, lowpass: 4200, pan: s.pan, priority: own ? 2 : 0 });
      this._voice({ duration: .04, gain: .065 * gain, highpass: 1300, lowpass: 5100, delay: .07, pan: s.pan });
    } else if (event.type === 'smoke') {
      this._voice({ duration: .12, gain: .11 * s.gain, highpass: 80, lowpass: 1100, pan: s.pan, wet: .14, space:s.space });
      this._voice({ duration: 1.2, gain: .035 * s.gain, highpass: 900, lowpass: 4000, delay: .08, pan: s.pan, attack: .07 });
    }
  }

  _say(category, speaker, player, state = this.lastState) {
    if (!speaker || speaker.alive === false || !player || !this._ready() || this.scene !== 'mission' ||
        this.levels.master === 0 || this.levels.effects === 0 || this.levels.squad === 0) return false;
    const policy = voicePolicy(category), now = this.context.currentTime;
    if (!policy) return false;
    const routeFor = (speaker, previous) => speaker.radioOnly ? squadVoiceRoute(state?.world, null, player)
      : speaker.team === 'allied' ? fieldVoiceRoute(state?.world, speaker, player, previous)
        : squadVoiceRoute(state?.world, speaker, player, previous);
    const route = routeFor(speaker);
    if (route.mode === 'inaudible') return false;
    const current = this.activeSpeech;
    if (current && this.voices.has(current.voice) && current.voice.end > now &&
        (policy.priority < 3 || current.priority >= 3)) return false;
    const selected = chooseVoiceLine(this.voiceDirector, category, VOICE_LINES, now, line => {
      const sample = this.samples.get(line.sample);
      return sample && (!line.radioOnly || speaker.radioOnly) && sample.duration >= line.offset + line.duration - .002;
    });
    if (!selected) return false;
    if (current) this._clearSpeech();
    if (this.speechReflectionsNeedFlush) this._makeSpeechReflections();
    const { line } = selected, c = this.context;
    const voice = this._voice({ buffer: this.samples.get(line.sample), offset: line.offset, duration: line.duration,
      gain: .48, lowpass: 16000, highpass: 65, attack: .008, priority: policy.priority + 1,
      bus: 'squad', actorId: speaker.id, kind: 'squad-speech' });
    if (!voice) return false;
    // One source, two listening paths. A doorway crossfade never restarts words.
    const localLow = c.createBiquadFilter(), localHigh = c.createBiquadFilter(), localGain = c.createGain();
    const radioLow = c.createBiquadFilter(), radioHigh = c.createBiquadFilter(), radioGain = c.createGain();
    localLow.type = 'lowpass'; localLow.frequency.value = route.lowpass;
    localHigh.type = 'highpass'; localHigh.frequency.value = route.highpass;
    radioLow.type = 'lowpass'; radioLow.frequency.value = line.radioOnly ? 7600 : 2850;
    radioHigh.type = 'highpass'; radioHigh.frequency.value = line.radioOnly ? 90 : 370;
    localGain.gain.value = route.local * route.gain; radioGain.gain.value = route.radio * .72;
    voice.output.disconnect(); voice.output.connect(localHigh); localHigh.connect(localLow); localLow.connect(localGain);
    let pan = null, localOutput = localGain;
    if (c.createStereoPanner) { pan = c.createStereoPanner(); pan.pan.value = route.pan; localGain.connect(pan); localOutput = pan; }
    localOutput.connect(this.squadBus);
    voice.output.connect(radioHigh); radioHigh.connect(radioLow); radioLow.connect(radioGain); radioGain.connect(this.squadBus);
    const sends = {};
    for (const kind of ['room', 'street']) {
      const send = c.createGain(); send.gain.value = this.levels.reflections > 0 ? .22 * (route.space[kind] || 0) : 0;
      localOutput.connect(send); send.connect(this.speechReverbBanks[kind].input); sends[kind] = send;
    }
    voice.nodes.push(localLow, localHigh, localGain, radioLow, radioHigh, radioGain, pan, ...Object.values(sends));
    this.activeSpeech = { voice, line, actorId: speaker.id, radioOnly: speaker.radioOnly, field: speaker.team === 'allied', priority: policy.priority, route,
      localLow, localHigh, localGain, radioGain, pan, sends, nextMixAt: now };
    this.lastSpeech = { line: line.id, text: line.text, speakerId: speaker.id, route: route.mode };
    this.foregroundUntil = Math.max(this.foregroundUntil, now + line.duration + .25);
    if (route.mode === 'radio') this._carrier(.018);
    this._updateSpeech(state, player, true);
    return true;
  }

  _carrier(gain = .014) {
    const now = this.context?.currentTime || 0;
    if (now - this.lastCarrierAt < 5 || this.levels.squad === 0) return;
    this.lastCarrierAt = now;
    this._voice({ duration: .065, gain, lowpass: 2500, highpass: 850,
      bus: 'squad', kind: 'radio-carrier', priority: 1, attack: .007 });
  }

  _updateSpeech(state, player, force = false) {
    if (!this.context || !player) return;
    const now = this.context.currentTime, speech = this.activeSpeech;
    if (speech && (!this.voices.has(speech.voice) || now >= speech.voice.end)) this.activeSpeech = null;
    if (speech && this.activeSpeech) {
      const speaker = speech.radioOnly ? FIELD_RADIO_SPEAKER
        : [...(state?.squad || []), ...(state?.allies || [])].find(actor => actor.id === speech.actorId);
      if (!speaker || speaker.alive === false) { this._clearSpeech(); return; }
      if (force || now >= speech.nextMixAt) {
        speech.nextMixAt = now + .07;
        const previous = speech.route.mode, route = speech.radioOnly ? squadVoiceRoute(state.world, null, player)
          : speech.field ? fieldVoiceRoute(state.world, speaker, player, previous) : squadVoiceRoute(state.world, speaker, player, previous);
        speech.route = route;
        speech.localGain.gain.setTargetAtTime(route.local * route.gain, now, .09);
        speech.radioGain.gain.setTargetAtTime(route.radio * .72, now, .09);
        speech.localLow.frequency.setTargetAtTime(route.lowpass, now, .1);
        speech.localHigh.frequency.setTargetAtTime(route.highpass, now, .1);
        speech.pan?.pan.setTargetAtTime(route.pan, now, .09);
        for (const kind of ['room', 'street']) speech.sends[kind].gain.setTargetAtTime(
          this.levels.reflections > 0 ? .22 * (route.space[kind] || 0) : 0, now, .1);
        this.lastSpeech = { line: speech.line.id, text: speech.line.text, speakerId: speaker.id, route: route.mode };
        if (previous !== route.mode && route.mode === 'radio') this._carrier(.009);
      }
    }
    if (!this.speechReflectionsNeedFlush && this.levels.squad > 0) {
      const env = this.listenerEnvironment || environmentAt(state?.world, player);
      for (const kind of ['room', 'street']) this.speechReverbBanks[kind]?.output.gain.setTargetAtTime(
        env[`${kind}Return`] * this.levels.reflections, now, .16);
    }
  }

  _radio(message, player = this.lastState?.squad?.find(actor => actor.id === this.lastState.playerId), state = this.lastState) {
    const speaker = findVoiceSpeaker(state, message), category = squadVoiceCategory(message);
    if (category === 'hold' && speaker && squadVoiceRoute(state?.world, speaker, player).mode === 'radio') {
      return this._say('dispatch_hold', FIELD_RADIO_SPEAKER, player, state) || this._say(category, speaker, player, state);
    }
    if (category === 'sniper' && (message.id || 0) % 2 === 0) {
      return this._say('dispatch_sniper', FIELD_RADIO_SPEAKER, player, state) || this._say(category, speaker, player, state);
    }
    if (category) return this._say(category, speaker, player, state);
    // Unknown story lines retain their written wording; only off-map radio
    // gets a restrained carrier, never an unrelated movement recording.
    if (!speaker && /^(?:RADIO|DRIVER)$/i.test(message?.speaker || '')) this._carrier();
    return false;
  }

  _combatSpeech(event, player, state) {
    if (event.type === 'near_pass' && event.victimId === player.id) {
      if (player.alive !== false && !player.downed) {
        const variant = (Number(event.id) || 0) % 3;
        if (variant === 0) this._say('dispatch_attack', FIELD_RADIO_SPEAKER, player, state);
        else if (variant === 1) this._say('dispatch_six', FIELD_RADIO_SPEAKER, player, state);
        else this._say('warning', player, player, state);
      }
      return;
    }
    const speaker = state?.squad?.find(actor => actor.id === event.actorId);
    if (!speaker || speaker.alive === false || speaker.downed) return;
    if (event.type === 'reload_start') {
      // One truthful reload call, then cover requests offer real variation.
      if (!this._say('reload', speaker, player, state)) this._say('cover', speaker, player, state);
    } else if (event.type === 'shot' && speaker.target != null &&
        state.enemies?.some(enemy => enemy.id === speaker.target && enemy.alive !== false)) {
      this._say(event.weapon === 'support' ? 'suppression' : 'contact', speaker, player, state);
    }
  }

  _flashHearing(state, player, presentationTime, canRing) {
    if (!this.context || !this.hearingFilter || !this.hearingGain) return;
    const now = this.context.currentTime, strength = player?.alive === false ? 0 : flashIntensity(player, presentationTime);
    this.hearingFilter.frequency.setTargetAtTime(20000 - 19000 * strength, now, strength > .6 ? .025 : .13);
    this.hearingGain.gain.setTargetAtTime(1 - .64 * strength, now, strength > .6 ? .025 : .13);
    const key = strength > 0 ? `${player.id}:${player.flashStartedAt}` : null;
    if (key && key !== this.lastFlashKey && canRing && presentationTime - player.flashStartedAt < .45) {
      this._stopVoices(voice => voice.kind === 'flash-ringing', .015);
      // A brief, low-level cue; its own slider never changes gameplay exposure.
      this._voice({ frequency: 1950, endFrequency: 1750, duration: 1.05 + strength * .25,
        gain: .065 * strength, highpass: 900, lowpass: 3000, attack: .025,
        bus: 'ringing', kind: 'flash-ringing', priority: 4, actorId: player.id });
    }
    this.lastFlashKey = key;
  }

  click() { this._voice({ duration: .035, gain: .035, highpass: 950, lowpass: 2000 }); }

  _movement(state, player, audible) {
    let played = 0;
    // A solo switch to the medic/grenadier must not put the controlled feet
    // behind two AI soldiers in the per-frame foley budget.
    const actors = [...(state.squad || []), ...(state.allies || []), ...(state.enemies || [])].sort((a,b) =>
      Number(b.id === player.id) - Number(a.id === player.id) || distance(a,player) - distance(b,player));
    for (const actor of actors) {
      const previous = this.footTravel.get(actor.id);
      const moved = previous ? distance(previous, actor) : 0;
      let travel = (previous?.travel || 0) + (moved < 70 ? moved : 0);
      if (actor.downed || actor.alive === false) travel = 0;
      if (travel > 43) {
        travel %= 43;
        if (audible && played < 2 && distance(actor, player) < 145 && !actor.downed && actor.alive !== false) {
          const road = state.world?.roads?.some(r => actor.x >= r.x && actor.x <= r.x + r.w && actor.y >= r.y && actor.y <= r.y + r.h);
          const indoors = Boolean(buildingAt(state.world, actor)), surface = road || indoors ? 'stone' : 'earth';
          const s = this._spatial(actor, player, state.world), own = actor.id === player.id;
          const turn = this.footstepTurn++, recorded = this.samples.get(surface === 'stone' ? 'footStone' : 'footDirt');
          const bank = recorded?.duration >= 2.99 ? recorded : null;
          const buffer = bank || this.footstepBuffers.get(`${surface}:${turn % 4}`);
          this._voice({ buffer, offset: bank ? turn % 6 * .5 : 0, duration: bank ? .49 : .2, gain: (own ? .0125 : .0065) * s.gain,
            highpass: 80, lowpass: Math.min(s.lowpass, indoors ? 1750 : surface === 'stone' ? 2100 : 2800),
            pan: own ? 0 : s.pan, attack: .004, priority: -1, kind: 'footstep', actorId: actor.id });
          played++;
        }
      }
      this.footTravel.set(actor.id, { x: actor.x, y: actor.y, travel });
    }
    if (this.footTravel.size > 128) {
      const present = new Set(actors.map(actor => actor.id));
      for (const id of this.footTravel.keys()) if (!present.has(id)) this.footTravel.delete(id);
    }
  }

  _cityEvent(event, player, state) {
    if (event.kind === 'battle') return; // Retired synthetic battle cues cannot reappear after a stale call.
    if (this.levels.ambience === 0 || this.levels.master === 0) return;
    if (event.kind === 'rotor' || event.kind === 'engine') {
      if (this.cityPasses.length < 2) this.cityPasses.push({ ...event, startedAt: state.time, key: `city-pass:${event.kind}:${event.id}` });
      return;
    }
    let remaining = Math.max(0, 8 - [...this.voices].filter(v => v.bus === 'ambience').length);
    if (!remaining) return;
    const s = this._spatial(event, player, state.world), indoors = Boolean(buildingAt(state.world, player));
    const presence = (s.occluded ? .58 : 1) / (1 + (s.d / 650) ** 1.2) * (indoors ? .58 : 1);
    const delay = Math.min(1.2, s.d / WORLD_UNITS_PER_METRE / SOUND_SPEED_MPS), intensity = clamp(event.intensity || .7, 0, 1);
    const emit = options => {
      if (remaining-- <= 0) return;
      return this._voice({ pan: s.pan, priority: -2, bus: 'ambience', kind: `city-${event.kind}`, ...options });
    };
    if (event.kind === 'metal') {
      if (s.d > 750) return;
      emit({ buffer: this.cityMetal, duration: .65, delay, gain: .18 * s.gain * intensity,
        highpass: 180, lowpass: Math.min(s.lowpass, indoors ? 900 : 2400), rate: .85 + event.seed % 31 / 100, attack: .002 });
    } else if (event.kind === 'domestic' && event.variant === 'dog') {
      const buffer = this.samples.get('dog');
      if (buffer && s.d < 1200) emit({ buffer, duration: Math.min(buffer.duration, 2.1), delay,
        gain: .13 * presence * intensity, lowpass: Math.min(s.lowpass, indoors ? 1100 : 2600), highpass: 180,
        rate: .97 + event.seed % 7 / 100, attack: .012 });
    }
  }

  _cityPasses(state, player, indoors, profile) {
    this.cityPasses = this.cityPasses.filter(pass => {
      const phase = (state.time - pass.startedAt) / pass.duration;
      if (phase < 0 || phase >= 1 || this.levels.ambience === 0) { this._stopLoop(pass.key, .4); return false; }
      const point = { x: pass.x + (pass.toX-pass.x) * phase, y: pass.y + (pass.toY-pass.y) * phase };
      const s = this._spatial(point, player, state.world), rotor = pass.kind === 'rotor';
      const presence = Math.sin(Math.PI * phase) ** .8 / (1 + (s.d / (rotor ? 850 : 550)) ** 1.2);
      const gain = (rotor ? .12 : .085) * presence * pass.intensity * (indoors ? .55 : 1) * (rotor ? 1 : profile.domesticGain);
      this._loop(pass.key, rotor ? this.samples.get('rotor') : this.engine, { gain,
        lowpass: rotor ? (indoors ? 900 : 1700) : (indoors ? 280 : 580), highpass: 45, pan: s.pan,
        rate: rotor ? .94 + .05 * (1-phase) : .8 + .25 * Math.sin(Math.PI * phase) });
      return true;
    });
  }

  _ambience(state, player, dt) {
    if (!this._ready() || !player) return;
    const indoors = Boolean(buildingAt(state.world, player)), wind = this.samples.get('wind');
    const profile = cityAmbienceProfile(state), bed = profile.bedGain;
    const duck = this.context.currentTime < this.foregroundUntil ? .58 : 1;
    this.missionAmbienceBus.gain.setTargetAtTime(duck, this.context.currentTime, duck < 1 ? .025 : .24);
    const breeze = .83 + Math.sin(state.time * .19) * .12 + Math.sin(state.time * .071) * .05;
    // Existing loop gain/filter ramps soften each threshold crossing without
    // rebuilding audio nodes or tracing sound paths through individual walls.
    this._loop('wind', wind || this.noise, { gain: (wind ? .058 : .03) * breeze * (indoors ? .62 : 1) * bed,
      lowpass: indoors ? 1050 : profile.phase === 'night' ? 1250 : 1850, highpass: 85, rate: wind ? 1 : .7 });
    this._loop('city-bed', this.cityBed, { gain: .07 * bed * (indoors ? .5 : 1), lowpass: indoors ? 350 : 650,
      highpass: 65, rate: profile.phase === 'night' ? .87 : 1 });
    if (state.missionIndex === 0 && state.time < 20) {
      const rotor = this.samples.get('rotor');
      const pass = Math.sin(Math.PI * clamp(state.time / 20, 0, 1));
      if (rotor) this._loop('rotor', rotor, { gain: .085 * pass * (indoors ? .72 : 1) * bed,
        lowpass: indoors ? 1400 : 2100, highpass: 45, pan: (state.time / 20 - .5) * 1.6, rate: 1 });
    } else this._stopLoop('rotor');
    const vehicles = (state.vehicles || []).filter(v => v.active && v.kind !== 'helicopter');
    const nearest = vehicles.sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (nearest && distance(nearest, player) < 650) {
      const previous = this.vehiclePositions.get(nearest.id), speed = previous && dt > 0 ? distance(previous, nearest) / dt : 0;
      const s = this._spatial(nearest, player, state.world);
      this._loop('engine', this.engine, { gain: .11 * s.gain * (indoors ? .76 : 1) * bed,
        lowpass: clamp(700 - s.d, 180, 700) * (indoors ? .72 : 1), highpass: 35, pan: s.pan, rate: speed > 5 ? 1.08 : .77 });
    } else this._stopLoop('engine');
    const wreck = (state.vehicles || []).find(v => !v.active && (v.kind === 'helicopter' || v.kind === 'crash') && distance(v, player) < 410);
    if (wreck) {
      const s = this._spatial(wreck, player, state.world);
      this._loop('wreck-fire', this.fire, { gain: .075 * s.gain * bed, lowpass: Math.min(1900, s.lowpass),
        highpass: 130, pan: s.pan, rate: .94 + Math.sin(state.time * .27) * .025 });
    } else this._stopLoop('wreck-fire');
    const fires = [...(state.world?.ambientFires || [])].filter(f => distance(f, player) < 390)
      .sort((a,b) => distance(a,player)-distance(b,player)).slice(0,2), fireKeys = new Set();
    for (const fire of fires) {
      const key = `city-fire:${fire.id}`, s = this._spatial(fire, player, state.world); fireKeys.add(key);
      this._loop(key, this.fire, { gain: .09 * (fire.intensity || 1) * s.gain * (profile.phase === 'night' ? .8 : 1),
        lowpass: Math.min(1800, s.lowpass), highpass: 110, pan: s.pan, rate: .91 + Math.sin(state.time * .24) * .025 });
    }
    for (const key of [...this.loops.keys()]) if (key.startsWith('city-fire:') && !fireKeys.has(key)) this._stopLoop(key);
    if (!this.cityDirector) this.cityDirector = createCityAmbience(state.seed, state.missionIndex, state.time);
    for (const event of advanceCityAmbience(this.cityDirector, state)) this._cityEvent(event, player, state);
    this._cityPasses(state, player, indoors, profile);
    for (const v of vehicles) this.vehiclePositions.set(v.id, { x: v.x, y: v.y });
    this._mixReflections(state,player,dt);
  }

  tick(state, dt = 0, timing = {}) {
    if (!state) return;
    const player = state.squad?.find(a => a.id === state.playerId);
    const sceneKey = state.seed == null ? null : `${state.seed}:${state.missionIndex}`;
    const changedListener = this.lastPlayerId != null && state.playerId !== this.lastPlayerId;
    const changedEpoch = timing.epoch != null && this.transportEpoch != null && timing.epoch !== this.transportEpoch;
    const rewound = state.time < this.lastStateTime - .05;
    if (state.coop && sceneKey === this.lastSceneKey && rewound && !changedEpoch) return;
    const fresh = !this.lastState || sceneKey !== this.lastSceneKey || rewound || sceneKey == null && state !== this.lastState;
    if (fresh) {
      this._stopMission(); this.lastState = state; this.lastEventId = 0; this.seenEffects = new WeakSet(); this.effectIds.clear();
      this.footTravel.clear(); this.vehiclePositions.clear(); this.lastShots = 0; this.lastRadio = state.radio?.at(-1)?.id;
      this.shotBudget = 8; this.lastPlayerId = null; this.voiceDirector = createVoiceDirector(state.seed);
      this.distantShotBudget = 4; this.threatShotBudget = 4; this.distantShooters.clear(); this.fieldRadioDirector = createFieldRadioDirector(state.time);
      this.lastSpeech = null; this.lastCarrierAt = -Infinity; this.lastFlashKey = null;
      this.reportTurns.clear(); this.reportBursts.clear(); this.impactTurn = 0; this.lastReport = null;
      this.cityDirector = createCityAmbience(state.seed, state.missionIndex, state.time); this.cityPasses.length = 0;
      this.hitTimes.clear(); this.painTimes.clear(); this.fearTimes.clear(); this.hostileVoiceTimes.clear();
      this.lastPainTime = -Infinity; this.lastFearTime = -Infinity; this.lastHostileVoiceTime = -Infinity; this.foregroundUntil = 0;
      this.lastNearPassTime = -Infinity; this.presentationAnchor = null; this.needsLiveCursor = false; this.arrivalTrace.length = 0;
    } else if (changedListener || changedEpoch) {
      // A role swap changes transport epoch but keeps the same mission's event
      // ring. Keep its cursor; discard old-perspective arrivals without replay.
      this._cancelArrivals(); this._stopVoices(voice => voice.bus !== 'menu'); this._clearReflections(); this._clearSpeech();
      this.needsLiveCursor = true; this.presentationAnchor = null;
      this.reportBursts.clear();
      for (const key of [...this.loops.keys()]) if (key.startsWith('city-pass:')) this._stopLoop(key);
      this.cityDirector = createCityAmbience(state.seed, state.missionIndex, state.time); this.cityPasses.length = 0;
    }
    this.transportEpoch = timing.epoch ?? this.transportEpoch;
    this.lastState = state; this.lastSceneKey = sceneKey; this.lastStateTime = state.time;
    if (state.playerId !== this.lastPlayerId) { this.lastHealth = player?.hp ?? null; this.lastPlayerId = state.playerId; }
    const seconds = clamp(Number(dt) || 0, 0, .25), shots = Number(state.stats?.shots) || 0;
    this.shotBudget = Math.min(8, this.shotBudget + seconds * 24);
    this.distantShotBudget = Math.min(4, this.distantShotBudget + seconds * 8);
    this.threatShotBudget = Math.min(4, this.threatShotBudget + seconds * 16);
    const playing = state.status === 'playing', audible = playing && this.scene === 'mission' && this._ready();
    if (audible) this._ambience(state, player, seconds); else this._stopMission();
    const effectsAudible = audible && this.levels.master > 0 && this.levels.effects > 0;
    const skipBatch = this.needsLiveCursor;
    if (effectsAudible) this.needsLiveCursor = false; else this._cancelArrivals();
    const presentationTime = this._presentationTime(state, timing);
    if (audible && player) {
      if (effectsAudible && this.levels.ambience === 0) this._mixReflections(state, player, seconds);
      this._flashHearing(state, player, presentationTime, effectsAudible && !skipBatch);
    }
    if (Array.isArray(state.soundEvents)) {
      const events = state.soundEvents.filter(e => Number.isFinite(e.id) && e.id > this.lastEventId);
      for (const event of events) this.lastEventId = Math.max(this.lastEventId, event.id);
      if (effectsAudible && player && !skipBatch) {
        for (const event of events) {
          // A previously audible fear/pain voice should end at the observed
          // death even when the physical impact has not reached this listener.
          if (event.type === 'victim_hit' && event.alive === false) this._stopVoices(voice => voice.bus === 'distress' && voice.actorId === (event.victimId ?? event.actorId), .015);
          this._queueEvent(event, player, state, presentationTime);
        }
      }
    } else {
      // Compatibility with older simulations: consume each visual effect once, even while muted.
      let playerMuzzles = 0;
      for (const effect of state.effects || []) {
        if (!effect || typeof effect !== 'object') continue;
        const seen = effect.id != null ? this.effectIds.has(effect.id) : this.seenEffects.has(effect); if (seen) continue;
        if (effect.id != null) this.effectIds.add(effect.id); else this.seenEffects.add(effect);
        if (effect.type === 'muzzle' || effect.type === 'shot') {
          if (player && (effect.actorId === player.id || !effect.actorId && distance(effect, player) < 32)) playerMuzzles++;
          if (effectsAudible && !skipBatch) this._shot(effect, player);
        } else if (effectsAudible && !skipBatch && (effect.type === 'hit' || effect.type === 'dust' || effect.type === 'smoke')) {
          this._event({ ...effect, type: effect.type === 'smoke' ? 'smoke' : 'impact', material: effect.type === 'dust' ? 'concrete' : 'body' }, player);
        }
      }
      if (effectsAudible && player && !skipBatch) for (let i = 0; i < Math.min(2, Math.max(0, shots - this.lastShots - playerMuzzles)); i++) this._shot({ ...player, actorId: player.id, weapon: roleProfile(player).weapon }, player);
      if (this.effectIds.size > 600) this.effectIds = new Set([...this.effectIds].slice(-300));
    }
    if (effectsAudible && player && !skipBatch) this._drainArrivals(state, player);
    this._movement(state, player || { x: 0, y: 0 }, effectsAudible && !skipBatch);
    const radio = state.radio?.at(-1), radioId = radio?.id ?? null;
    if (effectsAudible && !skipBatch && player && radioId != null && radioId !== this.lastRadio) {
      const messages = (state.radio || []).filter(message => message.id > (this.lastRadio ?? -Infinity) &&
        (!Number.isFinite(message.time) || presentationTime - message.time < 1.1));
      messages.sort((a, b) => (voicePolicy(squadVoiceCategory(b))?.priority || 0) -
        (voicePolicy(squadVoiceCategory(a))?.priority || 0) || b.id - a.id);
      for (const message of messages) if (this._radio(message, player, state)) break;
    }
    if (effectsAudible && player) {
      this._updateSpeech(state, player);
      if (!skipBatch && !this.activeSpeech) {
        const category = fieldRadioCue(this.fieldRadioDirector, state, player);
        if (category) this._say(category, FIELD_RADIO_SPEAKER, player, state);
      }
    }
    if (effectsAudible && !skipBatch && player && !Array.isArray(state.soundEvents) && this.lastHealth != null && player.hp < this.lastHealth) {
      this._victimHit({ ...player, victimId: player.id, damage: this.lastHealth - player.hp, cause: 'bullet', alive: player.alive !== false }, player, state);
    }
    this.lastShots = shots; this.lastRadio = radioId; this.lastHealth = player?.hp ?? null;
    this.diagnosticTime += seconds;
    if (this.diagnosticTime > .5) { this.diagnosticTime = 0; this._diagnostics(); }
  }

  _stopVoices(matches = () => true, fade = .03) {
    const now = this.context?.currentTime || 0;
    for (const voice of [...this.voices]) {
      if (!matches(voice)) continue;
      voice.envelope.gain.cancelScheduledValues(now); voice.envelope.gain.setTargetAtTime(0, now, fade / 5);
      try { voice.source.stop(voice.start > now ? now : now + fade); } catch {}
      this.voices.delete(voice);
    }
  }

  _stopMission() {
    this._cancelArrivals();
    this.reportBursts.clear();
    this._clearSpeech();
    this.cityDirector = null; this.cityPasses.length = 0;
    const now = this.context?.currentTime || 0;
    for (const key of [...this.loops.keys()]) if (!key.startsWith('menu:')) this._stopLoop(key);
    this._stopVoices(voice => voice.bus !== 'menu');
    this._clearReflections();
    this.hearingFilter?.frequency.setTargetAtTime(20000, now, .025);
    this.hearingGain?.gain.setTargetAtTime(1, now, .025);
  }

  stop() {
    if (this.lastState) this.needsLiveCursor = true;
    this._cancelMenuScheduler();
    this._stopMission();
    for (const key of [...this.loops.keys()]) this._stopLoop(key);
    this._stopVoices();
    this._diagnostics();
  }
}
