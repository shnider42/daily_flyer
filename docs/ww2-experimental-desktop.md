# Experimental desktop battle layout

Choose **View → Simple view: experimental**. At desktop widths (1100 CSS pixels and up), the live DSL battle uses the entire window. Below that breakpoint, the existing experimental phone/tablet presentation still applies.

- Turn, round and the scenario's win condition stay at the top. The mission button opens the full victory rules and sector navigation.
- The map spans the full width. Existing scroll zoom, drag, keyboard camera, Find selected and Fit map controls remain active.
- The bottom command bar uses the actual order buttons, including unavailable actions and their explanations. The army's maximum role capacity reserves space before selecting a unit, so selecting a commander or engineer cannot shift the map. Dad mode increases the button and text sizes.
- Units opens the platoon/roster dialog. Selecting a unit closes it and reveals that unit on the map. Unit details opens existing status, role, mechanics and shot information.
- Home and View stay at the top left in every battle layout. View holds the shared display preferences, guest learning guide and field manual. Battle holds invitations, saves, resign/rematch, outcomes, warnings and logs. Important public warnings also appear as a small map notice. Waiting/finished/rematch transitions open this dialog automatically.
- Computer replay uses the same reserved command-bar area. Orders stay disabled until replay ends.

`experimental-desktop.js` reparents live controls using reversible anchors. It restores them before desktop/mobile changes, ordinary display modes, or returning home. There are no gameplay, legality, fog or save-format changes. Guest learning's Show me opens the appropriate dialog or display menu.

`tests/ww2-experimental-desktop-browser.cjs` checks unit-role action coverage, text fit, stable map geometry, normal and Dad sizes, land/naval/air scenarios, tooltips, dialogs, mode/viewport round trips, real movement, undo/redo when legal, computer replay and home navigation. Run with the same Playwright/browser setup as the other UI suites. The compact-desktop and signals suites additionally cover the normal and phone layouts.

The shared `battle-navigation.js` owns Home, View, and one persistent preferences dialog. Desktop and mobile layouts no longer reparent the preferences themselves. The navigation pair moves to the active header, retaining its labels and order; opening View does not reflow or pan the map. Phone portrait uses a second row for the mission and undo/redo, while short landscape windows use one row. Guest-only learning remains gated by commander login.

`tests/ww2-navigation-browser.cjs` covers 320px touch through wide desktop, all three display modes, stable camera geometry, keyboard/backdrop dismissal, touch target sizes, Dad mode, resizing with View open, returning home, resuming the same battle, and persisted preferences.
