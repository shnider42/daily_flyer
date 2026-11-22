import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer, FrameMeter } from '../public/performance.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('60 and 120 FPS caps tolerate alternating RAF timestamp jitter without halving frame rate', () => {
  for (const limit of [60,120]) {
    const pacer = new FramePacer();
    const deltas = [];
    for (let i=0; i<=limit*10; i++) {
      const now = i * 1000 / limit + (i % 2 ? -.6 : 0);
      const elapsed = pacer.next(now,limit);
      if (elapsed !== null) deltas.push(elapsed);
    }
    assert.equal(deltas.length,limit*10+1);
    near(deltas.reduce((sum,value)=>sum+value,0),10);
  }
});

test('capped rendering retains elapsed simulation time across skipped high-refresh callbacks', () => {
  for (const limit of [15,30,60,120]) {
    const pacer = new FramePacer();
    const deltas = [];
    for (let i=0; i<=1440; i++) {
      const elapsed = pacer.next(i * 1000 / 144,limit);
      if(elapsed!==null) deltas.push(elapsed);
    }
    assert.ok(Math.abs(deltas.length - (limit*10+1)) <= 1, `${limit}: ${deltas.length} frames`);
    near(deltas.reduce((sum,value)=>sum+value,0),10,.008);
  }
});

test('frame-limit changes rephase immediately and uncapped accepts every advancing callback', () => {
  const pacer = new FramePacer();
  assert.equal(pacer.next(0,30),0);
  assert.equal(pacer.next(8,30),null);
  near(pacer.next(10,120),.01);
  assert.equal(pacer.next(20,30),null);
  near(pacer.next(44,30),.034);
  near(pacer.next(45,0),.001);
  near(pacer.next(46,0),.001);
  assert.equal(pacer.next(46,0),null);
});

test('suspension cannot produce a huge simulation jump or a burst of catch-up frames', () => {
  const pacer = new FramePacer();
  pacer.next(0,60);
  assert.equal(pacer.next(5000,60),.1);
  assert.equal(pacer.next(5001,60),null);
  assert.equal(pacer.next(NaN,60),null);
  pacer.reset();
  assert.equal(pacer.next(5010,60),0);
});

test('the meter reports rendered frame cadence separately from CPU work and retains sub-second stalls', () => {
  const meter = new FrameMeter();
  meter.record(0,4);
  for(let i=1;i<=120;i++) meter.record(i*1000/30,4);
  const steady=meter.sample();
  near(steady.fps,30); near(steady.frameMS,1000/30); near(steady.p95,1000/30);
  assert.equal(steady.workMS,4); assert.equal(steady.samples,120);
  meter.record(4250,180);
  assert.ok(meter.sample().fps < 30);
  assert.ok(meter.sample().workMS > 4);
});

test('the meter bounds its rolling window at 120 samples and computes a nearest-rank p95', () => {
  const meter = new FrameMeter();
  let now=0;
  meter.record(now,1);
  for(let i=0;i<240;i++) { now+=50; meter.record(now,20); }
  for(let i=0;i<120;i++) { now+=i<12?30:10; meter.record(now,2); }
  const sample=meter.sample();
  assert.equal(sample.samples,120); assert.equal(sample.p95,30);
  near(sample.frameMS,12); near(sample.fps,1000/12); assert.equal(sample.workMS,2);
});

test('meter gaps and resets discard stale measurements while invalid timestamps do not poison samples', () => {
  const meter=new FrameMeter();
  meter.record(0,2); meter.record(20,2); meter.record(NaN,2);
  near(meter.sample().fps,50);
  meter.record(5020,2);
  assert.deepEqual(meter.sample(),{fps:0,frameMS:0,p95:0,workMS:0,samples:0});
  meter.record(5040,3); near(meter.sample().fps,50);
  meter.record(5040,Infinity); assert.equal(meter.sample().samples,1);
  meter.reset(); assert.equal(meter.sample().samples,0);
  meter.record(0,2); meter.record(10,NaN); assert.equal(meter.sample().workMS,0);
});
