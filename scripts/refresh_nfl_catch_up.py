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
            teams[abbr] = {'id':abbr,'name':team['displayName'],'short':team['name'], 'color':'#'+team.get('color','184c3a'), 'division':division}
            players[side['homeAway']] = {'team':abbr,'score':int(side.get('score',0))}
        status = event['status']['type']
        games.append({'id':event['id'],'week':week,'date':event['date'],
                      'home':players['home'],'away':players['away'],
                      'completed':status['completed'],'status':status['shortDetail'],
                      'source':next((x['href'] for x in event.get('links',[]) if 'summary' in x.get('rel',[])),f'https://www.espn.com/nfl/game/_/gameId/{event["id"]}'),
                      'venue':comp.get('venue',{}).get('fullName','')})
    return games, teams

def main():
    p=argparse.ArgumentParser();p.add_argument('--through-week',type=int,required=True);p.add_argument('--as-of',required=True)
    args=p.parse_args();assert 1<=args.through_week<=18
    cutoff=datetime.fromisoformat(args.as_of).replace(tzinfo=timezone.utc)
    games=[];teams={}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for gs,ts in pool.map(collect,range(1,min(18,args.through_week+1)+1)):
            games.extend(gs);teams.update(ts)
    assert len(teams)==32 and len({g['id'] for g in games})==len(games)
    for g in games:
        if g['week']<=args.through_week:
            assert g['completed'],f'Week {g["week"]} has unfinished games'
            assert datetime.fromisoformat(g['date'].replace('Z','+00:00'))<cutoff
    result={'season':2026,'as_of':args.as_of,'through_week':args.through_week,
            'collected_at':datetime.now(timezone.utc).isoformat(),'provider':'ESPN scoreboards',
            'teams':sorted(teams.values(),key=lambda t:t['name']),
            'games':sorted(games,key=lambda g:(g['week'],g['date'],g['id']))}
    path=ROOT/'daily_flyer_v2/data/nfl_scores.json'
    path.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Validated {len(games)} games and 32 teams; completed through week {args.through_week}')

if __name__=='__main__':main()
