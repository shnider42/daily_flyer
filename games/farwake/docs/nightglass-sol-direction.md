# Nightglass, the Sol cordon, and ring habitats

Authoring direction recorded 2026-11-26 and implemented in Farwake 0.39.0 / Nightglass 0.4.0. The earlier source audit remains below as implementation history.

Sources checked: Farwake `feat/farwake-galaxy` at `f057e535a3ff548f112f4d0b0bb3cefb552aa0d8`; Nightglass `feat/farwake-lost-expeditions` at `30d0d388bf1c6d4b69cc9055d3890d1dc53eafe1`. Those were the pre-implementation baselines. Nightglass 0.4 now has three selectable cases: Luna, Mars and a Callisto outpost, with independent progress and two additional setting illustrations.

## Implemented release boundaries

- Farwake stays at 26 systems and gives each a public role, reachable activities and local encounter policy. See `system-identity-and-bosses.md`.
- Sol entry requires the recovered safe route and homeward clearance. Earth landing separately requires the arrival answer. Public origins exclude Sol. A cleared shared hull can transport guests without granting their personal evidence or final choices; the physical permit persists with the hull.
- The first eight story chapters preserve real local relief and point into the longer investigation. Late physical evidence establishes the final facts, followed by separate choices of account and allegiance. Follow-up threads continue after every route. Keep the actual findings out of early summaries and release notes.
- Ledger Ring and Still Berth use existing destination IDs and have playable inner districts, services, local work, space silhouettes and a rising far landscape. Still Berth’s sealed damage does not alter the Empty Ward evacuation.
- Nightglass is an incident witnessed in the first person, 93 years earlier. Its three local puzzles have explicit prerequisites and separate ambiguous last moments. Each witness’s scope is their own facility, with no claim to know the fate of an entire world.
- Farwake uses `quiet-earth-v2` and content revision 15; Nightglass uses its own new prequel save boundary. The user waived old WIP compatibility. Supported new progress still persists correctly.

## Decisions and their limits

| Status | Direction |
| --- | --- |
| Accepted | Nightglass takes place 93 years before Farwake. Its chapters show a person's final experiences at the affected location, as events unfold. |
| Accepted | Each chapter is a puzzle about an immediate situation. Completing the anthology need not explain the origin or full history of the disaster. |
| Accepted | Farwake's entire Sol system is under a cordon because a real infestation has affected part of the galaxy. The hazard is not merely a bureaucratic invention. |
| Accepted from the preceding discussion | Farwake can eventually discover the historical truth, but Earth cannot be restored as the home people hoped to recover. Local rescues and other consequential work remain meaningful. |
| Accepted | The Earth investigation is the long main campaign among other substantial campaigns. Its final loss is immediately placed alongside the lives and communities already built across the galaxy. Earth is lost; humanity and life are not. The metaphor concerns grief, changing identity, and the possibility of accepting that a worthwhile future does not require restoring one's place of origin. The captain can reject that lesson. |
| Accepted in the latest clarification | The game continues after every Earth-campaign outcome. The captain learns what happened and makes substantive choices about disclosure, action and allegiance. Supported directions include truth, a cover story, a knowingly dangerous invitation to return, joining what occupies Earth, and an independent course. Faction relationships influence these choices without removing the possibility of going rogue. |
| Accepted | The playable chart remains 26 systems, with 30 as the ceiling. Hearth, Sol and Crosswind remain. Ordinary instructions and conversations use clear language. |
| Implemented in 0.39 | Ledger Ring and Still Berth are two playable habitats inside the existing chart. Their inhabited districts and work give them distinct functions; no ancient superweapon mechanism is implied. |
| Requested exploration | Earth likely has a powerful coordinating intelligence of its own, with a Gravemind-like presence as a creative reference. Its identity, physical form, voice and exact powers must be original to Farwake and are not yet settled. |
| Late evidence | The main campaign now has a coherent, discoverable answer. Its observations and cause belong to the earned late stages. Earlier Collective translations remain attributed evidence rather than automatic confirmation. A radio channel alone is not an infection route. |
| Accepted | Profanity is allowed in dialogue and other appropriate in-world writing. Use it according to character and situation, while keeping instructions and meaning clear. |
| Open | Whether a particular Nightglass protagonist is the last person at a facility, on an expedition, or literally on an entire moon or planet. Do not turn a limited viewpoint into a census of a whole world. |
| Implemented in 0.39 | Meridian’s Ledger Ring and Cairnsea’s Still Berth provide two distinct ring districts without adding a system. |

