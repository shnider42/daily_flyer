import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../public/renderer.mjs';
import { LOCATIONS } from '../public/world.mjs';

function canvas(width=900,height=650) {
  const calls=[];
  const context=new Proxy({}, {get(object,key){
    if(key==='measureText')return value=>({width:String(value).length*7});
    if(key==='createRadialGradient'||key==='createLinearGradient')return ()=>({addColorStop(){}});
    if(key in object)return object[key];
    return (...args)=>calls.push({method:key,args,fill:object.fillStyle,stroke:object.strokeStyle});
  },set(object,key,value){object[key]=value;return true;}});
  return {width,height,calls,context,getContext:()=>context,getBoundingClientRect:()=>({width,height})};
}
const member=(id,name,extra={})=>({id,name,x:740,y:1148,angle:0,hp:100,interior:null,vehicleId:null,connected:true,color:'#91e3bc',...extra});
function game(extra={}) {
  const player=member('self','You');
  return {player,coop:{playerId:'self'},crew:[player],progress:{unlocked:0},wanted:{stars:0},vehicles:[],npcs:[],police:[],bullets:[],effects:[],phase:'playing',dayTime:16,time:10,...extra};
}
function withRenderer(run) {
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>canvas()};
  try{const output=canvas(),renderer=new Renderer(output);renderer._terrain=()=>{};return run(renderer,output);}
  finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
}

test('a city view shows only outdoor crew bodies and does not duplicate the local player',()=>withRenderer((renderer,output)=>{
  const g=game();
  g.crew=[g.player,member('street','Street friend'),member('cafe','Cafe friend',{interior:'cafe'}),member('passenger','Rider',{vehicleId:'car',seat:'passenger'})];
  const people=[];renderer._person=(c,actor,state,type)=>people.push({id:actor.id,type});
  renderer.render(g);
  assert.deepEqual(people.map(p=>p.id).sort(),['self','street']);
  assert.equal(people.find(p=>p.id==='street').type,'crew');
  const names=output.calls.filter(call=>call.method==='fillText').map(call=>call.args[0]);
  assert.ok(names.includes('Street friend'));
  assert.ok(!names.includes('Cafe friend'));
}));

test('coincident coordinates in different interiors never reveal another building’s crew',()=>withRenderer((renderer,output)=>{
  const player=member('self','You',{x:320,y:300,interior:'cafe'}),g=game({player});
  g.crew=[player,member('same','Same cafe',{x:320,y:300,interior:'cafe'}),member('other','Other clinic',{x:320,y:300,interior:'clinic'}),member('outside','Outside',{x:320,y:300})];
  const people=[];renderer._person=(c,actor,state,type)=>people.push({id:actor.id,type});
  renderer.render(g);
  assert.deepEqual(people.filter(p=>p.type==='player'||p.type==='crew').map(p=>p.id).sort(),['same','self']);
  const names=output.calls.filter(call=>call.method==='fillText').map(call=>call.args[0]);
  assert.ok(names.includes('Same cafe'));
  assert.ok(!names.includes('Other clinic'));
  assert.ok(!names.includes('Outside'));
}));

test('a shared vehicle shows distinct occupied seats instead of passenger bodies on the road',()=>withRenderer((renderer,output)=>{
  const g=game();g.crew=[g.player,member('driver','Chris',{vehicleId:'shared',seat:'driver',color:'#88bbdd'}),member('rider','Maya',{vehicleId:'shared',seat:'passenger',color:'#eec178'})];
  g.vehicles=[{id:'shared',type:'sedan',x:740,y:1148,angle:0,hp:100}];
  const people=[];renderer._person=(c,actor)=>people.push(actor.id);
  renderer.render(g);
  assert.deepEqual(people,['self']);
  for(const color of ['#88bbdd','#eec178'])assert.ok(output.calls.some(call=>call.method==='arc'&&call.fill===color&&call.args[2]===3));
  const names=output.calls.filter(call=>call.method==='fillText').map(call=>call.args[0]);
  assert.ok(names.includes('Chris +1'));
  assert.ok(names.includes('2 crewmates aboard'));
}));

test('city maps locate indoor crew at their own building doors, never at room coordinates',()=>withRenderer(renderer=>{
  const g=game();g.crew=[g.player,member('cafe','Cafe friend',{x:320,y:300,interior:'cafe',color:'#88bbdd'}),member('clinic','Clinic friend',{x:320,y:300,interior:'clinic',color:'#eec178'}),member('unknown','Unknown room',{x:320,y:300,interior:'missing'})];
  const output=canvas(900,600),transform=renderer.drawMap(output,g,{full:true});
  for(const [location,color] of [['cafe','#88bbdd'],['clinic','#eec178']]){
    const marker=output.calls.find(call=>call.method==='arc'&&call.fill===color);
    assert.ok(marker,location+' crew marker exists');
    assert.deepEqual(marker.args.slice(0,2),[LOCATIONS[location].door.x,LOCATIONS[location].door.y]);
  }
  const labels=output.calls.filter(call=>call.method==='fillText');
  const cafeLabel=labels.find(call=>call.args[0]==='Cafe friend · inside');
  assert.equal(cafeLabel.args[1],transform.ox+LOCATIONS.cafe.door.x*transform.scale);
  assert.ok(!labels.some(call=>String(call.args[0]).includes('Unknown room')));
}));

test('shared pings stay in their own scene and expired pings disappear',()=>withRenderer((renderer,output)=>{
  const player=member('self','You',{x:320,y:300,interior:'cafe'}),g=game({player});
  g.pings=[
    {id:'valid',name:'Meet',x:330,y:280,interior:'cafe',color:'#88bbdd',expiresAt:20},
    {id:'other',name:'Other',x:330,y:280,interior:'clinic',color:'#eec178',expiresAt:20},
    {id:'expired',name:'Expired',x:330,y:280,interior:'cafe',color:'#dd7799',expiresAt:9}
  ];
  renderer.render(g);
  const names=output.calls.filter(call=>call.method==='fillText').map(call=>call.args[0]);
  assert.ok(names.includes('Meet · meet here'));
  assert.ok(!names.includes('Other · meet here'));
  assert.ok(!names.includes('Expired · meet here'));
}));
