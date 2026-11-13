import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestSession} from '../dist/test-lab.mjs';
import {foldDriveTestState} from '../dist/fold-drive-test.mjs';
import {createFoldDriveTestUI,foldDriveTestReport} from '../dist/fold-drive-test-ui.mjs';

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.textContent='';this.attributes={};this.dataset={};this.value='';this.disabled=false;this.open=false;}
 append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this.append(...nodes);}
 setAttribute(name,value){this.attributes[name]=String(value);}
 focus(){this.focused=true;}
 select(){this.selected=true;}
}
const nodes=root=>root.children.flatMap(node=>[node,...nodes(node)]);
const text=root=>[root.textContent,...root.children.map(text)].join(' ');
function fixture(foldCase='round-trip',options={}){
 let session=createTestSession({scenario:'fold-drive',foldCase,seed:'fold-ui'});
 const calls=[],navigation=[],document={createElement:tag=>new Element(tag)};
 const dialog={body:new Element('div'),revision:0,opened:false,kind:null,open(title,kind){this.title=title;this.kind=kind;this.opened=true;this.revision++;this.body.replaceChildren();},close(){this.opened=false;this.revision++;}};
 const ui=createFoldDriveTestUI({dialog,document,getSession:()=>session,getDevice:()=> 'touch',runCommand:async(name,args)=>{calls.push({name,args});if(options.runCommand)return options.runCommand(name,args);return session.game[name](args.id);},openMap:()=>navigation.push('map'),resume:()=>navigation.push('resume'),retry:()=>navigation.push('retry'),chooseExercise:()=>navigation.push('choose'),exit:()=>navigation.push('exit'),clipboard:options.clipboard});
 const all=()=>nodes(dialog.body),button=label=>all().find(node=>node.tagName==='button'&&node.textContent===label),command=(name,id)=>all().find(node=>node.dataset.foldCommand===name&&(!id||node.dataset.foldTarget===id));
 return{ui,dialog,calls,navigation,all,button,command,text:()=>text(dialog.body),get session(){return session;},setSession:next=>{session=next;}};
}

test('opening the fold panel reads the fixture without taking a test or spending resources',()=>{
 const f=fixture(),before=JSON.stringify(f.session.game.state);f.ui.open();
 assert.equal(f.dialog.kind,'fold-test');assert.match(f.text(),/Fold Drive I|fold drive/i);
 assert.equal(f.all().filter(node=>node.className?.split(' ').includes('fold-test-status')).length,0);
 assert.ok(f.button('Open Galaxy chart'));assert.ok(f.button('Fly in test range'));assert.ok(f.command('travel'));
 assert.equal(f.calls.length,0);assert.equal(foldDriveTestState(f.session).attempts.length,0);assert.equal(JSON.stringify(f.session.game.state),before);
 f.button('Open Galaxy chart').onclick();f.button('Fly in test range').onclick();assert.deepEqual(f.navigation,['map','resume']);
});

test('the completed round trip adds its result without repeating the setup goal',async()=>{
 const f=fixture();f.ui.open();
 for(let i=0;i<2;i++)await f.command('travel',foldDriveTestState(f.session).targetId).onclick();
 assert.equal(foldDriveTestState(f.session).complete,true);
 const status=f.all().find(node=>node.className?.split(' ').includes('fold-test-status'));
 assert.ok(status);assert.match(text(status),/Test passed/);
 const goal=foldDriveTestState(f.session).case.goal;
 assert.equal(f.all().filter(node=>node.textContent===goal).length,1);
});

