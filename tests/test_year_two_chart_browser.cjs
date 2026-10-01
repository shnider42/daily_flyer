/* Shared contract checked on every sport, both baseball roles and both bowling sources. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'shared-chart-test-')),port=8792,base=`http://127.0.0.1:${port}`;
const server=spawn(process.env.PYTHON||'python',['-m','flask','--app','web','run','--port',String(port)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,YEAR_TWO_DATA_DIR:folder,QB_PRESET_DB:path.join(folder,'qb.sqlite3'),BASEBALL_PRESET_DB:path.join(folder,'bb.sqlite3'),BOWLING_PRESET_DB:path.join(folder,'bw.sqlite3')}});
let browser;const errors=[],ui=(p,id,name)=>p.locator(`#yt-chart-${id} [data-ui="${name}"]`),root=(p,id)=>p.locator('#yt-chart-'+id),state=(p,id)=>p.evaluate(id=>YearTwoCharts.get(id).getState(),id);
const axes=(p,id)=>ui(p,id,'plot').locator('svg').evaluateAll(es=>es.map(e=>[e.dataset.low,e.dataset.high,e.dataset.xlow,e.dataset.xhigh].join(':')));
async function contract(p,id){
 await ui(p,id,'plot').locator('svg').first().waitFor();
 const controls=await root(p,id).locator('select[data-ui]').evaluateAll(es=>es.map(e=>e.dataset.ui));
 assert.deepEqual(controls,['metric','layout','timeline','window','height','markers','normalize','scope','inspect-player','inspect-year']);
 await ui(p,id,'layout').selectOption('overlay');await ui(p,id,'window').selectOption('5');
 assert.equal((await state(p,id)).window,'5','Five-year control behaves identically');
 assert.equal(await ui(p,id,'plot').locator('svg').count(),1);
 const n=await p.evaluate(id=>YearTwoCharts.get(id).getData().length,id);
 assert.equal(await ui(p,id,'plot').locator('[data-series]').count(),n,'All selected series on one graph');
 await ui(p,id,'legend').locator('button').nth(0).click();await ui(p,id,'legend').locator('button').nth(1).click();
 assert.equal((await state(p,id)).focus.length,2);
 assert.equal(await ui(p,id,'plot').locator('[data-series]').count(),n,'Highlighting never hides/removes a selected series');
 assert.ok((await ui(p,id,'plot').locator('[data-series]').evaluateAll(es=>es.map(e=>Number(e.style.opacity)))).every(n=>n>=.2));
 await ui(p,id,'analysis').locator('summary').click();await ui(p,id,'trend').check();await ui(p,id,'moving').check();await ui(p,id,'mean').check();await ui(p,id,'median').check();
 assert.ok(await ui(p,id,'plot').locator('[data-line=trend]').count()>=1);
 assert.ok(await ui(p,id,'plot').locator('[data-line=mean]').count()>=1);
 await ui(p,id,'targetOn').check();await ui(p,id,'target').fill('0');await ui(p,id,'target').press('Tab');
 assert.equal(await ui(p,id,'plot').locator('[data-reference="Custom reference"]').count(),1);
 await ui(p,id,'layout').selectOption('separate');assert.equal(new Set(await axes(p,id)).size,1,'Panel axes match');
 await ui(p,id,'layout').selectOption('overlay');await ui(p,id,'timeline').selectOption('calendar');
 assert.ok(Number((await axes(p,id))[0].split(':')[2])>1900);
 const svg=await ui(p,id,'plot').locator('svg').elementHandle(),before=await state(p,id);
 await p.setViewportSize({width:390,height:740});await p.waitForTimeout(180); // width already 390 at contract entry
 assert.ok(await svg.evaluate(n=>n.isConnected),'Height-only changes keep the graph in place');
 const value=await ui(p,id,'inspect-year').locator('option').first().getAttribute('value');await ui(p,id,'inspect-year').selectOption(value);
 assert.ok(await svg.evaluate(n=>n.isConnected),'Inspecting a season does not redraw');assert.deepEqual(await state(p,id),before);
 for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:844});await p.waitForTimeout(140);assert.ok(await p.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'No document overflow: '+id+' '+width);}
 await p.setViewportSize({width:390,height:844});await root(p,id).screenshot({path:'/tmp/shared-'+id+'.png'});
 await root(p,id).locator('[data-display=table]').click();assert.ok(await ui(p,id,'table').locator('tbody tr').count()>0);
 const download=p.waitForEvent('download');await root(p,id).locator('[data-action=download]').click();const d=await download;const csv=fs.readFileSync(await d.path(),'utf8');assert.match(csv,/Recorded value/);assert.match(csv,/Source/);
 await root(p,id).locator('[data-display=chart]').click();
 await ui(p,id,'window').selectOption('2');assert.equal(await ui(p,id,'plot').locator('[data-line=trend]').count(),0);assert.match(await ui(p,id,'warnings').innerText(),/choose more years/);
 await ui(p,id,'window').selectOption('5');
 const saved=await state(p,id);await p.reload();await ui(p,id,'plot').locator('svg').first().waitFor();assert.deepEqual(await state(p,id),saved,'Graph settings survive reload');
}
async function allSelected(p,id){
 if(!await ui(p,id,'picker').evaluate(e=>e.open))await ui(p,id,'picker').locator('summary').click();
 await ui(p,id,'search').fill('');const expected=parseInt(await ui(p,id,'matches').innerText());
 await root(p,id).locator('[data-action=clear]').click();await root(p,id).locator('[data-action=add]').click();await root(p,id).locator('[data-action=done]').click();
 assert.equal(await ui(p,id,'plot').locator('[data-series]').count(),expected,'Every matching player appears without a cap');
 assert.equal(await ui(p,id,'plot').locator('[data-line=raw]').count(),expected);
 assert.ok(await p.evaluate(()=>document.body.scrollWidth<=innerWidth+1));console.log('PASS all selected:',id,expected);
}
(async()=>{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);server.stderr.on('data',d=>{if(String(d).includes('Running on')){clearTimeout(timer);resolve();}});server.on('error',reject);server.on('exit',code=>reject(Error('Server exit '+code)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/tmp/qb-preview-chromium'});
 for(const [theme,id] of [['qb_year_two','football'],['baseball_year_two','baseball'],['bowling_year_two','bowling'],['qb_year_two_preview','football-preview']]){
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(theme+': '+e.message));
  await p.goto(base+'/?theme='+theme);await contract(p,id);console.log('PASS shared contract:',id);
  const rate=id==='baseball'?'bb_pct':id==='bowling'?'cash_rate':'cmp_pct';
  await ui(p,id,'metric').selectOption(rate);await root(p,id).locator('details').filter({has:p.locator('[data-ui="normalize"]')}).locator('summary').click();await ui(p,id,'normalize').selectOption('delta');
  assert.match(await ui(p,id,'bounds').innerText(),/percentage points/);assert.match(await ui(p,id,'readout').innerText(),/plotted change.*percentage points/);
  await root(p,id).locator('[data-action=reset]').click();
  for(const level of ['guided','full','simple'])if(await p.locator('#yt-levels').count()){await p.click(`[data-detail-level="${level}"]`);assert.ok(await ui(p,id,'layout').isVisible());assert.ok(await ui(p,id,'analysis').locator('summary').isVisible());}
  if(id!=='football-preview'){
   const target=id==='football'?'bowling_year_two':'qb_year_two',targetId=id==='football'?'bowling':'football',before=await state(p,id);
   await p.click(`.yt-sports a[href="?theme=${target}"]`);await ui(p,targetId,'plot').locator('svg').first().waitFor();
   await p.click(`.yt-sports a[href="?theme=${theme}"]`);await ui(p,id,'plot').locator('svg').first().waitFor();assert.deepEqual(await state(p,id),before,'Cross-sport navigation preserves each graph');
  }
  if(id==='baseball'){
   await allSelected(p,id);
   await p.click('[data-role=pitching]');await p.waitForFunction(()=>BaseballApp.getState().role==='pitching');await ui(p,id,'plot').locator('svg').first().waitFor();
   await p.setViewportSize({width:390,height:844});await contract(p,id);assert.match(await ui(p,id,'clock').innerText(),/50-inning/);await allSelected(p,id);console.log('PASS pitching');
  }
  if(id==='bowling'){
   await allSelected(p,id);
   await p.selectOption('#bw-dataset','usbc');await p.click('#bw-usbc-women');await p.setViewportSize({width:390,height:844});await contract(p,id);assert.match(await ui(p,id,'clock').innerText(),/30-game/);await allSelected(p,id);assert.ok(await p.evaluate(()=>YearTwoCharts.get('bowling').getData().every(s=>s.p.division==='women')));console.log('PASS USBC women');
  }
  if(id==='football'){
   await ui(p,id,'picker').locator('summary').click();await root(p,id).locator('[data-action=add]').click();await root(p,id).locator('[data-action=done]').click();
   assert.equal(await ui(p,id,'plot').locator('[data-series]').count(),265);
   await ui(p,id,'layout').selectOption('separate');const a=await axes(p,id);await root(p,id).locator('[data-action=next]').click();assert.deepEqual(await axes(p,id),a);
   await ui(p,id,'layout').selectOption('overlay');await ui(p,id,'picker').locator('summary').click();await root(p,id).locator('[data-action=clear]').click();assert.match(await ui(p,id,'plot').innerText(),/No players selected/);
   await ui(p,id,'search').fill('Brady');await root(p,id).locator('[data-action=add]').click();await root(p,id).locator('[data-action=done]').click();assert.equal(await ui(p,id,'plot').locator('[data-series]').count(),1);
  }
  await p.close();
 }
 const blocked=await browser.newPage();blocked.on('pageerror',e=>errors.push(e.message));await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));await blocked.goto(base+'/?theme=qb_year_two');await ui(blocked,'football','plot').locator('svg').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS all sports: shared controls, overlay math, selection, data gaps, persistence, panels, touch inspector, narrow layouts and blocked storage.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();fs.rmSync(folder,{recursive:true,force:true});});
