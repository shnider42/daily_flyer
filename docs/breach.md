# BREACH — Blacksite 07

An original retro first-person game built on DailyFlyer. Single player; all
movement, combat, sound, rendering, and saves run in the browser.

## Run and publish

Requires Python 3.10+ to build. The static build uses only the standard library;
no npm or pip install is needed. Three.js 0.180.0 is vendored with its MIT license.

```sh
python scripts/build_breach.py
python -m http.server 8000 --directory dist_breach
```

The first command loads and validates the `breach` DFE theme and uses DFE's HTML
renderer. It exports the generated document and assets into `dist_breach`.
Open `http://localhost:8000` in a browser. A file:// URL is not suitable for ES modules.

For the existing Flask application, install `requirements.txt` and use
`DEFAULT_THEME=breach` or `/?theme=breach`. The exact same source assets are served
through DFE's existing `/daily_flyer/` route.

Render Static Site settings:

- Repository: `shnider42/daily_flyer`
- Branch: `feat/breach-fps`
- Build: `python3 scripts/build_breach.py`
- Publish directory: `dist_breach`
- Environment: `SKIP_INSTALL_DEPS=true`
- Automatic deployment: on commit

## Play

Restore auxiliary power, recover the security key, and reach extraction. Explore
for supplies and an optional secret. The power station creates a checkpoint.
Guidance level and combat difficulty are separate settings.

Desktop uses WASD movement, mouse look (or click-and-drag when pointer lock is
unavailable), firing, E interaction, and the pause menu. The game displays its
current control bindings. Touch uses the left movement pad and right-side aiming;
the fire control accepts dragging so moving, aiming, and firing work with two thumbs.

Saves and preferences are browser-local and do not sync between devices. Clearing
website data clears progress. Private browsing or blocked storage may prevent
persistence; gameplay continues without requiring storage. The game pauses when
the page loses focus or becomes hidden.

## Validation

```sh
node tests/breach-core.test.mjs
python -m unittest discover -s tests -p test_breach_export.py
```

Release checks completed on 2026-10-29:

- **18 core tests passed:** mission routing and gates, movement and collisions,
  weapon damage, projectile and enemy behavior, secrets, checkpoints, save
  validation, and persistence of the active run's difficulty. The complete route
  test disables enemies to isolate navigation; a separate live-combat test clears
  the first three enemies using normal standard-difficulty pistol damage.
- **3 export tests passed:** DFE theme integration, complete local resources and
  module imports, and preservation of ordinary DFE card rendering.
- Flask route checks passed for the game document and its assets.
- Cloud browser checks exercised movement, firing, saving, and resuming with the
  Canvas fallback renderer. WebGL was unavailable in that QA browser, so the
  WebGL rendering path remains unverified there.

Physical iPhone play has not yet been tested. Touch aiming, simultaneous controls,
and sustained device performance still need that check. The broader legacy
`test_theme_platform` suite has three pre-existing failures on the base branch;
the focused BREACH suites above pass.

## Scope

This first release contains one authored mission, two weapons, three enemy roles,
power/key progression, a secret, a checkpoint, and a results screen. It has no
multiplayer, shared leaderboard, accounts, or procedural campaign. Those features
would require separate design and validation.

The renderer, textures, enemy artwork, interface, and synthesized sounds are
original project code. Three.js is distributed under `vendor/THREE-LICENSE.txt`.
No original Doom game assets are included.
