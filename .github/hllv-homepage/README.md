# Infierno Liberado community homepage

The landing page identifies Hell Let Loose: Vietnam immediately and gives equal prominence to the bug tracker, suggestion box and content tracker. Infierno Liberado remains the site name. Source coverage lives in a native disclosure beneath the public content; account controls live in the header disclosure on every route. Existing data, moderation, and authentication modules are unchanged.

Edit `hllv_tracker/index.html` and `homepage.css`. Run `python3 .github/hllv-homepage/publish.py` to publish the content-addressed stylesheet and rebuild the existing asset manifest. This does not change evidence or publication timestamps.

`test_browser.cjs` verifies the three entry routes, small screens, light/dark themes, keyboard account dismissal, sign-in/registration entry, and access to source coverage. External account APIs are stubbed, with no real submissions, votes, or account writes. The workflow also runs the existing feature route regression suite. Screenshots show the actual saved public records, not synthetic content.
