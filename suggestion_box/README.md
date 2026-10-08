# Suggestion Box — invitation-only pilot

## Deployment boundary

The third site section is `#suggestions`: Bulletin Board, Submit a suggestion, My submissions, and a role-gated Review desk. It is deliberately closed by default. No example approvals, sample votes, real invitations, private records or Team17 partnership claims are published.

The managed-auth adapter and PostgreSQL review/voting implementation are included. They are NOT a configured hosted backend until a dedicated Supabase project is connected and the launch checklist below is completed. Keep the public `suggestions-config.json.enabled` false until then. This code change does not create a paid account, another Render service, or a live submissions database. Choose backend and email plans before activation.

## Pilot rules

20 invited participants; 15 total submissions; two per participant; five shortlisted entries. Withdrawn entries still consume intake capacity. Moderator screening is separate from reviewer clearance. Reviewer authority is assigned by the operator using a private authorization record, never inferred from an email domain or user metadata.

Only the exact owner-accepted wording version can be cleared. A moderator must separately publish a cleared batch. Silence, hold and clarify decisions never publish anything. Publication starts a server-timed seven-day voting window. One removable upvote per active participant account per published version. No downvotes, comments, attachments, reputation points or anonymous voting.

Editing hides a public entry and invalidates clearance. Moderator rewrites also require the author's acceptance. Old-version votes do not transfer. Withdrawal hides the entry; duplicates are linked privately, with no silent vote merging. Votes rank publication-cleared suggestions among participating invitees—not all ideas, all players, bug severity, or developer priority. They never change game evidence or editorial timestamps.

## Data security

Do NOT expose `hllv_private` in the Supabase Data API. Every table has row-level security enabled, and API roles have no direct table grants. Public wrappers are SECURITY INVOKER. Narrow private implementations have empty pinned search paths, restricted execution grants and server-side ownership/role/state checks.

The public board is a separate allowlisted projection without author IDs, emails, voter identities, private notes, correspondence references or the invitation roster. Participants can retrieve only their own submissions. Reviewers receive shortlisted text without author identifiers. Original wording versions and decisions are retained privately for audit. A reviewer role is not proof of organizational authority; record that authorization and public-attribution consent explicitly before enabling the pilot. Revocation and expiry fail closed.

The browser uses Supabase email OTP (`shouldCreateUser:false`) with a tab-scoped session. Public and anonymous signups must also be disabled at the provider. All real permissions live in PostgreSQL, not in hidden buttons. Client configuration accepts only an `sb_publishable_...` public key; never put service-role, secret, database or SMTP credentials in the website or repository. The SDK is pinned and loaded only for a configured connection. No private submissions are stored in browser storage.

## Activation checklist

1. Connect a dedicated Supabase project; review its account and email costs before provisioning. Apply `migrations/001_pilot.sql` and `002_issue_catalog.sql`. Do not grant API roles raw table access or expose the private schema. Review the project security advisor.
2. Configure working production email delivery, OTP templates using `{{ .Token }}`, appropriate expiry/rate limits/CAPTCHA, allowed site URLs, and disabled public/anonymous registration. Test actual invitations, email codes and session expiry with operator-controlled accounts. CI does not test real mail delivery.
3. Create the moderator account via managed Auth, verify its email, and assign its actual UUID the `moderator` role in the private members table. No real identity is provisioned by this change.
4. Agree with the contact on reviewer authority, public wording, publication-clearance meaning, review timing, private correspondence handling, participant contact and retention/deletion procedure. Record the protocol privately. Assign a verified reviewer UUID with the consented public label, private authorization reference and explicit authorization expiry. No Team17 representative has been contacted or authorized by the code.
5. Invite at most 20 participants and assign participant membership. Use actual verified Auth UUIDs through an operator-only database connection. Never put the real roster or correspondence into this public repository.
6. Configure the PUBLIC `hllv_tracker/suggestions-config.json`: HTTPS project URL, publishable key, actual participant contact, retention notice and matching policy version; then set enabled true. Keep all privileged keys out of this file. Run `.github/hllv-pilot/install.py` and all tests; publish the HTML, manifest and immutable assets together. Verify cross-account isolation on the actual hosted project before participant intake.
7. In the protected settings row, explicitly record the agreed protocol, authorize publication and set phase to intake. The client configuration alone cannot open intake. Switch phase to review when the shortlist is ready. A moderator publishes the selected cleared batch from Review desk; the database starts the seven-day vote.
8. Close writes using phase closed. To suspend public visibility, also set publication_authorized false. Follow the agreed private-record retention/deletion procedure. Withdrawal hides content; it is not deletion and cannot retract third-party copies.

## Review operation

Moderators can request clarification, shortlist, decline, mark duplicates or propose rewritten text. The author must accept a moderator rewrite before shortlisting. An anonymized shortlist output excludes account identifiers and private references; manually check the text itself for personal information before sharing it through the agreed channel. The export does not send anything.

This first implementation requires the authenticated configured reviewer to record clearance. It does not let a moderator impersonate a reviewer or fabricate a proxy approval from private correspondence. Offline discussion is possible, but any proxy-clearance recording workflow needs a separately agreed implementation. Reviewer clearance does not publish; the moderator's publication action is distinct and version-checked.

After the first round, evaluate reviewer usefulness/willingness to repeat, moderator effort, participant understanding, voting participation, and any privacy failures. Shipping a game feature is not a pilot success requirement.

## Tests

`node --test .github/hllv-pilot/test_ui.cjs` checks configuration gates, key restrictions, escaping, deterministic ranking and related issue links.

`PILOT_TEST_DATABASE_URL=... python suggestion_box/tests/test_database.py` uses real ephemeral PostgreSQL with synthetic auth.uid/auth.users fixtures, never actual accounts. It covers ownership isolation, direct-table denial, role separation, version/approval gates, privacy projection, capacity limits, atomic publication, concurrent voting and removal.

`python .github/hllv-pilot/test_browser.py [--engine webkit]` checks the closed production shell and a clearly isolated synthetic managed-auth adapter. Existing issue/source browser tests also run. These checks are not an independent security audit or a substitute for hosted Auth/email verification.

Run the narrow GitHub workflow to test before publishing static integration. It commits only tested tracker output and the generated public issue-ID catalog; it does not modify other Daily Flyer apps. The source installer preserves all game evidence and changes only the page publication timestamp.

Rollback UI baseline: `d226ba8bef2cbb33d1b9cfb2fee0e7d143754332`. Disabling public configuration is not database-access revocation; also close server settings/revoke memberships. Do not drop private storage for a UI rollback.

Primary implementation references:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
