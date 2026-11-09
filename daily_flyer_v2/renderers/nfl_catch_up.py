import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def render_nfl_catch_up(experience):
    template=Path(__file__).with_suffix('.html').read_text()
    static=ROOT/'static/nfl_catch_up'
    values={'CSS':(static/'style.css').read_text(), 'CORE':(static/'core.js').read_text(),
            'JS':'\n'.join((static/name).read_text() for name in ('content-de-at.js','i18n.js','research.js','app.js')),
            'DATA':json.dumps(experience.data,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')}
    return re.sub(r'@@(CSS|CORE|JS|DATA)@@',lambda m:values[m[1]],template)
