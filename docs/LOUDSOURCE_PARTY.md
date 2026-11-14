# Loudsource party night

Existing DFE service: `srv-d7k3s4df420s7385n520`; branch `loudsource`; https://ds-ls-1.onrender.com/.

## Running a night

Open Hosting, enter your nickname and MAIN. MAIN reuses its existing Spotify authorization; other room codes have independent connections. Open Spotify on the speaker device, play a song, and check devices in the host desk. Reconnect only if needed. Share the room link or QR code; guests only need a nickname.

Play top pick starts the winning track and enables auto queue. Start with an empty Spotify queue for predictable order: existing Spotify queue entries can run ahead of Loudsource picks. Guests can vote for every song on the list, once per song, and tap again to undo. They can add three new songs at a time; each request includes their vote. Played/removed requests free a submission slot. Undoing the last vote removes an unplayed request; if others still support it, it keeps the original request slot until played or removed. Existing pre-update votes stay intact without retroactively assigning ownership. Host pause disables auto queue. The host can select a device, rename the party, change song prompts, remove requests, and transfer hosting to a joined guest.

Trivia and polls are asynchronous: 30 questions in six packs, immutable server-scored answers, and six opinion polls. No clocks, speed bonuses, or waiting for other players. Scores belong to the room, not a daily reset.

## Spotify relationship

Only the host authorizes Spotify. Guests are local nickname seats, with no Spotify account, follower, family-plan, or Jam relationship. Catalog search uses server-side client credentials. Votes and games only use SQLite and continue without Spotify playback authorization. The host connection requests playback read/control scopes, not private playlists, library, or followers. Host transfer passes control of the already-connected account; it does not link the recipient's Spotify account. Settings and OAuth scopes are unchanged by the voting update.

Spotify development-mode allowlisting applies to accounts authorizing Spotify access; it is not a guest registry in this design. Playback requires the host's Premium account and a usable device. Search/playback still depend on Spotify app access and API quotas. Official references checked November 14, 2026: https://developer.spotify.com/documentation/web-api/concepts/quota-modes and https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow .

## Deployment and data

Keep the existing `/var/data` disk, Spotify app settings, callback URL, and gunicorn command (one worker, four threads). Database changes are additive, retaining all existing Spotify tokens and aggregate queue votes. Extra tables store guest seats, individual ballots, request ownership, answers, polls, and the last 30 played tracks.

Random seat tokens are hashed server-side and retained in browser localStorage. The first explicit host claim owns the desk. Transfer it before leaving or clearing browser storage. Nicknames/scores are room-visible. Room codes are invitations, not strong privacy boundaries. Records currently remain until operator removal; the UI states this. No analytics scripts or ads. Spotify receives searches and playback requests.

At startup, database integrity is checked before worker threads begin. If indexes are damaged, a private disk snapshot is saved before recovery. A rebuilt database is used only after every original table row compares equal and integrity checks pass; unreadable table data stops startup instead of being discarded. Original snapshots remain on the persistent disk for operator review.

The monitor starts on the first worker request, never during Gunicorn master preloading. Database contexts close their connections before returning. Failed refresh tokens back off for five minutes, and reconnect clears that backoff. One shared monitor handles Spotify; guest polling is database-only. Searches cache for 60 seconds. SQLite WAL and write transactions protect contested actions; room capacity is 100 remembered guests. Do not increase gunicorn workers without moving monitor ownership and rate limits into shared infrastructure. `FLASK_SECRET_KEY` is preserved if configured; otherwise a private cookie-signing key is generated on the disk.

Next iterations: restart-the-night controls, host recovery, larger question packs, retention/export, moderation, and Spotify queue reconciliation. No preview mocks or test catalog are shipped.

## Verification

`LOUDSOURCE_DISABLE_MONITOR=1 LOUDSOURCE_DATABASE_PATH=/tmp/loudsource-suite.db python -m unittest discover -s tests -v`

37 tests include 40 concurrent guests, same-person competing votes, budgets/idempotency, room isolation, reconnect, host-only legacy controls, transfer, persistence, hidden answers/first-answer locking, invalid input, cross-origin rejection, OAuth state checks, Spotify link search/cache, and no Spotify calls from guest refreshes. Browser QA covers joining, host desk, music search/votes, trivia confirmation, polls, sharing and 428px phone layout. Speaker playback must be verified with the host's actual Spotify device.
