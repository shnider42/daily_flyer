# Staff sign-in setup

The `operator_only` connection mode enables email sign-in and a read-only Review desk while `enabled` remains false. It does not open participant submissions, voting, moderation writes or publication. The existing database ownership, role and approval gates remain authoritative; no schema or membership change is made by this frontend release.

Open Suggestion Box > Staff sign-in. Use the application's invited email address. The email may contain a link, a numeric code, or both depending on the configured Supabase template. Requesting a login uses `shouldCreateUser:false`. It cannot create a new Auth account through this form. The application login need not match the Supabase dashboard account. No actual email or account identifier is embedded in the website configuration or this document.

The standard Supabase implicit-link return is handled by the pinned client library. The tracker recognizes Auth return fragments and opens Suggestion Box; after processing, credential/error fragments are removed from the address bar. A returned session is checked with Auth.getUser and the database hllv_profile function. Only active configured moderators/reviewers can use the staff setup UI. Failed authentication leaves private access closed. Sessions are tab-scoped in sessionStorage, not localStorage. Private submissions and queue contents are not persisted by the page.

On successful moderator login, the Review desk is available. While the pilot is empty it states 'No submissions awaiting review.' This is a real account-access check, not a fabricated example. Signing out clears the private display. The full pilot still requires provider signup restrictions, participant notice/contact, email delivery tests, reviewer authorization and the agreed review protocol before server-side intake is opened.

Auth settings are not changed by this release. Check Authentication > URL Configuration: Site URL must be the deployed tracker origin and root path; allow the same redirect destination. The form requests that exact page as its email redirect. If an emailed link goes to localhost or another host, correct the provider setting and request a fresh email; do not paste tokens or links into chat. A code-only template should include `{{ .Token }}`. Previously accepted one-use invitation links need not be reused.

The automated tests simulate link/code success, Auth errors and different roles without sending messages or using real login tokens. Real signed-in use in the user's browser is the remaining confirmation. Tests do not establish SMTP delivery, all provider configuration, or an independent security audit.

References:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/sessions/implicit-flow
- https://supabase.com/docs/reference/javascript/auth-getuser
