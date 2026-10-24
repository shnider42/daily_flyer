"""Check public quota metadata; no real accounts or successful writes."""
import json
from pathlib import Path
from urllib.request import Request,urlopen
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text())
req=Request(cfg['supabase_url']+'/rest/v1/rpc/hllv_community',data=b'{"action":"status","payload":{}}',headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json'})
with urlopen(req,timeout=20) as r:status=json.load(r)
assert status['moderator_submission_limit_exempt'] is True and status['daily_submission_limit']==3,status
print('HOSTED_QUOTA_METADATA_PASS: moderator exemption and participant quota deployed')
