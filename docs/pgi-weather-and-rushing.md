# PGI v23 — weather and the running game

## Player-facing behavior

Game-day Conditions offers **Clear, Windy, Rain, Snow, and Heat**. The default Home-field Forecast uses the home venue, its roof, and a selectable football-season period. The forecast is visible before kickoff and stays fixed for the game; wind gusts vary gently with simulation time. It is simulated weather, not a live weather feed or an assertion of exact historical conditions.

- Clear: neutral footing, grip and stamina.
- Windy: long passes drift; field goals, punts and kickoffs respond to crosswind and head/tailwind. The aiming preview and kick result use the same calculation. Starting a human kicking meter locks the wind through that kick.
- Rain: speed −3%, acceleration −18%, slower abrupt cuts, catch-drop probability +1.2 percentage points, contact-fumble probability +0.35 points, kick range −4% before wind. Accuracy-window width ×0.92.
- Snow: speed −9%, acceleration −30%, slower cuts, catch-drop probability +0.8 points, contact-fumble probability +0.2 points, kick range −7% before wind. Accuracy-window width ×0.94.
- Heat: burst and tackle-break stamina costs +25%; recovery during a play −33%. Stamina still resets for the next snap.

These are authored arcade rules. Weather does not silently edit player ratings or add random slip animations. Both teams use the same physics and costs. Rain temperature is clamped above freezing; snow and heat have appropriate authored ranges.

A small strip shows the condition and direction the wind pushes the ball in the current field view. Wind rotates with possession and when teams change ends. Pause stops gusts and particles. Replays retain their recorded weather/time/wind; reduced-motion mode limits and freezes atmospheric particles. Precipitation, surface tint, puddles, snow patches, breath and a windsock fit the pixel field. Rain/wind ambience uses the existing Effects/master-volume and audio-unlock path.

Al and John discuss the actual configured conditions in pregame, halftime and postgame, with a weather board and yellow-marker animation. Casey periodically provides the field-level weather report. Simple guidance gives a short action, Moderate explains the tradeoff, and Expert exposes numerical effects. Practice supports selectable outdoor conditions even when the selected franchise plays indoors. Campaign chapters keep a labeled clear preset so retries are consistent; Classic Games use the original venue and season, including neutral NRG Stadium for Super Bowl LI.

## Venue weighting and roof policy

All 32 current teams, eight throwback teams, and the Super Bowl LI neutral venue have explicit mappings in `weather.js`. Regional weights differ across early season (September–October), late fall (November), and winter (December–February). They are **design weights informed by regional climate**, not measured kickoff frequencies or percentages attributed to NOAA.

Examples: winter snow is much more likely at Buffalo/Green Bay than Miami; Seattle has a stronger rainy-season weighting; early Florida and desert games favor heat more than northern games. Snow probability is zero in Florida and coastal California. Fixed roofs exclude adverse weather. PGI deliberately keeps retractable roofs closed. SoFi's covered field excludes rain and snow, while open sides allow reduced wind. Historical venue mappings use their period venue, not the franchise's current stadium.

Primary references consulted November 3, 2026:

