import {playbackSession} from './device-audio.js?v=18';
import {ImpactLimiter} from './impact.js?v=18';
import {PGIMusic,FAMILY_NAMES} from './music.js?v=18';
export function musicPolicy(settings,game,{audition=false,broadcast=false}={}){
 const continuous=settings.musicMode==='always';
 const scene=game?.phase==='final'?'postgame':typeof broadcast==='string'?broadcast:!game?'menu':game.phase==='halftime'?'halftime':null;
 return {scene,background:!game||audition||!!broadcast||game.phase==='final'||continuous,
  scoreAllowed:!game||audition||!!broadcast||continuous||!game.isLive};
}
// Original effects, with authored MP3 score transport adapted from Breach.
export class StadiumAudio {
 constructor(settings={}){this.settings={effects:true,contactFx:true,passWhistle:true,music:true,musicMode:'broadcast',scoringMusic:true,station:'all',musicVolume:.55,volume:.45,...settings};if(!['broadcast','always'].includes(this.settings.musicMode))this.settings.musicMode='broadcast';if(!Object.hasOwn(FAMILY_NAMES,this.settings.station))this.settings.station='all';this.context=null;this.lastCadence='';this.impacts=new ImpactLimiter();this.pads=new ImpactLimiter({gap:.12,blockGap:.22,max:5,window:1});this.soundtrack=new PGIMusic();}
 async unlock(){try{playbackSession();const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;if(this.context?.state==='closed'){this.soundtrack.releaseContext();this.context=null;this.master=null;this.score=null;}this.context??=new C();if(!this.master){const c=this.context;this.master=c.createGain();this.master.connect(c.destination);this.fx=c.createGain();this.fx.connect(this.master);this.music=c.createGain();this.music.connect(this.master);this.crowd=c.createGain();this.crowd.connect(this.fx);const b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.35;this.noise=b;const n=c.createBufferSource(),filter=c.createBiquadFilter();n.buffer=b;n.loop=true;filter.type='lowpass';filter.frequency.value=600;n.connect(filter);filter.connect(this.crowd);n.start();this.crowd.gain.value=0;}this.apply();if(this.context.state!=='running'){const resumed=this.context.resume();await resumed;}this.apply();}catch{/* Visual cues always remain available. */}}
 apply(){this.soundtrack.configure({enabled:this.settings.music,scoring:this.settings.scoringMusic,family:this.settings.station,volume:this.settings.musicVolume});if(!this.context||!this.master)return;this.master.gain.value=this.settings.volume;this.fx.gain.value=this.settings.effects?1:0;this.music.gain.value=1;if(!this.score){this.score=this.context.createGain();this.score.connect(this.master);}this.soundtrack.attach(this.context,this.music,this.score);}
 tone(freq,duration=.1,type='square',volume=.06,delay=0,bus='fx'){
  if(!this.context||this.context.state!=='running')return;const c=this.context,o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);o.connect(g);g.connect(this[bus]);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+duration+.01);
 }
 thud(volume=.1,duration=.09){if(!this.context||!this.noise||this.context.state!=='running')return;const c=this.context,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noise;f.type='lowpass';f.frequency.value=850;n.connect(f);f.connect(g);g.connect(this.fx);g.gain.setValueAtTime(volume,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);n.start();n.stop(c.currentTime+duration);}
 padHit(kind,distance=0){
  if(!this.settings.effects||!this.settings.contactFx||!this.context||!this.noise||this.context.state!=='running')return;
  const c=this.context,t=c.currentTime;if(!this.pads.allow(kind,t,distance))return;
  // Midrange pad slap survives phone speakers; the short low body adds weight.
  // Pads have their own budget so occasional grunts cannot silence the line.
  const block=kind==='block',n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),duration=block?.12:.18;
  n.buffer=this.noise;f.type='bandpass';f.frequency.value=block?1350:1050;f.Q.value=.65;
  n.connect(f);f.connect(g);g.connect(this.fx);g.gain.setValueAtTime(block?.85:1,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};n.start(t);n.stop(t+duration);
  this.tone(block?210:165,block?.10:.15,'triangle',block?.12:.17);
 }
 grunt(kind,distance=0){
  if(!this.settings.effects||!this.settings.contactFx||!this.context||this.context.state!=='running')return;
  const c=this.context,t=c.currentTime;if(!this.impacts.allow(kind,t,distance))return;
  const o=c.createOscillator(),low=c.createBiquadFilter(),high=c.createBiquadFilter(),g=c.createGain(),block=kind==='block',duration=block?.18:.24;
  o.type='sawtooth';o.frequency.setValueAtTime(block?155:170,t);o.frequency.exponentialRampToValueAtTime(block?108:115,t+duration);
  low.type=high.type='bandpass';low.frequency.value=580;low.Q.value=1.1;high.frequency.value=1250;high.Q.value=1.7;
  o.connect(low);o.connect(high);low.connect(g);high.connect(g);g.connect(this.fx);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(block?.20:.26,t+.018);g.gain.linearRampToValueAtTime(block?.13:.17,t+duration*.55);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.onended=()=>{o.disconnect();low.disconnect();high.disconnect();g.disconnect();};o.start(t);o.stop(t+duration+.02);
 }
 passSlide(flight=1){
  if(!this.settings.effects||!this.settings.passWhistle||!this.context||this.context.state!=='running')return;
  const c=this.context,t=c.currentTime,d=Math.max(.38,Math.min(.85,(Number.isFinite(flight)?flight:1)*.7)),o=c.createOscillator(),g=c.createGain();
  o.type='sine';o.frequency.setValueAtTime(700,t);o.frequency.exponentialRampToValueAtTime(1550,t+d*.58);o.frequency.exponentialRampToValueAtTime(980,t+d);
  // Hold the whistle through the rising slide instead of fading before its peak.
  o.connect(g);g.connect(this.fx);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.16,t+.025);g.gain.linearRampToValueAtTime(.12,t+d*.68);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+d+.02);
 }
 event(e){
  if(e.scorePoints>1)this.soundtrack.score(e.scoreAbbr);
  if(e.type==='snap'){this.thud(.12);this.tone(125,.08,'triangle',.14);}
  if(e.type==='contact'){this.padHit('tackle');this.grunt('tackle');}
  if(e.type==='block'){this.padHit('block',e.distance);this.grunt('block',e.distance);}
  if(e.type==='catch'){this.thud(.13,.05);this.tone(680,.06,'triangle',.04);}
  if(e.type==='throw')this.passSlide(e.flight);
  if(e.type==='kick'){this.thud(.2,.13);this.tone(95,.19,'sine',.12);}
  if(e.type==='escape'||e.type==='shed'){this.thud(.13);this.tone(380,.12,'triangle',.08);this.tone(510,.12,'triangle',.06,.08);}
  if(e.type==='flag'||e.type==='penalty'){this.tone(1700,.13,'sine',.05);this.tone(1350,.18,'sine',.05,.15);}
  if(e.type==='turnover'){for(const [i,n] of [660,440,330].entries())this.tone(n,.14,'square',.045,i*.12);}
  if(e.type==='ball'&&e.text==='FUMBLE!'){this.thud(.2);this.tone(220,.25,'sawtooth',.04);}
  if(e.type==='result'){this.thud(.16);this.tone(1800,.22,'sine',.04,.03);if(!this.settings.scoringMusic&&e.scorePoints===6)for(const [i,n] of [330,440,550,660].entries())this.tone(n,.32,'square',.055,i*.14);}
 }
 update(game,hidden=false,{audition=false,broadcast=false,replay=false}={}){
  if(!this.context||!this.master)return;const silent=hidden||game?.paused&&!audition&&!broadcast;
  this.soundtrack.update({blocked:!!silent,live:!replay&&!!game?.isLive,...musicPolicy(this.settings,game,{audition,broadcast})});
  this.master.gain.setTargetAtTime(silent?0:this.settings.volume,this.context.currentTime,.05);
  const live=game?.isLive,excitement=live?Math.max(0,(game.carrier.y-40)/60):0;
  this.crowd.gain.setTargetAtTime(silent?0:game?.phase==='dead'?.07:live?.025+excitement*.1:game?.phase==='ready'?.012:0,this.context.currentTime,.3);
  if(silent||replay)return;
  if(game?.phase==='ready'){const beat=Math.floor(game.readyTime/.65),key=`${game.offense}:${game.spot}:${game.down}:${beat}`;if(key!==this.lastCadence&&beat<4){this.lastCadence=key;this.tone(beat%2?145:115,.12,'triangle',.07);}}else this.lastCadence='';
 }
}
