# Next Chapter — DailyFlyer career journal

A complete browser-local job-search workspace with a paper-and-ink visual identity. Built on the `feat/next-chapter-career` branch from DFE `staging`; unrelated themes are unchanged.

## Run / deploy

- Build: `python3 scripts/build_next_chapter.py`
- Test: `node --test tests/next_chapter/*.test.mjs`
- Render Static Site: `node --test tests/next_chapter/*.test.mjs && python3 scripts/build_next_chapter.py`
- Publish directory: `dist_next_chapter`
- Branch: `feat/next-chapter-career`
- No dependencies, paid API, database, secret, or runtime server required.
- Existing DFE Flask server: `/?theme=next_chapter` or `/next-chapter/`.

## Working features

Daily due/overdue actions; separate fictional demo and personal workspaces; opportunity CRUD with reversible archive; board/list views, search and stream/stage filters; editable stage/outcome, compensation and assessed fit; recruiter/contact notebook; editable interviews and events with agenda/month calendar; editable follow-ups with completion/reopen; local attachments, text documents and opportunity links; editable fieldnotes; outcome counts and fit/pay scatter with accessible table; Simple/Moderate/Expert, day/night, reduced motion; full JSON backup/import including file bytes; safe CSV export.

## Data and honest limits

Records and preferences use localStorage, attachments use IndexedDB, scoped by origin. No user data is sent to a backend, analytics provider, model, or email service. Demo and personal records are separately keyed. Export backups before clearing site data or changing browsers. This is not encrypted account storage; anyone with access to the same browser profile may access its workspace. Incognito sessions and browser eviction can remove data. There is no sign-in, cloud sync, email integration, background notification, or MCP endpoint. A shared URL does not share workspace contents. Fit and compensation are self-reported inputs, not forecasts. Fictional sample data is labeled throughout.

Backup imports validate schema, dates, identifiers and file limits before replacing state. File uploads are local only: 5 MB per file and 20 MB per workspace. Exports include attachments; CSV includes opportunity data only. Links permit HTTP(S) only; user strings are HTML-escaped and CSV formula prefixes are neutralized.

## Reference review

Reviewed public ProspectTracker pages `/`, `/about`, `/technology`, `/releases` and all three workspace preview tabs on 2026-11-03. The private Google-authenticated application was not accessed. Inspiration covers streams, prospects, interviews/events, follow-ups, contacts, related documents, qualification fit, compensation, and recorded outcomes. Original branding, layout, copy and interaction design; no affiliation. The source's cloud identity, managed storage, and MCP architecture are not represented as implemented here.
