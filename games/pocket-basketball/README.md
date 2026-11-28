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

## Game features

- Ten active players, five per team, with eight-player rosters and queued substitutions.
- 16 recognizable college programs with program-inspired courts and colors: UConn, Duke, North Carolina, Kansas, Kentucky, UCLA, Indiana, Michigan, Michigan State, Syracuse, Georgetown, Villanova, Gonzaga, Florida, Houston, Boston College.
- **All 128 players are fictional.** Ratings, strengths, and tactics are original arcade balancing, not official statistics or current team assessments. See `ROSTER_SOURCES.md` for identity references and provenance.
- Quick matchup, unlimited 5v5 practice, and an eight-team Campus Cup. Cup opponents advance through simulated results; the user's games are playable. Completed rounds and settings save in browser storage. An interrupted game restarts from its beginning.
- Pick-and-roll, motion, drive-and-kick, and post-up offense; man, 2–3 zone, and full-court press defense. Calls alter teammate positions and decisions.
- Directional/contextual passing, leading bounce passes, eligible alley-oop passes, direct receiver buttons on desktop, click/tap passing, defender switching, playbook screens, sprint stamina, steals, blocks, layups, dunks, jumpers, and physical rebounds.
- Shots use a held/released meter. Timing, player ratings, distance, pressure, and fatigue affect outcomes. Passes follow fixed destinations; receivers adjust on foot.
- Two halves, 30-second shot clock, 20-second offensive rim-rebound reset, backcourt violations, 2/3-point scoring, shooting fouls, playable free throws, one-and-one/double bonus, five-foul disqualification, and repeated overtime. A legal shot released before the horn resolves before the period ends.
- Four lengths: 90 seconds, 3 minutes (default), 6 minutes, or 20 minutes per half. Overtime is one minute in arcade lengths and five minutes at regulation length.
- Separate opponent difficulty, Simple/Moderate/Expert guidance, and game pace. Pace defaults to 80%, adjustable from 60% to 100% without exceeding the original full speed.
- Responsive court rotation, full-court/follow camera, adjustable controls size and opacity, customizable touch assignments, left-handed layout, box scores, halftime report, and manual replay of the last made basket.
- Original broadcast-style music, synthesized crowd voices and arena ambience, and dribble, sneaker, net, rim, whistle, and buzzer effects. Sound is opt-in, with separate music, crowd, and court-sound levels. Paused menus, replay, and hidden pages are silent.

## Controls

The primary buttons follow the [Pocket Sports controller standard](../../docs/pocket-sports-controls.md): a fixed Xbox-style right-thumb diamond with **Y on top, X left, B right, A bottom**. The letters and positions stay fixed; their action labels follow possession. Left-handed mode moves the cluster without rearranging its internal diamond.

| Default touch button | Offense | Defense / recovery | Keyboard |
| --- | --- | --- | --- |
| **A · bottom** | PASS | SWITCH to nearest eligible teammate to the ball | J |
| **X · left** | SPRINT | SPRINT | Hold Shift or K |
| **Y · top** | THRU PASS: leading bounce pass or an eligible near-rim alley-oop | BLOCK | L for through pass/block; R also blocks |
| **B · right** | SHOOT / free throw: hold and release near green | STEAL on press | Space |

Open **Touch controls** from the lobby, **Pause > Touch controls**, or **Controls & rules > Customize touch controls**. This dialog contains **Controls size**, **Control opacity**, **Left-handed layout**, and assignments for the four action pairs. Control opacity defaults to **45%**, adjustable from **10% to 100%**. It fades the entire face buttons, joystick and knob, and receiver buttons, including their letters and text. A live sample in the dialog shows the effect against a court background while you drag the slider. Choosing a pair already assigned elsewhere swaps the two assignments, so every action remains reachable. The letters stay in their fixed positions, and each paired action continues to follow possession.

Preferences save automatically in the same browser. **Reset button mapping** resets only the four assignments to **A = PASS/SWITCH, B = SHOOT/STEAL, Y = THRU PASS/BLOCK, X = SPRINT**; controls size, opacity, and handedness retain their saved values. Existing saved SCREEN/BLOCK assignments migrate to THRU PASS/BLOCK in the same physical position, preserving other custom assignments. Touch assignments do not change keyboard shortcuts.

