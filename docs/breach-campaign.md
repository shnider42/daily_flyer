# Breach — Thirteen Signals / campaign proposal

Status: the thirteen-cue soundtrack and listening room ship in 0.8.2. This
campaign is a concrete design proposal built around the seven existing maps.
Connecting briefings, durable chapter progress, additional story evidence and
the ending choice described here are not implemented campaign features.

## The through-line

You enter to restore contact with a damaged research facility. At first,
silence means failed equipment. As you reconnect the network, its replies
become less trustworthy. In the last chapter, isolation may be the one system
that was still working.

The Hollow already supports this direction: its records describe an extra
sign-out, containment rings slowing what travels with a sound, and playback
answering questions before they are asked. Build the connective tissue toward
those existing discoveries. Do not explain the anomaly away in a boss speech.

The operator's changing purpose is the spine: **escape → reconnect → trace →
understand → choose**. Each mission needs a different dramatic job even where
its current mechanical vocabulary is power, two relays, a key and extraction.

## Seven chapters, three acts

These times are first pacing targets for a guided solo playtest, not measured
completion times. Do not enlarge an early map just to meet a number. The
longer expeditions should be resumable across sessions.

| Chapter | Target | Existing play / proposed connecting story | Musical role | Deliberate silence |
|---|---:|---|---|---|
| **1. Blacksite 07 — First breach** | 8–12 min | Existing emergency-power/key escape establishes the operator. Proposed debrief redirects a failed evacuation request to Dead Relay. | **Iron Wake** or **Containment Pulse** after a fight is established. | Arrival, first movement/fire learning, machinery restarting, extraction. |
| **2. Dead Relay — An answer too early** | 10–15 min | Existing ring power and relays unlock the vault. Add a recovered acknowledgment whose timestamp precedes the request. | **Dead Carrier** in the discovered vault; ordinary combat can use the early pool. | Relay instructions and the actual recovered message. A quiet vault is also a valid outcome. |
| **3. Crosslink — Confirm the route** | 8–12 min | Existing compact relay operation provides a concentrated action chapter and an optional co-op introduction. Proposed evidence points below the network. | **Dry Contact** for sustained local pressure. | Partner planning, waiting at a console, the mission's final transmission. |
| **4. The Underworks — The machine underneath** | 30–45 min | Existing nine-sector upgrade expedition is the campaign's first large opening. New context reframes the crown network as infrastructure for isolation. | **Crown Circuit** at the crowns; **Spare Air** for one exchange pause; **Weight of Stone** only after guardian exposure. | New equipment, route planning, refuges, transit and the first boss attacks. |
| **5. Switchyard — What a shortcut costs** | 15–25 min | Existing routing and freight combat make this a more compact, physical chapter. Proposed shipping records connect the facility's biological and signal research. | **Counterweight** for a committed fight. **Exit Load** only if resistance remains near the lift on the return. | Cabinet numbers, observing factions, first arc-caster use and safe extraction. |
| **6. The Glasshouse — A system that keeps itself alive** | 20–30 min | Existing shields, menders and cultivation wings show the network sustaining an ecosystem. Add evidence that our repairs helped it propagate. | **Glass Teeth** and **Root Pressure** alternate character; the opening ten seconds of qualifying pressure stay clear. | Practice bay, first shield/healing tells, quiet gallery exploration and reading. |
| **7. The Hollow — The recording answers first** | 35–55 min | Existing twelve-sector expedition, tapes and containment routes pay off the campaign. Add a final containment/evacuation decision after the Choir Keeper. | **Below the Carrier**, **The Room Replies**, optional **Weight of Stone**, and **Exit Load** only if the return is dangerous. | Long approach, every record, cabinet decisions, first guardian cycle, safe return and final report. |

A first full run targets roughly two to three-and-a-quarter hours, with
substantial variation from exploration and difficulty. The Underworks and
Hollow must not feel like back-to-back endurance tests; Switchyard supplies a
shorter, decisive middle beat. Playtest the sequence before changing map size.

## The ending should be an action, then a consequence

After the Choir Keeper, propose two clearly labeled uses of the existing
routing vocabulary:

- **Keep isolation:** lock the repeaters away from the outside network. Take
  the longer established evacuation route and leave the signal behind.
- **Open evacuation:** divert part of the isolation grid to a direct lift
  route. Get out faster while leaving part of the network live.

These are proposed consequences, not current simulation behavior. Both routes
must be traversable and completable with the current mission loadout. Do not
turn missing a collectible, ammo expenditure, or a downed partner into an
unannounced bad-ending condition. Explain the tradeoff before commitment.

Communicate the result through the facility: which rings remain lit, which
doors close, whether a receiver stays active. End with a short written report
and environmental sound. There is no automatic victory anthem or cheap final
jump scare. Optional recovered evidence changes what the report can establish,
not whether the player deserves to finish.

## What carries across chapters

Carry chapter completion, recovered evidence, chosen ending and campaign
settings. Keep chapter replay available independently of the campaign.
Preserve each map's authored starting equipment and its internal progression;
a full late-game arsenal would erase the Underworks upgrades and Glasshouse
practice sequence. Explain transfers between operations in the briefings.

Add a separate versioned campaign save with a chapter checkpoint and evidence
ledger. Never overwrite the current solo run merely by browsing a chapter.
Distinguish Continue Campaign from replaying a completed chapter. Migration
from existing saves should preserve them and offer starting at the first
uncompleted chapter when evidence supports that choice.

Current co-op covers Crosslink, Underworks, Glasshouse and Hollow. A complete
co-op campaign still needs Blacksite, Dead Relay and Switchyard parity,
durable room-independent progress, reconnection rules and a shared ending
confirmation. Keep local music preferences and threat sensing local. Neither
operator's remote fight should reveal itself through the other's score.

## Score the shape, not every room

The thirteen tracks are a palette, not a promise that every run hears every
track. Exploration should initially target 80–90% without non-diegetic music;
measure and revise that target in playtests rather than force a cue to meet a
quota. Preserve environmental sound throughout music silence.

The 0.8.2 implementation has one shared source budget and cooldown. Tracks are
selected from mission/zone pools with recent-repeat avoidance. Combat needs
local visible hostility, an opening grace, and a sustained-pressure hold.
Guardian presence gets a twelve-second exposure window. The first visible
attack cycles, navigation and reading matter more than the album.

Discovery cues get one opportunity in their occupied space. They wait for
twelve seconds of quiet and dwelling, expire after twenty-six seconds, and
are discarded when missed. They never act as hidden-room or hidden-enemy
announcements. Hollow revelations use a three-minute cooldown; other cues
use two minutes after ending or interruption. Nothing loops or automatically
fills the next silent gap.

In the listening room, all tracks can be auditioned without finding gameplay
triggers. Listening is explicit; no autoplay and no automatic next track.
MIDI downloads preserve editable parts; the game uses the procedural MP3
renders for consistent sound and low playback cost.

## A practical implementation order

1. Play the existing seven missions in order with 0.8.2's score. Record actual
   chapter length, cue count, silence share, and masked warnings. Revise music
   placement before adding more cues.
2. Add concise interchapter briefings, evidence links and a dedicated campaign
   continuation flow. Keep map progression and existing saves intact.
3. Add the two ending routes and make their consequences visible. Verify both
   with depleted inventory, all difficulties and checkpoint recovery.
4. Add durable campaign saves, migration and chapter replay. Then bring the
   remaining missions to co-op parity and test partner loss at every transition.
5. Compare a scored run with a fully music-muted run, including phone speakers.
   If a passage is clearer or more unsettling in silence, remove its cue.