The new user direction explicitly supersedes the earlier instruction not to make Nightglass a prequel. The current recovery-operator setup and successful return endings describe the old release; they are not constraints on the revised premise.

## Chronology and point of view

Use Farwake's opening as year 0 and Nightglass as year -93 while authoring. The chapters belong to the crisis period. They need not occur at the same instant, and their order does not automatically establish the direction of transmission. Message times, shift schedules and interrupted transfers can establish a limited sequence where useful.

The player inhabits the person who is still there. At the beginning, that person has an ordinary job and does not know they are the final witness. Their colleague is late, a relief craft has not checked in, a receiver needs repair, or someone is knocking where nobody should be. The notebook contains their observations; it is not an omniscient report written decades later.

The ending stops with what that person can perceive. No epilogue identifies the perpetrator, translates the monster's motives, supplies a medical diagnosis, or announces the meaning of every clue. An ending can establish a local fact while leaving the person's precise fate outside the remaining view. If a chapter shows a death, do not later disguise that observed death as an unobserved disappearance.

The phrase “last person” needs an explicit scope for each chapter before production. The current Farwake runtime includes Earth survivors, recent household records and local councils. A last witness at an isolated base can coexist with those people. A claim that every person on a world died requires a deliberate rewrite of later survivor identities and history. Do not invent re-colonization or fake survivors merely to hide this conflict.

## What a Nightglass puzzle should resolve

A chapter needs three understandable elements: what the person wants, what is preventing it, and what changes when the player acts. The wider explanation may remain unavailable. The controls and the consequence of a control should not be a riddle.

An effective sequence is:

1. Establish a recognizable task and a specific person the protagonist expects to hear from.
2. Show a plausible practical fault, with enough physical evidence to investigate it.
3. Let the player solve the local fault or establish what it actually is.
4. Reveal something that makes the reassuring explanation inadequate.
5. End at the limit of that person's experience, without a global answer screen.

The player should learn something concrete: the transmitter was working, the answer was recorded earlier, the missing person never entered the expected airlock, or an occupied room has no authorized occupant. These are example discoveries, not a universal set of infestation powers.

Completion is witnessing the chapter through its final event. Do not market an escape objective as freely winnable and then punish every correct action with the same unavoidable failure. Choices can affect whether a warning is sent, which evidence is left, what the person sees, or how much another location learns. They do not need to let the player reverse the established historical catastrophe.

Do not make the final interaction in every chapter “open the clearly unsafe door.” Competent maintenance work, cautious investigation and an appropriate emergency response can still leave someone in danger. A character's suspicion that they caused an event is not proof of causation.

## Three chapter proposals

These develop the user's examples. They are proposed local stories, not confirmed revelations about the organism.

| Chapter | Ordinary situation | Playable problem | Concrete discovery | Final experience |
| --- | --- | --- | --- | --- |
| Luna: Nightglass | The relief shift is overdue. Earth has not acknowledged a routine handover. | Diagnose the communications path: verify local power, compare the scheduled handover with the actual log, inspect the receiver, and restore a usable outbound channel. | The fault the operator expected does not explain the missing reply. A response or access event conflicts with the observed log. | A connection finally opens. The operator hears or sees enough to realize it is unsafe; the viewpoint ends before they can finish the warning. |
| Mars | Neither Earth nor the lunar relay has answered. An external sensor fault initially looks like ordinary weather or equipment damage. | Restore an external view through a local power or camera-control problem. Compare internal access records with what is outside. | Something outside cannot be accounted for by the site's own crew or vehicle movements. | The view becomes clear enough to understand the immediate danger. The person's reaction ends the scene before a useful identification or explanation. |
| An isolated outpost | The resident expects to be alone. Someone knocks at the access door. | Check the arrival berth, pressure record and door camera using systems the player has already learned. | There is no recorded arrival that accounts for the visitor. The local evidence supports a real discrepancy, not a cryptic warning. | The knocking changes, the door responds, or the sound comes from a nearer boundary. Endings should vary; another scream-and-static cut is not mandatory. |

