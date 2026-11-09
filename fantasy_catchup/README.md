# Roster Radar — DailyFlyer Fantasy Catch Up

Small, independent NFL fantasy companion. Node 22+; no runtime packages or AI API key.

Run `node fantasy_catchup/server.mjs`. Bind address is `0.0.0.0`; `PORT` defaults to 3000.
Run tests with `node --test fantasy_catchup/tests/*.test.mjs`.

## Data path

`lib/providers.mjs` fetches and validates ESPN NFL news/schedules and documented Sleeper NFL state, player directory, and trending adds. Published source links and timestamps remain visible. News summaries are rule-based interpretation prompts; headlines are attributed and linked. There are no player projections, simulated news, paid AI requests, automated transactions, or MCP endpoints.

The service checks due sources at startup, on briefing requests, and once per minute while awake. Individual TTLs: news/schedule 15 minutes, trends 30 minutes, NFL state 1 hour, players 24 hours. One refresh is shared across concurrent requests; failed sources retain last successful timestamps and data, with a one-minute retry backoff. The player directory is for identity and daily status context; it is not a real-time injury feed.

The server retains up to 350 observed news reports for seven days by article update time, merges revisions by source ID, and keeps their original publication and update timestamps. `newsCoverage` reports the actual oldest/latest publication and retained count; it does not imply continuous or complete coverage. Invalid or future publication dates are excluded, and invalid update timestamps fall back to the publication date. Player matching uses ESPN athlete IDs or normalized full names with word boundaries.

Schedule snapshots are checked against the current season, week, and season type. A week transition refreshes the matching schedule without waiting for the old schedule TTL; a mismatched snapshot is withheld while that request is pending or unavailable. Bye teams come from ESPN's explicit bye list. `schedule.complete` confirms that scheduled and bye teams account for all 32 NFL teams, preventing a partial feed from inventing byes.

The server keeps an atomic runtime cache and a dated seed fallback, refreshed November 9, 2026. Render free instances can sleep and lose runtime disk state; cold starts use the seed then fetch overdue sources. Retained reports can have gaps while the service is asleep, and a lost runtime cache also loses reports not present in the seed or current feed. The site automatically catches up on opening. Per-instance TTL caches reset after cache loss. Before commercial operation, use durable shared caching and arrange applicable provider licensing (Sleeper API documentation specifies noncommercial use).

## Personalization

Watchlist, league settings, imported league snapshot, selected roster, and catch-up baseline live in browser localStorage. A checkpoint only changes when the visitor chooses “Mark caught up,” which also selects and persists the “Since I caught up” window for the next visit. Baseline status diffs are limited to tracked player directory fields. News coverage is limited to the source reports actually observed and retained; the UI discloses the earliest included report and possible gaps.

Optional read-only Sleeper import accepts a numeric league ID or league URL. Server endpoints only call fixed upstream hosts; IDs are validated. Imports are bounded by concurrency and a 30-league, five-minute cache. Complete roster counts, unique roster IDs, and player/reserve/taxi lists are validated before returning a snapshot. The import does not authenticate ownership, and cannot submit lineup changes or transactions. Availability filters turn off if the saved league snapshot is older than 15 minutes. Private user credentials are never requested.

Supported explanation settings: standard/half/full-PPR (or imported custom), redraft/keeper/dynasty, one-QB/superflex/two-QB, league size, FAAB/priority, managed/best ball. Actual keeper costs, detailed custom scoring, IDP, snap counts, routes, FAAB bids and exact waiver deadlines are outside this first version.

## Interface

The November 9 desk redesign uses compact navigation, a full-week score strip, chronological reports with scope/category filters, and player/waiver tables. Global player search opens from the top navigation at every screen size. General league guidance lives in optional report/player details; Simple, Moderate, and Expert remain available. Dark mode is the default, and existing light-mode preferences are retained. All previous `rr.*` storage keys are preserved and validated. Styles, scripts, and the logic import are versioned together for cache-safe releases.

## Deployment

Separate branch `feat/fantasy-catch-up` and Render service `dfe-fantasy-catch-up`; leaves existing NFL Catch Up untouched. Build command: `node --test fantasy_catchup/tests/*.test.mjs`. Start command: `node fantasy_catchup/server.mjs`. Free plan, Virginia. `/health` is a fast side-effect-free health endpoint. Source directory is `fantasy_catchup`.
