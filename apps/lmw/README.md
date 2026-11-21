# LMW connections — DailyFlyer proof of concept

A lightweight event follow-through demo using Lesson Missionwide (LMW) as a fictional placeholder name. Independent prototype operated by Holtsnider Tech; it does not represent an approved organization service or an imported alumni directory.

## Experience

- `/?event=networking-night`: three short steps, no attendee account. Required first and last names, graduate year (with current/unsure choices), and email; optional phone/employer.
- Engagement choices distinguish yes, maybe, and not right now. Interest is an invitation to talk, not a committee or volunteer commitment.
- Optional availability and "What could this community help you with?" make responses actionable and reciprocal.
- Follow-up permission is explicit and separate. No newsletter subscription, email, SMS, or message is sent by this application.
- Each saved response has a private capability link for review, changes, and deletion. Treat that link as a password. It is kept in memory, not browser local storage; copy it before closing the page.
- `/organizer/`: separate organizer workspace. This opens to sign-in; real responses require the private access key.
- `/organizer/#demo`: visibly marked demo with 30 fictional responses. These never enter the database. The original `/#organizer` link redirects here.
- `/organizer/#qr`: locally generated QR and printable event sign; no third-party QR tracking service. The original `/#qr` link redirects here. QR and private participant links always point to the attendee root URL.
- The Display menu offers System, Light, Night, and High contrast. System follows device dark-mode and increased-contrast preferences. Only the display choice is stored locally; no answers, contact details, or access keys are persisted in browser storage.
- The mobile form uses a compact introduction, single-column fields, large touch controls, and normal-flow actions that do not cover the on-screen keyboard. Later steps collapse the introduction. Internal navigation preserves the unfinished form in memory.
- Live organizer access uses a separate high-entropy private key. That key is never included in source or public assets. A link fragment can hand it to the browser without transmitting it as a URL parameter; the app removes the fragment after reading it. Keep the organizer link private.

## Implementation

`public/` is dependency-free HTML, CSS, and JavaScript. Run `node apps/lmw/build.mjs` from the DailyFlyer repository and publish `apps/lmw/dist` as a Render static site. The build creates the attendee page and an explicit `/organizer/index.html` shell so the organizer URL can be opened or refreshed directly. Serve `dist/` for local previews after building. No SPA rewrite rule is required.

The Supabase Edge Function `lmw-connect` is the only data path. The `public.lmw_*` tables have row-level security enabled and no anonymous/authenticated grants. The Edge Function alone holds database privileges, and it validates the appropriate participant or organizer capability for every sensitive action. Public GET returns event metadata only. The schema and Edge Function are in `backend/`.

The pilot uses isolated tables on the existing shared DFE Supabase project. It does not read any other app's data. Before a separate organization's long-term handoff, move the same schema/function to its own Supabase project and issue new organizer credentials.

## Data handling

Email addresses are supplied by attendees and are not verified. A second submission cannot replace a previous person's response just by knowing their email. Retries with the same response ID and management key are idempotent. Duplicate addresses remain separate records for an organizer to review.

Consent choice and notice version are recorded with each response. Preferences expire 90 days after the latest attendee save; expired records cannot be read through the app. Cleanup is performed on API requests; see backend retention setup for the scheduled database purge. Hosting providers may retain operational logs or backups outside the app's active tables. A person can delete their active record immediately using their private link.

Public writes are validated, size-limited, and subject to transactional quotas. Network limit keys use a one-way keyed digest; raw IP addresses are not stored in the application tables. Capacity is suitable for an approximately 30-person networking pilot, not an unrestricted public marketing campaign.

The outreach CSV excludes people who did not permit email follow-up. Exported cells are protected against spreadsheet formula injection. Downloaded exports are independent copies; operators must delete them when they are no longer needed and honor later withdrawal requests.

## Pilot operation

1. Try the attendee flow with fictional details and delete the test response.
2. Open `/organizer/` and sign in with the private organizer key. Use the separate demo link to explore fictional data. Sign out when finished; a refresh also clears the in-memory key.
3. Print the QR sign for the event. The short URL remains visible as an alternative.
4. Follow up only about the interests a person selected, through the channels they permitted. Record planned/connected/closed status.
5. Close intake when the event pilot ends. Review duplicates manually; no automated merge asserts that an unverified email proves identity.

## Temporary demo branding

Lesson Missionwide is a fictional placeholder name pending approval of organization-specific branding. Keep the LMW acronym, URLs, QR destination, API names, and stored data identifiers stable. The demo does not link to an organization's official website or imply its approval. No actual event date, venue, participants, committee openings, or endorsements are invented.

When approved branding is restored, update the visible name in `public/index.html`, `public/app.js`, the organizer title in `build.mjs`, the style comment, and this documentation; also review the placeholder notices and any approved external link. Rebuild both attendee and organizer pages together. No data migration or QR regeneration is needed for a name change.
