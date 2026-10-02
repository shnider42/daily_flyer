# Fubar — joint operations playtest

Fictional Allied–Axis coalition equipment showcase. Select **Fubar** in a new DSL solo or multiplayer battle; saved battles are unchanged. The board is 36×32, with 66 units covering all 31 existing `kind` values. It includes Firefly/Tiger profiles, specialist infantry, two finite Allied airborne reserves, loaded landing craft, four warship classes, fighters, bombers, radar, airfields and both AA gun types. It is deliberately not a historical order of battle or a claim of finished balance.

## Layers and orders

- A hex supports one surface occupant and one aircraft. Passengers and off-map reserves retain their existing rules. Same-layer stacking is forbidden.
- **Both / Surface / Air** only filters the presentation. Aircraft have a dashed air border and AIR badge. Shared-hex selection offers full names and portraits, plus a legal cross-layer move when appropriate. Filtering neither spends AP nor moves the camera.
- Surface units use existing terrain, transport, weapon, engineer, command and support rules. Aircraft use swept flight legs and air combat rules. Hidden blockers cannot affect legal previews, but may stop an actual flight.
- Fighters and AA target aircraft. Bombers target the surface, including the hex directly beneath them. Flak can use its ground weapon or a 4-hex anti-aircraft burst; its single overwatch reaction can be spent against either domain.
- Radar spots aircraft within 10 hexes, but only adjacent surface units. Aircraft see surface targets within 4 hexes, reduced to 2 in concealment; smoke hides the surface, not aircraft. Existing local-platoon sight and dated radio reports still apply.
- Airfield service repairs 1 strength and refills bomber ordnance. Carrier search/strike remain abstract sorties, separate from movable planes. Cruiser escort penalties apply to carrier strikes; cruisers do not intercept movable planes in this version.
- Artillery, bombardment and building collapse resolve against surface occupants, not aircraft above them. Torpedoes require a continuous water route.

## Winning

Three public objectives: Sea lane, Harbor causeway, Town junction. End your turn to gain 1 point per uncontested objective. Warships capture the sea zone within one hex; infantry occupy each land flag exactly. Armor, amphibious vehicles, fixed guns, aircraft, passengers and reserves cannot capture land flags.

First to 10 points wins. After both turns of round 36, higher score wins; Axis wins an exact tie. Eliminating every enemy also wins. Losing a carrier, bomber or airfield alone does not end the game. Scoring flags reveal only ownership/contesting, not hidden occupant identity or strength.

## Compatibility and implementation

`joint_ops_version: 1` opts a saved state into the mixed rules. Fubar does not set `air_version` or `naval_version`: their dedicated victory/turn rules remain isolated. Air/naval `unit_order` helpers are shared with their original theaters; the common engine owns Fubar's turn, cooldowns, banking, intel, journal, playback and victory. Layer filtering is client-only; server authorization and weapon/occupancy checks are authoritative.

Future mixed maps can reuse the same flag, per-unit roles, `joint_objectives`, and shared UI. Fubar's AI ship approach assumes its open ocean flank; island-heavy future joint maps will need an obstacle-aware naval goal planner.

## Verification

`python -m ww2_tactics.devtools test` runs the isolated Python suite. Fubar-specific coverage is in `tests/test_ww2_fubar.py`: roster coverage, domain occupancy, fog and radar, aircraft interception, exact-dice redo, artillery targets, transport and drops beneath aircraft, supply/turn resets, scoring, AI/playback, and API save/restore.

`CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node tests/ww2-fubar-browser.cjs` covers phone/desktop, Simple/Full/Experimental layouts, shared-hex selection, real server-validated cross-layer movement, camera stability, per-domain orders, mission text and Home/resume. It writes screenshots to its isolated temporary test directory. Existing campaign, naval and navigation browser tests provide regression coverage.

Playtest priorities: objective timing versus fleet travel, Allied airborne reach, Axis Tiger/Flak defense, AA placement, frame size/turn latency on hosted hardware, and readability of stacked counters at small zoom. No fuel, altitude bands, carrier-deck launches, or new aircraft classes are introduced here.
