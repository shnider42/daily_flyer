# DSL move pipeline: replay payloads and retained rendering

## Current scale pipeline (October 2026)

The historical measurements below document the earlier replay-acknowledgement
patch. The current pipeline supersedes its synchronous AI, full-state delivery,
and rollback-on-response-failure contracts. It does not change gameplay rules
or the frozen Legacy scenario catalog.

- A browser sends one compact command with its revision and command identity.
  It can select, navigate and show a submitted-move marker locally. The server
  still validates movement, AP, ownership, fog-dependent legality and reactions,
  rolls dice, and commits the authoritative result. The browser never decides
  hidden contacts, damage or combat results.
- Calculation and public projection run outside the gameplay write transaction.
  The short commit rechecks the revision. Racing orders cannot overwrite each
  other. A lost response does not undo an accepted command: an explicit retry
  with the same identity reconciles it without applying or rolling again.
  The browser never automatically repeats a POST.
- Protocol 2 sends changes against an authenticated, owner-scoped public-view
  hash. Unknown hashes, reconnects and missing baselines get a fresh snapshot.
  Unchanged polls authenticate and inspect small SQL metadata without decoding
  the game, recalculating legality or computing visibility. Client hashes are
  not authorization. Visibility/legality caches never cross changed game states.
- Compressed replay events/checkpoints and turn-local undo snapshots live in
  separate SQLite tables. The current state contains only bounded references.
  A replay page has at most 12 events. The browser retains one page, supports
  pause/step/skip, and does not auto-start recordings over 20 actions. Older
  clients get bounded compatibility movies, not arbitrarily large expansions.
- A durable SQLite AI queue advances at most two orders per checkpoint,
  independently of human tabs, GUI rendering, replay, or polling. Leases and
  revision checks guard commits; deterministic per-checkpoint dice seeds make
  interrupted, uncommitted work reproducible. Committed outcomes are never
  rerun. Expired leases resume after restart. Three failed attempts pause the
  job visibly, with an explicit retry control. Jobs yield between batches.
- The last committed, army-filtered replay after-view can be reused as the
  identical revision's before-view for the next batch. Revision and army must
  both match. Every newly accepted order still computes fresh after-visibility;
  this is not a changed-state visibility cache or a new sight algorithm.
- Static objective/mobility plans are reused only for the same army, round,
  scenario and known terrain. Discovering changed terrain invalidates them.
  Spent units are not rescored as actors unless a free road-bonus leg remains;
  they still remain valid recipients of support.
- Existing replay-heavy states are upgraded one frame/checkpoint at a time.
  SAVE/restore and administrator diagnostic export/local import include the
  separated gameplay records, without account credentials or job seeds.

Deployment keeps the existing one-worker/four-thread Gunicorn service and
SQLite disk. The queue is an in-service worker thread, not a separate paid
Render background service: CPU is still shared with HTTP. This removes browser
dependence and unbounded allocations; it does not promise instantaneous AI on
the 0.5-CPU plan or guaranteed future uptime. Refresh the browser and resume
the existing match after deployment; no game reset is needed.

### Startup recovery (October 12)

Render's failed starts loaded the WSGI application in the Gunicorn master.
The startup trace showed `dsl-computer` running alongside `gunicorn/arbiter.py`,
before the web worker fork. Module import must therefore never start this
thread. The exported `ww2_web:app` now creates only the app/database schema;
`gunicorn.conf.py` starts the queue in `post_worker_init` and stops it at worker
exit. This works with and without `--preload`. Keep this configuration in the
service working directory when using the documented Gunicorn command.

The readiness watchdog also belongs to the worker and stops after a successful
HTTP/database health check. Startup regression tests launch real four-thread
Gunicorn processes in both modes, check concurrent HTTP health requests, verify
that only the worker owns the queue, and recover a pending AI turn with no browser.
Run `python -m unittest discover -s tests -p 'test_ww2_server_startup.py'`.

Validation: `python -m unittest discover -s tests -p 'test_ww2*.py'`,
`node tests/ww2-replay-transport.cjs`,
`node tests/ww2-pipeline-v2-browser.cjs`,
`node tests/ww2-worlds-collide-browser.cjs`, and
`WW2_BACKGROUND_AI=0 python tests/ww2-scale-benchmark.py --rounds 2`.
The soak uses a disposable database and a 512-MB address-space ceiling, with
two player views throughout full Worlds Collide AI cycles. Its memory and
timings describe this local process, not production hardware.

Local evidence: the two-round 152-unit/3,584-hex soak peaked at 63.1 MB RSS.
Its largest ordinary response was 222,251 bytes, first move 24,235 bytes, and
largest replay page 141,482 bytes. Full computer cycles with two public reads
after every checkpoint took 249.53 and 243.20 seconds; p95 public response time
was 0.453 seconds. A subsequent one-round run including exact-revision replay
before-view reuse peaked at 61.7 MB, completed 135 checkpoints in 227.59 seconds,
and had 0.454-second p95 public responses. These runs also include local client
reconstruction and concurrent regression work, so they are stress observations,
not isolated AI speed comparisons. Full-army CPU time remains substantial.

Recovery: preserve the database and diagnostic checkpoint before changing code.
Do not deploy pre-pipeline code against migrated states: it cannot resolve the
external replay/journal references. `WW2_BACKGROUND_AI=0` on this version stops
background processing while retaining the new artifact readers and storage.
Pending jobs remain durable for subsequent re-enablement. Do not point diagnostic
import at the live database; it exclusively creates a new local database.

## Historical replay acknowledgement patch

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
