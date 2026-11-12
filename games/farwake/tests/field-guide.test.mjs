import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldGuideTopics,searchFieldGuide,recommendFieldGuideTopics} from '../dist/field-guide.mjs';
import {createFieldGuideUI} from '../dist/field-guide-ui.mjs';
import {UPGRADES,STORY_CHAPTERS} from '../dist/content.mjs';

test('the field guide connects complete practical topics without broken related links',()=>{
 const topics=fieldGuideTopics(),ids=new Set(topics.map(topic=>topic.id));
 assert.equal(ids.size,topics.length);
 for(const id of ['play-together','military-together','gunnery','recovery','saving','personal-combat'])assert.ok(ids.has(id));
 for(const topic of topics){
  assert.ok(topic.summary&&topic.why&&topic.steps.length>=3&&topic.blockers.length>=1);
  for(const id of topic.related)assert.ok(ids.has(id),`${topic.id} links to existing ${id}`);
 }
});

test('touch help follows swapped thumbs while keyboard instructions retain actual mappings',()=>{
 const topic=(options,id)=>fieldGuideTopics(options).find(topic=>topic.id===id);
 assert.match(topic({device:'touch'},'flight').steps.join(' '),/left STEER.*right STRAFE/);
 assert.match(topic({device:'touch',leftHanded:true},'flight').steps.join(' '),/right STEER.*left STRAFE/);
 assert.match(topic({device:'touch',leftHanded:true},'personal-combat').steps.join(' '),/right WALK.*left AIM/);
 assert.doesNotMatch(topic({device:'touch'},'flight').steps.join(' '),/Hold W|arrow keys|Hold R/);
 assert.match(topic({device:'keyboard'},'flight').steps.join(' '),/Hold W.*A and D.*hold X/);
 assert.match(topic({device:'keyboard'},'gunnery').steps.join(' '),/keys 1–4/);
 assert.doesNotMatch(topic({device:'touch'},'gunnery').steps.join(' '),/keys 1–4/);
 assert.match(topic({device:'touch'},'navigation').steps.join(' '),/until Investigate is offered/);
 assert.doesNotMatch(topic({device:'touch'},'navigation').steps.join(' '),/until Scan is offered/);
});

test('search finds multiplayer problems and synonyms, and safely treats regex characters literally',()=>{
 assert.ok(searchFieldGuide('same crew').some(topic=>topic.id==='play-together'));
 assert.ok(searchFieldGuide('how do I get off the ship').some(topic=>topic.id==='docking'));
 assert.equal(searchFieldGuide('turret')[0].id,'gunnery');
 assert.ok(searchFieldGuide('AIRLOCK').some(topic=>topic.id==='docking'));
 assert.ok(searchFieldGuide('jail').some(topic=>topic.id==='recovery'));
 assert.deepEqual(searchFieldGuide('nothingmatcheszzzz'),[]);
 assert.doesNotThrow(()=>searchFieldGuide('[.*(\\'));
 assert.equal(searchFieldGuide('').length,fieldGuideTopics().length);
});

test('fold-drive questions lead to the actual installation instructions and named calibration chapter',()=>{
 for(const query of ['fold drive','how do I install the fold drive','rules to install the fold drive','fold drive requirements','Something in the belt','calibration','Tinbell beacon','parts required']){
  assert.equal(searchFieldGuide(query)[0]?.id,'fold-drive',query);
 }
 const topics=fieldGuideTopics(),guide=topics.find(topic=>topic.id==='fold-drive');
 const text=[...guide.steps,guide.why,...guide.blockers].join(' ');
 const prerequisiteIds=['thrusters_1','scanner_1','fold_1'];
 const upgrades=prerequisiteIds.map(id=>UPGRADES.find(upgrade=>upgrade.id===id));
 for(const upgrade of upgrades){
  assert.ok(text.includes(`${upgrade.name} for ${upgrade.cost} credits and ${upgrade.ore} ore`),`${upgrade.name} price matches the equipment catalog`);
 }
 const credits=upgrades.reduce((sum,upgrade)=>sum+upgrade.cost,0),ore=upgrades.reduce((sum,upgrade)=>sum+upgrade.ore,0);
 assert.ok(guide.why.includes(`${credits} credits and ${ore} ore from scratch`),'The combined budget includes both prerequisite upgrades.');
 const calibration=STORY_CHAPTERS.find(chapter=>chapter.id==='belt_signal');
 assert.ok(text.includes(calibration.title.split(' · ')[1]),'The guide names the chapter displayed by the purchase rule.');
 assert.match(text,/Tinbell evacuation beacon/);
 assert.match(text,/any inhabited port, with your own ship present/);
 assert.match(text,/ore you have mined over this voyage/);
 assert.match(text,/Spending or selling mined ore does not undo the milestone/);
 assert.match(text,/ore in your current hold/);
 for(const id of ['first-steps','navigation','mining','upgrades'])assert.ok(topics.find(topic=>topic.id===id).related.includes('fold-drive'),`${id} leads to installation help`);
});