For Luna, reuse the existing airlock, service junction, survey room, service bay, listening shaft, lower landing and surface beacon. The inspection circuit and independent return lights already provide a readable physical puzzle. Change why this person is using them and what the final action means. The revised story should not retain a successful later recovery operator by changing only the date in the title.

The current receiver is part of an acoustic pickup/playback puzzle. Earth communications need identifiable radio, antenna and routing equipment; do not turn a local speaker into a long-range transmitter by renaming it. Show the difference between a passing local self-test, a message leaving the base, and an authenticated reply from another person. A repair can demonstrably succeed while the expected human answer never arrives.

The channel event must not accidentally establish a radio-transmitted organism. A channel can expose an existing problem, carry an imitation, or coincide with a nearby event. Selecting among those requires a deliberate story decision.

For later chapters, vary both the puzzle and the ending. Communications, pressure, exterior visibility and missing arrivals offer distinct forms of investigation. Silence, a continued machine cycle, an unanswered connection or a last view can carry an ending without repeating the same loud interruption. Every sound clue needs a written equivalent.

Keep the existing illustrated scene-by-scene format, compact in-scene navigation and readable task strip. The user deferred further 3D work. Do not introduce a larger interface to explain the new lore.

## Farwake's main campaign: loss and recognition

The emotional endpoint is more specific than a tragic revelation. The player has spent a long campaign pursuing a reasonable hope of returning to Earth and making it a home again. The final evidence establishes that this cannot happen. Immediately alongside the loss, the campaign brings the existing lives, relationships and communities throughout the galaxy into view. Those accomplishments already exist. Humanity and life retain a future. The player can recognize their value without being forced to accept a particular lesson or choose to protect them.

The metaphor is about changing identity and accepting change. Recovering a place cannot restore the person or society one used to be. Earth still mattered, and its loss deserves grief. The story should not ridicule attachment to an earlier home, portray the past as worthless, or suggest that every loss is a necessary improvement. The recognition is that a future does not require repairing the origin first.

The investigation can still have been necessary. It can establish truth, end destructive uncertainty, expose responsibility, save people and let communities make informed choices. What turns out to be unnecessary is making all future life conditional on Earth's restoration. Do not tell the player that the hours spent investigating were pointless.

### Make the hope reasonable

Give hopeful people specific evidence and personal reasons. A recent authenticated transmission, a living community, a functioning shelter or a successful local repair can all be real. The error is extending a limited success into a promise that a whole planet can recover. Avoid a chorus of obvious liars whose confidence only exists to prepare a twist.

Nightglass shows catastrophe during an earlier crisis. Its protagonists cannot diagnose Earth's permanent condition ninety-three years later. Their final experiences must not reveal the later campaign's prognosis. The player can know terrible things happened and still reasonably hope that time, knowledge, survivors or a controlled expedition have changed what is possible.

The final proof must make the limit understandable. Do not punish the player for missing an obscure collectible, make a hidden “perfect” route restore Earth, or explain the loss only in an opaque scientific monologue. The exact physical mechanism remains open in this direction document. Once selected, earlier evidence should support it fairly without announcing it in advance.

### Interweave the campaign without making every story an Earth clue

Use the existing galaxy as an inhabited present. Main-campaign leads take the player into communities with their own urgent needs, arguments, humor, ambitions and histories. Some of that work reveals relevant evidence. Some matters because those people matter. A medical rescue or water dispute does not need a secret connection to the infestation to justify its place.

The long campaign should alternate investigation, ordinary work, difficult choices, returns to familiar people, and evidence that changes the next question. It should not become a checklist requiring every unrelated side quest, every system, or five identical faction approvals. Other campaigns remain substantial and can be played for their own purposes.

