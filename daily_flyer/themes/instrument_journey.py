"""A visual ownership/workbench companion, independent of Garage car state.

Assets are bundled locally and inlined at render time, like existing DFE
custom themes. No build tools, new dependencies, network requests at render,
new server endpoints, polling, service workers or MutationObservers.
"""
from __future__ import annotations

from datetime import date
from html import escape
import json
from pathlib import Path

from daily_flyer.models import CardItem, PageContext
from daily_flyer.themes.journey_mode import MODE_CSS, mode_bar

THEME_NAME = 'instrument_journey'
THEME_CONFIG = {
    'page_title': 'Instrument Journey — Know the instrument. Keep the story.',
    'header_title': 'Instrument Journey',
    'header_subtitle': 'Five guitars. Individual stories. A workbench for each.',
    'footer_text': 'An independent Daily Flyer theme. Not affiliated with the instrument manufacturers.',
    'hero_kicker': 'Daily Flyer / Instrument Journey',
    'hero_summary_pill': 'Visual instrument ownership and care',
}
ASSETS = Path(__file__).with_name('instrument_journey_assets')


def load_catalog() -> dict:
    data = json.loads((ASSETS / 'catalog.json').read_text(encoding='utf-8'))
    if data.get('version') != 1 or len(data['instruments']) != 5:
        raise ValueError('Invalid Instrument Journey catalog')
    ids = [item['id'] for item in data['instruments']]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate instrument identity')
    for item in data['instruments']:
        for source_id in item['sources']:
            if source_id not in data['sources']:
                raise ValueError(f'Missing source: {source_id}')
        for node in item['nodes']:
            for source_id in node['sources']:
                if source_id not in data['sources']:
                    raise ValueError(f'Missing workshop source: {source_id}')
    return data


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = date.fromisoformat(date_str) if date_str else date.today()
    data = load_catalog()
    data['today'] = today.isoformat()
    data['focus'] = (seed if seed is not None else today.toordinal()) % 5
    payload = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    # A useful no-JS source list; the interactive app progressively replaces it.
    fallback = ''.join(
        f'<li><strong>{escape(m["name"])}</strong> — {escape(m["identity"])}. '
        f'<a href="{escape(data["sources"][m["sources"][0]]["url"], quote=True)}" '
        'target="_blank" rel="noopener noreferrer">Reference &amp; support ↗</a></li>'
        for m in data['instruments']
    )
    body = f'''<div id="ij-app">
      {mode_bar('guitars')}
      <header class="ij-masthead">
        <a class="ij-brand" href="#/rack"><span class="ij-monogram" aria-hidden="true">IJ</span><span>INSTRUMENT<br>JOURNEY</span></a>
        <span class="ij-edition">A Daily Flyer companion <b>01 / THE GUITAR ROOM</b></span>
        <a class="ij-rack-link" href="#/rack">My instruments <span aria-hidden="true">↗</span></a>
      </header>
      <div id="ij-notice" class="ij-notice" role="status" aria-live="polite" hidden></div>
      <div id="ij-main" tabindex="-1"><h1>Know your instrument.</h1>
        <p>Enable JavaScript to explore the workbench and save a local journey. Factory and reference links remain available below.</p><ul>{fallback}</ul></div>
      <footer class="ij-footer"><span>INSTRUMENT JOURNEY / v1</span><p>Reference profiles, not verified inspections. Sources reviewed {data['checked']}; not live-monitored. Notes are local to this browser. Export a backup.</p></footer>
      <dialog id="ij-import-dialog" aria-labelledby="ij-import-title"><h2 id="ij-import-title">Replace instrument data?</h2><p id="ij-import-summary"></p><p>Only Instrument Journey data will be replaced. Your car garage will not be changed.</p><div class="ij-actions"><button type="button" data-action="confirm-import">Replace instrument data</button><button type="button" data-action="cancel-import" class="ij-secondary">Cancel</button></div></dialog>
      <input id="ij-import-file" type="file" accept="application/json,.json" hidden>
      <script id="ij-catalog" type="application/json">{payload}</script>
    </div>'''
    return PageContext(
        page_title=THEME_CONFIG['page_title'], header_title=THEME_CONFIG['header_title'],
        header_subtitle=THEME_CONFIG['header_subtitle'], today_str=today.isoformat(),
        cards=[CardItem(card_type='instrument_journey', eyebrow='Instrument room', title='Instrument Journey', body=body)],
        footer_text=THEME_CONFIG['footer_text'],
        metadata={
            'theme_name': THEME_NAME,
            'extra_css': MODE_CSS + (ASSETS / 'style.css').read_text(encoding='utf-8'),
            'extra_js': (ASSETS / 'app.js').read_text(encoding='utf-8'),
        },
    )
