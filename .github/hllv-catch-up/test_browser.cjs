/* Public guide QA. Account services are stubbed and all network writes blocked. */
'use strict';
const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const engine=process.env.HLLV_BROWSER_ENGINE||'chromium',base=process.env.HLLV_TEST_URL||'http://127.0.0.1:8765/';
const output='artifacts/catch-up-qa';
let browser,page;
(async()=>{
  browser=await ({chromium,webkit}[engine]).launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[],writes=[];fs.mkdirSync(output,{recursive:true});
  const sdk='export function createClient(){return {auth:{onAuthStateChange:()=>({}),getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{enabled:true,rows:[],total:0}})}}';
  await context.route('**/*',route=>{const r=route.request();if(r.method()!=='GET'){writes.push(r.url());return route.abort();}if(new URL(r.url()).origin!==new URL(base).origin)return route.abort();return route.continue();});
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:sdk,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}}));
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  const go=async(hash='#catch-up')=>{await page.goto(base+hash,{waitUntil:'networkidle'});await expect(page.locator('#catchUpCount')).toBeVisible();};
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#catchUpStart').click();
  await expect(page.locator('[data-page="catch-up"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#catchUpCount')).toContainText('10 topics');
  await expect(page.locator('.cu-topic')).toHaveCount(3);
  await page.locator('#catchUpMore').click();await expect(page.locator('.cu-topic')).toHaveCount(10);
  await page.locator('[data-topic="engineer-defenses"]>summary').click();
  await expect(page.locator('[data-topic="engineer-defenses"]')).toContainText('three per Engineer');
  await page.locator('#catchUpRole').selectOption('engineer');
  await expect(page.locator('#catchUpCount')).toContainText('4 topics');
  await expect(page.locator('.cu-topic').first()).toHaveAttribute('data-topic','engineer-defenses');
  await page.locator('#catchUpWhen').selectOption('custom');
  await page.locator('#catchUpDate').fill('2026-10-15');await page.locator('#catchUpDate').dispatchEvent('change');
  await page.locator('[data-topic="engineer-defenses"]>summary').click();
  await expect(page.locator('[data-topic="engineer-defenses"] .cu-changes')).not.toContainText('Oct 7');
  await expect(page.locator('[data-topic="engineer-defenses"] .cu-topic-body')).toContainText('Level 1 construction remains free');
  await expect(page).toHaveURL(/since=2026-10-15&role=engineer&topic=engineer-defenses/);
  const shareURL=page.url();await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('[data-topic="engineer-defenses"]')).toHaveAttribute('open','');
  await expect(page.locator('#catchUpRole')).toHaveValue('engineer');
  // The current guide and content dossier share the same baseline; back retains context.
  await page.locator('[data-topic="engineer-defenses"] a[href="#feature/HLLV-F001"]').click();
  await expect(page.locator('#featuresPage')).toBeVisible();await expect(page.locator('#catchUpPage')).toBeHidden();
  await page.goBack();await expect(page.locator('#catchUpRole')).toHaveValue('engineer');
  await expect(page.locator('[data-topic="engineer-defenses"]')).toHaveAttribute('open','');
  // Exercise copy success and the permission-denied fallback without using a real clipboard.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value;}}}));
  await page.locator('#catchUpShare').click();await expect(page.locator('#catchUpMessage')).toContainText('copied');
  assert.equal(await page.evaluate(()=>window.__copied),shareURL);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Unavailable');}}}));
  await page.locator('#catchUpShare').click();await expect(page.locator('#catchUpShareFallback input')).toHaveValue(shareURL);
  await go('#catch-up?since=2026-10-21');await expect(page.locator('#catchUpCount')).toContainText('9 topics');
  await go('#catch-up?since=2026-10-22');await expect(page.locator('#catchUpCoverage')).toContainText('does not establish that nothing changed');
  await expect(page.locator('.cu-topic')).toHaveCount(0);await page.locator('#catchUpReset').click();await expect(page.locator('#catchUpCount')).toContainText('10 topics');
  await go('#catch-up?since=2026-09-01');await expect(page.locator('#catchUpCoverage')).toContainText('Earlier changes are not covered');
  await go('#catch-up?since=9999-12-31');await expect(page.locator('#catchUpMessage')).toContainText('not valid');
  await go('#catch-up?role=%3Cscript%3E&topic=missing');await expect(page.locator('#catchUpMessage')).toContainText('not in this edition');
  await go('#catch-up?role=infantry');await page.locator('#brandHome').click();await page.locator('[data-page="catch-up"]').click();await expect(page.locator('#catchUpRole')).toHaveValue('infantry');
  await go();
  const before=await page.locator('[data-topic="boat-spawning"]>summary').boundingBox();
  await page.locator('[data-topic="boat-spawning"]>summary').hover();
  const after=await page.locator('[data-topic="boat-spawning"]>summary').boundingBox();assert.deepEqual(after,before,'Hover must not move the briefing');
  await page.locator('[data-topic="boat-spawning"]>summary').focus();await page.keyboard.press('Enter');
  await expect(page.locator('[data-topic="boat-spawning"]')).toHaveAttribute('open','');
  await page.locator('[data-topic="boat-spawning"] a[href="#HLLV-046"]').click();await expect(page.locator('#dossier h1')).toContainText('Spawn choices');
  await page.goBack();await expect(page.locator('[data-topic="boat-spawning"]')).toHaveAttribute('open','');
  // Collected source changes flag the guide; they must never rewrite its advice.
  const takeaway=await page.locator('.cu-takeaway').first().textContent();
  await page.evaluate(()=>window.HLLVCatchUp.receiveFeed({state:'ok',last_success_at:new Date().toISOString(),items:[{id:'1847286114028257',content_sha256:'changed',published_at:'2026-10-21T10:00:57Z',candidate_feature_ids:['HLLV-F008']}]}));
  await expect(page.locator('#catchUpFreshness')).toContainText('awaits guide review');
  await expect(page.locator('[data-cu-review="boat-spawning"]')).toBeVisible();
  assert.equal(await page.locator('.cu-takeaway').first().textContent(),takeaway);
  await page.evaluate(()=>window.HLLVCatchUp.receiveFeed(null));await expect(page.locator('#catchUpFreshness')).toContainText('could not be checked');
  for(const {width,height} of [{width:320,height:740},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1280,height:720},{width:1440,height:900},{width:2560,height:1440}])for(const theme of ['dark','light']){
    await page.setViewportSize({width,height});await go();
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeToggle').click();
    await page.evaluate(()=>document.fonts.ready);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${engine}/${width}/${theme}: horizontal overflow`);
    for(const selector of ['.cu-heading h1','#catchUpWhen','#catchUpRole','#catchUpShare','.cu-topic:first-child h2']){
      const b=await page.locator(selector).boundingBox();assert(b&&b.y>=0&&b.y+b.height<=height,`${engine}/${width}/${theme}: opening cut off ${selector}: ${JSON.stringify(b)}`);
    }
    for(const nav of await page.locator('.top-links [data-page]').all()){const b=await nav.boundingBox();assert(b.width>=44&&b.height>=44&&b.x>=0&&b.x+b.width<=width+1,'Nav fit and touch targets');}
    await page.screenshot({path:`${output}/${engine}-${width}-${theme}-opening.png`});
    await page.locator('[data-topic="engineer-defenses"]>summary').click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Expanded guide overflow');
    if(width===390||width===1440)await page.screenshot({path:`${output}/${engine}-${width}-${theme}-expanded.png`,fullPage:true});
  }
  // Failed data loads recover via the visible retry action and preserve route filters.
  let fail=true;
  await page.route('**/data/catch-up.*.json',r=>fail?r.fulfill({status:503,body:'Unavailable'}):r.continue());
  await page.goto(base+'#catch-up?role=boats',{waitUntil:'networkidle'});
  // Fragment navigation retains the loaded module; reload to exercise the data request.
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('#catchUpRetry')).toBeVisible();
  fail=false;await page.locator('#catchUpRetry').click();await expect(page.locator('#catchUpRole')).toHaveValue('boats');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(`CATCH_UP_BROWSER_PASS ${engine}: date and role filters, scoped current rules, coverage limits, share and fallback, deep links and back, review flags, keyboard, retry, seven widths and both themes; no writes.`);
  await browser.close();
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:`${output}/${engine}-failure.png`,fullPage:true}).catch(()=>{});if(browser)await browser.close().catch(()=>{});process.exit(1);});
