"""Publication, integration, and safe fallback checks for Magic Catch Up."""
import copy
import json
from datetime import date
from pathlib import Path
from bs4 import BeautifulSoup
from daily_flyer_v2.engine import build_flyer_experience, build_flyer_html
from daily_flyer_v2.products.mtg_catch_up import DATA_PATH
from daily_flyer_v2.renderers.mtg_catch_up import render_mtg_catch_up
from web import app

ROOT = Path(__file__).resolve().parents[1]


def test_evidence_dates_and_scope_are_consistent():
    data = json.loads(DATA_PATH.read_text())
    sources = {s['id']: s for s in data['sources']}
    terms = {t['id'] for t in data['glossary']}
    assert len(sources) == len(data['sources'])
    assert len({s['id'] for s in data['stories']}) == len(data['stories'])
    assert data['coverage_from'] == min(s['date'] for s in data['stories'])
    assert data['coverage_through'] == max(s['date'] for s in data['stories'])
    for s in data['sources']:
        assert s['checked_at'] == data['reviewed_at']
        assert s['published_at'] is None or s['published_at'] <= s['checked_at']
    for s in data['stories']:
        assert s['source_ids'] and set(s['source_ids']) <= sources.keys()
        assert set(s['terms']) <= terms
        assert date.fromisoformat(s['date']) <= date.fromisoformat(data['reviewed_at'])
        if s['status'] == 'Upcoming':
            assert s['effective_on'] > data['reviewed_at']
        for key in ['title','summary','before','after','context','meaning','date_kind']:
            assert s[key].strip()


def test_flask_export_and_fallback():
    page = build_flyer_html('mtg-catch-up')
    response = app.test_client().get('/v2?product=mtg-catch-up')
    assert response.status_code == 200
    assert response.get_data(as_text=True) == page
    assert (ROOT / 'mtg_catchup/index.html').read_text() == page
    soup = BeautifulSoup(page, 'html.parser')
    assert len(soup.select('#fallback article')) == 3
    assert len(soup.select('#fallback article a')) == 3
    assert soup.select_one('#controls').has_attr('hidden')
    assert not soup.select('script[src]')
    assert all(img.get('alt') is not None for img in soup.select('img'))
    assert soup.select_one('#art-credits')
    assert '@@' not in page
    assert len(json.loads(soup.select_one('#mtg-data').string)['stories']) == 16


def test_selected_date_does_not_make_edition_appear_fresh():
    earlier = build_flyer_experience('mtg_catch_up', '2020-01-01')
    later = build_flyer_experience('mtg_catch_up', '2030-01-01')
    assert earlier.data == later.data
    assert earlier.date_label == later.date_label == '2026-10-27'


def test_embedded_content_and_fallback_are_escaped():
    exp = copy.deepcopy(build_flyer_experience('mtg_catch_up'))
    attack = '</script><script>alert(1)</script>@@CSS@@'
    for story in exp.data['stories']:
        story['title'] = attack
    soup = BeautifulSoup(render_mtg_catch_up(exp), 'html.parser')
    assert len(soup.select('script')) == 3
    assert json.loads(soup.select_one('#mtg-data').string)['stories'][0]['title'] == attack
    assert not soup.select('#fallback script')


def test_existing_rlcs_export_is_unchanged():
    assert build_flyer_html('rlcs_catch_up') == (ROOT / 'rlcs_catchup/index.html').read_text()
