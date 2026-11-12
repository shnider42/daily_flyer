import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {createUpgradeGuideUI} from '../dist/upgrade-guide-ui.mjs';
import {createFieldGuideUI} from '../dist/field-guide-ui.mjs';

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.textContent='';this.value='';this.open=false;}
 append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this.append(...nodes);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 get firstElementChild(){return this.children[0]||null;}
 querySelector(selector){return descendants(this).find(node=>node.tagName===selector)||null;}
 focus(){this.focused=true;}
 scrollIntoView(){this.scrolled=true;}
}
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
const text=node=>[node.textContent,...node.children.map(text)].join(' ');
function fixture(){
 const game=new Game('upgrade-guide-ui'),port=game.system.bodies.find(body=>body.id==='kettle');
 Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+50,vx:0,vy:0});assert.equal(game.dock(port.id).ok,true);
 const calls=[],references=[],document={createElement:tag=>new Element(tag)};
 const dialog={body:new Element('div'),opened:false,revision:0,kind:null,open(title,kind){this.opened=true;this.title=title;this.kind=kind;this.revision++;this.body.replaceChildren();},close(){this.opened=false;this.revision++;}};
 const ui=createUpgradeGuideUI({dialog,document,getGame:()=>game,getDevice:()=> 'touch',onNextStep:step=>calls.push(step),openReference:topic=>references.push(topic)});
 const nodes=()=>descendants(dialog.body),button=label=>nodes().find(node=>node.tagName==='button'&&node.textContent===label);
 return{game,dialog,document,ui,calls,references,nodes,button,text:()=>text(dialog.body)};
}
function ready(game){game.state.flags.push('first_shift_done','mined_six_ore','belt_signal_scanned','belt_signal_found');game.state.upgrades={thrusters_1:1,scanner_1:1};game.state.credits=320;game.state.cargo.ore=8;}

test('the outfitter explains every blocker and offers help while installation is unavailable',()=>{
 const f=fixture();f.game.state.credits=1;f.dialog.open('Shipyard','outfitter');
 const before=JSON.stringify(f.game.save()),requirements=f.ui.appendRequirements(f.dialog.body,'fold_1');
 assert.equal(requirements.open,false);
 for(const expected of ['Vector thrusters','Echo scanner','Something in the belt','320 credits','8 ore','need 319 more'])assert.ok(f.text().includes(expected),expected);
 f.button('Walk me through the fold drive').onclick();assert.equal(f.dialog.kind,'upgrade-guide');
 assert.match(f.text(),/Meet Iona/);assert.equal(JSON.stringify(f.game.save()),before);
});

test('next-step guidance is rechecked at click time without purchasing or spending',()=>{
 const f=fixture();ready(f.game);f.ui.openFoldDrive();
 const action=f.button('Find the shipwright');assert.ok(action);
 f.game.state.credits=0;const before=JSON.stringify(f.game.save());action.onclick();
 assert.equal(f.calls[0].id,'credits');assert.equal(f.calls[0].upgradeId,'fold_1');
 assert.equal(JSON.stringify(f.game.save()),before);assert.equal(f.game.state.upgrades.fold_1,undefined);
});

test('old checklist controls cannot act after a refresh or a closed dialog',()=>{
 const f=fixture();f.ui.openFoldDrive();const stale=f.button('Show me where to go');
 f.button('Refresh my checklist').onclick();stale.onclick();assert.deepEqual(f.calls,[]);
 const current=f.button('Show me where to go');f.dialog.close();current.onclick();assert.deepEqual(f.calls,[]);
});

test('an installed drive no longer presents spent credits or ore as unfinished requirements',()=>{
 const f=fixture();ready(f.game);assert.equal(f.game.buyUpgrade('fold_1').ok,true);assert.equal(f.game.state.credits,0);assert.equal(f.game.state.cargo.ore,0);
 f.ui.openFoldDrive();assert.match(f.text(),/Your ship has a fold drive/);
 assert.ok(f.button('Open the Galaxy chart'));assert.equal(f.nodes().filter(node=>node.dataset.foldStep).length,0);
 assert.doesNotMatch(f.text(),/To do|need 320 more|Keep 8 ore/);
});

test('a borrowed vessel does not display its cargo as the captain’s installation budget',()=>{
 const f=fixture();f.game.state.multiplayer={serverAuthoritative:true,ownedVesselId:'personal-ship',aboardVesselId:'borrowed-ship'};
 f.game.state.ship.id='borrowed-ship';f.game.state.cargo.ore=999;
 f.ui.openFoldDrive();assert.match(f.text(),/Return to your own ship/);
 assert.doesNotMatch(f.text(),/null credits|null ore|999 ore/);
 assert.equal(f.nodes().find(node=>node.dataset.foldNextStep)?.dataset.foldNextStep,'return-own-ship');
});

test('a searched guide answer opens the current checklist and brings the linked topic into view',()=>{
 const f=fixture(),guide=createFieldGuideUI({dialog:f.dialog,document:f.document,getContext:()=>({playing:true,device:'touch'}),openFoldDrive:()=>f.ui.openFoldDrive()});
 guide.open({topic:'fold-drive',query:'fold drive'});
 const topic=f.nodes().find(node=>node.dataset.topic==='fold-drive');assert.ok(topic.open&&topic.scrolled&&topic.firstElementChild.focused);
 f.button('Check my fold-drive progress').onclick();assert.equal(f.dialog.kind,'upgrade-guide');assert.match(f.text(),/Meet Iona/);
 guide.open({topic:'fold-drive'});const stale=f.button('Check my fold-drive progress');f.dialog.close();stale.onclick();assert.equal(f.dialog.opened,false);
});
