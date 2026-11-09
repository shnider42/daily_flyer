"""Fetch dated reporting and official transaction logs. Missing coverage stays explicit."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import argparse
import json
import re
import requests
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
TEAMS = {
 'ARI':(22,'azcardinals.com'),'ATL':(1,'atlantafalcons.com'),'BAL':(33,'baltimoreravens.com'),
 'BUF':(2,'buffalobills.com'),'CAR':(29,'panthers.com'),'CHI':(3,'chicagobears.com'),
 'CIN':(4,'bengals.com'),'CLE':(5,'clevelandbrowns.com'),'DAL':(6,'dallascowboys.com'),
 'DEN':(7,'denverbroncos.com'),'DET':(8,'detroitlions.com'),'GB':(9,'packers.com'),
 'HOU':(34,'houstontexans.com'),'IND':(11,'colts.com'),'JAX':(30,'jaguars.com'),
 'KC':(12,'chiefs.com'),'LV':(13,'raiders.com'),'LAC':(24,'chargers.com'),
 'LAR':(14,'therams.com'),'MIA':(15,'miamidolphins.com'),'MIN':(16,'vikings.com'),
 'NE':(17,'patriots.com'),'NO':(18,'neworleanssaints.com'),'NYG':(19,'giants.com'),
 'NYJ':(20,'newyorkjets.com'),'PHI':(21,'philadelphiaeagles.com'),'PIT':(23,'steelers.com'),
 'SF':(25,'49ers.com'),'SEA':(26,'seahawks.com'),'TB':(27,'buccaneers.com'),
 'TEN':(10,'tennesseetitans.com'),'WSH':(28,'commanders.com')}

def category(title):
 t=title.lower()
 if re.search(r'hall of fame|\bhof\b|\bowner\b|robert kraft',t):return 'Around the team'
 if re.search(r'injur|surgery|concussion|hamstring|ankle|knee|neck|thumb|wrist|ruled out|questionable|injured reserve|neurological|symptoms|illness',t):return 'Health'
 if re.search(r'coach|coordinator|play.?call|staff|fired|canales|sirianni|schottenheimer|mcdaniel|payton|glenn',t):return 'Coaching'
 if re.search(r'trade|sign|contract|extension|release|waiv|roster|activate|practice squad',t):return 'Roster'
 if re.search(r'quarterback|\bqb\b|starter|bench',t):return 'Quarterback'
 return 'Around the team'

def collect(item, as_of):
 abbr,(number,domain)=item
 result={'news':[],'transactions':[], 'news_status':'unavailable','transactions_status':'unavailable',
         'news_source':f'https://www.espn.com/nfl/team/_/name/{abbr.lower()}',
         'transactions_source':f'https://www.{domain}/team/transactions/2026',
         'official_news':f'https://www.{domain}/news/'}
 try:
  r=requests.get(f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team={number}&limit=50',timeout=25);r.raise_for_status()
  for a in r.json().get('articles',[]):
   ids={str(c.get('teamId')) for c in a.get('categories',[]) if c.get('type')=='team'}
   title=a.get('headline','');date=datetime.fromisoformat(a['published'].replace('Z','+00:00')).astimezone(ZoneInfo('America/New_York')).date().isoformat();url=a.get('links',{}).get('web',{}).get('href','')
   if str(number) not in ids or len(ids)>3 or '/nfl/story/' not in url:continue
   if not '2026-09-01'<=date<=as_of or re.search(r'betting|odds|picks|fantasy|parlay|arrest|domestic|sexual',title,re.I):continue
   result['news'].append({'id':str(a['id']),'title':title,'date':date,'published':a['published'],
       'category':category(title),'source':url.replace('http:','https:'),'publisher':'ESPN'})
  result['news']=sorted(result['news'],key=lambda a:a['published'],reverse=True)[:24]
  result['news_status']='available'
 except (requests.RequestException,ValueError,KeyError):pass
 try:
  r=requests.get(result['transactions_source'],timeout=25);r.raise_for_status()
  if '/2026' not in r.url:raise ValueError('Unverified year')
  for tr in BeautifulSoup(r.text,'html.parser').select('table tr'):
   cells=tr.find_all('td')
   if len(cells)<2:continue
   d=cells[0].get_text(' ',strip=True);text=cells[1].get_text(' ',strip=True)
   if not re.fullmatch(r'\d\d/\d\d',d):continue
   date=f'2026-{d[:2]}-{d[3:]}'
   if '2026-09-01'<=date<=as_of and text:result['transactions'].append({'date':date,'text':text})
  if result['transactions']:result['transactions_status']='available'
 except (requests.RequestException,ValueError):pass
 result['transactions'].sort(key=lambda x:x['date'],reverse=True)
 return abbr,result

def main():
 p=argparse.ArgumentParser();p.add_argument('--as-of',required=True);args=p.parse_args()
 with ThreadPoolExecutor(max_workers=6) as pool:teams=dict(pool.map(lambda x:collect(x,args.as_of),TEAMS.items()))
 output={'as_of':args.as_of,'collected_at':datetime.now(timezone.utc).isoformat(),'teams':teams}
 (ROOT/'daily_flyer_v2/data/nfl_reporting.json').write_text(json.dumps(output,indent=2)+'\n')
 print(json.dumps({'teams':len(teams),'headlines':sum(len(t['news']) for t in teams.values()),'transactions':sum(len(t['transactions']) for t in teams.values()),'missing_news':[k for k,v in teams.items() if v['news_status']!='available'],'missing_transactions':[k for k,v in teams.items() if v['transactions_status']!='available']}))

if __name__=='__main__':main()
