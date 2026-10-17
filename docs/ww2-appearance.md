# DSL site appearance

Built from deployed DSL commit `3b8ccbc` on `feat/ww2-tactics`.

Night mode is the default. The Night mode button in the home/console header
switches back to the original daylight palette. During battles the same control
lives under **View → Display**. The browser remembers the choice using
`ww2-appearance` (`dark` or `light`); changes synchronize across tabs. If browser
storage is blocked, the control still works for the current page.

`appearance.js` runs before styles load to apply the saved preference without a
daylight flash. `appearance.css` loads after the existing component styles and
scopes the night palette to `html[data-theme=dark]`. Home, lobby, co-op command
room, dialogs, battle menus, both desktop layouts, phone panels, reports and the
operations console share the palette. Tactical orders retain their distinct
action families; unavailable reasons remain readable.

The theme does not change SVG terrain, ownership, selected units, movement,
targeting, fog, map camera, unit art or game rules. The battlefield deliberately
keeps its existing palette. The theme controller does not call the game API or
render the map.

## Verification

- 38 existing Python tests: lobby, scenario browser, editions and administration.
- `node tests/ww2-appearance-browser.cjs`: real local browser checks for dark
  surfaces/text contrast, 320–1440px home views, dialogs, admin, co-op screens,
  persistence, cross-tab sync, blocked storage, both desktop layouts and mobile.
  Village Crossing, Midway 2.0 and Battle of Britain 2.0 compare actual SVG
  fill/stroke/opacity/filter values and game state before/after theme changes.
- `node tests/ww2-navigation-browser.cjs`: existing navigation, camera, touch,
  keyboard, Dad mode, layout changes, Home/resume and reload regression.
  Its navigation assertions now inspect visible buttons; the deployed UI already
  contains a hidden Team orders control for shared battles.

Set `CHROMIUM_EXECUTABLE_PATH` when a browser is not installed in Playwright's
default location. Tests use disposable local databases and do not touch live games.
