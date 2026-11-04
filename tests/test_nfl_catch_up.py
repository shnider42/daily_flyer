from pathlib import Path
from daily_flyer_v2 import build_flyer_html, build_flyer_experience

ROOT=Path(__file__).resolve().parents[1]

def test_registered_product_and_export_match():
    html=build_flyer_html('nfl-catch-up')
    assert html==(ROOT/'nfl_catchup/index.html').read_text()
    assert 'Back in the Huddle' in html
    assert '@@DATA@@' not in html and '@@JS@@' not in html
    experience=build_flyer_experience('nfl_catch_up')
    assert experience.data['reviewed_at']=='2026-11-04'

def test_json_cannot_close_script():
    from daily_flyer_v2.renderers.nfl_catch_up import render_nfl_catch_up
    exp=build_flyer_experience('nfl_catch_up')
    exp.data['injection']='</script><script>alert(1)</script>'
    html=render_nfl_catch_up(exp)
    assert '</script><script>alert(1)' not in html
    assert '\\u003c/script>' in html
