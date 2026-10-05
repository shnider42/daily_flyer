"""One-time, reviewed migration; not a scraper, scheduler, or runtime dependency.

Only the exact October 2 snapshot can be changed. Public Steam news is used
solely to locate equivalent publisher permalinks, never to infer issue status.
No issue, incident, observation, or historical timeline entry is removed.
"""
from __future__ import annotations
import copy
import hashlib
import html
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

REVIEW_DATE = '2026-10-05'
BASE_BLOB = '971f968cecff3a67692fbbf7c0993758e5be8503'
DATA = Path('hllv_tracker/data/issues.json')
README = Path('hllv_tracker/README.md')
BLOG = 'https://www.hellletloose.com/blog/'
RECENT = {
    'community-update-5': ('2026-09-25', 'Community Feedback #5'),
    'hllv-hotfix-1-5-2': ('2026-09-29', 'Hotfix 1.5.2'),
    'community-update-6': ('2026-10-01', 'Community Feedback #6'),
}


def get_bytes(url: str) -> tuple[str, bytes]:
    request = Request(url, headers={'User-Agent': 'HLLV-Evidence-Review/1.0', 'Accept-Language': 'en'})
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError(f'HTTP {response.status}')
        body = response.read(4_000_001)
        if len(body) > 4_000_000:
            raise ValueError('Response exceeds size limit')
        return response.url, body


def news_key(title: str) -> str | None:
    title = html.unescape(title).strip()
    match = re.search(r'^Community (?:Feedback|Update)\s*#?\s*(\d+)\b', title, re.I)
    if match:
        return 'community-' + match.group(1)
    match = re.search(r'^(Patch|Hotfix|Update)\s+(\d+\.\d+(?:\.\d+)?)\b', title, re.I)
    if match and re.search(r'Full Changelog|Live Now|Now Live', title, re.I) and not re.search(r'VLOG|Trailer', title, re.I):
        return 'release-' + match.group(2)
    if re.search(r'Known Issues.*Launch Time', title, re.I):
        return 'launch-issues'
    if 'Patch 1.6' in title and 'Command Post' in title and 'VLOG' in title:
        return 'vlog-20261002'
    return None


def source_key(source: dict) -> str | None:
    path = urlsplit(source['url']).path.rstrip('/')
    slug = path.rsplit('/', 1)[-1]
    match = re.fullmatch(r'community-(?:update|feedback)-(\d+)', slug)
    if match:
        return 'community-' + match.group(1)
    match = re.fullmatch(r'hllv-(?:patch|hotfix|update)-(\d+-\d+(?:-\d+)?)', slug)
    if match:
        return 'release-' + match.group(1).replace('-', '.')
    if slug == '5-before-launch':
        return 'launch-issues'
    if path.endswith('/3079210/allnews') and '1.5.1' in source.get('title', ''):
        return 'release-1.5.1'
    return None


def verified_permalinks() -> tuple[dict, list[str]]:
    warnings = []
    query = urlencode({'appid': 3079210, 'count': 100, 'maxlength': 0, 'feeds': 'steam_community_announcements'})
    try:
        _, raw = get_bytes('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?' + query)
        payload = json.loads(raw)['appnews']
        assert payload['appid'] == 3079210, 'Wrong Steam application'
    except Exception as error:
        return {}, ['Steam permalink lookup unavailable: ' + str(error)]
    candidates = {}
    for item in payload['newsitems']:
        if item.get('feedname') != 'steam_community_announcements' or item.get('is_external_url'):
            continue
        key = news_key(item.get('title', ''))
        published = datetime.fromtimestamp(item['date'], timezone.utc).date().isoformat()
        if not key or published > REVIEW_DATE:
            continue
        if key == 'release-1.6':
            raise RuntimeError('A 1.6 release announcement now exists; this reviewed snapshot must be reconsidered.')
        candidates.setdefault(key, []).append(item)

    def verify(pair: tuple[str, list[dict]]) -> tuple[str, dict | None, str | None]:
        key, items = pair
        # Prefer the full changelog over a short live announcement, but never guess a URL.
        items.sort(key=lambda item: ('full changelog' not in item['title'].lower(), -item['date']))
        for item in items:
            url = item['url'].replace('http://', 'https://', 1)
            if urlsplit(url).hostname not in {'steamcommunity.com', 'store.steampowered.com'}:
                continue
            try:
                final_url, body = get_bytes(url)
                if urlsplit(final_url).hostname not in {'steamcommunity.com', 'store.steampowered.com'}:
                    continue
                text = html.unescape(re.sub(r'<[^>]+>', ' ', body.decode('utf-8', errors='replace')))
                normal = lambda value: re.sub(r'\W+', '', html.unescape(value)).lower()
                if normal(item['title']) not in normal(text):
                    continue
                if len(item.get('contents', '')) < 100:
                    continue
                return key, {'url': final_url, 'title': item['title'], 'published_at': datetime.fromtimestamp(item['date'], timezone.utc).date().isoformat()}, None
            except Exception:
                continue
        return key, None, 'No accessible, title-matched publisher permalink for ' + key

    found = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        for key, value, warning in pool.map(verify, candidates.items()):
            if value:
                found[key] = value
            if warning:
                warnings.append(warning)
    return found, warnings


