# Daily Flyer Directory

A static, accessible launch directory for the Daily Flyer collection. Catalog metadata is separate from presentation and artwork. No server, account, framework, external fonts, or runtime dependencies are required.

The interface is a compact project library: persistent category navigation on desktop, a category strip on mobile, a cover grid, and a dense list view. Original project covers use a 640×420 aspect ratio. Search and direct URL text remain visible; sports routes and theme parameters are shown separately beneath the hostname so shared hosts are distinguishable.

Production builds fingerprint styles, scripts, artwork, and fetched catalog data. The HTML and module imports point at that exact asset set to prevent browsers mixing designs across deployments. Source preview remains buildless.

## Run and build

- Validation: `node --test apps/directory/catalog.test.js`
- Build: `node apps/directory/build.mjs`
- Render service type: **Static Site**
- Render publish directory: `apps/directory/dist`
- Render build command: `node apps/directory/build.mjs`
- Environment: `SKIP_INSTALL_DEPS=true` (the monorepo contains unrelated dependency manifests).

## Updating the collection

Edit `projects.json`; one object is one distinct theme. Every theme needs `device: {best, note}` and `featureWeight`. Set `best` to `mobile`, `desktop`, or `both` based on the main task and actual controls. Write a short, visible note explaining the recommendation and any role split (for example, phone guests and desktop organizers). These are editorial recommendations, not a claim that every device has been certified. Set `featureWeight` from 1–5: 1 for a prototype, 2 for a pilot or early release, 3 for an ordinary entry, and 4 for a more developed experience; use 5 only with a clear reason. Zero opts a theme out of features. Source-only links are also excluded. A concise optional `featuredSummary` can replace the usual description in the featured card. Weekly highlights do not affect catalog sorting, counts, or copied links. Keep aliases in `aliases` rather than adding duplicate cards. Set `url` to the actual launch URL, including a required route or query parameter. The metadata includes `sourceUrl` for maintenance, but the normal card opens the app.

The `createdAt` field records the earliest documented theme addition/build or first deployment where that is the only evidence. Dates are calendar dates in America/New_York. Use `datePrecision: "month"` for month-only evidence and a day-01 sorting anchor; the UI displays an approximate month only. Use `datePrecision: "unknown"` and `createdAt: null` if there is no reliable date. Keep `dateSource` honest. This migration to the directory is not a new creation date for every old theme.

Types are `games`, `catch-up`, `tools`, and `stories`. Subtypes support filtering the games further. Search includes names, former names, descriptions, update notes, genres, tags, and launch URLs. Sorting supports newest, recently updated, oldest, name, and type. Favorites and view choices are local to the visitor's browser. Filter/search state can be shared through the URL.

Use `updatedAt`, `updateSummary`, and `updateSource` together for a verified published change. The date is the America/New_York date of the actual project change, not the day its directory entry was reviewed. Keep the source commit URL for the evidence behind each note. `?type=all&sort=updated` opens recent work across the collection; projects without an update date fall back to their creation date. Creation sorting and approximate-date labels remain independent.

The November 23, 2026 full collection audit brings the directory to **51 projects (27 games)**. The audit compared all 65 DFE Render services and 96 repository branches with the catalog. Added LMW Connections, SUNCOAST, First Riff, Galaxy Granite Journal, Hell Let Loose Field Brief, Commander Opening Plan, BirthDay Today, and Passages Daily. Each has a verified launch URL, original date evidence, search aliases, and a matching cover. LMW is listed as an independent alumni networking pilot and uses its navy/orange palette. Passages Daily is a distinct daily practice companion; its “Tim Today” alias now resolves to that app instead of the MyPassages coaching site. The prior Gravebloom and Dayboard pins were replaced by the weekly rotation described below.

When reviewing the collection, compare active user-facing Render services and distinct theme routes against `projects.json`, not only recent branches. Shared-host themes need separate entries when they are distinct experiences; staging copies and multiplayer/research backends do not. Source-only precursors and suspended duplicate services are not advertised as active apps. Keep the existing public-catalog exclusions below. New themes are still added explicitly to this catalog; creating another service or branch does not synchronize it automatically.

The November 22, 2026 addition brings the collection to 42 projects (25 games). Pocket Volleyball adds 2-on-2 beach doubles, solo play, same-screen versus and co-op, and private online versus or co-op for two devices. Matches are best of three with sets to 11 or 21, and controls support touch, keyboard and gamepads. Its court cover uses the game's sand, navy, blue and coral palette. Gravebloom and Dayboard retain their featured positions.

