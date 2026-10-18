"""An interactive music journal plus an edition-aware collector shelf."""
from __future__ import annotations

from daily_flyer.models import CardItem, PageContext
from daily_flyer.utils import resolve_date

THEME_CONFIG = {
    "page_title": "The Sleeve Notes — Follow the people behind the records",
    "header_title": "The Sleeve Notes",
    "header_subtitle": "Follow the people behind the records.",
    "footer_text": "The Sleeve Notes · Built with Daily Flyer. Featured connections cite their sources. Catalog credits come from MusicBrainz; your shelf stays in your browser.",
    "hero_kicker": "A music connection journal",
    "hero_summary_pill": "The Peter Asher issue",
}

WORKBENCH = """
<div class="vinyl-app" id="vinyl-app">
  <a class="sleeve-skip" href="#vinyl-explorer">Skip to the connections</a>
  <header class="sleeve-masthead">
    <a class="sleeve-brand" href="#vinyl-app"><span class="sleeve-brand-mark" aria-hidden="true"></span>The Sleeve Notes<span class="sleeve-brand-caption">A music connection journal</span></a>
    <nav aria-label="Sleeve Notes sections"><a href="#vinyl-explorer">The connections</a><a href="#vinyl-quick">Your records</a><a href="#vinyl-collector">Your shelf</a></nav>
    <button id="vinyl-appearance" class="sleeve-appearance" type="button" aria-pressed="false">Lights up</button>
  </header>
  <div class="vinyl-intro">
    <div class="sleeve-intro-copy"><span class="sleeve-edition">NO. 01 &nbsp; / &nbsp; THE PETER ASHER ISSUE</span>
      <h1>Different records.<br><em>Same extraordinary people.</em></h1>
      <p>A familiar voice. An unexpected producer. One name on two favorite sleeves. Follow the people who make music connect.</p>
    </div>
    <div class="sleeve-intro-art" aria-hidden="true"><div class="vinyl-record"><span>THE<br>SLEEVE<br>NOTES</span></div><span class="sleeve-art-caption">TURN A NAME INTO A STORY ↗</span></div>
  </div>
  <section id="vinyl-explorer" aria-labelledby="explorer-title">
    <div id="vinyl-explorer-content" aria-busy="true"><p class="vinyl-empty">Opening the listening room…</p></div>
    <noscript><p>Peter Asher went from Peter &amp; Gordon to producing James Taylor and Linda Ronstadt. <a href="https://www.grammy.com/news/grammy-hall-of-fame-inspirations-peter-asher/">Read his story at GRAMMY.com</a>. Enable JavaScript to explore the map and your record collection.</p></noscript>
  </section>
  <section id="vinyl-quick" class="vinyl-quick" aria-label="Explore one or two albums">
    <div class="sleeve-section-heading"><span class="vinyl-overline">SIDE B · YOUR OWN RABBIT HOLE</span><h2>Start with a record you love.</h2><p>Look inside one album, or compare two for people in common. Confirm the artist, then follow the credits.</p></div>
    <form id="vinyl-quick-form" class="vinyl-quick-form">
      <label>First album<input name="first" required maxlength="120" placeholder="e.g. Rumours" autocomplete="off"></label>
      <label>Second album <span>(optional)</span><input name="second" maxlength="120" placeholder="e.g. Tusk" autocomplete="off"></label>
      <button type="submit">Find their story →</button>
    </form>
    <div class="vinyl-examples">Try a record: <button type="button" data-example="Sweet Baby James">Sweet Baby James</button><button type="button" data-example="Heart Like a Wheel">Heart Like a Wheel</button><button type="button" data-example="Pet Sounds">Pet Sounds</button><button type="button" data-example="Rumours">Rumours</button></div>
    <div id="vinyl-quick-status" class="vinyl-status" role="status" aria-live="polite">Just the title is fine. We'll show the artist before telling the story.</div>
    <div id="vinyl-quick-picks" hidden></div>
    <section id="vinyl-quick-story" aria-label="The album story" hidden></section>
  </section>
  <details id="vinyl-collector" class="vinyl-collector">
    <summary>Have the actual record? Build your own shelf <span>Exact pressings · sleeve credits · collection stories</span></summary>
    <div class="vinyl-collector-inner">
  <div class="vinyl-controls">
    <form id="vinyl-search-form" class="vinyl-form">
      <label>Artist <input name="artist" required maxlength="120" placeholder="e.g. David Bowie" autocomplete="off"></label>
      <label>Album / EP / LP <input name="title" required maxlength="120" placeholder="e.g. Let's Dance" autocomplete="off"></label>
      <label>Catalog no. <input name="catalog" maxlength="80" placeholder="optional, from label"></label>
      <button type="submit">Find editions →</button>
    </form>
    <div class="vinyl-side-actions"><button type="button" id="vinyl-manual-open" class="quiet">Add from sleeve</button>
      <button type="button" id="vinyl-export" class="quiet">Export collection</button>
      <label class="vinyl-import quiet">Import collection<input id="vinyl-import-file" type="file" accept="application/json,.json"></label></div>
  </div>
  <div id="vinyl-status" class="vinyl-status" role="status" aria-live="polite">Add an exact pressing if you want to save it to your shelf.</div>
  <section id="vinyl-results" class="vinyl-results" aria-label="Matching editions" hidden></section>
  <section id="vinyl-manual" class="vinyl-manual" hidden aria-label="Add a record from its sleeve">
    <h3>Add from the sleeve</h3><p>Use this when the exact pressing or credits are absent online. You can attach a source to each credit later.</p>
    <form id="vinyl-manual-form" class="vinyl-form">
      <label>Artist <input name="artist" maxlength="120" required></label>
      <label>Title <input name="title" maxlength="120" required></label>
      <label>Year <input name="year" maxlength="4" inputmode="numeric" placeholder="optional"></label>
      <label>Catalog number <input name="catalog" maxlength="80" placeholder="from the label"></label>
      <button type="submit">Add this record</button>
    </form>
  </section>
  <div class="vinyl-columns">
    <section class="vinyl-shelf" aria-label="Your collection"><div class="vinyl-section-head"><h3>On the shelf</h3><span id="vinyl-count">0 records</span></div>
      <div id="vinyl-collection" class="vinyl-collection"></div></section>
    <section class="vinyl-stories" aria-label="Collection stories"><div class="vinyl-section-head"><h3>Connections & curiosities</h3><button class="quiet" id="vinyl-shuffle" type="button">Shuffle stories ↻</button></div>
      <div id="vinyl-discoveries"></div></section>
  </div>
  <p class="vinyl-persistence">This collection is saved in this browser. Export a copy before switching devices or clearing browser data. A matching album title alone does not identify a valuable pressing; check its label, catalog number, runout and condition separately.</p>
    </div>
  </details>
</div>
"""


def build_theme_page(date_str: str | None = None, seed: int | None = None) -> PageContext:
    today = resolve_date(date_str)
    return PageContext(
        page_title=THEME_CONFIG["page_title"], header_title=THEME_CONFIG["header_title"],
        header_subtitle=THEME_CONFIG["header_subtitle"], today_str=today.strftime("%B %d, %Y"),
        cards=[CardItem("vinyl_workbench", "Collection", "The shelf", WORKBENCH)],
        footer_text=THEME_CONFIG["footer_text"],
        metadata={
            "hero_kicker": THEME_CONFIG["hero_kicker"],
            "hero_summary_pill": THEME_CONFIG["hero_summary_pill"],
            "extra_head_html": '<script>try{document.documentElement.dataset.vinylAppearance=localStorage.getItem("sleeve-notes-appearance")||"dark"}catch(e){}</script><link rel="stylesheet" href="/daily_flyer/themes/vinyl_crossovers.css"><script defer src="/daily_flyer/themes/vinyl_explorer.js"></script><script defer src="/daily_flyer/themes/vinyl_crossovers.js"></script>',
            "theme_name": "vinyl_crossovers",
        },
    )
