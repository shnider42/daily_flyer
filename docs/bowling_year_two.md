# Bowling in Soph(more) Slump(?) · v3.3.1

Repository: `shnider42/daily_flyer`, branch `feat/qb-year-two-explorer`.
Direct entry: `/?theme=bowling_year_two` (hyphenated alias also works).
Keep `DEFAULT_THEME=qb_year_two` and the existing Render build/start commands.
The shared sport selector now links football, baseball and bowling. No production
dependency, API key, scraping at page load or hosting configuration is added.

## What visitors can do

- Start with Belmonte / Tackett / Simonsen, biggest average drops, biggest gains,
  cash-rate careers, or the descriptive years-three-to-five study.
- Switch among Simple, Guided and Full detail using the shared presentation
  preference. Bowling selections and pins have their own local-storage key.
- Compare scoring average, cash rate, nominal earnings per event, nominal season
  earnings, profile-table titles, cashes, and events.
- Use a shared, named-line career graph (the default), separate panels, first-two-year comparisons,
  tall / regular / compact heights, highlighting, baseline differences, and CSVs.
  Explicit axes show the statistic vertically and either calendar years or years
  from each bowler's first substantial season horizontally. Both layouts share
  the same value and time bounds. Source years retain gaps without interpolation.
- Add/remove bowlers in every detail mode, including mobile Simple Mode. The
  searchable picker and a second button above the graph are always accessible.
  Searching names/hometowns affects only the picker: existing lines and the
  research cohort do not disappear while you look for another bowler.
- Filter bowling hand, change the baseline threshold
  to 5 / 10 / 15 events, optionally require that workload in year two, or exclude
  first/second-year pairs involving 2020. All matching players can be selected;
  there is no 25-player display cap.
- Inspect points by touch, focus or keyboard, retaining pins across reloads and
  width changes. Height-only browser chrome changes do not rebuild the graph.

## 3.3.1 preset and saved-view compatibility

Factory comparison stories now use scoring/metric values against calendar years
on one shared graph. The first story remains Belmonte, Tackett and Simonsen;
scoring average in pins per game is its default metric. The alternate horizontal
clock explicitly says years from the first 5/10/15-event profile season, not
years since becoming a professional or joining the PBA.

Named line labels sit beside their last measured points, with vertical spacing
to avoid collisions. The legend lists every selected name. Crowded graphs still
draw every selected player; highlighting reveals that bowler's direct label.
Missing data and all first/second-year calculations are unchanged.

Exact untouched 3.3.0 factory slots migrate to the new graph defaults. Any edited
label, note, player choice, filter or display setting prevents that slot migration;
older custom presets instead acquire `timeline=career` to retain their old time
alignment. Exact untouched old browser defaults likewise upgrade; customized
local views, height, selection and pins survive. Old JSON backups remain valid.
No live preset database or user's custom configuration is forcibly reset.

## Source and limits

The snapshot was retrieved on September 30, 2026 from PBA.com. The PBA directory
filter `current_season=1` returned 83 profiles across four pages. Of those, 79
contained usable Career Stats rows: 813 profile seasons through **2025**. Four
profiles without usable rows are listed in `bowling_sources.json`. The directory
flag is not independent proof of 2026 participation, and this is not the entire
historical PBA population. Roster selection creates survivorship/selection bias.

Each player retains their direct PBA profile URL. Each fetched source has a
SHA-256 in the manifest. No photographs, official logos or article copy are
included. The app is independent and is not represented as PBA-endorsed.

Career Stats tables can include broader competition than the national Tour.
Their event, title, average and earnings figures sometimes differ from national
Tour leaderboards and official award articles. The app consistently labels them
as profile statistics and **profile titles**, rather than silently combining
incompatible figures. For example, Tackett's 2025 profile average and earnings
are 229.690 and $437,540; those are the source-table figures, not a claim about
his official national Tour award average or annual Tour earnings.

The clock begins at the first printed year with at least ten profile events
(configurable). It does not claim to identify an official rookie year. Year two
is that numeric label plus one, never the next available row. Historical season
boundaries are not necessarily calendar-year boundaries. In particular, many
profiles jump from 2011 to 2013; 2012 stays missing. Missing averages do not reset
the clock. Blank averages and source 0.000 placeholders become null. Source zero
counts remain zero. Rates with zero/missing denominators remain unavailable.

Cash rate = cashes / events × 100, reported in percent; its changes use percentage
points. Earnings per event = nominal dollars / events. No inflation, oil-pattern,
venue, field-strength or era adjustments are implied. No season is assigned zero
games or zero performance merely because it is absent.

The later-career study is descriptive, using the full filtered roster independently
of chart selection. It requires a measured first/second-year pair and **all three**
recorded values at baseline+2, +3 and +4, with a complete follow-up window through
2025. It reports exclusions and Pearson/Spearman correlations. Later values are
unweighted means of the three season rates, not game-weighted aggregates. There
is no Hall-of-Fame predictor, causal claim, or claim of validated incremental
forecasting. Missing follow-up is never coded as failure.

## Rebuild the source snapshot

```sh
python scripts/build_bowling_data.py --cache-dir /tmp/pba-profile-source-cache --through 2025
```

Use a new cache directory to retrieve fresh responses; reusing one reproduces the
cached inputs. The builder checks the directory scope, parses an exact header
schema, rejects duplicates/impossible counts, preserves missing values and writes
the compiled files only after all fetches/parses succeed. Source HTML is a local
build input; only extracted facts and provenance ship. Inspect the diff and update
coverage assertions when deliberately extending the snapshot. There is no live
or scheduled refresh. Biography updates do not extend statistical coverage.

## Shared presets and durable storage

The footer editor or `preset_admin=1` opens bowling's independent five-slot editor.
Capture a current view, edit labels/notes, choose fixed bowlers or dynamic ranks,
preview without publication, or save all five. All text is inert. GET/PUT
`/api/bowling-presets` and POST `/api/bowling-presets/validate` use strict schema
validation, same-origin write checks, 64-KiB requests, transactional SQLite writes
and revision conflicts. Public write access is intentional, as in the other sports.

Storage priority: `BOWLING_PRESET_DB`; a sibling of `QB_PRESET_DB` when configured;
`YEAR_TWO_DATA_DIR`; an actual mounted `/var/data`; then temporary
`instance/bowling_presets.sqlite3`. A configured path must be on a persistent
volume to survive Render redeploys. No paid resource was provisioned.

Saved presets and drafts also have browser recovery copies. A factory response
after a server reset does not erase the last saved backup. Restore/import loads
a draft; Save explicitly publishes it. JSON export provides a portable backup.
Corrupt storage yields a visible error and is not overwritten. Football/baseball
data, calculation modules, source snapshots and preset formats are unchanged.

## Verification

```sh
python -m unittest tests.test_qb_year_two tests.test_qb_presets tests.test_baseball tests.test_preset_storage tests.test_bowling
node --test tests/test_bowling_math.cjs tests/test_qb_chart_math.cjs tests/test_qb_research.cjs tests/test_baseball_research.cjs tests/test_baseball_chart_guide.cjs tests/test_year_two_view.cjs
CHROMIUM_EXECUTABLE=/path/to/chromium node tests/test_bowling_browser.cjs
```

The bowling browser suite uses temporary databases and checks real desktop/mobile
geometry, all five stories, larger selections, missing-data math, research, CSV,
cross-sport navigation/state, shared saves/conflicts, inert labels, import/export,
server-reset recovery and blocked browser storage. Existing level and baseball
chart browser suites cover the shared selector and presentation integration.
