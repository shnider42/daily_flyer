# Soph(more) Slump(?) — quarterback explorer

Theme: `qb_year_two` (URL alias `qb-year-two`). Base: `staging` at
`2a053196d33f6b50299b8c342cc2316960314e21`. All implementation files are isolated;
the shared renderer, other themes, routing and default theme are unchanged.

## Run on Render

Deploy branch `feat/qb-year-two-explorer`, using the existing Python service setup:

```text
Build command: pip install -r requirements.txt
Start command: gunicorn web:app
DEFAULT_THEME=qb_year_two
```

Or use `/?theme=qb_year_two` on a service deploying this branch. No API key,
database, background job, chart CDN or new production dependency is required.
This change does not deploy or merge the branch.

## Version 2.0.0 — football identity and prediction lab

- Stadium field hero, football laces, scoreboard typography, orange navigation,
  and a separate Prediction lab; all existing Film room functions remain.
- Gold diamonds distinguish current Hall of Famers from blue circles. Both
  groups share the scatterplot by default; group toggles affect plotting only.
- Research outcomes: Hall induction within 25 years after year two; starting-QB
  Super Bowl wins in the next 10 seasons; recorded 12-start year-three job;
  mean league-relative ANY/A in years 3–7 (at least three observations).
- Equal complete follow-up windows exclude recent cohorts even if an early
  success is already known. Missing outcomes are excluded, not imputed failures.
  Later-season observation requirements introduce survivor/observation bias.
- Pearson, Spearman, seeded 400-resample bootstrap intervals, strong/weak
  trajectory groups and Wilson intervals; export the eligible research cohort.
- Experimental L2 logistic models compare year one with year one + year two,
  controlling for first qualifying season. Latest approximately 25% of season
  cohorts are held out; training-only scaling, Brier/AUC and prevalence baseline.
  Historical retrospective labels are not a point-in-time deployment backtest.
  Small event counts, multiple exploration, confounding and lack of probability
  calibration are disclosed. No causal or individual forecasting claim.
- Super Bowl source map: `daily_flyer/data/qb_super_bowls.json`, 59 winning
  starters for regular seasons 1966–2024. PFR winners/history/boxscore sources
  cross-checked against the official Hall starter list; backups do not count.
  Direct PFR requests returned 403; indexed PFR records and the official list
  were used. Performance coverage still ends in 2024, Hall status 2026-09-28.
- Validation: `python -m unittest tests.test_qb_year_two`,
  `node --test tests/test_qb_chart_math.cjs tests/test_qb_research.cjs`, and the
  optional Playwright regression script `tests/test_qb_browser.cjs`.

## Version 1.2.0 — mobile selection and dense data

- Tapping a line or season now pins the QB; the name and optional season survive
  page/graph scrolling, height-only browser chrome changes, rotation, display
  changes and reload. Clear highlight explicitly unpins. Keyboard Enter/Space
  pins markers; desktop hover remains temporary until clicked. Native scrolling
  is not intercepted and dragging/cancelled pointer gestures cannot pin a line.
- Height-only resize no longer redraws SVGs. Width changes redraw while restoring
  the pinned selection and season details. Selecting another QB replaces the pin;
  removing or filtering out the pinned QB clears it.
- Mobile shows only the measure/time selectors and three quick actions. Graph
  options, selected QBs and the legend collapse by default. Performance graphs
  fit the phone width, while the names-on-X career chart retains horizontal scroll.
- **Spread values** uses piecewise-linear interpolation between unique values
  and their pooled midranks across selected observations in the visible window.
  Dense numeric regions expand; extreme gaps compress. Ties are preserved, not
  jittered. Negative values and zero are supported. All panels share this mapping.
  Axis labels retain metric units but spacing is not proportional to numeric
  differences, and slopes must not be interpreted as rates of change. Changing
  selection/window changes the distribution and mapping; spotlight does not.
