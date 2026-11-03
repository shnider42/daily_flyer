# Pocket Gridiron (PGI)

## v10 — longer games and the halftime booth

This release includes the prepared v9 directional passing and expanded books.
Deployment branch: `feat/pocket-gridiron`; public route: `/gridiron/`.

Game length is selected in the lobby and remembered: Quick has 45-second
quarters, Extended 90 seconds (2×), and Sunday showcase 180 seconds (4×).
These are 3, 6 and 12 minutes of live game clock; menus, dead balls and replays
add real time. Existing sudden-death overtime remains unchanged.

Sunday showcase pauses at halftime after the last play, penalty decision and
replay. A five-segment Al Michaels / John Madden pixel-art booth uses original,
captioned fictional fan-tribute dialogue, with no impersonated voices or actual
broadcast quotations. Its report snapshots both teams' score, net offensive
rushing/passing yards, completions/attempts, return yards, takeaways and longest
gain. Accepted fouls erase provisional statistics; declines restore them.
These are arcade box scores, not a full NFL statistical accounting system.

The show has auto-advance, pause, previous/next, an expandable box score, and an
always-visible Start second half button. It freezes simulation and RNG, stops
advancing while hidden, and resumes with the opponent receiving at 3:00 in Q3.
A John Madden remembrance appears in the booth and help. Artwork provenance and
its generation prompt are in `scripts/pgi_music/HALFTIME_ART.md`.

Notre Dame's scoring arrangement now runs about 27.3 seconds (previously 10.2),
with three statements and a resolved ending. The BC arrangement is byte-identical.
Contact grunts are short synthesized effects, with blocks quieter than tackles,
a 12-yard near-ball block gate, at least 0.42 seconds between voices, at least
0.95 seconds between block voices, and at most three voices per two seconds.
The throw slide whistle lasts 0.28–0.65 seconds. Both have independent Pause
switches and respect Effects mute. No per-frame outcome rolls were introduced.

Validation: 131 JavaScript tests and 2 Flask tests pass, including full 2×/4×
games, the halftime boundary, penalty-adjusted stats, replay isolation, audio
voice budgets and mute controls. Browser QA covered 428×746, 375×580 and 844×390
layouts, segment navigation/pause, and the second-half kickoff. Audio assets
passed numerical quality checks; real iPhone feel and subjective listening still
benefit from hands-on review.

## v9 — directional passing and expanded playbooks

### Pass placement

Tap A/B/C while moving the left stick to shift that receiver's pass in the same
field direction. Up adds depth, down brings it back, and lateral/diagonal input
places it on either shoulder. Stick travel controls the amount. Releasing or
centering the stick returns to assisted placement. Arrows/WASD with 1/2/3 provide
the same controls on desktop. The stick continues to move the QB before release.
The receiver-button event reads the current input directly, avoiding a stale
frame or a stored direction after the thumb lifts.

`passing.js` forecasts the receiver along their actual route, including stops
and comeback cuts, and adds the requested offset. The flight destination is
fixed at release; QB accuracy and pressure add the existing error. Preview rings
show the intended placement before that error. Receivers adjust on foot after a
short reaction, with a little extra delay turning back upfield from a settled
hook. No teleport, homing ball, or automatic rescue at the sideline.

The ball is contested where it actually arrives. Nearby eligible offensive
players may catch it; defenders get one contact opportunity each per throw.
An isolated defender under a misplaced pass has a much better conditional
interception chance than a defender contesting a receiver. This is an arcade
positional model, not a claim of measured NFL situation-level probabilities.
Drops, tips and incompletions remain possible. Strongly placed or stretched
catches feed the existing temporary off-balance/tackle-break mechanic.

Neutral throws retain a forgiving assisted catch. Small stick adjustments are
intentionally easier than maximum travel. Seeded open-field checks protect that
balance and verify that full forward lead is usable on deep routes. Those checks
are bounded scenarios, not whole-game completion-rate predictions.

### Playbooks

