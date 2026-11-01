# Pocket Gridiron

An original mobile-first, top-down pixel football game in DailyFlyer. Seven players per side, all 32 teams, real active player names and numbers. Original procedural pixel graphics and sound; no paid API or asset services.

Play at `/gridiron/` or set `DEFAULT_THEME=pocket_gridiron` to make it the default theme. Existing theme behavior is preserved. `/?theme=pocket-gridiron` also works.

## Play

Choose a team and opponent, then call a run or pass. Touch joystick moves; A/B/C pass to the labeled receivers; burst boosts a runner with one evasion opportunity. On defense, switch to the nearest defender and dive to tackle. WASD/arrows, space, 1/2/3, P work on desktop.

On phones, gameplay fills the available viewport with a compact scoreboard, an adaptive field canvas, and fixed thumb controls. Landscape places controls beside the field. Play choices collapse after selection; Change Play reopens them, including fourth-down kicks. Sound and help remain available from Pause. Game surfaces consume browser touch gestures and buttons activate on contact without a duplicate click; scrolling and pinch zoom remain available in menus and dialogs.

Four 45-second quarters, a live-play clock, first downs, turnovers, safeties, punts and field goals on fourth down. Touchdowns include an automatic PAT. Interceptions are dead at the catch. Each half starts with a playable kickoff; the opponent receives the second-half kick. Touchdowns, field goals and safeties queue the correct kickoff or free kick, unless the game has ended. Ties use sudden-death overtime. Solo against AI; multiplayer and franchise mode are not included.

## Expanded playbook and special teams

Offense has seven calls: Inside Run, Wide Sweep, Quick Slants, Go Routes, Counter Left (pulling guard), Curl Hooks (receivers come back after 12 yards), and Boot Flood (right-side routes at three depths). Defense has six: Zone, Man, Blitz, Cover 2 (two deep halves), Cover 3 (three deep thirds), and Run Commit (four rushers, vulnerable downfield). CPU play selection uses the expanded book.

On fourth down, Punt starts a real kick sequence. The CPU chooses its own punts or field goals. Aim with the stick or A/B/C; tap START METER, then KICK to lock power. Space operates the meter on desktop; 1/2/3 aim left/center/right. More power adds distance, including the risk of a touchback; aiming too wide can send the kick out of bounds. The active roster supplies the punter/kicker when available.

For incoming kicks, tap READY TO RETURN. The returner automatically tracks the landing ring until you steer. B (keyboard 2) calls a fair catch on punts. On the catch, run upfield and burst; the kicking side controls coverage with Switch and Dive. Loose punts can roll or be downed, and loose kickoffs can be recovered. Returns start a fresh series or can score; return yards are tracked separately.

Simplified arcade rules: kickoff touchbacks at the 25, punt touchbacks at the 20, kickoff out of bounds at the 40. The clock runs during scrimmage plays and returns, and pauses during kick setup/flight. No onside-kick selection, blocked punts, or full NFL dynamic-kickoff enforcement. The camera widens for kicks and eases back for returns. All choices fit the phone playbook, which clears before action; the previous rapid-tap zoom protection remains in place.

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
node --test tests/gridiron/*.test.mjs
```

## Render

New service on branch `feat/pocket-gridiron`, repository root, build `pip install -r requirements.txt`, start `gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60`, environment `DEFAULT_THEME=pocket_gridiron`. No database, disk, or roster API key required.
