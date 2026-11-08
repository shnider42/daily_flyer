# Vineyard Table implementation contract

Independent Viticulture-inspired DailyFlyer game. Original art and visitor cards;
core Essential Edition seasons, workers, planting, storage and wine rules. Uniform
starting estates replace Mama/Papa cards. Solo uses strategic opponents, not Automa.

## Rules engine (`server/vineyard/engine.mjs`)

Named exports: `createGame({players, target=20, seed})`,
`legalActions(state, playerId)`, `applyAction(state, playerId, key)`,
`publicView(state, playerId)`, `chooseBotAction(state, playerId)`.
Player definitions are `{id,name,bot}`. Support 2–6 total seats (humans + bots).
`applyAction` returns a new serializable state; throws on invalid actions and never
mutates the supplied state on rejection. Internal state includes `version`,
`status`, `activePlayerId`, and `players`; bots are indicated by `.bot`.

Public view shape:

```js
{
  version: 1, status: 'playing', phase: 'spring', year: 1, target: 20,
  activePlayerId: 'p1', finalYear: false,
  players: [{
    id, name, color, bot, coins, score, income, wake, passed,
    workers: {available: 2, grandeAvailable: true, total: 3, pending: 0},
    fields: [{id: 0, capacity: 5, sold: false, vines: [], harvested: false}],
    grapes: {red: [], white: []},
    wines: {red: [], white: [], blush: [], sparkling: []},
    structures: [], cellar: 3,
    handCounts: {vines: 2, orders: 1, summer: 1, winter: 1}
  }],
  you: {id, hand: {vines: [], orders: [], summer: [], winter: []}},
  board: [{id, title, season, description, icon, capacity, occupied: [{playerId, worker, bonus}], bonus}],
  legalActions: [{key, group, label, detail, worker: 'regular' /* or grande/null */}],
  wakeTrack: [{row: 1, bonus: 'First to act', playerId: null}],
  guide: {headline, body, recommendedKey, steps: [{label, done, detail}]},
  log: [{id, year, phase, text, playerId}],
  winnerIds: [], rankings: []
}
```

Wine cards use `id,name,red,white,requires`; orders use
`id,name,requirements:[{type,value}],points,income`; visitors use
`id,name,season,description`. No opponent hand contents, future draws, or PRNG state
may appear in publicView. Phases include `spring`, `summer`, `autumn`, `winter`,
`discard`, `finished`. Legal action group IDs match board IDs; other groups are
`wake`, `visitor`, `pass`, `discard`. Action options are complete validated choices.
The UI never invents an action or decides legality.

## HTTP (`server/vineyard/server.mjs`)

No external dependencies. Start with `node server/vineyard/server.mjs`, obey PORT
and bind 0.0.0.0. Serve `daily_flyer/themes/vineyard_assets` at `/`.
`GET /healthz` returns ready/build metadata.

All responses use `{room, game, recovery, ...}` where `game` is `publicView`,
`room` is `{code,status,hostId,youId,version,players:[{id,name,bot,connected}],target}`.
`recovery` is an opaque encrypted server snapshot safe to cache in localStorage.
Authenticated requests use `Authorization: Bearer <token>`.

- POST `/api/rooms` `{name,mode:'solo'|'online',bots:1,target:20}` -> response +
  `token`; solo starts immediately, online creates lobby.
- POST `/api/rooms/:code/join` `{name}` -> response + `token`.
- GET `/api/rooms/:code` (authenticated) -> latest personalized response.
- POST `/api/rooms/:code/start` (host) `{bots:1}` -> starts with humans plus bots.
- POST `/api/rooms/:code/action` `{key,version,requestId}` -> commit and personalized
  response; reject stale version with409. Same requestId must be idempotent.
- POST `/api/restore` `{recovery}` (authenticated) -> restore only missing room or
  return newer existing authoritative room, never roll back a live room.
- POST `/api/rooms/:code/rematch` (host) -> a new game preserving seats/tokens.
- GET `/api/rules` -> optional rules summary metadata.

Errors: non2xx `{error: 'Readable message', code: '...', ...}`.
Bots run server-side after human actions, bounded to stop at next human or finish.
Disk snapshots make process restarts survivable where disk remains. Browser recovery
uses a stable `ROOM_SECRET` supplied at deployment to survive ephemeral Render resets.
Room bearer tokens never go in URLs or public responses for other players. No new
paid persistence service is needed. Hosts may export the encrypted recovery backup.

## UI (`daily_flyer/themes/vineyard_assets`)

Root writes `app.js`. Visual owner writes `index.html`, `style.css`, and SVG assets.
Mobile first, portrait 428px and landscape, wide desktop. Night default, optional
day; original Tuscan vineyard at dusk palette: plum, parchment, sage, muted gold.
Use readable Georgia display + system body, no remote font/CDN dependency.
Root DOM: header with brand, settings/help buttons. `<main id="app"></main>`.
`<dialog id="sheet"><div id="sheet-content"></div></dialog>` and
`<div id="toast" role="status" aria-live="polite"></div>`.
App renders screens with classes agreed in messages. Everything playable by tap and
keyboard; action inspection precedes explicitly labeled Commit placement. Guidance
is a local persisted range0/1/2 Simple/Moderate/Expert, same rules for all seats.
Honor reduced motion; no audio before gesture; ambient toggle independent of guide.
