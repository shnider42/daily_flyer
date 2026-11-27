# Dayboard

A small, personal Kanban workspace with customizable areas for work, life, and other projects. Built in the Daily Flyer repository as a self-contained static application. It branches from `staging` and does not modify other themes or shared routes.

## Use

- The default board has Inbox, Next, In progress, Waiting, and Done. Someday and Archive are separate views.
- Only a task title is required. Areas, project links, dates, notes, checklists, priority, and estimates are optional.
- Pin tasks to Today. Three is a suggestion, not a blocking limit.
- Capture several tasks at once with Paste a list. One task per line; area tags such as `#career`, `#life`, or `#home-projects` optionally select the area. The dialog shows examples from the current board. Original area-ID tags continue to work after renaming.
- Drag cards between columns on desktop, or use the always-available status selector. Mobile uses one column at a time and supports List view.
- Repeating tasks generate the next occurrence on completion. Completing a recurrence and creating the next task are one undoable transaction.
- The public app starts with no tasks or projects. A separate local JSON import can provide starter suggestions. Clear suggestions only removes untouched starter tasks.
- Projects are a directory of user-entered links and context, not a list of automatic commitments. No personal project URLs are embedded in the public app.

## Import work (1.4.0)

Use **Import** beside New task, or **Settings & backup → Import work**. This is a personal-board feature. It does not activate the separate shared-workspace pilot.

- **ClickUp:** choose a task-data CSV export. IDs, task links, descriptions, statuses, dates, priorities, owners, checklists, and original columns are retained where provided.
- **Monday:** choose an Excel `.xlsx` export and select **Monday** as the source. Choose the worksheet to review; updates on other worksheets are not automatically joined to tasks. Formatting-only group/subitem relationships and hyperlink destinations are not reconstructed. Explicit parent IDs remain in source details.
- **Other task tables:** CSV, TSV, semicolon-separated files, and ordinary `.xlsx` workbooks can be mapped by column. A custom title column can be chosen even when automatic detection fails.
- **Slack, Teams, OneNote, or other text:** paste selected content, including relevant replies. Local rules suggest action lines and checkboxes. Reference passages, completed checkboxes, requests, and uncertain ideas start skipped. This is basic text extraction, not AI interpretation or a live account connection.

Every import previews editable titles, notes, statuses, priorities, due dates, and follow-up dates. Select an existing Area and optional Project for new tasks. Source status mappings and individual overrides are available for task tables. No new Areas or Projects are created automatically. New tasks are not pinned to Today, and imported recurrence rules are not activated.

Use a stable **Workspace / board name** across exports. Matching uses the source service, namespace, and item ID (or a supported task URL). Exact unchanged matches are skipped; changes require an explicit **Update existing task** choice. Title-only matches are possible matches and cannot overwrite existing tasks. Updates preserve local Area, Project, recurrence, and edited personal notes; checklist and task-field replacements are shown in the preview. Missing source records never delete Dayboard work.

The entire batch is one validated save. **Undo this import** restores the preceding board until another change is saved. Storage failures or stale concurrent edits leave the existing board intact and retain the preview. Source information is visible in task details and included in JSON backups. The first import advances the workspace to schema v3 and retains the exact previous saved record once under `dfe.dayboard.v1.before-imports-v3`; existing v1/v2 boards remain readable.

Files and pasted content are processed in the browser. No source content is uploaded, no links are fetched, and no remote AI or third-party scripts are loaded. Preview data stays in page memory. Source attachments are references only. Files must be at most 8 MB for Excel or 5 MB of text for CSV/TSV; a batch may contain up to 500 proposals. Pasted text is limited to 100,000 characters. Excel reading requires a browser with `DecompressionStream('deflate-raw')`; use a current browser or CSV when unavailable. Encrypted/macro-enabled or malformed workbooks are rejected. Formulas are never evaluated; available saved values are read.

## Display (1.5.0)

Use **Display** in the top bar, or open it from Settings & backup. Choices apply immediately and are saved in the current browser:

- **Text size:** Standard (16px), Larger (18px, default), or Largest (20px). Interface text scales together, including task titles, controls, notes, and metadata.
- **Spacing:** Comfortable shows card notes; Compact reduces card padding and gaps and hides card notes. Spacing does not change text size.
- **Contrast:** Standard, Balanced (the default for new preferences), or Stronger. Balanced combines readable edges with softer area colors; Stronger increases text and boundary contrast. Existing saved contrast choices are retained.
- **Card tint:** Subtle, Medium (default), or Rich. A card's background tint, left stripe, and labeled area marker identify its area in every layout.
- **Urgency emphasis:** Subtle, Standard (default), or Prominent. A separate badge on the right uses red for overdue, orange for today, yellow for the next seven days, and neutral gray for later or no date. Waiting tasks use the earlier applicable due/follow-up date. Completed and archived tasks are quiet and have no active deadline warning. High priority and pinning to Today do not change deadline urgency.
- **Urgency labels:** Labels + icons (default), or Icons only. Dates and accessible descriptions remain available in either setting.
- **Area colors:** Each area has a color picker and an individual Default button. Career defaults to blue, Life to green, legacy DFE to purple, and Custom to teal. New areas suggest an unused palette color where available. Other saved palette choices are preserved, and custom colors follow area identities through renames. The original DFE amber and Custom purple records stay intact; their recommended appearances use purple and teal to keep areas distinct and leave warm defaults for deadlines.
- **Color mode:** Dark or Light. The existing quick theme button remains available.

