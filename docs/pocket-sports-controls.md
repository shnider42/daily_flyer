# Pocket Sports controller standard

Use the EA NHL-style principle of **stable buttons whose actions follow possession**, presented in a familiar **Xbox-style face-button diamond**, for new Pocket Sports games and future control revisions. The layout should build consistent muscle memory across the series; each sport supplies the appropriate offensive and defensive actions. This is a design standard, not a claim that every existing game has already adopted it.

## Primary controls

Keep the same keyboard key and touch surface in the same place as possession changes. The right-thumb diamond is fixed: **Y at the top, X on the left, B on the right, A at the bottom**. Show a persistent, prominent face-button letter alongside the current action. Update the action label, accessible name, and help text together. Avoid asking the player to find a different main button whenever the ball changes hands.

| Touch position | Control role | With the ball | Defending or recovering a loose ball |
| --- | --- | --- | --- |
| **A · bottom** | Pass / select | Pass to a teammate | Select the nearest eligible teammate to the ball |
| **X · left** | Primary attack / pressure | Shoot, or the sport's main attacking action | Steal, check, or the sport's main defensive pressure action |
| **Y · top** | Secondary team / defensive action | Basketball screen, or a sport-specific secondary action | Basketball block, or a sport-specific secondary action |
| **B · right** | Sprint / burst | Sprint or burst | Sprint or burst |

Movement stays on the left stick. Portrait, landscape, and left-handed layouts may relocate the whole action cluster, but must preserve the diamond's internal positions. Do not mirror X and B or rearrange the letters when possession changes.

The defensive selection action should choose a useful player nearest to the ball, not cycle through distant teammates. Only eligible players on the user's team can be selected. Secondary actions use Y rather than expanding the primary controls into a changing row of buttons. Existing explicit keyboard shortcuts can remain aliases.

Keep label changes immediate and understandable. A remains A while its action changes from **PASS** to **SWITCH**; X remains X while **SHOOT** changes to **STEAL**. Buttons must not move or change size during play. Do not rely on color alone to communicate identity or action. Receiver labels should not reuse A/B/X/Y in a way that competes with these face-button meanings. Guidance levels may change explanations, not the underlying mapping.

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

| Face button | Offense | Defense / recovery | Keyboard equivalent |
| --- | --- | --- | --- |
| **A · bottom** | PASS | SWITCH: select nearest eligible teammate to the ball | `J` |
| **X · left** | SHOOT: hold and release; also used for free throws | STEAL: one attempt on press, never a shot charge | `Space` |
| **Y · top** | SCREEN | BLOCK | `L` for screen/block; `R` also blocks |
| **B · right** | SPRINT | SPRINT | Hold `Shift` or `K` |

`E` remains a legacy steal shortcut; `Q` and `Tab` remain switch aliases. Blocking stays on Y, separate from the X SHOOT/STEAL surface. Direct teammate passing and receiver buttons remain available on offense. Touch labels, keyboard help, and the controls dialog must reflect the same mapping.

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
- Confirm the keyboard and touch mappings agree, the internal Y/X/B/A diamond stays fixed, and portrait/landscape preserve screen-relative movement. Check physical-controller equivalents only in games that implement them.

Adopt the standard deliberately in each game and verify its existing controls when doing so. Documentation alone does not retrofit another game's controller.
