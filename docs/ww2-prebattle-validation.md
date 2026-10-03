# Pre-battle release validation — 2026-10-03

Production baseline: `cc9ca19984685c8e3980e394bf7fabadceae2e0d`.

Final Python gate: **358 tests passed in 136.853 seconds**, including 14 new
preparation tests. Command: `python -m unittest discover -s tests -p 'test_ww2*.py'`.
Earlier failures were fixture assumptions: combat tests needed to lock setup on
new maps, and the lobby's exact public-field whitelist needed the new phase
string. The final complete run passed after those explicit fixture updates.

Nine browser suites passed with Chromium 134 using the existing Playwright
runner and temporary local SQLite databases:

- deployment: actual setup controls, both maps/armies, private plans, placement,
  removal, lock, reconnect/resume, Experience levels, phone/desktop layouts,
  unchanged map size, restored movement/unloading and specialist image loading;
- experience: all three detail levels, map categories, sorting and layout
  preservation, with the catalog updated to 22 maps;
- new-fronts: Kharkov, Relay Crossing, Dunkirk, Observe, supply, evacuation and
  shared help controls;
- front-replay: actual mission progress in recorded frames;
- fubar: all-domain gameplay and display;
- retained-map: actual public counters and exact fog across refreshed snapshots;
- playback: recorded combat/dice, replay/reload, no replay POSTs or state changes;
- replay-transport: request-scoped replay acknowledgement and read-only recovery;
- map-performance: live AP/position correctness, retained terrain, bounded SVG,
  exact fog, stable camera/viewport, no redundant full GET after a successful
  order, and real touch pinch/pan.

The separate legacy `ww2-dad-mode-browser.cjs` suite still fails at line 32:
some unclipped action buttons report 72-pixel client height against a 76-pixel
minimum assertion. Running the identical suite from an isolated, untouched
`cc9ca19` checkout reproduced the same values and failure. This release does not
claim that suite passes or fix its pre-existing sizing/test expectation. The new
radio's actual on-map atlas loads, and all nine production portrait sprites were
visually inspected separately, including their transparent clipping and labels.

The new browser harness initially exposed a preparation-panel mobile grid
conflict; the phase-specific grid now reserves space for preparation controls.
Reload tests explicitly use the existing saved-battle shortcut, since Home is
the intended entry after reload. Artwork QA uses a separate preview document;
the application's Content Security Policy remains unchanged.

The final large-map run used a 4× CPU throttle. Measured move completion was
approximately 385 ms on the phone viewport and 311 ms on desktop; these are
local Chromium timings, not Render or physical-iPhone measurements and not a
claim of improved latency. Prior replay compaction, request-local visibility
work and retained-render behavior remain in place.

No production database, current matches, Render configuration, or unrelated
theme was modified during verification. Human balance and physical-iPhone
performance remain unverified. See `ww2-prebattle.md` for rules and compatibility.