def add_evidence(issue: dict, slug: str, detail: str) -> None:
    date, title = RECENT[slug]
    url = BLOG + slug
    if not any(event['date'] == date and event['event'] == title for event in issue['timeline']):
        issue['timeline'].append({'date': date, 'event': title, 'detail': detail})
    if not any(source['url'] == url for source in issue['sources']):
        issue['sources'].append({'type': 'patch notes' if slug.startswith('hllv-') else 'official update', 'publisher': 'Hell Let Loose', 'date': date, 'title': title, 'url': url, 'claim': detail})
    issue['last_updated'] = max(issue['last_updated'], date)


def main() -> None:
    raw = DATA.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if blob != BASE_BLOB:
        print('One-time migration skipped: the original snapshot is no longer current.')
        return
    old = json.loads(raw)
    data = copy.deepcopy(old)
    assert len(data['issues']) == 66
    issues = {issue['id']: issue for issue in data['issues']}
    assert len(issues) == 66
    changes = {
        'HLLV-003': {
            'bottom_line': 'Hotfix 1.5.2 shipped additional crash fixes. October 1 developer data showed an early reduction; longer monitoring continues across platforms.',
            'official_position': 'The October 1 update reports substantially fewer crashes in an initial monitoring period, with no immediately obvious AMD-specific pattern in that limited data. The developers explicitly continue investigating remaining causes; this is not proof that every crash is fixed.',
            'scope': ['PC', 'PS5', 'Xbox', 'client stability', 'multiple hardware configurations'],
        },
        'HLLV-006': {
            'bottom_line': 'Console resolution and draw-distance improvements are being tested for Update 2.0 and beyond; no complete visual-quality fix is confirmed.',
            'workaround': 'The game outputs SDR. Do not force HDR for SDR games; on PS5, the developer recommends HDR On When Supported. This addresses presentation settings, not foliage or draw-distance defects.',
            'official_position': 'The October 1 update distinguishes ongoing foliage fixes from console resolution and LOD-distance testing. Further console improvements are expected with Update 2.0 and beyond, subject to performance tradeoffs; these are not released fixes.',
        },
        'HLLV-008': {
            'status_key': 'partial', 'status_label': 'Specific fixes released; wider causes open',
            'bottom_line': 'Hotfix 1.5.2 addressed a long-session replication problem. Early operator feedback is encouraging, but this does not explain or resolve every server crash or disconnect.',
            'fix_short': '1.5.2 + earlier specific fixes',
            'official_position': 'September 29 fixes targeted Iris replication degradation during longer server sessions. On October 1, developers reported encouraging early feedback from several community-server owners, while declining to call the replication issue completely resolved. Disconnects, process crashes, hosting incidents and administrative restarts still require separate evidence.',
        },
        'HLLV-029': {
            'bottom_line': 'Hotfix 1.5.2 added safeguards against silent muting. Broader voice-channel failures remain open, with monitoring continuing in the October 1 update.',
            'official_position': 'The new safeguards target identified silent-muting edge cases. They do not establish that every historical failure to transmit or receive across all channels had that cause. Excessive voice volume is a separate open issue, HLLV-061.',
        },
        'HLLV-046': {
            'official_position': 'Hotfix 1.5.2 changed Iris replication for long-running servers. On October 1, contacted operators had not yet reported the same degradation returning, but the developers explicitly withheld full closure and continued tracking Mortar and deployable visibility failures. The October 2 Tunnel report remains a player observation, not proof of a shared cause or regression.',
        },
        'HLLV-057': {
            'bottom_line': 'The nearby flat-tree defect was fixed in 1.5.2, but blurry foliage, pop-in and cover disappearing before players remain under review for 1.6 and later updates.',
            'official_position': 'The October 1 update describes ongoing reviews of detail-transition and culling distances, including incorrectly configured individual assets. The specific 2D-tree correction in HLLV-056 is released; wider visual-quality improvements are still being developed.',
        },
        'HLLV-058': {
            'bottom_line': 'Persistent-filter fixes are planned for Patch 1.6. The October 2 announcement targets the week of October 5; release has not been verified.',
            'official_position': 'The October 1 developer update says the filter correction is implemented for the forthcoming 1.6 patch. That wording is not a public release confirmation. The October 2 post supplies timing only.',
        },
        'HLLV-059': {
            'bottom_line': 'A search can return at most 200 sessions. Higher-population ordering is planned for 1.6, but that is not a confirmed fix for missing servers.',
            'official_position': 'The September 25 update identifies the per-search session limit and investigation into combining targeted searches. October 1 separately announces higher-population ordering for Patch 1.6. Neither announcement confirms that all servers will become discoverable.',
        },
        'HLLV-060': {
            'bottom_line': 'Frame Generation may need reapplying after a restart. A candidate fix targets 1.6; final verification and release remain unconfirmed.',
            'official_position': 'September 25 evidence describes a candidate awaiting final QA. The October 2 VLOG announcement places Patch 1.6 in the week of October 5, but does not independently confirm this particular fix shipped.',
        },
        'HLLV-061': {
            'official_position': 'On October 1 the developers targeted Patch 1.7 for the voice-volume correction, with an earlier release possible. No released correction was verified in this review. The October 1-2 player replies are separate evidence that file verification did not help those reporters.',
        },
        'HLLV-062': {
            'bottom_line': 'A boat with its engine running cannot be used as a spawn point. Automatic shutdown is being considered; no release date is confirmed.',
            'official_position': 'The October 1 update identifies abandoned running engines as a spawn-usability problem. Shutdown on exit or after an idle period are proposals being tested, not shipped features and not evidence of a replication failure.',
            'workaround': 'Switch the transport boat engine off before leaving it so it can be used as a spawn point. This does not resolve unrelated ghost-boat or replication failures.',
        },
        'HLLV-063': {
            'bottom_line': 'Patch 1.6 is planned to show Vote Kick notifications by default and give players 30 seconds to respond. These changes are not yet verified as released.',
            'official_position': 'The October 1 update announces the notification and 30-second response changes for 1.6. Its two descriptions of the previous timeout disagree, so only the new target is recorded. October 2 scheduling is not a release confirmation.',
        },
    }
    for issue_id, fields in changes.items():
        issues[issue_id].update(fields)
        issues[issue_id]['last_reviewed'] = REVIEW_DATE
    add_evidence(issues['HLLV-008'], 'hllv-hotfix-1-5-2', 'Specific Iris replication fixes shipped for long-session server degradation; unrelated crash and disconnect causes remain separate.')
    add_evidence(issues['HLLV-008'], 'community-update-6', 'Early community-server feedback is encouraging, but developers continue monitoring and do not declare complete resolution.')
    for issue_id in ['HLLV-054', 'HLLV-055', 'HLLV-056', 'HLLV-034', 'HLLV-064']:
        issues[issue_id]['last_reviewed'] = REVIEW_DATE
    data['generated_at'] = REVIEW_DATE
    data['latest_change'] = {
        'date': REVIEW_DATE,
        'label': 'October 5 review · 1.6 still upcoming',
        'url': BLOG + 'community-update-6',
        'summary': 'Latest verified release: Hotfix 1.5.2. Patch 1.6 is expected in the week of October 5; no release confirmation was found. Server, voice and visual-quality evidence reviewed.'
    }
    data['review_notes'] = ('October 5 review: rechecked the official Steam announcements through the October 2 VLOG notice, September 29 Hotfix 1.5.2 and October 1 Community Feedback #6. Clarified stale server-family wording, current mitigations and planned-versus-released changes. No new gameplay fix or independent gameplay verification was established. Individual evidence dates and prior player reports remain unchanged unless newer evidence was added. This pass did not revalidate every historical player report. A review date is not proof an old bug persists. Equivalent source permalinks are changed only when their publisher title and accessibility are verified. Prior review: ' + old.get('review_notes', ''))
    links, warnings = verified_permalinks()
    repaired = []
    for issue in data['issues']:
        for source in issue['sources']:
            key = source_key(source)
            if key in links and source['url'] != links[key]['url']:
                old_url = source['url']
                source['original_url'] = old_url
                source['url'] = links[key]['url']
                source['link_checked_at'] = REVIEW_DATE
                source['source_published_at'] = links[key]['published_at']
                repaired.append({'issue': issue['id'], 'from': old_url, 'to': source['url']})
    if 'community-6' in links:
        data['latest_change']['url'] = links['community-6']['url']
    data['source_link_review'] = {'date': REVIEW_DATE, 'repaired_references': len(repaired), 'verified_equivalents': links, 'warnings': warnings}
    # Invariants: preserve IDs, evidence, histories, incidents, and all future-fix states.
    assert [i['id'] for i in old['issues']] == [i['id'] for i in data['issues']]
    assert data['incidents'] == old['incidents']
    allowed_status_changes = {'HLLV-008'}
    for before, after in zip(old['issues'], data['issues']):
        if before['id'] not in allowed_status_changes:
            assert before['status_key'] == after['status_key']
        assert after['timeline'][:len(before['timeline'])] == before['timeline']
        assert after['known'] == before['known'] and after['unknown'] == before['unknown']
        assert len(after['sources']) >= len(before['sources'])
        for a, b in zip(before['sources'], after['sources']):
            for key, value in a.items():
                if key != 'url':
                    assert b[key] == value, (before['id'], key)
        for source in after['sources']:
            assert urlsplit(source['url']).scheme == 'https'
    assert all(issues[i]['status_key'] != 'shipped' for i in ['HLLV-058', 'HLLV-059', 'HLLV-060', 'HLLV-061', 'HLLV-063'])
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    assert json.loads(rendered) == data
    DATA.write_text(rendered, encoding='utf-8')
    count = len(data['issues'])
    records = sum(len(i['sources']) for i in data['issues'])
    unique = len({s['url'] for i in data['issues'] for s in i['sources']})
    readme = README.read_text(encoding='utf-8')
    readme = re.sub(r'The current tracker contains \d+ issue dossiers and \d+ source records\.', f'The current tracker contains {count} issue dossiers, {records} issue-linked source records and {unique} distinct source URLs (reviewed {REVIEW_DATE}).', readme)
    readme += ('\n## Deployment and evidence refresh\n\nThe existing Render static site is `hllv-bug-track`, service `srv-dac8c36k1f9s73dfq2cg`, in the approved My Workspace. It auto-deploys `feature/hllv-bug-evidence-tracker` from `hllv_tracker` with no build step. Do not create another service or change sibling Daily Flyer deployments.\n\nThe site reads the committed `data/issues.json`; a reload or deployment does not research new reports. The October 5 maintenance workflow is a guarded one-time migration, not a schedule or an unattended evidence classifier. Original issue dates, player observations and uncertainty are retained. `generated_at` identifies the snapshot review; `last_updated` identifies the most recent recorded issue evidence.\n')
    README.write_text(readme, encoding='utf-8')
    report = {'reviewed_at': REVIEW_DATE, 'issues': count, 'source_records': records, 'distinct_source_urls': unique, 'updated_issue_summaries': list(changes), 'repaired_references': len(repaired), 'repaired_unique_urls': len({r['from'] for r in repaired}), 'verified_permalinks': links, 'warnings': warnings, 'checks': ['JSON roundtrip', '66 unique IDs retained', 'all original timeline entries retained', 'known and unknown statements retained', 'incidents unchanged', 'all original source claims retained', 'future fixes not marked shipped']}
    print(json.dumps(report, indent=2))
    summary_path = __import__('os').environ.get('GITHUB_STEP_SUMMARY')
    if summary_path:
        Path(summary_path).write_text('## October 5 HLLV review\n\n```json\n' + json.dumps(report, indent=2) + '\n```\n', encoding='utf-8')


if __name__ == '__main__':
    main()
