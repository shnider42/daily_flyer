"""Compare ordinary live URLs with the exact published files, without cache-busting."""
import json,time
from pathlib import Path
from urllib.request import urlopen
root=Path('hllv_tracker');paths=['','index.html','suggestions-config.json']+json.loads((root/'deployment-manifest.json').read_text())['files']
last='Not checked'
for attempt in range(120):
    try:
        for path in dict.fromkeys(paths):
            with urlopen('https://hllv-bug-track.onrender.com/'+path,timeout=15) as r:actual=r.read()
            assert actual==(root/(path.split('?')[0] or 'index.html')).read_bytes(),'Mismatch: '+(path or '/')
        print('PRODUCTION_EXACT_MATCH');break
    except Exception as e:
        last=str(e)
        if attempt%12==0:print(last)
    time.sleep(5)
else:raise RuntimeError(last)
