// Menu-only adaptation of Farwake's recorded-theme.mjs, commit 756fee9ba7456b028fda0dc714829edf33a713ed.
// The supplied recording and its credit are preserved; no other Farwake cues are imported.
export const MENU_THEME = Object.freeze({
  id: 'shnider-theme', title: 'Farwake menu theme', family: 'theme',
  // Keep the upload's stable ID, but do not infer its composer's name from the filename.
  artist: null, credit: 'Original music contributed by a friend of Farwake.',
  durationSeconds: 197.625, tags: Object.freeze(['menu', 'theme']), loopInMenu: true,
});

export const MENU_RECORDING = Object.freeze({
  cue: MENU_THEME,
  url: new URL('./music/farwake-menu-theme.m4a', import.meta.url).href,
});

const seconds = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const mediaError = error => {
  if (error?.name) return error.name;
  return ({ 1: 'Playback aborted', 2: 'Recording could not load', 3: 'Recording could not decode',
    4: 'Recording format unavailable' })[error?.code] || 'Playback unavailable';
};

/** One reusable media element keeps streaming memory and browser activation bounded. */
export class RecordedTheme {
  constructor(ctx, destination, recording = MENU_RECORDING, onChange = () => {}) {
    this.ctx = ctx; this.destination = destination; this.recording = recording;
    this.media = null; this.source = null; this.gain = null; this.owner = null;
    this.pending = null; this.serial = 0; this.primed = false; this.blocked = false; this.error = null;
    this.permitted = false; this.disposed = false;
    this.onChange = onChange;
  }

  // Called only once the audio controller has received a playback gesture.
  ensure() {
    if (this.disposed) return false;
    if (this.media) return true;
    let media, source, gain;
    try {
      const Audio = globalThis.Audio || globalThis.window?.Audio;
      if (!Audio || !this.ctx?.createMediaElementSource) throw new Error('Recorded audio unavailable');
      media = new Audio();
      media.id = 'farwake-theme-audio'; media.hidden = true;
      media.preload = 'none'; media.playsInline = true;
      media.setAttribute?.('aria-hidden', 'true');
      media.setAttribute?.('playsinline', '');
      media.src = this.recording.url;
      gain = this.ctx.createGain(); gain.gain.value = 0;
      source = this.ctx.createMediaElementSource(media);
      source.connect(gain); gain.connect(this.destination);
      this.media = media; this.source = source; this.gain = gain;
      globalThis.document?.body?.appendChild(media);
      media.addEventListener('ended', () => {
        if (media.ended && !media.loop && this.owner) this.release(this.owner);
      });
      media.addEventListener('error', () => this.fail(this.serial, media.error));
      return true;
    } catch (error) {
      media?.pause(); media?.remove();
      source?.disconnect(); gain?.disconnect();
      this.media = null; this.source = null; this.gain = null;
      this.error = error?.message || 'Recorded audio unavailable';
      return false;
    }
  }

  silence() {
    if (!this.gain || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now); this.gain.gain.setValueAtTime(0, now);
  }

  /** Call synchronously from a trusted click/touch/key activation, before awaits. */
  unlock() {
    if (this.disposed || !this.permitted || globalThis.document?.hidden ||
        this.ctx?.state === 'closed' || !this.ensure()) return;
    if (this.primed && !this.blocked && !this.error) return;
    const retry = Boolean(this.error && this.media.error);
    this.blocked = false; this.error = null;
    if (retry) this.media.load?.();
    if (this.owner?._stoppingAt != null) return;
    this.attempt(true);
  }

  attempt(fromGesture = false) {
    if (this.disposed || !this.permitted || !this.media || this.pending ||
        this.blocked || this.error || (!this.primed && !fromGesture)) return;
    if (this.owner && this.primed && !this.media.paused) { this.fadeIn(this.owner); return; }
    const media = this.media;
    const serial = ++this.serial;
    this.pending = serial;
    this.onChange();
    try {
      Promise.resolve(media.play()).then(() => {
        if (serial !== this.serial) {
          // A late accepted play must not revive a stopped or backgrounded song.
          if (this.disposed || !this.permitted || !this.owner || this.owner.ended) {
            media.pause(); this.silence();
          }
          return;
        }
        this.pending = null; this.primed = true;
        if (this.permitted && this.owner && !this.owner.ended) this.fadeIn(this.owner);
        else {
          // Unlock this same element silently, without advancing the eventual song.
          media.pause(); this.silence();
          if (!this.owner) this.resetPosition();
        }
        this.onChange();
      }, error => this.fail(serial, error));
    } catch (error) { this.fail(serial, error); }
  }

