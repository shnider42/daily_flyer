# Baseball year-two explorer · v3.0.1

Repository: `shnider42/daily_flyer`, branch `feat/qb-year-two-explorer`.
Theme: `baseball_year_two` (hyphenated URL alias also works).

## Entry points

- Keep `DEFAULT_THEME=qb_year_two`: the prominent sport selector opens baseball.
- Direct URL: `/?theme=baseball_year_two`.
- Baseball preset editor: footer button or `/?theme=baseball_year_two&preset_admin=1`.
- Existing Render build/start commands and requirements are unchanged.
- No data API keys, live scraping, external chart packages or scheduled jobs.

Football's implementation is preserved, with only its sport navigation and
displayed version changed. Baseball uses its own DOM, data, local saved views,
research cohort and preset database. Generic chart/statistical calculations are
reused without changing them. Two-way players have independent hitting/pitching
clocks and can appear in both datasets; counts are role-careers, not unique people.

## Data provenance and license

SABR's Lahman Baseball Database 1871–2025 CSV release is the statistical source.
Official release: <https://sabr.org/lahman-database/>. Its official readme was
retrieved separately and its CC BY-SA 3.0 notice checked. The CSVs were obtained
from the unmodified distribution mirror pinned at:

`cbwinslow/lahman-database-csv@0377e0b8d3f1b8f6710cc4faee7d842d0e81f344`

The compiled `daily_flyer/data/baseball_2025.json.gz` snapshot and its provenance
file are included in the repository. Source table SHA-256 hashes are recorded in
`baseball_sources.json`. The derived database remains **CC BY-SA 3.0**, with
attribution and transformations stated in `BASEBALL_LICENSE.md`, on the site,
and in CSV exports. It is offered as a download from the rulebook.

There is no Baseball-Reference scraping or API dependency. Player links use
Lahman's `bbrefID` to link to Baseball-Reference for additional reading. The site
does not claim its derived measures are Baseball-Reference's adjusted statistics.

Reproduce using the unchanged CSV tables:

```sh
python -m scripts.build_baseball_data /path/to/lahman_2025_csv
```

The builder makes no network requests. It aggregates AL/NL stints before
calculating rates and keeps missing components distinct from zero. Pitching
innings use outs / 3, not a floating interpretation of baseball's `5.2` notation.
The packed snapshot has 2,852 hitter careers / 23,053 seasons and 3,802 pitcher
careers / 24,535 seasons. Each role is fetched on demand; the browser reconstructs
named season records from the column definitions. Ordinary football requests
do not read or transfer the baseball dataset.

## Scope and year definitions

- First substantial season: 300 PA for hitters or 150 outs (50 IP) for pitchers.
- PA = AB + BB + HBP + SH + SF. Catcher interference is not a Lahman input here.
- Year two is the very next **calendar** year, even if below that threshold.
- Cohort first years: **1954–2025**, AL/NL regular seasons. Full older histories
  are checked so established players do not acquire a false 1954 first year.
  Older batting seasons with at least 300 known PA components disqualify a later
  entry even when the full historical PA statistic is unavailable.
- 1954 is the beginning of separately recorded sacrifice flies needed for
  consistent OBP and PA. These are study conventions, not MLB rookie eligibility.
- Missing year two remains missing; charts never skip forward to the next
  observed season or connect across an unobserved year.
- A filter can require substantial year-two workload; another omits pairs
  involving 2020. No schedule prorating is performed.
- HOF induction as a **player**, frozen through 2025. The upstream table also
  contains 2026 ballot entries; any induction later than 2025 is explicitly cut.
- Historical and current team codes retain separate identifiers; team filtering
  is “played for this code at any point,” not a franchise-history reconciliation.
- No minors, postseason, Negro League analysis, WAR, Statcast, park-adjusted
  OPS+/ERA+, or pre-1954 entry cohort. These limitations appear in the rulebook.

There are **35 hitting/fielding measures** and **39 pitching/fielding measures**.
Counts, rates and fielding measures are grouped in the picker, with formulas and
direction notes. League-relative OPS is player OPS minus aggregate AL/NL OPS;
league-relative ERA is aggregate AL/NL ERA minus player ERA. Neither is park
adjusted. Fielding is summed across positions and does not measure defensive
value. Intentional walks, sacrifices, BABIP and several fielding totals have no
automatic “higher means better” interpretation.

## UI and research

Five top-level stories and Alt+Shift+1–5 shortcuts reproduce the football flow.
Defaults include hitting slumps, pitching leaps, Ortiz/Betts/Devers, a Hall
question and pitcher staying power. Shortcuts include a current-data takeaway;
changing controls clears the story. Undo restores the pre-shortcut view across
multiple shortcuts. Input fields do not trigger hotkeys.

