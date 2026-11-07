"""Compile factual catch-up summaries against reviewed live feature snapshots."""
from pathlib import Path
from datetime import date
import hashlib
import json
import re

ROOT = Path('hllv_tracker')
HERE = Path(__file__).parent
ROLES = {'all', 'infantry', 'engineer', 'armour', 'boats', 'commander'}

def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def build(topics=None, features=None, issues=None, lock=None):
    topics = topics or json.loads((HERE/'topics.json').read_text())
    features = features or json.loads((ROOT/'data/features.json').read_text())
    issues = issues or json.loads((ROOT/'data/issues.json').read_text())
    lock = lock or json.loads((HERE/'review-lock.json').read_text())
    assert topics['schema_version'] == 2
    assert date.fromisoformat(topics['coverage_from']) <= date.fromisoformat(topics['coverage_through']) <= date.fromisoformat(topics['reviewed_at'])
    by_feature = {f['id']: f for f in features['features']}
    by_issue = {i['id']: i for i in issues['issues']}
    by_source = {s['id']: s for s in features['sources']}
    result = {k: v for k, v in topics.items() if k != 'topics'}
    result['topics'], used_sources, ids = [], set(), set()
    for topic in topics['topics']:
        assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', topic['id']) and topic['id'] not in ids
        ids.add(topic['id'])
        assert topic['roles'] and set(topic['roles']) <= ROLES
        assert 'guidance' not in topic, 'Catch Up contains factual changes, not tactical advice'
        assert all(topic[k] for k in ['title', 'area', 'overview', 'takeaway', 'context', 'caution', 'feature_ids', 'changes'])
        assert isinstance(topic['overview_order'], int) and topic['overview_order'] > 0
        item = dict(topic)
        item['baselines'] = []
        live_sources = set()
        for fid in topic['feature_ids']:
            f = by_feature[fid]
            assert f['current']['availability'] == 'live', f'{fid}: unreleased content cannot enter Catch Up'
            assert fingerprint(f['current']) == lock['features'][fid], f'{fid}: live behavior changed; review affected Catch Up guidance and its lock'
            item['baselines'].append({'id': fid, 'title': f['title'], 'summary': f['current']['summary']})
            live_sources.update(f['current']['source_ids'])
        item['changes'] = []
        for change in topic['changes']:
            sid = change['source_id']
            assert any(e['source_id'] == sid and e['status'] == 'released' for fid in topic['feature_ids'] for e in by_feature[fid]['history']), 'Changes require explicit release history'
            day = by_source[sid]['published_at'][:10]
            assert topics['coverage_from'] <= day <= topics['coverage_through']
            assert all(isinstance(change.get(k), str) and change[k].strip() for k in ['summary', 'before', 'after']), 'Each comparison requires sourced before and after descriptions'
            item['changes'].append({**change, 'date': day})
        used_sources.update(live_sources | {c['source_id'] for c in topic['changes']})
        item['source_ids'] = sorted(live_sources | {c['source_id'] for c in topic['changes']})
        item['issues'] = [{k: by_issue[i][k] for k in ['id', 'title', 'status_key', 'status_label', 'bottom_line', 'last_updated']} for i in topic['issue_ids']]
        result['topics'].append(item)
    result['sources'] = []
    for sid in sorted(used_sources):
        s = by_source[sid]
        assert s['authority'] in ['official_publisher', 'verified_developer']
        assert s['content_sha256'] == lock['sources'][sid], f'{sid}: source changed; re-review Catch Up'
        assert s['url'].startswith('https://')
        result['sources'].append(s)
    return result

def main():
    data = build()
    raw = (json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode()
    assets = []
    for body, prefix, extension in [(raw, 'data/catch-up.', '.json'), ((HERE/'app.js').read_bytes(), 'assets/catch-up-', '.js'), ((HERE/'catch-up.css').read_bytes(), 'assets/catch-up-', '.css')]:
        path = prefix + hashlib.sha256(body).hexdigest()[:16] + extension
        (ROOT/path).write_bytes(body)
        assets.append(path)
    markup = (ROOT/'index.html').read_text()
    tags = {
        'hllv-catch-up': '<script id="hllv-catch-up" src="./'+assets[1]+'" data-source="./'+assets[0]+'" defer></script>',
        'hllv-catch-up-style': '<link id="hllv-catch-up-style" rel="stylesheet" href="./'+assets[2]+'">'
    }
    for key, tag in tags.items():
        pattern = r'<script id="'+key+r'"[^>]*></script>' if key == 'hllv-catch-up' else r'<link id="'+key+r'"[^>]*>'
        if 'id="'+key+'"' in markup:
            markup, count = re.subn(pattern, lambda _: tag, markup)
            assert count == 1
        else:
            markup = markup.replace('</head>', tag+'\n</head>')
    (ROOT/'index.html').write_text(markup)
    p = ROOT/'deployment-manifest.json'
    manifest = json.loads(p.read_text())
    old = set(manifest.get('catch_up_assets', []))
    manifest['files'] = list(dict.fromkeys([f for f in manifest['files'] if f not in old and not f.startswith(('assets/catch-up-', 'data/catch-up.'))] + assets))
    manifest['catch_up_assets'] = assets
    p.write_text(json.dumps(manifest, indent=2)+'\n')
    print('CATCH_UP_PUBLISHED', len(data['topics']), 'reviewed topics', assets[0])

if __name__ == '__main__':
    main()
