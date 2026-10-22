/* Socket-free DOM/API regression tests; not a visual-layout browser test. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync('/tmp/ww2-backport-dom-'),db=path.join(tmp,'game.sqlite'),errors=[];
function request(route,options={}){
 const r=JSON.parse(cp.execFileSync('python',['tests/ww2-api-bridge.py',db],{cwd:root,env:{...process.env,PYTHONPATH:root},input:JSON.stringify({path:route,method:options.method||'GET',headers:options.headers||{},body:options.body}),encoding:'utf8'}));
 return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>r.data};
}
const delay=()=>new Promise(r=>setTimeout(r,30));
async function make(width){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ww2_tactics/static/index.html'),'utf8'),{url:'http://dsl.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,ctx=dom.getInternalVMContext();w.innerWidth=width;w.innerHeight=900;w.scrollTo=()=>{};w.setInterval=()=>0;
 w.matchMedia=query=>{const min=query.match(/min-width:\s*(\d+)/),max=query.match(/max-width:\s*(\d+)/);return {matches:query.includes('prefers-reduced-motion')||!!(min||max)&&(!min||width>=+min[1])&&(!max||width<=+max[1]),media:query,addEventListener(){},removeEventListener(){}};};
 w.DOMMatrix=class{constructor(){Object.assign(this,{a:1,b:0,c:0,d:1,e:0,f:0});}multiply(){return this;}inverse(){return this;}scale(){return this;}translate(){return this;}};
 w.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.CSS={supports:()=>true,escape:s=>s};w.confirm=()=>true;
 w.fetch=async(url,opts)=>request(new URL(url,w.location.href).pathname+new URL(url,w.location.href).search,opts);
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollBy=function(){};
 w.SVGElement.prototype.getBBox=function(){return {x:0,y:0,width:600,height:800};};
 Object.defineProperty(w.SVGElement.prototype,'transform',{get(){return {baseVal:{numberOfItems:0}};}});
 w.SVGElement.prototype.getScreenCTM=function(){return {inverse(){return this;},a:1,b:0,c:0,d:1,e:0,f:0};};
 w.SVGSVGElement.prototype.createSVGPoint=function(){return {x:0,y:0,matrixTransform(){return this;}};};
 Object.defineProperty(w.SVGSVGElement.prototype,'viewBox',{get(){const n=(this.getAttribute('viewBox')||'0 0 600 800').split(/[ ,]+/).map(Number);return {baseVal:{x:n[0],y:n[1],width:n[2],height:n[3]}};}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new w.Event('close'));}};
 w.addEventListener('error',e=>{errors.push(e.error?.stack||e.message);e.preventDefault();});
 for(const script of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(path.join(root,'ww2_tactics/static',script.getAttribute('src').replace('/assets/','')),'utf8'),ctx,{filename:script.getAttribute('src')});
 await delay();assert.deepEqual(errors,[]);
 return {dom,w,e:code=>vm.runInContext(code,ctx),$:id=>w.document.getElementById(id)};
}
async function fixture(v,name,old=false){
 // Setup only in this test's disposable database; actions use the real API.
 const setup=`import json,sqlite3,sys
from unittest.mock import patch
from contextlib import ExitStack
from ww2_web import create_app
db,scenario,old=sys.argv[1:]
c=create_app(db).test_client()
with ExitStack() as stack:
 if old=='true':
  stack.enter_context(patch('ww2_tactics.air_support.configure'))
  stack.enter_context(patch('ww2_tactics.carrier_decks.configure'))
 seat=c.post('/api/match',json=dict(scenario=scenario,ruleset='dsl')).json
guest=c.post('/api/match/'+seat['code']+'/join').json
conn=sqlite3.connect(db)
s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(seat['code'],)).fetchone()[0])
plane=next((u for u in s['units'] if u['side']=='us' and u['kind']=='bomber'),None)
if plane:
 plane.update(hp=2,bombs=0)
 if s.get('air_support_version'):
  field=next(u for u in s['units'] if u['side']=='us' and u['kind']=='airfield')
  plane['pos']=field['pos'].copy()
conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),seat['code']));conn.commit();conn.close()
print(json.dumps(dict(seat=seat,guest=guest)))`;
 const data=JSON.parse(cp.execFileSync('python',['-c',setup,db,name,String(old)],{cwd:root,encoding:'utf8'}));
 v.w.testSeat=data.seat;v.w.testGuest=data.guest;
 await v.e("(async()=>{if(playbackSession)stopPlayback();document.querySelectorAll('dialog[open]').forEach(d=>d.close());remember(testSeat);lobbyMode=false;state=await api('/api/match/'+session.code);selected=null;target=null;render();})()");
 await delay();assert.deepEqual(errors,[]);return data;
}
async function click(v,button){assert.ok(button);assert.equal(button.disabled,false);button.click();await delay();await delay();assert.deepEqual(errors,[]);}
async function main(){
 for(const width of [2560,390]){
  const v=await make(width),{e,$,w}=v;
  try{
   for(const name of ['britain','fubar','worlds_collide']){
    await fixture(v,'current:'+name);
    e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='airfield'))");
    assert.match($('roleBrief').textContent,/6\/6 finite service uses/);
    assert.equal($('currentAirSupportManual').hidden,false);
    assert.ok(w.ww2Learning.lessons(e('state')).some(l=>l.id==='finite-air-support'));
    if(name!=='britain'){
     e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier'))");
     assert.equal($('overwatch').hidden,false);assert.match($('overwatch').textContent,/AA interception/);
     assert.match($('unitMechanics').textContent,/range 1/);
     e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='bomber'))");
     await click(v,$('rearm'));
     assert.equal(e("state.units.find(u=>u.side===state.side&&u.kind==='airfield').air_stores"),5);
    }
   }
   await fixture(v,'current:crosswind_strait');
   e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='bomber'&&u.platoon==='A'))");
   assert.equal($('rearm').hidden,true);assert.equal($('carrierGroupOpen').hidden,false);
   await click(v,$('carrierGroupOpen'));assert.equal($('carrierAirGroupDialog').open,true);
   await click(v,w.document.querySelector('[data-recover-carrier]'));
   assert.ok(e('state.units.find(u=>u.id===selected).carrier_id'));
   await click(v,$('carrierGroupOpen'));
   assert.match($('carrierAirGroupContent').textContent,/1\/3 aboard/);
   await click(v,w.document.querySelector('[data-service-plane]'));
   assert.match($('carrierAirGroupContent').textContent,/5\/6 service stores/);
   assert.match($('carrierAirGroupContent').textContent,/2\/2 load/);
   assert.equal(w.document.querySelector('[data-launch-plane]').disabled,true);
   $('carrierAirGroupDialog').close();await e("act({kind:'end'})");
   const guest=w.testGuest,snapshot=await request('/api/match/'+guest.code,{headers:{Authorization:'Bearer '+guest.token}}).json();
   await request('/api/match/'+guest.code,{method:'POST',headers:{Authorization:'Bearer '+guest.token,'Content-Type':'application/json'},body:JSON.stringify({kind:'end',revision:snapshot.revision})}).json();
   await e('refresh()');if(e('!!playbackSession'))e('stopPlayback()');
   await click(v,$('carrierGroupOpen'));await click(v,w.document.querySelector('[data-launch-plane]'));
   assert.ok(w.document.querySelector('.midway-launch-choice'));
   w.document.querySelector('.midway-launch-choice').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();await delay();
   assert.deepEqual(errors,[]);assert.equal(e('!!state.units.find(u=>u.id===selected).carrier_id'),false);
   assert.match($('objectiveName').textContent,/CROSSWIND|SEA LANES/i);assert.doesNotMatch($('missionHint').textContent,/Sink all enemy carriers/);
   const lessons=w.ww2Learning.lessons(e('state'));assert.ok(lessons.some(l=>l.id==='carrier-turnaround'));assert.ok(!lessons.some(l=>l.id==='fleet-service'));
   assert.match(lessons.find(l=>l.id==='ap').text,/Launch costs 1 carrier AP/);
   await fixture(v,'current:crosswind_strait',true);e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='bomber'))");
   assert.equal($('carrierGroupOpen').hidden,true);assert.equal($('rearm').hidden,false);
   await fixture(v,'current:fubar',true);e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='airfield'))");
   assert.equal($('currentAirSupportManual').hidden,true);assert.doesNotMatch($('roleBrief').textContent,/finite service uses/);
   await fixture(v,'current:midway_2');e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier'))");
   assert.match($('objectiveName').textContent,/MIDWAY 2.0/);assert.match($('missionHint').textContent,/Sink all enemy carriers/);
   await click(v,$('carrierGroupOpen'));assert.match($('carrierAirGroupContent').textContent,/4\/4 aboard/);assert.match($('carrierAirGroupContent').textContent,/8\/8 service stores/);
   assert.equal(w.document.querySelectorAll('#carrierAirGroup .midway-flight-heading .dad-unit-portrait').length,4);
   const portraits=[...w.document.querySelectorAll('#carrierAirGroup .unit-illustration')].map(n=>n.dataset.portrait);
   assert.ok(portraits.includes('wildcat'));assert.ok(portraits.includes('dive_bomber'));
   const battleBeforeArt=e('JSON.stringify(state)');
   $('unitStyleToggle').click();assert.equal(w.document.querySelectorAll('#carrierAirGroup image').length,0);
   $('unitStyleToggle').click();assert.equal(w.document.querySelectorAll('#carrierAirGroup .unit-illustration image').length,4);
   assert.equal(e('JSON.stringify(state)'),battleBeforeArt,'Carrier manifest artwork must not change deck orders or battle state');
  }finally{await delay();v.dom.window.close();}
 }
 console.log('DOM/API backports passed at desktop/phone widths: finite field stocks, ship AA, recover/service/relaunch, old-save UI and unchanged Midway 2.0. No visual-layout claims.');
}
main().catch(error=>{console.error(error);console.error(errors);process.exitCode=1;});
