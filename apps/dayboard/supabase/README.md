# Dayboard shared workspace database

This directory contains the reviewed source for the optional team database. It does not read, migrate, upload, or replace personal browser storage. A newly created shared workspace starts with one **General** area and no tasks or projects.

The initial migration and the separate `dayboard_pilot_admission` migration were generated with Supabase CLI `3.2.0` using `supabase migration new`. They have been exercised against an isolated PostgreSQL-compatible PGlite database. Creating a hosted project, selecting an organization, applying migrations to a hosted database, registering the Auth hook, and enabling the browser feature are separate deployment steps. The admission migration starts with **zero approved organizers**.

## Access boundary

Every application RPC requires an Auth user with a confirmed email, a non-anonymous account, and no current ban or soft deletion. Authorization uses the database membership records and `auth.uid()`. User-editable profile metadata supplies a display name only. The separate Before User Created hook is callable only by the Auth service and inspects the incoming email before that account exists.

Only `public.dayboard_workspaces` is directly readable. Its SELECT policy restricts rows to verified current members. Clients have no direct INSERT, UPDATE, or DELETE privileges. The table carries workspace metadata and a revision counter for change notifications; it does not contain tasks, invitation tokens, or personal Today selections.

Task, project, area, membership, invitation, receipt, activity, and pin records live in `dayboard_private`. Keep this schema outside the Data API's exposed schema list. Row-level security is enabled, with no client table access grants. Public RPC wrappers use `SECURITY INVOKER`; narrowly granted private `SECURITY DEFINER` workers perform complete identity, membership, role, version, and value checks. All function search paths are fixed, and internal helpers are not callable by authenticated clients. No service-role or secret key belongs in the browser configuration.

Owners invite and remove members. Every member may edit shared tasks, projects, and areas. Task assignment must refer to a member of the same workspace. Today selections belong to the signed-in person and are omitted from shared activity. Completing, archiving, putting aside, or removing a task clears its Today selections. Member removal clears that member's assignments and pins, increments affected task versions, and revokes new reads and writes. Previously downloaded information cannot be remotely erased from a person's device.

## Closed pilot admission

An organic visitor can use the personal browser board without an account. Hosted signup is restricted to a specific enabled organizer approval or a currently pending invitation for that email. Being admitted to Auth does not join a workspace: the invited person must confirm their email and explicitly accept the matching invitation. An invited member cannot create a separate workspace without the operator's organizer approval.

The private `organizer_approvals` registry records normalized email addresses, enabled status, an owned-workspace limit (default **3**, configurable from 1 to 100), and approval/update timestamps. It is empty after migration. The browser cannot read or change this registry. The create operation independently checks the verified account's current database email against enabled approval, locks that account while checking its quota, and locks the approval row against concurrent operator changes. Editing a JWT's claimed email or user metadata cannot grant approval. A capability response is display guidance; creation always repeats the server checks.

The Before User Created hook permits only an enabled approved email or a matching invitation whose `revoked_at` and `accepted_at` are null and whose expiration is in the future. It returns one generic rejection without workspace names or approval/invitation details. It is `SECURITY INVOKER`, with Auth-only execution and column-level SELECT grants for the admission fields. Auth cannot read token hashes or the operator inventory through these grants. No public application RPC accepts an email to look up approval.

### Required Auth activation gate

**Applying SQL alone does not activate the signup restriction.** Before exposing hosted signup or enabling team mode:

1. Apply both migrations to the explicitly chosen development project. Keep `dayboard_private` out of the Data API's exposed schemas.
2. In Supabase **Authentication → Hooks**, register the **Before User Created** Postgres hook as `dayboard_private.before_user_created`. The corresponding function URI is `pg-functions://postgres/dayboard_private/before_user_created`. Confirm that the hook is enabled. The migration supplies its schema usage, function execute, column SELECT, and RLS permissions for `supabase_auth_admin`.
3. Keep anonymous sign-in disabled and email confirmation required. Configure only the intended email authentication flow and its approved redirect URL. The hook must be active before allowing new email account creation; globally disabling all signup would also prevent invited first-time users from creating their accounts.
4. Add only an explicitly approved organizer's email through a trusted operator SQL connection. Do not seed broad email domains, profile roles, or example accounts in production.
5. With isolated, authorized test identities, verify the actual hosted Auth flow: unrelated signup is denied, an approved organizer can sign up, and a current invitee can sign up and explicitly join. Revoke/expire an invitation and verify it no longer admits a new identity. Verify that invited members cannot create boards and that an organizer cannot exceed the approved quota. Verify that no browser role can read the registry or inventory.
6. Confirm the privacy policy describes the deployed providers, operator access, retained records, and support/deletion route before enabling the team feature. Keep the feature disabled if the hook, email confirmation, or hosted checks are missing.

