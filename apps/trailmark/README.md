# Trailmark — Four Ponds pilot

A map-led hiking companion for confusing forks and route awareness. First area: Four Ponds Conservation Area, Pocasset, Bourne, Massachusetts. Plain browser modules, no runtime dependencies, no account, no location uploads.

## Run and build

Use Node 22 or later. From this directory:

```sh
npm test
npm run build
python -m http.server 8773 --directory dist
```

Location works on localhost or an HTTPS origin. Open the app directly in a mobile browser; embedded previews may not permit geolocation. The application requests location only on **Start GPS hike**. **Try demo** uses simulated observations through the same monitoring engine and never records them as a real hike.

Render static-site configuration: repository `shnider42/daily_flyer`, branch `feat/trailmark-hiking`, build command `node apps/trailmark/build.mjs`, publish path `apps/trailmark/dist`, `SKIP_INSTALL_DEPS=true`. No server, database, secret, API key or paid compute instance is required. Hosting bandwidth/build allowances still apply. The app is not automatically listed in the project directory.

## What exists

- A bundled, interactive vector map with pond outlines, mapped trails, parking, selected route, pan, pinch/scroll zoom, keyboard controls, scale, and reported location-accuracy circle.
- An approximately 2.83 km / 1.76 mi route assembled from actual contiguous OpenStreetMap geometry: parking approach, Four Ponds Loop, return on the approach. No invented connection between disconnected paths.
- Six mapped checkpoint cards, labeled A–F. These are **app checkpoints, not the official numbered town trail posts**. Exact town post locations have not been established.
- Accuracy-aware route departure monitoring, with 12 seconds and at least three good observations required to confirm a departure; a narrower corridor and two fixes over five seconds to confirm recovery.
- A separate traversal-aware checkpoint engine that distinguishes the outbound and return occurrences of the same junction. Stale, inaccurate or unmatched progress is shown as unconfirmed.
- Optional chime and advisory Screen Wake Lock during an active hike.
- Explicit offline saving of the app and full vector pack; the UI reports ready only after all required files are cached and rechecked. External links need connectivity. Browser storage can be evicted.
- Private local notes about turns, signs, landmarks and conditions; JSON export.
- Optional local breadcrumbs and GPX export. New hiking sessions append a separate segment; permission failure does not erase an earlier recording. Gaps and rejected fixes are not joined with fabricated tracks.
- GPX and GeoJSON imports for more trails. Imported geometry remains unverified. Multiple disconnected tracks are rejected, not joined.
- Four demo scenarios: normal/next checkpoint, a route departure, poor accuracy, and return to the route.

## Platform limits that affect the product

This is a **foreground web pilot**, not a background hiking navigator. Locking the phone or switching apps pauses monitoring. Returning requires fresh location. Installing to the Home Screen or adding Web Push does not create a background GPS service. Reliable phone-in-pocket alerts require a native iOS/Android layer with background-location lifecycle handling and permission UX.

The route is **mapped, not field verified**. Route proximity establishes only proximity to the selected line, not that a person is on a permitted, safe or passable trail. Closely spaced branches can fall inside the GPS uncertainty. Recovery guidance never instructs someone to walk straight to the closest line through unknown terrain.

Thresholds in `navigation.mjs` and `progress.mjs` are initial engineering choices. The 20 m map-uncertainty allowance is provisional and has not been measured. Validate these with recorded walks and observations before promoting this to a dependable navigation product.

## Extend to other areas

The app separates map data, navigation, traversal, imports, presentation and offline caching. A new curated trail area uses the `data/area.json` contract:

```json
{
  "schemaVersion": 1,
  "id": "area-id",
  "name": "Area name",
  "locality": "Town, State",
  "center": [-70.6, 41.7],
  "bounds": [-70.61, 41.69, -70.59, 41.71],
  "sources": [{"title": "Data owner", "url": "https://example.org/map", "date": "2026-11-14"}],
  "trails": {"type": "FeatureCollection", "features": []},
  "landFeatures": {"type": "FeatureCollection", "features": []},
  "places": [],
  "routes": [{
    "id": "route-id",
    "name": "Route name",
    "description": "A sourced, continuous route.",
    "validation": "mapped",
    "mapUncertaintyM": 20,
    "source": {"title": "Route source", "url": "https://example.org/route"},
    "coordinates": [[-70.6, 41.7], [-70.601, 41.701]],
    "waypoints": [{"id": "junction-1", "name": "Named junction", "coordinate": [-70.601, 41.701], "routeIndex": 1, "distanceAlongM": 139, "note": "A field-checked description goes here."}]
  }]
}
```

The example is a schema illustration, not trail geometry. GeoJSON order is **longitude, latitude**. Preserve sources, dates, licenses, access limitations and verification status per route. Ordered `routeIndex`/`distanceAlongM` values matter when routes revisit the same point. A future multi-area selector can load multiple packs without changing either navigation engine. The shipped UI supports one curated area plus up to 12 locally imported routes.

For an authoritative next pack: obtain continuous GPX/GeoJSON, walk both directions, photograph confusing junctions with coordinates, check access and current signs, attach verified descriptions, version the pack, add it to the cache manifest, and replay recorded traces before release.

## Four Ponds sources

- Town trail-map landing page: https://www.bourne-ma.gov/1707/Land-Trail-Maps
- Town map dated October 14, 2022: https://ma-bourne.civicplus.com/DocumentCenter/View/1492/Town-Forest-and-Four-Ponds-Conservation-Area
- Town entrance description: https://www.bourne-ma.gov/DocumentCenter/View/358/Four-Ponds-Conservation-Area
- Loop geometry: https://www.openstreetmap.org/way/362587410 (source edit June 2, 2026).
- Connector geometry: https://www.openstreetmap.org/way/362587409 (source edit May 30, 2026).
- Data attribution and redistribution: © OpenStreetMap contributors, ODbL 1.0. See `data/LICENSE-OSM.txt`. No geographic linework was traced from the copyrighted town PDF.

The town map calls the western pond Turtle Pond, while OSM also uses The Basin; the pilot displays both. Town Forest Trail’s displayed identity follows the town map where community color metadata differs. The optional `four-ponds-network.geojson` file is an older MassGIS reference, not a runtime dependency.

## Platform references

- Geolocation secure-context and visible-document behavior: https://www.w3.org/TR/geolocation/#request-a-position
- Home Screen Web Push: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Screen Wake Lock: https://www.w3.org/TR/screen-wake-lock/
- Safari storage policy: https://webkit.org/blog/14403/updates-to-storage-policy/
- Native Apple background location: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- Android background location: https://developer.android.com/develop/sensors-and-location/location/background

## Verification

Node tests cover route geometry, GPS uncertainty and jumps, false-alert suppression, temporal confirmation, recovery hysteresis, pause/stale/resume handling, duplicate/future samples, repeated route segments, all six checkpoints on a full Four Ponds replay, safe import limits, untrusted metadata and GPX gap preservation. UI checks must also cover actual browser geolocation permissions, service-worker readiness and offline reload, plus phone/desktop layout. Field performance and lock-screen behavior require real-device testing before a navigation release.
