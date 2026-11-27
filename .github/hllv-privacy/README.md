# Infierno Liberado privacy policy

`privacy.html` is the policy source, effective November 10, 2026. It applies only to Infierno Liberado. `privacy.css` styles the standalone page; `links.css` styles the shared site footer. No external account SDK is loaded by the standalone policy page.

The policy reflects the November 10 source/live-schema review: Render public frontend; Supabase Auth and private community data in Oregon; shared project/account infrastructure; jsDelivr library requests on the main tracker; browser session and theme storage; moderated public projections; manual/indefinite retention; withdrawal versus deletion; and a manual request route. The contact email was verified on the public Holtsnider Tech website. It does not promise a purge, automatic export, fixed provider retention, end-to-end encryption, or named-law compliance.

After a deliberate policy or entry-point edit, run from the repository root:

```sh
python .github/hllv-privacy/publish.py
```

This publishes content-addressed CSS and the edited community/registration modules, updates the live page and deployment manifest, and fills the public contact/retention fields. It preserves account configuration, the backend submission policy identifier `community-v1`, and tracker evidence. The general homepage publisher also runs this publisher so later UI builds retain the policy assets.

The full policy opens in a new tab from the persistent site footer, existing community privacy disclosure, registration acknowledgment, and submission acknowledgment. This preserves unsaved form input. Acknowledging the notice does not grant blanket consent to unrelated processing.

Review the prose whenever data flows, providers, retention, public fields, or request handling change. Update the visible effective/updated date and the manifest date intentionally. Verify mobile and desktop rendering, both themes, direct-page access, and new-tab links with synthetic form data; do not send real signup emails or write real submissions during verification.
