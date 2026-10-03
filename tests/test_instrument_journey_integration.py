"""Full-repository checks. Requires the normal Daily Flyer dependencies.

These intentionally import the actual v17 ancestor chain and Flask application.
They were not executed in the restricted preview environment, which lacks Flask.
"""
from __future__ import annotations
import json
import re

import pytest

pytest.importorskip('flask', reason='Full Daily Flyer integration requires Flask')
from daily_flyer.themes import garage_journey_v17 as previous
from daily_flyer.themes import garage_journey_v18 as updated
from daily_flyer.themes.journey_mode import mode_bar
from web import app


def test_real_v17_payload_is_preserved():
    before = previous.build_theme_page('2026-10-02', 0)
    after = updated.build_theme_page('2026-10-02', 0)
    assert after.cards[0].body == mode_bar('cars') + before.cards[0].body
    assert after.metadata['extra_js'] == before.metadata['extra_js']
    assert after.metadata['extra_css'].startswith(before.metadata['extra_css'])
    assert after.cards[1:] == before.cards[1:]
    assert (after.page_title, after.header_title, after.header_subtitle, after.footer_text) == (
        before.page_title, before.header_title, before.header_subtitle, before.footer_text)
    payload = re.search(r'<script id="gj-data" type="application/json">(.*?)</script>', after.cards[0].body)
    assert payload is not None
    vehicles = json.loads(payload.group(1))
    assert vehicles == previous.VEHICLES
    assert len({item['key'] for item in vehicles}) == 7


@pytest.mark.parametrize('alias', ['garage', 'garage_journey', 'e46_owner_companion'])
def test_car_aliases_have_switch_and_z06(alias):
    response = app.test_client().get('/?theme=' + alias + '&date=2026-10-02&seed=0')
    assert response.status_code == 200
    assert b'aria-label="Journey mode"' in response.data
    assert b'corvette_c8_z06_2024' in response.data


@pytest.mark.parametrize('alias', ['guitars', 'instruments', 'instrument_journey'])
def test_guitar_routes_render_complete_catalog(alias):
    response = app.test_client().get('/?theme=' + alias + '&date=2026-10-02&seed=0')
    assert response.status_code == 200
    assert b'ij-catalog' in response.data
    assert b'player-mexico' in response.data
    assert b'american-pro-ii' in response.data
    assert b'les-paul-1959' in response.data
    assert b'multiac-encore' in response.data
    assert b'sonic-ht-h' in response.data
    assert b'gj-data' not in response.data


@pytest.mark.parametrize('alias', [
    'e46_workshop', 'porsche_gt4_workshop', 'mustang_gt_workshop',
    'focus_st_workshop', 'corvette_c4_workshop', 'nissan_z_workshop',
    'corvette_z06_workshop',
])
def test_existing_vehicle_workshops_render(alias):
    assert app.test_client().get('/?theme=' + alias).status_code == 200


def test_explicit_v17_remains_an_untouched_escape_hatch():
    response = app.test_client().get('/?theme=garage_journey_v17')
    assert response.status_code == 200
    assert b'aria-label="Journey mode"' not in response.data
    assert b'corvette_c8_z06_2024' in response.data
