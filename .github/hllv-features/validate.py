"""Validate reviewed records before publishing; never infer status from collected text."""
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
import json
import re

STATUSES = {'under_consideration', 'planned', 'in_development', 'testing', 'released', 'postponed', 'cancelled'}
HOSTS = {'www.hellletloose.com', 'hellletloose.com', 'steamcommunity.com', 'store.steampowered.com', 'steamstore-a.akamaihd.net'}

def validate(data, issues):
    assert data['schema_version'] == 1
    datetime.strptime(data['reviewed_at'], '%Y-%m-%d')
    datetime.strptime(data['coverage_from'], '%Y-%m-%d')
    sources = {s['id']: s for s in data['sources']}
    assert len(sources) == len(data['sources']) and sources
    announcement_ids = set()
    for s in sources.values():
        assert s['authority'] in {'official_publisher', 'verified_developer'}
        assert s['announcement_id'].isdigit() and s['announcement_id'] not in announcement_ids
        announcement_ids.add(s['announcement_id'])
        assert re.fullmatch(r'[a-f0-9]{64}', s['content_sha256'])
        for url in [s['url'], s['reviewed_via']]:
            u = urlsplit(url)
            assert u.scheme == 'https' and u.hostname in HOSTS and not u.username and not u.password and u.port in (None, 443)
        datetime.fromisoformat(s['published_at'].replace('Z', '+00:00'))
        assert s['published_at'][:10] <= s['reviewed_at'] <= data['reviewed_at']
        assert s['review_scope'] and s['publisher'] and s['title']
    ids = set()
    issue_ids = {i['id'] for i in issues}
    for f in data['features']:
        assert re.fullmatch(r'HLLV-F\d{3}', f['id']) and f['id'] not in ids
        ids.add(f['id'])
        assert f['status'] in STATUSES and f['current']['availability'] in {'live', 'not_confirmed_live'}
        assert all(f[k] for k in ['title', 'category', 'kind', 'change', 'target', 'monitor_terms'])
        assert f['current']['summary']
        if f['current']['availability'] == 'live':
            assert f['current']['source_ids'], 'Live behavior requires release evidence'
        assert set(f['current']['source_ids']) <= sources.keys()
        assert f['history'] and f['latest_source_id'] == f['history'][-1]['source_id']
        assert f['status'] == f['history'][-1]['status'], 'Latest status must match the reviewed event'
        last_date = ''
        for e in f['history']:
            assert e['source_id'] in sources and e['status'] in STATUSES and e['summary']
            at = sources[e['source_id']]['published_at']
            assert at >= last_date, 'History must preserve chronological order'
            last_date = at
        assert set(f['related_issue_ids']) <= issue_ids
        for term in f['monitor_terms']:
            assert isinstance(term, str) and 3 <= len(term) <= 100
        # Only a deliberately reviewed public title may be linked here. Never import
        # private submission wording, author IDs, emails, votes or conversations.
        for suggestion in f['related_suggestions']:
            assert set(suggestion) == {'title', 'reviewed_at', 'public_id'}
            assert suggestion['title'] and suggestion['public_id']
            datetime.strptime(suggestion['reviewed_at'], '%Y-%m-%d')
    return len(ids)

def main():
    root = Path('hllv_tracker/data')
    count = validate(json.loads((root/'features.json').read_text()), json.loads((root/'issues.json').read_text())['issues'])
    print(f'FEATURE_SCHEMA_OK: {count} reviewed records')

if __name__ == '__main__':
    main()
