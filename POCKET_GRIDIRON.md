# Pocket Gridiron

An original mobile-first, top-down pixel football game in DailyFlyer. Seven players per side, all 32 teams, real active player names and numbers. Original procedural pixel graphics and sound; no paid API or asset services.

Play at `/gridiron/` or set `DEFAULT_THEME=pocket_gridiron` to make it the default theme. Existing theme behavior is preserved. `/?theme=pocket-gridiron` also works.

## Play

Choose a team and opponent, then call a run or pass. Touch joystick moves; A/B/C pass to the labeled receivers; burst boosts a runner with one evasion opportunity. On defense, switch to the nearest defender and dive to tackle. WASD/arrows, space, 1/2/3, P work on desktop.

On phones, gameplay fills the available viewport with a compact scoreboard, an adaptive field canvas, and fixed thumb controls. Landscape places controls beside the field. Play choices collapse after selection; Change Play reopens them, including fourth-down kicks. Sound and help remain available from Pause. Game surfaces consume browser touch gestures and buttons activate on contact without a duplicate click; scrolling and pinch zoom remain available in menus and dialogs.

Four 45-second quarters, a live-play clock, first downs, turnovers, safeties, punts and field goals on fourth down. Touchdowns include an automatic PAT. Interceptions and defensive fumble recoveries become live returns; the field rotates so the new carrier still runs upscreen. End-zone interceptions are automatic touchbacks at the 20. Each half starts with a playable kickoff; the opponent receives the second-half kick. Touchdowns, field goals and safeties queue the correct kickoff or free kick, unless the game has ended. Ties use sudden-death overtime. Solo against AI; multiplayer and franchise mode are not included.

## Expanded playbook and special teams

Offense has ten calls: Inside Run, Wide Sweep, Quick Slants, Go Routes, Counter Left (pulling guard), Curl Hooks (receivers come back after 12 yards), Boot Flood (right-side routes at three depths), Mesh Cross (two shallow crossing routes), Smash Corners (two short hooks and a deep TE corner), and Delayed Draw (QB shows pass, then hands off after 0.85 seconds). Defense has nine: Zone, Man, Blitz, Cover 2 (two deep halves), Cover 3 (three deep thirds), Run Commit (four rushers, vulnerable downfield), Press Man (tight corners delay releases, extra LB rush), Robber (man outside with an underneath help defender), and Prevent (five deep zones, vulnerable underneath).

On fourth down, Punt starts a real kick sequence. The CPU chooses its own punts or field goals. Aim with the stick or A/B/C; tap START METER, then KICK to lock power. Space operates the meter on desktop; 1/2/3 aim left/center/right. More power adds distance, including the risk of a touchback; aiming too wide can send the kick out of bounds. The active roster supplies the punter/kicker when available.

For incoming kicks, tap READY TO RETURN. The returner automatically tracks the landing ring until you steer. B (keyboard 2) calls a fair catch on punts. On the catch, run upfield and burst; the kicking side controls coverage with Switch and Dive. Loose punts can roll or be downed, and loose kickoffs can be recovered. Returns start a fresh series or can score; return yards are tracked separately.

Simplified arcade rules: kickoff touchbacks at the 25, punt touchbacks at the 20, kickoff out of bounds at the 40. The clock runs during scrimmage plays and returns, and pauses during kick setup/flight. No onside-kick selection, blocked punts, or full NFL dynamic-kickoff enforcement. The camera widens for kicks and eases back for returns. All choices fit the phone playbook, which clears before action; the previous rapid-tap zoom protection remains in place.

## Rosters

Bundled snapshot: 2026, fetched November 1, 2026. 1,702 active players. Source: https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv

The locker room supports starter changes and manual refresh. After 24 hours the page attempts refresh on load. `/gridiron/api/roster` fetches the fixed current-season nflverse CSV on demand and caches it for one hour. The browser validates all 32 teams before replacing the working snapshot, persists accepted updates when local storage is available, and retains a clear fetched timestamp. A running match keeps its starting rosters. No unattended scheduled job is required.

Active-roster status is not the official depth chart or game-day availability. Default lineups and player ratings are custom arcade choices; they are not licensed NFL/Madden ratings. All source data is separate from gameplay code. Logos, likenesses, and Tecmo assets are not used.

Rebuild the bundled snapshot:

```sh
python scripts/refresh_gridiron_rosters.py --season 2026
```

## Checks

```sh
python -m unittest discover -s tests -p 'test_pocket_gridiron.py'
node --test tests/gridiron/*.test.mjs
```

## Render

New service on branch `feat/pocket-gridiron`, repository root, build `pip install -r requirements.txt`, start `gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60`, environment `DEFAULT_THEME=pocket_gridiron`. No database, disk, or roster API key required.


## Ball outcomes and calibration

Benchmarks use a completed season rather than mixing partial 2026 data. The following are sums of the NFL's 32 team rows for 2024 regular-season play:

