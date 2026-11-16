# Dayboard team rollout

## Current boundary

The team implementation is a candidate on `feat/dayboard-teams`. It is disabled by default. The live personal service remains on `feat/dayboard-personal`, with its existing origin and browser storage key. No personal board is automatically copied, migrated, or uploaded.

This document separates implemented protections from deployment evidence still required. Passing an in-memory PostgreSQL test is not evidence that hosted sign-in, email delivery, transport, or multiple database sessions work correctly.

## First pilot scope

Use a separate Dayboard development project and two explicitly chosen test accounts. Start with synthetic tasks only. One person owns a workspace and invites the other; both can edit shared work and assign tasks. Each person keeps a private Today shortlist and personal display preferences. Invitation links are generated for manual delivery; the app sends no invitations automatically.

Do not introduce comments, chat, public links, external integrations, organization-wide roles, or automatic personal-board synchronization in this first pilot. Those features are not needed to validate a shared board and would enlarge the data and permission model.

## Activation gates

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Existing personal use | The same personal record survives opening the candidate; existing tasks, Areas, preferences, imports, and recurrence still work. Disabled mode starts no Auth/backend client. | Existing personal regression suite passes; browser review is recorded with the candidate. |
| Explicit sharing | A new team is empty. Personal copying starts with no selection and discloses destination and counts. Unselected content and personal Today/settings are absent; source data remains unchanged. | Implemented and covered by selected-copy tests. |
| Authorized access | Anonymous and unrelated users cannot list/read/write a workspace, invoke owner actions, inspect invitations, or read another member's pins. Revoked members lose subsequent access. | Production SQL exercised locally under database roles. Repeat through hosted Auth/PostgREST before activation. |
| Concurrent work | Independent edits both survive. The second stale save to the same record is rejected with its draft intact. A slow refresh cannot replace a later save. Undo preserves unrelated edits and refuses affected newer changes. | Client and SQL tests pass. Repeat with two real browser sessions and separate hosted database connections. |
| Uncertain outcomes | Lose the reply after a successful write, retry the exact operation, and verify one task/one successor. Later draft text survives. Session change cannot replay a request as another account. | Idempotent client/SQL protocol tests and focused browser scenarios; live reconnect/auth-expiry checks remain. |
| Operations | Confirm project owner, resource cost, Auth delivery/redirects, grant/RLS configuration, database backup method, and a successful restore exercise. | Requires the selected hosted project and delivery setup. |
| Controlled adoption | Both pilot users can identify the current workspace, distinguish personal Today from shared status, and recover from conflict/reconnect without help. | Pilot not started. |

## Infrastructure choice before activation

Create a dedicated Dayboard project; do not reuse the existing SuggestionBox database. The Supabase project-creation tool requires the user to choose its owning organization. Obtain the actual project cost quote for that organization before provisioning and obtain agreement for any nonzero charge.

Configure verified email sign-in, an appropriate email delivery provider, the exact published callback origin, and invitation resumption. Keep `dayboard_private` outside the exposed API schemas. Inspect table/function grants, RLS, publication, and security advisories after applying the migration. Use a publishable browser key only.

The current candidate has owner/member authorization but no ownership transfer or workspace deletion workflow. Define who is responsible for the workspace and how its content will be exported, retained, and removed before expanding beyond the pilot. Do not promise a recovery window until a backup method and restore procedure have been tested on the chosen service plan.

## Candidate verification record — November 16, 2026

The production build completed with team mode disabled and **78 passing tests**: 35 personal model/Area tests, 20 shared-client tests, 14 database tests, and 9 copy/UI-boundary tests. The client suite includes a two-user workflow against the production SQL migration in isolated PGlite. This is local integration evidence, not a hosted sign-in or multi-connection test.

Browser checks used the production client source with a visibly labelled synthetic transport. The fixture's Content Security Policy blocked backend connections. These outcomes were observed through the rendered interface:

- The existing synthetic personal board opened with its tasks and custom Areas. Team mode was unavailable in the production-disabled build; ordinary capture still saved.
- A personal Inbox draft survived an unrelated pin/save action.
- A simulated remote edit made an already-open task editor reject its stale save while keeping the draft text visible.
- The synthetic server committed a new task once and deliberately lost both initial replies. The UI showed an unconfirmed save. Retrying confirmed the original receipt, with one committed action and one added task.
- Text entered after that failed reply remained in the editor after Retry. The UI explicitly distinguished the confirmed original save from the later unsaved draft.
- Expiring the synthetic sign-in returned to Personal and closed the shared view. Restoring the same synthetic account and using Restore draft reopened the correct workspace with the draft intact.
- A two-second delayed quick-capture reply preserved the next thought typed while saving. Submitting that thought created a separate task.
- Returning from the shared workspace left the same 15-task, 6-Area synthetic personal board visible.

The reusable fixture is in `qa/`; it is excluded from production assets. The oversized desktop iframe preview had an interaction issue with the new chooser; the direct production and synthetic pages both opened it successfully. No claim is made here about full mobile QA, real email delivery, hosted Realtime, or concurrent PostgreSQL lock scheduling. Those remain pilot gates.

## Release sequence

1. Keep the candidate on its separate branch while local and browser checks are reviewed.
2. Provision the selected development backend and configure Auth/email. Apply the committed migration unchanged. Do not enable the live service yet.
3. Run the hosted acceptance scenarios above using synthetic data and separate accounts. Record failures and concrete outcomes rather than relying on a total test count.
4. Enable a small opt-in pilot only after those scenarios pass. Let the owner create a new workspace and explicitly choose whether to copy any real work.
5. Review confusing interactions and recovery behavior with the pilot users. Complete lifecycle and operational work before wider use.

## Rollback and recovery

The personal app can remain available while shared mode is disabled. If a shared regression is found, stop new shared writes and redeploy with team mode disabled or restore the last personal-only release. Leave the team database intact while investigating. Disabling the client is not deletion or restoration of shared data, and it is not a substitute for server-side access controls.

Never restore an older full workspace snapshot over newer team edits as an Undo mechanism. The application uses conditional action-level Undo. For database recovery, restore into a separate recovery environment first, verify membership and content, and plan reconciliation before replacing live data.

A JSON team export can recover content as new records, but it does not preserve authorization, invitation state, server receipts, or audit history. Keep that distinction explicit in pilot instructions.
