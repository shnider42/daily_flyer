import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatPresentation } from '../dist/combat-presentation.mjs';
import { drawCharacter, drawSurface, generateSurface } from '../dist/surface.mjs';
import { vesselVisualProfile } from '../dist/space-art.mjs';
import { SHIP_CLASSES } from '../dist/fleet.mjs';
import { cabinLayout } from '../dist/interior-layouts.mjs';

const shot = { type:'person-shot', id:'pulse-1', at:900, until:900.22, from:{x:372,y:300}, to:{x:442,y:300}, attackerId:'captain', actorName:'You', targetId:'raider', targetName:'Raider', team:'player', damage:24, hit:true };
const hit = { type:'person-hit', id:'pulse-1:hit', at:900, x:442, y:300, attackerId:'captain', actorName:'You', targetId:'raider', targetName:'Raider', team:'player', damage:24, health:28 };
class RecordingContext {
  constructor(){this.canvas={width:360,height:260};this.rects=[];this.textCalls=[];}
  save(){} restore(){} translate(){} rotate(){} scale(){} clearRect(){} strokeRect(){} setLineDash(){} drawImage(){}
  fillRect(x,y,w,h){this.rects.push({color:this.fillStyle,x,y,w,h});}
  fillText(...args){this.textCalls.push(args);}
  measureText(text){return{width:String(text).length*6};}
}

test('confirmed combat cues survive sparse snapshots, deduplicate and expire on the render clock',()=>{
  const presentation=new CombatPresentation(),before=JSON.stringify(shot);
  assert.equal(presentation.push(shot,10),true);
  assert.equal(presentation.push(shot,10.1),false);
  const effects=presentation.sample(10.2);
  assert.equal(effects.length,1,'a shot is still visible across two 10 Hz snapshot intervals');
  assert.equal(effects[0].kind,'shot');
  assert.ok(Math.abs(effects[0].age-.2)<.0001,'authority time is not used as a render lifetime');
  effects[0].to.x=-999;
  assert.equal(presentation.sample(10.21)[0].to.x,442,'render consumers cannot alter queued events');
  assert.deepEqual(presentation.sample(10.25),[]);
  assert.equal(presentation.push(shot,10.3),false,'a repeated old snapshot cannot replay a shot');
  assert.equal(JSON.stringify(shot),before);
  presentation.reset();assert.equal(presentation.push(shot,20),true);
});

test('only confirmed hits create damage feedback; misses and friendly attribution stay distinct',()=>{
  const presentation=new CombatPresentation();
  presentation.push(shot,0);
  assert.ok(presentation.sample(.1).every(effect=>effect.kind!=='hit'));
  presentation.push(hit,.1);
  presentation.push({type:'boarder-down',id:'pulse-1:down',x:442,y:300,targetId:'raider',actorName:'Mara',team:'friendly'},.1);
  presentation.push({...shot,id:'miss-1',hit:false,damage:0,to:{x:470,y:300}},.2);
  const effects=presentation.sample(.3);
  assert.equal(effects.filter(effect=>effect.kind==='hit').length,1);
  assert.equal(effects.find(effect=>effect.kind==='down').actorName,'Mara');
  assert.equal(effects.find(effect=>effect.id==='miss-1').hit,false);
  assert.equal(presentation.push({type:'person-shot',id:'bad',from:{x:NaN,y:0},to:{x:1,y:2}},.3),false);
  assert.equal(presentation.sample(1).filter(effect=>effect.kind==='down').length,1);
  assert.deepEqual(presentation.sample(2.3),[]);
});

test('the equipped sidearm is visibly held in the independent aim direction and holstered at peace',()=>{
  const person={weapon:'pulse-sidearm',armed:true,facing:'down',aimAngle:0,health:100},right=new RecordingContext(),left=new RecordingContext(),holstered=new RecordingContext();
  drawCharacter(right,0,0,person);
  drawCharacter(left,0,0,{...person,aimAngle:Math.PI});
  drawCharacter(holstered,0,0,{...person,armed:false});
  const barrel=context=>context.rects.filter(r=>r.color==='#b7cbcb');
  assert.ok(barrel(right).length>5&&barrel(right).every(r=>r.x>0));
  assert.ok(barrel(left).length>5&&barrel(left).every(r=>r.x<0));
  assert.equal(barrel(holstered).length,0);
  assert.ok(holstered.rects.some(r=>r.color==='#83d5d0'),'the starter kit remains visible in its holster');
  assert.equal(person.facing,'down','drawing an aim pose does not change movement state');
});

