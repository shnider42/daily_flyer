import test from 'node:test';
import assert from 'node:assert/strict';
import {wordTimeline,wordAt,chatterPulses,BoothChatter} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-chatter.js';
import {broadcastBeat} from '../../daily_flyer/themes/pocket_gridiron_assets/booth-lines.js';
import {StadiumAudio} from '../../daily_flyer/themes/pocket_gridiron_assets/audio.js';
class Param {constructor(){this.events=[];}setValueAtTime(v,t){this.events.push([v,t]);}linearRampToValueAtTime(v,t){this.events.push([v,t]);}exponentialRampToValueAtTime(v,t){this.events.push([v,t]);}setTargetAtTime(){}}
class Node {constructor(){this.frequency=new Param();this.gain=new Param();this.Q={};this.disconnections=0;this.stops=[];}connect(to){this.to=to;}disconnect(){this.disconnections++;}start(t){this.started=t;}stop(t){this.stops.push(t);}}
class Context {constructor(){this.currentTime=10;this.state='running';this.osc=[];this.nodes=[];}node(){const n=new Node();this.nodes.push(n);return n;}createOscillator(){const n=this.node();this.osc.push(n);return n;}createGain(){return this.node();}createBiquadFilter(){return this.node();}}
const speech=(elapsed=0,speaker='al')=>({key:'show:0:0',speaker,...wordAt(wordTimeline('Football, forever!'),.28+elapsed)});
test('chatter defaults on for new and existing settings and preserves an explicit opt-out',()=>{
 assert.equal(new StadiumAudio().settings.boothChatter,true);assert.equal(new StadiumAudio({effects:false,music:false}).settings.boothChatter,true);assert.equal(new StadiumAudio({boothChatter:false}).settings.boothChatter,false);
});
test('captions and sound use the same word boundaries with silent lead-in and punctuation pauses',()=>{
 const t=wordTimeline('One, two. — Three!');assert.equal(wordAt(t,0).word,null);assert.equal(t.words.length,4);
 for(const w of t.words){assert.equal(wordAt(t,w.start+.01).word.text,w.text);assert.equal(wordAt(t,w.start+w.duration+.01).word,null);}
 assert.ok(t.words[1].start-t.words[0].start-t.words[0].duration>.12);
 assert.equal(chatterPulses('al',t.words[2]).length,0);assert.equal(wordAt(t,t.duration).word,null);
 const s={turns:[{speaker:'al',text:'One, two.'},{speaker:'john',text:'Three!'}]},start=wordTimeline(s.turns[0].text).duration;
 const beat=broadcastBeat(s,start+.29);assert.equal(beat.turn.speaker,'john');assert.equal(beat.word.text,'Three!');assert.equal(beat.wordIndex,0);
});
test('Al and John have distinct deterministic nonverbal timbres without gameplay RNG',()=>{
 const w=wordTimeline('Football').words[0],a=chatterPulses('al',w),j=chatterPulses('john',w);assert.deepEqual(a,chatterPulses('al',w));assert.notDeepEqual(a,j);assert.ok(a[0].frequency>j[0].frequency);assert.ok(a[0].cutoff>j[0].cutoff);assert.ok(a.length<=4&&j.length<=4);assert.ok(a.every(p=>p.offset+p.duration<=w.duration));
});
test('each word sounds once across repeated frames and every voice releases its nodes',()=>{
 const c=new Context(),bus=c.createGain(),chatter=new BoothChatter();chatter.update(c,bus,speech());const count=c.osc.length;assert.ok(count>1&&count<=4);
 for(let i=0;i<12;i++)chatter.update(c,bus,speech(i*.01));assert.equal(c.osc.length,count);
 const voices=[...chatter.voices];for(const v of voices)v.o.onended();assert.equal(chatter.voices.size,0);assert.ok(c.nodes.filter(n=>n!==bus).every(n=>n.disconnections===1));
});
test('pause, mute, hidden-show state and skipping cancel current and future pulses',()=>{
 const c=new Context(),bus=c.createGain(),chatter=new BoothChatter();chatter.update(c,bus,speech());const first=[...c.osc];chatter.update(c,bus,null);assert.equal(chatter.voices.size,0);assert.ok(first.every(n=>n.stops.includes(undefined)));
 chatter.update(c,bus,speech(),false);assert.equal(c.osc.length,first.length);chatter.update(c,bus,{...speech(),key:'new segment'});assert.ok(chatter.voices.size>0);chatter.stop();assert.equal(chatter.voices.size,0);
});
test('late frames and interrupted contexts never queue a catch-up burst',()=>{
 const c=new Context(),bus=c.createGain(),chatter=new BoothChatter();const late=speech(.24);chatter.update(c,bus,late);assert.ok(c.osc.length<=2);assert.ok(c.osc.every(n=>n.started>=c.currentTime));
 c.state='interrupted';chatter.update(c,bus,late);assert.equal(chatter.voices.size,0);const count=c.osc.length;assert.ok(c.osc.every(n=>n.disconnections===1));
 c.state='running';chatter.update(c,bus,speech(.30));assert.ok(c.osc.length-count<=1);
 const next=new Context();chatter.update(next,next.createGain(),speech());assert.ok(c.osc.every(n=>n.disconnections===1));assert.ok(next.osc.length>0);
});
test('stadium chatter is independent of Effects and Music, but obeys volume and visibility',()=>{
 const a=new StadiumAudio({effects:false,music:false,scoringMusic:false}),c=new Context();a.context=c;a.master=c.createGain();a.booth=c.createGain();a.crowd=c.createGain();a.soundtrack.update=()=>{};
 a.update(null,false,{broadcast:'pregame',speech:speech()});assert.ok(a.chatter.voices.size>0);a.update(null,true,{broadcast:'pregame',speech:speech()});assert.equal(a.chatter.voices.size,0);
 a.settings.volume=0;a.update(null,false,{broadcast:'pregame',speech:speech()});assert.equal(a.chatter.voices.size,0);a.settings.volume=.45;a.update(null,false,{broadcast:false,speech:speech()});assert.equal(a.chatter.voices.size,0);
});
