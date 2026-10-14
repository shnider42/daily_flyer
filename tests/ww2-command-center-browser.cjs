/* Command center uses the desktop viewport; presentation changes keep live orders intact. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {tap}=require('./ww2-ui-helpers.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-command-center-'));
const port=Number(process.env.WW2_COMMAND_CENTER_PORT||8200),base=`http://127.0.0.1:${port}`;
const server=cp.spawn('python',['-c',`from ww2_web import create_app; create_app('${path.join(temp,'game.sqlite')}',background_ai=False).run(host='127.0.0.1',port=${port},threaded=True)`],{stdio:'ignore'});
let browser;
const errors=[],sizes=[];
const uniqueControls=['battleViewOpen','battleLayout','playTools','roster','orders','end','nextUnit','mapWrap','map'];
async function settle(page){
 await page.waitForFunction(()=>state&&!busy&&!polling);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function layout(page,value){
 await tap(page,page.locator('#battleViewOpen'));
 assert.equal(await page.locator('#battleLayout option[value="panels"]').textContent(),'Command center');
 await page.locator('#battleLayout').selectOption(value);
 await page.locator('#battleViewSettingsClose').click();
 await settle(page);
 assert.equal(await page.evaluate(()=>ww2Experience.layout),value);
}
const gameplay=page=>page.evaluate(()=>({state:JSON.stringify(state),revision:state.revision,selected,target,smokeMode,barrageMode,combatMode}));
async function intact(page,before,context){
 assert.deepEqual(await gameplay(page),before,`${context}: layout changes preserve rules, revision and selection`);
 for(const id of uniqueControls)assert.equal(await page.locator('#'+id).count(),1,`${context}: one #${id}`);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${context}: no horizontal page overflow`);
}
async function start(page,scenario){
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await page.locator('#scenarioSelectEdition').selectOption('current');
 await page.locator('#scenarioSelect').selectOption(scenario);
 await page.locator('#createSolo').click();await page.locator('#startSolo').click();
 await page.waitForFunction(()=>state?.ready&&!busy&&!lobbyMode);await settle(page);
 await layout(page,'panels');
 await tap(page,page.locator('#roster button').first());await settle(page);
 assert.ok(await page.evaluate(()=>selected),'A real roster click selects a unit');
}
async function desktopGeometry(page,scenario,width,height){
 const geometry=await page.evaluate(()=>{
  const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  return {main:box('main'),game:box('#game'),layout:box('.desktop-layout'),roster:box('.desktop-forces'),field:box('.desktop-battlefield'),map:box('#mapWrap'),commands:box('.desktop-command-column'),end:box('#end')};
 });
 const context=JSON.stringify({scenario,width,height,geometry});
 for(const name of ['main','game']){
  const {x,right}=geometry[name],rightGutter=width-right;
  assert.ok(x>=-1&&rightGutter>=-1&&x<=32&&rightGutter<=32,`${name} has only a small viewport gutter: ${context}`);
  assert.ok(Math.abs(x-rightGutter)<=1,`${name} gutters are symmetric: ${context}`);
 }
 const compact=width<1400||height<=800,roomy=width>=1500&&!compact;
 assert.ok(geometry.roster.width>=(roomy?250:compact?160:180)&&geometry.commands.width>=(roomy?360:250),`Readable roster and orders: ${context}`);
 assert.ok(geometry.map.width>=400&&geometry.map.height>=180,`Usable battlefield: ${context}`);
 assert.ok(geometry.roster.right<=geometry.field.x&&geometry.field.right<=geometry.commands.x,`Three columns remain side by side: ${context}`);
 assert.ok(geometry.end.y>=0&&geometry.end.bottom<=height+1,`Finish orders remains on screen: ${context}`);
 assert.equal(await page.locator('#roster').isVisible(),true);
 assert.equal(await page.locator('#orders').isVisible(),true);
 sizes.push({scenario,width,height,mapWidth:Math.round(geometry.map.width),rosterWidth:Math.round(geometry.roster.width),ordersWidth:Math.round(geometry.commands.width)});
 return geometry;
}
(async()=>{
 let healthy=false;
 for(let attempt=0;attempt<100;attempt++){
  try{if((await fetch(base+'/healthz')).ok){healthy=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(healthy,'Disposable test server started');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const scenario of ['current:midway_2','current:village']){
  const page=await browser.newPage({viewport:{width:2560,height:1440}});
  await start(page,scenario);const before=await gameplay(page),measurements=new Map();
  for(const [width,height] of [[2560,1440],[1920,1080],[1440,900],[1100,700],[3440,1440]]){
   await page.setViewportSize({width,height});await settle(page);
   measurements.set(width,await desktopGeometry(page,scenario,width,height));
   await intact(page,before,`${scenario} at ${width}`);
   await layout(page,'map-first');await intact(page,before,`${scenario} map-first at ${width}`);
   await layout(page,'panels');await intact(page,before,`${scenario} Command center at ${width}`);
   await desktopGeometry(page,scenario,width,height);
   if(width===2560)await page.screenshot({path:path.join(temp,`${scenario.split(':')[1]}-command-center-2560.png`)});
  }
  assert.ok(measurements.get(2560).map.width>measurements.get(1920).map.width+400,'A 1440p display gives the battlefield its extra width');
  assert.ok(measurements.get(3440).map.width>measurements.get(2560).map.width+650,'Ultrawide browsers keep gaining battlefield space');
  await page.close();
  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await start(phone,scenario);const phoneBefore=await gameplay(phone);
  for(const [width,height] of [[390,844],[844,390]]){
   await phone.setViewportSize({width,height});await settle(phone);
   for(const value of ['map-first','panels']){
    await layout(phone,value);await intact(phone,phoneBefore,`${scenario} phone ${width} ${value}`);
    assert.equal(await phone.evaluate(()=>ww2Desktop.active),false,'Touch viewport retains mobile controls');
    assert.equal(await phone.locator('#mobileOrderDock').count(),1);
    assert.ok(await phone.locator('#mapWrap').isVisible());
    const details=await phone.locator('#mobileOrderToggle').getAttribute('aria-controls');
    assert.ok(['mobileUnitDetails','dadUnitDetails'].includes(details),'Phone details control declares its dialog');
    await tap(phone,phone.locator('#mobileOrderToggle'));
    assert.equal(await phone.locator('#'+details).evaluate(dialog=>dialog.open),true,'Selected-unit details remain reachable');
    await phone.locator('#'+details+'Close').click();
    if(width===390&&value==='panels')await phone.screenshot({path:path.join(temp,`${scenario.split(':')[1]}-phone-command-center.png`)});
   }
  }
  await phone.close();
 }
 assert.deepEqual(errors,[],'No browser JavaScript errors');
 console.log(JSON.stringify({passed:'Command center: 1100–3440px, carrier/infantry maps, small symmetric gutters, readable columns, layout/state/control preservation, portrait/landscape phone controls',sizes,screenshots:temp}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill('SIGTERM');});
