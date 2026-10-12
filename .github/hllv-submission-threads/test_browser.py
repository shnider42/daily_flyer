"""Live UI with synthetic account/data responses; no real requests or private content."""
from pathlib import Path
s=Path('.github/hllv-community/test_browser.py').read_text()
checks='''
 login(page,email);form(page,'Thread and public comments browser test');send(page);sid=next(reversed(store))
 page.locator('#cbReceiptThread').click();expect(page.locator('#threadChecked')).to_contain_text('Checked')
 mp.locator('[data-cb-view="queue"]').click();mp.locator('[data-open="'+sid+'"]').click();expect(mp.locator('#threadChecked')).to_contain_text('Checked')
 mp.fill('#cbModNote','PRIVATE-QUESTION-Please provide your platform.');mp.locator('#cbClarify').click();expect(mp.locator('.cb-receipt')).to_be_visible()
 page.locator('#threadRefresh').click();expect(page.locator('#threadEntries')).to_contain_text('PRIVATE-QUESTION');page.fill('#threadReply','PRIVATE-ANSWER-I reproduced this on PC.');page.locator('#threadSend').click();expect(page.locator('#threadFeedback')).to_contain_text('Private reply saved');expect(page.locator('#threadReply')).to_have_value('');expect(page.locator('.cb-detail>.cb-tag')).to_contain_text('Awaiting moderator')
 mp.locator('#cbReceiptThread').click();expect(mp.locator('#threadEntries')).to_contain_text('PRIVATE-ANSWER');mp.once('dialog',lambda d:d.accept());mp.locator('#cbApprove').click();expect(mp.locator('.cb-receipt')).to_contain_text('Approved and published');mp.locator('#cbReceiptThread').click();expect(mp.locator('#threadChecked')).to_contain_text('Checked')
 pub.reload(wait_until='networkidle');assert 'PRIVATE-QUESTION' not in pub.inner_text('body') and 'PRIVATE-ANSWER' not in pub.inner_text('body')
 mp.locator('.thread-public-compose>summary').click();mp.fill('#threadPublicBody','Public explanation: useful report, awaiting wider reproduction. <img src=x onerror=alert(1)>');mp.locator('#threadPublicConsent').check();mp.once('dialog',lambda d:d.accept());mp.locator('#threadPublicSend').click();expect(mp.locator('#threadFeedback')).to_contain_text('Public moderator comment posted')
 pub.reload(wait_until='networkidle');entry=pub.locator('[data-board-id="'+sid+'"]');expect(entry.locator('.thread-public-summary')).to_contain_text('Public explanation');expect(entry.locator('.thread-public-summary img')).to_have_count(0)
 assert 'PRIVATE-QUESTION' not in entry.inner_text() and 'PRIVATE-ANSWER' not in entry.inner_text()
 flags['lose_reply']=True;page.fill('#threadReply','PRIVATE-LOST-RESPONSE');page.locator('#threadSend').click();expect(page.locator('#threadCheck')).to_be_visible();expect(page.locator('#threadReply')).to_have_value('PRIVATE-LOST-RESPONSE');before=len(threads[sid]);page.locator('#threadCheck').click();expect(page.locator('#threadFeedback')).to_contain_text('No duplicate');assert len(threads[sid])==before
 expect(page.locator('#threadReply')).to_have_value('');page.locator('#threadOrder').select_option('oldest');expect(page.locator('#threadEntries .thread-message').first).to_contain_text('PRIVATE-QUESTION')
 mp.locator('#threadRefresh').click();expect(mp.locator('#threadEntries')).to_contain_text('PRIVATE-LOST-RESPONSE')
 for theme in ['dark','light']:
  mp.evaluate("document.documentElement.dataset.theme='"+theme+"'");mp.set_viewport_size({'width':390,'height':844});assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
  mp.locator('#submissionThread').screenshot(path='artifacts/conversation-'+theme+'-'+a.engine+'.png')
  pub.evaluate("document.documentElement.dataset.theme='"+theme+"'");pub.set_viewport_size({'width':390,'height':844});assert pub.evaluate('document.documentElement.scrollWidth<=innerWidth+2');entry.screenshot(path='artifacts/public-comment-'+theme+'-'+a.engine+'.png')
 mp.once('dialog',lambda d:d.accept());mp.locator('[data-hide-comment]').first.click();expect(mp.locator('#threadEntries')).to_contain_text('Hidden public comment')
 pub.reload(wait_until='networkidle');assert 'Public explanation' not in pub.inner_text('body')
 mp.locator('[data-cb-view="board"]').click();mp.locator('[data-board-thread="'+sid+'"]').click();expect(mp.locator('#threadEntries')).to_contain_text('PRIVATE-QUESTION')
 mp.fill('#threadReply','Unsaved private text');mp.locator('#globalSignOut').click();expect(mp.locator('#hllvAccountBar')).to_contain_text('Not signed in');assert 'PRIVATE-QUESTION' not in mp.inner_text('body');assert mp.locator('#threadReply').count()==0
 assert not errs+merrs+perrs,errs+merrs+perrs
 print('THREAD_BROWSER_PASS',a.engine,'private back-and-forth, preserved decision replies, public explicit consent, no private publication, safe markup, lost-response recovery, date order, mobile dark/light, public hide and signout')
'''
s=s.replace(' browser.close()',checks+'\n browser.close()')
exec(compile(s,'<thread-browser-fixture>','exec'))
