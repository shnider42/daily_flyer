# Shared mission systems

New missions should supply data to the existing simulation rather than fork role, combat, fog or audio logic. The original campaign chapters, legacy side operations and the four authored layouts all use `createGame` and the same authoritative `step`.

## Mission definition and map

Add the title, lighting, campaign/standalone classification and ordered stages in `mission-definitions.mjs`. Standalone scenarios must not extend chronological campaign continuation. Add their physical interactions in `operations.mjs` and finite encounters in `encounters.mjs`.

For a map outside the legacy street grid, extend `mission-layouts.mjs`. Its profile supplies terrain, buildings, structural solids, movement-only boundaries, four safe insertion positions, civilian locations, objective anchors, scenery and field routes. Water and channels can block movement without behaving like opaque walls. Building interiors and doorways are prepared by the shared geometry code.

Reserve enough actual clearance for infantry radius, doorway approaches, casualty assistance and every turning vehicle. Objective work points must stand beside a hull rather than inside it. A ray to a physical vehicle target must identify that vehicle so it can be observed or repaired without treating its own hull as intervening cover.

Use genuinely connected field routes. Authored interior posts should remain close enough for one group to operate together; a long warehouse must not place squadmates at unrelated entrances. Atlas, patrols, building guards and Relief all need reachable staging and destinations. Safe placement may omit a group when the geometry or existing threat budget cannot support it.

## Roles and command

All four slots accept the six canonical role IDs from `squad-roles.mjs`: `rifleman`, `grenadier`, `medic`, `support`, `sniper`, `heavy`. Use `roleProfile`, movement/vision helpers and observation capability checks. Do not infer command from a weapon role: `commander` and stable soldier identity carry that authority.

Required mission work must remain possible with every valid composition. A specialist may perform an action better, but removing that specialist should not silently make an operation impossible. Changing the controlled soldier preserves the actor, inventory and exposure state.

## Armor and convoy routes

An authored layout may define up to two independent AI-operated vehicles. Use `armored-vehicles.mjs` for dimensions, oriented collisions, mounted fire, mobility damage, repairs and orders. Controllers and routes belong in private `armorControl`; public physical state belongs in `vehicles`.

Record convoy identity through `convoyVehicleIds` before appending independent armor. Use `convoyVehicles`/`convoyLead` rather than assuming every vehicle is a convoy follower. Route waypoints must allow full-hull turns. Test the infantry route around the whole stopped column, not just around one hull.

Lock objective-dependent movement or repair until the relevant operation action releases it. Generic mobility repair must not bypass required replacement components. Decide explicitly whether a vehicle is required: a destroyed required convoy vehicle should produce a clear failure, not an extraction that can never finish. Wrecks continue to block shots and movement.

## Sight, fog and sound

Only the playable squad contributes shared sight. Independent allies can report or fight without revealing their entire district. Use shared sight for hostile people, vehicles, blasts and precise visual effects; use real acoustic events for sounds that can arrive from unseen sources.

Fog density is a presentation preference. It must never modify perception ranges, targeting, spawn exclusion, enemy packet visibility or explored-terrain memory. Night lighting and night combat ranges remain mission properties.

Emit a sound only when the corresponding simulated shot, impact, explosion, movement or voice event happens. Let the existing acoustic pipeline handle travel time, distance, cover, room/street reflections and voice budgets. The rare hostile-call director should remain shared; do not add mission-specific random shout loops or fake battle explosions.

## Solo and co-op validation

Use the same initial seed and mission data for deterministic terrain hydration. The host controls pre-deployment loadouts. Validate mission indices and all four role IDs at the server boundary. Keep private routes, targets and unobserved enemy vehicles out of client reconstruction and public packets.

For each new layout, validate insertion, door connectivity, structural/water boundaries, role-compatible objectives and vehicle lanes across several seeds. Complete the actual operation through ordinary input with one human, an AI leader plus a following human, and two co-op humans. The test navigation helper may plan a legal walking route; it must not teleport actors, skip stages, grant objective completion or weaken physical hull clearance.

Focused regressions should cover the concrete failure being prevented: actors staying outside a hull, visible versus hidden effects, authority ownership, finite ammunition, locked repairs and required-vehicle loss. Finish with the frontend and authoritative server gates in `package.json`.
