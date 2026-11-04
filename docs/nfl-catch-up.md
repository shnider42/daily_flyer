# Back in the Huddle — NFL Catch Up

A new DailyFlyer v2 product adapted from Infierno Liberado's Catch Up model.
Time away and familiarity are separate. All three awareness levels select the
same facts; “A little” adds definitions, “The basics” connects changes, and
“Very well” expands the supporting details. Nothing here is a live news feed.

## Edition and evidence

Reviewed November 4, 2026: 121 completed regular-season games (Weeks 1–8),
15 scheduled Week 9 games, all 32 teams, and ten sourced editorial stories.
Eight stories cover October 29–November 3; two are offseason reminders.
Dates display in America/New_York. Injuries are dated reports, not current
availability guarantees. The UI shows coverage limits and warns as it ages.

Score provenance: ESPN's public scoreboard JSON, requested with explicit
year=2026, season type=2 and week. This is an unofficial, changeable data
endpoint, so the site publishes a validated snapshot and does not depend on
it at runtime. The collector fails closed on missing weeks/teams or wrong
season. It does not refresh the editorial review date.

Standings are computed from completed results. Equal winning percentages use
alphabetical ordering, explicitly not NFL tiebreakers or playoff seeds. Ties
count as half a win. Preseason and future games are excluded from records.

## Build and deployment

- Flask route: `/v2?product=nfl_catch_up`; root product: `ROOT_PRODUCT=nfl_catch_up`
  when `F9_ROOT_PRODUCT` is unset.
- Build: `python scripts/build_nfl_catch_up.py`
- Published directory: `nfl_catchup`; self-contained HTML, no runtime assets,
  web fonts, third-party scripts, accounts, keys, or tracking.
- Branch: `feat/nfl-catch-up` in `shnider42/daily_flyer`.
- Render static build: `node --test tests/nfl_catch_up.test.cjs && test -s nfl_catchup/index.html`
- Validation: `node --test tests/nfl_catch_up.test.cjs` and
  `python -m pytest tests/test_nfl_catch_up.py tests/test_rlcs_catch_up.py`.

## Update process

1. Run `python scripts/refresh_nfl_catch_up.py --through-week 8 --as-of 2026-11-04`
   with the intended completed week and cutoff date. The as-of date is exclusive
   for completed-game validation; choose the day after the last game.
2. Review `daily_flyer_v2/data/nfl_scores.json`. Cross-check latest results with
   official team game reports. Investigate discrepancies before publishing.
3. Add or revise stories in `daily_flyer_v2/data/nfl_catch_up.json`, retaining
   event, publication and review dates separately. Sources are beside each
   story; “Our context” is editorial explanation, not a quote or prediction.
4. Update the edition copy, date inputs, presets and edition-specific test
   assertions when rolling to a new edition. The initial template is explicitly
   the November 4 edition; updating scores alone is not an editorial update.
5. Rebuild, validate, inspect desktop and narrow layouts, then commit source
   and the matching export. Render deploys this branch independently.

## Interaction and privacy

Team/date/topic/search filters intersect for stories. Game history has its own
week selector, replacing the date filter; standings always show full-season
records. Empty story coverage is explicit and can lead to available games.
Preferences are optional localStorage; malformed settings are normalized.
Shared URL fragments always start with outcomes hidden for the recipient.
Outcome protection removes result headlines, summaries, source links, metrics,
records and standings from rendered views. Individual reveals are session-only.
Re-enabling protection clears all individual reveals. External sources can
still contain spoilers. No analytics or server-side profile collection.

The rendering/product registration reuses the existing DFE v2 engine; no other
deployment branch or product is changed by this feature branch.
