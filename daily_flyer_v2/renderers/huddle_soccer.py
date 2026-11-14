"""Build a self-contained soccer page within the existing HUDDLE static site."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def render_huddle_soccer(experience):
    template = Path(__file__).with_suffix('.html').read_text(encoding='utf-8')
    static = ROOT / 'static/huddle_soccer'
    shared = ROOT / 'static/nfl_catch_up'
    values = {
        'CSS': '\n'.join(path.read_text(encoding='utf-8') for path in (shared / 'style.css', shared / 'sports.css', static / 'style.css')),
        'SPORT': (shared / 'sports.js').read_text(encoding='utf-8'),
        'CORE': (static / 'core.js').read_text(encoding='utf-8'),
        'JS': '\n'.join((static / name).read_text(encoding='utf-8') for name in ('research.js', 'app.js')),
        'DATA': json.dumps(experience.data, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'),
    }
    return re.sub(r'@@(CSS|SPORT|CORE|JS|DATA)@@', lambda match: values[match[1]], template)
