# PGI college rules

College exhibitions use the `college` rules profile. Pro exhibitions retain the established `pro` arcade profile. These are selected before kickoff; there is no mid-game rule change.

## Implemented differences

| Area | College | Existing pro arcade profile |
| --- | --- | --- |
| Hash marks | 60 feet from each sideline, 40 feet apart. Subsequent scrimmage snaps are placed on or between the hashes from the previous play's dead-ball position. Formation, route and protection coordinates move with the ball. | NFL hashes, 18 feet 6 inches apart; existing centered-snap gameplay is preserved. |
| Boundary receptions | One foot in bounds. | Two feet in bounds. |
| Diving catches | A receiver who goes to ground is immediately down, without requiring contact. | An untouched receiver can get back up; contact while grounded ends the play. |
| Point after touchdown | Human chooses a kick for one or a scrimmage play for two. Both snap from the 3-yard line. The held PAT is a 20-yard kick. | Existing automatic PAT choice from the 15, producing a 32-yard kick. |
| Two-point try | One untimed scrimmage play. Touchdown awards two, including a defensive return; no first down, punt or field-goal call. A safety on the try awards one point. Replayable penalties and delay of game preserve try status. | No new pro conversion-choice UI in this release. |
| Kickoff fair catch | A clean catch behind the receiving team's 25 awards its 25. Farther catches stay at the catch spot. A signaled catch recovered after touching the ground cannot be advanced or claim the clean-catch award. | Existing punt fair-catch controls, without college's kickoff award. |
| Kick on end-zone turf | An untouched kickoff hitting end-zone turf is dead. A controlled aerial catch may still be returned or downed. | Existing arcade kickoff return/touchback behavior. |
| Overtime | Each team gets a possession from the opponent's 25. A first-possession field goal or touchdown does not end the game. OT2 requires two-point tries after touchdowns. OT3 onward consists of alternating two-point attempts from the 3. The first offensive team alternates by period. No game clock. Defensive scores on ordinary OT downs end the game; defensive scores on tries still follow the paired-possession logic. | Existing sudden-death overtime with a kickoff. |

The catch rule uses a deterministic two-foot footprint at the receiver's position. A catch at extended reach creates a brief diving/grounded state. This gives the two codes different outcomes at the boundary and after a diving reception without pretending that the game has a full 3D catch/replay simulation.

College overtime does not offer punts. A second-possession offense that needs a touchdown is not automatically sent out to kick a losing field goal, and its suggested calls omit that losing kick. Field-goal suggestions distinguish taking three with a reply still due, forcing another period, and winning outright.

## Deliberate arcade limits

The match-length options and game clock are unchanged: the clock runs during live scrimmage plays and returns, and stops during play selection. Consequently there is no added first-down clock-stop procedure, two-minute administrative stoppage, or full NCAA/NFL clock-management simulation. Timeouts and college overtime coin-toss/end-selection administration are simplified; the starting offense is selected by the game RNG and alternates thereafter.

The existing penalty subset remains pocket holding, offside, encroachment, and optional play-clock delay of game. This release does not implement a complete NCAA penalty/review system, targeting, pass interference, NCAA's 2026 fair-catch field-goal option, or the current NFL dynamic-kickoff and guaranteed-possession overtime rules. The pro mode is therefore labeled **Pro arcade**, not a complete current NFL rules simulation.

Historical college moments own their scenario clocks, scores, and end conditions. They do not enter the modern exhibition overtime state merely because a moment is marked as overtime. A scenario may pass `historicalMoment: true` to disable automatic exhibition overtime initialization at a regulation tie.

## Rule references checked

Primary references, accessed 2026-11-07:

- [NCAA football playing-rules hub](https://www.ncaa.org/championships/playing-rules/football-playing-rules/) and its linked [2026 NCAA Football Rules Book](https://ncaaorg.s3.amazonaws.com/championships/sports/football/rules/PRMFB_RulesBook.pdf): Rule 1-2-1-j (hashes); 2-4-3 (catch); 3-1-3 (extra periods); 4-1-3-b/c (down without contact, untouched kick dead in end zone); 6-5-1 (fair catch); 8-3-1/2/3 (try values, three-yard snap, ends/replays).
- [NCAA: How college football overtime works](https://www.ncaa.com/news/football/2025-01-01/how-college-football-overtime-works): accessible explanation of the possession, OT2 and OT3 progression. The 2026 rulebook was used to confirm those provisions remain current.
- [NCAA: Changes to injury timeouts approved in football](https://www.ncaa.org/news/media-center-changes-to-injury-timeouts-approved-in-football/): confirms the current third-overtime alternating-try format and notes timeout administration that PGI does not simulate.
- [NFL 2026 Rulebook](https://operations.nfl.com/rules-officiating/2026-nfl-rulebook) and its [official PDF](https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf): Rule 1 (field dimensions/hash marks), 8-1-3 (completed pass), 11-3-1 (try spots). Used for the comparison, not as a claim that PGI implements every NFL rule.

## Engine/UI contract

`Game(..., {ruleset: 'college'})` explicitly selects college rules. Without an explicit profile, two teams marked `college: true` or `ruleset: 'college'` select it automatically. One college and one unmarked team do not silently change pro rules; the lobby separately prevents mixed-level exhibitions.

The UI reads `game.rules`, `game.ruleset`, `game.rules.hashMarksYards`, `game.ballX`, `game.canFairCatch`, and `game.collegeOvertime` (`period`, `firstTeam`, `series`, `offense`). `series` is zero for the first possession and one for the second. `quarter` is `4 + period` in college overtime, and `clock` stays zero.

The human PAT choice is `phase === 'try_choice'`; `chooseTry('kick' | 'two')` acts on it. `game.tryAttempt` marks a live two-point series, and `game.tryRequiredTwo` indicates OT2 or later. `beginTwoPoint(team)` is also available to explicit scenarios. `beginDrive` accepts an optional fifth argument for lateral ball placement; college clamps it to its hash interval. Normal next-play handling derives that position from the completed play.

`tests/gridiron/college-rules.test.mjs` covers boundary catches, ground/contact handling, every formation at both college hashes in 7v7 and 11v11, PAT/try legality and penalties, late-game tie conversions, overtime possession progression and defensive scoring, kickoff fair-catch/ground rules, and complete seeded college games.
