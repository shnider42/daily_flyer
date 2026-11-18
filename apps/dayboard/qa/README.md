# Synthetic browser QA for Dayboard

This manual QA fixture bundles the current production app, shared store, model, and team UI with an in-memory synthetic SDK transport. The generated page visibly identifies itself as **synthetic client/UI QA** and uses `connect-src 'none'`. No backend requests or emails are made.

The fixture is separate from the production build. Only `qa/dist/` receives an enabled synthetic configuration; production source and deployment configuration are not changed. Generated output is ignored by Git.

This does **not** verify backend authorization, row-level security, actual two-browser concurrency, email delivery, or hosted service behavior. Those require the real database tests and a separate staging check. The fake transport deliberately implements only the client flows described below.

## Build and serve locally

Use Node 22 or newer. From the repository root, install the app's dependencies if needed, then build and serve the fixture:

```sh
cd apps/dayboard
npm ci --include=dev --ignore-scripts
node qa/build.mjs
python3 -m http.server 4174 --bind 127.0.0.1 --directory qa/dist
```

Open `http://127.0.0.1:4174/` in a direct browser tab. Use a dedicated local port/origin, separate from any real Dayboard data. After a production fix, rerun `node qa/build.mjs` and reload the QA page. The generated `qa-build-info.json` records the production source hashes that were bundled.

The app starts on Personal as usual. Open **Workspaces → Test team** to enter the synthetic shared board. The account is the synthetic verified owner `owner@example.test`, with one synthetic member. The board starts with two tasks and one General Area.

The synthetic team server and sign-in live only in memory and reset on page reload. Personal work uses the production app's ordinary browser storage on the local QA origin. The fixture itself never reads, resets, or seeds the personal-board storage key. When multiple preview paths share one origin, they also share that origin's personal browser storage.

## Visible QA controls

The labelled strip also appears inside open dialogs, allowing checks while an editor is open. Its controls remain operable during deliberately stalled saves.

- **Lose next save replies:** Arms the next commit. The synthetic server commits it once, then loses both replies for that request ID, including the client's automatic retry. The strip reports committed-save and lost-reply counts.
- **Remote edit first task:** Changes the first task's title and notes and advances its record version. It publishes a synthetic update notification only when the fixture is online with live notifications enabled. Polling can retrieve the edit independently.
- **Expire test sign-in:** Emits a sign-out event for the synthetic account.
- **Restore test sign-in:** Restores the same synthetic owner. This sends no email.
- **Delay next save 3s:** Commits the next save, then delays its response by three seconds, long enough to exercise the app's two-second slow-request indicator. It can be combined with expiry or lost replies.
- **Simulate offline:** Toggle button. When pressed, synthetic RPC requests fail and live notifications stop. Restoring it emits an online event and restores the selected live/polling mode. This changes only the fixture, not the browser's actual network connection or `navigator.onLine`. A connection lost during a delayed save leaves the commit intact and loses its reply.
- **Polling only:** Toggle button. When pressed, live notifications stop and the channel reports a connection error, but HTTP-style snapshots and saves remain available while online. Restoring it reconnects the synthetic channel. It does not fabricate a network latency value.

Both connection toggles expose their current state through `aria-pressed`; the strip announces the synthetic connection and notification modes. Request timings shown by the production connection UI measure the fixture's local execution and deliberate delay, not hosted network performance.

## Focused browser checks

| Check | Steps | Expected result |
| --- | --- | --- |
| Stale editor | Open the first shared task, type a draft, use **Remote edit first task**, then save. | The draft remains visible; the app detects that the record changed instead of overwriting the remote edit. |
| Uncertain save | Arm **Lose next save replies**, create a task, and save. | One server transaction and one new task are recorded; the app reports an unconfirmed save and keeps the draft. |
| Original-save recovery | After the uncertain-save error, type an additional edit, then use **Retry original save**. | The original receipt is recovered without another transaction or duplicate task. The additional typing remains available to save separately. |
| Sign-in expiry | Type an unsaved shared draft, use **Expire test sign-in**, then **Restore test sign-in** and the app's **Restore draft** action. | The app first returns to Personal. The draft is restored only for its original identity and workspace. |
| Slow save | Arm **Delay next save 3s**, then save a shared edit. Inspect the shared connection label and details. | After two seconds, the UI explains that confirmation is still pending. It shows a saved result only after the delayed reply completes. |
| Polling fallback | Press **Polling only**, use **Remote edit first task**, and wait for the next visible-tab poll. | Connection details identify periodic checks instead of live updates. The snapshot retrieves the remote edit; successful shared saves remain available. |
| Offline freshness | Press **Simulate offline** while a shared board is open. Inspect the connection label and details; then restore the connection. | The UI identifies the offline/stale state without marking existing confirmed edits unsaved. Reconnecting permits a fresh snapshot. |
| Lost connection after commit | Arm **Delay next save 3s**, save a shared edit, then press **Simulate offline** before the reply arrives. Restore the connection and use **Retry original save**. | The existing commit is recovered through its original receipt, without another transaction or duplicate task. Freshness recovery does not silently discard the pending operation. |
| Quick-capture overlap | Arm **Delay next save 3s**, submit an Inbox quick capture, and type the next thought while the reply is delayed. | Confirmation of the first save retains the next thought. Submitting that thought creates a separate task. |
| Personal isolation | Create synthetic personal tasks and Areas, switch to Test team and make changes, then return to Personal. | The same personal tasks and Areas remain, without team records being merged into them. |

Supported transport operations are workspace list/snapshot/commit, receipt replay, minimal update subscriptions, and an empty pending-invitation list. Workspace creation and invitation mutations return an explicit QA-unsupported error.

These are expected results for focused manual checks, not a record that the new connection scenarios have been executed. The production connection elements are `#shared-connection` and `#connection-label`; the QA build records the source hash of `connection-status.mjs` along with the app, shared store, and team UI.

## Connection follow-up verification

The production build gate passed with 100 tests after the connection follow-up. The new browser scenarios above have not been verified visually: the current execution environment prevented local Chromium from starting, and its cloud browser could not reach the local fixture. The earlier observed results below are retained with their original date; they are not evidence for the new status display.

## Observed browser result

The following image shows the synthetic candidate after the conflict, lost-response, same-account restoration, and delayed capture checks on November 16, 2026. The bottom strip identifies the test transport and reports its committed-save counts; this is not a live hosted team.

![Synthetic shared-workspace browser result](browser-result.jpg)

## Privacy release verification

`privacy-live.jpg` records the public privacy notice after the 1.2.1 release. The notice was inspected at desktop and 390px widths in the managed browser preview. The synthetic team fixture also verified that a full organizer allowance hides creation controls and that the signed-out panel explains invitation-only admission and links to the privacy notice before email entry. No hosted sign-in email or invitation was sent.
