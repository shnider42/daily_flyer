# Pocket College Hoops

DailyFlyer's top-down, 5-on-5 college basketball game, inspired by Pocket Gridiron's direct player control, team identity, playbook, broadcast presentation, and keyboard/touch input. Built 27 November 2026.

## Play

The static application lives in `public/`. It has no installation step, external game assets, roster API, accounts, server process, or runtime third-party requests. Serve that directory with any static HTTP server. The intended production host is `https://dfe-pocket-basketball.onrender.com/` on branch `feat/pocket-basketball`.

Render settings:

- Service type: **Static Site**.
- Build command: `node --test games/pocket-basketball/tests/*.test.mjs`.
- Publish directory: `games/pocket-basketball/public`.
- `SKIP_INSTALL_DEPS=true`; no dependencies need installation.
- Auto-deploy on commits to the feature branch.

Do not publish the repository root: it contains other DFE projects. The new game does not modify Pocket Gridiron's source or deployment branch.

## Included in the first release

- Ten active players, five per team, with eight-player rosters and queued substitutions.
- 16 recognizable college programs with program-inspired courts and colors: UConn, Duke, North Carolina, Kansas, Kentucky, UCLA, Indiana, Michigan, Michigan State, Syracuse, Georgetown, Villanova, Gonzaga, Florida, Houston, Boston College.
- **All 128 players are fictional.** Ratings, strengths, and tactics are original arcade balancing, not official statistics or current team assessments. See `ROSTER_SOURCES.md` for identity references and provenance.
- Quick matchup, unlimited 5v5 practice, and an eight-team Campus Cup. Cup opponents advance through simulated results; the user's games are playable. Completed rounds and settings save in browser storage. An interrupted game restarts from its beginning.
- Pick-and-roll, motion, drive-and-kick, and post-up offense; man, 2–3 zone, and full-court press defense. Calls alter teammate positions and decisions.
- Directional/contextual passing, direct receiver buttons, click/tap passing, defender switching, screening, sprint stamina, steals, blocks, layups, dunks, jumpers, and physical rebounds.
- Shots use a held/released meter. Timing, player ratings, distance, pressure, and fatigue affect outcomes. Passes follow fixed destinations; receivers adjust on foot.
- Two halves, 30-second shot clock, 20-second offensive rim-rebound reset, backcourt violations, 2/3-point scoring, shooting fouls, playable free throws, one-and-one/double bonus, five-foul disqualification, and repeated overtime. A legal shot released before the horn resolves before the period ends.
- Four lengths: 90 seconds, 3 minutes (default), 6 minutes, or 20 minutes per half. Overtime is one minute in arcade lengths and five minutes at regulation length.
- Separate opponent difficulty and Simple/Moderate/Expert guidance.
- Responsive court rotation, full-court/follow camera, adjustable controls size, left-handed layout, box scores, halftime report, and manual replay of the last made basket.
- Original synthesized dribble, sneaker, net, rim, whistle, buzzer, and crowd sounds. Sound is opt-in, gesture activated, muted on pause/hide, and uses no background timer. The menu preview is silent.

## Controls

The primary buttons follow the [Pocket Sports controller standard](../../docs/pocket-sports-controls.md): a fixed Xbox-style right-thumb diamond with **Y on top, X left, B right, A bottom**. The letters and positions stay fixed; their action labels follow possession. Left-handed mode moves the cluster without rearranging its internal diamond.

| Touch button | Offense | Defense / recovery | Keyboard |
| --- | --- | --- | --- |
| **A · bottom** | PASS | SWITCH to nearest eligible teammate to the ball | J |
| **X · left** | SHOOT / free throw: hold and release near green | STEAL on press | Space |
| **Y · top** | SCREEN | BLOCK | L for screen/block; R also blocks |
| **B · right** | SPRINT | SPRINT | Hold Shift or K |

| Other action | Keyboard / pointer | Touch |
| --- | --- | --- |
| Move | WASD or arrows | Left stick |
| Switch alias | Q or Tab | A / SWITCH |
| Legacy steal alias | E | X / STEAL |
| Direct pass | Click teammate | Tap teammate or receiver button |
| Direct defender selection | Click defender | Tap defender |
| Play call | 1–4 | Plays panel |
| Contain | Hold C or Control | Position your defender manually |
| Timeout | T | Timeout in playbook |
| Pause | P / Escape | Pause button |

