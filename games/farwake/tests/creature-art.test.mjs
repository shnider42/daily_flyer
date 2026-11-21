import test from 'node:test';
import assert from 'node:assert/strict';
import {drawCreatureTell} from '../dist/creature-art.mjs';

class Pixels {
  constructor(){this.points=[];}
  fillRect(x,y,w,h){this.points.push({x,y,w,h});}
}
const open=()=>({cols:30,rows:24,tile:24,tileSize:24,walkable:new Uint8Array(30*24).fill(1)});
const unit=(overrides={})=>({id:'fauna',species:'coilworm',creatureBehavior:'coil-lunge',health:100,x:200,y:200,phase:'windup',windup:.7,aimAngle:0,attackShape:'lunge',attackX:200,attackY:200,attackTargetX:260,attackTargetY:200,attackReach:120,attackWidth:13,...overrides});

test('physical charge warning ends at its locked endpoint and solid cover',()=>{
  const actor=unit(),before=structuredClone(actor),ctx=new Pixels(),layout=open();
  drawCreatureTell(ctx,actor,layout,2);
  assert.ok(ctx.points.length>10);assert.ok(ctx.points.every(p=>p.x<=261),'short coil lunge must not promise its full maximum reach');
  assert.deepEqual(actor,before,'presentation cannot move or retarget an enemy');
  for(let y=0;y<layout.rows;y++)layout.walkable[y*layout.cols+10]=0;
  const blocked=new Pixels();drawCreatureTell(blocked,unit({attackTargetX:320}),layout,2);
  assert.ok(blocked.points.every(p=>p.x<240),'warning does not travel through an opaque wall');
});

test('root strike is shown at its locked patch, while the spore cloud stays around its source',()=>{
  const root=new Pixels(),spore=new Pixels(),layout=open();
  drawCreatureTell(root,unit({species:'root-snare',creatureBehavior:'root-lash',attackShape:'burst',attackRadius:29,attackTargetX:290}),layout);
  drawCreatureTell(spore,unit({species:'sporeback',creatureBehavior:'spore-pulse',attackShape:'cloud',attackRadius:76,attackTargetX:290}),layout);
  const floor=ctx=>ctx.points.filter(p=>p.y>180);
  assert.ok(floor(root).every(p=>p.x>250));
  assert.ok(floor(spore).some(p=>p.x<160));assert.ok(floor(spore).every(p=>p.x<278));
  const hidden=new Pixels();assert.equal(drawCreatureTell(hidden,unit({hidden:true}),layout),false);assert.equal(hidden.points.length,0);
  assert.equal(drawCreatureTell(hidden,unit({quietEarthDormant:true}),layout),false);assert.equal(hidden.points.length,0);
});
