/** Inhabited rings use existing addresses, with a landscape inside the rim. */
export const RING_HABITATS = Object.freeze({
  ledger: Object.freeze({id:'ledger',name:'Ledger Ring',damaged:false,role:'Working ring habitat',description:'Homes, garden plots and freight yards share the inside of an inhabited ring. Its far districts rise into the sky above the arrival promenade.',activity:'Freight handling, garden maintenance, trade and the charter council.'}),
  'still-berth': Object.freeze({id:'still-berth',name:'Still Berth',damaged:true,role:'Partly evacuated ring habitat',description:'A sheltered district remains inhabited beside sealed and damaged sections. Green repair plots and temporary homes face the broken curve of the far rim.',activity:'Repair work, relief supplies, the port archive and a safe berth for returning crews.'})
});

export const ringHabitatFor = body => RING_HABITATS[typeof body==='string'?body:body?.id] || null;

export function decorateRingHabitats(galaxy) {
  return galaxy.map(system=>({...system,bodies:system.bodies.map(body=>{
    const habitat=ringHabitatFor(body);
    return habitat?{...body,ringHabitat:habitat.id,visualRadius:260,typeLabel:habitat.role,habitatDescription:habitat.description}:body;
  })}));
}

/** A service district on the inner face, rather than a walkable circle icon. */
export function createRingHabitatSurface(location,seed,api) {
  const {makeMap,rect,line,room,point,entity,personEntity,prop,label,addStoryResident,addArchive,addLocalWork,TILE}=api;
  const habitat=ringHabitatFor(location),damaged=habitat.damaged;
  const m=makeMap(64,54,'verdant',location.name,location.id,seed,'station');
  Object.assign(m,{ringHabitat:habitat.id,outdoors:true,placeTypeId:'inhabited-ring',placeTypeName:habitat.role,sizeClass:'metropolitan',stationShape:'landscape-ring',layoutVersion:'ring-habitat-v1',
    palette:{ground:'#334b39',ground2:'#3b5740',floor:'#56615b',floor2:'#4b5753',wall:'#374c54',wallTop:'#667d7c',edge:'#a0b7aa',accent:'#9cbd9d',light:'#d5dab1',path:'#7b8271',water:'#244b56'}});
  rect(m,2,16,60,36,TILE.GROUND);
  rect(m,2,16,60,1,TILE.WALL);rect(m,2,51,60,1,TILE.WALL);
  rect(m,2,16,1,36,TILE.WALL);rect(m,61,16,1,36,TILE.WALL);
  for(const y of [21,32,45])line(m,3,y,60,y,TILE.PATH,2);
  line(m,31,17,31,50,TILE.PATH,3);
  rect(m,22,25,4,23,TILE.WATER);
  for(const y of [32,45])rect(m,21,y,6,2,TILE.METAL);
  room(m,6,25,11,7,10);room(m,45,25,11,7,49);room(m,6,38,12,7,10);
  if(!damaged)room(m,44,38,12,7,48);
  else {
    rect(m,42,38,19,13,TILE.VOID);rect(m,41,37,20,1,TILE.WALL);rect(m,41,37,1,14,TILE.WALL);
    label(m,'SEALED DISTRICT',44,35.7,'#d8aa85');
    for(const x of [43,47,51,55,59])prop(m,'light',x,37,1,.2,'#db9b71',false);
    rect(m,34,39,5,8,TILE.RUBBLE);
  }
  m.exit=point(32,18);m.spawn=point(32,19);
  entity(m,'exit','exit','Docking lift','Return to ship',32,18,'#d7c292',{airlock:true},'The lift descends through the rim to the docking collar.');
  entity(m,'jobs','jobboard',damaged?'Relief and repair board':'Ring work exchange','Jobs & local work',28,22,'#b6ceaa');
  personEntity(m,location,'mechanic','mechanic','mechanic',11,28,'#d7a86b');
  personEntity(m,location,'medic','medic','medic',50,28,'#8fc8bf');
  personEntity(m,location,'bartender','npc','bartender',12,41,'#c7a49b');
  personEntity(m,location,'trader','npc','merchant',43,33,'#7aa9b0');
  personEntity(m,location,'dockworker','npc','dockworker',36,23,'#b49472');
  personEntity(m,location,'visitor-pilot','npc','pilot',29,26,'#8cabc7');
  personEntity(m,location,'visitor-refugee','npc','refugee',28,38,'#b6ab8a');
  personEntity(m,location,'visitor-engineer','npc','engineer',53,34,'#93b5a6');
  personEntity(m,location,'visitor-salvager','npc','salvager',18,46,'#c88c73');
  addStoryResident(m,location,31,33,'#c5ba89');addArchive(m,location,35,33,`${location.name} district archive`);
  addLocalWork(m,{crate:[18,28],delivery:[35,46],repairs:[[9,19],[55,34],[30,48]],samples:[[9,34],[19,19]]});
  for(const [title,x,y] of [['ARRIVAL PROMENADE',26,19.7],['WORKSHOP',8,26],['CLINIC',47,26],['COMMON HOUSE',8,39],['GARDEN WALK',7,33],['FREIGHT YARD',27,44]])label(m,title,x,y);
  for(const [x,y] of [[7,19],[12,19],[17,19],[7,34],[12,34],[17,34],[47,19],[52,19],[57,19]]){
    prop(m,'planter',x,y,3,1,'#70936b',false);prop(m,'plant',x+.7,y-.7,1,1,'#88ac7a',false);
  }
  for(const x of [7,14,49,56])prop(m,'bench',x,23,2,1,'#78938a',false);
  for(const [x,y] of [[10,27],[49,27],[9,40]])prop(m,y===27&&x===49?'bed':'workbench',x,y,2,.7,'#8ba39b',false);
  for(const [x,y] of [[37,42],[37,45],[28,43]])prop(m,'cargo',x,y,1,1,'#ba9973',false);
  if(!damaged){personEntity(m,location,'gardener','npc','settler',50,41,'#a9bb87',{text:'The uphill lights are the other side of the ring. I grew up here. They still make me stop and look.'});label(m,'HOMES',47,39);}
  else personEntity(m,location,'repair-watch','npc','engineer',38,35,'#bbac85',{text:'The far district is sealed. This section has its own water and air. We repair what we can reach safely.'});
  m.serviceAnchors={passage:{x:35,y:24},faction:{x:30,y:35},public:{x:28,y:33},contacts:{x:38,y:30}};
  m.districts=[{id:'arrival',name:'Arrival promenade',x:3,y:17,w:58,h:8},{id:'gardens',name:'Garden walk',x:3,y:32,w:18,h:6},{id:'working',name:damaged?'Repair district':'Freight and homes',x:27,y:38,w:damaged?13:33,h:12}];
  return m;
}

