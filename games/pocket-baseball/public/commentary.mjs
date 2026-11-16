import { getRoster, getBatter, getBatterHand, getPitcher } from './rosters.mjs?v=0.6.1';

const MODES = new Set(['voice', 'captions', 'off']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const surname = name => (name || 'The batter').split(' ').at(-1);
const pick = (lines, variant) => lines[((variant % lines.length) + lines.length) % lines.length];
const cue = (key, priority, text, ttl = 3.7) => ({ key, priority, text, ttl });
const bases = ['home', 'first', 'second', 'third', 'home'];

/** Pure cue selection. It never predicts a call or reveals a live pitch. */
export function selectCommentary(event, state = {}, variant = 0) {
  if (!event) return null;
  const batter = state.pitch?.batter || getBatter(state), pitcher = getPitcher(state);
  const name = surname(batter.name);
  switch (event.type) {
    case 'start': return cue('start', 3, pick([
      "Let's play ball!",
      `Play ball at ${state.options?.park === 'fenway' ? 'Fenway' : 'Harbor Field'}.`,
    ], variant), 2.8);
    case 'batter': {
      const current = getBatter(state), hand = getBatterHand(state);
      return cue('batter', 2, pick([
        `${current.name}, batting ${hand === 'L' ? 'left' : 'right'} handed.`,
        `${current.name} against ${pitcher.name}.`,
        state.bases?.some(Boolean) ? `${surname(current.name)} has runners aboard.` : `${surname(current.name)} settles into the box.`,
      ], variant), 3.3);
    }
    case 'windup': case 'pitch': case 'swing': return null;
    case 'contact': {
      if (event.foul) return cue('contact-foul', 2, pick(['Sliced toward foul ground.', 'That one is drifting foul.'], variant), 2.2);
      if (event.launchAngle < 12) return cue('grounder', 3, pick(['On the ground, toward the infield.', 'Chopped on the ground.', 'A ground ball. The defense has a play.'], variant), 2.1);
      if (event.quality > .84) return cue('barrel', 4, pick(['A solid crack of the bat!', `${name} drives it!`, 'Hit hard into the outfield!'], variant), 2.4);
      return cue('contact', 3, pick(['Lifted into the outfield.', 'The ball is in play.', 'Up in the air. The fielders are moving.'], variant), 2.2);
    }
    case 'wall': return cue('wall', 5, pick(['Off the wall! Still in play.', 'A carom off the wall. Watch the runners.', 'That stays in the park!'], variant), 3);
    case 'catch': return cue('catch', 5, event.tagUp ? 'Caught! The runners have to tag.' : pick(['Makes the catch!', 'Hauls it in for the out.', 'Right there to put it away.'], variant), 2.6);
    case 'throw': return event.base === 4 || state.play?.outs?.length ? cue('throw', 3, `The throw goes ${event.base === 4 ? 'home' : `to ${bases[event.base] || 'the base'}`}!`, 1.9) : null;
    case 'steal': return cue('steal', 4, pick(['The runner is going!', 'There goes the runner!', `Breaking for ${bases[event.base] || 'the next base'}!`], variant), 2);
    case 'pickoff': return cue('pickoff', 2, pick(['A quick throw over.', 'Keeping the runner close.'], variant), 1.9);
    case 'out':
      if (event.kind === 'strikeout' || event.kind === 'catch') return null;
      return cue('out', 5, pick([`Out${event.base ? ` at ${bases[event.base]}` : ''}!`, event.kind === 'tag' ? 'The tag is there in time!' : 'The defense gets the out.'], variant), 2.4);
    case 'run': return cue('run', 6, pick([`${getRoster(event.side).name} brings a run home!`, 'A run comes across!', 'That run is on the board.'], variant), 3.2);
    case 'hit-by-pitch': return cue('hbp', 6, event.award ? pick([`${surname(event.name)} is hit. Dead ball.`, 'That pitch catches the batter. Take first.', 'Too far inside. That puts a runner on.'], variant) : 'It hit the batter, but the strike takes precedence.', 3.7);
    case 'mound-warning': return cue('warning', 7, 'A hit batter, and a warning for both dugouts. Keep it over the plate.', 4.5);
    case 'mound-offer': return cue('mound-offer', 8, pick(['Another hit batter. The dugouts are on edge.', `${surname(event.name)} is not happy after another hit batter.`], variant), 4.1);
    case 'mound-charge': return cue('mound-charge', 9, pick([`${surname(event.batterName)} is charging the mound!`, 'Here comes the hitter! Trouble at the mound.'], variant), 3.4);
    case 'fight-start': return cue('fight-start', 3, 'They square up. The umpire is coming in.', 3);
    case 'fight-hit': return event.dodged || event.blocked ? null : cue('fight-hit', 2, pick(['They are still going at it.', 'The umpire wants this broken up.', 'Tempers have boiled over.'], variant), 2.5);
    case 'fight-end': return cue('fight-end', 10, `${surname(event.batterName)} and ${surname(event.pitcherName)} are both ejected. The base award stands.`, 5.4);
    case 'ejection': return null; // The end call covers both; separate calls would overlap.
    case 'pitching-change': return cue('pitching-change', 6, pick([
      `${event.name} takes over on the mound.`,
      `A call to the bullpen. Here comes ${event.name}, the ${event.throws === 'L' ? 'left' : 'right'} hander.`,
    ], variant), 4.4);
    case 'half': return cue('half', 7, pick(['That ends the half inning. The teams change sides.', 'Three outs. Time to switch sides.'], variant), 4);
    case 'final': return cue('final', 11, `${getRoster(event.winner).name} wins it, ${Math.max(...(event.score || state.score || [0, 0]))} to ${Math.min(...(event.score || state.score || [0, 0]))}. That's the ballgame.`, 6);
    case 'result': {
      if (['hitByPitch', 'brawl', 'ejection'].includes(event.kind)) return null;
      if (event.kind === 'homeRun') return cue('homeRun', 9, state.pending === 'final' ? "It's gone! A walk off home run!" : pick(['That ball is gone! Home run!', `${name} sends it out of here!`, 'Over the wall! A home run!'], variant), 4.5);
      if (event.kind === 'doublePlay') return cue('doublePlay', 8, pick(['Two outs on one play! A double play.', 'They turn two! That changes the inning.'], variant), 4);
      if (event.kind === 'groundRuleDouble') return cue('groundRuleDouble', 6, 'Out of play. A ground rule double, and two bases for the runners.', 4.5);
      if (event.kind === 'hit') return cue(`hit-${event.bases || 1}`, 5, pick([
        `${name} is on with a ${event.bases === 3 ? 'triple' : event.bases === 2 ? 'double' : 'single'}.`,
        event.bases === 3 ? 'All the way to third! A triple.' : event.bases === 2 ? 'In safely at second. A double.' : 'A base hit. The inning continues.',
      ], variant), 3.3);
      if (event.kind === 'walk') return cue('walk', 5, pick(['Ball four. Take your base.', `${name} works the walk.`, 'Missed outside the zone. That is ball four.'], variant), 3.3);
      if (event.kind === 'strikeout') return cue('strikeout', 6, state.swing ? pick(['Swing and a miss. Strike three!', `${surname(pitcher.name)} gets the strikeout.`, 'The pitcher gets the swinging strikeout.'], variant) : pick(['Strike three, looking!', 'Caught the zone for strike three.', `${name} is called out on strikes.`], variant), 3.4);
      if (event.kind === 'sacrificeFly') return cue('sacrificeFly', 6, 'The catch is made, but the run scores on the sacrifice fly.', 4);
      if (event.kind === 'foul') return cue('foul', 3, state.strikes === 2 ? pick(['Fouled away. The at bat continues.', 'Fights that one off.', 'Still alive with two strikes.'], variant) : pick(['Foul ball.', 'Off the bat and out of play.'], variant), 2.5);
      // Velocity and shape calls become eligible only after the pitch is settled.
      if (!['strike', 'ball'].includes(event.kind) || state.phase !== 'result') return null;
      if (state.pitch?.mph >= 100 && variant % 3 === 0) return cue('velocity', 4, `${Math.round(state.pitch.mph)} miles an hour on that one.`, 2.8);
      if (state.pitch?.type === 'eephus' && variant % 3 === 0) return cue('eephus', 3, 'A big looping eephus. A very different look.', 3.1);
      if (state.balls === 3 && state.strikes === 2) return cue('full-count', 4, pick(['Full count. Something has to give.', 'Three and two. The next one matters.'], variant), 2.9);
      if (event.kind === 'strike') return cue('strike', 2, state.swing ? pick(['Swing and a miss.', 'Could not connect on that one.', 'The pitcher wins that pitch.'], variant) : pick(['Called strike.', 'Right in the zone.', 'Takes it for a strike.'], variant), 2);
      return cue('ball', 2, pick(['Outside the zone.', 'No swing. Ball.', 'That misses. A ball.'], variant), 2);
    }
    default: return null;
  }
}

/** One current call, never a backlog. Device speech is optional; text is the fallback. */
export class BaseballCommentary {
  constructor({ mode = 'voice', enabled = true, onCaption = () => {}, onSpeaking = () => {}, speech = undefined, Utterance = undefined } = {}) {
    this.mode = MODES.has(mode) ? mode : 'voice'; this.enabled = !!enabled;
    this.onCaption = onCaption; this.onSpeaking = onSpeaking;
    this.speech = speech === undefined ? globalThis.speechSynthesis : speech;
    this.Utterance = Utterance === undefined ? globalThis.SpeechSynthesisUtterance : Utterance;
    this.voice = null; this.unlocked = false; this.suspended = false; this.active = true;
    this.current = null; this.serial = 0; this.variants = new Map(); this.recent = [];
    this.seen = new Set(); this.lastCall = -Infinity; this.lastTime = 0; this.lastPhase = null; this.lastReady = null; this.utterance = null;
    this._refreshVoices = () => {
      try {
        const voices = this.speech?.getVoices?.() || [];
        const local = voices.filter(v => v.localService === true && /^en(?:[-_]|$)/i.test(v.lang || ''));
        this.voice = local.find(v => v.default) || local.find(v => /^en[-_]US$/i.test(v.lang)) || local[0] || null;
      } catch { this.voice = null; }
    };
    this._refreshVoices(); this.speech?.addEventListener?.('voiceschanged', this._refreshVoices);
  }
  get voiceAvailable() { return !!(this.speech && this.Utterance && this.voice); }
  unlock() {
    this.unlocked = true; this.suspended = false; this._refreshVoices();
    if (this.enabled && this.mode === 'voice') { try { this.speech?.resume?.(); } catch {} }
  }
  setMode(mode) {
    this.mode = MODES.has(mode) ? mode : 'voice'; this._cancelSpeech();
    if (this.mode === 'off') this._clearCaption();
  }
  setEnabled(enabled) { this.enabled = !!enabled; if (!this.enabled) this._cancelSpeech(); }
  _cancelSpeech() {
    this.serial++; this.utterance = null;
    try { this.speech?.cancel?.(); } catch {}
    this.onSpeaking(false);
  }
  _clearCaption() { if (this.current) { this.current = null; this.onCaption('', null); } }
  _speak(call) {
    if (!this.enabled || this.mode !== 'voice' || !this.unlocked || !this.voiceAvailable || this.suspended) return;
    try {
      this._cancelSpeech();
      const utterance = this.utterance = new this.Utterance(call.text), serial = this.serial;
      utterance.voice = this.voice; utterance.lang = this.voice.lang || 'en-US';
      utterance.rate = call.priority >= 8 ? 1.12 : 1.04; utterance.pitch = call.priority >= 8 ? 1.04 : .97; utterance.volume = .68;
      utterance.onstart = () => { if (serial === this.serial) this.onSpeaking(true); };
      const finish = () => { if (serial === this.serial) { this.utterance = null; this.onSpeaking(false); } };
      utterance.onend = finish; utterance.onerror = finish;
      this.speech.resume?.(); this.speech.speak(utterance);
    } catch { this.utterance = null; this.onSpeaking(false); }
  }
  event(event, state = {}) {
    if (!event || !this.active || this.suspended || this.mode === 'off') return null;
    const now = finite(state.time), type = event.type;
    if (['pitch', 'windup'].includes(type)) {
      if (type === 'pitch' || this.current?.pitchId !== state.pitch?.id) { this._cancelSpeech(); this._clearCaption(); }
      return null;
    }
    const signature = `${type}:${event.tick ?? event.time ?? now}:${event.side ?? ''}:${event.runnerId ?? ''}:${event.kind ?? ''}:${event.playerId ?? ''}`;
    if (this.seen.has(signature)) return null;
    this.seen.add(signature); if (this.seen.size > 160) this.seen.delete(this.seen.values().next().value);
    const variant = this.variants.get(type) || 0;
    let candidate = selectCommentary(event, state, variant);
    if (!candidate) return null;
    for (let i = 1; i < 4 && this.recent.includes(candidate.text); i++) candidate = selectCommentary(event, state, variant + i);
    if (this.current && now < this.current.until && candidate.priority <= this.current.priority) return null;
    const spacing = candidate.priority >= 7 ? .15 : candidate.priority >= 5 ? .65 : 2.8;
    if (now - this.lastCall < spacing && candidate.priority <= (this.current?.priority || 0)) return null;
    if (candidate.key === 'fight-hit' && now - this.lastCall < 3.5) return null;
    this.variants.set(type, variant + 1);
    this.lastCall = now; this.recent.push(candidate.text); if (this.recent.length > 12) this.recent.shift();
    this.current = { ...candidate, startedAt: now, until: now + candidate.ttl, phase: state.phase, pitchId: state.pitch?.id ?? state.nextPitchId };
    if (type === 'start') { this.lastPhase = state.phase; this.lastReady = `${state.inning}:${state.half}:${getBatter(state).id}`; }
    this.onCaption(candidate.text, this.current); this._speak(this.current); return this.current;
  }
  update(state, { active = true, paused = false } = {}) {
    const now = finite(state?.time), phase = state?.phase;
    this.active = !!active;
    if (!active || paused) { if (!this.suspended || this.current) this.suspend(); return; }
    this.suspended = false;
    if (now < this.lastTime - .5) this.reset();
    this.lastTime = now;
    if (this.current && now >= this.current.until) { this._cancelSpeech(); this._clearCaption(); }
    if (phase === 'ready' && this.current && this.current.phase !== 'ready') { this._cancelSpeech(); this._clearCaption(); }
    if (phase !== this.lastPhase) {
      if (phase === 'ready' || phase === 'pitch' || phase === 'windup' && this.current?.pitchId !== state.pitch?.id) { this._cancelSpeech(); this._clearCaption(); }
      this.lastPhase = phase;
    }
    if (phase === 'ready') {
      const batter = getBatter(state), key = `${state.inning}:${state.half}:${batter.id}`;
      if (key !== this.lastReady) { this.lastReady = key; this.event({ type: 'batter', tick: state.tick }, state); }
    }
  }
  suspend() { this.suspended = true; this._cancelSpeech(); this._clearCaption(); }
  reset() {
    this._cancelSpeech(); this._clearCaption(); this.variants.clear(); this.recent.length = 0; this.seen.clear();
    this.lastCall = -Infinity; this.lastTime = 0; this.lastPhase = null; this.lastReady = null; this.suspended = false; this.active = true;
  }
  destroy() { this.reset(); this.speech?.removeEventListener?.('voiceschanged', this._refreshVoices); }
}
