# Active community-moderated Suggestion Box

This replaces the public-facing developer-gated pilot with the site owner's requested community workflow:

Verified site account submits privately -> a site moderator approves the exact wording -> everyone can read it -> verified signed-in users can support it. A moderator can submit and vote too. The board always labels approval as Moderator approved, never Team17 review or an implementation commitment.

## Access and scope
The existing business-email password login, password recovery and session modules are preserved byte-for-byte. Existing verified Supabase application accounts can participate; the old pilot invitation-membership restriction is not required for ordinary participants. Public self-registration was NOT added and provider invitation/delivery configuration is not changed. Existing site-owner-controlled hllv_private.members entries are the only source of moderator authority. There is no client-side self-promotion and no new moderator assigned automatically. Expired sessions, banned/anonymous/unverified Auth accounts and inactive site membership are denied private actions. Only public approved records are accessible without authentication.

Community submissions reuse the canonical submissions and votes tables, with publication_mode='community'. Community approvals have their own table and cannot manufacture a developer review. The original strict-pilot functions and state stay unchanged; this is an explicit new authority model, not a forged reviewer clearance. Old records retain publication_mode='developer'. Existing private practice remains separate, preserved, and accessible from Review queue -> Practice and moderator access.

## User interface
Submit a suggestion is the prominent top action, including on mobile. The board uses compact vote rails and expandable suggestion text. My suggestions and a moderator-only Review queue are separate. Saves show a persistent server-backed receipt with timestamp, state and visibility. Moderation offers Approve & publish (explicit confirmation), Request clarification and Do not publish. Notes to authors remain private and do not send emails. Publication makes the suggestion public immediately; votes are one removable vote per verified account per wording version. Votes never change evidence, severity or developer status.

Revising a published entry returns it to private review and starts a new wording version with zero carried-over votes. Withdrawals remove it from public display. Notes and activity history are retained in the project database until the operator removes them; backup/log retention is separate. The notice says so instead of promising an unimplemented deletion policy. No private text or credentials are committed to Git or saved in browser storage by the board. The SDK retains session tokens under the pre-existing user-selected session policy.

## Technical controls
The hllv_community dispatcher exposes status and approved board reads anonymously. Every other branch checks a verified live session, and queue/publication branches also require the moderator database role. Private tables keep RLS and no raw client grants. SECURITY DEFINER code remains in the unexposed private schema with an empty search_path; the public wrapper is SECURITY INVOKER. Private projection is selected internally, never by an untrusted client flag. No service key is exposed.

Mutations use the existing serialized request limit; new submissions are capped at three per account per 24 hours. Creation uses a per-account request UUID to make retries idempotent. Editing/moderation checks the observed version and server timestamp. A failed save offers a read-back instead of blind retries. Old version votes are retained historically but excluded from the new version's score. Lists are paginated at 20 rows. Public output excludes account emails, owner/reviewer/moderator identifiers, private replies and voter identities.

## Release and verification
The schema is installed as a new migration with community_settings.enabled=false. Enable it only after isolated SQL/browser tests and hosted boundary checks pass. The release workflow does not receive privileged Supabase credentials or modify hosted accounts. Deployment requires the live public status function to report enabled=true. Tests use isolated PostgreSQL and synthetic browser identities; no real user credential or approval is fabricated. Real moderator interaction is a user acceptance test, not an independent security audit. Staff MFA and email-delivery production hardening remain independent work.

Rollback the public UI to ad6d28d0acbf37906f675f2151a720fb0386b29c and pause community_settings.enabled; do not drop submissions, votes, practice or account tables. Existing public community entries can still be read via the approved-board RPC when intake is paused; moderation can hide them. Old pilot settings are intentionally not a status source for this new community mode.
