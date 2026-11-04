# Roster Radar — DailyFlyer Fantasy Catch Up

Small, independent NFL fantasy companion. Node 22+; no runtime packages or AI API key.

Run `node fantasy_catchup/server.mjs`. Bind address is `0.0.0.0`; `PORT` defaults to 3000.
Run tests with `node --test fantasy_catchup/tests/*.test.mjs`.

## Data path

`lib/providers.mjs` fetches and validates ESPN NFL news/schedules and documented Sleeper NFL state, player directory, and trending adds. Published source links and timestamps remain visible. News summaries are rule-based interpretation prompts; headlines are attributed and linked. There are no player projections, simulated news, paid AI requests, automated transactions, or MCP endpoints.

The service checks due sources at startup, on briefing requests, and once per minute while awake. Individual TTLs: news/schedule 15 minutes, trends 30 minutes, NFL state 1 hour, players 24 hours. One refresh is shared across concurrent requests; failed sources retain last successful timestamps and data, with a one-minute retry backoff. The player directory is for identity and daily status context; it is not a real-time injury feed.

The server keeps bounded current snapshots, with an atomic runtime cache and a dated seed fallback. Render free instances can sleep and lose runtime disk state; cold starts use the seed then fetch overdue sources. No unattended refresh can run while that free instance is asleep. The site automatically catches up on opening. Per-instance TTL caches reset after cache loss. Before commercial operation, use durable shared caching and arrange applicable provider licensing (Sleeper API documentation specifies noncommercial use).

## Personalization

Watchlist, league settings, imported league snapshot, selected roster, and catch-up baseline live in browser localStorage. A checkpoint only changes when the visitor chooses “Mark me caught up.” Baseline status diffs are limited to tracked player directory fields. News coverage is limited to the latest provider feed; the UI discloses the earliest included report.

Optional read-only Sleeper import accepts a numeric league ID or league URL. Server endpoints only call fixed upstream hosts; IDs are validated. Imports are bounded by concurrency and a 30-league, five-minute cache. The import does not authenticate ownership, and cannot submit lineup changes or transactions. Availability filters turn off if the saved league snapshot is older than 15 minutes. Private user credentials are never requested.

Supported explanation settings: standard/half/full-PPR (or imported custom), redraft/keeper/dynasty, one-QB/superflex/two-QB, league size, FAAB/priority, managed/best ball. Actual keeper costs, detailed custom scoring, IDP, snap counts, routes, FAAB bids and exact waiver deadlines are outside this first version.

## Hosting

Separate branch `feat/fantasy-catch-up` and Render service `dfe-fantasy-catch-up`; leaves existing NFL Catch Up untouched. Build command: `node --test fantasy_catchup/tests/*.test.mjs`. Start command: `node fantasy_catchup/server.mjs`. Free plan, Virginia. `/health` is a fast side-effect-free health endpoint. Source directory is `fantasy_catchup`.