The face-button labels describe the on-screen touch controls. Keyboard and touch are supported; physical gamepad input is not implemented by this layout.

Movement always follows the screen orientation. The selected player has a gold ring. On possession changes, control goes to the new ballhandler or an appropriate defender. A changes from PASS to SWITCH, X from SHOOT to STEAL, and Y from SCREEN to BLOCK; B stays SPRINT.

Winning team possession clears incompatible held actions and starts a roughly 500 ms shot guard measured in simulation time. A fresh release/press is also required, preventing a held steal from turning into an accidental shot. Presses during the guard are discarded rather than queued; movement and deliberate passing remain available. An offensive rebound does not need a new turnover guard, but held inputs still require a new press. Own-team passes keep offensive labels during flight, with no queued shots before the catch; shots and other loose balls use recovery controls until secured.

Held movement and sprint continue through possession changes and automatic dead balls; opening menus or losing focus clears held inputs. A held shot is canceled when its player/possession context changes.

Players run faster without the ball than while dribbling. Wider corners and weak-side outlets, one motion cutter at a time, and a big who clears the driving lane keep the offense spread out. Only the closest recovery players chase loose rebounds; the others preserve passing outlets. Physical separation, slimmer player silhouettes, and separated position badges make close matchups easier to read.

## Deliberate arcade rules

This is solo vs CPU, with no online multiplayer. Automatic dribbling/inbounds, three timeouts per team, short default halves, and simplified foul detection keep possessions quick. All dead balls stop the clock. Traveling, three-second violations, offensive fouls, goaltending, jump-ball possession procedures, replay challenges, and other administrative NCAA rules are not fully modeled. This is not a complete NCAA rules simulator.

Rules checked against official references:

- [NCAA men's rules hub](https://www.ncaa.org/championships/playing-rules/mens-basketball-playing-rules/)
- [2026–27 NCAA major rule differences](https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/common/2026-27PRXBB_MajorRulesDifferences.pdf)
- [2026–27 men's table-crew reference, October 1, 2026](https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/men/2026-27PRMBB_TableCrewReferenceSheet.pdf)
- [Official court diagram](https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/men/PRXBB_CourtDiagram.pdf)

## Architecture and reuse

`engine.js` is DOM-free and deterministic for a given seed/input stream. `teams.js` holds the catalogue; `view.js` renders Match instances and snapshots; `input.js` owns independent pointers; `audio.js` synthesizes game sounds; `season.js` manages brackets and versioned local storage; `app.js` connects UI, simulation, and replay state.

`public/vendor/pgi-controls.js`, `device-audio.js`, and `math.js` are copied unchanged from the existing Pocket Sports shared core in `daily_flyer/themes/pocket_sports_assets/core/`, based on PGI commit `b2067c82307f01fcb4d4331b443e3d3a617a95fc`. Keeping the small primitives bundled makes this static build self-contained. Future shared input fixes should be ported here explicitly.

Canvas uses device-pixel ratio capped at 2, caches the procedural arena, and keeps player labels upright when rotating the court. Simulation uses a fixed 60 Hz step. Replay snapshots never advance the live simulation or RNG. No real frame-rate claim is made by the headless tests.

## Verification

Run from the repository root:

```sh
node --test games/pocket-basketball/tests/*.test.mjs
```

The 63-test suite covers scoring, shot timing/contest/range, pass flight and receiver control, rebounds, possession/shot-clock changes, backcourt violations, fouls and free throws, substitutions, halftime/overtime, completed CPU games, snapshot isolation, independent touch ownership, canceled shots, possession-sensitive actions, turnover shot guards, faster off-ball movement, offensive spacing, body separation, mute/hidden-page audio, and Cup advancement/save corruption.

Browser review covered the desktop game, controls and shot release, pause/settings, and responsive 390×844 portrait / 844×390 landscape layouts, including mobile playbook selection. Mobile viewport checks used a browser fixture; physical iPhone touch feel and speaker behavior still need hands-on review. QA fixtures are not part of the published application.
