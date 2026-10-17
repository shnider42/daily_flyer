"""Publish the homepage stylesheet, preserving every existing module and record."""
from pathlib import Path
import hashlib
import json
import re
import runpy
root = Path('hllv_tracker')
raw = (Path(__file__).parent/'homepage.css').read_bytes()
url = './assets/homepage-' + hashlib.sha256(raw).hexdigest()[:16] + '.css'
(root/url[2:]).write_bytes(raw)
page = root/'index.html'
markup = page.read_text()
tag = '<link id="hllv-homepage-style" rel="stylesheet" href="' + url + '">'
if 'id="hllv-homepage-style"' in markup:
    markup = re.sub(r'<link id="hllv-homepage-style"[^>]+>', lambda _: tag, markup)
else:
    markup = markup.replace('</head>', tag+'\n</head>')
page.write_text(markup)
runpy.run_path('.github/hllv-visual-system/publish.py', run_name='__main__')
runpy.run_path('.github/hllv-evidence/publish_assets.py', run_name='__main__')
# Native picture sources are deployed dependencies too, not only img src URLs.
manifest_path = root/'deployment-manifest.json'
manifest = json.loads(manifest_path.read_text())
picture_sources = re.findall(r'<source[^>]+srcset="\./([^" ,]+)"', markup)
for source in picture_sources:
    assert (root/source).is_file(), source
manifest['files'] = list(dict.fromkeys(manifest['files'] + picture_sources))
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
runpy.run_path('.github/hllv-features/publish.py', run_name='__main__')
print('HOMEPAGE_PUBLISHED', url)
