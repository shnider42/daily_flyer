"""Deliberate UI integration. Auth modules and evidence claims remain unchanged."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,re,subprocess
ROOT=Path('hllv_tracker');HERE=Path(__file__).parent

def once(s,old,new):
    if s.count(old)!=1:raise RuntimeError('Changed integration point: '+old[:100])
    return s.replace(old,new,1)

def main():
    original=json.loads((ROOT/'data/issues.json').read_text());page=ROOT/'index.html';markup=page.read_text()
    if 'id="hllv-ux-preferences"' in markup:
        print('UX already installed; use an explicit source revision for further changes.');return
    subprocess.run(['python3','.github/hllv-community/refine.py'],check=True)
    auth_urls=re.findall(r'<script id="hllv-(?:session|password)-module"[^>]*src="([^"]+)"',markup)
    auth={u:(ROOT/u.removeprefix('./')).read_bytes() for u in auth_urls}
    cfg=(ROOT/'suggestions-config.json').read_bytes()
    app_path=Path('.github/hllv-community/app.js');app=app_path.read_text()
    app=app.replace('What should be better?','What could be better?').replace('What should happen next?','How would you like to handle this?')
    app=once(app,"query='',order='votes',queueState", "query='',order='votes',privateOrder='newest',queueState")
    app=once(app,"const result=await call(mode==='board'?'board':mode==='mine'?'mine':'queue',{page,query,order,state:mode==='queue'?queueState:'all'});", "const result=await call(mode==='board'?'board':mode==='mine'?'mine':'queue',{page,query,order:mode==='board'?order:privateOrder,state:mode==='queue'?queueState:'all'});")
    app=once(app,"<option value=\"newest\" '+(order==='newest'?'selected':'')+'>Newest</option>","<option value=\"newest\" '+(order==='newest'?'selected':'')+'>Newest first</option><option value=\"oldest\" '+(order==='oldest'?'selected':'')+'>Oldest first</option>")
    app=once(app,"+search+'<div class=\"cb-list\">'", "+search+(mode!=='board'?'<label class=\"date-order\">Updated <select id=\"cbDateSort\"><option value=\"newest\" '+(privateOrder==='newest'?'selected':'')+'>Newest first</option><option value=\"oldest\" '+(privateOrder==='oldest'?'selected':'')+'>Oldest first</option></select></label>':'')+'<div class=\"cb-list\">'")
    app=once(app,"   if(el('cbOrder'))", "   if(el('cbDateSort'))el('cbDateSort').onchange=e=>{privateOrder=e.target.value;page=0;paint();};\n   if(el('cbOrder'))")
    app=app.replace("(s.kind==='bug_priority'?'Bug priority':'Suggestion')", "HLLVSubmissionTypes.get(s.kind).name")
    app=once(app,"<summary>Read the suggestion</summary><p><strong>Proposed improvement</strong>","<summary>Read details</summary><p><strong>'+esc(HLLVSubmissionTypes.get(s.kind).outcomeHeading)+'</strong>")
    app=once(app,"<span>'+tag(s)+'<strong>","<span>'+tag(s)+'<span class=\"cb-type\">'+esc(HLLVSubmissionTypes.get(s.kind).name)+'</span><strong>")
    start=app.index("<label for=\"cbTitle\">Give it a clear title")
    end=app.index("<label class=\"sg-check\">",start)
    fields="""<label for="cbTitle"><span id="cbTitleLabel">Give your idea a clear title</span><input id="cbTitle" name="title" minlength="8" maxlength="120" required value="'+esc(s?.title||'')+'"></label><div class="cb-form-pair"><label for="cbKind">Type<select name="kind" id="cbKind">'+Object.entries(HLLVSubmissionTypes.types).map(([key,t])=>'<option value="'+key+'" '+((s?.kind||'suggestion')===key?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label><label for="cbIssue"><span id="cbIssueLabel">Related tracked issue · optional</span><select id="cbIssue" name="related_issue"><option value="">No related issue</option>'+issues.map(i=>'<option value="'+esc(i.id)+'" '+(s?.related_issue===i.id?'selected':'')+'>'+esc(i.id+' · '+i.title)+'</option>').join('')+'</select></label></div><p id="cbTypeHelp" class="cb-type-help" role="status" aria-live="polite"></p><label for="cbProblem"><span id="cbProblemLabel">What could be better or added?</span><textarea id="cbProblem" name="problem" minlength="20" maxlength="1500" required rows="4">'+esc(s?.problem||'')+'</textarea></label><label for="cbOutcome"><span id="cbOutcomeLabel">What would you change or add?</span><textarea id="cbOutcome" name="desired_outcome" minlength="10" maxlength="1000" required rows="3">'+esc(s?.desired_outcome||'')+'</textarea></label>"""
    app=app[:start]+fields+app[end:]
    app=app.replace('Explain the problem and the change you would like. You don’t need to write a technical report.','Choose a type to guide your submission. Switching types keeps what you have already written.')
    app=once(app,"  el('cbCancel').onclick", "  HLLVSubmissionTypes.bind(el('cbSubmitForm'),{revision:!!s});\n  el('cbCancel').onclick")
    app=once(app,"'✓ Your suggestion is saved.'", "'✓ '+HLLVSubmissionTypes.get(s.kind).saved")
    app=once(app,"<h3>The problem</h3>","<h3>'+esc(HLLVSubmissionTypes.get(s.kind).problemHeading)+'</h3>")
    app=once(app,"<h3>The proposed change</h3>","<h3>'+esc(HLLVSubmissionTypes.get(s.kind).outcomeHeading)+'</h3>")
    app=once(app,"<summary>Activity history</summary>'+((s.history||[]).map", "<summary>Activity history</summary>'+HLLVDates.control('community-history','Activity order')+HLLVDates.sorted(s.history||[],'at',HLLVDates.direction('community-history')).map")
    app=once(app,".join('')||'<p>No activity recorded.</p>')", ".join('')")
    app=app.replace("h=>'<p>'+esc(h.action", "h=>'<p data-event-date=\"'+esc(h.at)+'\">'+esc(h.action")
    app=once(app," async function show(currentIssues=[])", " document.addEventListener('hllv-date-order',e=>{if(e.detail!=='community-history')return;const nodes=[...document.querySelectorAll('.cb-history [data-event-date]')];HLLVDates.sorted(nodes.map(node=>({node,date:node.dataset.eventDate})),'date',HLLVDates.direction('community-history')).forEach(x=>x.node.parentNode.appendChild(x.node));});\n async function show(currentIssues=[])")
    app_path.write_text(app)
    refine=Path('.github/hllv-community/refine.py');s=refine.read_text();s=once(s,"p=Path('.github/hllv-community/app.js');s=p.read_text()", "p=Path('.github/hllv-community/app.js');s=p.read_text()\n    if 'HLLVSubmissionTypes.bind' in s:\n        print('Submission types v2 includes these refinements.');return")
    refine.write_text(s)
    section=Path('.github/hllv-community/section.html');s=section.read_text().replace('What should be better?','What could be better?').replace('Bring an idea. Back the ones that matter.','Share an idea or report a problem. Back the ones that matter.');section.write_text(s)
    a=markup.index('<section id="suggestionBox"');b=markup.index('\n</section>',a)+len('\n</section>');markup=markup[:a]+s.rstrip()+markup[b:]
    markup=once(markup,"function timeline(i){return `", "function timeline(i){i={...i,timeline:HLLVDates.sorted(i.timeline,'date',HLLVDates.direction('history'))};return HLLVDates.control('history','History order')+`")
    markup=once(markup,"function sources(i){if(window.HLLVEvidence)return HLLVEvidence.renderSources(i,dataset);return `", "function sources(i){i={...i,sources:HLLVDates.sorted(i.sources,'date',HLLVDates.direction('sources'))};const order=HLLVDates.control('sources','Source date order');if(window.HLLVEvidence)return order+HLLVEvidence.renderSources(i,dataset);return order+`")
    a=markup.index('function homeFiltered(){');b=markup.index('\n',a)
    markup=markup[:a]+markup[a:b].replace('.sort(recentFirst)',".sort((a,b)=>(HLLVDates.direction('browse')==='oldest'?-1:1)*recentFirst(a,b))")+markup[b:]
    markup=once(markup,'<div class="home-list" id="homeList">','<div id="browseDateOrder"></div><div class="home-list" id="homeList">')
    markup=once(markup,"function renderHome(){const issues", "function renderHome(){document.getElementById('browseDateOrder').innerHTML=HLLVDates.control('browse','Issue update order');const issues")
    hooks="""    document.addEventListener('hllv-date-order',e=>{
      if(e.detail==='browse'&&dataset)renderHome();
      if(['history','sources'].includes(e.detail)&&selectedId){renderDossier();document.querySelector('[data-date-order="'+e.detail+'"]')?.focus({preventScroll:true});}
      if(e.detail==='patches'){const box=document.querySelector('.patch-entries');if(box){const items=HLLVDates.sorted([...box.children].map(node=>({node,date:node.querySelector('time')?.dateTime})),'date',HLLVDates.direction('patches'));items.forEach(x=>box.appendChild(x.node));}}
    });
    document.getElementById('patchDateOrder').innerHTML=HLLVDates.control('patches','Release date order');
"""
    markup=once(markup,"    const AUTH_RETURN_TO_SUGGESTIONS",hooks+"    const AUTH_RETURN_TO_SUGGESTIONS")
    markup=once(markup,'<div class="patch-entries">','<div id="patchDateOrder"></div><div class="patch-entries">')
    markup=markup.replace(' · Newest first</p>',' · Newest first by default</p>')
    markup=markup.replace('<time class="event-date">','<time class="event-date" datetime="${esc(e.date)}">')
    markup=once(markup,'<nav class="top-links"','<button type="button" id="themeToggle" class="theme-toggle">Light mode</button><nav class="top-links"')
    files=[]
    def asset(path,prefix,suffix):
        data=path.read_bytes();name='assets/'+prefix+'-'+hashlib.sha256(data).hexdigest()[:16]+suffix;(ROOT/name).write_bytes(data);files.append(name);return './'+name
    prefs=asset(HERE/'preferences.js','preferences','.js');types=asset(HERE/'form-types.js','form-types','.js');css=asset(HERE/'theme.css','theme','.css');newapp=asset(app_path,'community','.js')
    markup=once(markup,'<html lang="en">','<html lang="en" data-theme="dark">')
    markup=once(markup,'  <meta charset="utf-8">','  <meta charset="utf-8">\n  <style>html[data-theme="dark"]{background:#161a1d;color-scheme:dark}</style>\n  <script id="hllv-ux-preferences" src="'+prefs+'"></script>')
    markup=once(markup,'</head>','<link id="hllv-theme" rel="stylesheet" href="'+css+'">\n</head>')
    markup,n=re.subn(r'(<script id="suggestions-module"[^>]*src=")[^"]+',lambda m:m[1]+newapp,markup);assert n==1
    markup=once(markup,'  <script id="suggestions-module"','  <script id="hllv-form-types" src="'+types+'"></script>\n  <script id="suggestions-module"')
    practice=Path('.github/hllv-rehearsal/practice.js');s=practice.read_text().replace('What should improve?','What could improve?')
    s=once(s,"<summary>Practice history</summary><div>'+row.history.map", "<summary>Practice history</summary>'+HLLVDates.control('practice-history','Practice history order')+'<div>'+HLLVDates.sorted(row.history,'at',HLLVDates.direction('practice-history')).map")
    s=s.replace("'<p>Version '+Number(h.version)","'<p data-event-date=\"'+esc(h.at)+'\">Version '+Number(h.version)")
    practice.write_text(s);url=asset(practice,'practice','.js');markup,n=re.subn(r'(<script id="practice-module"[^>]*src=")[^"]+',lambda m:m[1]+url,markup);assert n==1
    markup=once(markup,"    document.getElementById('patchDateOrder')", "    document.addEventListener('hllv-date-order',e=>{if(e.detail==='practice-history'){const items=[...document.querySelectorAll('#privatePractice [data-event-date]')];HLLVDates.sorted(items.map(node=>({node,date:node.dataset.eventDate})),'date',HLLVDates.direction('practice-history')).forEach(x=>x.node.parentNode.appendChild(x.node));}});\n    document.getElementById('patchDateOrder')")
    markup=once(markup,'<details><summary>About this date</summary>', '<span id="sourceHeaderStatus" class="source-header-status">Source check loading…</span><details><summary>About this date</summary>')
    feedjs=asset(HERE/'feed.js','official-feed','.js')
    markup=once(markup,'<div class="latest-change"', '      <section class="official-feed" id="officialSourceUpdates" aria-labelledby="sourceUpdatesHeading"><div class="feed-heading"><div><span class="section-kicker">Automatic source collection</span><h2 id="sourceUpdatesHeading">Latest official announcements</h2></div></div><p id="sourceSyncStatus" role="status">Checking source collection status…</p><div id="officialSourceList"></div></section>\n<div class="latest-change"')
    markup=once(markup,'  <script src="./freshness.js', '  <script id="hllv-source-feed" src="'+feedjs+'" defer></script>\n  <script src="./freshness.js')
    page.write_text(markup)
    original['page_updated_at']=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z');(ROOT/'data/issues.json').write_text(json.dumps(original,ensure_ascii=False,indent=2)+'\n')
    subprocess.run(['python3','.github/hllv-evidence/publish_assets.py'],check=True)
    for u,b in auth.items():assert (ROOT/u.removeprefix('./')).read_bytes()==b
    assert (ROOT/'suggestions-config.json').read_bytes()==cfg
    final=page.read_text();manifest=json.loads((ROOT/'deployment-manifest.json').read_text());manifest['files']=list(dict.fromkeys(manifest['files']+['suggestions-config.json']+[v.removeprefix('./') for v in re.findall(r'(?:href|src)="(\./[^"]+)"',final) if (ROOT/v.split('?')[0].removeprefix('./')).is_file()]))
    (ROOT/'deployment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (ROOT/'reviews/ux-2026-10-12.json').write_text(json.dumps({'page_updated_at':original['page_updated_at'],'changes':['type-guided suggestion form','community problem reports','newest-first date controls','default dark theme','separate nightly source collection'],'authentication_unchanged':True,'moderation_authority_unchanged':True,'reviewed_bug_evidence_unchanged':True,'base_release':'11b391b04748ce937be4a928cda60d0a53db0c86','nightly_does_not_renew_evidence_review':True},indent=2)+'\n')
    print('UX_READY: dynamic types; dates; dark theme; feed; Auth unchanged')
if __name__=='__main__':main()
