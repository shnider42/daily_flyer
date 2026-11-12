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

English uses America/New_York for displayed game dates and kickoffs. The optional
Austrian German mode uses localized dates and Europe/Vienna kickoff times on a
24-hour clock. Result cutoffs and catch-up date filters continue to use Eastern
game dates in both languages, so switching language does not change records or
which results belong to a selected window. Unconfirmed dates/kickoffs display TBD
or its localized equivalent rather than provider placeholder timestamps. Future
games never enter records or charts.
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

## Austrian German variation

The header language selector includes **Deutsch (Österreich)** (`de-AT`), using Austrian
Standard German rather than dialect. English (`en-US`) remains the default.
Selecting Austrian German selects the Minnesota Vikings (`MIN`) for both the
catch-up team filter and the team room. Visitors can then select any other team;
their Austrian-mode selection and language survive reloads. Selecting another language restores the team filter and team room that were selected
before Austrian mode was enabled. Each new switch into Austrian mode starts with the
Vikings again.

The existing optional browser preferences store the language. Shared briefing
links include the locale and current team selection and still open with outcomes
hidden. The direct entry link
`https://dfe-nfl-catch-up.onrender.com/?lang=de-AT` also enables Austrian mode.
Changing the language updates the current preference without leaving a conflicting
language override in the URL.

Navigation, controls, generated game reads, team briefings, statistics and
explanations are localized. `static/nfl_catch_up/content-de-at.js` contains the ten
translated editorial stories, six beginner lessons, sixteen statistic definitions
and source-label translations. News headlines, official transaction descriptions,
scoring-play descriptions and research source excerpts retain their original
wording and are identified as original-language material. Team and player names,
scores, source links and the dated November 8 data snapshot are unchanged.

Kickoff dates and times use Vienna time, including daylight-saving transitions;
the interface identifies the time-zone difference from Eastern date filtering.
The Austrian display uses localized date and number formatting and a 24-hour clock.

Football questions carry the selected locale to the research service. Austrian
mode requests answers in Austrian Standard German and offers German question
starters and status messages. When generated answers are unavailable, the live
reference fallback searches German Wikipedia and labels its excerpts as reference
results. This language support does not activate written answers: the existing
server-side `OPENAI_API_KEY` requirement and the limitations below still apply.

## Hindi and Gujarati

The same header selector now offers **हिन्दी (Hindi)** (`hi-IN`) and
**ગુજરાતી (Gujarati)** (`gu-IN`) alongside English and Austrian German.
Direct links can set the language with `?lang=hi-IN` or `?lang=gu-IN`.
Language preferences survive reloads and are included in shared briefings.
Switching among English, Hindi and Gujarati preserves the followed team, team room,
familiarity level, date filter, theme and spoiler preference. The Vikings default
remains specific to entering Austrian German; leaving it restores the preceding
non-Austrian team preferences. Existing Austrian preferences and older shared links
remain compatible.

`static/nfl_catch_up/locale-hi-in.js` and `locale-gu-in.js` contain native-script
navigation, controls, status messages, generated game and team context, all ten
editorial stories, six beginner lessons and sixteen statistic definitions. The
renderer embeds Noto Sans Devanagari and Noto Sans Gujarati regular and bold WOFF
fonts in the single-page export, with their SIL Open Font License. Font sources and
license are in `static/nfl_catch_up/fonts/`. This avoids a separate font request;
Indic typography uses zero letter spacing and more room between lines for vowel
marks. Language names remain in their native scripts in every mode.

Hindi and Gujarati kickoff displays use **Asia/Kolkata**, a 24-hour clock, and
**IST (UTC+05:30)**. Localized dates may fall on the following day compared with the
US game date. Date filters and before/after record calculations continue to use US
Eastern Time, explicitly labeled in the game explorer. The source data snapshot,
team/player names, scores, standings calculations and source links are unchanged.
External reporting headlines, transactions and scoring descriptions keep their
original wording and are labeled accordingly.

The research service accepts both locales, requests native-script explanations at
the chosen familiarity level, and offers Hindi/Gujarati question starters and
messages. If generated answers are unavailable, reference search uses the
corresponding Hindi or Gujarati Wikipedia and labels source excerpts. Unicode
search tokenization preserves combining vowel marks and conjuncts. Adding languages
does not enable generated answers or change the existing service credentials,
limits or spoiler handling.

## November 8 data and team context

The edition now includes 134 final results (121 through Week 8 and 13 in Week 9), all 272 regular-season fixtures, 16 team box-score statistics, 1,159 scoring plays and the available player rows in ten box-score categories. `through_week` means **fully completed weeks**; `latest_week` is the newest week containing a final. Records and date-window narratives count every final, including a partly completed week.

`python scripts/refresh_nfl_catch_up.py --through-week 8 --as-of 2026-11-08` collects scores and details. `python scripts/refresh_nfl_reporting.py --as-of 2026-11-08` collects ESPN reporting headlines and official team transaction tables. The latter produced 316 headlines and 827 transaction entries across 32 teams; Atlanta and Dallas logs are explicitly unavailable. Neither collector silently promotes old editorial review dates. The feeds are not a complete historical archive or a current injury-status database.

Team briefings calculate before/after records and window averages, link the latest game's evidence, distinguish the latest passing leader from a confirmed starting quarterback, and separate reported headlines from official transactions. Empty categories mean absent collected coverage, not “nothing changed.”

## Open-ended football research

`nfl_research.py` is a separate Flask service for the existing static site. It accepts arbitrary questions and up to three question/answer turns, carries familiarity and spoiler settings, and requires fresh web search for each generated answer. The prompt checks premises, prefers primary sources, distinguishes dates and uncertainty, and asks for concise explanations. Clickable citations are rendered from provider annotations, never from untrusted answer HTML. No question-to-answer lookup table is used.

**Activation still required:** set `OPENAI_API_KEY` securely in the Render service environment, then redeploy. Never put the key in a browser field, commit, or static export. `HUDDLE_MODEL` defaults to the current documented `gpt-6-astra` model and can be overridden to a supported web-search model. Without the key, `/healthz` reports `answers_enabled: false` and the app explicitly offers live Wikipedia reference search only; it does not generate answers or claim to check the premise. Real generated-answer quality has not been tested without credentials. Mocked transport tests establish request/response handling, not answer correctness.

Deploy the companion as one free Python web service, branch `feat/nfl-catch-up`, build `pip install -r requirements.txt && python -m unittest discover -s tests -p test_nfl_research.py`, start `gunicorn nfl_research:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 100`. The static frontend calls `https://dfe-nfl-research.onrender.com`. The free service can take about a minute to wake; the interface distinguishes loading, timeout, provider failure and unavailable generation.

Limits: two concurrent requests, six requests per anonymous tab identifier per ten minutes, and an 80-request process-wide rolling-day allowance (override with `HUDDLE_DAILY_LIMIT`). Tab identifiers are not authentication and can be reset by a visitor; the separate global allowance remains in force. Limits are in memory and reset on restart; use a provider project spending limit before wider public promotion. One worker is intentional. CORS permits only the two HUDDLE deployment origins; CORS is not authentication. POST bodies are bounded; follow-up roles are validated; credentials are server-only; no question content is logged or durably stored by this application. Provider retention policies remain separate. The browser thread clears on reload. Reference results can contain spoilers and the interface says so.

Validation: Node season/data tests; Python API tests for input limits, CORS, provider failure, missing credentials, citations, follow-ups, spoiler instructions and quotas; export consistency/escaping tests. Live provider generation remains a separate activation check.
