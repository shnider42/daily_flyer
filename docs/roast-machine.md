# Roast Machine

Standalone DailyFlyer theme on branch `feat/roast-machine`.

**Do not add this project to `dfe-directory` or its project catalog.** This is an
explicit product requirement. The dedicated Render URL is public and shareable;
being absent from the directory does not make it private.

## Product

The interface has a name, exactly eight dropdowns, a freeform details box, and
a ROAST button. The dropdowns cover personality, day job, hobby, group chat,
style, habit, occasion, and heat. Trait dropdowns can be left empty. The result
can be regenerated or copied. Names and input details remain in tab memory.

The generator combines an authored joke bank, selected traits, cross-category
callbacks, and recognized everyday details. It is a local text generator, not
a remote AI service, and does not claim to understand arbitrary prose. The
interface reports when it cannot use a note. All generated text is rendered as
text, never interpolated as HTML. No accounts, database, cookies, analytics,
browser persistence, or generation API are involved. Render serves the static
files and may keep ordinary hosting request logs; form values are not included
in those requests. Copying or sharing a result is an explicit visitor action.

## Build and serve

```sh
python scripts/build_roast_machine.py
python -m http.server 8765 --directory dist/roast-machine
```

The build uses Python's standard library and publishes only five application
assets plus `robots.txt`. There is no dependency installation or web process.

Render static-site settings:

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/shnider42/daily_flyer` |
| Branch | `feat/roast-machine` |
| Build command | `python scripts/build_roast_machine.py` |
| Publish directory | `dist/roast-machine` |
| Environment | `SKIP_INSTALL_DEPS=true` |
| Auto-deploy | Enabled |

Do not publish the repository root: it contains unrelated DFE source/content.
The standalone HTML uses a restrictive Content Security Policy, including
`connect-src 'none'` and `form-action 'none'`. All CSS, JavaScript, and the favicon
are local. The page and robots file request no search indexing.

## DFE compatibility

The optional `daily_flyer/themes/roast_machine.py` adapter implements the normal
DFE custom theme contract without changing shared engine files. It embeds the
same assets into a `PageContext`. Existing theme routes and rendering remain
unchanged.

```sh
python app.py --theme roast_machine --outfile /tmp/roast-machine-dfe.html
DEFAULT_THEME=roast_machine gunicorn web:app
```

DFE's renderer uses inline scripts, so this adapter has a separate CSP that
permits its embedded code and still prevents connections and form submission.

## Checks

```sh
node --test tests/roast_machine_engine.test.cjs
python -m unittest discover -s tests -p 'test_roast_machine_theme.py'
```

Browser QA should cover a name-only roast, all eight controls, notes,
regeneration, copying, reset, long names, keyboard navigation, reduced motion,
and mobile/desktop layouts. Confirm no input values enter the URL or network
requests and no script errors occur. Verify both the standalone build and DFE
rendered output.
