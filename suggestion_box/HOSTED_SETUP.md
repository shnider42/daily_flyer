# Hosted Suggestion Box setup — October 8, 2026

## What is connected

The existing dedicated Supabase project `SuggestionBox` (`uwbhjgvpaetrhfvcpvsg`) now has the reviewed schema from `001_pilot.sql`, with the 75 canonical issue IDs from `002_issue_catalog.sql`. No new project, paid service, real user, invitation or reviewer authorization was created. Database phase remains `setup`, publication authorization remains false, and the public board is empty.

The site configuration uses `connection_mode: read_only` with `enabled: false`. This mode calls only the public status and Bulletin Board functions. It does not load the Auth SDK, render email inputs, request codes, or allow a private action. A read-only mode is a deployment boundary, not the security boundary: the database still enforces membership, role and publication checks. A browser-side configuration change cannot supply those permissions. The publishable API key is intentionally public; it is not a service-role or database credential.

The actual hosted database was tested using temporary synthetic rows inside a rolled-back transaction: private owner access, cross-account denial, anonymous/private table denial, moderator/reviewer separation, explicit version clearance plus separate publication, duplicate/removable votes, edit invalidation and reviewer expiry. All synthetic users, memberships, suggestions and decisions were rolled back. These SQL-role tests do not prove real Auth token issuance, email delivery, session expiry or every security property.

The security advisor reported ten informational RLS-without-policy notices. These private tables intentionally have no direct anon/authenticated table grants and no permissive row policies. Access is via narrow checked functions; adding broad policies merely to silence the notices would weaken the design. No warning/error-level database security findings were returned at that check. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Remaining launch gates

1. Confirm the operator's moderator sign-in email. Create/invite the real account through managed Auth, verify its email, and then assign its actual Auth UUID the moderator membership. Do not fabricate verified users through SQL for the real pilot. No account roster belongs in this repository.
2. Configure Auth in the project's dashboard: disable public signups and anonymous sign-ins, keep email confirmation required, set the actual site/redirect URLs, and configure the Magic Link email template to include `{{ .Token }}` for this code-entry UI. Verify actual hosted invitation, code entry, code expiry, sign-out and cross-account isolation before collecting participant text.
3. Configure appropriate email delivery for external invitees. The default Supabase mail service is restricted to project-team addresses and is not sufficient for a community pilot. Choose/confirm a delivery provider before adding cost or SMTP credentials. Never commit those credentials. Provider settings and templates have not been configured by this database migration.
4. Agree on the reviewer identity, authorization expiry, publication wording, participant contact and retention/deletion procedure. Keep correspondence private. The backend does not interpret a connection or favorable feedback as Team17 authorization.
5. Fill the contact/retention notice and matching policy version, explicitly switch out of read-only configuration only after Auth tests, assign invited memberships, and open server-side intake only when the agreed review protocol is in place. Publication still requires the authorized reviewer and a separate moderator action.

## Verification commands

The connection workflow runs original database and UI tests on an isolated test database, plus `.github/hllv-connection/test_connection.py` against the hosted project's public API and ordinary production homepage. Only denial probes and public reads reach the hosted API. The Auth settings probe reads public flags only; it does not check SMTP credentials, the email template or deliverability.

Website availability, authentication readiness and approval readiness are different states. Do not call this pilot open until all launch gates have been completed.
