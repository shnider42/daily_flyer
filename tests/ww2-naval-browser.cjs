const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-naval-')),db=path.join(temp,'game.db'),base='http://127.0.0.1:8104';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8104','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:db},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;
 browser=await chromium.launch({headless:true,executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')});
 const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(20000);
 await p.goto(base);await p.selectOption('#scenarioSelect','midway');await p.locator('#createSolo').click();await p.locator('#startSolo').click();await p.waitForFunction(()=>state&&!busy&&state.naval_version);
 const code=await p.evaluate(()=>state.code);
 cp.execFileSync('python',['-c',`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]);r=c.execute('select state from match where code=?',(sys.argv[2],)).fetchone();s=json.loads(r[0]);s['units'][0]['pos']=[6,15];s['revision']+=1;c.execute('update match set state=? where code=?',(json.dumps(s),sys.argv[2]));c.commit()`,db,code]);
 await p.reload();await p.waitForFunction(()=>state&&!busy&&state.revision===1);
 assert.equal(await p.locator('#map .counter-army').count(),0);
 assert.equal(await p.locator('#map .naval-silhouette').count(),14);
 assert.match(await p.locator('.team-legend').textContent(),/Japanese/);
 assert.doesNotMatch(await p.locator('#turnBanner').textContent(),/German/);
 await p.locator('#roster button').filter({hasText:'CV A1'}).click();await p.locator('#recon').click();
 assert.ok(await p.locator('#map .recon-choice').count()>0);
 await p.evaluate(()=>document.querySelector('[aria-label="Search G7"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 await p.waitForFunction(()=>!busy&&state.revision===2);
 assert.ok(await p.locator('#map .unit.de').count()>0);
 await p.evaluate(()=>chooseUnit(state.units.find(u=>u.id==='de0')));
 assert.equal(await p.locator('#airstrike').isVisible(),true);
 await p.locator('#airstrike').click();await p.waitForFunction(()=>!busy&&state.revision===3);
 assert.equal(await p.evaluate(()=>state.units.find(u=>u.id==='us0').ap),0);
 assert.equal(await p.evaluate(()=>state.last_combat.kind),'Air strike');
 for(const width of [320,390,1440]){
  await p.setViewportSize({width,height:900});await p.waitForTimeout(150);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(temp,`midway-${width}.png`),fullPage:true});
 }
 await p.locator('#unitStyleToggle').click();assert.ok((await p.locator('#map .unit-name').allTextContents()).every(t=>!/^US |^DE /.test(t)));
 await p.locator('#unitStyleToggle').click();
 await p.locator('#end').click();await p.waitForFunction(()=>!busy&&playbackSession);
 await p.locator('#pausePlayback').click();assert.match(await p.locator('#objective').textContent(),/Japan/);
 assert.equal(await p.locator('#playbackMap .counter-army').count(),0);await p.locator('#skipPlayback').click();
 await p.locator('#saveButton').click();await p.locator('#accessDialog').waitFor({state:'visible'});assert.match(await p.locator('#accessCode').inputValue(),/^SAVE-/);await p.locator('#closeAccess').click();
 assert.deepEqual(errors,[]);console.log('Midway: roster, lettering, scouting, strike, fog replay, save and responsive layout passed. '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
