# Pocket Gridiron

An original mobile-first, top-down pixel football game in DailyFlyer. Seven players per side, all 32 teams, real active player names and numbers. Original procedural pixel graphics and sound; no paid API or asset services.

Play at `/gridiron/` or set `DEFAULT_THEME=pocket_gridiron` to make it the default theme. Existing theme behavior is preserved. `/?theme=pocket-gridiron` also works.

## Play

Choose a team and opponent, then call a run or pass. Touch joystick moves; A/B/C pass to the labeled receivers; burst boosts a runner with one evasion opportunity. On defense, switch to the nearest defender and dive to tackle. WASD/arrows, space, 1/2/3, P work on desktop.

Four 45-second quarters, a live-play clock, first downs, turnovers, safeties, punts and field goals on fourth down. Touchdowns include an automatic PAT. Interceptions are dead at the catch. Halftime gives the opponent the ball. Ties use sudden-death overtime. Solo against AI; multiplayer and franchise mode are not included.

## Rosters

Bundled snapshot: 2026, fetched November 1, 2026. 1,702 active players. Source: https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv

The locker room supports starter changes and manual refresh. After 24 hours the page attempts refresh on load. `/gridiron/api/roster` fetches the fixed current-season nflverse CSV on demand and caches it for one hour. The browser validates all 32 teams before replacing the working snapshot, persists accepted updates when local storage is available, and retains a clear fetched timestamp. A running match keeps its starting rosters. No unattended scheduled job is required.

Active-roster status is not the official depth chart or game-day availability. Default lineups and player ratings are custom arcade choices; they are not licensed NFL/Madden ratings. All source data is separate from gameplay code. Logos, likenesses, and Tecmo assets are not used.

Rebuild the bundled snapshot:

```sh
python scripts/refresh_gridiron_rosters.py --season 2026
```

## Checks

```sh
python -m unittest discover -s tests -p 'test_pocket_gridiron.py'
node --test tests/gridiron/game.test.mjs
```

## Render

New service on branch `feat/pocket-gridiron`, repository root, build `pip install -r requirements.txt`, start `gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60`, environment `DEFAULT_THEME=pocket_gridiron`. No database, disk, or roster API key required.
