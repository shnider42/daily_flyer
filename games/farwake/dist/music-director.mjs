// The director chooses when a composed piece belongs. The renderer owns notes.
// Listening history is deliberately bounded, session-only, and never transmitted.
export const MUSIC_PRESENCE = Object.freeze({
  quiet: [80, 155], balanced: [38, 90], frequent: [10, 30],
});

export function musicSeed(value) {
  let hash = 2166136261;
  for (const c of String(value ?? 'farwake')) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return hash >>> 0;
}

const duration = cue => Number(cue?.durationSeconds) || ((cue?.bars || 16) * 4 * 60 / (cue?.bpm || 72));
const danger = family => ['combat', 'tension', 'terror'].includes(family);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const environmental = family => family === 'cave' || family === 'planet';
const GENERIC_TAGS = new Set(['flight', 'surface', 'settlement', 'solitude', 'ship', 'ground',
  'combat', 'tension', 'terror', 'exploration', 'planet', 'cave']);
const BIOME_TAGS = new Set(['temperate', 'forest', 'desert', 'ocean', 'ice', 'volcanic',
  'industrial', 'barren', 'ruin', 'earth']);
const ambientFamily = context => context.scene === 'menu' ? 'theme'
  : context.environment === 'cave' ? 'cave'
  : context.scene === 'social' ? 'social'
  : context.environment === 'planet' ? 'planet' : 'exploration';
const LOCATION_TRANSITION_SECONDS = 6;