test('fold-drive mining and beacon steps use the actual controls for each device',()=>{
 const steps=device=>fieldGuideTopics({device}).find(topic=>topic.id==='fold-drive').steps.join(' ');
 assert.match(steps('touch'),/Open Tools and hold MINE/);
 assert.match(steps('touch'),/until Investigate is offered and tap it/);
 assert.doesNotMatch(steps('touch'),/Hold R|Press F|Press M/);
 assert.match(steps('keyboard'),/Hold R to use the mining beam/);
 assert.match(steps('keyboard'),/Press F to scan/);
 assert.match(steps('keyboard'),/Press M to open the map/);
});

test('reading guide data does not change another request or accept player-supplied secret content',()=>{
 const first=fieldGuideTopics();first[0].steps[0]='changed';first[0].related.push('injected');
 assert.notEqual(fieldGuideTopics()[0].steps[0],'changed');
 assert.ok(!fieldGuideTopics()[0].related.includes('injected'));
 const options={device:'touch',leftHanded:true,hiddenEnemy:'secret-test-enemy'};
 assert.doesNotMatch(JSON.stringify(fieldGuideTopics(options)),/secret-test-enemy/);
 assert.deepEqual(options,{device:'touch',leftHanded:true,hiddenEnemy:'secret-test-enemy'});
});

test('context picks prioritize a casualty or gunner post using only public situation flags',()=>{
 assert.equal(recommendFieldGuideTopics({mode:'ship',gunnery:{active:true}})[0],'gunnery');
 assert.equal(recommendFieldGuideTopics({recovery:{arrived:false},gunnery:true})[0],'recovery');
 assert.equal(recommendFieldGuideTopics({military:{enlisted:true,branchId:'army'}})[0],'army');
 assert.equal(recommendFieldGuideTopics({military:{enlisted:true}})[0],'military');
 assert.equal(recommendFieldGuideTopics({mode:'person',shared:{canBoard:false}})[0],'play-together');
 const context={mode:'person',surfaceKind:'site'};
 Object.defineProperty(context,'hiddenEnemies',{get(){throw new Error('A field guide must not inspect hidden actors');}});
 assert.ok(recommendFieldGuideTopics(context).includes('exploration'));
 assert.equal(new Set(recommendFieldGuideTopics({gunnery:true,military:{branchId:'navy'}},{limit:6})).size,6);
});

test('an uninstalled fold drive is useful here without displacing immediate danger or service orders',()=>{
 assert.equal(recommendFieldGuideTopics({mode:'person',foldDriveNeeded:true,nearby:{type:'mechanic'}})[0],'fold-drive');
 assert.equal(recommendFieldGuideTopics({mode:'ship',foldDriveNeeded:true})[0],'fold-drive');
 assert.ok(!recommendFieldGuideTopics({mode:'ship',foldDriveNeeded:false}).includes('fold-drive'));
 for(const [context,first] of [
  [{recovery:{arrived:false}},'recovery'],
  [{gunnery:{active:true}},'gunnery'],
  [{combat:{active:true}},'personal-combat'],
  [{mode:'ship',ship:{threat:true}},'ship-combat'],
  [{military:{enlisted:true,branchId:'army'}},'army']
 ])assert.equal(recommendFieldGuideTopics({...context,foldDriveNeeded:true})[0],first);
});

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.textContent='';this.value='';this.className='';this.open=false;}
 append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 get firstElementChild(){return this.children[0]||null;}
 querySelector(selector){const key=selector.match(/^\[data-guidance-level="(.*)"\]$/)?.[1];return descendants(this).find(node=>key?node.dataset.guidanceLevel===key:node.tagName===selector)||null;}
 focus(){this.focused=true;}
 scrollIntoView(){this.scrolled=true;}
}
const descendants=root=>root.children.flatMap(child=>[child,...descendants(child)]);
const allText=root=>[root.textContent,...root.children.map(allText)].join(' ');
function fixture({mode='simple',context={mode:'person',device:'touch'},progress=true}={}){
 let selected=mode,helpCalls=0;const changes=[],resets=[],document={createElement:tag=>new Element(tag)};
 const data={device:'touch',completed:1,total:2,practiced:2,required:4,flows:[{id:'flight',title:'Flying your ship',completed:1,total:2,practiced:2,required:4,actions:[{id:'flight-thrust',title:'Thrust',count:2,required:2,complete:true},{id:'flight-brake',title:'Brake',count:0,required:2,complete:false}]}]};
 const dialog={body:new Element('div'),opened:false,kind:null,open(title,kind){this.title=title;this.kind=kind;this.opened=true;this.body.replaceChildren();},close(){this.opened=false;}};
 const ui=createFieldGuideUI({dialog,document,getContext:()=>context,getGuidance:()=>selected,setGuidance:value=>{changes.push(value);selected=value;},getProgress:()=>progress?data:null,requestHelp:()=>helpCalls++,resetProgress:id=>{resets.push(id);data.completed=0;data.flows[0].completed=0;data.flows[0].actions[0].count=0;data.flows[0].actions[0].complete=false;}});
 const nodes=()=>descendants(dialog.body),button=label=>nodes().find(node=>node.tagName==='button'&&node.textContent===label),text=()=>allText(dialog.body);
 return{ui,dialog,context,changes,resets,nodes,button,text,get selected(){return selected;},get helpCalls(){return helpCalls;}};
}

