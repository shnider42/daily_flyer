# Pocket College Hoops: programme and roster provenance

## What is real and what is original

The 16 college programme identities, city names, and named home venues refer to real institutions. The game uses a compact familiar venue name, sometimes omitting a full institutional or sponsorship title. The campus court is used for UConn and Villanova, which also play some home games elsewhere.

**All 128 players are original fictional arcade characters.** Their names, jersey numbers, positions, heights, appearance, abilities, and squad assignments do not represent a current, historical, or all-time college roster. The teams are not tied to a particular season. Any resemblance of a generated name to a real person is incidental.

Player and team ratings are game-balance values on a 50–96 scale, not official ratings or measured statistics. Team playstyles and pace are deliberate game design: they draw on familiar college-basketball archetypes and should not be described as the current tactics or strength of any real programme. Colours are hand-chosen programme-inspired game palettes, not a comprehensive official brand-standard implementation. No official logos or player likenesses are bundled.

The primary sources below were checked on 27 November 2026 for programme/venue identity. They are references for the catalogue, not live data feeds; the game makes no calls to them while playing.

| Programme | Venue shown in game | Official reference |
| --- | --- | --- |
| UConn Huskies | Gampel Pavilion | [UConn facility](https://uconnhuskies.com/sports/2018/6/12/facilities-gampel-pavilion-html?path=sad) |
| Duke Blue Devils | Cameron Indoor Stadium | [Duke facility](https://goduke.com/facilities/cameron-indoor-stadium/11) |
| North Carolina Tar Heels | Dean E. Smith Center | [UNC facility](https://goheels.com/facilities/smith-center/136) |
| Kansas Jayhawks | Allen Fieldhouse | [Kansas facility](https://kuathletics.com/facilities/allen-fieldhouse/188) |
| Kentucky Wildcats | Rupp Arena | [Kentucky facility](https://ukathletics.com/facilities/rupp-arena/) |
| UCLA Bruins | Pauley Pavilion | [UCLA schedule announcement](https://uclabruins.com/news/2026/09/16/mens-basketball-announces-2026-27-schedule) |
| Indiana Hoosiers | Assembly Hall | [Indiana facility](https://iuhoosiers.com/facilities/detail/2) |
| Michigan Wolverines | Crisler Center | [Michigan facility information](https://mgoblue.com/sports/2017/6/16/facilities-crisler-information) |
| Michigan State Spartans | Breslin Center | [Michigan State facility](https://msuspartans.com/facilities/jack-breslin-student-events-center/5) |
| Syracuse Orange | JMA Wireless Dome | [Syracuse facility](https://cuse.com/facilities/jma-wireless-dome/526?Live=8383) |
| Georgetown Hoyas | Capital One Arena | [Georgetown facility](https://guhoyas.com/sports/2018/6/6/facilities-gu-verizon-center-html.aspx) |
| Villanova Wildcats | Finneran Pavilion | [Villanova facility](https://villanova.com/sports/2024/8/5/finneran-pavilion.aspx) |
| Gonzaga Bulldogs | McCarthey Athletic Center | [Gonzaga facility](https://gozags.com/facilities/mccarthey-athletic-center/1?path=tickets) |
| Florida Gators | O’Connell Center | [Florida facility](https://floridagators.com/sports/2026/7/1/stephen-c-oconnell-center) |
| Houston Cougars | Fertitta Center | [Houston schedule announcement](https://uhcougars.com/news/2026/9/16/mens-basketball-mens-basketball-reveals-2026-27-schedule) |
| Boston College Eagles | Conte Forum | [Boston College facility](https://bceagles.com/facilities/conte-forum/1) |

## Catalogue contract

`public/teams.js` is a DOM-free ES module that exports:

- `TEAMS`: 16 entries; each has eight fictional players. The first five are PG, SG, SF, PF, C. The bench positions are G, F, C.
- `getTeam(id)`: returns the matching entry, falling back to UConn for an unrecognised ID.
- `OFFENSE`: four calls with IDs `pickroll`, `motion`, `spacing`, `post`.
- `DEFENSE`: three calls with IDs `man`, `zone`, `press`.
- `ROSTER_NOTE`: short disclosure for the lobby and roster screens.

Player `height` is in inches. Team `tempo` is a dimensionless 0.86–1.16 multiplier. Each player has ratings for `speed`, `shooting`, `inside`, `passing`, `handle`, `defense`, `rebound`, `stamina`, and `freeThrow`. Team overview ratings use `rebounding`, while player ratings use `rebound`.

The deterministic rating construction combines positional baselines, team advantages, small individual variation, and a small reserve adjustment. Fictional appearance is assigned independently of ratings. Save files should use stable team IDs rather than array positions.
