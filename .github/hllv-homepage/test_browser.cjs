/* First-visit UX and existing routes. Account APIs are isolated; no real writes. */
const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=process.env.HLLV_BROWSER_ENGINE||'chromium';
const url=process.env.HLLV_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await ({chromium,webkit}[engine]).launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const sdk='export function createClient(){return {auth:{onAuthStateChange:()=>({}),getSession:async()=>({data:{session:null}})},rpc:async()=>({data:{enabled:true,rows:[],total:0}})}}';
 await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:sdk,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}}));
 await context.route('https://*.supabase.co/**',r=>r.abort());
 const page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url())});
 const noOverflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
 await page.goto(url,{waitUntil:'networkidle'});
 await expect(page.locator('#featureHighlights .ft-row')).toHaveCount(3);
 await expect(page.getByRole('heading',{name:'Hell Let Loose: Vietnam',exact:true})).toBeVisible();
 await expect(page.locator('.landing-support')).toContainText('community bug tracker, suggestion box, and content tracker');
 await expect(page.locator('.community-paths>a')).toHaveCount(3);
 await expect(page.locator('#hllvAccountBar')).toBeHidden();
 await expect(page.locator('#staffResponses')).toBeHidden();
 fs.mkdirSync('artifacts/homepage-qa',{recursive:true});
 for(const width of [320,375,390,768,1280]){
  await page.setViewportSize({width,height:900});await noOverflow();
  for(const link of await page.locator('.community-path').all()){
   const bounds=await link.boundingBox();assert(bounds.width>=44&&bounds.height>=44,'Main routes must be touch friendly');
  }
  await page.locator('#accountMenu>summary').click();
  await expect(page.locator('#hllvAccountBar')).toBeVisible();await noOverflow();
  await page.keyboard.press('Escape');await expect(page.locator('#hllvAccountBar')).toBeHidden();
  await expect(page.locator('#accountMenu>summary')).toBeFocused();
 }
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:width===390?844:900});
  await page.screenshot({path:`artifacts/homepage-qa/${engine}-${width}-dark.png`,fullPage:true});
  await page.locator('#themeToggle').click();await noOverflow();
  await page.screenshot({path:`artifacts/homepage-qa/${engine}-${width}-light.png`,fullPage:true});
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('#themeToggle').click();
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#browseIssues').click();await expect(page.locator('#home')).toBeVisible();
 await expect(page.locator('[data-page="issues"]')).toHaveAttribute('aria-current','page');
 await page.locator('#homeSearch').fill('Spawn choices');await page.locator('#homeList [data-home-id]').click();
 await expect(page.locator('#dossier h1')).toContainText('Spawn choices');
 await page.locator('#brandHome').click();await expect(page.locator('#landing')).toBeVisible();
 await page.locator('.path-content').click();await expect(page.locator('#featuresPage h1')).toHaveText('Content tracker.');
 await page.locator('#featureSearch').fill('boat');await page.locator('#featureResults .ft-row').click();
 await expect(page.locator('.ft-history')).toBeVisible();await noOverflow();
 await page.locator('#brandHome').click();await page.locator('.path-ideas').click();
 await expect(page.locator('#suggestionBox')).toBeVisible();
 await expect(page.locator('#suggestionBox')).toContainText('Private first. Public after moderator approval.');
 await page.locator('#brandHome').click();
 await page.locator('#accountMenu>summary').click();await page.locator('#hllvAccountBar [data-account="sign-in"]').click();
 await expect(page.locator('#suggestionBox')).toBeVisible();await expect(page.locator('#accountMenu')).not.toHaveAttribute('open','');
 await expect(page.locator('#sgLoginEmail')).toBeVisible();
 await page.locator('#brandHome').click();await page.locator('#accountMenu>summary').click();
 await page.locator('#hllvAccountBar [data-account="create-account"]').click();await expect(page.locator('#sgSignupEmail')).toBeVisible();
 // Existing signed-in and moderator controls still fit inside the same account panel.
 await page.evaluate(()=>window.HLLVPassword.status({profile:{role:'moderator'},email:'layout-test@example.invalid'}));
 await page.locator('#accountMenu>summary').click();await expect(page.locator('[data-account="review"]')).toBeVisible();await noOverflow();
 await page.locator('#brandHome').click();
 await page.locator('#patchNotesJump').click();await expect(page.locator('#patchNotesHeading')).toBeFocused();
 await page.locator('#trackerEvidence>summary').click();await expect(page.locator('#pageLastUpdated')).toBeVisible();
 await expect(page.locator('#staffResponses')).toBeVisible();await noOverflow();
 await page.locator('#brandHome').click();await page.locator('#officialSourceList .feed-entry').first().locator('summary').click();
 await expect(page.locator('#officialSourceList .feed-entry').first().locator('.ft-feed-links')).toBeVisible();
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('HOMEPAGE_BROWSER_PASS '+engine+': clear identity, all three routes, mobile widths, both themes, sign-in/registration entry, moderator controls, keyboard dismissal, patch and evidence access; no writes.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
