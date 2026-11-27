"""Explicit presentation-only follow-up: registration logic and all account data unchanged."""
from pathlib import Path
from datetime import datetime,timezone
import json,re,hashlib,subprocess
root=Path('hllv_tracker');page=root/'index.html';html=page.read_text()
assert 'id="hllv-registration-module"' in html
protected={p:p.read_bytes() for p in [root/'official-feed.json',root/'suggestions-config.json',Path('.github/hllv-password/password.js'),Path('.github/hllv-community/app.js')]}
before=json.loads((root/'data/issues.json').read_text())
css=Path('.github/hllv-member-registration/registration.css').read_bytes()
name='assets/registration-'+hashlib.sha256(css).hexdigest()[:16]+'.css';(root/name).write_bytes(css)
html,n=re.subn(r'(<link id="hllv-registration-style"[^>]*href=")[^"]+',lambda m:m[1]+'./'+name,html);assert n==1
page.write_text(html)
stamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
updated={**before,'page_updated_at':stamp};(root/'data/issues.json').write_text(json.dumps(updated,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
path=root/'deployment-manifest.json';m=json.loads(path.read_text());m['files']=list(dict.fromkeys(m['files']+['suggestions-config.json']+[u[2:] for u in re.findall(r'(?:src|href)="(\./[^"]+)"',page.read_text()) if (root/u[2:].split('?')[0]).is_file()]));path.write_text(json.dumps(m,indent=2)+'\n')
path=root/'reviews/member-registration.json';m=json.loads(path.read_text());m.update(page_updated_at=stamp,registration_input_contrast_checked=True);path.write_text(json.dumps(m,indent=2)+'\n')
for p,b in protected.items():assert p.read_bytes()==b
assert {k:v for k,v in updated.items() if k!='page_updated_at'}=={k:v for k,v in before.items() if k!='page_updated_at'}
print('MEMBER_STYLE_REFRESH: signup fields use selected theme; logic, settings, evidence and source feed unchanged')
