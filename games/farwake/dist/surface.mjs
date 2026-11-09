/**
 * Farwake person mode. Surface positions and dimensions are WORLD PIXELS.
 * cols/rows are tile counts; one tile is 24 pixels. Person x/y is their feet.
 * generateSurface(location, seed, flags) is deterministic and JSON serializable.
 * movePerson mutates and returns person. dt is seconds, input is a -1..1 vector.
 * drawSurface draws only the world and returns its camera transform and zoom.
 */
import {beginPixelFrame} from './render-viewport.mjs';
import {surfaceCamera,surfaceWorldToCanvas} from './camera-view.mjs';
import {DIALOGUE,NAMED_SYSTEMS,LORE} from './content.mjs';
import {cabinLayout,resolveCabinClass} from './interior-layouts.mjs';
import {labelSink,pixelLine,pixelRing} from './pixel-art.mjs';
import {sidearmAim,facingAngle} from './combat.mjs';
import {explorationSites} from './exploration.mjs';
import {appearancePalette} from './character.mjs';
export {cabinLayout,resolveCabinClass} from './interior-layouts.mjs';

export const TILE = Object.freeze({VOID:0,FLOOR:1,WALL:2,PATH:3,GROUND:4,WATER:5,PAD:6,METAL:7,RUBBLE:8,GRATE:9});
const T=24;
const BLOCKED=new Set([TILE.VOID,TILE.WALL,TILE.WATER]);
const PALETTES={
 station:{ground:'#172c35',floor:'#203c43',floor2:'#1c353e',edge:'#375059',wall:'#1a2c35',wallTop:'#577079',path:'#304952',light:'#edc584',accent:'#69b3ad'},
 verdant:{ground:'#244439',ground2:'#294b3c',floor:'#4e5651',floor2:'#48504b',edge:'#879080',wall:'#384b47',wallTop:'#7d9688',path:'#6b6250',water:'#173f50',light:'#f6d59a',accent:'#a0c56d'},
 temperate:{ground:'#244439',ground2:'#294b3c',floor:'#4e5651',floor2:'#48504b',edge:'#879080',wall:'#384b47',wallTop:'#7d9688',path:'#6b6250',water:'#173f50',light:'#f6d59a',accent:'#a0c56d'},
 arid:{ground:'#755842',ground2:'#7e6147',floor:'#756856',floor2:'#6a5e4e',edge:'#ab9476',wall:'#5f4d42',wallTop:'#b29875',path:'#967853',water:'#294c58',light:'#f2d494',accent:'#e2ba74'},
 desert:{ground:'#755842',ground2:'#7e6147',floor:'#756856',floor2:'#6a5e4e',edge:'#ab9476',wall:'#5f4d42',wallTop:'#b29875',path:'#967853',water:'#294c58',light:'#f2d494',accent:'#e2ba74'},
 ice:{ground:'#526e79',ground2:'#5c7c86',floor:'#425c65',floor2:'#3c545f',edge:'#84a6aa',wall:'#314c5b',wallTop:'#9bbdc4',path:'#6d8d94',water:'#254a5e',light:'#def5e5',accent:'#96d7da'},
 frozen:{ground:'#526e79',ground2:'#5c7c86',floor:'#425c65',floor2:'#3c545f',edge:'#84a6aa',wall:'#314c5b',wallTop:'#9bbdc4',path:'#6d8d94',water:'#254a5e',light:'#def5e5',accent:'#96d7da'},
 volcanic:{ground:'#3f3d43',ground2:'#484047',floor:'#4e4549',floor2:'#453c44',edge:'#897379',wall:'#322d38',wallTop:'#8a6a68',path:'#655154',water:'#a65034',light:'#efb480',accent:'#e38761'},
 ash:{ground:'#3f3d43',ground2:'#484047',floor:'#4e4549',floor2:'#453c44',edge:'#897379',wall:'#322d38',wallTop:'#8a6a68',path:'#655154',water:'#a65034',light:'#efb480',accent:'#e38761'},
 ocean:{ground:'#3b5a4e',ground2:'#456453',floor:'#54625e',floor2:'#4a5856',edge:'#8ba195',wall:'#38554f',wallTop:'#86a999',path:'#8a8065',water:'#20546a',light:'#e2dca2',accent:'#80c1b5'},
 derelict:{ground:'#15252f',floor:'#26353d',floor2:'#21303a',edge:'#44565d',wall:'#18212d',wallTop:'#51616a',path:'#38424a',light:'#e58a6c',accent:'#ae7b69'},
 barren:{ground:'#4c5159',ground2:'#545963',floor:'#626b71',floor2:'#566169',edge:'#919b9c',wall:'#343d48',wallTop:'#8d979b',path:'#757c7b',water:'#273d4b',light:'#d5c69b',accent:'#a8b4ab'},
 cave:{ground:'#292b30',ground2:'#313137',floor:'#34363b',floor2:'#303238',edge:'#55595d',wall:'#24282e',wallTop:'#676b6b',path:'#56534c',water:'#254550',light:'#d6c08a',accent:'#9baaa0'},
 shelter:{ground:'#243137',floor:'#3b4547',floor2:'#354043',edge:'#617374',wall:'#28383e',wallTop:'#8a9692',path:'#515b58',light:'#d8c39d',accent:'#88b5b4'},
 ship:{ground:'#152a35',floor:'#26414b',floor2:'#213a45',edge:'#42636b',wall:'#182d39',wallTop:'#5f7d86',path:'#344c58',light:'#edd0a1',accent:'#75bdc6'}
};
function hash(input){let h=2166136261;for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){let a=hash(seed);return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function noise(x,y,seed=0){let n=Math.imul(x+31,374761393)^Math.imul(y+71,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function vesselPalette(location){
 const key=hash(location.vesselId||location.shipId||location.id||location.name),hostile=location.ownership==='hostile'||location.hostile===true||location.faction==='cinder';
 const colors=hostile?['#d8a170','#c98d72','#d2b079']:location.faction==='meridian'?['#9bb7d4','#adb1d8','#9dc8ce']:['#8cc5c8','#a6c5ad','#c7bd8d'];
 const accent=colors[key%colors.length];
 return{...PALETTES.ship,...(hostile?{floor:'#3a3438',floor2:'#312f36',edge:'#65544e',wall:'#29272f',wallTop:'#81695d',path:'#4a4040'}:{}),accent,light:accent};
}
export function repairSolution(entityId){const rng=random(String(entityId));return Array.from({length:3},()=>Math.floor(rng()*4));}
const AUTHORED_BODIES=new Map(NAMED_SYSTEMS.flatMap(system=>system.bodies.map(body=>[body.id,{body,system}])));
const LORE_BY_ID=new Map(LORE.map(entry=>[entry.id,entry]));
const BODY_LORE={kettle:'kettle_history',morrow:'union_charter',tinbell:'open_frequency',orchard:'union_charter',weighhouse:'union_charter',serein:'meridian_patent',ledger:'meridian_patent',cairn:'lanes',lilt:'severance',listening:'living_registry',ward:'quiet_earth',bastion:'quiet_earth',kiln:'cinder_debt',patchwork:'cinder_debt',palimpsest:'silent_engine',blindpost:'silent_engine',tallow:'meridian_patent',checkpoint:'open_frequency',newshore:'union_charter',porch:'lanes',stillwater:'seedvault',census:'living_registry',earth:'air_pact',luna:'return_ethic',threshold:'return_ethic',wide:'open_frequency',door:'open_frequency'};
const FACTION_LORE={freewake:'union_charter',meridian:'meridian_patent',lantern:'open_frequency',concord:'quiet_earth',cinder:'cinder_debt'};
const COMMON_ROOMS={kettle:'The Long Way',weighhouse:'Common Kitchen',ledger:'The Countersign',listening:'Listening Room',bastion:'Off Watch',patchwork:'Red Cloth',blindpost:'The Night Window',checkpoint:'Crossing House',porch:'Homeward Mess',census:'Registry Canteen',threshold:'The Last Gate',door:'The Outer Room'};
const GIVEN_NAMES=['Ari','Nemi','Evin','Keir','Lio','Tala','Bren','Siv','Mina','Kori','Reva','Tess','Oren','Veda','Rafi','Enna','Darin','Sela','Kade','Yara','Aven','Miko','Nessa','Tarin','Suri','Hale','Iris','Orla','Jorin','Noa','Lena','Cai'];
const FAMILY_NAMES=['Voss','Ames','Kest','Raye','Pell','Sorn','Ives','Marr','Tal','Venn','Daro','Vale','Bex','Mott','Wynn','Renn','Holt','Oran','Dane','Vela','Reed','Dusk','Aster','Neri','Shaw','Lark','Rill','Cale','Vey','Esker','Arden','Thorne'];
const ROLE_LABELS={bartender:'Common-room keeper',scientist:'Field researcher',courier:'Local courier',survivor:'Shipwreck survivor',settler:'Settlement representative'};

// The caller can pass just a body ID. Authored context is resolved here instead
// of requiring every docking / save-load caller to rebuild its own lore data.
function resolveLocation(value={}){
 const source=typeof value==='string'?{id:value}:value||{},authored=AUTHORED_BODIES.get(source.id);
 const system=authored?.system||NAMED_SYSTEMS.find(s=>s.id===source.systemId),location={...authored?.body,...source};
 location.kind=source.kind||source.type||authored?.body.kind||'planet';
 const kind=kindOf(location);
 location.id=source.id||(source.name?`place-${hash(source.name).toString(36)}`:({station:'station',ship:'own-ship',derelict:'derelict',planet:'world'}[kind]));
 location.name=source.name||authored?.body.name||({station:'Uncharted station',ship:'Your ship · interior',derelict:'Silent freighter',planet:'Uncharted settlement'}[kind]);
 location.systemId=source.systemId||system?.id||null;
 location.systemName=source.systemName||system?.name||source.systemId||'Uncharted Reach';
 location.faction=source.faction||system?.faction||null;
 location.loreId=LORE_BY_ID.has(source.loreId)?source.loreId:LORE_BY_ID.has(location.lore)?location.lore:BODY_LORE[location.id]||FACTION_LORE[location.faction]||'open_frequency';
 location.localLore=source.localLore||(LORE_BY_ID.has(location.lore)?'':location.lore)||`${location.name||'This landing'} keeps a local record of the ships, workers, and families who pass through.`;
 return location;
}
function localName(location,slot){const h=hash(`${location.id||location.name||'frontier'}:${slot}`);return`${GIVEN_NAMES[h%GIVEN_NAMES.length]} ${FAMILY_NAMES[(h>>>8)%FAMILY_NAMES.length]}`;}
function resident(location,role,slot=role,override={}){
 const dialogueRole=override.dialogueRole||({bartender:'merchant',scientist:'engineer',courier:'pilot',settler:'governor',survivor:'refugee'}[role]||role),authored=DIALOGUE[dialogueRole];
 const home=location.name||'this port',room=COMMON_ROOMS[location.id]||'the common room';
 const greetings={
  mechanic:`I keep the ships passing through ${home} in one piece. Show me what your hull needs.`,
  medic:`Welcome to the clinic at ${home}. Set your pack down; we can make time for one more patient.`,
  bartender:`You have found ${room}. Sit a while. Ships bring news to ${home} before the networks do.`,
  merchant:`I trade along the ${location.systemName} routes. A fair cargo and a safe return suit me better than a fortune I cannot spend.`,
  dockworker:`The freight here keeps ${home} breathing. Take a shift from the exchange and I will show you where the crates go.`,
  governor:`People came to ${home} to build a life. Every repair and delivery helps us keep it.`,
  archivist:`We keep the records of ${home}: arrivals, departures, and the messages still waiting for an answer.`,
  scientist:`The survey cooperative at ${home} needs three tagged samples from beyond the settlement. Look for the marked field circuit.`,
  courier:`I run messages and light freight around ${home}. It pays for my next departure, whenever I decide where that is.`,
  warden:`Welcome to ${home}. Keep the landing lane clear. If you have news from a stranded ship, bring it to us.`,
  broker:`The contracts here cross several borders. Read the destination, and decide whose promises you are willing to carry.`,
  salvager:`Every patched hull here has a previous owner and a story. Ask about both before taking anything apart.`,
  survivor:`I heard your docking clamp. I had begun to think ${home} would keep drifting forever.`
 };
 const greeting=override.text||greetings[role]||authored?.greeting||`There is always another story arriving at ${home}.`;
 const rumors=override.rumors||[location.localLore,...(authored?.rumors||[]).filter(s=>!(/The Kettle|The Vesper|Farwake has/.test(s)))].filter(Boolean).slice(0,3);
 return{name:override.name||localName(location,slot),role,text:greeting,data:{dialogueRole,roleLabel:override.roleLabel||ROLE_LABELS[role]||authored?.role||role,homeLocationId:location.id,home:home,systemId:location.systemId,systemName:location.systemName,faction:override.faction||location.faction,greeting,rumors,...override.data}};
}
function personEntity(m,location,id,type,role,x,y,color,override={}){
 const r=resident(location,role,id,override);return entity(m,id,type,r.name,r.role,x,y,color,r.data,r.text);
}
function storyResident(location){
 if(location.id==='kettle')return{role:'dockworker',name:DIALOGUE.dockworker.name,roleLabel:'Dock foreman',text:'Iona is in the shipwright’s bay. A local shift will pay for the parts she needs. Kettle remembers the people who keep its air running.',rumors:DIALOGUE.dockworker.rumors,data:{storyKey:'first_shift'}};
 if(location.id==='listening')return{role:'archivist',name:DIALOGUE.archivist.name,roleLabel:DIALOGUE.archivist.role,text:`${DIALOGUE.archivist.greeting} Our array at Listening House is missing a stable relay. Help me restore it, and we can read what your census fragment is trying to tell us.`,rumors:DIALOGUE.archivist.rumors,data:{storyKey:'listening_house'}};
 if(location.id==='ledger')return{role:'governor',name:'Liaison Evin Raye',roleLabel:'Charter council liaison',text:'Continuity asks for jurisdiction. Meridian asks for the routes. Freewake asks for the evidence to be public. Ledger Ring can record an alliance, but you will be the one living with its promises.',rumors:['An alliance is a name that reaches the next port before your ship.','The original lane patent is still in this archive. Read it before deciding who owns a route.'],data:{storyKey:'three_claims',representative:true}};
 if(location.id==='stillwater')return{role:'archivist',name:'Custodian Nemi Ives',roleLabel:'Vault records custodian',text:'The vault kept its climate records through every silent year. The irrigation messages are still addressed to Earth. If you have come to carry those records home, we should talk.',rumors:['These seeds were chosen for farmers who might never see the weather their grandparents knew.','The climate record includes a safe approach to Sol. The people there deserve to choose who follows it.'],data:{storyKey:'witness_vault',loreId:'seedvault'}};
 if(location.id==='earth')return{role:'governor',name:DIALOGUE.governor.name,roleLabel:'Earth council representative',text:'Welcome to Earth. We kept the landing light for people, not for claims. Our council is ready to discuss reopening contact. Tell us what kind of relationship you came to build.',rumors:DIALOGUE.governor.rumors,data:{storyKey:'open_sky',representative:true}};
 const role=location.kind==='station'?({concord:'warden',freewake:'dockworker',meridian:'broker',lantern:'archivist',cinder:'salvager'}[location.faction]||'archivist'):location.biome==='ruin'?'archivist':'governor';
 return{role};
}
function addStoryResident(m,location,x,y,color){const story=storyResident(location);return personEntity(m,location,'story','npc',story.role,x,y,color,{...story,data:{...story.data,story:true}});}
function addArchive(m,location,x,y,name='Local archive'){
 const lore=LORE_BY_ID.get(location.loreId),local=location.localLore;
 return entity(m,'lore','terminal',name,'Read local history',x,y,'#83adb6',{loreId:location.loreId,localLore:local,loreTitle:lore?.title,homeLocationId:location.id},[local,lore?.text].filter(Boolean).join('\n\n'));
}
function normalizeBiome(value){const b=String(value||'verdant').toLowerCase();if(b==='cave'||b==='shelter')return b;if(/barren|rock|dust/.test(b))return'barren';if(/ice|froz|snow|glaci/.test(b))return'ice';if(/volcan|lava|ash|cinder/.test(b))return'volcanic';if(/arid|desert|dune|barren|rock|dust/.test(b))return'arid';if(/ocean|water|coast|trop/.test(b))return'ocean';return'verdant';}
function kindOf(location){const kind=String(location.kind||location.type||'planet').toLowerCase();if(kind==='site')return'site';if(/derelict|wreck|abandon/.test(kind))return'derelict';if(/own_ship|ownship|interior|player_ship|boarding|vessel/.test(kind)||location.id==='own-ship'||kind==='ship')return'ship';if(/station|outpost|dock/.test(kind))return'station';return'planet';}
function makeMap(cols,rows,biome,name,id,seed,kind){return{width:cols*T,height:rows*T,pixelWidth:cols*T,pixelHeight:rows*T,cols,rows,tileSize:T,biome,name,id,kind,seed:hash(seed+':'+id),tiles:Array.from({length:rows},()=>Array(cols).fill(TILE.VOID)),solids:[],entities:[],decor:[],spawn:{x:0,y:0},exit:{x:0,y:0}};}
function rect(m,x,y,w,h,tile){for(let j=Math.max(0,y);j<Math.min(m.rows,y+h);j++)for(let i=Math.max(0,x);i<Math.min(m.cols,x+w);i++)m.tiles[j][i]=tile;}
function line(m,x1,y1,x2,y2,tile,width=1){let x=x1,y=y1;for(let guard=0;guard<512;guard++){rect(m,x,y,width,width,tile);if(x===x2&&y===y2)break;if(x!==x2)x+=Math.sign(x2-x);else y+=Math.sign(y2-y);}}
function room(m,x,y,w,h,doorX){rect(m,x,y,w,h,TILE.WALL);rect(m,x+1,y+1,w-2,h-2,TILE.FLOOR);rect(m,doorX,y+h-1,2,1,TILE.FLOOR);}
function point(x,y){return{x:(x+.5)*T,y:(y+.5)*T};}
function entity(m,id,type,name,role,x,y,color,data={},text=''){const p=point(x,y),e={id:m.id+':'+id,type,name,role,...p,color,text,data:{...data}};m.entities.push(e);return e;}
function prop(m,kind,x,y,w=1,h=1,color=null,solid=false,extra={}){const p={kind,x:x*T,y:y*T,w:w*T,h:h*T,color,...extra};m.decor.push(p);if(solid)m.solids.push({x:p.x+3,y:p.y+5,w:p.w-6,h:p.h-7});return p;}
function label(m,text,x,y,color='#7ca5a8'){prop(m,'label',x,y,1,1,color,false,{text});}
function addLocalWork(m,positions){
 entity(m,'cargo','crate','Freight crate','Cargo · pick up',positions.crate[0],positions.crate[1],'#d4b37b',{workType:'cargo',kind:'cargo',taskId:'cargo',flag:'cargo:'+m.id,carriedFlag:'carrying:'+m.id},'A sealed freight crate. Carry it to the striped loading pad.');
 entity(m,'delivery','delivery','Loading pad','Cargo · deliver',positions.delivery[0],positions.delivery[1],'#e2be7d',{workType:'delivery',kind:'cargo',taskId:'delivery',flag:'delivery:'+m.id,carriedFlag:'carrying:'+m.id},'The receiver scans each crate delivered to this pad.');
 positions.repairs.forEach(([x,y],i)=>entity(m,'repair-'+(i+1),'work','Relay '+(i+1),'Maintenance · repair',x,y,'#e9a66d',{workType:'repair',kind:'repair',index:i,taskId:'repair-'+(i+1),flag:'repair:'+m.id+':'+i},'The relay is stuttering. An on-site repair will restore this part of the local grid.'));
 positions.samples?.forEach(([x,y],i)=>entity(m,'sample-'+(i+1),'sample',m.biome==='ice'?'Ice-core sample':m.biome==='volcanic'?'Glass-spore sample':m.biome==='arid'?'Amber lichen sample':'Biological sample','Fieldwork · collect',x,y,'#a6d6ad',{workType:'sample',kind:'sample',index:i,taskId:'sample-'+(i+1),flag:'sample:'+m.id+':'+i},'The sample is tagged for the local survey cooperative.'));
}
function station(location,seed){
 const m=makeMap(38,30,'station',location.name||'Uncharted station',location.id||'station',seed,'station');
 const doorShift=location.id==='kettle'?0:hash(location.id||location.name)%3-1,doorXs=[7+doorShift,18-doorShift,28+doorShift];
 rect(m,2,2,34,26,TILE.WALL);rect(m,3,3,32,24,TILE.FLOOR);
 rect(m,3,9,32,1,TILE.WALL);rect(m,3,19,32,1,TILE.WALL);
 rect(m,13,3,1,6,TILE.WALL);rect(m,24,3,1,6,TILE.WALL);rect(m,13,20,1,7,TILE.WALL);rect(m,24,20,1,7,TILE.WALL);
 for(const x of doorXs){rect(m,x,9,2,1,TILE.FLOOR);rect(m,x,19,2,1,TILE.FLOOR);}
 rect(m,4,12,30,5,TILE.PATH);rect(m,17,10,4,9,TILE.PATH);
 m.spawn=point(6,14);m.exit=point(4,14);
 entity(m,'exit','exit','Your ship','Return to ship',4,14,'#d8c69e',{},'The docking collar leads back to your ship.');
 entity(m,'jobs','jobboard',`${location.name||'Port'} exchange`,'Jobs & local work',17,12,'#87b6a6');
 personEntity(m,location,'mechanic','mechanic','mechanic',18,6,'#d7a86b',location.id==='kettle'?{name:DIALOGUE.mechanic.name,text:DIALOGUE.mechanic.greeting,rumors:DIALOGUE.mechanic.rumors}:{});
 personEntity(m,location,'medic','medic','medic',29,6,'#8fc8bf',location.id==='kettle'?{name:DIALOGUE.medic.name,text:DIALOGUE.medic.greeting,rumors:DIALOGUE.medic.rumors}:{});
 personEntity(m,location,'bartender','npc','bartender',28,23,'#c7a49b');
 addStoryResident(m,location,18,23,'#c5ba89');
 personEntity(m,location,'trader','npc','merchant',26,14,'#7aa9b0');
 personEntity(m,location,'dockworker','npc','dockworker',9,15,'#b49472');
 personEntity(m,location,'visitor-pilot','npc','pilot',13,13,'#8cabc7');personEntity(m,location,'visitor-refugee','npc','refugee',21,16,'#b6ab8a');personEntity(m,location,'visitor-engineer','npc','engineer',30,12,'#93b5a6');personEntity(m,location,'visitor-salvager','npc','salvager',11,24,'#c88c73');
 addArchive(m,location,21,24,`${location.name||'Port'} archive`);
 addLocalWork(m,{crate:[5,5],delivery:[8,23],repairs:[[21,5],[32,16],[15,24]]});
 label(m,'FREIGHT / 01',4,3);label(m,'SHIPWRIGHT',15,3);label(m,'CLINIC',26,3);label(m,'DOCKING BAY',4,20);label(m,location.id==='ledger'?'CHARTER COUNCIL':location.id==='kettle'?'PORT OFFICE':'ARCHIVE',15,20);label(m,(COMMON_ROOMS[location.id]||'COMMON ROOM').toUpperCase(),26,20);
 prop(m,'window',5,2,7,1);prop(m,'window',16,2,6,1);prop(m,'window',27,2,6,1);prop(m,'window',15,27,8,1);
 prop(m,'cargo',9,4,2,2,'#7f7362',true);prop(m,'cargo',4,7,2,1,'#617c7b',true);prop(m,'cargo',10,7,2,1,'#856f58',true);
 prop(m,'workbench',16,4,4,1,'#46656c',true);prop(m,'equipment',22,7,1,1,'#91a29c',true);
 prop(m,'bed',26,4,1,2,'#9aaba1',true);prop(m,'bed',32,4,1,2,'#9aaba1',true);prop(m,'cabinet',33,7,1,1,'#7c9691',true);
 prop(m,'console',15,21,2,1,'#4b777d',true);prop(m,'books',22,21,1,2,'#6d7f78',true);
 prop(m,'bar',26,21,6,1,'#916b50',true);prop(m,'table',31,24,2,1,'#7f6956',true);
 prop(m,'bench',12,16,3,1,'#5d7778',true);prop(m,'bench',23,11,3,1,'#5d7778',true);prop(m,'plant',32,11,1,1,'#618f7c');prop(m,'plant',4,18,1,1,'#618f7c');
 for(const x of doorXs)for(const y of[10,18])prop(m,'light',x,y,1,.3,'#e6c381');
 prop(m,'dockship',0,12,2,5,'#7b9da4');
 prop(m,'vending',31,18,1.2,1,'#84b6aa',true);prop(m,'planter',29,17,2,1,'#78a486',true);prop(m,'floorarrows',6,13,4,3,'#8da99c',false);prop(m,'floorarrows',28,13,4,3,'#8da99c',false);prop(m,'banner',17,10,4,.3,'#adbc91');prop(m,'banner',4,11,1,1.5,'#8ebeb2');prop(m,'banner',33,20,1,1.5,'#d5b485');
 return m;
}
function planet(location,seed){
 if((location.kind==='moon'||location.kind==='asteroid')&&/barren|rock|dust/.test(String(location.biome)))return barrenSurface(location,seed);
 const biome=normalizeBiome(location.biome),m=makeMap(108,80,biome,location.name||'Uncharted settlement',location.id||'world',seed,'planet'),rng=random(seed+':'+m.id);
 rect(m,0,0,m.cols,m.rows,TILE.WALL);rect(m,1,1,m.cols-2,m.rows-2,TILE.GROUND);
 // Connected paths link the landing, services and the field survey circuit.
 rect(m,7,23,7,7,TILE.PAD);rect(m,15,15,12,9,TILE.PATH);
 line(m,10,24,10,16,TILE.PATH,2);line(m,10,16,29,16,TILE.PATH,2);
 line(m,10,12,10,16,TILE.PATH,2);line(m,21,12,21,16,TILE.PATH,2);line(m,32,16,26,16,TILE.PATH,2);
 line(m,25,20,41,20,TILE.PATH);line(m,41,20,41,6,TILE.PATH);line(m,41,6,39,6,TILE.PATH);line(m,25,22,25,31,TILE.PATH);line(m,25,31,29,31,TILE.PATH);
 room(m,5,5,10,8,10);room(m,17,5,10,8,21);room(m,29,8,11,9,33);
 rect(m,7,26,5,2,TILE.METAL);
 // A small lake / melt pool / lava basin leaves the settlement and survey connected.
 for(let y=25;y<=31;y++)for(let x=34;x<=43;x++){const d=((x-38.5)/5.2)**2+((y-28)/3.8)**2;if(d<.8+rng()*.22)m.tiles[y][x]=TILE.WATER;}
 m.spawn=point(10,26);m.exit=point(10,28);
 entity(m,'exit','exit','Landing shuttle','Return to ship',10,28,'#d9bd87');
 entity(m,'jobs','jobboard',`${location.name||'Settler'} cooperative`,'Jobs & local work',17,17,'#8bb8a0');
 personEntity(m,location,'mechanic','mechanic','mechanic',10,9,'#d6aa73');
 personEntity(m,location,'medic','medic','medic',22,9,'#a5cec0');
 personEntity(m,location,'bartender','npc','bartender',34,12,'#c89a8b');
 addStoryResident(m,location,22,20,'#b6bd87');
 personEntity(m,location,'scientist','npc','scientist',28,24,'#92adb8',{data:{survey:true}});
 personEntity(m,location,'courier','npc','courier',15,24,'#d4a47d');
 addArchive(m,location,19,7,location.id==='stillwater'?'Stillwater climate register':location.id==='earth'?'Council public record':`${location.name||'Colony'} memory wall`);
 addLocalWork(m,{crate:[6,17],delivery:[26,21],repairs:[[7,8],[24,11],[37,13]],samples:[[39,5],[43,18],[29,31]]});
 label(m,'WORKSHOP',6,6,PALETTES[biome].light);label(m,location.id==='stillwater'?'VAULT RECORDS':'CLINIC',18,6,PALETTES[biome].light);label(m,location.id==='earth'?'COUNCIL HOUSE':'WAYFARER HOUSE',30,9,PALETTES[biome].light);label(m,'LANDING  /  01',7,24,'#d6c49f');
 prop(m,'workbench',7,6,4,1,'#626e65',true);prop(m,'equipment',12,7,1,2,'#879384',true);
 prop(m,'bed',19,9,1,2,'#94aaa0',true);prop(m,'cabinet',24,7,1,1,'#9ba99b',true);prop(m,'bar',31,10,6,1,'#9a7758',true);prop(m,'table',31,14,2,1,'#9a7758',true);
 prop(m,'fountain',19,16,2,2,biome==='volcanic'?'#937f68':'#73969a',true);prop(m,'planter',16,20,2,2,biome==='ice'?'#a7c1b2':'#73a178',true);prop(m,'planter',24,15,2,1,'#7ba681',false);prop(m,'awning',7,12,5,.6,'#bd9573',false);prop(m,'awning',19,12,5,.6,'#7ba8a6',false);prop(m,'awning',31,16,6,.6,'#bba783',false);prop(m,'bench',19,22,3,1,'#7b8271',true);prop(m,'cargo',4,19,2,2,'#9c845f',true);
 prop(m,'fence',3,22,4,.3,'#a39175');prop(m,'fence',14,28,5,.3,'#a39175');prop(m,'antenna',3,6,1,3,'#99aaa3',true);
 for(let y=3;y<34;y+=2)for(let x=2;x<46;x+=2){
  if(m.tiles[y][x]!==TILE.GROUND||rng()>.45)continue;
  if(m.entities.some(e=>Math.hypot(e.x-(x+.5)*T,e.y-(y+.5)*T)<57))continue;
  const isTree=(biome==='verdant'||biome==='ocean')&&rng()>.38;
  prop(m,isTree?'tree':biome==='ice'?'ice':biome==='arid'&&rng()>.5?'cactus':rng()>.48?'rock':'grass',x,y,1,1,null,isTree||biome==='ice',{variant:Math.floor(rng()*4)});
 }
 prop(m,'shuttle',8,25,4,2,'#93b6b5');
 prop(m,'sign',28,19,1,1,'#cfbf90',false,{text:'SURVEY →'});prop(m,'sign',25,29,1,1,'#cfbf90',false,{text:'FIELD ↓'});
 expandFrontier(m,location,seed,rng);
 return m;
}
/** The original port remains in place, with distinct districts beyond its old boundary. */
function expandFrontier(m,location,seed,rng){
 // A river, orchards and exposed uplands make routes readable before any map is opened.
 for(let y=37;y<73;y++)for(let x=59;x<66;x++)if(Math.abs(x-(62+Math.sin(y/7)*2))<2)m.tiles[y][x]=TILE.WATER;
 for(let y=45;y<67;y+=4)for(let x=14;x<37;x+=4){rect(m,x,y,2,1,TILE.PATH);prop(m,m.biome==='verdant'||m.biome==='ocean'?'planter':'cargo',x,y,2,1,m.biome==='ice'?'#a5c3be':'#7c9b6e',false);}
 line(m,25,31,48,31,TILE.PATH,2);line(m,48,16,48,66,TILE.PATH,2);line(m,25,31,25,70,TILE.PATH,2);line(m,25,66,96,66,TILE.PATH,2);line(m,48,38,96,38,TILE.PATH,2);
 line(m,48,52,86,52,TILE.PATH,2);line(m,86,38,86,66,TILE.PATH,2);line(m,40,20,48,20,TILE.PATH,2);
 room(m,51,29,12,9,57);line(m,57,37,57,39,TILE.PATH,2);
 personEntity(m,location,'field-keeper','npc','settler',57,34,'#9fb596',{roleLabel:'Outer district keeper',text:location.id==='morrow'?'The old landing district is only the beginning of Morrow. The orchards stretch south; follow the lamps east for the ridge path. Somebody should check the pump house. Northwatch has been calling without a voice.':`The paths beyond ${location.name} are marked with old survey stakes. Shelters are open to travelers; what is inside them is another question.`,rumors:['The route loops back to the landing. You can turn around whenever you need to.','Not every empty building is waiting to reward you. Some just need somebody to remember they were here.']});
 prop(m,'table',54,31,3,1,'#92866e',true);prop(m,'books',60,31,1,3,'#7f9e96',true);prop(m,'antenna',52,27,1,2,'#a1b4ad',false);
 label(m,location.id==='morrow'?'OUTER MORROW':'FIELD COOPERATIVE',52,30,'#c4d2b2');label(m,'ORCHARD ROAD',16,42,'#becb9b');label(m,'RIDGE PATH',73,36,'#cbbd96');
 prop(m,'sign',43,29,1,1,'#d6c89c',false,{text:'RIDGE →'});prop(m,'sign',28,40,1,1,'#d6c89c',false,{text:'LANDING ↑'});prop(m,'sign',82,64,1,1,'#d6c89c',false,{text:'COAST →'});
 addFrontierSites(m,location,seed);
 for(let y=3;y<m.rows-3;y+=3)for(let x=3;x<m.cols-3;x+=3){
  if(x<47&&y<35||m.tiles[y][x]!==TILE.GROUND||rng()>.42)continue;
  if(m.entities.some(e=>Math.hypot(e.x-(x+.5)*T,e.y-(y+.5)*T)<72))continue;
  const tree=(m.biome==='verdant'||m.biome==='ocean')&&rng()>.5;
  prop(m,tree?'tree':m.biome==='ice'?'ice':rng()>.55?'rock':'grass',x,y,1,1,null,tree||m.biome==='ice');
 }
 // Light stakes and return arrows give the enlarged region landmarks without a UI overlay.
 for(const[x,y]of[[48,28],[48,42],[48,60],[72,38],[86,49],[72,66],[37,66],[25,51]])prop(m,'trail-light',x,y,1,1,'#b5c6a9',false);
 m.districts=[{name:'Landing district',x:10*T,y:26*T},{name:'Outer cooperative',x:57*T,y:34*T},{name:'Orchard road',x:25*T,y:53*T},{name:'Ridge country',x:76*T,y:25*T},{name:'Salt flats',x:88*T,y:65*T}];
}
function addFrontierSites(m,location,seed){
 m.sites=explorationSites(location,seed);
 for(const site of m.sites){
  const x=site.tileX,y=site.tileY,joinY=y<38?38:66;
  line(m,x,y,x,joinY,TILE.PATH,2);line(m,x,joinY,48,joinY,TILE.PATH,2);
  entity(m,'site:'+site.id,'siteEntrance',site.name,'Enter',x,y,site.hostile?'#d7ac86':'#a6c6c3',{siteId:site.id,bodyId:location.id,siteKind:site.kind,summary:site.summary},site.summary);
  prop(m,site.kind==='cave'?'cave-mouth':site.kind==='igloo'?'igloo':site.kind==='observatory'?'dome':'frontier-hut',x-1.5,y-2.2,4,3,site.kind==='igloo'?'#c1d7d3':'#8b9b96',false);
  prop(m,'trail-light',x-2,y,1,1,site.hostile?'#d6ae82':'#a6c9bd',false);
 }
}
function barrenSurface(location,seed){
 const m=makeMap(108,80,normalizeBiome(location.biome),location.name,location.id,seed,'planet'),rng=random(seed+':'+location.id);
 rect(m,0,0,m.cols,m.rows,TILE.WALL);rect(m,1,1,m.cols-2,m.rows-2,TILE.GROUND);rect(m,7,23,7,7,TILE.PAD);m.spawn=point(10,26);m.exit=point(10,28);m.barren=true;
 entity(m,'exit','exit','Landing shuttle','Return to ship',10,28,'#d9bd87');prop(m,'shuttle',8,25,4,2,'#93b6b5');
 addArchive(m,location,14,25,'Automated survey beacon');prop(m,'antenna',15,23,1,3,'#8ba6b0',false);label(m,'UNCREWED LANDING',7,23,'#bfcac2');
 line(m,10,27,48,27,TILE.PATH);line(m,48,27,48,66,TILE.PATH);addFrontierSites(m,location,seed);
 for(let y=3;y<77;y+=3)for(let x=3;x<105;x+=3){if(m.tiles[y][x]!==TILE.GROUND||rng()>.23||m.entities.some(e=>Math.hypot(e.x-(x+.5)*T,e.y-(y+.5)*T)<70))continue;prop(m,rng()>.5?'rock':'debris',x,y,1,1,'#8b8a81',false);}
 label(m,'NO SERVICES / SURVEY ONLY',19,27,'#b9b39f');return m;
}
function expeditionSurface(location,seed){
 const site=location.site,m=makeMap(site.cols,site.rows,site.kind==='cave'?'cave':site.kind==='igloo'?'ice':'shelter',site.name,location.id,seed,'site');
 m.siteId=site.id;m.parentId=location.parentId;m.atmosphere=site.atmosphere;m.site=site;
 rect(m,1,1,m.cols-2,m.rows-2,TILE.WALL);
 if(site.kind==='cave'){
  rect(m,3,12,35,7,TILE.FLOOR);rect(m,10,6,19,15,TILE.FLOOR);rect(m,22,5,15,8,TILE.FLOOR);rect(m,20,19,18,10,TILE.FLOOR);rect(m,5,20,12,8,TILE.FLOOR);rect(m,9,17,5,5,TILE.PATH);
  rect(m,16,9,3,4,TILE.WALL);rect(m,29,15,3,5,TILE.WALL);rect(m,13,22,2,2,TILE.WALL);rect(m,33,6,3,2,TILE.WATER);
  for(const[x,y]of[[9,10],[20,7],[34,21],[7,23],[24,26]])prop(m,'stalagmite',x,y,1,1,'#8c9187',true);
  for(const[x,y]of[[6,13],[13,14],[21,14]])prop(m,'trail-light',x,y,1,1,'#c4bc8b',false);
  prop(m,'bones',27,13,2,1,'#a8a28a',false);prop(m,'clawmarks',21,20,2,1,'#a88c74',false);prop(m,'cargo',31,25,1,1,'#7e8e85',false);
  m.spawn=point(5,16);m.exit=point(3,16);label(m,'DAYLIGHT ←',4,17,'#bfcebd');
 }else{
  rect(m,3,3,m.cols-6,m.rows-6,TILE.FLOOR);rect(m,3,12,m.cols-6,1,TILE.WALL);rect(m,12,12,3,1,TILE.FLOOR);rect(m,4,13,3,5,TILE.PATH);
  m.spawn=point(6,16);m.exit=point(4,16);
  prop(m,'bed',7,5,1,3,'#a4b8ac',true);prop(m,'table',17,6,3,1,'#8d7e68',true);prop(m,'cabinet',5,5,1,2,'#829f9a',true);prop(m,'coat',10,4,1,1,'#a28c70',false);
  prop(m,'window',m.cols-8,2,4,1,null,false);prop(m,'light',12,3,3,.4,'#c5b995',false);label(m,site.kind==='igloo'?'SHELTER / NO OCCUPANTS':site.kind==='pump'?'PRESSURE ROOM':site.kind==='observatory'?'NORTH WATCH':'KEEP THE LIGHT',5,3,'#c4cbb8');
  if(site.kind==='pump'){prop(m,'engine',20,15,2,5,'#678f8e',true);prop(m,'pipe',26,14,2,8,'#8c8f7e',false);prop(m,'console',21,5,9,1,'#739a9a',true);}
  if(site.kind==='observatory'||site.kind==='vault'){prop(m,'console',19,5,11,1,'#799295',true);prop(m,'antenna',28,16,1,4,'#a1b1a9',true);prop(m,'books',7,17,1,3,'#8b9b89',true);}
  if(site.kind==='shelter'||site.kind==='igloo'){prop(m,'heater',19,16,2,2,'#8ba3a1',true);prop(m,'boots',8,18,1,1,'#8c806c',false);}
  label(m,'SURFACE ←',4,18,'#c5d2c0');
 }
 entity(m,'exit','siteExit','Return to surface','Leave this place',Math.floor(m.exit.x/T),Math.floor(m.exit.y/T),'#c5ddbb',{siteId:site.id,parentId:location.parentId},'The way back is open. You can leave even while a threat is alive.');
 for(const cache of site.caches)entity(m,'cache:'+cache.id,'siteCache',cache.name,'Recover supplies',cache.x,cache.y,'#d7c292',{siteId:site.id,cacheId:cache.id},cache.text);
 for(const record of site.records)entity(m,'record:'+record.id,'siteRecord',record.name,'Read',record.x,record.y,'#9bc4c1',{siteId:site.id,recordId:record.id},record.text);
 for(const choice of site.choices)entity(m,'choice:'+choice.id,'siteChoice',choice.name,'Inspect',choice.x,choice.y,'#d5b98e',{siteId:site.id,choiceId:choice.id},choice.text);
 return m;
}

function derelict(location,seed){
 const m=makeMap(38,28,'derelict',location.name||'Silent freighter',location.id||'derelict',seed,'derelict');
 rect(m,3,3,32,22,TILE.WALL);rect(m,4,4,30,20,TILE.FLOOR);rect(m,4,11,30,1,TILE.WALL);rect(m,4,18,30,1,TILE.WALL);
 rect(m,14,4,1,7,TILE.WALL);rect(m,25,4,1,7,TILE.WALL);rect(m,17,19,1,5,TILE.WALL);
 for(const x of[9,20,29])rect(m,x,11,2,1,TILE.FLOOR);for(const x of[10,22,29])rect(m,x,18,2,1,TILE.FLOOR);
 rect(m,4,13,30,3,TILE.GRATE);rect(m,8,12,3,7,TILE.PATH);
 m.spawn=point(6,14);m.exit=point(4,14);
 entity(m,'exit','exit','Docking tether','Return to ship',4,14,'#d7b490');
 personEntity(m,location,'survivor','npc','survivor',21,7,'#bea698',{data:{encounter:true,story:true}});
 addArchive(m,location,29,6,'Black-box recorder');
 entity(m,'jobs','jobboard','Salvage manifest','Jobs & salvage',8,9,'#99b6ae');
 entity(m,'mechanic','mechanic','Emergency fabricator','Repair station',29,21,'#b59875',{automated:true},'The surviving fabricator can stabilize equipment and fit salvage.');
 addLocalWork(m,{crate:[9,6],delivery:[7,21],repairs:[[12,21],[23,21],[31,9]],samples:[[19,5],[30,15],[15,22]]});
 label(m,'HOLD / B',5,4,'#b69f8c');label(m,'CREW QUARTERS',16,4,'#b69f8c');label(m,'BRIDGE',27,4,'#b69f8c');label(m,'ENGINEERING',19,19,'#b69f8c');
 prop(m,'window',27,3,5,1);prop(m,'cargo',5,5,2,2,'#726c61',true);prop(m,'cargo',11,7,2,2,'#7f6a5d',true);prop(m,'bed',16,6,1,2,'#758389',true);prop(m,'bed',23,6,1,2,'#758389',true);
 prop(m,'console',27,4,5,1,'#5d7377',true);prop(m,'engine',19,20,2,3,'#59777b',true);prop(m,'equipment',32,21,1,2,'#687b7d',true);
 for(const[x,y]of[[7,12],[20,12],[30,12],[9,17],[23,17]])prop(m,'light',x,y,1,.2,'#d78162');
 for(const[x,y]of[[15,13],[17,14],[28,17],[6,23],[30,22]])prop(m,'debris',x,y,1,1,'#69676a');
 return m;
}
function ship(location,seed){
 const layout=cabinLayout(location),m=makeMap(layout.cols,layout.rows,'ship',location.name||'Your ship · interior',location.id||'own-ship',seed,'ship');
 m.vesselId=location.vesselId||location.shipId||location.id;m.vesselName=location.vesselName||location.shipName||location.name||'Independent vessel';m.ownership=location.ownership||null;m.palette=vesselPalette(location);
 m.shipClass=layout.shipClass;m.berths=layout.berths;m.rooms=layout.rooms.map(r=>({...r}));m.stations=layout.stations;m.bunks=layout.bunks;m.breaches=layout.breaches;m.combatSpawns=layout.combatSpawns;m.crewSpawns=layout.crewSpawns;m.walkable=[...layout.walkable];
 m.spawn={...layout.spawn};m.exit={x:layout.stations.helm.x,y:layout.stations.helm.y};
 entity(m,'entry-airlock','exit','Entry airlock','Boarding entry',Math.floor(layout.spawn.x/T),Math.floor(layout.spawn.y/T),m.palette.accent,{airlock:true,vesselId:m.vesselId,shared:true,roleLabel:'Entry airlock'},'The collar where you entered this deck. Use it to return across the tether when your origin ship is alongside.');
 for(let y=0;y<m.rows;y++)for(let x=0;x<m.cols;x++)if(layout.floor[y*m.cols+x])m.tiles[y][x]=TILE.FLOOR;
 for(const c of layout.corridors)rect(m,c.x,c.y,c.w,c.h,TILE.PATH);
 for(let y=1;y<m.rows-1;y++)for(let x=1;x<m.cols-1;x++)if(!layout.floor[y*m.cols+x]&&[-1,0,1].some(dy=>[-1,0,1].some(dx=>layout.floor[(y+dy)*m.cols+x+dx])))m.tiles[y][x]=TILE.WALL;
 for(const r of layout.rooms){label(m,r.name,r.x+1,r.y+.3,r.color);prop(m,'roomstripe',r.x+1,r.y+r.h-1,r.w-2,.15,r.color,false);}
 for(const f of layout.fixtures)prop(m,f.kind,f.x,f.y,f.w,f.h,f.color,false);
 m.solids=layout.fixtures.filter(f=>f.solid).map(f=>({x:f.x*T,y:f.y*T,w:f.w*T,h:f.h*T}));
 const descriptions={helm:'Take the helm and pilot the ship. Shared crew members can request command from the captain.',engineering:'Monitor the reactor, restore damaged systems, and coordinate repairs during a boarding action.',medical:'This station tracks the crew’s health. A medic can stabilize casualties and prepare the recovery berth.',security:'Coordinate the ship’s defense, check the boarding alarm, and protect the passage to the bridge.',navigation:'Read the local chart, coordinate jumps, and take the navigation station as a member of the crew.'};
 const names={helm:'Captain’s helm',engineering:'Engineering station',medical:'Medical station',security:'Security station',navigation:'Navigation station'};
 const colors={helm:'#e6c58a',engineering:'#d9b777',medical:'#91c8b4',security:'#d89a86',navigation:'#8dbed0'};
 for(const[role,p]of Object.entries(layout.stations)){
  const id=role==='helm'?'exit':'station:'+role,type=role==='helm'?'exit':'station';
  entity(m,id,type,names[role],role,p.tileX,p.tileY,colors[role],{stationRole:role,shipClass:layout.shipClass,vesselId:location.vesselId||location.shipId||location.id,shared:true,console:role,roleLabel:role==='helm'?'Pilot the ship':'Crew duty station'},descriptions[role]);
 }
 const crew=(Array.isArray(location.crew)?location.crew:[]).filter(c=>c&&(typeof c==='string'||typeof c==='object'&&c.status!=='dead'&&(c.health===undefined||c.health>0))).slice(0,layout.berths-1).map((c,i)=>typeof c==='string'?{id:`crew-${i}`,name:c,role:'crewmate'}:{...c,id:c.id||`crew-${i}`});
 for(const bunk of layout.bunks){
  const assignment=location.bunkAssignments?.[bunk.index]??location.bunkAssignments?.[String(bunk.index)],assignedTo=typeof assignment==='object'?assignment.captainId||assignment.id:assignment;
  entity(m,'bunk:'+bunk.index,'bunk',bunk.index===0?'Captain’s berth':`Crew berth ${String(bunk.index+1).padStart(2,'0')}`,'Rest & respawn',bunk.tileX,bunk.tileY,bunk.index===0?'#d5bd8a':'#9caed0',{bunkIndex:bunk.index,respawn:true,claimable:true,assignedTo:assignedTo||null,vesselId:location.vesselId||location.shipId||location.id,bed:{x:bunk.x,y:bunk.y-3*T}},'Set this berth as your recovery point. A claimed berth remains aboard this vessel when its captain travels.');
 }
 for(let i=0;i<crew.length;i++){
  const c=crew[i],p=layout.crewSpawns[i],dialogueRole=c.role==='navigator'?'pilot':c.role,base=DIALOGUE[dialogueRole];
  const role=String(c.role||'crewmate'),name=c.name||base?.name||'Crewmate';
  entity(m,'crew:'+c.id,'crew',name,role,Math.floor(p.x/T),Math.floor(p.y/T),c.color||['#d1b67d','#8ebcc4','#a0c5ae','#bda6c9'][i%4],{crewId:c.id,crewRole:role,dialogueRole,roleLabel:base?.role||role,greeting:c.greeting||base?.greeting,rumors:c.rumors||base?.rumors||[],bunkIndex:c.bunkIndex??c.berthIndex??i+1,health:c.health,maxHealth:c.maxHealth},c.text||c.greeting||base?.greeting||'Another watch together. Where are we headed next?');
 }
 entity(m,'lore','terminal','Captain’s archive','Journal & lore',Math.floor(layout.archive.x/T),Math.floor(layout.archive.y/T),'#8bc5c9',{journal:true},'Recovered signals, crew notes, and the history you carry with you.');
 entity(m,'crew-console','terminal','Crew manifest','Crew & alliances',Math.floor(layout.manifest.x/T),Math.floor(layout.manifest.y/T),'#aec6aa',{crew:true},`${layout.name} cabin · ${layout.berths} berths. Every berth is a promise to bring someone home.`);
 for(const d of layout.doors)prop(m,'doorframe',d.x,d.y,d.w,d.h,m.palette.accent,false);
 for(const c of layout.corridors){if(c.w>c.h)for(let x=c.x+3;x<c.x+c.w-2;x+=7)prop(m,'light',x,c.y,1,.22,'#c5c79d',false);else for(let y=c.y+3;y<c.y+c.h-2;y+=7)prop(m,'light',c.x,y,c.w,.14,'#a4c9c6',false);}
 for(const breach of layout.breaches)prop(m,'airlock',Math.floor(breach.x/T)-.5,Math.floor(breach.y/T)-.5,2,2,'#bda374',false);
 prop(m,'airlock',layout.spawn.x/T-1,layout.spawn.y/T-.5,2,1,m.palette.accent,false);
 prop(m,'vesselmark',Math.max(3,layout.spawn.x/T-3),layout.spawn.y/T+.8,6,.6,m.palette.accent,false);
 return m;
}
/** Build a walkable place from a body object or authored body ID. */
export function generateSurface(location={},seed='farwake',flags=[]){
 location=resolveLocation(location);
 const kind=kindOf(location);const m=kind==='site'?expeditionSurface(location,seed):kind==='station'?station(location,seed):kind==='ship'?ship(location,seed):kind==='derelict'?derelict(location,seed):planet(location,seed);
 m.faction=location.faction||null;m.systemId=location.systemId;m.systemName=location.systemName;m.localLore=location.localLore;m.loreId=location.loreId;m.flags=Array.isArray(flags)?[...flags]:[];
 // Interactive spaces always remain clear. Furniture is collision-enabled,
 // but items and characters never fence in an interaction or a landing spawn.
 if(m.kind!=='ship')m.solids=m.solids.filter(s=>![m.spawn,m.exit,...m.entities].some(e=>e.x>s.x-15&&e.x<s.x+s.w+15&&e.y>s.y-15&&e.y<s.y+s.h+15));
 for(const e of m.entities){const tx=Math.floor(e.x/T),ty=Math.floor(e.y/T);if(BLOCKED.has(m.tiles[ty]?.[tx]))m.tiles[ty][tx]=m.kind==='planet'?TILE.GROUND:TILE.FLOOR;}
 if(m.kind==='site'){const walkable=[];for(let y=0;y<m.rows;y++)for(let x=0;x<m.cols;x++)walkable.push(isWalkable(m,(x+.5)*T,(y+.5)*T,1)?1:0);m.combatLayout={tile:T,tileSize:T,cols:m.cols,rows:m.rows,walkable,width:m.width,height:m.height};}
 return m;
}
/** Collision uses a small circular-feeling square footprint below the sprite. */
export function isWalkable(surface,x,y,radius=6){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x-radius<0||y-radius<0||x+radius>=surface.width||y+radius>=surface.height)return false;
 const size=surface.tileSize||T;
 for(const[ox,oy]of[[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]){const tile=surface.tiles[Math.floor((y+oy)/size)]?.[Math.floor((x+ox)/size)];if(tile===undefined||BLOCKED.has(tile))return false;}
 return !surface.solids.some(s=>x+radius>s.x&&x-radius<s.x+s.w&&y+radius>s.y&&y-radius<s.y+s.h);
}
export function movePerson(surface,person,dx,dy,dt){
 if(!Number.isFinite(person.x)||!Number.isFinite(person.y))Object.assign(person,surface.spawn);
 dx=Number.isFinite(dx)?dx:0;dy=Number.isFinite(dy)?dy:0;dt=clamp(Number.isFinite(dt)?dt:0,0,.25);
 const magnitude=Math.hypot(dx,dy);if(magnitude>.01){person.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';if(magnitude>1){dx/=magnitude;dy/=magnitude;}}
 const distance=(person.speed||112)*dt,steps=Math.max(1,Math.ceil(distance*Math.max(Math.abs(dx),Math.abs(dy))/5)),sx=dx*distance/steps,sy=dy*distance/steps;
 const startX=person.x,startY=person.y;
 for(let i=0;i<steps;i++){if(isWalkable(surface,person.x+sx,person.y,person.radius||6))person.x+=sx;if(isWalkable(surface,person.x,person.y+sy,person.radius||6))person.y+=sy;}
 person.moving=Math.hypot(person.x-startX,person.y-startY)>.01;person.walkTime=(person.walkTime||0)+(person.moving?dt:0);
 return person;
}
export function nearestEntity(surface,person,range=38){
 let best=null,distance=range;
 for(const e of surface.entities){if(e.hidden||e.disabled)continue;const d=Math.hypot(e.x-person.x,e.y-person.y);if(d<=distance){best=e;distance=d;}}
 return best;
}
function pixel(ctx,c,x,y,w,h){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function text(ctx,value,x,y,color='#d8e2d7',size=9,align='left'){ctx.font=`${size}px monospace`;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(value,Math.round(x),Math.round(y));}
function tileDraw(ctx,m,x,y,p,time){
 const tile=m.tiles[y][x],wx=x*T,wy=y*T,n=noise(x,y,m.seed);
 if(tile===TILE.VOID){if(m.kind==='site'){pixel(ctx,'#080f17',wx,wy,T,T);return;}if(n>.89){pixel(ctx,n>.98?'#b4d3d0':'#416677',wx+Math.floor(n*17),wy+Math.floor(noise(y,x,m.seed)*20),1,1);if(n>.99)pixel(ctx,'#253f51',wx+Math.floor(n*17)-2,wy+Math.floor(noise(y,x,m.seed)*20),5,1);}return;}
 if(m.biome==='cave'&&[TILE.WALL,TILE.FLOOR,TILE.PATH,TILE.GROUND,TILE.RUBBLE].includes(tile)){
  if(tile===TILE.WALL){
   pixel(ctx,'#242d2b',wx,wy,T,T);
   // Uneven rock faces and short fractures, with no panel seams or metal bands.
   const face=![undefined,TILE.VOID,TILE.WALL].includes(m.tiles[y+1]?.[x]);
   for(let i=0;i<3;i++){const r=noise(x*3+i,y,m.seed),xx=wx+Math.floor(r*9),yy=wy+1+i*7+Math.floor(noise(y,i+x,m.seed)*3);pixel(ctx,face?['#66665a','#565b4e','#747160'][i]:['#4b554a','#414b43','#596052'][i],xx,yy,13+Math.floor(r*8),7);pixel(ctx,face?'#83806b':'#66705c',xx+2,yy,8+Math.floor(r*7),1);}
   if(n>.36)pixelLine(ctx,wx+7,wy+4,wx+11,wy+12,'#303a32');if(n<.72)pixelLine(ctx,wx+16,wy+14,wx+12,wy+22,'#303a32');
   if(face)for(let i=0;i<4;i++){const h=2+Math.floor(noise(x*4+i,y,m.seed)*4);pixel(ctx,'#3e483e',wx+i*6,wy+T-h,6,h);}
  }else{
   pixel(ctx,tile===TILE.PATH?'#474537':'#3d4037',wx,wy,T,T);
   for(let i=0;i<4;i++){const r=noise(x*4+i,y,m.seed),xx=wx+2+Math.floor(r*18),yy=wy+2+Math.floor(noise(y*4+i,x,m.seed)*18);pixel(ctx,r>.55?'#5f604d':'#303c33',xx,yy,r>.86?4:2,r>.86?2:1);}
   if(n>.91){pixel(ctx,'#74715a',wx+7,wy+12,5,2);pixel(ctx,'#343c32',wx+8,wy+14,6,1);}else if(n<.13)pixelLine(ctx,wx+5,wy+9,wx+14,wy+13,'#343a31');
  }
  return;
 }
 if(tile===TILE.WALL){
  pixel(ctx,'#0c1d28',wx,wy,T,T);pixel(ctx,p.wall,wx+1,wy+4,T-2,T-5);pixel(ctx,p.wallTop,wx,wy,T,6);pixel(ctx,p.edge,wx+1,wy+6,T-2,2);pixel(ctx,'#101f2b',wx,wy+21,T,3);pixel(ctx,'#132a36',wx+21,wy+8,3,13);
  if(x%3===0){pixel(ctx,'#9cacaa',wx+3,wy+2,2,1);pixel(ctx,'#738b8e',wx+17,wy+2,2,1);}if((x+y)%7===0){pixel(ctx,'#51707c',wx+4,wy+12,13,2);pixel(ctx,'#233b46',wx+4,wy+15,13,2);}
  if(m.kind==='planet'&&(x===0||y===0||x===m.cols-1||y===m.rows-1)){pixel(ctx,p.ground,wx,wy,T,T);pixel(ctx,p.wall,wx+1,wy+8,23,16);pixel(ctx,p.wallTop,wx+4,wy+4,15,7);pixel(ctx,p.edge,wx+2,wy+10,9,2);}
  return;
 }
 if(tile===TILE.WATER){
  const lava=m.biome==='volcanic';pixel(ctx,p.water||'#1c4757',wx,wy,T,T);pixel(ctx,lava?'#8e422e':'#244d62',wx,wy+14,T,10);
  const shimmer=(Math.floor(time*2)+x+y)%5;pixel(ctx,lava?'#edaa5b':'#699aa4',wx+2+shimmer*2,wy+7,8,1);pixel(ctx,lava?'#c97637':'#3e7185',wx+12-shimmer,wy+18,8,1);
  for(const[dx,dy]of[[0,-1],[-1,0],[1,0],[0,1]])if(m.tiles[y+dy]?.[x+dx]!==TILE.WATER){const col=lava?'#e09349':m.biome==='ice'?'#abc9c5':'#8b9e8c';if(dx)pixel(ctx,col,wx+(dx<0?0:22),wy,2,T);else pixel(ctx,col,wx,wy+(dy<0?0:22),T,2);}
  if(lava&&n>.65){const yy=(time*7+n*21)%25;pixel(ctx,'#e2aa70',wx+Math.floor(n*15),wy-yy,1,2);}return;
 }
 if(tile===TILE.GROUND){
  pixel(ctx,n>.55?p.ground2||p.ground:p.ground,wx,wy,T,T);
  for(let i=0;i<3;i++){const nn=noise(x*3+i,y,m.seed),xx=wx+Math.floor(nn*21),yy=wy+3+Math.floor(noise(y*4+i,x,m.seed)*18);if(m.biome==='verdant'||m.biome==='ocean'){pixel(ctx,nn>.4?'#42684a':'#315b41',xx,yy,1,3);if(nn>.96)pixel(ctx,i%2?'#d6bd83':'#a9c7a3',xx,yy,2,2);}else if(m.biome==='arid'){pixel(ctx,nn>.6?'#a3835d':'#665341',xx,yy,3,1);}else if(m.biome==='volcanic'){pixel(ctx,nn>.92?'#be7851':'#57484d',xx,yy,3,1);}else{pixel(ctx,'#7d9da5',xx,yy,4,1);}}
  if(n<.22&&m.biome==='ice'){pixel(ctx,'#9ab8bb',wx+3,wy+16,10,1);pixel(ctx,'#6d8a94',wx+12,wy+15,3,1);}return;
 }
 if(tile===TILE.PATH){
  pixel(ctx,p.path,wx,wy,T,T);
  if(m.kind==='planet'){pixel(ctx,p.ground,wx,wy,1,T);if(n>.3)pixel(ctx,'#aa9b7c',wx+4,wy+7,3,1);if(n>.6)pixel(ctx,'#534f43',wx+14,wy+16,2,1);if((x+y)%3===0){pixel(ctx,'#82765c',wx+3,wy+3,15,8);pixel(ctx,'#9b8b69',wx+4,wy+3,13,1);}if(n<.25){pixel(ctx,'#776a52',wx+7,wy+13,12,7);pixel(ctx,'#a09271',wx+8,wy+13,10,1);}}
  else{pixel(ctx,p.floor2,wx+22,wy,2,T);pixel(ctx,'#3e5962',wx,wy+22,T,2);pixel(ctx,'#8a9e91',wx+3,wy+4,2,1);if(x%5===0){pixel(ctx,'#708d86',wx+6,wy+11,9,2);pixel(ctx,'#3a555c',wx+6,wy+14,9,1);}}
  return;
 }
 if(tile===TILE.PAD){pixel(ctx,p.floor,wx,wy,T,T);pixel(ctx,p.floor2,wx+1,wy+1,22,22);if((x+y)%3===0){pixel(ctx,'#b5a37c',wx+3,wy+12,8,2);pixel(ctx,'#555e57',wx+4,wy+16,15,1);}return;}
 if(tile===TILE.GRATE){pixel(ctx,p.floor2,wx,wy,T,T);for(let i=3;i<23;i+=4)pixel(ctx,'#4a5a63',wx+2,wy+i,20,1);pixel(ctx,'#839493',wx+2,wy+2,2,2);return;}
 pixel(ctx,(x+y)%2?p.floor:p.floor2,wx,wy,T,T);pixel(ctx,p.edge,wx+1,wy,23,1);pixel(ctx,'#162c36',wx,wy,1,24);pixel(ctx,'#142b34',wx+1,wy+23,23,1);
 if(n>.55){pixel(ctx,'#607779',wx+3,wy+3,1,1);pixel(ctx,'#607779',wx+20,wy+20,1,1);}if(n>.93){pixel(ctx,'#334e55',wx+6,wy+8,13,1);pixel(ctx,'#334e55',wx+6,wy+11,8,1);}
 if(tile===TILE.METAL){pixel(ctx,'#b9a787',wx+3,wy+3,18,2);pixel(ctx,p.edge,wx+3,wy+19,18,2);}
}
/** Human sprite anchored at feet. scale is an optional integer for portraits. */
export function drawCharacter(ctx,x,y,options={}){
 const look=options.appearance?appearancePalette(options.appearance):null;
 const equipped=!!options.weapon||options.team==='hostile'||options.firing,armed=equipped&&(options.armed??true),angle=Number.isFinite(options.aimAngle)?options.aimAngle:facingAngle(options.facing||'down');
 const aimedFacing=Math.abs(Math.cos(angle))>Math.abs(Math.sin(angle))?Math.cos(angle)<0?'left':'right':Math.sin(angle)<0?'up':'down';
 const seed=hash(options.id||options.name||'captain'),facing=armed?aimedFacing:options.facing||'down',skin=look?.skin||options.skin||['#d4af88','#bb8d68','#e1bf9c','#a67558','#8f644e','#cba281'][seed%6],hair=(look?.style==='shaved'?look.skin:look?.hair)||options.hair||['#433a35','#706257','#a7a79a','#513b36','#303440'][Math.floor(seed/7)%5],scale=options.scale||1,time=options.time||0;
 const moving=options.walking||options.moving||Math.hypot(options.vx||0,options.vy||0)>2,bob=moving?Math.round(Math.sin(time*13)):0,step=moving?(Math.sin(time*13)>0?1:-1):0;
 const hurt=(options.hurtUntil||options.hitUntil||0)>time,dead=options.dead||Number.isFinite(options.health)&&options.health<=0,c=hurt&&Math.floor(time*12)%2?'#e7c4b2':look?.suit||options.color||'#c4a879';
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
 pixel(ctx,'#081923',-8,-2,16,4);
 if(dead){pixel(ctx,'#2c3b42',-12,-6,24,5);pixel(ctx,c,-9,-9,15,6);pixel(ctx,skin,7,-8,6,5);pixel(ctx,hair,10,-8,4,3);ctx.restore();return;}
 pixel(ctx,'#101f2b',-5,-6+step,4,6);pixel(ctx,'#101f2b',1,-6-step,4,6);pixel(ctx,'#78918f',-6,-1+step,5,1);pixel(ctx,'#78918f',1,-1-step,5,1);
 pixel(ctx,'#102330',-7,-16+bob,14,11);pixel(ctx,c,-5,-15+bob,10,9);pixel(ctx,c,-7,-13+bob,2,7);pixel(ctx,c,5,-13+bob,2,7);
 pixel(ctx,'#e3d7b3',-4,-15+bob,8,1);pixel(ctx,'#647474',-5,-7+bob,10,2);pixel(ctx,'#263d48',-2,-14+bob,2,7);
 pixel(ctx,skin,-7,-7+bob,2,3);pixel(ctx,skin,5,-7+bob,2,3);
 pixel(ctx,'#12232d',-6,-25+bob,12,10);pixel(ctx,hair,-5,-24+bob,10,8);pixel(ctx,skin,-4,-21+bob,8,8);
 if(facing==='up'){pixel(ctx,hair,-5,-23+bob,10,9);pixel(ctx,'#776b54',-4,-15+bob,8,8);pixel(ctx,'#b6ad8b',-3,-15+bob,6,2);pixel(ctx,'#4d655f',-3,-10+bob,6,3);}
 else{
  pixel(ctx,hair,-5,-24+bob,10,4);pixel(ctx,hair,-5,-20+bob,2,4);
  if(facing==='left'){pixel(ctx,skin,-6,-18+bob,3,4);pixel(ctx,'#273842',-4,-18+bob,1,2);pixel(ctx,hair,3,-20+bob,2,6);}
  else if(facing==='right'){pixel(ctx,skin,3,-18+bob,3,4);pixel(ctx,'#273842',3,-18+bob,1,2);pixel(ctx,hair,-5,-20+bob,2,6);}
  else{pixel(ctx,'#273842',-3,-18+bob,1,2);pixel(ctx,'#273842',2,-18+bob,1,2);pixel(ctx,'#a47261',-1,-14+bob,3,1);}
  pixel(ctx,'#ebd59d',2,-12+bob,2,2);
 }
 if(look?.style==='swept'){pixel(ctx,hair,-6,-24+bob,13,3);pixel(ctx,hair,2,-22+bob,5,4);}if(look?.style==='hood'){pixel(ctx,c,-7,-26+bob,14,4);pixel(ctx,c,-7,-22+bob,3,10);pixel(ctx,c,4,-22+bob,3,10);pixel(ctx,look.accent,-6,-26+bob,12,1);}if(look)pixel(ctx,look.accent,-4,-15+bob,8,1);
 if(options.helmet||options.team==='hostile'){pixel(ctx,'#253b46',-6,-24+bob,12,7);pixel(ctx,options.team==='hostile'?'#d9a07b':'#91c8ce',-4,-19+bob,9,3);pixel(ctx,'#152e3b',-5,-24+bob,10,2);pixel(ctx,c,-8,-14+bob,3,5);pixel(ctx,c,5,-14+bob,3,5);}
 if(armed){
  const dx=Math.cos(angle),dy=Math.sin(angle),gx=dx*7,gy=-11+dy*7,mx=dx*19,my=-11+dy*19;
  pixelLine(ctx,gx,gy,mx,my,'#0b1d29',5);pixelLine(ctx,gx,gy,mx,my,'#b7cbcb',3);pixelLine(ctx,gx-dy*2,gy+dx*2,gx-dy*5,gy+dx*5,'#38505c',3);
  pixel(ctx,skin,gx-2,gy-2,3,3);pixel(ctx,options.team==='hostile'?'#eea58b':'#91e4df',dx*12-1,-12+dy*12,2,2);
  if(options.firing||(options.attackUntil||0)>time){pixel(ctx,'#fff1c6',mx+dx*3-2,my+dy*3-2,5,5);pixel(ctx,'#f2bc75',mx+dx*7-1,my+dy*7-1,3,3);}
 }else if(equipped){
  pixel(ctx,'#102534',6,-10,5,9);pixel(ctx,'#b1c8c5',7,-10,3,5);pixel(ctx,'#83d5d0',7,-9,2,2);
 }
 if(options.carried){pixel(ctx,'#785d43',-9,-10,18,11);pixel(ctx,'#c2a572',-8,-10,16,3);pixel(ctx,'#e8d39c',-1,-8,2,9);}
 ctx.restore();
}
function drawProp(ctx,d,m,time,emit){
 const{x,y,w,h}=d,p=m.palette||PALETTES[m.biome]||PALETTES.station,c=d.color||p.accent;
 if(d.kind==='vesselmark'){
  pixel(ctx,'#162b34',x,y,w,h);pixel(ctx,c,x,y,3,h);pixel(ctx,c,x+w-3,y,3,h);pixel(ctx,c,x+7,y+h-2,w-14,1);
  if(emit)emit(String(m.vesselName).replace(/ · interior$/i,'').slice(0,28).toUpperCase(),x+w/2,y+3,c,13,'center',28,'vessel');return;
 }
 if(d.kind==='floorarrows'){for(let i=0;i<3;i++){const xx=x+14+i*18,yy=y+h/2;pixelLine(ctx,xx-4,yy-4,xx+1,yy,c);pixelLine(ctx,xx+1,yy,xx-4,yy+4,c);}return;}
 if(d.kind==='awning'){pixel(ctx,'#283b40',x,y+3,w,h+3);pixel(ctx,c,x,y,w,h);for(let i=3;i<w;i+=13)pixel(ctx,'#d2c3a0',x+i,y,4,h-2);pixel(ctx,'#514b42',x,y+h-2,w,3);return;}
 if(d.kind==='planter'){pixel(ctx,'#1a3238',x+2,y+6,w-4,h-1);pixel(ctx,'#8b8f75',x,y,w,h-4);pixel(ctx,'#c4b994',x+2,y,w-4,3);pixel(ctx,'#304d3e',x+4,y+4,w-8,h-11);for(let yy=7;yy<h-9;yy+=10)for(let xx=7;xx<w-7;xx+=10){pixel(ctx,c,x+xx-2,y+yy-3,6,7);pixel(ctx,'#a3c28a',x+xx-1,y+yy-4,3,3);}return;}
 if(d.kind==='roomstripe'){pixel(ctx,c,x,y,w,2);return;}
 if(d.kind==='doorframe'){
  if(w>h){pixel(ctx,'#142d36',x,y,w,3);pixel(ctx,c,x,y,3,h);pixel(ctx,c,x+w-3,y,3,h);pixel(ctx,'#c4d4b0',x+4,y+2,4,2);pixel(ctx,'#c4d4b0',x+w-8,y+2,4,2);}
  else{pixel(ctx,c,x,y,w,3);pixel(ctx,c,x,y+h-3,w,3);pixel(ctx,'#a8c7b4',x+3,y+5,2,5);pixel(ctx,'#a8c7b4',x+w-5,y+h-10,2,5);}return;
 }
 if(d.kind==='airlock'){pixel(ctx,'#30434a',x,y,w,h);pixel(ctx,'#182f39',x+3,y+3,w-6,h-6);for(let i=3;i<w-4;i+=8){pixel(ctx,c,x+i,y,4,3);pixel(ctx,c,x+i,y+h-3,4,3);}pixel(ctx,'#6a8a90',x+w/2-1,y+5,2,h-10);return;}
 if(d.kind==='bunk'){
  pixel(ctx,'#0b202b',x-2,y+4,w+4,h+2);pixel(ctx,'#5e7782',x,y,w,h);pixel(ctx,'#a2b1a6',x+2,y+2,w-4,2);pixel(ctx,'#d3d6be',x+4,y+8,w-8,13);pixel(ctx,'#3c5963',x+3,y+23,w-6,h-27);pixel(ctx,c,x+4,y+24,w-8,h-32);pixel(ctx,'#bac3b0',x+4,y+24,w-8,3);pixel(ctx,'#263f4a',x+4,y+h-13,w-8,5);pixel(ctx,'#c9bb8b',x+8,y+h-11,8,1);pixel(ctx,'#8ac8b9',x+w-4,y+5,2,4);return;
 }
 if(d.kind==='armory'){
  pixel(ctx,'#172c36',x,y+2,w,h);pixel(ctx,c,x+1,y,w-2,h-3);pixel(ctx,'#263d48',x+3,y+4,w-6,h-9);
  for(let i=7;i<w-5;i+=14){pixel(ctx,'#aeb8ad',x+i,y+7,3,10);pixel(ctx,'#d0b780',x+i-2,y+13,5,3);}pixel(ctx,'#d7b176',x+w-5,y+3,2,2);return;
 }
 if(d.kind==='commandtable'){
  pixel(ctx,'#112b35',x+2,y+8,w-4,h-4);pixel(ctx,'#577e84',x,y+2,w,h-9);pixel(ctx,'#153e4b',x+4,y+6,w-8,h-17);pixelRing(ctx,x+w/2,y+h/2,w*.27,h*.21,'#79b8b9');pixelLine(ctx,x+8,y+h/2,x+w-8,y+h/2,'#417c85');pixel(ctx,'#e6d09d',x+w*.61,y+h*.44,3,3);return;
 }
 if(d.kind==='banner'){pixel(ctx,'#203942',x,y,w,h);pixel(ctx,c,x+2,y+1,w-4,3);pixel(ctx,c,x+w/2-3,y+7,6,Math.max(3,h-11));return;}
 if(d.kind==='vending'){pixel(ctx,'#142c35',x,y+4,w,h);pixel(ctx,c,x,y,w,h-2);pixel(ctx,'#17343f',x+3,y+3,w-6,h-8);for(let i=4;i<w-7;i+=6)pixel(ctx,i%3?'#d3bd82':'#87bbaa',x+i,y+6,4,5);pixel(ctx,'#aacac0',x+w-5,y+5,2,3);pixel(ctx,'#162e36',x+4,y+h-5,w-8,3);return;}

 if(d.kind==='trail-light'){pixel(ctx,'#263e42',x+9,y-6,4,27);pixel(ctx,'#7e9189',x+7,y-8,8,4);pixel(ctx,c,x+8,y-7,6,2);pixel(ctx,'#334a48',x+5,y+20,12,2);return;}
 if(d.kind==='cave-mouth'){
  pixel(ctx,'#263439',x,y+16,w,h-16);pixel(ctx,'#73766e',x+5,y+5,w-10,h-11);pixel(ctx,'#96988b',x+18,y,w-37,8);pixel(ctx,'#3c4546',x+11,y+15,w-23,h-22);pixel(ctx,'#07141b',x+w*.29,y+21,w*.43,h-22);pixel(ctx,'#1b2b31',x+w*.34,y+16,w*.31,9);pixel(ctx,'#5d6861',x+7,y+h-5,w-14,4);pixel(ctx,'#adb19c',x+10,y+10,11,3);return;
 }
 if(d.kind==='igloo'){
  pixel(ctx,'#3d5d68',x,y+h-6,w,9);pixel(ctx,c,x+5,y+18,w-10,h-21);pixel(ctx,c,x+16,y+7,w-32,17);pixel(ctx,'#e0e7dc',x+29,y+1,w-58,9);for(let yy=22;yy<h-6;yy+=13)pixel(ctx,'#8daaad',x+9,y+yy,w-18,2);for(let xx=16;xx<w-12;xx+=19)pixel(ctx,'#8daaad',x+xx,y+22,2,15);pixel(ctx,'#314d5a',x+w*.39,y+h-24,w*.24,24);pixel(ctx,'#102c3b',x+w*.44,y+h-19,w*.14,19);return;
 }
 if(d.kind==='frontier-hut'||d.kind==='dome'){
  pixel(ctx,'#152b34',x-4,y+h-5,w+8,10);pixel(ctx,c,x+4,y+17,w-8,h-20);pixel(ctx,'#5f777c',x+1,y+10,w-2,12);pixel(ctx,'#aebbb0',x+10,y+6,w-20,5);pixel(ctx,'#263e4b',x+w*.4,y+h-28,w*.23,28);pixel(ctx,'#b8c8b4',x+w*.39,y+h-31,w*.25,3);pixel(ctx,'#264b5c',x+11,y+24,18,12);pixel(ctx,'#90b7bb',x+12,y+24,16,2);pixel(ctx,'#667c7c',x+6,y+h-8,22,2);if(d.kind==='dome'){pixel(ctx,'#829b9e',x+15,y-9,w-30,18);pixel(ctx,'#a9bebb',x+27,y-16,w-54,9);pixel(ctx,'#344f5c',x+w*.6,y-9,4,18);pixel(ctx,'#8da5a4',x+w*.63,y-24,3,20);}return;
 }
 if(d.kind==='stalagmite'){pixel(ctx,'#293337',x+2,y+17,22,7);pixel(ctx,c,x+6,y+3,14,20);pixel(ctx,'#a3a699',x+11,y-7,5,19);pixel(ctx,'#566365',x+16,y+9,7,14);return;}
 if(d.kind==='bones'){pixel(ctx,'#9e9b83',x+3,y+10,29,3);pixel(ctx,'#c4bea0',x+8,y+5,3,15);pixel(ctx,'#c4bea0',x+15,y+6,3,12);pixel(ctx,'#a5a28d',x+23,y+7,3,10);pixel(ctx,'#b7b29a',x+33,y+8,9,7);pixel(ctx,'#394246',x+37,y+9,3,2);return;}
 if(d.kind==='clawmarks'){for(let i=0;i<3;i++)pixelLine(ctx,x+7+i*8,y+3,x+1+i*8,y+17,'#8d6e61',2);return;}
 if(d.kind==='heater'){pixel(ctx,'#192e38',x+3,y+6,w-6,h-7);pixel(ctx,c,x+5,y+3,w-10,h-10);for(let yy=12;yy<h-8;yy+=7)pixel(ctx,'#374e57',x+8,y+yy,w-16,3);pixel(ctx,'#a6b5aa',x+w-10,y+6,3,3);return;}
 if(d.kind==='pipe'){pixel(ctx,'#2d444a',x+4,y,8,h);pixel(ctx,c,x+5,y,5,h);for(let yy=5;yy<h;yy+=22)pixel(ctx,'#b1b2a1',x+2,y+yy,11,3);return;}
 if(d.kind==='coat'){pixel(ctx,'#b5aa8d',x+11,y-5,2,5);pixel(ctx,c,x+6,y,12,20);pixel(ctx,c,x+2,y+2,4,12);pixel(ctx,c,x+18,y+2,4,12);pixel(ctx,'#3c4c4e',x+11,y+1,2,19);return;}
 if(d.kind==='boots'){pixel(ctx,'#1b2b31',x+2,y+5,8,11);pixel(ctx,c,x+2,y+5,6,8);pixel(ctx,'#1b2b31',x+12,y+3,8,11);pixel(ctx,c,x+12,y+3,6,8);return;}
 if(d.kind==='label'){if(emit)emit(d.text,x+2,y+3,c,13,'left',8,'room');else text(ctx,d.text,x+2,y+4,c,8);return;}
 if(d.kind==='light'){pixel(ctx,'#16282f',x,y,w,h+4);pixel(ctx,c,x+4,y+1,w-8,2);ctx.globalAlpha=.08;pixel(ctx,c,x-8,y+4,w+16,20);ctx.globalAlpha=1;return;}
 if(d.kind==='window'){
  pixel(ctx,'#0d1c2b',x,y,w,h);pixel(ctx,'#88adb1',x,y,w,2);pixel(ctx,'#35545e',x,y+h-2,w,2);
  for(let i=6;i<w;i+=23){pixel(ctx,'#476a7c',x+i,y+7,1,1);pixel(ctx,'#99b4bb',x+i+10,y+15,1,1);pixel(ctx,'#3d5c66',x+i+17,y+1,2,h-2);}return;
 }
 if(d.kind==='bench'){pixel(ctx,'#182b32',x+3,y+h-5,w-6,5);pixel(ctx,c,x,y+4,w,h-8);pixel(ctx,'#92aaa2',x,y+4,w,3);pixel(ctx,'#263b43',x+3,y+h-4,3,5);pixel(ctx,'#263b43',x+w-6,y+h-4,3,5);return;}
 if(d.kind==='cargo'){
  pixel(ctx,'#172b32',x+3,y+h-2,w,h*.2);pixel(ctx,c,x,y+4,w,h-4);pixel(ctx,'#b4ad91',x+2,y+2,w-4,4);pixel(ctx,'#4f5956',x+3,y+9,w-6,h-14);
  pixel(ctx,c,x+w/2-2,y+5,4,h-7);pixel(ctx,'#cdb77e',x+4,y+h-10,8,4);return;
 }
 if(d.kind==='bed'){pixel(ctx,'#27373b',x+2,y+2,w-4,h-3);pixel(ctx,'#cbd1bc',x+4,y+5,w-8,9);pixel(ctx,c,x+3,y+16,w-6,h-19);pixel(ctx,'#526e72',x+3,y+h-6,w-6,4);return;}
 if(d.kind==='bar'||d.kind==='workbench'){
  pixel(ctx,'#1a2c31',x,y+6,w,h-3);pixel(ctx,c,x,y,w,h-5);pixel(ctx,'#b8a88a',x,y,w,3);pixel(ctx,'#3d4844',x+2,y+h-7,w-4,4);
  for(let i=8;i<w-9;i+=23){pixel(ctx,d.kind==='bar'?'#b1ba88':'#b6b7a3',x+i,y+5,4,6);pixel(ctx,'#678c8c',x+i+7,y+6,6,3);}return;
 }
 if(d.kind==='table'){pixel(ctx,'#1d2e31',x+3,y+9,w-6,h-4);pixel(ctx,c,x,y+2,w,h-8);pixel(ctx,'#b3a183',x,y+2,w,3);pixel(ctx,'#9bbcac',x+w/2-2,y+8,5,5);return;}
 if(d.kind==='cabinet'||d.kind==='books'){
  pixel(ctx,'#1b2c32',x,y+3,w,h-2);pixel(ctx,c,x+1,y,w-2,h-4);for(let j=7;j<h-5;j+=10){pixel(ctx,'#2e4248',x+3,y+j,w-6,2);if(d.kind==='books')for(let i=3;i<w-4;i+=5)pixel(ctx,i%2?'#b7a483':'#719c9d',x+i,y+j-5,3,5);}return;
 }
 if(d.kind==='console'||d.kind==='equipment'){
  pixel(ctx,'#162d36',x,y+4,w,h);pixel(ctx,c,x,y,w,h-3);pixel(ctx,'#142b37',x+3,y+3,w-6,Math.max(7,h-11));
  for(let i=7;i<w-3;i+=15){pixel(ctx,'#7cb9b5',x+i,y+7,6,2);pixel(ctx,'#497b88',x+i,y+11,9,1);pixel(ctx,(Math.floor(time)+i)%3?'#d8c18b':'#6ab49d',x+i,y+h-7,2,2);}return;
 }
 if(d.kind==='engine'){
  pixel(ctx,'#172b35',x+2,y+3,w-4,h);pixel(ctx,c,x+5,y,w-10,h-3);pixel(ctx,'#7c9fa5',x+7,y,w-14,5);
  for(let j=8;j<h-7;j+=9){pixel(ctx,'#182e3a',x+3,y+j,w-6,5);pixel(ctx,'#78c3bd',x+12,y+j+1,w-24,2);}
  ctx.globalAlpha=.08+Math.sin(time*2)*.025;pixel(ctx,'#84dad0',x-5,y-3,w+10,h+10);ctx.globalAlpha=1;return;
 }
 if(d.kind==='plant'||d.kind==='grass'){
  if(d.kind==='plant'){pixel(ctx,'#675d4b',x+6,y+14,13,9);pixel(ctx,'#ac9d7d',x+5,y+13,15,3);}
  pixel(ctx,c||'#6b9b71',x+10,y+4,4,14);pixel(ctx,'#6a9774',x+4,y+5,7,7);pixel(ctx,'#87ac7a',x+13,y+1,7,9);if(d.kind==='grass'){pixel(ctx,p.ground,x,y+16,24,8);pixel(ctx,p.accent,x+6,y+11,2,5);}return;
 }
 if(d.kind==='tree'){
  pixel(ctx,'#172b2b',x+1,y+17,25,8);pixel(ctx,'#806b4d',x+9,y+2,6,19);pixel(ctx,'#254e3d',x-7,y-21,34,29);pixel(ctx,'#315c44',x-10,y-15,40,16);pixel(ctx,'#497f50',x-5,y-23,28,19);pixel(ctx,'#669555',x,y-21,17,5);pixel(ctx,'#80a660',x+4,y-19,3,3);return;
 }
 if(d.kind==='cactus'){pixel(ctx,'#2d594a',x+9,y-5,7,27);pixel(ctx,'#6c9870',x+10,y-4,2,23);pixel(ctx,'#2d594a',x+3,y+5,7,5);pixel(ctx,'#2d594a',x+3,y-1,4,10);pixel(ctx,'#51765a',x+15,y+1,6,5);pixel(ctx,'#51765a',x+19,y-6,4,10);return;}
 if(d.kind==='rock'||d.kind==='ice'){
  const icy=d.kind==='ice';pixel(ctx,icy?'#3b5d6a':'#343e40',x+2,y+17,21,7);pixel(ctx,icy?'#91b9bd':m.biome==='arid'?'#a18b6c':'#77716d',x+2,y+8,20,13);pixel(ctx,icy?'#b9d3cf':m.biome==='arid'?'#b09a76':'#89827b',x+6,y+3,13,9);pixel(ctx,icy?'#668e9c':'#59544f',x+17,y+12,5,10);return;
 }
 if(d.kind==='fountain'){pixel(ctx,'#283e3e',x,y+8,w,h-8);pixel(ctx,'#b0afa0',x+2,y+3,w-4,h-9);pixel(ctx,'#2e6873',x+6,y+7,w-12,h-17);pixel(ctx,'#a4b4a7',x+w/2-4,y+2,8,h-12);pixel(ctx,'#9ec3bc',x+w/2-5,y,10,5);return;}
 if(d.kind==='fence'){for(let i=1;i<w;i+=14)pixel(ctx,c,x+i,y-4,3,14);pixel(ctx,c,x,y,w,2);pixel(ctx,c,x,y+5,w,2);return;}
 if(d.kind==='antenna'){pixel(ctx,'#22343a',x+3,y+h-3,w-2,5);pixel(ctx,c,x+w/2-2,y,4,h);pixel(ctx,c,x+2,y+7,w-4,3);pixel(ctx,'#cfbd8b',x+5,y,15,3);pixel(ctx,'#79b4b4',x+8,y+11,8,9);return;}
 if(d.kind==='debris'){pixel(ctx,c,x+3,y+4,13,3);pixel(ctx,'#a28d79',x+12,y+12,7,4);pixel(ctx,'#334c54',x+3,y+18,9,2);return;}
 if(d.kind==='sign'){pixel(ctx,'#524d3d',x+10,y+9,3,17);pixel(ctx,'#243b3c',x-2,y-2,64,13);if(emit)emit(d.text,x+1,y,c,12,'left',12,'sign');else text(ctx,d.text,x+1,y,c,7);return;}
 if(d.kind==='shuttle'){
  pixel(ctx,'#1c3039',x-4,y+5,w+8,h-3);pixel(ctx,'#446775',x-7,y+13,14,h-15);pixel(ctx,'#446775',x+w-7,y+13,14,h-15);pixel(ctx,c,x+5,y,w-10,h-6);pixel(ctx,'#bfd1c2',x+12,y-4,w-24,7);pixel(ctx,'#244c5f',x+w/2-15,y+5,30,11);pixel(ctx,'#b8c7b0',x+w/2-12,y+5,24,2);pixel(ctx,'#d4b575',x+11,y+25,12,4);pixel(ctx,'#d4b575',x+w-23,y+25,12,4);return;
 }
 if(d.kind==='dockship'){pixel(ctx,'#294651',x+6,y+6,w-12,h-12);pixel(ctx,c,x+11,y+1,w-22,h-2);pixel(ctx,'#d3c18b',x+w-8,y+h/2-9,18,18);pixel(ctx,'#5d96a6',x+12,y+9,w-24,24);}
}
function isDone(entity,flags){return!!entity.completed||flags.has(entity.data?.flag)||flags.has('done:'+entity.id)||flags.has(entity.id);}
function drawEntity(ctx,e,m,time,flags,near){
 if(e.hidden)return;
 const{x,y,color:c}=e,done=isDone(e,flags);
 if(['npc','crew','mechanic','medic'].includes(e.type)&&!e.data?.automated){drawCharacter(ctx,x,y,{id:e.id,color:c,facing:e.facing||'down',time,health:e.data?.health,role:e.role});if(e.type==='medic'){pixel(ctx,'#e7e5c9',x-3,y-21,6,3);pixel(ctx,'#d47b6c',x-1,y-22,2,5);}}
 else if(e.type==='station'){
  pixel(ctx,'#0e2733',x-14,y-21,28,26);pixel(ctx,'#557985',x-13,y-23,26,22);pixel(ctx,'#173a48',x-10,y-20,20,12);pixel(ctx,c,x-8,y-18,16,2);pixel(ctx,c,x-2,y-17,4,7);pixel(ctx,'#a9c9bd',x-8,y-5,3,2);pixel(ctx,'#dcc59a',x+5,y-5,3,2);
  if(e.data?.stationRole==='medical'){pixel(ctx,'#bfe1c9',x-6,y-14,12,3);pixel(ctx,'#bfe1c9',x-2,y-18,4,11);}
  if(e.data?.stationRole==='security'){pixel(ctx,'#d0ae8d',x-5,y-17,10,6);pixel(ctx,'#d0ae8d',x-3,y-11,6,3);}
 }
 else if(e.type==='bunk'){pixel(ctx,e.data?.assignedTo?'#9cc8a3':'#7c91a8',x-6,y-5,12,2);pixel(ctx,'#2c424c',x-5,y-3,10,4);}
 else if(e.type==='exit'&&e.data?.stationRole==='helm'){
  pixel(ctx,'#102b36',x-10,y-18,20,23);pixel(ctx,'#9baea6',x-9,y-21,18,12);pixel(ctx,'#537581',x-7,y-19,14,11);pixel(ctx,'#c5b991',x-10,y-8,20,5);pixel(ctx,'#617c85',x-13,y-13,4,15);pixel(ctx,'#617c85',x+9,y-13,4,15);
 }
 else if(e.type==='siteEntrance'){pixelRing(ctx,x,y,14,6,c,{dashed:true});pixel(ctx,'#dce4c9',x-1,y-9,3,5);return;}
 else if(e.type==='siteExit'||e.type==='exit'){
  pixel(ctx,'#122e38',x-15,y-10,30,22);pixel(ctx,'#527981',x-14,y-9,28,2);pixel(ctx,'#a9b6a6',x-11,y+10,22,2);
  for(let i=0;i<3;i++){const yy=y-5+i*5;pixel(ctx,c,x-4,yy,8,2);pixel(ctx,c,x-2,yy+2,4,2);}return;
 }
 else if(e.type==='delivery'){
  pixel(ctx,'#394b4a',x-20,y-15,40,31);for(let i=-18;i<19;i+=8){pixel(ctx,c,x+i,y-15,5,3);pixel(ctx,c,x+i,y+13,5,3);}pixel(ctx,c,x-20,y-13,3,26);pixel(ctx,c,x+17,y-13,3,26);
  pixel(ctx,'#dccb9c',x-2,y-8,4,9);pixel(ctx,'#dccb9c',x-6,y-1,12,2);pixel(ctx,'#dccb9c',x-4,y+1,8,2);pixel(ctx,'#dccb9c',x-2,y+3,4,2);return;
 }
 else if(e.type==='sample'){
  if(done)return;
  pixel(ctx,'#1c363b',x-8,y-1,16,5);pixel(ctx,m.biome==='volcanic'?'#d1a684':m.biome==='ice'?'#b9e4dd':'#9ed0ad',x-3,y-16,7,15);pixel(ctx,m.biome==='arid'?'#d0bd7b':'#7ab8b0',x-8,y-9,5,9);pixel(ctx,'#cde5c6',x-2,y-16,3,5);pixel(ctx,'#abc7a2',x+5,y-11,4,9);
  if(Math.floor(time*2)%2===0)pixel(ctx,'#dfeecb',x+9,y-19,2,2);
 }
 else if(e.type==='siteCache'){pixel(ctx,'#162b34',x-12,y-1,24,5);pixel(ctx,done?'#596965':'#9d8b68',x-11,y-16,22,18);pixel(ctx,done?'#2a3c40':'#cbb68a',x-11,y-17,22,4);pixel(ctx,'#30454a',x-8,y-10,16,7);pixel(ctx,done?'#647a75':'#afd4bc',x-2,y-12,4,4);}
 else if(e.type==='siteRecord'){pixel(ctx,'#2b3e44',x-11,y-6,22,8);pixel(ctx,'#bcbca2',x-8,y-17,16,17);pixel(ctx,'#dae0c2',x-7,y-17,14,2);for(let j=0;j<3;j++)pixel(ctx,'#687f7d',x-5,y-12+j*3,10,1);}
 else if(e.type==='crate'){
  if(done||flags.has(e.data?.carriedFlag))return;
  pixel(ctx,'#192d32',x-10,y-1,22,5);pixel(ctx,'#806749',x-10,y-16,20,18);pixel(ctx,c,x-9,y-17,18,4);pixel(ctx,'#a98b59',x-7,y-12,14,11);pixel(ctx,'#dec98e',x-2,y-14,4,15);pixel(ctx,'#404844',x+4,y-10,3,4);
 }
 else if(e.type==='jobboard'){
  pixel(ctx,'#182e35',x-12,y-24,24,27);pixel(ctx,'#567b79',x-13,y-26,26,22);pixel(ctx,'#1b3e46',x-10,y-23,20,16);pixel(ctx,'#b3cfb6',x-7,y-20,4,4);pixel(ctx,'#d6c08b',x+1,y-20,6,1);pixel(ctx,'#7faaa0',x+1,y-17,5,1);pixel(ctx,'#77bba6',x-7,y-12,14,2);pixel(ctx,'#547b7a',x-10,y-4,3,7);pixel(ctx,'#547b7a',x+7,y-4,3,7);
 }
 else{
  const ec=done?'#80bea6':e.type==='work'?'#dca167':c;
  pixel(ctx,'#152a35',x-10,y-21,20,24);pixel(ctx,'#48616a',x-10,y-23,20,20);pixel(ctx,'#152e3a',x-7,y-20,14,10);pixel(ctx,ec,x-5,y-18,10,2);pixel(ctx,'#668f97',x-5,y-14,6,1);pixel(ctx,ec,x-7,y-6,3,2);pixel(ctx,'#9bb1aa',x-1,y-6,5,2);pixel(ctx,'#344c56',x-8,y-2,16,3);
 }
 if(done&&e.type==='work'){pixelLine(ctx,x-4,y-29,x-1,y-26,'#9dd4ac');pixelLine(ctx,x-1,y-26,x+5,y-32,'#9dd4ac');}
 if(near){
  const yy=y-36+Math.round(Math.sin(time*3));pixel(ctx,'#e5d7ac',x-2,yy,4,2);pixel(ctx,'#e5d7ac',x-1,yy+2,2,2);
 }
}
function shortRole(e){if(e.type==='siteExit')return'SURFACE';if(e.type==='siteEntrance')return'EXPLORE';if(e.type==='exit')return e.role;return{jobboard:'CONTRACTS',mechanic:'SHIPWRIGHT',medic:'MEDIC',terminal:'ARCHIVE',work:'RELAY',crate:'CARGO',delivery:'LOADING',sample:'SAMPLE',crew:'CREW',bunk:'BERTH',station:e.data?.stationRole?.toUpperCase()||'STATION'}[e.type]||e.name;}
function actorHealth(ctx,actor,time){
 const health=Number(actor.health??actor.hp??100),maximum=Math.max(1,Number(actor.maxHealth??actor.maxHp??100)),hostile=actor.team==='hostile'||actor.hostile===true;
 if(health<=0)return;
 if(hostile||health<maximum||actor.showHealth){const x=Math.round(actor.x)-12,y=Math.round(actor.y)-34;pixel(ctx,'#10232b',x-1,y-1,26,5);pixel(ctx,hostile?'#653c38':'#3b5956',x,y,24,3);pixel(ctx,hostile?'#e79a7b':'#9acbb0',x,y,Math.round(24*clamp(health/maximum,0,1)),3);}
 if((actor.hurtUntil||actor.hitUntil||0)>time){pixel(ctx,'#eab49b',actor.x-10,actor.y-18,2,2);pixel(ctx,'#eab49b',actor.x+9,actor.y-7,2,2);}
}
function aimBracket(ctx,x,y,color){
 for(const sx of[-1,1])for(const sy of[-1,1]){const px=x+sx*13,py=y+sy*15;pixel(ctx,color,px-(sx>0?4:0),py,5,1);pixel(ctx,color,px,py-(sy>0?4:0),1,5);}
}
function drawCombatAim(ctx,person,aim){
 if(!aim||person.health<=0)return;
 const angle=aim.angle??facingAngle(person.facing),dx=Math.cos(angle),dy=Math.sin(angle),color=aim.targetId?'#e9d395':aim.manual?'#9ed9d5':'#859d9d';
 pixelRing(ctx,person.x,person.y,12,5,'#b7d4c1',{dashed:true});
 const end=aim.to||{x:aim.targetX,y:aim.targetY},length=Math.min(58,Math.hypot(end.x-person.x,end.y-person.y));
 ctx.globalAlpha=.6;for(let d=25;d<length;d+=9)pixelLine(ctx,person.x+dx*d,person.y-11+dy*d,person.x+dx*(d+3),person.y-11+dy*(d+3),color);ctx.globalAlpha=1;
 if(aim.targetId)aimBracket(ctx,end.x,end.y-13,color);
 else if(aim.manual){const x=end.x,y=end.y-11;pixelLine(ctx,x-4,y,x+4,y,color);pixelLine(ctx,x,y-4,x,y+4,color);pixel(ctx,'#0a202b',x-1,y-1,3,3);}
}
function drawCombatEffects(ctx,effects,emit){
 for(const effect of effects){
  const age=effect.age||0,progress=effect.progress||0,color=effect.team==='hostile'?'#efa58b':effect.team==='friendly'?'#9bdedb':'#f3df9e',to=effect.to;
  if(!to||!Number.isFinite(to.x)||!Number.isFinite(to.y))continue;
  if(effect.kind==='shot'&&effect.from){
   const from=effect.from,angle=Math.atan2(to.y-from.y,to.x-from.x),dx=Math.cos(angle),dy=Math.sin(angle),distance=Math.hypot(to.x-from.x,to.y-from.y),offset=Math.min(20,distance),sx=from.x+dx*offset,sy=from.y-11+dy*offset,tx=to.x,ty=to.y-11;
   ctx.globalAlpha=Math.max(.14,1-progress)*.38;pixelLine(ctx,sx,sy,tx,ty,color,3);ctx.globalAlpha=Math.max(.25,1-progress);pixelLine(ctx,sx,sy,tx,ty,'#fff0ce');
   if(age<.13){pixel(ctx,color,sx-3,sy-3,7,7);pixel(ctx,'#fff5da',sx-2,sy-2,4,4);pixel(ctx,color,sx+dx*5-1,sy+dy*5-1,3,3);}
   const burst=3+Math.floor(progress*7);for(let i=0;i<4;i++){const a=angle+i*Math.PI/2;pixel(ctx,color,tx+Math.cos(a)*burst,ty+Math.sin(a)*burst,2,2);}ctx.globalAlpha=1;
  }else if(effect.kind==='hit'){
   if(age<.26){const r=11+Math.floor(age*12);for(const s of[-1,1]){pixel(ctx,color,to.x+s*r,to.y-18,2,3);pixel(ctx,color,to.x+s*(r-4),to.y-26,2,2);}}
   if(effect.damage>0)emit(`−${Math.round(effect.damage)}`,to.x,to.y-49-Math.round(progress*12),color,16,'center',110,'combat-hit');
  }else if(effect.kind==='down'){
   const name=effect.actorName||(effect.team==='player'?'You':effect.team==='friendly'?'Crew':'Hostile');
   emit(`DOWN · ${name}`,to.x,to.y-31-Math.round(progress*6),color,13,'center',98,'combat-down');
  }
 }
}
/** Wildlife has its own silhouette; it is never a recolored human boarder. */
function drawWildlife(ctx,actor,time){
 const x=Math.round(actor.x),y=Math.round(actor.y),small=actor.species==='skitter',dead=actor.health<=0,step=actor.moving?Math.sin(time*15)>0?2:-2:0,c=(actor.hitUntil||0)>time?'#e2c3a6':actor.color||'#a5967e';
 pixel(ctx,'#101b20',x-(small?15:21),y-1,small?30:42,5);
 if(dead){pixel(ctx,'#4a4a43',x-16,y-8,30,9);pixel(ctx,'#777668',x-12,y-10,23,5);pixel(ctx,'#615246',x+9,y-7,10,4);return;}
 const left=actor.facing==='left',front=left?-1:1;
 for(const side of[-1,1])for(const offset of[-8,7]){pixelLine(ctx,x+offset,y-7,x+offset+side*(small?9:10),y+1+step*side,c,3);pixel(ctx,'#c4bb9e',x+offset+side*(small?9:10),y+1+step*side,4,2);}
 pixel(ctx,'#3c4947',x-(small?11:16),y-(small?14:20),small?23:33,15);pixel(ctx,c,x-(small?10:14),y-(small?17:23),small?20:29,11);
 if(!small){for(const offset of[-10,0,10]){pixel(ctx,'#c1bba4',x+offset-3,y-27+Math.abs(offset)/5,7,8);pixel(ctx,'#6d7569',x+offset-3,y-18,7,7);}}
 pixel(ctx,'#44564d',x+front*(small?10:15)-5,y-13,11,9);pixel(ctx,actor.windup>0?'#eec179':'#ced3aa',x+front*(small?13:18)-1,y-12,3,2);pixel(ctx,'#d8c7a4',x+front*(small?17:22)-2,y-7,4,2);
 if(actor.windup>0){pixelRing(ctx,x,y,small?19:26,9,'#e1a378',{dashed:true,phase:Math.floor(time*9)});pixel(ctx,'#f1cf91',x-2,y-36,4,6);}
}
function drawSiteAir(ctx,surface,person,cameraX,cameraY,width,height,time){
 if(surface.atmosphere==='cave'){
  const radius=210;ctx.globalAlpha=.24;pixel(ctx,'#030c13',cameraX,cameraY,Math.max(0,person.x-radius-cameraX),height);pixel(ctx,'#030c13',person.x+radius,cameraY,Math.max(0,cameraX+width-person.x-radius),height);pixel(ctx,'#030c13',Math.max(cameraX,person.x-radius),cameraY,Math.min(width,radius*2),Math.max(0,person.y-radius-cameraY));pixel(ctx,'#030c13',Math.max(cameraX,person.x-radius),person.y+radius,Math.min(width,radius*2),Math.max(0,cameraY+height-person.y-radius));ctx.globalAlpha=1;
 }
 for(let i=0;i<10;i++){const x=cameraX+noise(i,3,surface.seed)*width,y=cameraY+(noise(i,8,surface.seed)*height+time*(surface.atmosphere==='ice'?9:2))%height;pixel(ctx,surface.atmosphere==='ice'?'#a9c7cc':'#778887',x,y,1,1);}
}
function normalizedActors(options){
 const list=[];
 for(const a of options.remotePeople||[])if(a&&(!a.mode||a.mode==='person'))list.push({...a,remote:true});
 const board=options.boardingActors||[],actors=Array.isArray(board)?board:[...(board.enemies||[]),...(board.allies||[])];
 for(const a of actors)if(a)list.push(a);
 for(const a of options.exploration?.monsters||[])if(a)list.push(a);
 const ids=new Set();return list.filter(a=>{const id=a.id||a.captainId;if(a.hidden||!Number.isFinite(a.x)||!Number.isFinite(a.y)||id&&ids.has(id))return false;if(id)ids.add(id);return true;});
}
function visibleHomes(surface,options){
 const ids=new Set();return(options.homes||[]).filter(h=>{
  if(!h||!['room','outpost'].includes(h.kind)||!Number.isFinite(h.x)||!Number.isFinite(h.y)||h.locationId&&h.locationId!==surface.id||h.systemId&&surface.systemId&&h.systemId!==surface.systemId||h.x<0||h.y<0||h.x>=surface.width||h.y>=surface.height||h.id&&ids.has(h.id))return false;
  if(h.id)ids.add(h.id);return true;
 });
}
function drawHomeMarker(ctx,home,localCaptainId,time,raised=false){
 const mine=!!localCaptainId&&home.ownerId===localCaptainId,c=mine?'#e5be79':'#8ec8d2',shade=mine?'#806d4d':'#4f7f88',x=Math.round(home.x),y=Math.round(home.y);
 if(!raised){
  pixel(ctx,'#18323c',x-15,y-9,30,16);pixel(ctx,shade,x-14,y+6,28,2);
  for(const side of[-1,1]){pixel(ctx,c,x+side*16-(side>0?4:0),y-10,4,1);pixel(ctx,c,x+side*16,y-10,1,5);pixel(ctx,c,x+side*16-(side>0?4:0),y+9,4,1);}
  // A floor-level bed insignia marks a registered room without inventing walls.
  if(home.kind==='room'){pixel(ctx,c,x-8,y-5,2,10);pixel(ctx,c,x-6,y-1,15,4);pixel(ctx,c,x+8,y-1,2,6);pixel(ctx,'#d4ded0',x-4,y-4,5,3);pixel(ctx,shade,x+2,y-4,6,3);}return;
 }
 if(home.kind!=='outpost')return;
 // The supplied coordinates remain walkable: this small supply/beacon pod is art.
 pixel(ctx,'#0d2532',x-12,y-20,24,24);pixel(ctx,'#536d77',x-11,y-19,22,18);pixel(ctx,'#92aaa7',x-11,y-19,22,3);pixel(ctx,'#25414e',x-9,y-13,18,11);
 pixel(ctx,c,x-6,y-12,5,2);pixel(ctx,shade,x-7,y-7,14,2);pixel(ctx,'#92aaa7',x+6,y-16,3,17);pixel(ctx,c,x+7,y-13,1,10);
 pixel(ctx,'#6f9097',x+8,y-31,2,12);pixel(ctx,Math.sin(time*3)>0?c:'#5b7e83',x+6,y-34,6,4);pixel(ctx,'#d9e6d0',x+7,y-34,2,1);
 pixel(ctx,'#152e3a',x-13,y+1,26,4);pixel(ctx,shade,x-11,y+1,22,1);
}
/**
 * Renderer width/height are logical canvas pixels, independent of world zoom.
 * Optional labels[] receives informational text in logical canvas coordinates;
 * size is a CSS font size. No informational text is rasterized when supplied.
 * remotePeople / boardingActors use world-map pixels and optional combatTime is
 * the engine ship-time used by lastShot.until / attackUntil / hurtUntil.
 */
const zoomLayers=new WeakMap();
function zoomLayer(ctx,width,height){
 let layer=zoomLayers.get(ctx);
 if(!layer){
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):(ctx.canvas.ownerDocument||document).createElement('canvas');
  layer={canvas,ctx:canvas.getContext('2d',{alpha:false})};zoomLayers.set(ctx,layer);
 }
 if(layer.canvas.width!==width)layer.canvas.width=width;
 if(layer.canvas.height!==height)layer.canvas.height=height;
 return layer;
}

/** A bounded survey diagram. Draws tile runs directly, never a world-sized raster. */
export function drawSurfaceMap(ctx,surface,{person=surface.spawn,targetEntityId=null,width=ctx.canvas?.width||360,height=ctx.canvas?.height||280,exploration=null}={}){
 const bounded=(value,fallback)=>Math.max(32,Math.min(720,Number.isFinite(Number(value))?Math.round(Number(value)):fallback));
 width=bounded(width,360);height=bounded(height,280);
 const padding=Math.max(7,Math.min(18,Math.floor(Math.min(width,height)*.055))),available=Math.min((width-padding*2)/surface.cols,(height-padding*2)/surface.rows);
 const cell=available>=1?Math.floor(available):available,mapWidth=surface.cols*cell,mapHeight=surface.rows*cell,offsetX=Math.floor((width-mapWidth)/2),offsetY=Math.floor((height-mapHeight)/2),scale=cell/(surface.tileSize||T);
 const project=(x,y)=>({x:Math.round(offsetX+x*scale),y:Math.round(offsetY+y*scale)}),box=(color,x,y,w,h)=>{const left=Math.round(x),top=Math.round(y),right=Math.round(x+w),bottom=Math.round(y+h);if(right>left&&bottom>top){ctx.fillStyle=color;ctx.fillRect(left,top,right-left,bottom-top);}};
 const palette=surface.palette||PALETTES[surface.biome]||PALETTES.station,colors={
  [TILE.VOID]:'#08141e',[TILE.WALL]:'#77908f',[TILE.FLOOR]:'#344e57',[TILE.PATH]:'#b6a981',[TILE.GROUND]:surface.barren?'#414d5a':surface.biome==='ice'?'#587883':surface.biome==='arid'?'#655444':surface.biome==='cave'?'#3d454c':'#2b4c42',[TILE.WATER]:surface.biome==='volcanic'?'#a96143':'#244e68',[TILE.PAD]:'#6a8585',[TILE.METAL]:'#6a8185',[TILE.RUBBLE]:'#625f58',[TILE.GRATE]:'#4d6870'
 };
 beginPixelFrame(ctx);ctx.save();box('#0a1924',0,0,width,height);box('#395660',offsetX-2,offsetY-2,mapWidth+4,mapHeight+4);
 for(let y=0;y<surface.rows;y++){
  const row=surface.tiles[y];let start=0;
  for(let x=1;x<=surface.cols;x++)if(x===surface.cols||row[x]!==row[start]){box(colors[row[start]]||palette.floor,offsetX+start*cell,offsetY+y*cell,(x-start)*cell,cell);start=x;}
 }
 // Large entrances have recognizable footprints without drawing individual furniture.
 for(const decor of surface.decor)if(['frontier-hut','dome','igloo','cave-mouth'].includes(decor.kind)){
  const p=project(decor.x,decor.y);box(decor.kind==='cave-mouth'?'#a6977f':'#8ca8aa',p.x,p.y,Math.max(3,decor.w*scale),Math.max(3,decor.h*scale));
 }
 const markers=[],ordinary=[],exits=[];
 const kinds={siteEntrance:'site',siteCache:'cache',siteChoice:'choice',siteRecord:'record',jobboard:'jobs',mechanic:'service',medic:'service',terminal:'record',station:'station',bunk:'bunk',exit:'exit',siteExit:'exit',work:'work',sample:'sample',crate:'cargo',delivery:'cargo'};
 for(const entity of surface.entities){
  if(entity.hidden||entity.disabled)continue;const selected=entity.id===targetEntityId,kind=kinds[entity.type];if(!kind&&!selected)continue;
  const done=!!entity.completed||exploration?.collected?.includes(entity.data?.cacheId)||!!exploration?.choices?.[entity.data?.choiceId],point=project(entity.x,entity.y),exit=kind==='exit';
  const marker={id:entity.id,name:entity.name,kind:kind||'person',...point,selected,done,color:exit?'#a8d4a0':done?'#708e82':'#82ccc9'};
  markers.push(marker);(exit?exits:ordinary).push(marker);
 }
 const mark=(marker)=>{const radius=marker.kind==='exit'?5:marker.kind==='site'?4:3;box('#0b1c27',marker.x-radius-1,marker.y-radius-1,radius*2+3,radius*2+3);box(marker.color,marker.x-radius,marker.y-radius,radius*2+1,radius*2+1);if(marker.kind==='exit'){box('#294039',marker.x-1,marker.y-3,3,7);box('#294039',marker.x-3,marker.y-1,7,3);}else if(marker.done)box('#213d38',marker.x-1,marker.y-1,3,3);};
 for(const marker of [...ordinary,...exits])mark(marker);
 // Only wildlife already alerted to a captain appears on this survey, preserving discovery.
 for(const monster of exploration?.monsters||[])if(monster.health>0&&monster.alert){const point=project(monster.x,monster.y);box('#17232a',point.x-4,point.y-4,9,9);box('#df8b77',point.x-3,point.y-3,7,7);markers.push({id:monster.id,name:monster.name,kind:'hostile',...point,color:'#df8b77'});}
 const chosen=markers.find(marker=>marker.selected);if(chosen){const r=9,c='#f4c97f';box(c,chosen.x-r,chosen.y-r,7,2);box(c,chosen.x-r,chosen.y-r,2,7);box(c,chosen.x+r-6,chosen.y-r,7,2);box(c,chosen.x+r-1,chosen.y-r,2,7);box(c,chosen.x-r,chosen.y+r-1,7,2);box(c,chosen.x-r,chosen.y+r-6,2,7);box(c,chosen.x+r-6,chosen.y+r-1,7,2);box(c,chosen.x+r-1,chosen.y+r-6,2,7);}
 const player=project(person?.x??surface.spawn.x,person?.y??surface.spawn.y);box('#102936',player.x-6,player.y-6,13,13);box('#f2f5df',player.x-4,player.y-4,9,9);box('#4b9caa',player.x-1,player.y-1,3,3);
 const direction=facingAngle(person?.facing||'up');pixelLine(ctx,player.x+Math.cos(direction)*7,player.y+Math.sin(direction)*7,player.x+Math.cos(direction)*11,player.y+Math.sin(direction)*11,'#f2f5df',2);
 ctx.restore();return{width,height,padding,cell,scale,offsetX,offsetY,mapWidth,mapHeight,markers,player:{...player,kind:'player',name:'You',color:'#f2f5df'}};
}

export function drawSurface(ctx,surface,options={}){
 const person=options.person||surface.spawn,width=options.width||ctx.canvas.width,height=options.height||ctx.canvas.height;
 const view=surfaceCamera({x:person.x,y:person.y,worldWidth:surface.width,worldHeight:surface.height,width,height,zoom:options.zoom,rasterScale:options.rasterScale,cameraX:options.cameraX,cameraY:options.cameraY});
 if(view.zoom===1){drawSurfacePixels(ctx,surface,{...options,cameraX:view.cameraX,cameraY:view.cameraY});return view;}
 // Fractional transforms antialias fillRect edges even with image smoothing off.
 // Draw only the visible world at its original pixel scale, then sample it
 // without smoothing. When zoomed out, rasterScale supplies a native display
 // grid, preserving source pixels without enlarging this source-world buffer.
 const cameraX=Math.floor(view.cameraX),cameraY=Math.floor(view.cameraY),sx=view.cameraX-cameraX,sy=view.cameraY-cameraY,sw=width/view.zoom,sh=height/view.zoom;
 const layer=zoomLayer(ctx,Math.ceil(sw)+2,Math.ceil(sh)+2),labels=[];
 drawSurfacePixels(layer.ctx,surface,{...options,width:layer.canvas.width,height:layer.canvas.height,cameraX,cameraY,labels});
 beginPixelFrame(ctx);ctx.save();ctx.drawImage(layer.canvas,sx,sy,sw,sh,0,0,width,height);ctx.restore();
 const emit=labelSink(ctx,options.labels,{width,height});
 for(const label of labels){const point=surfaceWorldToCanvas(label.x+cameraX,label.y+cameraY,view);emit(label.text,point.x,point.y,label.color,label.size,label.align,label.priority,label.kind);}
 return view;
}

function drawSurfacePixels(ctx,surface,options={}){
 const person=options.person||surface.spawn,width=options.width||ctx.canvas.width,height=options.height||ctx.canvas.height,time=options.time||0,combatTime=options.combatTime??options.gameTime??time;
 const center=(v,world,viewport)=>world<viewport?(world-viewport)/2:clamp(v-viewport/2,0,world-viewport);
 const cameraX=Math.round(options.cameraX??center(person.x,surface.width,width)),cameraY=Math.round(options.cameraY??center(person.y,surface.height,height));
 const p=surface.palette||PALETTES[surface.biome]||PALETTES.station,flags=new Set(options.flags||surface.flags||[]),emit=labelSink(ctx,options.labels,{cameraX,cameraY,width,height});
 for(const e of surface.entities)if(options.exploration?.collected?.includes(e.data?.cacheId)||options.exploration?.choices?.[e.data?.choiceId])flags.add('done:'+e.id);
 const actors=normalizedActors(options),actorCrew=new Set(actors.flatMap(a=>[a.crewId,a.crew?.id]).filter(Boolean)),homes=visibleHomes(surface,options);
 const effects=Array.isArray(options.combatEffects)?options.combatEffects.filter(effect=>!effect.boardingId||effect.boardingId===options.boarding?.id):[],combatActive=options.combat?.active??options.boarding?.phase==='active';
 const aim=combatActive?(options.combat?.aim||sidearmAim(person,actors.filter(a=>a.team==='hostile'),{},surface.combatLayout||surface.shipClass)):null;
 const actorCues=actor=>{const id=actor.id||actor.captainId||(actor===person?options.localCaptainId||'local':null);return{firing:effects.some(e=>e.kind==='shot'&&e.attackerId===id&&e.age<.13),hurtUntil:effects.some(e=>e.kind==='hit'&&e.targetId===id&&e.age<.2)?combatTime+.1:actor.hurtUntil||actor.hitUntil};};
 beginPixelFrame(ctx);ctx.save();pixel(ctx,surface.kind==='planet'?'#13292c':'#07141f',0,0,width,height);ctx.translate(-cameraX,-cameraY);
 const minX=Math.max(0,Math.floor(cameraX/T)-1),maxX=Math.min(surface.cols,Math.ceil((cameraX+width)/T)+1),minY=Math.max(0,Math.floor(cameraY/T)-1),maxY=Math.min(surface.rows,Math.ceil((cameraY+height)/T)+1);
 for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++)tileDraw(ctx,surface,x,y,p,time);
 for(const room of surface.rooms||[]){ctx.globalAlpha=.10;pixel(ctx,room.color, (room.x+1)*T,(room.y+1)*T,(room.w-2)*T,(room.h-2)*T);ctx.globalAlpha=1;}
 // Walls cast a short hard-edged shadow; light strips remain emissive pixels.
 for(let y=minY;y<maxY-1;y++)for(let x=minX;x<maxX;x++)if(surface.tiles[y][x]===TILE.WALL&&[TILE.FLOOR,TILE.PATH].includes(surface.tiles[y+1]?.[x])){ctx.globalAlpha=.2;pixel(ctx,'#06131d',x*T,(y+1)*T,T,5);ctx.globalAlpha=1;}
 const visible=d=>d.x+d.w>cameraX-72&&d.x<cameraX+width+72&&d.y+d.h>cameraY-72&&d.y<cameraY+height+72;
 const flat=new Set(['label','window','light','fence','debris','sign','roomstripe','doorframe','airlock','banner','floorarrows','awning','vesselmark']);
 for(const d of surface.decor)if(flat.has(d.kind)&&visible(d))drawProp(ctx,d,surface,time,emit);
 for(const home of homes)if(home.x>cameraX-30&&home.x<cameraX+width+30&&home.y>cameraY-30&&home.y<cameraY+height+45)drawHomeMarker(ctx,home,options.localCaptainId,time);
 if(aim)drawCombatAim(ctx,person,aim);
 const near=nearestEntity(surface,person,43),targetId=options.mission?.targetEntityId||options.mission?.entityId,items=[];
 for(const d of surface.decor)if(!flat.has(d.kind)&&visible(d))items.push({y:d.y+d.h,prop:d});
 for(const e of surface.entities){
  if(e.hidden||e.type==='crew'&&actorCrew.has(e.data?.crewId))continue;
  if(e.x<cameraX-45||e.x>cameraX+width+45||e.y<cameraY-45||e.y>cameraY+height+45)continue;
  if(e.type==='delivery'||e.type==='bunk'||e.type==='exit'&&!e.data?.stationRole)drawEntity(ctx,e,surface,time,flags,near===e);else items.push({y:e.y,entity:e});
 }
 for(const actor of actors)if(actor.x>cameraX-35&&actor.x<cameraX+width+35&&actor.y>cameraY-35&&actor.y<cameraY+height+35)items.push({y:actor.y,actor});
 for(const home of homes)if(home.kind==='outpost'&&home.x>cameraX-30&&home.x<cameraX+width+30&&home.y>cameraY-30&&home.y<cameraY+height+45)items.push({y:home.y,home});
 items.push({y:person.y,player:person});items.sort((a,b)=>a.y-b.y);
 for(const item of items){
  if(item.prop)drawProp(ctx,item.prop,surface,time,emit);
  else if(item.home)drawHomeMarker(ctx,item.home,options.localCaptainId,time,true);
  else if(item.entity)drawEntity(ctx,item.entity,surface,time,flags,near===item.entity);
  else if(item.actor){const a=item.actor,cues=actorCues(a);if(a.species)drawWildlife(ctx,{...a,...cues},combatTime);else drawCharacter(ctx,a.x,a.y,{...a,...cues,armed:combatActive||a.weaponDrawn||a.team==='hostile',color:a.color||(a.team==='hostile'?'#bc7b69':'#83b4b9'),time:combatTime,moving:a.moving||Math.hypot(a.vx||0,a.vy||0)>2});actorHealth(ctx,{...a,...cues},combatTime);}
  else{const cues=actorCues(person);drawCharacter(ctx,person.x,person.y,{...person,...cues,armed:combatActive||person.weaponDrawn,aimAngle:aim?.angle??person.aimAngle,color:person.color||'#cab078',time:combatTime,walkTime:person.walkTime,carried:person.carrying||flags.has('carrying:'+surface.id)});actorHealth(ctx,{...person,...cues},combatTime);}
 }
 if(surface.kind==='site')drawSiteAir(ctx,surface,person,cameraX,cameraY,width,height,time);
 // Event cues survive sparse network snapshots. Older callers can still show lastShot.
 if(!Array.isArray(options.combatEffects))for(const actor of [...actors,person]){
  const shot=actor.lastShot;if(shot&&shot.until>combatTime&&Number.isFinite(shot.targetX)&&Number.isFinite(shot.targetY)){ctx.globalAlpha=.7;pixelLine(ctx,shot.x??actor.x,shot.y??actor.y-10,shot.targetX,shot.targetY,actor.team==='hostile'?'#eaa983':'#d6e7b9');ctx.globalAlpha=1;pixel(ctx,'#ffe1ac',shot.targetX-1,shot.targetY-1,3,3);}
 }
 drawCombatEffects(ctx,effects,emit);
 if(aim?.targetId){const target=actors.find(a=>(a.id||a.captainId)===aim.targetId);if(target)emit(aim.manual?'MANUAL AIM':'AIM ASSIST',target.x,target.y+13,'#e9d395',12,'center',91,'combat-target');}
 for(const e of surface.entities){
  if(e.hidden||(isDone(e,flags)&&['sample','crate'].includes(e.type))||e.type==='crew'&&actorCrew.has(e.data?.crewId))continue;
  if(e.x<cameraX||e.x>cameraX+width||e.y<cameraY||e.y>cameraY+height)continue;
  const selected=near===e,targeted=e.id===targetId,important=['jobboard','mechanic','medic','exit','siteEntrance','siteExit'].includes(e.type);
  if(!important&&!selected&&!targeted)continue;
  const value=selected||targeted||e.type==='siteEntrance'?e.name:shortRole(e),labelY=e.type==='siteEntrance'?e.y-67:e.type==='siteExit'?e.y-26:e.type==='exit'&&!e.data?.stationRole?e.y-26:e.type==='bunk'?e.y-18:e.y-44;
  emit(value,e.x,labelY,selected?'#f1ddb0':targeted?'#e7ce93':'#b6cdc8',selected?14:13,'center',selected?100:targeted?85:40,selected?'interaction':targeted?'objective':'service');
 }
 for(const actor of actors){
  if(actor.x<cameraX+4||actor.x>cameraX+width-4||actor.y<cameraY+4||actor.y>cameraY+height+22)continue;
  if((actor.health??100)<=0)continue;
  const hostile=actor.team==='hostile'||actor.hostile===true,name=actor.name||actor.displayName||actor.crewRole|| (hostile?'Boarder':'Crewmate');
  emit(name,actor.x,actor.y-47,hostile?'#f1b296':'#b3dcd8',13,'center',hostile?82:75,hostile?'hostile':actor.remote?'remote':'crew');
 }
 for(const home of homes){const mine=!!options.localCaptainId&&home.ownerId===options.localCaptainId,nearby=Math.hypot(home.x-person.x,home.y-person.y)<70,owner=mine?'Your':home.ownerName?`${home.ownerName}’s`:'Captain’s';emit(`${owner} ${home.kind==='outpost'?'outpost':'room'}`,home.x,home.y-(home.kind==='outpost'?48:27),mine?'#e5be79':'#8ec8d2',13,'center',nearby?70:mine?45:30,'home');}
 if(targetId){const e=surface.entities.find(e=>e.id===targetId&&!e.hidden);if(e){const x=e.x-17,y=e.y-27;for(const[dx,dy]of[[0,0],[29,0],[0,29],[29,29]]){pixel(ctx,'#e2c98f',x+dx,y+dy,5,1);pixel(ctx,'#e2c98f',x+dx+(dx?4:0),y+dy-(dy?4:0),1,5);}}}
 if(near&&!near.hidden){pixel(ctx,'#e9d8ab',near.x-2,near.y-36,4,2);pixel(ctx,'#e9d8ab',near.x-1,near.y-34,2,2);}
 if(options.boarding?.phase==='active'||actors.some(a=>a.team==='hostile'&&(a.health??1)>0)){
  const pulse=.05+(Math.sin(time*4)+1)*.025;ctx.globalAlpha=pulse;pixel(ctx,'#dc785b',cameraX,cameraY,width,4);pixel(ctx,'#dc785b',cameraX,cameraY+height-4,width,4);ctx.globalAlpha=1;
 }
 ctx.restore();
 return{cameraX,cameraY,width,height};
}
