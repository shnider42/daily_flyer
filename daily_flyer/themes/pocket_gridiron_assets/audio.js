import {PGIMusic} from './music.js?v=8';
// Original effects, with authored MP3 score transport adapted from Breach.
export class StadiumAudio {
 constructor(settings={}){this.settings={effects:true,music:true,scoringMusic:true,station:'all',musicVolume:.55,volume:.45,...settings};this.context=null;this.lastCadence='';this.soundtrack=new PGIMusic();}
 async unlock(){try{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;this.context??=new C();if(!this.master){const c=this.context;this.master=c.createGain();this.master.connect(c.destination);this.fx=c.createGain();this.fx.connect(this.master);this.music=c.createGain();this.music.connect(this.master);this.crowd=c.createGain();this.crowd.connect(this.fx);const b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.35;this.noise=b;const n=c.createBufferSource(),filter=c.createBiquadFilter();n.buffer=b;n.loop=true;filter.type='lowpass';filter.frequency.value=600;n.connect(filter);filter.connect(this.crowd);n.start();this.crowd.gain.value=0;}await this.context.resume();this.apply();}catch{/* Visual cues always remain available. */}}
 apply(){this.soundtrack.configure({enabled:this.settings.music,scoring:this.settings.scoringMusic,family:this.settings.station,volume:this.settings.musicVolume});if(!this.context||!this.master)return;this.master.gain.value=this.settings.volume;this.fx.gain.value=this.settings.effects?1:0;this.music.gain.value=1;if(!this.score){this.score=this.context.createGain();this.score.connect(this.master);}this.soundtrack.attach(this.context,this.music,this.score);}
 tone(freq,duration=.1,type='square',volume=.06,delay=0,bus='fx'){
  if(!this.context||this.context.state!=='running')return;const c=this.context,o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);o.connect(g);g.connect(this[bus]);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.start(t);o.stop(t+duration+.01);
 }
 thud(volume=.1,duration=.09){if(!this.context||!this.noise||this.context.state!=='running')return;const c=this.context,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noise;f.type='lowpass';f.frequency.value=850;n.connect(f);f.connect(g);g.connect(this.fx);g.gain.setValueAtTime(volume,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);n.start();n.stop(c.currentTime+duration);}
 event(e){
  if(e.scorePoints>0)this.soundtrack.score(e.scoreAbbr);
  if(e.type==='snap'){this.thud(.12);this.tone(125,.08,'triangle',.14);}
  if(e.type==='contact')this.thud(.16,.08);
  if(e.type==='catch'){this.thud(.13,.05);this.tone(680,.06,'triangle',.04);}
  if(e.type==='throw')this.tone(300,.08,'triangle',.05);
  if(e.type==='kick'){this.thud(.2,.13);this.tone(95,.19,'sine',.12);}
  if(e.type==='escape'||e.type==='shed'){this.thud(.13);this.tone(380,.12,'triangle',.08);this.tone(510,.12,'triangle',.06,.08);}
  if(e.type==='flag'||e.type==='penalty'){this.tone(1700,.13,'sine',.05);this.tone(1350,.18,'sine',.05,.15);}
  if(e.type==='turnover'){for(const [i,n] of [660,440,330].entries())this.tone(n,.14,'square',.045,i*.12);}
  if(e.type==='ball'&&e.text==='FUMBLE!'){this.thud(.2);this.tone(220,.25,'sawtooth',.04);}
  if(e.type==='result'){this.thud(.16);this.tone(1800,.22,'sine',.04,.03);if(!this.settings.scoringMusic&&e.scorePoints===7)for(const [i,n] of [330,440,550,660].entries())this.tone(n,.32,'square',.055,i*.14);}
 }
 update(game,hidden=false,{audition=false,replay=false}={}){
  if(!this.context||!this.master)return;const silent=hidden||game?.paused&&!audition;
  this.soundtrack.update({blocked:silent,live:!replay&&!!game?.isLive});
  this.master.gain.setTargetAtTime(silent?0:this.settings.volume,this.context.currentTime,.05);
  const live=game?.isLive,excitement=live?Math.max(0,(game.carrier.y-40)/60):0;
  this.crowd.gain.setTargetAtTime(silent?0:game?.phase==='dead'?.07:live?.025+excitement*.1:game?.phase==='ready'?.012:0,this.context.currentTime,.3);
  if(silent||replay)return;
  if(game?.phase==='ready'){const beat=Math.floor(game.readyTime/.65),key=`${game.offense}:${game.spot}:${game.down}:${beat}`;if(key!==this.lastCadence&&beat<4){this.lastCadence=key;this.tone(beat%2?145:115,.12,'triangle',.07);}}else this.lastCadence='';
 }
}
