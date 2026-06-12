# F9 Garage Pick item images

Put curated local Garage Pick images here.

The JSON catalog lives at:

```text
daily_flyer_v2/data/f9_items.json
```

Each item can point at an image in this folder, for example:

```json
"image_url": "/static/f9/items/titanium-white-zomba.png"
```

Recommended image notes:

- Use PNG or WebP.
- Prefer transparent backgrounds when possible.
- Keep file names lowercase and hyphenated.
- Keep the catalog small and curated.
- Do not hotlink a giant live item database.
- If an image is missing, the page still renders and the broken image wrapper removes itself.

Rights note: this is a small fan/community implementation. Replace or remove curated images if the project scales beyond that use case.