Build a small number of genuine relationships into the main path so its ending is supported even for a player who ignores optional work. Then use actual optional outcomes to deepen the recognition. Never display a grateful person, completed settlement or rescue the player did not help. The galaxy also needs accomplishments other people achieved independently; the protagonist did not single-handedly make civilization worth saving.

Possible existing anchors include Hearth's recurring people, Newshore's settlement, Brindle's food and relief work, Nacre's medicine and refugees, and protected civilians at Crosswind. Crosswind can remain at war while a particular rescue or medical intervention still matters. Ledger Ring, if expanded, should first be experienced as a functioning home with ordinary lives. These examples do not decide which exact characters appear in the finale.

The existing Morrow condenser and reconstruction follow-up can show a repair continuing to help a district. The debt-crew rescue and Kettle follow-up can support a remembered relationship when the actual rescue and delivery succeeded. Aru Sen and Sada Ilyan can demonstrate people brought to safety later helping others. Kettle and Newshore already represent homes built from evacuation and settlement; do not falsely credit their existence to the captain. Use a few earned details rather than an exhaustive montage of quest completions.

The currently released conclusions about reopening Earth's sky and completing the investigation should become intermediate achievements where appropriate: establish contact, protect a limited route, expose an abusive order, or secure local consent. Completing those undertakings is real progress even while the larger question remains open.

### Shape the final sequence

1. **Establish the loss.** The player earns clear evidence that Earth cannot become the recovered home they hoped for. Let the realization stand without immediately explaining its moral.
2. **Bring the existing galaxy back into the scene.** Within the same ending sequence, a practical response comes from a familiar place or person: a berth is available, a clinic can take the people being brought out, a community is waiting for the captain, or ongoing work needs a decision. Choose the callback from what actually happened in that voyage.
3. **Make the accumulated life present.** The significance comes from earlier experience. These are people with their own lives, not strangers introduced to supply a comforting speech. Grief and recognition can coexist; the game does not dictate the captain's emotional acceptance.
4. **Make consequential decisions.** Decide what account to give, who receives the evidence, and whom to serve or oppose. The player may protect, exploit, betray or turn away from the lives now in view. Disclosure and allegiance need not be the same decision.
5. **Continue play after every outcome.** Finish this campaign while other campaigns, communities and relationships remain. Even joining the infestation or deliberately harming others must lead to a playable continuing role. Do not end the whole galaxy or turn the rest of the game into a reward lobby after the supposed only meaningful story.

“Immediately” concerns the emotional relationship inside the finale; do not delay the recognition behind several hours of epilogue errands. Equally, avoid a triumphant musical switch or a character delivering the thesis a moment after the loss. A brief, concrete human response can make the larger recognition available without replacing the grief.

### Put the metaphor in consequences

The player should understand the literal objective of every scene. Routine NPC speech can be simple: someone needs a shipment, wants news of a friend, has opened a shop, or asks when the captain will return. Repeated visits and remembered decisions carry the meaning. Characters need not all speak in quotations about belonging, echoes, roots or the meaning of home.

Earth need not cease to matter for people to move on. Memory, cultural continuity, mourning and historical truth remain worthwhile. A ring habitat or a new settlement can provide a future home without being presented as an interchangeable replacement for Earth.

The intended ending is neither human extinction nor a secret failure state. Earth's loss is the campaign's settled endpoint. The player's agency concerns the real people, truths and possibilities that remain.

## Decisions at the campaign's conclusion

### Establish the facts before choosing the account

The captain must learn a coherent, evidence-supported account of what happened and why the hoped-for recovery is impossible. The final truth remains to be authored and is not revealed in this design document. Different affiliations must not silently change historical facts. An opposing faction can interpret or misrepresent the same evidence, but the game needs a consistent underlying answer.

Separate three things in the narrative and persistence model:

| Layer | Meaning |
| --- | --- |
| Discovered truth | What this captain has actually learned and verified. It remains known when the captain subsequently lies. |
| Public account | What the captain communicates, to whom, what evidence accompanies it and what is withheld. Different audiences can receive different accounts. |
| Allegiance and conduct | Whom the captain supports, what commitments they make, and what they do after the discovery. This can diverge from both their faction's wishes and their public claims. |

