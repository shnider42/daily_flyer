import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createLivelihoodUI } from '../dist/livelihood-ui.mjs';
import { Game } from '../dist/engine.mjs';

// Exercise the actual app handlers and menu actions. The browser and command
// transport are boundaries; Vey deliberately stays an outdoor, non-port place.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
function declaration(name){
 const index=declarations.findIndex(match=>match[1]===name);assert.ok(index>=0,name);
 return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);
}
const code=['currentPerspectiveAction','openRecoveryStatus','updateRecoveryHUD'].map(declaration).join('\n');
const noop=()=>{};
function classes(){const values=new Set();return{contains:name=>values.has(name),toggle(name,on){on?values.add(name):values.delete(name);}};}
function fixture({touch=false,canBook=true,reason=null}={}){
 const status={status:'orders',factionId:'freewake',factionName:'Freewake Compact',rank:'Able Spacer',home:{systemId:'hearth',bodyId:'morrow',name:'Morrow'},
  detained:false,remainingSeconds:0,eligible:true,canBook,reason,passage:false,arrived:false,fare:0,evacuation:true,nearPickup:canBook,
  pickup:{systemId:'crosswind',bodyId:'crosswind-vey',bodyName:'Vey',name:'Freewake medical tent',factionId:'freewake',entityId:'field-medic:freewake',x:150,y:250,distance:canBook?0:300}};
 const game={state:{seed:'vey-recovery-ui',systemId:'crosswind',locationId:'crosswind-vey',mode:'person',interior:null,exploration:{outdoor:true},
  credits:0,person:{health:60,down:false},stats:{time:20},livelihoods:{},fleet:{history:[]},shipRecovery:{destination:{systemId:'crosswind',bodyId:'crosswind-vey',name:'Vey'}}},
  atInhabitedPort:false,ownsShip:false,galaxy:[{id:'crosswind',bodies:[{id:'crosswind-vey',name:'Vey'}]}],currentBody:{id:'crosswind-vey',name:'Vey'},
  militaryRecoveryStatus:()=>status,canUseOwnShipHere:()=>false,npcContractStatus:()=>null};
 const nodes=new Map(),calls=[],marks=[];let refreshes=0;
 function element(id){if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:id==='recoveryStatus',dataset:{},classList:classes()});return nodes.get(id);}
 const dialog={opened:false,revision:0,items:[],markup:'',body:{insertAdjacentHTML:noop},
  open(title,kind,options){this.title=title;this.kind=kind;this.options=options;this.opened=true;this.revision++;this.items=[];},
  html(markup){this.markup=markup;},choices(items){this.items.push(...items);},close(){this.opened=false;this.revision++;}};
 const livelihoodUI=createLivelihoodUI({getGame:()=>game,dialog,invoke:async(name,args)=>{calls.push({name,args});return{ok:true};},acceptResult:r=>r.ok,
  refreshWorld:()=>refreshes++,markEntity:target=>marks.push(target),openJobs:noop,openShipyard:noop,openProfile:noop,openDamage:noop});
 const context=vm.createContext({game,playing:true,testSession:null,touchLayout:touch,labelLayoutDirty:false,network:null,surface:null,onlineSnapshot:null,
  getGunneryView:()=>({active:false}),getPerspectiveAction:()=>({command:'quickLaunch',label:'Return to ship',enabled:false}),$:element,document:{body:{classList:classes()}},
  hudText:(target,value)=>target.textContent=value,dialog,livelihoodUI,militaryCareerUI:{open:noop},esc:String,custodyTime:seconds=>String(seconds)});
 vm.runInContext(code,context);
 return{game,status,dialog,context,element,calls,marks,livelihoodUI,refreshes:()=>refreshes};
}

for(const touch of [false,true])test(`${touch?'touch':'desktop'}: outdoor Vey recovery visibly offers departure and opens the evacuation menu`,()=>{
 const f=fixture({touch}),before=JSON.stringify(f.game.state);
 f.context.updateRecoveryHUD();
 assert.equal(f.element('recoveryStatus').hidden,false);
 assert.equal(f.context.document.body.classList.contains('recovery-active'),true);
 assert.match(f.element('recoveryTitle').textContent,/evacuation.*Vey/i);
 assert.match(f.element('recoveryAction').textContent,/leave Vey/i);
 const perspective=f.context.currentPerspectiveAction();assert.equal(perspective.command,'openRecoveryStatus');assert.equal(perspective.enabled,true);assert.match(perspective.label,/leave Vey/i);
 f.context.openRecoveryStatus();
 assert.match(f.dialog.title,/leave Vey/i);
 assert.match(f.dialog.markup,/0 CR|free/i);
 assert.ok(f.dialog.items.some(item=>/board.*evacuation|evacuation.*shuttle/i.test(item.label)&&!item.disabled));
 assert.equal(JSON.stringify(f.game.state),before,'Opening the departure UI must not mutate the saved captain.');
});

