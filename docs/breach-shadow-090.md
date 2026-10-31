# Breach 0.9.0 — Beneath The Shadow

A standalone eighth mission beneath a city that built a second sun and then
buried the evidence. Ten connected districts occupy a 121 × 113 map, with
walking loops, five refuges, two transit pairs, eight optional records, three
secrets and two optional gantry courses. It supports solo and private two-player
co-op. This is a complete expedition, not persistent campaign progression.

## Route and earned equipment

Start with the pistol. Restore the lantern circuit in the exchange, then explore
the rivet works for a rapid Rivet repeater. Its ammunition is shared with the
pistol. The bolted Iron Warden guards the laboratory access circuit; it telegraphs
salvos and cools between attacks. Cover interrupts its line of fire.

Defeating the Warden opens the still laboratory and its Null projector. A hit
marks a root for eight seconds. Killing it while marked prevents division;
switching to a damage weapon makes best use of that window. The projector also
opens a blue-sealed shortcut in previously visited territory.

The House of Echoes is accessible before the laboratory. Its Many-Mouthed root
can divide into two children, which can each divide into two final roots. Without
suppression this is a finite seven-root fight, with no mandatory equipment lock.
Defeating the family releases the Breach lance, a slow shot that can pierce three
targets but stops at walls. A scattergun can be found in the lantern district.
Co-op weapon discoveries equip both operators without changing the partner's
selected gun; ammunition consumption remains individual.

Ring the western and echo bells to open the engine chamber. Defeat the Umbra
Engine, collect its road-lift key and return to the opening road, using activated
transit stations or the district loops. Earned equipment, defeated boss branches
and discoveries persist across checkpoint retries. Solo saves preserve them too.

## Music and silence

Three new original compositions ship as MIDI and procedural MP3 renders. No
reference song or recording was used. Source and provenance are in
`music/README.md` and `scripts/breach_music/compose_shadow.py`.

| Place | Cue | Entry and restraint |
| --- | --- | --- |
| Falling road | Shadow Running, 140 BPM | Fresh start, 1.4-second fade, one full phrase |
| Iron Warden encounter | Shadow Running | Three seconds of local guardian exposure, two-second fade |
| Lantern quarter | Lanterns Below, 80 BPM | Four-second dwell, two-second fade |
| Broken aqueduct approach | Lanterns Below | Separate single passage, four-second dwell |
| House of Echoes and Umbra Engine | Sever the Echo, 154 BPM | Each boss gets one passage after local exposure |
| Still laboratory, suspended street and chapel | Silence | Fade out on entry; effects remain audible |
| Records, refuges, menus and map inspection | Silence | Local music yields; co-op world follows the separate pause rules |
| Cleared boss chambers | Silence | No victory loop or replay on a later visit |

Boss entries can fade out a current passage and take their authored slot after
exposure. Sources do not overlap. Other passages remain subject to quiet gaps,
entry windows and once-per-section memory. The new full phrases run about
43, 45 and 50 seconds; the safety cap is 56 seconds. Music stays local to each
co-op listener. Existing mission score assignments are preserved.

## Traversal, guidance and presentation

The suspended street introduces contextual jumps with no enemies on the course;
the aqueduct adds an emplacement. Approach a launch beacon, face the landing and
use the normal interaction button. Green indicates a safe arrival window; amber
means wait. One platform retracts on a seven-second cycle. A fall costs health
and returns the operator to stable ground. Optional ammunition and a secret
reward crossing the gaps. Required objectives have walking routes around them.
This extends the existing flat movement model with authored jump arcs, rather
than adding free vertical movement or another touch button.

Simple guidance explains the mechanics and offers a route that avoids gaps.
Moderate uses physical hints, and Expert suppresses unavailable-action hints.
All three use identical access and combat rules. Combat difficulty remains a
separate choice. Lantern obelisks, buried houses, arches and an engine sun give
the districts landmarks; new gun silhouettes, muzzle flashes, suppression color,
launch beacons and boss health displays work in both renderers.

## Co-op pause rules

Opening the map leaves the shared simulation running and stops only that
operator's input. One operator entering the pause/settings menu also leaves the
world running, with a visible warning. When both connected operators enter
menus, the server pauses. Either returning resumes the shared simulation.
Disconnects, stale controls and backgrounded tabs retain the protective team
pause, which requires both operators to resume. A menu vote cannot dismiss that
safety pause. Restarting also requires both operators to resume.

## Validation

Automated coverage includes a complete walking route through earned equipment,
locked gates, both bells and extraction; the hydra's finite hard path and real
Null/pistol/lance shots; independent co-op jumps; gear and boss save/checkpoint
persistence; secrets; stationary telegraphs; all-menu and disconnect pauses;
new cue placement, fades, priority and non-overlap; and both renderer paths.
The export test checks the complete local asset graph, including all six new
music assets. Validation passed 295 JavaScript tests and three export tests. The browser
played the opening and hydra cues through a real AudioContext with nonzero
output, showed the new weapon and gantry art in the software renderer, and
verified the two-client map/menu transitions against the room server. The
two-frame fixture isolated session tokens and iframe-focus blur; separate
server/client tests retain coverage of actual background and disconnect safety.
WebGL geometry and state are covered by tests; this browser has WebGL disabled. A physical iPhone/Safari listening test remains a device check.
