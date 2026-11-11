# Private notebook API

The static Render UI uses a dedicated password to open one cloud-saved notebook.
It does not create an account in the existing project's Supabase Auth service.
These files create only `best_man_document`, `best_man_sessions`,
`best_man_attempts`, and the `best_man_check_attempt` RPC.

## Deployment

1. Review existing schemas, then apply `schema.sql` to the authorized DFE
   Supabase project. The schema enables RLS and revokes public, anonymous, and
   authenticated access. Only the Edge Function's service credentials have table
   access; the rate RPC is `SECURITY INVOKER`, with execution granted only to
   `service_role`.
2. Generate a cryptographically random one-time setup secret outside source
   control. Store only its lowercase SHA-256 hex digest in
   `best_man_document.setup_token_hash` for the `main` row, conditional on
   `password_hash is null`. Do not put the secret in this repository or the
   public build. Give the owner a setup URL with the secret in the fragment,
   which the client reads and immediately removes.
3. Deploy `index.ts` as the Supabase Edge Function `best-man-notebook`, setting
   `verify_jwt = false` for this function only. It implements its own opaque
   session authentication; turning off gateway JWT verification does not expose
   the notebook data without a valid session.
4. Keep `ORIGINS` in `index.ts` aligned with the actual Render URL. The default is
   `https://for-my-brother.onrender.com`, with localhost/127.0.0.1 port 8765 for
   browser verification. Other origins and originless mutations are rejected.
5. Run security advisors and verify status, denied anonymous state access,
   CORS, setup claim behavior, authenticated save/load, stale revision handling,
   and logout. Do not create the owner's password during deployment.

The function reads the injected `SUPABASE_URL` and prefers the new
`SUPABASE_SECRET_KEYS` JSON dictionary's `default` key, with
`SUPABASE_SERVICE_ROLE_KEY` as a compatibility fallback. Modern secret keys go
only in the server's `apikey` header; legacy JWT keys also use an Authorization
header. Neither key is included in the frontend or API responses. There are no
NPM dependencies.

## Contract

Base URL: `https://uwbhjgvpaetrhfvcpvsg.supabase.co/functions/v1/best-man-notebook`

| Method/path | Request | Response |
| --- | --- | --- |
| `GET /status` | None | `{initialized: boolean}` only |
| `POST /setup` | `{setupToken, password}` | `{token, expiresAt, data, version}` |
| `POST /login` | `{password}` | `{token, expiresAt, data, version}` |
| `GET /state` | `Authorization: Bearer <token>` | `{data, version}` |
| `PUT /state` | Bearer token; `{data, expectedVersion}` | `{version, updatedAt}` |
| `POST /logout` | Bearer token | `{ok: true}` |

`data` initially equals `null` and the server's revision starts at zero. Notebook
content has its own fixed schema `version: 1`; the top-level API revision is a
separate counter. A successful conditional save increments that counter by one.
A stale `expectedVersion` returns HTTP 409, code `version_conflict`, without
overwriting the newer notebook. The client should preserve/export local edits
before loading the newer copy.

Errors are JSON `{error, code}`. Relevant statuses are 400 (bad request/data),
401 (wrong password or missing/expired session), 403 (setup secret or origin
rejected), 409 (already initialized or stale revision), 413 (over-size body),
429 (rate limit, with `Retry-After`), and 500 (generic backend error). Responses
use `Cache-Control: no-store`.

## Data and authentication

- Passwords are 8–128 characters and use WebCrypto PBKDF2-SHA256 with 600,000
  iterations, a random 128-bit salt, and a constant-time digest comparison.
  Neither plaintext passwords nor setup secrets are persisted.
- Setup checks the one-time secret and uses a conditional database update to
  claim the row. Concurrent setup calls cannot change an existing password.
- Session tokens contain 256 random bits; only SHA-256 token hashes are stored.
  Sessions expire after 30 days, and logout deletes the current session.
- Notebook content is stored as JSON in Supabase and is not end-to-end encrypted.
  Anyone with authorized database administration access can read the content.
  Frontend downloads are ordinary readable copies and should be kept privately.
- The application accepts at most approximately 2 MB per notebook, validates the
  known v1 shape and field limits, and checks request bodies while streaming.
- The limiter stores daily HMAC address identifiers, scope, count, and expiry.
  It stores no raw IP addresses. Per-address limits are backed by global budgets
  so forged/rotating proxy address headers cannot create unlimited rate records.
  Expired rate records and sessions are removed during subsequent API traffic.
  Hosting infrastructure may retain its own ordinary request logs.
- There is intentionally no automated forgotten-password flow because the app
  collects no email address. A manual owner-approved reset can be implemented
  later; no reset endpoint is currently exposed.

## Local tests

```sh
node --experimental-strip-types --test server/best_man/index.test.mjs
```

The tests use mock REST responses and the real password derivation routine. They
cover concurrent setup, credential/session rejection, version-conflict handling,
logout, origin checks, rate-limit headers, schema validation, and modern/legacy
server-key behavior. Database-level grants and the SQL rate-limit function still
need verification on the target project after migration.
