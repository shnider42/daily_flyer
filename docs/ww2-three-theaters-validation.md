# Three-theater release validation — 2026-10-03

Production baseline: d304cd1530fd3beaa0346a0f8d8e323857b7683b.
Tested review commit: b407230998b49074321e596859b989ab1c838e7c.
Final GitHub Actions run: 37101547435, job 111141909557.

The final gate explicitly enabled `set -euo pipefail`, propagated each Node/browser failure through its logging pipeline, and required all suites to pass before committing the tested files. Its logs show **344 Python tests passed in 222.051 seconds**, followed by an overall successful job. Eight browser suites passed: new-fronts, Experience, front-replay, Fubar, retained-map, map-performance, playback, and replay-transport.

New checks exercised real Observe, mortar supply and evacuation actions; tap-accessible order explanations in all Experiences; no POSTs when inspecting help; 44-pixel help targets; phone, desktop and 320-pixel layouts; saved-battle resume; exact recorded rescue and flag-score progression; private manifests; and unchanged server state during replay. Screenshots were inspected after the successful run. The 30 promoted source/test/document blob hashes were compared to the locally reviewed files and matched exactly. Diagnostic workflows and encoded review patches are not included in production.

An earlier preliminary workflow (37100915870) returned a misleading green result because a shell logging pipeline masked browser exit codes. Its logs exposed a stale 17-map catalog assertion and a new-map harness relying on transient element visibility for navigation. That result was not promoted to production. The catalog assertions now expect the actual 20-map catalog; the map harness checks application lobby state and waits for navigation to settle. Existing camera, fog, order, save and replay assertions remain. The final gate reran all rules and browser suites, rather than treating the preliminary green result as evidence.

Additional local smoke checks ran a complete computer opening turn for both sides on all three new maps. Each completed with legal nonnegative AP and no same-layer stacking. Local timing or memory samples are not Render or physical-iPhone guarantees. Human balance remains untested; the new scenarios are explicitly playtests.

No production database was reset, no existing matches were replaced, and no Render settings changed. The release preserves the previous replay-compaction and retained-render implementation. These checks do not establish the cause of the earlier 502 or promise future uptime. See ww2-three-theaters.md for rules, limits and rollback compatibility.
