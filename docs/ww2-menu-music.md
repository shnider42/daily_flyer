# Squad Leader menu music

The Squad Leader home and setup menus use the approved **2:40 full arrangement**
of *Battlefield 1942* (composer: **Joel Eriksson**). This is a fan-transcription
arrangement rendered with General MIDI instruments, not the original recording
or an official score. The source piano transcription was obtained from
https://midifind.com/files/game/battlefield_battlefield_1942/429-1-0-7635.

`ww2_tactics/static/audio/battlefield-1942-full-arrangement-v1.mp3` is the exact
approved preview (192 kbps stereo, 44.1 kHz). The matching `.mid` preserves the
editable nine-track arrangement. Neither pitch, tempo nor duration was changed
for this integration.

The player starts on the first click/tap or Enter/Space interaction, loops the
whole track, and uses 35% element volume where the browser supports it. Phones
may also require adjustment with the device's volume controls. Browsers never
need to allow autoplay on page load. Music is downloaded only after interaction.
The Music button remembers on/off in `ww2-menu-music` local storage; playback
also works if storage is unavailable. It pauses during battles, in Empires,
when the tab is hidden, and on page exit. Returning to the Squad Leader menu
resumes the same player and position. Loading or playback errors are recoverable
and do not affect the game.

The audio filenames are versioned and cacheable, including range responses.
Change the version if replacing audio bytes. The same-origin Flask asset route
serves the file; no third-party player, streaming account or MIDI synthesizer is
needed by the browser.

Validation: `node tests/ww2-menu-music-browser.cjs` exercises real MP3 decoding,
gesture startup, looping, mute persistence, battle/home and Empires navigation,
page/tab lifecycle, playback rejection recovery, and mobile layout. The browser
test uses a disposable local database, never production games. Headless Chromium
does not substitute for listening on a physical iPhone/Safari.