test('Expert retains full requested reference and changes no settings or progress merely by opening',()=>{
 const f=fixture({mode:'expert'});f.ui.open({topic:'gunnery'});
 assert.equal(f.nodes().find(node=>node.dataset.guidanceLevel==='expert').attributes['aria-pressed'],'true');
 assert.ok(f.nodes().find(node=>node.dataset.topic==='gunnery').open);
 assert.match(f.text(),/Fore covers forward, Port the left side, Starboard the right side, and Aft the rear/);
 assert.deepEqual(f.changes,[]);assert.deepEqual(f.resets,[]);assert.equal(f.helpCalls,0);
 f.button('Help with what I’m doing').onclick();assert.equal(f.helpCalls,1);assert.equal(f.dialog.opened,false);
});

test('changing guidance preserves a field-guide search and only changes the requested preference',()=>{
 const f=fixture();f.ui.open({query:'turret'});f.button('Moderate').onclick();
 assert.deepEqual(f.changes,['moderate']);assert.deepEqual(f.resets,[]);
 assert.equal(f.nodes().find(node=>node.tagName==='input').value,'turret');
 assert.equal(f.nodes().filter(node=>node.dataset.topic).length,1);
 assert.equal(f.nodes().find(node=>node.dataset.guidanceLevel==='moderate').focused,true);
});

test('search and related topics remain navigable without leaving the game dialog',()=>{
 const f=fixture();f.ui.open();const input=f.nodes().find(node=>node.tagName==='input');
 input.value='zzzznomatch';input.oninput();assert.match(f.text(),/No matching topic/);
 f.button('Show all topics').onclick();assert.equal(input.value,'');assert.ok(input.focused);
 input.value='turret';input.oninput();assert.equal(f.nodes().filter(node=>node.dataset.topic).length,1);
 const navyTitle=fieldGuideTopics().find(topic=>topic.id==='navy').title;f.button(navyTitle).onclick();
 assert.equal(input.value,'');const navy=f.nodes().find(node=>node.dataset.topic==='navy');assert.equal(navy.open,true);assert.equal(navy.firstElementChild.focused,true);
});

test('practice uses confirmed counts and resetting one flow leaves guidance alone',()=>{
 const f=fixture({mode:'expert'});f.ui.open();
 assert.match(f.text(),/Your practice · 1 \/ 2 actions familiar/);assert.match(f.text(),/Thrust 2 \/ 2 · familiar/);
 const panel=f.nodes().find(node=>node.className==='field-guide-practice');assert.equal(panel.open,false);
 f.button('Relearn flying your ship').onclick();assert.deepEqual(f.resets,['flight']);assert.deepEqual(f.changes,[]);
 assert.match(f.text(),/Your practice · 0 \/ 2 actions familiar/);assert.match(f.text(),/Your voyage and guidance level are unchanged/);
 assert.equal(f.nodes().find(node=>node.className==='field-guide-practice').open,true);
});

test('stale and closed field-guide actions do not affect a later dialog or captain',()=>{
 const f=fixture();f.ui.open();const staleLevel=f.button('Expert'),staleReset=f.button('Relearn all actions');
 f.ui.open({topic:'saving'});staleLevel.onclick();staleReset.onclick();assert.deepEqual(f.changes,[]);assert.deepEqual(f.resets,[]);
 const help=f.button('Help with what I’m doing');f.dialog.close();help.onclick();assert.equal(f.helpCalls,0);
});

test('shared guidance reminds that reading does not pause the galaxy and accepts missing practice history',()=>{
 const f=fixture({context:{mode:'person',device:'touch',sharedGalaxy:true},progress:false});f.ui.open();
 assert.match(f.text(),/shared galaxy keeps moving while you read/);
 assert.equal(f.nodes().filter(node=>node.className==='field-guide-practice').length,0);
 assert.ok(recommendFieldGuideTopics(f.context).includes('play-together'));
});

test('the title-screen guide keeps level choices but offers action help only during a voyage',()=>{
 const f=fixture({context:{playing:false,device:'touch'},progress:false});f.ui.open();
 const help=f.button('Help with what I’m doing');assert.equal(help.disabled,true);help.onclick();assert.equal(f.helpCalls,0);
 assert.match(f.text(),/Start or resume a voyage/);assert.match(f.text(),/first two successful uses/);
 f.button('Moderate').onclick();assert.deepEqual(f.changes,['moderate']);assert.match(f.text(),/nine seconds/);
 assert.equal(f.button('Help with what I’m doing').disabled,true);
});

test('solo detention guidance explains that custody time continues while the guide is open',()=>{
 const f=fixture({context:{playing:true,mode:'person',recovery:{detained:true}}});f.ui.open();
 assert.match(f.text(),/Your detention term continues while this guide is open/);
 assert.doesNotMatch(f.text(),/opening this guide pauses the game/);
});
