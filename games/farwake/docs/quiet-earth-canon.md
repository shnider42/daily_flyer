# Quiet Earth: continuity and corridor authoring

This is the project reference for the Earth mystery and the corridor mission format. Read it before extending either. Player-facing records belong in the existing evidence and archive systems. This document includes author knowledge that must not appear in early mission summaries, map labels, tooltips, objectives, music names or undiscovered notebook entries.

## What the player can establish now

Relay Nine on Morrow is a human installation. Human handwriting, repair plans, evacuation copies and household objects should communicate that before a character explains it. Its branching service passages are successive repairs to an old facility. Their arrangement is stable within a galaxy; a new galaxy's seed selects another arrangement. The building does not rearrange itself while somebody is inside.

The original Earth evacuation happened. Humanity's outward movement began as a necessity, not a universal project of conquest. The factions subsequently made different choices about rescue, control, ownership and survival. Do not use a larger mystery to excuse a faction's recorded actions.

Five optional Relay Nine records contribute small pieces:

| Physical record | Evidence the player actually has | What it does not establish |
| --- | --- | --- |
| Departure order | A civilian order prioritizes evacuation and strikes out territorial claims. Its explanation is missing. | Every human expedition was peaceful, or why leaving was necessary. |
| Maintenance plan | Human crews repeatedly isolated failed service branches and kept a separate return-light circuit. | The building is moving or its geometry changes on re-entry. |
| Three departures | A human analyst saw an unexplained resemblance across three nonhuman evacuation records. | The resemblance has one cause or applies to every species. |
| The Collective translation | An uncertain translation describes a nonhuman campaign and a preceding homeworld warning, with a very old proposed date. | A verified chronology, a present-day ally or enemy, or the cause of Earth's crisis. |
| Five explanations | Five attributed faction arguments disagree about the missing cause. | The game endorses any of those explanations. |

These records remain optional. The required fault transcript and service strip still operate the corridor's existing evidence gates. Recovering the receiver recording and escaping never requires finding every lore alcove. A player can ignore the wider investigation and keep living, working and traveling in the galaxy.

## Author direction: reserve the explanation

Humanity is not the first species to face the underlying homeworld problem. The direction is a recurring problem rooted in the relationship between a species and its home planet, not merely a human political mistake. Its exact mechanism has **not been settled**. Do not invent a definitive virus, machine intelligence, cosmic god, planet consciousness, species fault or scientific law and silently promote it to canon.

The Collective is a nonhuman organization or faction, not a synonym for all aliens or an existing species. It encountered the problem before humanity and began galactic conquest thousands of years earlier. Its current membership, continuity, motives and affiliation with the familiar factions remain open questions. The game must earn any later confirmation with evidence. A translated name alone does not establish identity across thousands of years.

Species, culture, faction membership, reputation and hostile intent remain separate facts. Do not make Choral, Vaeli, Keth or Oru people hostile because a Collective record exists. Do not add the Collective to the ordinary reputation or military-enlistment catalog until a real playable relationship requires it.

The previously agreed late-campaign endpoint is a revelation of Earth's corruption reaching its core. Keep that for the end of the deeper investigation. It must not be disclosed by early data titles, loading copy, a soundtrack title, an omniscient narrator or a generic NPC rumor. The mechanism and the player's eventual options still need authoring. A new corridor should add an observation or challenge an interpretation, not repeat an exposition speech about the final answer.

## Reconcile the already released Earth campaigns

The original eight chapters and **Earth: The Long Silence** already establish surviving people, repaired atmosphere, local councils, real rescues, quarantine orders, unaccountable administration and a lawful return route. Those are real events. The new investigation asks what was underneath and before them. Surface recovery and functioning communities do not prove that the deeper problem ended.

Preserve existing survivor identities, rewards, flags, landing permission, chosen allies and council decisions. Do not reset the player because a later chapter deepens the explanation. Do not turn a living council into a hallucination or declare a completed rescue imaginary to make a twist work. A later discovery can challenge a character's conclusion without deleting the evidence they actually observed.

The old Blindpost testimony remains an account of the documented bureaucracy. Its claim is scoped to the interdiction order: that order can be explained by its signatures; it does not establish the cause of the earlier homeworld emergency. This distinction leaves the deeper inquiry open without assigning old human wrongdoing to a secret alien puppet master.

## Existing faction arguments

Keep the actual faction identities from `dist/content.mjs`:

| Faction | Current archived interpretation | Keep the uncertainty |
| --- | --- | --- |
| Terran Continuity | Quarantine contained the disaster. | Rescue and emergency authority can both be real; an indefinite order is not proof the whole policy was justified. |
| Freewake Union | Powerful people made leaving necessary. | A critique of coercion does not identify the homeworld mechanism. |
| Meridian Combine | Collapsing supply chains made remaining impossible. | Explaining a material shortage does not settle who caused it or who profited. |
| Lantern Assembly | A similar homeworld pattern might recur elsewhere. | Repeated measurements are evidence; universality and cause need more. |
| Cinder Clans | A sealed home can become somebody else's claim. | Suspicion about ownership is not a verified invasion record. |

