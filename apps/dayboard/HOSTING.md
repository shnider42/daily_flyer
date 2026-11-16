# Dayboard hosting runbook

Dayboard is operated by **Holtsnider Tech**. The public personal board remains available; shared workspaces are a closed pilot that stays disabled until the hosted activation checks below pass.

## Hosting inventory

Inventory at the 2026-11-16 handoff:

| Component | Verified target / current state |
| --- | --- |
| Public application | [dfe-dayboard.onrender.com](https://dfe-dayboard.onrender.com/) |
| Render service | Static site `srv-dbocr5dg1s2s73er5e50`, branch `feat/dayboard-personal` |
| Build / published directory | `node apps/dayboard/build.mjs` / `apps/dayboard/dist` |
| Team candidate | `feat/dayboard-teams`; shared mode remains disabled |
| Dedicated Supabase project | **Dayboard**, `llkfchgbvnejrsqgvxgc`, healthy at provisioning; [project dashboard](https://supabase.com/dashboard/project/llkfchgbvnejrsqgvxgc) |
| Approved Supabase organization | **HoltsniderTech**, `esqhvarpcthnjgueshqg` |
| Database region | US East, `us-east-1` |
| Provisioning quote | **$0 / Free** for this project creation; not a promise that all hosting, email delivery or future usage will be free |
| Database SQL | Both migrations installed; all 10 application tables have RLS enabled; browser roles cannot read inventory, change approvals or invoke the Auth hook |
| Hosted activation | Auth hook registration, actual Auth endpoint tests, email delivery, recovery/retention decisions and hosted multiuser verification remain gates |

The initial hosted inventory contains **0 Auth accounts, 0 organizer approvals, 0 workspaces, 0 task records and 0 invitations**. The new database uses about 11.5 MiB including provider/schema overhead; this is not user task content. Security advisers returned no warning/error findings and seven informational “RLS enabled, no policy” entries for private tables intentionally accessed only through guarded functions. Do not add broad policies to silence those entries; see the [adviser explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The SQL connector cannot assume the managed `supabase_auth_admin` role. Hosted role grants were inspected, but the real Auth endpoint still needs testing after hook registration. Dashboard registration and inspection of exposed Data API schemas require dashboard sign-in; neither is claimed complete.

This project is dedicated to Dayboard. Do not apply Dayboard migrations or configuration to the separate SuggestionBox project. Update this inventory after deployment or provider changes; project health is a point-in-time observation.

## What an organic visitor creates

An ordinary visitor downloads the public application from Render. Personal tasks and settings remain in that browser. The operator cannot inspect, restore or erase that browser's board through the hosting dashboard. Signing in does not upload the personal board; copying selected content into a shared workspace is an explicit application action.

When enabled, shared mode stores account/session information and the team's submitted tasks, notes, checklists, links, projects, Areas, assignments, membership and operational records in Supabase. Hosted admission requires an approved organizer email or a current email-bound invitation. Signup alone does not join a workspace. The Auth hook controls new-account admission. The database independently enforces organizer approval, creation quotas and workspace access.

Dayboard has no visitor analytics. **Render static sites do not emit operator-accessible request logs**, so this service does not provide a visitor/IP inventory. Render still processes service connection and security information as infrastructure; do not equate the absence of dashboard logs with zero provider processing. See [Render logging](https://render.com/docs/logging) and [Render's DPA](https://render.com/dpa). Supabase records [authentication events and session metadata](https://supabase.com/docs/guides/auth/audit-logs), which can include IP information; not every Auth audit event includes an IP address.

## Routine operator review

Use a trusted Supabase SQL Editor/operator connection for the private inventory:

```sql
select * from dayboard_private.host_inventory
order by last_activity_at desc, workspace_id;
```

It reports workspace identity/name, owner email, member and invitation counts, live and removed record counts, live/retained model bytes, pins, receipts, activity counts and last activity. It excludes task/note bodies and invitation credentials. The [database runbook](supabase/README.md#operator-hosting-inventory) also supplies account counts, including accounts without memberships. No public dashboard or automatic alerts are provided.

Before admitting another organizer, and regularly during the pilot:

- Review approved organizers, their quotas, workspaces, membership/invitation counts and unexpected growth. The initial approval registry is empty; the default approved-organizer quota is three workspaces.
- Compare `live_model_bytes` with `retained_model_bytes`. Removed-record payloads still count toward retained storage. Neither value is total PostgreSQL disk usage: indexes, Auth data, receipts, activity, other rows and provider storage add overhead.
- Check the project's database/disk metrics and the [organization Usage page](https://supabase.com/dashboard/org/esqhvarpcthnjgueshqg/usage); inspect Auth errors and delivery failures. Account for the email provider separately.
- Record operational findings and any approval/quota changes without copying task content or credentials into notes or logs.

Routine administration uses metadata and aggregate counts. Privileged operators can technically access hosted content; this is not end-to-end encryption. Open content only for a specific support request or documented security/operational investigation, limit the scope, and record the reason. Knowing the service's users, workspaces and resource consumption does not require routinely reading their task bodies.

Supabase states that its Free plan is not charged. Its Pro Spend Cap covers selected usage categories and excludes compute and several add-ons; it is not a universal dollar budget or automatic cost-alert system. Recheck the actual plan and quote before changing resources. See [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control).

## Access and deletion requests

Use **[chris@holtsnidertech.com](mailto:chris@holtsnidertech.com)**, the contact published on the [Holtsnider Tech website](https://www.holtsnidertech.com/), for privacy, support, access or deletion requests. Verify the requester and affected account/workspace before acting. Personal-browser data must be handled on that person's device; the operator has no hosted copy unless the person explicitly shared one.

There is currently **no automated account/workspace deletion or retention purge**. Removed tasks retain payloads for Undo; receipts, activity and invitation history remain stored. Do not promise that removing a card or member erases all hosted records, or claim a fixed deletion deadline that has not been implemented. Agree on the request's scope, check shared ownership and dependent records, and document the outcome and any retained copies. Do not delete rows ad hoc: that can break retry/Undo guarantees or other members' work.

Disabling organizer approval stops new workspace creation, not existing membership or invitations. Use the documented member/invitation controls for those boundaries and supported Auth ban controls for account suspension. A ban does not erase downloads or freeze an entire workspace. See [operator approval and suspension](supabase/README.md#operator-approval-and-suspension).

## Gates before shared mode is enabled

1. **Verify the installed SQL.** Inspect migrations, grants, RLS, security advisers and publication. Keep `dayboard_private` outside the Data API's exposed schemas. Confirm the approval registry and inventory are inaccessible to browser roles.
2. **Register and test the Auth hook.** Enable the Before User Created Postgres hook at `pg-functions://postgres/dayboard_private/before_user_created`. Applying SQL alone does not activate it. Test the actual hosted Auth endpoint with authorized test identities: unrelated signup rejected; approved organizer and current invitee admitted; expired/revoked invitations rejected. Admission must not itself grant membership. Keep anonymous sign-in disabled and email confirmation required. See [hook behavior](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) and [configuration/permissions](https://supabase.com/docs/guides/auth/auth-hooks).
3. **Configure and test sign-in delivery.** Name the actual provider, configure exact callback origins, and verify delivery to an invited address outside the Supabase organization. The built-in sender only delivers to infrastructure-organization members and is limited to two messages/hour; do not add application users to that organization to bypass it. See [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
4. **Complete hosted multiuser QA.** Verify two real sessions, simultaneous creation at quota, competing edits, removal while another session is open, reconnect/retry, invitation resumption and continued personal-board isolation. Local tests do not establish hosted Auth/PostgREST/Realtime or multi-connection behavior.
5. **Establish recovery and retention operations.** Choose and test a database backup/restore procedure, define how pilot deletion requests are fulfilled, and record the retention limits that actually apply. A board JSON export is not a database recovery plan. Ensure the public privacy notice matches deployed providers and current behavior.

The build requires `DAYBOARD_EMAIL_PROVIDER` to identify the configured sender and `DAYBOARD_AUTH_ADMISSION_VERIFIED=true` / `DAYBOARD_SMTP_VERIFIED=true` to attest that the relevant checks were completed. **These values are manual release attestations, not server security controls.** They do not register a hook, configure SMTP or prove a test happened. Set them only after recording successful verification. The Auth hook, verified identity and database authorization enforce access independently.

Keep `DAYBOARD_TEAMS_ENABLED` disabled until every gate passes. For backend access, the browser receives the dedicated HTTPS origin and a publishable key; never put service-role, secret or SMTP credentials into browser configuration. Follow [TEAM_ROLLOUT.md](TEAM_ROLLOUT.md) for acceptance criteria and the [database runbook](supabase/README.md) for exact operator commands.
