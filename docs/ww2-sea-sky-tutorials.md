# Sea & sky tutorials and Current DSL touch presentation

## Scope

Add two first-play introductions alongside the existing Ground First Command.
Naval creates a separate solo `current:midway` battle as the Americans. Air
creates `current:britain` as the Luftwaffe so the player has both fighters and
bombers. These are the existing full scenarios, not newly balanced small maps.
The actual mission goal is read from the existing briefing. Greybridge, Legacy,
Empires, Python rules, rosters, AI, dice, APIs and deployment settings are not
modified. Ground tutorial code and `ww2-first-command-v1` progress are unchanged.

Home has a **Sea & sky** section after the ground tutorial with **Start naval
tutorial** and **Start air tutorial**. Both are also available from View & help.
The ground tutorial continues to use its existing entry. No Experience setting
is silently changed.

## Lessons

Both introductions use nine steps, with one instruction alongside the board:

| Step | Naval | Air |
| --- | --- | --- |
| Mission | Actual sea objective, hull, water routes | Actual station objective; fighters versus bombers |
| Select | Select an actual ship | Select an actual flight |
| Move | Sail to a legal hex | Fly a legal leg; interception can happen en route |
| Support | Carrier search, then choose its legal aim area | Prepare fighter interception; a reaction is not guaranteed |
| Combat | Preview guns, torpedoes or a carrier strike | Preview fighter fire or bomber attack; bombing uses a load |
| Care | Damage control and finite uses | Nearby friendly field service and finite stores |
| End | End the army's turn | End the army's turn |
| Return | Wait for the opponent and replay to finish | Wait for control to return |
| Continue | Show practiced versus reviewed skills | Show practiced versus reviewed skills |

The air introduction deliberately uses the earlier Current Britain flight and
nearby-service system. It does not pretend to teach Britain 2.0 fuel, separate
landing, runway cycles or grounded manifests. Likewise this Midway introduction
uses abstract carrier search/strike orders, not Midway 2.0 carrier-deck flight
operations. Keep those distinctions in the introductory wording.

If there is no legal attack, the player may keep maneuvering until one becomes
available, or explicitly choose **Review instead**. Recovery is similarly
reviewable when no damaged/depleted unit can use it. A reviewed step is recorded
separately and never described as a practiced attack/repair. No enemy, damage,
AP or dice result is manufactured to make the lesson convenient. Misses are
valid practice; rejected orders are not.

Selecting and moving steps center/enlarge the appropriate area on phones so
players are not left trying to tap counters on a full-map overview. Show me
where is read-only: it never calls the action-aware `chooseUnit`, submits an
order, cancels targeting or changes selected units. Existing map zoom controls
remain available. Guide space is reserved rather than laid over counters;
Orders sheets carry the instruction inside their own scrolling area.

## Persistence and confirmation

`ww2-domain-training-v1` stores one independent naval run and one air run per
browser. A run is bound to match code, battle number, side and scenario. Normal
session shortcuts retain access tokens; this tutorial store contains no token
or concealed opponent state. The stored baseline includes only the user's own
units for confirmation recovery. Failed storage uses page memory.

Pause/resume continues the same run. New attempt requires explicit confirmation
and starts a separate battle without deleting the earlier one. Starting another
tutorial pauses the currently open tutorial. Ignore tutorial pauses sea/air
runs without changing Experience; explicit Start/Resume remains available.
SAVE/MOVE recovers the game, not cross-device tutorial lesson progress.

Action steps listen for existing confirmed `ww2:order` events and require a
newer matching public state. A later authenticated read can recover a lost
response only from a newer own-side action-history record. No gameplay POST is
automatically retried. Enemy records, wrong battles and stale revisions cannot
satisfy an action step. Computer turns and replay remain read-only.

## iPhone and desktop presentation

`touch-command` is enabled only in active Current DSL battles. It adds:

- A selected-unit portrait in the normal phone dock, using existing artwork.
  Dad mode keeps its own enlarged portrait and target behavior.
- Bottom-anchored phone sheets with a clearer heading and return control.
  Orders use readable full-width icon/name/purpose/cost rows. Greyed supported
  actions retain their actual unavailable reasons; no capability is removed.
- A target preview in the Orders/details sheet listing the current server-legal
  attacks and their published odds/damage. Selection is explicitly not firing.
- Stronger movement outlines, keyboard focus, press feedback and selected-unit
  emphasis; existing fog and ownership colors are not overridden.
- Brief flight trails, ship wakes and ground traces after a confirmed friendly
  move, using the prior legal path. They render below counters, intercept no
  input, and do not transform moving unit groups or delay requests.
- Short sheet entrances and a restrained confirmed-result emphasis. Dice faces
  remain the actual recorded result, not an invented rolling animation.

Reduced-motion preference disables the new movement decoration and transitions.
New effects are bounded and removed on replay, battle changes and expiry. There
is no continuous repaint loop, external artwork download or new font dependency.
This is an interaction/layout pass, not a replacement terrain/counter art set.

## Verification

Run `python tests/test_domain_training_browser.py` with Playwright and Chromium
available (`CHROMIUM_EXECUTABLE_PATH` can select the browser).

**32 offline Chromium contract checks passed.** The fixture loads the real new
JS and CSS but simulates public state, legal actions, storage and event hooks.
It is not the complete app, tactical engine, real opponent or a physical iPhone.
Covered: both creation profiles, preserved ground data, real UI selection/move,
search and interception, missed torpedo/bomber attacks, service, explicit review,
failed orders, lost-response recovery, enemy-history rejection, independent
runs, pause/resume, rematch isolation, safe pending-target navigation, keyboard
selection, duplicate starts, unavailable storage, reduced motion, target
privacy, display-only changes, and 320/390/430 portrait, 844 landscape and 1440
pixel desktop geometry. Fixture screenshots were visually reviewed.

JavaScript syntax checks passed. The unchanged part of home.js was verified
against its original Git blob before replacing only the optional module loader.
The two new modules fail independently of the existing game startup.

Direct live-site/browser retrieval and repository cloning were unavailable in
this environment. No full-app regression or real-opponent playthrough is claimed.
Render deployment status must be verified separately. A useful physical-phone
acceptance check is one move and one support order in each tutorial, followed by
pause/resume and an attack preview in the new Orders sheet.
