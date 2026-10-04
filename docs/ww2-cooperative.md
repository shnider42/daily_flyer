# Cooperative and mixed-team battles

Choose a map on Home, then **Co-op & teams**. Sign in with the existing commander
account flow, name the game, and choose an army, command size and default computer
difficulty. The new command room is separate from the battlefield until the host
presses **Start battle**.

## Commands and recruitment

- **Squad / unit control** gives each player one existing counter. Transports
  already carrying troops keep their passengers in the same command group.
- **Platoon control** gives each player one existing platoon. Maps without
  platoons fall back to individual counters. Support groups remain selectable.
- The host chooses one group and additionally owns their army's commander units.
  Modern commander-deployed airborne reserves stay with that commander. Maps
  without commanders retain their existing roster; no extra officer is created.
- Joining players choose either army and an available group. Same-army players
  cooperate; players may also command opposing armies alongside computer units.
- The host can set **Easy** or **Standard** for all unclaimed groups, then change
  individual groups. Start locks armies, claims and difficulties. Unclaimed
  groups, including the other army's commander, become computer controlled.
- Existing participants can reconnect after start. New players cannot claim an
  active battle's computer groups. A commander sign-in, original browser session
  or one-use MOVE code restores that individual player's command, not an army.

The public directory shows player and open-group counts. The recruitment board
publishes group names and initial roster counts, never placements, current enemy
positions, casualties, credentials, or private plans. Assignments are serialized
under the same SQLite write lock as battle actions; two simultaneous claims
cannot acquire the same group.

## Shared army turns

Players on the active army can alternate orders between their own units. Gold
counter outlines and roster labels identify **Your command**. Teammates and
computer units remain inspectable, but the server rejects orders for them.

**Finish my orders** marks only that player done. The army waits for its other
living human commands. Its computer groups then issue legal orders, and the
normal end-turn rules resolve exactly once: AP banking, delayed fire, objectives
and the opposing turn. Done players cannot add orders until the army's next turn.
Friendly officers can still grant actions or rally teammates under normal rules.

Shared orders commit immediately. Undo/redo are disabled to prevent one player
rolling back another player's subsequent orders. Existing solo and two-player
takebacks are unchanged. The Field coach explains cooperative ownership, shared
turns and preparation at each Experience level.

**Team orders** lists participants, completion status for your army, computer
difficulties and an explicit handoff control. A player or the host can hand a
non-host command to the computer; the original player can continue watching from
their army's perspective. During recruitment they may claim another open group;
after start the handoff lasts for that battle. Disconnecting alone never silently
changes ownership. The host retains their own command.

The host is their army's captain. The first player joining the opposing army is
that army's captain. Captains coordinate shared preparation and can concede their
whole army. Ordinary participants can hand off their group but cannot resign the
whole army. If a captain hands off, the next active teammate takes that role.

Each army receives its own fog-filtered computer replay. Small maps resolve at
most two army turns per request. Large maps use short computer-order batches;
the browser that last finished orders continues them automatically, preserving
the turn budget and movement history. The complete replay becomes available
when human orders resume. If that browser disconnects, another participant can
use **Advance computer turn** in Team orders to continue. If all human-controlled
units have been lost, that button advances the remaining AI battle in bounded
manual steps. GET/reconnect/poll requests never advance turns or reroll dice.

## Transports and preparation

Transports may load their owner's troops or unclaimed computer troops when the
transport itself is computer controlled. To carry another player's troops, that
player must enable **Allow allied players and computers to carry, unload or
evacuate my troops** in Team orders. Permission can be withdrawn after troops
disembark. This supports shared half-tracks and Dunkirk evacuation while retaining
explicit control over another person's squad. Initial loaded boat/infantry pairs
always share an owner.

On Shingle Cove and Breakwater, the host first starts the lobby. Human players then
place only their own units; their captain chooses shared bunkers or naval aim
points. **Finish my preparation** locks only that player's placements. The army's
plan locks when every human command has finished. An entirely computer-controlled
army prepares privately through the existing planner. Mixed-army computer units
keep their legal authored initial positions. Army-wide placement resets are
disabled in shared battles. Both army plans must lock before bombardment and
normal combat begin.

## Computer difficulty

Standard preserves the existing action scoring and dice. Easy perturbs the ranking
of worthwhile legal actions and reduces emphasis on support combinations. Its
variation is reproducible from the current state/order, separate from combat
randomness. Both obey the same AP, health, ammunition, visibility and victory
rules. Ground, naval and air decision paths enforce group ownership. These are
initial difficulty behaviors, not measured player win-rate guarantees.

Difficulty is per computer group and independent of Simple / Moderate / Expert.
Standalone solo difficulty and army/map balance are unchanged by this feature.

## Compatibility and validation

Cooperative identities use an additive `cooperative_players` table. The existing
host/guest army-seat protocol remains in place for ordinary games. Player aliases
and commander links resolve an individual cooperative owner. Private replay
payloads remain outside per-order game copies and are removed before public
projection. No production dependency or infrastructure change is required.

The next cooperative operation starts in a new lobby. Existing shared battles
cannot be replaced by the legacy two-seat reset/rematch endpoints, and solo SAVE
codes do not clone multiplayer games. Return through commander sign-in or MOVE.

Validation includes nineteen cooperative API/rule tests covering authorization,
both armies, all 22 map rosters at both command sizes, duplicate claims, concurrent
claims, readiness, captain handoff, difficulty, transfer/recovery, transport
consent, private preparation, replay filtering, bounded AI-only continuation and
equivalence between batched and uninterrupted computer turns.
The full rule/API regression suite passes all 386 tests.

The three-player DOM/API harness and actual Chromium desktop/phone harness both
pass creation, recruitment, AI difficulty, shared turns, results and coastal
preparation and automatic computer batches on Fubar. Browser checks include
320px portrait and 844px landscape page
overflow checks; screenshots were inspected. This is desktop Chromium and phone
emulation, not a physical iPhone/Safari test. Test databases and commander accounts
are disposable and local; no production game was created for validation.

Run:

```sh
python -m unittest discover -s tests -p 'test_ww2*.py'
node tests/ww2-cooperative-dom.cjs
node tests/ww2-cooperative-browser.cjs
```

DOM tests need development-only `jsdom`; browser tests use development-only
Playwright and optionally `CHROMIUM_EXECUTABLE_PATH`. Both use the existing Flask
application with a temporary SQLite database.
