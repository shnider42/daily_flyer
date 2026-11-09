import test from 'node:test';
import assert from 'node:assert/strict';
import {GridironCamera,cameraPreferences,gridironBall,edgeMarker,minimapLayout} from '../../daily_flyer/themes/pocket_gridiron_assets/camera.js';

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

test('automatic focus starts centered without an arbitrary upfield offset',()=>{
 for(const cameraFocus of ['ball','player','play']){
  const c=new GridironCamera(),f=c.frame(base({settings:settings({cameraFocus})})),p=f.screenPoint({x:26.5,y:50});
  assert.ok(Math.abs(p.x-f.width/2)<.00001);
  assert.ok(Math.abs(p.y-f.height/2)<.00001);
 }
});

test('dragged camera stays pinned through action, a new play, possession reset and resize',()=>{
 const c=new GridironCamera(),match={},input=base({match,scene:'first-play'}),first=c.frame(input),target=minimapLayout(first).toWorld({x:.5,y:.4});
 c.panTo(target,match);
 const pinned=c.frame({...input,ball:{x:2,y:100},player:{x:2,y:100}});
 assert.equal(pinned.manual,true);assert.deepEqual(pinned.center,target);
 for(let i=0;i<90;i++)assert.deepEqual(c.frame({...input,ball:{x:50,y:-8}}).center,target);
 c.reset();
 const resized=c.frame({...input,scene:'next-play',height:350,ball:{x:50,y:-8}});
 assert.equal(resized.manual,true);assert.deepEqual(resized.center,target);
});

test('manual view survives new duel snapshot objects when the match identity is stable',()=>{
 const c=new GridironCamera(),match={},first=c.frame(base({match,scene:{tick:1}})),target=minimapLayout(first).toWorld({x:.45,y:.45});
 c.panTo(target,match);
 for(let tick=2;tick<20;tick++){
  const frame=c.frame(base({match,scene:{tick},ball:{x:45,y:90}}));
  assert.equal(frame.manual,true);assert.deepEqual(frame.center,target);
 }
});

test('live and replay manual positions are independent and never leak into a new match',()=>{
 const live=new GridironCamera(),replay=new GridironCamera(),match={},input=base({match}),first=live.frame(input),target=minimapLayout(first).toWorld({x:.5,y:.4});
 live.panTo(target,match);
 const recorded=replay.frame({...input,scene:'replay-clip',ball:{x:2,y:100}});
 assert.equal(recorded.manual,false);
 replay.panTo(minimapLayout(recorded).toWorld({x:.2,y:.65}),match);replay.frame({...input,scene:'replay-clip'});replay.resumeFollow();
 const stillPinned=live.frame(input);assert.equal(stillPinned.manual,true);assert.deepEqual(stillPinned.center,target);
 const newMatch=live.frame({...input,match:{},scene:'new-match',ball:{x:45,y:90},player:{x:45,y:90}});
 assert.equal(newMatch.manual,false);assert.notDeepEqual(newMatch.center,target);
});

test('Follow clears the pin and immediately recenters on the chosen subject',()=>{
 const c=new GridironCamera(),input=base({height:300,settings:settings({cameraFocus:'ball',cameraZoom:2})}),first=c.frame(input);
 c.panTo(minimapLayout(first).toWorld({x:.3,y:.8}));c.frame(input);c.resumeFollow();
 const resumed=c.frame({...input,ball:{x:30,y:60}}),q=resumed.screenPoint({x:30,y:60});
 assert.equal(resumed.manual,false);
 assert.ok(Math.abs(q.x-resumed.width/2)<.00001);assert.ok(Math.abs(q.y-resumed.height/2)<.00001);
});

test('minimap maps the top to the far endzone and bottom to the near endzone without mirroring',()=>{
 const f=new GridironCamera().frame(base()),m=minimapLayout(f);
 for(const point of [{x:0,y:110},{x:53.333333,y:-10},{x:12,y:65}]){
  const canonical=m.toWorld(m.toMap(point)),expected=f.worldPoint(point);
  assert.ok(Math.abs(canonical.x-expected.x)<.0001);assert.ok(Math.abs(canonical.y-expected.y)<.0001);
 }
 assert.deepEqual(m.toMap({x:0,y:110}),{x:0,y:0});
 assert.deepEqual(m.toMap({x:53.333333,y:-10}),{x:1,y:1});
});

test('manual camera clamps at field edges and Fit sidelines retains both boundaries',()=>{
 const c=new GridironCamera(),input=base({height:280,settings:settings({cameraZoom:2.2})});c.frame(input);c.panTo({x:-900,y:9000});
 const edge=c.frame(input);assert.equal(edge.center.x,edge.viewWidth/2);assert.equal(edge.center.y,edge.worldHeight-edge.viewHeight/2);
 const fit=c.frame({...input,settings:settings({cameraMode:'fit'})});
 for(let i=0;i<240;i++)c.frame({...input,settings:settings({cameraMode:'fit'})});
 const settled=c.frame({...input,settings:settings({cameraMode:'fit'})});
 assert.ok(Math.abs(settled.center.x-180)<.01);
 assert.ok(settled.screenPoint({x:0,y:50}).x>=0);assert.ok(settled.screenPoint({x:53.333333,y:50}).x<=360);
 assert.equal(fit.manual,true);
});

test('a stored manual target remains valid when Full field switches back to Follow',()=>{
 const c=new GridironCamera(),input=base(),f=c.frame(input),target=minimapLayout(f).toWorld({x:.5,y:.4});c.panTo(target);
 const full=c.frame({...input,settings:settings({cameraMode:'full'})});assert.equal(full.center.x,180);
 c.reset();const follow=c.frame(input);assert.deepEqual(follow.center,target);assert.equal(follow.manual,true);
});

test('a new replay clip resumes following while leaving the live camera pinned',()=>{
 const live=new GridironCamera(),replay=new GridironCamera(),liveInput=base({match:'match'}),first=live.frame(liveInput),liveTarget=minimapLayout(first).toWorld({x:.5,y:.4});
 live.panTo(liveTarget,'match');
 const clip={},recorded=base({scene:clip,match:clip}),initial=replay.frame(recorded),replayTarget=minimapLayout(initial).toWorld({x:.6,y:.6});
 replay.panTo(replayTarget,clip);
 for(let i=0;i<3;i++){const f=replay.frame({...recorded,ball:{x:10+i,y:20+i}});assert.equal(f.manual,true);assert.deepEqual(f.center,replayTarget);}
 const nextClip={},next=replay.frame({...recorded,scene:nextClip,match:nextClip,ball:{x:26,y:70},player:{x:26,y:70}});
 assert.equal(next.manual,false);assert.notDeepEqual(next.center,replayTarget);
 const resumedLive=live.frame(liveInput);assert.equal(resumedLive.manual,true);assert.deepEqual(resumedLive.center,liveTarget);
});