- **Zoom middle** sets a linear scale with 10th–90th percentile bounds. The exact
  count of clipped observations is shown. Tied percentile endpoints fall back to
  the full range with a note. Tap the action again to return to fitted bounds.
- **Separate QBs** is now a one-tap toggle. This remains the option that prevents
  different players' lines from overlapping; no monotonic scale can separate ties.
- Current masthead version: `v1.2.0`. No data refresh, Render setting change or
  production dependency was introduced.

Run `python -m unittest discover -s tests -p 'test_qb_year_two.py'` and
`node --test tests/test_qb_chart_math.cjs`. For browser regressions, install
Playwright in your test environment and run `node tests/test_qb_browser.cjs`;
`CHROMIUM_EXECUTABLE` can select an existing Chromium binary. The check exercises
native touch swipes, drag rejection, sticky selection, viewport changes, reload,
keyboard controls, mobile disclosures, scale math integration, CSV consistency,
desktop hover, and all 265 QBs. Optional `QB_SCREENSHOT_DIR` captures review images.

## Version 1.1.0 — chart controls

- Linear, logarithmic, and signed-log Y scales. Logarithmic mode falls back to
  signed log with an explicit notice if values or bounds include zero/negatives.
  Signed log uses `sign(y) * ln(1 + abs(y))`; ticks display original axis units.
- Actual metric values, change from the real year-one baseline, and each QB's
  career z-score. Z-scores use an unweighted population mean and standard
  deviation across all available post-anchor seasons, independent of the visible
  time window. Missing/uncertain anchors, fewer than two values, or zero variance
  produce an unavailable normalized line, never an invented value.
- Overlay or separate QB charts with identical X and Y axes. Hover/focus and a
  persistent spotlight fade other lines. Sparse markers, line strength, graph
  height, fitted/zero/custom bounds and three presets help manage crowded views.
  Custom clipping and unavailable normalization are disclosed. The table, CSV
  and all-filtered summary always retain actual values for the selected metric.
- Existing saved selections migrate automatically; new settings use the same
  localStorage key. Reset graph settings retains the cohort and player selection.
- The masthead displays `v1.1.0` and the first seven characters of Render's
  automatically supplied `RENDER_GIT_COMMIT`, linked to the exact full commit.
  No new Render variables are required. Outside Render it says `local build`;
  there is no hard-coded or guessed deployment SHA. Data coverage is separate
  and remains through 2024. The badge identifies the build, not a live claim
  that it is the newest GitHub revision.

Validation: Python cohort/theme tests plus
`node --test tests/test_qb_chart_math.cjs`. Browser checks cover overlay/separate
charts, signed-log fallback, positive log, custom bounds, persisted settings,
265-player selection, keyboard/touch inspection, CSV and responsive layout.

## Research rules

- Regular season only. A QB must have at least one season since 1970 with
  **12 starts for one team**. Combined 2TM/3TM totals alone cannot qualify.
- Year 1 is the earliest qualifying season in available career history, including
  pre-1970 history. Graph observations start in 1970. Veterans do not reset then.
- Year 2 is **the immediately following calendar season**, even if the player
  starts fewer than 12 games. The optional year-two threshold is explicitly
  labeled because it introduces survivor selection.
- Careers keep all subsequent observed QB seasons. No interpolation across
  missing seasons, no fabricated zero, no automatic assumption of retirement.
- The names-on-X / starter-years-on-Y view is included as “Years by quarterback.”
  Performance views put years on X, the selected metric on Y, one line per QB.
- Team changes use two half-segments joined at the midpoint between seasons.
  Multi-team annual totals are gray diamonds; unavailable within-year splits
  are not invented. Historical city codes are retained. Colors are franchise
  identifiers, not an exact history of uniform colors.
- Hall of Fame is actual induction through September 28, 2026. “Not inducted”
  includes active and not-yet-eligible players, with no prediction of candidacy.
