# Soph(more) Slump(?) — quarterback explorer

Theme: `qb_year_two` (URL alias `qb-year-two`). Base: `staging` at
`2a053196d33f6b50299b8c342cc2316960314e21`. All implementation files are isolated;
the shared renderer, other existing themes and default theme are unchanged.

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

## Version 3.3.0 — bowling / PBA profiles

The shared selector now includes `bowling_year_two`, alongside football and
baseball. Bowling has its own PBA profile snapshot, career comparisons, five
stories, descriptive follow-up study and recoverable shared presets. Existing
Render settings continue to work. See [bowling_year_two.md](bowling_year_two.md)
for source scope, first-substantial-year definitions and coverage limits.

## Version 3.1.0 — choose your detail level

A prominent three-button control sits directly below the sport selector:

- **Simple Mode** (default): story shortcuts, graphs and current-data explanations;
  dense filters, numerical tables and model scorecards are tucked away.
- **Guided**: player selection and metric controls, plus plain-English graph and
  statistic explanations. Full model diagnostics remain out of the way.
- **Full detail**: the complete existing explorer and exports.

The preference is browser-local (`year-two-detail-v1`) and shared across sports.
Like the WWII Simple View pattern, this is presentation-only: it does not replace
selections, filters, chart transformations, pins, preset undo snapshots, model
results or unsaved editor drafts. The editor remains fully available at every
level. Important workload, missing-data, follow-up and exploratory-study caveats
remain visible. Existing analyses are not recalculated when changing levels.
Baseball's stat scan provides three live question cards in Simple/Guided and the
full metric table in Full detail. Nothing is inferred from preset titles alone.

Coverage: `tests/test_year_two_view.cjs` and
`tests/test_year_two_levels_browser.cjs`, plus the original explorer regression
suites explicitly selecting Full detail. No new data requests or dependencies.

## Version 3.0.0 — football / baseball switch

The large sport selector opens the original quarterback explorer or the new
`baseball_year_two` theme. See [baseball_year_two.md](baseball_year_two.md) for
source licensing, cohort definitions, all-stat research and baseball presets.
Football's calculation code, source snapshot, controls and preset database are
unchanged. The sport pages have separate URLs, local saved views and public
preset endpoints; baseball data is only loaded when its page/API is requested.
`DEFAULT_THEME=qb_year_two` continues to work. No Render configuration change
is needed to make the switch available after deploying this branch.

## Version 2.3.0 — public shared preset editor

Open the footer's **Preset editor** button, or add `preset_admin=1` to the query
string (`/?theme=qb_year_two&preset_admin=1`). No login or API key is required.
This is intentionally public write access, not security through an obscure URL.

- All five fixed shortcut slots can change labels, headings, plain-text notes
  and destination mode. Film options include dynamic improvement/decline rankings
  (1–25 QBs), specific players, every metric, view, window, filter, normalization,
  scale, range, layout, colors, markers, line strength and height. Research options
  include metric, outcome, predictor, era and visible Hall groups.
- Edits stay in a draft until Save. Switching slots keeps their draft values.
  Preview validates and applies the draft without publishing it. “Use my current
  view” captures the active film/lab controls; film capture uses explicit players.
  Factory reset and JSON import affect drafts only. Export backs up all five slots.
- Published presets are embedded into subsequent page loads. Saving updates the
  editor's own shortcut buttons immediately; other open pages use their existing
  copy until reloaded. Original factory settings keep the original story text;
  changed configurations generate metric/cohort-aware summaries, not stale claims.
- The new, isolated `/api/qb-presets` blueprint supports GET and revision-checked
  PUT; POST `/api/qb-presets/validate` is read-only. Saves are SQLite transactions,
  coordinating Gunicorn workers. Concurrent stale saves return 409 and retain the
  browser draft rather than silently overwriting someone else's edits.
- No authentication, but a strict schema still constrains fields, IDs, enums,
  finite bounds and sizes. JSON requests are limited to 64 KiB; browser cross-site
  requests are rejected. Labels/notes are inert text. A broken store does not get
  silently replaced: the explorer can show factory presets while the editor
  reports the storage error. Public write access allows anyone on the site to
  change presets; do not repurpose this endpoint for sensitive settings.

### Storage on Render — required for durable edits

No new production package is needed. Default storage is
`instance/qb_presets.sqlite3`, outside the publicly served `daily_flyer` directory.
It is **temporary on Render** and can be lost on restarts or redeploys. The editor
warns about this on opening and saving. Existing static deployments have no newly
provisioned disk, database or paid service.