Use two or more connected decisions in the final sequence rather than a single menu equating truth, faction, morality and identity. Prepare the available arguments and relationships throughout the long campaign. Not every theoretical combination needs a separate campaign; incompatible promises should conflict for understandable reasons.

### Proposed courses and their continuing consequences

These are outcome families to develop, not implemented branches or a promise that all details below are final.

| Course | What the captain knowingly does | What continues afterward |
| --- | --- | --- |
| Publish the findings | Releases a verifiable account of Earth's condition and the established history. The publication can protect sensitive routes or personal details without falsifying the central finding. | People grieve, dispute responsibility, investigate institutions, seek testimony, or organize relief. Former allies may object to being named. The captain has continuing relationships with those affected. |
| Give a sanitized explanation | Keeps people out of Sol while substituting an apparently less alarming reason or withholding the actual cause. A specific cover story must fit the evidence people can independently check. | A sponsor may offer protection; some people feel reassured. Others are denied information needed for decisions. Maintaining, correcting or exposing the account produces further consequences. The game does not certify that paternalism was necessary. |
| Falsely announce a safe return | Encourages an expedition or migration while knowing that the claim of safety is false. Motives can include profit, restoration ideology, collaboration or cruelty. | A particular convoy, set of passengers or settlement acts on the lie. Named people are endangered, other crews may intervene, and consequences can include exposure, reprisals, survivor testimony or deeper complicity. A reputation penalty alone is insufficient. |
| Cooperate with or join the intelligence | Makes an agreement with what occupies Earth, potentially including biological change. The captain understands the immediate terms and remains a playable agent. | New contacts, capabilities, obligations and operations become available. Some existing relationships change or end; others become conflicted. The route supports ongoing choices, including compliance, refusal, negotiation and possible defection. |
| Pursue an independent response | Rejects a sponsor's control and carries out a specific commitment, such as preserving independently verifiable evidence, running a limited rescue effort or maintaining a local containment route. | Loss of institutional support creates practical costs and new contacts. Independence is an active way of living with the discovery, not an option that erases all consequences. |

The sanitized account and the false homecoming are materially different. One may aim to prevent entry while hiding the reason; the other deliberately induces entry into a known danger. Do not merge them under an ambiguous “give people hope” label.

Make the action labels explicit. A deliberate false return should say that the captain is announcing safety despite the evidence. The player can still be uncertain about exactly who will act on the lie or how events will unfold, but must understand the basic action chosen. Dark choices can be selfish or cruel; every route does not need to be equally defensible.

Truth and allegiance are independent where the fiction permits it. A captain can disclose the findings and then openly join the new Earth intelligence, or conceal the cause while opposing it. Joining does not automatically grant that intelligence ownership of every decision, and telling the truth does not automatically mean the captain has accepted the loss emotionally.

### Factions shape methods, resources and pressure

Faction affiliation affects who will publish the findings, what protection or funding is offered, which people trust the captain, and what obligations the captain is breaking. It should not supply five mutually exclusive versions of reality or eliminate the possibility of defiance.

Use named advocates, dissenters and splinter groups. Possible tensions include a Continuity containment officer versus a restoration zealot; a Meridian organizer providing viable passage versus a broker selling a false homecoming; a Lantern witness demanding public evidence versus a researcher rationalizing dangerous contact. These are proposed individuals or tendencies, not new official platforms for an entire faction.

A faction that favors an abusive course should have concrete incentives and opposition. Do not make one existing faction the mandatory home of every malicious choice. The player can also initiate wrongdoing independently.

### An intelligence with an ongoing relationship

A proposed distinction from the reference is that Earth has become an inhabited biological system whose coordinating intelligence is physically rooted there. It has places it can sense, resources it needs, and areas outside its reach. Its existence does not by itself prove that it created the original disaster. Its claims about history need corroboration.

