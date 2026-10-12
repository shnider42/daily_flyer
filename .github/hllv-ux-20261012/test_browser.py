"""Existing community UI coverage plus dynamic-type, dark/light, and date-order tests."""
from pathlib import Path
source=Path('.github/hllv-community/test_browser.py').read_text()
source=source.replace("  ctx.route('https://cdn.jsdelivr.net/**'", "  ctx.route('**/official-feed.json',lambda r:r.fulfill(json={'schema_version':1,'last_success_at':'2026-10-12T12:00:00Z','state':'ok','items':[{'id':'123','title':'Synthetic official update','url':'https://steamcommunity.com/games/3079210/announcements/detail/123','published_at':'2026-10-09T12:00:00Z','category':'Developer announcement','candidate_issue_ids':['HLLV-003'],'excerpt':''}],'link_checks':{}}))\n  ctx.route('https://cdn.jsdelivr.net/**'")
checks='''
 theme,_,_,_,terr,_=context();tp=theme.new_page();tp.goto(BASE,wait_until='networkidle')
 expect(tp.locator('#sourceSyncStatus')).to_contain_text('not a fresh review');expect(tp.locator('#officialSourceList')).to_contain_text('Synthetic official update')
 expect(tp.locator('html')).to_have_attribute('data-theme','dark');tp.locator('#themeToggle').click();expect(tp.locator('html')).to_have_attribute('data-theme','light');tp.reload(wait_until='networkidle');expect(tp.locator('html')).to_have_attribute('data-theme','light');tp.locator('#themeToggle').click()
 tp.goto(BASE+'#HLLV-003',wait_until='networkidle');tp.locator('.tabs [data-tab="timeline"]').click()
 expect(tp.locator('[data-date-order="history"]')).to_have_value('newest');before=tp.locator('.event h3').all_text_contents();tp.select_option('[data-date-order="history"]','oldest');after=tp.locator('.event h3').all_text_contents();assert before!=after
 tp.locator('.tabs [data-tab="sources"]').click();expect(tp.locator('[data-date-order="sources"]')).to_have_value('newest')
 dates=tp.locator('.evidence-source .evidence-byline time').evaluate_all('(nodes)=>nodes.map(n=>n.dateTime)');assert dates==sorted(dates,reverse=True),dates
 tp.select_option('[data-date-order="sources"]','oldest');dates=tp.locator('.evidence-source .evidence-byline time').evaluate_all('(nodes)=>nodes.map(n=>n.dateTime)');assert dates==sorted(dates)
 new,uid,nmail,ncalls,nerr,nflags=context(identity='type-author');np=new.new_page();login(np,nmail);form(np)
 expect(np.locator('#cbProblemLabel')).to_have_text('What inspired this idea?')
 order=np.locator('#cbSubmitForm input:not([type="checkbox"]),#cbSubmitForm select,#cbSubmitForm textarea').evaluate_all('(nodes)=>nodes.map(n=>n.id)');assert order[:5]==['cbTitle','cbKind','cbIssue','cbProblem','cbOutcome'],order
 old=np.locator('#cbProblem').input_value();np.select_option('#cbKind','problem_report');expect(np.locator('#cbOutcomeLabel')).to_have_text('What did you expect to happen?');assert np.locator('#cbProblem').input_value()==old;assert not np.locator('#cbIssue').evaluate('(x)=>x.required')
 np.select_option('#cbKind','bug_priority');assert np.locator('#cbIssue').evaluate('(x)=>x.required');expect(np.locator('#cbTypeHelp')).to_contain_text('existing issue')
 np.select_option('#cbKind','problem_report');np.fill('#cbTitle','Unexpected voice failure report');np.fill('#cbProblem','On PC the voice channel stops after switching servers. This is an observation, not a diagnosis.');np.fill('#cbOutcome','Voice communication remains available after joining another server.');np.locator('#cbConsent').check();np.locator('#cbSend').click();expect(np.locator('.cb-receipt')).to_contain_text('Your problem report is saved');assert any(c.get('payload',{}).get('payload',{}).get('kind')=='problem_report' for c in ncalls)
 np.locator('#cbReceiptMine').click();np.locator('.cb-entry').click();expect(np.locator('.cb-detail')).to_contain_text('Expected behavior');np.locator('#cbEdit').click();expect(np.locator('#cbKind')).to_have_value('problem_report');expect(np.locator('#cbOutcomeLabel')).to_have_text('What did you expect to happen?')
 for width in [320,390,768,1280]:
  np.set_viewport_size({'width':width,'height':844});assert np.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
  bg=np.locator('#cbProblem').evaluate('(x)=>getComputedStyle(x).backgroundColor');assert bg=='rgb(32, 38, 42)',bg
 np.set_viewport_size({'width':390,'height':844});np.screenshot(path='artifacts/dark-problem-form-'+a.engine+'.png',full_page=True)
 tp.set_viewport_size({'width':390,'height':844});tp.screenshot(path='artifacts/dark-sources-'+a.engine+'.png',full_page=True)
 tp.goto(BASE+'#patch-notes',wait_until='networkidle');tp.select_option('[data-date-order="patches"]','oldest');dates=tp.locator('.patch-entry time').evaluate_all('(nodes)=>nodes.map(n=>n.dateTime)');assert dates==sorted(dates);tp.select_option('[data-date-order="patches"]','newest');dates=tp.locator('.patch-entry time').evaluate_all('(nodes)=>nodes.map(n=>n.dateTime)');assert dates==sorted(dates,reverse=True)
 assert not terr+nerr,terr+nerr
 print('UX_BROWSER_PASS',a.engine,'types/drafts/field order, problem report receipt, default dark and saved light choice, source/history/patch sort, mobile')
'''
source=source.replace(' browser.close()',checks+'\n browser.close()')
exec(compile(source,'.github/hllv-community/test_browser.py','exec'),{'__name__':'__main__'})
