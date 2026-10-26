"""One self-contained page for Flask and Render's static hosting."""
from __future__ import annotations

import html
import json
from datetime import date
from pathlib import Path

from daily_flyer_v2.experience import FlyerExperience

ROOT = Path(__file__).resolve().parents[2]


def render_rlcs_catch_up(experience: FlyerExperience) -> str:
    template = Path(__file__).with_suffix(".html").read_text(encoding="utf-8")
    payload = json.dumps(experience.data, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    sources = {s["id"]: s for s in experience.data["sources"]}
    fallback = []
    safe_stories = [item for item in experience.data["stories"] if not item["spoiler"] and any(not sources[s]["spoiler"] for s in item["source_ids"])]
    for item in sorted(safe_stories, key=lambda s: s["priority"])[:3]:
        s = next(sources[s] for s in item["source_ids"] if not sources[s]["spoiler"])
        fallback.append('<article class="fallback-story"><span class="eyebrow">' + html.escape(item["date"]) + '</span><h3>' + html.escape(item["safe_title"]) + '</h3><p>' + html.escape(item["safe_summary"]) + '</p><a target="_blank" rel="noopener noreferrer" href="' + html.escape(s["url"], quote=True) + '">Read the official announcement ↗</a></article>')
    replacements = {
        "@@CSS@@": (ROOT / "static/rlcs_catch_up/style.css").read_text(encoding="utf-8"),
        "@@JS@@": (ROOT / "static/rlcs_catch_up/app.js").read_text(encoding="utf-8"),
        "@@DATA@@": payload,
        "@@FALLBACK@@": "".join(fallback),
        "@@REVIEWED@@": html.escape(experience.data["reviewed_at"]),
        "@@REVIEWED_LABEL@@": date.fromisoformat(experience.data["reviewed_at"]).strftime("%d %b %Y"),
    }
    # Replace in one pass: content containing another token cannot inject a slot.
    import re
    return re.sub(r"@@(?:CSS|JS|DATA|FALLBACK|REVIEWED|REVIEWED_LABEL)@@", lambda m: replacements[m.group()], template)
