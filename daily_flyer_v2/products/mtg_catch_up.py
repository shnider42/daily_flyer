"""A reviewed Magic edition; reader choices never manufacture freshness."""
import json
from pathlib import Path
from daily_flyer_v2.experience import FlyerExperience, FlyerItem

DATA_PATH = Path(__file__).resolve().parents[1] / 'data' / 'mtg_catch_up.json'


def build(context):
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    return FlyerExperience(
        product='mtg_catch_up', layout='mtg_catch_up', title='Magic Catch Up',
        subtitle='Your next game starts here.', date_label=data['reviewed_at'],
        lead=FlyerItem('briefing', 'Magic Catch Up', data['coverage_note']),
        sections=[FlyerItem('milestone', s['title'], s['summary'], data={'id': s['id']}) for s in data['stories']],
        data=data, footer='An independent Daily Flyer Engine project.',
    )
