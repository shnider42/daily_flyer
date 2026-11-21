# LMW pilot backend

This backend belongs to the independent DFE Leadership MetroWest proof of concept. It does not send email or SMS, enroll people in a newsletter, or publish a member directory.

## Deploy

1. Apply `schema.sql` as a Supabase migration after checking existing schema names. Every table and RPC is prefixed `lmw_`.
2. Generate an organizer key from 32 cryptographically random bytes, encoded as 64 lowercase hex characters. Store only its SHA-256 hex hash in `public.lmw_organizer_keys` with a descriptive label. Deliver the original key privately to the owner; do not put it in source or frontend configuration.
3. Deploy `index.ts` and `validation.mjs` as the `lmw-connect` Edge Function with `verify_jwt=false`. Metadata and new intake are deliberately public; every participant read/change and organizer action is separately authorized in the function.
4. Point the frontend at the function URL. No Supabase browser key or backend secret belongs in the frontend.
5. If supported, apply `retention.sql` in a separate migration to install `pg_cron` and run hourly expiry cleanup. Verify the job exists and executes successfully. Without this job, expired records are immediately excluded from application reads but physically deleted only on new submission or organizer access. Do not claim scheduled deletion until the job is verified.

The Edge Function uses `SUPABASE_URL` and the `default` entry from the platform's `SUPABASE_SECRET_KEYS` JSON environment variable. It falls back to `SUPABASE_SERVICE_ROLE_KEY` for older projects. These credentials remain server-side. `LMW_ALLOWED_ORIGINS` may contain additional comma-separated **exact origins**; the production default is `https://dfe-lmw.onrender.com`. HTTP localhost is permitted for development. CORS is a browser access rule, not the authorization mechanism.

## API

All writes and private reads are JSON POSTs containing `action`. Successful responses include `ok:true` for mutations. Errors use `{ok:false,error:string}` and a suitable HTTP status. No response returns a token hash or organizer key.

| Action | Required input | Result |
| --- | --- | --- |
| `GET ?event=networking-night` | None | `{event:{slug,title,is_open}}` |
| `submit` | `event_slug`, UUIDv4 `id`, 64-hex `manage_token`, `data`, empty `website` honeypot | `{ok:true,id}` |
| `manage_get` | `id`, `manage_token` | `{response:{participant fields}}` |
| `manage_update` | `id`, `manage_token`, `data` | `{ok:true,response:{participant fields}}` |
| `manage_delete` | `id`, `manage_token` | `{ok:true,deleted:true}` |
| `admin_list` | Organizer header | `{responses:[...],event:{...}}` |
| `admin_update` | Organizer header, `id`, `status`, `note` | `{ok:true,response:{...}}` |
| `admin_delete` | Organizer header, `id` | `{ok:true,deleted:true}` |
| `event_update` | Organizer header, `title`, boolean `is_open` | `{ok:true,event:{...}}` |

The organizer header is `X-LMW-Organizer-Key`. Keys authorize this pilot only. A participant's private link is a bearer capability: anyone who has it may read, update, or delete that participant's response. Place it in the URL fragment, never a query string, and ask the participant to save it. There is no email recovery flow. No emails are sent automatically.

`data` contains `first_name`, `last_name`, `graduate_year`, `email`, optional `phone` and `current_employer`, `engagement` (`yes`, `maybe`, `not_now`), `interests` (`network`, `committee`, `volunteer`, `mentor`, `event`, `idea`), optional `availability` (`one_time`, `occasional`, `ongoing`, `unsure`), optional `help_needed`, `contact_permission` (`email` or `none`), boolean `phone_permission`, and `privacy_consent:true`.

An email address is unverified. Multiple independent responses may use the same address; submitting an address never grants the ability to overwrite an existing record. An identical repeated submission with the same ID and management key is idempotent. If someone edits their answers after a network failure and retries with that same private key, the stored preferences are updated atomically, including any withdrawal of contact permission. Subsequent corrections normally use `manage_update`. Organizers should resolve accidental duplicates and obtain permission before making introductions.

## Access and retention

- All four tables enable RLS, revoke all access from `PUBLIC`, `anon`, and `authenticated`, and grant only the backend `service_role`. No cross-app user or schema access is added.
- Both SQL functions use `SECURITY INVOKER`, an empty search path, and explicit service-only execution grants.
- New submissions are serialized per event to enforce a 1,000-response cap. An HMAC bucket allows 100 submissions per 15-minute network window, enough for 30 people sharing venue Wi-Fi. No raw IP is stored in application tables. Hosting providers may independently keep operational logs.
- Request bodies are streamed with a 12 KiB byte limit. Known fields and finite choices are validated; unknown fields are discarded. SQL constraints provide a second boundary.
- Contact permission is explicit. Phone consent requires both a phone number and email follow-up consent. No-follow-up records cannot be marked `planned`; withdrawing permission sets status to `closed`.
- Records become inaccessible exactly 90 days after the participant's last save. Organizer notes/status changes do not extend retention. The hourly job physically removes expired application rows; infrastructure backups and logs follow provider retention.
- Deletion permanently removes the application row. Organizer capability keys can be revoked by setting `is_active=false`.
- CSV/export encoding and safe DOM rendering belong to the frontend. Backend JSON fields remain untrusted user input.

## Verification

Run `node --test backend/validation.test.mjs` from the parent directory. After deployment, verify live anonymous table access is denied, a synthetic form saves, a different private key cannot read it, the correct key can update and delete it, and organizer access fails without the key. Check migration grants/RLS and the retention job. Remove synthetic records after verification.
