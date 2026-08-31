# HLLV Evidence Tracker

Prototype for tracking Hell Let Loose: Vietnam issues without collapsing community reports, support responses, official acknowledgement, shipped fixes, and root-cause hypotheses into one status.

## Core rule

**Unknown is a valid result.**

The tracker should record what was observed and who made each claim. It should not infer a root cause simply because a plausible explanation exists.

## Record types

- **Issue**: a canonical problem statement, such as persistent Recon markers.
- **Observation**: one report or measurement tied to an issue.
- **Incident**: an operational event, especially useful for SoulSniper/community-server outages.
- **Evidence**: a source and the exact level of claim it supports.
- **Hypothesis**: a proposed cause that remains separate from confirmed cause.

## Evidence examples

An official patch note saying a fix shipped is strong evidence that the defect class existed, but it does not prove that every historical incident with similar symptoms had that cause.

A Team17 support reply confirms that support received or escalated a report; it does not automatically mean a developer reproduced the bug.

A SoulSniper outage confirms that the server became unavailable if operator telemetry supports it. It does not, by itself, distinguish a game-server crash from Qonzer infrastructure, EOS/backend connectivity, RCON behavior, or an administrative restart.

## Prototype

Open `index.html` through a local static HTTP server. From the repository root:

```bash
python -m http.server 8000
```

Then browse to `/hllv_tracker/`.

The first five seed issues live in `data/issues.json` and are deliberately chosen to exercise different evidence states.
