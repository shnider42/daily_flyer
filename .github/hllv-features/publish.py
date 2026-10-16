"""Publish feature/feed assets atomically with existing immutable issue assets."""
from pathlib import Path
import hashlib
import json
import re
import runpy

ROOT = Path('hllv_tracker')
HERE = Path(__file__).parent

def main():
    runpy.run_path(str(HERE/'validate.py'), run_name='__main__')
    markup = (ROOT/'index.html').read_text()
    def asset(source, prefix, suffix):
        raw = source.read_bytes()
        path = prefix + hashlib.sha256(raw).hexdigest()[:16] + suffix
        (ROOT/path).write_bytes(raw)
        return path
    data = asset(ROOT/'data/features.json', 'data/features.', '.json')
    js = asset(HERE/'app.js', 'assets/features-', '.js')
    css = asset(HERE/'features.css', 'assets/features-', '.css')
    feed = asset(HERE.parent/'hllv-ux-20261012/feed.js', 'assets/official-feed-', '.js')
    for tag, attribute, path in [('hllv-features','src',js), ('hllv-features','data-source',data), ('hllv-features-style','href',css), ('hllv-source-feed','src',feed)]:
        markup, count = re.subn(r'(<(?:script|link) id="'+tag+r'"[^>]*'+attribute+r'=")[^"]+', lambda m:m[1]+'./'+path, markup)
        assert count == 1, tag
    (ROOT/'index.html').write_text(markup)
    # Preserve every other subsystem's manifest entries; source files remain editable.
    path = ROOT/'deployment-manifest.json'
    manifest = json.loads(path.read_text())
    old = set(manifest.get('feature_assets', []))
    manifest['files'] = [f for f in manifest['files'] if f not in old and not f.startswith('assets/official-feed-')]
    manifest['feature_data_url'] = data
    manifest['feature_assets'] = [data, js, css]
    manifest['files'] = list(dict.fromkeys(manifest['files']+[data,js,css,feed]))
    path.write_text(json.dumps(manifest, indent=2)+'\n')
    print('FEATURE_ASSETS_PUBLISHED', data, js, css)

if __name__ == '__main__':
    main()
