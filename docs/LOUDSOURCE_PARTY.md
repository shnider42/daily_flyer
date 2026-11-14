# Loudsource party night

Existing DFE service: `srv-d7k3s4df420s7385n520`; branch `loudsource`; https://ds-ls-1.onrender.com/.

## Running a night

Open Hosting, enter your nickname and MAIN. MAIN reuses its existing Spotify authorization; other room codes have independent connections. Open Spotify on the speaker device, play a song, and check devices in the host desk. Reconnect only if needed. Share the room link or QR code; guests only need a nickname.

Play top pick starts the winning track and enables auto queue. Start with an empty Spotify queue for predictable order: existing Spotify queue entries can run ahead of Loudsource picks. Guests have three active song picks, each one a vote. Played/removed songs return picks. Host pause disables auto queue. The host can select a device, rename the party, change song prompts, remove requests, and transfer hosting to a joined guest.

Trivia and polls are asynchronous: 30 questions in six packs, immutable server-scored answers, and six opinion polls. No clocks, speed bonuses, or waiting for other players. Scores belong to the room, not a daily reset.

## Deployment and data

Keep the existing `/var/data` disk, Spotify app settings, callback URL, and gunicorn command (one worker, four threads). Database changes are additive, retaining all existing Spotify tokens and aggregate queue votes. Extra tables store guest seats, individual ballots, answers, polls, and the last 30 played tracks.

Random seat tokens are hashed server-side and retained in browser localStorage. The first explicit host claim owns the desk. Transfer it before leaving or clearing browser storage. Nicknames/scores are room-visible. Room codes are invitations, not strong privacy boundaries. Records currently remain until operator removal; the UI states this. No analytics scripts or ads. Spotify receives searches and playback requests.

One shared monitor handles Spotify; guest polling is database-only. Searches cache for 60 seconds. SQLite WAL and write transactions protect contested actions; room capacity is 100 remembered guests. Do not increase gunicorn workers without moving monitor ownership and rate limits into shared infrastructure. `FLASK_SECRET_KEY` is preserved if configured; otherwise a private cookie-signing key is generated on the disk.

Next iterations: restart-the-night controls, host recovery, larger question packs, retention/export, moderation, and Spotify queue reconciliation. No preview mocks or test catalog are shipped.

## Verification

`LOUDSOURCE_DISABLE_MONITOR=1 LOUDSOURCE_DATABASE_PATH=/tmp/loudsource-suite.db python -m unittest discover -s tests -v`

27 tests include 40 concurrent guests, same-person competing votes, budgets/idempotency, room isolation, reconnect, host-only legacy controls, transfer, persistence, hidden answers/first-answer locking, invalid input, cross-origin rejection, OAuth state checks, Spotify link search/cache, and no Spotify calls from guest refreshes. Browser QA covers joining, host desk, music search/votes, trivia confirmation, polls, sharing and 428px phone layout. Speaker playback must be verified with the host's actual Spotify device.
