"""Publish content-addressed data/JS for the static tracker, without altering evidence.
A new page references the exact saved snapshot it was built against. Old pages
can still use their old immutable assets. Run after each deliberate data/UI edit.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT=Path('hllv_tracker')

def main():
    data=(ROOT/'data/issues.json').read_bytes()
    js=(ROOT/'evidence.js').read_bytes()
    data_name='data/issues.'+hashlib.sha256(data).hexdigest()[:16]+'.json'
    js_name='assets/evidence-'+hashlib.sha256(js).hexdigest()[:16]+'.js'
    (ROOT/'assets').mkdir(exist_ok=True)
    (ROOT/data_name).write_bytes(data)
    (ROOT/js_name).write_bytes(js)
    page=ROOT/'index.html'; markup=page.read_text()
    declaration='    const TRACKER_DATA_URL = '+json.dumps('./'+data_name)+';'
    if 'const TRACKER_DATA_URL =' in markup:
        markup,n=re.subn(r'    const TRACKER_DATA_URL = [^;]+;',lambda _:declaration,markup,count=1)
        assert n==1
    else:
        assert markup.count('    let dataset,selectedId')==1
        markup=markup.replace('    let dataset,selectedId',declaration+'\n    let dataset,selectedId',1)
        old="fetch('./data/issues.json',{cache:'no-cache'})"
        assert markup.count(old)==1
        markup=markup.replace(old,"fetch(TRACKER_DATA_URL,{cache:'no-cache'})",1)
    markup,n=re.subn(r'src="\./(?:assets/)?evidence(?:-[0-9a-f]+)?\.js(?:\?[^\"]*)?"','src="./'+js_name+'"',markup,count=1)
    assert n==1,'Evidence module script tag not found'
    assert "fetch('./data/issues.json'" not in markup
    page.write_text(markup,encoding='utf-8')
    manifest={'data_url':data_name,'data_sha256':hashlib.sha256(data).hexdigest(),'evidence_js_url':js_name,'files':[data_name,js_name,'evidence.css?v=1','freshness.js?v=20261007','freshness.css?v=20261007'],'note':'These are the actual production URLs embedded in the page, not random test cache-busters. data/issues.json remains the editable source file.'}
    (ROOT/'deployment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    assert (ROOT/'data/issues.json').read_bytes()==data
    print('CONTENT_ADDRESSED_PUBLISH',json.dumps(manifest))

if __name__=='__main__': main()