Steer toward a runner and press **Y / L** for a through pass. The ordinary result is a leading bounce pass. A suitable teammate near the rim, an aim toward the basket, and a passer close enough to the play can produce an alley-oop; the button changes from **THRU** to **LOB** when the opportunity is available. The receiving player must reach the lob before finishing; the lob itself is a pass, not an automatic shot or basket. Use **High pick & roll** in the playbook to call for a screen instead of Y.

| Other action | Keyboard / pointer | Touch |
| --- | --- | --- |
| Move | WASD or arrows | Left stick |
| Switch alias | Q or Tab | SWITCH (A by default) |
| Legacy steal alias | E | STEAL (B by default) |
| Direct pass | Click teammate or desktop receiver button | Tap teammate |
| Direct defender selection | Click defender | Tap defender |
| Play call | 1–4 | Plays panel |
| Contain | Hold C or Control | Position your defender manually |
| Timeout | T | Timeout in playbook |
| Pause | P / Escape | Pause button |

The face-button labels describe the on-screen touch controls. Keyboard and touch are supported; physical gamepad input is not implemented by this layout.

Movement always follows the screen orientation. The selected player has a gold ring. On possession changes, control goes to the new ballhandler or an appropriate defender. With the defaults, A changes from PASS to SWITCH, B from SHOOT to STEAL, and Y from THRU PASS to BLOCK; X stays SPRINT. Custom assignments keep those action pairs together on the chosen buttons.

Winning team possession clears incompatible held actions and starts a roughly 500 ms shot guard measured in simulation time. A fresh release/press is also required, preventing a held steal from turning into an accidental shot. Presses during the guard are discarded rather than queued; movement and deliberate passing remain available. An offensive rebound does not need a new turnover guard, but held inputs still require a new press. Own-team passes keep offensive labels during flight, with no queued shots before the catch; shots and other loose balls use recovery controls until secured.

Held movement and sprint continue through possession changes and automatic dead balls; opening menus or losing focus clears held inputs. A held shot is canceled when its player/possession context changes.

After a made basket, the scoring scene holds for **1.0 simulation second**, then the next team has **1.25 simulation seconds** for automatic inbound setup. Both clocks pause throughout this reset, including after a made final free throw. It takes about **2.8 real seconds at the default 80% pace**, or 2.25 seconds at 100%. An and-one goes directly to its additional free throw; a period-ending basket proceeds to the break or final result. Held steering and sprint resume with play, while shot presses during the reset are discarded.

Players run faster without the ball than while dribbling. Wider corners and weak-side outlets, one motion cutter at a time, and a big who clears the driving lane keep the offense spread out. Only the closest recovery players chase loose rebounds; the others preserve passing outlets. Physical separation, slimmer player silhouettes, and separated position badges make close matchups easier to read.

CPU defenders react to cuts and passing with a short delay and individual preferences for defensive spacing and shading. Defensive ratings, difficulty, and fatigue affect those adjustments. Man, zone, and press retain their distinct assignments, with tracking reset for new possessions, restarts, substitutions, and defensive calls. Their variation is seeded for the match and does not add a fresh random direction on every frame.

## Mobile court layout

On phones and short landscape viewports, a compact **48px scoreboard** keeps both scores, period, game clock, shot clock, team fouls/bonus, **Plays**, and **Pause** at the top. The court fills the space below it. The movement stick and face-button diamond overlay the lower corners, with no separate bottom control tray or reserved side panels. The mobile full-court camera uses less spectator border to show a larger playing surface. Left-handed mode swaps the thumb zones while retaining the Y/X/B/A diamond.

The current phase remains visible in a small status overlay; foul and scoring messages, the shot meter, and release feedback remain available on the court. Repeated coaching lines, the selected-play caption, player-name panel, MOVE/keyboard captions, receiver shortcut row, and court utility buttons are hidden on mobile. **A / PASS** still passes in the aimed direction, and tapping a teammate passes directly to that player. With a custom layout, the assigned PASS button retains that behavior. Uncovered court areas remain available for player taps between the overlaid controls.

Use **Plays** for offense/defense calls, timeouts, box scores, the last-basket replay, and help. Use **Pause > View** to change between full court and follow camera, and **Pause > Full screen** for the fullscreen control. Pace, touch customization, sound, player labels, substitutions, and other pause actions remain accessible there. Opening these mobile panels pauses the game.

