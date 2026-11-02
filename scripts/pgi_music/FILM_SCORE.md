# The Sunday Film Room

Six original PGI compositions inspired by the broad orchestral football-film vocabulary associated with Sam Spence: brass statements, field snare, strings, timpani, woodwind answers, and reflective horn themes. No NFL Films melodies, arrangements or recordings are inputs.

The active soundtrack pairs three restored arcade tracks with three orchestral postgame themes. See `README.md` for the scene mapping. The other recordings remain archived in the repository. BC and generic scoring cues are unchanged; the Jets cue uses the compact opening-to-ending edit in `compose_fights.py`.

## Reproduce

Install `tinysoundfont==0.3.7`, numpy and scipy. Obtain **GeneralUser GS 2.0.3** by S. Christian Collins from https://www.schristiancollins.com/generaluser.php (official source repository: https://github.com/mrbumpy409/GeneralUser-GS). Its License v2.0 permits using the instrument bank in private or commercial musical recordings. The SoundFont itself is not shipped to players.

```
python scripts/pgi_music/compose_film_score.py /path/to/GeneralUser-GS.sf2 /tmp/pgi-film-render
```

Requires FFmpeg with libmp3lame. Rendered at 44.1 kHz stereo, mastered toward -18 LUFS / -2 dBTP, with conservative hall reflections and a stable mono center. Every piece has an opening, main theme, woodwind interlude, ensemble return and final cadence. The manifest includes cue points and durations.

This command creates the complete six-piece film album in a temporary output directory. Copy only the desired MP3s to the game; preserve the curated mixed `music/manifest.json`.
