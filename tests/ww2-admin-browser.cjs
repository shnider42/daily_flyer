const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-admin-')),base='http://127.0.0.1:8117',key='browser-admin-bootstrap-key-'+ 'a'.repeat(40);
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8117','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'games.sqlite3'),WW2_ADMIN_BOOTSTRAP_KEY:key},stdio:'ignore'});
let browser;const errors=[];
async function api(url,body,token){const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-Commander-Token':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,`${r.status} ${url}`);return r.json();}
async function page(width){const p=await browser.newPage({viewport:{width,height:900}});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);return p;}
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=require('@sparticuz/chromium'),pack=mod.default||mod;browser=await chromium.launch({headless:true,executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')});
 const account=await api('/api/commander/register',{name:'shnider42',password:'browser-test-password'});
 const game=await api('/api/match',{name:'Sunday with Dad',ruleset:'dsl'},account.token);
 const guest=await api(`/api/match/${game.code}/join`,{});
 const p=await page(1440);await p.goto(base+'/admin');await p.locator('#loginPanel').waitFor({state:'visible'});assert.equal(await p.locator('#console').isVisible(),false);
 await p.locator('#loginPassword').fill('browser-test-password');await p.locator('#loginForm button').click();await p.locator('#claimPanel').waitFor({state:'visible'});assert.equal(await p.locator('#console').isVisible(),false);
 await p.locator('#setupKey').fill(key);await p.locator('#claimForm button').click();await p.locator('#metrics .metric').first().waitFor();await p.locator('#matches .match-row').first().waitFor();assert.match(await p.locator('#testResult').textContent(),/No test report/);
 const row=()=>p.locator(`[data-code="${game.code}"]`);
 await row().locator('[data-action=rename]').click();await p.locator('#newName').fill('Sunday rematch');await p.locator('#submitAction').click();await p.locator('#actionDialog').waitFor({state:'hidden'});await row().locator('h3').filter({hasText:'Sunday rematch'}).waitFor();
 p.once('dialog',d=>d.accept());const downloaded=p.waitForEvent('download');await row().locator('[data-action=export]').click();const download=await downloaded;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.format,'dsl-diagnostic-v1');assert.ok(!JSON.stringify(exported).includes(game.token));
 await row().locator('[data-action=remove]').click();await p.locator('#confirmCode').fill('WRONG');await p.locator('#submitAction').click();await p.locator('#actionError').filter({hasText:/Type the match code/}).waitFor();await p.locator('#confirmCode').fill(game.code);await p.locator('#submitAction').click();await p.locator('#actionDialog').waitFor({state:'hidden'});await row().waitFor({state:'detached'});
 assert.equal((await api('/api/lobby')).games.length,0);
 await p.selectOption('#matchScope','trash');await row().waitFor();await row().locator('[data-action=restore]').click();await p.locator('#confirmCode').fill(game.code);await p.locator('#submitAction').click();await p.locator('#actionDialog').waitFor({state:'hidden'});await row().waitFor({state:'detached'});
 await p.selectOption('#matchScope','active');await row().waitFor();assert.equal((await api('/api/lobby')).games[0].name,'Sunday rematch');
 for(const width of [320,390,1440]){await p.setViewportSize({width,height:900});await p.evaluate(()=>scrollTo(0,0));if(!await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))console.log(await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right])));await p.screenshot({path:path.join(temp,`admin-${width}.png`)});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 // Mobile resignation is reachable from Battle without changing the map layout.
 const mobile=await page(390);await mobile.goto(base);await mobile.evaluate(s=>{remember(s);return refresh();},guest);await mobile.waitForFunction(()=>state?.side==='de'&&!busy);
 mobile.once('dialog',d=>d.dismiss());await tap(mobile,mobile.locator('#resignButton'));assert.equal(await mobile.evaluate(()=>state.winner),null);
 mobile.once('dialog',d=>d.accept());await tap(mobile,mobile.locator('#resignButton'));await mobile.waitForFunction(()=>state?.winner==='us'&&!busy);assert.equal(await mobile.evaluate(()=>state.resigned_by),'de');assert.match(await mobile.locator('#reportTitle').textContent(),/resigned/);assert.equal(await mobile.locator('#resignButton').isVisible(),false);
 await p.locator('#signOut').click();await p.locator('#loginPanel').waitFor({state:'visible'});assert.equal(await p.locator('#console').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('Admin desktop/mobile: login, owner claim, evidence, rename, export, guarded remove/restore, sign-out and phone resignation passed.',temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
