/* Focused interaction presentation QA. Uses real static assets and synthetic public
   suggestions; external account calls and every network write are blocked. */
'use strict';
const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=process.env.HLLV_BROWSER_ENGINE||'chromium';
const base=process.env.HLLV_TEST_URL||'http://127.0.0.1:8765/';
const origin=new URL(base).origin,output='artifacts/interaction-qa';
const fixture={id:'interaction-public-fixture',version:1,state:'published',kind:'suggestion',title:'Clearer helicopter control descriptions',problem:'Players need clearer descriptions while learning the helicopter controls.',desired_outcome:'Add concise descriptions for each flight control.',related_issue:'HLLV-007',created_at:'2026-10-16T12:00:00Z',updated_at:'2026-10-16T13:00:00Z',approved_at:'2026-10-16T13:00:00Z',approval_label:'Moderator approved',votes:7,my_vote:false,public_comments:[],public_comment_count:0};
const sdk=`export function createClient(){return {auth:{onAuthStateChange:()=>({}),getSession:async()=>({data:{session:null},error:null})},rpc:async(name,args={})=>{await globalThis.__recordInteractionRead({name,action:args.action});if(name!=='hllv_community'||!['status','board'].includes(args.action))throw Error('Unexpected write or private read in interaction QA');return {data:args.action==='status'?{enabled:true,approval_mode:'community',policy_version:'community-v1'}:{enabled:true,rows:${JSON.stringify([fixture])},total:1,page:0,page_size:20},error:null};}}}`;

