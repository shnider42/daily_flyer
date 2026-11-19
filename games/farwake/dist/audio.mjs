import { playbackSession, bindAudioActivation } from './shared/device-audio.mjs';
import { MusicDirector } from './music-director.mjs';
import { ScorePlayer } from './music-score.mjs';
import { MUSIC_CUES, THEME_ID } from './music-catalog.mjs';
import { RecordedTheme, RECORDED_MUSIC } from './recorded-theme.mjs';

function listeningSeed(){
 try{const value=new Uint32Array(1);if(globalThis.crypto?.getRandomValues){globalThis.crypto.getRandomValues(value);return value[0];}}catch{}
 return `${Date.now()}:${Math.random()}`;
}

const busGain = (node, value, time, ramp=.08) => {
 if(!node || node._farwakeGain===value)return;
 node._farwakeGain=value;node.gain.cancelScheduledValues(time);node.gain.setTargetAtTime(value,time,ramp);
};
export class Soundscape{
 constructor(enabled=()=>true,{musicEnabled=()=>true,musicVolume=()=>.65,musicPresence=()=> 'balanced'}={}){
  this.enabled=enabled;this.musicEnabled=musicEnabled;this.musicVolume=musicVolume;this.musicPresence=musicPresence;
  this.ctx=null;this.master=null;this.musicBus=null;this.recordings=new Map();this.last={};this.effects=new Set();
  this.director=new MusicDirector({cues:MUSIC_CUES,themeId:THEME_ID,seed:listeningSeed()});
  this.score=null;this.retiringScore=null;this.musicToken=null;this.musicDecision=null;this.musicNow=0;this.musicFault=false;
  if(globalThis.document){
   bindAudioActivation(()=>this.unlock(),{enabled:()=>this.enabled()||this.musicEnabled()});
   document.addEventListener('visibilitychange',()=>{if(document.hidden)this.suspend();});
   globalThis.window?.addEventListener('pagehide',()=>this.suspend());
  }
 }
 setRecoveryMuted(muted){
  if(this.recoveryMuted===muted)return;
  this.recoveryMuted=muted;
  if(muted){
   this.stopScores();this.stopEffects();this.director.stopPreview(this.musicNow);this.director.stopTheme(this.musicNow);this.director.suspend(this.musicNow);this.musicDecision=null;
   if(this.ctx)for(const node of [this.master,this.musicBus])if(node){node.gain.cancelScheduledValues(this.ctx.currentTime);node.gain.setValueAtTime(0,this.ctx.currentTime);node._farwakeGain=0;}
  }else this.mute();
 }
 unlock(){
  if(this.recoveryMuted||!(this.enabled()||this.musicEnabled())||globalThis.document?.hidden)return;
  try{
   playbackSession();
   if(!this.ctx||this.ctx.state==='closed'){
    const Audio=globalThis.AudioContext||globalThis.window?.AudioContext||globalThis.window?.webkitAudioContext;
    if(!Audio)return;this.ctx=new Audio({latencyHint:'interactive'});this.musicFault=false;this.noiseBuffer=null;
    this.master=this.ctx.createGain();this.master.gain.value=this.enabled()?.17:0;this.master.connect(this.ctx.destination);
    this.musicBus=this.ctx.createGain();this.musicBus.gain.value=0;this.musicBus.connect(this.ctx.destination);
    this.recordings=new Map(RECORDED_MUSIC.map(recording=>[recording.cue.id,new RecordedTheme(this.ctx,this.musicBus,recording)]));
    this.ctx.addEventListener?.('statechange',()=>{if(this.ctx.state==='interrupted'){this.stopScores();this.stopEffects();this.director.suspend(this.musicNow);this.musicDecision=null;}});
   }
   if(['suspended','interrupted'].includes(this.ctx.state))Promise.resolve(this.ctx.resume()).catch(()=>{});
   if(this.musicEnabled())for(const recording of this.recordings.values())recording.unlock();
   this.mute();
  }catch{}
 }
 stopScores(){
  this.score?.dispose();this.retiringScore?.dispose();this.score=null;this.retiringScore=null;this.musicToken=null;
  for(const recording of this.recordings.values())recording.suspend();
 }
 stopEffects(){
  for(const source of this.effects){try{source.stop();source.onended?.();}catch{try{source.disconnect();}catch{}}}
  this.effects.clear();
 }
 suspend(){
  this.stopScores();this.stopEffects();this.director.suspend(this.musicNow);this.musicDecision=null;
  if(this.ctx&&this.ctx.state==='running')Promise.resolve(this.ctx.suspend()).catch(()=>{});
 }
 musicEvent(signal,now,key=null){if(signal&&!this.recoveryMuted)this.director.notify(signal,now,key);}
 requestCue(cueId,now=this.musicNow){
  if(this.recoveryMuted||!MUSIC_CUES.some(cue=>cue.id===cueId)||!this.musicEnabled()||this.musicFault)return false;
  this.unlock();return this.director.requestPreview(cueId,now);
 }
 stopPreview(now=this.musicNow){this.director.stopPreview(now);}
 toggleTheme(start=null){
  if(this.recoveryMuted)return false;
  if(start===null)start=!(this.musicDecision?.theme||this.director.previewCueId===THEME_ID);
  if(!start){this.director.stopTheme(this.musicNow);return false;}
  if(this.musicDecision?.theme)return true;
  this.unlock();this.director.requestTheme();return true;
 }
 updateMusic(context={},now=0){
  if(this.recoveryMuted||this.musicFault)return null;
  try{return this.updateScore(context,now);}catch(error){
   // Optional audio must never break rendering, input, or a shared session.
   this.musicFault=true;this.stopScores();this.director.suspend(now);this.musicDecision=null;
   if(this.musicBus&&this.ctx)busGain(this.musicBus,0,this.ctx.currentTime,.02);
   console.warn('Farwake music could not start:',error?.message||'Audio unavailable');
   return null;
  }
 }
 updateScore(context={},now=0){
  this.musicNow=now;
  if(this.recoveryMuted)return null;
  if(!this.ctx||this.ctx.state!=='running'){
   if(this.score||this.retiringScore){this.stopScores();this.director.suspend(now);}
   this.musicDecision=null;return null;
  }
  const decision=this.director.update(context,now,{enabled:this.musicEnabled(),presence:this.musicPresence()});
  this.musicDecision=decision;
  const volume=Number(this.musicVolume());
  const roomDuck=this.ctx.currentTime<(this.roomDuckUntil||0) ? .58 : 1;
  busGain(this.musicBus,(this.musicEnabled()?Math.max(0,Math.min(1,Number.isFinite(volume)?volume:.65))*.7:0)*decision.duck*roomDuck,this.ctx.currentTime,.12);
  if(decision.token!==this.musicToken){
   this.retiringScore?.dispose();this.retiringScore=null;
   if(this.score){this.score.stop(decision.fadeOut);this.retiringScore=this.score;this.score=null;}
   this.musicToken=decision.token;
   if(decision.cueId){
    this.score=this.recordings.get(decision.cueId)?.createPlayer()??new ScorePlayer(this.ctx,this.musicBus);
    this.score?.play(decision.cueId,{seed:decision.seed,fadeIn:decision.fadeIn,loop:decision.loop});
   }
  }
  for(const key of ['score','retiringScore']){
   const player=this[key];if(!player)continue;player.update(this.ctx.currentTime);
   if(player.ended){player.dispose();this[key]=null;}
  }
  return decision;
 }
 musicStatus(){
  const cue=MUSIC_CUES.find(value=>value.id===this.musicDecision?.cueId);
  return {state:this.musicFault?'unavailable':this.ctx?.state||'locked',cueId:cue?.id||null,title:cue?.title||'Quiet',mood:this.musicDecision?.mood||'silence',theme:!!this.musicDecision?.theme,
   preview:!!this.musicDecision?.previewCueId,previewCueId:this.musicDecision?.previewCueId||null,requestedCueId:this.director.previewCueId||null,
   warzone:!!this.musicDecision?.warzone,
   voices:(this.score?.status().activeVoices||0)+(this.retiringScore?.status().activeVoices||0)};
 }
 tone(freq,duration=.1,type='sine',volume=.2,endFreq=null,attack=.008){if(this.recoveryMuted||!this.enabled()||!this.ctx||this.ctx.state!=='running'||globalThis.document?.hidden||this.effects.size>=40)return;try{const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(10,endFreq),t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+Math.min(duration/2,Math.max(.008,attack)));g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);this.effects.add(o);o.onended=()=>{o.disconnect();g.disconnect();this.effects.delete(o);};o.start(t);o.stop(t+duration+.03);}catch{}}
 /** Short filtered room sounds share the effects lifecycle, including scheduled echoes. */
 roomNoise(duration=.2,volume=.04,{delay=0,pan=0,endPan=pan,frequency=900,type='lowpass'}={}){
  if(this.recoveryMuted||!this.enabled()||!this.ctx||this.ctx.state!=='running'||globalThis.document?.hidden||this.effects.size>=40)return;
  try{
   const ctx=this.ctx,t=ctx.currentTime+Math.max(0,Math.min(.8,delay));
   if(!this.noiseBuffer){
    this.noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.2),ctx.sampleRate);
    const data=this.noiseBuffer.getChannelData(0);let seed=7613;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296)*2-1;}
   }
   duration=Math.max(.025,Math.min(1,duration));
   const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),panner=ctx.createStereoPanner?.();
   source.buffer=this.noiseBuffer;filter.type=type;filter.frequency.setValueAtTime(frequency,t);
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(.25,volume)),t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
   source.connect(filter);filter.connect(gain);
   if(panner){panner.pan.setValueAtTime(Math.max(-1,Math.min(1,pan)),t);panner.pan.linearRampToValueAtTime(Math.max(-1,Math.min(1,endPan)),t+duration);gain.connect(panner);panner.connect(this.master);}else gain.connect(this.master);
   this.effects.add(source);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect();this.effects.delete(source);};
   source.start(t);source.stop(t+duration+.025);
  }catch{}
 }
 corridorShot(){
  // Reflections have no new trigger, damage, or music signal of their own.
  this.roomNoise(.18,.065,{delay:.10,pan:-.42,frequency:950});
  this.roomNoise(.33,.035,{delay:.28,pan:.5,frequency:580});
 }
 play(name,{pan=0}={}){
  const now=performance.now(),limit={fire:130,mine:180,footstep:250,corridorFootstep:330,corridorVent:900,corridorCart:900,hit:180,sidearm:90,crewShot:170,enemyShot:150,sidearmHit:90,personHit:170,personDown:250,bulkhead:220,shieldImpact:220,supportShot:95,marksmanShot:150,rifleShot:100,shipAlarm:3000,repair:180,bellwetherScream:1000}[name]??80;if(now-(this.last[name]??-1000)<limit)return;this.last[name]=now;
  switch(name){
   case'corridorFootstep':this.tone(67,.065,'triangle',.11,31);this.roomNoise(.06,.045,{frequency:680});this.roomNoise(.12,.022,{delay:.16,pan:.25,frequency:400});break;
   case'corridorVent':this.tone(80,.25,'triangle',.18,30);this.roomNoise(.66,.19,{pan,frequency:1800,type:'highpass'});this.roomNoise(.2,.055,{delay:.28,pan:-pan,frequency:640});if(this.ctx&&this.enabled()&&!this.recoveryMuted)this.roomDuckUntil=this.ctx.currentTime+1.25;break;
   case'corridorCart':this.roomNoise(.72,.13,{pan,endPan:pan*.25,frequency:630});this.tone(173,.28,'triangle',.06,91);this.roomNoise(.12,.09,{delay:.62,pan:pan*.25,frequency:1100});if(this.ctx&&this.enabled()&&!this.recoveryMuted)this.roomDuckUntil=this.ctx.currentTime+1.25;break;
   case'corridorClang':this.tone(82,.48,'triangle',.23,28);this.tone(730,.09,'square',.035,115);break;
   case'relayStatic':this.tone(920,.16,'sawtooth',.025,170);this.tone(315,.27,'sine',.055,245);break;
   case'quietEarthAlarm':this.tone(248,.8,'sawtooth',.11,62,.05);this.tone(660,.46,'triangle',.08,195);this.tone(105,.85,'sine',.14,40,.08);break;
   // One short throat-like fall, with no echo timers or looping source. The
   // effects bus and ordinary cleanup own all three voices, including mute.
   case'bellwetherScream':this.tone(248,.84,'sawtooth',.14,64,.075);this.tone(695,.64,'triangle',.09,176,.06);this.tone(112,.94,'sine',.15,42,.1);break;
   case'sidearm':this.tone(740,.095,'square',.20,210);this.tone(1340,.045,'triangle',.10,640);break;
   case'crewShot':this.tone(470,.09,'triangle',.13,180);break;
   case'enemyShot':this.tone(250,.12,'sawtooth',.13,95);break;
   case'sidearmHit':this.tone(910,.06,'sine',.18,590);break;
   case'personHit':this.tone(94,.17,'triangle',.28,32);this.tone(180,.07,'square',.09,80);break;
   case'personDown':this.tone(175,.28,'triangle',.19,56);break;
   case'fire':this.tone(520,.13,'square',.11,90);break;
   case'bulkhead':this.tone(54,.46,'triangle',.34,19);this.tone(143,.18,'sawtooth',.075,48);this.tone(810,.07,'square',.045,125);break;
   case'shieldImpact':this.tone(118,.26,'sine',.24,48);this.tone(650,.15,'triangle',.06,240);break;
   case'rifleShot':this.tone(580,.12,'square',.17,170);this.tone(1160,.04,'triangle',.09,430);break;
   case'supportShot':this.tone(390,.075,'sawtooth',.15,120);this.tone(980,.035,'square',.065,410);break;
   case'marksmanShot':this.tone(900,.2,'sawtooth',.17,95);this.tone(85,.26,'triangle',.18,34);break;
   case'shipAlarm':this.tone(330,.34,'triangle',.09,270);setTimeout(()=>this.tone(270,.34,'triangle',.075,220),380);break;
   case'repair':this.tone(310,.13,'triangle',.09,510);break;
   case'hit':this.tone(80,.18,'sawtooth',.22,20);break;
   case'mine':this.tone(260,.14,'triangle',.13,320);break;
   case'pickup':this.tone(480,.12,'sine',.3,760);break;
   case'dock':this.tone(180,.65,'triangle',.2,540);break;
   case'jump':this.tone(65,1.2,'sawtooth',.2,900);break;
   case'click':this.tone(680,.04,'sine',.15);break;
   case'footstep':this.tone(60,.05,'triangle',.13,35);break;
   case'quest':this.tone(440,.4,'sine',.22);setTimeout(()=>this.tone(660,.5,'sine',.2),140);break;
   case'alert':this.tone(220,.25,'triangle',.2);break;
  }
 }
 interiorAlarm(time,{active=false}={}){if(!active){this.nextInteriorAlarm=null;return;}if(!this.enabled())return;if(this.nextInteriorAlarm===null||this.nextInteriorAlarm===undefined||time>=this.nextInteriorAlarm){this.play('shipAlarm');this.nextInteriorAlarm=time+3.5;}}
 /** Sparse location sounds are effects, so a quiet room still has a voice with music off. */
 siteAtmosphere(time,atmosphere){
  if(!atmosphere||!this.enabled())return null;
  if(this.siteSoundKind!==atmosphere){this.siteSoundKind=atmosphere;this.nextSiteSound=time+1.2;this.siteSoundIndex=0;}
  if(time<(this.nextSiteSound??0))return null;
  const index=(this.siteSoundIndex??0);this.siteSoundIndex=index+1;this.nextSiteSound=time+11+(index%4)*3;
  if(atmosphere==='quiet-earth'){
   // A few quiet electrical/air sounds, separated by real silence. Never a threat cue or caption.
   this.nextSiteSound=time+18+(index%3)*7;
   this.tone(index%2?49:63,1.4,'sine',.022,index%2?43:52,.18);
   this.roomNoise(.65,.024,{pan:index%2?-.55:.45,frequency:380});
   return null;
  }
  if(atmosphere==='cave'){
   if(index%2===0){this.tone(820,.19,'sine',.075,470);setTimeout(()=>this.tone(630,.4,'sine',.025,410),260);return'A drop falls somewhere beyond the lamplight.';}
   this.tone(58,2.3,'triangle',.07,31);this.tone(95,1.6,'sine',.025,55);return'A low rumble travels through the stone.';
  }
  if(atmosphere==='ice'){this.tone(460,1.8,'sine',.035,710);this.tone(63,.5,'triangle',.07,35);return'Ice shifts beneath the shelter.';}
  if(atmosphere==='machinery'){this.tone(78,.8,'triangle',.075,42);setTimeout(()=>this.tone(96,.18,'triangle',.04,48),420);return'A pipe knocks twice inside the wall.';}
  if(atmosphere==='signal'){this.tone(310,.7,'sine',.045,180);setTimeout(()=>this.tone(740,.09,'sine',.03,690),870);return'A receiver catches half of a distant call.';}
  if(atmosphere==='training'){this.tone(640,.08,'sine',.022,480);return index%2?'The range ventilation hums above the cover blocks.':'A target relay clicks as the range systems cycle.';}
  if(atmosphere==='military'){this.tone(270,.13,'triangle',.025,190);return index%2?'Your section’s radio channel carries a brief status check.':'Service equipment hums behind the reinforced walls.';}
  if(atmosphere==='market'){this.tone(230,.18,'triangle',.025,170);return index%2?'A cup is set down behind a curtain.':'Low voices carry between the stalls.';}
  if(atmosphere==='clinic'){this.tone(540,.12,'sine',.022,520);return index%2?'A monitor chimes softly in the next bay.':'A trolley wheel clicks across a seam in the floor.';}
  if(atmosphere==='choral'){this.tone(196,2.1,'sine',.04);this.tone(293.66,1.4,'sine',.022);return index%2?'One clear note answers another, then leaves a long silence.':'The vessel beside you sounds a note too low for your translator.';}
  if(atmosphere==='garden'){this.tone(360,.75,'sine',.024,170);return index%2?'Leaves brush glass without any wind.':'Water moves through the irrigation lines.';}
  if(atmosphere==='theatre'){this.tone(130,1.8,'sine',.028,72);return index%2?'A chair creaks in the dark beyond the stage.':'A breath reaches you from the empty hall.';}
  if(atmosphere==='drain'){this.tone(63,1.4,'triangle',.045,39);this.tone(610,.12,'sine',.02,260);return index%2?'A pipe answers a knock you did not make.':'A drop rings in a tank that should be dry.';}
  this.tone(index%2?95:140,.9,'triangle',.04,38);setTimeout(()=>this.tone(62,.25,'sine',.035,36),520);return'The empty room settles. Something taps behind the wall.';
 }
 mute(){if(!this.ctx||this.recoveryMuted)return;busGain(this.master,this.enabled()?.17:0,this.ctx.currentTime,.02);if(!this.musicEnabled()){busGain(this.musicBus,0,this.ctx.currentTime,.02);this.stopScores();this.director.suspend(this.musicNow);this.musicDecision=null;}}
}