It can bargain because an autonomous captain can do things it cannot: travel through ordinary routes, speak to people who know them, negotiate, and carry material or information. This supplies a reason for it to preserve an affiliate's initiative. The exact form of affiliation can begin with cooperation; biological integration should be a distinct, understandable commitment if included.

Possible benefits include surviving a specific infected environment, recognizing connected growth, or access to unusual treatment and supplies. Each benefit needs limits or costs. Possible continuing work includes retrieving isolated remnants, securing passage for willing converts, establishing a contained foothold, influencing an institution, sabotaging a particular operation, or facilitating an unsafe release. Requests can differ in severity; the player can decide how far to comply.

If it retains fragments of human memories or imitates familiar people, those observations must not automatically establish that the original people survive intact or can be resurrected. That ability is a proposal, not established canon. Its offer can tempt a captain who cannot relinquish Earth without secretly making the original home recoverable.

Joining must not end in credits, permanent loss of control, or an immediate forced identity replacement. A transformed captain may be able to live on the altered planet, but that does not restore it as a human home or undo its victims' deaths. A biological cost or broken relationship can persist even if allegiance changes later.

The intelligence should speak clearly about concrete wants. Constant riddles are not required to make it alien or frightening. Killing a local node or breaking an agreement must not automatically regenerate Earth; the evidence for irreversible planetary loss remains valid.

### Continuing play is required for every route

Before writing each branch's final speech, define its next playable activity, available travel, access to ship maintenance or an equivalent service, continuing contacts, and durable consequences. An outlaw or affiliate needs a workable life in the setting even when some ordinary ports refuse them. Do not turn the malicious routes into compulsory redemption sequences designed to force the preferred moral outcome.

Consequences can be severe and lasting: a convoy can be lost, a local outbreak can occur, a settlement can turn against the captain, a source can expose a lie, or a former ally can organize resistance. Every branch must leave an ongoing galaxy and meaningful agency. No campaign choice automatically triggers an unstoppable process that consumes the entire remaining map or ends everybody's game.

Profanity is permitted. Use it where anger, fear, exhaustion, intimacy or a particular character makes it appropriate. Plain language remains the standard. A frightened person swearing can carry more weight than making every speaker sound the same.

### Shared-world boundaries

One historical reality supports captains who know different amounts and choose different allegiances. Personal evidence, commitments and reputation remain personal. Shared consequences should be concrete and attributable: a named publication, convoy, confrontation or local response.

If one captain publishes evidence, another cannot make the entire galaxy forget it by selecting a later coverup. They can dispute it, suppress a particular outlet, issue a rival account or persuade a particular audience. Public knowledge needs provenance and reach rather than a single universal truth/lie switch.

No captain's ending silently completes another captain's campaign, transforms another player, erases their ownership or removes their ability to continue playing. Joining the infestation does not grant unrestricted authority over a friend's crew or settlement. A dangerous convoy can give other players a real intervention opportunity without assigning their characters a forced fate. Shared consequence is not ownership of everyone else's story.

## What the infestation establishes in Farwake

The infestation is a real part of the setting. Its existence does not settle where it began, whether it was engineered, how it reached Sol, who knew, who concealed evidence or whether every outbreak shares one origin. The historical mystery moves from “is there any danger?” toward cause, responsibility and the decisions made during the collapse.

A useful proposed identity is a biological threat that changes inhabited environments as well as bodies. Familiar places may keep performing their routines after the people who maintained them disappear: lights switch for a shift, a berth reports available, an air system passes a narrow instrument check. An observed routine might be ordinary automation; a particular anomaly needs evidence before it becomes proof of the organism's ability. Do not give it unrestricted control of biology, machines, minds and radio whenever a scene needs a surprise.

Before implementing the threat, define an internal rule set for physical spread, survival conditions, observable signs and genuine barriers. The audience can remain unsure while the authors follow consistent rules. These mechanics are not the same question as the organism's origin, which can remain undisclosed.

Part of the galaxy has been affected; this does not make every alien species, creature, ruin or malfunction an infestation clue. Ordinary work, safe communities and unrelated conflicts remain important. Crosswind must retain a comprehensible political war rather than become another unexplained symptom of the same entity.

