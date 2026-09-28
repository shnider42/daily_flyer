# DSL operations console

Open `/admin` on the same domain as the game. This is a separate responsive UI;
the regular battle screen and its mobile layout remain independent.

## Enable `shnider42` once

1. Create or sign in to your existing **shnider42** commander on the home page.
   Use the account you control; a public nickname alone does not confer access.
2. Generate a random setup key locally:
   `python -c 'import secrets; print(secrets.token_urlsafe(32))'`
3. In your Render service's **Environment** settings, add
   `WW2_ADMIN_BOOTSTRAP_KEY` with that value and redeploy. For a local server,
   set it in that server's environment. Do not commit it or put it in a URL.
4. Open `/admin`, sign in as shnider42, and paste the key into the one-time setup
   form. The server binds administrator access to that commander's immutable ID.
5. Remove `WW2_ADMIN_BOOTSTRAP_KEY` and redeploy. The assignment persists in the
   same database as games and accounts. It cannot be replaced by claiming again.

Setup is disabled unless the configured key is at least 32 characters. Use a
random key, not a long memorable phrase. Admin APIs require a valid commander
session and the bound account ID on every call. Logging out or session expiry
revokes console access. Do not delete the bound commander or its database.
If you lose its password, recovery requires the server operator; there is no
public admin-reset or email recovery endpoint. Normal sign-in rate limits apply.

## What the console does

- **Overview:** current/unfinished/solo counts, database plus SQLite journal size,
  reusable DB pages, filesystem free/total space, commander/checkpoint/trash counts.
  Filesystem capacity is the volume containing `WW2_DB_PATH`, not a billing quota.
- **Deployment and locations:** running commit/branch, runtime versions, service
  and instance IDs, absolute database path, GitHub commit and Render links. Local
  uncommitted changes are labeled. These are server locations, not player tracking.
- **Tests:** reports actual results from the regression runner below, with commit,
  timestamp, duration and skips. Missing evidence shows unknown. A report only
  matches the running version if commit IDs match and the tested checkout was clean.
- **Failures:** 5xx request ID, time, route template, match code, latency, exception
  class and stack file/function/line. No request bodies, query strings, credentials,
  source lines or exception messages are captured in the console journal. Standard
  server tracebacks remain in Render. IDs also appear in game errors and headers.
- **Matches:** searchable, paginated solo and multiplayer records; rename; cancel
  a pending rematch; remove; restore; permanently delete a removed copy. Writes
  check the displayed revision in one transaction. Concurrent orders cause a
  conflict rather than overwriting newer progress. There is no arbitrary SQL,
  shell execution, seat takeover, or unrestricted state editor.
- **Activity:** an audit trail of claims, match changes and diagnostic exports.
- **Diagnostic export:** full battlefield and recorded history for local debugging,
  with build metadata. No seat hashes, commander accounts, login credentials or
  transfer/save keys. It reveals both armies, so keep these files private.

Removing a match immediately makes it unavailable to both players and removes it
from the public lobby. Its board/history and original seat ownership remain in
Removed games. Restoring preserves those seats and bumps the revision so stale
orders cannot land. Removal invalidates outstanding MOVE codes, but existing
browser keys and commander recovery work again after restoring. Permanent deletion
requires a second explicit action and typed match code. Independent solo SAVE
checkpoints remain valid. Deleting does not necessarily shrink the SQLite file;
freed pages are reused. This console does not run `VACUUM` on the live game DB.

All mutation data, recovery copies and audit entries live in `WW2_DB_PATH`.
The failure journal is beside it: `ww2-failures.jsonl`, rotated into
`ww2-failures.previous.jsonl`, approximately 1 MB each. The console shows the latest
100 retained failures and 100 audit entries. Request/failure/slow counters reset
on worker restart. Continue using the supported **one worker / four threads**
deployment; rotation is synchronized between threads, not multiple workers.
No polling writes or second DB reads are introduced inside game transactions.

## Render and local environments

