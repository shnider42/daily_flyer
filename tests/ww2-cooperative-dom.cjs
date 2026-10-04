/* Three independent browser DOMs share a disposable Flask/SQLite game.
   This verifies actual UI/API integration, not browser layout or touch geometry. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync('/tmp/ww2-cooperative-dom-'),db=path.join(tmp,'game.sqlite'),root=path.resolve(__dirname,'..'),views=[],errors=[];
function request(route,options={}){
 const r=JSON.parse(cp.execFileSync('python',['tests/ww2-api-bridge.py',db],{cwd:root,env:{...process.env,PYTHONPATH:root},input:JSON.stringify({path:route,method:options.method||'GET',headers:options.headers||{},body:options.body}),encoding:'utf8'}));
 return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>r.data};
}
const delay=()=>new Promise(r=>setTimeout(r,50));
async function make(label,width){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ww2_tactics/static/index.html'),'utf8'),{url:'http://dsl.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,ctx=dom.getInternalVMContext();w.innerWidth=width;w.innerHeight=900;w.scrollTo=()=>{};
 w.matchMedia=query=>{const min=query.match(/min-width:\s*(\d+)/),max=query.match(/max-width:\s*(\d+)/);return {matches:!!(min||max)&&(!min||width>=+min[1])&&(!max||width<=+max[1]),media:query,addEventListener(){},removeEventListener(){}};};
 w.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.CSS={supports:()=>true,escape:s=>s};w.confirm=()=>true;
 w.fetch=async(url,opts)=>request(new URL(url,w.location.href).pathname+new URL(url,w.location.href).search,opts);
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollBy=function(){};
 w.SVGElement.prototype.getBBox=function(){return {x:0,y:0,width:600,height:800};};
 w.SVGElement.prototype.getScreenCTM=function(){return {inverse(){return this;},a:1,b:0,c:0,d:1,e:0,f:0};};
 w.SVGSVGElement.prototype.createSVGPoint=function(){return {x:0,y:0,matrixTransform(){return this;}};};
 Object.defineProperty(w.SVGSVGElement.prototype,'viewBox',{get(){const n=(this.getAttribute('viewBox')||'0 0 600 800').split(/[ ,]+/).map(Number);return {baseVal:{x:n[0],y:n[1],width:n[2],height:n[3]}};}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new w.Event('close'));}};
 w.addEventListener('error',e=>{errors.push(label+': '+(e.error?.stack||e.message));e.preventDefault();});
 const $=id=>w.document.getElementById(id),e=code=>vm.runInContext(code,ctx);
 const view={dom,w,$,e,label,
  async settle(){await delay();await delay();assert.deepEqual(errors,[]);},
  async click(id){assert.ok($(id),id);assert.equal($(id).disabled,false,id+' disabled');$(id).click();await this.settle();},
  async select(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('change'));await this.settle();},
  async refresh(){await e('refresh()');await this.settle();if(e('!!playbackSession')){e('stopPlayback()');await this.settle();}},
  async submit(id){$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await this.settle();},
 };
 views.push(view);
 for(const script of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(path.join(root,'ww2_tactics/static',script.getAttribute('src').replace('/assets/','')),'utf8'),ctx,{filename:script.getAttribute('src')});
 await view.settle();return view;
}
async function register(v,name){await v.click('commanderSignIn');await v.click('commanderRegisterMode');v.$('commanderName').value=name;v.$('commanderPassword').value='local-dom-test-pass';await v.submit('commanderForm');assert.equal(v.w.ww2Commander.name,name);}
async function join(v,code,side){v.$('code').value=code;await v.submit('joinForm');assert.equal(v.$('coopJoinDialog').open,true);await v.select('coopJoinSide',side);await v.click('coopJoinSubmit');assert.equal(v.e('state.coop.phase'),'lobby');assert.equal(v.$('coopRoom').hidden,false);}
async function main(){
 const h=await make('host',1280),a=await make('ally',390),b=await make('opponent',390);
 await register(h,'CoopHost');await register(a,'CoopAlly');await register(b,'CoopOpponent');
 await h.select('scenarioSelect','village');await h.click('createCoop');assert.equal(h.$('cooperativeCreation').hidden,false);
 await h.select('coopDefaultDifficulty','easy');h.$('multiplayerName').value='Three player exercise';await h.submit('namedGameForm');
 assert.equal(h.$('coopRoom').hidden,false);assert.equal(h.$('game').hidden,true);assert.equal(h.e('state.coop.phase'),'lobby');
 const code=h.e('session.code');await join(a,code,'us');await join(b,code,'de');await h.refresh();
 assert.equal(h.e('state.coop.players.length'),3);assert.equal(a.$('coopStart').hidden,true);assert.equal(b.$('coopStart').hidden,true);
 assert.equal(h.e('state.ready'),false);assert.equal(h.e('state.coop.groups.filter(g=>!g.owner).every(g=>g.difficulty==="easy")'),true);
 await h.select('coopAllDifficulty','standard');await h.click('coopSetDifficulty');
 assert.equal(h.e('state.coop.groups.filter(g=>!g.owner).every(g=>g.difficulty==="standard")'),true);
 await h.click('coopStart');await a.refresh();await b.refresh();assert.equal(h.$('coopRoom').hidden,true);assert.equal(h.$('game').hidden,false);
 assert.equal(h.$('end').textContent,'Finish my orders');assert.equal(h.$('rematchButton').hidden,true);assert.equal(a.$('resignButton').hidden,true);
 assert.equal(b.$('end').disabled,true);
 const own=h.e('state.coop.controlled[0]');h.e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(own)}))`);await h.settle();
 const other=h.e('Object.keys(state.coop.controllers).find(id=>state.coop.controllers[id]&&state.coop.controllers[id]!==state.coop.me)');
 h.e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(other)}))`);await h.settle();assert.match(h.$('unitPurpose').textContent,/CoopAlly/);assert.equal(h.e('state.legal[selected].moves.length'),0);
 await h.click('end');assert.equal(h.e('state.coop.done'),true);assert.equal(h.e('state.turn'),'us');assert.equal(h.$('end').disabled,true);await a.refresh();
 await a.click('end');if(a.e('!!playbackSession'))a.e('stopPlayback()');await a.settle();assert.equal(a.e('state.turn'),'de');
 await b.refresh();assert.equal(b.$('end').disabled,false);await b.click('end');if(b.e('!!playbackSession'))b.e('stopPlayback()');await b.settle();
 await h.refresh();assert.equal(h.e('state.round'),2);assert.equal(h.e('state.coop.done'),false);
 // A commander signs in on a fresh browser and resumes exactly the same group.
 const fresh=await make('returning ally',390);await fresh.click('commanderSignIn');fresh.$('commanderName').value='CoopAlly';fresh.$('commanderPassword').value='local-dom-test-pass';await fresh.submit('commanderForm');
 fresh.$('code').value=code;await fresh.submit('joinForm');assert.equal(fresh.e('state.coop.me'),a.e('state.coop.me'));assert.equal(fresh.$('coopJoinDialog').open,false);
 // Finish a co-op battle, then create the private preparation variant.
 if(h.e("!!playbackSession")){h.e("stopPlayback()");await h.settle();}
 await h.e("act({kind:'resign'})");await h.settle();assert.equal(h.e('state.winner'),'de');assert.equal(h.$('resultRematch').hidden,true);await h.click('resultHome');
 await h.select('scenarioSelect','shingle_cove');await h.click('createCoop');await h.select('coopControlSize','platoons');await h.select('multiplayerSide','de');await h.submit('namedGameForm');
 assert.equal(h.$('deploymentPanel').hidden,true);const prep=h.e('session.code');await a.click('homeBattles');await join(a,prep,'de');await h.refresh();await h.click('coopStart');await a.refresh();
 assert.equal(h.e('state.deployment.phase'),'planning');assert.equal(h.$('deploymentPanel').hidden,false);assert.equal(a.$('deploymentPlan').hidden,true);assert.equal(h.$('deploymentReset').hidden,true);
 for(const v of [h,a])assert.equal([...v.$('deploymentUnit').options].filter(o=>o.value).every(o=>v.e(`state.coop.controlled.includes(${JSON.stringify(o.value)})`)),true);
 await h.click('deploymentLock');await h.click('deploymentConfirm');assert.equal(h.e('state.coop.done'),true);assert.equal(h.e('state.deployment.phase'),'planning');
 await a.refresh();await a.click('deploymentLock');await a.click('deploymentConfirm');if(a.e('!!playbackSession'))a.e('stopPlayback()');await a.settle();
 assert.equal(a.e('state.deployment.phase'),'battle');assert.equal(a.e('state.turn'),'de');
 assert.deepEqual(errors,[]);console.log('PASS: three-player UI/API flow; mobile + desktop DOMs; ownership; host start; per-group difficulty; readiness; both armies; reconnect; results; private pre-battle setup. No visual-layout claim.',tmp);
}
main().catch(error=>{console.error(error);console.error(errors);for(const v of views)console.error(v.label,v.e("({phase:state?.coop?.phase,side:state?.side,winner:state?.winner,playing:!!playbackSession,round:state?.round,busy,polling,lobbyMode,message:$('message').textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})"));process.exitCode=1;}).finally(()=>views.forEach(v=>v.dom.window.close()));
