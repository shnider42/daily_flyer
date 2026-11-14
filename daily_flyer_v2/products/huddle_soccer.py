"""HUDDLE's Brazilian Portuguese association-football edition."""
import json
from pathlib import Path
from daily_flyer_v2.experience import FlyerExperience, FlyerItem


def build(context):
    data = json.loads((Path(__file__).resolve().parents[1] / 'data/huddle_soccer.json').read_text(encoding='utf-8'))
    return FlyerExperience(product='huddle_soccer', layout='huddle_soccer', title='HUDDLE / Futebol',
        subtitle='Premier League em português do Brasil.', date_label=data['as_of'],
        lead=FlyerItem('briefing', 'Fique por dentro', data['coverage_note']),
        sections=[], data=data, footer='Uma experiência independente Daily Flyer.')