test('boarding renders target assist, damage and attributed casualties with sharp labels and immutable state',()=>{
  const surface=generateSurface({id:'ship:target',vesselId:'target',kind:'ship',shipClass:'sparrow',name:'Copper Finch',ownership:'hostile'},'presentation');
  const person={id:'captain',...surface.spawn,weapon:'pulse-sidearm',health:100,facing:'down'},enemy={id:'raider',name:'Raider',x:442,y:300,team:'hostile',health:28,maxHealth:52,weapon:'pulse-sidearm'};
  const presentation=new CombatPresentation();presentation.push(shot,1);presentation.push(hit,1);presentation.push({...hit,id:'other-deck:hit',boardingId:'other-deck',damage:99},1);
  const ctx=new RecordingContext(),labels=[],before=JSON.stringify({surface,person,enemy});
  const options={width:360,height:260,cameraX:200,cameraY:180,time:1.1,combatTime:900.1,person,boardingActors:[enemy],boarding:{phase:'active'},combat:{active:true,aim:{angle:0,from:shot.from,to:shot.to,targetId:'raider',manual:false}},combatEffects:presentation.sample(1.1),labels};
  drawSurface(ctx,surface,options);
  assert.ok(labels.some(label=>label.kind==='combat-target'&&label.text==='AIM ASSIST'));
  assert.equal(labels.filter(label=>label.kind==='combat-hit'&&label.text==='−24').length,1);
  assert.ok(!labels.some(label=>label.text==='−99'),'events from another boarding instance cannot appear on this deck');
  assert.equal(ctx.textCalls.length,0);
  assert.equal(JSON.stringify({surface,person,enemy}),before);
  presentation.push({type:'boarder-down',id:'down',x:442,y:300,targetId:'raider',actorName:'Mara',team:'friendly'},1.2);
  const wonLabels=[],wonCtx=new RecordingContext();
  drawSurface(wonCtx,surface,{...options,boarding:{phase:'won'},combat:{active:false},boardingActors:[{...enemy,health:0}],combatEffects:presentation.sample(1.3),labels:wonLabels});
  assert.ok(wonCtx.rects.some(rect=>rect.color==='#2c3b42'),'the defeated actor remains on the deck after victory');
  assert.ok(wonLabels.some(label=>label.kind==='combat-down'&&label.text==='DOWN · Mara'));
});

test('vessel identity and livery follow the actual target without altering the shared collision deck',()=>{
  const own=generateSurface({id:'ship:own',vesselId:'own',kind:'ship',name:'Homeward',shipClass:'sparrow'},'hulls');
  const target=generateSurface({id:'ship:target',vesselId:'target',kind:'ship',name:'Copper Finch',shipClass:'sparrow',faction:'cinder',ownership:'hostile'},'hulls');
  assert.equal(target.vesselId,'target');assert.equal(target.vesselName,'Copper Finch');
  assert.notDeepEqual(target.palette,own.palette);
  assert.deepEqual(target.walkable,own.walkable);
  const ctx=new RecordingContext(),labels=[];
  drawSurface(ctx,target,{person:{...target.spawn},width:360,height:260,labels});
  assert.ok(labels.some(label=>label.kind==='vessel'&&label.text==='COPPER FINCH'));
  assert.ok(!labels.some(label=>label.kind==='vessel'&&label.text.includes('HOMEWARD')));
});

test('every exterior uses its actual interior class dimensions even if a saved sprite size was smaller',()=>{
  for(const hull of SHIP_CLASSES){
    const profile=vesselVisualProfile({classId:hull.id,renderLength:18,renderWidth:10});
    assert.equal(profile.renderLength,hull.stats.renderLength);
    assert.equal(profile.renderWidth,hull.stats.renderWidth);
    assert.equal(profile.berths,cabinLayout(profile.shipClass).berths);
  }
  assert.equal(vesselVisualProfile({ship:{interiorClassId:'hauler'}}).shipClass,'hauler');
  assert.equal(vesselVisualProfile({danger:3}).shipClass,'hauler','old enemy snapshots resolve the same class as boarding');
});
