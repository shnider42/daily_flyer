// A pile should sound like one football moment, not seven simultaneous voices.
// Audio-only timing never consumes the game's deterministic random stream.
export class ImpactLimiter {
 constructor({gap=.42,blockGap=.95,max=3,window=2}={}){this.gap=gap;this.blockGap=blockGap;this.max=max;this.window=window;this.recent=[];this.last=-Infinity;this.lastBlock=-Infinity;}
 allow(kind,now,distance=0){
  if(kind==='block'&&distance>12)return false;
  this.recent=this.recent.filter(t=>now-t<this.window);
  if(now-this.last<this.gap||this.recent.length>=this.max||kind==='block'&&now-this.lastBlock<this.blockGap)return false;
  this.last=now;if(kind==='block')this.lastBlock=now;this.recent.push(now);return true;
 }
}
