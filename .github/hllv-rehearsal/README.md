# Private moderator practice

Open Suggestion Box > Review desk > Start private practice. Use example text or write a sample, acknowledge private practice, and save. Try asking for clarification, shortlisting in practice, revising, or deleting your test.

This is a limited rehearsal, not the real multi-person review pilot. It tests a moderator's ability to save and organize one sample privately. It does not test or impersonate Team17 review, send email, publish, transfer entries into the real queue, or accept community votes. Real participant intake and publication remain closed. All existing login configuration and account permissions are preserved.

The separate `hllv_private.rehearsals` table contains at most one record per moderator. It is owner-only even between moderators, has RLS enabled and no client table grants, and is excluded from all public projections and pilot counts. The only access path is the authenticated `hllv_rehearsal` wrapper; the private implementation checks active verified moderator membership, current Auth session existence/expiry, record ID and revision, allowed actions, bounded text/history and the existing request limit. Unknown actions, including publish/clear/vote, are rejected. No user metadata grants permissions.

Practice data stays in the hosted database until the owner deletes it or its Auth account is deleted; use sample text only. Delete removes the current practice record and its practice history, not independent infrastructure backups/logs. No real identities, email credentials, private practice content or authorization correspondence are committed to Git. Anonymous users cannot call the practice RPC. A reviewer account cannot use it either.

The UI does not load or create practice data automatically. It offers a moderator-only button. Stale async responses are ignored after navigation/signout. Missing practice assets do not prevent normal sign-in or the existing tracker from working. Revision changes reset the practice state to pending; this does not exercise real reviewer clearance. An explicit save is required even after filling the local example.

Backend verification used rolled-back synthetic hosted database fixtures, plus isolated CI tests. Browser fixtures simulate accounts and API results without sending real email or logging in as a real user. Public API checks use only denial probes. These checks are not an independent security audit or proof the entire multi-person pilot is ready.

Schema source: `.github/hllv-rehearsal/schema.sql`. The hosted migration is named `hllv_private_moderator_rehearsal`. The workflow uses the pinned Supabase CLI to generate a replay file under `suggestion_box/supabase/migrations/`; it does not link or push a database from CI. Apply the existing `suggestion_box/migrations/001_pilot.sql` and `002_issue_catalog.sql` first when replaying into a new isolated database. Do not reapply an already recorded hosted migration.

To remove the UI, restore the pre-practice tracker release `3383c34f611ef452bdd9cb4351a6ce9991c3e4e4`. Do not drop private storage as a UI rollback. To disable backend practice, revoke EXECUTE on public.hllv_rehearsal(text,jsonb,uuid,integer) and hllv_private.rehearsal(text,jsonb,uuid,integer) from authenticated; existing pilot functions are separate.
