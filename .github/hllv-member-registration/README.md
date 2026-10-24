# Self-service Member registration

Create account uses public Supabase auth.signUp, not an administrator API. There is no role picker or membership-table write. The existing participant role is labeled Member. Three new submissions per rolling 24 hours, moderator quota exemption, private ownership, approval and voting rules remain unchanged.

Email verification is required. Signup and resend check public Auth settings for email enabled, signup allowed, and mailer_autoconfirm=false. The redirect is the canonical https://hllv-bug-track.onrender.com/ URL, never a query-supplied destination. An accepted request is not described as a verified account or delivered email. Existing/duplicate responses are not used to enumerate accounts. Password fields are cleared after requests; the new component does not persist passwords or email drafts. The original session component is unchanged.

## Delivery prerequisite
Public settings reported disable_signup=false, mailer_autoconfirm=false, external.email=true. They do not expose custom SMTP. External recipient delivery has not been verified. Normal outside-user onboarding needs a working custom SMTP sender or Send Email hook. Do not add users to the Supabase organization or turn off email confirmation to bypass delivery problems. Ensure Site URL and allowed redirects include the canonical tracker URL.

Connected tools do not expose SMTP or Auth-setting updates. This release does not change hosted configuration, create real users, or send test emails. Browser tests simulate confirmation. A real recipient-inbox verification remains an operator acceptance check. Before broad public promotion verify delivery, configure CAPTCHA with its frontend widget, and review staff MFA and compromised-password protection. Existing Auth rate limits remain; a frontend cooldown is not an abuse boundary.

## Verification and rollback
Run the existing isolated PostgreSQL authorization/quota/vote suite and Chromium/WebKit regression and registration tests. Hosted tests GET public settings or read anonymous board/status only. No privileged credentials in workflows. Evidence and nightly feed content are preserved.

Rollback by restoring the previous password/community asset references and setting site config account_registration to invite_only. Do not remove accounts or submissions created during rollout.
