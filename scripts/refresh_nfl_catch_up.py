"""Collect a dated ESPN score snapshot. Never publish partial or wrong-season data.

Usage: python scripts/refresh_nfl_catch_up.py --through-week 8 --as-of 2026-11-04
Editorial stories are reviewed separately; this never updates their review date.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.request
from collections import Counter
import time

ROOT = Path(__file__).resolve().parents[1]
DIVISIONS = {
    'AFC East': ['BUF','MIA','NE','NYJ'], 'AFC North': ['BAL','CIN','CLE','PIT'],
    'AFC South': ['HOU','IND','JAX','TEN'], 'AFC West': ['DEN','KC','LV','LAC'],
    'NFC East': ['DAL','NYG','PHI','WSH'], 'NFC North': ['CHI','DET','GB','MIN'],
    'NFC South': ['ATL','CAR','NO','TB'], 'NFC West': ['ARI','LAR','SF','SEA'],
}

def collect(week):
    url = f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week={week}&limit=100'
    with urllib.request.urlopen(url, timeout=45) as response:
        data = json.load(response)
    assert data['season']['year'] == 2026 and data['season']['type'] == 2
    assert data['week']['number'] == week and data['events'], f'Missing week {week}'
    games, teams = [], {}
    for event in data['events']:
        comp = event['competitions'][0]
        players = {}
        for side in comp['competitors']:
            team = side['team']; abbr = team['abbreviation']
            division = next(name for name, members in DIVISIONS.items() if abbr in members)
            teams[abbr] = {'id':abbr,'name':team['displayName'],'short':team['name'], 'color':'#'+team.get('color','184c3a'), 'division':division,
                           'logo':team.get('logoDark',team.get('logo','')), 'location':team.get('location','')}
            players[side['homeAway']] = {'team':abbr,'score':int(side.get('score',0)),
                'quarters':[int(x.get('value',x.get('displayValue',0))) for x in side.get('linescores',[])]}
        status = event['status']['type']
        games.append({'id':event['id'],'week':week,'date':event['date'],
                      'home':players['home'],'away':players['away'],
                      'completed':status['completed'],'status':status['shortDetail'],
                      'source':next((x['href'] for x in event.get('links',[]) if 'summary' in x.get('rel',[])),f'https://www.espn.com/nfl/game/_/gameId/{event["id"]}'),
                      'venue':comp.get('venue',{}).get('fullName',''),
                      'time_confirmed':comp.get('timeValid',False), 'neutral':comp.get('neutralSite',False),
                      'broadcasts':list(dict.fromkeys(n for b in comp.get('broadcasts',[]) for n in b.get('names',[])))})
    return games, teams

DETAIL_STATS=['totalYards','netPassingYards','rushingYards','firstDowns','thirdDownEff','turnovers','possessionTime','yardsPerPlay']

def details(game):
    if not game['completed']:return game
    cache=Path('/tmp/huddle-game-details');cache.mkdir(exist_ok=True)
    path=cache/(game['id']+'.json')
    for attempt in range(3):
        try:
            if path.exists():data=json.loads(path.read_text())
            else:
                with urllib.request.urlopen('https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+game['id'],timeout=40) as r:data=json.load(r)
                path.write_text(json.dumps(data))
            assert data['header']['id']==game['id'] and data['header']['season']['year']==2026
            comp=data['header']['competitions'][0]
            for side in comp['competitors']:
                own=game[side['homeAway']];assert own['team']==side['team']['abbreviation'] and own['score']==int(side['score'])
                quarters=[int(x.get('value',x.get('displayValue',0))) for x in side.get('linescores',[])]
                if quarters:assert sum(quarters)==own['score']
                own['quarters']=quarters
            game['stats']={t['team']['abbreviation']:{s['name']:s['displayValue'] for s in t.get('statistics',[]) if s['name'] in DETAIL_STATS} for t in data.get('boxscore',{}).get('teams',[])}
            game['leaders']=[{'team':t['team']['abbreviation'],'kind':category['displayName'],
                              'name':leader['athlete']['displayName'],'stat':leader['displayValue']}
                              for t in data.get('leaders',[]) for category in t.get('leaders',[]) for leader in category.get('leaders',[])[:1]]
            game['detail_status']='available' if len(game['stats'])==2 else 'partial'
            return game
        except Exception as e:
            if attempt==2:
                game['detail_status']='unavailable';print(f'Detail unavailable: {game["id"]}: {type(e).__name__}',flush=True);return game
            time.sleep(1)

def main():
    p=argparse.ArgumentParser();p.add_argument('--through-week',type=int,required=True);p.add_argument('--as-of',required=True)
    args=p.parse_args();assert 1<=args.through_week<=18
    cutoff=datetime.fromisoformat(args.as_of).replace(tzinfo=timezone.utc)
    games=[];teams={}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for gs,ts in pool.map(collect,range(1,19)):
            games.extend(gs);teams.update(ts)
    assert len(teams)==32 and len({g['id'] for g in games})==len(games)
    assert len(games)==272, 'Full regular-season schedule must contain 272 games'
    counts=Counter(t for g in games for t in [g['home']['team'],g['away']['team']])
    assert all(n==17 for n in counts.values()), 'Each team must have 17 games'
    for g in games:
        if g['week']<=args.through_week:
            assert g['completed'],f'Week {g["week"]} has unfinished games'
            assert datetime.fromisoformat(g['date'].replace('Z','+00:00'))<cutoff
        else:
            assert not g['completed'], 'The requested completed-week cutoff is stale'
    print(f'Full schedule validated. Loading details for {sum(g["completed"] for g in games)} completed games…',flush=True)
    with ThreadPoolExecutor(max_workers=5) as pool:games=list(pool.map(details,games))
    result={'season':2026,'as_of':args.as_of,'through_week':args.through_week,
            'collected_at':datetime.now(timezone.utc).isoformat(),'provider':'ESPN scoreboards',
            'schedule_weeks':18,'teams':sorted(teams.values(),key=lambda t:t['name']),
            'games':sorted(games,key=lambda g:(g['week'],g['date'],g['id']))}
    path=ROOT/'daily_flyer_v2/data/nfl_scores.json'
    path.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Validated {len(games)} games and 32 teams; completed through week {args.through_week}')

if __name__=='__main__':main()
