import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.mjs';
import {getShipClass,STARTER_SHIP_IDS,enemyHullProfile,enemyShipState,advanceShip} from '../dist/fleet.mjs';
import {cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
import {getHullSystems} from '../dist/hull-systems.mjs';
import {drawShip,SHIP_VISUALS} from '../dist/space-art.mjs';
import {PORT_KINDS,portProfile,trafficHullWeights,chooseTrafficHull,canHullUsePort} from '../dist/port-traffic.mjs';

const ok=value=>{assert.equal(value.ok,true,value.reason);return value;};
const near=(value,expected)=>assert.ok(Math.abs(value-expected)<1e-7,`${value} != ${expected}`);
function vessel(){
 const game=new Game('dipper-field-support'),hull=getShipClass('dipper');
 game.state.fleet.owned.push(hull.id);game._activateClass(hull.id,true);
 Object.assign(game.state.ship,{x:0,y:600,vx:0,vy:0,angle:0,energy:150});
 game.system.enemies=[];return game;
}

test('Dipper uses existing civilian commissioning gates, exact prices and persistent physical identity',()=>{
 const game=new Game('dipper-commission'),hull=getShipClass('dipper'),port=game.system.bodies.find(body=>body.id==='kettle');
 Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+60});ok(game.dock(port.id));
 game.state.credits=5000;game.state.cargo.ore=30;
 assert.equal(game.classInfo(hull.id).code,'prerequisite');game.state.upgrades.fold_1=1;
 assert.equal(game.classInfo(hull.id).code,'story');game.state.flags.push('first_fold_done');
 const quote=game.classInfo(hull.id);ok(quote);assert.equal(quote.cost,2240);assert.equal(quote.ore,30);
 const identity=game.state.ship.id;ok(game.buyShip(hull.id));
 assert.equal(game.state.credits,2760);assert.equal(game.state.cargo.ore,0);assert.equal(game.state.ship.id,identity);
 assert.equal(game.state.ship.classId,'dipper');assert.equal(game.state.ship.berths,6);assert.equal(STARTER_SHIP_IDS.includes('dipper'),false);
 const restored=Game.fromSave(game.serialize());assert.equal(restored.state.ship.id,identity);assert.equal(restored.state.ship.classId,'dipper');assert.ok(restored.state.fleet.owned.includes('dipper'));
 const captured=enemyShipState({id:'field-lander-prize',...enemyHullProfile('dipper'),hp:25,maxHp:100,disabled:true});
 assert.equal(captured.classId,'dipper');near(captured.hull,hull.stats.maxHull*.25);assert.equal(cabinLayout(captured.classId).berths,6);
});

test('six physical berths share capacity with humans and hired crew, and the aft entry crosses a real decontamination room',()=>{
 const game=vessel(),hull=getShipClass('dipper'),layout=cabinLayout(hull.id),decon=layout.rooms.find(room=>room.id==='decon');
 game.state.ship.humanOccupants=4;game.state.crew=Array.from({length:2},(_,i)=>({id:'crew-'+i,name:'Crew '+i,role:'engineer',health:100,status:'active'}));
 ok(game._canActivateClass(hull));game.state.crew.push({id:'seventh',name:'Seventh person',role:'medic',health:100,status:'active'});
 assert.equal(game._canActivateClass(hull).code,'capacity');
 assert.equal(layout.bunks.length,6);assert.equal(new Set(layout.bunks.map(point=>`${point.x}:${point.y}`)).size,6);
 assert.ok(layout.spawn.y>layout.height*.8);assert.ok(layout.spawn.x>decon.x*layout.tile&&layout.spawn.x<(decon.x+decon.w)*layout.tile);
 assert.ok(layout.spawn.y>decon.y*layout.tile&&layout.spawn.y<(decon.y+decon.h)*layout.tile);
 assert.ok(layout.rooms.some(room=>room.id==='equipment'));assert.ok(layout.rooms.some(room=>room.id==='medical'));
 for(const point of [layout.spawn,...layout.bunks,...Object.values(layout.stations),...layout.crewSpawns])assert.ok(isCabinWalkable(layout,point.x,point.y));
});

test('field support repairs and treats real occupants with the actual charge and cooldown costs',()=>{
 const game=vessel(),ship=game.state.ship;ship.hull-=40;game.state.person.health=40;
 game.state.crew=[{id:'living',name:'Living patient',role:'engineer',health:30,maxHealth:100,status:'injured'},{id:'lost',name:'Lost crew',role:'medic',health:0,maxHealth:100,status:'dead'}];
 ok(game.enterCabin());const charge=ship.energy,hull=ship.hull;ok(game.repairFromStation());
 assert.equal(ship.hull,hull+12);assert.equal(ship.energy,charge-20);assert.equal(game.repairFromStation().code,'cooldown');
 const beforeTreatment=ship.energy;ok(game.medicalFromStation());
 assert.equal(game.state.person.health,58);assert.equal(game.state.crew[0].health,42);assert.equal(game.state.crew[1].health,0);
 assert.equal(ship.energy,beforeTreatment-15);assert.equal(game._crewHealTimer,5);assert.equal(game.medicalFromStation().code,'cooldown');
 const equipment=getHullSystems('dipper');assert.equal(equipment.damageControlMultiplier,1.25);
 assert.ok(equipment.healCrew<getHullSystems('mender').healCrew);assert.ok(equipment.repairHull<getHullSystems('atlas').repairHull);
});

