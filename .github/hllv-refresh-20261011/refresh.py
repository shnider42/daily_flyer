"""One reviewed content refresh, not a scraper or recurring publisher.
The community/reviewer/login code and Supabase database are not modified.
"""
from __future__ import annotations
import copy, hashlib, html, importlib.util, json, re, subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT=Path('hllv_tracker')
REVIEW='2026-10-11'
EVENT_DATE='2026-10-09'
BASE='3e986f5e1417f90a015e9ba0f01a40ae4bb99244'
BASE_BLOB='e6078fd16da33827ba6092f32e0b85e2fdbb1085'
RELEASE='2026-10-11-community-feedback-7'
SOURCE='https://www.hellletloose.com/blog/community-update-7'
VIA='https://steamcommunity.com/app/3079210/allnews/'
ALLOWED={'www.hellletloose.com','hellletloose.com','steamcommunity.com','store.steampowered.com','api.steampowered.com','www.reddit.com','reddit.com'}
CHANGES={
 'HLLV-003': {
  'section':'Stability & AMD', 'type':'official update',
  'claim':'The October 9 publisher update reports fewer crashes after 1.6, while investigation of remaining AMD crash/driver reports continues. It provides no independent crash-rate measurement.',
  'fields':{
   'bottom_line':'The October 9 update reports fewer crashes after 1.6. Remaining crashes are still monitored; universal resolution is not established.',
   'official_position':'Community Feedback #7 reports improvement in internal crash observations following 1.5.2 and 1.6. Remaining AMD reports are still being investigated. The publisher also mentions a possible driver contribution across games; this is not a diagnosis for any particular player or a reason to assign all crashes to AMD.',
   'official_short':'Improvement reported', 'fix_short':'1.6 + monitoring'
  }
 },
 'HLLV-006': {
  'section':'Foliage, LODs & Visual Quality / Console Visual Improvements', 'type':'plan',
  'claim':'The October 9 update targets further visual work for 1.7, including PSSR on PS5 Pro, VRR on PS5/PS5 Pro and a higher dynamic-resolution floor on consoles. Final testing remains pending.',
  'fields':{
   'bottom_line':'Further console image-quality work now targets Patch 1.7, including PS5 Pro PSSR, PS5/PS5 Pro VRR and a higher minimum dynamic resolution. These are plans, not released fixes.',
   'official_position':'The latest console visual plan is described in Community Feedback #7. PSSR is planned for PS5 Pro, VRR for PS5 and PS5 Pro, and a higher minimum dynamic resolution for console platforms. The publisher explicitly makes these changes subject to final testing; earlier 2.0-and-beyond plans remain historical context rather than the only current target.',
   'official_short':'1.7 plan announced', 'fix_short':'1.7 targeted; not shipped'
  }
 },
 'HLLV-007': {
  'section':'Keybinds & Custom Controls', 'type':'official update',
  'claim':'The October 9 developer post requests exact custom Tactical Map, mouse and keyboard binding examples; ongoing improvements are not a blanket fix for every configuration.',
  'fields':{
   'bottom_line':'Specific helicopter binding fixes shipped in 1.6. The October 9 update still requests exact custom-input examples, including Tactical Map bindings.',
   'official_position':'Community Feedback #7 continues the custom-control investigation and asks for the precise assignment, input combination, expected action and observed behavior. This does not establish that all reset/conflict reports share a cause or that the separate keyboard pitch/collective report is resolved.'
  }
 },
 'HLLV-008': {
  'section':'Spawn Points & Server Replication', 'type':'official update',
  'claim':'The publisher says long-session spawn/replication failures have improved but still occur. That evidence does not establish a cause for unrelated process crashes, restarts, disconnects or hosting incidents.',
  'fields':{
   'bottom_line':'The October 9 update still acknowledges long-session replication failures despite 1.5.2 improvements. It does not identify the cause of every server crash or disconnect.',
   'official_position':'Community Feedback #7 confirms that remaining missing or unusable spawn points are under investigation after longer server sessions. This is evidence about replication degradation, not proof that an unrelated disconnect, server process crash, administrator restart or SoulSniper hosting incident has the same cause.'
  }
 },
 'HLLV-046': {
  'section':'Spawn Points & Server Replication / Mortars & Deployable Issues', 'type':'official update',
  'claim':'The October 9 post explicitly leaves residual long-session spawn failures open. Mortar/deployable construction failures are also being investigated, with a shared cause and consistent reproduction unconfirmed.',
  'fields':{
   'status_key':'partial','status_label':'Improvements live; remaining cases investigated',
   'bottom_line':'Developers still acknowledge missing or unusable spawns after long server sessions. Mortar/deployable construction failures may be a separate issue; neither family is fully closed.',
   'official_position':'Community Feedback #7 says the Iris changes reduced reports but did not fully resolve disappearing or nonfunctional spawn points. The team requests server uptime when available. It separately describes missing deployable blueprints despite Tactical Map indicators, notes reproduction difficulty, and is investigating whether those failures are distinct from wider replication. The earlier player Tunnel report is not automatically assigned either cause.',
   'official_short':'Remaining cases acknowledged','fix_short':'1.5.2 improved; not closed',
   'cause_short':'Residual causes unconfirmed'
  }
 },
 'HLLV-057': {
  'section':'Foliage, LODs & Visual Quality', 'type':'plan',
  'claim':'Further HLOD-bounds, foliage/tree screen-size transitions and individual asset work target Patch 1.7. The publisher does not promise to eliminate all pop-in or disappearing cover.',
  'fields':{
   'bottom_line':'Foliage blur, pop-in and disappearing cover remain open. More asset-transition work targets 1.7; earlier individual fixes do not close the wider issue.',
   'official_position':'The October 9 update describes further HLOD bounds and foliage/tree transition adjustments plus targeted asset corrections for 1.7. The publisher explicitly limits expectations: another improvement is intended, not elimination of every instance. The released 1.5.2 tree-model correction and 1.6 map/texture changes remain narrower historical fixes.',
   'fix_short':'Earlier fixes + 1.7 target'
  }
 },
 'HLLV-060': {
  'section':'DLSS & Frame Generation', 'type':'official update',
  'claim':'A candidate for DLSS quality options missing during startup is under validation. The post discusses that related symptom alongside Frame Generation reports, but does not confirm a released fix for the older reapplication complaint.',
  'fields':{
   'bottom_line':'A related missing-DLSS-options startup fix is under validation. The October 9 update still does not establish a released fix for Frame Generation needing reapplication.',
   'official_position':'Community Feedback #7 identifies a startup-timing issue that can hide DLSS quality choices while DLSS remains active, and reports an internally implemented candidate under validation. It asks for GPU model and available VRAM to distinguish other initialization cases. This context is not proof that missing quality choices, insufficient-memory cases and the earlier Frame Generation reapplication symptom all have one cause or one fix.',
   'official_short':'Related candidate under validation','fix_short':'No released closure verified','cause_short':'Not established for all reports'
  }
 },
 'HLLV-062': {
  'section':'Boat Spawn Behaviour', 'type':'plan',
  'claim':'The revised boat plan shuts the engine down when the driver manually exits, not when the driver is killed. Patch 1.7 is being considered; a later update remains possible.',
  'fields':{
   'bottom_line':'The revised proposal turns the engine off when a driver exits manually, not when killed. It may arrive in 1.7 or later; no release is confirmed.',
   'official_position':'Community Feedback #7 changes the earlier unattended-boat proposal in response to counterplay concerns. Manual driver exit, rather than driver death, is now the proposed automatic engine-off trigger. Timing remains provisional: the team is investigating 1.7, otherwise a following update. The separate 1.6 idle-boat destruction fix is not this feature.',
   'official_short':'Revised plan announced','fix_short':'1.7 or later; not shipped'
  }
 },
 'HLLV-063': {
  'section':'Vote Kick & Moderation', 'type':'official update',
  'claim':'The October 9 update discusses the already released 1.6 Vote Kick visibility and longer-response changes. The publisher continues monitoring disruptive behavior; no independent effectiveness study is supplied.',
  'fields':{
   'bottom_line':'The 1.6 visibility and 30-second response changes remain release-documented. The October 9 follow-up discusses positive feedback, not a new patch or proof trolling is solved.',
   'official_position':'Community Feedback #7 follows up on the released Vote Kick changes and reports favorable community response while continuing to monitor disruptive behavior. This does not close all moderation problems or independently measure the feature effectiveness.'
  }
 },
 'HLLV-067': {
  'section':'Controller Customisation; compare Patch 1.6 / Gameplay', 'type':'plan',
  'claim':'Although 1.6 listed mounted-weapon ADS sensitivity as corrected, the October 9 update specifically says the Huey M60 sensitivity fix is internal and planned for 1.7. The discrepancy does not prove a newly introduced regression.',
  'fields':{
   'status_key':'partial','status_label':'1.6 correction listed; Huey exception still planned',
   'bottom_line':'Patch 1.6 listed a mounted-gun ADS correction, but the newer post puts the Huey M60 fix in 1.7. Do not treat the whole sensitivity issue as resolved.',
   'official_position':'The 1.6 Gameplay notes broadly state that helicopter, boat and AA mounted guns now use ADS sensitivity. Community Feedback #7 subsequently describes the Huey M60 not using that setting, with a fix implemented internally for 1.7. Both records are retained. The publisher has not explained whether this is an incomplete earlier fix, a separate case, or a regression; the Huey case is not verified released.',
   'official_short':'Huey exception acknowledged','fix_short':'1.6 listed; Huey target 1.7','cause_short':'Difference in scope unresolved'
  }
 }
}