Farwake's central hope is that people might safely return and make Earth a home again. The existence of a dangerous infestation does not by itself prove that this hope is impossible. Evidence of local containment, surviving people or a viable pocket can support hope without promising planetary recovery. The eventual impossibility must follow from evidence about Earth, not an unexplained rule that nothing the player does matters.

## The Sol cordon and the factions

The cordon covers Sol as a system, including ordinary approaches to Luna and Earth. Its operation must match the travel rules. A line of ominous dialogue cannot coexist with unrestricted routine jumps and unrestricted Sol starts.

The current runtime permits travel into Sol with adequate fold range and gates only Earth docking. Threshold Station and Luna are otherwise accessible. This is an implementation gap, not the new canon.

The recommended access model is a visible cordon with a specific restricted way in, earned during the investigation. An inspection or expedition clearance is permission for a defined route and purpose; it is not a declaration that Sol is safe. Initial authorization must be obtainable outside the area it unlocks. Existing Threshold content can serve inspection and expedition staging once the approach is authorized. A separate Earth landing decision can still concern local residents and their safety.

The existing Witness approach evidence offers a concrete place to earn that outer authorization. Threshold's `threshold_answered` state is obtained inside Sol and must not become the prerequisite for entering the system. Existing fold-lane geometry can support monitored approaches; do not imply that a few patrol ships physically fill all of interplanetary space. Preserve the current distinction between stopping an abusive compulsory evacuation and abolishing quarantine.

Keep Sol visible on the chart and explain a blocked journey plainly. Do not require identical approval errands from five factions. Standard starts should respect the cordon. Emergency exits, legitimate clearance, NPC traffic, multiplayer authority and any alternate approach must follow explicit rules. Do not silently strand someone already inside when the new rules are loaded.

Every faction may obstruct return, but they do not need the same knowledge, motive or policy. The following are proposals grounded in their existing identities:

| Faction | Plausible reason to obstruct return | Conflict that remains playable |
| --- | --- | --- |
| Terran Continuity | Enforces quarantine and inherited emergency authority. | Necessary containment can coexist with withheld evidence, failed rescue duties and unaccountable command. |
| Freewake Union | Opposes official control but will not accept an unexamined returning ship at a civilian port. | A rescue advocate can defy the cordon while another member protects a vulnerable community. |
| Meridian Combine | Controls fuel, transport, insurance or cargo certification for restricted routes. | Material risk, profit and knowledge of old logistics failures may point in different directions. |
| Lantern Assembly | Insists on evidence and controlled observation before contact. | Its own researchers can disagree over whether delay is caution, evasion or an opportunity for a narrow expedition. |
| Cinder Clans | Maintains practical salvage prohibitions inherited from earlier crews. | A useful hard-won warning can survive after its original explanation has been lost. |

These are institutional conflicts, not five uniformly villainous populations or proof of a single coverup. A genuine danger does not excuse every action taken in its name. The cordon may reduce some risks without having been perfect for ninety-three years.

## Ring habitats within the compact map

The requested homage should be substantial: enormous constructed rings with land on their inner surfaces, a visible upward-curving horizon, and inhabited or abandoned districts the player can visit. A circular station icon alone does not deliver that idea.

Start with two proposals inside existing systems:

| Location | Proposed role | Why it earns a place |
| --- | --- | --- |
| Meridian / Ledger Ring | Expand the existing destination into a living ring habitat with homes, transit, water infrastructure and distinct districts. | The existing water-contract and administrative stories become physical places with people relying on them. The ring is first encountered as somewhere people live. |
| Cairnsea | A damaged or partly abandoned ring associated with the system's isolation and rescue history. Its exact relationship to Still Berth remains to be authored. | Pressure boundaries, dead transit sections and separated inhabited areas create a different navigation and rescue problem. Its condition alone does not prove infestation. |

A later Sol ring would need a specific purpose before becoming a third set piece. It is not necessary to place a ring in every system or add systems to accommodate them.

