# Unit orders and desktop camera

DSL now keeps a selected unit’s supported orders visible. Unavailable orders are muted, with readable reasons: AP, exhausted supplies, cooldown, an already-active stance, missing friendly support, or the need to select a visible target. Hover or keyboard focus shows the explanation on desktop. Tapping an unavailable order on a phone explains it in the existing hint area without sending a request.

The rules engine still determines legality and resolves every order. Costs, accuracy, damage, AP banking, fog, and saved-battle versions are unchanged. Classic retains its existing command interface.

## Similar controls audited

| Orders | Distinction |
| --- | --- |
| Fire at unit / Aim at hex | Attack a selected visible unit using its normal odds / aim explosive ammunition at a geometric hex, with the existing landing roll, cover and friendly-fire rules. |
| Aim at hex / Blind bombard | Direct firing lane and the existing limited fringe / battleship range +3 without a sight requirement; existing 6-only hit roll. |
| Fire / Suppress / Overwatch | Immediate damage attempt / pin without damage / spend AP for one later reaction shot. |
| Close assault / Grenade | Adjacent attack, failure risk and possible advance / ranged fragmentation using a consumable, without advancing. |
| Rally self / Rally allies / Give actions | Remove this unit’s pin / officer removes nearby allied pins / grant AP to eligible nearby troops. |
| Fix own tracks / Repair tank | Tank restores its own mobility / engineer spends a kit and AP to restore strength and tracks to an adjacent friendly tank. |
| Load anti-tank / Load explosive | Mutually exclusive ammunition choices. The currently loaded choice stays visible but unavailable. |
| Load troops / Unload troops | Opposite transport operations. The passenger pays AP in both cases. |
| Fit map / Find / Widen map | Fit the entire board / center the selected unit at current zoom / hide the roster to enlarge the map while keeping orders. |

Commanders with artillery do not gain the legacy mortar order. Naval recon, Commander recon and airfield service remain specific to their existing roles; they are not added to other units.

## Fog and layout guarantees

`order-capabilities.js` uses only the public unit traits and the current legal orders already sent by the server. It does not request extra enemy information or simulate attacks from prospective destinations. Selecting a future destination does not disclose whether a hidden target could be attacked. Readiness is for the current position only.

The mobile grid reserves space for the largest friendly role in the battle, including before selection. Switching units, spending AP or entering a targeting mode does not resize the map. Simple view, illustrated units, terrain detail, learning mode and Dad mode continue using the same controls.

Desktop scroll-wheel zoom is anchored under the pointer. Drag still pans; +/- zoom and 0 fits while the map is focused. Selecting an on-screen unit preserves the camera. Find explicitly centers it, and selecting an off-screen unit brings it into view. Widen map is reversible and does not duplicate any order buttons.

## Extending roles

Add discovery metadata in `unitOrderCapabilities` when introducing a new order. Use stable role/equipment traits, not current AP, current target availability or remaining supplies, to determine whether a capability exists. The existing renderer must still determine whether it is legal. Keep explanations safe for public state, and add the reason, button description and relevant mobile coverage together.

`tests/ww2-capabilities-browser.cjs` covers all current maps, hidden-enemy invariance, disabled mouse/keyboard requests, spent supplies, waiting turns, pointer zoom, selection stability, widening and phone layout. The operations and weapons suites exercise actual server orders through the same controls.
