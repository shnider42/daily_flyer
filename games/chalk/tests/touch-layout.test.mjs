import test from 'node:test';
import assert from 'node:assert/strict';
import {touchControlLayout} from '../public/touch-layout.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<.005,`${a} differs from ${b}`);
const rect=(item,width)=>({x:item.left??width-item.right-(item.width??item.padWidth),y:item.bottom,w:item.width??item.padWidth,h:item.height??item.padHeight});
const overlaps=(a,b)=>a.x+a.w>b.x+.002&&b.x+b.w>a.x+.002&&a.y+a.h>b.y+.002&&b.y+b.h>a.y+.002;
function assertLayout(options){
  const layout=touchControlLayout(options),width=options.width;
  const items=['move','aim','dock','moveActions','aimStatus','assist'];
  const rects=items.map(key=>[key,rect(layout[key],width)]);
  for(const [name,r] of rects){
    assert.ok(Object.values(r).every(Number.isFinite),`${name} has finite geometry`);
    assert.ok(r.x>=options.left-.002,`${name} clears left safe area`);
    assert.ok(r.x+r.w<=width-options.right+.002,`${name} clears right safe area`);
    assert.ok(r.y>=options.bottom-.002,`${name} clears bottom safe area`);
    assert.ok(r.w>0&&r.h>0,`${name} has positive area`);
  }
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    assert.equal(overlaps(rects[i][1],rects[j][1]),false,`${JSON.stringify(options)}: ${rects[i][0]} overlaps ${rects[j][0]}`);
  }
  for(const key of ['move','aim']){
    const s=layout[key];
    assert.ok(s.padWidth+.002>=Math.max(s.size,.68*s.size+s.knob),`${key} pickup area contains full knob travel`);
  }
  return layout;
}

test('default asymmetric controls retain 80px movement and 150px aiming on standard portrait phones',()=>{
  for(const width of [375,390,430]){
    const layout=assertLayout({width,height:844,left:8,right:8,bottom:14});
    near(layout.move.size,80);near(layout.aim.size,150);
    near(layout.move.knob,32);near(layout.aim.knob,56);
    near(layout.move.padWidth,104);near(layout.aim.padWidth,174);
    assert.equal(layout.dock.vertical,true);assert.equal(layout.fitted,false);
    near(layout.aim.size*.34*.88,44.88);
    near(layout.controlHeight,206);
  }
});

test('independent size extremes fit narrow portraits without overlapping direct controls',()=>{
  for(const width of [320,375,390,430])for(const moveScale of [.6,.8,1.2])for(const aimScale of [1,1.5,2]){
    const options={width,height:667,left:8,right:8,bottom:34,moveScale,aimScale};
    const layout=assertLayout(options);
    assert.ok(layout.move.size<=moveScale*100+.002);
    assert.ok(layout.aim.size<=aimScale*100+.002);
    assert.deepEqual(options,{width,height:667,left:8,right:8,bottom:34,moveScale,aimScale},'preferences and viewport input are never mutated');
    const tray=rect(layout.tray,width);
    for(const key of ['move','aim','dock','moveActions','aimStatus','assist']){
      assert.equal(overlaps({...tray,h:layout.tray.maxHeight},rect(layout[key],width)),false,`portrait tray clears ${key}`);
    }
  }
  const narrow=touchControlLayout({width:320,height:568});
  near(narrow.move.size,80);assert.ok(narrow.aim.size>100&&narrow.aim.size<150);assert.equal(narrow.fitted,true);
});

test('notched landscape preserves large right stick and bounds both slider extremes',()=>{
  for(const width of [640,812,844,932])for(const moveScale of [.6,.8,1.2])for(const aimScale of [1,1.5,2]){
    const layout=assertLayout({width,height:375,left:44,right:44,bottom:21,landscape:true,moveScale,aimScale});
    assert.equal(layout.dock.vertical,false);
    assert.ok(layout.aim.size<=375*.44+.002);
    const tray={...rect(layout.tray,width),h:layout.tray.maxHeight};
    for(const key of ['move','aim','dock','moveActions','aimStatus'])assert.equal(overlaps(tray,rect(layout[key],width)),false,`landscape tray clears ${key}`);
  }
  const standard=touchControlLayout({width:812,height:375,left:44,right:44,bottom:21,landscape:true});
  near(standard.aim.size,150);near(standard.move.size,80);
});

test('malformed geometry is finite and responsive fitting does not erase preferences',()=>{
  for(const options of [{},{width:NaN,height:Infinity,moveScale:NaN,aimScale:-10},{width:320,height:568,left:44,right:44},{width:160,height:180,left:80,right:80,bottom:100}]){
    const result=touchControlLayout(options);
    for(const item of Object.values(result))if(item&&typeof item==='object')for(const value of Object.values(item))if(typeof value==='number')assert.ok(Number.isFinite(value));
    assert.ok(result.move.size>0);assert.ok(result.aim.size>0);
  }
  const preferences={moveScale:.8,aimScale:2};
  const narrow=touchControlLayout({...preferences,width:320,height:568});
  const wide=touchControlLayout({...preferences,width:932,height:430,landscape:true});
  assert.ok(wide.aim.size>narrow.aim.size);assert.deepEqual(preferences,{moveScale:.8,aimScale:2});
});
