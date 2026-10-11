"""Disposable Worlds Collide soak; no production database or GUI needed.

Run with WW2_BACKGROUND_AI=0 python tests/ww2-scale-benchmark.py --rounds 2.
The explicit test app still uses the production durable queue/checkpoints.
"""
import argparse
import json
import os
from pathlib import Path
import resource
import sqlite3
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ww2_web import create_app
from ww2_tactics import pipeline, jobs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rounds', type=int, default=2)
    parser.add_argument('--memory-mb', type=int, default=512)
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_AS, (args.memory_mb*1024**2, args.memory_mb*1024**2))
    with tempfile.TemporaryDirectory(prefix='dsl-scale-') as directory:
        path = os.path.join(directory, 'games.sqlite')
        app = create_app(path, background_ai=True, start_worker=False)
        client = app.test_client()
        host = client.post('/api/match', json=dict(opponent='cooperative', ruleset='dsl',
            scenario='current:worlds_collide', control_size='platoons')).json
        url = '/api/match/'+host['code']
        ally = client.post(url+'/join', json=dict(side='us', group='us:E', player_name='Scale ally')).json
        queue = app.extensions['ww2_computer_queue']
        bodies, times, rounds = [], [], []
        sources = {}

        def request(seat, body=None, suffix=''):
            auth = {'Authorization':'Bearer '+seat['token'], 'X-WW2-Protocol':'2'}
            previous = sources.get(seat['token'])
            if previous: auth['X-WW2-State'] = previous['_transport']['hash']
            started = time.perf_counter()
            response = (client.get(url+suffix, headers=auth) if body is None else
                client.post(url+suffix, headers=auth, json=dict(revision=previous['revision'], **body)))
            times.append(time.perf_counter()-started); bodies.append(len(response.data))
            assert response.status_code == 200, (response.status_code, response.json)
            data = response.json
            if data.get('delta'):
                result = pipeline.patch({k:v for k,v in previous.items() if k != '_transport'}, data['changes'])
                data = dict(result, _transport=data['_transport'])
            sources[seat['token']] = data
            return data

        def raw():
            with sqlite3.connect(path) as db:
                return json.loads(db.execute('SELECT state FROM match WHERE code=?', (host['code'],)).fetchone()[0])

        state = request(host); request(host, {'operation':'start'}, '/cooperative'); request(ally)
        scout = next(u for u in sources[host['token']]['units'] if u['kind']=='scout' and u['platoon']=='A')
        move = next(m for m in sources[host['token']]['legal'][scout['id']]['moves'] if m['cost']==1)
        moved = request(host, dict(kind='move',unit=scout['id'],pos=move['pos']))
        move_bytes, move_seconds = bodies[-1], times[-1]
        for _ in range(args.rounds):
            request(host); request(host, {'kind':'end'}); request(ally); request(ally, {'kind':'end'})
            started, batches = time.perf_counter(), 0
            while queue.work_once():
                batches += 1
                request(host); request(ally)
                if batches % 25 == 0:
                    print(json.dumps(dict(progress=batches, round=raw()['round'], rss_mb=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1))), flush=True)
                assert batches < 400, 'AI did not return control within its order budget'
            live = raw()
            assert not jobs.needed(live)
            assert live['turn']=='us' or live['winner']
            rounds.append(dict(seconds=round(time.perf_counter()-started,2), batches=batches, revision=live['revision'], round=live['round']))
            if live['winner']: break
        snapshot = request(host)
        movie = snapshot['computer_playback']
        pages = []
        for start in range(0,movie['count'],pipeline.PAGE):
            response = client.get(url+'/replay/'+movie['stream']+'?start='+str(start),
                headers={'Authorization':'Bearer '+host['token']})
            assert response.status_code==200
            assert len(response.json['events'])<=pipeline.PAGE
            pages.append(len(response.data))
        with sqlite3.connect(path) as db:
            state_bytes = db.execute('SELECT length(state) FROM match WHERE code=?',(host['code'],)).fetchone()[0]
            replay_bytes = db.execute('SELECT coalesce(sum(length(event)+coalesce(length(checkpoint),0)),0) FROM ww2_replay_events').fetchone()[0]
        print(json.dumps(dict(map_hexes=3584, units=len(live['units']), rounds=rounds,
            first_move=dict(bytes=move_bytes,seconds=round(move_seconds,3)), max_response_bytes=max(bodies),
            p95_response_seconds=round(sorted(times)[int(len(times)*.95)],3), live_state_bytes=state_bytes,
            compressed_replay_bytes=replay_bytes, replay_page_max_bytes=max(pages,default=0),
            peak_rss_mb=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1), memory_cap_mb=args.memory_mb)), flush=True)
        queue.stop()


if __name__ == '__main__': main()