These are attributed archived arguments, not one opinion held by every member. Characters may disagree with their faction, change their interpretation when evidence changes, or refuse to speculate. No fragment awards faction membership, changes allegiance or marks somebody as a target.

## Reusable corridor format

Use a deliberate rhythm with variable local details:

1. Give the player an ordinary, concrete reason to enter. Keep the outside exit usable and explain the next physical action in plain language.
2. Let long travel and small human details do the work. Reuse suit light, fog of war and staged power restoration. A readable route still matters in Simple guidance.
3. Add loops, side rooms and dead ends whose evidence or visual payoff makes exploration worthwhile. Keep enough direct route markers that a maze does not become a reading test.
4. Use occasional harmless motion or sound. A start can stall, a second sound can fail to arrive, a coat or cart can look like somebody. Most of the time, let nothing happen. A harmless cue never damages the player, alerts a dormant hostile or starts combat music.
5. Separate unease from the real encounter. The current Morrow opening track continues through harmless events. Danger scoring needs actual active danger, and its title must not spoil what happened.
6. When a scene turns dangerous, show a physical change and let the player respond. Keep the weapon usable before the encounter. Escape is a valid objective; do not add an unnecessary kill-all gate.
7. Preserve the route the player learned. Return strips and relays remain useful under pressure. Do not teleport the pursuer onto the player or silently replace safe geometry with a wall.
8. Record what happened, what was recovered and what remains uncertain. Keep discovery optional beyond the local task. Use a smaller next lead instead of announcing the entire campaign solution.

This is a format, not a demand that every future corridor ends in the same receiver ambush. Some can remain harmless, require a rescue, leave a question unresolved, or return to a place whose people remember the player. Change the rhythm as well as the wallpaper. Ship each new episode as authored content; do not advertise future chapters as already playable.

## Reuse these systems

| Need | Existing implementation to extend |
| --- | --- |
| Physical records, choice gates, partial work, one-time rewards | `expedition-story-rules.mjs`, `expedition-rules.mjs`, `exploration.mjs` |
| Corridor content and stable identifiers | `quiet-earth-content.mjs` |
| Seeded optional branches and evidence anchors | `quiet-earth-layouts.mjs` |
| Once-only harmless cues and authoritative encounter phase | `quiet-earth-rules.mjs` |
| Fog, suit light, staged lighting and presentation | `quiet-earth-lighting.mjs`, `quiet-earth-presentation.mjs`, `surface.mjs` |
| Optional fragments and attributed interpretations | `quiet-earth-lore.mjs`, `content.mjs`'s `LORE`, the captain's existing `knownLore` |
| Current task and map target | `quietEarthStatus`, `storyStatus`, `expedition-guide.mjs` |
| Actual danger and music transitions | `music-context.mjs`, `music-director.mjs`, `music-catalog.mjs`, `recorded-theme.mjs` |
| Personal consequences and later acknowledgment | `voyage-memory.mjs`, `voyage-reactions.mjs`, existing narrative/campaign aftermath rules |
| Death, recovery and getting home | `medical-recovery.mjs`, `military-recovery.mjs`, `ship-recovery.mjs` |
| Species and culture distinct from allegiance | `species.mjs`, `species-content.mjs`, existing faction rules |
| Shared galaxy authority and persistence | The same Game rules through `server/realm.mjs`; no client-only progression grants |

Do not make a second quest engine, journal, lighting system, combat score selector or reputation system for later corridors. Use site-specific records and choices within these systems. A future site needs its own identity and receipt namespace; it must not impersonate `morrow:site:relay-nine` to inherit behavior or payments.

## Persistence and verification contract

The galaxy seed selects physical variation. Re-entry, save/load, reconnect and a second captain must produce the same layout for that galaxy. Do not use wall-clock time, render frames, `Math.random()` or the entering captain's personal ID for site geometry or scare placement. The released Morrow main floor, required records, choices, exit and claim IDs stay intact; its additional service networks preserve existing saved positions.

Shared site receipts remember that somebody read a record. The collected archive belongs to the actual captain who read it. Validate the physical record and interaction before granting its `loreId`; do not award every optional fragment on entry or copy another captain's archive just because the site's shared state contains its receipt. Repeat reading may recover a personal copy but never duplicates credits or items.

For changes in this area, check reachable required objects and optional record anchors, a usable return route, stable geometry for matching seeds and variation for different seeds. Check harmless cues do not imply real danger, real danger takes music priority, old claimed rewards remain claimed, and personal evidence survives save/load without leaking to unparticipating captains. Use the relevant existing solo and shared corridor tests; add a focused regression only for a changed behavior or concrete risk.