(async()=>{
  assert(['chromium','webkit'].includes(engine));fs.mkdirSync(output,{recursive:true});
  const browser=await ({chromium,webkit}[engine]).launch({headless:true});
  const errors=[],writes=[],external=[],calls=[],results=[],failures=[];
  let navigation=0;
  async function makePage(mobile=false){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile,reducedMotion:'no-preference'});
    await context.exposeBinding('__recordInteractionRead',(_,call)=>calls.push(call));
    await context.route('**/*',route=>{
      const request=route.request();
      if(request.method()!=='GET'){writes.push(request.method()+' '+request.url());return route.abort();}
      if(new URL(request.url()).origin!==origin){external.push(request.url());return route.abort();}
      return route.continue();
    });
    await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({body:sdk,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}}));
    const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));return page;
  }
  async function load(page,hash,theme){
    const url=new URL(base);url.hash=hash;url.searchParams.set('interaction-qa',String(++navigation));
    await page.goto(url.href,{waitUntil:'networkidle'});
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    await page.evaluate(()=>document.fonts.ready);
  }
  async function settle(locator){
    await locator.evaluate(async el=>{
      await new Promise(requestAnimationFrame);
      const animations=el.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity);
      await Promise.race([Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,700))]);
      await new Promise(requestAnimationFrame);
    });
  }
  async function snapshot(locator){
    return locator.evaluate(el=>{
      const rect=box=>({x:box.left+scrollX,y:box.top+scrollY,width:box.width,height:box.height});
      const visibleColor=color=>!['transparent','rgba(0, 0, 0, 0)'].includes(color);
      const cue=(node,pseudo)=>{
        const css=getComputedStyle(node,pseudo);
        if(pseudo&&(css.content==='none'||css.content==='normal'||css.display==='none'))return null;
        return {color:css.color,background:css.backgroundColor,shadow:css.boxShadow,filter:css.filter,opacity:css.opacity,
          decoration:css.textDecorationLine==='none'?'none':[css.textDecorationLine,css.textDecorationColor,css.textDecorationStyle,css.textDecorationThickness].join('|'),
          border:['Top','Right','Bottom','Left'].map(side=>parseFloat(css['border'+side+'Width'])>0&&css['border'+side+'Style']!=='none'&&visibleColor(css['border'+side+'Color'])?css['border'+side+'Color']:'none'),
          outline:parseFloat(css.outlineWidth)>0&&css.outlineStyle!=='none'&&visibleColor(css.outlineColor)?[css.outlineWidth,css.outlineStyle,css.outlineColor].join('|'):'none',
          content:pseudo?css.content:undefined};
      };
      const nodes=[el,...el.querySelectorAll('*')];
      const styles=nodes.map(node=>{const css=getComputedStyle(node);return {transform:css.transform,fontWeight:css.fontWeight,fontSize:css.fontSize,letterSpacing:css.letterSpacing,lineHeight:css.lineHeight,rect:rect(node.getBoundingClientRect())};});
      const text=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);text.push({text:node.textContent,rects:[...range.getClientRects()].map(rect)});}
      return {rect:rect(el.getBoundingClientRect()),styles,text,cues:nodes.filter(node=>{const box=node.getBoundingClientRect();return box.width>0&&box.height>0;}).flatMap(node=>[cue(node),cue(node,'::before'),cue(node,'::after')]).filter(Boolean),active:el.matches(':active'),focusVisible:el.matches(':focus-visible'),disabled:el.matches(':disabled'),cursor:getComputedStyle(el).cursor,opacity:Number(getComputedStyle(el).opacity),disclosureOpen:el.tagName==='SUMMARY'?el.closest('details').open:null};
    });
  }
  function stable(before,after,label){
    const geometry=(a,b,where)=>{for(const key of ['x','y','width','height'])assert(Math.abs(a[key]-b[key])<=.5,`${label}: ${where} ${key} moved (${a[key]} to ${b[key]})`);};
    geometry(before.rect,after.rect,'target');assert.equal(after.styles.length,before.styles.length,label+': descendant count changed');
    before.styles.forEach((style,index)=>{const next=after.styles[index];for(const key of ['transform','fontWeight','fontSize','letterSpacing','lineHeight'])assert.equal(next[key],style[key],`${label}: descendant ${index} changed ${key}`);geometry(style.rect,next.rect,'descendant '+index);});
    assert.equal(after.text.length,before.text.length,label+': text nodes changed');
    before.text.forEach((node,index)=>{assert.equal(after.text[index].text,node.text);assert.equal(after.text[index].rects.length,node.rects.length,label+': text wrapped differently');node.rects.forEach((box,part)=>geometry(box,after.text[index].rects[part],'text '+index+'/'+part));});
  }
  const hasCue=(a,b)=>JSON.stringify(a.cues)!==JSON.stringify(b.cues);
  async function check(name,page,fn){
    try{const detail=await fn();results.push({name,passed:true,...detail});}
    catch(error){failures.push({name,message:String(error.message||error)});results.push({name,passed:false});await page.screenshot({path:`${output}/${engine}-${name.replace(/[^a-z0-9-]/gi,'-')}-failure.png`}).catch(()=>{});}
    fs.writeFileSync(`${output}/${engine}-report.json`,JSON.stringify({engine,results,failures,networkWrites:writes,scope:'Desktop hover and keyboard checks; mobile real taps plus held-pointer pressed-style checks in a touch-capable viewport. Synthetic public suggestions only.'},null,2)+'\n');
  }
  async function hoverAndFocus(page,selector){
    const target=page.locator(selector).first();await expect(target).toBeVisible();
    await target.scrollIntoViewIfNeeded();await page.mouse.move(0,0);await target.evaluate(el=>el.blur());await settle(target);
    const before=await snapshot(target);await target.hover();
    const samples=[];
    for(let frame=0;frame<4;frame++){await page.evaluate(()=>new Promise(requestAnimationFrame));samples.push(await snapshot(target));}
    await settle(target);const hovered=await snapshot(target);
    for(const state of [...samples,hovered])stable(before,state,selector+' hover');
    assert(hasCue(before,hovered),selector+': hover needs a visible color, surface, border, underline or outline cue');
    assert.equal(hovered.disclosureOpen,before.disclosureOpen,selector+': hover must not toggle a disclosure');
    await page.mouse.move(0,0);await settle(target);
    const restored=await snapshot(target);stable(before,restored,selector+' pointer leave');assert(!hasCue(before,restored),selector+': default styling must return after pointer leave');
    // Programmatic focus only places the keyboard traversal starting point.
    await target.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
    await expect(target).toBeFocused();await settle(target);
    const focused=await snapshot(target);
    assert(focused.focusVisible,selector+': keyboard focus must match :focus-visible');
    assert(focused.cues.some(cue=>cue.outline!=='none'||cue.shadow!=='none'),selector+': keyboard focus must show an outline or shadow');
    stable(before,focused,selector+' keyboard focus');
    await target.evaluate(el=>el.blur());
    return {hoverCue:true,stableHover:true,stableText:true,keyboardFocus:true};
  }
  const desktop=await makePage();
  const routes=[
    {name:'home',hash:'',targets:['#brandHome','.top-links [data-page="issues"]','.path-bugs','#featuredIssues .featured-issue','#patchNotesJump','#accountMenu>summary','#themeToggle','#officialSourceList .feed-entry>summary']},
    {name:'bugs',hash:'#issues',targets:['#homeList [data-home-id="HLLV-046"]','[data-home-status="shipped"]']},
    {name:'bug-detail',hash:'#HLLV-046',targets:['#back','#dossier .tabs [data-tab="sources"]']},
    {name:'sources',hash:'#HLLV-046',prepare:async page=>page.locator('#dossier .tabs [data-tab="sources"]').click(),targets:['#sources .evidence-source a[href]','#sources .evidence-limits>summary']},
    {name:'content',hash:'#features',targets:['#featureResults .ft-row[href="#feature/HLLV-F008"]']},
    {name:'content-detail',hash:'#feature/HLLV-F008',targets:['.ft-back']},
    {name:'suggestions',hash:'#suggestions',targets:['#communitySubmit','[data-vote]','.cb-row details>summary','.cb-related']},
  ];
  for(const theme of ['dark','light']){
    for(const route of routes){
      await load(desktop,route.hash,theme);if(route.prepare)await route.prepare(desktop);
      for(const [index,selector] of route.targets.entries())await check(`${theme}-${route.name}-${index}`,desktop,()=>hoverAndFocus(desktop,selector));
    }
    await check(`${theme}-selected-states`,desktop,async()=>{
      await load(desktop,'#issues',theme);
      await desktop.locator('[data-home-status="shipped"]').click();await desktop.mouse.move(0,0);
      await expect(desktop.locator('[data-home-status="shipped"]')).toHaveAttribute('aria-pressed','true');
      await expect(desktop.locator('[data-page="issues"]')).toHaveAttribute('aria-current','page');
      await load(desktop,'#HLLV-046',theme);await desktop.locator('#dossier .tabs [data-tab="sources"]').click();await desktop.mouse.move(0,0);
      await expect(desktop.locator('#dossier .tabs [data-tab="sources"]')).toHaveAttribute('aria-pressed','true');
      await expect(desktop.locator('#sources')).toBeVisible();
      return {selectionSurvivesPointerLeave:true};
    });
    for(const selector of ['#communitySubmit','#cbLogin'])await check(`${theme}-disabled-${selector.slice(1)}`,desktop,async()=>{
      await load(desktop,'#suggestions',theme);
      if(selector==='#cbLogin')await desktop.locator('#communitySubmit').click();
      const target=desktop.locator(selector);await expect(target).toBeVisible();
      const enabled=await snapshot(target);
      await target.evaluate(el=>{el.disabled=true;globalThis.__disabledClicks=0;el.addEventListener('click',()=>globalThis.__disabledClicks++);});
      await desktop.mouse.move(0,0);await settle(target);const before=await snapshot(target);
      assert(before.disabled&&before.cursor!=='pointer','Disabled buttons must not advertise a pointer action');
      assert(before.opacity<enabled.opacity||hasCue(enabled,before),'Disabled buttons must be visibly distinct');
      await target.hover();await settle(target);const after=await snapshot(target);stable(before,after,'disabled hover');
      assert(!hasCue(before,after),'Disabled buttons must not acquire an enabled hover cue');
      const box=await target.boundingBox();await desktop.mouse.click(box.x+box.width/2,box.y+box.height/2);
      assert.equal(await desktop.evaluate(()=>globalThis.__disabledClicks),0,'Native disabled control cannot activate');
      if(selector==='#communitySubmit')await expect(desktop.locator('#cbLogin')).toHaveCount(0);
      else await expect(desktop.locator('#sgPasswordLogin')).toBeHidden();
      await target.evaluate(el=>{el.disabled=false;});return {selector,disabledPresentation:true,activationBlocked:true};
    });
  }

  const mobile=await makePage(true);
  async function touchPresentation(selector,{minimum44=true,persistent=false}={}){
    const target=mobile.locator(selector).first();await expect(target).toBeVisible();await target.scrollIntoViewIfNeeded();
    await mobile.mouse.move(0,0);await target.evaluate(el=>el.blur());await settle(target);const before=await snapshot(target);
    if(minimum44)assert(before.rect.width>=44&&before.rect.height>=44,selector+': primary touch target must be at least 44px square');
    if(persistent)assert(await target.evaluate(el=>{
      const css=getComputedStyle(el),painted=color=>!['transparent','rgba(0, 0, 0, 0)'].includes(color);
      return css.textDecorationLine.includes('underline')||painted(css.backgroundColor)||['Top','Right','Bottom','Left'].some(side=>parseFloat(css['border'+side+'Width'])>0&&css['border'+side+'Style']!=='none'&&painted(css['border'+side+'Color']))||/[←→↗]/u.test(el.textContent)||!!el.querySelector('svg');
    }),selector+': a touch link needs a persistent underline, surface, boundary or directional icon');
    const box=await target.boundingBox();let pressed;
    try{
      await mobile.mouse.move(box.x+box.width/2,box.y+box.height/2);await settle(target);
      // Old unguarded :hover rules can also match a mouse in a touch context.
      // Compare against that state so it cannot masquerade as :active feedback.
      const pressBaseline=await snapshot(target);
      await mobile.mouse.down();await settle(target);pressed=await snapshot(target);
      assert(pressed.active,selector+': held pointer must activate the pressed state');stable(before,pressed,selector+' pressed');
      assert(hasCue(pressBaseline,pressed),selector+': pressed state needs visible feedback in the touch layout');
    }finally{await mobile.mouse.move(0,0);await mobile.mouse.up();}
    return {minimum44,persistentAffordance:persistent,pressedCue:true,pressedMethod:'held pointer in hasTouch viewport; hover:none verified'};
  }
  for(const theme of ['dark','light']){
    await load(mobile,'',theme);assert(await mobile.evaluate(()=>matchMedia('(hover: none)').matches),'Mobile context must not depend on hover');
    for(const selector of ['.path-bugs','.top-links [data-page="issues"]','#accountMenu>summary'])await check(`${theme}-touch-home-${selector}`,mobile,()=>touchPresentation(selector,{persistent:selector==='.path-bugs'}));
    await check(`${theme}-touch-home-record-indicator`,mobile,async()=>{assert(await mobile.locator('#featuredIssues .featured-issue h3').first().evaluate(el=>getComputedStyle(el).textDecorationLine.includes('underline')),'Homepage record titles must remain visibly linked without hover');return {persistentTitleUnderline:true};});
    await load(mobile,'#issues',theme);
    for(const selector of ['#homeList [data-home-id="HLLV-046"]','[data-home-status="shipped"]'])await check(`${theme}-touch-bug-${selector}`,mobile,()=>touchPresentation(selector));
    await check(`${theme}-touch-bug-record-indicator`,mobile,async()=>{assert(await mobile.locator('#homeList .record-title').first().evaluate(el=>getComputedStyle(el).textDecorationLine.includes('underline')),'Bug record titles must remain visibly linked without hover');return {persistentTitleUnderline:true};});
    await load(mobile,'#HLLV-046',theme);
    await check(`${theme}-touch-detail-tab`,mobile,()=>touchPresentation('#dossier .tabs [data-tab="sources"]'));
    await load(mobile,'#feature/HLLV-F008',theme);
    await check(`${theme}-touch-feature-back`,mobile,()=>touchPresentation('.ft-back',{persistent:true}));
    await load(mobile,'#features',theme);
    await check(`${theme}-touch-content-record-indicator`,mobile,async()=>{assert(await mobile.locator('#featureResults .record-title').first().evaluate(el=>getComputedStyle(el).textDecorationLine.includes('underline')),'Content record titles must remain visibly linked without hover');return {persistentTitleUnderline:true};});
    await load(mobile,'#suggestions',theme);
    for(const selector of ['#communitySubmit','[data-vote]','.cb-row details>summary','.cb-related'])await check(`${theme}-touch-suggestion-${selector}`,mobile,()=>touchPresentation(selector,{minimum44:selector!=='.cb-related',persistent:selector==='.cb-related'}));
    await check(`${theme}-real-touch-navigation`,mobile,async()=>{
      await load(mobile,'',theme);await mobile.locator('.path-bugs').tap();await expect(mobile.locator('#home')).toBeVisible();
      await mobile.locator('#homeList [data-home-id="HLLV-046"]').tap();await expect(mobile.locator('#dossier h1')).toContainText('Spawn choices');
      await mobile.locator('#dossier .tabs [data-tab="sources"]').tap();await expect(mobile.locator('#sources')).toBeVisible();
      await mobile.locator('#sources .evidence-limits>summary').first().tap();await expect(mobile.locator('#sources .evidence-limits').first()).toHaveAttribute('open','');
      await mobile.locator('[data-page="features"]').tap();await mobile.locator('#featureResults .ft-row[href="#feature/HLLV-F008"]').tap();await mobile.locator('.ft-back').tap();await expect(mobile.locator('#featureResults')).toBeVisible();
      await mobile.locator('[data-page="suggestions"]').tap();await mobile.locator('.cb-row details>summary').tap();await expect(mobile.locator('.cb-row details')).toHaveAttribute('open','');
      await mobile.locator('[data-vote]').tap();await expect(mobile.locator('#sgPasswordLogin')).toBeVisible();
      await load(mobile,'#suggestions',theme);await mobile.locator('#communitySubmit').tap();await expect(mobile.locator('#cbLogin')).toBeVisible();
      return {actualTouchTaps:true,publicVoteRequiresSignIn:true,submitRequiresSignIn:true};
    });
  }
  assert.deepEqual(errors,[],'No browser runtime errors');assert.deepEqual(writes,[],'No network writes');assert.deepEqual(external,[],'No unexpected external requests');
  assert(calls.length>0&&calls.every(call=>call.name==='hllv_community'&&['status','board'].includes(call.action)),'Only public suggestion reads are allowed');
  await browser.close();
  assert.deepEqual(failures,[],'Interaction presentation checks failed; see per-browser report and screenshots');
  console.log(`INTERACTION_BROWSER_PASS ${engine}: ${results.length} desktop/touch checks, hover and text stability, focus, selected and disabled states; no writes.`);
})().catch(error=>{console.error(error);process.exit(1);});
