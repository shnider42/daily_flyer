import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseballGame } from '../public/engine.mjs';
import { BaseballCommentary, selectCommentary } from '../public/commentary.mjs';

function sample() {
  const s = new BaseballGame({ humanSides:[0,1] }).state;
  s.time = 5; s.tick = 600; return s;
}
function speechFixture(voices = [{ name:'Local English', lang:'en-US', localService:true, default:true }]) {
  const spoken = [], handlers = new Map(), synth = {
    spoken, cancels:0, resumes:0, voices,
    getVoices(){ return this.voices; },
    cancel(){ this.cancels++; }, resume(){ this.resumes++; },
    speak(u){ spoken.push(u); },
    addEventListener(type, fn){ handlers.set(type, fn); },
    removeEventListener(type){ handlers.delete(type); },
  };
  class Utterance { constructor(text){this.text=text;} }
  return { speech:synth, Utterance, handlers };
}

test('commentary does not expose live pitch identity, velocity, target or hang state', () => {
  const state=sample();state.phase='pitch';state.pitch={id:1,type:'knuckleball',mph:104,target:{x:2,y:2},execution:{hanging:true}};
  const before=JSON.stringify(state);
  for(const type of ['windup','pitch','swing']) assert.equal(selectCommentary({type,pitchType:'knuckleball',mph:104},state),null);
  assert.equal(selectCommentary({type:'result',kind:'strike'},state),null);
  state.phase='result';
  assert.match(selectCommentary({type:'result',kind:'strike'},state).text,/104 miles/);
  state.phase='pitch';assert.equal(JSON.stringify(state),before);
});

test('calls use handed players, actual results, and complete fight consequences', () => {
  const state=sample();state.batterIndex[0]=1;
  assert.match(selectCommentary({type:'batter'},state).text,/Mateo Cruz.*left handed/);
  state.phase='result';state.pending='final';
  assert.match(selectCommentary({type:'result',kind:'homeRun'},state).text,/walk off/);
  const end=selectCommentary({type:'fight-end',batterName:'Mateo Cruz',pitcherName:'Troy Vance'},state);
  assert.match(end.text,/Cruz and Vance are both ejected/);assert.match(end.text,/base award stands/);
  assert.equal(selectCommentary({type:'fight-hit',blocked:true},state),null);
});

test('speech needs a gesture and a local English voice; captions remain available', () => {
  const state=sample(), calls=[], env=speechFixture();
  const commentary=new BaseballCommentary({...env,onCaption:text=>calls.push(text)});
  commentary.event({type:'start'},state);
  assert.equal(env.speech.spoken.length,0);assert.equal(calls.length,1);
  commentary.unlock();state.time+=5;commentary.event({type:'pitching-change',name:'Eli Brennan',throws:'L',tick:1200},state);
  assert.equal(env.speech.spoken.length,1);assert.equal(env.speech.spoken[0].voice.localService,true);
  const remote=speechFixture([{name:'Remote English',lang:'en-US',localService:false}]);
  const fallback=new BaseballCommentary({...remote,onCaption:text=>calls.push(text)});
  fallback.unlock();fallback.event({type:'start'},state);
  assert.equal(remote.speech.spoken.length,0);assert.equal(fallback.voiceAvailable,false);assert.match(calls.at(-1),/play ball/i);
});

test('mute cancels spoken commentary without hiding text; off hides both', () => {
  const state=sample(),calls=[],env=speechFixture(),commentary=new BaseballCommentary({...env,onCaption:text=>calls.push(text)});
  commentary.unlock();commentary.event({type:'start'},state);assert.equal(env.speech.spoken.length,1);
  commentary.setEnabled(false);assert(commentary.current);assert(calls.at(-1));
  state.time+=5;commentary.event({type:'mound-offer',tick:1200,name:'Mateo Cruz'},state);
  assert.equal(env.speech.spoken.length,1);assert.match(calls.at(-1),/hit batter/);
  commentary.setMode('off');assert.equal(calls.at(-1),'');assert.equal(commentary.current,null);
  assert.equal(commentary.event({type:'final',winner:0,score:[2,1]},state),null);
});

test('new important calls replace ordinary calls, never build a speech queue', () => {
  const state=sample(),env=speechFixture(),commentary=new BaseballCommentary(env);
  commentary.unlock();commentary.event({type:'contact',quality:1,launchAngle:30},state);
  assert.equal(env.speech.spoken.length,1);
  assert.equal(commentary.event({type:'pickoff'},state),null);
  commentary.event({type:'mound-charge',batterName:'Mateo Cruz'},state);
  assert.equal(env.speech.spoken.length,2);assert.match(commentary.current.text,/charging the mound/);
  assert(env.speech.cancels>=2);
  const previous=env.speech.spoken[0];let talking=false;commentary.onSpeaking=v=>talking=v;
  previous.onstart();assert.equal(talking,false,'an interrupted utterance cannot duck the current game');
});

test('repeated online event snapshots are deduplicated and wording rotates across pitches', () => {
  const state=sample(),commentary=new BaseballCommentary({mode:'captions'});
  const first=commentary.event({type:'hit-by-pitch',tick:600,name:'Evan Ward',award:true},state);
  assert.equal(commentary.event({type:'hit-by-pitch',tick:600,name:'Evan Ward',award:true},state),null);
  state.time+=6;state.tick+=720;
  const second=commentary.event({type:'hit-by-pitch',tick:state.tick,name:'Evan Ward',award:true},state);
  assert.notEqual(first.text,second.text);
});

test('pause and next delivery discard stale calls instead of resuming a backlog', () => {
  const state=sample(),env=speechFixture(),calls=[],commentary=new BaseballCommentary({...env,onCaption:text=>calls.push(text)});
  commentary.unlock();commentary.event({type:'start'},state);
  commentary.update(state,{paused:true});assert.equal(calls.at(-1),'');assert.equal(commentary.current,null);
  commentary.update(state,{paused:false});
  state.phase='result';state.time+=6;
  commentary.event({type:'result',kind:'homeRun'},state);assert(commentary.current);
  state.phase='ready';state.tick++;commentary.update(state);assert.notEqual(commentary.current?.key,'homeRun');
  commentary.event({type:'pitch',pitchType:'slider'},state);assert.equal(commentary.current,null);
});

test('voices appearing later apply only to future calls and never replay old captions', () => {
  const state=sample(),env=speechFixture([]),commentary=new BaseballCommentary(env);
  commentary.unlock();commentary.event({type:'start'},state);assert.equal(env.speech.spoken.length,0);
  env.speech.voices=[{name:'Local',lang:'en-GB',localService:true}];env.handlers.get('voiceschanged')();
  assert.equal(env.speech.spoken.length,0);assert.equal(commentary.voiceAvailable,true);
  state.time+=6;commentary.event({type:'half',tick:1320},state);assert.equal(env.speech.spoken.length,1);
  commentary.destroy();assert.equal(env.handlers.size,0);
});

test('commentary works without speech APIs and can restart after menu reset', () => {
  const state=sample(),commentary=new BaseballCommentary({speech:null,Utterance:null});
  assert.doesNotThrow(()=>commentary.unlock());commentary.update(state,{active:false});
  commentary.reset();assert(commentary.event({type:'start'},state));
  assert.equal(commentary.voiceAvailable,false);
});