The current provider guidance is [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) and [Auth hook configuration and permissions](https://supabase.com/docs/guides/auth/auth-hooks). These tests validate SQL behavior; they do not claim that a hosted hook is registered or that a mail provider is configured.

### Operator approval and suspension

Run approval changes only from a trusted operator connection or the project's SQL Editor. Replace the placeholder with the specific approved email; the placeholder itself fails validation. This is not a browser operation and does not send an invitation or email.

```sql
insert into dayboard_private.organizer_approvals(email,workspace_limit)
values (lower(btrim('<approved-email>')),3)
on conflict(email) do update
  set enabled=true,workspace_limit=excluded.workspace_limit,updated_at=now();

-- Stop further workspace creation and approval-based new-account admission.
update dayboard_private.organizer_approvals
  set enabled=false,updated_at=now()
  where email=lower(btrim('<approved-email>'));
```

Disabling approval **does not suspend existing workspace access**, freeze a workspace, revoke existing invitations, or delete data. A matching current invitation remains an independent admission route. Existing owner/member permissions remain as described above, including an owner's ability to invite members within the workspace limits. Lowering a quota below the current owned count stops new creation without deleting any boards. Retrying a previously successful create request returns its existing authorized workspace even after the quota falls or approval is disabled; it never creates another board.

Use the existing owner-controlled member removal/revocation operations when a particular membership or invitation should end. An operator's actual account suspension should use Supabase Auth's supported ban controls; application RPCs and metadata RLS check current database ban status, so existing JWTs do not preserve access. An account ban does not erase already downloaded information, disable the other members' accounts, or remove pending invitations. A workspace-wide freeze and ownership transfer are not implemented. Handle those cases explicitly before offering unrestricted hosting; do not describe organizer-approval removal as a complete suspension feature.

## Operator hosting inventory

The private invoker view `dayboard_private.host_inventory` is for a trusted database operator only. There is no browser SELECT grant, public RPC, or Auth-service grant for it. It reports workspace identity/name, owner ID/email, membership count, pending and historical invitation counts, live task/project/Area counts, removed-record count, live and retained serialized model bytes, pin/receipt/activity row counts, and the latest activity timestamp. It returns no task titles, task/note bodies, invitation tokens, or token hashes.

```sql
select * from dayboard_private.host_inventory
order by last_activity_at desc,workspace_id;

-- Accounts can exist without joining a workspace. Count them separately.
select
  (select count(*) from auth.users where deleted_at is null) as auth_account_count,
  (select count(*) from auth.users where deleted_at is null and email_confirmed_at is null)
    as unconfirmed_account_count,
  (select count(*) from auth.users u where u.deleted_at is null
    and not exists(select 1 from dayboard_private.members m where m.user_id=u.id))
    as accounts_without_memberships,
  (select count(*) from public.dayboard_workspaces) as workspace_count,
  (select count(*) from dayboard_private.invitations
    where revoked_at is null and accepted_at is null and expires_at>now())
    as pending_invitation_count;
```

`live_model_bytes` is the UTF-8 size of serialized live task/project/Area JSON. `retained_model_bytes` includes those same records plus removed-record tombstones. Neither is total physical database storage: indexes, row overhead, Auth, membership, pins, invitation history, receipts, activity, WAL, and provider backups have additional costs. Use the provider's database/disk metrics for total capacity and billing oversight; review Auth counts as well as workspace counts. The view counts retained operational rows so their growth remains visible without loading task/note text. No automatic host dashboard or alerts are implied by this query.

## RPC contract

| Function | Result and authorization |
| --- | --- |
| `dayboard_capabilities()` | Verified current user's `{mayCreateWorkspace,workspaceLimit,ownedWorkspaceCount}`. Missing/disabled approval yields limit 0; quota exhaustion also makes `mayCreateWorkspace` false. |
| `dayboard_workspaces()` | Current member's `{id,name,role,memberCount}` list. |
| `dayboard_create_workspace(p_name, p_request_id)` | Approved organizer below their owned-workspace quota only; returns a new empty snapshot. The request UUID makes retries idempotent. |
| `dayboard_snapshot(p_workspace_id)` | Current member's authorized snapshot. |
| `dayboard_commit(p_workspace_id, p_request_id, p_changes)` | Atomic changes plus a snapshot and action receipt. |
| `dayboard_invite(p_workspace_id, p_email)` | Owner only; returns `{id,email,token,expiresAt}`. |
| `dayboard_invitations(p_workspace_id)` | Owner only; pending invitations without bearer tokens or hashes. |
| `dayboard_invitation_preview(p_token)` | Confirmed matching email only; returns `{workspaceName,email,expiresAt,alreadyJoined}` without joining or revealing board contents. |
| `dayboard_accept_invite(p_token)` | Confirmed matching email only; consumes the invitation and returns the joined workspace. |
| `dayboard_revoke_invite(p_workspace_id, p_invitation_id)` | Owner only; revokes an unused invitation. |
| `dayboard_remove_member(p_workspace_id, p_user_id)` | Owner only; removes a non-owner and returns the resulting snapshot. |

Snapshots retain the existing schema-2 model payload in `data`. Task numbers, creation timestamps, update timestamps, authorship, and record versions are authoritative on the server. Times use UTC ISO strings with millisecond precision. Assignment and authorship appear separately in `assignees` and `audit`; they do not add unsupported fields to the personal task model.

The `versions` object contains maps for `tasks`, `projects`, `areas`, and the current person's `pins`, including tombstones. Snapshot tasks include only live records. A task's `today` field is projected from that person's private pin. `members` contains the workspace membership directory, and `activity` contains the latest 30 non-pin actions.

Each commit change has this shape:

```json
{
  "entity": "task",
  "id": "stable-record-id",
  "operation": "put",
  "expectedVersion": 3,
  "value": {"id": "stable-record-id", "...": "complete validated model payload"},
  "assigneeId": null
}
```

Use `task`, `project`, `area`, or `pin` as the entity and `put` or `delete` as the operation. `expectedVersion: 0` creates a record that has never existed. Restoring a tombstone requires its current version. A pin's value is `{ "pinned": true }` or `{ "pinned": false }`; deleting a pin also unpins. A batch may affect each entity/ID pair once. Create a task before its pin in the same batch. Dependent area/project/task changes are validated together before the transaction commits.

A successful commit returns a `receipt` with `requestId`, `replayed`, and the versions produced by that action. Retrying the exact request UUID and payload returns the **current** snapshot while preserving those original receipt versions. Reusing a request UUID for different work is rejected. Conditional Undo must use the receipt versions for the affected records; it must never replace a whole workspace snapshot. A newer edit to any affected record rejects the complete Undo atomically. Edits to unrelated records remain independent.

Permission failures use SQLSTATE `42501`, stale record versions use `40001`, and invalid command values use `22023`. Constraint failures also reject the complete transaction. No partial command batch is saved. Recurring completion and its new occurrence must be submitted in one batch with the original task's expected version.

## Invitations and notifications

Invitations are bound to the normalized email address and expire after seven days. Creating another pending invitation for the same email revokes the prior one. Only a SHA-256 token hash is stored; the random bearer token is returned once. Acceptance is idempotent for the same account while it remains a member. A removed member cannot reuse a consumed invitation to rejoin. Generating a link does not send email or contact another person.

When `supabase_realtime` exists, the migration publishes workspace metadata changes only. Clients refetch an authorized snapshot after notifications, reconnects, and periodic checks. Membership removal must be handled by clearing the selected shared view when the next authorized read fails; a connection alone is not proof of access. Polling remains necessary when a project has not enabled Realtime.

## Resource and retention bounds

The database accepts at most 10,000 live tasks, 1,000 live projects, 10 MiB of live model payload, and 12,000 changes / 12 MiB per transaction. A workspace may have up to 100 members and 100 pending invitations. An approved organizer may own up to their operator-set quota, **3 by default**. Other accounts may not create workspaces. There is no fixed area-count limit within the payload bound. These are initial operational limits, not billing tiers or total-storage caps.

Record tombstones and request receipts are retained to protect retries and conditional Undo. Activity records currently remain in the database, although snapshots return only the latest 30. This initial implementation does not include automated workspace deletion, ownership transfer, or retention cleanup. Decide on and implement those lifecycle operations before treating the service as a general-purpose hosted team product; deleting database rows ad hoc would weaken retry and Undo guarantees.

## Local verification and activation gates

From `apps/dayboard`, run:

```sh
node --test tests/team-admission.test.mjs tests/team-database.test.mjs tests/shared.test.mjs
```

The database admission tests create only synthetic `.invalid` identities in an isolated in-memory database; the client integration fixture uses reserved `example.test` identities. The suites load both production migrations unchanged and exercise permissions under `anon`, `authenticated`, and `supabase_auth_admin`. They cover the initially empty approval registry, denied unrelated signup, approved/invited signup, revoked/expired/consumed invitations, quotas, user-metadata and claimed-email forgery, approval disabling, operator inventory accuracy/isolation, verification, RLS isolation, owner controls, retry receipts, stale edits, private Today pins, conditional Undo, server task numbering, browser-compatible string/date/URL validation, cross-workspace references, atomic recurrence, and member removal.

PGlite runs PostgreSQL semantics in one local engine; these tests do not validate Supabase's Auth provider, hook registration, PostgREST transport, actual browser sessions, Realtime delivery, or multi-connection lock scheduling. Before enabling team mode, apply the migrations to the explicitly chosen development project and verify those integrations with isolated test accounts. Exercise simultaneous creation at the organizer quota, simultaneous edits from two sessions, a member removal while the other session is open, and retry/reconnect behavior. Verify production email confirmation and Auth redirect URLs, inspect the resulting grants/RLS/publication, establish backup and recovery procedures, and retain a personal-mode regression check. The application feature should stay disabled until those checks and the Auth activation gate above pass.

## Migration history alignment

The connector assigned hosted versions `20261116232917` (team workspaces) and `20261116232927` (pilot admission) on the dedicated development project. The CLI-created local migration files were renamed to those exact returned versions after deployment, with SHA-256 checks confirming unchanged SQL bytes and ordering. Only these matching versions remain in the migration directory; do not restore the earlier local timestamps or replay the schema.
