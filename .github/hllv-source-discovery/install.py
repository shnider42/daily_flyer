"""Small, guarded extension of the known collector. Generated assets after tests only."""
from pathlib import Path
import runpy,json
S=Path(__file__).parent

def main():
    collector=S.parent/'hllv-source-responses/collector.py';text=collector.read_text()
    if 'def collection_url(' not in text:
        needle='class Client:\n';assert text.count(needle)==1
        addition='''def collection_url(url):
    """Allow only the two HLLV forum indices in addition to existing thread URLs."""
    u=urlsplit(url)
    if re.fullmatch(r'/app/3079210/discussions/[01]/',u.path):
        if u.scheme!='https' or u.hostname!='steamcommunity.com' or u.username or u.password or u.port not in(None,443) or u.fragment:
            raise CoverageError('unsafe_destination')
        from urllib.parse import parse_qsl
        pairs=parse_qsl(u.query,keep_blank_values=True)
        if len({k for k,v in pairs})!=len(pairs):raise CoverageError('unsafe_query')
        for k,v in pairs:
            if k=='l' and v=='english':continue
            if k=='fp' and v.isdigit() and 1<=int(v)<=10:continue
            raise CoverageError('unsafe_query')
        return HOST+u.path
    return thread_url(url)

'''
        text=text.replace(needle,addition+needle,1)
        start=text.index('class Client:');end=text.index('\ndef targets(',start)
        text=text[:start]+text[start:end].replace('thread_url(','collection_url(')+text[end:]
        old='def collect(issues,previous,now,fetcher=None,registry=None):';assert old in text
        text=text.replace(old,'def collect(issues,previous,now,fetcher=None,registry=None,selected_targets=None):',1)
        old='    for target in targets(issues):';assert old in text
        text=text.replace(old,'    for target in (targets(issues) if selected_targets is None else selected_targets):\n        thread_url(target["url"])',1)
        old="found,at,past.get('baseline_at'))";assert old in text
        text=text.replace(old,"found,at,past.get('baseline_at') or previous.get('monitoring_started_at'))",1)
        collector.write_text(text)
    (S.parent/'hllv-source-responses/responses.js').write_text((S/'responses.js').read_text())
    runpy.run_path(str(S.parent/'hllv-source-responses/install.py'),run_name='__main__')
    nightly=S.parent/'hllv-ux-20261012/nightly.py';text=nightly.read_text()
    text=text.replace("module_path=Path(__file__).parent.parent/'hllv-source-responses/collector.py'","module_path=Path(__file__).parent.parent/'hllv-source-discovery/enrich.py'")
    assert "'hllv-source-discovery/enrich.py'" in text
    text=text.replace("if k!='threads'","if k not in ('threads','discovery','affiliate_monitor')")
    needle="    tmp=OUTPUT.with_suffix('.tmp');"
    if '# Bounded discovery is separate from existing-source coverage.' not in text:
        assert text.count(needle)==1
        text=text.replace(needle,"""    # Bounded discovery is separate from existing-source coverage.
    discovery=coverage.get('discovery',{})
    if discovery.get('state') not in ('window_checked',):
        out['warnings'].append('Discovery is partial or has a backlog; this does not invalidate the separate existing-source check.')
"""+needle,1)
    if 'def collect_responses(' not in text:
        old="""    module_path=Path(__file__).parent.parent/'hllv-source-discovery/enrich.py'
    spec=importlib.util.spec_from_file_location('hllv_source_responses',module_path)
    response_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(response_module)
    out['response_monitor']=response_module.collect(data['issues'],previous.get('response_monitor',{}),now)"""
        assert text.count(old)==1
        text=text.replace(old,"    out['response_monitor']=collect_responses(data['issues'],previous.get('response_monitor',{}),now)",1)
        helper="""def collect_responses(issues,previous,now):
    import importlib.util
    module_path=Path(__file__).parent.parent/'hllv-source-discovery/enrich.py'
    spec=importlib.util.spec_from_file_location('hllv_source_responses',module_path)
    response_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(response_module)
    return response_module.collect(issues,previous,now)

"""
        text=text.replace('def main():',helper+'def main():',1)
    nightly.write_text(text)
    tests=S.parent/'hllv-ux-20261012/test_feed.py';test=tests.read_text()
    if "patch.object(n,'collect_responses'" not in test:
        needle="patch.object(n,'fetch',side_effect=RuntimeError('offline')):n.main()"
        assert test.count(needle)==1
        test=test.replace(needle,"patch.object(n,'fetch',side_effect=RuntimeError('offline')), patch.object(n,'collect_responses',return_value={'schema_version':1,'state':'unavailable','threads':[]}):n.main()",1)
        tests.write_text(test)
    report=Path('hllv_tracker/reviews/source-responses.json');r=json.loads(report.read_text())
    r.update(scope='existing reviewed Steam threads and bounded forum discovery',new_thread_discovery=True,affiliate_channel_collection=False,affiliate_directory_checks=True)
    report.write_text(json.dumps(r,indent=2)+'\n')
    print('BOUNDED_DISCOVERY_INTEGRATED')
if __name__=='__main__':main()
