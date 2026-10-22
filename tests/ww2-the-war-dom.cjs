/* Whole app plus real Flask requests at desktop/phone widths; no browser-layout claim. */
const {make,fixture,click,delay,request,db,root,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
async function patch(v,code){
 cp.execFileSync('python',['-c',`import json,sqlite3,sys
from ww2_tactics.visibility import update_intel
c=sqlite3.connect(sys.argv[1]);s=json.loads(c.execute('SELECT state FROM match WHERE code=?',(sys.argv[2],)).fetchone()[0])
${code}
s['revision']+=1;update_intel(s);c.execute('UPDATE match SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));c.commit()`,db,v.e('session.code')],{cwd:root});
 await v.e('refresh()');await delay();
}
async function main(){
 for(const width of [1440,390]){
  const v=await make(width),{w,e,$}=v;
  try{
   for(const f of ['game.css','play-ui.css','midway2.css','britain2.css','the-war.css']){const s=w.document.createElement('style');s.textContent=fs.readFileSync(path.join(root,'ww2_tactics/static',f),'utf8');w.document.head.append(s);}
   await fixture(v,'us','current:the_war_1');
   assert.equal(e('state.deployment.phase'),'planning');assert.equal($('warStatus').hidden,false);
   assert.match(w.ww2Briefing.mission(e('state')).goal,/70 campaign/);
   await e("act({kind:'deploy_lock'})");
   const r=await request('/api/match/'+e('session.code'),{method:'POST',headers:{Authorization:'Bearer '+w.testOther.token,'Content-Type':'application/json'},body:JSON.stringify({kind:'deploy_lock',revision:e('state.revision')})});
   assert.equal(r.status,200,JSON.stringify(await r.json()));await e('refresh()');await delay();
   assert.equal(e('state.deployment.phase'),'battle');assert.equal(e('state.units.length'),74);
   for(const level of ['simple','moderate','expert']){
    w.ww2Experience.set(level);await delay();
    const lessons=w.ww2Learning.lessons(e('state'));
    for(const id of ['war-fronts','war-cycle','war-air-bases','war-airbridge','war-rescue','forecast-weather','armor','engineering','radio','field-aid','cave-network'])assert.ok(lessons.some(l=>l.id===id),id);
    assert.ok(!lessons.some(l=>['night-service','finite-air-support','carrier-turnaround'].includes(l.id)));
   }
   for(const kind of ['squad','mg','engineer','tank','landing_craft']){
    e(`chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='${kind}'&&!u.carrier_id&&!u.reserve))`);await delay();
    assert.equal($('carrierGroupOpen').hidden,true,kind);assert.equal(w.getComputedStyle($('carrierGroupOpen')).display,'none',kind);
    assert.equal($('airfieldGroupOpen').hidden,true,kind);
   }
   e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='carrier'))");await click(v,$('carrierGroupOpen'));
   assert.match($('carrierAirGroupContent').textContent,/Wildcat/);$('carrierAirGroupDialog').close();
   await e("(async()=>{const c=state.legal[selected].launch[0];await act({kind:'launch',unit:selected,target:c.id,pos:c.destinations[0].pos});chooseUnit(state.units.find(u=>u.id===c.id));})()");
   assert.match($('selection').textContent,/Fuel/);assert.equal($('carrierGroupOpen').hidden,false);assert.equal($('airfieldGroupOpen').hidden,false);
   e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='airfield'&&u.platoon==='F'))");await click(v,$('airfieldGroupOpen'));
   assert.match($('britainAirfieldContent').textContent,/Dakota/);$('britainAirfieldDialog').close();
   await e("(async()=>{const c=state.legal[selected].scramble[0];await act({kind:'scramble',unit:selected,target:c.id,pos:c.destinations[0].pos});chooseUnit(state.units.find(u=>u.id===c.id));})()");
   assert.equal($('carrierGroupOpen').hidden,true);assert.equal($('airfieldGroupOpen').hidden,false);assert.equal($('nightDrop').hidden,false);
   assert.match($('selection').textContent,/Fuel/);
   await patch(v,"s['round']=5\ns['_weather_plan']=['clear']*48");
   assert.match($('warStatus').textContent,/NIGHT/);assert.ok(w.document.body.classList.contains('night-battle'));
   e("chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='spotlight'))");assert.equal($('spotlightAim').hidden,false);
   assert.equal($('carrierGroupOpen').hidden,true);assert.equal($('airfieldGroupOpen').hidden,true);
   assert.equal(w.document.querySelectorAll('.joint-objective').length,8);
   assert.equal(w.document.querySelectorAll('.war-marker').length,2);
   await e("act({kind:'resign'})");w.ww2Debrief.open();assert.match($('debriefContent').textContent,/Campaign points/);
   $('debriefDialog').close();
   console.log('PASS The War real API/DOM',width);
  }finally{await delay();v.dom.window.close();}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