For durable shared edits, attach a persistent disk to a paid web service at
`/var/data`, and set `QB_PRESET_DB=/var/data/qb_presets.sqlite3`. The environment
variable alone is not sufficient: its path must actually be on the persistent
disk. Use one service instance with its attached disk. Free Render services do
not support persistent disks. Export before changing storage or deployment,
then import and save the backup afterward. Storage-path confirmation is shown
without claiming the app can prove the volume is durable.

### Validation

Run `python -m unittest tests.test_qb_year_two tests.test_qb_presets`, the two
existing JavaScript calculation suites, and both browser scripts:
`tests/test_qb_browser.cjs` and `tests/test_qb_preset_admin.cjs`.
The admin browser test uses a unique temporary SQLite database, never the live
preset store. It covers shared saves across browsers, preview isolation, editing,
mode switching, conflicts, inert text, capture, backups and mobile widths.
The broader legacy platform suite has three pre-existing unrelated content
assertion failures (birthday, Irish visual-lab and Nissan Z); the same failures
were reproduced using this branch's pre-change `web.py`.

## Version 2.2.0 — one-tap stories

- Five shortcuts above the season definition: Biggest slumps, Biggest leaps,
  Brady vs. Manning, Hall of Fame signal?, and Slumps & Super Bowls. Each sets
  the relevant existing controls, opens the right mode, and moves focus to a
  plain-language takeaway beside the loaded view. No new data source or model.
- Slumps/leaps use league-relative ANY/A, rank actual year-one-to-two changes,
  and select the top four negative/positive changes. Both seasons must qualify
  for 12 starts with one team and have a usable pair. The survivor restriction
  and denominator are explicit (124 comparable QBs in the current snapshot).
  Separate linear panels share axes, with zero at each QB's year-one baseline.
- Brady/Manning is a labeled two-player example, showing the first ten starter
  years on shared linear axes in actual league-relative efficiency units.
- The Hall preset uses year-two efficiency and the existing fixed 25-year
  outcome/model. Its takeaway puts sparse held-out outcomes ahead of a prediction
  verdict. The Super Bowl preset compares any decrease with any increase in
  efficiency, reporting counts and rates of winning starters in the following
  ten seasons. Ties are disclosed, and these descriptive rates are not causal.
- Both lab shortcuts reset the lab's measure, predictor, era and group toggles.
  Film shortcuts reset film filters and graph settings. They do not change the
  other mode's underlying settings. Normal manual exploration remains available.
- “Restore my previous view” returns to the state before the first shortcut in
  this visit, even after trying several stories: film state and pin, lab state,
  group visibility, selected QB, scenario inputs/result and disclosure state.
  The undo snapshot is in-memory only; saved film settings still work normally.
- Guides disappear when their relevant controls change, but survive pinning and
  resizing. Result numbers are calculated from the actual bundled cohort rather
  than hard-coded into copy. Reload retains film settings, not a stale guide.
- Optional Alt+Shift+1–5 shortcuts ignore inputs, selects, editable areas, repeat
  and composition events. Native buttons also support keyboard and touch.
- Validation: all 24 calculation/theme tests plus desktop/mobile browser checks
  for every shortcut, ranking order, control reset, dynamic rate denominators,
  undo across modes, stale-guide removal, hotkey guards, and 320/390px layouts.

## Version 2.1.0 — make the year-two question the entry point

- The landing page asks whether starter year two matters and defines the clock
  in a visible three-step strip: first single-team 12-start season, next calendar
  season (even with fewer starts), then later outcomes. This is not necessarily
  the second NFL season.
- Fresh visitors begin at Year 1 → 2 with the existing four example quarterbacks.
  Saved views, filters, selections and pins are retained. Advanced graph settings
  start collapsed on desktop as well as mobile. A visible name/color key makes
  the selected lines identifiable without opening the management controls.
- View questions distinguish the two-season comparison, later performance and
  career length. Inspecting any selected season or line also displays the actual
  year-one and year-two values, signed change and metric-aware direction. Missing
  pairs remain unavailable; normalization never changes this readout.
- The “Test what year two tells us” handoff opens the research lab with the same
  measure, preserving film-room state. The lab explicitly uses its full eligible
  cohort, independent of film-room line selection and filters.
- Research questions, axis reading instructions and uncertainty explanations
  respond to the measure, predictor, outcome and era. Year-one-only comparisons
  and later efficiency are labeled distinctly. Plain-language model results
  explain whether adding year two reduced held-out errors; they do not equate
  association with incremental prediction or causal significance.
- The comparison/era controls and cohort exclusions are expandable in the lab;
  the measure and outcome stay visible. All previous modes, scales, exports,
  outcome rules and source data remain available. No data refresh is included.
- Validation includes the 24 existing Python/JS calculation tests and browser
  checks for the fresh-entry view, saved career view, pinned year-two readouts,
  research handoff, direction for interceptions, empty cohorts and mobile widths.

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
