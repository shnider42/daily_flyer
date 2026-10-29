# Battlezone 1980 / DFE Arcade

Original browser tribute built from code-drawn vector geometry. No ROMs, game assets, remote APIs, accounts, or backend are required.

## DFE integration

`daily_flyer/themes/battlezone_1980.py` supplies a `PageContext` and `CardItem` through the existing custom theme hook. The existing DFE renderer embeds the theme CSS and the simulation, view, and controller. No shared engine files are changed.

Build the standalone page using Python 3.10+:

```sh
python3 scripts/build_battlezone.py
python3 -m http.server 8765 --directory dist_battlezone
```

This build uses only the Python standard library and DFE's models/renderer. The ordinary DFE CLI and Flask theme route also support `battlezone_1980` when the repository's usual dependencies are installed.

## Render

- Repository: `https://github.com/shnider42/daily_flyer`
- Branch: `feat/battlezone-1980`
- Type: Static Site
- Build command: `python3 scripts/build_battlezone.py`
- Publish directory: `dist_battlezone`
- Build environment: `SKIP_INSTALL_DEPS=true`
- No runtime secrets or database.

The browser recalculates the daily seed using the New York calendar date on page load and before each new run. An active run keeps its seed across midnight. Explicit date/seed overrides in the DFE builder stay fixed for replays. Best scores are browser-local and separated by mode, difficulty, and rules version.

## Arcade additions

- Flankers arrive in wave two, move around the player's side between shots, and award 1,250 points. Heavy tanks arrive in wave three, take two hits, and award 2,000.
- A low-hovering golden saucer can cross the sector from wave two onward. Hit it for 1,500 points; it never counts toward wave completion.
- Every second tank kill drops a cyan repair crate for 30 seconds. Drive into it to restore one hull point, up to three. At full hull it awards 500 points. At most two crates remain in the field.
- Shift or the Aim button slows hull rotation. Brackets identify an unobstructed target under the sight, without steering shots. Reload progress, hit confirmation, directional firing warnings, daily progress, and run statistics give feedback.
- WASD/arrows drive, Space fires, P/Escape pauses. Touch supports simultaneous steering and fire. Losing browser focus pauses the run. Sound is off by default; glow is optional and reduced-motion aware.

## Checks

```sh
node --test tests/battlezone_core.test.cjs
python3 -m unittest discover -s tests -p test_battlezone_theme.py
npm install --prefix /tmp/battlezone-test-deps --no-audit --no-fund jsdom@30.1.3
NODE_PATH=/tmp/battlezone-test-deps/node_modules node --test tests/battlezone_ui.test.cjs
```

UI tests exercise DOM/controller behavior with a canvas stub. They do not replace an actual browser playtest. The simulation tests cover seeded replay, movement, projectile occlusion, armor, bonuses, repairs, flanking, pause, aiming, reload, and daily completion.
