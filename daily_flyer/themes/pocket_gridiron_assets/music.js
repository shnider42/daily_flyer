// Adapted from Breach's authored-score transport: shared AudioContext, bounded
// decoded cache, guarded async loads, local mixing, and explicit pause handling.
export const SCORE_CUES={NE:{id:'for-boston',title:'For Boston',src:'./music/for-boston.mp3'},NYJ:{id:'notre-dame-victory',title:'Notre Dame Victory March',src:'./music/notre-dame-victory.mp3?v=23'},default:{id:'pgi-score',title:'Six on the Board',src:'./music/pgi-score.mp3'}};
export const FAMILY_NAMES={all:'Match the moment',arcade:'Arcade favorites',film:'Postgame film scores'};
export const SCENE_TRACKS={
 menu:['saturday-voltage','neon-end-zone','fourth-and-thunder'],
 pregame:['fourth-and-thunder','saturday-voltage','neon-end-zone'],
 halftime:['neon-end-zone','saturday-voltage','fourth-and-thunder'],
 postgame:['sunday-in-gold','leather-and-thunder','the-long-walk-home']
};
export class PGIMusic {
 constructor({fetcher=globalThis.fetch?.bind(globalThis)}={}){this.fetcher=fetcher;this.catalog=[];this.cache=new Map();this.loads=new Map();this.failed=new Set();this.voices=new Set();this.generation=0;this.scoreGeneration=0;this.enabled=true;this.scoring=true;this.family='all';this.scene='menu';this.volume=.55;this.blocked=false;this.active=null;this.scorer=null;this.pending=null;this.cursor=-1;this.resumeAt=0;this.selected=null;this.status='Choose a track or start a game.';}
 async loadCatalog(){try{const r=await this.fetcher(new URL('./music/manifest.json?v=23',import.meta.url));if(!r.ok)throw Error();const m=await r.json();this.catalog=(Array.isArray(m)?m:m.tracks).filter(t=>t.id&&t.title&&['arcade','film'].includes(t.family)&&/^\.\/music\/[a-z0-9-]+\.mp3$/.test(t.src));return this.catalog;}catch{this.status='Soundtrack unavailable. Football is ready.';return [];}}
 attach(context,output,scoreOutput){this.context=context;this.output=output;this.scoreOutput=scoreOutput;}
 releaseContext(){
  ++this.generation;++this.scoreGeneration;
  this.selected=this.active?.track||this.selected;this.resumeAt=0;
  for(const v of this.voices){try{v.source.stop();v.source.disconnect();v.gain.disconnect();}catch{}}
  this.voices.clear();this.active=null;this.scorer=null;this.pending=null;this.context=null;this.output=null;this.scoreOutput=null;this.loads.clear();this.failed.clear();
 }
 configure({enabled=true,scoring=true,family='all',volume=.55}={}){family=Object.hasOwn(FAMILY_NAMES,family)?family:'all';const changed=family!==this.family;this.enabled=!!enabled;this.scoring=!!scoring;this.family=family;this.volume=Math.max(0,Math.min(1,Number(volume)||0));if(!this.enabled)this.halt();if(!this.scoring)this.stopScore();if(changed){this.selected=null;this.cursor=-1;this.resumeAt=0;this.halt(false);}this.mix();}
 // Browsing exposes both collections; automatic playback follows the current show.
 list({browse=false}={}){
  if(this.family!=='all')return this.catalog.filter(t=>t.family===this.family);
  if(browse)return this.catalog;
  return SCENE_TRACKS[this.scene].map(id=>this.catalog.find(t=>t.id===id)).filter(Boolean);
 }
 setScene(scene){
  if(!Object.hasOwn(SCENE_TRACKS,scene)||scene===this.scene)return;
  this.scene=scene;
  if(scene==='postgame')this.stopScore();
  if(this.family!=='all')return;
  this.halt(false);this.selected=null;this.resumeAt=0;this.cursor=-1;
 }
 ready(){return this.context?.state==='running'&&this.output&&this.context.createBufferSource&&this.context.decodeAudioData;}
 async prepare(track){
  if(!track||!this.context)throw Error('Audio unavailable');if(this.cache.has(track.id))return this.cache.get(track.id);if(this.loads.has(track.id))return this.loads.get(track.id);
  if(this.loads.size>=3){await Promise.race(this.loads.values()).catch(()=>{});return this.prepare(track);}
  const context=this.context,job=(async()=>{const r=await this.fetcher(new URL(track.src,import.meta.url));if(!r.ok)throw Error('Track unavailable');const buffer=await context.decodeAudioData(await r.arrayBuffer());if(context!==this.context||!buffer.duration)throw Error('Audio changed');this.cache.set(track.id,buffer);const limit=track.family?2:3;const category=[...this.cache.keys()].filter(id=>Boolean(this.catalog.find(t=>t.id===id))===Boolean(track.family));while(category.length>limit)this.cache.delete(category.shift());return buffer;})().finally(()=>{if(this.loads.get(track.id)===job)this.loads.delete(track.id);});this.loads.set(track.id,job);return job;
 }
 warmScores(teams){for(const abbr of new Set(teams))this.prepare(SCORE_CUES[abbr]||SCORE_CUES.default).catch(()=>{});}
 makeVoice(buffer,track,output,offset=0){const c=this.context,source=c.createBufferSource(),gain=c.createGain(),at=c.currentTime;source.buffer=buffer;source.connect(gain);gain.connect(output);gain.gain.setValueAtTime(0,at);const voice={source,gain,track,offset,at,end:at+buffer.duration-offset,stopped:false};this.voices.add(voice);source.onended=()=>{this.voices.delete(voice);if(this.active===voice){this.active=null;this.selected=null;this.resumeAt=0;}if(this.scorer===voice){this.scorer=null;this.mix();}source.disconnect();gain.disconnect();};source.start(at,offset);return voice;}
 fade(voice,seconds=.25){if(!voice||voice.stopped)return;voice.stopped=true;const at=this.context.currentTime;voice.gain.gain.cancelScheduledValues(at);voice.gain.gain.setValueAtTime(voice.gain.gain.value,at);voice.gain.gain.linearRampToValueAtTime(0,at+seconds);try{voice.source.stop(at+seconds);}catch{}}
 halt(preserve=true){++this.generation;this.pending=null;if(this.active){if(preserve){this.selected=this.active.track;this.resumeAt=Math.min(this.active.source.buffer.duration-.05,this.active.offset+this.context.currentTime-this.active.at);}this.fade(this.active);this.active=null;}}
 stopScore(){++this.scoreGeneration;this.fade(this.scorer,.15);this.scorer=null;this.mix();}
 mix(){if(!this.context)return;const at=this.context.currentTime;for(const v of this.voices){if(v.stopped)continue;const level=v===this.scorer?.75:this.volume*(this.scorer?.15:this.live?.42:1);v.gain.gain.cancelScheduledValues(at);v.gain.gain.setTargetAtTime(this.blocked?0:level,at,.12);}}
 choose(id){const track=this.catalog.find(t=>t.id===id);if(!track)return false;this.halt(false);this.selected=track;this.resumeAt=0;this.failed.delete(id);this.status=`Selected: ${track.title}`;this.update({blocked:this.blocked,live:this.live,background:this.background,scoreAllowed:this.scoreAllowed});return true;}
 next(){const list=this.list();if(!list.length)return;const last=this.active?.track||this.selected;const index=list.findIndex(t=>t.id===last?.id);this.halt(false);this.selected=list[(index+1)%list.length];this.resumeAt=0;this.update({blocked:this.blocked,live:this.live,background:this.background,scoreAllowed:this.scoreAllowed});}
 async request(track){
  const generation=++this.generation;this.pending=track;this.status=`Loading: ${track.title}`;
  try{const buffer=await this.prepare(track);if(generation!==this.generation||this.blocked||this.background===false||!this.enabled||!this.ready())return;const offset=this.selected?.id===track.id?this.resumeAt:0;const outgoing=this.active;this.active=this.makeVoice(buffer,track,this.output,Math.min(offset,buffer.duration-.05));this.fade(outgoing,.65);this.selected=track;this.resumeAt=0;this.cursor=this.list().findIndex(t=>t.id===track.id);this.status=track.title;this.mix();const list=this.list(),next=list[(this.cursor+1)%list.length];if(next&&next.id!==track.id&&this.loads.size<2)this.prepare(next).catch(()=>{});}catch{if(generation===this.generation){this.failed.add(track.id);this.status=`Could not load ${track.title}. Skipping.`;this.selected=null;this.resumeAt=0;}}finally{if(generation===this.generation)this.pending=null;}
 }
 score(team){
  if(!this.scoring||!this.ready()||this.blocked)return;this.scoreAllowed=true;const track=SCORE_CUES[team]||SCORE_CUES.default,generation=++this.scoreGeneration,deadline=this.context.currentTime+3;
  this.prepare(track).then(buffer=>{if(generation!==this.scoreGeneration||!this.scoring||this.blocked||this.scoreAllowed===false||!this.ready()||this.context.currentTime>deadline)return;this.fade(this.scorer,.12);this.scorer=this.makeVoice(buffer,track,this.scoreOutput);this.mix();}).catch(()=>{});
 }
 update({blocked=false,live=false,background=true,scoreAllowed=true,scene=this.scene}={}){
  this.setScene(scene);
  const wasBlocked=this.blocked,hadScore=this.scoreAllowed;this.blocked=blocked;this.live=live;this.background=background;this.scoreAllowed=scoreAllowed;
  if(blocked){if(!wasBlocked){this.halt();this.stopScore();}return;}
  if(!scoreAllowed&&(hadScore!==false||this.scorer))this.stopScore();
  if(!background){if(this.active||this.pending)this.halt();this.status='On the field · stadium sounds';this.mix();return;}
  this.mix();if(!this.enabled||!this.volume||!this.ready()||this.pending||this.active)return;
  const list=this.list();const track=this.selected||list.find((t,i)=>i>this.cursor&&!this.failed.has(t.id))||list.find(t=>!this.failed.has(t.id));if(track)this.request(track);
 }
}
