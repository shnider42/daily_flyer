"""Guarded editorial Patch 1.7 review. No automatic status classification or DB writes."""
import copy
import hashlib
import html
import importlib.util
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = '0b0d84b467f774e3b51107bdf8ed8f948c782039'
DAY = '2026-10-21'
RELEASE = '2026-10-21-patch-1-7-review'
ROOT = Path('hllv_tracker')
URL = 'https://steamcommunity.com/games/3079210/announcements/detail/675134795999609522'
GID = '1847286114028257'
EXPECTED_HASH = 'e09490c9fbe88e5c27342a6f7201df5cecc4e262b4479e0eaccea3cc0e167b16'

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def main():
    issue_path = ROOT/'data/issues.json'
    data = json.loads(issue_path.read_text())
    if data.get('review_release') == RELEASE:
        print('Review already applied; timestamps unchanged.')
        return
    feature_path = ROOT/'data/features.json'
    for path in [issue_path, feature_path, ROOT/'index.html']:
        assert path.read_bytes() == subprocess.check_output(['git', 'show', BASE+':'+str(path)]), str(path)
    features = json.loads(feature_path.read_text())
    old = copy.deepcopy(data)
    source_api = json.loads(Path(sys.argv[1]).read_text())
    assert source_api['appnews']['appid'] == 3079210
    post = next(p for p in source_api['appnews']['newsitems'] if p['gid'] == GID)
    assert post['feedname'] == 'steam_community_announcements'
    collector = module('patch17_normalizer', '.github/hllv-ux-20261012/nightly.py')
    content_hash = hashlib.sha256((collector.plain(post['title'])+'\n'+collector.plain(post['contents'])).encode()).hexdigest()
    assert content_hash == EXPECTED_HASH, 'Publisher text changed; re-review before applying'
    published = datetime.fromtimestamp(post['date'], timezone.utc).isoformat().replace('+00:00', 'Z')
    assert published[:10] == DAY
    source = dict(type='patch notes', publisher='Hell Let Loose / Team17', title=post['title'],
                  url=URL, date=DAY, source_published_at=published, source_reviewed_at=DAY,
                  source_reviewed_via=post['url'], announcement_id=GID, content_sha256=content_hash)
    issues = {i['id']: i for i in data['issues']}
    changed, added, feature_changed, feature_added = [], [], [], []

    def citation(section, claim):
        return dict(source, source_locator=section, claim=claim)

    def update(key, section, claim, **fields):
        issue = issues[key]
        issue.setdefault('editorial_history', []).append(dict(date=DAY,
            reason='Patch 1.7 release review; previous assessment preserved.',
            previous={k: copy.deepcopy(issue.get(k)) for k in fields}))
        issue.update(fields)
        issue.update(last_reviewed=DAY, last_updated=DAY)
        issue['sources'].append(citation(section, claim))
        issue['timeline'].append(dict(date=DAY, event='Patch 1.7 release review', detail=claim, source_url=URL))
        changed.append(key)

    update('HLLV-003', 'Stability & Performance',
        'The release lists a Tank Driver rotation error correction and reduced shoreline rubberbanding, not closure of all client crashes.',
        bottom_line='Patch 1.7 adds targeted stability/performance changes. Complete resolution of the previously reported crashes is not established.',
        fix_short='Targeted changes through 1.7',
        official_position='The notes identify a Tank Driver rotation NaN error and shoreline rubberbanding. They do not identify either as the cause of every AMD, loading, deployment or tank-fire crash; the earlier monitoring history remains relevant.')
    update('HLLV-004', 'Maps & Environments',
        'Publisher counts 13 collision/bullet-collision corrections among 26 map fixes across six maps; individual older reports are not mapped to them.',
        bottom_line='Patch 1.7 adds 13 collision/bullet-collision corrections across the map set. Closure of each older invisible-prop report is not documented.',
        fix_short='Specific map corrections through 1.7')
    update('HLLV-006', 'Visual & Performance Upgrades',
        'PSSR is released for PS5 Pro; VRR is released for PS5 and PS5 Pro with compatible displays. Base-PS5 QSSR is a future intention.',
        bottom_line='Patch 1.7 releases PSSR on PS5 Pro and VRR on PS5/PS5 Pro. Wider image-quality complaints remain only partially addressed.',
        fix_short='PSSR Pro / PS5 VRR released',
        official_position='Do not extend PSSR to base PS5 or treat display-feature availability as universal visual recovery. QSSR for base PS5 is described as future integration when available; the previously announced wider 2.0 work is not released by these notes.')
    update('HLLV-007', 'Controls & Settings',
        'Fixes right-click ADS persisting after unbinding during equipment changes, plus Recon Flare and Mic/Radio input-label mismatches.',
        bottom_line='Patch 1.7 fixes a specific right-click ADS rebinding case and two input-label errors. General binding persistence and all conflicts are not confirmed fixed.',
        fix_short='Specific rebinding fixes through 1.7',
        official_position='The release describes the right-click/unbound-ADS equipment-switch case. It does not establish that every earlier mouse-conflict report had that cause, or close the wider keyboard work previously targeted for 2.0.')
    update('HLLV-031', 'Vehicles',
        'Boat MG positions and tank coaxial MGs can be resupplied before empty; equal rearming of both bow guns is not explicitly addressed.',
        bottom_line='Patch 1.7 permits boat-gun top-ups before empty. The separate report that only one dual bow gun reloads is not explicitly confirmed fixed.',
        official_position='A broader resupply convenience change is released, but it is not an itemized correction for asymmetric dual-gun rearming. Keep the original Support report open.')
    update('HLLV-033', 'Other Important Changes / Tutorials; Tutorials & Practice Range',
        'Improves completion-status labels and fixes a Mortar Tutorial reload sequence; persistence of completed tutorials is not explicitly corrected.',
        bottom_line='Patch 1.7 clarifies tutorial completion labels. Saving lost completion progress is still not confirmed fixed.',
        official_position='UI labeling is distinct from persistent progress. The separately listed Mortar Tutorial reload correction does not establish recovery of completed tutorials or role unlocks.')
    update('HLLV-046', 'Tactical Map & Tunnels',
        'Fixes Commander vehicle orders failing under simultaneous inputs; this is narrower than missing replicated spawn points and abilities.',
        bottom_line='Patch 1.7 fixes one Commander vehicle-order input case, not the wider missing-spawn replication problem. General closure remains unconfirmed.',
        official_position='Retain the October 15 partial internal reproduction and active investigation. The new vehicle-order case is separately scoped in HLLV-096 and must not close missing HQ, Garrison or Outpost reports.')
    update('HLLV-057', 'Audio, Visuals & Animation; Maps & Environments',
        'Fixes some foliage disappearing beyond 200 metres unless zoomed, a Low Quality post-ADS shadow issue, and eight map culling/LOD cases.',
        bottom_line='Patch 1.7 fixes specific long-range foliage and shadow cases and adds map LOD corrections. Broad blur, pop-in and disappearing-cover closure remains unverified.',
        fix_short='Targeted foliage / LOD fixes in 1.7',
        official_position='The beyond-200-metre foliage correction is a defined case, not proof that all shorter-range blur or cover-loss reports are fixed. Wider 2.0 visual plans and the earlier Support diagnostic history remain separate.')
    update('HLLV-060', 'AMD FSR Frame Generation; Controls & Settings',
        'Introduces AMD FSR Frame Generation; the release does not explicitly address NVIDIA DLSS Frame Generation needing reapplication.',
        bottom_line='Patch 1.7 adds AMD FSR Frame Generation. A fix for NVIDIA DLSS Frame Generation needing reapplication remains unconfirmed.',
        official_position='AMD feature availability is not evidence about NVIDIA settings persistence. The new unsaved-options warning also does not establish a persistence fix.')
    update('HLLV-061', 'Controls & Settings',
        'The release explicitly corrects Voice Volume slider scaling across Audio Settings channels.',
        status_key='shipped', status_label='Slider fix released in 1.7',
        bottom_line='Patch 1.7 explicitly fixes voice-volume slider scaling across audio channels. Independent post-patch outcome testing is not recorded.',
        official_short='Release documented', fix_short='Patch 1.7',
        official_position='This is direct release evidence for the slider-scaling defect, not a fix for every VOIP outage. The unrelated Support reply under editorial hold remains excluded.',
        unknown=['Independent post-1.7 outcome verification is not recorded.', 'This does not close channel-unavailability reports in HLLV-029.'])
    update('HLLV-062', 'Boat Spawn Protection',
        'Manual departure from the Driver seat shuts the engine off; killing the seated driver deliberately leaves it running.',
        status_key='shipped', status_label='Behavior change released in 1.7',
        bottom_line='Patch 1.7 shuts the engine off on manual driver exit so the boat can become a spawn point. A killed driver deliberately leaves it running.',
        official_short='Release documented', fix_short='Patch 1.7',
        official_position='The revised manual-exit rule has shipped. Driver-death counterplay is intentional; this does not fix unrelated ghost boats, replication failures or stuck engine interactions.',
        workaround='On 1.7, manually leaving the Driver seat now shuts the engine off. If the driver was killed, the notes deliberately leave the engine running; switching it off is still required for spawning.',
        unknown=['Independent post-1.7 outcome testing is not recorded.', 'Unrelated boat and server defects remain separate.'])
    update('HLLV-067', 'Vehicles; Controls & Settings (scope comparison)',
        'Lists helicopter roll sensitivity and other control fixes, but no explicit Huey M60 ADS-sensitivity correction.',
        bottom_line='The Huey M60 ADS fix had targeted 1.7, but the final notes do not explicitly confirm it. Earlier broad mounted-gun fixes remain separately recorded.',
        fix_short='Huey-specific release still unconfirmed',
        official_position='The 1.6 mounted-gun claim and later Huey-specific target remain unreconciled. Helicopter roll sensitivity is not gun aiming sensitivity; absence from these notes does not prove the fix failed or was cancelled.')
    update('HLLV-070', 'Admin Camera',
        'Applies inverted controls in Admin Camera and blocks Commander abilities and Tunnel connections while using it.',
        bottom_line='Patch 1.7 adds Admin Camera inversion and action-restriction corrections, following the documented 1.6 view/input/HUD fixes.',
        fix_short='Corrections through Patch 1.7')
    update('HLLV-077', 'Gameplay; Audio, Visuals & Animation',
        'Fixes trapping inside a Mortar Pit blueprint and adds dismantling feedback; it does not explicitly fix missing construction blueprints.',
        bottom_line='Patch 1.7 fixes a Mortar construction trap and adds dismantling feedback. Missing deployable blueprints are still not explicitly confirmed fixed.',
        official_position='Construction with a visible blueprint and a blueprint that never appears are distinct symptoms. Keep the missing-blueprint investigation open.')
    update('HLLV-084', 'Controls & Settings',
        'Adds a warning when leaving front-end Options with unsaved changes, not an explicit restart-persistence correction.',
        bottom_line='Patch 1.7 adds an unsaved-options warning. That does not establish a fix for video settings failing to persist after restart.',
        official_position='The October 19 mixed Support response remains the acknowledgement basis. The new warning is a separate interface behavior, with no itemized persistence finding.')

    # Selected separately identifiable defects; small cosmetic corrections stay in the full official notes.
    new_rows = [
        ('Mortar Pit limit bypass through Gunner swaps', 'gameplay', 'Gameplay', 'Mortar Pit / unit limits', 'Patch 1.7 closes a unit-limit bypass involving changes of Gunner players.'),
        ('Players trapped while building inside a Mortar blueprint', 'gameplay', 'Gameplay', 'Mortar Pit / construction', 'Patch 1.7 fixes becoming trapped when building a Mortar Pit while standing inside its blueprint.'),
        ('Anti-Aircraft Gun exit blocked near structures', 'gameplay', 'Gameplay', 'Anti-Aircraft Gun / exit', 'Patch 1.7 fixes being unable to leave an Anti-Aircraft Gun positioned too close to a structure.'),
        ('Accuracy statistics exceed 100 percent', 'ui', 'Gameplay', 'Accuracy statistics', 'Patch 1.7 corrects accuracy statistics exceeding 100 percent; it does not add expanded match statistics.'),
        ('Practice Range rifle recoil recovery fails', 'gameplay', 'Gameplay', 'Practice Range / rifles', 'Patch 1.7 fixes recoil recovery for semi-automatic and bolt-action rifles in the Practice Range.'),
        ('Helicopter wreck damage continues without visible fire', 'vehicles', 'Vehicles', 'Helicopter wrecks / fire', 'Patch 1.7 fixes wreck fire effects disappearing while the wreck still damages players.'),
        ('Players swim through the underside of NVA boats', 'vehicles', 'Vehicles', 'NVA boats / collision', 'Patch 1.7 repairs missing underside collision on NVA boats.'),
        ('Moving-boat exits trap, kill or throw players', 'vehicles', 'Vehicles', 'Moving boats / disembarking', 'Patch 1.7 lists corrections for moving-boat exits that trap players in the cabin, kill them or throw them unexpectedly.'),
        ('Tank gunner seat changes silently switch ammunition to AP', 'vehicles', 'Vehicles', 'Tank Gunner / ammunition', 'Patch 1.7 fixes leaving or changing the Gunner seat switching ammunition to AP while the display still shows the previous shell.'),
        ('Server queue shows an outdated map or mode', 'servers', 'UI & HUD', 'Server queue / map and mode', 'Patch 1.7 corrects queue information disagreeing with the Server Browser after a match changes.'),
        ('Leave Unit becomes unresponsive after joining and leaving', 'ui', 'UI & HUD', 'Unit controls', 'Patch 1.7 fixes the Leave Unit button becoming unresponsive after a join/leave sequence.'),
        ('Simultaneous inputs prevent Commander vehicle orders', 'gameplay', 'Tactical Map & Tunnels', 'Commander / vehicle orders', 'Patch 1.7 fixes vehicle orders failing when multiple inputs are pressed together; this is not general spawn replication closure.'),
        ('Commander strike aircraft appear offset from their target', 'gameplay', 'Tactical Map & Tunnels', 'Commander / strike aircraft', 'Patch 1.7 corrects strike aircraft appearing offset from the intended ability position.'),
        ('Mortar Tutorial reload blocked after entering the Aimer seat', 'gameplay', 'Tutorials & Practice Range', 'Mortar Tutorial / reload', 'Patch 1.7 fixes tutorial reloading becoming unavailable after first using the Aimer position.'),
        ('Weapon firing effects play incorrectly around deployment', 'audio', 'Audio, Visuals & Animation', 'Deployment / semi-automatic weapons', 'Patch 1.7 fixes incorrect firing sounds and visuals when deploying near players using semi-automatic fire.'),
        ('Low Quality shadows shift after leaving ADS', 'graphics', 'Audio, Visuals & Animation', 'Low Quality / shadows / ADS', 'Patch 1.7 fixes visibly moving shadows on Low Quality settings after leaving aim-down-sights.'),
        ('Tank Driver rotation encounters a NaN error', 'stability', 'Stability & Performance', 'Tank Driver / seat rotation', 'Patch 1.7 corrects a Tank Driver seat-rotation NaN error. The notes do not identify it as the cause of all tank-related crashes.'),
        ('Rubberbanding along shorelines', 'stability', 'Stability & Performance', 'Movement / shoreline', 'Patch 1.7 reduces rubberbanding while walking or running along water edges; the wording does not promise elimination.'),
        ('Weapon reload haptics stop working', 'controls', 'Gameplay', 'Weapons / reload haptics', 'Patch 1.7 fixes reload haptics stopping. This is distinct from the earlier M14/SKS feedback correction.')
    ]
    for number, (title, category, section, scope, claim) in enumerate(new_rows, 85):
        key = f'HLLV-{number:03d}'
        partial = number == 102
        issue = dict(id=key, title=title, category=category, kind='release-documented defect',
            status_key='partial' if partial else 'shipped',
            status_label='Reduction released in 1.7' if partial else 'Fix released in 1.7',
            bottom_line=claim, official_short='Release documented', fix_short='Patch 1.7',
            cause_short='Not established by release notes', last_updated=DAY, last_reviewed=DAY,
            scope=scope.split(' / '), symptom=title, official_position='The publisher documents this scoped change in the released changelog; this is not independent gameplay verification.',
            workaround=None, known=[claim], unknown=['Independent post-1.7 outcome testing is not recorded.', 'A shared cause with similarly worded reports is not established.'],
            timeline=[dict(date=DAY, event='Patch 1.7 released', detail=claim, source_url=URL)], sources=[citation(section, claim)])
        data['issues'].append(issue)
        added.append(key)

    fsource = dict(id='patch17', announcement_id=GID, title=post['title'], publisher=source['publisher'],
        authority='official_publisher', url=URL, reviewed_via=post['url'], published_at=published,
        content_sha256=content_hash, reviewed_at=DAY,
        review_scope='Released functionality, hardware limits and separately stated future plans in the full Patch 1.7 announcement; no independent gameplay test.')
    features['sources'].insert(0, fsource)
    fmap = {f['id']: f for f in features['features']}

    def feature_update(key, current, change, status='released', target='Released in Patch 1.7', source_ids=None):
        f = fmap[key]
        f.setdefault('editorial_history', []).append(dict(date=DAY, previous={k:copy.deepcopy(f[k]) for k in ['current','change','status','target']}))
        f.update(status=status, change=change, target=target, latest_source_id='patch17')
        if current is not None:
            f['current'] = dict(availability='live', summary=current, source_ids=source_ids or ['patch17'])
        f['history'].append(dict(source_id='patch17', status=status, summary=change))
        feature_changed.append(key)

    feature_update('HLLV-F001', 'Level 1 construction remains free of Supplies; upgrades still cost Supplies. Barbed Wire is now three per Engineer, capped at 50 per side.', 'The announced Barbed Wire increase is now released.', source_ids=['patch16','patch17'])
    feature_update('HLLV-F003', 'All controller layouts offer a Crouch / Melee input swap.', 'The Crouch / Melee swap has shipped; it is not full controller remapping.')
    feature_update('HLLV-F008', 'Manual driver exit switches the engine off. Driver death in the seat leaves it running, which prevents transport-boat spawning until it is switched off.', 'The manual driver exit rule is released, preserving driver-kill counterplay.')
    feature_update('HLLV-F009', None, 'Khe Sanh is reaffirmed for Update 2.0, with the major update expected in November. No exact launch day is stated.', 'planned', 'Update 2.0 · November 2026 target')
    feature_update('HLLV-F010', 'PSSR is available on PS5 Pro. VRR is available on PS5 and PS5 Pro with compatible displays.', 'The platform-specific display options are released. PSSR is not announced for base PS5.')

    # Current behavior and future direction remain separate even within the same announcement.
    feature_rows = [
        ('M1A1 Thompson', 'Weapons', 'new_content', 'US access: Commander, Tank Commander, Crewman, Mortar Observer, Sniper, Squad Leader, Medic, Specialist, Grenadier and Engineer.', 'Adds a US submachine-gun option to the listed roles.', ['thompson','m1a1'], []),
        ('M16A1 30-round magazines', 'Weapons', 'new_option', 'Optional 30-round configuration: six magazines by default, up to ten via Barracks. The weapon gains one Weight; each magazine costs two Weight versus one for a 20-round magazine.', 'Adds capacity with a loadout-weight trade-off; the 20-round option remains.', ['m16a1','30-round'], []),
        ('Tank shell unloading', 'Vehicles', 'functionality_change', 'Selecting another shell type unloads the chambered round and automatically loads the chosen type.', 'A tank crew no longer has to fire its loaded round just to switch shell types.', ['shell unloading','chambered shell'], ['HLLV-093']),
        ('Boat handling, speed & Fuel balance', 'Vehicles', 'balance_change', 'Both factions gain handling and top-speed improvements. The US PBR has a larger speed/acceleration advantage; the supply-carrying NVA boat now costs 250 Fuel, up from 200.', 'Boat handling and resource costs are rebalanced.', ['boat handling','pbr','250 fuel'], []),
        ('AMD FSR Frame Generation', 'Graphics', 'new_option', 'Available in Video Settings on supported AMD GPUs, specified as 5000 series and newer. The publisher recommends a base rate around 60 FPS or higher to limit added latency.', 'Adds AMD frame generation; it is separate from NVIDIA DLSS persistence reports.', ['fsr frame generation','amd'], ['HLLV-060']),
        ('Redeploy punishment timer', 'Gameplay', 'functionality_change', 'Choosing Redeploy no longer adds a ten-second punishment; the normal deployment timer still applies.', 'Removes the extra redeploy penalty, not all waiting time.', ['redeploy','punishment'], []),
        ('Commander ability team-kill punishment', 'Gameplay', 'functionality_change', 'Friendly deaths from Commander abilities such as Napalm, Artillery Strikes and Bombing Runs no longer add a team-kill punishment to the Commander.', 'Personal weapons and other direct actions keep their normal punishment behavior.', ['commander orders','team-kill'], []),
        ('Official Server AFK timer', 'Servers', 'balance_change', 'Official Servers now remove inactive players after ten minutes instead of thirty.', 'The published change is scoped to Official Servers; no universal community-server setting is inferred.', ['afk','inactive'], []),
        ('Faster Barracks navigation & unsaved-options warning', 'Interface', 'functionality_change', 'Lengthy Barracks entry/exit camera transitions are removed. Leaving front-end Options with unsaved edits now prompts the player.', 'Improves menu flow without establishing that every saved setting persists through restart.', ['barracks','unsaved changes'], ['HLLV-084']),
        ('NATO phonetic Unit names', 'Interface', 'functionality_change', 'Units use NATO phonetic names, including Alfa, Bravo and Charlie.', 'Updates Unit naming; this does not add Clan Tags or rank emblems.', ['phonetic','unit names'], []),
        ('Vehicle impact kill threshold', 'Gameplay', 'balance_change', 'Vehicles must reach a higher speed before an impact kills infantry; the notes give no numerical threshold.', 'Raises the threshold again to reduce slow-vehicle deaths.', ['vehicle impact','run over'], []),
        ('ANZAC Forces', 'Factions', 'new_content', None, 'Announced as an expansion of US & Allied Forces in Update 2.0; not released by Patch 1.7.', ['anzac','allied forces'], []),
        ('Base PS5 QSSR', 'Graphics', 'new_option', None, 'The publisher intends to integrate QSSR when available to implement. No release date or Update 2.0 commitment is stated.', ['qssr'], ['HLLV-006']),
        ('Tank coaxial & boat MG ammunition top-ups', 'Vehicles', 'functionality_change', 'Tank coaxial MGs and boat Machine Gunner positions can be resupplied before their ammunition is completely empty.', 'Extends pre-empty resupply; equal refilling of both bow guns is not explicitly confirmed.', ['coaxial','resupplied'], ['HLLV-031']),
        ('Tutorial completion labels', 'Interface', 'functionality_change', 'Tutorial status more clearly identifies completed and incomplete tutorials.', 'Clarifies the display; it does not establish a completion-saving fix.', ['tutorial status','tutorials'], ['HLLV-033']),
        ('Commander vehicle-limit & Encourage indicators', 'Interface', 'functionality_change', 'Commander vehicle Orders show the active vehicle limit; Encourage has an active-state indicator.', 'Adds feedback about limits and current ability state.', ['encourage','active vehicle limit'], ['HLLV-096']),
        ('Tunnel-collapse travel outcome', 'Gameplay', 'functionality_change', 'Players in transit are killed immediately if their Tunnel network collapses.', 'Changes the outcome during a collapsing network, not general Tunnel replication or connectivity.', ['tunnel network collapses','travelling'], [])
    ]
    for number, (title, category, kind, current, change, terms, related) in enumerate(feature_rows, 17):
        key=f'HLLV-F{number:03d}'
        status='released' if current is not None else 'planned'
        target='Released in Patch 1.7' if current is not None else ('Update 2.0 · November 2026 target' if title=='ANZAC Forces' else 'No confirmed release date')
        features['features'].append(dict(id=key,title=title,category=category,kind=kind,
            current=dict(availability='live' if current is not None else 'not_confirmed_live',summary=current or 'Not released in the reviewed announcement.',source_ids=['patch17'] if current is not None else []),
            status=status,change=change,target=target,latest_source_id='patch17',history=[dict(source_id='patch17',status=status,summary=change)],
            related_issue_ids=related,related_suggestions=[],monitor_terms=terms))
        feature_added.append(key)
    features.update(reviewed_at=DAY,coverage_note='Selected functionality from Community Feedback 6–8 and Patches 1.6–1.7. October 21 distinguishes released changes from future 2.0 and QSSR plans; this is not a complete roadmap or independent gameplay verification.')

    note=dict(id='patch-1-7',title='Patch 1.7',date=DAY,date_label='Live announcement',
        scope='PC and consoles; PSSR, VRR and AMD frame generation have hardware/display requirements',
        headline='New weapon options, useful vehicle changes, and targeted fixes.',
        highlights=[
            'The M1A1 Thompson and optional M16A1 30-round magazines join the arsenal. Tanks can unload shells when changing ammunition.',
            'Boats shut down on manual driver exit, retain driver-death counterplay, and receive handling/balance changes. Engineers get three Barbed Wire placements, capped at 50 per side.',
            'PSSR reaches PS5 Pro, VRR reaches compatible PS5 displays, and supported AMD GPUs gain FSR Frame Generation. Controller Crouch/Melee swapping and punishment/AFK changes are live.',
            'Specific fixes cover voice-volume scaling, right-click ADS, moving-boat exits, foliage at distance, and map collisions. Khe Sanh and ANZAC remain future Update 2.0 content.'
        ],
        caution='A released change is not universal recovery. Missing-spawn replication, lost tutorial progress, DLSS reapplication and the Huey M60 ADS target are not explicitly closed. Driver death deliberately leaves boat engines running.',
        source_url=URL,source_title=post['title'],related_issues=['HLLV-061','HLLV-062','HLLV-057'],
        review_basis='Full official Steam publisher announcement reviewed, matched to announcement ID '+GID+' and its normalized content hash. Selected summary and scoped records; no independent gameplay testing.',reviewed_at=DAY,
        announcement_id=GID,content_sha256=content_hash)
    data['patch_notes'].insert(0,note)
    # Preserve older evidence but remove misleading present-tense "latest" captions.
    for entry in data['developer_updates']:
        if entry['id']=='community-feedback-7':
            entry['caution']='At this October 9 update, Patch 1.6 was the latest verified release. These requests are not site submissions, developer-approved Bulletin Board entries or implementation promises. See the newer Patch 1.7 summary for released changes.'
        if entry['id']=='community-feedback-8':
            entry['caution']='Patch 1.7 was upcoming when this October 15 post was published; it released October 21. See the newer patch summary and individual dossiers for the current evidence.'
    data['patch_notes_reviewed_at']=DAY
    data['patch_notes_review_scope']='Added the reviewed Patch 1.7 release summary; older release summaries retain their original review dates and historical scope.'
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    data.update(generated_at=DAY,page_updated_at=now,review_release=RELEASE)
    data['latest_change']=dict(date=DAY,label='Patch 1.7 reviewed',url=URL,
        summary='Voice-volume and boat-shutdown changes are released; targeted graphics and control fixes are recorded. The content tracker now includes new weapons, vehicle behavior and clearly separated future plans.')
    report=dict(date=DAY,review_release=RELEASE,base_commit=BASE,page_updated_at=now,
        issue_count=len(data['issues']),feature_count=len(features['features']),updated_issues=changed,new_issues=added,
        updated_features=feature_changed,new_features=feature_added,source=source,latest_verified_release='Patch 1.7',
        independent_gameplay_testing=False,
        scope='Full Patch 1.7 publisher text reviewed; selected bug dossiers and functionality topics updated. Smaller cosmetic/UI corrections remain available in the linked complete changelog.',
        limitations=['Patch notes establish announced release, not independent recovery for every report.',
            'No blanket closure of spawn replication, tutorial persistence, DLSS persistence, missing blueprints, all crashes or all foliage reports.',
            'Huey M60 ADS was targeted for 1.7 but is not explicitly confirmed by the final text.',
            'Khe Sanh and ANZAC remain planned for Update 2.0; QSSR has no stated release date.',
            'The existing automatic forum monitor remains partial (35 of 36 tracked threads complete at its last run); this patch review is not a fresh all-forum audit.',
            'Unrelated Support-text editorial hold, private suggestions, moderation and account data are unchanged.'])
    data.setdefault('review_history',[]).append(report)
    data['review_notes']='October 21: reviewed Patch 1.7 release evidence; historical assessments and source dates retained. '+data['review_notes']
    # Reuse the existing native-disclosure renderer without rerunning its historical migration.
    archive=module('patch17_archive','.github/hllv-patches/build.py')
    rendered=archive.render([note],data)
    new_entry=rendered[rendered.index('<details class="patch-entry"'):rendered.index('</div></section>')]
    page=ROOT/'index.html';markup=page.read_text()
    start,end=markup.index(archive.START),markup.index(archive.END)+len(archive.END)
    section=markup[start:end]
    assert section.count('<span class="patch-latest">Latest reviewed</span>')==1
    section=section.replace('<span class="patch-latest">Latest reviewed</span>','')
    assert section.count('<div class="patch-entries">')==1
    section=section.replace('<div class="patch-entries">','<div class="patch-entries">'+new_entry,1)
    section,count=re.subn(r'(<p class="patch-coverage">).*?(</p>)',r'\g<1>9 reviewed releases · August 21–October 21, 2026 · Newest first by default\2',section)
    assert count==1
    for previous in old['developer_updates']:
        revised=next(e for e in data['developer_updates'] if e['id']==previous['id'])
        if html.escape(previous['caution'],quote=True) in section:
            section=section.replace(html.escape(previous['caution'],quote=True),html.escape(revised['caution'],quote=True))
    assert 'id="patchDateOrder"' in section
    assert section.count('class="patch-entry"')==9
    page.write_text(markup[:start]+section+markup[end:])
    for path, value in [(issue_path,data),(feature_path,features),(ROOT/'reviews'/f'{RELEASE}.json',report)]:
        path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['issue_count','feature_count','updated_issues','new_issues','updated_features','new_features']}))

if __name__=='__main__':
    main()
