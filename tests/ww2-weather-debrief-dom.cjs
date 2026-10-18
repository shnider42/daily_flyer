/* Full app + Flask test-client orders. DOM integration, not browser visual QA. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync('/tmp/ww2-weather-dom-'),db=path.join(tmp,'game.sqlite'),errors=[];
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
if '_weather_plan' in s:s['_weather_plan']=['rain','haze','clear']+['clear']*(s['battlefield']['rounds']-3)
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
   for(const map of ['current:britain_2','current:midway_2']){
    await fixture(v,'us',map);
    for(const layout of ['panels','map-first','panels']){
     w.ww2Experience.setLayout(layout);await delay();
     assert.equal($('weatherBrief').hidden,false);
     assert.match($('weatherBrief').textContent,/R1: Rain → R2: Haze → R3: Clear/);
     if(width===390){assert.ok($('mobileBattleMenu').contains($('weatherBrief')));assert.match($('mobileMenuOpen').textContent,/Rain/);}
     else if(layout==='map-first'){assert.ok($('experimentalBattle').contains($('weatherBrief')));assert.match($('experimentalBattleOpen').textContent,/Rain/);}
     else assert.ok(w.document.querySelector('.desktop-battlefield').contains($('weatherBrief')));
    }
    for(const theme of ['light','dark']){
     if(w.document.documentElement.dataset.theme!==theme)$('appearanceToggle').click();
     assert.equal(w.document.documentElement.dataset.theme,theme);
     assert.equal($('weatherBrief').hidden,false);
     assert.match($('weatherBrief').textContent,/One launch|one launch/);
    }
    for(const level of ['simple','moderate','expert']){
     w.ww2Experience.set(level);await delay();
     assert.ok(w.ww2Learning.lessons(e('state')).some(l=>l.id==='forecast-weather'));
    }
    const britain=map.endsWith('britain_2'),baseKind=britain?'airfield':'carrier',kind=britain?'scramble':'launch';
    const opener=britain?'airfieldGroupOpen':'carrierGroupOpen',body=britain?'britainAirfieldContent':'carrierAirGroupContent';
    e(`chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='${baseKind}'))`);
    const base=e('selected');
    await click(v,$(opener));
    assert.match($(body).textContent,/0\/1 launches used/);
    w.document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    await e(`(async()=>{const base=state.units.find(u=>u.id===selected),pick=state.legal[base.id].${kind}[0];await act({kind:'${kind}',unit:base.id,target:pick.id,pos:pick.destinations[0].pos});})()`);
    e(`chooseUnit(state.units.find(u=>u.id===${JSON.stringify(base)}))`);
    await click(v,$(opener));
    assert.match($(body).textContent,/1\/1 launches used/);
    const launchButtons=w.document.querySelectorAll(britain?'[data-scramble-flight]':'[data-launch-plane]');
    assert.ok(launchButtons.length);assert.ok([...launchButtons].every(b=>b.disabled));
    w.document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    await e("act({kind:'resign'})");await delay();
    assert.equal(e('state.debrief.statistics.launches'),1);
    assert.equal($('resultDebrief').hidden,false);
    await click(v,$('resultDebrief'));
    assert.equal($('debriefDialog').open,true);
    assert.match($('debriefContent').textContent,/Recorded from the start/);
    assert.match($('debriefContent').textContent,/Resources consumed/);
    assert.match($('debriefContent').textContent,/Enemy private resources are not disclosed/);
    $('debriefDialog').close();await e('refresh()');
    assert.equal(e('state.debrief.statistics.launches'),1);
    w.ww2Debrief.open();assert.equal($('debriefDialog').open,true);$('debriefDialog').close();
   }
   await fixture(v,'us','current:britain');
   assert.equal($('weatherBrief').hidden,true);
   assert.equal(w.document.querySelector('.weather-status'),null);
   await e("act({kind:'resign'})");w.ww2Debrief.open();
   assert.equal($('debriefDialog').open,true);assert.match($('debriefContent').textContent,/Force and operations/);
   $('debriefDialog').close();
   const seat=w.testSeat;
   cp.execFileSync('python',['-c',`import json,sqlite3,sys
c=sqlite3.connect(sys.argv[1]);s=json.loads(c.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0]);s.pop('_battle_record',None);s['revision']+=1;c.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));c.commit()`,db,seat.code]);
   await e('refresh()');w.ww2Debrief.open();
   assert.match($('debriefContent').textContent,/predates detailed recording/);
   assert.doesNotMatch($('debriefContent').textContent,/Resources consumed/);
  }finally{v.dom.window.close();}
 }
 console.log('PASS: Weather/debrief DOM + real API at 1440/390, both layouts, light/dark, all Experiences, both maps, launch caps, finished battle/reload, legacy maps and older records. No browser visual claims.');
}
module.exports={make,fixture,click,delay,request,db,root,cleanup:()=>fs.rmSync(tmp,{recursive:true,force:true})};
if(require.main===module)main().catch(error=>{console.error(error);console.error(errors);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
