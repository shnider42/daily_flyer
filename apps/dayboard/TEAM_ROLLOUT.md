# Dayboard team rollout

## Current boundary

The team implementation is a **closed-pilot candidate** on `feat/dayboard-teams` and remains disabled. The public personal service remains on `feat/dayboard-personal`, with its existing origin and browser storage key. No personal board is automatically copied, migrated, or uploaded. Organic visitors can use the personal board without creating hosted accounts or workspaces.

The public [privacy policy](public/privacy.html), served at [privacy.html](https://dfe-dayboard.onrender.com/privacy.html), is included in personal release **1.2.1**, branch commit `ab9c64d`. Its Render deployment was verified live. The [hosting runbook](HOSTING.md) records the actual infrastructure, operator inventory, storage oversight, privacy contact, and activation duties.

This document separates implemented protections from deployment evidence still required. Passing an in-memory PostgreSQL test is not evidence that hosted sign-in, email delivery, transport, or multiple database sessions work correctly.

## First pilot scope

Use the provisioned dedicated Dayboard project and two explicitly chosen test identities after the Auth and delivery gates pass. Start with synthetic tasks only. Approve one organizer explicitly; that person creates a workspace and invites the other. Both can edit shared work and assign tasks. Each person keeps a private Today shortlist and personal display preferences. Invitation links are generated for manual delivery; the app sends no invitations automatically.

The approval registry currently has **zero entries**. The published business/privacy contact address is not automatically an approved application identity. The registered Auth hook checks for enabled organizer approval or a current email-bound invitation before account creation. Membership still requires explicit invitation acceptance. Only approved organizers can create workspaces, with a default quota of **three owned workspaces**. Invited members cannot create additional hosted boards without separate approval.

Do not introduce comments, chat, public links, external integrations, organization-wide roles, or automatic personal-board synchronization in this first pilot. Those features are not needed to validate a shared board and would enlarge the data and permission model.

## Activation gates

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Existing personal use | The same personal record survives opening the candidate; existing tasks, Areas, preferences, imports, and recurrence still work. Disabled mode starts no Auth/backend client. | Existing personal regression suite passes; browser review is recorded with the candidate. |
| Explicit sharing | A new team is empty. Personal copying starts with no selection and discloses destination and counts. Unselected content and personal Today/settings are absent; source data remains unchanged. | Implemented and covered by selected-copy tests. |
| Closed admission | The registered Before User Created hook rejects unrelated new identities, permits approved organizers/current invitees, and rejects revoked/expired invitations. Signup does not join a board. | Hook registered and enabled. One real OTP request for an unrelated synthetic address returned HTTP 403 with the hook's rejection message. Approved/invited signup and expired/revoked invitation paths remain unverified on hosted Auth. |
| Organizer authority | Only explicitly approved organizers create boards; the default quota of three is enforced under simultaneous requests. Profile metadata and claimed email cannot grant approval. | Both migrations installed; registry is empty; local authorization/quota tests pass. Hosted actual-account and multi-connection checks remain. |
| Authorized access | Anonymous and unrelated users cannot list/read/write a workspace, invoke owner actions, inspect invitations, or read another member's pins. Revoked members lose subsequent access. | Local role tests pass. Hosted inspection confirms RLS on all 10 application tables and restricted operator/hook grants. Dashboard exposes `public` and `graphql_public`; `dayboard_private` is excluded. Hosted membership/Auth/PostgREST scenarios remain. |
| Sign-in delivery | The configured provider delivers verified sign-in to an invited address outside the infrastructure organization; exact redirects and invitation resumption work. | Site URL and sole allowed redirect saved as `https://dfe-dayboard.onrender.com/`, with no wildcard. Custom SMTP is OFF and no provider is configured. Delivery and invitation resumption remain unverified. |
| Concurrent work | Independent edits both survive. The second stale save to the same record is rejected with its draft intact. A slow refresh cannot replace a later save. Undo preserves unrelated edits and refuses affected newer changes. | Client and SQL tests pass. Repeat with two real browser sessions and separate hosted database connections. |
| Uncertain outcomes | Lose the reply after a successful write, retry the exact operation, and verify one task/one successor. Later draft text survives. Session change cannot replay a request as another account. | Idempotent client/SQL protocol tests and focused browser scenarios; live reconnect/auth-expiry checks remain. |
| Host oversight | The operator knows hosted account/workspace totals, retained data growth, and membership/invitation counts without routine task/note review. Public privacy information matches deployment. | Private operator inventory installed; hosted counts are zero. Browser roles cannot read it. Total database/provider metrics and the runbook complement model-payload counts. Privacy release is on the personal branch. |
| Operations and recovery | Confirm project owner/cost, grant/RLS configuration, database backup method, a successful restore exercise, and handling of deletion/retention requests. | Approved HoltsniderTech project provisioned on the $0 / Free quote; SQL/grants inspected. Backup/restore, deletion/retention request operations, SMTP and remaining hosted scenarios are not complete. |
| Controlled adoption | Both pilot users can identify the current workspace, distinguish personal Today from shared status, and recover from conflict/reconnect without help. | Pilot not started. |

## Provisioned infrastructure and remaining configuration

The user approved **HoltsniderTech** as the owning organization. The dedicated Supabase project **Dayboard** (`llkfchgbvnejrsqgvxgc`) was created in **US East (`us-east-1`)** using the actual **$0 / Free provisioning quote** and was healthy at provisioning. Both migrations were applied. This approval and project are separate from SuggestionBox; do not apply Dayboard changes to the SuggestionBox database. A $0 creation quote does not establish that email delivery, other infrastructure, or future resource changes will be free. See [HOSTING.md](HOSTING.md) for the project/dashboard inventory and cost monitoring.

**The Before User Created hook is registered and enabled** at `pg-functions://postgres/dayboard_private/before_user_created`. Dashboard authentication, hook registration, exact callback settings and exposed-schema inspection were completed on November 17. One actual hosted OTP request verified the negative admission path; the evidence and its limits are recorded below.

Configure an appropriate SMTP provider and verify sign-in delivery to an invited address outside the infrastructure organization. Confirm successful callbacks and invitation resumption through the published origin. Use a publishable browser key only. Positive Auth, membership/PostgREST, Realtime and two-session scenarios still require verification.

When enabling shared mode, the build requires `DAYBOARD_EMAIL_PROVIDER`, `DAYBOARD_AUTH_ADMISSION_VERIFIED=true`, and `DAYBOARD_SMTP_VERIFIED=true`, alongside the enabled flag, dedicated HTTPS origin, and publishable key. The two verification flags are **manual operator attestations**. They do not configure Auth/SMTP, run the endpoint tests, or replace server enforcement. Set them only after recording successful hosted checks. Until then, keep `DAYBOARD_TEAMS_ENABLED` disabled.

The current candidate has owner/member authorization but no ownership transfer or workspace deletion workflow. Define who is responsible for the workspace and how its content will be exported, retained, and removed before expanding beyond the pilot. Do not promise a recovery window until a backup method and restore procedure have been tested on the chosen service plan.

Disabling organizer approval stops new workspace creation and approval-based new-account admission; it does not revoke existing memberships or outstanding invitations. Existing invitation admission remains independent. Use the documented membership/invitation operations and supported Auth ban controls for those separate boundaries. A workspace-wide freeze, automatic purge, and complete account/workspace deletion workflow are not implemented. See [operator approval and suspension](supabase/README.md#operator-approval-and-suspension).

## Hosted Auth configuration and negative admission — November 17, 2026

Dashboard sign-in succeeded for **Dayboard / HoltsniderTech**. The Before User Created Postgres hook `dayboard_private.before_user_created` was created, displayed as **ENABLED**, and confirmed by a success notification. Read-only SQL inspection confirmed its `event jsonb → jsonb` signature, `SECURITY INVOKER`, empty search path and required Auth-only grants/RLS policies.

Verified settings:

- Allow new users: **ON**, with the hook restricting admission; anonymous sign-in and manual linking: **OFF**; Confirm email: **ON**; only the Email provider: **ON**.
- Site URL changed from the localhost default to **`https://dfe-dayboard.onrender.com/`**. The same exact URL is the sole allowed redirect; no wildcards. Both saves were confirmed.
- Exposed Data API schemas: **`public` and `graphql_public`**. **`dayboard_private` is unchecked**. Exposure defaults were inspected, not changed.
- Custom SMTP: **OFF**; no custom provider configured.

Exactly **one** real OTP POST used a unique `@example.invalid` address, `create_user: true`, PKCE `s256`, and the published root redirect. It returned **HTTP 403**, code `unknown`, with the exact message: **“Shared Dayboard access requires a current invitation or host approval.”** No user or session was created. Post-request counts at **2026-11-17 20:46:06 UTC** were **0 Auth accounts, 0 organizer approvals, 0 workspaces and 0 invitations**.

This verifies only rejection of an unrelated new identity. Approved-organizer/current-invitee signup, invitation expiry/revocation, email delivery, hosted two-user/concurrency behavior, recovery and deletion operations remain gates. No release attestations were set and team mode remains disabled. Dashboard evidence: [enabled hook](qa/dayboard-admission-enabled.jpg), [callback settings](qa/dayboard-auth-redirect.jpg), [exposed schemas](qa/dayboard-api-schemas.jpg).

## Hosted read-only verification — November 16, 2026

The dedicated project was healthy, both migrations were present, and the initial hosted counts were **0 Auth users, 0 organizer approvals, 0 workspaces, 0 task records, and 0 invitations**. No user was enrolled, invited, or approved during provisioning.

All **10 application tables** have RLS enabled. Inspected grants deny browser roles access to the private operator inventory, organizer-approval mutations, and Auth-hook execution. The security adviser returned **0 warnings, 0 errors, and 7 informational “RLS enabled, no policy” findings** for private tables intentionally accessed through guarded functions. Broad client policies should not be added to silence those entries.

The installed operator inventory reports metadata and aggregate live/retained counts, including removed-record payloads and operational-row growth, without task/note bodies or invitation credentials. Live/retained model-byte totals are not total database storage; monitor provider database/disk metrics and Auth accounts, including accounts without memberships, as described in [HOSTING.md](HOSTING.md).

At this November 16 inspection, the connector could not assume the managed Auth role and no actual Auth endpoint had been exercised. Hook registration, Dashboard inspection and the first negative Auth check were completed on November 17 as recorded above; the other activation gates remain open.

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

## Connection and collaboration follow-up — November 17, 2026

The candidate now distinguishes confirmed shared saves from the freshness of the displayed board. A compact disclosure below the workspace header is available on desktop and mobile layouts. It identifies live updates, periodic checks, offline state, slow requests, delayed updates, and saves whose reply has not been confirmed. The details show the last authorized confirmation and the measured duration of the last successful request, including transport and server processing. A connected subscription never proves board freshness or that every teammate has received a change. Routine quick polling does not repeatedly announce a changing status to screen readers.

The store now ignores an obsolete refresh failure after a newer save, coalesces update notifications received during an active read into a follow-up read, refreshes on reconnect, and restores its live-transport label when a surviving subscription receives an update. Reconnect never automatically replays an uncertain write. Timers and browser listeners are removed when the workspace closes. These follow the existing DFE patterns of explicit acknowledgements, request identity, generation checks, and connection feedback while retaining Dayboard's record-level conflict and membership protections.

Task details use the existing authorized authorship metadata to identify the creator and last editor. The sign-in message explains the same-browser invitation-tab return; no authentication method, SMTP settings, admission policy, or hosted data changed.

Verification: the production build passed its existing gate with **100 tests**. New focused coverage checks the failed-read race, invalidation during an active refresh, monotonic timing and slow operations, offline/reconnect/disposal, no automatic pending-write replay, and the distinction between save confirmation and update freshness. The visibly synthetic QA fixture now includes offline and polling-only toggles and a three-second delayed save. Browser verification of these new visual states remains uncompleted: local Chromium could not start under the runtime restrictions, and the cloud browser could not access the local preview. This does not replace the hosted two-user and delivery checks above. Team mode remains disabled.

## Release sequence

1. Keep the candidate separate and team mode disabled. Verify the personal 1.2.1 privacy deployment at the existing public origin; keep the existing browser storage key and data unchanged.
2. Retain the verified hook, schema exposure and exact redirect settings on the existing Dayboard project. Configure and verify the actual email provider and successful callback/invitation resumption. Both migrations are already applied; do not create a second project or reapply them as a substitute for Auth configuration.
3. Explicitly choose and approve the organizer test identity; do not infer it from a published contact address. Complete positive hosted Auth and acceptance scenarios using synthetic content and separate accounts, including invitation expiry/revocation and simultaneous creation at quota. Retain the recorded negative admission result and document remaining outcomes.
4. Establish and test recovery, define pilot access/deletion/retention handling, and confirm the public privacy policy matches deployed providers. Set the manual release attestations only after the corresponding evidence is recorded.
5. Enable the small opt-in pilot only after all gates pass. Let the approved organizer create an empty workspace and explicitly choose whether to copy any real work.
6. Review confusing interactions and recovery behavior with the pilot users. Complete lifecycle and operational work before wider use.

## Rollback and recovery

The personal app can remain available while shared mode is disabled. If a shared regression is found, stop new shared writes and redeploy with team mode disabled or restore the last personal-only release. Leave the team database intact while investigating. Disabling the client is not deletion or restoration of shared data, and it is not a substitute for server-side access controls.

Never restore an older full workspace snapshot over newer team edits as an Undo mechanism. The application uses conditional action-level Undo. For database recovery, restore into a separate recovery environment first, verify membership and content, and plan reconciliation before replacing live data.

A JSON team export can recover content as new records, but it does not preserve authorization, invitation state, server receipts, or audit history. Keep that distinction explicit in pilot instructions.
