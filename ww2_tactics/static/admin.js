'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 let player=null,authorized=false,offset=0,sequence=0,pending=null;
 try{player=JSON.parse(localStorage.getItem('ww2-commander'));}catch{}
 const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
 const date=value=>new Date(value*1000).toLocaleString();
 function bytes(value){if(value<1024)return `${value} B`;const i=Math.min(3,Math.floor(Math.log(value)/Math.log(1024)));return `${(value/1024**i).toFixed(1)} ${['B','KB','MB','GB'][i]}`;}
 function message(value,error=false){$('message').textContent=value;$('message').classList.toggle('error',error);}
 async function api(path,body){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(player?.token?{'X-Commander-Token':player.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok){const error=new Error((data.error||'Request failed.')+(data.request_id?` Reference: ${data.request_id}`:''));error.status=response.status;if(response.status===401&&authorized){authorized=false;hideConsole();$('loginPanel').hidden=false;}throw error;}
  return data;
 }
 function hideConsole(){authorized=false;$('console').hidden=true;$('claimPanel').hidden=true;$('deniedPanel').hidden=true;}
 async function access(){
  hideConsole();$('loginPanel').hidden=!!player?.token;$('identity').hidden=!player?.token;
  if(!player?.token)return;
  try{
   const data=await api('/api/admin/access');$('adminName').textContent=`Commander ${data.name}`;
   if(data.admin){authorized=true;$('console').hidden=false;await refresh();}
   else if(data.can_claim){$('claimPanel').hidden=false;$('claimForm').hidden=!data.setup_enabled;$('claimHelp').textContent=data.setup_enabled?'Paste the one-time WW2_ADMIN_BOOTSTRAP_KEY configured on the server. After claiming access, remove that environment variable.':'Set WW2_ADMIN_BOOTSTRAP_KEY to a randomly generated secret of at least 32 characters on the server, restart or redeploy, then refresh this page.';}
   else $('deniedPanel').hidden=false;
  }catch(error){message(error.message,true);if(error.status===401){$('loginPanel').hidden=false;$('identity').hidden=true;}}
 }
 $('loginForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;message('');
  try{player=await api('/api/commander/login',{name:$('loginName').value.trim(),password:$('loginPassword').value});try{localStorage.setItem('ww2-commander',JSON.stringify(player));}catch{}await access();}
  catch(error){message(error.message,true);}finally{$('loginPassword').value='';button.disabled=false;}
 };
 $('signOut').onclick=async()=>{try{await api('/api/commander/logout',{});player=null;try{localStorage.removeItem('ww2-commander');}catch{}message('Signed out.');await access();}catch(error){message(error.message,true);}};
 $('claimForm').onsubmit=async event=>{event.preventDefault();event.submitter.disabled=true;try{await api('/api/admin/claim',{key:$('setupKey').value});message('Administrator access enabled. Remove the setup key from the server environment.');await access();}catch(error){message(error.message,true);}finally{$('setupKey').value='';event.submitter.disabled=false;}};
 function definition(parent,label,value){parent.append(text('dt',label),text('dd',value||'Not available'));}
 async function overview(){
  const d=await api('/api/admin/overview');if(!authorized)return;
  $('checkedAt').textContent=`Checked ${new Date().toLocaleTimeString()} · counters since this worker started ${date(d.diagnostics.since)}`;
  const dbBytes=Object.entries(d.storage.files).filter(([name])=>!name.endsWith('.jsonl')).reduce((n,[,v])=>n+v,0);
  $('metrics').replaceChildren(...[
   ['Current games',d.counts.matches,`${d.counts.unfinished} unfinished · ${d.counts.solo} solo`],
   ['Database + journal',bytes(dbBytes),`${bytes(d.storage.reusable_bytes)} available for reuse`],
   ['Filesystem free',bytes(d.storage.disk_free),`${bytes(d.storage.disk_total)} total on database filesystem`],
   ['Server failures',d.diagnostics.failures,`${d.diagnostics.requests} requests · ${d.diagnostics.slow} over 1 second`]
  ].map(([title,value,hint])=>{const el=text('div','', 'metric');el.append(text('span',title),text('strong',value),text('small',hint));return el;}));
  $('environment').textContent=d.runtime.environment;$('deployment').replaceChildren();
  for(const [label,value] of [['Service',d.runtime.service||'Local process'],['Running commit',d.version.commit?`${d.version.commit}${d.version.dirty?' (local changes)': ''}`:'Unknown'],['Branch',d.version.branch],['Database',d.storage.path],['Runtime',`Python ${d.runtime.python} · SQLite ${d.runtime.sqlite} · ${d.storage.journal_mode} journal`],['Instance',d.runtime.instance||'This process'],['Retained data',`${d.counts.commanders} commanders · ${d.counts.admin_trash} removed games · ${d.counts.saves} solo checkpoints`]])definition($('deployment'),label,value);
  $('renderLink').hidden=d.runtime.environment!=='Render';$('renderLink').href=/^srv-[a-z0-9]+$/i.test(d.runtime.service_id||'')?`https://dashboard.render.com/web/${d.runtime.service_id}`:'https://dashboard.render.com';
  $('commitLink').href=/^[a-f0-9]{40}$/i.test(d.version.commit||'')?`https://github.com/shnider42/daily_flyer/commit/${d.version.commit}`:'https://github.com/shnider42/daily_flyer/commits/feat/ww2-tactics';
  const t=d.tests;
  $('testResult').textContent=t?`${t.success?'Passed':'Failed'} · ${t.tests_run} tests · ${t.failures} failures · ${t.errors} errors · ${t.skipped} skipped`:'No test report available.';
  $('testDetails').textContent=t?`${date(t.finished_at)} · ${t.duration_seconds}s · ${t.matches_version?'Matches the running commit.':'Does not certify this running version; compare commit and local changes.'} Report commit: ${t.commit||'unknown'}`:'Unknown is not a passing result. Generate a report for the exact commit being deployed.';
  $('failureCount').textContent=`${d.diagnostics.failures_recent.length} retained`;
  $('journalNotice').textContent=d.diagnostics.journal_writable?'':'Failure journal could not be written. In-memory entries are shown; check disk permissions and space in Render.';
  $('failures').replaceChildren(...d.diagnostics.failures_recent.map(f=>{
   const el=text('article','','event');el.append(text('strong',`${f.status} · ${f.method} ${f.route}`),text('p',`${date(f.at)} · ${f.duration_ms} ms${f.match?` · Match ${f.match}`:''}`,'muted'),text('p',`Reference ${f.request_id}`));
   if(f.error){const details=document.createElement('details');details.append(text('summary',`${f.error.type}${f.error.sqlite_code?` · ${f.error.sqlite_code}`:''}`),text('pre',f.error.frames.map(v=>`${v.file}:${v.line} — ${v.function}`).join('\n')));el.append(details);}return el;
  }));if(!$('failures').childElementCount)$('failures').append(text('p','No recorded server failures.','muted'));
 }
 async function matches(){
  const number=++sequence,trash=$('matchScope').value==='trash';
  const data=await api('/api/admin/matches?'+new URLSearchParams({q:$('matchSearch').value,offset:String(offset),trash:trash?'1':'0'}));if(number!==sequence||!authorized)return;
  $('matches').replaceChildren(...data.matches.map(m=>{
   const el=text('article','','match-row');el.dataset.code=m.code;
   const info=document.createElement('div');info.append(text('h3',m.name),text('span',trash?'Removed':m.winner?'Finished':m.ready?'In progress':'Waiting for opponent','badge'),text('span',m.ai_side?'Solo':'Multiplayer','badge'));
   info.append(text('p',`${m.host_name||'Original commander'} vs ${m.ai_side?'Computer':m.guest_name||'Original / open seat'}`),text('p',`${m.scenario} · Round ${m.round} · ${m.code} · Revision ${m.revision}`,'muted'),text('p',`${bytes(m.bytes)} state · Updated ${date(m.updated)}`,'muted'));
   const actions=text('div','','match-actions');
   for(const [action,label] of [['export','Download diagnostic'],...(trash?[['restore','Restore'],['purge','Delete permanently']]:[['rename','Rename'],['cancel_rematch','Clear proposal'],['remove','Remove']])]){
    const button=text('button',label,'quiet');button.type='button';button.dataset.action=action;
    button.onclick=()=>action==='export'?download(m,button):openAction(m,action);actions.append(button);
   }
   el.append(info,actions);return el;
  }));
  if(!data.matches.length)$('matches').append(text('p','No matches found.','muted'));
  $('matchCount').textContent=data.matches.length?`Showing ${offset+1}–${offset+data.matches.length}`:'0 matches';$('previousPage').disabled=offset===0;$('nextPage').disabled=!data.has_more;
 }
 async function audit(){const data=await api('/api/admin/audit');if(!authorized)return;$('audit').replaceChildren(...data.events.map(e=>{const el=text('div','','event');el.append(text('strong',`${e.action.replaceAll('_',' ')}${e.code?` · ${e.code}`:''}`),text('p',`${e.commander} · ${date(e.at)}${e.detail?` · ${e.detail}`:''}`,'muted'));return el;}));}
 async function refresh(){const results=await Promise.allSettled([overview(),matches(),audit()]);for(const result of results)if(result.status==='rejected')message(result.reason.message,true);}
 $('refreshAll').onclick=async()=>{$('refreshAll').disabled=true;message('');try{await refresh();}finally{$('refreshAll').disabled=false;}};
 function search(){offset=0;matches().catch(error=>message(error.message,true));}
 $('searchForm').onsubmit=e=>{e.preventDefault();search();};$('matchScope').onchange=search;
 $('previousPage').onclick=()=>{offset=Math.max(0,offset-50);matches().catch(error=>message(error.message,true));};$('nextPage').onclick=()=>{offset+=50;matches().catch(error=>message(error.message,true));};
 function openAction(match,action){
  pending={match,action};$('actionError').textContent='';$('confirmCode').value='';$('newName').value=match.name;
  const labels={rename:'Rename match',cancel_rematch:'Clear pending rematch proposal',remove:'Remove match from play',restore:'Restore match and original seats',purge:'Permanently delete match'};
  const warnings={rename:'The new name appears in the lobby for both players.',cancel_rematch:'This cancels only the proposal. Board positions, dice and progress are preserved.',remove:'Players will lose access while this match is removed. A recovery copy remains in Removed games. This does not free its storage.',restore:'Original players will be able to reconnect. The saved board and undo history are preserved.',purge:'This destroys the recovery copy and cannot be undone. Independent solo SAVE checkpoints remain usable. SQLite may reuse freed pages without shrinking the file.'};
  $('actionTitle').textContent=labels[action];$('actionSummary').textContent=`${match.name} · ${match.code} · Round ${match.round} · Revision ${match.revision}`;$('actionWarning').textContent=warnings[action];
  const confirm=['remove','restore','purge'].includes(action);$('confirmField').hidden=!confirm;$('confirmCode').required=confirm;$('nameField').hidden=action!=='rename';$('newName').required=action==='rename';$('submitAction').textContent=labels[action];$('submitAction').classList.toggle('danger',action==='purge'||action==='remove');$('actionDialog').showModal();
 }
 $('cancelAction').onclick=()=>$('actionDialog').close();
 $('actionForm').onsubmit=async event=>{
  event.preventDefault();if(!pending)return;const {match,action}=pending;$('submitAction').disabled=true;$('cancelAction').disabled=true;$('actionError').textContent='';
  try{await api(`/api/admin/matches/${match.code}`,{action,revision:match.revision,name:$('newName').value,confirm:$('confirmCode').value.trim().toUpperCase()});$('actionDialog').close();pending=null;message('Match updated.');await refresh();}
  catch(error){$('actionError').textContent=error.message;}
  finally{$('submitAction').disabled=false;$('cancelAction').disabled=false;}
 };
 async function download(match,button){
  if(!confirm('Download a diagnostic copy? It contains both armies, including hidden positions and full order history. Keep it private.'))return;
  button.disabled=true;try{const data=await api(`/api/admin/matches/${match.code}/export`),url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`dsl-${match.code}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);message('Diagnostic snapshot downloaded.');await audit();}catch(error){message(error.message,true);}finally{button.disabled=false;}
 }
 window.addEventListener('storage',event=>{if(event.key==='ww2-commander'){try{player=JSON.parse(event.newValue);}catch{player=null;}access();}});
 access();
})();
