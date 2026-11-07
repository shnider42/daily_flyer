"""Guarded, manually reviewed bug-only refresh. No recurring classification."""
import copy,html,json,re,subprocess
from datetime import datetime,timezone
from pathlib import Path

BASE='e5eccc0af6f8fddd38edd5cb30394bbec8d8ac51'
REVIEW='2026-10-16'
RELEASE='2026-10-16-bug-evidence-review'
ROOT=Path('hllv_tracker')
HERE=Path(__file__).parent
SOURCES=json.loads((HERE/'sources.json').read_text())

def source(key,claim,section=None,kind=None):
    s=copy.deepcopy(SOURCES[key]);s['claim']=claim
    if section:s['source_locator']=section
    if kind:s['type']=kind
    return s

def main():
    path=ROOT/'data/issues.json';raw=path.read_bytes();data=json.loads(raw)
    if data.get('review_release')==RELEASE:
        print('Review already applied; dates unchanged.');return
    original=subprocess.check_output(['git','show',BASE+':hllv_tracker/data/issues.json'])
    assert raw==original,'Reconcile intervening evidence edits before applying'
    old=copy.deepcopy(data);issues={i['id']:i for i in data['issues']};changed=[];added=[]

    def update(key,fields,refs):
        i=issues[key]
        i.setdefault('editorial_history',[]).append({'date':REVIEW,'reason':'Reviewed public evidence; previous assessment retained below.','previous':{k:copy.deepcopy(i.get(k)) for k in fields}})
        i.update(fields);i['last_reviewed']=REVIEW
        i['last_updated']=max([i['last_updated']]+[s['date'] for s in refs])
        for s in refs:
            i['sources'].append(s)
            i['timeline'].append({'date':s['date'],'event':s['title'],'detail':'Added in the October 16 editorial review. The Sources entry records the scoped claim and direct reference.','source_url':s['url']})
        changed.append(key)

    def new(key,title,category,kind,status,label,summary,official,fix,scope,symptom,known,unknown,refs,workaround=None):
        i={'id':key,'title':title,'category':category,'kind':kind,'status_key':status,'status_label':label,'bottom_line':summary,'official_short':official,'fix_short':fix,'cause_short':'Not established for all reports','last_updated':max(s['date'] for s in refs),'last_reviewed':REVIEW,'scope':scope,'symptom':symptom,'official_position':known[0],'workaround':workaround,'known':known,'unknown':unknown+['No independent gameplay verification was performed for this review.'],'timeline':[{'date':s['date'],'event':s['title'],'detail':s['claim'],'source_url':s['url']} for s in refs],'sources':refs}
        data['issues'].append(i);issues[key]=i;added.append(key)

    update('HLLV-003',{
        'bottom_line':'October 15: fewer crashes reported internally; remaining cases stay open, with further stability work planned for 1.7.',
        'official_position':'The publisher reports improvement, not universal resolution. A separate October 13 Support exchange continues troubleshooting tank-fire crashes; neither a shared hardware cause nor a reliable workaround is established.',
        'fix_short':'Earlier improvements; 1.7 planned'
    },[source('cf8','Residual crashes remain monitored.','Stability'),source('590692129307778259','Support continues diagnostics after reports of crashes or severe FPS drops around tank-fire smoke; no released fix is identified.')])

    update('HLLV-006',{
        'bottom_line':'October 15: console visual work remains planned for 1.7 and 2.0, not released.',
        'official_position':'The October 9 platform-specific plan remains in the evidence history; the October 15 follow-up does not establish release or expand PSSR support to base PS5.',
        'fix_short':'1.7 / 2.0 plans'
    },[source('cf8','Further console improvements planned.','Foliage, LODs & Visual Quality','plan')])

    update('HLLV-007',{
        'bottom_line':'Further keyboard fixes target 2.0. An October 16 player still reports conflicting mouse assignments; exact game/build scope needs confirmation.',
        'official_position':'Support previously requested clarification because the player also posted on the original Hell Let Loose forum. The later report describes left-click toggle ADS and right-click fire interfering; it does not independently settle the game/build ambiguity.',
        'fix_short':'Specific fixes live; more planned'
    },[source('cf8','Keyboard rebinding work targets 2.0.','Controller Customisation','plan'),source('590691913363951171','Support escalated the right-mouse issue while asking which Hell Let Loose game and exact bindings were affected.'),source('570426339809609829','Player describes right-click fire also toggling ADS with a left-handed custom configuration; game/build ambiguity remains.')])

    update('HLLV-029',{
        'bottom_line':'Support escalated further voice-chat failures on October 7. Earlier silent-muting safeguards do not establish complete VOIP recovery.',
        'official_position':'A newly reviewed Support reply acknowledges additional reports and recommends its troubleshooting article. It does not identify a confirmed cause, reproduce the failure, or announce a fix.'
    },[source('590691669350842074','Support forwarded additional unable-to-hear/transmit reports to the team; troubleshooting advice is not a release confirmation.')])

    update('HLLV-033',{
        'bottom_line':'October 11 Support follow-up confirms continuing tutorial/reset reports were escalated. A completion-saving fix is still unconfirmed.',
        'official_position':'The new thread describes repeated first-run/tutorial prompts. Support says it received similar reports and escalated them. This does not prove every first-run reset and lost role-unlock record has the same cause.'
    },[source('590691913364060219','Support acknowledges similar tutorial/reset reports and escalates the case; no fix or internal reproduction is stated.')])

    update('HLLV-046',{
        'bottom_line':'Still unresolved: developers now report reproducing some remaining replication failures internally.',
        'official_position':'October 15: a dedicated developer is investigating. Reproduction is partial; no general cause or fix is confirmed. Mortar construction is separately tracked in HLLV-077.',
        'official_short':'Some cases reproduced internally','fix_short':'No complete fix confirmed'
    },[source('cf8','Some residual cases reproduced; investigation continues.','Spawn Points & Server Replication')])

    update('HLLV-047',{
        'bottom_line':'A separate October 7 Support explanation distinguishes Epic-linked profiles from lost progression. It does not prove every Level 1 reset is resolved.',
        'official_position':'Support says linking Epic after playing without it can select a second profile, with earlier progress on the original profile. This is a scoped account-state explanation, not a diagnosis for all career resets.',
        'workaround':'If the apparent loss followed an Epic sign-in change, ask Support to verify which profile holds the progress. Do not assume unrelated resets are the same case.'
    },[source('590691669350841712','Support distinguishes a second Epic-linked profile from erased progress; it does not establish that all reset reports share this explanation.')])

    update('HLLV-057',{
        'bottom_line':'Foliage and disappearing-cover problems remain open; 1.7 and 2.0 improvements are still future work.',
        'official_position':'October 15 plans do not close the issue. A separate texture-report thread contains October 9 Support acknowledgment, not engineering reproduction or proof that disabling DLSS fixes blurry foliage.',
        'fix_short':'Earlier changes; 1.7 / 2.0 planned'
    },[source('cf8','Further foliage and LOD work planned.','Foliage, LODs & Visual Quality','plan'),source('590691669351029564','Support added screenshots and configuration information to its texture/lighting report; no shipped correction is identified.')])

    update('HLLV-058',{
        'bottom_line':'The publisher reaffirmed on October 15 that filters persist. Independent outcome testing remains unrecorded.',
        'official_short':'Publisher follow-up confirms behavior'
    },[source('cf8','Publisher says filters persist.','Server Browser & Favourites')])

    update('HLLV-059',{
        'bottom_line':'Fuller-server ordering is reaffirmed; complete server discovery and removal of the earlier search limit remain unconfirmed.',
        'official_position':'The October 15 browser follow-up is not evidence that every server is discoverable. A proposed Favourites-cap increase is a separate feature request, not a fix for search coverage.'
    },[source('cf8','Publisher reaffirms fuller-server ordering.','Server Browser & Favourites')])

    update('HLLV-060',{
        'bottom_line':'No released Frame Generation reapplication fix is verified. An October 12 player mentions re-enabling DLSS, without identifying Frame Generation specifically.',
        'official_position':'The startup-options candidate remains separate from Frame Generation reapplication. HLLV-076 now records missing DLSS choices and a narrowly scoped hybrid-laptop workaround; neither closes this dossier.'
    },[source('590692129307643129','Player says DLSS still needs re-enabling in a performance thread; this is not a verified Frame Generation reproduction.')])

    update('HLLV-061',{
        'bottom_line':'An October 9 Support reply adds another volume-slider report. The earlier 1.7 target remains unverified as a release.',
        'official_position':'This new citation is from a separate volume thread. The unrelated-text reply already held for editorial review is not used as evidence, and its hold remains intact.'
    },[source('590691669351052539','Support adds another excessive-VOIP-volume report to its existing case; no fix is confirmed.')])

    update('HLLV-065',{
        'status_key':'investigating','status_label':'Video escalated by Support',
        'bottom_line':'Support received the replacement video and escalated the vehicle-interaction issue on October 6. No reliable fix is confirmed.',
        'official_short':'Support escalation recorded',
        'official_position':'The player describes uninterrupted input failing to finish an engine interaction. Support passed the video to its team. This is not developer reproduction, and player theories about network conditions remain unverified.'
    },[source('590691400522348898','Support confirms receipt of the video and escalation of the incomplete boat-engine interaction.')])

    update('HLLV-066',{
        'status_label':'Player report; Support requests details',
        'bottom_line':'Support has replied about trapped spawns and requested affected maps. Developer reproduction, a shared cause, and a fix remain unconfirmed.',
        'official_short':'Support requested map details',
        'official_position':'The October 7 reply asks which maps are affected. An earlier Support suggestion about nearby spawn placement is not a confirmed explanation for every reported building or pier case.'
    },[source('590691669350877769','Support requests specific maps for the trapped-spawn report; it does not announce reproduction or a fix.')])

    new('HLLV-076','DLSS options missing at startup','graphics','multiple initialization/configuration cases','investigating','Candidate under validation; scoped workaround',
        'A game-startup candidate remains unverified as released. A separate hybrid-laptop report recovered DLSS using Windows per-app GPU selection.',
        'Candidate acknowledged; Support troubleshooting','No general release confirmed',['PC','NVIDIA','hybrid laptops'],
        'DLSS choices may be missing; absent quality settings and an entirely missing upscaler can represent different cases.',
        ['The October 9 publisher update describes a startup-timing candidate under validation.','One October 10 player reports recovery after selecting the NVIDIA GPU for the game executable in Windows.'],
        ['The player workaround does not verify the publisher candidate.','This is distinct from HLLV-060; no common cause or universal workaround is established.'],
        [source('cf7','A startup-timing candidate for absent DLSS quality choices is under validation.','DLSS & Frame Generation'),source('590691913363960853','A hybrid-laptop player reports that Windows per-app NVIDIA GPU selection restored DLSS.')],
        'Hybrid laptops only: check the GPU selected for the game under Windows Settings > System > Display > Graphics. One player reports success. Do not disable the integrated display adapter as a routine fix.')

    new('HLLV-077','Mortar and deployable blueprints fail to appear','gameplay','construction defect','investigating','Investigation; cause not established',
        'Some deployables are reported on the Tactical Map without a usable construction blueprint. No released fix is verified.',
        'Publisher investigating','None confirmed',['Mortars','deployables','construction'],
        'Placement cannot be completed when the blueprint is absent despite a map indicator.',
        ['The October 9 update acknowledges construction failures and reproduction difficulty.'],
        ['A shared cause with HLLV-046 is unproven. Its October 15 partial-reproduction statement must not automatically transfer here.'],
        [source('cf7','Missing deployable blueprints are being investigated separately from wider replication.','Mortars & Deployable Issues')])

    new('HLLV-078','River flickers when opening the Tactical Map','graphics','support-escalated visual report','investigating','Support escalation; fix unconfirmed',
        'Support escalated a river-flicker report on October 14. No developer reproduction or release is confirmed.',
        'Support escalation recorded','None confirmed',['Tactical Map','river rendering'],
        'The report concerns river flickering while the map is opened.',
        ['Support explicitly identifies the river/map symptom and forwards it for investigation.'],
        ['Affected maps, platforms and trigger conditions are not established.','A relationship to older white-flash reports or HLLV-057 is not established.'],
        [source('570426104667499540','Support escalates river flickering when opening the map.')])

    new('HLLV-079','M72 sight markings are difficult to distinguish','gameplay','weapon sight readability report','investigating','Screenshots escalated by Support',
        'A player supplied M72 sight screenshots; Support escalated them October 9. No correction is confirmed.',
        'Support escalation recorded','None confirmed',['M72','aiming','sight readability'],
        'Reported low contrast makes range markings and targets difficult to distinguish through the sight.',
        ['Support received the screenshots and passed the issue to the team.'],
        ['Prevalence, platform scope and acceptance as a confirmed defect remain unknown.','The supplied screenshots are source evidence, not independent gameplay testing.'],
        [source('590691669351029530','Support escalates screenshots about M72 sight visibility.')])

    new('HLLV-080','Weapon preparation finishes visually before readiness','gameplay','weapon readiness timing report','investigating','Support escalation; fix unconfirmed',
        'A player reports that switching weapons after the preparation animation can still reset preparation. Support escalated the report October 10.',
        'Support escalation recorded','None confirmed',['M72','T53N4','M203','weapon switching'],
        'The report distinguishes the end of the animation/audio from the later usable state; switching too soon may require preparing again.',
        ['Support acknowledges the animation report and escalates it.'],
        ['Exact delays, all affected weapons and internal reproduction are unverified.'],
        [source('590691913363952096','Support escalates the weapon preparation-animation report; no fix is stated.')])

    new('HLLV-081','Garrison destruction may award no points','gameplay','scoring report','investigating','Support escalation; scoring rule unverified',
        'Missing points after destructive attacks are reported. Support escalated the flame-related case October 9; no scoring correction is confirmed.',
        'Support escalation recorded','None confirmed',['Garrisons','flamethrowers','explosives','scoring'],
        'The thread alleges that flames or explosives can destroy a Garrison without awarding points.',
        ['Support specifically acknowledges and forwards the flame-related report.'],
        ['Explosive cases, expected scoring rules and reproduction are not independently established.','The player calls this a returning bug; a regression is not verified.'],
        [source('590691669351030273','Support escalates missing Garrison-destruction points involving flames.')])

    new('HLLV-082','Save-data load error blocks online entry','stability','online profile loading report','reported','Player workaround; general fix unconfirmed',
        'A player reports recovering from a save-data loading loop after correcting Windows time. Other causes and general resolution remain unverified.',
        'Support troubleshooting recorded','One player-reported workaround',['PC','online sign-in','save-data loading'],
        'Online entry repeatedly fails with a save-data loading message.',
        ['Support recommended checking Windows time/time-zone settings.','The reporting player says correcting the time allowed entry the following day.'],
        ['This does not establish data loss or a universal clock-related cause.','HLLV-047 profile switching and this entry failure must not be treated as identical.'],
        [source('590691669350878072','Support recommends checking Windows time and time-zone settings for the load error.'),source('590691669350947030','The reporting player says correcting system time restored access.')],
        'Check that Windows date, time and time zone are correct, then retry. This helped one reporting player; no files need to be deleted for this check.')

    new('HLLV-083','Startup DLL error accompanies missing game sounds','audio','startup and audio reports','reported','Support diagnostics; cause unconfirmed',
        'Two October reports pair startup error 0xc0e90002 with missing sounds. Support requests diagnostics; no fix is confirmed.',
        'Support requested diagnostics','None confirmed',['PC','startup','footsteps','vehicle audio'],
        'One report names fmod_haptics.dll and missing footsteps/hit sounds; another describes missing engines and footsteps with the same error code.',
        ['Support recommends file verification in one thread and requests screenshots or DxDiag information in the other.'],
        ['A shared cause between these two reports is not proven.','This is not evidence that the earlier echoed/muffled-sound fix failed.'],
        [source('590691913364103178','Support suggests file verification and diagnostics for startup errors with missing audio.'),source('590692129307648713','Support requests an error screenshot and diagnostics for missing engine/footstep audio.')],
        'Support suggests verifying game files. Success is not established; if it persists, send diagnostics through the official support channel rather than posting private system details here.')

    assert len(changed)==14 and len(added)==8 and len(data['issues'])==83
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    data.update(generated_at=REVIEW,page_updated_at=now,review_release=RELEASE)
    data['latest_change']={'date':REVIEW,'label':'October 16 bug evidence review','url':SOURCES['cf8']['url'],'summary':'14 existing dossiers refreshed and 8 distinct issues added from developer and Support evidence. Includes an October 16 player follow-up. Plans, reports and player workarounds remain separate from released fixes.'}
    limitations=['No independent gameplay testing.','Thirty-six discussion reply scans attempted; 34 completed and two were temporarily unavailable. Completeness is transport/parser coverage, not validation of every statement.','Only selected relevant claims were editorially incorporated. Other dossiers retain their prior evidence dates.','The latest official publisher announcement reviewed is October 15; the latest selected player reply is October 16.','Existing unrelated-text editorial hold remains unchanged and is not used as bug evidence.','Original Hell Let Loose is distinct from Vietnam; one custom-binding thread still has an unresolved game/build ambiguity.','No update to visual assets, functional scripts, feature records, account data or Suggestion Box moderation.']
    report={'date':REVIEW,'review_release':RELEASE,'base_commit':BASE,'page_updated_at':now,'updated_issues':changed,'new_issues':added,'issue_count':len(data['issues']),'source_references':sum(len(i['sources']) for i in data['issues']),'distinct_source_urls':len({s['url'] for i in data['issues'] for s in i['sources']}),'latest_verified_release':{'title':'Patch 1.6','date':'2026-10-07'},'independent_gameplay_testing':False,'limitations':limitations,'thread_checks':{'attempted':36,'complete':34,'unavailable':['https://steamcommunity.com/app/3079210/discussions/1/590691913364082100/','https://steamcommunity.com/app/3079210/discussions/1/590691913364082327/']}}
    data.setdefault('review_history',[]).append(copy.deepcopy(report))
    data['review_notes']='October 16: 14 existing dossiers refreshed; 8 separately scoped issues added. Read review_history for coverage and limits. Older evidence dates and the existing held reply remain unchanged. Previous review: '+old.get('review_notes','')
    brief={'id':'community-feedback-8','title':'Community Feedback #8','date':'2026-10-15','reviewed_at':REVIEW,'type':'official update','source_url':SOURCES['cf8']['url'],'source_reviewed_via':SOURCES['cf8']['source_reviewed_via'],'headline':'Developer follow-up, not a released patch.','highlights':['Remaining replication failures are still under investigation.','The bug ledger now incorporates the selected October 15 statements and subsequent community evidence.'],'caution':'Patch 1.7 remains upcoming. See individual dossiers for source dates and claim boundaries.'}
    data.setdefault('developer_updates',[]).append(brief)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'reviews'/f'{RELEASE}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    # Text-only replacement inside the existing disclosure: no new layout or scripts.
    page=ROOT/'index.html';markup=page.read_text();esc=lambda s:html.escape(s,quote=True)
    replacement='<details class="patch-provenance"><summary>Latest developer update: Community Feedback #8 · October 15 — not a patch</summary><div><p>'+esc(brief['headline'])+'</p><ul>'+''.join('<li>'+esc(s)+'</li>' for s in brief['highlights'])+'</ul><p>'+esc(brief['caution'])+'</p><p><a href="'+SOURCES['cf8']['url']+'" target="_blank" rel="noopener noreferrer">Read official developer update ↗</a> · <a href="https://steamcommunity.com/app/3079210/allnews/" target="_blank" rel="noopener noreferrer">Reviewed publisher copy on Steam ↗</a></p><p>Source dated October 15; reviewed October 16. Same publisher, not independent corroboration.</p></div></details>'
    markup,count=re.subn(r'<details class="patch-provenance"><summary>Latest developer update:.*?</details>',lambda _:replacement,markup,count=1,flags=re.S)
    assert count==1;page.write_text(markup)
    subprocess.run(['python3','.github/hllv-homepage/publish.py'],check=True,stdout=subprocess.DEVNULL)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
