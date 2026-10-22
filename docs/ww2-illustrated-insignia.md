# Current DSL illustrated insignia

Current DSL's Detailed unit setting uses painted equipment and rank insignia in
the upper-right counter corner. The original main miniature stays in place.
The set covers 34 unit kinds plus captains and the suppression MG 42 role.
Lieutenants use one silver bar, captains two, and company commanders a gold leaf.
These are consistent game-role identifiers, not national historical rank charts.

Current DSL also offers **Icons** beside Detailed and Basic. The display button
cycles Detailed → Basic → Icons. Icons replaces the main miniature and its
corner badge with one enlarged, centered insignia. The same choice applies to
map counters, unit trays, close-ups, aircraft manifests, reserves and playback.
Rifle infantry use the existing private chevron; captains use two bars and
commanders the major's leaf. Other roles use their existing painted insignia.
Team colors, counter shapes, strength/AP and status indicators remain visible;
the statistics sit below the enlarged badge. The choice is saved locally.
Legacy and Empires retain their two existing styles, displaying Detailed when
the stored preference is Icons. No new artwork or rule changes are introduced.

The map, selected-unit details, close-ups, reserves, replay and field-manual
legend use the same renderer. A 46-pixel detail view and 38-pixel legend give the
texture room to read; the small map badge prioritizes the symbol's silhouette.
Pinned and overwatch indicators retain their separate positions. Main counter
input, team colors, strengths, action points and rule state stay unchanged.

The explicit `ruleset=dsl` and `edition=current` gate leaves Legacy and Classic
on their existing badge set. Basic mode uses line symbols. A failed or unfinished
image load leaves the role symbol visible. Ships and aircraft gain role badges
only in Current. The existing secondary cruiser overlay is suppressed there to
avoid putting two role identifiers in the same corner.

## Asset

`ww2_tactics/static/unit-images/role-insignia-v1.webp` is one locally served,
cached 1254-square sheet (231,570 bytes), generated with the built-in image tool
and compressed to WebP. Source windows are clipped, with dividers excluded; the
last two rows have hand-checked unequal heights. No remote images, per-unit
downloads, new game rules, database changes or match conversions are involved.

Art brief: dimensional silver, ivory and brass military equipment/rank emblems
on dark green, strong silhouettes, restrained worn-metal texture, no text or
faction logos. Six rows cover infantry/command, specialists, support, armor/guns,
installations/navy, and aircraft/landing craft/MG 42 in renderer order.

## Verification

`tests/ww2-insignia-browser.cjs` uses disposable local matches and Chromium to
check all 36 source windows and real image loads, desktop/phone rendering,
Basic/Detailed/Icons switching, saved Icons preference, blocked-image fallback,
unchanged battle state and Legacy/Empires isolation. The existing unit-art and ground-role DOM suites cover
input/status behavior and actual specialist orders. Device playtesting remains
useful for subjective readability at different map zoom levels.
