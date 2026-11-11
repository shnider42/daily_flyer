# For my brother

A small, personal best man's notebook. The site holds loose thoughts, things to
remember, plans, and speech material. Dates can remain blank until they are known.
It intentionally has its own visual treatment without visible DailyFlyer chrome.

## Keep it out of the directory

**Do not add this site to any public project catalog**, including
`apps/directory/projects.json`, the DFE directory feed, or the Holtsnider Tech
catalog snapshot. The directory uses explicit entries and does not automatically
discover themes or Render services. This theme therefore needs no directory
registration or shared-engine change.

The HTML and `robots.txt` ask search engines not to index the site. The URL is
still publicly accessible; these directives are not password protection. Only
the application and its assets are published by Render. Access to the cloud
notebook is separately protected by its password and session-authenticated API.

## Notes and backups

The owner creates a password through a one-time private setup link. The same
password opens the same notebook on another phone or computer. The notebook is
stored in the dedicated Supabase tables described in `server/best_man/README.md`.
Local browser copies preserve edits while a save is pending or the connection
fails; the interface distinguishes local and cloud saves. Export/import controls
provide independent backups and readable copies.

There are no analytics scripts, advertising integrations, or remote fonts.
Content Security Policy permits only the dedicated Supabase host for API
connections and disables form submissions. Passwords are hashed, and only
hashed session tokens are stored on the server. Notebook content is not
end-to-end encrypted. Hosting providers can process ordinary request metadata.

## Build and deploy

From the repository root:

```sh
python3 scripts/build_best_man.py
```

Create a Render **Static Site** using this theme's branch:

- Build command: `python3 scripts/build_best_man.py`
- Publish directory: `dist/best-man`
- The static build needs no environment secrets, package installation, or
  running web service. Deploy the dedicated Supabase backend separately using
  `server/best_man/README.md`; never publish its service credentials.
- Publish only that directory, not the repository or the theme's source folder.

The builder copies the selected assets, fingerprints CSS/JavaScript filenames,
and writes `robots.txt`. It preserves unrelated files in a supplied output
directory and rejects the source directory, its ancestors, and its descendants
as output locations. The manifest and icons are included when present; a missing
optional asset that is referenced by the HTML fails the build.

For local inspection:

```sh
python3 -m http.server 8000 --directory dist/best-man
```

DFE's existing routes also support `/?theme=best_man` or
`DEFAULT_THEME=best_man`. CLI rendering works with:

```sh
python3 app.py --theme best_man --outfile /tmp/best-man.html
```

The adapter embeds the same markup, styles, storage code, cloud client, and app
code, hides the shared renderer's visual chrome, and performs no content-provider
requests. Its cloud API origin policy is restricted to the dedicated Render URL
and the documented local test origins.

## Focused integration checks

```sh
python3 -m unittest discover -s tests -p 'test_best_man_theme.py'
```

Browser checks should cover saving and reloading notes, backup export/import,
empty dates, speech editing, phone-sized layouts, password setup/login, saves
across two devices, conflicts, and logout before deployment.
