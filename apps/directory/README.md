# Daily Flyer Directory

A static, accessible launch directory for the Daily Flyer collection. Catalog metadata is separate from presentation and artwork. No server, account, framework, external fonts, or runtime dependencies are required.

## Run and build

- Validation: `node --test apps/directory/catalog.test.js`
- Build: `node apps/directory/build.mjs`
- Render service type: **Static Site**
- Render publish directory: `apps/directory/dist`
- Render build command: `node apps/directory/build.mjs`
- Environment: `SKIP_INSTALL_DEPS=true` (the monorepo contains unrelated dependency manifests).

## Updating the collection

Edit `projects.json`; one object is one distinct theme. Keep aliases in `aliases` rather than adding duplicate cards. Set `url` to the actual launch URL, including a required route or query parameter. The metadata includes `sourceUrl` for maintenance, but the normal card opens the app.

The `createdAt` field records the earliest documented theme addition/build or first deployment where that is the only evidence. Dates are calendar dates in America/New_York. Use `datePrecision: "month"` for month-only evidence and a day-01 sorting anchor; the UI displays an approximate month only. Use `datePrecision: "unknown"` and `createdAt: null` if there is no reliable date. Keep `dateSource` honest. This migration to the directory is not a new creation date for every old theme.

Types are `games`, `catch-up`, `tools`, and `stories`. Subtypes support filtering the games further. Search includes names, former names, descriptions, genres, tags, and launch URLs. Sorting supports newest, oldest, name, and type. Favorites and view choices are local to the visitor's browser. Filter/search state can be shared through the URL.

`artwork.js` contains original lightweight SVG cover scenes with no network dependencies. Add a matching artwork key when adding a theme, or intentionally reuse an existing relevant scene. The build validates catalog data and artwork mappings before publishing.

Empires is a separate game within the DSL site, which has no reliable direct-selection URL; the card explains that choice. Pocket Hockey and Pocket Soccer share hosting but use different `sport` query values. The Sleeve Notes, Magic Duel, and WHEN ANTS STARE use their verified Render service hosts rather than old source-only or private-preview links.

The directory does not make live uptime claims and does not contain personal board or career-journal data. Source changes in this branch auto-deploy the directory only; the other projects are linked destinations.
