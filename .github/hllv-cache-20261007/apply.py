"""Repair deployment consistency and test the URLs actually used by visitors."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
from urllib.request import urlopen

ROOT=Path('hllv_tracker')
HERE=Path(__file__).parent
raw=(ROOT/'data/issues.json').read_bytes()
# Inspect the mismatch before making any assumptions about its cause.
try:
    with urlopen('https://hllv-bug-track.onrender.com/data/issues.json',timeout=20) as r:
        actual=r.read(); headers={k:r.headers.get(k) for k in ['ETag','Age','Cache-Control','CF-Cache-Status','Last-Modified']}
    parsed=json.loads(actual)
    print('UNVERSIONED_DATA_DIAGNOSTIC',json.dumps({'live_date':parsed.get('generated_at'),'live_count':len(parsed.get('issues',[])),'live_timestamp':parsed.get('page_updated_at'),'matches_bytes':actual==raw,'matches_json':parsed==json.loads(raw),'live_sha256':hashlib.sha256(actual).hexdigest(),'expected_sha256':hashlib.sha256(raw).hexdigest(),'headers':headers}))
except Exception as error: print('UNVERSIONED_DATA_DIAGNOSTIC',type(error).__name__,str(error))
assert json.loads(raw).get('review_release')=='2026-10-07-patch-1.6'
shutil.copyfile(HERE/'publish_assets.py',Path('.github/hllv-evidence/publish_assets.py'))
subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
for path in (Path('.github/hllv-evidence/test_browser.py'),Path('.github/hllv-refresh-20261007/test_refresh.py')):
    text=path.read_text()
    if 'from urllib.parse import urljoin' not in text:
        text='from urllib.parse import urljoin\n'+text if not text.startswith('"""') else text.replace('from __future__ import annotations','from __future__ import annotations\nfrom urllib.parse import urljoin',1)
        # test_refresh starts with a one-line docstring and no future import.
        if 'from urllib.parse import urljoin' not in text:
            lines=text.splitlines(keepends=True); lines.insert(1,'from urllib.parse import urljoin\n'); text=''.join(lines)
    text=text.replace("context.request.get(args.url+'data/issues.json')","context.request.get(urljoin(args.url,page.evaluate('TRACKER_DATA_URL')))")
    text=text.replace("'**/evidence.js*'","'**/evidence*.js*'")
    text=text.replace("'**/data/issues.json'","'**/data/issues*.json'")
    path.write_text(text)
# Both existing authoring pipelines must regenerate AND stage the immutable files.
for file,hook in [('hllv-evidence-context.yml','python3 .github/hllv-evidence/install.py'),('hllv-refresh-20261007.yml','python3 .github/hllv-refresh-20261007/review.py')]:
    path=Path('.github/workflows')/file; text=path.read_text()
    generation='python3 .github/hllv-evidence/publish_assets.py'
    if generation not in text:
        assert hook in text
        text=text.replace(hook,hook+'\n          '+generation,1)
    lines=text.splitlines(keepends=True)
    for n,line in enumerate(lines):
        if line.strip().startswith('git add -- ') and 'hllv_tracker/deployment-manifest.json' not in line:
            lines[n]=line.rstrip()+' hllv_tracker/assets hllv_tracker/data/issues.*.json hllv_tracker/deployment-manifest.json\n'
        if line.strip().startswith('paths=['):
            indent=line[:len(line)-len(line.lstrip())]
            lines[n]=indent+"paths=['','index.html']+__import__('json').loads(Path('hllv_tracker/deployment-manifest.json').read_text())['files']\n"
    text=''.join(lines)
    text=text.replace('20 Node tests; every one of 66 issue views and 136 source rows','Source-role tests and all current issue/source views')
    path.write_text(text)
doc=ROOT/'README.md';text=doc.read_text()
section='\n## Consistent static snapshots\n\nThe editable source remains `data/issues.json`. Published pages fetch a content-addressed `data/issues.<hash>.json`, and load a content-addressed evidence module. This prevents the new page from accidentally combining with an older cached data file or script. The deployment manifest records the actual application URLs. Tests exercise those exact URLs from the ordinary homepage, without test-only random cache-busting. Run `.github/hllv-evidence/publish_assets.py` after deliberate data or evidence-module changes; both authoring workflows include this step. Old immutable snapshots are retained so already-open pages remain functional.\n'
if '## Consistent static snapshots' not in text: doc.write_text(text+section)
assert (ROOT/'data/issues.json').read_bytes()==raw,'Cache repair must not refresh the evidence date or timestamp'
print('CACHE_FIX_READY: evidence data and publication timestamp unchanged')
