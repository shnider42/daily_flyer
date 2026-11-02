# The Sunday Film Room

Six original PGI compositions inspired by the broad orchestral football-film vocabulary associated with Sam Spence: brass statements, field snare, strings, timpani, woodwind answers, and reflective horn themes. No NFL Films melodies, arrangements or recordings are inputs.

The previous rock catalog is retained in the repository for recovery but is no longer offered or played. The existing BC, Notre Dame and generic scoring cues are unchanged.

## Reproduce

Install `tinysoundfont==0.3.7`, numpy and scipy. Obtain **GeneralUser GS 2.0.3** by S. Christian Collins from https://www.schristiancollins.com/generaluser.php (official source repository: https://github.com/mrbumpy409/GeneralUser-GS). Its License v2.0 permits using the instrument bank in private or commercial musical recordings. The SoundFont itself is not shipped to players.

```
python scripts/pgi_music/compose_film_score.py /path/to/GeneralUser-GS.sf2 daily_flyer/themes/pocket_gridiron_assets/music
```

Requires FFmpeg with libmp3lame. Rendered at 44.1 kHz stereo, mastered toward -18 LUFS / -2 dBTP, with conservative hall reflections and a stable mono center. Every piece has an opening, main theme, woodwind interlude, ensemble return and final cadence. The manifest includes cue points and durations.
