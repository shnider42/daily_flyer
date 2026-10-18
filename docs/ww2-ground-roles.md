# Compact ground roles: Village Crossing 2.0 and Stonebridge 2.0

These Current-only playtests isolate a more differentiated infantry roster. Original maps and saved battles retain their gameplay capabilities. Ground-counter badges and the carrier-control visibility fix apply across the site; existing illustration assets are unchanged.

## Maps and force balance

| Operation | Board | Deadline | Units per army | Organization |
| --- | --- | --- | --- | --- |
| Village Crossing 2.0 | 9 × 11 | Round 10 | 8 | One platoon and company command |
| Stonebridge 2.0 | 11 × 13 | Round 12 | 9 | Assault and support platoons, company command |

Both use daytime fog, local platoon spotting, two-friendly-unit ground stacking and the original two-consecutive-US-turn-end objective hold. Germany wins by holding out; army elimination also resolves victory. Village gives the US a mortar and Germany an extra rifle section. Stonebridge gives both armies a mortar and two captains. Terrain, equipment and officer ranks are authored playtest choices, not exact historical orders of battle.

## Roles

All teams may move and dig in. AP and banking use existing DSL limits.

| Role | Combat and support | Supplies | Recovery |
| --- | --- | --- | --- |
| Rifle section | Direct fire, overwatch, assault | 1 frag | Officer or full own turn pinned |
| Captain | Direct fire, rally allies, grant actions; own platoon within 1 hex | 1 smoke | Self-rally, 1 AP |
| Major | Direct fire, rally allies, grant actions; any friendly platoon within 2 | 1 smoke | Self-rally, 1 AP |
| Browning team | Direct fire/overwatch range 1–5; suppression range 1–4, 5+ | None | Officer or full own turn pinned |
| MG 42 team | Suppression only, range 2–6, 3+; base sight 4 | None | Officer or full own turn pinned |
| Recon patrol | Direct fire, Observe; Spot for fire when its platoon has a mortar | 2 smoke | Self-rally, 1 AP |
| Engineers | Direct fire, assault, clear collapsed buildings; bridge construction on Stonebridge | 2 frags, 2 smoke; 1 bridge kit on Stonebridge | Officer or full own turn pinned |
| Mortar team | Indirect Aim at hex, range 2–6, once per round | 3 shells | Officer or full own turn pinned |

Suppression costs 2 AP and never causes strength damage. MG 42 fire requires a clear lane and platoon spotting, even if another team observes beyond the MG's sight. Its short-range dead zone is deliberate. No damaging direct fire, overwatch or self-rally is available to this role. Observe does not extend weapon range.

Officer rally costs 1 officer AP and preserves recipients' AP. Granting actions costs 2 officer AP, once per command group per turn, and observes normal recipient caps. A non-self-rallying team recovers at its own turn end only if it began that turn pinned and remained pinned. Officer rally resets that recovery cycle. Recovery runs before pending end-turn bombardments, so incoming fire can pin the team again. Self-rallying units do not recover automatically.

## Implementation and presentation

`ground_roles_version=1` is saved with the battle. Each roster unit saves its `role_orders`, `role_label` and `role_profile`; these gate legal previews, execution and client discovery. This does not regenerate an old save's units. The AI uses the same legal orders and moves officers toward nearby pinned teams. The private recovery marker is excluded from enemy snapshots and replays.

Supported orders remain discoverable with a reason when they lack AP, supplies or targets. Unsupported orders are hidden. Role-specific help, selected-unit details, learning chapters and a scoped field manual explain the same capabilities. The MG's actual support range is shown instead of implying damaging rifle fire.

Ground units receive shared high-contrast SVG role badges in the upper-right corner of the existing art. Officers use bars/leaf, rifle infantry a chevron, specialists equipment symbols. These are gameplay identifiers, not faction-specific historical rank tables. Original lieutenants retain one bar; new captains use two. Basic/detailed modes, map counters, portraits and replay share one renderer. Pin markers move below the badge; overwatch remains upper-left. Air and naval artwork is unchanged. A field-manual legend covers the ground roles currently visible.

The carrier opener's Simple-view CSS now respects `[hidden]`; its click handler also verifies an eligible carrier or aircraft on a carrier-enabled operation. It cannot open a stale manifest for a ground unit or destroyer.

## Validation

- Rules tests: registration, force sizes, reachable objectives, role authorization, MG range/spotting/LOS/dice/damage, forbidden reactions, officer eligibility, recovery timing, incoming barrage interactions, AI, save/restore, undo/redo and privacy.
- Full existing Python regression suite, including frozen Legacy expectations.
- Whole-app DOM with real disposable Flask orders at 1440 and 390 widths: order sets, CSS-computed carrier visibility, selection and map switching, suppression/rally, three experience levels, two layouts, two themes and help consistency.
- Shared-art tests and an offline vector-rendered proof at enlarged and map sizes; no illustration files changed. DOM and offline proofs do not replace device/browser playtesting.

Balance remains a playtest question: watch officer concentration, MG dead-zone counterplay, time to cross Stonebridge and whether Village's extra German rifle section offsets US indirect fire. No balance changes to Midway 2.0 are included.
