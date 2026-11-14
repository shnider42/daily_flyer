# SKYBREAK

An original ten-player third-person island battle royale in DailyFlyer. Drop onto Breakwater Island, scavenge four weapon families, build cover, and outlast the closing storm. Empty seats are computer players. Original procedural scenery, characters, effects, and audio; no Fortnite assets or branding.

**Play:** https://dfe-skybreak.onrender.com/

## Run

Requires Node 22 or newer. All dependencies and browser assets are vendored with licenses. No package installation or external CDN is needed.

```sh
node games/skybreak/server.mjs
```

Open `http://localhost:3000`. `PORT` changes the listener. The server binds to `0.0.0.0`.

```sh
node --test games/skybreak/tests/*.test.mjs
```

A self-contained local solo preview can be generated without a server:

```sh
python3 games/skybreak/build_preview.py /tmp/Skybreak-Preview.html
```

Open the resulting file in a WebGL-capable desktop browser. It embeds the font, styles, Three.js, simulation, island, sound, and controls. Its menu exposes solo play; online rooms require the normal server.

## Play

**Solo + bots** immediately starts a local match with nine computer opponents. **Host friends** creates a private six-character room code and invite link; the host starts when ready. **Quick match** joins an available public lobby or creates one, then starts after twelve seconds. Matches have ten contenders, with up to ten humans. New players enter lobbies; an ongoing match only accepts reconnects to existing seats.

The opening glider descent has a thirteen-second ceasefire. Everyone starts with an assault rifle, 50 shield, materials, a medkit, and shield cells. Weapons have five rarity levels. Each wall or ramp costs ten materials. Salvage nearby trees, rocks, and supply crates, or collect material pickups. Built structures can be destroyed. Launch pads redeploy the glider. The storm shifts and contracts until the match ends.

### Controls

| Action | Desktop |
| --- | --- |
| Move / look | WASD / mouse |
| Shoot / aim | Left / right mouse |
| Sprint / jump | Shift / Space |
| Pick up / reload | E / R |
| Change weapon | 1–4 / wheel |
| Wall / ramp | Q / C |
| Salvage materials | F |
| Medkit / shield cell | H / J |
| Island map / menu | M or Tab / Esc |

Touch uses a left movement stick, right look region, and separate fire, aim, jump, reload, interaction, and sprint controls. Equipment buttons also work by touch. Landscape is recommended. Standard controllers use left/right sticks, RT fire, LT aim, A jump, X reload, Y interact, B wall, LB/RB weapon change, left-stick click sprint, and D-pad consumables/salvage/ramp. Graphics, difficulty, sensitivity, volume, aim assist, and inversion are adjustable.

## Architecture

- `public/world.mjs`: one geometry source for terrain, buildings, collision, loot, roads, and landmarks.
- `public/engine.mjs`: shared authoritative simulation; client prediction reuses the movement routine.
- `public/renderer.mjs`: Three.js island, characters, lighting, water, weather boundary, weapon/loot models, camera collision, and effects.
- `public/client.mjs`: menus, control schemes, prediction/interpolation, HUD, map, reconnect, and results.
- `public/audio.mjs`: synthesized positional sounds and coastal ambience, activated by a user gesture.
- `server.mjs`: static HTTP assets plus same-origin WebSocket matchmaking and thirty-Hz simulation; snapshots are fifteen Hz with compression.

Clients submit bounded input intent. The server owns position, hits, ammunition, pickups, building, storm, and winner state. It rejects duplicate sequences and commands from older matches. Movement expires after 400 ms without input. Reconnect tokens hold a seat for two minutes; host departure does not stop a match. Tokens do not appear in broadcasts. The server bounds room counts, payloads, action rates, entity counts, and network queues.

Rooms live in the memory of a single server instance. A deploy or server restart ends those rooms. Horizontal scaling would require shared room routing/state. No accounts, analytics scripts, player chat, or database are used. Device storage holds settings; tab session storage holds the temporary reconnect credential. Hosting infrastructure may retain its normal operational access logs.

## Render

- Repository: `shnider42/daily_flyer`
- Branch: `feat/skybreak-royale`
- Runtime: Node
- Build: `node --test games/skybreak/tests/*.test.mjs`
- Start: `node games/skybreak/server.mjs`
- Region: Virginia
- Health endpoint: `/health`
- One instance; frontend and WebSocket share the same origin.

The automated suite exercises complete bot rounds, movement/door/roof/ramp geometry, weapon and inventory rules, camera/muzzle aiming, storm, ten real WebSocket clients, an eleventh-player rejection, reconnect/host migration, snapshot cadence, stale input, protocol bounds, and static-file boundaries. Live deployment checks verified HTTP assets, ten simultaneous WebSocket clients, one shared match, an eleventh-player rejection, ammunition consumption, and reconnection preserving the same player, match, health, shields and ammunition.

A separate runtime audit exercised actual Three.js scene construction, camera math, effects, geometry and eight restarts with GPU drawing stubbed; it found no runtime errors, invalid transforms or accumulating scene objects. The available cloud browser has WebGL disabled and correctly displays the compatibility notice. Actual browser shader compilation, visual appearance, controller feel and device frame rates remain to be verified on a WebGL-capable device.
