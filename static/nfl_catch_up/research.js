(() => {
  'use strict';
  const API=['localhost','127.0.0.1'].includes(location.hostname)?'': 'https://dfe-nfl-research.onrender.com';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url=u=>{try{const p=new URL(u);return p.protocol==='https:'?p.href:'#';}catch{return '#';}};
  let turns=[],draft='',pending=false,error='',controller=null,requestId=0,depth='little',hide=false,mode=null;
  function cited(block){
    const chars=Array.from(block.text),cs=[...(block.citations||[])].sort((a,b)=>a.start-b.start);let cursor=0,out='';
    for(const c of cs){if(c.start<cursor||c.end>chars.length)continue;out+=esc(chars.slice(cursor,c.start).join(''))+`<a class="inline-citation" href="${esc(url(c.url))}" target="_blank" rel="noopener noreferrer">${esc(c.title)} ↗</a>`;cursor=c.end;}
    return out+esc(chars.slice(cursor).join(''));
  }
  function thread(){
    return turns.map(t=>`<article class="research-answer"><span class="eyebrow">YOUR QUESTION</span><h3>${esc(t.question)}</h3><div class="research-meta"><span>${t.mode==='answer'?'SEARCHED & EXPLAINED':'LIVE REFERENCE SEARCH'}</span><time>${esc(new Date(t.checked_at).toLocaleString())}</time></div>${t.mode==='answer'?t.blocks.map(b=>`<div class="answer-prose">${cited(b)}</div>`).join(''):`<p class="research-notice">${esc(t.notice)}</p>`}<details ${t.mode==='references'?'open':''}><summary>${t.sources.length} ${t.mode==='answer'?'cited sources':'search matches'}</summary><div class="research-sources">${t.sources.map(s=>`<a href="${esc(url(s.url))}" target="_blank" rel="noopener noreferrer"><small>${esc(s.publisher)}</small><strong>${esc(s.title)} ↗</strong>${s.excerpt?`<p>“${esc(s.excerpt)}”</p>`:''}</a>`).join('')||'<p>No matching references were returned. Try naming the rule, player or team more explicitly.</p>'}</div>${t.mode==='references'?`<p class="microcopy">Search used: ${esc(t.query)}. Results can be incomplete or irrelevant. These are excerpts, not a verified answer.</p>`:''}</details></article>`).join('');
  }
  function markup(d,s){depth=d;hide=s;return `<section class="research-panel" aria-labelledby="ask-title"><div class="research-intro"><div><span class="eyebrow">NEW TO AMERICAN FOOTBALL / CURIOUS AT ANY LEVEL</span><h2 id="ask-title">Ask the question<br>in your head.</h2><p>Rules, history, strategy, or something you heard on Sunday. Use your own words. Keep asking until it makes sense.</p></div><span class="research-symbol" aria-hidden="true">?</span></div><p id="research-capability" class="research-notice" role="status">Checking research availability…</p><div id="research-thread" aria-live="polite">${thread()}</div><form id="research-form"><label for="football-question">${turns.length?'Ask a follow-up, or a different football question':'What would you like to understand?'}</label><textarea id="football-question" name="question" rows="3" minlength="3" maxlength="500" required placeholder="When did the NFL choose to have Super Bowls only indoors?" ${pending?'disabled':''}>${esc(draft)}</textarea><div class="research-actions"><button class="primary-button" type="submit" ${pending?'disabled':''}>${pending?'Researching…':mode==='references'?'Search current references ↗':'Research my question ↗'}</button>${pending?'<button class="secondary-button" type="button" data-research-cancel>Stop waiting</button>':''}${turns.length?'<button class="text-button" type="button" data-research-clear>New conversation</button>':''}</div><p id="research-progress" role="status">${pending?'Connecting to research sources. The first request can take about a minute.':''}</p><p id="research-error" role="alert">${esc(error)}</p></form><p class="microcopy">Submitting sends your question and this conversation to our research service; written answers use OpenAI web search when enabled. The thread stays in this tab and clears on reload. Outcome protection is ${hide?'on; reference search results may still contain spoilers':'off'}. Don’t include personal information.</p><div class="question-starters"><span class="eyebrow">A STARTING POINT, NOT A MENU</span>${['Why do teams punt on fourth down?','How is a Super Bowl host city chosen?','What changed in the NFL overtime rules?'].map(q=>`<button type="button" data-research-draft="${esc(q)}">${esc(q)} ↗</button>`).join('')}</div></section>`;}
  function refresh(){const host=document.querySelector('.research-panel');if(host){host.outerHTML=markup(depth,hide);bind();}}
  function capability(){const el=document.querySelector('#research-capability');if(el)el.textContent=mode==='answer'?'Live answers available · each question triggers a fresh web search':mode==='references'?'Live reference search available · written answers and premise checking are not enabled yet.':'Research availability could not be confirmed. Try submitting a question; the service may need a moment to wake.';}
  async function bind(){
    const form=document.querySelector('#research-form');if(!form)return;
    form.onsubmit=submit;
    form.querySelector('textarea').oninput=e=>{draft=e.target.value;};
    document.querySelectorAll('[data-research-draft]').forEach(b=>b.onclick=()=>{draft=b.dataset.researchDraft;refresh();document.querySelector('#football-question')?.focus();});
    document.querySelector('[data-research-clear]')?.addEventListener('click',()=>{requestId++;controller?.abort();turns=[];draft='';pending=false;error='';refresh();});
    document.querySelector('[data-research-cancel]')?.addEventListener('click',()=>{requestId++;controller?.abort();pending=false;error='Stopped waiting. The server may still finish the submitted request.';refresh();});
    if(mode===null){try{const r=await fetch(API+'/healthz',{signal:AbortSignal.timeout(70000)});if(!r.ok)throw Error();const d=await r.json();mode=d.answers_enabled?'answer':'references';}catch{mode='unavailable';}}
    capability();const button=document.querySelector('#research-form button[type=submit]');if(button&&!pending)button.textContent=mode==='references'?'Search current references ↗':'Research my question ↗';
  }
  async function submit(e){
    e.preventDefault();if(pending)return;const q=document.querySelector('#football-question').value.trim();if(q.length<3)return;
    if(turns.length>=3){error='Start a new conversation to research more questions.';refresh();return;}
    draft=q;pending=true;error='';const id=++requestId;controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);refresh();
    const history=turns.flatMap(t=>[{role:'user',content:t.question},{role:'assistant',content:t.mode==='answer'?t.blocks.map(b=>b.text).join('\n').slice(0,6000):'Reference search only; no answer was established.'}]);
    try{const r=await fetch(API+'/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,depth,hide_outcomes:hide,history}),signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Research is unavailable. Please retry.');if(id!==requestId)return;turns.push(data);mode=data.mode;draft='';}
    catch(e){if(id!==requestId)return;error=e.name==='AbortError'?'Research timed out. No answer was received. Please retry.':(e instanceof SyntaxError?'The research service is waking up or unavailable. Please retry.':e.message);}
    finally{clearTimeout(timer);if(id===requestId){pending=false;refresh();document.querySelector('#research-thread')?.scrollIntoView({behavior:'smooth',block:'start'});}}
  }
  window.HuddleResearch={markup,bind,draft(q){draft=q;},cited};
})();
