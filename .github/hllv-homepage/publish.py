"""Publish the homepage stylesheet, preserving every existing module and record."""
from pathlib import Path
import hashlib
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
runpy.run_path('.github/hllv-evidence/publish_assets.py', run_name='__main__')
runpy.run_path('.github/hllv-features/publish.py', run_name='__main__')
print('HOMEPAGE_PUBLISHED', url)
