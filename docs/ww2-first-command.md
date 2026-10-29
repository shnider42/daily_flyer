# First Command: a first-play tutorial

## Scope

This is an additive teaching and interaction update for Current DSL. It does
not change Python game rules, dice, legal orders, AI, force rosters, objectives,
Greybridge progression, persistence APIs or deployment configuration. Legacy
and Empires do not receive the new in-battle interaction styling.

Home has a **Start tutorial** entry and a short **Learn by playing** card before
Greybridge. The tutorial does not ask the beginner to choose from fourteen
chapters, pick a faction or select a rules edition. It creates a separate solo
`current:village` battle with Allied command, using the regular match creation
and access-token paths. Village Crossing is 7 by 9 hexes. Other saved battles
are retained. The existing Journey and Field coach remain available.

## The player experience

The board remains usable alongside one instruction at a time:

1. Read the actual mission goal and find its objective.
2. Select an outlined friendly team. Selection is free.
3. Move that team to a highlighted legal hex and observe confirmed AP remaining.
4. Give an available order. When a legal visible target exists, select it and
   fire; otherwise practice a legal defensive/recovery order. A miss still
   counts as practicing an attack. No dice are forced and no hidden target is
   revealed to create a teaching opportunity.
5. End the army's turn using the normal confirmation.
6. Watch/skip the recorded computer turn, and recognize control returning.
7. Revisit the goal, then continue the same battle or return Home.

The introduction teaches operating the game, not every tactic. It does not
require winning the battle. Its final prompt explicitly distinguishes a
practiced defensive order from an attack that has not yet been tried.

A double-outline map marker identifies the specific unit or hex. **Show me
where** only centers/zooms the map or opens the appropriate existing control/sheet.
It never calls the action-aware `chooseUnit` function, clears a pending target,
issues an order or modifies AP. The instruction follows the normal Orders
sheet on a phone. **Continue** acknowledges a completed action; it cannot
substitute for performing the action.

## Confirmation and recovery

Action completion listens to the existing `ww2:order` notification, checks the
battle identity/revision and uses the confirmed public state. Movement feedback
compares the friendly unit's previous position/AP/strength with the confirmed
result. Failed requests do not complete a step. After a lost response, a later
read can recover completion only with a newer own-side action-history entry.
The tutorial never retries a gameplay POST.

Tutorial progress is versioned in `ww2-first-command-v1`, independently of
Experience and existing Field-coach lesson records. Only one introduction is
tracked per browser. It remembers the match code, battle number, step, practiced
actions and an own-force baseline; it stores no extra access token or hidden
opponent information. Existing session shortcuts supply battle access.

**Pause tutorial** restores the normal battle layout. **Resume tutorial** uses
the same battle, not a fresh game. A new attempt explicitly creates another
battle without deleting the old one. A rematch with a different battle number
does not accidentally inherit tutorial overlays. Storage failure retains
progress in this page's memory but cannot promise persistence after closing it.
Normal SAVE/MOVE recovery preserves the battle, not cross-device tutorial steps.

**Ignore tutorial** respects the existing coaching consent and dismisses the
welcome. A compact Home entry and View & help retain an explicit way back.
Ignoring the existing coach also pauses First Command. Starting First Command
explicitly does not silently rewrite the separate Experience preference.

## Interaction treatment

The instruction rail has stable reserved space: beneath portrait/desktop play,
or beside the board on phone landscape. It does not cover a counter. On narrow
phones with an existing inline-orders preference, the same orders can scroll
within a bounded area instead of consuming the entire map. Pausing restores the
original layout without changing the stored preference.

Current DSL receives clearer button press, hover and keyboard-focus feedback,
selected-counter emphasis, short sheet entrances and a brief ring at the end
of a **confirmed friendly move**. These do not transform the moving unit or add
a delay before submitting an order. Reduced-motion preferences disable the new
transitions/entrance animation; confirmation remains visible without motion.

`home.js` loads the optional tutorial stylesheet/script after all deferred game
modules initialize. A failed tutorial download does not stop the existing game
or Field coach. No external assets, libraries or fonts are required.

## Verification and limits

Run the optional offline browser contract suite:

```sh
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium python tests/test_first_command_browser.py
```

It requires Playwright for testing only. It inlines the real new module and
stylesheet into `tests/first-command-fixture.html`, which models the published
UI/event/session contracts. It does **not** run Flask, the tactical engine or
the real computer opponent. Storage reinitialization uses a fixture storage
adapter, not a live browser-origin reload. No production battle is used.

Seventeen checks passed in Chromium, covering confirmed progression, a missed
shot, rejected and lost-response moves, own-side history filtering, safe help
during pending targeting, pause/resume, reinitialization, consent, unavailable
storage, alternate defensive practice, battle identity isolation, keyboard
selection, modal guidance, reduced motion, stable rail geometry, safe zoom to small targets and 320/390/430
phone, 844-wide landscape and 1440-wide desktop fixture layouts.

Screenshots of those **fixture layouts** were inspected. JavaScript syntax and
the original `home.js` blob identity were checked. Full-app regression suites,
real opponent flow, deployed asset retrieval and physical Safari/iPhone play
were not executed in this environment; direct browser/network access was
blocked. These checks therefore do not establish live-site usability or novice
comprehension. After deployment, the useful human acceptance test is a fresh
Simple visit: Start tutorial, move once, give an order, end turn, pause and resume.