- [NWS Buffalo climate](https://www.weather.gov/buf/BUFclifo) — Great Lakes climate and lake-effect snow context.
- [NWS Seattle climate report](https://www.weather.gov/media/wrh/online_publications/TMs/TM-257.pdf) — regional seasonal rain context.
- [NPS Everglades weather](https://www.nps.gov/ever/planyourvisit/weather.htm) — southern Florida warm/wet seasonal context.
- [HKS on SoFi's design](https://www.hksinc.com/our-news/articles/inside-sofi-stadiums-innovative-design/) — covered, open-sided design and ventilation.
- [Vikings stadium guide](https://www.vikings.com/stadium/a-to-z) and [Raiders stadium page](https://www.raiders.com/stadium/) — protected indoor fields.
- [Texans stadium guide](https://www.houstontexans.com/stadium/a-z-guide) — retractable-roof decisions are real-game decisions; PGI's always-closed simplification is stated in the UI.
- [Bills new Highmark opening](https://www.buffalobills.com/news/how-to-watch-the-bills-ribbon-cutting-ceremony-at-highmark-stadium) — current open-air home venue.

## Blocking and rushing

An engaged defender no longer has a normal tackle radius. A blocker interposed between the defender and runner prevents contact. On the exposed side, an ordinary defender has only a 0.65-yard reach and a 4% chance; elite shed and tackle ratings (both at least 90) allow 1.05 yards and a bounded 12–30% chance. There is **one reach attempt per engagement**, not one per frame. Failed reaches do not slow the ball carrier. Shedding restores normal tackling. Existing block expiration, cooldowns, rating matchups, holding rules and manual SHED controls remain.

A spare nearby lineman can physically join an engaged blocker against a dominant defender. The new **Duo inside** call requests combination blocks from Singleback. Help never abandons a close unblocked threat, needs actual proximity, buys finite additional time, and releases when the runner passes. A double-teamed defender cannot make a reach tackle through the engagement. Both blocker connections render on the field and are recorded; the booth can circle both actual players on highlight film.

**Left twist** and **Right twist** exchange the two interior rushers' gaps, with one penetrating while the other loops. These are movement assignments, not teleportation or hidden rating boosts. They cost time, expose vacated space, release into pursuit, and do not override the human's selected defender. Offense counters with the existing pulls, traps and counters. Pulling/lead blockers now engage an immediate threat in their path instead of blindly continuing to their landmark.

CPU offense decides run/pass before choosing a specific play, so adding passing plays cannot dilute rushing. Selection accounts for team identity/ratings, down and distance, score/clock, weather, and recent repeated calls. Runners read actual defenders and engaged blocks, press a useful outside landmark, turn upfield, and use the same burst costs as the human. Harder difficulty reads lanes sooner. A progress cost prevents an outside runner from selecting a stationary safe spot indefinitely. Human controls remain steering after the exchange, with a live lane hint in Simple/Moderate guidance and BURST for the opening.

## Validation

`node --test tests/gridiron/*.test.mjs` passes 239 tests and covers the existing game and weather/rushing regressions. `PYTHONPATH=/tmp/pgi-server-tools:$PWD python -m unittest tests.test_pocket_gridiron` checks Flask asset delivery. The four campaign chapters were also completed with action-only scripted input.

The repeatable balance harness is `node scripts/gridiron-rushing-balance.mjs 640 [optional-old-assets-directory]`. It runs 640 trials for each format/difficulty across all 32 teams, five defenses, and available running plays, with all defenders controlled by AI. Every trial must successfully snap. This is an arcade tuning exercise, not a prediction of human results or NFL statistics. The old/new books differ by the new Duo call; this is a representative suite, not a paired estimate of one isolated physics change.

| Format | CPU difficulty | Mean yards/carry, v22 → v23 | Zero/negative gains, v22 → v23 | v23 gains of 5+ |
|---|---|---:|---:|---:|
| 7v7 | rookie | 1.04 → 6.34 | 58.9% → 39.7% | 26.3% |
| 7v7 | pro | 1.04 → 7.88 | 58.9% → 38.9% | 30% |
| 7v7 | legend | 1.04 → 8.57 | 58.9% → 38% | 42.5% |
| 11v11 | rookie | -0.19 → 4.96 | 70.5% → 42.3% | 37% |
| 11v11 | pro | -0.19 → 6.74 | 70.5% → 43.3% | 43.1% |
| 11v11 | legend | -0.19 → 6.68 | 70.5% → 41.6% | 44.4% |

The CPU chose runs on 45.9% of the first-and-10 call samples in v23. Separate tests verify more running on short yardage/late leads and less on third-and-long/late deficits. Harder difficulty changes reads rather than simply forcing more running. Initial diagnostic results that included unsnapped trials were discarded.

Browser checks cover desktop and 428×926 portrait / 926×428 landscape phone-size layouts, roof selection, snow pregame/field, running playbook and practice, wind-sensitive kick setup/locking, and pause. Browser sizing is not a physical iPhone/Safari or Bluetooth-speaker test. Manual phone play remains the final feel check.

Publishing uses the existing `feat/pocket-gridiron` branch and the existing Render service/URL. v23 asset query strings prevent the v22/v23 module mix after refresh. No new hosting service, public address, or multiplayer feature is introduced.
