# Experience and operation discovery

Experience changes display and coaching detail, not the ruleset, computer
difficulty, available orders, fog of war or battle state. See
[WWII Journey and Field coach](ww2-journey.md) for the expanded learning flow.

The subsequent Empires iPhone playtest established
[shared learning principles for future DSL changes](learning-experience-principles.md):
Simple must teach real decisions, default guidance needs an explicit opt-out,
and safe hex inspection must explain what the map means. Empires now implements
that first guided loop. DSL's existing Field coach behavior described below is
unchanged by the Empires update.

| Experience | Presentation |
| --- | --- |
| Simple | Short action explanations, outcomes and map names; inspect a unit for its role and status. |
| Moderate | Short action explanations plus attack percentages in unit details and fuller hover help. |
| Expert | Exact roll thresholds, modifiers, dice faces and combat reports. |

Home and the persistent **View → Experience** control share one browser
preference. Turn, mission, AP, unavailable-order reasons and danger warnings stay
available at every level. Field coach remains opt-in for guests and signed-in commanders. Journey
chapters intentionally open it at the selected Experience. Dad mode, terrain detail and illustrated units keep
their existing independent settings.

## Layout and migration

The former Experimental layout is now **Map-first**. **Command center** (formerly
Panels) keeps roster, map, orders and reports together. Active desktop battles
use the full browser width with small edge gutters. On roomy displays, roster
and order columns grow within readable limits; the battlefield takes the rest.
The lobby retains its reading width, and compact laptop/mobile layouts keep
their existing dimensions. Experience changes do not switch layouts or move navigation.
New browsers start with Simple + Map-first. Existing preferences migrate:

| Old preference | Experience | Layout |
| --- | --- | --- |
| Simple on | Simple | Command center |
| Simple off | Expert | Command center |
| Experimental | Simple | Map-first |

Version 2 of `ww2-play-preferences` stores both choices. Unavailable storage
falls back to in-memory preferences. The legacy `ww2ViewMode` API remains an
adapter for existing integrations; its old labels are not presented to players.
The saved layout value remains `panels`, so existing choices still open Command
center without a preference migration. Command center puts secondary rules,
terrain and mission reports in the scrolling command
column so changing detail does not resize the battlefield. Changing Experience
also preserves the player's manually opened or closed Battle options section.

## Operation browser

Home, Solo and Rematch share catalog-backed categories and sorting: suggested
learning order, newest added, smallest first and name. Categories overlap: Fubar
can appear under aircraft, naval and landings. No Experience level hides maps.
Simple shows names and a short learning focus; Moderate adds dimensions and
categories; Expert adds round limits and DSL-only labels in the selector.

Filtering preserves the current choice in an explicitly marked group when it
falls outside the filter. It never silently starts a different map. Reopening
Solo or Rematch restores the requested operation even if an earlier filter
excluded it. The obsolete hand-maintained NEW strip is removed.

`scenario_browser.py` adds presentation metadata only to catalog copies. Battle
snapshots and saved games are unchanged. Learning order is editorial and is not
a tested ranking of difficulty. Newest follows catalog registration order, not
an invented historical or release date. Future maps get a visible fallback
until someone supplies their learning focus and categories.

## Subsequent work — proposals, not implemented

1. **Movement responsiveness:** measure input-to-highlight paint on Midway,
   Tidal Gate and Fubar on an actual iPhone. Separate local selection/rendering
   time from server-confirmed movement time. Profile terrain, fog, unit overlays
   and order rendering before choosing a refactor. Cache invalidation must keep
   fog and legal-order previews correct after every revision.
2. **Deployment phase:** begin with one opt-in scenario and balanced preset
   zones. Validate terrain, domain, transport and stacking rules. Keep enemy
   placements hidden until both sides lock in, allow undo before readiness,
   provide a balanced automatic deployment, and save the phase/readiness state
   for reconnection. Unit budgets and objectives remain scenario-owned.
3. **Map builder:** start with private draft maps painted hex by hex, then add
   objectives, deployment zones and unit budgets. Require connectivity, legal
   starts, access to objectives and compatible land/sea/air rules before play.
   Store an immutable map snapshot in each created battle.
4. **Cohesive random maps:** generate seeded regions and routes—coastlines,
   connected roads, rivers, towns and woods—then validate them with the same
   editor checks. Equal budgets and viable approaches are a starting point, not
   proof of balance. Record the seed, generator version and final map snapshot.
5. **Guest learning:** develop short optional lessons around an actual decision:
   select, inspect, move, preserve AP, use cover, attack, and finish a turn.
   Introduce specialist lessons only when the selected operation needs them.
   Explain victory and whose turn it is throughout. Resume progress per battle
   without forcing a tour on returning commanders.

Suggested order after this UX playtest: profile large-map selection; try one
deployment sandbox; build the editor and shared validator; then add generation.
WWII Journey now provides a fourteen-operation path; Field coach adapts its explanations to the chosen Experience.

## Verification

The isolated Python suite passes 309 tests, including catalog coverage and
unchanged battle snapshots. Browser coverage exercises preference migration,
safe filtering, saved choices, absent storage, desktop/phone sizes, and stable
camera, selection, pending targeting and available orders across Experience.
Shared navigation, guided practice and Fubar supply regression coverage.

Browser automation uses Chromium with touch/phone emulation. It does not replace
an actual Safari/iPhone playtest or verify a Render rollout.