  fail(serial, error) {
    if (this.disposed || serial !== this.serial) return;
    this.pending = null;
    this.blocked = error?.name === 'NotAllowedError';
    this.error = mediaError(error);
    this.media?.pause(); this.silence();
    if (this.owner) this.owner._fadingIn = false;
    this.onChange();
    // Only a later explicit gesture retries a rejected or failed recording.
  }

  fadeIn(player) {
    if (!this.permitted || this.owner !== player || player.ended ||
        player._fadingIn || player._stoppingAt != null) return;
    player._fadingIn = true;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now); this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(1, now + Math.max(.01, player.fadeIn));
  }

  resetPosition() { try { this.media.currentTime = 0; } catch { /* metadata not loaded yet */ } }

  start(player) {
    if (this.disposed) return;
    if (this.owner && this.owner !== player) this.release(this.owner);
    this.owner = player;
    if (!this.ensure()) { player.playing = false; player.ended = true; this.owner = null; return; }
    this.silence(); this.resetPosition(); this.media.loop = player.loop;
    this.attempt();
  }

  release(player) {
    clearTimeout(player._stopTimer); player._stopTimer = null;
    player.playing = false; player.ended = true;
    if (this.owner !== player) return;
    this.owner = null; this.serial++; this.pending = null;
    this.media?.pause(); this.silence();
    this.onChange();
  }

  suspend() {
    const changed = this.permitted || this.pending || this.media && !this.media.paused;
    this.permitted = false; this.serial++; this.pending = null;
    this.media?.pause(); this.silence();
    if (this.owner) this.owner._fadingIn = false;
    if (changed) this.onChange();
  }

  resume() {
    if (this.disposed) return;
    this.permitted = true;
    if (this.owner && !this.owner.ended && this.owner._stoppingAt == null) this.attempt();
  }

  createPlayer() { return new RecordedThemePlayer(this); }

  dispose() {
    if (this.disposed) return;
    if (this.owner) this.release(this.owner);
    this.suspend(); this.disposed = true;
    this.source?.disconnect(); this.gain?.disconnect();
    if (this.media) {
      this.media.removeAttribute?.('src'); this.media.load?.(); this.media.remove();
    }
    this.media = null; this.source = null; this.gain = null;
  }
}

class RecordedThemePlayer {
  constructor(transport) {
    this.transport = transport; this.currentCue = null;
    this.playing = false; this.ended = true; this._disposed = false; this._stoppingAt = null;
    this._stopTimer = null;
  }

  play(cueId, { fadeIn = 1.6, loop = false } = {}) {
    if (this._disposed || cueId !== this.transport.recording.cue.id) return this;
    clearTimeout(this._stopTimer); this._stopTimer = null;
    this.currentCue = cueId; this.fadeIn = seconds(fadeIn); this.loop = !!loop;
    this.playing = true; this.ended = false; this._fadingIn = false; this._stoppingAt = null;
    this.transport.start(this); return this;
  }

  stop(fade = 0) {
    if (this.ended || this._disposed || this._stoppingAt != null) return;
    const t = this.transport, duration = seconds(fade);
    if (t.owner !== this || !duration || t.pending || t.media?.paused) { t.release(this); return; }
    const now = t.ctx.currentTime, gain = t.gain.gain;
    this._stoppingAt = now + duration;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { const value = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value, now); }
    gain.linearRampToValueAtTime(0, this._stoppingAt);
    this._stopTimer = setTimeout(() => t.release(this), duration * 1000 + 20);
  }

  update(now = this.transport.ctx.currentTime) {
    if (!this.ended && (this._stoppingAt != null && now >= this._stoppingAt ||
        this.transport.owner === this && this.transport.media?.ended && !this.loop)) this.transport.release(this);
    return this.status();
  }

  dispose() { if (!this._disposed) { this.transport.release(this); this._disposed = true; } }

  status() {
    const t = this.transport;
    return { currentCue: this.currentCue, disposed: this._disposed,
      activeVoices: this.playing && this._fadingIn && t.owner === this && t.permitted && !t.pending && !t.blocked && !t.error &&
        t.media?.readyState >= 3 &&
        !t.media?.paused && !t.media?.ended ? 1 : 0 };
  }
}
