const {chromium}=require(process.env.WW2_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ww2-desktop-')),base='http://127.0.0.1:8098';
const server=cp.spawn('python',['-m','gunicorn','ww2_web:app','--bind','127.0.0.1:8098','--workers','1','--threads','4'],{env:{...process.env,WW2_DB_PATH:path.join(temp,'battle.sqlite3')},stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const mod=process.env.WW2_PACKAGED_CHROMIUM?require('@sparticuz/chromium'):null,pack=mod?.default||mod;
 browser=await chromium.launch({headless:true,...(pack?{executablePath:await pack.executablePath(),args:pack.args.filter(a=>a!=='--single-process')}:{args:['--no-sandbox']})});
 const errors=[];
 async function page(width=1440,height=900){const p=await browser.newPage({viewport:{width,height}});p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
 async function settle(p){await p.waitForFunction(()=>!busy&&state?.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
 const pc=await page();await pc.goto(base);
 for(const width of [1100,1280,1440]){
  await pc.setViewportSize({width,height:900});
  assert.equal(await pc.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok(await pc.evaluate(()=>{const word=document.querySelector('.desktop-lobby-intro h1 em'),range=document.createRange();range.selectNodeContents(word);return range.getBoundingClientRect().right<document.querySelector('.desktop-lobby-setup').getBoundingClientRect().left;}));
 }
 await pc.screenshot({path:path.join(temp,'desktop-lobby.png'),fullPage:true});
 await pc.locator('#createSolo').click();await pc.locator('#soloRuleset').selectOption('classic');await pc.locator('#startSolo').click();await pc.locator('#game').waitFor({state:'visible'});await settle(pc);
 let bounds=await pc.evaluate(()=>Object.fromEntries(['desktop-forces','desktop-battlefield','desktop-orders'].map(cls=>{const r=document.querySelector('.'+cls).getBoundingClientRect();return [cls,{x:r.x,y:r.y,width:r.width,height:r.height}]})));
 assert.ok(bounds['desktop-forces'].x<bounds['desktop-battlefield'].x&&bounds['desktop-battlefield'].x<bounds['desktop-orders'].x);
 assert.ok(bounds['desktop-battlefield'].width>500);
 await pc.locator('#roster button').first().click();
 assert.equal(await pc.locator('#orders').isVisible(),true);
 await pc.screenshot({path:path.join(temp,'desktop-village.png'),fullPage:true});
 // New camera controls cannot send game orders, including dragging over legal hexes.
 let posts=0;pc.on('request',r=>{if(r.method()==='POST')posts++;});
 const prior=await pc.evaluate(()=>state.revision);
 await pc.locator('#desktopZoomIn').click();await pc.locator('#desktopZoomIn').click();
 const rect=await pc.locator('#mapWrap').boundingBox();
 await pc.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.7);await pc.mouse.down();await pc.mouse.move(rect.x+rect.width*.3,rect.y+rect.height*.3,{steps:12});await pc.mouse.up();
 assert.equal(posts,0);assert.equal(await pc.evaluate(()=>state.revision),prior);
 await pc.locator('#desktopFit').click();assert.equal(await pc.locator('#desktopZoomValue').textContent(),'100%');
 await pc.locator('#mapWrap').focus();await pc.keyboard.press('+');assert.equal(await pc.locator('#desktopZoomValue').textContent(),'125%');
 // Move using the same roster and live hex handlers.
 await pc.locator('#desktopFit').click();await pc.locator('#map .hex.move').first().click();await pc.waitForFunction(()=>state.revision===1&&!busy);
 assert.equal(posts,1);
 await pc.locator('#end').click();await pc.locator('#playbackPanel').waitFor({state:'visible'});await pc.locator('#pausePlayback').click();
 assert.equal(await pc.locator('#map').isVisible(),false);assert.equal(await pc.locator('#playbackMap').isVisible(),true);
 assert.equal(await pc.locator('#orders').evaluate(n=>n.inert),true);assert.equal(await pc.locator('#desktopActionDock').isVisible(),false);
 await pc.screenshot({path:path.join(temp,'desktop-playback.png'),fullPage:true});
 await pc.setViewportSize({width:390,height:844});
 assert.equal(await pc.locator('#playbackPanel').isVisible(),true);assert.equal(await pc.locator('#orders').isVisible(),false);
 await pc.setViewportSize({width:1440,height:900});
 assert.equal(await pc.locator('#desktopActionDock').isVisible(),false);assert.equal(await pc.locator('#playbackMap').count(),1);
 await pc.locator('#skipPlayback').click();await settle(pc);
 await pc.locator('#rematchButton').click();await pc.locator('#rematchScenario').selectOption('riverfront');await pc.locator('#swapArmies').uncheck();await pc.locator('#proposeRematch').click();await pc.waitForFunction(()=>state.scenario.id==='riverfront'&&!busy);await settle(pc);
 assert.ok(parseInt(await pc.locator('#desktopZoomValue').textContent())>100);
 await pc.locator('#platoonFilters button[data-platoon="C"]').click();await pc.locator('#roster button').first().click();
 await pc.screenshot({path:path.join(temp,'desktop-riverfront.png'),fullPage:true});
 for(const [width,height] of [[1100,720],[1280,720],[1920,1080]]){
  await pc.setViewportSize({width,height});await settle(pc);
  assert.equal(await pc.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const r=await pc.locator('#mapWrap').boundingBox();assert.ok(r.width>250&&r.height>200);
  const end=await pc.locator('#end').boundingBox();assert.ok(end.y+end.height<=height, 'End turn must stay visible on laptop screens');
 }
 await pc.setViewportSize({width:1280,height:720});await pc.screenshot({path:path.join(temp,'desktop-1280.png'),fullPage:true});
 // Existing seat and private save dialogs work in the new command panels.
 await pc.locator('#saveButton').click();await pc.locator('#accessDialog').waitFor({state:'visible'});assert.match(await pc.locator('#accessCode').inputValue(),/^SAVE-/);await pc.locator('#closeAccess').click();
 // Mobile presentation now intentionally includes play preferences; verify usability, not old pixels.
 const credentials=await pc.evaluate(()=>({code:session.code,token:session.token}));
 const mobile=await page(390,844);
 await mobile.addInitScript(seat=>localStorage.setItem('ww2-session',JSON.stringify(seat)),credentials);
 await mobile.goto(base);await mobile.locator('#game').waitFor({state:'visible'});await settle(mobile);
 for(const width of [320,390,768]){
  await mobile.setViewportSize({width,height:844});await settle(mobile);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await mobile.locator('#end').isVisible(),true);
  assert.equal(await mobile.locator('#simpleToggle').isVisible(),true);
  await mobile.screenshot({path:path.join(temp,`mobile-${width}.png`),fullPage:true});
 }
 // Reparenting back to mobile removes every desktop-only control and preserves actions.
 await pc.setViewportSize({width:390,height:844});await settle(pc);
 assert.equal(await pc.locator('.desktop-camera').count(),0);assert.equal(await pc.locator('.desktop-unit-meta').count(),0);
 assert.equal(await pc.locator('#roster button').count(),5);
 await pc.locator('#roster button').first().click();assert.ok(await pc.evaluate(()=>selected));
 await pc.setViewportSize({width:1440,height:900});await settle(pc);assert.equal(await pc.locator('.desktop-camera').count(),1);
 assert.equal(await pc.locator('#orders').count(),1);assert.equal(await pc.locator('#end').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop lobby, command columns, camera/drag without orders, movement, playback, platoons, save dialog, responsive desktop widths, mobile controls and overflow, breakpoint roundtrip. Screenshots: '+temp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
