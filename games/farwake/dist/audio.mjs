import { playbackSession, bindAudioActivation } from './shared/device-audio.mjs';
export class Soundscape{
 constructor(enabled=()=>true){this.enabled=enabled;this.ctx=null;this.master=null;this.last={};this.ambient=null;bindAudioActivation(()=>this.unlock(),{enabled});}
 unlock(){if(!this.enabled())return;try{playbackSession();if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.17;this.master.connect(this.ctx.destination);}if(this.ctx.state==='suspended')this.ctx.resume();}catch{}}
 tone(freq,duration=.1,type='sine',volume=.2,endFreq=null){if(!this.enabled()||!this.ctx||this.ctx.state!=='running')return;try{const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(10,endFreq),t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.03);}catch{}}
 play(name){
  const now=performance.now(),limit={fire:130,mine:180,footstep:250,hit:180,sidearm:90,crewShot:170,enemyShot:150,sidearmHit:90,personHit:170,personDown:250,bulkhead:220,shipAlarm:3000,repair:180}[name]??80;if(now-(this.last[name]??-1000)<limit)return;this.last[name]=now;
  switch(name){
   case'sidearm':this.tone(740,.095,'square',.20,210);this.tone(1340,.045,'triangle',.10,640);break;
   case'crewShot':this.tone(470,.09,'triangle',.13,180);break;
   case'enemyShot':this.tone(250,.12,'sawtooth',.13,95);break;
   case'sidearmHit':this.tone(910,.06,'sine',.18,590);break;
   case'personHit':this.tone(94,.17,'triangle',.28,32);this.tone(180,.07,'square',.09,80);break;
   case'personDown':this.tone(175,.28,'triangle',.19,56);break;
   case'fire':this.tone(520,.13,'square',.11,90);break;
   case'bulkhead':this.tone(62,.27,'triangle',.24,23);this.tone(135,.08,'square',.045,72);break;
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
 atmosphere(time,mode,music){if(!music||!this.enabled())return;if(time-(this.musicTime??-10)<4.8)return;this.musicTime=time;const notes=mode==='person'?[130.81,164.81,196,146.83,174.61,196,164.81,146.83]:[65.41,98,130.81,82.41,110,146.83,98,73.42];const i=(this.noteIndex??0)%notes.length;this.noteIndex=i+1;this.tone(notes[i],4.5,'sine',.10);this.tone(notes[i]*1.5,3.8,'sine',.035);}
 /** Sparse location sounds are effects, so a quiet room still has a voice with music off. */
 siteAtmosphere(time,atmosphere){
  if(!atmosphere||!this.enabled())return null;
  if(this.siteSoundKind!==atmosphere){this.siteSoundKind=atmosphere;this.nextSiteSound=time+1.2;this.siteSoundIndex=0;}
  if(time<(this.nextSiteSound??0))return null;
  const index=(this.siteSoundIndex??0);this.siteSoundIndex=index+1;this.nextSiteSound=time+11+(index%4)*3;
  if(atmosphere==='cave'){
   if(index%2===0){this.tone(820,.19,'sine',.075,470);setTimeout(()=>this.tone(630,.4,'sine',.025,410),260);return'A drop falls somewhere beyond the lamplight.';}
   this.tone(58,2.3,'triangle',.07,31);this.tone(95,1.6,'sine',.025,55);return'A low rumble travels through the stone.';
  }
  if(atmosphere==='ice'){this.tone(460,1.8,'sine',.035,710);this.tone(63,.5,'triangle',.07,35);return'Ice shifts beneath the shelter.';}
  if(atmosphere==='machinery'){this.tone(78,.8,'triangle',.075,42);setTimeout(()=>this.tone(96,.18,'triangle',.04,48),420);return'A pipe knocks twice inside the wall.';}
  if(atmosphere==='signal'){this.tone(310,.7,'sine',.045,180);setTimeout(()=>this.tone(740,.09,'sine',.03,690),870);return'A receiver catches half of a distant call.';}
  if(atmosphere==='market'){this.tone(230,.18,'triangle',.025,170);return index%2?'A cup is set down behind a curtain.':'Low voices carry between the stalls.';}
  if(atmosphere==='clinic'){this.tone(540,.12,'sine',.022,520);return index%2?'A monitor chimes softly in the next bay.':'A trolley wheel clicks across a seam in the floor.';}
  if(atmosphere==='choral'){this.tone(196,2.1,'sine',.04);this.tone(293.66,1.4,'sine',.022);return index%2?'One clear note answers another, then leaves a long silence.':'The vessel beside you sounds a note too low for your translator.';}
  if(atmosphere==='garden'){this.tone(360,.75,'sine',.024,170);return index%2?'Leaves brush glass without any wind.':'Water moves through the irrigation lines.';}
  if(atmosphere==='theatre'){this.tone(130,1.8,'sine',.028,72);return index%2?'A chair creaks in the dark beyond the stage.':'A breath reaches you from the empty hall.';}
  if(atmosphere==='drain'){this.tone(63,1.4,'triangle',.045,39);this.tone(610,.12,'sine',.02,260);return index%2?'A pipe answers a knock you did not make.':'A drop rings in a tank that should be dry.';}
  this.tone(index%2?95:140,.9,'triangle',.04,38);setTimeout(()=>this.tone(62,.25,'sine',.035,36),520);return'The empty room settles. Something taps behind the wall.';
 }
 mute(){if(this.master)this.master.gain.value=this.enabled()?.17:0;}
}
