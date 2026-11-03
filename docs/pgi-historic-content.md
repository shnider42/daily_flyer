# PGI: Sunday Scrapbook expansion (v22)

## Play modes

- Exhibition retains seven-a-side and offers eleven-a-side. Eleven-a-side adds three offensive linemen, a lead blocker and four defenders; special-teams units also contain eleven unique athletes. The camera shows more field vertically and sprites are slightly smaller. Both formats retain PGI's 100-yard scoring field and approximately 53-yard width; this is still arcade football, not a complete regulation simulator.
- Training has passing, running, field-goal and punt drills, each with three targets. Outcomes use the normal football simulation. Attempts stop at the play result and can be retried immediately.
- Legends has four independently selectable chapters, saved attempts and best stars. Completing all four fills the Sunday Scrapbook; twelve stars is the mastery target. Difficulty and Simple / Moderate / Expert guidance remain separate.
- Classic Games starts each of the four historical matchups from kickoff, with selectable game length and field format. Scores are not predetermined. Modern PGI arcade rules apply.

## Historical scope

Eight curated game-day squads contain 219 real players, including starting units and selected substitutes/specialists. These are **not exhaustive active rosters**. Personnel combinations and ratings are authored arcade interpretations. No current players are used as placeholders. Season labels correctly say 1981 and 2016 for games played in January 1982 and February 2017. The Super Bowl LI lineup excludes unavailable Rob Gronkowski. Danny White also punts for Dallas. Jim Otto retains jersey 00.

Game-day starting lineups were checked against:

- [Raiders at Steelers, December 23, 1972](https://www.profootballarchives.com/nflboxscores1/1972nfl183.html)
- [Raiders at Chargers, September 10, 1978](https://www.profootballarchives.com/nflboxscores1/1978nfl017.html)
- [Cowboys at 49ers, January 10, 1982](https://www.profootballarchives.com/nflboxscores1/1981nfl232.html)
- [Official Super Bowl LI gamebook](https://nflgsis.com/2016/Post/04/57167/Gamebook.pdf)

Substitute names, positions and numbers were checked against the corresponding Pro Football Archives season pages: [1972 Pittsburgh](https://www.profootballarchives.com/1972nflpit.html), [1972 Oakland](https://www.profootballarchives.com/1972nfloak.html), [1978 Oakland](https://www.profootballarchives.com/1978nfloak.html), [1978 San Diego](https://www.profootballarchives.com/1978nflsd.html), [1981 Dallas](https://www.profootballarchives.com/1981nfldal.html), [1981 San Francisco](https://www.profootballarchives.com/1981nflsf.html), [2016 New England](https://www.profootballarchives.com/2016nflne.html), and [2016 Atlanta](https://www.profootballarchives.com/2016nflatl.html). Gamebook jersey numbers take precedence over season-table discrepancies, notably Joe Thuney (62) and Andy Levitre (67).

## Playable interpretations

- **The Catch:** SF down 21–27, third-and-three at Dallas's six, 58 seconds before the snap. Montana's rollout and Clark's end-zone route use the passing engine. The goal is a Clark touchdown, not winning the entire game. [Cowboys historical account](https://www.dallascowboys.com/news/spagnola-heartbreaking-moments-change-course-of-cowboys-history-453541).
- **Immaculate Reception:** PIT down 6–7, fourth-and-ten at its 40, 22 seconds. An animated ricochet starts a timed Harris scoop, then a live run. The disputed original contact is not resolved by this game. [Raiders oral history](https://www.raiders.com/news/fifty-years-raiders-oral-history-immaculate-reception-steelers-nfl-franco-harris).
- **Holy Roller:** OAK down 14–20 at San Diego's 14, ten seconds. Two controlled checkpoints represent Banaszak advancing the loose ball and Casper recovering in the end zone. This explicit scripted historical exception does not alter normal fumble rules. The chapter earns six; the original extra point won the game. [Pro Football Hall of Fame](https://www.profootballhof.com/news/the-holy-roller).
- **Edelman:** NE down 20–28, first-and-ten at its 36, 2:28. The timed catch earns 23 receiving yards, not a touchdown. Three actual Atlanta defenders appear around the catch. [Patriots account](https://www.patriots.com/news/julian-edelman-s-crazy-catch-keys-historic-super-bowl-win-290971).

The animated checkpoints slow the action for control and teaching. They are original game scenes, not archival footage or frame-exact historical reconstructions. All source links are accessible from each chapter's history disclosure.

## Game pace and stadium

The optional play clock runs for 40 seconds on scrimmage setup and 25 seconds for kicks from scrimmage / post-delay setup. Delay costs five yards or half the distance and preserves the down and line to gain. Pause, broadcasts and replay hold it. The existing duel clock remains separate.

Optional TV breaks last six seconds, can be skipped, hold game time and occur at most once in each of the first three quarters at an eligible possession change or quarter break. They have no advertisements or network dependency.

More frequent, varied, phone-audible contact grunts retain rate limits. Crowd level and filter respond to scores, misses, turnovers, fumbles, first downs, third-down home defense and late close games. Practice uses a quiet background. The existing Effects/contact switches and master volume still govern sound. Actual iPhone hardware audio is not verified by desktop browser QA.

## Validation

215 Node tests and two Flask route/asset tests pass. Automated input-driven runs complete all four Legends chapters and all three punt targets; full eleven-player matches reach final with current and historic teams. Browser walkthroughs cover the mode hub, field-goal training, historic briefing, 22-player kickoff and a 428-pixel phone layout. No app JavaScript errors were observed. Physical iPhone Safari and speaker output still require device testing.
