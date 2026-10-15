/* Full app + Flask test-client orders. DOM integration, not browser visual QA. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync('/tmp/ww2-britain2-dom-'),db=path.join(tmp,'game.sqlite'),errors=[];
function request(route,options={}){
 const r=JSON.parse(cp.execFileSync('python',['tests/ww2-api-bridge.py',db],{cwd:root,env:{...process.env,PYTHONPATH:root},input:JSON.stringify({path:route,method:options.method||'GET',headers:options.headers||{},body:options.body}),encoding:'utf8'}));
 return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>r.data};
}
const delay=()=>new Promise(r=>setTimeout(r,30));
async function make(width){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ww2_tactics/static/index.html'),'utf8'),{url:'http://dsl.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,ctx=dom.getInternalVMContext();w.innerWidth=width;w.innerHeight=844;w.scrollTo=()=>{};w.setInterval=()=>0;
 w.matchMedia=query=>{const min=query.match(/min-width:\s*(\d+)/),max=query.match(/max-width:\s*(\d+)/);return {matches:query.includes('prefers-reduced-motion')||!!(min||max)&&(!min||width>=+min[1])&&(!max||width<=+max[1]),media:query,addEventListener(){},removeEventListener(){}};};
 w.DOMMatrix=class{constructor(){Object.assign(this,{a:1,b:0,c:0,d:1,e:0,f:0});}multiply(){return this;}inverse(){return this;}scale(){return this;}translate(){return this;}};
 w.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.CSS={supports:()=>true,escape:s=>s};w.confirm=()=>true;
 w.fetch=async(url,opts)=>request(new URL(url,w.location.href).pathname+new URL(url,w.location.href).search,opts);
 for(const name of ['scrollIntoView','scrollTo','scrollBy'])w.HTMLElement.prototype[name]=function(){};
 w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:1284,height:1009});
 Object.defineProperty(w.SVGElement.prototype,'transform',{get(){return {baseVal:{numberOfItems:0}};}});
 w.SVGElement.prototype.getScreenCTM=()=>({inverse(){return this;},a:1,b:0,c:0,d:1,e:0,f:0});
 w.SVGSVGElement.prototype.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return this;}});
 Object.defineProperty(w.SVGSVGElement.prototype,'viewBox',{get(){const n=(this.getAttribute('viewBox')||'0 0 1284 1009').split(/[ ,]+/).map(Number);return {baseVal:{x:n[0],y:n[1],width:n[2],height:n[3]}};}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new w.Event('close'));}};
 w.addEventListener('error',e=>{errors.push(e.error?.stack||e.message);e.preventDefault();});
 for(const script of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(path.join(root,'ww2_tactics/static',script.getAttribute('src').replace('/assets/','')),'utf8'),ctx,{filename:script.getAttribute('src')});
 await delay();assert.deepEqual(errors,[]);
 return {dom,w,e:code=>vm.runInContext(code,ctx),$:id=>w.document.getElementById(id)};
}
async function fixture(v,side,map='current:britain_2'){
 const setup=`import json,sqlite3,sys
from ww2_web import create_app
db,side,scenario=sys.argv[1:]
c=create_app(db).test_client()
h=c.post('/api/match',json=dict(scenario=scenario,ruleset='dsl')).json
g=c.post('/api/match/'+h['code']+'/join').json
conn=sqlite3.connect(db)
s=json.loads(conn.execute('SELECT state FROM match WHERE code=?',(h['code'],)).fetchone()[0]);s['turn']=side
conn.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),h['code']));conn.commit();conn.close()
print(json.dumps(dict(seat=h if side=='us' else g,other=g if side=='us' else h)))`;
 const data=JSON.parse(cp.execFileSync('python',['-c',setup,db,side,map],{cwd:root,encoding:'utf8'}));
 v.w.testSeat=data.seat;v.w.testOther=data.other;
 await v.e("(async()=>{if(playbackSession)stopPlayback();document.querySelectorAll('dialog[open]').forEach(d=>d.close());remember(testSeat);lobbyMode=false;state=await api('/api/match/'+session.code);selected=null;target=null;render();})()");
 await delay();assert.deepEqual(errors,[]);
}
async function click(v,b){assert.ok(b);assert.equal(b.hidden,false);assert.equal(b.disabled,false);b.click();await delay();await delay();assert.deepEqual(errors,[]);}
async function main(){
 for(const width of [1440,390]){
  const v=await make(width),{w,e,$}=v;
  try{
   for(const side of ['us','de']){
    await fixture(v,side);
    e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='airfield'))");
    const field=e('selected'),count=side==='us'?3:5;
    assert.equal($('airfieldGroupOpen').hidden,false);
    assert.match($('battleTitle').textContent,/Battle of Britain 2.0/);
    assert.match($('objective').textContent,/Raid damage 0\/9/);
    assert.equal($('campaignManual').hidden,true);assert.equal($('britain2Manual').hidden,false);
    assert.equal($('carrierGroupOpen').hidden,true);assert.equal($('rearm').hidden,true);
    assert.equal($('map').querySelectorAll('.unit').length,e('state.units.filter(u=>u.hp>0&&!u.carrier_id&&!u.reserve).length'),'Grounded aircraft do not appear as transport passengers on the map');
    for(const level of ['simple','moderate','expert']){
     w.ww2Experience.set(level);await delay();
     await click(v,$('airfieldGroupOpen'));
     assert.equal($('britainAirfieldDialog').open,true);
     assert.equal(w.document.querySelectorAll('.britain-flight').length,count);
     assert.match($('britainAirfieldContent').textContent,/3\/3 runway cycles/);
     const lessons=w.ww2Learning.lessons(e('state'));
     assert.ok(lessons.some(l=>l.id==='britain-fuel'));
     assert.match(lessons.find(l=>l.id==='ap').text,/German bombers have 4 AP/);
     assert.match(lessons.find(l=>l.id==='fire').text,/Bf 109E-3 hits deal 2/);
     assert.match(lessons.find(l=>l.id==='service').text,/Landing or service delays takeoff/);
     assert.match(lessons.find(l=>l.id==='move').text,/Spitfires and Bf 109s/);
     assert.doesNotMatch(lessons.find(l=>l.id==='move').text,/fighters can travel up to 3 hexes/);
     $('britainAirfieldDialog').close();
    }
    await click(v,$('airfieldGroupOpen'));
    const launch=w.document.querySelector('[data-scramble-flight]'),flight=launch.dataset.scrambleFlight;
    await click(v,launch);assert.equal($('britainAirfieldDialog').open,false);
    const hex=w.document.querySelector('.britain-launch-choice');assert.ok(hex);assert.match(hex.getAttribute('aria-label'),/Take off at/);
    hex.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();await delay();assert.deepEqual(errors,[]);
    assert.equal(e('selected'),flight);assert.equal(e('!!state.units.find(u=>u.id===selected).carrier_id'),false);
    assert.match($('selection').textContent,/Fuel/);assert.match($('roleBrief').textContent,/hexes\/leg/);
    if(width===390)assert.match($('mobileOrderToggle').textContent,/Fuel/);
    await click(v,$('airfieldGroupOpen'));
    await click(v,w.document.querySelector(`[data-land-field="${field}"]`));
    assert.equal(e('state.units.find(u=>u.id===selected).carrier_id'),field);
    await click(v,$('airfieldGroupOpen'));
    assert.equal(e('selected'),field);
    const service=w.document.querySelector(`[data-service-flight="${flight}"]`);await click(v,service);
    assert.match($('britainAirfieldContent').textContent,/0\/3 runway cycles/);
    assert.equal(w.document.querySelector(`[data-scramble-flight="${flight}"]`).disabled,true);
    const plane=e(`state.units.find(u=>u.id===${JSON.stringify(flight)})`);
    assert.equal(plane.fuel,plane.max_fuel);assert.equal(plane.sortie_cooldown,true);
    $('britainAirfieldDialog').close();await e("act({kind:'end'})");
    const other=w.testOther,url='/api/match/'+other.code,headers={Authorization:'Bearer '+other.token};
    const snap=await request(url,{headers}).json();
    const response=request(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({kind:'end',revision:snap.revision})});assert.equal(response.status,200);
    await e('refresh()');if(e('!!playbackSession'))e('stopPlayback()');
    await click(v,$('airfieldGroupOpen'));
    assert.equal(w.document.querySelector(`[data-scramble-flight="${flight}"]`).disabled,false);
    assert.match($('britainAirfieldContent').textContent,/3\/3 runway cycles/);
   }
   await fixture(v,'us','current:midway_2');
   e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier'))");
   assert.equal($('airfieldGroupOpen').hidden,true);assert.equal($('britain2Manual').hidden,true);
   assert.equal($('carrierGroupOpen').hidden,false);assert.match($('missionHint').textContent,/Sink all enemy carriers/);
   await fixture(v,'us','current:britain');
   assert.equal($('airfieldGroupOpen').hidden,true);assert.equal($('campaignManual').hidden,false);
   assert.equal(e('!!state.britain_ops_version'),false);
   assert.match($('rulesetBadge').textContent,/DSL · Current/);
  }finally{v.dom.window.close();}
 }
 console.log('PASS: Britain 2.0 DOM/API at 1440 and 390: both armies, all Experiences, manifests, launch/land/service/relaunch, fuel text, correct lessons and old-map transitions. No browser visual claims.');
}
main().catch(error=>{console.error(error);console.error(errors);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
