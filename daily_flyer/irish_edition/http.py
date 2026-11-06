"""Request-level caching for immutable rendered bytes, scoped to Irish Today."""
from datetime import date, datetime, time, timedelta
from functools import lru_cache
import json

from flask import Response, request

from .edition import DUBLIN, make_edition, render_edition


@lru_cache(maxsize=96)
def representation(day, seed, fmt, viewed_on):
    edition = make_edition(day, seed)
    if fmt == "json":
        return json.dumps(edition, ensure_ascii=False, separators=(",", ":"))
    return render_edition(edition, viewed_on)


def edition_response(raw_date, seed, fmt="html"):
    now = datetime.now(DUBLIN)
    today = now.date()
    day = date.fromisoformat(raw_date) if raw_date else today
    data = representation(day, seed, fmt, today)
    response = Response(data, mimetype="application/json" if fmt == "json" else "text/html")
    midnight = datetime.combine(today + timedelta(days=1), time.min, tzinfo=DUBLIN)
    ttl = max(0, int(midnight.timestamp() - now.timestamp()))
    response.cache_control.public = True
    response.cache_control.max_age = min(300, ttl)
    response.add_etag()
    return response.make_conditional(request)