Desktop keeps its separate playbook, receiver shortcuts, coaching information, player details, and court camera/fullscreen buttons.

## Game pace

Set **Game pace** in the lobby or Pause. The default is **80%**, with **60–100%** available in **5-point steps**; 100% is the original full speed. The preference saves in the same browser and applies to every mode, including an ongoing game when changed from Pause.

Pace slows player movement, ball travel, AI reactions, clocks, cooldowns, and restarts together, preserving the relationship between a pass and a receiver's run. The shot meter also follows pace. At 80%, a full hold takes **1.5 real seconds**, with the ideal release near **0.98 seconds**; the green target stays in the same place. A 500 ms possession shot guard lasts about **625 real milliseconds**. Opening Pause clears held inputs before changing pace, so the setting cannot turn an old press into a new action.

Replay plays at half the selected pace without advancing the live game. The lobby preview follows the same pace, while menus, interface feedback, and camera easing remain responsive.

## Audio

Open **Audio settings** from the lobby or **Pause > Audio settings**. **Game sound** is the master on/off control and defaults to off. The three level sliders run from **0% to 100% in 5-point steps** and save in the same browser:

| Audio control | Default | What it controls |
| --- | --- | --- |
| Music | 55% | Lobby theme and short game-transition cues |
| Crowd | 65% | Arena murmur, cheers, oohs, ahhs, and boos |
| Court sounds | 80% | Ball, sneakers, rim, net, whistles, and buzzer |

The music is an original eight-bar theme at **118 BPM**, about **16 seconds** long, built from brass/synth parts, bass, drums, and fills for an early-2000s sports-broadcast feel. It loops in the lobby. Opening tip, second-half/overtime starts, timeouts, and period endings use short excerpts; ordinary possessions do not restart the full theme. The lobby's simulated game does not produce court effects.

The crowd uses **synthesized collective vowel sounds**, including layered oohs, ahhs, and boos, with a quiet arena bed. These are generated voices and ambience, not recordings of real spectators. Reactions favor the home team: scores and defensive plays can draw cheers, lob/dunk attempts draw anticipation, and misses or opponent scores draw disappointment. Calls against the home team can draw occasional boos. Reaction priorities and cooldowns limit overlapping voices; an out-of-bounds call alone does not imply a turnover reaction.

Audio requires a user gesture and the master switch. Setting a category to 0% mutes that part of the mix. Opening menus, starting replay, or hiding the page stops playback; sound resumes for the appropriate scene after menus close or play resumes. The settings dialog stays silent while adjusting levels. At halftime and the final buzzer, gameplay is already stopped while a brief **1.15-second presentation** lets the horn and short music cue play before the silent break dialog opens.

All music, voices, and court effects are generated locally; no broadcast recordings, external audio files, or background scheduling timers are used.

## Deliberate arcade rules

This is solo vs CPU, with no online multiplayer. Automatic dribbling/inbounds, three timeouts per team, short default halves, and simplified foul detection keep possessions quick. All dead balls stop the clock. Traveling, three-second violations, offensive fouls, goaltending, jump-ball possession procedures, replay challenges, and other administrative NCAA rules are not fully modeled. This is not a complete NCAA rules simulator.

Rules checked against official references:

