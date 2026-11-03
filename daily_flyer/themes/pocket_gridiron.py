"""Standalone DailyFlyer arcade theme; browser-local games, refreshable rosters."""
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
import time
import urllib.error
import urllib.request

ASSET_DIR = Path(__file__).with_name('pocket_gridiron_assets')
THEME_CONFIG = {'page_title': 'Pocket Gridiron', 'header_title': 'Pocket Gridiron', 'header_subtitle': '7-on-7 and 11-on-11 pixel football', 'footer_text': 'DailyFlyer Arcade'}
_cache = None
_lock = Lock()


def fetch_roster():
    """Fixed upstream, hourly process cache; client retains last good data on error."""
    global _cache
    year = datetime.now(timezone.utc).year
    with _lock:
        if _cache and _cache[0] == year and time.monotonic() - _cache[1] < 3600:
            return _cache[2], _cache[3]
        url = f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{year}.csv'
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'PocketGridiron/1.0'})
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read(5_000_001)
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RuntimeError('Roster source unavailable') from exc
        text = raw.decode('utf-8')
        if not 100_000 <= len(raw) <= 5_000_000 or not text.startswith('season,team,position,'):
            raise ValueError('Incomplete roster')
        fetched = datetime.now(timezone.utc).isoformat()
        _cache = (year, time.monotonic(), text, fetched)
        return text, fetched
