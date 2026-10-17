# When Ants Stare — novel preview

Branch: `feat/when-ants-stare`, based on `staging` at `2a053196d33f6b50299b8c342cc2316960314e21`.
Theme: `when_ants_stare`.

This theme uses the existing DFE custom builder, PageContext/CardItem contract,
shared HTML renderer, command-line build, and Flask theme route. It adds no
packages, provider calls, database, accounts, analytics, or server-side state.
The manuscript is deterministic: dates and seeds never rotate or shuffle it.

## Run or export
```sh
pip install -r requirements.txt
python app.py --theme when_ants_stare --outfile when-ants-stare-preview.html
DEFAULT_THEME=when_ants_stare flask --app web run
```

A working existing DFE server can use `/?theme=when_ants_stare`.
The generated HTML is standalone, with inline illustration, CSS, and JavaScript.
Fonts are local system fonts. The excerpt remains fully readable without JavaScript.

## Separate Render Web Service

Do not repoint an existing service. Configure a new service with:

| Setting | Value |
| --- | --- |
| Repository | shnider42/daily_flyer |
| Branch | feat/when-ants-stare |
| Runtime | Python |
| Root directory | blank |
| Build command | pip install -r requirements.txt |
| Start command | gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60 web:app |
| DEFAULT_THEME | when_ants_stare |
| PYTHON_VERSION | 3.12.8 |
| TZ | America/New_York |
| Health check path | / |

For a static site, build the theme to `dist/index.html` and publish only `dist`.
Never publish the repository root; it contains unrelated source and data.

## Content and design
- Cover: an engraved solar disc, oversized literary type, a tiny ant, and clear reading entry.
- Continuous chapter excerpt: no fabricated further chapters, author identity, reviews, or publication date.
- Warm night and soft paper appearances, three type sizes, reading settings, optional margin-free focus.
- Appearance, type size, and the current paragraph are saved only in this browser when localStorage is available.
- No cursor-following, flashing, audio, continuous animation, or moving hover targets.
- Responsive cover and text layout, keyboard focus indicators, skip link, native settings controls, reduced-motion and print styles.
- `noindex,nofollow` is included for the preview. This is a crawler request, not access control.
- Chapter source is `daily_flyer/themes/when_ants_stare_assets/chapter.json`.
- Google Docs is a source reference only. This is a snapshot of the user's pasted excerpt; it does not synchronize with Google Docs.

## Editorial boundaries
`source-original.txt` retains the supplied prose and visible editing debris,
with the transport backslashes/entities normalized into ordinary line breaks.
The reading version removes doubled letters, stray edit characters and export
backslashes/entities, normalizes punctuation/capitalization and the apparent
Mr. M / Tom / Miss Bright artifacts, and makes light sentence-boundary cleanup.
No continuation, explanatory plot, author name, or release promise was added.
The unusual dawn/dusk wording, uncertain elapsed time, and LOOK AWAY emphasis
remain. This is not a substantive developmental edit or a claim of final copy.

## Future edits
Update the ordered paragraphs in chapter.json, rebuild, and publish the new export.
Keep paragraph identifiers stable or bump the `was:looking:place:v1` key when the
chapter is restructured significantly. Styling and interactions are theme-scoped.
The private Sites preview is a generated snapshot; GitHub pushes alone do not
republish that separate preview.