def get(url):
    assert urlsplit(url).scheme=='https' and urlsplit(url).hostname in ALLOWED
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 HLLV-Reviewed-Content','Accept-Language':'en'})
    with urlopen(req,timeout=20) as r:
        raw=r.read(8_000_001)
        assert len(raw)<=8_000_000 and urlsplit(r.url).hostname in ALLOWED
        return r.status,r.url,raw

def audit(url):
    try:
        code,final,raw=get(url)
        match=re.search(r'<title[^>]*>(.*?)</title>',raw.decode('utf-8',errors='replace'),re.S|re.I)
        title=html.unescape(re.sub('<[^>]+>',' ',match[1])).strip() if match else ''
        return url,{'checked_at':REVIEW,'http_status':code,'final_url':final,'title':title,'scope':'Destination accessibility only, not claim or outcome verification'}
    except HTTPError as e:
        return url,{'checked_at':REVIEW,'http_status':e.code,'scope':'Request failed; access restrictions are not proof of deletion'}
    except Exception:
        return url,{'checked_at':REVIEW,'http_status':None,'scope':'Request could not be completed; not proof of deletion'}

def require_current_sources():
    _,_,raw=get('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=3079210&count=30&maxlength=0')
    payload=json.loads(raw)['appnews'];assert payload['appid']==3079210
    official=[n for n in payload['newsitems'] if n.get('feedname')=='steam_community_announcements']
    assert official and official[0]['title']=='Community Feedback #7 | Command Post','New official information exists: review before publishing'
    assert datetime.fromtimestamp(official[0]['date'],timezone.utc).date().isoformat()==EVENT_DATE
    assert any(n['title']=='Patch 1.6 | Hell Let Loose: Vietnam' for n in official)
    _,_,body=get(VIA)
    text=html.unescape(re.sub('<[^>]+>',' ',body.decode('utf-8',errors='replace')))
    compact=re.sub(r'\s+',' ',text).casefold()
    for phrase in ['Community Feedback #7','Huey','M60','Patch 1.7','Mortars','DLSS','manually exits','fully resolved']:
        assert phrase.casefold() in compact, 'Publisher body needs a fresh review: '+phrase
    return [{'title':n['title'],'published_at':datetime.fromtimestamp(n['date'],timezone.utc).isoformat(),'feed':n['feedname']} for n in official[:5]]

