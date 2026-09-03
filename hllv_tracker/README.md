# HLLV Evidence Tracker

A public evidence ledger for Hell Let Loose: Vietnam issues and community-server incidents.

The current prototype contains 44 issue dossiers and 66 source records. It separates support reports, official acknowledgement, reproduction, released changes, post-fix verification, and root-cause certainty.

## Core rule

**Unknown is a valid result.**

The tracker records what was observed and who made each claim. It does not infer a root cause simply because a plausible explanation exists.

## Record types

- **Issue**: a canonical problem statement.
- **Observation**: one report or measurement tied to an issue.
- **Incident**: an operational event, especially for SoulSniper and other community servers.
- **Evidence**: a source and the exact claim it supports.
- **Hypothesis**: a proposed cause kept separate from a confirmed cause.

An official patch note is strong evidence that a defect class existed and that a change shipped. It does not prove that every historical incident with similar symptoms had that cause.

A Team17 Support reply confirms that Support received, investigated, or escalated a report. It does not automatically mean the development team reproduced the bug.

A SoulSniper outage can establish that the server became unavailable when operator telemetry supports it. It does not by itself distinguish a game-server crash from hosting, networking, backend connectivity, RCON behavior, or an administrative restart.

## Local preview

From the repository root:

```bash
python -m http.server 8000
```

Then open `/hllv_tracker/`.