test('a distant survivor is told why boarding is blocked and can mark the real evacuation point',()=>{
 const f=fixture({canBook:false,reason:'Return to the Freewake medical tent to board the evacuation shuttle.'});
 f.livelihoodUI.openPort();
 const entry=f.dialog.items.find(item=>/evacuation|leave Vey/i.test(item.label));
 if(entry&&!/board/i.test(entry.label))entry.action();
 const board=f.dialog.items.find(item=>/board.*evacuation|evacuation.*shuttle/i.test(item.label));
 assert.ok(board,'Departure remains discoverable through Port services.');
 assert.equal(board.disabled,true);
 assert.match(board.detail||f.dialog.markup,/medical tent/i);
 const show=f.dialog.items.find(item=>/show.*evacuation|evacuation.*point/i.test(item.label));
 assert.ok(show,'The pickup has a navigation action, not just prose.');
 show.action();
 assert.equal(f.marks.length,1);
 assert.equal(f.marks[0].entityId,'field-medic:freewake');
 assert.equal(f.marks[0].bodyId,'crosswind-vey');
 assert.equal(f.context.currentPerspectiveAction().command,'openRecoveryStatus','A distant survivor can still ask for directions.');
});

test('boarding uses the authority command at no charge and retains the captain state',async()=>{
 const f=fixture(),before=JSON.stringify(f.game.state);f.context.openRecoveryStatus();
 const board=f.dialog.items.find(item=>/board.*evacuation|evacuation.*shuttle/i.test(item.label));
 assert.ok(board);await board.action();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'startMilitaryPassage');
 assert.equal(f.dialog.opened,false);assert.equal(f.refreshes(),1);
 assert.equal(JSON.stringify(f.game.state),before,'The UI must not mint a ship or rewrite credits before authority accepts transport.');
});

test('aboard recovery points to the passenger duty and the docked airlock rather than booking twice',()=>{
 const f=fixture();Object.assign(f.status,{passage:true,status:'aboard',passagePhase:'docked',canBook:false});
 f.game.state.locationId='ship:transport';f.game.state.interior={kind:'ship'};f.game.state.exploration=null;
 f.game.npcContractStatus=()=>({repatriation:true,shipName:'Homeward Passage',routeName:'Vey → Morrow',task:'Use the entry airlock at Morrow.',canFinish:true,destination:{name:'Morrow'}});
 f.context.updateRecoveryHUD();assert.match(f.element('recoveryAction').textContent,/disembark|airlock/i);
 f.context.openRecoveryStatus();assert.equal(f.dialog.kind,'crew-duty');
 assert.ok(f.dialog.items.some(item=>/disembark.*Morrow/i.test(item.label)));
 assert.equal(f.dialog.items.some(item=>/board.*evacuation/i.test(item.label)),false);
});

test('a resumed Vey survivor can mark the actual medic on each faction’s generated battlefield',()=>{
 for(const factionId of ['freewake','meridian']){
  let game=new Game('recovery-marker-'+factionId);
  Object.assign(game.state.professions.careers.military,{enlisted:true,factionId});
  Object.assign(game.state.militaryCareer,{factionId,branchId:'navy'});
  game.state.systemId='crosswind';game._loadSystem('crosswind');game.state.mode='ship';game.state.locationId=null;
  game._damageShip(99999);assert.equal(game.state.locationId,'crosswind-vey');
  game.state.militaryRecovery=null;game.state.medicalRecovery.wakeUntil=0;
  game=Game.fromSave(game.serialize());game.state.person.x+=180;
  const status=game.militaryRecoveryStatus();assert.equal(status.evacuation,true);assert.equal(status.canBook,false);
  const surface=game._expeditionSurface(),toasts=[],f=fixture(),before=game.serialize();
  const context=vm.createContext({surface,surfaceTarget:null,ensureSurface:noop,toast:text=>toasts.push(text)});
  vm.runInContext(declaration('markLivelihoodTarget'),context);
  const ui=createLivelihoodUI({getGame:()=>game,dialog:f.dialog,invoke:noop,acceptResult:noop,refreshWorld:noop,
   markEntity:target=>context.markLivelihoodTarget(target),openJobs:noop,openShipyard:noop,openProfile:noop,openDamage:noop});
  ui.openRecovery();f.dialog.items.find(item=>/show.*evacuation/i.test(item.label)).action();
  const marked=surface.entities.find(entity=>entity.id===context.surfaceTarget);
  assert.ok(marked,`${factionId}: pickup must resolve to a real surface entity.`);
  assert.equal(marked.type,'medic');assert.equal(marked.data.factionId,factionId);
  assert.ok(Math.hypot(marked.x-status.pickup.x,marked.y-status.pickup.y)<=72,'Following the marker must reach the allowed pickup area.');
  assert.equal(toasts.at(-1),marked.name+' marked.');assert.equal(game.serialize(),before);
 }
});
