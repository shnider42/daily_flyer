/* Coordinated visual-system regression checks. Run only against the CI static server.
   Account APIs are replaced by a read-only in-memory fixture; no real writes occur. */
'use strict';
const {chromium, webkit, expect} = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const engine = process.env.HLLV_BROWSER_ENGINE || 'chromium';
const baseURL = process.env.HLLV_TEST_URL || 'http://127.0.0.1:8765/';
const origin = new URL(baseURL).origin;
const output = 'artifacts/visual-system-qa';
const issues = JSON.parse(fs.readFileSync('hllv_tracker/data/issues.json')).issues;
const featureLedger = JSON.parse(fs.readFileSync('hllv_tracker/data/features.json'));
const issue = issues.find(row => row.id === 'HLLV-046');
const feature = featureLedger.features.find(row => row.id === 'HLLV-F008');
assert(issue && feature, 'The linked bug and content fixtures must exist');
// Synthetic public suggestions exercise realistic text, labels and related-record links.
// They are never sent to the service or added to the production dataset.
const suggestionRows = [{
  id:'visual-fixture-controls', version:1, state:'published', kind:'suggestion',
  title:'Clearer helicopter control descriptions',
  problem:'Players can struggle to distinguish flight controls while learning to fly. Clearer descriptions would help them understand what each binding does.',
  desired_outcome:'Add concise descriptions and an optional practice checklist for helicopter controls.',
  related_issue:'HLLV-007', created_at:'2026-10-16T12:00:00Z',
  updated_at:'2026-10-16T13:00:00Z', approved_at:'2026-10-16T13:00:00Z',
  approval_label:'Moderator approved', approval_mode:'community',
  developer_review:'Not recorded', votes:12, my_vote:false,
  public_comments:[{id:'visual-comment', body:'Published for community discussion. Developer review has not been recorded.', created_at:'2026-10-16T13:00:00Z', author_label:'Site moderator', version:1}],
  public_comment_count:1,
}, {
  id:'visual-fixture-maps', version:1, state:'published', kind:'suggestion',
  title:'Improve the readability of map symbols during busy matches',
  problem:'Overlapping symbols can make it difficult to identify a squad’s intended spawn point.',
  desired_outcome:'Offer a clearer symbol legend and improve spacing when several markers overlap.',
  related_issue:'HLLV-046', created_at:'2026-10-15T12:00:00Z',
  updated_at:'2026-10-16T12:00:00Z', approved_at:'2026-10-16T12:00:00Z',
  approval_label:'Moderator approved', approval_mode:'community',
  developer_review:'Not recorded', votes:4, my_vote:false,
  public_comments:[], public_comment_count:0,
}];
const sdk = `export function createClient(){return {
  auth:{onAuthStateChange:()=>({}),getSession:async()=>({data:{session:null},error:null})},
  rpc:async(name,args={})=>{
    const action=args.action;await globalThis.__recordVisualRpc({name,action});
    if(name!=='hllv_community'||!['status','board'].includes(action))throw Error('Unexpected API operation in read-only visual QA');
    if(action==='status')return {data:{enabled:true,approval_mode:'community',policy_version:'community-v1'},error:null};
    const payload=args.payload||{},query=String(payload.query||'').toLowerCase();
    const rows=globalThis.__visualRows.filter(row=>(row.title+' '+row.problem).toLowerCase().includes(query));
    return {data:{enabled:true,rows,total:rows.length,page:0,page_size:20,checked_at:'2026-10-17T16:00:00Z'},error:null};
  }
}}`;

