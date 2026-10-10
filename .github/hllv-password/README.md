# Existing-account password sign-in

This update adds the ordinary email/password form, an authenticated Set or change your site password form, optional remembered sessions, a visible account strip, and password recovery. The existing managed Supabase client remains pinned at 2.105.0. There is no account-creation API, account replacement, role migration, database DDL, automatic email request, or participant opening.

## User journey
Refresh the existing signed-in tab, choose Account & password, and set a unique site password (12 or more characters in this UI). Leave current password blank for the first password or recovery. Set Keep me signed in only on a trusted device. The password change is made by Auth.updateUser for the current verified user; it never supplies a replacement user ID. Next time use the same application email and site password. Forgotten passwords and email-link fallback still depend on email delivery and correct Supabase redirects. Real password setup and sign-in must be completed by the account owner; test fixtures do not establish their credential works.

## Session behavior and boundaries
Legacy tab sessions are adopted without automatically enabling persistent storage. Unchecked sessions remain in sessionStorage, with a same-origin BroadcastChannel bridge for other open tabs. Checked sessions use localStorage. A browser-wide logout generation prevents dormant tab copies from automatically restoring an old login. Browser session restoration and privacy settings can affect retention; other browsers/devices always need separate authentication. No plaintext password is written to browser storage, URLs, Git, or logs.

The bridge transports ordinary session tokens only between same-origin tabs. It does not validate identity or grant roles. Supabase Auth.getUser and the checked database profile/role functions remain authoritative. This is a static-client application: tokens in either browser storage are accessible to same-origin JavaScript, not HttpOnly cookies. Persistent mode is an explicit opt-in and must not be represented as XSS-proof. Staff MFA, provider password policies and leaked-password protection remain launch-review items; this update does not claim to configure or enforce MFA. Real intake, publication and reviewer authorization are unchanged.

## Tests and release
Node tests cover session adoption, open-tab sharing, opt-in persistence, logout generations, invalid input, error redaction and API restrictions. The browser test uses synthetic Auth/role responses only; it never sends real credentials, user emails, or community writes. The public smoke test exercises the real SDK without signing in. Whole-page/production checks must pass before a release is called live. Previous UI-clarity receipt work is a separate prepared change, not silently included here.

Sources: https://supabase.com/docs/guides/auth/passwords ; https://supabase.com/docs/guides/auth/sessions ; https://supabase.com/docs/reference/javascript/auth-updateuser
