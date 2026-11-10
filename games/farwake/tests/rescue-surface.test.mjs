import test from 'node:test';
import assert from 'node:assert/strict';
import {CABIN_CLASSES,cabinLayout} from '../dist/interior-layouts.mjs';
import {generateSurface,isWalkable,drawSurface} from '../dist/surface.mjs';

const guest=(id,shipId,point={})=>({id,groupId:'rescue:signal:4',shipId,name:id==='guest-1'?'Ari Pell':'Nemi Voss',color:id==='guest-1'?'#adc8ba':'#c9b69d',health:86,maxHealth:100,status:'aboard',greeting:'I can still hear the air pump. Thank you for stopping.',...point});
const guestsOn=surface=>surface.entities.filter(entity=>entity.data?.rescuePassenger);
function render(surface,{actors=[],person=surface.spawn}={}){
 const pixels=[],labels=[],ctx={canvas:{width:surface.width,height:surface.height},save(){},restore(){},translate(){},scale(){},rotate(){},setLineDash(){},strokeRect(){},fillText(){},measureText(text){return{width:String(text).length*6};},fillRect(x,y,w,h){pixels.push([this.fillStyle,x,y,w,h]);}};
 drawSurface(ctx,surface,{width:surface.width,height:surface.height,zoom:1,time:2,combatTime:2,person:{...person,facing:'up'},boardingActors:actors,labels});
 return{pixels,labels};
}

test('rescued occupants are visible named people on every supported cabin and retain their identity after save round-trip',()=>{
 for(const shipClass of CABIN_CLASSES){
  const id=`owned:${shipClass}`,layout=cabinLayout(shipClass),source={id:`deck:${id}`,vesselId:id,kind:'ship',shipClass,guests:[guest('guest-1',id,layout.crewSpawns[0]),guest('guest-2',id,layout.crewSpawns[1])]};
  const surface=generateSurface(source,'physical-rescue'),people=guestsOn(surface),before=JSON.stringify({source,surface});
  assert.equal(people.length,2,shipClass);
  assert.deepEqual(people.map(person=>person.name),['Ari Pell','Nemi Voss']);
  assert.deepEqual(people.map(person=>person.data.guestId),['guest-1','guest-2']);
  assert.ok(people.every(person=>person.type==='npc'&&person.data.roleLabel==='Rescued passenger'&&person.data.shipId===id&&person.text===source.guests[0].greeting));
  for(const person of people){
   assert.ok(isWalkable(surface,person.x,person.y),`${shipClass}: guest stands on reachable floor`);
   assert.ok(surface.entities.every(other=>other===person||Math.hypot(person.x-other.x,person.y-other.y)>=20),`${shipClass}: guest does not overlap crew or a control`);
  }
  const result=render(surface);
  assert.ok(result.pixels.some(([color])=>color==='#adc8ba'));
  assert.ok(result.pixels.some(([color])=>color==='#c9b69d'));
  assert.equal(JSON.stringify({source,surface}),before,'rendering must not mutate the passenger record');
  assert.deepEqual(guestsOn(generateSurface(JSON.parse(JSON.stringify(source)),'physical-rescue')),people);
 }
});

test('passengers belong to their rescued hull and never leak into another ship or port',()=>{
 const own=guest('guest-1','own-hull'),other=guest('guest-2','other-hull'),source={id:'deck:own',vesselId:'own-hull',kind:'ship',shipClass:'sparrow',guests:[own,other,{...own,id:'dead',health:0,status:'dead'}]};
 const surface=generateSurface(source,'hull-identity');
 assert.deepEqual(guestsOn(surface).map(person=>person.data.guestId),['guest-1']);
 assert.equal(guestsOn(generateSurface({...source,vesselId:'friend-hull'},'hull-identity')).length,0);
 assert.equal(guestsOn(generateSurface({id:'kettle',guests:[own]},'hull-identity')).length,0);
 assert.equal(guestsOn(generateSurface({...source,guests:[{...own,status:'disembarked'}]},'hull-identity')).length,0);
});

test('revealed passengers render exactly once as the same physical boarding actor',()=>{
 const id='own-hull',source={id:'deck:own',vesselId:id,kind:'ship',shipClass:'sparrow',guests:[guest('guest-1',id,cabinLayout('sparrow').crewSpawns[0])]},surface=generateSurface(source,'one-person'),person=guestsOn(surface)[0];
 const hostile={id:person.data.guestId,rescueGuestId:person.data.guestId,name:person.name,x:person.x,y:person.y,color:person.color,health:52,maxHealth:52,team:'hostile',facing:'down'};
 const active=render(surface,{actors:[hostile]}),withoutStatic=render(generateSurface({...source,guests:[]},'one-person'),{actors:[hostile]});
 assert.deepEqual(active.pixels,withoutStatic.pixels,'the old neutral sprite must not remain beneath the armed occupant');
 assert.equal(active.labels.filter(label=>label.text===person.name).length,1);
 assert.equal(active.labels.find(label=>label.text===person.name).kind,'hostile');
 const down={...hostile,health:0},downView=render(surface,{actors:[down]}),downOnly=render(generateSurface({...source,guests:[]},'one-person'),{actors:[down]});
 assert.deepEqual(downView.pixels,downOnly.pixels,'a stale neutral view must not revive a defeated actor');
 assert.equal(downView.labels.filter(label=>label.text===person.name).length,0);
});

test('guest placement leaves specialist positions and cabin controls available',()=>{
 const layout=cabinLayout('sparrow'),id='occupied-hull',crew=[{id:'engineer',name:'Anik',role:'engineer',health:100,maxHealth:100}];
 const surface=generateSurface({id:'deck:occupied',vesselId:id,kind:'ship',shipClass:'sparrow',crew,guests:[guest('guest-1',id,layout.crewSpawns[0]),guest('guest-2',id,layout.stations.helm)]},'space-for-people');
 const people=guestsOn(surface);assert.equal(people.length,2);
 assert.deepEqual(surface.entities.find(entity=>entity.data.crewId==='engineer').x,layout.crewSpawns[0].x);
 for(const person of people){
  assert.ok(isWalkable(surface,person.x,person.y));
  assert.ok(surface.entities.every(other=>other===person||Math.hypot(person.x-other.x,person.y-other.y)>=20));
 }
});
