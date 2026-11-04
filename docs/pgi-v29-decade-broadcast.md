# PGI v29 — conditioning, all-decade teams and sideline broadcast

## What players get

- New exhibition/classic games default to 11v11. An explicitly saved 7v7 preference still works. Training and the separate 1v1 server retain their intended format.
- Presentation motion defaults to On, including the booth, sideline, weather and lobby preview. Pause and Booth settings share the On / Device setting / Off choice. Existing explicit choices are respected. Automatic replays already default to On.
- Ball carriers spend extra energy after two seconds of sustained running. Pursuers also tire, but more slowly. Endurance controls both depletion and the eventual speed penalty; speed and acceleration still determine the physical race. Energy belongs to the athlete, so fumbling and recovering cannot refill it. Fresh formations replenish energy.
- Coverage units keep separate lanes while the kick is airborne. Pursuers use capped intercept angles based on observed velocity, recognition and difficulty. There are no automatic tackles, rubber-band speed boosts or touchdown caps.
- Rare simulated contact injuries rest a player for 2–4 snaps and use a compatible healthy replacement. Checks begin after five snaps, happen at most once per play, and have an 18-snap gap and two-incident ceiling per game. Durability and fatigue influence the small chance. Durability starts from a neutral 85 baseline; it is not a real health assessment. Training and 1v1 disable injuries.
- Rain, snow, wind and heat have stronger field visuals. Casey's sideline also shows the conditions. Adverse weather is always part of her report.
- Halftime includes Casey interviewing a fictional representative head coach. The answer uses the actual score, box score, weather and temporary absences. Original coach poses animate alongside the reporter. The show remains skippable and never advances the football clock.
- Six-second TV breaks rotate four fictional sponsors with animated illustrations and a skip button: Fourth Down Fizz, Yellow Marker XL, Pocket Pretzels, Third & Long Mattresses. No external ads, links, tracking or ad network.

The 11-player route-origin correction also starts receivers from their actual full-team alignment and blends into the designed route, instead of first steering toward a seven-player starting point.

## All-decade collection

These are **PGI selections**, informed by historical all-decade lists, rather than reproductions of an official roster. The 2020s collection is explicitly “so far.” Each team has 33–34 athletes, specialist selections, editable offensive starters, individually authored arcade ratings and its own restricted playbook. Eight rosters contain 268 player entries; athletes can appear in more than one era.

| Era | Starting QB / RB | Offensive identity |
|---|---|---|
| 1950s | Otto Graham / Marion Motley | Leather & thunder; inside runs and lead blocks |
| 1960s | Johnny Unitas / Jim Brown | Power and sweeping runs with downfield shots |
| 1970s | Roger Staubach / Earl Campbell | Physical ground game and vertical passes |
| 1980s | Joe Montana / **Bo Jackson** | West Coast passing with explosive backs |
| 1990s | Brett Favre / Barry Sanders | Balanced under-center attack |
| 2000s | Peyton Manning / LaDainian Tomlinson | Expanded passing and spread packages |
| 2010s | Aaron Rodgers / Adrian Peterson | Space, tempo, pistol and bunch |
| 2020s | Patrick Mahomes / Derrick Henry | Modern movement and multiple packages |

Bo starts at RB and returner for the 1980s. Walter Payton, Eric Dickerson and Roger Craig are also available. Player differences include endurance, acceleration, strength, agility, balance, security, catching, route running, blocking, coverage, reads, shedding and kicking. For example, Bo's speed does not grant elite hands, and Deion's coverage does not grant elite tackling. Historical athletes and era playbooks use modern PGI rules.

Historical references:

- [Pro Football Hall of Fame all-decade index](https://www.profootballhof.com/news/nfl-s-all-decade-teams)
- [1950s offense](https://www.profootballhof.com/news/nfl-s-all-decade-team-of-the-1950s-offense)
- [1960s team](https://www.profootballhof.com/news/nfl-s-all-decade-team-of-1960s)
- [Raiders: Bo Jackson](https://www.raiders.com/history/all-time-roster/bios-j/bo-jackson)

Ratings are authored gameplay estimates, not official NFL or licensed Madden ratings, historical season totals, or current injury reports.

## Balance diagnostics

The repeatable harnesses use seeded scripted input, not human play. Results describe the sampled routes and cannot predict human or NFL statistics.

`node scripts/gridiron-return-balance.mjs 300 [optional asset directory] [format=11]`

Same NE/BUF matchup, seeds and 11v11 format, old head `e22d52f` versus this tuning pass:

| Return / scripted route | Old mean yards | New mean yards | Old TD share | New TD share |
|---|---:|---:|---:|---:|
| Kickoff / straight | 11.44 | 11.10 | 0% | 0% |
| Kickoff / edge | 11.24 | 9.68 | 0.67% | 0% |
| Punt / straight | 14.54 | 13.87 | 0% | 0% |
| Punt / edge | 15.90 | 11.83 | 3.33% | 0% |

`node scripts/gridiron-rushing-balance.mjs 320 [optional asset directory]`

Across all current teams and five defenses, 11v11 Pro CPU rushing averaged 3.38 yards in the tuning sample, versus 5.91 before. Gains of 5+ yards remained at 40.6%; 20+ yards fell from 5.3% to 0.9%. The intent is to close the repetitive edge escape while preserving useful blocks and short gains. This does not by itself establish ideal human difficulty. Dedicated regressions verify an elite runner can still beat a slower pursuer over a sustained run and an unopposed return can reach the end zone.

## Verification and assets

- `node --test tests/gridiron/*.test.mjs`: 252 passing tests. The suite covers conditioning, injury spacing/substitution/return, every decade book and route start, unique 11-player units, halftime facts and timeout clock behavior, plus the existing game, audio, training, campaign, controls and weather tests.
- `python -m unittest tests.test_pocket_gridiron -q`: both checks pass and include the six new modules and coach image.
- Eight additional full simulated games paired every decade with another era in rain or snow. All reached the final whistle with finite player positions. Incidents per game were 0, 0, 0, 0, 1, 2, 0, 1.
- Browser checks cover the actual lobby/roster and 390×844 phone layouts for the interview, timeout and snowy 11-player field. Preview-only fixtures are excluded from git.
- `coach-poses.png`: original fictional headset-wearing head coach, four poses in a transparent 2×2 sheet, generated with OpenAI image generation on 2026-11-04. The original generated image is preserved. Canvas supplies the stadium, bench, weather, gestures and captions. It is not a portrait or impersonation of a named real coach.
- Approved scoring audio files are byte-for-byte unchanged. Existing MP3 cache versions are retained; changed JavaScript modules and CSS use v29.
