export const MENU_THEME = Object.freeze({
  id: 'shnider-theme', title: 'Farwake menu theme', family: 'theme',
  // Keep the upload's stable ID, but do not infer its composer's name from the filename.
  artist: null, credit: 'Original music contributed by a friend of Farwake.',
  durationSeconds: 197.625, tags: Object.freeze(['menu', 'theme']), loopInMenu: true,
});

export const MORROW_FLIGHTLINE = Object.freeze({
  id: 'morrow-flightline-loop', title: 'Morrow Flightline Loop', family: 'combat',
  durationSeconds: 142.222, cooldownSeconds: 240,
  tags: Object.freeze(['long-corridor', 'ground', 'flight']), intensity: .64,
});

export const FARWAKE_V33B = Object.freeze({
  id: 'farwake-v33b', title: 'Farwake V33B — Triplets & Clean Ending', family: 'combat',
  durationSeconds: 141.177, cooldownSeconds: 240,
  tags: Object.freeze(['boss', 'ground']), intensity: .82,
});

export const RECORDED_MUSIC = Object.freeze([
  { cue: MENU_THEME, url: new URL('./music/shnider-menu-theme.m4a', import.meta.url).href },
  { cue: MORROW_FLIGHTLINE, url: new URL('./music/morrow-flightline-loop.m4a', import.meta.url).href },
  { cue: FARWAKE_V33B, url: new URL('./music/farwake-v33b-triplets-clean-ending.m4a', import.meta.url).href },
]);
const seconds = value => Number.isFinite(value) ? Math.max(0, value) : 0;

/** One reusable media element keeps streaming memory and browser activation bounded. */
export class RecordedTheme {
  constructor(ctx, destination, recording = RECORDED_MUSIC[0]) {
    this.ctx = ctx; this.destination = destination; this.recording = recording;
    this.media = null; this.source = null; this.gain = null; this.owner = null;
    this.pending = null; this.serial = 0; this.primed = false; this.blocked = false; this.error = null;
  }

  ensure() {
    if (this.media) return true;
    try {
      const Audio = globalThis.Audio || globalThis.window?.Audio;
      if (!Audio || !this.ctx?.createMediaElementSource) return false;
      const media = new Audio(this.recording.url), gain = this.ctx.createGain();
      media.preload = this.recording.cue.loopInMenu ? 'auto' : 'metadata'; media.playsInline = true; gain.gain.value = 0;
      const source = this.ctx.createMediaElementSource(media);
      source.connect(gain); gain.connect(this.destination);
      this.media = media; this.source = source; this.gain = gain;
      media.addEventListener('ended', () => {
        if (media.ended && !media.loop && this.owner) this.release(this.owner);
      });
      media.addEventListener('error', () => this.fail(this.serial, media.error));
      return true;
    } catch (error) { this.blocked = true; this.error = error?.name || 'Audio unavailable'; return false; }
  }

  silence() {
    if (!this.gain) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now); this.gain.gain.setValueAtTime(0, now);
  }

  /** Call synchronously from the existing trusted click/touch/key activation. */
  unlock() {
    if (globalThis.document?.hidden || this.ctx?.state === 'closed' || !this.ensure()) return;
    if (this.primed && !this.blocked) return;
    this.blocked = false; this.error = null;
    if (this.owner?._stoppingAt != null) return;
    this.attempt();
  }

  attempt() {
    if (!this.media || this.pending || this.blocked) return;
    if (this.owner && !this.media.paused) { this.fadeIn(this.owner); return; }
    const serial = ++this.serial;
    this.pending = serial;
    try {
      Promise.resolve(this.media.play()).then(() => {
        if (serial !== this.serial) return;
        this.pending = null; this.primed = true;
        if (this.owner && !this.owner.ended) this.fadeIn(this.owner);
        else {
          // Priming unlocks this same element without sounding or advancing the song.
          this.media.pause(); this.resetPosition();
        }
      }, error => this.fail(serial, error));
    } catch (error) { this.fail(serial, error); }
  }

  fail(serial, error) {
    if (serial !== this.serial) return;
    this.pending = null; this.blocked = true; this.error = error?.name || 'Playback unavailable';
    this.media?.pause(); this.silence();
    if (this.owner) this.owner._fadingIn = false;
    // Keep a requested session available for the next trusted gesture. RAF never retries.
  }

  fadeIn(player) {
    if (this.owner !== player || player.ended || player._fadingIn || player._stoppingAt != null) return;
    player._fadingIn = true;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now); this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(1, now + Math.max(.01, player.fadeIn));
  }

  resetPosition() { try { this.media.currentTime = 0; } catch {} }

  start(player) {
    if (this.owner && this.owner !== player) { this.owner.playing = false; this.owner.ended = true; }
    this.owner = player;
    if (!this.ensure()) { player.playing = false; player.ended = true; this.owner = null; return; }
    this.silence(); this.resetPosition(); this.media.loop = player.loop;
    this.attempt();
  }

  release(player) {
    player.playing = false; player.ended = true;
    if (this.owner !== player) return;
    this.owner = null; this.serial++; this.pending = null;
    this.media?.pause(); this.silence();
  }

  suspend() {
    if (this.owner) this.release(this.owner);
    else { this.serial++; this.pending = null; this.media?.pause(); this.silence(); }
  }

  createPlayer() { return new RecordedThemePlayer(this); }
}

class RecordedThemePlayer {
  constructor(transport) {
    this.transport = transport; this.currentCue = null;
    this.playing = false; this.ended = true; this._disposed = false; this._stoppingAt = null;
  }

  play(cueId, { fadeIn = 1.6, loop = false } = {}) {
    if (this._disposed || cueId !== this.transport.recording.cue.id) return this;
    this.currentCue = cueId; this.fadeIn = seconds(fadeIn); this.loop = !!loop;
    this.playing = true; this.ended = false; this._fadingIn = false; this._stoppingAt = null;
    this.transport.start(this); return this;
  }

  stop(fade = 0) {
    if (this.ended || this._disposed) return;
    const t = this.transport, duration = seconds(fade);
    if (t.owner !== this || !duration || t.pending || t.media?.paused) { t.release(this); return; }
    const now = t.ctx.currentTime, gain = t.gain.gain;
    this._stoppingAt = now + duration;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { const value = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value, now); }
    gain.linearRampToValueAtTime(0, this._stoppingAt);
  }

  update(now = this.transport.ctx.currentTime) {
    if (!this.ended && (this._stoppingAt != null && now >= this._stoppingAt || this.transport.owner === this && this.transport.media?.ended && !this.loop)) this.transport.release(this);
    return this.status();
  }

  dispose() { if (!this._disposed) { this.transport.release(this); this._disposed = true; } }

  status() {
    const t = this.transport;
    return { currentCue: this.currentCue, disposed: this._disposed,
      activeVoices: this.playing && t.owner === this && !t.blocked && !t.media?.paused && !t.media?.ended ? 1 : 0 };
  }
}
