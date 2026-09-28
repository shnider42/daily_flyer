const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-lobby-')),base='http://127.0.0.1:8109';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8109','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'games.sqlite3')},stdio:'ignore'});
let browser;const errors=[];
async function page(width=390){const p=await browser.newPage({viewport:{width,height:844}});p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(15000);await p.goto(base);await p.locator('#lobbyStatus').filter({hasText:/No multiplayer|Live game/}).waitFor();return p;}
async function account(p,name,isNew=true){if(isNew)await p.locator('#commanderRegisterMode').click();await p.locator('#commanderName').fill(name);await p.locator('#commanderPassword').fill('browser-test-password');await p.locator('#commanderSubmit').click();await p.locator('#commanderDialog').waitFor({state:'hidden'});}
async function create(p,name){await p.locator('#create').click();await p.locator('#multiplayerName').fill(name);await p.locator('#namedGameSubmit').click();await p.waitForFunction(()=>state&&!busy&&!lobbyMode);return p.evaluate(()=>state.code);}
async function home(p){await tap(p,p.locator('#homeBattles'));await p.locator('#publicGames article').first().waitFor();}
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;browser=await chromium.launch({headless:true,executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')});
 const host=await page();await host.locator('#create').click();await account(host,'Chris');await host.locator('#multiplayerName').fill('Chris vs Dad');await host.locator('#namedGameSubmit').click();await host.waitForFunction(()=>state&&!busy&&!lobbyMode);
 const a=await host.evaluate(()=>state.code);assert.equal(await host.locator('#battleTitle').textContent(),'Chris vs Dad');
 const dad=await page(1440);await dad.locator(`[data-code="${a}"] button`).click();await account(dad,'Dad');await dad.waitForFunction(()=>state?.side==='de'&&!busy);assert.equal(await dad.evaluate(()=>state.code),a);
 await home(host);const b=await create(host,'Chris vs Friend');assert.notEqual(a,b);
 const friend=await page();await friend.locator(`[data-code="${b}"] button`).click();await account(friend,'Friend');await friend.waitForFunction(()=>state?.side==='de'&&!busy);
 // An entirely new browser has no local match pointers; login finds both seats.
 const fresh=await page();assert.equal(await fresh.locator('.saved-session').count(),0);await fresh.locator('#commanderSignIn').click();await account(fresh,'Chris',false);await fresh.selectOption('#lobbyScope','mine');await fresh.waitForFunction(()=>document.querySelectorAll('#publicGames article').length===2);
 await fresh.screenshot({path:path.join(temp,'mobile-my-games.png'),fullPage:true});
 await fresh.locator(`[data-code="${a}"] button`).click();await fresh.waitForFunction(code=>state?.code===code&&!busy,a);assert.equal(await fresh.evaluate(()=>state.side),'us');
 await tap(fresh,fresh.locator('#map .unit.us').first());await tap(fresh,fresh.locator('#map .hex.move').first());await fresh.waitForFunction(()=>!busy&&state.revision===2);
 await home(fresh);await fresh.locator(`[data-code="${b}"] button`).click();await fresh.waitForFunction(code=>state?.code===code&&!busy,b);assert.equal(await fresh.evaluate(()=>state.revision),1);
 // Dad mode and phone layout still work for recovered multiplayer games.
 await tap(fresh,fresh.locator('#dadModeToggle'));await fresh.locator('#mobileBattleMenuClose').click();await tap(fresh,fresh.locator('#map .unit.us').first());assert.equal(await fresh.locator('#mobileOrderToggle .dad-unit-portrait').count(),1);
 await home(fresh);for(const width of [320,390,1440]){await fresh.setViewportSize({width,height:900});assert.ok(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await fresh.screenshot({path:path.join(temp,`lobby-${width}.png`),fullPage:true});}
 await fresh.locator('#commanderSignOut').click();await fresh.locator('#commanderSignIn').waitFor({state:'visible'});assert.equal(await fresh.locator('.saved-session').count(),0);
 // Existing anonymous games can be linked with the original seat, without resetting.
 const legacy=await host.evaluate(async()=>{const s=await api('/api/match',{ruleset:'dsl'});remember(s);return s;});await host.evaluate(()=>refresh());await host.waitForFunction(code=>state?.code===code,legacy.code);
 const before=await host.evaluate(()=>JSON.stringify(state));await tap(host,host.locator('#linkCommanderSeat'));await host.waitForFunction(()=>document.getElementById('linkResult').textContent.startsWith('1 multiplayer'));
 assert.equal(await host.evaluate(()=>JSON.stringify(state)),before);await home(host);await host.selectOption('#lobbyScope','mine');await host.waitForFunction(()=>document.querySelectorAll('#publicGames article').length===3);
 // Reusing an invitation in another device resumes the host, not the other side.
 const invited=await page();await invited.goto(base+'/?join='+a);await invited.locator('#joinForm button').click();await account(invited,'Chris',false);await invited.waitForFunction(()=>state&&!busy);assert.equal(await invited.evaluate(()=>state.side),'us');assert.equal(await invited.evaluate(()=>state.revision),2);
 assert.deepEqual(errors,[]);console.log('Multiplayer lobby: independent devices, two simultaneous games, named seats, legacy linking, invitation recovery, sign-out, Dad mode and responsive layout passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
