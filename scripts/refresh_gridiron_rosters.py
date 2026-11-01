"""Rebuild the small, replaceable roster snapshot from nflverse (no API key)."""
import csv, io, json, argparse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

def convert(text, season, modified=None):
    players=[]; seen=set()
    for row in csv.DictReader(io.StringIO(text)):
        if row['status'] != 'ACT': continue
        key=(row['gsis_id'],row['team'])
        if key in seen: continue
        seen.add(key)
        players.append({'id':row['gsis_id'], 'team':row['team'], 'name':row['full_name'], 'pos':row['position'], 'depthPos':row['depth_chart_position'], 'number':int(float(row['jersey_number'] or 0)), 'draft':int(float(row['draft_number'] or 999)), 'exp':int(float(row['years_exp'] or 0))})
    assert len(players)>1200 and len(set(p['team'] for p in players))==32, 'Incomplete roster: keep previous snapshot'
    return {'season':season,'fetchedAt':datetime.now(timezone.utc).isoformat(),'sourceModified':modified,'source':'nflverse','sourceUrl':f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv','note':'Active roster snapshot, not official depth charts or game-day availability. Ratings and lineup order are arcade choices.','players':players}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--season',type=int,default=2026);p.add_argument('--input');p.add_argument('--output',default='daily_flyer/themes/pocket_gridiron_assets/rosters.json');args=p.parse_args()
    modified=None
    if args.input:text=Path(args.input).read_text()
    else:
        with urllib.request.urlopen(f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{args.season}.csv',timeout=30) as response:
            text=response.read().decode();modified=response.headers.get('Last-Modified')
    data=convert(text,args.season,modified)
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);tmp=out.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':')));tmp.replace(out)
    print(f"Saved {len(data['players'])} active players from 32 teams.")