Comparison supports Y1→Y2, later seasons and observed career span; linear,
signed-log, log and rank spacing; raw / change / career z-score views; shared
scales in separate panels; player, team or Hall colors; touch/keyboard season
inspection; persistent pins; player/team/era/Hall/workload filters; raw CSVs.
“Select all filtered players” selects the entire cohort. The visible “Players to
display” control offers 25, 50, 100, 250, 500 or all selected players; it defaults
to all, without trimming the underlying selection. Counts distinguish selected,
shown and filtered-out players. Search reaches every player; the option list shows the first
300 matches, while the table and CSV contain the entire filtered set.

The research cohort is independent of selected chart lines, but honors the
visible filters. It requires measured Y1 and Y2 statistics and an equally mature
follow-up window for successes and failures:

| Outcome | Follow-up | Definition |
| --- | --- | --- |
| Year-three opportunity | 1 season | Reaches role's workload threshold in Y3 |
| Staying power | 5 seasons | At least three substantial seasons in Y3–7 |
| Future performance | 5 seasons | Mean selected metric across at least three measured seasons in Y3–7 |
| All-Star selections | 10 seasons | Number of distinct AL/NL selection seasons, not games played |
| Awards | 10 seasons | Any MVP or Cy Young award |
| Hall induction | 25 years | Player induction after Y2 and within the window |

The future mean is an unweighted annual mean, including for rate measures; it is
explicitly a survivor analysis. No season is no qualifying workload season for
the binary opportunity outcomes; it is never imputed as zero performance.

Research offers Pearson/Spearman relationships, optional deterministic 400-draw
bootstrap intervals for Pearson, top/bottom-third trajectories, point inspection
and full eligible-cohort export. “Explore every stat” ranks exploratory Spearman
relationships for every measure and lets a visitor open any row in research. It
warns that sample sizes differ and multiple comparisons invite chance findings.

Incremental prediction compares Y1 + entry year with Y1 + Y2 + entry year. The
oldest approximately 75% of entry-year cohorts train; the latest cohorts test;
an entry-year tie never straddles the split. Standardization uses training data.
Binary outcomes use existing ridge logistic calculations; All-Star prediction
is any selection. Continuous future means use standardized ridge least squares.
The report shows Brier/AUC or mean squared error and a training-average baseline.
Tiny samples, no outcome variation and few test events are surfaced. This is one
chronological split, not a causal claim or a guaranteed individual forecast.
There is no confidence interval on the model score difference. Age, injuries,
position, role, parks and schedules are not fully controlled; Hall/team filters
use later information and are not prospective subgroup predictors.

## Public baseball presets

No login is required, as requested. Five immutable slots have editable label,
title, plain-text note and view settings. They can target hitters/pitchers,
comparison/research/stat scan, any available metric, fixed players, all matching players or ranked
selections, chart controls, filters and outcomes. Draft previews, current-view
capture, slot factory reset and versioned JSON export/import are provided.
Save publishes all five to new page loads; open pages retain their copy until
reload. Conflict detection preserves drafts instead of overwriting another save.

Routes: GET/PUT `/api/baseball-presets`, POST `/api/baseball-presets/validate`.
Rankings and fixed selections can include the complete role dataset. Older
presets/backups automatically acquire the default display setting. Baseball
JSON is bounded to 1 MiB and validated against dataset IDs and enums; football
retains its 64-KiB bound. Labels and
notes remain inert text. Corrupt stores cause a factory fallback for the page and
a visible 503 in the editor; saves do not overwrite the corrupt database.

SQLite storage priority:

1. `BASEBALL_PRESET_DB` if set.
2. `baseball_presets.sqlite3` in the directory containing `QB_PRESET_DB`.
3. Repository `instance/baseball_presets.sqlite3` (temporary default).

For durable Render saves, the path must be on an attached persistent disk, just
as with football presets. Setting an environment variable alone does not make it
durable. No paid resource was provisioned. Existing attached QB preset storage
can host baseball presets beside it; the two databases stay separate.

## Validation

```sh
python -m unittest tests.test_qb_year_two tests.test_qb_presets tests.test_baseball
node --test tests/test_qb_chart_math.cjs tests/test_qb_research.cjs tests/test_baseball_research.cjs
```

Browser scripts need Playwright and `CHROMIUM_EXECUTABLE`:

```sh
node tests/test_qb_browser.cjs
node tests/test_qb_preset_admin.cjs
node tests/test_baseball_browser.cjs
```

The baseball browser test isolates its SQLite files in a temporary directory.
It exercises both roles, every-stat mode, binary and continuous model reports,
bootstrap, missing Y2, CSVs, mobile widths, pin persistence, sport isolation,
shared editing, preview isolation, stale conflicts, backup/import and network
failure recovery. `BASEBALL_SCREENSHOT_DIR` optionally saves review screenshots.
The three previously documented failures in the unrelated legacy theme-platform
suite were not changed. Live Render deployment is separate from branch push.
