"""Additional actual-Postgres boundary checks after the isolated database suite."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path('suggestion_box/tests').resolve()))
from test_database import PilotTests,call,admin,Jsonb,PAYLOAD,A,B,M,R
check=PilotTests()
check.setUp();check.open_intake();sid=check.submit();check.shortlist(sid)
admin("UPDATE hllv_private.members SET authorized_until=now()-interval '1 second' WHERE role='reviewer'")
check.denied(R,'hllv_profile');check.denied(R,'hllv_queue')
print('BOUNDARY_PASS expired reviewer cannot read the private shortlist or access reviewer profile')
check.setUp();check.open_intake();sid=check.submit();check.shortlist(sid)
admin("UPDATE hllv_private.members SET authorization_reference=NULL WHERE role='reviewer'")
check.denied(R,'hllv_profile');check.denied(R,'hllv_queue')
print('BOUNDARY_PASS reviewer with removed authorization evidence loses private review access')
check.setUp();sid=check.make_public()
check.denied(A,'hllv_edit',(sid,None,Jsonb(PAYLOAD)))
check.denied(M,'hllv_moderate',(sid,None,'pending','',None))
check.denied(R,'hllv_review',(sid,None,'cleared','no_commitment','','PRIVATE-NULL-VERSION-FIXTURE'))
check.denied(B,'hllv_vote',(sid,None,True))
print('BOUNDARY_PASS null version cannot bypass any exact-wording guard')
check.setUp();sid=check.make_public()
admin('UPDATE hllv_private.settings SET voting_until=NULL')
check.denied(B,'hllv_vote',(sid,1,True))
print('BOUNDARY_PASS missing voting deadline closes voting rather than enabling an indefinite window')
