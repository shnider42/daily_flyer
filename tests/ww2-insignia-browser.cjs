/* Current-only painted insignia: real Chromium loads, scopes and input. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync('/tmp/ww2-insignia-');
const base='http://127.0.0.1:8196';
const server=cp.spawn('python',['-c',`from ww2_web import create_app
create_app(${JSON.stringify(path.join(tmp,'battle.sqlite'))},background_ai=False).run(host='127.0.0.1',port=8196,threaded=True)`],{cwd:root,stdio:'ignore'});
let browser;const errors=[];
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.stack||e.message));p.setDefaultTimeout(15000);
 await p.goto(base);await p.waitForFunction(()=>scenarios.length>0);
 // A real local Current match, no computer opponent or live-service writes.
 await p.evaluate(async()=>{const seat=await api('/api/match',{scenario:'current:village_2',ruleset:'dsl'});await api('/api/match/'+seat.code+'/join',{});remember(seat);await refresh();document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
 await p.waitForFunction(()=>state?.edition==='current'&&!busy&&!polling);
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.side===state.side&&u.kind==='leader')));
 await p.waitForFunction(()=>[...document.querySelectorAll('#map .unit-role-badge')].every(b=>b.classList.contains('insignia-ready')));
 const before=await p.evaluate(()=>JSON.stringify(state));
 const data=await p.evaluate(()=>{
  const unit=state.units.find(u=>u.side===state.side),plate=document.createElement('section');plate.id='insigniaPlate';
  const entries=Object.keys(kinds).map(kind=>({...unit,id:'proof-'+kind,kind,pos:[0,0],rank:undefined,role_profile:undefined,pinned:false,overwatch:false,entrenched:false}));
  entries.push({...unit,id:'proof-captain',kind:'leader',rank:'captain'},{...unit,id:'proof-mg42',kind:'mg',role_profile:'suppression_mg'});
  for(const u of entries){const item=document.createElement('article'),title=document.createElement('h3'),sizes=document.createElement('div');
   title.textContent=unitBadgeLabel(u);sizes.className='proof-sizes';
   const icon=makeUnitRoleBadge(u);icon.classList.add('proof-insignia');
   const large=makeUnitPortrait(u),small=makeUnitPortrait(u);large.classList.add('proof-large');small.classList.add('proof-small');
   sizes.append(icon,large,small);item.append(sizes,title);plate.append(item);
  }
  document.body.append(plate);return {count:entries.length};
 });
 assert.equal(data.count,36);
 assert.equal(await p.locator('#insigniaPlate .unit-insignia-image').count(),108);
 await p.waitForFunction(()=>[...document.querySelectorAll('#insigniaPlate .unit-role-badge')].every(b=>b.classList.contains('insignia-ready')));
 assert.equal(await p.locator('#insigniaPlate .illustration-role').count(),0,'Only one role overlay per counter');
 const clips=await p.locator('#insigniaPlate .unit-insignia-image').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('viewBox')));
 assert.equal(new Set(clips).size,36,'Every role receives a distinct source window');
 for(const clip of clips){const [x,y,w,h]=clip.split(' ').map(Number);assert.ok(x>=0&&y>=0&&x+w<=1254&&y+h<=1254);}
 await p.route('**/assets/insignia-proof.css',route=>route.fulfill({contentType:'text/css',body:`#insigniaPlate{position:fixed;inset:0;z-index:99999;overflow:auto;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));align-content:start;gap:10px;padding:20px;background:#171e1b;color:#efe6ce}#insigniaPlate article{padding:10px;background:#222e28;border:1px solid #596253}#insigniaPlate h3{font:12px system-ui;text-align:center;line-height:1.3;margin:7px 0 0}#insigniaPlate .proof-sizes{display:flex;align-items:center;justify-content:space-around}#insigniaPlate .proof-insignia{width:56px;height:56px}#insigniaPlate .proof-large{width:94px;height:90px}#insigniaPlate .proof-small{width:40px;height:39px}@media(max-width:600px){#insigniaPlate{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}#insigniaPlate .proof-insignia{width:40px;height:40px}#insigniaPlate .proof-large{width:74px;height:71px}#insigniaPlate .proof-small{width:32px;height:31px}}`}));
 const proofStyle=await p.addStyleTag({url:base+'/assets/insignia-proof.css'});
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await p.screenshot({path:path.join(tmp,'insignia-desktop.png')});
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await p.screenshot({path:path.join(tmp,'insignia-phone.png')});
 // The third style replaces every miniature with one enlarged existing badge.
 await p.evaluate(()=>{$('unitStyleToggle').click();$('unitStyleToggle').click();});
 assert.equal(await p.evaluate(()=>ww2UnitStyle.value),'icons');
 assert.equal(await p.evaluate(()=>localStorage.getItem('ww2-unit-style')),'icons');
 assert.equal(await p.locator('#insigniaPlate .unit-primary-insignia').count(),72);
 assert.equal(await p.locator('#insigniaPlate .unit-illustration,#insigniaPlate .unit-portrait').count(),0);
 assert.equal(await p.locator('#insigniaPlate .unit-primary-insignia.badge-squad image').count(),0,'Infantry uses the private chevron, not the painted crossed rifles');
 await p.waitForFunction(()=>[...document.querySelectorAll('#insigniaPlate .unit-primary-insignia')].every(b=>!b.querySelector('image')||b.classList.contains('insignia-ready')));
 await p.evaluate(()=>document.querySelectorAll('#insigniaPlate article').forEach(article=>{const unit=article.querySelector('.proof-large')._artUnits[0],badge=makeUnitRoleBadge(unit);badge.classList.add('proof-insignia');article.querySelector('.proof-insignia').replaceWith(badge);article.querySelector('h3').textContent=unitBadgeLabel(unit);}));
 assert.equal(await p.evaluate(()=>empiresArt.style),'detailed','DSL-only Icons does not become a third Empires style');
 await p.screenshot({path:path.join(tmp,'icons-phone.png')});
 await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(tmp,'icons-desktop.png')});
 await p.locator('#insigniaPlate').evaluate(n=>n.remove());await proofStyle.evaluate(n=>n.remove());
 await p.waitForTimeout(150);
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),before,'Artwork and responsive layout leave rules/state untouched');
 const boxes=await p.locator('#map .unit-role-badge').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {w:b.width,h:b.height};}));
 assert.ok(boxes.every(b=>b.w>0&&b.h>0));
 await p.screenshot({path:path.join(tmp,'battle-phone.png')});
 assert.equal(await p.locator('#map .unit-primary-insignia').count(),await p.locator('#map .unit').count());
 const stats=await p.locator('#map .strength').allTextContents();
 await p.evaluate(()=>$('unitStyleToggle').click());
 assert.equal(await p.evaluate(()=>ww2UnitStyle.value),'detailed');
 assert.deepEqual(await p.locator('#map .strength').allTextContents(),stats);
 await p.evaluate(()=>ww2UnitStyle.set('basic'));
 assert.equal(await p.locator('.unit-insignia-image').count(),0);
 assert.ok(await p.locator('#map .unit-role-badge').count());
 await p.evaluate(()=>ww2UnitStyle.set('detailed'));
 await p.waitForFunction(()=>document.querySelector('.unit-insignia-detail .insignia-ready'));
 assert.equal(await p.locator('.unit-insignia-detail').count(),1);
 await p.evaluate(()=>ww2UnitStyle.set('icons'));
 // Failed image requests keep readable symbols; the outer counter still owns clicks.
 await p.route('**/role-insignia-v1.webp*',route=>route.abort());
 await p.evaluate(()=>document.querySelectorAll('.unit-insignia-image image').forEach(im=>im.setAttribute('href','/assets/unit-images/role-insignia-v1.webp?test-failure=1')));
 await p.waitForFunction(()=>document.querySelectorAll('#map .unit-insignia-image').length===0);
 const fallback=await p.locator('#map .unit-role-badge').first().evaluate(n=>({path:getComputedStyle(n.querySelector('path')).visibility,pointer:getComputedStyle(n).pointerEvents}));
 assert.equal(fallback.path,'visible');assert.equal(fallback.pointer,'none');
 assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);
 await p.unroute('**/role-insignia-v1.webp*');
 await p.reload();await p.locator('.saved-session').first().click();
 await p.waitForFunction(()=>state?.edition==='current'&&!busy&&!polling);
 assert.equal(await p.locator('#unitStyleToggle').textContent(),'Units: icons');
 assert.equal(await p.locator('#map .unit-primary-insignia').count(),await p.locator('#map .unit').count());
 await p.waitForFunction(()=>[...document.querySelectorAll('#map .unit-primary-insignia')].every(b=>!b.querySelector('image')||b.classList.contains('insignia-ready')));
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await p.screenshot({path:path.join(tmp,'icons-battle-phone.png')});
 // Real Legacy fixture proves no painted badges or extra air/naval badges leak.
 await p.evaluate(async()=>{remember(await api('/api/match',{scenario:'fubar',ruleset:'dsl'}));await refresh();});
 await p.waitForFunction(()=>state?.edition!=='current'&&!busy&&!polling);
 assert.equal(await p.locator('.unit-insignia-image').count(),0);
 assert.equal(await p.locator('.unit-insignia-detail').count(),0);
 assert.equal(await p.evaluate(()=>makeUnitRoleBadge({kind:'fighter'})),null);
 assert.equal(await p.evaluate(()=>ww2UnitStyle.value),'detailed');
 assert.deepEqual(errors,[]);
 console.log(`PASS: 36 distinct insignia, all three styles, real image loads, phone/desktop, Icons persistence/fallback, state preservation and Legacy/Empires isolation. Screenshots: ${tmp}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
