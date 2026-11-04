# HUDDLE — NFL Catch Up

A DailyFlyer v2 product adapted from Infierno Liberado's Catch Up model.
Time away and familiarity are separate. All three awareness levels select the
same facts; “A little” adds definitions, “The basics” connects changes, and
“Very well” expands reporting and available game statistics.

## Edition and evidence

Reviewed November 4, 2026. The complete 272-game regular-season schedule covers
18 weeks, 32 teams and 17 games plus a bye per team. Includes 121 completed games
through Week 8 and 151 upcoming games. Every completed game has validated quarter
scores, eight team statistics and player leaders. Ten selected editorial stories
provide additional context. Eight cover October 29–November 3; two are offseason
reminders. This is a dated edition, not a live feed.

Score provenance: ESPN's public scoreboard JSON, requested with explicit
2026/regular-season/week parameters, and game-summary JSON validated against
scoreboard identities and final scores. Each quarter total must equal its team's
final score. These unofficial endpoints can change; the site publishes a snapshot
and has no runtime data-feed dependency. The collector fails on incomplete weeks,
wrong seasons, duplicated games or teams without 17 games. Missing detail data
is explicitly marked rather than invented. The collector does not change the
editorial review date. Its temporary detail cache is under /tmp/huddle-game-details;
remove that cache before refreshing finalized games to capture source corrections.

Dates display in America/New_York. Unconfirmed dates/kickoffs display TBD rather
than provider placeholder timestamps. Future games never enter records or charts.
Injuries are dated reports, not current availability guarantees. The UI states its
coverage and warns as the edition ages. Automated game reads use only scores and
quarter totals; they are not full recaps. Charts use quarter-end cumulative points,
not individual scoring plays.

Standings derive from completed results. Equal winning percentages use alphabetical
ordering, explicitly not NFL tiebreakers or playoff seeds. Ties count as half a win.
Preseason and undetermined postseason matchups are outside this regular-season guide.

## Experience

- Night mode by default; optional day mode persists locally. A graphite dashboard,
  lime accents, score strip, 18-week navigator and mobile bottom navigation replace
  the original magazine layout.
- Catch up: date, team, topic and text filters; before/after records; sourced stories;
  next matchup; latest six results within the chosen date window.
- All games: every week, completed/upcoming filters, team/stadium search, close-game
  filter and batches of 48. The week selector replaces the catch-up date filter.
- Game detail: individual results, pre/post records, quarter table and chart, team
  statistics and player leaders. Future games show current-season context and
  confirmed schedule details, not forecasts.
- Team rooms: all 32 teams, full 17-game schedule and bye, cumulative wins, recent
  form, points scored/allowed per game, next matchup and available sourced stories.
- Standings: eight divisions and conference selection, with percentage bars.
- Learn: six concise explainers covering downs, scoring, schedule, playoffs, stats
  and interpreting reports.

## Build and deployment

- Flask: `/v2?product=nfl_catch_up`; root product `ROOT_PRODUCT=nfl_catch_up`
  when `F9_ROOT_PRODUCT` is unset.
- Build: `python scripts/build_nfl_catch_up.py`
- Output: `nfl_catchup/index.html`; embedded data, CSS and JavaScript. Team logos
  load from ESPN's image service with abbreviation fallbacks. No web fonts,
  third-party scripts, accounts, keys or analytics.
- GitHub branch: `feat/nfl-catch-up` in `shnider42/daily_flyer`.
- Render: `https://dfe-nfl-catch-up.onrender.com/`, static directory `nfl_catchup`.
- Render build: `node --test tests/nfl_catch_up.test.cjs && test -s nfl_catchup/index.html`
- Tests: `node --test tests/nfl_catch_up.test.cjs` and
  `python -m pytest tests/test_nfl_catch_up.py tests/test_rlcs_catch_up.py`.
  The Python test functions can also run directly when pytest is unavailable.

## Update process

1. Run `python scripts/refresh_nfl_catch_up.py --through-week 8 --as-of 2026-11-04`
   with the intended completed week and cutoff. Choose the day after the last game.
2. Review `daily_flyer_v2/data/nfl_scores.json`; cross-check recent results against
   official game reports and investigate discrepancies.
3. Review editorial stories independently, retaining event/publication/review dates.
   “Our context” is editorial explanation, not a quote or prediction.
4. Update edition copy, date controls and edition-specific test assertions together.
   Updating scores alone is not a complete edition update.
5. Rebuild, validate desktop and narrow layouts, commit source and matching export.
   Render automatically deploys this branch to the existing static site.

## Preferences and spoiler protection

Preferences live in optional localStorage; invalid settings normalize safely.
Shared URL fragments always start with outcomes hidden, including direct game links.
Protection removes result headlines, score-dependent labels, records, standings,
charts, stats and leaders from rendered views. The close-game filter is disabled
because it discloses a result characteristic. Individual reveals are session-only;
re-enabling protection clears them. Future previews also hide current records.
External sources may contain spoilers. No server-side profile collection.

The rendering/product registration reuses the DFE v2 engine. Other products and
other deployment branches are unchanged.