Render supplies the service/instance IDs, branch and commit automatically. No
Render API key is required for this first integration. Deploys, restart, rollback,
build output, infrastructure metrics and full logs remain in the Render dashboard.
The console does not claim to mirror Render's log API or deployment history.

Keep `WW2_DB_PATH=/var/data/ww2.sqlite3` on the existing persistent disk mounted at
`/var/data`. Games, identities, owner assignment and the adjacent journal otherwise
depend on an ephemeral filesystem. Do not share the production database with tests
or a second service. Do not scale SQLite copies into independent instances.

Default local development uses `instance/ww2.sqlite3`. Explicitly set `WW2_DB_PATH`
when running a reproduction so you can see which database is in use. Each environment
has separate games, accounts and administrator setup. Keep Flask debug mode off
for externally accessible services.

Official platform references:
- https://render.com/docs/environment-variables
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/disks
- https://render.com/docs/deploys

## Bug reproduction workflow

1. Record match code, request ID, timestamp, device/browser, and the exact action
   that failed. The console stores failure locations, but not action payloads.
2. Download the game's diagnostic snapshot immediately. A snapshot is the latest
   committed state; a rolled-back failed request is not an additional saved move.
3. Locally, install `requirements-ww2.txt` and run:

   ```sh
   python -m ww2_tactics.devtools import dsl-MATCH.json --db instance/repro.sqlite3
   ```

   The destination must be new and cannot equal `WW2_DB_PATH`. Import refuses to
   run on Render. It creates a different match code, fresh seat credentials and
   no commander accounts, retaining board, fog, AP, logs and undo/redo snapshots.
   The output contains a localhost Gunicorn command and one-use MOVE codes for
   human seats, valid 15 minutes. Start that server, open its home page, and use
   **Load code** in separate browser profiles for each seat. For a waiting game,
   the second seat can join normally. Re-import into a new file if codes expire.
4. Reproduce the reported action. Undo/redo of recorded combat keeps its dice;
   a new action's future random rolls are not predicted by the snapshot. Add a
   regression test using a controlled roll when reproducing a combat-specific bug.
5. Run the regression suite and relevant browser checks. Reproduce ordinary game
   logic, UI and SQLite transaction bugs locally first. Use a separate Render
   staging service with a separate disk for environment-only failures: Python
   version, process/thread configuration, disk permissions, proxies or timeouts.
6. Push the verified commit. Follow the deploy in Render, compare the console's
   running SHA, and smoke-test a disposable game. Avoid experimental orders in a
   real match and never use the live database as a test fixture.

## Test evidence

```sh
python -m ww2_tactics.devtools test
```

The runner discovers `tests/test_ww2*.py`, uses the tests' disposable databases,
returns nonzero on failure, and writes `instance/ww2-test-report.json` atomically.
It records the source commit and whether the checkout was dirty. Browser checks
remain separate and are not included in this report's count.

To make evidence visible on Render, optionally use this build command:

```sh
pip install -r requirements-ww2.txt && python -m ww2_tactics.devtools test --report instance/ww2-test-report.json
```

Set `WW2_TEST_REPORT_PATH` to the **absolute runtime path** of that build artifact,
for example `/opt/render/project/src/instance/ww2-test-report.json`. The console
defaults to looking beside the game DB, which is a different location when using
`/var/data`. Build on a clean checkout and do not copy an older report to certify
a newer commit. The build command stops if regressions fail. No production test
runner or test button is exposed through HTTP.

## Resignation and notifications

**Battle → Resign battle** asks for confirmation, then concedes from either
player's turn. It awards exactly one win, clears pending rematch/undo/redo state,
and shows the result to both sides. It cannot be undone, even when combat redo is
pending. Players retain their seats and can arrange a rematch. Solo games also
support resignation. Waiting and already-finished games cannot be resigned.

Email/SMS turn notifications are deferred. No contact details are collected yet.
They should be a separate opt-in feature with verified contacts, unsubscribe,
deduplicated delivery, and provider credentials held on the server.