- Default metric is ANY/A minus the league aggregate ANY/A in that season.
  League totals sum each player's season exactly once, including non-QB passes.
  This calculated metric is **not PFR's ANY/A+**. All regular-season stats, not
  only games started, contribute to the rate and total statistics.
- Median change and improvement rate refer to **all filtered players with paired
  observations**, not merely selected lines. Missing pairs stay visible in the
  table and denominator count, but do not receive an imputed performance value.

## Source coverage

The included snapshot has 265 confirmed qualifying QBs and covers 1970–2024.
It is PFR-derived data from public repositories, not a direct/live PFR export.
Direct PFR requests returned HTTP 403 during this build. The UI therefore does
not claim exhaustive reconciliation with the live database or current coverage.
**2025–2026 are absent.** The recent mirror's 2024 and 2025 files were partial
season snapshots and were rejected; 2024 was replaced by a separate full table.

`daily_flyer/data/qb_sources.json` records the public source trail;
`qb_seasons.json` embeds that manifest and SHA-256 hashes of the input files.
The pre-2010 archive uses commit `1504cc5da12784c939385264602f115dc3766a68`
of `micahks/nfl-hof-predictor`. Only its pre-2010 season rows are used. Its 2020
rows are partial and are not used. Profile positions are mapped from the PFR
player directory archived in `NossaGTS/pfyscraper`; players with a secondary QB
position but primary receiver/running back/tight end position do not acquire QB
qualifying seasons from starts at another position. An explicit QB record can
identify a QB season in these profiles.

The 2000 league ANY/A baseline is intentionally unavailable: the source has
missing sack fields for Jeff Feagles's one passing attempt. The same blank fields
are present in the indexed PFR Seattle 2000 passing table. This is not silently
assumed to mean zero. Raw quarterback ANY/A and passer rating can still be used;
the relative metric displays the gap and identifies it in its help text.

The raw historical archive has no pre-2010 team split rows for multi-team
seasons. Such a total cannot establish eligibility. An earlier ambiguous total
marks the player's anchor uncertain, which excludes its pair from summary
statistics. Currently no included player's anchor needs that flag.

PFR exports can contain **two `Yds` columns**: passing yards and sack yards.
The importer keeps both; using `csv.DictReader` directly would overwrite passing
yards with sack yards. The 2024 mirror also has spreadsheet-corrupted QB win/loss
records. Those records are not used or displayed.

## Rebuild or extend the snapshot

Download the pinned public source CSVs listed in the manifest or use locally
saved PFR exports. The script reads files only and never bypasses access controls.

```bash
python scripts/build_qb_data.py \
  --history /path/to/nfl_player_stats_by_season_2020.csv \
  --recent /path/to/pro-football-reference-2010-2024-passing.csv \
  --players /path/to/player_list.csv \
  --hof '/path/to/Hall of Fame List.csv' \
  --annual 2024=/path/to/2024_nfl_passing_yards.csv
```

To add 2025, supply another `--annual 2025=/path/to/pfr_2025_passing.csv`.
Use a **complete regular-season passing table with all player rows, team splits,
games and games started**, not only rows already filtered to 12 starts; low-start
year-two observations must remain available. Preserve `Player-additional` PFR IDs.
The importer verifies unique player/team/year keys and rejects an annual file
whose maximum games played is below the season length. That check is necessary
but not sufficient: compare player counts, totals, traded rows and completeness
before accepting a new source. Update the manifest's coverage notes and hashes,
and update snapshot assertions after reviewing the extended data.

Run `python -m unittest discover -s tests -p 'test_qb_year_two.py'` for the cohort,
parser, actual source edge cases and Flask theme integration tests.

## Interaction

Search names/teams; filter first qualifying decade, team at any point and Hall
status; sort by name, anchor date, observed career span or year-two change.
Selection and settings persist in local storage under `qb-year-two-v1`.
Chart points support hover, touch and keyboard focus. A numeric table and CSV
comparison export provide alternatives to reading colored lines. Mobile charts
scroll within their own region. There is no automatic data refresh.
