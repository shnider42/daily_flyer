"""A sourced NFL edition: familiarity and time away are separate controls."""
import json
from pathlib import Path
from daily_flyer_v2.experience import FlyerExperience, FlyerItem

def build(context):
    root=Path(__file__).resolve().parents[1]/'data'
    data=json.loads((root/'nfl_catch_up.json').read_text())
    data['scores']=json.loads((root/'nfl_scores.json').read_text())
    return FlyerExperience(product='nfl_catch_up',layout='nfl_catch_up',title='Back in the Huddle',
        subtitle='Your NFL catch up, at your pace.',date_label=data['reviewed_at'],
        lead=FlyerItem('briefing','Back in the Huddle',data['coverage_note']),
        sections=[],data=data,footer='An independent Daily Flyer Engine project.')
