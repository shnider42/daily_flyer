import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCharacter, drawContactPortrait, drawSurface, TILE } from '../dist/surface.mjs';

const species = ['human','choral','vaeli','keth','oru'];
class PixelCanvas {
  constructor(width=80,height=80){this.width=width;this.height=height;this.ctx=new PixelContext(this);}
  getContext(){return this.ctx;}
}
class PixelContext {
  constructor(canvas){this.canvas=canvas;this.pixels=[];this.stack=[];this.transform=[1,1,0,0];this.globalAlpha=1;}
  save(){this.stack.push({transform:[...this.transform],fillStyle:this.fillStyle,globalAlpha:this.globalAlpha});}
  restore(){Object.assign(this,this.stack.pop());}
  translate(x,y){this.transform[2]+=x*this.transform[0];this.transform[3]+=y*this.transform[1];}
  scale(x,y){this.transform[0]*=x;this.transform[1]*=y;}
  setTransform(a,b,c,d,e,f){assert.equal(b,0);assert.equal(c,0);this.transform=[a,d,e,f];}
  fillRect(x,y,w,h){
    assert.ok([x,y,w,h].every(Number.isInteger),'all source primitives lie on the pixel grid');
    assert.ok(w>0&&h>0,'pixel primitives have a positive extent');
    const [sx,sy,tx,ty]=this.transform;this.pixels.push({color:this.fillStyle,x:x*sx+tx,y:y*sy+ty,w:w*sx,h:h*sy});
  }
  strokeRect(){}setLineDash(){}fillText(){}clearRect(){}drawImage(){}
  measureText(value){return{width:String(value).length*6};}
}
const sprite = options => {const ctx=new PixelCanvas().ctx;drawCharacter(ctx,40,44,{id:'test-person',...options});assert.equal(ctx.stack.length,0);return ctx.pixels;};
const mask = pixels => {
  const seen=new Set();for(const {x,y,w,h,color} of pixels){if(['#112931','#081923'].includes(color))continue;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)seen.add(`${xx},${yy}`);}
  return [...seen].sort().join('|');
};

test('every people species has a distinct silhouette and an unclipped pixel portrait',()=>{
  const silhouettes=[];
  for(const id of species){
    silhouettes.push(mask(sprite({species:id,color:'#8ca6ac'})));
    const ctx=new PixelCanvas(32,40).ctx;drawContactPortrait(ctx,{id:'test-person',species:id,color:'#8ca6ac'});
    for(const pixel of ctx.pixels){assert.ok(pixel.x>=0&&pixel.y>=0,`${id} starts inside its portrait`);assert.ok(pixel.x+pixel.w<=32&&pixel.y+pixel.h<=40,`${id} fits the portrait`);}
    assert.equal(ctx.stack.length,0);
  }
  assert.equal(new Set(silhouettes).size,species.length,'nonhuman residents are recognizable by outline, not just a palette swap');
});

test('known people keep their ordinary, moving, resting, sleeping and casualty states distinct',()=>{
  for(const id of species){
    const options={species:id,time:.12},idle=sprite(options),moving=sprite({...options,moving:true}),resting=sprite({...options,resting:true}),sleeping=sprite({...options,asleep:true}),dead=sprite({...options,health:0});
    assert.notDeepEqual(moving,idle,`${id} walks`);assert.notDeepEqual(resting,idle,`${id} sits`);assert.notDeepEqual(sleeping,dead,`${id} sleeping is not a casualty`);
    assert.ok(Math.min(...dead.map(p=>p.y))>Math.min(...idle.map(p=>p.y))+10,`${id} casualty lies on the deck`);
    const views=['left','right','up','down'].map(facing=>JSON.stringify(sprite({...options,facing})));
    assert.equal(new Set(views).size,4,`${id} facing is visible`);
    const hurt=sprite({...options,hurtUntil:1});assert.ok(hurt.some(p=>p.color==='#e7c4b2'),`${id} shows damage`);
  }
});

test('nonhuman workers and boarders keep cargo, holstered weapons, visible shots and helmets',()=>{
  for(const id of species){
    const base={species:id,time:0,weapon:{id:'pulse'},aimAngle:0};
    const holstered=sprite({...base,armed:false}),armed=sprite({...base,armed:true}),firing=sprite({...base,armed:true,firing:true}),carried=sprite({...base,armed:false,carried:true}),helmet=sprite({...base,armed:false,helmet:true});
    assert.ok(holstered.some(p=>p.color==='#83d5d0'),`${id} shows a holstered weapon`);
    assert.ok(armed.some(p=>p.color==='#b7cbcb'),`${id} shows an aimed barrel`);
    assert.ok(firing.some(p=>p.color==='#fff1c6'),`${id} shows a muzzle flash`);
    assert.ok(!holstered.some(p=>p.color==='#fff1c6'),`${id} does not fire while holstered`);
    assert.ok(carried.some(p=>p.color==='#c2a572'),`${id} carries the physical parcel`);
    assert.ok(helmet.some(p=>p.color==='#91c8ce'),`${id} shows protective headgear`);
    assert.notDeepEqual(helmet,holstered);
  }
});

test('unknown species safely retain human rendering and never mutate saved identities',()=>{
  const human=sprite({species:'human'});
  for(const invalid of ['invented','skitter','stoneback','constructor',null,{},[]])assert.deepEqual(sprite({species:invalid}),human);
  for(const id of species){
    const options={id:'one-context',identityId:'same-person',name:'Same resident',species:id,color:'#86a5a2',facing:'left',health:61,time:2,moving:true,carried:true,weapon:{id:'pulse'}};
    const before=structuredClone(options);sprite(options);assert.deepEqual(options,before);
    if(id!=='human'){
      assert.deepEqual(sprite(options),sprite({...options,id:'another-context'}),'the same identity keeps its natural markings after boarding');
      assert.deepEqual(sprite(options),sprite({...options,id:'boarding:some-vessel:crew:same-person',identityId:undefined,crewId:'same-person'}),'combat projection IDs cannot recolor a crew member');
      assert.deepEqual(sprite(options),sprite({...options,id:'rescue:hijack:projection',identityId:undefined,rescueGuestId:'same-person'}),'a rescued passenger retains their markings if they become hostile');
    }
  }
});

test('world actor rendering recognizes sentient species separately from hostile wildlife',()=>{
  const surface={id:'render-room',name:'Render room',kind:'ship',biome:'ship',width:240,height:192,cols:10,rows:8,tileSize:24,tiles:Array.from({length:8},()=>Array(10).fill(TILE.FLOOR)),entities:[],solids:[],decor:[],spawn:{x:30,y:100},flags:[]};
  const render=id=>{
    const ctx=new PixelCanvas(240,192).ctx,actor={id:'subject',species:id,x:140,y:110,health:60,maxHealth:60,team:'hostile',name:'Test boarder',facing:'right',weapon:{id:'pulse'},aimAngle:0};
    const options={person:{...surface.spawn},actors:[actor],boardingActors:[actor],time:0,combatTime:0,width:240,height:192,cameraX:0,cameraY:0,zoom:1,labels:[]},before=JSON.stringify({surface,actor});
    drawSurface(ctx,surface,options);assert.equal(JSON.stringify({surface,actor}),before);assert.equal(ctx.imageSmoothingEnabled,false);return ctx.pixels;
  };
  for(const id of [...species,'unknown-future-person'])assert.ok(render(id).some(p=>p.color==='#b7cbcb'),`${id} keeps visible firearm controls`);
  for(const id of ['skitter','stoneback'])assert.ok(!render(id).some(p=>p.color==='#b7cbcb'),`${id} remains wildlife`);
});