test('the broad field lander has a meaningful handling tradeoff against a courier',()=>{
 const integrate=id=>{const hull=getShipClass(id);let ship={...hull.stats,classId:id,x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,energy:100};for(let i=0;i<60;i++)ship=advanceShip(ship,1/60,{thrust:1,turn:1,flightAssist:false});return ship;};
 const lander=integrate('dipper'),courier=integrate('quill');
 assert.ok(Math.hypot(lander.vx,lander.vy)<Math.hypot(courier.vx,courier.vy));assert.ok(Math.abs(lander.angularVelocity)<Math.abs(courier.angularVelocity));
 assert.ok(getShipClass('dipper').stats.cargoCap>getShipClass('quill').stats.cargoCap);
});

// Baselines captured from 0.22.0 before adding Dipper. Both the ordered weights
// and 128 identity-based draws must remain exact throughout the starting system.
const hearthTraffic={
 hub:'6949dc9c1de5f411b177679361d6d504962d72ab0bad1b66163ec24d72860172',
 military:'7b80d61256df7f739ef593e0d7cb5526fae6cc8a45b74076a04eec131268d166',
 industrial:'157ff30581d80a553fe0b675d8aa10549a7e525f1d5f0af03a217771151d5699',
 research:'cd3258d1c345bc7b781cb47799d829e8d529c20562308529689d4bc3034c9c66',
 regional:'a7e94395d4dca0943bbf182681289207bbcfb3531f6c4387239b94aec8421a70',
 outpost:'e0508f88a36e043aa6fc36bd76c31440bac4ccb8b112e304641605ebc8dcb622'
};
test('Hearth and legacy ports retain their traffic roster while typed research ports elsewhere receive landers',()=>{
 for(const [kind,digest] of Object.entries(hearthTraffic)){
  const profile={kind,...PORT_KINDS[kind],systemId:'hearth',id:'preserved-'+kind};
  const value={weights:trafficHullWeights(profile),choices:Array.from({length:128},(_,i)=>chooseTrafficHull('farwake','existing-traffic-'+i,profile))};
  assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'),digest,kind);
 }
 const system=new Game('dipper-port-catalog').galaxy.find(value=>value.id==='vesper'),body=system.bodies.find(value=>value.id==='listening');
 const research=portProfile(system,body);assert.equal(research.typedCatalog,true);
 assert.ok(trafficHullWeights(research).some(row=>row.classId==='dipper'&&row.role==='survey'&&row.weight>0));
 assert.ok(Array.from({length:256},(_,i)=>chooseTrafficHull('farwake','field-traffic-'+i,research)).includes('dipper'));
 const legacyBody={...body};delete legacyBody.stationTypeId;delete legacyBody.planetTypeId;
 const legacy=portProfile(system,legacyBody);assert.equal(legacy.typedCatalog,false);
 assert.deepEqual(trafficHullWeights(legacy),trafficHullWeights(research).filter(row=>row.classId!=='dipper'),'Untyped released port inputs retain the ordered pre-expansion weights.');
 assert.equal(canHullUsePort('dipper',{kind:'outpost',...PORT_KINDS.outpost}),false,'The broad lander does not fit a serviced small outpost berth.');
 assert.equal(canHullUsePort('dipper',{kind:'regional',...PORT_KINDS.regional}),true);
});

class CaptureCanvas{constructor(width,height){this.width=width;this.height=height;this.ctx=new CaptureContext(this);}getContext(){return this.ctx;}}
class CaptureContext{
 constructor(canvas){this.canvas=canvas;this.images=[];this.fills=[];this.x=0;this.y=0;this.stack=[];}
 save(){this.stack.push([this.x,this.y]);}restore(){[this.x,this.y]=this.stack.pop();}rotate(){}scale(){}clearRect(){}
 translate(x,y){this.x+=x;this.y+=y;}fillRect(x,y,w,h){this.fills.push([this.fillStyle,Math.round(x+this.x),Math.round(y+this.y),Math.round(w),Math.round(h)]);}drawImage(canvas,...args){this.images.push({canvas,args});}
}
function spriteDigest(canvas){const pixels=new Map();for(const[color,x,y,w,h]of canvas.ctx.fills)for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){assert.ok(col>=0&&row>=0&&col<canvas.width&&row<canvas.height,'The pressure hull and landing shoes stay on the sprite.');pixels.set(`${col},${row}`,color);}assert.ok(pixels.size>1500);return createHash('sha256').update(JSON.stringify([...pixels])).digest('hex');}
test('Dipper has a distinct unclipped exterior at deck-matching proportions and reuses its rendering buffers',()=>{
 const prior=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=CaptureCanvas;
 try{
  const hashes=[];for(const id of ['dipper','mender','puffin']){
   const hull=getShipClass(id),canvas=new CaptureCanvas(400,300),ctx=canvas.ctx,profile=SHIP_VISUALS[id];
   assert.equal(profile.length,hull.stats.renderLength);assert.equal(profile.width,hull.stats.renderWidth);
   drawShip(ctx,200,150,0,'#b1c7bb',1,false,0,false,{shipClass:id});const work=ctx.images.at(-1).canvas,sprite=work.ctx.images.at(-1).canvas;hashes.push(spriteDigest(sprite));
   drawShip(ctx,202,150,.1,'#b1c7bb',1,false,0,false,{shipClass:id});assert.equal(ctx.images.at(-1).canvas,work);assert.equal(work.ctx.images.at(-1).canvas,sprite);
  }assert.equal(new Set(hashes).size,3);
 }finally{if(prior===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=prior;}
});
