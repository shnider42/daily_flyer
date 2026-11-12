import base64
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def render_nfl_catch_up(experience):
    template=Path(__file__).with_suffix('.html').read_text()
    static=ROOT/'static/nfl_catch_up'
    fonts=static/'fonts'
    font_css='/* '+(fonts/'OFL.txt').read_text()+' */\n'
    for script in ('Devanagari','Gujarati'):
        for style,weight in (('Regular',400),('Bold',700)):
            encoded=base64.b64encode((fonts/f'NotoSans{script}-{style}.woff').read_bytes()).decode('ascii')
            font_css+=f"@font-face{{font-family:'Noto Sans {script}';font-style:normal;font-weight:{weight};font-display:swap;src:url(data:font/woff;base64,{encoded}) format('woff')}}\n"
    values={'CSS':font_css+(static/'style.css').read_text(), 'CORE':(static/'core.js').read_text(),
            'JS':'\n'.join((static/name).read_text() for name in ('content-de-at.js','locale-hi-in.js','locale-gu-in.js','i18n.js','research.js','app.js')),
            'DATA':json.dumps(experience.data,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')}
    return re.sub(r'@@(CSS|CORE|JS|DATA)@@',lambda m:values[m[1]],template)
