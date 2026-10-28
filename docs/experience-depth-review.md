# Site-wide Simple, Moderate and Expert review

## Purpose and boundary

Make Experience an explicit, useful choice throughout the existing site. This
is a presentation and guidance update. Rules, difficulty, units, forces, map
sizes, legal orders, scenario objectives, dice, AI and saved-game formats are
unchanged. No Python engine, scenario, persistence or API file changes are part
of this update.

The three levels share the same game and capabilities:

| Level | What the player should see first |
| --- | --- |
| Simple | The actual goal, one useful next step, why it helps and essential costs or dangers. Extra rules and history can be opened. |
| Moderate | The information needed to plan: costs, timing, resources, options, odds and consequences. Exact rules remain accessible. |
| Expert | The complete existing rules, thresholds, modifiers, interactions, accounting and reports. |

Simple is not a difficulty setting. Moderate is not an assumption that the
player already knows Squad Leader or Civilization. Selecting either level
does not remove actions, operation choices or necessary victory conditions.

## Audit and changes

The previous shared selector did not reach every screen. Some Simple surfaces
only removed numbers, and some Moderate surfaces inherited full specialist
prose. The changes make the explanations and the selected level visible where
the player makes the decision.

| Surface | Simple | Moderate | Expert |
| --- | --- | --- | --- |
| Home and operation discovery | Prominent shared selector before operations; short practice focus | Focus, map dimensions, round budget and categories | Complete catalog metadata and edition context |
| Solo, multiplayer and rematch setup | Plain-language next step and separate checkpoint/recovery explanation | What each setup choice affects and when a rematch starts | Full setup context and recovery detail |
| WWII Journey | Authored first step for all fourteen chapters | Tactical focus and planning context | Full chapter context, map size and round limit |
| Greybridge | Required goal, concrete next step and safe objective navigation; optional rules and history expandable | Route, AP, timing and inherited mission consequences | Complete rules, operation record and consequences in view |
| Standard mission briefings | Actual goal and current phase or next step | Planning checklist and relevant timing | Full doctrine and scenario exceptions |
| Field coach | Compact default prompt and contextual guidance | Authored common and specialist planning explanations | Original complete explanations and exact detail |
| Orders and selected units | Purpose, essential AP/status and actual unavailable reason | Useful cost accounting, tradeoffs and attack odds | Full calculations, modifiers and reports |
| Map inspection | Read-only terrain meaning and legal movement cost | Decision-relevant values and visibility limits | Full public terrain and movement details |
| Preparation and cooperative play | Whose units can be changed, who controls shared resources and what finishing means | Team timing, ownership and remaining choices | Complete preparation and command rules |
| Airfields and carrier decks | Immediate choice and whose AP it spends | Readiness, service, fuel and action timing | Full runway/deck rules and accounting |
| Night drops and The War | Required objective and essential scatter, loss, terrain or AA danger | Distances, timing and scoring context | Exact dice and complete scoring rules |
| Results and debriefs | Result, losses/survivors/extraction and operation progress | Relevant activity and tactical highlights | Complete battle record |
| Empires Home, menu, orders, inspection and learning | Current city or unit decision and short map meaning | Costs, production timing, Rush timing, yields and tradeoffs | Full city/unit/hex statistics and disclosures |

Turn, mission, AP, resource costs, danger warnings and unavailable-order reasons
remain accessible throughout. Full rules are available through disclosures in
Simple and Moderate. Routine state refreshes preserve a player's manual
disclosure choice; an explicit level change applies that level's defaults.

## Shared controls and independent preferences

`ww2Experience` supplies the canonical labels, summaries and descriptions.
Delegated change handling supports selectors created inside dialogs. Home,
in-battle navigation, setup, Journey, mission/result dialogs and Empires stay in
sync. The battle View & help button and the Empires menu show the active level.

The existing version-2 `ww2-play-preferences` format and migration behavior are
retained. Experience does not change layout, artwork, terrain detail or Dad
mode. Existing choices are not reset.

DSL tutorial consent uses `ww2-coaching-preferences-v1`, independently of
Experience and existing `ww2-learning-v2` lesson progress. Simple's compact
prompt does not automatically open a modal. Ignore tutorial is an explicit,
persistent opt-out; Resume tutorial reverses it. Closing the coach is temporary.
Completed lessons lead back to contextual guidance. Storage failure retains the
choice in page memory. Empires keeps its existing independent tutorial consent.

## Safe teaching boundaries

Guidance uses public state and the game's existing legal-action results. It
does not infer concealed enemies or forecast visibility from a hypothetical
position. Required paratrooper, consecutive-hold, relay and extraction conditions
remain explicit where applicable.

Inspect a hex captures a read-only tap; dragging still pans. It preserves the
selected unit, pending target, attack/smoke/barrage mode and map position. Show me
must not call the game's action-aware unit selection while targeting is pending.
In that situation the coach asks the player to finish or cancel that choice.

Cooperative text distinguishes waiting, watching, computer resolution and a
finished teammate from an actionable turn. Only the captain is described as
controlling shared preparation resources. Finishing a commander's preparation
does not imply that they alone lock the whole army's plan.

## Verification

The focused checks use disposable local games and databases:

- `ww2-experience-browser.cjs`: preference migration, catalogs and filters,
  storage fallback, dimensions, camera, selection, targeting, fog and legal
  orders across the three levels.
- `ww2-experience-site-browser.cjs`: actual shared selectors across Home, Solo,
  Journey, solo rematch and Empires; no gameplay POSTs from level changes;
  unchanged creation choices and exact live state; phone, landscape and desktop.
- `ww2-experience-missions-browser.cjs`: all three Greybridge and general mission
  views, required win conditions, manual disclosure stability and debrief depth.
- `ww2-experience-guidance-browser.cjs`: default prompt, close versus Ignore,
  reload and Resume, completed lessons, blocked storage, specialist prose and
  safe map inspection/targeting with unchanged state and zero action POSTs.
- `ww2-cooperative-browser.cjs`: real cooperative flow plus level changes in
  the command room and noncaptain preparation without changing assignments,
  battle state or command authority.
- `ww2-greybridge-browser.cjs`: real raid/sabotage/extraction, both finales,
  operation history, guest/signed checkpoint forks and recovery in a new browser.
- `empires-experience-dom.cjs`, `empires-learning-dom.cjs` and
  `empires-experience-depth-dom.cjs`: independent preferences and tutorial
  consent, current-decision cards, timing, all levels and stable campaign state.
- `ww2-specialist-experience-dom.cjs`: carrier, airfield, night-drop and
  scoring presentations without altered capabilities or gameplay state.

Changed JavaScript is syntax-checked and the diff checked for whitespace
errors. Chromium screenshots are reviewed for phone and desktop clipping and
overlap. Mobile automation includes touch events; it is not a physical
Safari/iPhone playtest and does not establish first-time-player comprehension.
After publication, verify the deployed commit, health endpoint and shared
controls on the live site separately from these local checks.
