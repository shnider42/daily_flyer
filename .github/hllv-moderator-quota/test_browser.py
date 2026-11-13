"""Run existing synthetic browser journeys plus role-aware form-copy coverage."""
from pathlib import Path
source=Path('.github/hllv-community/test_browser.py').read_text()
old="data={'role':role,'can_moderate':role=='moderator'}"
assert source.count(old)==1
source=source.replace(old,"data={'role':role,'can_moderate':role=='moderator','daily_submission_limit':None if role=='moderator' else 3}")
checks='''
 for role in ['participant','reviewer','moderator']:
  qc,_,qe,_,qerrors,_=context(role=role,identity='quota-'+role)
  qp=qc.new_page();login(qp,qe);form(qp)
  for kind in ['suggestion','problem_report','bug_priority']:
   qp.select_option('#cbKind',kind)
   expected='Moderator account: no daily submission limit.' if role=='moderator' else 'Up to three new submissions per account in 24 hours.'
   expect(qp.locator('#cbSubmitForm')).to_contain_text(expected)
   if role=='moderator':expect(qp.locator('#cbSubmitForm')).not_to_contain_text('Up to three')
  qp.set_viewport_size({'width':390,'height':844})
  assert qp.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
  assert not qerrors,qerrors
  qc.close()
 print('MODERATOR_QUOTA_UI_PASS',a.engine,'all three submission types; moderator/nonmoderator copy; unchanged vote and account flows; synthetic accounts only')
'''
assert source.count(' browser.close()')==1
source=source.replace(' browser.close()',checks+'\n browser.close()')
exec(compile(source,'.github/hllv-community/test_browser.py','exec'),{'__name__':'__main__'})