(async()=>{
  assert(['chromium','webkit'].includes(engine), 'Supported browser engine required');
  fs.mkdirSync(output,{recursive:true});
  const browser = await ({chromium,webkit}[engine]).launch({headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const errors=[], writes=[], blockedRequests=[], calls=[], checked=[];
  await context.exposeBinding('__recordVisualRpc',(_,call)=>calls.push(call));
  await context.addInitScript(rows=>{globalThis.__visualRows=rows;},suggestionRows);
  await context.route('**/*',route=>{
    const request=route.request();
    if(request.method()!=='GET'){writes.push(request.method()+' '+request.url());return route.abort();}
    if(new URL(request.url()).origin!==origin){blockedRequests.push(request.url());return route.abort();}
    return route.continue();
  });
  await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({
    body:sdk,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},
  }));
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  let navigation=0;
  const loadRoute=async(hash)=>{
    const target=new URL(baseURL);target.hash=hash;
    // A hash-only goto reuses in-memory search filters. Give each responsive case
    // a new document so its starting state and synthetic board are independent.
    target.searchParams.set('visual-qa',String(++navigation));
    await page.goto(target.href,{waitUntil:'networkidle'});
  };
  const noOverflow=async(label)=>{
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(dimensions.scroll<=dimensions.width+1,`${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
  };
  const setTheme=async(theme)=>{
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  };
  const visibleFocus=async(locator)=>{
    await expect(locator).toBeFocused();
    assert(await locator.evaluate(el=>{
      const css=getComputedStyle(el);
      return el.matches(':focus-visible') && ((css.outlineStyle!=='none'&&parseFloat(css.outlineWidth)>0)||css.boxShadow!=='none');
    }),'Keyboard focus must have a visible outline or shadow');
  };

  await page.goto(baseURL,{waitUntil:'networkidle'});
  await expect(page.locator('#featureHighlights .ft-row')).toHaveCount(3);
  await expect(page.getByRole('heading',{name:'Infierno Liberado',exact:true})).toBeVisible();
  await expect(page.locator('.community-paths>a')).toHaveCount(3);
  // Verify the tab icon and device icon are real, served assets, not merely dead links.
  for(const [selector,kind] of [['#hllv-favicon','svg'],['#hllv-favicon-fallback','ico'],['link[rel="apple-touch-icon"]','png']]){
    const link=page.locator(selector);await expect(link).toHaveCount(1);
    const href=await link.getAttribute('href');assert(href,`${kind} icon href required`);
    const iconURL=new URL(href,baseURL);assert.equal(iconURL.origin,origin);
    const response=await page.request.get(iconURL.href);assert(response.ok(),`${kind} icon must load`);
    const bytes=await response.body();assert(bytes.length>32,`${kind} icon must not be empty`);
    if(kind==='svg')assert.match(bytes.toString(),/<svg[\s>]/);
    if(kind==='ico')assert.equal(bytes.subarray(0,4).toString('hex'),'00000100');
    if(kind==='png')assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }

  // Bug list: filtering, explicit status, keyboard entry, evidence and returning context.
  await page.locator('[data-page="issues"]').click();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#homeTotal')).toHaveAttribute('role','status');
  await page.locator('[data-home-status="all"]').click();
  await expect(page.locator('[data-home-status="all"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-home-status="open"]')).toHaveAttribute('aria-pressed','false');
  await page.locator('#homeCategory').selectOption(issue.category);
  await page.locator('[data-date-order="browse"]').selectOption('oldest');
  await page.locator('#homeSearch').fill(issue.id);
  // Search also covers cross-references; an issue ID need not yield one result.
  const bugRow=page.locator(`#homeList [data-home-id="${issue.id}"]`);
  await expect(bugRow).toHaveCount(1);
  await expect(bugRow.locator('.record-title')).toHaveText(issue.title);
  await expect(bugRow.locator('.record-summary')).toHaveText(issue.bottom_line);
  await expect(bugRow.locator('.record-meta')).toContainText(issue.id);
  const matchingBugIds=await page.locator('#homeList [data-home-id]').evaluateAll(rows=>rows.map(row=>row.dataset.homeId));
  await page.locator('#homeSearch').focus();await page.keyboard.press('Tab');
  await visibleFocus(page.locator('#homeCategory'));
  await bugRow.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#dossier h1')).toHaveText(issue.title);
  await expect(page.locator('#dossier .summary-workaround')).toContainText(issue.workaround);
  await expect(page.locator('#dossier .stamp')).toHaveText(issue.status_label);
  await page.locator('#dossier .tabs [data-tab="sources"]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#sources .evidence-source')).toHaveCount(issue.sources.length);
  await visibleFocus(page.locator('#dossier .tabs [data-tab="sources"]'));
  await page.locator('#back').click();
  await expect(page.locator('#homeSearch')).toHaveValue(issue.id);
  await expect(page.locator('#homeCategory')).toHaveValue(issue.category);
  await expect(page.locator('[data-date-order="browse"]')).toHaveValue('oldest');
  await expect(page.locator('[data-home-status="all"]')).toHaveAttribute('aria-pressed','true');
  await expect(bugRow).toHaveCount(1);
  assert.deepEqual(await page.locator('#homeList [data-home-id]').evaluateAll(rows=>rows.map(row=>row.dataset.homeId)),matchingBugIds,'Returning preserves the filtered results and their order');

  // Content: the direction badge remains separate from the live baseline.
  await page.locator('[data-page="features"]').click();
  await page.locator('#featureSearch').fill(feature.id);
  const featureRow=page.locator(`#featureResults .ft-row[href="#feature/${feature.id}"]`);
  await expect(featureRow).toHaveCount(1);
  await expect(featureRow.locator('.record-title')).toHaveText(feature.title);
  await expect(page.locator('#featureCount')).toHaveAttribute('role','status');
  await featureRow.click();
  await expect(page.locator('.ft-current')).toContainText(feature.current.summary);
  await expect(page.locator('.ft-direction')).toContainText(feature.change);
  await expect(page.locator('.ft-history li')).toHaveCount(feature.history.length);
  await page.locator('.ft-back').click();
  await expect(page.locator('#featureSearch')).toHaveValue(feature.id);
  await page.locator('#featureSearch').fill('no-feature-matches-this-fixture');
  await expect(page.locator('#featureResults')).toContainText('No matching features');

  // Suggestions: read a populated board, show an honest empty result, and sign-in gate.
  await page.locator('[data-page="suggestions"]').click();
  await expect(page.locator('[data-board-id]')).toHaveCount(suggestionRows.length);
  await expect(page.locator('#suggestionBox')).toContainText('Private first. Public after moderator approval.');
  await page.locator('.cb-row details>summary').first().click();
  await expect(page.locator('.cb-row').first()).toContainText('No Team17 review or development commitment is recorded.');
  await page.locator('#cbSearch').fill('no-suggestion-matches-this-fixture');
  await page.locator('#cbSearchForm button[type="submit"]').click();
  await expect(page.locator('.cb-empty')).toContainText('No matching suggestions');
  await expect(page.locator('[data-board-id]')).toHaveCount(0);
  await page.locator('#communitySubmit').click();
  await expect(page.locator('#cbLogin')).toBeVisible();
  await expect(page.locator('#cbSubmitForm')).toHaveCount(0);
  await page.locator('#cbLogin').click();
  await expect(page.locator('#sgPasswordLogin')).toBeVisible();
  await expect(page.locator('[data-cb-view="queue"]')).toBeHidden();
  await page.locator('#accountMenu>summary').click();await page.keyboard.press('Escape');
  await expect(page.locator('#hllvAccountBar')).toBeHidden();
  await expect(page.locator('#accountMenu>summary')).toBeFocused();

  const scenarios=[
    {name:'home',hash:'',ready:'#landing h1',nav:'landing'},
    {name:'bugs',hash:'#issues',ready:'#homeList .record-title',nav:'issues'},
    {name:'bug-detail',hash:'#HLLV-046',ready:'#dossier .summary-workaround',nav:'issues'},
    {name:'content',hash:'#features',ready:'#featureResults .record-title',nav:'features'},
    {name:'content-detail',hash:'#feature/HLLV-F008',ready:'.ft-current',nav:'features'},
    {name:'suggestions-synthetic',hash:'#suggestions',ready:'[data-board-id]',nav:'suggestions'},
    {name:'suggestions-empty',hash:'#suggestions',ready:'.cb-empty',nav:'suggestions',empty:true},
    {name:'suggestions-sign-in',hash:'#suggestions',ready:'#cbLogin',nav:'suggestions',submit:true},
  ];
  for(const width of [320,390,768,1280])for(const theme of ['dark','light'])for(const scenario of scenarios){
    await page.setViewportSize({width,height:width<768?844:900});
    await loadRoute(scenario.hash);
    await setTheme(theme);
    if(scenario.empty){
      await expect(page.locator('#cbRefresh')).toBeVisible();
      await page.evaluate(()=>{globalThis.__visualRows=[];});await page.locator('#cbRefresh').click();
      await expect(page.locator('.cb-empty')).toContainText('The next idea could be yours');
    }
    if(scenario.submit){
      await expect(page.locator('[data-board-id]')).toHaveCount(suggestionRows.length);
      await page.locator('#communitySubmit').click();
    }
    await expect(page.locator(scenario.ready).first()).toBeVisible();
    await expect(page.locator(`[data-page="${scenario.nav}"]`)).toHaveAttribute('aria-current','page');
    await expect(page.locator('.site-nav')).toBeVisible();
    await noOverflow(`${engine}/${scenario.name}/${width}/${theme}`);
    if(width===390||width===1280){
      await page.evaluate(()=>document.fonts.ready);
      if(scenario.name==='home')await expect.poll(()=>page.locator('.landing-scene img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
      await page.screenshot({path:`${output}/${engine}-${width}-${theme}-${scenario.name}.png`,fullPage:true});
    }
    checked.push({route:scenario.name,width,theme});
  }
  await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  assert.deepEqual(errors,[],'No browser runtime errors');
  assert.deepEqual(writes,[],'No network writes are permitted');
  assert.deepEqual(blockedRequests,[],'No unexpected external API or asset requests');
  assert(calls.length>0,'The suggestion fixture must actually be exercised');
  assert(calls.every(call=>call.name==='hllv_community'&&['status','board'].includes(call.action)),'Only public read RPCs are permitted');
  fs.writeFileSync(`${output}/${engine}-report.json`,JSON.stringify({engine,checked,readOnlyRpcCalls:calls.length,networkWrites:0,errors:[],suggestionScreenshots:'Synthetic public fixture; no real submissions or votes.',scope:'Visual and public-navigation regression checks. Existing community tests cover authenticated private submission and moderation workflows.'},null,2)+'\n');
  console.log(`VISUAL_SYSTEM_BROWSER_PASS ${engine}: ${checked.length} route/viewport/theme checks, bug and feature reading order, retained filters, keyboard focus, public suggestion and signed-out states, favicon assets; no writes.`);
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
