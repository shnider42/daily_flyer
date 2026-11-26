# Farwake menu recording

`farwake-menu-theme.m4a` is the complete, unmodified AAC recording used by the
live main Farwake title screen. Nightglass plays the existing file; it does not
recompose, trim, or transcode the music.

- Display title: **Farwake menu theme**
- Credit: **Original music contributed by a friend of Farwake.**
- Documented duration: 197.625 seconds
- Source repository: `shnider42/daily_flyer`
- Source branch: `feat/farwake-galaxy`
- Source commit: `756fee9ba7456b028fda0dc714829edf33a713ed`
- Source path: `games/farwake/dist/music/shnider-menu-theme.m4a`
- Git blob SHA: `e7c5a72f297e39a04d4d7a9c389eb3589dcea987`
- Size: 2,771,339 bytes

The local copy was checked against the source Git blob hash. The shared transport
is adapted from `games/farwake/dist/recorded-theme.mjs` at the same commit, keeping
the menu recording's metadata and a single reusable media element.

The contributor's preferred artist name has not been supplied. Do not infer an
artist from the upload filename. When the exact credit is provided, update the
`MENU_THEME` metadata in `../menu-theme.mjs` and this provenance note together.

Playback placement in 0.4.0: chapter-menu loop after an explicit audio gesture;
fade on entry to a chapter. The final viewpoints stay with station sounds and
silence. Returning to the chapter menu restores its theme. The recording and
credit are unchanged; no victory reprise plays over a witness ending.