Keep these structures independent of an automatic master explanation. A ring does not become an ancient galaxy-clearing weapon merely because an infestation also exists. Do not import a matching ancient creator civilization, activation sequence or extermination mechanism as default lore. Construction history can be ordinary, uncertain or contested without making every ring another mystery box.

Retain the meaningful stories attached to the chosen places. In particular, Cairnsea's Empty Ward records a successful evacuation of all 23 patients. A later ring proposal must not rewrite that successful rescue into an unseen massacre.

Production should represent the full structure clearly in the system view, then author a limited set of playable districts with different uses. The game need not simulate an entire ring circumference to make its scale convincing. No additional playable system is required.

## Pre-implementation audit (historical)

### Gaps identified before 0.39 / 0.4

| Area | Relevant files | Concrete gap |
| --- | --- | --- |
| Nightglass incident and completion | `games/farwake-lost-expeditions/dist/content.mjs`, `state.mjs`, `mission.mjs`, `investigation.mjs`, `app.mjs`, `index.html`, `audio.mjs` | The current briefing is a later recovery assignment, completion requires recorder recovery, beacon transmission and safe return, and both endings confirm a successful return. A new date alone does not change those rules. Keep the contributed menu recording and credit; adapt completion presentation to the new ending. |
| Sol approach and origins | `games/farwake/dist/engine.mjs`, `start-options.mjs`, `livelihoods.mjs`, `server/realm.mjs`, `app.mjs` | Ordinary travel, shared travel, passenger movement and origin selection need one consistent access policy. Explain restrictions before charging fuel and preserve a safe departure path. |
| Earth campaign conclusions | `games/farwake/dist/content.mjs`, `earth-campaign-content.mjs` | Current narrator-level recovery claims overstate what local improvements establish. The bureaucratic wrongdoing remains evidence about those orders, not a complete explanation for the infestation. |
| Consequential campaign choices | `games/farwake/dist/earth-campaign-rules.mjs`, `earth-campaign-content.mjs`, `engine.mjs`, `voyage-memory.mjs`, `voyage-reactions.mjs`, `server/realm.mjs` | Existing choice flags, history-custody options and personal receipts offer a base. Separate discovered facts, public claims and allegiance; extend actual aftermath play rather than only changing reputation values or the ending text. |
| Farwake's Nightglass source case | `games/farwake/dist/expedition-stories.mjs` | The present case gives an animal-and-instrument explanation. Deliberately decide how a later investigation relates to the historical incident rather than letting the two games contradict each other. |
| Landscape rings | `games/farwake/dist/world-types.mjs`, `world-identity.mjs`, `space-art.mjs`, `surface.mjs` | Existing station wheels and corridors do not provide the requested landscape-scale interior. Add exterior scale and a few useful playable districts together. |

### Recommended order

1. Reauthor the existing Luna case as the first-person incident 93 years earlier. Change the briefing, observations, records, objective flow, endings, notebook/report voice and completion music together. Preserve the useful circuit puzzle and accessible scene navigation.
2. Reconcile the Farwake source case that Nightglass adapts, so it does not contradict the new historical viewpoint or reveal facts the witness could not establish.
3. Implement the Sol access rules in travel and shared authority, then reconcile origins, map messages, Threshold staging and Earth permissions. A multiplayer client must not grant itself access.
4. Rework the main Earth campaign and The Long Silence as a long investigation interwoven with independent lives and campaigns. Their current claims of lasting planetary recovery conflict with the intended ending. Seed and remember the relationships that make despair followed by recognition possible; preserve concrete rescues while rewriting conclusions that no longer fit. Develop disclosure, allegiance and their ongoing consequences together, and prove that every outcome remains playable.
5. Add the Mars chapter with its own investigation and ending. Use it to prove the anthology can vary its structure before making many additional chapters.
6. Develop one inhabited ring district and its system-view presentation before committing to a second large environment.

Validation should cover the changed behavior: meaningful puzzle prerequisites, clear available actions, written equivalents for audio, earned evidence, completed endings, correct save handling, and cordon enforcement through all real travel paths. Use the existing release gates when runtime changes are made. This authoring update does not add playable chapters, deploy a cordon, alter save files, or settle the final cause.
