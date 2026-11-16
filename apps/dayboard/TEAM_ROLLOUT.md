# Dayboard team rollout

## Current boundary

The team implementation is a **closed-pilot candidate** on `feat/dayboard-teams` and remains disabled. The public personal service remains on `feat/dayboard-personal`, with its existing origin and browser storage key. No personal board is automatically copied, migrated, or uploaded. Organic visitors can use the personal board without creating hosted accounts or workspaces.

The public [privacy policy](public/privacy.html), served at [privacy.html](https://dfe-dayboard.onrender.com/privacy.html), is included in personal release **1.2.1**, branch commit `ab9c64d`. Its Render deployment was verified live. The [hosting runbook](HOSTING.md) records the actual infrastructure, operator inventory, storage oversight, privacy contact, and activation duties.

This document separates implemented protections from deployment evidence still required. Passing an in-memory PostgreSQL test is not evidence that hosted sign-in, email delivery, transport, or multiple database sessions work correctly.

## First pilot scope

Use the provisioned dedicated Dayboard project and two explicitly chosen test identities after the Auth and delivery gates pass. Start with synthetic tasks only. Approve one organizer explicitly; that person creates a workspace and invites the other. Both can edit shared work and assign tasks. Each person keeps a private Today shortlist and personal display preferences. Invitation links are generated for manual delivery; the app sends no invitations automatically.

The approval registry currently has **zero entries**. The published business/privacy contact address is not automatically an approved application identity. The server admits a new account only through enabled organizer approval or a current email-bound invitation once the Auth hook is registered. Membership still requires explicit invitation acceptance. Only approved organizers can create workspaces, with a default quota of **three owned workspaces**. Invited members cannot create additional hosted boards without separate approval.

Do not introduce comments, chat, public links, external integrations, organization-wide roles, or automatic personal-board synchronization in this first pilot. Those features are not needed to validate a shared board and would enlarge the data and permission model.

## Activation gates

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Existing personal use | The same personal record survives opening the candidate; existing tasks, Areas, preferences, imports, and recurrence still work. Disabled mode starts no Auth/backend client. | Existing personal regression suite passes; browser review is recorded with the candidate. |
| Explicit sharing | A new team is empty. Personal copying starts with no selection and discloses destination and counts. Unselected content and personal Today/settings are absent; source data remains unchanged. | Implemented and covered by selected-copy tests. |
| Closed admission | The registered Before User Created hook rejects unrelated new identities, permits approved organizers/current invitees, and rejects revoked/expired invitations. Signup does not join a board. | SQL hook and local role tests pass. **Hook is not registered.** Connector cannot configure Auth; Dashboard requires sign-in. No actual Auth endpoint request has been sent. |
| Organizer authority | Only explicitly approved organizers create boards; the default quota of three is enforced under simultaneous requests. Profile metadata and claimed email cannot grant approval. | Both migrations installed; registry is empty; local authorization/quota tests pass. Hosted actual-account and multi-connection checks remain. |
| Authorized access | Anonymous and unrelated users cannot list/read/write a workspace, invoke owner actions, inspect invitations, or read another member's pins. Revoked members lose subsequent access. | Local role tests pass. Hosted read-only inspection confirms RLS on all 10 application tables and restricted operator/hook grants. Hosted Auth/PostgREST scenarios and Dashboard exposed-schema inspection remain. |
| Sign-in delivery | The configured provider delivers verified sign-in to an invited address outside the infrastructure organization; exact redirects and invitation resumption work. | SMTP/provider setup and actual delivery are not verified. Naming a provider in build configuration is insufficient. |
| Concurrent work | Independent edits both survive. The second stale save to the same record is rejected with its draft intact. A slow refresh cannot replace a later save. Undo preserves unrelated edits and refuses affected newer changes. | Client and SQL tests pass. Repeat with two real browser sessions and separate hosted database connections. |
| Uncertain outcomes | Lose the reply after a successful write, retry the exact operation, and verify one task/one successor. Later draft text survives. Session change cannot replay a request as another account. | Idempotent client/SQL protocol tests and focused browser scenarios; live reconnect/auth-expiry checks remain. |
| Host oversight | The operator knows hosted account/workspace totals, retained data growth, and membership/invitation counts without routine task/note review. Public privacy information matches deployment. | Private operator inventory installed; hosted counts are zero. Browser roles cannot read it. Total database/provider metrics and the runbook complement model-payload counts. Privacy release is on the personal branch. |
| Operations and recovery | Confirm project owner/cost, grant/RLS configuration, database backup method, a successful restore exercise, and handling of deletion/retention requests. | Approved HoltsniderTech project provisioned on the $0 / Free quote; SQL/grants inspected. Backup/restore, retention/request operations, and remaining Auth configuration are not complete. |
| Controlled adoption | Both pilot users can identify the current workspace, distinguish personal Today from shared status, and recover from conflict/reconnect without help. | Pilot not started. |

## Provisioned infrastructure and remaining configuration

The user approved **HoltsniderTech** as the owning organization. The dedicated Supabase project **Dayboard** (`llkfchgbvnejrsqgvxgc`) was created in **US East (`us-east-1`)** using the actual **$0 / Free provisioning quote** and was healthy at provisioning. Both migrations were applied. This approval and project are separate from SuggestionBox; do not apply Dayboard changes to the SuggestionBox database. A $0 creation quote does not establish that email delivery, other infrastructure, or future resource changes will be free. See [HOSTING.md](HOSTING.md) for the project/dashboard inventory and cost monitoring.

**Register the Auth hook before enabling any hosted signup.** Use the Before User Created Postgres hook `pg-functions://postgres/dayboard_private/before_user_created`. The available connector cannot configure this Auth setting, and the Dashboard reached a sign-in wall. No Auth request was sent; neither registration nor real endpoint enforcement is claimed complete. The hook function's existence and narrow grants are insufficient until the Auth service actually invokes it.

Configure verified email sign-in, an appropriate SMTP provider, the exact published callback origin, and invitation resumption. Verify delivery to an invited address outside the infrastructure organization. Confirm in the Dashboard that `dayboard_private` is outside the exposed Data API schemas. Use a publishable browser key only. Hosted read-only grant/RLS inspection has passed, but the real Auth/PostgREST/Realtime paths and provider settings still require verification.

When enabling shared mode, the build requires `DAYBOARD_EMAIL_PROVIDER`, `DAYBOARD_AUTH_ADMISSION_VERIFIED=true`, and `DAYBOARD_SMTP_VERIFIED=true`, alongside the enabled flag, dedicated HTTPS origin, and publishable key. The two verification flags are **manual operator attestations**. They do not configure Auth/SMTP, run the endpoint tests, or replace server enforcement. Set them only after recording successful hosted checks. Until then, keep `DAYBOARD_TEAMS_ENABLED` disabled.

The current candidate has owner/member authorization but no ownership transfer or workspace deletion workflow. Define who is responsible for the workspace and how its content will be exported, retained, and removed before expanding beyond the pilot. Do not promise a recovery window until a backup method and restore procedure have been tested on the chosen service plan.

Disabling organizer approval stops new workspace creation and approval-based new-account admission; it does not revoke existing memberships or outstanding invitations. Existing invitation admission remains independent. Use the documented membership/invitation operations and supported Auth ban controls for those separate boundaries. A workspace-wide freeze, automatic purge, and complete account/workspace deletion workflow are not implemented. See [operator approval and suspension](supabase/README.md#operator-approval-and-suspension).

## Hosted read-only verification — November 16, 2026

The dedicated project was healthy, both migrations were present, and the initial hosted counts were **0 Auth users, 0 organizer approvals, 0 workspaces, 0 task records, and 0 invitations**. No user was enrolled, invited, or approved during provisioning.

All **10 application tables** have RLS enabled. Inspected grants deny browser roles access to the private operator inventory, organizer-approval mutations, and Auth-hook execution. The security adviser returned **0 warnings, 0 errors, and 7 informational “RLS enabled, no policy” findings** for private tables intentionally accessed through guarded functions. Broad client policies should not be added to silence those entries.

The installed operator inventory reports metadata and aggregate live/retained counts, including removed-record payloads and operational-row growth, without task/note bodies or invitation credentials. Live/retained model-byte totals are not total database storage; monitor provider database/disk metrics and Auth accounts, including accounts without memberships, as described in [HOSTING.md](HOSTING.md).

These are database configuration and inventory observations. The connector could not assume the managed Auth role, and no actual Auth endpoint was exercised. Auth-hook registration, SMTP, exposed-schema Dashboard confirmation, hosted concurrency, and recovery remain open gates.

## Candidate verification record — November 16, 2026

The production build completed with team mode disabled and **90 passing tests**: 35 personal model/Area tests, 20 shared-client tests, 14 database tests, 7 admission tests, 11 UI-boundary tests, and 3 build-configuration tests. The client suite includes a two-user workflow against both production SQL migrations in isolated PGlite. The admission suite covers the empty registry, unrelated signup rejection, invitation lifecycle, organizer quotas, approval disabling, forged metadata/claimed email, and private inventory isolation. Build tests enforce the required provider declaration and manual attestations. This is local integration evidence, not proof of hosted sign-in, delivery, or multi-connection lock scheduling.

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

1. Keep the candidate separate and team mode disabled. Verify the personal 1.2.1 privacy deployment at the existing public origin; keep the existing browser storage key and data unchanged.
2. Complete Dashboard sign-in, register the hook, and inspect exposed schemas on the already provisioned Dayboard project. Configure and verify the actual email provider and redirects. Both migrations are already applied; do not create a second project or reapply them as a substitute for Auth configuration.
3. Explicitly choose and approve the organizer test identity; do not infer it from a published contact address. Run the actual hosted Auth endpoint and acceptance scenarios using synthetic content and separate accounts, including denied unrelated signup and simultaneous creation at quota. Record concrete outcomes and remaining failures.
4. Establish and test recovery, define pilot access/deletion/retention handling, and confirm the public privacy policy matches deployed providers. Set the manual release attestations only after the corresponding evidence is recorded.
5. Enable the small opt-in pilot only after all gates pass. Let the approved organizer create an empty workspace and explicitly choose whether to copy any real work.
6. Review confusing interactions and recovery behavior with the pilot users. Complete lifecycle and operational work before wider use.

## Rollback and recovery

The personal app can remain available while shared mode is disabled. If a shared regression is found, stop new shared writes and redeploy with team mode disabled or restore the last personal-only release. Leave the team database intact while investigating. Disabling the client is not deletion or restoration of shared data, and it is not a substitute for server-side access controls.

Never restore an older full workspace snapshot over newer team edits as an Undo mechanism. The application uses conditional action-level Undo. For database recovery, restore into a separate recovery environment first, verify membership and content, and plan reconciliation before replacing live data.

A JSON team export can recover content as new records, but it does not preserve authorization, invitation state, server receipts, or audit history. Keep that distinction explicit in pilot instructions.