def main():
    raw=(ROOT/'data/issues.json').read_bytes()
    old=json.loads(raw)
    if old.get('review_release')==RELEASE:
        print('Reviewed content already applied; no timestamps changed.');return
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==BASE_BLOB,'Reconcile changed snapshot before editing'
    assert len(old['issues'])==75 and len(old['patch_notes'])==8
    headlines=require_current_sources()
    data=copy.deepcopy(old);by_id={i['id']:i for i in data['issues']}
    for key,change in CHANGES.items():
        i=by_id[key]
        i.setdefault('editorial_history',[]).append({'date':REVIEW,'reason':'Community Feedback #7 follow-up; original source statements and timeline retained','previous':{k:copy.deepcopy(i.get(k)) for k in change['fields']}})
        i.update(change['fields']);i['last_updated']=EVENT_DATE;i['last_reviewed']=REVIEW
        i['timeline'].append({'date':EVENT_DATE,'event':'Community Feedback #7','detail':change['claim']})
        i['sources'].append({'type':change['type'],'publisher':'Hell Let Loose / Team17','date':EVENT_DATE,'title':'Community Feedback #7 | Command Post','url':SOURCE,'claim':change['claim'],'source_published_at':EVENT_DATE,'source_reviewed_at':REVIEW,'source_locator':change['section'],'source_reviewed_via':VIA})
        i['known'].append('October 9 follow-up: '+change['claim'])
    by_id['HLLV-067']['unknown'].append('The 1.6 mounted-gun release claim and the subsequent Huey-specific 1.7 target have not been reconciled by the publisher; a regression is not established.')
    by_id['HLLV-060']['unknown'].append('The missing-DLSS-quality-options candidate is not established as the fix for Frame Generation reapplication.')
    by_id['HLLV-046']['unknown'].append('Mortar/deployable construction failures are not established as the same residual replication fault.')
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    data.update(generated_at=REVIEW,page_updated_at=now,review_release=RELEASE)
    data['latest_change']={'date':EVENT_DATE,'label':'Community Feedback #7 · October 9','url':SOURCE,'summary':'Reviewed October 11: remaining spawn failures, graphics plans and a Huey M60 sensitivity exception. Patch 1.6 remains the latest verified release; 1.7 changes are not marked shipped.'}
    limitations=['No independent gameplay testing.','Six recent player-thread bodies were unavailable in the research reader; earlier observations retain their original dates.','Only the newly relevant developer update and release-scope cross-check were substantively reviewed; successful URL checks do not renew old claims.','DLSS and deployable context is recorded without assuming that similar symptoms share a cause.','No change to Suggestion Box submissions, approvals, votes, roles, accounts or login configuration.']
    note={'date':REVIEW,'source_date':EVENT_DATE,'scope':'Community Feedback #7; cross-check against Patch 1.6; current source destination audit','source_url':SOURCE,'source_reviewed_via':VIA,'updated_issues':list(CHANGES),'new_issues':[],'independent_gameplay_testing':False,'limitations':limitations,'latest_verified_release':{'title':'Patch 1.6','date':'2026-10-07'}}
    data.setdefault('review_history',[]).append(note)
    data['review_notes']='October 11: reviewed the October 9 Community Feedback #7 publisher text on Steam and compared its Huey sensitivity target with the 1.6 release notes. Newest claims remain plans, publisher observations or ongoing investigations as appropriate. Ten existing dossiers updated; no new issue IDs or independent gameplay checks. Recent player report dates remain unchanged. Previous review: '+old.get('review_notes','')
    brief={'id':'community-feedback-7','title':'Community Feedback #7','date':EVENT_DATE,'reviewed_at':REVIEW,'type':'official update','source_url':SOURCE,'source_reviewed_via':VIA,'headline':'Post-1.6 investigations and future plans — not a new patch.','highlights':['Remaining long-session spawn failures are still open; Mortar/deployable construction failures may have a different cause.','More console/foliage work targets 1.7. A missing-DLSS-options candidate remains under validation.','The Huey M60 sensitivity fix targets 1.7. Boat auto-shutdown is now proposed for manual driver exit, not driver death.','Controller customization and saved role-loadout requests are being discussed without a confirmed delivery window.'],'caution':'Patch 1.6 is the latest verified release. These developer-discussed requests are not submissions to this site, developer-approved Bulletin Board entries, or implementation promises.'}
    data.setdefault('developer_updates',[]).append(brief)
    notes=data['patch_notes']
    for n in notes:n.setdefault('reviewed_at',old.get('patch_notes_reviewed_at','2026-10-07'))
    patch=next(n for n in notes if n['id']=='patch-1-6')
    patch['caution']='Voice-volume, Frame Generation reapplication and tutorial-completion closure remain unconfirmed. The October 9 follow-up still targets the Huey M60 ADS fix for 1.7 despite the broader 1.6 sensitivity claim.'
    patch['reviewed_at']=REVIEW
    patch['review_basis']='Patch 1.6 publisher text cross-checked with Community Feedback #7. The newer Huey-specific target qualifies the earlier general release claim; neither is independent outcome verification.'
    patch['followup_source_url']=SOURCE
    patch['related_issues']=['HLLV-058','HLLV-063','HLLV-067']
    hotfix=next(n for n in notes if n['id']=='hotfix-1-5-2')
    hotfix['caution']='October 9 follow-up: the replication changes improved reports, but some long-session spawn failures remain. Mortar construction failures may be separate. Improvements are not full closure.'
    hotfix['reviewed_at']=REVIEW;hotfix['followup_source_url']=SOURCE
    data['patch_notes_reviewed_at']=REVIEW
    data['patch_notes_review_scope']='Post-release caveats for 1.6 and 1.5.2 updated; older entries retain their individual review dates.'
    urls={s['url'] for i in data['issues'] for s in i['sources']}|{n['source_url'] for n in notes}|{SOURCE,VIA}
    with ThreadPoolExecutor(max_workers=5) as pool:checks=dict(pool.map(audit,sorted(urls)))
    assert checks[SOURCE]['http_status']==200 and 'Community Feedback #7' in checks[SOURCE].get('title','')
    data.setdefault('source_access_history',[]).append(copy.deepcopy(old.get('source_access_review',{})))
    data['source_access_review']={'date':REVIEW,'results':checks,'note':'HTTP accessibility only; no new confirmation or fresh claim review is inferred for older references.'}
    for i in data['issues']:
        for s in i['sources']:
            check=checks[s['url']];s['link_check']={'date':REVIEW,'http_status':check['http_status']}
            if check['http_status']==200:s['link_checked_at']=REVIEW
    (ROOT/'data/issues.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (Path('.github/hllv-patches')/'notes.json').write_text(json.dumps(notes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    build=Path('.github/hllv-patches/build.py');code=build.read_text()
    old_date='Summary reviewed {REVIEW_DATE}.'
    new_date='Summary reviewed {esc(n.get("reviewed_at", REVIEW_DATE))}.'
    assert code.count(old_date)==1
    code=code.replace(old_date,new_date)
    build.write_text(code)
    spec=importlib.util.spec_from_file_location('patch_archive',build);archive=importlib.util.module_from_spec(spec);spec.loader.exec_module(archive)
    archive.validate(notes,data)
    rendered=archive.render(notes,data)
    esc=lambda v:html.escape(str(v),quote=True)
    followup='<details class="patch-provenance"><summary>Latest developer update: Community Feedback #7 · October 9 — not a patch</summary><div>'
    followup+='<p>'+esc(brief['headline'])+'</p><ul>'+''.join('<li>'+esc(x)+'</li>' for x in brief['highlights'])+'</ul><p>'+esc(brief['caution'])+'</p>'
    followup+='<p><a href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">Read official developer update ↗</a> · <a href="'+VIA+'" target="_blank" rel="noopener noreferrer">Reviewed publisher copy on Steam ↗</a></p><p>Source dated October 9; reviewed October 11. Same publisher, not independent corroboration.</p></div></details>'
    rendered=rendered.replace('<div class="patch-entries">',followup+'<div class="patch-entries">',1)
    page=ROOT/'index.html';markup=page.read_text();start=archive.START;end=archive.END
    assert markup.count(start)==markup.count(end)==1
    a=markup.index(start);b=markup.index(end)+len(end)
    markup=markup[:a]+rendered+markup[b:];page.write_text(markup)
    previous_manifest=json.loads((ROOT/'deployment-manifest.json').read_text())
    subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    manifest_path=ROOT/'deployment-manifest.json';manifest=json.loads(manifest_path.read_text())
    preserved=[p for p in previous_manifest['files'] if p not in [previous_manifest['data_url'],previous_manifest['evidence_js_url']]]
    manifest['files']=list(dict.fromkeys(manifest['files']+preserved));manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    report={**note,'page_updated_at':now,'base_commit':BASE,'issue_count':len(data['issues']),'source_references':sum(len(i['sources']) for i in data['issues']),'distinct_issue_source_urls':len({s['url'] for i in data['issues'] for s in i['sources']}),'released_patch_summaries':len(notes),'developer_briefs':len(data['developer_updates']),'source_checks':checks,'protected_features_unchanged':True}
    (ROOT/'reviews').mkdir(exist_ok=True)
    (ROOT/'reviews'/f'{RELEASE}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    assert data['incidents']==old['incidents']
    assert [i['id'] for i in data['issues']]==[i['id'] for i in old['issues']]
    assert all(by_id[k]['status_key']!= 'shipped' for k in ['HLLV-006','HLLV-046','HLLV-057','HLLV-060','HLLV-062','HLLV-067'])
    print('REVIEW_READY',json.dumps({k:v for k,v in report.items() if k!='source_checks'}))

if __name__=='__main__':main()
