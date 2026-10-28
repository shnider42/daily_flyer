"""Self-contained, readable without JavaScript, identical in Flask and export."""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def render_mtg_catch_up(experience):
    data = experience.data
    payload = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    sources = {s['id']: s for s in data['sources']}
    fallback = []
    for item in sorted(data['stories'], key=lambda s: s['priority'])[:3]:
        source = sources[item['source_ids'][0]]
        fallback.append('<article class="fallback-story"><p class="eyebrow">' + html.escape(item['date']) + ' · ' + html.escape(item['date_kind']) + '</p><h3>' + html.escape(item['title']) + '</h3><p>' + html.escape(item['summary']) + '</p><p>' + html.escape(item['after']) + '</p><a href="' + html.escape(source['url'], quote=True) + '" target="_blank" rel="noopener noreferrer">Official source ↗</a></article>')
    slots = {
        '@@CSS@@': (ROOT / 'static/mtg_catch_up/style.css').read_text(encoding='utf-8'),
        '@@JS@@': (ROOT / 'static/mtg_catch_up/app.js').read_text(encoding='utf-8'),
        '@@DATA@@': payload,
        '@@FALLBACK@@': ''.join(fallback),
        '@@REVIEWED@@': html.escape(data['reviewed_at']),
    }
    return re.sub(r'@@(?:CSS|JS|DATA|FALLBACK|REVIEWED)@@', lambda m: slots[m.group()], Path(__file__).with_suffix('.html').read_text(encoding='utf-8'))
