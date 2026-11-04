#!/usr/bin/env python3
"""Two Green Bay auditions with the same long intro and different groove tempos.

Run: python scripts/pgi_music/compose_green_bay_takes.py --render
The current game cue is retained; these are separately selectable previews.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from compose_green_bay import REFERENCE_BPM, score as current_score
from compose_fights import HERE, MUSIC, SCORES, note

INTRO_SECONDS = 8 * 60 / REFERENCE_BPM


def comparison_score(bpm):
    source = current_score()
    lead_in = INTRO_SECONDS * bpm / 60
    composed = deepcopy(source)
    number = 1 if bpm == 63 else 2
    composed.update(
        id=f'lambeau-long-drop-{bpm}',
        title=f'Lambeau Bounce — Take {number} · {bpm} BPM',
        bpm=bpm, bars=(lead_in + 28) / 4, body_bars=7,
        intro_seconds=INTRO_SECONDS, body_start_beat=lead_in,
        purpose='Green Bay comparison preview',
        revision='Shared long intro; half-speed take' if bpm == 63 else 'Shared long intro; bass-led funk take',
        sections=[{'beat': 0, 'name': 'Shared long falling synth'},
                  {'beat': lead_in, 'name': f'{bpm}-BPM groove begins'},
                  {'beat': lead_in + 8, 'name': 'Synth answer'},
                  {'beat': lead_in + 16, 'name': 'Repeat the groove'},
                  {'beat': lead_in + 24, 'name': 'Final bar'}],
    )
    # Express the fixed-duration intro on each take's beat grid. This keeps
    # the drop and drum pickup identical in seconds despite different BPMs.
    composed['tracks'][0]['notes'] = [note(95, 0, 7.72 * bpm / REFERENCE_BPM, 104)]
    for part in composed['tracks'][1:]:
        part['notes'] = [dict(n, start=n['start'] - 4 + lead_in)
                         for n in part['notes'] if n['start'] >= 4]
        if part['instrument'] == 'electronic_drums':
            part['notes'][:0] = [note(38, b * bpm / REFERENCE_BPM,
                                     .08 * bpm / REFERENCE_BPM, v)
                                 for b, v in [(7.5, 64), (7.75, 81)]]
            part['name'] = f'Straight {bpm}-BPM backbeat'
        if bpm == 112:
            if part['instrument'] == 'stadium_bass':
                part['volume'] = .90
                for n in part['notes']:
                    n['duration'] *= .92
            elif part['name'] == 'Two-bar synth answer':
                part['volume'] = .27
                for n in part['notes']:
                    n['duration'] *= .92
            elif part['name'] == 'Low chord punches':
                part['volume'] = .26
            elif part['instrument'] == 'electronic_drums':
                # Preserve the shared pickup. Emphasize only the body's claps.
                for n in part['notes']:
                    if n['start'] >= lead_in and n['pitch'] == 38:
                        n['velocity'] = min(112, n['velocity'] + 5)
    return composed


def render(path, stem, keep_wav=False):
    command = [sys.executable, str(HERE / 'render_preview.py'), str(path),
               str(stem), '--tail', '.35']
    if keep_wav:
        command.append('--keep-wav')
    subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(stem.with_suffix('.render.json').read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args()
    scores = [comparison_score(bpm) for bpm in [63, 112]]
    if args.render:
        # Calibrate together, then render both with one common mastering gain.
        with tempfile.TemporaryDirectory(prefix='pgi-gb-takes-') as tmp:
            peaks = []
            for composed in scores:
                path = Path(tmp) / (composed['id'] + '.json')
                path.write_text(json.dumps(composed))
                report = render(path, Path(tmp) / composed['id'])
                peaks.append(report['normalization_peak'])
            shared_peak = max(peaks) + 1e-8
            for composed in scores:
                composed['normalization_peak'] = shared_peak
    for composed in scores:
        path = SCORES / (composed['id'] + '.json')
        path.write_text(json.dumps(composed, indent=2) + '\n')
        if args.render:
            report = render(path, MUSIC / composed['id'])
            print(json.dumps({'id': composed['id'], 'bpm': composed['bpm'],
                              'intro_seconds': INTRO_SECONDS,
                              'duration_seconds': report['preview_seconds'],
                              'peak_dbfs': report['peak_dbfs']}))


if __name__ == '__main__':
    main()
