"""Verify selected channel links on the publisher's directory, not channel content.
No YouTube comments, login, API key or credentials are requested by this module.
"""
import importlib.util,json,time
from pathlib import Path
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
spec=importlib.util.spec_from_file_location('hllv_reply_parser',Path(__file__).parent.parent/'hllv-source-responses/collector.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
DIRECTORY='https://www.hellletloose.com/community'
ROBOTS='https://www.hellletloose.com/robots.txt'
CONFIG=Path(__file__).with_name('affiliate-directory.json')
def canonical_channel(url):
    u=urlsplit(url)
    if u.scheme!='https' or u.hostname!='www.youtube.com' or u.username or u.password or u.port not in(None,443) or u.query or u.fragment:return None
    import re
    return ('https://www.youtube.com/'+u.path.strip('/').lower()) if re.fullmatch(r'/@[A-Za-z0-9_.-]+/?',u.path) else None

def directory_fetch(url):
    if url not in(DIRECTORY,ROBOTS):raise c.CoverageError('unsafe_directory_destination')
    class Redirect(HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):raise c.CoverageError('directory_redirect_needs_review')
    try:
        with build_opener(Redirect()).open(Request(url,headers={'User-Agent':c.AGENT,'Accept-Language':'en'}),timeout=15) as r:
            raw=r.read(2000001)
            if len(raw)>2000000:raise c.CoverageError('directory_size_limit')
            return raw
    except HTTPError as e:
        if url==ROBOTS and e.code==404:return b'User-agent: *\nDisallow:\n'
        raise c.CoverageError('directory_http_'+str(e.code)) from None

def collect(previous,now,fetcher=None,config=None):
    cfg=config or json.loads(CONFIG.read_text());get=fetcher or directory_fetch;at=c.stamp(now);failure=None;links=set()
    try:
        rules=RobotFileParser();rules.parse(get(ROBOTS).decode('utf-8','replace').splitlines())
        if not rules.can_fetch(c.AGENT,DIRECTORY):raise c.CoverageError('directory_robots_restricted')
        if fetcher is None:time.sleep(max(1.,float(rules.crawl_delay(c.AGENT) or 1)))
        doc=c.Tree(get(DIRECTORY).decode('utf-8','strict')).root
        for a in doc.all(lambda n:n.tag=='a'):
            target=canonical_channel(a.attrs.get('href',''))
            if target:links.add((c.clean(a.text()).casefold(),target))
        if not links:raise c.CoverageError('directory_parser_error')
    except c.CoverageError as e:failure=e.kind
    except Exception:failure='directory_unavailable'
    old={x['name']:x for x in previous.get('channels',[])};rows=[]
    for channel in cfg['channels']:
        verified=not failure and (channel['directory_label'].casefold(),canonical_channel(channel['channel_url'])) in links
        rows.append({**channel,'directory_url':DIRECTORY,'directory_status':'listed' if verified else 'needs_review' if not failure else 'unavailable',
             'directory_checked_at':at,'last_directory_verified_at':at if verified else old.get(channel['name'],{}).get('last_directory_verified_at'),
             'content_status':'not_connected','content_collection_enabled':False,'failure_kind':failure,
             'note':'Directory relationship only. No channel videos, comments, replies or private community content were collected.'})
    return {'schema_version':1,'state':'not_connected','directory_url':DIRECTORY,'last_attempt_at':at,
       'directory_verified_count':sum(r['directory_status']=='listed' for r in rows),'content_collection_enabled':False,'channels':rows,
       'required_setup':'Authorized YouTube Data API access plus a refreshable, deletable cache and delivery integration. Not a public Git archive of API comment bodies.',
       'interpretation':'Partnership identifies a community affiliate, not authority to speak for Team17.'}
