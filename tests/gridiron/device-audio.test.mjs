import test from 'node:test';import assert from 'node:assert/strict';
import {playbackSession,bindAudioActivation} from '../../daily_flyer/themes/pocket_gridiron_assets/device-audio.js';
import {StadiumAudio} from '../../daily_flyer/themes/pocket_gridiron_assets/audio.js';
test('media playback session supports speaker routing and missing/readonly implementations',()=>{
 const nav={audioSession:{type:'auto'}};playbackSession(nav);assert.equal(nav.audioSession.type,'playback');
 assert.doesNotThrow(()=>playbackSession({}));assert.doesNotThrow(()=>playbackSession({audioSession:{get type(){return 'auto'},set type(v){throw Error('unsupported')}}}));
});
test('ordinary taps, iOS touchend, page restoration and device changes activate audio without toggling effects',()=>{
 const events={},target={hidden:false,addEventListener(n,f){events[n]=f}},win={addEventListener(n,f){events[n]=f}},nav={mediaDevices:{addEventListener(n,f){events[n]=f}}};let count=0,enabled=true;
 bindAudioActivation(()=>count++,{target,win,nav,enabled:()=>enabled});
 for(const n of ['pointerdown','touchend','keydown','pageshow','devicechange'])events[n]({isTrusted:true});assert.equal(count,5);
 target.hidden=true;events.touchend({isTrusted:true});events.visibilitychange();assert.equal(count,5);
 target.hidden=false;events.visibilitychange();assert.equal(count,6);enabled=false;events.touchend({isTrusted:true});assert.equal(count,6);
});
test('interrupted context resumes within the gesture; a running context is not repeatedly resumed',async()=>{
 const a=new StadiumAudio();let resumes=0,applies=0;a.context={state:'interrupted',resume(){resumes++;this.state='running';return Promise.resolve()}};a.master={};a.apply=()=>applies++;
 const original=globalThis.AudioContext;globalThis.AudioContext=function(){};
 try{const promise=a.unlock();assert.equal(resumes,1);await promise;await a.unlock();assert.equal(resumes,1);assert.ok(applies>=2);}finally{globalThis.AudioContext=original;}
});
test('old genre stations migrate to the automatic show rotation',()=>{assert.equal(new StadiumAudio({station:'gallop'}).settings.station,'all');assert.equal(new StadiumAudio({station:'reflective'}).settings.station,'all');});