Catalog: **32 offensive / 18 defensive calls**. Each team has **16 offense / 12
defense**, retaining its existing identity and signatures. Simple offers three
suggestions; the full book has Run/Quick/Deep or Zone/Man/Pressure filters and six
calls per page. Opponent routes and play names remain private.

New offense: sideline comebacks, speed outs, deep outs, dagger, drive cross,
scissors, double posts, bench corners, whip returns, corner/post, seam stretch,
shallow/wheel, right trap, power left, QB draw and lead isolation.

New defense: quarters, quarter/quarter/half, zero blitz, man/QB spy, left and
right brackets, fire zone, and left and right edge blitzes.

`plays.js` holds shared route geometry, run lanes, pulling/lead assignments,
coverage metadata and diagrams. The CPU uses the same catalogs and team books.
QB draw holds pass protection briefly before run blocking; trap/power/iso use
their specified blocker and lane. Fire zone drops a lineman instead of sending
him automatically, and zero blitz gives up the deep helper.

### Review and validation

`node --test tests/gridiron/*.test.mjs` covers all existing gameplay and new
placement directions, release-time input, receiver movement, route stops,
back-shoulder catches, sideline misses, defensive landing contests, new coverage
assignments, team-book completeness and phone-sized pages. Flask asset checks
include `passing.js` and `plays.js`. Browser QA uses local-only fixtures outside
the repository for phone, small-phone and landscape views. Validation: 119 JavaScript tests and 2 Flask checks passed. Actual iPhone feel
still needs hands-on review; no new networking or multiplayer code is included.


An original mobile-first, top-down pixel football game in DailyFlyer. Seven players per side, all 32 teams, real active player names and numbers. Original procedural pixel graphics and sound; no paid API or asset services.

Play at `/gridiron/` or set `DEFAULT_THEME=pocket_gridiron` to make it the default theme. Existing theme behavior is preserved. `/?theme=pocket-gridiron` also works.

## Play

Choose a team and opponent, then call a run or pass. Touch joystick moves; A/B/C pass to the labeled receivers; burst boosts a runner; BREAK TACKLE commits to a contested move near contact. Snap is the large bottom-right button on offense. On defense, choose coverage and position or switch defenders during the CPU’s 2.4–3.3 second cadence; the CPU snaps its own ball. Dive to tackle, or tap SHED BLOCK when engaged. WASD/arrows, space, 1/2/3, P work on desktop.

On phones, gameplay fills the available viewport with a compact scoreboard, an adaptive field canvas, and fixed thumb controls. Landscape places controls beside the field. Play choices collapse after selection; PLAYS reopens them, including fourth-down kicks; the mobile playbook opens just above the controls. The movement area is larger than the visible stick, with a radial dead zone to prevent drift; the principal action and receiver buttons are at least 54 pixels tall. Controls respect the bottom safe area. Sound and help remain available from Pause. Game surfaces consume browser touch gestures and buttons activate on contact without a duplicate click; scrolling and pinch zoom remain available in menus and dialogs.

Four quarters of 45, 90 or 180 seconds, a live-play clock, first downs, turnovers, safeties, punts and field goals on fourth down. Touchdowns include an automatic PAT. Interceptions and defensive fumble recoveries become live returns; the field rotates so the new carrier still runs upscreen. End-zone interceptions are automatic touchbacks at the 20. Each half starts with a playable kickoff; the opponent receives the second-half kick. Touchdowns, field goals and safeties queue the correct kickoff or free kick, unless the game has ended. Ties use sudden-death overtime. Solo against AI; multiplayer and franchise mode are not included.

## Expanded playbook and special teams

The shared offensive catalog has 32 calls. Teams each carry 16, selected for their identity. The 16 additions are listed in the v9 section above. The original ten are: Inside Run, Wide Sweep, Quick Slants, Go Routes, Counter Left (pulling guard), Curl Hooks (receivers come back after 12 yards), Boot Flood (right-side routes at three depths), Mesh Cross (two shallow crossing routes), Smash Corners (two short hooks and a deep TE corner), and Delayed Draw (QB shows pass, then hands off after 0.85 seconds). Other established calls are Power Lead, Stretch Left, QB Keeper, Levels, Post / Wheel, and Spot Triangle. Defensive books select 12 calls from 18. The nine established calls are: Zone, Man, Blitz, Cover 2 (two deep halves), Cover 3 (three deep thirds), Run Commit (four rushers, vulnerable downfield), Press Man (tight corners delay releases, extra LB rush), Robber (man outside with an underneath help defender), and Prevent (five deep zones, vulnerable underneath).

