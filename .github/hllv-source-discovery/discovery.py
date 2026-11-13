"""Bounded discovery of staff replies, not a crawl of all Steam discussions.
Listing text and last-poster names are untrusted leads, never staff evidence.
Existing issue sources are scanned first; discovered candidates share the remaining
request/time budget and are rotated by oldest attempt to avoid permanent starvation.
"""
from __future__ import annotations
import copy, importlib.util, json, re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

spec=importlib.util.spec_from_file_location('hllv_reply_collector',Path(__file__).parent.parent/'hllv-source-responses/collector.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
PAGES_PER_FORUM=2
THREADS_PER_PASS=24
MAX_UNQUALIFIED_CANDIDATES=150
FORUMS=[('1','Report a Problem'),('0','General Discussions')]

def parse_listing(raw,section,page,now):
    text=raw.decode('utf-8','strict') if isinstance(raw,bytes) else raw
    doc=c.Tree(text).root;metas=[]
    for script in doc.all(lambda n:n.tag=='script'):
        text=''.join(x for x in script.children if isinstance(x,str))
        for m in re.finditer(r'InitializeForum\(\s*"[^"]+"\s*,\s*',text):
            try:meta,_=json.JSONDecoder().raw_decode(text[m.end():]);metas.append(meta)
            except ValueError:raise c.CoverageError('invalid_listing_pagination')
    if len(metas)!=1:raise c.CoverageError('missing_listing_markup')
    meta=metas[0];base=c.HOST+'/app/3079210/discussions/'+section+'/'
    if meta.get('appid')!=3079210 or str(meta.get('feature'))!=section or meta.get('is_public')!=1 or meta.get('forum_url')!=base:
        raise c.CoverageError('wrong_forum')
    total,start,size=[meta.get(k) for k in ['total_count','start','pagesize']]
    if any(type(x)!=int for x in [total,start,size]) or not 0<=total<=100000 or not 1<=size<=100 or start!=(page-1)*size:
        raise c.CoverageError('invalid_listing_pagination')
    nodes=doc.all(lambda n:n.has('forum_topic'))
    if len(nodes)!=min(size,max(0,total-start)):raise c.CoverageError('incomplete_listing_markup')
    found=[];seen=set()
    for node in nodes:
        link=node.first(lambda n:n.tag=='a' and n.has('forum_topic_overlay'))
        if not link:raise c.CoverageError('missing_topic_link')
        url=c.thread_url(link.attrs.get('href',''));topic=url.rstrip('/').split('/')[-1]
        if '/discussions/'+section+'/' not in url or topic!=node.attrs.get('data-gidforumtopic') or url in seen:
            raise c.CoverageError('invalid_topic_identity')
        seen.add(url)
        title=node.first(lambda n:n.has('forum_topic_name'));replies=node.first(lambda n:n.has('forum_topic_reply_count'))
        count=c.clean(replies.text()).replace(',','') if replies else ''
        if not count.isdigit() or int(count)>100000:raise c.CoverageError('invalid_listing_count')
        last=c.timestamp(node.first(lambda n:n.has('forum_topic_lastpost')),now)
        found.append({'url':url,'title':' '.join(c.clean(title.text()).split()[:12])[:160] if title else 'Discovered discussion',
                      'forum':section,'listed_reply_count':int(count),'listed_last_activity_at':last,'pinned':node.has('sticky')})
    return {'rows':found,'total':total,'start':start,'pagesize':size}

def collect(issues,previous,now,client=None,registry=None):
    at=c.stamp(now);client=client or c.Client();get=client.get
    known={t['url'] for t in c.targets(issues)}
    old_threads={t['url']:copy.deepcopy(t) for t in previous.get('threads',[]) if t['url'] not in known}
    pool={r['url']:copy.deepcopy(r) for r in previous.get('candidates',[]) if r['url'] not in known}
    for url,t in old_threads.items():
        pool.setdefault(url,{'url':url,'title':t.get('title','Discovered discussion'),'forum':url.split('/discussions/')[1][0],
            'first_discovered_at':t.get('first_discovered_at',at),'last_seen_in_listing_at':t.get('last_seen_in_listing_at',at),
            'listed_reply_count':t.get('comments_expected') or 0,'last_attempt_at':t.get('last_attempt_at')})
    listings=[];listed_urls=set();new_candidates=0
    for section,label in FORUMS:
        rows=[];seen={};first=None;checked=0;planned=PAGES_PER_FORUM;failure=None
        try:
            for page in range(1,PAGES_PER_FORUM+1):
                url=c.HOST+'/app/3079210/discussions/'+section+'/?fp='+str(page)+'&l=english'
                p=parse_listing(get(url),section,page,now)
                if first is None:
                    first=p;planned=min(PAGES_PER_FORUM,max(1,(p['total']+p['pagesize']-1)//p['pagesize']))
                elif p['total']!=first['total'] or p['pagesize']!=first['pagesize']:
                    raise c.CoverageError('listing_changed_during_scan')
                for row in p['rows']:
                    if row['url'] in seen and not(row['pinned'] and seen[row['url']]['pinned']):
                        raise c.CoverageError('duplicate_listing_page')
                    seen[row['url']]=row;rows.append(row)
                checked+=1
                if page>=planned:break
        except c.CoverageError as e:failure=e.kind
        except Exception:failure='listing_parser_error'
        listings.append({'forum':section,'label':label,'url':c.HOST+'/app/3079210/discussions/'+section+'/',
            'state':'window_checked' if not failure else 'partial' if checked else 'unavailable',
            'pages_checked':checked,'pages_planned':planned,'total_forum_topics':first['total'] if first else None,
            'failure_kind':failure,'last_attempt_at':at})
        for row in rows:
            url=row['url'];listed_urls.add(url)
            if url in known:continue
            if url not in pool:new_candidates+=1
            past=pool.get(url,{})
            pool[url]={**past,**row,'first_discovered_at':past.get('first_discovered_at',at),'last_seen_in_listing_at':at}
    removed=0;cutoff=c.stamp(now-timedelta(days=30))
    for url in list(pool):
        if not old_threads.get(url,{}).get('replies') and not old_threads.get(url,{}).get('identities_pending') and pool[url].get('last_seen_in_listing_at',at)<cutoff:
            pool.pop(url);old_threads.pop(url,None);removed+=1
    ordinary=sorted([u for u in pool if not old_threads.get(u,{}).get('replies') and not old_threads.get(u,{}).get('identities_pending')],
                    key=lambda u:(pool[u].get('last_seen_in_listing_at',''),u),reverse=True)
    for url in ordinary[MAX_UNQUALIFIED_CANDIDATES:]:pool.pop(url);old_threads.pop(url,None);removed+=1
    eligible=[u for u in pool if pool[u].get('listed_reply_count',0)>0 or old_threads.get(u,{}).get('replies') or old_threads.get(u,{}).get('identities_pending')]
    eligible.sort(key=lambda u:(pool[u].get('last_attempt_at') or '', -c.date(pool[u].get('listed_last_activity_at',at)).timestamp(),u))
    batch=eligible[:THREADS_PER_PASS]
    targets=[{'url':u,'tracked_issue_ids':[],'source_origin':'discovered'} for u in batch]
    result=c.collect([],{'threads':list(old_threads.values()),'monitoring_started_at':previous.get('monitoring_started_at')},now,get,registry,selected_targets=targets)
    for t in old_threads.values():
        t['observed_this_run']=False
        for reply in t.get('replies',[]):reply['observed_this_run']=False
        t['changes_this_run']=[]
    for t in result['threads']:
        url=t['url'];lead=pool[url]
        t.update(source_origin='discovered',observed_this_run=True,first_discovered_at=lead['first_discovered_at'],last_seen_in_listing_at=lead.get('last_seen_in_listing_at'))
        t['title']=' '.join(t['title'].split()[:12])[:160]
        for reply in t.get('replies',[]):
            if reply.get('excerpt'):reply['excerpt']=' '.join(reply['excerpt'].split()[:max(0,24-len(t['title'].split()))])
        old_threads[url]=t;lead['last_attempt_at']=at;lead['last_complete_at']=t.get('last_complete_at')
    rows=sorted(old_threads.values(),key=lambda x:x['url']);scanned=result['threads'];complete=sum(t['state']=='complete' for t in scanned)
    waiting=sum(not pool[u].get('last_complete_at') for u in eligible)
    outstanding=sum(pool[u].get('last_complete_at')!=at for u in eligible)
    state='window_checked' if all(l['state']=='window_checked' for l in listings) and complete==len(batch) and not outstanding else 'partial'
    if not any(l['pages_checked'] for l in listings) and not any(t['pages_checked'] for t in scanned):state='unavailable'
    return {'schema_version':1,'enabled':True,'scope':'First two recently active listing pages per forum, plus rotating retained discoveries. Not all Steam discussions; staff replies only, not opening posts.',
      'state':state,'monitoring_started_at':previous.get('monitoring_started_at',at),'last_attempt_at':at,
      'last_window_complete_at':at if state=='window_checked' else previous.get('last_window_complete_at'),
      'pages_per_forum':PAGES_PER_FORUM,'thread_limit_per_pass':THREADS_PER_PASS,'listings':listings,
      'listed_distinct_threads':len(listed_urls),'new_candidates_this_run':new_candidates,
      'candidate_count':len(pool),'eligible_candidates':len(eligible),'zero_reply_leads_not_scanned':len(pool)-len(eligible),
      'threads_attempted_this_run':len(batch),'threads_complete_this_run':complete,'awaiting_first_complete_scan':waiting,
      'not_fully_scanned_this_run':outstanding,'unqualified_leads_expired_or_capped':removed,
      'staff_response_threads_retained':sum(bool(t.get('replies')) for t in rows),'staff_responses_retained':sum(len(t.get('replies',[])) for t in rows),
      'identities_pending':len({x['steam_id'] for t in rows for x in t.get('identities_pending',[])}),
      'new_replies_this_run':result['new_replies_this_run'],'edited_replies_this_run':result['edited_replies_this_run'],
      'candidates':sorted(pool.values(),key=lambda x:x['url']),'threads':rows,'reviewed_issue_records_changed':False}