const fill=(ctx,color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};

/** The far inner face climbs above the local horizon; habitation is visible. */
export function drawRingHorizon(ctx,surface,{cameraY=0}={}) {
  if(!surface.ringHabitat)return;
  const damaged=ringHabitatFor(surface.ringHabitat)?.damaged,width=surface.width;
  fill(ctx,'#0e202d',0,0,width,384);
  for(let x=0;x<width;x+=8){
    const u=(x-width/2)/(width/2),rise=Math.max(150,Math.min(340,cameraY+35))+Math.round(u*u*165),depth=28+Math.round(Math.abs(u)*60);
    if(damaged&&u>.35&&u<.63)continue;
    fill(ctx,'#7b9391',x,rise-7,8,depth+15);fill(ctx,'#263e3c',x,rise,8,depth);
    fill(ctx,(x/8)%5<2?'#71865c':'#486d55',x,rise+4,8,depth-7);
    if(x%40===0){fill(ctx,'#b4b898',x,rise+9,5,12);fill(ctx,'#e2d6a4',x+1,rise+12,2,3);}
    if(x%56===0)fill(ctx,'#416877',x,rise+depth-10,8,7);
  }
  for(let i=0;i<90;i++){const x=(i*173+31)%width,y=(i*71+17)%125;fill(ctx,i%7?'#5f828a':'#b7c7bc',x,y,1,1);}
  fill(ctx,'#a1bbb1',0,376,width,3);fill(ctx,'#3d5955',0,379,width,5);
}

export function drawRingHabitat(ctx,x,y,r,time,body) {
  const habitat=ringHabitatFor(body);if(!habitat)return false;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.rotate(-.24);
  const unit=Math.max(1,r/110),steps=176;
  for(let i=0;i<steps;i++){
    const a=i*Math.PI*2/steps;if(habitat.damaged&&a>.5&&a<.78)continue;
    const xx=Math.cos(a)*r*.88,yy=Math.sin(a)*r*.49,near=Math.sin(a)>0;
    fill(ctx,near?'#91a6a1':'#425d64',xx-6*unit,yy-5*unit,12*unit,10*unit);
    fill(ctx,i%9<3?'#7d9368':'#4e7658',xx-4*unit,yy-4*unit,8*unit,5*unit);
    if(i%7===0){fill(ctx,'#bec5b0',xx-2*unit,yy-6*unit,4*unit,5*unit);fill(ctx,'#e7d9a8',xx-unit,yy-5*unit,unit,unit);}
    if(i%19===0)fill(ctx,'#50869a',xx-4*unit,yy-2*unit,8*unit,2*unit);
  }
  fill(ctx,'#6d8790',-8*unit,r*.44,16*unit,17*unit);fill(ctx,'#dec797',-4*unit,r*.51,8*unit,3*unit);
  ctx.restore();return true;
}
