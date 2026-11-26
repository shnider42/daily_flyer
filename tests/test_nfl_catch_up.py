from pathlib import Path
from daily_flyer_v2 import build_flyer_html, build_flyer_experience

ROOT=Path(__file__).resolve().parents[1]

def test_registered_product_and_export_match():
    html=build_flyer_html('nfl-catch-up')
    assert html==(ROOT/'nfl_catchup/index.html').read_text()
    assert 'HUDDLE / The whole season, in focus.' in html
    assert 'data-theme="dark"' in html
    assert len(build_flyer_experience('nfl_catch_up').data['scores']['games'])==272
    assert '@@DATA@@' not in html and '@@JS@@' not in html
    assert 'WEEK 12 EDITION' in html
    assert 'value="2026-11-19">Last week' in html
    assert 'value="2026-11-12">Two weeks ago' in html
    assert 'value="2026-10-27">A month ago' in html
    assert 'fmt(s.reviewed_at||D.reviewed_at)' in html
    experience=build_flyer_experience('nfl_catch_up')
    assert experience.data['reviewed_at']=='2026-11-26'

def test_json_cannot_close_script():
    from daily_flyer_v2.renderers.nfl_catch_up import render_nfl_catch_up
    exp=build_flyer_experience('nfl_catch_up')
    exp.data['injection']='</script><script>alert(1)</script>'
    html=render_nfl_catch_up(exp)
    assert '</script><script>alert(1)' not in html
    assert '\\u003c/script>' in html


def test_incomplete_scoring_log_is_identified_without_altering_verified_final():
    experience=build_flyer_experience('nfl_catch_up')
    game=next(g for g in experience.data['scores']['games'] if g['id']=='401873081')
    assert game['away']['score']==39 and game['home']['score']==35
    assert game['scoring_status']=='partial'
    assert game['scoring_plays'][-1]['away']==38
    html=build_flyer_html('nfl_catch_up')
    assert 'Available scoring plays' in html
    assert 'The source play log does not yet match the final score.' in html
