# DSL move pipeline: replay payloads and retained rendering

## Scope and authority

Baseline: rollback commit `cde494de68d9a6aadb9196cb0ad2934281f008a5`, whose tracked files match `484731be8f1ed12157c6c58239de01c30b5fe7ed`.

This patch does not reinstate the reverted server visibility algorithm or provisional movement preview. Movement, AP, dice, fog, reactions, revision checks and persistence remain server-authoritative after every order. There is no turn-end batching, no automatic POST retry, no change to Render settings and no database schema migration.

Unit selection already happens in the browser. An order goes to the server, is validated and persisted, and its public response is rendered. A full computer turn is run at the end of the human turn, not after every friendly move. Immediate reactions such as overwatch still occur during movement. Deferring validation for a whole turn would require reconciling later actions after an earlier hidden contact or reaction changed the outcome; that is not needed to remove the measured duplicate work.

## Confirmed repeated work

The previous computer replay remained in the current game state and was copied into each undo snapshot. Ordinary orders repeatedly decoded, copied, serialized and transmitted this unchanged movie. This code was present in the rollback baseline too. A large movie therefore affected later friendly orders, even though those orders did not change the movie.

The browser retained static terrain but rebuilt unit counters and fog polygons for fresh snapshots. Fubar also performed repeated synchronous geometry reads to position its layer controls. In the measured initial view, Fubar had 5,122 SVG descendants versus 457 for Village Crossing. These are view-specific counts, not fixed map specifications.

## Changes

- Keep the last computer movie once at the state root, outside per-order engine copies and undo/redo snapshots. Normalize legacy duplicated journal entries without mutating their input. Preserve the exact movie through takebacks; a newly generated computer turn replaces it normally.
- Let the browser acknowledge the movie it already holds with `X-WW2-Replay`. The identity includes match, side, battle number and movie ID. Only a matching acknowledgement omits the movie from that response. All live gameplay fields are still returned. Old clients, new browsers, reconnects and new movies receive the full movie.
- Rehydrate an acknowledged movie from the exact request's captured state, not a later global state. An unexpected acknowledgement triggers only a full GET; a move or dice-rolling POST is never repeated automatically.
- Reconcile counters by ID and complete public unit content. Remove disappeared counters immediately and recreate changed counters; retain unchanged cards and their artwork. Reconcile fog polygons against every cell in the authoritative public visibility footprint, including air/surface and platoon views.
- Coalesce Fubar layer-control positioning into one animation-frame callback. Let ResizeObserver handle artwork resizing; separately handle a viewBox-only change after rendering.

## Controlled measurements

These are development comparisons, not guarantees about Render load, network latency, physical iPhone input latency or future uptime.

### Local replay-heavy order reproduction

Python 3.13 / Flask test client, isolated SQLite database, Fubar DSL. The replay fixture has 20 synthetic contact frames using real public Fubar snapshots. Five successive legal dig-in orders are measured; these timings must not be described as a live-network movement benchmark. Timing samples exclude cProfile. Responses include an acknowledgement on the patched client only after the full movie has been received.

| Measurement | Rollback baseline | Patched |
| --- | ---: | ---: |
| Median local order request | 681.30 ms | 373.46 ms |
| Median response bytes | 1,226,744 | 168,310 |
| Serialized saved-state bytes after five orders | 7,763,512 | 1,568,192 |

That is approximately 45% lower local request time, 86% fewer response bytes and 80% less serialized state after five orders in this fixture. Without a replay, Fubar's local requests remained around 0.32–0.35 seconds: this patch does not claim to eliminate the remaining legal-action and visibility computation. Village Crossing remained around 2–3 ms in the same local test.

### Browser comparison

GitHub Actions run `37044079108`, Chromium 153, 390×844 touch viewport, 4× CPU throttling. Baseline and patch run on the same runner. `tests/ww2-move-pipeline-benchmark.cjs` measures 16 selections, discards four warm-ups, and also measures five fresh equivalent snapshots. Milliseconds below are medians.

| Map / operation | Baseline JavaScript | Patched JavaScript | Baseline two-frame sample | Patched two-frame sample |
| --- | ---: | ---: | ---: | ---: |
| Village selection | 10.8 | 10.4 | 33.4 | 33.3 |
| Fubar selection | 95.7 | 34.5 | 213.3 | 96.3 |
| Village fresh snapshot render | 17.5 | 9.0 | 32.3 | 32.3 |
| Fubar fresh snapshot render | 88.5 | 28.6 | 200.9 | 78.4 |

The two-frame sample includes browser scheduling/rendering and is not a measurement of physical screen presentation. Large-map work remains; this is not an instantaneous-movement promise.

## Validation and provenance

The tested runtime was committed on the isolated branch as `5860525109024ebf807cce6ec8a0965620af9017`. Diagnostic workflows and their patch-generation script are deliberately excluded from the production commit.

- Run `37042921404`: all 324 DSL Python tests passed, including 15 new replay/journal/transport tests. Existing concurrency, stale revisions, rollback-on-response-failure, fog, dice, takeback, save/restore and map tests passed. Its browser step passed the request adapter, retained-map, Fubar, Tidal Gate performance and Experience tests; the older playback harness initially failed because it expected the home page to auto-resume a stored battle.
- The harness was corrected to click its saved battle explicitly; all recorded-die, strength, pin, zero-POST and unchanged-server-state assertions were retained. It passed on both the unchanged rollback runtime and the patch in run `37044079108`.
- Run `37044079108` verified unchanged runtime inputs, Python tests and patch script against the earlier Python-passing run, checked all six modified runtime blob hashes, reran all 15 new Python tests, and passed the complete browser set plus before/after benchmarks. The runtime commit was created only after these checks passed.
- Actual browser checks cover phone/desktop Fubar, all layouts, real cross-layer movement, stack selection, exact public units and fog, removal/reappearance, stable camera, orders, resume, Tidal Gate movement, effects cleanup, view preferences and playback.
- A separate local old-versus-new comparison matched 36 resulting orders across Village, Long Reach and Fubar after normalizing only the removed duplicate replay fields in journals.

Useful commands: `python -m unittest discover -s tests -p 'test_ww2*.py'`; `node tests/ww2-replay-transport.cjs`; `node tests/ww2-retained-map-browser.cjs`; `node tests/ww2-fubar-browser.cjs`; `node tests/ww2-map-performance-browser.cjs`; `node tests/ww2-experience-browser.cjs`; `node tests/ww2-playback-browser.cjs`. Set `CHROMIUM_EXECUTABLE_PATH` for browser scripts. Run the benchmark on baseline and patched checkouts with their own isolated server/database.

## Deployment and recovery notes

Refresh the browser after deployment and resume the existing battle; no game reset is required. A legacy replay-heavy journal is compacted on the next accepted order. Initial/reconnected clients still receive the complete movie, so the first load is not expected to have the same reduced payload as subsequent acknowledged orders.

No evidence here conclusively identifies the earlier 502's root cause. Removing duplicate replay state reduces a demonstrated source of allocation and transfer work, but successful tests or health checks do not guarantee that a later large-map playtest cannot fail.

For a future code rollback, preserve a game checkpoint first. Pre-patch code can read the state schema, but its old undo implementation does not reattach the root movie to the new compact snapshots; undo under that old implementation can drop the replay from that result. The new implementation preserves legacy saves and replay across takebacks without adding a new database schema.
