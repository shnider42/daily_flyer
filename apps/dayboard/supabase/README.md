# Dayboard shared workspace database

This directory contains the reviewed source for the optional team database. It does not read, migrate, upload, or replace personal browser storage. A newly created shared workspace starts with one **General** area and no tasks or projects.

The initial migration was generated with Supabase CLI `3.2.0` using `supabase migration new dayboard_team_workspaces`. It has been exercised against an isolated PostgreSQL-compatible PGlite database. Creating a hosted project, selecting an organization, applying this migration to a hosted database, and enabling the browser feature are separate deployment steps.

## Access boundary

Every callable operation requires an Auth user with a confirmed email, a non-anonymous account, and no current ban or soft deletion. Authorization uses the database membership records and `auth.uid()`. User-editable profile metadata supplies a display name only.

Only `public.dayboard_workspaces` is directly readable. Its SELECT policy restricts rows to verified current members. Clients have no direct INSERT, UPDATE, or DELETE privileges. The table carries workspace metadata and a revision counter for change notifications; it does not contain tasks, invitation tokens, or personal Today selections.

Task, project, area, membership, invitation, receipt, activity, and pin records live in `dayboard_private`. Keep this schema outside the Data API's exposed schema list. Row-level security is enabled, with no client table access grants. Public RPC wrappers use `SECURITY INVOKER`; narrowly granted private `SECURITY DEFINER` workers perform complete identity, membership, role, version, and value checks. All function search paths are fixed, and internal helpers are not callable by authenticated clients. No service-role or secret key belongs in the browser configuration.

Owners invite and remove members. Every member may edit shared tasks, projects, and areas. Task assignment must refer to a member of the same workspace. Today selections belong to the signed-in person and are omitted from shared activity. Completing, archiving, putting aside, or removing a task clears its Today selections. Member removal clears that member's assignments and pins, increments affected task versions, and revokes new reads and writes. Previously downloaded information cannot be remotely erased from a person's device.

## RPC contract

| Function | Result and authorization |
| --- | --- |
| `dayboard_workspaces()` | Current member's `{id,name,role,memberCount}` list. |
| `dayboard_create_workspace(p_name, p_request_id)` | New empty workspace snapshot; the request UUID makes retries idempotent. |
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

The database accepts at most 10,000 live tasks, 1,000 live projects, 10 MiB of live model payload, and 12,000 changes / 12 MiB per transaction. A workspace may have up to 100 members and 100 pending invitations. An account may own up to 100 workspaces. There is no fixed area-count limit within the payload bound. These are initial operational limits, not billing tiers.

Record tombstones and request receipts are retained to protect retries and conditional Undo. Activity records currently remain in the database, although snapshots return only the latest 30. This initial implementation does not include automated workspace deletion, ownership transfer, or retention cleanup. Decide on and implement those lifecycle operations before treating the service as a general-purpose hosted team product; deleting database rows ad hoc would weaken retry and Undo guarantees.

## Local verification and activation gates

From `apps/dayboard`, run:

```sh
node --test tests/team-database.test.mjs
```

The test suite creates only synthetic `.invalid` identities in an isolated in-memory database. It loads the production migration unchanged and exercises permissions under the `anon` and `authenticated` roles. It covers verification, RLS isolation, owner controls, email-bound invitation preview/acceptance/revocation/expiry, retry receipts, stale edits, private Today pins, conditional Undo, server task numbering, browser-compatible string/date/URL validation, cross-workspace references, atomic recurrence, and member removal.

PGlite runs PostgreSQL semantics in one local engine; these tests do not validate Supabase's Auth provider, PostgREST transport, actual browser sessions, Realtime delivery, or multi-connection lock scheduling. Before enabling team mode, apply the migration to the explicitly chosen development project and verify those integrations with isolated test accounts. Exercise simultaneous edits from two sessions, a member removal while the other session is open, and retry/reconnect behavior. Verify production email confirmation and Auth redirect URLs, inspect the resulting grants/RLS/publication, establish backup and recovery procedures, and retain a personal-mode regression check. The application feature should stay disabled until those checks pass.
