# DSL weapons, armor and command

New DSL matches on **every map** save `combat_version: 1`. Classic and existing
matches without this field retain their original resolution. Starting a rematch
creates a current-rules match. Save codes, reconnects and undo/redo preserve the
version, loaded ammunition, mobility damage, support charges and pending strikes.
No database migration, external service or Render configuration change is needed.

## First balance pass

| Fire | Infantry | Armor | Ships |
| --- | --- | --- | --- |
| Rifle / MG | 1 damage + pin; German suppression 3+, US 5+ on the same die, with explicit faction overrides. | Cannot damage or pin. | Cannot damage or pin. |
| Tank AP / fixed AT gun | 1 damage + pin. | 2 to tanks; 3 to light armor. | 1 damage. |
| AT rocket | 1 damage + pin. | 2 damage. | 1 damage. |
| Tank HE | 2 damage + pin to primary infantry; adjacent infantry takes 1 + pin. | 1 to light armor; cannot damage tanks. | Cannot damage. |
| Mortar fragments | Delayed automatic 1 damage + pin and loss of dug-in cover throughout radius 1. | No effect, including light armor. | No effect. |
| Heavy naval shells | 6 required; destroys primary infantry; adjacent infantry takes 1 + pin. | Normal shell damage if penetrated. | Saved gun damage minus hull armor, minimum 1. |
| Commander artillery | 4+ for 2 damage at aim point; adjacent infantry takes 1 + pin. | 2 at aim point; no fragment damage nearby. | 1 at aim point. |

Only infantry is pinned. A **successful penetrating hit on 5–6** immobilizes a
surviving tracked tank without cancelling its gun or overwatch. A high miss does
not disable it. **Repair tracks costs 2 AP**, restores movement and does not heal
strength. Splash affects friendly infantry too; passengers are protected inside a
living carrier and use the existing bailout rules if it dies.

Tanks begin with AP. **Changing AP ↔ HE costs 1 AP** and cancels overwatch and a
pending road bonus. Fire remains 2 AP. German tanks can bank an AP to switch and
fire in one turn, or switch now and fire next turn. The shared matrix handles
tank-versus-ship and other mixed targets without scenario-specific damage rules.

Normal fire keeps **one d6** and exact-result redo. A second die is deferred: the
natural roll already supplies high-hit track damage and perfect naval hits.
This is a fictional balance model, not a historical ballistics simulation.

## Commander

Commander support reaches **4 hexes across platoons**. Rally costs 1 AP. Granting
eligible non-officers +1 AP costs 2 AP, remains once per command group per turn,
and respects received-AP/banking caps. LTs retain adjacent platoon support.

Each Commander has **two artillery calls and two recon sorties per battle**:

- Artillery: 2 AP, range 12, no sight required. Radius 1 is marked for both sides.
  Impact follows the enemy turn, even if the caller is lost. One roll resolves
  the shell and infantry splash: 4+ hits, 5–6 can damage tank tracks. Missing does
  no damage. Separate from the shared LT mortar allowance. Bombing-run calls are
  not added in this pass.
- Recon: 2 AP, range 12, reveals radius 3 including concealed infantry until the
  enemy turn ends. Uses the same temporary search concept as carrier scouts.
  Sorties are abstract, not aircraft units; they neither attack nor trigger AA.
  Searches commit earlier orders; expired sightings become last-known contacts.

## Battleship bombardment and fog safety

Battleships can aim anywhere within **gun range +3** for 2 AP, ignoring sight and
intervening terrain. A natural 6 hits that hex; other rolls miss. Armor and ships
take normal shell damage at the aim point; infantry there is destroyed, and
adjacent infantry takes 1 damage and pins. There is no scatter.

Aim choices depend only on range and geometry. Reports say unobserved effects
are unknown. Per-unit impacts are filtered to each viewer's observed units;
hidden identities, damage, counts and positions are not returned through logs,
combat reports or computer replays. Existing public victory/control information
remains public. AI uses visible enemies and last-known contacts for bombardment,
never current hidden positions.

## Extending units and maps

`ww2_tactics/weapons.py` owns profiles, protection, damage, pins, track damage,
splash, extra orders and their AI scoring. Ground direct/reaction fire, naval
guns/torpedoes/strikes, aircraft/AA, grenades and delayed support route through it
in new DSL matches. Theater modules retain movement, sight, targeting and victory
rules; new scenarios select the appropriate theater and roster.

Profiles declare `penetration`, allowed protection classes, damage, `splash`,
`penetrating` and optional perfect-hit behavior. Future units can supply `weapon`,
`weapon_overrides`, `protection`, `tracked`, `ammo_options`, `bombard_range`,
`command_radius`, and artillery/recon ranges and charges. Initialize through the
shared match initializer; do not derive combat effects from scenario IDs or side
IDs. Faction-specific accuracy and suppression remain roster data. New profiles
and movement domains still need tests.

## Verification

Run `python -m ww2_tactics.devtools test`. `tests/test_ww2_weapons.py` covers armor
immunity, high hits/misses, overwatch, ammunition and friendly splash, naval
infantry hits, hidden-hit non-disclosure, exact-result redo, Commander abilities,
legacy rules, AI visibility and API save/restore.

`tests/ww2-weapons-browser.cjs` covers real server orders at 320/390/1440 widths,
ammunition/track controls, map continuity, Commander targeting and fog aiming.
Set `CHROMIUM_EXECUTABLE_PATH` for an installed Chromium, or use the existing
Sparticuz fallback. Controls retain Simple view's short descriptions, detailed
odds, Dad mode and illustrated/basic presentation choices.
