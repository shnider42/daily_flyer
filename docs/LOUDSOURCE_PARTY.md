# Loudsource party night

Existing DFE service: `srv-d7k3s4df420s7385n520`; branch `loudsource`; https://ds-ls-1.onrender.com/.

## Running a night

Open Hosting, enter your nickname and MAIN. MAIN keeps its saved Spotify authorization; other room codes have independent connections. Connect Spotify if needed, then choose **Start Spotify session** in the host desk. Connecting an account or opening the page does not start a session or play music. Open Spotify on the speaker device and use **Check devices** to choose it. Share the room link or QR code; guests only need a nickname.

With a Spotify session active, Play top pick starts the winning track and enables auto queue. Start with an empty Spotify queue for predictable order: existing Spotify queue entries can run ahead of Loudsource picks. Guests can vote for every song on the list, once per song, and tap again to undo. They can search and add three new songs at a time while the Spotify session is active; each request includes their vote. Played/removed requests free a submission slot. Undoing the last vote removes an unplayed request; if others still support it, it keeps the original request slot until played or removed. Existing pre-update votes stay intact without retroactively assigning ownership. Host pause disables auto queue. **Pausing directly in Spotify stays paused:** Loudsource never automatically resumes it. The host can select a device, rename the party, change song prompts, remove requests, and transfer hosting to a joined guest.

Choose **End Spotify session** when finished. This immediately disables Loudsource's Spotify control and automatic queueing without pausing or otherwise changing Spotify playback. The room, votes, games, and saved account connection remain available. Song search, device checks, playback controls, background monitoring, and token refresh require an active session.

Trivia and polls are asynchronous: 30 questions in six packs, immutable server-scored answers, and six opinion polls. No clocks, speed bonuses, or waiting for other players. Scores belong to the room, not a daily reset.

## The 12-hour session cutoff

A Spotify session expires after **12 hours without deliberate use of the host's Spotify controls**. Start session, Play top pick, Auto queue, Pause, Resume, device selection, and Check devices establish or extend that window. The host desk displays the expiry time and whether the session is inactive, active, ended, or expired. An expired session requires another explicit Start Spotify session.

Page refreshes, open tabs, background playback monitoring, guest activity, song searches, votes, trivia, polls, queue removal/clearing, party renaming, prompt changes, and host transfers do not extend the cutoff. A saved OAuth connection alone never authorizes background activity. Existing saved connections and rooms migrate to an inactive session until the host explicitly starts one. Reconnecting Spotify saves the authorization but also leaves control inactive.

The cutoff is evaluated on the server before Spotify work, independent of browser timers. Ending or expiring a session clears auto queue and prevents subsequent Spotify control. Spotify may still play tracks already present in its own queue; ending Loudsource control does not remove those entries.

## Spotify relationship

Only the host authorizes Spotify. Guests are local nickname seats, with no Spotify account, follower, family-plan, or Jam relationship. Catalog search uses server-side client credentials and requires an active room Spotify session. Votes and games only use SQLite and continue without an active Spotify session. The host connection requests playback read/control scopes, not private playlists, library, or followers. Host transfer passes the host desk for the already-connected account; it neither links the recipient's Spotify account nor restarts or extends a Spotify session. OAuth scopes are unchanged.

Spotify development-mode allowlisting applies to accounts authorizing Spotify access; it is not a guest registry in this design. Playback requires the host's Premium account and a usable device. Search/playback still depend on Spotify app access and API quotas. Official references checked November 14, 2026: https://developer.spotify.com/documentation/web-api/concepts/quota-modes and https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow .

## Deployment and data

Keep the existing `/var/data` disk, Spotify app settings, callback URL, and gunicorn command (one worker, four threads). Database changes are additive, retaining all existing Spotify tokens and aggregate queue votes. Extra tables store guest seats, individual ballots, request ownership, answers, polls, and the last 30 played tracks.

Random seat tokens are hashed server-side and retained in browser localStorage. The first explicit host claim owns the desk. Transfer it before leaving or clearing browser storage. Nicknames/scores are room-visible. Room codes are invitations, not strong privacy boundaries. Records currently remain until operator removal; the UI states this. No analytics scripts or ads. Spotify receives searches and playback requests.

At startup, database integrity is checked before worker threads begin. If indexes are damaged, a private disk snapshot is saved before recovery. A rebuilt database is used only after every original table row compares equal and integrity checks pass; unreadable table data stops startup instead of being discarded. Original snapshots remain on the persistent disk for operator review.

The monitor starts on the first worker request, never during Gunicorn master preloading. It only contacts Spotify for active, unexpired control sessions; its own work never renews them. Database contexts close their connections before returning. A failed token refresh ends Spotify control and requires reconnecting; that reason survives a process restart. One shared monitor handles Spotify; all page-state polling is database-only. Searches cache for 60 seconds and never renew a session. SQLite WAL and write transactions protect contested actions; room capacity is 100 remembered guests. Do not increase gunicorn workers without moving monitor ownership and rate limits into shared infrastructure. `FLASK_SECRET_KEY` is preserved if configured; otherwise a private cookie-signing key is generated on the disk.

Next iterations: restart-the-night controls, host recovery, larger question packs, retention/export, moderation, and Spotify queue reconciliation. No preview mocks or test catalog are shipped.

## Verification

`LOUDSOURCE_DISABLE_MONITOR=1 LOUDSOURCE_DATABASE_PATH=/tmp/loudsource-suite.db python -m unittest discover -s tests -v`

The regression suite covers concurrent guests, same-person competing votes, budgets/idempotency, room isolation, reconnect, host-only controls, transfer, persistence, hidden answers/first-answer locking, invalid input, cross-origin rejection, OAuth state checks, Spotify link search/cache, and no Spotify calls from page-state refreshes. Session checks must cover migration to inactive, explicit Start/End, exact 12-hour expiry, only deliberate host Spotify controls extending the window, no automatic resume after a Spotify pause, and local votes/games surviving an inactive session. Browser QA should cover inactive, active, ended, and expired host states; playback/search gating; expiry updates without losing edits to the party name; and desktop and phone layouts. Tests must mock Spotify so verification does not change a live account. Speaker playback still needs verification with the host's actual Spotify device after deployment.
