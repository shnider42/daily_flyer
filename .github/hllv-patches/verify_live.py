"""Compare the normal production page and actual snapshot URLs to tested files."""
import json,time,urllib.request
from pathlib import Path

root=Path('hllv_tracker')
manifest=json.loads((root/'deployment-manifest.json').read_text())
paths=['','index.html']+manifest['files']
expected={p:(root/(p.split('?')[0] or 'index.html')).read_bytes() for p in paths}
last='Not checked'
for attempt in range(80):
    try:
        for p in paths:
            with urllib.request.urlopen('https://hllv-bug-track.onrender.com/'+p,timeout=15) as r:
                assert r.status==200
                assert r.read()==expected[p], 'Mismatched public URL: '+(p or '/')
        print('PRODUCTION_EXACT_MATCH',json.dumps(manifest)); break
    except Exception as e:
        last=str(e)
        if attempt%6==0: print('DEPLOYMENT_PENDING',attempt,last,flush=True)
    time.sleep(5)
else: raise RuntimeError(last)