The same area/urgency language appears in board cards, task lists, Today, shortlist previews, Inbox, Dates & follow-ups, Someday, and Archive. Projects and review counts carry the same area color. Labels remain available on mobile, and calendar-day changes refresh deadline badges on return to the page or within a minute while open. The board retains its five columns and responsive mobile column selection. When five readable columns cannot fit, the desktop board scrolls horizontally rather than shrinking the lettering.

Text size, contrast, tint, urgency emphasis/labels, and custom area-color overrides are stored separately under `dfe.dayboard.display.v1`; they do not modify the workspace or travel with JSON backups. Existing theme and density preferences remain in workspace settings. **Reset reading & colors** restores Larger text, Balanced contrast, Medium tint, Standard urgency with labels, and the recommended area appearance. It preserves color mode, spacing, and board data. Display changes work with the existing content-security policy; no external assets or inline HTML styles are needed.

## Areas

Fresh boards start with **Career, Life, and Custom**. Use **Add area** in the sidebar to create another, or the button beside **AREAS** to rename an existing area. **Area colors** in that manager opens the Display color pickers. The same manager is available from Settings & backup. Any area can be renamed; names must be nonempty, unique without regard to case, and at most 80 characters. There is no fixed area-count limit beyond the overall workspace storage limit.

Areas have stable identities, so renaming one preserves its task and project assignments, including archived tasks and recurring work. All task/project forms, filters, review counts, capture tags, and exports use the saved catalog. Boards with more than five areas use an area selector in the toolbar to keep controls compact. Areas cannot be deleted in this version.

Existing schema v1 boards automatically receive **Career, Life, DFE, and Custom**, with their original assignments, settings, and records intact. Reading an old board does not rewrite its saved record. Before the first edit is saved in schema v2, the exact original record is retained once under `dfe.dayboard.v1.before-areas-v2`. The live address and main storage key stay unchanged.

## Persistence and privacy

The application shell is public. Board data is browser-local under `dfe.dayboard.v1` and is not uploaded. Every browser/device has its own workspace. No authentication, analytics, external fonts, external script dependencies, or cloud synchronization are present.

Download a JSON backup to preserve the entire workspace, including area names and base palette markers, or transfer it manually. Custom Display color overrides are browser preferences and are excluded from the backup. Schema v1, v2, and v3 backups can be imported. Schema v3 includes imported source metadata. Merge adds incoming records and keeps the newer timestamp for matching tasks; current project and area metadata win matching-ID collisions. Distinct imported areas keep their own identities even if their names collide, in which case the imported name receives an `(imported)` suffix. Replace validates the entire file before replacing the workspace. CSV export uses current area names and is for reading in spreadsheets, not complete restoration. CSV cells are protected against formula execution.

Writes validate state before persisting. A failed durable write does not publish the change to in-memory state. A previous snapshot supports recovery, and conflicting writes from another tab are rejected. Corrupt local data is never silently reset. A valid replacement import is the explicit recovery path. Settings clearly describe device-local storage, backup, and lack of notifications. Due dates are in-app dates; they do not send messages or system reminders.

## Development and deployment

No dependency installation is required. Node.js 22 or newer is used only for build-time checks.

```sh
node apps/dayboard/build.mjs
```

The build checks the application syntax, runs the model tests, and copies public assets to `apps/dayboard/dist` with a build-info record. Serve that directory with a static server for local work.

Render configuration:

- Service type: Static site
- Repository: `https://github.com/shnider42/daily_flyer`
- Branch: `feat/dayboard-personal`
- Build command: `node apps/dayboard/build.mjs`
- Publish directory: `apps/dayboard/dist`
- Auto deploy: on commit
- No secrets or server environment variables are required.

## Important boundaries

The disabled shared-workspace branch must incorporate the import schema and compatibility changes before any later activation; importing here does not enable or modify shared storage.

The board does not connect to external accounts or synchronize changes with their services. Import work reads files and pasted text only. Future account-based sync needs authenticated per-user durable storage and a local-data import path; a public write endpoint or a server-local JSON file would not provide those guarantees.
