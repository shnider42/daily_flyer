# Dayboard

A small Kanban workspace with customizable areas for work, life, and other projects. Built in the Daily Flyer repository as a static application. The optional shared-workspace candidate is a **closed pilot** on `feat/dayboard-teams`; team mode remains disabled. The public personal application at [dfe-dayboard.onrender.com](https://dfe-dayboard.onrender.com/) remains on `feat/dayboard-personal` until the hosted activation gates below are complete.

The personal privacy release is **1.2.1**, committed on that branch as `ab9c64d`; its Render deployment was verified live. Read the public [privacy policy](public/privacy.html), served at [privacy.html](https://dfe-dayboard.onrender.com/privacy.html), and the operator [hosting runbook](HOSTING.md) for the data and hosting boundaries.

## Use

- The default board has Inbox, Next, In progress, Waiting, and Done. Someday and Archive are separate views.
- Only a task title is required. Areas, project links, dates, notes, checklists, priority, and estimates are optional.
- Pin tasks to Today. Three is a suggestion, not a blocking limit.
- Capture several tasks at once with Paste a list. One task per line; area tags such as `#career`, `#life`, or `#home-projects` optionally select the area. The dialog shows examples from the current board. Original area-ID tags continue to work after renaming.
- Drag cards between columns on desktop, or use the always-available status selector. Mobile uses one column at a time and supports List view.
- Repeating tasks generate the next occurrence on completion. Completing a recurrence and creating the next task are one undoable transaction.
- The public app starts with no tasks or projects. A separate local JSON import can provide starter suggestions. Clear suggestions only removes untouched starter tasks.
- Projects are a directory of user-entered links and context, not a list of automatic commitments. No personal project URLs are embedded in the public app.

## Display

Use **Display** in the top bar, or open it from Settings & backup. Choices apply immediately and are saved in the current browser:

- **Text size:** Standard (16px), Larger (18px, default), or Largest (20px). Interface text scales together, including task titles, controls, notes, and metadata.
- **Spacing:** Comfortable shows card notes; Compact reduces card padding and gaps and hides card notes. Spacing does not change text size.
- **Contrast:** Standard or Stronger. Stronger increases text and boundary contrast in either color mode.
- **Color mode:** Dark or Light. The existing quick theme button remains available.

The board retains its five columns and responsive mobile column selection. Wide screens use 24px outer gutters. When five readable columns cannot fit, the desktop board scrolls horizontally rather than shrinking the lettering. Dates are labeled as Due, Overdue, or Follow up so their purpose is visible without hovering.

Text size and contrast are stored separately under `dfe.dayboard.display.v1`; they do not modify the workspace or travel with JSON backups. Existing theme and density preferences remain in workspace settings. **Reset text & contrast** restores Larger text and Standard contrast and leaves color mode, spacing, and all board data unchanged.

## Areas

Fresh boards start with **Career, Life, and Custom**. Use **Add area** in the sidebar to create another, or the button beside **AREAS** to rename an existing area and choose its color. The same manager is available from Settings & backup. Any area can be renamed; names must be nonempty, unique without regard to case, and at most 80 characters. There is no fixed area-count limit beyond the overall workspace storage limit.

Areas have stable identities, so renaming one preserves its task and project assignments, including archived tasks and recurring work. All task/project forms, filters, review counts, capture tags, and exports use the saved catalog. Boards with more than five areas use an area selector in the toolbar to keep controls compact. Areas cannot be deleted in this version.

Existing schema v1 boards automatically receive **Career, Life, DFE, and Custom**, with their original assignments, settings, and records intact. Reading an old board does not rewrite its saved record. Before the first edit is saved in schema v2, the exact original record is retained once under `dfe.dayboard.v1.before-areas-v2`. The live address and main storage key stay unchanged.

## Persistence and privacy

The application shell is public. Personal board data remains browser-local under `dfe.dayboard.v1`. Every browser/device has its own personal workspace. Opening the app, enabling team capability, or signing in does not upload that workspace. With team mode disabled, no authentication client or backend connection is started. There are no analytics or external fonts. The optional Supabase client is bundled with the application, rather than loaded from a third-party script host.

An organic visitor can use the personal board without creating a hosted account or workspace. The privacy policy distinguishes browser-local content, infrastructure processing, and content deliberately shared into the pilot. When shared mode is enabled, routine operator oversight uses account/workspace metadata, counts, retained payload sizes, and activity timestamps; the operator inventory does not return task/note bodies or invitation credentials. This is not end-to-end encryption: privileged administrators can technically access hosted content. See [HOSTING.md](HOSTING.md) for operator access, storage monitoring, and the remaining retention/deletion limitations.

Download a JSON backup to preserve the entire workspace, including area names and colors, or transfer it manually. Both schema v1 and v2 backups can be imported. Merge adds incoming records and keeps the newer timestamp for matching tasks; current project and area metadata win matching-ID collisions. Distinct imported areas keep their own identities even if their names collide, in which case the imported name receives an `(imported)` suffix. Replace validates the entire file before replacing the workspace. CSV export uses current area names and is for reading in spreadsheets, not complete restoration. CSV cells are protected against formula execution.

Writes validate state before persisting. A failed durable write does not publish the change to in-memory state. A previous snapshot supports recovery, and conflicting writes from another tab are rejected. Corrupt local data is never silently reset. A valid replacement import is the explicit recovery path. Settings clearly describe device-local storage, backup, and lack of notifications. Due dates are in-app dates; they do not send messages or system reminders.

## Optional shared workspaces

When the pilot is enabled, use the workspace selector to keep **Personal** separate from each named shared workspace. Hosted signup requires an explicitly approved organizer email or a current email-bound invitation. Signup alone does not join a workspace. Only an approved organizer can create one, with an operator-set quota of **three owned workspaces by default**. The approval registry currently contains no entries; the business support/contact address is not automatically approved as an application account.

A shared workspace starts empty with a **General** area; it does not inherit the personal board's categories or records. Creating a workspace makes that approved organizer its owner. Every current member can read and edit its tasks, notes, projects, and areas. Owners additionally manage invitations and member removal. Assignees must be current workspace members. Invited members do not gain permission to create their own hosted boards.

Invitations are email-bound, expire after seven days, and require verified sign-in with the invited address. The person reviews the destination before accepting. Owners receive a copyable link; this application does not send invitation messages automatically. Removal stops future authorized reads and writes, clears assignments, and preserves existing shared work. Previously downloaded content cannot be recalled.

**Copy from personal board** starts with no Areas selected. It shows the destination and content counts before adding independent copies. Only the selected Areas and disclosed content are included. Personal originals, Today selections, display choices, and review history are not uploaded. Copies receive new record IDs; subsequent personal and shared edits are independent. A task's invalid or cross-Area project/recurrence reference is cleared in the prepared copy rather than pulling in unselected private context.

Shared Today selections are private to the signed-in person. Theme, spacing, and review preferences use an account-and-workspace-scoped browser key. Text size and contrast remain device preferences. Auth uses a separate storage namespace. None of those team keys replaces `dfe.dayboard.v1` or its existing backups.

Shared writes submit only changed records with their expected versions. Stale edits fail without overwriting the newer record. An open editor also checks the version from when it opened, including after a background refresh. A recurring completion and its successor commit together. Undo reverses only the original action, and fails atomically if a later edit changed an affected record. Unrelated edits remain intact.

A lost response leaves the save **unconfirmed**, not silently successful or safely failed. Retry resends the original request ID and payload; the server receipt prevents duplicate tasks. Further shared changes and workspace switching are blocked until that result is resolved. Drafts stay visible on errors, and confirming an earlier save does not erase later typing. Session or access loss switches back to Personal. Unfinished team drafts and pending requests remain in memory in that tab, scoped to the original account and workspace; restoring them requires fresh membership authorization. They are not an offline queue and do not survive closing the tab.

JSON team exports contain board content and assignment references. Import adds independent copies, matches assignments only to existing members, and never imports membership or replaces shared work. JSON export is useful for content recovery; it is not a database backup of permissions, receipts, or activity history.

The server schema and exact RPC/access contract are documented in [supabase/README.md](supabase/README.md). Disabling organizer approval stops future workspace creation; it does not suspend an existing membership or revoke outstanding invitations. The database runbook describes those separate controls. The staged deployment and acceptance criteria are in [TEAM_ROLLOUT.md](TEAM_ROLLOUT.md), and current infrastructure/operations are recorded in [HOSTING.md](HOSTING.md).

## Hosted pilot status — November 16, 2026

The user-approved dedicated Supabase project **Dayboard** (`llkfchgbvnejrsqgvxgc`) has been created in **HoltsniderTech**, using the **$0 / Free provisioning quote**, in US East (`us-east-1`). It was healthy at provisioning. Both migrations are installed. Hosted read-only verification found **0 Auth users, 0 organizer approvals, 0 workspaces, 0 task records, and 0 invitations**.

All 10 application tables have RLS enabled. Inspected grants prevent browser roles from reading the operator inventory, changing organizer approvals, or executing the Auth hook. Security advisers reported **0 warnings, 0 errors, and 7 informational findings** for private tables with RLS but no direct client policy; these tables intentionally use guarded RPC access.

**The Before User Created hook is not registered, so hosted signup admission is not activated.** The available connector cannot configure that Auth setting, and Dashboard access reached a sign-in wall. No Auth request was sent. Dashboard inspection of exposed Data API schemas, actual hosted Auth endpoint behavior, configured SMTP/delivery, hosted concurrency, and backup/restore remain gates. Keep team mode disabled until those checks are completed; installed SQL and build flags do not establish them.

## Development and deployment

Use Node.js 22 or newer. The build installs pinned packages from `package-lock.json` if its build dependency is absent. Dependencies include the bundled Supabase SDK, esbuild, and PGlite for isolated PostgreSQL tests.

```sh
node apps/dayboard/build.mjs
```

The build checks all application modules, runs the personal, client, database, admission, UI, and build-configuration tests, bundles the browser application, and writes `apps/dayboard/dist/build-info.json`. Current local verification is **90 passing tests**: 35 personal, 20 shared-client, 14 database, 7 admission, 11 UI, and 3 build-configuration tests. Serve `dist`, not the unbundled `public` directory. Tests use synthetic identities and an isolated local database; they do not access a hosted project.

Team mode is opt-in at build time:

```text
DAYBOARD_TEAMS_ENABLED=true
DAYBOARD_SUPABASE_URL=https://llkfchgbvnejrsqgvxgc.supabase.co
DAYBOARD_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
DAYBOARD_EMAIL_PROVIDER=CONFIGURED_PROVIDER_NAME
DAYBOARD_AUTH_ADMISSION_VERIFIED=true
DAYBOARD_SMTP_VERIFIED=true
```

Do not enable these settings on the live service until the activation gates pass. `DAYBOARD_EMAIL_PROVIDER` must name the actual configured sign-in sender. Both `*_VERIFIED=true` values are **manual operator attestations**, required by the build; they do not register an Auth hook, configure SMTP, or prove successful testing. Record the hosted evidence before setting them. Server-side admission and database authorization enforce access independently.

Only an HTTPS origin and publishable API key are accepted. Service-role and secret keys are rejected. The build permits connections only to that backend's HTTPS/WSS origin in its Content Security Policy. When disabled, the output contains an empty backend URL/key and retains the same-origin policy.

Render configuration:

- Service type: Static site
- Repository: `https://github.com/shnider42/daily_flyer`
- Branch: `feat/dayboard-personal`
- Build command: `node apps/dayboard/build.mjs`
- Publish directory: `apps/dayboard/dist`
- Auto deploy: on commit
- No credentials are required for personal mode. Team mode uses the public configuration above; no privileged server credential is shipped to the browser.

## Important boundaries

The board is not connected to Jira, calendars, job applications, or other career applications. Team sign-in email needs an explicitly configured delivery provider and verified redirect settings. Actual Auth-hook registration/endpoint behavior, SMTP delivery, exposed-schema Dashboard inspection, PostgREST, Realtime, two-browser concurrency, and backup restoration remain hosted activation checks. Ownership transfer, automated account/workspace deletion, and retention cleanup are not implemented yet; define pilot request handling and recovery before activation and complete lifecycle operations before a wider hosted rollout.
