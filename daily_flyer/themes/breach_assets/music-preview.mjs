/** Explicit eight-second check through the game's actual context and master. */
export class MusicPreview {
  constructor(music) { this.music=music; this.busy=false; this.generation=0; this.cue=null; this.notify=null; }
  stop() {
    ++this.generation;
    const cue=this.cue; this.cue=null;
    if (cue) {
      cue.source.onended=null;
      try { cue.source.stop(); } catch (_) {}
      try { cue.source.disconnect(); cue.gain.disconnect(); } catch (_) {}
    }
    const wasBusy=this.busy; this.busy=false;
    if (wasBusy) this.notify?.('Sample stopped.');
  }
  async play({context,output,volume,ready,onStatus}) {
    this.stop(); const generation=this.generation;
    this.busy=true; this.notify=onStatus; onStatus('Loading an eight-second music sample…');
    try {
      await ready;
      if (generation !== this.generation) return;
      if (!context || context.state !== 'running' || !output) throw new Error('Audio unavailable');
      const buffer=await this.music.prepare('containment-pulse');
      if (generation !== this.generation) return;
      if (context !== this.music.context || context.state !== 'running') throw new Error('Audio unavailable');
      const at=context.currentTime, source=context.createBufferSource(), gain=context.createGain();
      this.cue={source,gain}; source.buffer=buffer; source.loop=false;
      const duration=Math.min(8,buffer.duration);
      gain.gain.setValueAtTime(0,at); gain.gain.linearRampToValueAtTime(volume,at+.15);
      gain.gain.setValueAtTime(volume,at+Math.max(.15,duration-.3)); gain.gain.linearRampToValueAtTime(0,at+duration);
      source.connect(gain); gain.connect(output);
      source.onended=()=>{ if (generation!==this.generation) return; this.cue=null; this.busy=false; source.disconnect(); gain.disconnect(); onStatus('Sample finished. In missions, music waits for sustained nearby combat and leaves long quiet gaps.'); };
      source.start(at); source.stop(at+duration);
      onStatus('Playing a short sample at your game music volume.');
    } catch (error) {
      console.warn('Breach music test could not play:', error);
      if (generation!==this.generation) return;
      this.stop(); onStatus('Music could not start. Tap Test music to retry. If it stays silent, check device volume and Silent Mode.');
    }
  }
}
