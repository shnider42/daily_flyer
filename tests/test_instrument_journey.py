"""Tests for the additive instrument theme; no external network is needed."""
from __future__ import annotations
import ast
import copy
import importlib
import json
from pathlib import Path
import re
import sys
from types import ModuleType
from urllib.parse import urlparse

import pytest
from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes import instrument_journey as theme
from daily_flyer.themes.journey_mode import mode_bar

ROOT = Path(__file__).resolve().parents[1]
CATALOG = theme.load_catalog()
IDS = ['player-mexico', 'american-pro-ii', 'les-paul-1959', 'multiac-encore', 'sonic-ht-h']


def test_catalog_identity_and_unique_workshops():
    assert [m['id'] for m in CATALOG['instruments']] == IDS
    assert len({m['kind'] for m in CATALOG['instruments']}) == 5
    assert len({n['what'] for m in CATALOG['instruments'] for n in m['nodes']}) == 30


@pytest.mark.parametrize('instrument', CATALOG['instruments'], ids=IDS)
def test_each_instrument_has_depth_and_sources(instrument):
    assert len(instrument['nodes']) == 6
    assert len({n['id'] for n in instrument['nodes']}) == 6
    assert len(instrument['identity_checks']) == 3
    for node in instrument['nodes']:
        assert len(node['checks']) == 3
        assert node['stop'] and node['symptoms'] and node['tools']
        assert all(s in CATALOG['sources'] for s in node['sources'])
    assert any(CATALOG['sources'][s]['kind'] == 'Community' for s in instrument['sources'])
    assert any(CATALOG['sources'][s]['kind'] == 'Factory' for s in instrument['sources'])


@pytest.mark.parametrize('source', list(CATALOG['sources'].values()), ids=list(CATALOG['sources']))
def test_sources_are_explicit_and_https(source):
    assert urlparse(source['url']).scheme == 'https'
    assert urlparse(source['url']).netloc
    assert source['scope'] and source['checked'] and source['status']
    assert source['kind'] in {'Factory','Specialist','Community','Inspected reference'}


def test_exact_model_distinctions():
    text = json.dumps(CATALOG, ensure_ascii=False)
    assert 'not a modern reissue' in text
    assert 'no selector' in text
    assert 'Nylon only' in text
    assert 'positions 1 and 2' in text
    assert 'not a humbucker coil split' in text
    assert '014450' in text
    assert 'Factory-listed PDF; automated fetch blocked' in text


def test_page_contract():
    page = theme.build_theme_page('2026-10-02', 3)
    assert isinstance(page, PageContext)
    assert page.today_str == '2026-10-02'
    assert len(page.cards) == 1
    assert page.cards[0].card_type == 'instrument_journey'
    assert 'ij-app' in page.cards[0].body
    assert 'role="status"' in page.cards[0].body
    assert 'aria-label="Journey mode"' in page.cards[0].body
    assert 'extra_css' in page.metadata and 'extra_js' in page.metadata
    assert page.metadata['theme_name'] == 'instrument_journey'
    payload = re.search(r'<script id="ij-catalog" type="application/json">(.*?)</script>',page.cards[0].body,re.S)
    assert payload
    assert json.loads(payload.group(1))['focus'] == 3


def test_date_validation_and_determinism():
    with pytest.raises(ValueError):
        theme.build_theme_page('2026-02-31')
    assert theme.build_theme_page('2026-10-02', 0) == theme.build_theme_page('2026-10-02', 0)
    assert theme.build_theme_page('2026-10-02', -1).cards


def test_payload_cannot_break_out_of_script(monkeypatch):
    data = copy.deepcopy(CATALOG)
    data['instruments'][0]['story'] = '</script><script>alert("bad")</script>'
    monkeypatch.setattr(theme, 'load_catalog', lambda: data)
    body = theme.build_theme_page('2026-10-02').cards[0].body
    assert '</script><script>alert' not in body
    assert '\\u003c/script\\u003e' in body


def test_mode_switch_is_static_and_routes_are_explicit():
    assert 'href="/?theme=garage" aria-current="page"' in mode_bar('cars')
    assert 'href="/?theme=instrument_journey" aria-current="page"' in mode_bar('guitars')
    assert '<script' not in mode_bar('cars')
    with pytest.raises(ValueError):
        mode_bar('planes')


def test_alias_changes_leave_vehicle_workshops_intact():
    tree = ast.parse((ROOT / 'web.py').read_text())
    aliases = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='THEME_ROUTE_ALIASES' for t in n.targets))
    for name in ['garage','garage_journey','e46_owner_companion']:
        assert aliases[name]=='garage_journey_v18'
    assert aliases['guitars'] == aliases['instruments'] == 'instrument_journey'
    assert aliases['e46_workshop']=='e46_owner_companion_v7'
    assert aliases['corvette_z06_workshop']=='corvette_c8_z06_2024'
    assert len([k for k in aliases if k.endswith('_workshop')]) == 7


def test_new_js_has_no_legacy_storage_or_observers():
    js=(theme.ASSETS / 'app.js').read_text()
    assert 'dailyflyer.instrument_journey.v1' in js
    assert 'new MutationObserver' not in js
    assert 'setInterval(' not in js
    assert 'fetch(' not in js
    assert 'localStorage.clear(' not in js
    assert 'localStorage.removeItem(' not in js
    assert 'serviceWorker' not in js
    assert "const esc =" in js


def test_v18_wrapper_preserves_the_v17_payload_contract(monkeypatch):
    """Boundary test with a captured-shape v17 fixture, not a full car smoke test."""
    base = ModuleType('daily_flyer.themes.garage_journey_v17')
    base.THEME_CONFIG = {'page_title':'Cars'}
    base.EXTRA_CSS = '/* existing CSS */'
    base.VEHICLES = [{'key':f'car-{i}'} for i in range(7)]
    original = PageContext('Cars','Garage','Vehicles','2026-10-02',[
        CardItem('garage','Cars','Garage','<div class="gj-shell"><script id="gj-data" type="application/json">[]</script></div>')],
        'Footer', {'theme_name':'garage_journey_v17','extra_css':base.EXTRA_CSS,'extra_js':'/* byte-identical existing car JS */'})
    base.build_theme_page = lambda **kwargs: copy.deepcopy(original)
    import daily_flyer.themes as package
    monkeypatch.setitem(sys.modules,base.__name__,base)
    monkeypatch.setattr(package,'garage_journey_v17',base,raising=False)
    module_name='daily_flyer.themes.garage_journey_v18'
    previous = sys.modules.pop(module_name,None)
    try:
        module = importlib.import_module(module_name)
        result=module.build_theme_page('2026-10-02')
        assert result.metadata['extra_js'] == original.metadata['extra_js']
        assert result.cards[0].body.endswith(original.cards[0].body)
        assert result.cards[0].body == mode_bar('cars') + original.cards[0].body
        assert result.metadata['extra_css'].startswith(original.metadata['extra_css'])
        assert module.VEHICLES is base.VEHICLES
        assert module.THEME_CONFIG == base.THEME_CONFIG and module.THEME_CONFIG is not base.THEME_CONFIG
        assert result.page_title == original.page_title
    finally:
        sys.modules.pop(module_name,None)
        if previous is not None: sys.modules[module_name]=previous
        if hasattr(package,'garage_journey_v18'): delattr(package,'garage_journey_v18')