| Event | NFL benchmark | Source |
| --- | --- | --- |
| Interception | 387 / 17,811 attempts = 2.17% | [NFL passing](https://www.nfl.com/stats/team-stats/offense/passing/2024/reg/all) |
| Rushing fumble | 221 / 14,687 rushes = 1.50% | [NFL rushing](https://www.nfl.com/stats/team-stats/offense/rushing/2024/reg/all) |
| Receiving fumble | 118 / 11,629 receptions = 1.01% | [NFL receiving](https://www.nfl.com/stats/team-stats/offense/receiving/2024/reg/all) |

These are league benchmarks, not a promise that a short 7-on-7 game reproduces NFL totals. They include different opportunities than our contact-only checks. Fumbles include recovered fumbles, not just lost possessions. Player names do not imply official individual ball-security or coverage ratings.

`rules.js` centralizes the tunable probabilities:

- Clean catchable passes have a 4% drop chance. This is a forgiving arcade choice, not a measured universal NFL drop rate. [PFF defines drops relative to catchable targets](https://www.pff.com/news/pro-pff-signature-statistics-a-glossary); [its route analysis](https://www.pff.com/news/nfl-route-analysis-the-most-and-least-effective-routes-over-the-last-five-years) illustrates meaningful route-to-route differences. Difficulty does not change this chance.
- A defender must physically reach the ball. At a late contact opportunity, interception chance is 3% and tip chance is 18%; early line contact can only tip. Each defender receives one trial per throw, not per frame. These are conditional contact probabilities, not per-attempt league rates. There is no invisible random interception of an open pass.
- Tips have a short second flight. At landing, the nearest eligible athlete within 1.8 yards gets one chance to secure it: 30% offense, 7% defense. Otherwise it is incomplete. Drops are dead-pass animations and cannot be picked up as fumbles.
- Normal tackle contact has a 1.6% rushing/return fumble chance or 1.2% after a reception. A pocket-QB tackle uses 6.5%. Burst multiplies risk by 1.25, a diving tackle by 1.35. Sack/return/contact modifiers are gameplay tuning, not claimed NFL estimates. All difficulties and both teams use the same formula. No risk is rerolled every frame or while freely running.
- Fumbles bounce, remain live, and are recovered by proximity. Either side may advance; defensive recoveries rotate into returns. Own fourth-down recoveries are dead and cannot advance beyond the original fumble spot (a simplified arcade rule). Sideline fumbles cannot gain yardage; fumbles out of the opponent's end zone yield a touchback. Returns can themselves be fumbled back.

`node scripts/gridiron-balance.mjs` runs 2,000 passing-play scenarios per difficulty using a seeded strategy: hold 1.1–3 seconds, usually choose the most open target, force a target every fourth play. With the checked-in NE/BUF roster and seed, interception rates were 1.13% Rookie, 2.17% Pro, 2.61% All-pro; tips occurred on roughly 8–11% of attempts. This is a reproducible balance diagnostic, not a measurement of human games or an assertion that completion/turnover totals match the NFL. The short arcade field and catch-friendly passing remain intentional. Unit tests separately sample 6,000 clean catches and 5,000 tackle contacts.

## Difficulty and future head-to-head play

| Behavior | Rookie | Pro | All-pro |
| --- | --- | --- | --- |
| Ball recognition delay | 0.46s + up to 0.10s | 0.26s + up to 0.10s | 0.13s + up to 0.10s |
| Reassess target | Every 0.34s | Every 0.20s | Every 0.11s |
| Recognize run/handoff | 0.70s | 0.38s | 0.20s |
| Position-reading error | Up to 2.2 yards per axis | Up to 1 yard | Up to 0.35 yard |
| Ball awareness radius | 11 yards | 16 yards | 21 yards |
| Pursuit anticipation | 0.06s | 0.28s | 0.48s |
| Play selection | Unweighted | Some situation/tendency weighting | Full situation/tendency weighting |

All AI defenders use the same 0.95 movement multiplier regardless of difficulty. Human defensive teammates use Pro decisions consistently. CPU quarterbacks also read less frequently and judge separation less accurately on easier settings. The defense considers down, distance, field position, late-game lead and the offense's previous 12 run/pass calls; it does not read the newly selected offensive play. Man coverage assigns a primary defender to each of the three receivers and uses the remaining coverage players for help. Defenders react to a nearby visible ball trajectory after their delay, rather than all sprinting to the exact landing point at release.

The engine remains independent of DOM, rendering and transport. `seededRandom` and an identical-input replay test establish reproducible simulation for a supplied timestep/input stream. Multiplayer is deferred: a future 1v1 mode should run authoritative state and random outcomes on the server, accept separate team input streams at a fixed tick, replicate snapshots/events, and handle reconnects. Current local controls, mutable player references and variable render substeps still require adaptation; this update does not claim multiplayer is implemented.
