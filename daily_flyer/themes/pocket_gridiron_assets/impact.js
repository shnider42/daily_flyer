// A pile should sound like one football moment, not seven simultaneous voices.
// Audio-only timing never consumes the game's deterministic random stream.
export class ImpactLimiter {
 constructor(){this.recent=[];this.last=-Infinity;this.lastBlock=-Infinity;}
 allow(kind,now,distance=0){
  if(kind==='block'&&distance>12)return false;
  this.recent=this.recent.filter(t=>now-t<2);
  if(now-this.last<.42||this.recent.length>=3||kind==='block'&&now-this.lastBlock<.95)return false;
  this.last=now;if(kind==='block')this.lastBlock=now;this.recent.push(now);return true;
 }
}
