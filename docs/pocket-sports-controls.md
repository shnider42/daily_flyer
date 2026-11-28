# Pocket Sports controller standard

Use the EA NHL-style principle of **stable buttons whose actions follow possession**, presented in a familiar **Xbox-style face-button diamond**, for new Pocket Sports games and future control revisions. The layout should build consistent muscle memory across the series; each sport supplies the appropriate offensive and defensive actions. This is a design standard, not a claim that every existing game has already adopted it.

## Primary controls

Keep the same keyboard key and touch surface in the same place as possession changes. The right-thumb diamond is fixed: **Y at the top, X on the left, B on the right, A at the bottom**. Show a persistent, prominent face-button letter alongside the current action. Update the action label, accessible name, and help text together. Avoid asking the player to find a different main button whenever the ball changes hands.

| Default touch position | Control role | With the ball | Defending or recovering a loose ball |
| --- | --- | --- | --- |
| **A · bottom** | Pass / select | Pass to a teammate | Select the nearest eligible teammate to the ball |
| **X · left** | Sprint / burst | Sprint or burst | Sprint or burst |
| **Y · top** | Secondary team / defensive action | Basketball through pass, or a sport-specific secondary action | Basketball block, or a sport-specific secondary action |
| **B · right** | Primary attack / pressure | Shoot, or the sport's main attacking action | Steal, check, or the sport's main defensive pressure action |

Movement stays on the left stick. Portrait, landscape, and left-handed layouts may relocate the whole action cluster, but must preserve the diamond's internal positions. Do not mirror X and B or rearrange the letters when possession changes.

The defensive selection action should choose a useful player nearest to the ball, not cycle through distant teammates. Only eligible players on the user's team can be selected. Secondary actions default to Y rather than expanding the primary controls into a changing row of buttons. Existing explicit keyboard shortcuts can remain aliases.

Keep label changes immediate and understandable. With the defaults, A remains A while its action changes from **PASS** to **SWITCH**; B remains B while **SHOOT** changes to **STEAL**. Buttons must not move or change size during play. Do not rely on color alone to communicate identity or action. Receiver labels should not reuse A/B/X/Y in a way that competes with these face-button meanings. Guidance levels may change explanations, not the underlying mapping.

## Touch customization

Keep touch preferences together in a **Touch controls** dialog. In Pocket College Hoops, it is available from **Touch controls** in the lobby, **Pause > Touch controls**, and **Controls & rules > Customize touch controls**. The same dialog contains **Controls size**, **Control opacity**, **Left-handed layout**, and the action assignments. Control opacity defaults to **45%**, adjustable from **10% to 100%**. Fade each whole face button, joystick including its knob, and receiver button, including their letters and text. A live sample in the dialog shows the chosen opacity against a court background as the slider moves. The sample is for viewing and does not accept gameplay input; pressed controls keep the chosen opacity while their fill and border provide feedback.

The letters retain their fixed Xbox positions; the player assigns the action pairs to those positions. Move each possession-sensitive pair together: PASS/SWITCH, SHOOT/STEAL, THRU PASS/BLOCK, and SPRINT. Choosing an action already assigned elsewhere swaps the two assignments, keeping all four pairs reachable exactly once.

Save preferences automatically in the same browser and restore them on the next visit. **Reset button mapping** resets only the four action assignments to **A = PASS/SWITCH, B = SHOOT/STEAL, Y = THRU PASS/BLOCK, X = SPRINT**; controls size, opacity, and handedness retain their saved values. These are the defaults for basketball and future games or control revisions adopting this standard. Touch customization does not remap keyboard shortcuts or the diamond's letter positions.

For existing Pocket College Hoops preferences, migrate a saved SCREEN/BLOCK assignment to THRU PASS/BLOCK in the **same physical slot**. Preserve the rest of the player's valid custom layout.

Update visible actions, accessible names, and touch help to match the saved assignments. After a swap, each pair still follows possession on its newly assigned button. Changing an assignment while paused must not carry a held or queued action back into play.

## Possession and loose-ball behavior

Use controlled possession and the ball's current flight/loose state to resolve actions. Do not infer a new offensive opportunity merely from the last player to touch the ball.

- An own-team pass in flight retains the offensive labels. Actions requiring the ball stay unavailable until it is caught; presses during flight do not queue a shot.
- An unowned shot, rebound, or other loose ball uses defensive/recovery controls until somebody secures it. Selection remains useful; proximity to the ball alone must not arm a shot.
- When the user gains possession, hand control to the new ballhandler and update the labels. Cancel incompatible held or pending action state immediately.
- When possession is lost, cancel the shot meter and any release belonging to the former ballhandler. A later release must not become a different action.
- Preserve held movement, stick ownership, and sprint through possession changes and automatic dead balls. Explicit menus, lost focus, and hidden pages clear held input to prevent stuck movement.

## Prevent action carryover

An input begun under one action context must never silently become an action under another. Bind a press to its initiating pointer/key, player, and possession context. Defensive pressure acts on **press**, not release. Ignore keyboard auto-repeat for actions that fire once per press. Another finger or a different input source must not release that press.

For a defensive action that wins team possession, use both safeguards:

1. **A short shot guard, approximately 500 ms of simulation time after the team gains possession.** Pausing the game pauses this interval. A press during the guard is discarded, not queued for execution when time expires.
2. **A fresh release and press.** Holding STEAL through a turnover cannot begin charging SHOOT, even after the guard expires. The player must release and deliberately press again in the new context.

