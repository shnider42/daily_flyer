# Verification — 2026-11-03

- Nine Node tests cover due-date filtering, stream/stage/query composition, missing metrics, calendar-day arithmetic across DST, HTML and URL safety, backup schema/date checks, CSV formula neutralization, and byte-preserving attachment import preparation.
- Three Flask route tests cover both theme spellings, all public assets, and source-file/path-traversal rejection.
- Browser checked desktop and a 390 px iframe (375 px content viewport with scrollbar): the board has its own horizontal scrolling and the document body does not overflow.
- Created a personal opportunity with literal `<Studio>` text; changed its stage; created and completed a follow-up; logged an interview; created a text document; reloaded and verified saved state.
- Uploaded a test text attachment to the local IndexedDB cabinet; exported the real browser backup; parsed/validated it in Node and recovered the attachment byte for byte.
- Verified demo/personal workspace separation and month calendar rendering.
- Existing DFE theme-platform suite: 12/15 pass; the same three failures reproduce against the unchanged base `2a05319`: Birthday wording, Irish visual-lab style switcher, and Nissan Z rendering assertions. The Next Chapter route addition does not change these results. No unrelated theme changes made.

The 390 px check verifies responsive layout, not a physical iPhone or Safari. Cloud account integration is not implemented in this edition.