- [NCAA men's rules hub](https://www.ncaa.org/championships/playing-rules/mens-basketball-playing-rules/)
- [2026–27 NCAA major rule differences](https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/common/2026-27PRXBB_MajorRulesDifferences.pdf)
- [2026–27 men's table-crew reference, October 1, 2026](https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/men/2026-27PRMBB_TableCrewReferenceSheet.pdf)
- [Official court diagram](https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/men/PRXBB_CourtDiagram.pdf)

## Architecture and reuse

`engine.js` is DOM-free and deterministic for a given seed/input stream. `teams.js` holds the catalogue; `view.js` renders Match instances and snapshots; `input.js` owns independent pointers; `control-context.js` resolves possession-sensitive actions; `touch-layout.js` normalizes saved assignments and migrates legacy screen mappings; `pace.js` defines the default and bounds shared by the app and shot meter; `audio-score.js` builds original music and crowd buffers, while `audio.js` manages playback, scenes, levels, and court effects; `season.js` manages brackets and versioned local storage; `app.js` connects UI, simulation, and replay state.

`public/vendor/pgi-controls.js`, `device-audio.js`, and `math.js` are copied unchanged from the existing Pocket Sports shared core in `daily_flyer/themes/pocket_sports_assets/core/`, based on PGI commit `b2067c82307f01fcb4d4331b443e3d3a617a95fc`. Keeping the small primitives bundled makes this static build self-contained. Future shared input fixes should be ported here explicitly.

Canvas uses device-pixel ratio capped at 2, caches the procedural arena, and keeps player labels upright when rotating the court. Simulation uses a fixed step of 1/60 of a simulation second; the selected pace controls how simulation time advances against real time. Replay snapshots never advance the live simulation or RNG. No real frame-rate claim is made by the headless tests.

## Verification

Run from the repository root:

```sh
node --test games/pocket-basketball/tests/*.test.mjs
```

The required suite passed **113/113 tests**. It covers scoring, shot timing/contest/range, pass flight and receiver control, rebounds, possession/shot-clock changes, backcourt violations, fouls and free throws, substitutions, halftime/overtime, completed CPU games, snapshot isolation, independent touch ownership, canceled shots, possession-sensitive actions, turnover shot guards, faster off-ball movement, offensive spacing, body separation, audio scenes/mixing/reactions and mute/hidden-page behavior, and Cup advancement/save corruption. Touch-mapping checks cover all 24 assignments, legacy screen-to-through migration, safe recovery from malformed settings, swaps, and held inputs across menu changes.

The compact mobile layout was checked in a browser fixture at five viewport sizes. Geometry checks passed at each size, including the score and clocks, phase/status, Plays and Pause access, control bounds, and fixed Y/X/B/A ordering. Measured canvas dimensions and HUD heights were:

| Viewport | Previous v6 canvas | Previous HUD | Compact canvas | Compact HUD |
| --- | --- | --- | --- | --- |
| 390 × 844 | 390 × 477 | 63px | 390 × 796 | 48px |
| 428 × 926 | — | — | 428 × 878 | 48px |
| 812 × 354 | 449 × 253 | 51px | 812 × 306 | 48px |
| 926 × 428 | — | — | 926 × 380 | 48px |
| 320 × 568 | — | — | 320 × 520 | 48px |

The 390 × 844 v6 baseline used controls size 1.25. A dash indicates that a baseline measurement was not recorded. These are canvas dimensions, not a claim that every pixel is unobstructed playing space: the mobile thumb controls overlay the court.

The review checked minimum and maximum control sizes, with face buttons approximately **49.6–78px**, **45% opacity**, and left-handed mode moving the two groups without rearranging the diamond. Interaction checks covered movement, a **975 ms B-button hold at 80% pace** producing **GREAT RELEASE · OPEN**, opening Plays and returning after a call, nested Pause → Touch controls dialogs, switching to Follow camera, and a hit reaching the canvas through an uncovered part of the controls overlay. Desktop review confirmed the six-column scoreboard, including Plays and Pause, remained correctly arranged.

Audio checks used a real `AudioContext` and visible fixture diagnostics. Opting in started one lobby music loop; entering the game replaced it with the crowd bed. Diagnostics confirmed home-score cheers, boos for a call against home, lob anticipation, and disappointment after an away basket. Pause and master mute stopped all sources, suspended the context, and discarded reactions. In the actual app, menus stayed silent; Music 0% and Crowd 75% survived reload before restoring the defaults. Audio-dialog scrolling worked at 320 × 568, and nested Pause → Audio settings → Done → Pause → Back to game worked at 812 × 354. Timestamped app flows kept the break modal closed at the horn, then opened halftime after **1,230 ms** and the final after **1,182 ms**, against the 1,150 ms target; afterward audio was paused with zero active sources. No application console errors were observed. No subjective listening assessment was performed.

Earlier touch-customization checks at 390 × 844 and 812 × 354 verified saved assignments after reload, matching hints/help, resetting while retaining size and handedness, and nested dialogs keeping play paused. The current viewport checks used a browser fixture; native iPhone Safari, physical touch feel, and device speaker behavior were not tested. QA fixtures are not part of the published application.
