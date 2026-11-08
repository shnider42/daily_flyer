import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameMonitor } from '../dist/performance.mjs';

test('performance report distinguishes visible frame rate from network update rate',()=>{
 const monitor=new FrameMonitor();
 for(let n=0;n<=120;n++)monitor.frame(n*1000/60);
 for(let n=0;n<=20;n++)monitor.snapshot({type:'snapshot',tick:n*3},n*100);
 const result=monitor.summary(2500);
 assert.ok(Math.abs(result.fps-60)<.01);
 assert.ok(Math.abs(result.updateHz-10)<.01);
 assert.ok(result.frameP95<17);
 assert.equal(result.updateP95,100);
});

test('hidden tabs and duplicate command snapshots do not manufacture performance problems',()=>{
 const monitor=new FrameMonitor();
 monitor.frame(0);monitor.frame(16);monitor.frame(20,false);
 monitor.frame(600);monitor.frame(616);
 monitor.snapshot({type:'welcome',tick:0},0);
 monitor.snapshot({type:'snapshot',tick:3},100);
 monitor.snapshot({type:'snapshot',tick:3},140);
 monitor.snapshot({type:'result',tick:3},180);
 monitor.snapshot({type:'snapshot',tick:6},200);
 const result=monitor.summary(700);
 assert.equal(result.frameMax,16);
 assert.equal(result.updateHz,10);
});

test('performance report retains a recent long frame and resets network samples on reconnect',()=>{
 const monitor=new FrameMonitor({capacity:10});
 let now=0;monitor.frame(now);
 for(let n=0;n<8;n++)monitor.frame(now+=16);
 monitor.frame(now+=90);
 monitor.snapshot({type:'snapshot',tick:3},0);
 monitor.snapshot({type:'snapshot',tick:6},180);
 let result=monitor.summary(1000);
 assert.equal(result.frameMax,90);
 assert.equal(result.frameP95,90);
 assert.equal(result.updateMax,180);
 monitor.snapshot({type:'welcome',tick:9},190);
 result=monitor.summary(1100);
 assert.equal(result.updateMax,0);
});
