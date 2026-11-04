# PGI v30 — playbook systems

Adds 42 offensive calls and 20 defensive calls. The catalog now contains 91 offensive and 40 defensive calls; each matchup uses a subset based on team, system and defensive personnel.

## Choosing a book

Match Setup has independent offensive system selectors for the player and opponent. Team identity retains the established team book plus six appropriate new calls. A named system supplies its six new calls plus supporting calls from the related legacy book. Its formation opens first. Training, scripted Legends and online duel offense remain controlled by their existing rules.

The defensive book selector chooses actual personnel. The four new calls for that system appear first in the full defensive book and receive weight in suggestions. Existing coverage calls remain available. Personnel stays fixed through a defensive possession; Pause changes queue for the next series. CPU defenders begin with their team's arcade scheme and may choose Heavy or Nickel between series based on observed play history.

## Offense: six calls per system

| System | New calls | Behavior |
| --- | --- | --- |
| Run & Gun | Gun switch seams; Gun fade / dig; Gun deep cross; Gun curl / seam; Gun delayed draw; Gun counter right | Vertical spacing, deep crossers and draw counters. Long routes need protection; underneath space is the outlet. |
| West Coast | Slant / flat; Snag triangle; Y cross / pivot; Split-back boot left; Split zone left; Pro stretch right | Rhythm throws, short-to-long reads and yards after the catch. Press coverage and crowded short zones can disrupt the timing. |
| Wing-T | Buck sweep right; Belly lead; Wing counter left; Wing-T inside trap; Waggle flood; Belly pop pass | Buck sweeps, traps and misdirection from one tight look. Disciplined edges force the back into traffic. |
| Air Raid | Shallow / sit; Mesh / wheel; Wide stick switch; Wide sail left; Post / dig / seam; Wide-gun inside zone | Wide spacing, crossing routes and layered passing answers. Light rushing volume and long throws invite pressure. |
| Power I | I strong isolation; I power weak; I counter GT; I toss left; I PA post / over; I PA TE leak | Lead blocks, pulling guards and downhill runs. An extra defender in the box can close the designed gap. |
| Spread / QB Run | Spread QB power; Spread QB counter; Spread jet left; Spread sprint flood; Spread spacing; Spread seam / out | Wide formations with called QB runs and receiver motion. Contain and a fast spy make the quarterback earn the corner. |
| Pistol Play-Action | Deep pistol duo; Pistol counter left; Pistol pin / pull; Pistol PA deep over; Pistol PA boot right; Pistol PA scissors | Deep-back runs and convincing play-action from the same stance. Repeated fakes lose their effect; deeper exchanges take time. |

Each system's six calls share a starting formation so the alignment does not reveal run versus pass. Full-team formations keep five offensive linemen, seven players on the line and four backs. New movement includes two-puller buck sweeps/counter GT, wing and jet exchanges, called QB keepers, delayed draws, play-action boots and a delayed tight-end release. Existing A/B/C pass controls and rating-based movement, contact, stamina and injury systems apply. These are authored arcade interpretations, not scanned team playbooks or automatic read-option/RPO decisions.

## Defense: four calls per system

| System | 11-player personnel | New calls |
| --- | --- | --- |
| 4–3 Base | 4 DL · 3 LB · 4 DB | 4–3 Under / Cover 3; 4–3 Tampa 2; 4–3 Over / Quarters; 4–3 Sam fire |
| 3–4 Odd | 3 DL · 4 LB · 4 DB | 3–4 Okie / Cover 3; 3–4 Cross dog; 3–4 Drop eight; 3–4 Zone exchange |
| 46 Bear | 4 DL · 3 LB · 4 DB | 46 Bear / Cover 1; 46 Bear / Zero; 46 Bear zone fire; 46 Bear corner fire |
| 4–2–5 Nickel | 4 DL · 2 LB · 5 DB | Nickel two-man; Nickel quarters; Nickel slot fire; Nickel left bracket |
| 3–3–5 Stack | 3 DL · 3 LB · 5 DB | 3–3–5 Stack / Cover 3; 3–3–5 Bandit fire; 3–3–5 Double spy; 3–3–5 Cloud 2 |

Every new call has a complete assignment for all 11 defenders, including down linemen dropping into coverage, variable rush counts, man assignments, deep safeties, brackets and spies. Seven-player mode has explicit reduced assignments for each call; labels show the actual reduced personnel. Diagrams for the new defensive calls illustrate the full 11-player design. The 3–4 and Stack draw additional linebackers from the actual roster; Nickel and Stack draw a fifth defensive back. Unsupported packages are disabled for thin historic rosters, and the engine falls back to Base if an unavailable choice reaches it. Heavy remains available for short yardage.

The famous Bears scheme is the 46, named for Doug Plank's jersey number, rather than a 4–6 personnel count. Reference: [Chicago Bears — Plank discusses origin of 46 defense](https://www.chicagobears.com/news/plank-discusses-origin-of-46-defense-17295836). PGI's version uses 4 DL, 3 LB and 4 DB, crowded interior alignment and aggressive rush/coverage choices. Current-team scheme assignments are PGI variety choices, not claims about real 2026 coaching systems.

All-decade identity additions: 1950s/1960s Wing-T; 1970s Power I; 1980s West Coast; 1990s Run & Gun; 2000s Air Raid; 2010s Spread; 2020s Pistol. Original curated rosters, ratings and era calls remain. Any named offensive system can also be selected for cross-era experimentation.

## Validation

Targeted tests cover catalog uniqueness, system membership, identical pre-snap disguises, legal alignments and route starts, all 32 current/eight decade defensive personnel counts, missing-depth fallback, complete assignments in both field sizes, all new plays under player and CPU control, exchange recipients, two pullers, delayed release, CPU run tendencies and possession-locked substitutions. Seven full games exercise each selected offense and all five defensive systems. Existing play-count assertions are updated; the legacy counter movement test fixes its opponent to zone so an enlarged random defensive catalog cannot change the blocking setup.

Verification completed: 261 Node gameplay tests and two Flask route/asset tests pass. Browser checks confirm both offensive selectors, defensive package selection, saved preferences, normal pregame/kickoff flow, and the new offensive/defensive playbook pages. Both 390 × 844 phone previews fit without horizontal overflow. All cache-busted module imports use v30; approved music assets remain unchanged.
