from __future__ import annotations

from pathlib import Path

from daily_flyer.models import PageContext


def build_html(context: PageContext) -> str:
    css = """
    :root {
        --bg: #0f172a;
        --bg2: #0b1224;
        --card: rgba(255,255,255,0.04);
        --border: rgba(255,255,255,0.08);
        --ink: #e2e8f0;
        --muted: #93c5fd;
        --accent: #22d3ee;
    }

    * { box-sizing: border-box; }

    body {
        margin: 0;
        font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: linear-gradient(180deg, var(--bg2), var(--bg));
        color: var(--ink);
    }

    header {
        padding: 2.5rem 1rem;
        text-align: center;
    }

    h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        letter-spacing: 0.5px;
    }

    .date {
        color: var(--muted);
        margin-top: 0.35rem;
    }

    .subtitle {
        color: #cbd5e1;
        margin-top: 0.5rem;
        font-size: 0.95rem;
    }

    main {
        max-width: 1000px;
        margin: 0 auto;
        padding: 1rem;
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }

    .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 1rem 1.2rem;
        backdrop-filter: blur(4px);
    }

    .eyebrow {
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    h2 {
        margin: 0.25rem 0 0.5rem;
        font-size: 1.15rem;
    }

    .native {
        font-weight: 700;
        font-size: 1.1rem;
    }

    .pron {
        color: var(--muted);
        font-style: italic;
        margin-top: 0.2rem;
    }

    .body {
        margin-top: 0.35rem;
        line-height: 1.5;
    }

    .source {
        margin-top: 0.7rem;
        font-size: 0.85rem;
    }

    a {
        color: var(--accent);
        text-decoration: none;
    }

    footer {
        text-align: center;
        padding: 2rem 1rem;
        color: #a3a3a3;
        font-size: 0.9rem;
    }
    """

    history_year = ""
    history_body = context.history.body
    if " — " in history_body:
        parts = history_body.split(" — ", 1)
        history_year = parts[0]
        history_body = parts[1]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{context.page_title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>{css}</style>
</head>
<body>
    <header>
        <h1>{context.header_title}</h1>
        <div class="date">{context.today_str}</div>
        <div class="subtitle">{context.header_subtitle}</div>
    </header>

    <main>
        <section class="card">
            <div class="eyebrow">Word of the Day</div>
            <h2 class="native">{context.word.native_text}</h2>
            <div class="pron">{context.word.pronunciation}</div>
            <div class="body">{context.word.english}</div>
            {_source_html(context.word.source_url)}
        </section>

        <section class="card">
            <div class="eyebrow">Phrase of the Day</div>
            <h2 class="native">{context.phrase.native_text}</h2>
            <div class="pron">{context.phrase.pronunciation}</div>
            <div class="body">{context.phrase.english}</div>
            {_source_html(context.phrase.source_url)}
        </section>

        <section class="card">
            <div class="eyebrow">History</div>
            <h2>{history_year or context.history.title}</h2>
            <div class="body">{history_body}</div>
            {_source_html(context.history.source_url)}
        </section>
        
        {f"""
        <section class="card">
            <div class="eyebrow">Military Archives</div>
            <h2>{context.military.title}</h2>
            <div class="body">{context.military.body}</div>
        {_source_html(context.military.source_url)}
        </section>
        """ if context.military else ""}

        <section class="card">
            <div class="eyebrow">Sports Spotlight</div>
            <h2>{context.sport.title}</h2>
            <div class="body">{context.sport.body}</div>
            {_source_html(context.sport.source_url)}
        </section>

        <section class="card">
            <div class="eyebrow">Did You Know?</div>
            <h2>{context.trivia.title}</h2>
            <div class="body">{context.trivia.body}</div>
            {_source_html(context.trivia.source_url)}
        </section>

        <section class="card">
            <div class="eyebrow">Top Story</div>
            <h2>{context.top_story.headline}</h2>
            <div class="body">{context.top_story.snippet}</div>
            {_source_html(context.top_story.source_url)}
        </section>
    </main>

    <footer>
        {context.footer_text}
    </footer>
</body>
</html>
"""


def _source_html(source_url: str | None) -> str:
    if not source_url:
        return ""
    return f'<div class="source"><a href="{source_url}" target="_blank" rel="noopener noreferrer">Source</a></div>'


def render_html_to_file(context: PageContext, outfile: str) -> None:
    html = build_html(context)
    Path(outfile).write_text(html, encoding="utf-8")