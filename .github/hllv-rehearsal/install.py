"""Add isolated moderator practice; preserve login, real workflow and game evidence."""
from pathlib import Path
import hashlib,json,re,subprocess
SRC=Path('.github/hllv-rehearsal');ROOT=Path('hllv_tracker')
def once(text,old,new):
 if text.count(old)!=1:raise RuntimeError('Integration point changed: '+old[:90])
 return text.replace(old,new,1)
def main():
 before=json.loads((ROOT/'data/issues.json').read_text());cfg=(ROOT/'suggestions-config.json').read_bytes()
 assert json.loads(cfg)['connection_mode']=='operator_only' and not json.loads(cfg)['enabled']
 path=Path('.github/hllv-pilot/suggestions.js');js=path.read_text()
 if 'function mountPractice(' not in js:
  js=once(js,"if(validOperatorConfig(configuration)&&!operatorRead(name))", "if(validOperatorConfig(configuration)&&!operatorRead(name)&&!(name==='hllv_rehearsal'&&profile?.role==='moderator'))")
  helper=""" function mountPractice(generation,serial){
  if(profile?.role!=='moderator'||!window.HLLVPractice)return;
  const host=document.createElement('div');host.id='privatePractice';el('sgContent').appendChild(host);
  HLLVPractice.mount({container:host,rpc,issues,isCurrent:()=>generation===epoch&&serial===loadSerial&&view==='review'&&profile?.role==='moderator'});
 }
"""
  js=once(js,' function fieldForm(s=null){',helper+' function fieldForm(s=null){')
  js=once(js,'Staff access is working. This setup view is read-only: no review decisions, edits, publication or voting can be sent from here.','Staff access is working. Real submissions stay read-only during setup. Your private practice below is separate and can never publish.')
  js=once(js,"Your moderator role does not grant developer-review authority.</p></div>'));return;}","Your moderator role does not grant developer-review authority.</p></div>'));mountPractice(generation,serial);return;}")
 path.write_text(js)
 module=(SRC/'practice.js').read_bytes();asset='assets/practice-'+hashlib.sha256(module).hexdigest()[:16]+'.js';(ROOT/asset).write_bytes(module)
 page=ROOT/'index.html';html=page.read_text()
 if 'id="practice-module"' not in html:
  html=once(html,'<script id="suggestions-module"','<script id="practice-module" src="./'+asset+'"></script>\n  <script id="suggestions-module"')
 else:
  html,n=re.subn(r'(<script id="practice-module"[^>]*src=")[^"]+',lambda m:m[1]+'./'+asset,html);assert n==1
 page.write_text(html)
 subprocess.run(['python3','.github/hllv-pilot/install.py'],check=True)
 manifest_path=ROOT/'deployment-manifest.json';manifest=json.loads(manifest_path.read_text());manifest['files'].append(asset);manifest['files']=list(dict.fromkeys(manifest['files']));manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
 after=json.loads((ROOT/'data/issues.json').read_text())
 assert {k:v for k,v in before.items() if k!='page_updated_at'}=={k:v for k,v in after.items() if k!='page_updated_at'}
 assert cfg==(ROOT/'suggestions-config.json').read_bytes()
 Path('suggestion_box/PRIVATE_PRACTICE.md').write_text((SRC/'README.md').read_text())
 print('PRIVATE_PRACTICE_INSTALLED: no login/account/pilot/evidence settings changed; '+asset)
if __name__=='__main__':main()
