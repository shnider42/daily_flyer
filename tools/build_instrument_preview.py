"""Render the guitar theme using the normal Daily Flyer renderer.

Run from an updated repository: python tools/build_instrument_preview.py
This is an offline HTML preview, not a Render deployment. External photographs
and source links still need internet access in the browser.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from daily_flyer.renderer import build_html
from daily_flyer.themes.instrument_journey import build_theme_page


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='instrument_journey_preview.html')
    parser.add_argument('--date', default=None)
    args = parser.parse_args()
    context = build_theme_page(date_str=args.date)
    html = build_html(context)
    Path(args.output).write_text(html, encoding='utf-8')
    print(Path(args.output).resolve())


if __name__ == '__main__':
    main()