The guard suppresses accidental shooting, not movement or a deliberate pass. Clear a carried defensive-action cooldown if it would prevent passing after a steal. A same-team pass or offensive rebound does not need a new turnover guard, but it still invalidates any held shot belonging to the former action/player context. In particular, holding an action through an offensive rebound must not produce an automatic follow-up shot. Do not queue gameplay actions across possession changes, loose-ball recovery, or automatic restarts by default.

## Pocket College Hoops mapping

| Default face button | Offense | Defense / recovery | Keyboard equivalent |
| --- | --- | --- | --- |
| **A · bottom** | PASS | SWITCH: select nearest eligible teammate to the ball | `J` |
| **X · left** | SPRINT | SPRINT | Hold `Shift` or `K` |
| **Y · top** | THRU PASS: lead a teammate with a bounce pass; an eligible near-rim opportunity becomes an alley-oop | BLOCK | `L` for through pass/block; `R` also blocks |
| **B · right** | SHOOT: hold and release; also used for free throws | STEAL: one attempt on press, never a shot charge | `Space` |

`E` remains a legacy steal shortcut; `Q` and `Tab` remain switch aliases. Blocking defaults to Y, separate from the B SHOOT/STEAL surface; customization preserves that separation. Direct teammate passing and receiver buttons remain available on offense. Keyboard shortcuts retain their actions regardless of the touch assignments.

Steer toward the intended runner before pressing THRU PASS. An alley-oop requires a suitable teammate near the rim and an attack aimed toward the basket from close enough range. The button changes from **THRU** to **LOB** when the current aim and positions allow that pass. The lob is a pass until the teammate reaches it; it must not count as a shot or score merely because it travels toward the hoop. Call **High pick & roll** in the playbook to bring a screener up; Y no longer calls the screen directly.

Give a made basket a readable beat before restarting the next possession. Pocket College Hoops holds the scoring scene for **1.0 simulation second**, followed by **1.25 simulation seconds** for an assisted inbound. This also follows a made final free throw. Pause both clocks during that reset and inbound. Preserve steering and sprint holds, but do not accept or queue a shot during the reset. A made basket with an additional free throw keeps the free-throw sequence; a basket that ends the period proceeds to the period break.

Pocket College Hoops defaults to **80% game pace**, adjustable from **60% to 100% in 5-point steps** in the lobby and Pause. Apply that pace to movement, ball travel, AI reaction timing, clocks, cooldowns, restarts, and the shot meter together. The green release target keeps its place in the meter; lower pace gives the player more real time to reach it. At 80%, a full shot hold takes **1.5 real seconds**, the approximately 500 ms possession guard takes **625 ms**, and the scoring reset plus inbound takes about **2.8 seconds**. Menus clear held actions before a pace change, and replay runs at half the selected pace. Keep interface feedback and camera movement responsive while the game slows.

The face-button letters describe the **on-screen touch layout**. Pocket College Hoops supports keyboard and touch input; the diamond alone does not add physical gamepad support. Only advertise connected-controller support after that input path is implemented and verified.

## Review scenarios

When implementing or revising a controller, verify these behaviors in the actual input path:

- Press STEAL, win possession, and release: **no shot**.
- Keep STEAL held past the shot guard: **no automatic charge or shot**.
- Press during the guard and wait: **nothing fires later**.
- Release, then make a new press after the guard: a normal shot can begin.
- Press PASS while defending: the nearest eligible teammate is selected.
- Recover a loose ball while holding movement: movement continues; no attack is synthesized.
- Complete a same-team pass: offensive labels remain stable in flight, and the catch does not execute an earlier shot press.
- Change ballhandler, pause, or lose focus during a charge: the old release cannot shoot.
- Hold movement with one finger and use an action with another: both retain independent ownership.
- Swap two touch assignments: all four action pairs remain available, and their labels and accessible names follow the new positions.
- Reload in the same browser: custom preferences return. Use Reset button mapping: B returns to SHOOT/STEAL and X to SPRINT, with A PASS/SWITCH and Y THRU PASS/BLOCK; controls size, opacity, and handedness stay as chosen.
- Drag Control opacity: the whole controls and the in-dialog sample visibly fade, including their text. Confirm the chosen value saves and returns after reload, and the sample cannot trigger gameplay.
- Load an older saved SCREEN/BLOCK assignment: THRU PASS/BLOCK takes its existing slot without rearranging the other actions.
- Use THRU PASS with a teammate running ahead: a pass leads that player. An alley-oop needs a real catch and finish; a missed lob or a horn before the catch must not register an automatic shot or basket.
- After a made basket, score once and pause both clocks through the reset and inbound. Preserve the additional free throw on an and-one and end the period correctly on a buzzer-beating finish.
- Lower game pace: player movement, pass and shot travel, reaction timing, restarts, clocks, and the shot meter slow together. Change pace from Pause: no held action survives, and resuming causes no catch-up burst. Replay remains slower than live play and does not advance the match.
- Confirm touch customization leaves keyboard actions unchanged, the internal Y/X/B/A diamond stays fixed, and portrait/landscape preserve screen-relative movement. Check physical-controller equivalents only in games that implement them.

Adopt the standard deliberately in each game and verify its existing controls when doing so. Documentation alone does not retrofit another game's controller.
