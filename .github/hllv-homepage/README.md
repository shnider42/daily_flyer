# Infierno Liberado community homepage

The landing page leads with Infierno Liberado, identifies it as a Hell Let Loose: Vietnam community companion immediately beneath the title, and gives equal prominence to the bug tracker, suggestion box and content tracker. Source coverage lives in a native disclosure beneath the public content; account controls live in the header disclosure on every route. Existing data, moderation, and authentication modules are unchanged.

The homepage title uses Barlow Condensed 900, with the supplied game key art influencing its tall, heavy typography. It remains selectable HTML text and does not reproduce the official logo. The Latin WOFF2 is self-hosted, preloaded, and scoped to the hero title; the navigation typography is unchanged. Font source: https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@900&display=swap. Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow); SIL Open Font License 1.1 is included at `hllv_tracker/assets/barlow-condensed-OFL.txt`.

Edit `hllv_tracker/index.html` and `homepage.css`. Run `python3 .github/hllv-homepage/publish.py` to publish the content-addressed stylesheet and rebuild the existing asset manifest. This does not change evidence or publication timestamps.

`test_browser.cjs` verifies the three entry routes, small screens, light/dark themes, keyboard account dismissal, sign-in/registration entry, and access to source coverage. External account APIs are stubbed, with no real submissions, votes, or account writes. The workflow also runs the existing feature route regression suite. Screenshots show the actual saved public records, not synthetic content.
