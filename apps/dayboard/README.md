# Dayboard

A small, personal Kanban workspace for career work, life admin, and DFE projects. Built in the Daily Flyer repository as a self-contained static application. It branches from `staging` and does not modify other themes or shared routes.

## Use

- The default board has Inbox, Next, In progress, Waiting, and Done. Someday and Archive are separate views.
- Only a task title is required. Areas, project links, dates, notes, checklists, priority, and estimates are optional.
- Pin tasks to Today. Three is a suggestion, not a blocking limit.
- Capture several tasks at once with Paste a list. One task per line; `#career`, `#life`, and `#dfe` optionally select the area.
- Drag cards between columns on desktop, or use the always-available status selector. Mobile uses one column at a time and supports List view.
- Repeating tasks generate the next occurrence on completion. Completing a recurrence and creating the next task are one undoable transaction.
- The public app starts with no tasks or projects. A separate local JSON import can provide starter suggestions. Clear suggestions only removes untouched starter tasks.
- Projects are a directory of user-entered links and context, not a list of automatic commitments. No personal project URLs are embedded in the public app.

## Persistence and privacy

The application shell is public. Board data is browser-local under `dfe.dayboard.v1` and is not uploaded. Every browser/device has its own workspace. No authentication, analytics, external fonts, external script dependencies, or cloud synchronization are present.

Download a JSON backup to preserve the entire workspace or transfer it manually. Merge adds incoming records and keeps the newer timestamp for matching tasks; current project metadata wins collisions. Replace validates the entire file before replacing the workspace. CSV export is for reading in spreadsheets, not complete restoration. CSV cells are protected against formula execution.

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
