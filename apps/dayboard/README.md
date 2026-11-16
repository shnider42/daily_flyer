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

The application shell is public. Board data is browser-local under `dfe.dayboard.v1` and is not uploaded. Every browser/device has its own workspace. No authentication, analytics, external fonts, external script dependencies, or cloud synchronization are present.

Download a JSON backup to preserve the entire workspace, including area names and colors, or transfer it manually. Both schema v1 and v2 backups can be imported. Merge adds incoming records and keeps the newer timestamp for matching tasks; current project and area metadata win matching-ID collisions. Distinct imported areas keep their own identities even if their names collide, in which case the imported name receives an `(imported)` suffix. Replace validates the entire file before replacing the workspace. CSV export uses current area names and is for reading in spreadsheets, not complete restoration. CSV cells are protected against formula execution.

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

The board is not connected to Jira, email, calendars, job applications, or other career applications. Future account-based sync needs authenticated per-user durable storage and a local-data import path; a public write endpoint or a server-local JSON file would not provide those guarantees.
