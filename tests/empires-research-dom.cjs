/* Research feedback at phone width, against the real API with controlled network failures.
   This checks DOM behavior, not rendered iPhone Safari layout. */
const {make,click,delay,db,root,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
async function main(){
 const v=await make(390),{w,$}=v;
 try{
  const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'ww2_tactics/static/empires.css'),'utf8');w.document.head.append(style);
  await click(v,$('modeEmpires'));$('empFaction').value='river';await click(v,$('empCreate'));
  const tech=k=>$('empPanel').querySelector(`[data-emp-tech="${k}"]`);
  const openResearch=async()=>{await click(v,$('empMenuOpen'));await click(v,$('empResearchOpen'));};
  await openResearch();assert.equal($('empOrdersSheet').open,true);
  assert.match($('empCurrentResearchTitle').textContent,/Current research: Agriculture/);
  assert.equal(tech('agriculture').disabled,true);assert.equal(tech('agriculture').getAttribute('aria-current'),'true');
  assert.equal($('empCurrentResearch').querySelector('progress').value,0);
  assert.equal($('empCurrentResearch').querySelector('progress').max,14);
  assert.match($('empCurrentResearch').textContent,/End turn, not while you wait/);
  assert.match($('empResearchOpen').textContent,/Agriculture · 0\/14 knowledge/);
  const realFetch=w.fetch;let posts=0,release;
  w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return realFetch(url,opts);};
  await w.empiresUI.order({kind:'research',tech:'agriculture'});assert.equal(posts,0);
  const selection=w.empiresUI.selection,map=$('empMapWrap');map.scrollLeft=108;map.scrollTop=46;
  const apBefore=JSON.stringify(w.empiresUI.state.units.map(u=>[u.id,u.ap]));
  const originalRevision=w.empiresUI.state.revision;
  $('empOrdersSheet').scrollTop=500;$('empOrdersSheet').scrollTo=function({top}){this.scrollTop=top;};
  // Delay the write: neither pending UI nor duplicate taps claim a saved result.
  w.fetch=(url,opts)=>opts?.method==='POST'?new Promise(resolve=>{posts++;release=async()=>resolve(await realFetch(url,opts));}):realFetch(url,opts);
  const pending=w.empiresUI.order({kind:'research',tech:'writing'});
  assert.match($('empResearchNotice').textContent,/Saving research choice: Writing/);
  assert.equal(tech('writing').dataset.researchState,'pending');assert.match(tech('writing').textContent,/Saving choice/);
  assert.equal(tech('writing').getAttribute('aria-pressed'),'false');
  assert.ok([...$('empPanel').querySelectorAll('[data-emp-tech]')].every(b=>b.disabled));
  assert.equal(w.empiresUI.state.player.research,'agriculture');assert.equal(w.empiresUI.state.revision,originalRevision);
  await w.empiresUI.order({kind:'research',tech:'writing'});assert.equal(posts,1);
  await release();await pending;w.fetch=realFetch;
  assert.match($('empResearchNotice').textContent,/Research saved: Writing/);
  assert.match($('empResearchNotice').textContent,/No unit AP was spent/);
  assert.equal(tech('writing').dataset.researchState,'active');assert.equal(tech('writing').disabled,true);
  assert.equal(w.empiresUI.state.revision,originalRevision+1);assert.equal(w.empiresUI.state.player.knowledge,0);
  assert.equal(JSON.stringify(w.empiresUI.state.units.map(u=>[u.id,u.ap])),apBefore);
  assert.equal(w.empiresUI.selection,selection);assert.equal(map.scrollLeft,108);assert.equal(map.scrollTop,46);
  assert.equal($('empOrdersSheet').scrollTop,0);
  // The essentials and active contrast persist at every Experience and appearance.
  for(const level of ['simple','moderate','expert']){
   w.ww2Experience.set(level);await delay();
   assert.match($('empCurrentResearchTitle').textContent,/Writing/);assert.match($('empCurrentResearch').textContent,/each turn/);
   assert.ok($('empCurrentResearch').querySelector('progress'));assert.match($('empCurrentResearch').textContent,/turns remaining/);
   assert.equal($('empResearchNotice').hidden,false);assert.equal(w.empiresUI.state.revision,originalRevision+1);
   for(const theme of ['light','dark']){w.document.documentElement.dataset.theme=theme;assert.equal(w.getComputedStyle(tech('writing')).opacity,'1');}
  }
  // A failed write cannot falsely mark the requested technology active.
  w.fetch=(url,opts)=>opts?.method==='POST'?Promise.resolve({ok:false,status:503,json:async()=>({error:'Test unavailable'})}):realFetch(url,opts);
  await w.empiresUI.order({kind:'research',tech:'masonry'});w.fetch=realFetch;
  assert.equal(w.empiresUI.state.player.research,'writing');assert.match($('empResearchNotice').textContent,/Research did not change. Writing is still selected/);
  assert.equal(tech('masonry').dataset.researchState,'available');
  // A committed write with a lost response is confirmed by GET, never replayed.
  let recoveredPosts=0;
  w.fetch=async(url,opts)=>{if(opts?.method==='POST'){recoveredPosts++;await realFetch(url,opts);throw Error('Test lost response');}return realFetch(url,opts);};
  await w.empiresUI.order({kind:'research',tech:'masonry'});w.fetch=realFetch;
  assert.equal(recoveredPosts,1);assert.equal(w.empiresUI.state.player.research,'masonry');assert.match($('empResearchNotice').textContent,/Research saved: Masonry/);
  // Complete network loss remains explicitly uncertain, without optimistic state.
  w.fetch=async()=>{throw Error('Test offline');};await w.empiresUI.order({kind:'research',tech:'agriculture'});w.fetch=realFetch;
  assert.match($('empResearchNotice').textContent,/may have saved.*Refresh/);assert.equal(w.empiresUI.state.player.research,'masonry');
  await w.empiresUI.refresh();assert.match($('empResearchNotice').textContent,/Research did not change. Masonry is still selected/);
  await w.empiresUI.order({kind:'research',tech:'agriculture'});
  const income=w.empiresUI.state.economy.knowledge;
  await w.empiresUI.order({kind:'end'});
  assert.equal(w.empiresUI.state.player.knowledge,income);assert.equal($('empCurrentResearch').querySelector('progress').value,income);
  assert.match($('empCurrentResearch').textContent,new RegExp(`${income} / 14 knowledge`));
  const seat=JSON.parse(w.localStorage.getItem('empires-sessions'))[0];
  await click(v,$('empBack'));await w.empiresUI.open(seat);await openResearch();
  assert.equal(w.empiresUI.state.player.research,'agriculture');assert.equal($('empCurrentResearch').querySelector('progress').value,income);
  // Seed enough knowledge in this test-only database, then use real turn resolution.
  cp.execFileSync('python',['-c',`import json,sqlite3,sys
c=sqlite3.connect(sys.argv[1]);s=json.loads(c.execute('SELECT state FROM empires_games WHERE code=?',(sys.argv[2],)).fetchone()[0])
s['players']['river']['knowledge']=20;s['revision']+=1
c.execute('UPDATE empires_games SET state=? WHERE code=?',(json.dumps(s),sys.argv[2]));c.commit()`,db,seat.code],{cwd:root});
  await w.empiresUI.refresh();
  assert.match($('empCurrentResearch').textContent,/Completes when you next End turn/);assert.equal($('empCurrentResearch').querySelector('progress').value,14);
  const completionIncome=w.empiresUI.state.economy.knowledge;
  await w.empiresUI.order({kind:'end'});
  assert.equal(w.empiresUI.state.player.research,null);assert.ok(w.empiresUI.state.player.techs.includes('agriculture'));
  assert.equal(w.empiresUI.state.player.knowledge,20+completionIncome-14);
  assert.match($('empResearchNotice').textContent,/Agriculture discovered.*Choose your next research/);
  assert.match($('empCurrentResearchTitle').textContent,/Choose your next research/);
  assert.equal(tech('agriculture').dataset.researchState,'complete');assert.equal(tech('agriculture').disabled,true);
  assert.match(tech('writing').textContent,/Start research/);
  // All-complete is a display-only fixture, never sent to the server.
  w.empiresUI.state.player.techs=Object.keys(w.empiresUI.state.technologies);
  w.ww2Experience.set('simple');await delay();
  assert.match($('empCurrentResearchTitle').textContent,/All discoveries complete/);
  assert.ok([...$('empPanel').querySelectorAll('[data-emp-tech]')].every(b=>b.disabled));
 }finally{await delay();w.close();}
 console.log('PASS: phone research pending/saved/failure/recovery, duplicate prevention, no AP cost, all Experiences, active contrast, turn-end progress, resume, completion and carryover. DOM/API only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
