"""Install the community-moderated presentation; preserve Auth assets and evidence."""
import hashlib,json,re,subprocess
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('hllv_tracker');SRC=Path(__file__).parent

def main():
    page=ROOT/'index.html';old=page.read_text();data_path=ROOT/'data/issues.json';before=json.loads(data_path.read_text())
    protected={p:(ROOT/p).read_bytes() for p in ['evidence.js','suggestions-config.json']}
    auth_tags={tag:re.search(r'<script id="'+tag+r'"[^>]*src="([^"]+)"',old).group(1) for tag in ['hllv-session-module','hllv-password-module']}
    patch_section=old[old.index('<!-- PATCH NOTES START -->'):old.index('<!-- PATCH NOTES END -->')]
    start=old.index('<section id="suggestionBox"');end=old.index('\n</section>',start)+len('\n</section>')
    markup=old[:start]+(SRC/'section.html').read_text().rstrip()+old[end:]
    script=(SRC/'app.js').read_bytes();style=(SRC/'community.css').read_bytes()
    app='assets/community-'+hashlib.sha256(script).hexdigest()[:16]+'.js';css='assets/community-'+hashlib.sha256(style).hexdigest()[:16]+'.css'
    (ROOT/app).write_bytes(script);(ROOT/css).write_bytes(style)
    markup,n=re.subn(r'(<script id="suggestions-module"[^>]*src=")[^"]+',lambda m:m[1]+'./'+app,markup);assert n==1
    if 'id="community-style"' in markup:
        markup,n=re.subn(r'(<link id="community-style"[^>]*href=")[^"]+',lambda m:m[1]+'./'+css,markup);assert n==1
    else:markup=markup.replace('</head>','<link id="community-style" rel="stylesheet" href="./'+css+'">\n</head>',1)
    cfg=json.loads(protected['suggestions-config.json']);cfg.update(connection_mode='community',community_enabled=True,enabled=True,policy_version='community-v1',account_registration='invite_only',approval_mode='site_moderator')
    (ROOT/'suggestions-config.json').write_text(json.dumps(cfg,indent=2)+'\n')
    page.write_text(markup)
    after={**before,'page_updated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')}
    data_path.write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n')
    subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    final=page.read_text();manifest=json.loads((ROOT/'deployment-manifest.json').read_text())
    files=manifest['files']+['suggestions-config.json']
    for value in re.findall(r'(?:src|href)="\./([^"]+)"',final):
        assert (ROOT/value.split('?')[0]).is_file(),value
        files.append(value)
    manifest['files']=list(dict.fromkeys(files));(ROOT/'deployment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for tag,url in auth_tags.items():assert re.search(r'<script id="'+tag+r'"[^>]*src="([^"]+)"',final).group(1)==url
    assert patch_section==final[final.index('<!-- PATCH NOTES START -->'):final.index('<!-- PATCH NOTES END -->')]
    assert (ROOT/'evidence.js').read_bytes()==protected['evidence.js']
    assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in json.loads(data_path.read_text()).items() if k!='page_updated_at'}
    assert 'verified reviewer clearance of the exact wording' not in final[start:final.index('\n</section>',start)]
    (ROOT/'reviews/community-moderation-release.json').write_text(json.dumps({'page_updated_at':after['page_updated_at'],'authority':'site_moderation_only','developer_review_required':False,'public_reads':True,'verified_account_writes':True,'self_registration_added':False,'existing_auth_assets_unchanged':True,'game_evidence_unchanged':True,'practice_preserved':True,'source':'.github/hllv-community/'},indent=2)+'\n')
    Path('suggestion_box/COMMUNITY_BOARD.md').write_text((SRC/'README.md').read_text())
    print('COMMUNITY_PRESENTATION_READY',app,css,'Auth modules and game evidence unchanged')
if __name__=='__main__':main()