The November 19, 2026 review contains 41 projects (24 games). Added Gravebloom, a Diablo-style co-op action RPG with three classes, three areas and bosses, randomized loot, and a claim-or-cleanse boss-heart choice. Gravebloom and Dayboard are featured together above the default Games collection and All projects view. The highlights stay in place when sorting; search, favorites, game-kind filters and other categories show only their matching collection. Featured entries also have a small badge in normal cards and list view. Refreshed Farwake with the corridor opening, perks, guidance and music changes; Pocket Baseball with its phone HUD; and Infierno Liberado with its November 18 evidence review. Dayboard retains its actual November 16 release date.

The November 16 review added Skybreak, Trailmark and Loudsource with matching cover art after verifying their source and live deployments. Refreshed Farwake, Pocket Baseball, Sunday Broadcast, Skyward, Huddle, Dayboard and Infierno Liberado with dated, source-backed notes. Huddle includes the Brazilian Portuguese Manchester City edition and the November 16 NFL/soccer snapshot. Dayboard describes its live personal board; team mode is not advertised while activation remains incomplete. Trailmark is labeled a pilot with foreground-only monitoring and routes awaiting field checks. Loudsource keeps its original service date, with the party redesign recorded as a November update.

The wedding notebook and Roast Machine remain excluded from this public catalog. Next Chapter retains its existing listing; the earlier exclusion was for a separate copyable list. Match servers are infrastructure for their parent games, not duplicate catalog entries.

The root URL opens **All themes**, sorted newest first, including for returning visitors. All themes is the first navigation option. Explicit shared URL filters still take precedence: `?type=games` opens Games and `?type=tools` opens Tools. Search from the landing page covers every theme. Explicit category, device, game-kind, and favorites filters keep their scope. When a scoped search has matches outside those filters, “Search all projects” retains the query and clears the restrictions. Favorites and display style persist in the browser; category and device choices are shared through the URL and do not silently change a later visit to the root.

## Device discovery and weekly features

Every card, list entry, and featured theme shows **Best on mobile**, **Best on desktop**, or **Mobile & desktop**, with its explanatory note visible without hovering. The device selector offers Any device, Mobile-friendly, Desktop-friendly, and Good on both. Mobile and desktop filters include both-device themes; Good on both shows only those themes. Shared filters use `?device=mobile`, `?device=desktop`, or `?device=both`. Device filters compose with the existing search, categories, favorites and sorting.

A one-click suggestion uses the browser's coarse-pointer and viewport media query to offer phone/tablet browsing or keyboard-and-mouse browsing. It is a hint, not an automatic filter. Every visitor starts with all themes unless their link explicitly requests a filter. The device controls sit above the featured section so phone visitors can reach them immediately.

`featureEdition(projects, now)` selects three weekly themes with three distinct types whenever the catalog supports that. The seeded selection is the same for everyone viewing the same catalog version. Weeks start **Monday at 00:00 in America/New_York**, including daylight-saving transitions. The four-week cycle, anchored to November 23, 2026, is mixed → mobile-friendly → mixed → desktop-friendly. Focused weeks use only recommendations suited to that device; they fall back to a mixed edition if fewer than three types are eligible. Category rotation advances independently, so every type can appear in every focus. Mixed weeks include a suitable recommendation for each device when possible.

Readiness weights drive the random draw, with a modest 20% boost for verified additions or updates within the preceding eight weeks. Dates are evaluated at the week's start so weights do not drift during the week. Consecutive weeks avoid the same trio whenever another combination is possible. The rotation requires no scheduled deployment, task, database, or service: opening the directory computes the current week, and an already-open page updates within a minute or when its tab becomes visible. Changing catalog metadata or eligibility can recalculate the current edition, so routine editorial changes should keep that in mind.

Weekly features appear on the unfiltered All themes view. Scoped browsing shows its matching collection; the current weekly picks retain a “This week” badge in cards and list view. Old `featuredRank` pins are retired. Keep device notes and weights current when maintaining a theme.

`artwork.js` contains original lightweight SVG cover scenes with no network dependencies. Add a matching artwork key when adding a theme, or intentionally reuse an existing relevant scene. The build validates catalog data and artwork mappings before publishing.

Empires is a separate game within the DSL site, which has no reliable direct-selection URL; the card explains that choice. Pocket Hockey and Pocket Soccer share hosting but use different `sport` query values. The Sleeve Notes, Magic Duel, and WHEN ANTS STARE use their verified Render service hosts rather than old source-only or private-preview links.

The directory does not make live uptime claims and does not contain personal board or career-journal data. Source changes in this branch auto-deploy the directory only; the other projects are linked destinations.