export class MusicDirector {
  constructor({ cues = [], themeId = 'long-way-home', seed = 'farwake' } = {}) {
    this.cues = cues; this.themeId = themeId; this.seed = musicSeed(seed);
    this.sequence = 0; this.current = null; this.nextMusicAt = 0; this.lastNow = 0;
    this.combatUntil = -Infinity; this.tensionUntil = -Infinity; this.discoveryUntil = -Infinity;
    this.terrorUntil = -Infinity; this.recoveryUntil = -Infinity; this.lastTerror = -Infinity;
    this.lastDanger = false; this.themePlayed = false; this.previewRequested = false;
    this.history = []; this.lastPlayed = new Map(); this.eventKeys = []; this.terrorKeys = [];
    this.terrorTimes = []; this.suspended = false; this.suppressed = false;
    this.placeKey = null; this.placeFamily = null;
    this.transitionKey = null; this.transitionAt = Infinity;
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  notify(signal, now = this.lastNow, key = null) {
    if (!Number.isFinite(now)) return;
    if (key != null) {
      const id = String(key);
      if (this.eventKeys.includes(id)) return;
      this.eventKeys.push(id); if (this.eventKeys.length > 96) this.eventKeys.shift();
    }
    if (signal === 'combat') this.combatUntil = Math.max(this.combatUntil, now + 14);
    if (signal === 'tension') this.tensionUntil = Math.max(this.tensionUntil, now + 9);
    if (signal === 'discovery') this.discoveryUntil = Math.max(this.discoveryUntil, now + 24);
    // Recovery events cannot prematurely cancel recent incoming fire.
  }

  requestTheme() { this.previewRequested = true; }

  stopTheme(now = this.lastNow) {
    this.previewRequested = false;
    if (this.current?.cue.id === this.themeId) {
      this.current = null; this.nextMusicAt = now + 50; this.themePlayed = true;
    }
  }

  suspend(now = this.lastNow) {
    this.current = null; this.suspended = true; this.nextMusicAt = now + 5;
  }

  gap(presence) {
    const [lo, hi] = MUSIC_PRESENCE[presence] || MUSIC_PRESENCE.balanced;
    return lo + this.random() * (hi - lo);
  }

  select(family, now, context) {
    let pool = this.cues.filter(cue => cue.family === family);
    const tags = context.tags || [];
    if (family === 'social' && !tags.includes('whimsical') && !tags.includes('garden')) {
      pool = pool.filter(cue => !cue.tags?.includes('whimsical'));
    }
    if (!pool.length && ['discovery', 'cave', 'planet'].includes(family)) pool = this.cues.filter(cue => cue.family === 'exploration');
    if (!pool.length) return null;
    const ground = tags.includes('ground') || !tags.includes('ship') && tags.includes('surface');
    const space = !ground && tags.some(tag => ['ship', 'flight', 'capital', 'navy'].includes(tag));
    if (family === 'combat') {
      // A pursuit tag does not turn a ship-only escape piece into infantry
      // music. Explicit dual-domain pieces and unclassified cues remain useful
      // fallbacks, including when the usual choices are still on cooldown.
      const compatible = pool.filter(cue => {
        const own = cue.tags || [];
        const forGround = own.some(tag => ['ground', 'surface', 'infantry', 'boarding'].includes(tag));
        const forSpace = own.some(tag => ['ship', 'flight', 'navy', 'capital'].includes(tag));
        if (ground && forSpace && !forGround || space && forGround && !forSpace) return false;
        return !own.includes('capital') || tags.includes('capital') || tags.includes('navy');
      });
      if (compatible.length) pool = compatible;
    }
    const available = pool.filter(cue => now - (this.lastPlayed.get(cue.id) ?? -Infinity) >= (cue.cooldownSeconds ?? 180));
    if (available.length) pool = available;
    else if (!danger(family)) return null;
    const fresh = pool.filter(cue => !this.history.slice(-2).includes(cue.id));
    if (fresh.length) pool = fresh;
    const specific = tags.filter(tag => !GENERIC_TAGS.has(tag));
    const affinity = cue => {
      const own = cue.tags || [], has = tag => own.includes(tag) && tags.includes(tag);
      if (environmental(family)) {
        // The actual biome wins over descriptive overlap such as "stone".
        // Homeworld culture gets its own voice while the ordinary biome stays
        // in rotation once that more specific piece needs a rest.
        if (context.culture && !GENERIC_TAGS.has(context.culture) && own.includes(context.culture)) return 1000;
        if (has('homeworld')) return 600;
        if (has('alien')) return 400;
        if (context.biome && own.includes(context.biome)) return 200;
        if (specific.some(tag => BIOME_TAGS.has(tag) && own.includes(tag))) return 100;
        return own.some(tag => specific.includes(tag)) ? 20 : own.some(tag => tags.includes(tag)) ? 1 : 0;
      }
      if (family === 'combat') {
        let score = 0;
        if (has('boarding')) score += 400;
        if (has('capital') || has('navy')) score += 300;
        if (has('infantry')) score += 250;
        if (has('emergency')) score += 180;
        if (has('pursuit')) score += 140;
        if (has('escort') || has('defense')) score += 100;
        if (ground && own.some(tag => ['ground', 'surface', 'infantry'].includes(tag)) ||
          space && own.some(tag => ['ship', 'flight'].includes(tag))) score += 10;
        if (own.includes('boarding') && !tags.includes('boarding')) score -= 30;
        return score;
      }
      return own.some(tag => specific.includes(tag)) ? 20 : own.some(tag => tags.includes(tag)) ? 1 : 0;
    };
    const best = Math.max(...pool.map(affinity));
    pool = pool.filter(cue => affinity(cue) === best);
    const regional = musicSeed(context.paletteKey || 'open-sky');
    return pool[(Math.floor(this.random() * pool.length) + regional) % pool.length];
  }

  begin(cue, now, context, { fast = false, preview = false } = {}) {
    if (!cue) return;
    this.sequence++;
    this.current = { cue, token: this.sequence, startedAt: now,
      until: now + duration(cue) + 2,
      seed: musicSeed(`${context.paletteKey}|${cue.id}|${this.sequence}`),
      fadeIn: fast ? .9 : cue.family === 'theme' ? 1.6 : 3.5,
      fadeOut: fast ? .35 : 4, preview,
      placeKey: this.placeKey, placeFamily: this.placeFamily };
    this.transitionKey = null; this.transitionAt = Infinity;
    if (cue.family === 'recovery') this.recoveryUntil = this.current.until;
    this.history.push(cue.id); if (this.history.length > 8) this.history.shift();
    this.lastPlayed.set(cue.id, now);
    if (this.lastPlayed.size > 64) this.lastPlayed.delete(this.lastPlayed.keys().next().value);
    if (cue.id === this.themeId) this.themePlayed = true;
  }

  update(context = {}, now = 0, { enabled = true, presence = 'balanced' } = {}) {
    now = Number.isFinite(now) ? Math.max(now, this.lastNow) : this.lastNow;
    this.lastNow = now;
    const duck = context.dialogue ? .34 : context.menuOpen || context.paused ? .65 : 1;
    if (!enabled || context.hidden) {
      if (!this.suppressed) this.suspend(now);
      this.suppressed = true;
      return this.decision('silence', duck, .15);
    }
    if (this.suppressed || this.suspended) {
      this.suppressed = false; this.suspended = false;
      this.nextMusicAt = now + 3;
    }
    if (context.observedThreat || context.combat || context.pursuit) this.combatUntil = now + 14;
    if (context.tension) this.tensionUntil = now + 9;
    if (context.silence) {
      this.current = null; this.nextMusicAt = now + 12;
      return this.decision('silence', duck, .8);
    }
    const inGame = context.scene !== 'menu';
    const placeFamily = ambientFamily(context), placeKey = `${placeFamily}:${context.paletteKey || context.contextKey || 'open-sky'}`;
    const changedPlace = this.placeKey !== null && this.placeKey !== placeKey;
    const previousPlaceFamily = this.placeFamily;
    this.placeKey = placeKey; this.placeFamily = placeFamily;
    // Let the current phrase breathe briefly when arriving somewhere with its
    // own music, then crossfade. A menu theme cannot linger for minutes in a
    // cave. Briefly crossing a threshold and returning cancels the transition.
    const mismatchedPlace = this.current && !danger(this.current.cue.family) && this.current.cue.family !== 'recovery'
      && this.current.placeKey !== placeKey && (environmental(placeFamily) || environmental(this.current.placeFamily));
    if (mismatchedPlace) {
      if (this.transitionKey !== placeKey) { this.transitionKey = placeKey; this.transitionAt = now + LOCATION_TRANSITION_SECONDS; }
      if (now >= this.transitionAt && !context.paused) { this.current = null; this.nextMusicAt = now; this.transitionKey = null; this.transitionAt = Infinity; }
    } else { this.transitionKey = null; this.transitionAt = Infinity; }
    if (!this.current && changedPlace && (environmental(placeFamily) || environmental(previousPlaceFamily))) {
      this.nextMusicAt = Math.min(this.nextMusicAt, now + LOCATION_TRANSITION_SECONDS);
    }
    const combat = inGame && (now < this.combatUntil || context.emergency);
    const tense = inGame && now < this.tensionUntil;
    const terrorKey = String(context.terrorKey || context.paletteKey || 'authored-reveal');
    this.terrorTimes = this.terrorTimes.filter(time => now - time < 3600);
    if (inGame && context.terror && !combat && !this.terrorKeys.includes(terrorKey)
      && now - this.lastTerror >= 1200 && this.terrorTimes.length < 3) {
      this.terrorKeys.push(terrorKey); if (this.terrorKeys.length > 32) this.terrorKeys.shift();
      this.terrorTimes.push(now); this.lastTerror = now; this.terrorUntil = now + 20;
    }
    const terror = inGame && !combat && now < this.terrorUntil;
    const underPressure = combat || terror || tense;
    if (this.lastDanger && !underPressure && inGame) {
      this.recoveryUntil = now + 28; this.nextMusicAt = now;
      if (this.current && danger(this.current.cue.family)) this.current = null;
    }
    this.lastDanger = !!underPressure;
    if (this.current && now >= this.current.until) {
      const family = this.current.cue.family;
      this.current = null;
      this.nextMusicAt = now + (danger(family) ? 1.5 : this.gap(presence));
      if (family === 'recovery') { this.recoveryUntil = -Infinity; this.nextMusicAt = now + Math.max(35, this.gap(presence)); }
      // An ordinary ending inside an arrival's short grace period must not
      // replace that pending location transition with a much longer rest.
      if (this.transitionKey === placeKey) this.nextMusicAt = Math.min(this.nextMusicAt, this.transitionAt);
    }
    let mood = combat ? 'combat' : terror ? 'terror' : tense ? 'tension'
      : inGame && now < this.recoveryUntil ? 'recovery'
      : !inGame ? 'theme' : now < this.discoveryUntil || context.scene === 'discovery' ? 'discovery'
      : placeFamily;
    if (this.current && danger(this.current.cue.family) && !danger(mood)) this.current = null;
    if (this.current && danger(mood) && this.current.cue.family !== mood) {
      // A hit can interrupt a peaceful phrase; further hits do not restart it.
      this.current = null; this.nextMusicAt = now;
    }
    if (this.current?.cue.family === 'recovery' && now >= this.recoveryUntil) {
      this.current = null; this.nextMusicAt = now + Math.max(35, this.gap(presence));
    }
    if (!underPressure && this.previewRequested) {
      const theme = this.cues.find(cue => cue.id === this.themeId);
      if (theme && this.current?.cue.id !== theme.id) this.begin(theme, now, context, { preview: true });
      this.previewRequested = false;
    }
    if (!this.current && (underPressure || now >= this.nextMusicAt)) {
      if (mood === 'theme') {
        if (!this.themePlayed) this.begin(this.cues.find(cue => cue.id === this.themeId), now, context);
        else { mood = 'silence'; this.nextMusicAt = now + 15; }
      } else if (!context.paused || underPressure) {
        const cue = this.select(mood, now, context);
        if (cue) this.begin(cue, now, context, { fast: danger(mood) });
        else this.nextMusicAt = now + 12;
      }
    }
    return this.decision(this.current?.cue.family || (underPressure ? mood : 'silence'), duck);
  }

  decision(mood, duck = 1, fadeOut = null) {
    return { cueId: this.current?.cue.id ?? null, token: this.current?.token ?? null,
      seed: this.current?.seed ?? this.seed, mood, duck: clamp(duck, 0, 1),
      fadeIn: this.current?.fadeIn ?? 3, fadeOut: fadeOut ?? this.current?.fadeOut ?? 4,
      theme: this.current?.cue.id === this.themeId, preview: !!this.current?.preview,
      nextMusicAt: this.nextMusicAt };
  }
}
