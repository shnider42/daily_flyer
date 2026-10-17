"""Publish the shared UI stylesheet and favicon links without touching records."""
from pathlib import Path
import hashlib
import re

ROOT = Path('hllv_tracker')
HERE = Path(__file__).parent

def main():
    raw = b'\n'.join((HERE/name).read_bytes() for name in ['shared.css', 'suggestions.css'])
    url = './assets/visual-system-' + hashlib.sha256(raw).hexdigest()[:16] + '.css'
    (ROOT/url[2:]).write_bytes(raw)
    page = ROOT/'index.html'
    markup = page.read_text()
    tags = {
        'hllv-visual-system': '<link id="hllv-visual-system" rel="stylesheet" href="'+url+'">',
        'hllv-favicon-fallback': '<link id="hllv-favicon-fallback" rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48" href="./assets/infierno-favicon.ico">',
        'hllv-favicon': '<link id="hllv-favicon" rel="icon" type="image/svg+xml" href="./assets/infierno-favicon.svg">',
        'hllv-apple-touch-icon': '<link id="hllv-apple-touch-icon" rel="apple-touch-icon" sizes="180x180" href="./assets/infierno-apple-touch-icon.png">',
    }
    for identifier, tag in tags.items():
        if 'id="'+identifier+'"' in markup:
            markup = re.sub(r'<link id="'+identifier+r'"[^>]+>', lambda _:tag, markup)
        else:
            markup = markup.replace('</head>',tag+'\n</head>')
    page.write_text(markup)
    print('VISUAL_SYSTEM_PUBLISHED',url)

if __name__ == '__main__':
    main()
