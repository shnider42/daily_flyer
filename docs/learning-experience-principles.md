# Learning principles shared by Empires and DSL

Recorded from Chris's October 2026 iPhone feedback. These are product decisions
to preserve as both games develop. Empires' initial guided loop is described in
[its learning notes](empires-learning.md); the subsequent
[site-wide Experience review](experience-depth-review.md) applies the three
levels consistently across DSL and Empires.

## Simple must teach decisions

Reducing information density is not enough. A player who has never played the
inspiration game needs to know the goal, what to do next, why it helps, what it
costs, when it takes effect and how to tell it worked. Teach our actual rules;
never require prior Civilization or Squad Leader knowledge.

Simple should offer persistent guidance by default, with an explicit
**Ignore tutorial** choice that preserves Simple. Closing a lesson temporarily
is different from opting out. Completing an introductory path should lead to
contextual help rather than silently disabling guidance. Remember the opt-out
and provide a clear way back. Experience, artwork, layout and tutorial consent
are separate preferences; a change to one must not silently change another.

## Tie explanation to a real, safe decision

- Use the current unit, city, turn and server-authorized actions. Explain why
  unavailable orders are unavailable and offer a useful next step.
- Inspection must be safe. A learning tap or map drag must not accidentally
  move a unit or spend resources. Label the action that commits a decision.
- Show confirmation only after the server confirms an order or a read verifies
  a lost response. Pending, failed and uncertain outcomes need distinct text.
- Teach timing explicitly: immediate movement versus turn-end production,
  research or recovery. Show the actual result after resolution.
- Let players review a lesson when practice is unavailable. Mark it as reviewed,
  not as a completed action. Do not block a live game behind a rigid script.

## Make the map explain the game

An attractive hex is not yet an understandable hex. Pair art and color with
plain labels and decision-relevant values. Distinguish terrain, resources,
improvements, occupants, ownership, current activity and potential usefulness.
For DSL, apply the same discipline to movement cost, cover, line of sight,
objectives, domains and specialist orders. Reuse server rules or verified
shared calculations rather than inventing a second set of tutorial rules.

Current visibility and remembered information must remain distinct. Teaching
must never expose hidden units, live terrain changes or private opponent plans.
State what is known and why a claim cannot be made from a last report.

## Respect a phone player's attention

Keep the map available. Use a compact persistent prompt and readable sheets
that return to the same selection and camera. Important explanations cannot
depend on hovering, tiny symbols or color alone. Keep touch targets usable,
make disabled-action reasons available and check portrait and landscape.

DOM/API checks can verify state, timing, persistence, legal actions and control
placement. They cannot establish physical iPhone readability or player
understanding. Ask a novice to predict an outcome and explain a map choice;
record their confusion for the next iteration. Experienced friends provide
balance insight, but do not substitute for novice playtesting.

## Current DSL application

DSL now offers a compact Simple prompt with explicit Ignore/Resume tutorial
consent, current-decision guidance and a safe hex-inspection mode. Closing or
completing the coach does not disable contextual help. Moderate has authored
planning explanations; Expert retains full rules. Home, setup, Greybridge,
missions, orders, preparation, results and specialist interfaces use the same
Experience preference as Empires. Existing lesson progress, save ownership,
fog, action legality and independent presentation preferences are preserved.

Automated checks establish those behavioral boundaries; they do not prove that
a first-time player understands every lesson. Keep testing the explanation
against a player's predicted result and actual confusion.