On fourth down, Punt starts a real kick sequence. The CPU chooses its own punts or field goals. Aim with the stick or A/B/C; tap START METER, then KICK to lock power. Space operates the meter on desktop; 1/2/3 aim left/center/right. More power adds distance, including the risk of a touchback; aiming too wide can send the kick out of bounds. The active roster supplies the punter/kicker when available.

For incoming kicks, tap READY TO RETURN. The returner automatically tracks the landing ring until you steer. B (keyboard 2) calls a fair catch on punts. On the catch, run upfield and burst; the kicking side selects coverage players with NEAREST, NEXT or a field tap, and uses DIVE to tackle. Loose punts can roll or be downed, and loose kickoffs can be recovered. Returns start a fresh series or can score; return yards are tracked separately.

Simplified arcade rules: kickoff touchbacks at the 25, punt touchbacks at the 20, kickoff out of bounds at the 40. The clock runs during scrimmage plays and returns, and pauses during kick setup/flight. No onside-kick selection, blocked punts, or full NFL dynamic-kickoff enforcement. The camera widens for kicks and eases back for returns. All choices fit the phone playbook, which clears before action; the previous rapid-tap zoom protection remains in place.

## Carrying speed and return pursuit

Possession reduces movement speed by 7% (`MOVEMENT_RULES.carrierSpeed = 0.93`). It applies to both teams and every difficulty: QB movement, runs, catches, kick/punt returns, interceptions, and live fumble recoveries. Ratings are unchanged; a fast carrier can still outrun a slower defender, and burst retains its short boost. There is no carrier penalty while tracking an airborne kick/pass or chasing a loose ball.

Return defenders add a small, capped travel-time lead to their existing pursuit target. They use observed runner velocity with the same decision intervals and position errors as before. This closes some outside angles without faster defenders or a forced tackle/return-touchdown limit.

`node scripts/gridiron-return-balance.mjs` runs 300 seeded, returnable kicks per type and route on Pro with NE receiving against BUF. Its runners use burst whenever available. Historical v6 comparison, before the v7 skills/contact update, in the fixed sideline-route scenario:

| Scenario | Previous TD rate | Updated TD rate | Previous average yards | Updated average yards |
| --- | --- | --- | --- | --- |
| Kickoff | 28.00% | 12.00% | 36.51 | 22.77 |
| Punt | 9.67% | 5.67% | 21.91 | 18.28 |

These are comparisons of a scripted strategy, not NFL targets or predictions for human play. Straight and weaving routes are also sampled. The diagnostic excludes touchbacks and ends at the initial return-ending event, including a fumble. The previous baseline is commit `f224a34`; the v6 numbers include the possession slowdown and modest return-pursuit adjustment. The current diagnostic also attempts a tackle break when available; rerun it for current tuning.

The v7 run (300 trials per route/type) produced 13% kickoff and 8% punt touchdowns on the fixed sideline route, averaging 23.88 and 20.47 yards. Straight and weaving routes produced no touchdowns. The six scenarios recorded 2–12 fumbles apiece. Sideline returns remain more generous than a realism target; this is an arcade balance diagnostic, not calibrated NFL frequency.

## Blocking and penalties

`blocking.js` assigns distinct threats to the linemen and supporting blockers, gives pass protection pocket anchors, and sends run/return blockers ahead of the carrier. Counter retains its pulling guard. Contact slows a defender and separates the two bodies rather than continually refreshing a stun. Blocks have finite engagement times influenced by power; a shed defender gets a brief window before being engaged again. The user can actively shed a block with the defensive action button. This is a simplified positioning model, not a full line-of-scrimmage physics simulation.

The first penalty set uses observable situations, with visible flags and enforcement in `penalties.js`:

