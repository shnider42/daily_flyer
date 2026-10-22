# New Passage portfolio and editor

New Passage remains the DFE theme `your_passage` on `feat/your-passage-site`. The review site is https://mypassages.onrender.com. Its public Services, Experience, Meet Tim, Getting started and Practice views share the same loaded page. The desktop sidebar is transparent; mobile keeps a translucent sticky bar with a direct Services link. Tim's portrait lives in Meet Tim. The lead reads “What comes next?”

## Portfolio experience

`#experience` loads published portfolio entries from Supabase when opened. Cards have a category, date, title, short introduction, optional photo, organization, expandable story/outcome, supporting HTTPS link, color and display order. The visual hierarchy follows HoltsniderTech's project-specific cards and progressive detail without transferring its technical copy or inventing achievements for Tim.

No accomplishments, testimonials or results were invented. The initial portfolio is empty and clearly says that selected experience is being prepared. Tim's already-established 40+ years, six countries and four continents remain visible. Services and booking continue working if the portfolio cannot load.

`#portfolio-editor`, linked as “Tim's sign-in” in the footer, supports email/password sign-in, creating and selecting entries, live card previews, photo uploads, draft saves, explicit publishing and unpublishing. Unsaved changes survive switching views. Switching entries/reloading requires confirmation if there are unsaved changes. Closing the tab warns about unsaved editor work. Sign-out clears private content, including late responses from in-flight requests, and does not clear the separate practice notebook.

Saving a draft does not change a published card. Publishing copies the saved draft to a public snapshot; unpublishing retains the draft. Every mutation requires the expected version to prevent silent overwrites from another tab. No delete function is provided in this first pass; unpublish removes public visibility without destroying the saved work.

## Supabase boundary

The existing `SuggestionBox` project (`uwbhjgvpaetrhfvcpvsg`) is reused. No new paid project, shared Auth setting, HLLV membership or HLLV data is changed. New Passage has its own private schema, editor allowlist, API functions and private image bucket. Infierno Liberado's app-level sign-in and server-enforced authorization were the implementation reference, not a shared moderator permission.

- Private schema: `new_passage_private`, with `editors` and `entries` tables. RLS is enabled and ordinary clients have no direct table grants.
- Public RPCs: `np_portfolio`, `np_editor_entries`, `np_save_entry`, `np_set_publication`. Public wrappers are security invokers. Narrow internal security-definer functions use an empty search path and explicit grants; private operations check the editor allowlist, verified email, bans and a live matching `auth.sessions` row.
- Membership does not use user-editable metadata. Revoking `editors.active` blocks subsequent reads and mutations even with an otherwise valid JWT.
- No real editor is assigned yet, per Chris's choice to set Tim up later. No real Auth users, invitations or passwords were created.
- `portfolio-config.json` contains only a public project URL and publishable key. There is no service-role key or database password in the site.
- The same pinned Supabase JS version used by the Infierno integration (`2.105.0`) loads from jsDelivr on demand. It is not required for the landing page, Services or Practice. Public portfolio text uses a lightweight read-only RPC fetch.
- Editor sessions use `sessionStorage` with the separate key `new-passage:editor-session`; blocked browser storage falls back to memory. No editor passwords, drafts or photos are persisted in browser storage by this module. Supabase manages access/refresh tokens. Auth redirects are not consumed by this password-only flow.
- Raster uploads accept JPEG, PNG and WebP up to 4 MiB. Immutable object names live in the private `new-passage-portfolio` bucket. Editors can upload/read; public image reads require a published entry referencing the object. Signed image URLs expire after 120 seconds, so a previously issued link can remain usable briefly after unpublishing.
- Old/unreferenced images remain private. Automated orphan cleanup and entry deletion are not in this initial pass.

The source migration was created by the CLI; automatic review then stopped the CLI's unsolicited analytics connection. Schema deployment used the connected Supabase tool. The committed filename follows the authoritative hosted migration version, `20261022223034_new_passage_portfolio.sql`. Do not push this repository's partial migration history over the entire shared project; HLLV maintains its own earlier migrations.

## Assigning Tim later

1. Confirm Tim's exact intended application email. Create or invite the account using managed Supabase Auth, or identify an existing verified Auth account. Do not fabricate a verified user with SQL or reuse the dashboard-login identity by assumption.
2. Set up the password through the supported Auth flow. If sending an invitation or reset link, explicitly choose the appropriate return URL without replacing HLLV's global redirect settings. Sending an invitation has not been authorized or performed in this pass.
3. After confirming the account, add its actual Auth UUID to `new_passage_private.editors`. Do not grant HLLV moderator access, organization membership or service keys.
4. Verify real password sign-in, a draft save, photo upload, publish, unpublish and sign-out in Tim's browser. Synthetic and mocked tests do not prove a real person's credentials or email delivery.
5. To revoke access, set this allowlist row's `active` to false. Re-enable or remove it only deliberately.

## Verification

- Six Flask/DFE integration tests, ten practice tests, eight appearance tests, nine navigation tests and six portfolio UI tests pass.
- `tests/new_passage_portfolio_security.sql` runs against the hosted database in a rolled-back transaction. It tests draft/public separation, publish/unpublish, optimistic concurrency, field validation, direct-table denial, anonymous and unrelated-user denial, valid and missing sessions, membership revocation, and draft/published image RLS. No synthetic users, entries, memberships or image rows remain afterward.
- A real anonymous HTTP request to `np_portfolio` returns `200 []`; `np_editor_entries` returns `401` permission denied. The pinned SDK URL returns 200.
- Supabase's security advisor has no new warning-level database finding. The two new private tables have intentional informational “RLS enabled, no policy” notices because access is through checked functions. The shared project's existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains; no global Auth setting was changed.
- Browser visual QA remains unverified: the environment previously blocked browser access to the local preview. CSS sizing, DOM and security tests do not prove desktop/mobile pixel fit, contrast on every background placement, or animation timing.

Run UI checks after exporting through DFE:

```sh
node tests/test_new_passage_portfolio.cjs /absolute/path/New-Passage-preview.html
```

The preview HTML includes the theme and portrait. Portfolio loading, editor sign-in and photo storage require internet access. The practice notebook remains browser-local and separate from the portfolio.
