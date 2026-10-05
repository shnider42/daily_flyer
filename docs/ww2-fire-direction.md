# Recon fire direction playtest

Vire Crossroads and Belfry Valley introduce `fire_control_version: 1` when a
new DSL match is created. Existing scenarios and saved matches, including
ongoing Kharkov co-op, retain their combat rules and rosters. Loading a save
does not opt it into the experiment. No database migration is required.

## Orders

Observe still costs 1 AP and increases sight only. An observing recon team
or Pathfinder can then **Spot for fire** for 1 AP, once per turn. It marks one
hex it can currently see. The mark never follows a unit and cannot stack.

- Same-platoon tanks and fixed AT guns gain −1 to the required direct-fire
  roll against that hex: for example, 5+ becomes 4+. Armor, cover, ammunition
  and the normal 2+ minimum still apply.
- A supported gun can shoot one hex beyond its normal range. That extra hex
  adds +1 to the required roll, cancelling the accuracy bonus. The gun still
  needs a clear firing lane and a live platoon sighting for Fire at unit.
- Tank/AT-gun Aim at hex gets the same one-step improvement. Its existing
  speculative fringe remains limited to one hex; direct-unit cover and armor
  checks are retained.
- Moving, attacking, boarding, pinning, losing sight or losing the observer
  removes the live benefit. Smoke can interrupt it. All marks expire when
  the army ends its turn. Finishing one co-op player's orders does not expire
  a mark while their teammates are still acting.
- Gold **SPOT A/B/C** labels identify active marks. Enemy marks are private,
  including in replay frames. Mark choices depend on visible terrain, never
  hidden occupants. The normal co-op ownership checks authorize orders.

Mortar teams use **Aim at hex** for indirect fire: 2 AP plus one finite shell,
once per round, at range 2 through the crew's listed mortar range. A current
platoon observation or dated radio report is required, but the mortar's own
line of sight may be blocked. Accuracy is fixed when ordered: 5+ normally,
4+ with same-platoon recon direction. The public warning lasts through the
enemy turn; then a single accuracy roll decides whether the barrage lands.
Misses still consume the shell. A landing barrage deals 1 damage, pinning and
loss of dug-in cover to infantry in radius 1, including friendlies. Armor is
immune to fragments. Buildings use a separate 5+ structural roll; a collapse
can kill armored occupants as well. The legacy mortar endpoint delegates to
these same checks on the two new maps, preventing a second unrolled attack.

Computer recon can Observe and mark useful visible contacts. Computer mortar
orders use the same ammunition, accuracy, targeting and ownership rules.
Existing Easy/Standard co-op difficulty choices remain available.

## Maps

| Map | Board | Forces per side | Main experiment |
| --- | --- | --- | --- |
| Vire Crossroads | 16 × 17 | 17 units, two platoons + commander | Lower-density playtest: fast American armor, a British Firefly and raiders versus tougher German armor, MG support and an AT gun; three river crossings |
| Belfry Valley | 18 × 22 | 22 units, three platoons + commander | Shared-hex playtest: three recon/mortar pairs and two snipers per side; offset villages, churches and clock towers |

Both maps have three flags worth 1/2/1 at their army's turn end. First to
10 points wins. At the round limit (20/24), higher score wins; Germany wins
an exact tie. Normal army elimination also wins. These are fictional maps
with provisional balance, not historical reconstructions or measured win-rate
claims. In platoon co-op, two allied players can take A/B. On Vire this leaves
the two enemy platoons computer-controlled. On Belfry, allied C and the three
enemy platoons remain computer-controlled. The host also owns the allied HQ.
Existing Vire saves keep their original three-platoon, 25-unit armies.

Churches share clock-tower mechanics: infantry-only 2 AP entry, +1 intact
cover, extended observation and sniper range, easier detection of occupants,
and normal structural destruction/collapse. They have distinct vector artwork
and terrain help. Snipers retain the existing 3 AP aimed-shot rules; German
teams need to bank AP. Neither old map rosters nor sniper rules are changed.

## Density and shared hexes

New Belfry matches save `ground_stack_version: 1`. Existing Belfry saves keep
single ground occupancy; the new map catalog never upgrades a loaded match.
Vire keeps one ground unit per hex while reducing its roster from 50 to 34
units overall (32% fewer), preserving armor, recon, mortar, sniper, radio,
engineering, supply, commander and transport/amphibious roles across its two
platoons. Board dimensions and the three scoring flags remain the same.

Belfry allows at most two friendly active ground units per hex, including
churches and towers, with at most one vehicle or fixed gun. Terrain restrictions
still apply separately. Enemy units cannot share a ground hex. Dead units,
off-map reserves and boarded passengers do not occupy ground slots. Each unit
retains its AP, orders, platoon sight, support rules and co-op owner. A supply or
repair team can serve a recipient sharing its hex. Stacking does not count as
boarding a transport; boarding still needs a separate order and co-op consent.

Click a friendly counter to select it or move an eligible selected unit into
its hex. Shared counters are offset with a visible count; the chooser lists
names, platoons, AP and player/computer ownership. It also lets players choose
between visible enemy targets. Snipe has a separate target chooser when both
occupants are eligible. Revising the battle invalidates an open chooser.

Direct fire and sniper fire select one unit. Existing explosive splash and
mortar barrages affect all eligible infantry, including co-occupants and
friendlies. Aim at hex and commander artillery check every primary occupant
using normal weapon protection (and normal individual thresholds for Aim at
hex). A shell damages a structure once, not once per occupant. Collapses kill
all ground occupants. Assaults advance only after clearing every defender;
holding a flag with two units still scores it once. AI uses the same capacity
checks and prefers spreading out when the route/objective benefit is equal.

Validation for this revision includes 15 focused stacking tests, the original
recon browser test, a new real desktop/phone co-op stacking test, and exact
baseline comparisons of original Vire, Belfry and Kharkov co-op snapshots after
Observe, movement and one player's Finish orders. No production games are
rewritten. Start a new match to try either density experiment.

## Validation

- `tests/test_ww2_fire_control.py`: 12 focused rules tests, including support
  lifetime, range/LOS, finite delayed mortar fire, friendly fire, fog privacy,
  AI spotting, church destruction and co-op ownership/readiness.
- Full `test_ww2*.py` suite: 413 passing tests after the density revision.
- Journey DOM/API checks: 24 maps × two armies × three experience levels;
  role-appropriate new recon/mortar lessons and complete script boot.
- `tests/ww2-fire-control-browser.cjs`: real desktop and phone controls,
  two allied platoons, recon accuracy previews, guided indirect fire, finite
  ammunition, readiness, computer turn continuation, map flags and churches.
- A baseline/current Kharkov co-op comparison (two players, Observe, tank
  movement, personal Finish) produced identical complete serialized states.

Browser fixtures use a disposable local SQLite database. They never alter
production matches. Human playtests should evaluate sight denial, ammunition
pressure, church/sniper counterplay and whether the asymmetric forces need
adjustment before extending fire direction to older maps.