- Offside: a defender is in the neutral zone at the snap. The play continues, and the non-offending team can take the result or five yards with the down replayed. On offense, a CPU lineman occasionally jumps early; on defense, the user controls whether their defender crosses the line.
- Encroachment: pre-snap contact after entering the neutral zone whistles the play dead for five yards without consuming the down or game clock.
- Offensive holding: a beaten pocket blocker has one 3.5% chance per qualifying expired engagement to grab and briefly prolong the block. This is a conditional tuning choice, not a claimed NFL per-play penalty rate. It can cost ten yards from the previous spot and replay the down; holding in the offense’s own end zone produces a safety.

The human chooses ACCEPT or DECLINE for live-ball fouls against the CPU; the CPU compares the enforced result with the play result for fouls against the human. Offsetting fouls replay the down. Enforcement respects half the distance, can award a first down, and restores scores and play statistics if a play is nullified. Accepted live-ball defensive fouls can extend an expired quarter for an untimed down. Penalty decisions pause game time. Accepted penalties against the user appear in the final statistics.

Based on the [2026 NFL rulebook](https://operations.nfl.com/rules-officiating/2026-nfl-rulebook), simplified for the arcade game. This first model covers pocket holding only; return/downfield holding, pass interference, false starts, delay of game, and full NFL penalty exceptions remain unimplemented. Receiver contact needs a richer model before adding pass interference fairly.

## Team identities, ratings, guidance and sound (v7)

Every team has an eight-call offense and six-call defense. Five offensive identities (power, quick timing, vertical, mobile and space) and three defensive identities (pressure, man and zone) share common calls and add signature calls. CPU selection favors its own signatures and the selected personnel, then considers the situation and observed play history. Illegal out-of-book calls are rejected. These are hand-tuned arcade profiles reviewed November 1, 2026, not verified current coaching tendencies.

`ratings.js` separates individual estimates from roster data. Named overrides coexist with clearly labeled position baselines; experience slightly adjusts baseline recognition/composure. Unknown players do not receive invented individual rankings. Ratings follow names across team changes and survive roster refreshes. Starter ratings and provenance are visible in the locker room. Team strengths are recomputed from the selected lineup. No paid ratings feed or licensed ratings are used.

Implemented effects: acceleration changes speed recovery from a stop; catching affects drops; route running affects route execution; arm strength affects throw speed/range; composure affects pressure error; pass/run blocking compete with block shedding; coverage affects positional error and ball contact; recognition affects read intervals; strength, tackling, agility, balance and ball security affect contact. Kicking power, directional accuracy and hang time affect kicks, and kicker ratings affect field-goal odds. The universal 7% carrying slowdown remains.

BREAK TACKLE replaces the old burst-granted escape. The action is offered within 3.8 yards of an unblocked defender and during a 0.24-second contact window. A tap commits for up to 0.55 seconds, costs 24 stamina, and starts a 1.8-second cooldown. Steering and contact angle select spin, stiff-arm or bulldoze. A failed attempt ends in a tackle or occasional fumble; a successful move stuns only that tackler, briefly slows the runner, and shows a distinct animation. Nearby unblocked defenders, difficult catches, hard reversals and low stamina reduce escape odds. Clean catches do not automatically unbalance the receiver. Burst costs 12 stamina; stamina recovers during live play and resets for a new carrier/series. Both teams use the same contact odds and one draw per encounter. The CPU commits when eligible; guidance never modifies those odds.

Simple offers three suggested calls, access to the full team book, and dismissible first-time lessons for receiving, offense and defense. Moderate shows the full book and short situational explanations. Expert shows more ratings and the selected defender’s own pre-snap assignment. Guidance is saved separately from Rookie/Pro/All-pro and can change in Pause. Advice uses down, distance, public team identities and observed outcomes; it cannot read the CPU’s hidden call. Coaching clears during live play.

Defensive selection: tap a visible defender (28-pixel nearest hit area), NEAREST chooses the closest available defender to the current ball, NEXT cycles all seven, and PICK opens a named, paused pre-snap list. Keys 1/2/3 mirror those actions. Selecting coverage preserves the chosen defender. Selection cancels an active dive so it cannot transfer to another player. Offensive route diagrams and A/B/C labels are shown only while the human is on offense; Expert adds only the human defender’s assignment. A future server-based multiplayer mode must additionally omit secret calls from opponent snapshots; local UI hiding is not a network secrecy boundary.

`audio.js` synthesizes cadence pulses, catches, impacts, kicks, whistles, penalty and turnover cues and crowd ambience. The v8 soundtrack below replaces the short repeating music motif. Effects, background music, scoring music and volume settings are saved independently. All essential feedback also appears visually.

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

- Clean catchable passes start from a 4% drop chance, modified by the receiver’s catching rating and clamped to 1.2–8.5%. This is a forgiving arcade choice, not a measured universal NFL drop rate. [PFF defines drops relative to catchable targets](https://www.pff.com/news/pro-pff-signature-statistics-a-glossary); [its route analysis](https://www.pff.com/news/nfl-route-analysis-the-most-and-least-effective-routes-over-the-last-five-years) illustrates meaningful route-to-route differences. Difficulty does not change this chance.
- A defender must physically reach the ball. At a late contact opportunity, interception chance starts at 3% and is modified modestly by coverage; tip chance is 18%; early line contact can only tip. Each defender receives one trial per throw, not per frame. These are conditional contact probabilities, not per-attempt league rates. There is no invisible random interception of an open pass.
- Tips have a short second flight. At landing, the nearest eligible athlete within 1.8 yards gets one chance to secure it: 30% offense, 7% defense. Otherwise it is incomplete. Drops are dead-pass animations and cannot be picked up as fumbles.
- Normal tackle contact has a 1.6% rushing/return fumble chance or 1.2% after a reception. A pocket-QB tackle uses 6.5%. Burst multiplies risk by 1.25, a diving tackle by 1.35. Sack/return/contact modifiers are gameplay tuning, not claimed NFL estimates. All difficulties and both teams use the same formula. The contact move adds 0.4 percentage points of fumble risk for a bulldoze, 0.6 for a stiff-arm, or 0.9 for a spin; off-balance attempts add another 0.4 points. A single random draw selects fumble, escape, or tackle for the encounter. No risk is rerolled every frame or while freely running.
- Fumbles bounce, remain live, and are recovered by proximity. Either side may advance; defensive recoveries rotate into returns. Own fourth-down recoveries are dead and cannot advance beyond the original fumble spot (a simplified arcade rule). Sideline fumbles cannot gain yardage; fumbles out of the opponent's end zone yield a touchback. Returns can themselves be fumbled back.

`node scripts/gridiron-balance.mjs` runs 2,000 passing-play scenarios per difficulty using a seeded strategy: hold 1.1–3 seconds, usually choose the most open target, force a target every fourth play. Historical v5 calibration (before individual skills and team books): interception rates after the blocking update were 1.78% Rookie, 2.22% Pro, 1.96% All-pro; tips occurred on roughly 14–17% of attempts. Pass attempts were 1,627 / 1,529 / 1,482 respectively; the remaining scenarios ended before a throw. Small differences in turnover totals are not the difficulty mechanism. This is a reproducible balance diagnostic, not a measurement of human games or an assertion that completion/turnover totals match the NFL. The short arcade field and catch-friendly passing remain intentional. Unit tests separately sample 6,000 clean catches and 5,000 tackle contacts.

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


## PGI Stadium Voltage and instant replay (v8)

PGI is the short name for Pocket GridIron; the existing URL and theme ID stay compatible.
The soundtrack reuses Breach's offline composition/rendering approach and adapts
its playback design: one gesture-unlocked AudioContext, authored MP3s, bounded
decoded buffers, guarded asynchronous loads, and local mixing. No multiplayer
code or hosting architecture changes are included in this update.

Nine original instrumental songs (8.19 minutes total) explore three requested
influences. No songs, riffs, recordings, lyrics or voices from those bands are used.

| Influence / family | Original PGI tracks |
| --- | --- |
| Iron Maiden / galloping melodic metal | Fourth and Thunder; Midnight Formation; Run to the Lights |
| Linkin Park / electronic heavy rock | Static on the Sideline; Pressure Circuit; After the Whistle |
| Motley Crue / glam hard rock | Neon End Zone; Saturday Voltage; Chrome and Cleats |

The listening room is available from the team screen and Pause. It offers individual
track selection, family rotations, Next, music level, and scoring-cue previews. The
All Nine rotation alternates families. Music defaults on for new preferences, starts
only after a gesture, and preserves an existing saved off preference. It ducks under
live action and scoring cues. Pause/background stops the score and retains the song's
position; opening the listening room permits deliberate audition while gameplay stays
paused. An in-progress scoring cue is canceled on pause or a new match. Late downloads
cannot start a stale celebration. At most two decoded background tracks and three
scoring buffers are cached; load concurrency is bounded to three. Browser playback
uses the committed MP3s, so Render does not need the offline synthesis dependencies.

Every confirmed score, including field goals and safeties, selects its actual scorer:
NE uses a new instrumental arrangement of the opening of **For Boston**; NYJ uses
an arrangement of the **Notre Dame Victory March** chorus opening; other teams use
the original **Six on the Board**. These are short synthesized arrangements, not
university recordings or official NFL team anthems. Source and note-level provenance:
[`scripts/pgi_music/fights/PROVENANCE.md`](scripts/pgi_music/fights/PROVENANCE.md).
A confirmed score is emitted only after penalty resolution, so a wiped-out touchdown
does not receive scoring music or a touchdown replay. Repeated result presentation
cannot award another celebration. The old synthesized TD arpeggio is a fallback only
when scoring music is disabled.

Touchdowns, fumbles, and interceptions record replay clips. Replays start after the
play ends and after any penalty decision, never during a live return or loose-ball
chase. The replay holds the solo game clock and uses detached visual frames, without
calling simulation, consuming randomness, repeating sound events, or changing stats.
The recorder stores canonical field coordinates so an interception's orientation flip
does not mirror the recorded play. Each clip shows 3.5 seconds of lead-in (4.5 for TDs),
up to 1.4 seconds after a turnover, and slow motion near the event. History is sampled
at up to 20 Hz and bounded to 12 seconds, with at most 12 queued clips for pathological
multi-fumble plays. The bottom-right action, overlay Skip, and Space skip a clip;
Pause can disable automatic replays. Reloading or starting a new match clears them.
Replays are local presentation, not durable video files or shareable saves.

Validation covers replay immutability, live-return deferral, possession flips,
end-zone interceptions, penalty-nullified scores, field goals/safeties, async audio
cancellation, pause/resume offsets, track rotation, scoring mapping, and cache bounds.
Numerical MP3 checks establish duration, stereo content, no clipping and no accidental
silent sections; they do not establish subjective similarity or physical iPhone audio
quality. See `scripts/pgi_music/README.md` for reproducible composition and rendering.

## Formation packages and the yellow board (v18)

Solo offense now commits before the defense chooses coverage. CPU offensive calls
are selected when the playbook opens and remain fixed when the human changes
coverage. The defender sees the public formation, not the route or run/pass call.
CPU defensive calls use situation, team identity and observed formation tendencies;
they do not read the selected play's kind. Personnel is selected before the call and
locked for the defensive possession, including first downs and penalty repeats.

The lobby offers Base (2 DL, 2 LB, 3 DB), Nickel (2 DL, 1 LB, 4 DB), and Heavy
(3 DL, 2 LB, 2 DB). These substitute actual rated roster players. Heavy adds a
third rusher; its linebackers must cover more space. Nickel adds coverage personnel
at the expense of a linebacker. Pause queues a preference for the next defensive
possession. CPU personnel responds to prior overall run/pass history between
possessions. No unit or difficulty receives artificial speed or rating bonuses.

Twelve universal calls bring the total catalog to 48, with 32–33 available per team:

| Formation | New runs | New passes | New play-action |
| --- | --- | --- | --- |
| Singleback | Zone right | Stick / flat | PA cross; PA post / dig |
| Pistol | Pistol zone; Pistol toss | Pistol spacing | Pistol PA seam |
| Bunch right | Bunch inside; Bunch toss | Bunch switch | Bunch PA sail |

Each package shares exact pre-snap coordinates. Existing standard calls also live
under Singleback; wing, offset, boot and jet alignments remain under Special looks.
The playbook filters by formation, then run/quick/deep/PA, with six calls per page.

Play-action keeps the ball with the QB during an 0.85-second animated mesh. Passing
and burst become available after the fake; the back then joins protection. Eligible
AI linebackers/safeties get one recognition roll per snap. A fooled defender steps
toward the run lane briefly, then returns to the coverage assignment. A visible
throw takes precedence, and the human-controlled defender always follows input.
The last 24 snapped calls are stored independently for each team and formation;
run history lends credibility, while repeated play-action reduces it. The current
call is added only after its recognition evaluation. Calls changed in the huddle
never enter the history; a snapped play can be observed even if a later flag erases
its statistics.

Arcade tuning uses a smoothed run rate `(runs + 2) / (snaps + 4)` and fake rate
`PA / (snaps + 4)`. Recognition combines 75% individual recognition with 25% unit
recognition. Fake execution averages QB composure/accuracy and RB agility. Chance
is bounded at 4–82%, with Rookie/Pro/All-pro offsets of +.12/0/−.10; the read's
commitment lasts .30–1.35 seconds plus the normal defensive read interval. This is
an arcade model, not a claim about real-world play-action probabilities.

The pregame yellow board compares the same run and fake alignment side by side.
Recorded highlight breakdowns add an intended receiver's actual route and dotted
pass flight. A false-step label requires both the recorded fake reaction and at
least .3 yards of observed movement toward the line; a reaction roll alone cannot
invent a highlight. Call names and pre-snap tendencies are detached with the clip,
and factual teaching copy is retained through the rotating booth dialogue. All
illustrations remain labeled separately from recorded game footage.

Validation: 182 JavaScript tests plus two Flask route tests. Browser checks cover
phone portrait (428×926), phone landscape (926×428), and desktop (1440×1000):
formation selection, fake/throw timing, personnel locking, defensive call order,
yellow-marker toggle and recorded replay rendering. Chromium touch emulation does
not substitute for physical iPhone Safari testing. Cache keys advance together to
v18 so phones fetch a consistent module graph.

## Word-paced booth chatter (v19)

Pregame, halftime and postgame now share optional original 8-bit dialogue sounds.
`boothChatter` defaults to true, including when upgrading an older saved audio
configuration. The checkbox is available directly in the booth and in Pause, and
its setting persists with `pg-audio`. It is independent of Effects and Music but
uses the main volume. Chatter alone is sufficient to activate/resume Safari's
playback AudioContext from a trusted tap; an Effects toggle is never required.

Al uses a brighter filtered square-wave blip; John uses a lower, rougher pulse.
These are nonverbal synthesized sounds, with no speech recording or voice model.
Word length controls duration, deterministic pitch variation follows the text,
and punctuation inserts rests. The same timeline drives speaking turns and the
current caption word. The complete caption stays visible; assistive technology
gets the complete turn without repeated word-by-word live announcements. Music
is gently lowered during active booth dialogue and restored when the show pauses.

Scheduling is bounded to at most four short pulses in the current word. Pausing,
skipping, replaying a segment, hiding the page, closing the show, muting, or losing
the audio context cancels its nodes. Recovery schedules only the remaining current
word; it cannot replay a backlog. No gameplay RNG or game clock is involved.

Validation: 189 JavaScript tests and two Flask tests. Desktop and phone-sized touch
browser checks cover default-on migration with Effects/Music disabled, visible-word
synchronization, both hosts, pause/resume, skip/exit cancellation and saved opt-out.
Actual Web Audio rendering produces distinct, non-silent, unclipped waveforms for
both hosts. Physical iPhone speaker/Bluetooth routing still needs device testing.
The asset graph advances together to v19.
