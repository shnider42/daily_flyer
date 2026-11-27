# Squad versus squad: design proposal

Status: discussion only. This release adds no competitive mode, matchmaking, opponent control, PvP damage rules, or additional network seats.

## Recommended first experiment

Two opposing four-soldier squads, with one or two humans on each side and AI controlling unclaimed soldiers. Each human directly controls one soldier and can switch to a free standing teammate. This keeps the game's existing combination of direct fighting, orders, casualty care, and mobile controls. Four humans per side can follow if the smaller format proves readable and fair.

Use a short, purpose-built objective map rather than putting two teams into an existing campaign mission. Start with one contested supply case, an announced pickup window, and two extraction choices per team. A team must recover and carry the case to an extraction. Carrying slows that soldier and leaves the rest of the squad responsible for cover. Alternate initial sides between rounds. These are proposed rules to test, not a finalized game mode.

A five-to-seven-minute round is a useful initial target. There should be a brief regroup period. An extraction should require a short uninterrupted interaction and announce its location to both teams. Exact carrier positions should remain subject to ordinary team sight. Overtime should apply only to an extraction already underway and have a hard deadline; simply hiding with the case must not extend the round indefinitely. Decide explicitly whether a dropped case is globally marked. Avoid a kill-count victory condition in the first experiment: casualty recovery and extraction should matter more than farming AI soldiers.

## Decisions worth testing before committing

- **Command:** designate one human commander per team, independently of loadout and match-host privileges. For the first prototype, command should remain with that player when they switch soldiers. The other human can request orders and ping. Specify predictable succession on disconnect and never seize another human's movement. Each team chooses and locks its own loadouts; the room host must not configure an opponent's composition unilaterally.
- **Casualties:** start with one life per soldier, recovery and switching to a surviving free soldier. Current cooperative revives do not consume a medical kit, so a competitive mode needs an explicit finite revive cost or count. Choose downed protection, bleed-out duration and friendly-fire behavior consistently before the prototype. A single replacement wave could be a later test; it adds another supply economy and should not precede a working casualty loop.
- **Composition:** start with the same six infantry choices and the same total squad size on both teams. Use an open briefing showing each team's own loadouts. Do not add class bans until playtests identify a specific imbalance.
- **Snipers:** long sightlines need several covered crossings and flanking routes. Scope power, moving accuracy, ammunition, and shot recovery all need PvP-specific evaluation. A class that is fair against AI may be oppressive against a person.
- **Armored infantry:** protection must remain readable and beatable; objective carrying plus armor should not produce an unstoppable courier. Tune movement and carry penalties together.
- **Vehicles:** leave tanks out of the first competitive prototype. Their hull cover, cannon splash, repair economy, and limited approaches introduce several balance problems at once. Later test a neutral, finite support opportunity or symmetric armored support, not an unannounced tank spawn.
- **Mobile aiming:** use the same deliberate outer-ring fire control. Current assistance against AI is not automatically appropriate against people. Compare transparent, limited assistance across input types; keep mouse/touch fairness separate from difficulty settings.
- **End conditions:** handle disconnects, an entirely downed team, an abandoned case, tied time, and both carriers dying before building a public queue.

## Networking prerequisites

Both sides need the same playable-soldier combat and casualty rules. Current `enemy` actors use different damage, weapons, targeting and immediate-death behavior, while the simulation stores one global squad, formation and aid state. The second team cannot be implemented by putting human-controlled actors in that existing collection. Introduce separate team ownership, command, formation, aid and objective state while retaining the same six playable profiles on each side. A competitive setup should explicitly exclude campaign encounters, reserve support, campaign carryover and unrelated ambient combatants.

The server must own movement validation, ammunition, damage, orders, objective state, and each team's visibility. Existing cooperative shared sight cannot simply be relabeled as two teams. Build two separate visibility sets and return only the opponent data the receiving team is allowed to know.

Hidden enemy sounds still need to be audible. Competitive clients should receive only the information required for plausible audio: a hearing-limited, coarse sound origin for unseen sources, timing, and a sound category. Do not transmit exact hidden actor positions, IDs, routes, aim, health, or targeting information just to play a shout. Client rendering must not be the security boundary.

Apply that rule to complete packets, not just actors: bullets, grenades, effects, bodies, bloodstains, near-pass trajectories, radio, statistics, rosters and objective events can all disclose hidden positions or ownership. Define a team-facing whitelist for each category and explicit exceptions for announced objective information. Decide which distance, delay and occlusion calculations remain on the server so coarse hidden sound origins preserve the established acoustic behavior without disclosing exact sources.

Maintain team-specific explored terrain and last-known contact rules. Personal fog-density preferences may change the overlay but must not change server sight. Pings cannot reveal actors or extend sight. Reconnects must recover only the reconnecting team's allowed state.

Add fair spawn placement, duplicate-command rejection, bounded input rate, team ownership checks, and explicit match epochs. Evaluate latency using measured server input age and a bounded policy for shot reconciliation. Do not promise perfect parity or add unlimited lag compensation: the acceptable tradeoff needs playtests under real mobile connections.

## Map and presentation requirements

A first map should offer at least three traversable approaches to the contested area, clear boundaries, short routes back into a round, and interiors that provide genuine cover. Symmetry of opportunity matters more than identical scenery. Test reachable objective and extraction locations for both teams, including squad and casualty navigation.

Keep the combat HUD minimal. Show team identity, the current objective state, time remaining, personal health/ammunition, and existing thumbsticks. Team roster and role details belong in the squad tray. A downed player needs an obvious route to a free soldier or a clear recovery timer. Avoid permanent enemy roster information.

Use distinct, restrained team cues that are readable without relying only on red and green. Friendly and hostile voices must not become a constant sound bed. Directional combat audio remains grounded in actual events.

## Prototype gates

1. A private one-human-per-team match completes with correct ownership, visibility, casualty, objective, and end rules.
2. Two humans per team can join, switch soldiers, disconnect, reconnect, and finish without duplicating actors or supplies.
3. Hidden state stays absent from complete opponent snapshots and event payloads; sound and projectile metadata cannot expose precise hidden units.
4. Both sides can reach the objective and both extraction options with all valid loadouts.
5. Small mobile portrait and landscape layouts remain usable through aiming, shooting, orders, aid, and soldier switching.
6. Timed playtests reveal whether waiting, camping, sniper dominance, or replacement-wave snowballing outweigh the squad decisions.

Only after those gates should public matchmaking, rankings, more maps, or competitive armor become part of the scope.
