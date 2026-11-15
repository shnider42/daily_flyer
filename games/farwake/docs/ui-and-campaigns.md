# UI continuity and local campaigns

The 0.25.0 pass makes common actions predictable and gives existing places more reasons to revisit. It reduces specific repetition; it does not make every encounter unique.

## Interaction contract

- `Dialog.open()` identifies a view by its dialog kind and `contextKey`. The key defaults to the title; repeated names need an entity or section identifier. A refresh preserves width, scroll, expanded details, and matching keyboard focus. `reset: true` starts over.
- New views start at the top. The modal keeps a steady top edge and reserves scrollbar width. Deliberate focus changes and later navigation take precedence over restoration.
- Every rebuild advances the dialog revision. Detached choice controls cannot invoke their old actions. `menu-session.mjs` also binds replies to the game, connection, captain, place, and navigation revision, so an old purchase or conversation reply cannot reopen a superseded menu.
- `notebook-navigation.mjs` supplies the same seven destinations to both narrative and legacy notebook pages. They share the notebook width and reading styles.
- Story actions update their own section with the result and next step, retaining the contact and surrounding menu. Work actions refresh the same panel with current offers. Treatment retains the doctor; outfitter services retain the tabs.
- Failure does not produce a success receipt. Errors remain explicit, failed puzzles retain their controls, and real encounter dialogs opened while processing a result retain priority over a story refresh.

Presentation preservation never caches permission: the authority still determines prices, resources, access, and completion.

## Dialogue and reading load

Ordinary and authored contacts can expose a small set of named topics. Asking about a topic and returning uses the current conversation rather than recording another visit. An unchanged mission or consequence update can be shortened on a later conversation, while an explicit recap retains its useful details. Urgent warnings continue to take priority.

The notebook displays a plain next step, destination, and **Mark destination** action. New local campaigns are visible together; unrelated local leads are folded under **More local stories**. At a contact, optional story offers stay folded under **Discuss [title]** until selected. Recaps, memories, and supplementary topics are available without filling the initial conversation with all of their text.

Ambient social dialogue uses a bounded history of recently heard lines and speakers. When its available lines would repeat too soon, it can remain quiet. These changes reduce identifiable sources of repetition; they do not create a general-purpose dialogue generator.

## Three campaigns in Hearth

The campaigns reuse existing contacts, objects, sites, and orbital space. All three leads can be answered from **Stories & campaigns** without a fold drive. Their physical tasks still require reaching the relevant contact, object, or flight position. Shipless captains need suitable transport or a ship for the stages that actually require one.

| Campaign | Structure | Continuing consequence |
| --- | --- | --- |
| **Night Shift, No Backup** (`cold_chain`) | Eight steps with Mara Reed: inspect the case, trace circuits at the pump house, commit four ore or 55 cr, test the supply, check the sealed batch, choose ongoing support, and report. | On completion, the selected personal Morrow agreement reduces infirmary treatment by 25% or hull repairs by 15%. Other ports and services retain their normal terms. |
| **A Fair Departure** (`fair_departure`) | Seven steps with Len Vale and Silas Voss: compare departure slips, negotiate loading constraints, correct the schedule, choose funding, complete an actual Hearth passenger fare, and obtain approval. | New eligible Hearth bookings include a patient (+10 cr), commuter (+6 cr), or courier (+8 cr) supplement. The chosen charter covers one passenger type. Existing bookings keep their accepted quote. |
| **The Signal We Can Trust** (`clear_signal`) | Eight steps with Ada Finch and Len Vale: compare two time references, make a real ship reading near Morrow, verify the correction, choose how to distribute the evidence, and hand it over. | Ordinary ship signals cost 6 charge to scan instead of 8. Story transmissions retain their own requirements. Public, redacted, and licensed reports have different financial, relationship, faction, and written outcomes. |

These authored sequences have decisions and persistent aftermath, without simulating a galaxy-wide clinic economy or information market. Benefits and completion receipts belong to each captain.

## Implementation

| Module | Responsibility |
| --- | --- |
| `dist/ui.mjs` | Dialog identity, presentation preservation, focus behavior, and stale choice guards. |
| `dist/menu-session.mjs` | Asynchronous menu ownership checks. |
| `dist/notebook-navigation.mjs` | Shared notebook destinations and active section. |
| `dist/narrative-ui.mjs` | Campaign cards, current steps, inline results, contact recaps, and optional topics. |
| `dist/npc-dialogue.mjs`, `dist/ambient-social.mjs` | Conversation context, explicit topic material, repeated-update handling, and bounded ambient repetition. |
| `dist/local-campaigns.mjs` | Campaign definitions, public progress metadata, consequences, service agreements, scan costs, and passenger-charter terms. |
| `dist/quest-rules.mjs` | Guarded progress, choices, payment, physical access, and completed passenger evidence. |

Local campaign presentation uses `localCampaign: { step, total, focus, scope, consequence }`. It remains separate from the Earth campaign’s live operation counters. The campaigns use existing quest records, choices, flags, and bounded conversation memory. They add no new Hearth bodies, objects, or layout geometry.

## Content direction and verification boundaries

Future content should give a familiar place a new responsibility, a choice with a stated cost, or an outcome visible on a return visit. Longer routes should earn their travel time. Quiet travel supports distance; more systems or renamed errands alone would not address the depth problem.

Regression coverage should protect scroll, focus, navigation, unavailable actions, late replies, and accessible dialogue reminders. Campaign checks should cover full sequences, wrong solutions, physical requirements, once-only rewards, benefit boundaries, saving, and shared authority. Hearth preservation remains a separate compatibility requirement.

Controller tests use a small DOM fixture; visual quality requires browser checks of tabs, purchases, treatment, contact progression, scrolling, and the published layout. Playtests must judge pacing, return visits, objective clarity, and whether choices feel consequential. This document states implementation and verification scope, not deployment status or universal device coverage.
