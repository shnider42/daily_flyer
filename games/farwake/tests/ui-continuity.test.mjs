import test from 'node:test';
import assert from 'node:assert/strict';
import { Dialog } from '../dist/ui.mjs';
import { createNarrativeUI } from '../dist/narrative-ui.mjs';
import { NOTEBOOK_SECTIONS } from '../dist/notebook-navigation.mjs';

// A small DOM fixture exercises the real controllers without a browser runtime
// or an added production dependency. Layout itself is checked in the browser.
const decode=value=>String(value).replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[entity]));
class Element {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.className='';this.id='';this._text='';this._disabled=false;this.hidden=false;this.open=false;this.scrollTop=0;this.value='';this.listeners={};this.focusCalls=[];}
  get isConnected(){return this===this.ownerDocument.body||!!this.parentElement?.isConnected;}
  get offsetParent(){return this.isConnected&&!this.hidden?this.parentElement:null;}
  get disabled(){return this._disabled;}
  set disabled(value){this._disabled=!!value;if(value&&this.ownerDocument.activeElement===this)this.ownerDocument.activeElement=this.ownerDocument.body;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get firstElementChild(){return this.children.find(node=>node.tagName!=='#TEXT')||null;}
  get firstChild(){return this.children[0]||null;}
  get classList(){const node=this;return{add(...names){node.className=[...new Set([...node.className.split(/\s+/).filter(Boolean),...names])].join(' ');},contains(name){return node.className.split(/\s+/).includes(name);},toggle(name,on){const yes=on??!this.contains(name);node.className=node.className.split(/\s+/).filter(value=>value&&value!==name).concat(yes?[name]:[]).join(' ');return yes;}};}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);if(name==='id')this.id=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
  getAttribute(name){if(name==='id')return this.id||null;if(name==='class')return this.className||null;return this.attributes[name]??null;}
  append(...nodes){for(let node of nodes){if(typeof node==='string'){const text=this.ownerDocument.createElement('#text');text.textContent=node;node=text;}if(node.parentElement)node.remove();node.parentElement=this;this.children.push(node);}}
  prepend(...nodes){for(const node of [...nodes].reverse()){if(node.parentElement)node.remove();node.parentElement=this;this.children.unshift(node);}}
  remove(){if(!this.parentElement)return;if(this.contains(this.ownerDocument.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
  replaceChildren(...nodes){for(const node of [...this.children])node.remove();this._text='';this.append(...nodes);}
  replaceWith(node){const parent=this.parentElement,index=parent.children.indexOf(this);node.remove();this.remove();node.parentElement=parent;parent.children.splice(index,0,node);}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  addEventListener(name,fn){this.listeners[name]=fn;}
  focus(options){this.ownerDocument.activeElement=this;this.focusCalls.push(options);}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  getContext(){return{};}
  matches(selector){let value=selector.trim();if(value.includes(':not(:disabled)')){if(this.disabled)return false;value=value.replace(':not(:disabled)','');}const attrs=[...value.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];value=value.replace(/\[[^\]]+\]/g,'');for(const[,name,wanted]of attrs){const present=name.startsWith('data-')?this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]:this.getAttribute(name);if(present==null||wanted!==undefined&&present!==wanted)return false;}if(value.startsWith('.'))return value.slice(1).split('.').every(name=>this.classList.contains(name));if(value.startsWith('#'))return this.id===value.slice(1);return !value||this.tagName===value.toUpperCase();}
  querySelectorAll(selector){const choices=selector.split(','),found=[];const visit=node=>{for(const child of node.children){if(choices.some(choice=>child.matches(choice)))found.push(child);visit(child);}};visit(this);return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  set innerHTML(markup){this.replaceChildren();const stack=[this];for(const token of markup.match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(token.startsWith('<')){const match=token.match(/^<([\w-]+)([^>]*)>/);if(!match)continue;const node=this.ownerDocument.createElement(match[1]);for(const attribute of match[2].matchAll(/([\w:-]+)(?:="([^"]*)"|'([^']*)')?/g))node.setAttribute(attribute[1],decode(attribute[2]??attribute[3]??''));stack.at(-1).append(node);if(!['br','input','hr','img'].includes(match[1])&&!token.endsWith('/>'))stack.push(node);}else{const node=this.ownerDocument.createElement('#text');node.textContent=decode(token);stack.at(-1).append(node);}}}
}
function documentFixture(){const doc={createElement:tag=>new Element(tag,doc),getElementById:id=>doc.body.id===id?doc.body:doc.body.querySelector('#'+id)};doc.body=new Element('body',doc);doc.activeElement=doc.body;for(const[id,parent]of[['outside',doc.body],['modalBackdrop',doc.body],['modal',null],['modalTitle',null],['modalEyebrow',null],['closeModal',null],['modalBody',null]]){const node=doc.createElement(id==='outside'||id==='closeModal'?'button':'div');node.id=id;(parent||doc.getElementById(id==='modal'?'modalBackdrop':'modal')).append(node);}return doc;}
function withDocument(t){const prior=globalThis.document,doc=documentFixture();globalThis.document=doc;t.after(()=>{globalThis.document=prior;});return doc;}
function appendState(doc,dialog){const details=doc.createElement('details');details.dataset.dialogKey='help';const summary=doc.createElement('summary');summary.textContent='Help';details.append(summary);const input=doc.createElement('input');input.id='search';input.value='Kettle';dialog.body.append(details,input);return{details,input};}

test('refreshing one menu keeps width, scroll, expanded help and the focused control',async t=>{
 const doc=withDocument(t),opened=[],dialog=new Dialog({onOpen:()=>opened.push(true)});doc.getElementById('outside').focus();
 dialog.open('Outfitter','shop',{wide:true,contextKey:'shop:kettle'});const old=appendState(doc,dialog);old.details.open=true;old.input.focus();old.input.setSelectionRange(1,4);dialog.body.scrollTop=185;
 dialog.open('Outfitter','shop',{contextKey:'shop:kettle'});const current=appendState(doc,dialog);await Promise.resolve();
 assert.equal(dialog.el.classList.contains('wide'),true);assert.equal(dialog.body.scrollTop,185);assert.equal(current.details.open,true);assert.equal(doc.activeElement,current.input);assert.equal(current.input.selectionStart,1);assert.equal(current.input.selectionEnd,4);assert.equal(opened.length,1);
 dialog.close();assert.equal(doc.activeElement,doc.getElementById('outside'));
});

test('navigation starts at the top and an old refresh cannot restore over the new view',async t=>{
 const doc=withDocument(t),dialog=new Dialog();dialog.open('Contact','npc',{contextKey:'npc:one'});appendState(doc,dialog).input.focus();dialog.body.scrollTop=230;
 dialog.open('Contact','npc',{contextKey:'npc:one'});appendState(doc,dialog);
 dialog.open('Contact','npc',{contextKey:'npc:two',wide:true});const next=appendState(doc,dialog);next.input.focus();await Promise.resolve();
 assert.equal(dialog.body.scrollTop,0);assert.equal(doc.activeElement,next.input);assert.equal(dialog.contextKey,'npc:two');assert.equal(dialog.el.classList.contains('wide'),true);
});

test('a refresh respects deliberate new focus and stale choices cannot execute',async t=>{
 const doc=withDocument(t),calls=[],dialog=new Dialog();dialog.open('Shop','shop');const old=dialog.choices([{label:'Buy tool',action:()=>calls.push('buy')}]).firstElementChild;old.focus();dialog.body.scrollTop=40;
 dialog.open('Shop','shop');const current=dialog.choices([{label:'Buy tool',action:()=>calls.push('new')}]).firstElementChild;doc.getElementById('closeModal').focus();await Promise.resolve();
 assert.equal(doc.activeElement,doc.getElementById('closeModal'));old.onclick();assert.deepEqual(calls,[]);current.onclick();assert.deepEqual(calls,['new']);dialog.close();current.onclick();assert.deepEqual(calls,['new']);
});

function narrativeFixture(t,handler){const doc=withDocument(t),dialog=new Dialog(),accepted=[],calls=[],tracked=[],journal=[];
 const entity={id:'quest:ara',name:'Ara',data:{contactId:'ara'}},contact={name:'Ara',roleLabel:'Medic',greeting:'The cold store needs a new feed.'};
 let view={id:'cold_chain',status:'active',title:'Cold Chain',stageTitle:'Repair the feed',category:'Campaign',text:'Read the damaged lead before reconnecting it.',objective:'Use the marked feed.',target:{systemId:'hearth',bodyId:'kettle',entityId:'quest:ara'},actions:[{action:'repair',label:'Reconnect the feed',available:true}],localCampaign:{step:2,total:5,focus:'Engineering & mutual aid',scope:'Hearth · no fold drive required'}};
 const game={state:{seed:'ui-test',mode:'person',systemId:'hearth',locationId:'kettle',credits:90,cargo:{ore:2},ship:{fuel:50}},galaxy:[{id:'hearth',name:'Hearth',bodies:[{id:'kettle',name:'Kettle'}]}],currentBody:{name:'Kettle'},narrativeBoard:()=>({active:view?[view]:[],available:[],completed:[]})};
 const ui=createNarrativeUI({getGame:()=>game,dialog,invoke:async(name,args)=>{calls.push({name,args});return handler?handler(name,args):{ok:true,contact,threads:[view]};},acceptResult:answer=>{accepted.push(answer);game.onAccept?.(answer);return answer.ok;},track:(...args)=>tracked.push(args),legacyJournal:key=>journal.push(key),legacyJobs:()=>{},drawPortrait:()=>{}});
 return{doc,dialog,ui,game,entity,contact,calls,accepted,tracked,journal,setView:value=>view=value,getView:()=>view,button:label=>dialog.body.querySelectorAll('button').find(node=>node.textContent===label)};
}

test('a story action updates the same contact with the next step instead of a receipt menu',async t=>{
 let f;f=narrativeFixture(t,async name=>{if(name==='inspectContact')return{ok:true,contact:f.contact,threads:[f.getView()]};f.game.state.credits+=15;f.setView({...f.getView(),stageTitle:'Deliver the pack',objective:'Take the pack to Morrow.',target:{systemId:'hearth',bodyId:'morrow'},actions:[],localCampaign:{...f.getView().localCampaign,step:3}});return{ok:true,text:'The cold store is working. Ara hands you the pack.'};});
 await f.ui.openContact(f.entity);const header=f.dialog.body.querySelector('.notebook-contact'),title=f.doc.getElementById('modalTitle').textContent,revision=f.dialog.revision;
 const action=f.button('Reconnect the feed');action.focus();f.dialog.body.scrollTop=140;await action.onclick();
 assert.equal(f.dialog.kind,'npc');assert.equal(f.doc.getElementById('modalTitle').textContent,title);assert.equal(f.dialog.el.classList.contains('wide'),false);assert.equal(f.dialog.revision,revision);assert.equal(f.dialog.body.querySelector('.notebook-contact'),header);assert.equal(f.dialog.body.scrollTop,140);
 assert.match(f.dialog.body.textContent,/The cold store is working/);assert.match(f.dialog.body.textContent,/Take the pack to Morrow/);assert.match(f.dialog.body.textContent,/105 cr/);assert.equal(f.doc.activeElement.className,'thread-feedback');assert.ok(f.button('Mark destination'));assert.equal(f.button('Back to the story'),undefined);
 await action.onclick();assert.equal(f.calls.filter(call=>call.name==='threadAction').length,1,'The detached action cannot execute again.');
});

test('navigating away while a story command is pending rejects its late presentation',async t=>{
 let resolve,f;f=narrativeFixture(t,async name=>name==='inspectContact'?{ok:true,contact:f.contact,threads:[f.getView()]}:new Promise(done=>resolve=done));await f.ui.openContact(f.entity);
 const action=f.button('Reconnect the feed'),request=action.onclick();await action.onclick();assert.equal(f.calls.filter(call=>call.name==='threadAction').length,1);
 f.dialog.open('Music & listening','music');f.dialog.body.textContent='Music settings';resolve({ok:true,text:'An old result'});await request;
 assert.equal(f.dialog.kind,'music');assert.equal(f.dialog.body.textContent,'Music settings');assert.equal(f.accepted.length,1,'Only the original contact inspection reached presentation.');
});

test('closing a pending contact inspection never reopens it, while a fresh request can finish',async t=>{
 const pending=[];const f=narrativeFixture(t,()=>new Promise(resolve=>pending.push(resolve)));f.dialog.open('Stories','narrative');const first=f.ui.openContact(f.entity);f.dialog.close();const second=f.ui.openContact(f.entity);assert.equal(pending.length,2);
 pending[0]({ok:true,contact:{name:'Old contact'},threads:[]});await first;assert.equal(f.dialog.opened,false);
 pending[1]({ok:true,contact:f.contact,threads:[]});await second;assert.equal(f.dialog.opened,true);assert.equal(f.doc.getElementById('modalTitle').textContent,'Ara');
});

test('failed commands retain the puzzle and show an explicit error without a success receipt',async t=>{
 let f;f=narrativeFixture(t,async name=>{if(name==='inspectContact')return{ok:true,contact:f.contact,threads:[f.getView()]};throw new Error('offline');});await f.ui.openContact(f.entity);const action=f.button('Reconnect the feed');await action.onclick();
 assert.equal(f.dialog.kind,'npc');assert.equal(f.button('Reconnect the feed'),action);assert.equal(action.disabled,false);assert.equal(f.dialog.body.querySelector('.thread-feedback'),null);assert.match(f.accepted.at(-1).reason,/could not finish/);
});

test('notebook navigation stays consistent and optional contact context remains readable',async t=>{
 let f;f=narrativeFixture(t,async()=>({ok:true,contact:{...f.contact,lastMemory:'The clinic has a working feed.'},threads:[f.getView()],dialogue:{updateLabel:'Review the repair',updateText:'The clinic has a working feed.',topics:[{id:'work',label:'What does the clinic need?',text:'Bring sealed medicine <not loose supplies>.'}]}}));
 f.ui.openBoard();const labels=f.dialog.body.querySelector('.notebook-nav').querySelectorAll('button').map(node=>node.textContent);assert.deepEqual(labels,NOTEBOOK_SECTIONS.map(([,label])=>label));f.button('Missions & contracts').onclick();assert.deepEqual(f.journal,['missions']);
 await f.ui.openContact(f.entity);const details=f.dialog.body.querySelectorAll('details');assert.equal(details.filter(node=>node.textContent.includes('The clinic has a working feed.')).length,1);assert.ok(details.every(node=>!node.open));assert.match(f.dialog.body.textContent,/Bring sealed medicine <not loose supplies>/);
});

test('optional story offers stay folded until the player chooses to discuss them',async t=>{
 const f=narrativeFixture(t);f.setView({...f.getView(),status:'available'});await f.ui.openContact(f.entity);
 const offer=f.dialog.body.querySelector('.contact-offer');assert.ok(offer);assert.equal(offer.open,false);assert.equal(offer.querySelector('summary').textContent,'Discuss Cold Chain');assert.match(offer.textContent,/Use the marked feed/);
});

test('starting a profession updates the work menu and removes stale competing offers',async t=>{
 let f,work;f=narrativeFixture(t,async()=>{work={...work,active:{...work.offers[0],status:'active',objective:'Treat the first patient.',actions:[{action:'triage',jobId:'clinic-1',label:'Treat patient',available:true}]},offers:[{...work.offers[1],id:'law-2'}]};return{ok:true,text:'Clinic shift started.'};});
 work={careers:[{id:'doctor',name:'Doctor',enlisted:true,actions:[]},{id:'law',name:'Law',enlisted:true,actions:[]}],active:null,offers:[{id:'clinic-1',professionId:'doctor',title:'Clinic shift',text:'Care for three patients.',actions:[{action:'accept',label:'Start clinic shift',available:true}]},{id:'law-1',professionId:'law',title:'Local inquiry',text:'Review a complaint.',actions:[{action:'accept',label:'Start inquiry',available:true}]}],events:[]};
 f.game.professionBoard=()=>work;f.ui.openProfessions(f.entity);const action=f.button('Start clinic shift');assert.ok(f.button('Start inquiry'));action.focus();f.dialog.body.scrollTop=175;await action.onclick();await Promise.resolve();
 assert.equal(f.dialog.kind,'narrative');assert.equal(f.doc.getElementById('modalTitle').textContent,'Captain’s notebook');assert.equal(f.dialog.el.classList.contains('wide'),true);assert.equal(f.dialog.body.scrollTop,175);assert.ok(f.button('Treat patient'));assert.equal(f.button('Start inquiry'),undefined);assert.match(f.dialog.body.textContent,/Clinic shift started/);assert.equal(f.doc.activeElement.className,'thread-feedback');
});


test('a game event opened during result processing retains priority over the story refresh',async t=>{
 let f;f=narrativeFixture(t,async name=>name==='inspectContact'?{ok:true,contact:f.contact,threads:[f.getView()]}:{ok:true,text:'Repair recorded.'});await f.ui.openContact(f.entity);
 f.game.onAccept=()=>{f.dialog.open('Emergency hail','encounter');f.dialog.body.textContent='A real arrival needs your attention.';};
 await f.button('Reconnect the feed').onclick();assert.equal(f.dialog.kind,'encounter');assert.equal(f.dialog.body.textContent,'A real arrival needs your attention.');assert.equal(f.accepted.length,2);
});
