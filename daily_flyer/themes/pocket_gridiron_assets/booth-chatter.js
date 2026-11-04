import {syllableStress} from './syllables.js?v=29';
// Original nonverbal text sounds. One shared word clock drives sound and captions.
const timelines=new Map();
const timbres={al:{frequency:265,cutoff:1850,volume:.11},john:{frequency:185,cutoff:1250,volume:.14},coach:{frequency:218,cutoff:1500,volume:.12},casey:{frequency:330,cutoff:2100,volume:.10}};
export function wordTimeline(text=''){
 if(timelines.has(text))return timelines.get(text);
 let at=.28;
 const words=(text.match(/\S+/g)||[]).map((word,index)=>{
  const letters=word.replace(/[^\p{L}\p{N}]/gu,'').length;
  const duration=Math.min(.38,.13+letters*.025),start=at;
  const pause=/[.!?…][”'"’)]*$/.test(word)?.25:/[,;:—][”'"’)]*$/.test(word)?.13:0;
  at+=duration+.055+pause;return {text:word,index,start,duration,voiced:letters>0,stress:syllableStress(word)};
 });
 const result={words,duration:Math.max(3.2,at+.65)};
 if(timelines.size>=128)timelines.delete(timelines.keys().next().value);
 timelines.set(text,result);return result;
}
export function wordAt(timeline,elapsed){
 const word=timeline.words.find(w=>elapsed>=w.start&&elapsed<w.start+w.duration);
 return {word:word||null,wordIndex:word?.index??-1,wordElapsed:word?elapsed-word.start:0};
}
export function chatterPulses(speaker,word){
 if(!word?.voiced)return [];
 const stress=word.stress??syllableStress(word.text);if(!stress)return [];
 const step=word.duration/stress.length;
 const voice=timbres[speaker]||timbres.al;
 return [...stress].map((accent,i)=>({offset:i*step,duration:Math.min(.085,step*.7),
  frequency:voice.frequency*(accent==='1'?1.025:1),
  cutoff:voice.cutoff,volume:voice.volume*(accent==='0'?.8:1)}));
}
export function syllableEnergy(word,elapsed){
 const pulse=chatterPulses('al',word).find(p=>elapsed>=p.offset&&elapsed<p.offset+p.duration);
 return pulse?Math.sin(Math.PI*(elapsed-pulse.offset)/pulse.duration):0;
}
export class BoothChatter {
 constructor(){this.voices=new Set();this.key=null;this.context=null;}
 stop(){
  for(const voice of [...this.voices]){try{voice.o.stop();}catch{}voice.clean();}
  this.key=null;
 }
 update(context,bus,speech,enabled=true){
  if(!enabled||!speech?.word||!context||!bus||context.state!=='running'){this.stop();this.context=context;return;}
  if(this.context!==context){this.stop();this.context=context;}
  const key=`${speech.key}:${speech.wordIndex}`;if(key===this.key)return;
  this.stop();this.key=key;
  // Schedule only the remainder of this word. Never catch up missed dialogue
  // after a hidden tab, slow frame, skipped segment or audio interruption.
  for(const p of chatterPulses(speech.speaker,speech.word)){
   const remaining=p.offset+p.duration-speech.wordElapsed;if(remaining<=.008)continue;
   const delay=Math.max(0,p.offset-speech.wordElapsed),duration=Math.min(p.duration,remaining),t=context.currentTime+delay;
   const o=context.createOscillator(),g=context.createGain(),filter=context.createBiquadFilter();
   o.type='square';o.frequency.setValueAtTime(p.frequency,t);o.frequency.setValueAtTime(p.frequency*.94,t+duration*.55);
   filter.type='lowpass';filter.frequency.value=p.cutoff;filter.Q.value=.45;
   o.connect(filter);filter.connect(g);g.connect(bus);
   g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(p.volume,t+Math.min(.005,duration*.25));g.gain.setValueAtTime(p.volume*.75,t+duration*.45);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
   const voice={o,clean:()=>{if(!this.voices.has(voice))return;o.disconnect();g.disconnect();filter.disconnect();this.voices.delete(voice);}};
   o.onended=voice.clean;this.voices.add(voice);o.start(t);o.stop(t+duration+.004);
  }
 }
}
