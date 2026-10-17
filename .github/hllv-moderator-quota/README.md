# Moderator submission quota

Verified active site moderators have no daily cap on new community submissions, across improvement ideas, problem reports and tracked-bug priority requests. Everyone else retains three new community submissions in a rolling 24 hours, shared across types. The server checks the role from the existing membership table, not client parameters or user metadata. No new roles or account-management powers are introduced.

The existing per-minute request throttle, authentication, pending-first moderation flow, server validation and one removable vote per account per published wording version are unchanged. A test submission is still real private content unless deliberately published; it is not automatically marked as sample content.

Run test_database.py only against an isolated localhost PostgreSQL database: it creates and resets synthetic fixtures. Browser tests intercept identity and mutation responses; they do not send real credentials or create live suggestions/votes. The release workflow requires the hosted public status endpoint to confirm the migration before publishing role-aware UI text. Existing reviewed issue data, nightly collection, authentication assets and Type styling remain unchanged.
