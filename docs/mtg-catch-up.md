# Magic Catch Up

Magic: The Gathering Catch Up is an independent DFE v2 product on
`feat/mtg-catch-up`, based on the working RLCS Catch Up branch at
`f412aa71079dc8a8a1d80f0eae2b0977b34f04c9`. It adds a separate product; existing
RLCS and F9 routes and exports remain unchanged.

Public site: https://mtg-catch-up.onrender.com/

Private working preview: https://magic-catch-up-field-guide.primemouse3.chatgpt.site

## Run and export

- Flask route: `/v2?product=mtg_catch_up` (hyphens also accepted).
- To use it at the Flask root, set `ROOT_PRODUCT=mtg_catch_up` and ensure
  `F9_ROOT_PRODUCT` is unset because that existing setting takes precedence.
- Install `requirements.txt`, then run `python scripts/build_mtg_catch_up.py`.
- Static output: `mtg_catchup/index.html`, with all styles, JavaScript, reviewed
  data and fallback content embedded. No API key is required. Optional illustrations and display fonts load from
  Wizards of the Coast, Scryfall, and Google Fonts; reading data and behavior
  remain embedded.
- Render static settings: branch `feat/mtg-catch-up`, publish directory
  `mtg_catchup`, build command `test -s mtg_catchup/index.html`. No environment
  variables or web-service runtime are required for the static export.
- The `.openai/hosting.json` file is local preview configuration only, not part
  of the Git change.
- Render service: `srv-dbggv608v5cc73dukpsg`, with automatic deployment enabled
  for commits to `feat/mtg-catch-up`. Initial deploy `dep-dbggv688v5cc73dukqrg`
  reached `live` on October 27, 2026, serving commit
  `a1ab6a6162949b74369488f0a1063938fa520b00`.

## Reader behavior

Night mode is the default, with charcoal surfaces, warm text, and gold accents. The header
toggle restores a parchment light palette and remembers an explicit choice
under `dfe-magic-theme-v1`, independently of filters and reading progress.
The saved palette is applied before the first paint. Blocked storage still
allows switching during the current visit; without JavaScript, night mode and
the sourced fallback remain available.

Starting date, format, platform, topic and search intersect. All-format rules
remain eligible for every relevant format. Commander/Modern with Arena and
Arena-only formats with paper produce a helpful incompatible-selection state.
Selecting an Arena-specific format selects Arena automatically. Platform can
still be changed explicitly. Casual tabletop is scoped to broad rules,
mechanics, and pack changes, not every competitive-format announcement.

Set names are approximate year anchors: each includes changes from January 1
of that year. A custom date is inclusive. Each entry states whether its date
is an announcement or effective milestone. Future scheduled changes remain
labeled as upcoming **at the edition date**, never silently promoted to fact
by the reader's clock. Separate effective dates are included only when exact
and evidenced. Reading depth changes detail, never the eligible entries.

The first three entries are visible initially. Readers can expand the rest,
open before/after explanations and evidence, jump to defined terms, and mark
changes as understood. Filters and reading marks use guarded localStorage;
blocked storage does not prevent reading. Share links carry only normalized
filter choices in the URL fragment, never personal reading marks. When
clipboard access is unavailable a selectable link is shown.

Three real, sourced entries are rendered before JavaScript loads. They remain
visible if scripting is disabled or initialization fails. Artwork and display fonts are external enhancements; system font fallbacks and
HTML text preserve the reading experience if those providers are unavailable.
No external JavaScript or live data API is required.
An HTML viewer that disables scripts can show the fallback but cannot provide
the interactive controls; a normal hosted browser page is the full experience.

## Editorial scope

The first edition has 16 selected milestones from June 10, 2009 through
September 22, 2026, including the September announcement of a planned 2027
Alchemy retirement. Twenty official references were reviewed October 27,
2026. That review date does not imply complete coverage through October.
Rules, formats, card mechanics, packs, and a small selection of Arena changes
are covered. Set-by-set archives, all bans, deck rankings, prices, tournament
results and most individual cards are not. Modern/Pioneer coverage is sparse.

`daily_flyer_v2/data/mtg_catch_up.json` is the source of truth. Each entry carries
scope tags, a dated comparison, explanation, evidence IDs and optional terms.
Source publication, milestone, planned effective and review dates are distinct.
Historical articles are explicitly distinguished from maintained format and
ban-list references. The page makes no deck-legality verdicts.

There is no automatic ingestion or refresh. Future automation should collect
primary announcements into a review queue, detect revised/retracted pages,
validate format and platform scope, and publish only reviewed records. Never
silently replace a review date with build time or treat an empty feed as proof
that nothing changed. A common data contract can be extracted across RLCS,
Infierno and Magic once their distinct scope/temporal rules are proven; this
change does not refactor their working code.

To update: verify the source, edit the record and dates, keep summaries in your
own words, update coverage labels and counts if needed, rebuild the export,
run the checks below, and inspect narrow-screen controls and source links.

## Checks

```
python -m pytest tests/test_mtg_catch_up.py tests/test_rlcs_catch_up.py -q
node --test tests/mtg_catch_up.test.cjs tests/rlcs_catch_up.test.cjs
```

These cover evidence/schema consistency, immutable edition dates, Flask/export
parity, escaping and no-script content, existing RLCS preservation, intersected
filters, date boundaries, upcoming changes, malformed shared/saved state,
reading-depth invariance, source URL restrictions and honest coverage gaps.

Verified October 27, 2026: all 23 Python/JavaScript checks pass, all 20
source URLs returned HTTP 200, and Chromium browser checks covered saved
reading marks, recent-period gaps, clipboard fallback, and format/depth changes.
390px and 320px iframe viewports have no horizontal overflow. A sandboxed
frame with storage blocked retains full interaction; a scripting-disabled
frame retains three sourced entries. These are responsive Chromium checks,
not a physical iPhone/Safari certification. The private deployment succeeded;
the live preview requires the owner's ChatGPT sign-in.

The public Render site was verified without sign-in. Date and format filters
updated the matching entries, and the detail selector expanded context and
official evidence while preserving the same eight matching Commander changes
from 2017 onward.

## Illustrated visual edition

The complete pre-redesign night-mode version is retained at
`56ef6213bfddf065b0207c26dcf50624bdff5b20`. The visual redesign changes the
HTML template and CSS, story category classes, theme-color values, and static
export; the reviewed content dataset and filter semantics remain unchanged.

The hero uses Tarkir: Dragonstorm art by Joshua Raphael from Wizards'
[The Foundations of Magic's Next Era](https://magic.wizards.com/en/news/announcements/the-foundations-of-magics-next-era).
The glossary uses Edge of Eternities art by Chris Rallis from the same article.
Scryfall supplies full-card images of Llanowar Elves (Kev Walker), Black Lotus
(Christopher Rush), and Serra Angel (Greg Staples), plus a Shivan Dragon art
crop (Donato Giancola). Image URLs are pinned to specific card printings, not
random or latest-card API requests. Illustrations are atmospheric, not legality
claims or card recommendations. Visible artist credits and source links are
in the page's art notebook.

Cinzel (Natanael Gama) and Manrope (Mikhail Sharanda) are loaded through Google
Fonts with display=swap, with Georgia and system sans fallbacks. Image space
is reserved, below-fold artwork loads lazily, and hover movement respects
reduced-motion preferences. The page remains usable without these assets.