test('installation controls exercise actual prerequisite refusals and purchase debits',async()=>{
 const f=fixture('installation');f.ui.open();assert.match(f.text(),/500 credits.*12 ore/);
 assert.equal(f.command('buyUpgrade','fold_1').disabled,false);
 await f.command('buyUpgrade','fold_1').onclick();
 assert.equal(foldDriveTestState(f.session).lastAttempt.actual.code,'prerequisite');assert.equal(f.session.game.state.credits,500);assert.equal(f.session.game.state.cargo.ore,12);
 for(const id of ['thrusters_1','scanner_1','fold_1'])await f.command('buyUpgrade',id).onclick();
 assert.equal(f.session.game.state.credits,0);assert.equal(f.session.game.state.cargo.ore,0);assert.equal(f.session.game.state.ship.warpRange,5);
 assert.equal(foldDriveTestState(f.session).lastAttempt.passed,true);assert.match(f.text(),/PASS · Installation attempt/);
 await f.command('launch').onclick();assert.equal(f.session.game.state.mode,'ship');
 const target=foldDriveTestState(f.session).targetId;await f.command('travel',target).onclick();
 assert.equal(f.session.game.state.systemId,target);assert.match(f.text(),/PASS · Jump attempt/);assert.match(f.text(),/Expected: Allowed\. Actual: Allowed/);
});

test('intentional range and fuel refusals remain clickable and show observed engine results',async()=>{
 for(const testCase of ['range','fuel','no-drive','docked']){
  const f=fixture(testCase);f.ui.open();const before=foldDriveTestState(f.session).current,target=foldDriveTestState(f.session).targetId;
  const button=f.command('travel',target);assert.ok(button);assert.equal(button.disabled,false);
  await button.onclick();const state=foldDriveTestState(f.session);
  assert.equal(state.lastAttempt.actual.ok,false);assert.equal(state.lastAttempt.passed,true,testCase);assert.equal(state.current.systemId,before.systemId);assert.equal(state.current.fuel,before.fuel);assert.match(f.text(),/PASS · Jump attempt/);assert.match(f.text(),/Expected: Blocked/);
 }
});

test('stale controls and duplicated pending commands cannot run against another panel',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const f=fixture('round-trip',{runCommand:()=>pending});
 f.ui.open();const old=f.command('travel');f.ui.open();await old.onclick();assert.equal(f.calls.length,0);
 const action=f.command('travel'),first=action.onclick();assert.equal(action.disabled,true);await action.onclick();assert.equal(f.calls.length,1);
 f.dialog.open('Another screen','other');finish({ok:true});await first;assert.equal(f.dialog.kind,'other');
 f.ui.open();const replaced=f.command('travel');f.setSession(createTestSession({scenario:'fold-drive',seed:'replacement'}));await replaced.onclick();assert.equal(f.calls.length,1);
 f.ui.open();const closed=f.command('travel');f.dialog.close();await closed.onclick();assert.equal(f.calls.length,1);
});

test('a failed command is visible and its controls become available again',async()=>{
 const f=fixture('round-trip',{runCommand:()=>{throw new Error('Interrupted test');}});f.ui.open();const action=f.command('travel');await action.onclick();
 assert.match(f.text(),/could not finish: Interrupted test/);assert.doesNotMatch(f.text(),/PASS · Jump attempt/);assert.equal(action.disabled,false);
});

test('copyable reports contain only observed synthetic test state and have a selectable fallback',async()=>{
 const copied=[];const f=fixture('range',{clipboard:{writeText:async value=>copied.push(value)}});f.ui.open();
 await f.command('travel',foldDriveTestState(f.session).targetId).onclick();await f.button('Copy test report').onclick();
 const report=JSON.parse(copied[0]);assert.equal(report.setup,'range');assert.equal(report.attempts.length,1);assert.equal(report.attempts[0].actual.code,'range');assert.equal('seed' in report,false);assert.match(f.text(),/report copied/);
 const g=fixture('round-trip',{clipboard:{writeText:async()=>{throw new Error('Denied');}}});g.ui.open();await g.button('Copy test report').onclick();
 const field=g.all().find(node=>node.tagName==='textarea');assert.equal(field.readOnly,true);assert.equal(field.focused,true);assert.equal(field.selected,true);assert.match(g.text(),/Select and copy/);
 assert.equal(foldDriveTestReport(null),'');
});

test('the fold panel does not replace a normal combat exercise dialog',()=>{
 const f=fixture();f.setSession(createTestSession({scenario:'ship-combat'}));f.dialog.open('Combat','test-controls');assert.equal(f.ui.open(),null);assert.equal(f.dialog.kind,'test-controls');
});
