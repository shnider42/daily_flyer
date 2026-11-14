(() => {
  'use strict';
  const API=['localhost','127.0.0.1'].includes(location.hostname)?'':'https://dfe-nfl-research.onrender.com';
  const clientId=globalThis.crypto?.randomUUID?.()||'';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'#';}catch{return '#';}};
  const starters=['Como funciona o impedimento?','Qual é a diferença entre Premier League e Champions League?','Como o Manchester City mudou nesta temporada?'];
  let turns=[],draft='',pending=false,error='',controller=null,requestId=0,depth='little',hide=false,mode=null,healthPromise=null;

  function cited(block){
    const chars=Array.from(String(block.text||'')),citations=[...(block.citations||[])].sort((a,b)=>a.start-b.start);
    let cursor=0,out='';
    for(const c of citations){
      if(!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<cursor||c.end>chars.length||c.end<=c.start)continue;
      const target=safeURL(c.url);
      if(target==='#')continue;
      out+=esc(chars.slice(cursor,c.start).join(''))+`<a class="inline-citation" href="${esc(target)}" target="_blank" rel="noopener noreferrer">${hide?'Fonte':esc(c.title||'Fonte')} ↗</a>`;
      cursor=c.end;
    }
    return out+esc(chars.slice(cursor).join(''));
  }
  function sourceMarkup(turn){
    if(hide)return '<p class="microcopy">Os títulos e trechos das fontes ficam ocultos porque podem revelar resultados. As páginas externas também podem conter spoilers.</p>';
    const sources=Array.isArray(turn.sources)?turn.sources:[];
    return `<details ${turn.mode==='references'?'open':''}><summary>${sources.length} ${turn.mode==='answer'?'fontes citadas':'referências encontradas'}</summary><div class="research-sources">${sources.map(s=>`<a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer"><small>${esc(s.publisher)}</small><strong>${esc(s.title)} ↗</strong>${s.excerpt?`<p>“${esc(s.excerpt)}”</p>`:''}</a>`).join('')||'<p>Nenhuma referência encontrada. Tente indicar o nome do time, jogador, campeonato ou regra.</p>'}</div>${turn.mode==='references'?`<p class="microcopy">Busca: ${esc(turn.query)}. Estes são trechos de fontes e podem ser incompletos ou irrelevantes; não são uma resposta verificada.</p>`:''}</details>`;
  }
  function thread(){
    return turns.map(t=>{
      const protectedAnswer=hide&&!t.hide_outcomes;
      return `<article class="research-answer"><span class="eyebrow">SUA PERGUNTA</span><h3>${esc(t.question)}</h3><div class="research-meta"><span>${t.mode==='answer'?'RESPOSTA COM FONTES':'BUSCA DE REFERÊNCIAS'}</span><time>${esc(new Date(t.checked_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hourCycle:'h23'}))} · Brasília</time></div>${protectedAnswer?'<p class="research-notice">Esta resposta foi solicitada com resultados visíveis. Desative a proteção para vê-la novamente.</p>':`${t.mode==='answer'?(t.blocks||[]).map(b=>`<div class="answer-prose" lang="pt-BR">${cited(b)}</div>`).join(''):`<p class="research-notice">${esc(t.notice)}</p>`}${sourceMarkup(t)}`}</article>`;
    }).join('');
  }
  function statusText(){
    return mode==='answer'?'Respostas com pesquisa disponíveis · cada pergunta consulta fontes atuais.':
      mode==='references'?'Busca de referências disponível · respostas escritas e verificação das premissas ainda não estão ativadas.':
      mode==='unsupported'?'A pesquisa de futebol ainda está sendo atualizada. Os guias abaixo já estão disponíveis.':
      mode==='unavailable'?'Não foi possível confirmar a disponibilidade da pesquisa. Você pode tentar enviar sua pergunta novamente.':
      'Verificando a disponibilidade da pesquisa…';
  }
  function markup(level,hidden){
    depth=level;hide=hidden===true;
    return `<section class="research-panel" aria-labelledby="soccer-ask-title"><div class="research-intro"><div><span class="eyebrow">FUTEBOL, SEM COMPLICAÇÃO</span><h2 id="soccer-ask-title">O que você quer entender?</h2><p>Regras, tática, história ou algo que aconteceu com seu time. Pergunte com suas palavras e continue a conversa.</p></div><span class="research-symbol" aria-hidden="true">?</span></div><p id="soccer-research-capability" class="research-notice" role="status">${statusText()}</p><div id="soccer-research-thread" aria-live="polite">${thread()}</div><form id="soccer-research-form"><label for="soccer-question">${turns.length?'Faça outra pergunta ou continue a conversa':'Sua pergunta sobre futebol'}</label><textarea id="soccer-question" name="question" rows="3" minlength="3" maxlength="500" required placeholder="Por que um jogador em posição de impedimento nem sempre comete uma infração?" ${pending?'disabled':''}>${esc(draft)}</textarea><div class="research-actions"><button class="primary-button" type="submit" ${pending||mode==='unsupported'?'disabled':''}>${pending?'Pesquisando…':mode==='references'?'Buscar referências ↗':'Pesquisar pergunta ↗'}</button>${pending?'<button class="secondary-button" type="button" data-soccer-research-cancel>Parar de esperar</button>':''}${turns.length?'<button class="text-button" type="button" data-soccer-research-clear>Nova conversa</button>':''}</div><p id="soccer-research-progress" role="status">${pending?'Consultando as fontes. A primeira solicitação pode levar cerca de um minuto.':''}</p><p id="soccer-research-error" role="alert">${esc(error)}</p></form><p class="microcopy">Ao enviar, sua pergunta e esta conversa vão para o serviço de pesquisa. Respostas escritas usam a pesquisa na web da OpenAI quando ativadas. A conversa fica nesta aba e é apagada ao recarregar. Proteção de resultados ${hide?'ativada':'desativada'}; fontes externas podem revelar placares.</p><div class="question-starters"><span class="eyebrow">ALGUMAS IDEIAS PARA COMEÇAR</span>${starters.map(q=>`<button type="button" data-soccer-research-draft="${esc(q)}">${esc(q)} ↗</button>`).join('')}</div></section>`;
  }
  function refresh(){const host=document.querySelector('.research-panel');if(host){host.outerHTML=markup(depth,hide);bind();}}
  async function checkHealth(){
    const healthController=new AbortController(),timer=setTimeout(()=>healthController.abort(),70000);
    try{
      const r=await fetch(API+'/healthz',{signal:healthController.signal});if(!r.ok)throw Error();
      const data=await r.json();
      mode=Array.isArray(data.sports)&&data.sports.includes('soccer')?(data.answers_enabled?'answer':'references'):'unsupported';
    }catch{mode='unavailable';}finally{clearTimeout(timer);}
  }
  async function bind(){
    const form=document.querySelector('#soccer-research-form');if(!form)return;
    form.onsubmit=submit;
    form.querySelector('textarea').oninput=e=>{draft=e.target.value;};
    document.querySelectorAll('[data-soccer-research-draft]').forEach(b=>b.onclick=()=>{draft=b.dataset.soccerResearchDraft;refresh();document.querySelector('#soccer-question')?.focus();});
    document.querySelector('[data-soccer-research-clear]')?.addEventListener('click',()=>{requestId++;controller?.abort();turns=[];draft='';pending=false;error='';refresh();});
    document.querySelector('[data-soccer-research-cancel]')?.addEventListener('click',()=>{requestId++;controller?.abort();pending=false;error='Você parou de esperar. O servidor ainda pode concluir a solicitação enviada.';refresh();});
    if(mode===null){healthPromise??=checkHealth();await healthPromise;}
    const status=document.querySelector('#soccer-research-capability');if(status)status.textContent=statusText();
    const button=document.querySelector('#soccer-research-form button[type=submit]');
    if(button&&!pending){button.textContent=mode==='references'?'Buscar referências ↗':'Pesquisar pergunta ↗';button.disabled=mode==='unsupported';}
  }
  async function submit(event){
    event.preventDefault();if(pending)return;
    const question=document.querySelector('#soccer-question').value.trim();if(question.length<3)return;
    if(turns.length>=3){error='Comece uma nova conversa para pesquisar mais perguntas.';refresh();return;}
    const requestedHide=hide;
    draft=question;pending=true;error='';const id=++requestId;
    controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);refresh();
    const history=turns.flatMap(t=>[{role:'user',content:t.question},{role:'assistant',content:t.mode==='answer'?(t.blocks||[]).map(b=>b.text).join('\n').slice(0,6000):'Apenas busca de referências; nenhuma resposta foi estabelecida.'}]);
    try{
      const response=await fetch(API+'/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,depth,hide_outcomes:requestedHide,history,client_id:clientId,locale:'pt-BR',sport:'soccer'}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'A pesquisa está indisponível. Tente novamente.');
      if(data.sport!=='soccer'||data.locale!=='pt-BR'||!['answer','references'].includes(data.mode))throw Error('A pesquisa de futebol ainda está sendo atualizada. Tente novamente em instantes.');
      if(id!==requestId)return;
      turns.push({...data,hide_outcomes:requestedHide});mode=data.mode;draft='';
    }catch(e){
      if(id!==requestId)return;
      error=e.name==='AbortError'?'A pesquisa demorou demais e nenhuma resposta foi recebida. Tente novamente.':e instanceof SyntaxError?'O serviço está iniciando ou indisponível. Tente novamente.':e instanceof TypeError?'Não foi possível conectar ao serviço de pesquisa. Tente novamente.':e.message;
    }finally{
      clearTimeout(timer);
      if(id===requestId){pending=false;refresh();document.querySelector('#soccer-research-thread')?.scrollIntoView({behavior:'smooth',block:'start'});}
    }
  }
  window.HuddleSoccerResearch={markup,bind,cited};
})();
