# Farwake privacy and data access

Effective notice: `dist/privacy.html`, dated November 10, 2026. Public contact: `chris@holtsnidertech.com`.

This feature belongs to Farwake. It does not export or change records belonging to Infierno Liberado, New Passage, or other DailyFlyer themes, even when they share a hosting or database project.

## Identity and storage boundary

Farwake has no email/password registration and does not create Supabase Auth users. A shared captain has a random identifier and a high-entropy private passport token. The authority stores a SHA-256 verifier. Possession of a valid passport proves control of that captain; knowing a name, captain identifier, or realm invitation code does not.

The Node authority reads and writes whole shared-galaxy snapshots through the existing server-only persistence gateway. The private `farwake.realms` table holds one current JSONB snapshot per realm plus its compare-and-swap version and update timestamp. Browser clients have no direct snapshot-table access. No database schema, policies, grants, or gateway credentials are changed for this export feature.

Production services:

- Website: `https://dfe-farwake.onrender.com/` (Render static CDN).
- Authority: `https://dfe-farwake-universe.onrender.com/` (Render Oregon).
- Durable snapshots: the previously configured Supabase project, primary AWS `us-west-2` / Oregon.

Provider logs and backups are outside the automatic report. Do not claim the export is every byte held by every provider, or that deleting browser data deletes a server captain.

## Browser report

Only explicit Farwake storage keys are read. A browser may hold more than one person's records, so this is labeled **browser data**, not a merged personal identity.

| Storage | Purpose | Export treatment |
| --- | --- | --- |
| `dfe.farwake.save.v1` | Local solo voyage and progress | Recognized saved gameplay data; no automatic upload |
| `dfe.farwake.settings.v1` | Device controls, audio, accessibility, guidance, layout, solo camera | Recognized settings only |
| `dfe.farwake.action-guide.v1` | Bounded local tutorial profiles | Local guide records, explicitly within browser scope |
| `farwake.multiplayer.passport.v1` | Recovery credentials for saved captains | References only; never tokens |
| `dfe.farwake.camera-pending.v1:<realm>:<captain>` | Pending camera changes | Recognized camera fields and scope |

Do not enumerate and export arbitrary origin storage. Do not treat imported data as executable HTML. Report malformed or omitted records explicitly; do not substitute an empty successful-looking report. Reports are JSON files created locally, not server-hosted archives.

## Selected captain report

`POST /api/privacy/export` receives only:

```json
{
  "passport": {
    "realmCode": "EXAMPLE1",
    "captainId": "captain_example",
    "token": "private-credential-supplied-by-the-browser"
  }
}
```

The token belongs in the JSON request body, never in a URL, diagnostics, exported report, or server log. The endpoint uses the existing allowed-origin checks, bounded request body, rate limits, and `Cache-Control: no-store` responses. Missing or invalid credentials cannot retrieve a report. Additional identity fields supplied by a client cannot select a different captain.

Success is `{ "ok": true, "export": { ... } }`. The report identifies `schemaVersion`, `generatedAt`, `scope.kind`, `scope.realmCode`, `scope.captainId`, and whether the source was the live authority or the latest durable snapshot. The client checks the returned scope against the requested captain before downloading.

Coverage includes the selected captain's retained identity metadata and gameplay, their owned vessels and homes, and relevant self-only permissions, berths, relationships, and contributions in shared records. Conversation familiarity and recurring-acquaintance memory are included only for the selected captain. The NPC clock and transient pose projection are shared world state and do not become another captain’s private report. Projection is explicit. A report must never return the complete realm, other captains' private profiles, full shared contributor maps, private tokens, or credential hashes.

The server reads a loaded realm without invoking stateful serialization or gameplay. An unloaded realm is read directly through the persistence adapter without constructing a `Realm`, attaching a session, updating `lastSeen`, advancing simulation, or creating a saved record. An export does not replace a running session and does not consume one of the ten online places.

`Realm.document()`, `Realm.snapshotFor()`, and game serialization are not pure read helpers: they can capture or modify runtime state, drain events, or include other players. Do not use their whole output as an export implementation.

No stored export archive, export-history table, email delivery, or new analytics event is added. HTTP/provider logs may still record the request. No self-service deletion or credential rotation is introduced by this feature; broader access/deletion requests remain manual.

## Data minimization

Device settings use an explicit supported-field list instead of perpetuating arbitrary imported properties. Legacy camera migration remains supported. Outgoing passport objects carry only `realmCode`, `captainId`, and `token`.

The authority's bounded, memory-only request-limit map expires network addresses after ten idle minutes, with periodic cleanup. That addresses the application's temporary limiter; it does not set Render or Supabase log retention.

Do not add automatic deletion of saved captains or voyages as a side effect of export. Shared progress intentionally persists across long absences. A separate retention change must account for ship ownership, berths, grants, NPC employment, world contributions, and other players' continuing saves.

## Maintenance and verification

When adding a stored field or a new shared contributor structure, update the projection, its meaningful own-versus-other tests, the report manifest, and the public notice together. New arbitrary fields must not be automatically exposed by a broad object spread.

Verify at least:

- Correct versus missing, malformed, wrong-captain, and wrong-realm credentials.
- Two captains with distinct private data; self data is included and the other's private fields and verifier are absent.
- References and contributions outside the primary captain object, without whole shared-world or contributor-map disclosure.
- Active, disconnected, full, and unloaded realms; no session takeover, timestamp mutation, simulation, or persistence write caused by the request.
- Browser storage isolation, unsupported/malformed records, secret redaction, and device-wide scope labeling.
- Failure does not become a silently incomplete server export; no-store headers and request-size/rate bounds remain enforced.
- Existing solo saving, private passport recovery, camera synchronization, and current shipless/crew progression still work.

The Render builds run the existing project test suites. Verify both frontend and authority deployments and the public notice before reporting the feature live.
