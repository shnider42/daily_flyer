// Run with NODE_PATH set to a directory containing Playwright. Server on :8000.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const errors=[];
 const usContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const deContext=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 const us=await usContext.newPage(),de=await deContext.newPage();
 for(const page of [us,de]){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());}
 await us.goto('http://127.0.0.1:8000/');
 await us.screenshot({path:'/tmp/ww2-lobby.png',fullPage:true});
 await us.locator('#create').click();await us.locator('#waiting').waitFor({state:'visible'});
 const invite=await us.locator('#invite').inputValue();
 await de.goto(invite);await de.locator('#joinForm button').click();
 await de.locator('#game').waitFor({state:'visible'});
 await us.waitForFunction(()=>!document.querySelector('#waiting').hidden===false);
 await us.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 assert.equal(await de.locator('#end').isDisabled(),true);
 await us.getByRole('button',{name:'Americans Rifle squad, 3 strength, 2 actions',exact:true}).first().click();
 await us.getByRole('button',{name:'Move to B8, field, 1 action',exact:true}).click();
 await us.waitForFunction(()=>document.querySelector('#selection').textContent.includes('1 actions'));
 await us.screenshot({path:'/tmp/ww2-board.png',fullPage:true});
 await us.locator('#end').click();
 await de.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 await de.getByRole('button',{name:'Germans Rifle squad, 3 strength, 2 actions',exact:true}).first().click();
 await de.getByRole('button',{name:'Move to B2, field, 1 action',exact:true}).click();
 await de.waitForFunction(()=>document.querySelector('#selection').textContent.includes('1 actions'));
 await de.reload();await de.locator('#game').waitFor({state:'visible'});
 await de.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('Your turn'));
 await de.locator('#rulesButton').click();assert.equal(await de.locator('#rules').isVisible(),true);await de.locator('#closeRules').click();
 for(const width of [320,375,390,430,768,1280]){
  await us.setViewportSize({width,height:844});
  assert.equal(await us.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
 }
 await us.setViewportSize({width:390,height:844});
 await us.screenshot({path:'/tmp/ww2-final.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: independent mobile seats, invitation, synchronized movement, turn handoff, reconnect, field manual, 320–1280px layout, no JS errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
