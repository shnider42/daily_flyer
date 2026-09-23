// Integration check against a fresh disposable server. Requires jsdom.
// WW2_TEST_URL=http://127.0.0.1:8001 NODE_PATH=<jsdom install>/node_modules node tests/ww2-dom.cjs
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.WW2_TEST_URL||'http://127.0.0.1:8001';
async function json(path, body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(r.ok,await r.clone().text());return r.json();}
async function waitFor(check){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition timed out');}
function client(session){
 const dom=new JSDOM(fs.readFileSync('ww2_tactics/static/index.html','utf8'),{url:base,runScripts:'outside-only'});
 const w=dom.window;
 w.localStorage.setItem('ww2-session',JSON.stringify(session));
 w.fetch=(path,opts)=>fetch(base+path,opts);
 w.confirm=()=>true;w.setInterval=()=>0;
 w.eval(fs.readFileSync('ww2_tactics/static/game.js','utf8'));
 return w;
}
(async()=>{
 const host=await json('/api/match',{}),guest=await json(`/api/match/${host.code}/join`,{});
 const us=client(host),de=client(guest),u=id=>us.document.getElementById(id),d=id=>de.document.getElementById(id);
 await waitFor(()=>!u('game').hidden&&!d('game').hidden);
 assert.equal(u('roster').children.length,5);assert.equal(d('end').disabled,true);
 u('roster').children[0].click();assert.equal(u('smoke').hidden,false);assert.equal(u('dig').hidden,false);
 u('smoke').click();
 const tile=us.document.querySelector('[aria-label="Smoke at B8"]');assert(tile);tile.dispatchEvent(new us.MouseEvent('click'));
 await waitFor(()=>u('selection').textContent.includes('1 actions'));
 assert.equal(us.document.querySelectorAll('.smoke-cloud').length,1);
 assert.equal(u('smoke').hidden,true);
 u('end').click();await waitFor(()=>u('end').disabled&&!u('refresh').disabled);
 d('refresh').click();await waitFor(()=>!d('end').disabled);
 d('roster').children[0].click();d('dig').click();
 await waitFor(()=>d('selection').textContent.includes('0 actions'));
 assert(de.document.querySelector('.dug-marker'));
 d('end').click();await waitFor(()=>d('end').disabled&&!d('refresh').disabled);
 u('refresh').click();await waitFor(()=>!u('end').disabled);
 assert.equal(us.document.querySelectorAll('.smoke-cloud').length,0);
 u('zoom').click();assert.equal(u('mapWrap').classList.contains('enlarged'),true);
 u('nextUnit').click();assert.equal(u('selection').textContent.includes('Leader'),true);
 // A reload keeps the original seat and server-side positions/actions.
 const reconnect=client(host);await waitFor(()=>!reconnect.document.getElementById('game').hidden);
 assert.equal(reconnect.document.getElementById('side').textContent,'You command the Americans');
 u('leave').click();assert.equal(u('lobby').hidden,false);
 await u('refresh').onclick();assert.equal(u('lobby').hidden,false);
 for(const w of [us,de,reconnect])w.close();
 console.log('PASS: two DOM clients with real HTTP, smoke, dig, handoff, expiration, roster, zoom control, next unit, reconnect and invitation-screen persistence. This does not verify visual layout.');
})().catch(e=>{console.error(e);process.exit(1);});
