"""Apply the October 20 editorial review; collection never decides game status."""
import copy
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('hllv_tracker')
REVIEW = '2026-10-20'
RELEASE = '2026-10-20-official-response-review'
BASE = 'b58d19d537fb3d2c7a6073982459f9ade3e63347'

def main():
    path = ROOT / 'data/issues.json'
    data = json.loads(path.read_text())
    if data.get('review_release') == RELEASE:
        print('Review already applied; dates unchanged.')
        return
    assert data['review_release'] == '2026-10-16-bug-evidence-review'
    assert len(data['issues']) == 83
    sources = json.loads((Path(__file__).parent / 'sources.json').read_text())
    issues = {i['id']: i for i in data['issues']}

    def update(key, fields, refs):
        issue = issues[key]
        issue.setdefault('editorial_history', []).append({
            'date': REVIEW, 'reason': 'Reviewed previously unavailable official Support replies.',
            'previous': {k: copy.deepcopy(issue.get(k)) for k in fields}})
        issue.update(fields)
        issue['last_reviewed'] = REVIEW
        for ref in refs:
            issue['sources'].append(ref)
            issue['timeline'].append({'date': ref['date'], 'event': ref['title'],
                                     'detail': ref['claim'], 'source_url': ref['url']})
        issue['timeline'].sort(key=lambda event: event['date'])
        issue['last_updated'] = max([issue['last_updated']] + [s['date'] for s in refs])

    update('HLLV-033', {
        'official_position': 'Two October 11 Support threads describe repeated tutorial prompts. Support acknowledges similar reports and escalation. These replies do not establish internal reproduction or a shared cause with every lost role unlock.',
        'known': issues['HLLV-033']['known'] + ['A second October 11 Support acknowledgement was reviewed on October 20; this is historical evidence, not a new October 20 incident.']
    }, [sources['tutorial']])
    update('HLLV-057', {
        'official_position': 'October 15 development plans remain unreleased in the reviewed sources. In a separate October 11 PC thread, Support requested diagnostics and suggested updating one player’s NVIDIA driver. No successful outcome or general rendering fix was established.',
        'unknown': issues['HLLV-057']['unknown'] + ['A driver suggestion for one PC is not proof that drivers explain the wider foliage issue.']
    }, [sources['foliage']])

    refs = [sources['qol']]
    data['issues'].append({
        'id': 'HLLV-084', 'title': 'Video settings reported not saving after restart',
        'category': 'settings', 'kind': 'settings persistence report',
        'status_key': 'reported', 'status_label': 'Mixed-thread Support acknowledgement',
        'bottom_line': 'An October 19 Support reply acknowledges a mixed report that includes video settings not saving. Specific reproduction and a fix remain unconfirmed.',
        'official_short': 'Support replied to mixed report', 'fix_short': 'None confirmed for this report',
        'cause_short': 'Not established', 'last_updated': '2026-10-19', 'last_reviewed': REVIEW,
        'scope': ['Video settings', 'Restart persistence'],
        'symptom': 'The opening post reports video settings not persisting after a game restart, without identifying particular settings or a platform.',
        'official_position': 'Support acknowledges similar reports and escalation collectively; it does not itemize which complaints were verified.',
        'workaround': None,
        'known': ['The same post also requests map and menu changes; the response is not a commitment to implement those requests.'],
        'unknown': ['Which settings and platforms are affected.', 'Whether this is related to the released EOS sign-in correction in HLLV-054 or the Frame Generation report in HLLV-060.', 'Internal reproduction, cause, workaround and release date.'],
        'timeline': [{'date': '2026-10-19', 'event': 'Support response to mixed report', 'detail': 'Acknowledgement and escalation, with no item-by-item finding.', 'source_url': refs[0]['url']}],
        'sources': refs
    })

    features_path = ROOT / 'data/features.json'
    features = json.loads(features_path.read_text())
    assert len(features['features']) == 14
    features['reviewed_at'] = REVIEW
    features['coverage_note'] = 'Selected topics from Community Feedback 6–8 and Patch 1.6. October 20 adds two publisher-tracked requests from the October 15 update; this is not a new announcement or a complete roadmap. Support replies do not establish feature commitments.'
    cf8 = next(s for s in features['sources'] if s['id'] == 'cf8')
    cf8['reviewed_at'] = REVIEW
    cf8['review_scope'] = 'Selected functionality statements, including Clan Tags and rank emblems. Re-read October 20; the publisher text hash is unchanged. Tracked requests are not confirmed development.'
    for key, title, term in [('HLLV-F015', 'Clan Tags', 'clan tags'), ('HLLV-F016', 'Rank emblems', 'rank emblems')]:
        features['features'].append({
            'id': key, 'title': title, 'category': 'Community tools', 'kind': 'new_option',
            'current': {'availability': 'not_confirmed_live', 'summary': 'The reviewed statement does not establish availability.', 'source_ids': []},
            'status': 'under_consideration',
            'change': f'{title} are named among community requests the publisher is tracking; development is not confirmed.',
            'target': 'No confirmed release', 'latest_source_id': 'cf8',
            'history': [{'source_id': 'cf8', 'status': 'under_consideration', 'summary': 'Publisher acknowledges the request without a delivery commitment.'}],
            'related_issue_ids': [], 'related_suggestions': [], 'monitor_terms': [term]
        })
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    report = {
        'date': REVIEW, 'review_release': RELEASE, 'base_commit': BASE, 'page_updated_at': now,
        'updated_issues': ['HLLV-033', 'HLLV-057'], 'new_issues': ['HLLV-084'],
        'new_features': ['HLLV-F015', 'HLLV-F016'], 'issue_count': 84, 'feature_count': 16,
        'latest_verified_release': {'title': 'Patch 1.6', 'date': '2026-10-07'},
        'latest_official_announcement': {'title': 'Community Feedback #8', 'date': '2026-10-15'},
        'latest_selected_staff_reply': '2026-10-19', 'independent_gameplay_testing': False,
        'source_review': 'Re-read current Steam announcement feed and Community Feedback #8; inspected six existing forum leads with exact staff IDs and current developer badges.',
        'limitations': ['No newer release announcement was returned by the publisher feed at review time.', 'Two October 11 replies are historical evidence recovered from previously unavailable threads.', 'The October 19 mixed-thread reply does not individually confirm its complaints or commit to its suggested features.', 'Three recent unacknowledged threads were excluded from new bug claims.', 'The existing unrelated-text editorial hold remains in place.', 'Daily tracked-thread coverage is complete at 33/33, but broader discovery remains partial; this review is not an all-forum audit.'],
        'excluded_without_official_reply': ['570426339809731198', '570426339809736161', '570426339809651925'],
        'source_refs': list(sources.values())
    }
    data.update(generated_at=REVIEW, page_updated_at=now, review_release=RELEASE)
    data['latest_change'] = {'date': REVIEW, 'label': 'October 20 evidence review', 'url': sources['qol']['url'], 'summary': 'One limited settings report added, two earlier Support replies incorporated, and two publisher-tracked feature requests added. No new release is confirmed.'}
    data['review_notes'] = 'October 20: reviewed official acknowledgements with their original dates; see review_history for claim limits. Previous review: ' + data['review_notes']
    data.setdefault('review_history', []).append(copy.deepcopy(report))
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    features_path.write_text(json.dumps(features, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'reviews' / (RELEASE + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['updated_issues', 'new_issues', 'new_features']}))

if __name__ == '__main__':
    main()
