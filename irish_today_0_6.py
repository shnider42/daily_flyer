#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate a simple, fun Irish-themed webpage with:
- Word of the Day (Gaeilge)
- Phrase of the Day (Gaeilge + English)
- This Day in Irish History (date-keyed, with fallback facts)
- Sports Spotlight (GAA / Rugby / Soccer)
- A "Did You Know?" trivia nugget
- The current top story from an irish website
"""

from __future__ import annotations
from bs4 import BeautifulSoup
import requests
import argparse
import datetime as dt
import random
from pathlib import Path
from textwrap import dedent

# ----------------------------
# Small, friendly datasets
# ----------------------------
WORDS = [
    {"ga": "Craic", "pron": "crack", "en": "Fun / good times / banter"},
    {"ga": "Sláinte", "pron": "slawn-cha", "en": "Health! (Cheers)"},
    {"ga": "Fáilte", "pron": "fawl-cha", "en": "Welcome"},
    {"ga": "Go raibh maith agat", "pron": "guh rev mah ah-gut", "en": "Thank you"},
    {"ga": "Tá sé go hálainn", "pron": "taw shay guh haw-linn", "en": "It’s beautiful"},
    {"ga": "Maidin mhaith", "pron": "ma-jin wah", "en": "Good morning"},
    {"ga": "Oíche mhaith", "pron": "ee-hah wah", "en": "Good night"},
    {"ga": "Gaeilge", "pron": "gwayl-geh", "en": "Irish (language)"},
    {"ga": "Le do thoil", "pron": "leh duh hull", "en": "Please"},
    {"ga": "Dia dhuit", "pron": "dee-ah gwit", "en": "Hello"},
]

PHRASES = [
    {"ga": "Cad é mar atá tú?", "pron": "cod ay mar a-taw too?", "en": "How are you?"},
    {"ga": "Tá ocras orm.", "pron": "taw uk-rus ur-im", "en": "I’m hungry."},
    {"ga": "An féidir leat cabhrú liom?", "pron": "on fay-der lat cow-roo lum?", "en": "Can you help me?"},
    {"ga": "Ádh mór!", "pron": "aww more", "en": "Good luck!"},
    {"ga": "Go n-éirí an bóthar leat.", "pron": "guh ny-ree on boh-her lat", "en": "May the road rise to meet you."},
    {"ga": "Seo é!", "pron": "shuh ay", "en": "Here it is! / That’s it!"},
]

# Date-keyed Irish history examples (MM-DD). Add more over time.
HISTORY_BY_DATE = {
    "01-21": "1919 — Dáil Éireann first convened in Dublin, proclaiming Irish independence.",
    "04-24": "1916 — The Easter Rising began in Dublin.",
    "12-06": "1922 — The Irish Free State officially came into existence.",
    "10-08": "2005 — Cork completed a famous All-Ireland ladies football three-in-a-row (example historic sports tidbit).",
}

# General Irish history facts (fallback when date not present above)
HISTORY_GENERAL = [
    "Newgrange (Sí an Bhrú) predates Stonehenge and the Egyptian pyramids by centuries.",
    "Ogham is an early medieval alphabet used primarily to write the early Irish language.",
    "The Book of Kells is a lavishly illuminated Gospel book created by Celtic monks around 800 AD.",
    "The Great Famine (1845–1849) drastically reduced Ireland’s population through death and emigration.",
    "The GAA (founded 1884) helped revive Irish sports and culture, including hurling and Gaelic football.",
]

SPORTS_SPOTLIGHT = [
    "Hurling is often called the fastest field sport in the world—Kilkenny and Cork are storied powers.",
    "Gaelic football blends kick-passing and hand-passing; Dublin’s recent dominance is historic.",
    "Ireland’s rugby team won multiple Six Nations titles in the 21st century, including Grand Slams.",
    "Shamrock Rovers are among the most successful clubs in Irish football (soccer).",
    "Camogie is the women’s variant of hurling—equally skillful and fierce.",
]

TRIVIA = [
    "The Irish flag’s green, white, and orange symbolize Irish Catholic/nationalist tradition, peace, and Irish Protestant/unionist tradition.",
    "There are Gaeltacht regions where Irish (Gaeilge) remains the community’s everyday language.",
    "Halloween has roots in the Celtic festival Samhain.",
    "The Wild Atlantic Way is one of the world’s longest defined coastal routes (~2,500 km).",
    "Irish harps appear on Irish coinage and the state seal—Guinness uses a harp facing the other way.",
]


# ----------------------------
# HTML template
# ----------------------------
def build_html(context: dict) -> str:
    today = context["today_str"]
    word = context["word"]
    phrase = context["phrase"]
    history = context["history"]
    sport = context["sport"]
    trivia = context["trivia"]
    top_story = context["top_story"]

    # Minimal, readable styling
    css = dedent("""
    :root { --bg:#0f172a; --card:#0b1224; --ink:#e2e8f0; --muted:#93c5fd; --accent:#22d3ee; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
           background: linear-gradient(180deg, #0b1224, #0f172a); color: var(--ink); }
    header { padding: 2.5rem 1rem; text-align: center; }
    h1 { margin:0; font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: 0.5px; }
    .date { color: var(--muted); margin-top: .25rem; }
    main { max-width: 1000px; margin: 0 auto; padding: 1rem; display: grid; gap: 1rem;
           grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 16px; padding: 1rem 1.2rem; backdrop-filter: blur(4px); }
    .eyebrow { color: var(--muted); font-size: .82rem; text-transform: uppercase; letter-spacing: .08em; }
    h2 { margin: .25rem 0 .5rem; font-size: 1.2rem; }
    .ga { font-weight: 700; font-size: 1.1rem; }
    .pron { color: var(--muted); font-style: italic; }
    .en { margin-top: .3rem; }
    footer { text-align:center; padding: 2rem 1rem; color: #a3a3a3; font-size: .9rem; }
    a { color: var(--accent); text-decoration: none; }
    .tiny { font-size: .85rem; color:#cbd5e1; }
    """)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Irish Today — Learn a little, every day</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>{css}</style>
</head>
<body>
  <header>
    <h1>Irish Today 🇮🇪</h1>
    <div class="date">{today}</div>
    <div class="tiny">A tiny daily page about Gaeilge, history, and sport. (Prototype v0.1)</div>
  </header>

  <main>
    <section class="card">
      <div class="eyebrow">Word of the Day (Gaeilge)</div>
      <h2 class="ga">{word["ga"]}</h2>
      <div class="pron">[{word.get("pron", "")}]</div>
      <div class="en">{word["en"]}</div>
    </section>

    <section class="card">
      <div class="eyebrow">Phrase of the Day</div>
      <h2 class="ga">{phrase["ga"]}</h2>
      <div class="pron">[{phrase.get("pron", "")}]</div>
      <div class="en">{phrase["en"]}</div>
    </section>

    <section class="card">
      <div class="eyebrow">This Day in Irish History</div>
      <h2>{history.split(' — ')[0]}</h2>
      <div class="en">{' — '.join(history.split(' — ')[1:])}</div>
      {f'<div class="tiny"><a href="{context.get("history_source")}" target="_blank">Source</a></div>' if context.get("history_source") else ""}
    </section>

    <section class="card">
      <div class="eyebrow">Sports Spotlight</div>
      <h2>Today’s Pick</h2>
      <div class="en">{sport}</div>
    </section>

    <section class="card">
      <div class="eyebrow">Did You Know?</div>
      <h2>Trivia</h2>
      <div class="en">{trivia}</div>
    </section>

    <section class="card">
      <div class="eyebrow">Top Story</div>
      <h2>Top Story</h2>
      <div class="en">{top_story['headline']}</div>
      <div class="en">{top_story['snippet']}</div>
    </section>

  </main>

  <footer>
    Built with Python. Add your own facts, dates, and teams—then regenerate daily.
  </footer>
</body>
</html>
"""
    return html


# ----------------------------
# NEW: dynamic helpers (tiny + robust fallbacks)
# ----------------------------

def fetch_dynamic_irish_history(today: dt.date) -> str | None:
    """Wikipedia On-This-Day → first Irish-related line, else None."""
    try:
        url = f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{today.month}/{today.day}"
        resp = requests.get(url, timeout=6, headers={"Accept": "application/json", "User-Agent": "IrishToday/0.2"})
        resp.raise_for_status()
        data = resp.json()
        events = data.get("events", [])
        keywords = [
            "Ireland", "Irish", "Dublin", "Belfast", "Cork", "Limerick", "Galway",
            "Ulster", "Leinster", "Munster", "Connacht", "Gaelic", "Hurling",
            "Sinn Féin", "IRA", "GAA", "Éire", "Northern Ireland"
        ]

        def _match(item):
            text = item.get("text", "");
            year = item.get("year")
            if any(k in text for k in keywords):
                return f"{year} — {text}", "https://en.wikipedia.org/wiki/Portal:Ireland"

        for e in events:
            hit = _match(e)
            if hit: return hit
        for kind in ("births", "deaths"):
            for e in data.get(kind, []):
                hit = _match(e)
                if hit: return hit
    except Exception as e:
        print("⚠️ dynamic history:", e)
    return None


def fetch_rte_top_story() -> dict[str, str] | None:
    """RTÉ News top-ish story (headline + snippet)."""
    try:
        url = "https://www.rte.ie/news/"
        resp = requests.get(url, timeout=6)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        article = soup.select_one("article") or soup.find("div", class_="top-story")
        if article:
            h = article.find(["h1", "h2", "h3", "a"])
            p = article.find("p")
            headline = h.get_text(strip=True) if h else None
            snippet = p.get_text(strip=True) if p else ""
            if headline:
                return {"headline": headline, "snippet": snippet, "source": url}
    except Exception as e:
        print("⚠️ RTÉ top:", e)
    return {"headline": "No story available.", "snippet": ""}


# NEW: try to get a Gaeilge word/phrase from Wiktionary; fall back silently
def fetch_ga_wotd() -> dict | None:
    """
    Try ga.wiktionary.org main page for a 'word/phrase of the day' hint.
    Returns dict like {"ga": "...", "en": "...", "pron": ""} or None.
    Heuristic and optional.
    """
    try:
        resp = requests.get("https://ga.wiktionary.org/wiki/Príomhleathanach", timeout=6)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Heuristics: pick first bold/heading link as the 'word', and a short desc nearby
        candidate = soup.select_one("#mp-upper, #mw-content-text") or soup
        term_el = candidate.find(["b", "strong", "a", "h2", "h3"])
        term = term_el.get_text(strip=True) if term_el else None
        if term and 2 <= len(term) <= 40:
            # No reliable EN gloss; provide neutral label
            return {"ga": term, "en": "Irish entry (from Wiktionary)", "pron": "", "source": "https://ga.wiktionary.org/wiki/Príomhleathanach"}
    except Exception as e:
        print("⚠️ ga WOTD:", e)
    return None


# NEW: RTÉ Sport headline as dynamic sports spotlight
def fetch_rte_sport_spotlight() -> str | None:
    try:
        resp = requests.get("https://www.rte.ie/sport/", timeout=6)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        art = soup.select_one("article") or soup.find("a", href=True)
        if art:
            h = art.find(["h1", "h2", "h3", "a"])
            if h:
                return text, "https://www.rte.ie/sport/"
    except Exception as e:
        print("⚠️ RTÉ sport:", e)
    return None


# NEW: concise Irish trivia from Wikipedia summary
def fetch_irish_trivia() -> str | None:
    """
    Pull a single-sentence nugget from Wikipedia's Ireland summary (or Irish language).
    """
    try:
        for title in ("Ireland", "Irish language", "Irish people"):
            r = requests.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}",
                timeout=6,
                headers={"Accept": "application/json", "User-Agent": "IrishToday/0.2"}
            )
            if r.status_code != 200: continue
            j = r.json()
            extract = (j.get("extract") or "").strip()
            if extract:
                # Take the first sentence as a neat trivia line
                first = extract.split(". ")[0].strip()
                if first.endswith(".") is False: first += "."
                return first, "https://en.wikipedia.org/wiki/Ireland"
    except Exception as e:
        print("⚠️ trivia:", e)
    return None


# ----------------------------
# Choose + compose
# ----------------------------
def choose_for_today(today: dt.date, rng: random.Random) -> dict:
    mmdd = today.strftime("%m-%d")

    dynamic_history = fetch_dynamic_irish_history(today)
    if isinstance(dynamic_history, tuple):
        history, history_source = dynamic_history
    else:
        history, history_source = dynamic_history or HISTORY_BY_DATE.get(mmdd, rng.choice(HISTORY_GENERAL)), None

    dyn_word = fetch_ga_wotd()
    word_source = dyn_word.get("source") if dyn_word else None
    word = dyn_word or rng.choice(WORDS)

    dyn_sport = fetch_rte_sport_spotlight()
    sport, sport_source = dyn_sport if isinstance(dyn_sport, tuple) else (dyn_sport or rng.choice(SPORTS_SPOTLIGHT), None)

    dyn_trivia = fetch_irish_trivia()
    trivia, trivia_source = dyn_trivia if isinstance(dyn_trivia, tuple) else (dyn_trivia or rng.choice(TRIVIA), None)

    rte = fetch_rte_top_story()

    return {
        "today_str": today.strftime("%A, %B %d, %Y"),
        "word": word,
        "phrase": rng.choice(PHRASES),
        "history": history,
        "history_source": history_source,
        "sport": sport,
        "sport_source": sport_source,
        "trivia": trivia,
        "trivia_source": trivia_source,
        "word_source": word_source,
        "top_story": rte,
    }



# ----------------------------
# Main
# ----------------------------
def main():
    parser = argparse.ArgumentParser(description="Generate a simple Irish-themed HTML page.")
    parser.add_argument("--outfile", default="irish_today.html", help="Output HTML file (default: irish_today.html)")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for repeatable output")
    parser.add_argument("--date", default=None, help="Override date (YYYY-MM-DD) for 'This Day' features")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()

    context = choose_for_today(today, rng)
    html = build_html(context)

    out_path = Path(args.outfile)
    out_path.write_text(html, encoding="utf-8")

    print(f"✅ Wrote {out_path.resolve()}")
    print("Open it in your browser and refresh each day (or rerun with a new --seed).")


if __name__ == "__main__":
    main()
