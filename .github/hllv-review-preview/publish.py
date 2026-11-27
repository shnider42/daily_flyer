"""Publish the isolated review rehearsal without reading or writing live records."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path('hllv_tracker')
HERE = Path(__file__).parent

def main():
    page = (HERE/'preview.html').read_text()
    index = (ROOT/'index.html').read_text()
    shared = {
        'preferences': 'hllv-ux-preferences', 'theme': 'hllv-theme',
        'homepage': 'hllv-homepage-style', 'visual': 'hllv-visual-system',
        'favicon': 'hllv-favicon',
    }
    for name, identifier in shared.items():
        match = re.search(r'<(?:link|script) id="'+identifier+r'"[^>]*>(?:</script>)?',index)
        assert match, identifier
        page = page.replace('{{'+name+'}}',match[0])
    files = []
    for name, filename, extension in [('css','preview.css','css'),('js','preview.js','js'),('data','examples.json','json')]:
        raw = (HERE/filename).read_bytes()
        path = 'assets/review-preview-' + hashlib.sha256(raw).hexdigest()[:16] + '.' + extension
        (ROOT/path).write_bytes(raw)
        page = page.replace('{{'+name+'}}','./'+path)
        files.append(path)
    assert '{{' not in page
    (ROOT/'review-preview.html').write_text(page)
    files += re.findall(r'(?:src|href|srcset)="\./([^"#]+)"',page)
    files = ['review-preview.html'] + list(dict.fromkeys(path for path in files if (ROOT/path).is_file()))
    manifest = {'preview_only':True,'files':{path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in files}}
    (ROOT/'review-preview-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('REVIEW_PREVIEW_PUBLISHED',len(files),'files')

if __name__ == '__main__':
    main()
