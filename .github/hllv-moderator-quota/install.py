"""Publish role-aware quota text without touching account modules or evidence claims."""
import hashlib,json,re,subprocess
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path('hllv_tracker')

def main():
    page=ROOT/'index.html';markup=page.read_text()
    original=json.loads((ROOT/'data/issues.json').read_text())
    protected={p:(ROOT/p).read_bytes() for p in ['suggestions-config.json','official-feed.json','evidence.js']}
    for url in re.findall(r'<script id="hllv-(?:session|password)-module"[^>]*src="([^"]+)"',markup):
        p=url.removeprefix('./');protected[p]=(ROOT/p).read_bytes()
    app=Path('.github/hllv-community/app.js');source=app.read_text()
    old="'Up to three new suggestions per account in 24 hours.'"
    new="(profile?.role==='moderator'&&profile.daily_submission_limit===null?'Moderator account: no daily submission limit.':'Up to three new submissions per account in 24 hours.')"
    if new not in source:
        assert source.count(old)==1,'Submission quota copy changed'
        source=source.replace(old,new,1);app.write_text(source)
    content=source.encode();asset='assets/community-'+hashlib.sha256(content).hexdigest()[:16]+'.js'
    (ROOT/asset).write_bytes(content)
    markup,n=re.subn(r'(<script id="suggestions-module"[^>]*src=")[^"]+',lambda m:m[1]+'./'+asset,markup);assert n==1
    page.write_text(markup)
    original['page_updated_at']=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    (ROOT/'data/issues.json').write_text(json.dumps(original,ensure_ascii=False,indent=2)+'\n')
    subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    manifest=json.loads((ROOT/'deployment-manifest.json').read_text())
    urls=[v.removeprefix('./') for v in re.findall(r'(?:href|src)="(\./[^"]+)"',page.read_text()) if (ROOT/v.split('?')[0].removeprefix('./')).is_file()]
    manifest['files']=list(dict.fromkeys(manifest['files']+['suggestions-config.json']+urls))
    (ROOT/'deployment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for p,value in protected.items():assert (ROOT/p).read_bytes()==value,p
    (ROOT/'reviews/moderator-submission-quota.json').write_text(json.dumps({'page_updated_at':original['page_updated_at'],'moderator_daily_limit':None,'other_accounts_limit_per_24_hours':3,'all_community_submission_types':True,'one_vote_per_account_per_wording_unchanged':True,'authentication_and_request_throttle_unchanged':True,'nightly_and_reviewed_evidence_unchanged':True},indent=2)+'\n')
    print('QUOTA_UI_READY',asset)
if __name__=='__main__':main()
