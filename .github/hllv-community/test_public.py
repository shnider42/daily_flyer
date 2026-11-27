"""Hosted anonymous-only checks. No Auth email, credential or successful private write."""
import argparse,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
p=argparse.ArgumentParser();p.add_argument('--url',default='https://hllv-bug-track.onrender.com/');a=p.parse_args()
cfg=json.loads(Path('hllv_tracker/suggestions-config.json').read_text())
def call(action):
 req=Request(cfg['supabase_url']+'/rest/v1/rpc/hllv_community',data=json.dumps({'action':action,'payload':{}}).encode(),headers={'apikey':cfg['publishable_key'],'Content-Type':'application/json'})
 try:
  with urlopen(req,timeout=15) as r:return r.status,json.load(r)
 except HTTPError as e:return e.code,None
code,status=call('status');assert code==200 and status['enabled'] is True and status['approval_mode']=='community',(code,status)
code,board=call('board');assert code==200 and isinstance(board['rows'],list)
for row in board['rows']:
 assert row['state']=='published' and row['approval_label']=='Moderator approved'
 assert not set(row)&{'owner_id','moderator_id','email','submitter_note','request_id','history'}
for action in ['profile','mine','queue','submit','moderate','vote']:
 code,_=call(action);assert code in [401,403],(action,code)
print('HOSTED_PUBLIC_BOUNDARY_PASS: status/public board readable; unverified private reads and writes denied; no authentication changes or data writes')
