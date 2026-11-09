import test from 'node:test';
import assert from 'node:assert/strict';
import {GridironCamera,cameraPreferences,gridironBall,edgeMarker} from '../../daily_flyer/themes/pocket_gridiron_assets/camera.js';

const settings=(extra={})=>cameraPreferences({cameraMode:'follow',cameraZoom:1.4,...extra});
const base=(extra={})=>({width:360,height:420,format:11,ball:{x:26.5,y:50},player:{x:26.5,y:50},settings:settings(),dt:1/60,scene:'live',...extra});

test('phone camera is closer by default while desktop preserves sideline context',()=>{
 assert.equal(cameraPreferences({},true).cameraMode,'follow');
 assert.equal(cameraPreferences({},true).cameraZoom,1.4);
 assert.equal(cameraPreferences({},false).cameraMode,'fit');
 assert.deepEqual(cameraPreferences({cameraMode:'bad',cameraZoom:Infinity,cameraFocus:'bad'},true),cameraPreferences({},true));
 assert.equal(cameraPreferences({cameraZoom:100}).cameraZoom,2.2);
 assert.equal(cameraPreferences(null,true).cameraZoom,1.4);
});

test('full-field view contains both endzones and sidelines and stays still as play moves',()=>{
 const c=new GridironCamera(),input=base({height:170,settings:settings({cameraMode:'full'})}),a=c.frame(input);
 for(const p of [{x:0,y:-10},{x:53.333,y:110}]){const q=a.screenPoint(p);assert.ok(q.x>=0&&q.x<=360);assert.ok(q.y>=0&&q.y<=170);}
 const b=c.frame({...input,ball:{x:1,y:100},player:{x:1,y:100}});
 assert.deepEqual(a.center,b.center);assert.equal(a.scale,b.scale);
});

test('fit sidelines retains their full width even when focus is at the boundary',()=>{
 const c=new GridironCamera(),f=c.frame(base({ball:{x:1,y:50},settings:settings({cameraMode:'fit',cameraZoom:2.2})}));
 assert.ok(f.screenPoint({x:0,y:50}).x>=0);
 assert.ok(f.screenPoint({x:53.333,y:50}).x<=360);
 assert.equal(f.center.x,180);
 assert.equal(f.scale,1);
});

test('follow zoom enlarges players and scrolls horizontally instead of clipping the focus',()=>{
 const c=new GridironCamera(),f=c.frame(base({ball:{x:52,y:60},player:{x:52,y:60},settings:settings({cameraZoom:2.2})}));
 assert.equal(f.scale,2.2);assert.ok(f.center.x>180);
 const q=f.screenPoint({x:52,y:60});assert.ok(q.x>0&&q.x<360);assert.ok(q.y>0&&q.y<420);
});

test('small movements remain inside the dead zone and large motion eases instead of snapping',()=>{
 const c=new GridironCamera(),input=base(),a=c.frame(input);
 const b=c.frame({...input,ball:{x:27,y:51},player:{x:27,y:51}});
 assert.deepEqual(a.center,b.center);
 const d=c.frame({...input,ball:{x:43,y:95},player:{x:43,y:95}});
 assert.ok(d.center.y<a.center.y);assert.ok(d.center.y>a.center.y-40);
});

test('player focus can follow a defender away from the ball and uses the same projection for hit targets',()=>{
 const c=new GridironCamera(),input=base({ball:{x:3,y:20},player:{x:49,y:80},settings:settings({cameraFocus:'player',cameraZoom:2.2})}),f=c.frame(input),q=f.screenPoint(input.player);
 assert.ok(q.x>0&&q.x<f.width);assert.ok(q.y>0&&q.y<f.height);
 const canonical=f.worldPoint(input.player);
 assert.equal(q.x,f.width/2+(canonical.x-f.center.x)*f.scale);
 assert.ok(edgeMarker(f.screenPoint(input.ball),f.width,f.height));
});

test('ball focus ignores height animations and returns reset to the correct replay snapshot',()=>{
 const c=new GridironCamera(),input=base({settings:settings({cameraFocus:'ball'})}),a=c.frame(input);
 const b=c.frame({...input,ball:{...input.ball,arc:80,z:120}});
 assert.deepEqual(a.center,b.center);
 const d=c.frame({...input,scene:'replay',ball:{x:26,y:100},player:{x:26,y:100}});
 assert.ok(d.center.y<a.center.y);
});

test('ball identity follows passes, loose balls, pitches and kickers before the kick',()=>{
 const carrier={x:20,y:25},pass={x:26,y:70},kicker={x:26,y:80},g={carrier,phase:'live'};
 assert.equal(gridironBall(g),carrier);assert.equal(gridironBall({...g,pass}),pass);
 assert.equal(gridironBall({...g,loose:pass}),pass);
 assert.equal(gridironBall({...g,pitch:{...pass,released:true}}).y,70);
 assert.equal(gridironBall({...g,phase:'kick_ready',special:{goal:false},defenders:Array(7).fill(kicker)}),kicker);
 assert.equal(gridironBall({...g,phase:'kick_ready',special:{goal:true},players:[kicker]}),kicker);
});

test('offscreen markers stay inset and do not appear for visible action',()=>{
 assert.equal(edgeMarker({x:180,y:210},360,420),null);
 for(const p of [{x:-300,y:800},{x:1500,y:-400},{x:180,y:900}]){const q=edgeMarker(p,360,420);assert.ok(q.x>=18&&q.x<=342);assert.ok(q.y>=18&&q.y<=402);assert.ok(Number.isFinite(q.angle));}
});
