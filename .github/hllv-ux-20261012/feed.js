/* Automatically collected publisher posts are not reviewed bug-status changes. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password&&['steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net','www.hellletloose.com','hellletloose.com'].includes(x.hostname)?x.href:'';}catch(_){return '';}};
 const stamp=v=>{const d=new Date(v);return v&&Number.isFinite(+d)?d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not yet recorded';};
 let feed=null;
 function draw(){
  window.HLLVResponses?.render(feed?.response_monitor);
  window.HLLVFeatures?.receiveFeed(feed);
  const status=document.getElementById('sourceSyncStatus'),list=document.getElementById('officialSourceList');if(!status||!list||!feed)return;
  const old=!feed.last_success_at||Date.now()-Date.parse(feed.last_success_at)>36*3600000;
  status.textContent=(old?'Source collection is overdue. ':'')+'Last successful collection: '+stamp(feed.last_success_at)+'. '+(feed.state!=='ok'?'Some sources could not be checked; previous material is retained. ':'')+'Collected automatically—not a fresh review of bug or feature statuses.';
  status.dataset.stale=String(old||feed.state!=='ok');
  const header=document.getElementById('sourceHeaderStatus');if(header)header.textContent=(old?'Source check overdue · ':'Announcements checked · ')+stamp(feed.last_success_at);
  const posts=HLLVDates.sorted(feed.items||[],'published_at',HLLVDates.direction('announcements'));
  const entries=posts.slice(0,20).map(p=>'<details class="feed-entry"><summary><time datetime="'+esc(p.published_at)+'">'+esc(stamp(p.published_at))+'</time><strong>'+esc(p.title)+'</strong><span>'+esc(p.category)+' · Auto-collected</span></summary><div>'+(p.excerpt?'<p class="feed-excerpt">Publisher opening: “'+esc(p.excerpt)+'”</p>':'')+'<p>Follow the official source for full notes. This entry does not confirm that a fix shipped or worked.</p>'+(safe(p.url)?'<a href="'+esc(safe(p.url))+'" target="_blank" rel="noopener noreferrer">Read official announcement ↗</a>':'<span>Source link unavailable</span>')+(window.HLLVFeatures?.feedLinks(p)||'')+'</div></details>');
  list.innerHTML=HLLVDates.control('announcements','Announcement date order')+(entries.length?entries.slice(0,3).join('')+(entries.length>3?'<details class="feed-more"><summary>More official announcements ('+(entries.length-3)+')</summary>'+entries.slice(3).join('')+'</details>':''):'<p>No source collection is available yet. The reviewed patch summaries below are still available.</p>');
 }
 function decorate(){
  if(!feed)return;const root=document.getElementById('sources');if(!root)return;
  for(const row of root.querySelectorAll('.evidence-source')){
   const url=row.querySelector('.evidence-open')?.href,check=feed.link_checks?.[url];if(!check||row.querySelector('.nightly-link-check'))continue;
   const p=document.createElement('p');p.className='nightly-link-check';p.textContent='Nightly link check: '+stamp(check.checked_at)+' · '+(check.http_status===200?'reachable':check.http_status?'HTTP '+check.http_status:'unavailable')+'. Accessibility only—not claim verification.';row.appendChild(p);
  }
  const id=location.hash.slice(1);const candidates=(feed.items||[]).filter(x=>(x.candidate_issue_ids||[]).includes(id));
  if(candidates.length&&!root.querySelector('.feed-candidates')){const box=document.createElement('aside');box.className='feed-candidates';box.innerHTML='<strong>Recent official posts that may be relevant</strong><p>Automatic wording matches, not reviewed evidence for this issue.</p>'+HLLVDates.sorted(candidates,'published_at').slice(0,3).filter(p=>safe(p.url)).map(p=>'<p><a href="'+esc(safe(p.url))+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a> · '+esc(stamp(p.published_at))+'</p>').join('');root.appendChild(box);}
 }
 async function load(){try{const r=await fetch('./official-feed.json',{cache:'no-store'});if(!r.ok)throw Error('Feed unavailable');const d=await r.json();if(d.schema_version!==1||!Array.isArray(d.items))throw Error('Invalid feed');feed=d;draw();decorate();}catch(_){window.HLLVFeatures?.receiveFeed(null);window.HLLVResponses?.unavailable();const n=document.getElementById('sourceSyncStatus');if(n)n.textContent='Automatic source collection could not be loaded. The reviewed patch summaries remain available.';const h=document.getElementById('sourceHeaderStatus');if(h)h.textContent='Source check unavailable';}}
 document.addEventListener('hllv-features-ready',()=>{if(feed)draw();});
 document.addEventListener('hllv-date-order',e=>{if(e.detail==='announcements')draw();});
 document.addEventListener('DOMContentLoaded',()=>{load();const dossier=document.getElementById('dossier');if(dossier)new MutationObserver(decorate).observe(dossier,{childList:true,subtree:true});});
})();
