(() => {
  'use strict';
  if (window.HuddleSports?.redirecting) return;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const C = window.HuddleSoccer;
  let D;
  try { D = JSON.parse($('#soccer-data').textContent); }
  catch { $('#view').textContent = 'Não foi possível abrir esta edição. Recarregue a página ou consulte as fontes oficiais abaixo.'; return; }
  if (!C || !Array.isArray(D.teams) || !Array.isArray(D.games)) {
    $('#view').textContent = 'Esta edição não pôde ser carregada. Recarregue a página para tentar novamente.';
    return;
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = value => C.safeURL(value);
  const dateText = (value, long = false) => {
    const date = new Date(String(value).slice(0,10) + 'T12:00:00Z');
    return Number.isNaN(date.getTime()) ? 'Data a confirmar' : date.toLocaleDateString('pt-BR', {day:'2-digit', month:long?'long':'short', ...(long?{year:'numeric'}:{}),timeZone:'UTC'});
  };
  const timeText = value => C.formatKickoff(value);
  const dayOf = game => C.localDate(game.date);
  const teamMap = Object.fromEntries(D.teams.map(team => [team.id, team]));
  const teamName = id => teamMap[id]?.name || id;
  const teamShort = id => teamMap[id]?.short || teamName(id);
  const standings = D.standings || [];
  const leagueIds = new Set(standings.map(row => row.team));
  const clubs = D.teams.filter(team => leagueIds.size ? leagueIds.has(team.id) : team.league !== false).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  const sortedGames = [...D.games].sort((a,b) => a.date.localeCompare(b.date));
  const KEY = 'dfe-huddle-soccer-v1';
  let saved = {}, linked = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  try {
    if (location.hash.startsWith('#soccer=')) {
      const value = JSON.parse(decodeURIComponent(location.hash.slice(8)));
      if (value && typeof value === 'object' && !Array.isArray(value)) linked = {...value, spoilers:true};
    }
  } catch {}
  const params = new URLSearchParams(location.search);
  const explicitTeam = params.get('team');
  let state = C.normalize({...saved,...linked,locale:'pt-BR',...(explicitTeam && !linked.team ? {team:explicitTeam,teamFocus:explicitTeam,tab:'brief'} : {})},D);
  let openedGame = null, toastTimer, revealed = new Set();
  const names = {brief:'RESUMO',games:'JOGOS',teams:'CLUBES',league:'TABELA',learn:'ENTENDA'};
  function persist() { try { localStorage.setItem(KEY,JSON.stringify(state)); localStorage.setItem('dfe-huddle-sport-v1','soccer'); } catch {} }
  function notice(message) { $('#toast').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').textContent = ''; },4000); }
  function cleanEntryURL() {
    try { const u = new URL(location.href); ['team','lang','sport'].forEach(k => u.searchParams.delete(k)); history.replaceState(null,'',u.pathname + u.search + u.hash); } catch {}
  }
  function setState(changes, options = {}) {
    state = C.normalize({...state,...changes},D);
    persist(); render();
    if (options.focus) { $('#view').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}); }
    if (options.input) { const input = $(options.input); input?.focus(); if (input?.setSelectionRange) input.setSelectionRange(input.value.length,input.value.length); }
  }
  function isHidden(game) { return state.spoilers && !revealed.has(game.id); }
  function containsTeam(game,id) { return id === 'ALL' || game.home.team === id || game.away.team === id; }
  function gamesFor(id, since = null) { return sortedGames.filter(game => containsTeam(game,id) && (!since || dayOf(game) >= since)); }
  function latestFor(id) { return gamesFor(id).filter(game => game.completed).at(-1); }
  function nextFor(id) { return gamesFor(id).find(game => !game.completed); }
  function badge(id, size = '') {
    const team = teamMap[id];
    return `<span class="team-badge ${size}" aria-hidden="true"><span>${esc(id)}</span>${team?.logo && safeURL(team.logo) !== '#' ? `<img src="${esc(safeURL(team.logo))}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
  }
  function sourceLink(url, label, className = 'source-link') { return `<a class="${className}" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`; }
  function protectedPanel(title = 'Os resultados estão protegidos.', message = 'Placares, posição na tabela e sequência recente ficam ocultos até você decidir ver.') {
    return `<div class="protected-panel"><span aria-hidden="true">◉</span><h3>${esc(title)}</h3><p>${esc(message)}</p><button class="secondary-button" data-show-outcomes>Mostrar resultados</button></div>`;
  }
  function empty(title,message) { return `<div class="soccer-empty"><h3>${esc(title)}</h3><p>${esc(message)}</p></div>`; }
  function penaltyText(game) { return game.penalties ? `Pênaltis: ${game.penalties.home}–${game.penalties.away}` : ''; }
  function gameRead(game,id = state.team) {
    if (game.completed && isHidden(game)) return 'O resultado fica oculto até você abrir os detalhes e revelá-lo.';
    if (!game.completed) return 'Partida prevista nesta edição. A data e o horário podem mudar.';
    const read = C.gameRead(game,id,D);
    return typeof read === 'string' ? read : read?.text || 'Resultado confirmado na fonte indicada.';
  }
  function statusText(game) { return game.completed ? isHidden(game) ? 'Resultado oculto' : game.penalties ? 'Decidido nos pênaltis' : 'Encerrado' : 'Próximo jogo'; }
  function scoreboard(game) {
    const hide = game.completed && isHidden(game);
    return `<div class="soccer-scoreboard"><div class="club-side">${badge(game.home.team)}<strong>${esc(teamShort(game.home.team))}</strong><small>Mandante</small></div><strong class="soccer-score">${game.completed ? hide ? '—' : esc(game.home.score) : ''}<span>${game.completed?'×':'VS'}</span>${game.completed ? hide ? '—' : esc(game.away.score) : ''}</strong><div class="club-side">${badge(game.away.team)}<strong>${esc(teamShort(game.away.team))}</strong><small>Visitante</small></div></div>`;
  }
  function feature(game) {
    if (!game) return empty('Ainda não há uma partida neste recorte.','Abra a tabela para acompanhar o clube ou consulte o calendário oficial.');
    return `<article class="soccer-feature"><div class="soccer-match-top"><strong>${game.completed?'ÚLTIMO JOGO COBERTO':'PRÓXIMO JOGO COBERTO'}</strong><span>${esc(game.competition)} · ${dateText(dayOf(game))}</span></div>${scoreboard(game)}${game.penalties && !isHidden(game) ? `<p class="microcopy">${esc(penaltyText(game))}</p>` : ''}<div class="soccer-feature-foot"><p>${esc(gameRead(game))}</p><button class="text-button" data-game="${esc(game.id)}">Ver detalhes ↗</button></div></article>`;
  }
  function matchRow(game) {
    const hidden = game.completed && isHidden(game);
    const score = game.completed ? hidden ? '— × —' : `${game.home.score} × ${game.away.score}` : 'A jogar';
    return `<button class="soccer-match-row" data-game="${esc(game.id)}" aria-label="Ver ${esc(teamName(game.home.team))} contra ${esc(teamName(game.away.team))}, ${dateText(dayOf(game))}"><span class="match-date">${dateText(dayOf(game))}<small>${esc(game.competition)}</small></span><span class="row-clubs"><span class="row-club">${badge(game.home.team)}<span>${esc(teamShort(game.home.team))}</span></span><span class="row-club">${badge(game.away.team)}<span>${esc(teamShort(game.away.team))}</span></span></span><span class="row-result ${game.completed?'':'scheduled'}">${esc(score)}<small>${hidden?'Oculto':game.completed?game.penalties?esc(penaltyText(game)):'Encerrado':esc(timeText(game.date))}</small></span></button>`;
  }
  function scoreStrip() {
    const games = gamesFor(state.team).filter(game => game.completed).slice(-6).reverse();
    $('#score-strip').innerHTML = `<div class="strip-label"><span>APITO<br>FINAL</span><small>RECORTE COBERTO</small></div><div class="score-scroll">${games.length ? games.map(game => `<button class="strip-game" data-game="${esc(game.id)}" aria-label="Ver ${esc(teamName(game.home.team))} contra ${esc(teamName(game.away.team))}"><span class="strip-status">${dateText(dayOf(game))} · ${game.completed && isHidden(game)?'OCULTO':game.penalties?'PÊNALTIS':'FIM'}</span><span>${badge(game.home.team,'mini')}<b>${esc(game.home.team)}</b><strong>${isHidden(game)?'—':esc(game.home.score)}</strong></span><span>${badge(game.away.team,'mini')}<b>${esc(game.away.team)}</b><strong>${isHidden(game)?'—':esc(game.away.score)}</strong></span></button>`).join('') : '<p class="no-strip">Sem partidas deste clube no recorte. A tabela da liga está disponível.</p>'}</div><button class="strip-all" data-tab="games">Ver jogos <span aria-hidden="true">↗</span></button>`;
  }
  function formDots(form = []) { return `<div class="form-dots" aria-label="Resultados recentes, do mais antigo ao mais novo">${form.map(outcome => `<span class="${outcome.toLowerCase()}" title="${{W:'Vitória',D:'Empate',L:'Derrota'}[outcome] || 'Resultado'}">${{W:'V',D:'E',L:'D'}[outcome] || esc(outcome)}</span>`).join('')}</div>`; }
  function tableSummary(id) {
    const row = standings.find(entry => entry.team === id);
    if (!row) return empty('Tabela disponível na fonte.','Não há uma linha de classificação verificada para este clube nesta edição.');
    return `<section class="soccer-stat-panel"><span class="eyebrow">${esc(D.competition)} · ${esc(D.season)}</span><h2>${esc(teamShort(id))} na liga</h2>${state.spoilers ? protectedPanel('A posição também conta a história.','A classificação e a sequência recente estão ocultas.') : `<div class="soccer-stats"><div><strong>${row.rank}º</strong><span>posição</span></div><div><strong>${row.points}</strong><span>pontos</span></div><div><strong>${row.played}</strong><span>jogos</span></div></div>${formDots(row.form)}<p class="table-note">${row.w} vitórias · ${row.d} empates · ${row.l} derrotas${state.depth==='well'?`<br>${row.gf} gols pró · ${row.ga} gols contra · saldo ${row.gd>0?'+':''}${row.gd}`:''}</p><p class="microcopy">Tabela de ${dateText(D.standings_as_of || D.as_of)}. V = vitória · E = empate · D = derrota.</p>`}<button class="text-button" data-tab="league">Abrir a tabela completa ↗</button></section>`;
  }
  function nextMatch(id) {
    const game = nextFor(id);
    return `<section class="soccer-next"><span class="eyebrow">O QUE VEM AGORA</span><h2>Próximo jogo no recorte</h2>${game?`<div class="next-match">${badge(game.home.team)}<span>×</span>${badge(game.away.team)}</div><h3>${esc(teamShort(game.home.team))} × ${esc(teamShort(game.away.team))}</h3><p>${esc(timeText(game.date))}<br>${esc(game.competition)}${game.venue?`<br>${esc(game.venue)}`:''}</p><button class="text-button" data-game="${esc(game.id)}">Ver a partida ↗</button>`:'<p>O próximo compromisso deste clube não foi incluído nesta edição. Consulte o calendário oficial.</p>'}</section>`;
  }
  function storyList(id = state.team) {
    const stories = (D.stories || []).filter(story => story.date >= state.since && (id === 'ALL' || story.teams?.includes(id))).sort((a,b) => b.date.localeCompare(a.date));
    if (!stories.length) return empty('Sem histórias verificadas neste período.','A cobertura editorial começa pelo Manchester City. Amplie o período ou consulte as fontes para acompanhar outro clube.');
    return stories.map(story => {
      const hidden = story.spoiler && state.spoilers && !revealed.has(story.id);
      return `<article class="soccer-story"><div class="story-meta"><time>${dateText(story.date)}</time><span>${esc(story.publisher || 'Fonte oficial')}</span></div><h3>${esc(hidden ? story.safe_title || 'Uma história deste período' : story.title)}</h3>${hidden ? `<p>O título e o contexto ficam ocultos porque podem revelar o resultado de uma partida.</p><button class="text-button" data-reveal-story="${esc(story.id)}">Revelar esta história ↗</button>` : `<p>${esc(story.summary)}</p>${state.depth==='little' && story.context?`<div class="explanation"><b>PARA ENTENDER</b><p>${esc(story.context)}</p></div>`:''}${story.detail?`<details ${state.depth==='well'?'open':''}><summary>Mais contexto</summary><p>${esc(story.detail)}</p></details>`:''}${sourceLink(story.source,`${story.publisher || 'Fonte'} · ler o original`)}`}</article>`;
    }).join('');
  }
  function heading(kicker,title,description,id = null) { return `<div class="soccer-heading"><div><span class="eyebrow">${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${id ? badge(id) : `<span class="edition-badge">${esc(D.season)}</span>`}</div>`; }
  function coverageNote(id = state.team) {
    if (id !== 'MCI' && id !== 'ALL') return `<p class="soccer-coverage">A classificação inclui este clube. Histórias e calendário detalhado desta primeira edição têm foco no Manchester City; não representam toda a temporada de ${esc(teamName(id))}.</p>`;
    return `<p class="soccer-coverage">${esc(D.coverage_note || 'Primeira edição: contexto do Manchester City, um recorte de partidas verificadas e a tabela da Premier League. Não é um placar ao vivo.')}</p>`;
  }
  function brief() {
    const id = state.team, focus = id === 'ALL' ? 'MCI' : id;
    const recent = gamesFor(id,state.since).filter(game => game.completed).slice(-5).reverse();
    return `${heading(`FUTEBOL / ${D.competition}`,id==='ALL'?'Por dentro da Premier League':teamName(id),id==='ALL'?'A tabela da liga e as histórias verificadas desta edição.':`Seu resumo desde ${dateText(state.since)}: os jogos, o próximo compromisso e o contexto para voltar a acompanhar.`,id==='ALL'?null:id)}<div class="soccer-layout"><div class="soccer-main">${feature(latestFor(id) || nextFor(id))}<section class="soccer-section"><div class="section-heading"><div><span class="eyebrow">O QUE MUDOU</span><h2>Para ficar por dentro</h2></div><span>Desde ${dateText(state.since)}</span></div>${storyList()}</section><section class="soccer-section"><div class="section-heading"><h2>Jogos no seu período</h2><button class="text-button" data-tab="games">Ver jogos cobertos ↗</button></div><div class="soccer-results-list">${recent.length?recent.map(matchRow).join(''):empty('Sem partidas neste período.','Escolha uma data anterior ou abra os jogos para ver o recorte disponível.')}</div></section></div><aside class="soccer-side">${tableSummary(focus)}${nextMatch(id)}<section class="soccer-next"><span class="eyebrow">SEM COMPLICAÇÃO</span><h3>O futebol faz mais sentido com contexto.</h3><p>Pontos corridos, impedimento, copas e as competições que aparecem no calendário.</p><button class="text-button" data-tab="learn">Entenda o jogo ↗</button></section></aside></div>${coverageNote()}`;
  }
  function gamesView() {
    const search = (state.query || '').trim().toLocaleLowerCase('pt-BR');
    const matching = gamesFor(state.team).filter(game => (!search || [teamName(game.home.team),teamName(game.away.team),game.venue,game.competition].join(' ').toLocaleLowerCase('pt-BR').includes(search)) && (state.gameStatus==='all' || (state.gameStatus==='final' ? game.completed : !game.completed)));
    const final = matching.filter(game => game.completed).reverse(), future = matching.filter(game => !game.completed);
    return `${heading('CALENDÁRIO VERIFICADO','Jogos cobertos','Partidas recentes e próximos compromissos incluídos nesta edição. Use o clube e a busca para filtrar.')}
      <div class="soccer-toolbar"><div class="chip-row" role="group" aria-label="Situação das partidas">${[['all','Todos'],['final','Encerrados'],['scheduled','Próximos']].map(([key,label]) => `<button class="chip ${state.gameStatus===key?'active':''}" aria-pressed="${state.gameStatus===key}" data-status="${key}">${label}</button>`).join('')}</div><label class="search-box"><span aria-hidden="true">⌕</span><input id="game-search" type="search" placeholder="Clube, estádio ou competição" aria-label="Buscar partidas" value="${esc(state.query)}"></label></div><p class="subtle">${matching.length} partidas neste recorte${state.team==='ALL'?'':` · ${esc(teamName(state.team))}`} · Horários de Brasília. Esta aba mostra todas as datas disponíveis.</p>
      <div class="soccer-match-groups">${state.gameStatus!=='scheduled'?`<section><h2>Resultados</h2><div class="soccer-results-list">${final.length?final.map(matchRow).join(''):empty('Nenhum resultado neste filtro.','Isso não significa que o clube não jogou. A cobertura deste recorte é limitada.')}</div></section>`:''}${state.gameStatus!=='final'?`<section><h2>Próximos jogos</h2><div class="soccer-results-list">${future.length?future.map(matchRow).join(''):empty('Nenhuma partida futura neste filtro.','Consulte a agenda oficial para o calendário completo e eventuais alterações.')}</div></section>`:''}</div>${coverageNote()}`;
  }
  function teamsView() {
    const id = state.teamFocus || 'MCI';
    const recent = gamesFor(id).filter(game => game.completed).slice(-6).reverse();
    const source = teamMap[id]?.source || D.sources?.find(s => /tabela|classifica|premier/i.test(s.label))?.url || 'https://www.premierleague.com/en/clubs';
    return `${heading('PREMIER LEAGUE','Clubes','Escolha um clube para ver a posição na liga e as partidas disponíveis no recorte.')}
      <div class="soccer-clubs" role="group" aria-label="Escolha um clube">${clubs.map(team => `<button data-club="${esc(team.id)}" aria-pressed="${team.id===id}">${badge(team.id)}<span>${esc(team.name)}</span></button>`).join('')}</div>
      <section class="soccer-club-header">${badge(id)}<div><span class="eyebrow">CLUBE SELECIONADO</span><h2>${esc(teamName(id))}</h2>${sourceLink(source,'Fonte oficial')}</div><button class="secondary-button" data-follow="${esc(id)}">${state.team===id?'Ver meu resumo':'Acompanhar este clube'} ↗</button></section>
      <div class="soccer-layout"><div class="soccer-main"><section class="soccer-section"><div class="section-heading"><h2>Partidas disponíveis</h2></div><div class="soccer-results-list">${recent.length?recent.map(matchRow).join(''):empty('Sem partidas detalhadas nesta edição.','A tabela inclui o clube, mas este recorte de calendário começa pelo Manchester City.')}</div></section><section class="soccer-section"><div class="section-heading"><h2>Contexto do clube</h2></div>${storyList(id)}</section></div><aside class="soccer-side">${tableSummary(id)}${nextMatch(id)}</aside></div>${coverageNote(id)}`;
  }
  function leagueView() {
    const rows = [...standings].sort((a,b) => a.rank-b.rank);
    return `${heading(`${D.competition} / ${D.season}`,'Tabela da liga',`Classificação da fonte em ${dateText(D.standings_as_of || D.as_of,true)}. As partidas de copas não somam pontos aqui.`)}${state.spoilers?protectedPanel('A tabela pode revelar os resultados.','Posição, pontos, saldo e sequência recente ficam ocultos enquanto a proteção estiver ligada.'):
      rows.length?`<div class="soccer-table-wrap" tabindex="0" role="region" aria-label="Classificação da Premier League; role na horizontal para ver todas as colunas"><table class="soccer-table"><caption>${esc(D.competition)} · ${esc(D.season)} · ${dateText(D.standings_as_of || D.as_of)}</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Clube</th><th scope="col" title="Pontos">Pts</th><th scope="col" title="Jogos">J</th><th scope="col" title="Vitórias">V</th><th scope="col" title="Empates">E</th><th scope="col" title="Derrotas">D</th><th scope="col" title="Gols pró">GP</th><th scope="col" title="Gols contra">GC</th><th scope="col" title="Saldo de gols">SG</th><th scope="col">Últimos jogos</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.team===state.team?'followed':''}"><td>${row.rank}</td><td><button class="table-team" data-team-room="${esc(row.team)}">${badge(row.team)}<span>${esc(teamName(row.team))}</span></button></td><td class="points">${row.points}</td><td>${row.played}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gd>0?'+':''}${row.gd}</td><td>${formDots(row.form)}</td></tr>`).join('')}</tbody></table></div><p class="soccer-table-legend">Pts: pontos · J: jogos · V: vitórias · E: empates · D: derrotas · GP: gols pró · GC: gols contra · SG: saldo de gols. Na sequência recente: V = vitória, E = empate, D = derrota; da esquerda para a direita, do mais antigo ao mais novo.</p>${state.depth==='little'?'<div class="explanation"><b>COMO LER</b><p>Uma vitória vale 3 pontos; um empate, 1; uma derrota, 0. O saldo é a diferença entre gols marcados e sofridos. A tabela publicada pela fonte determina a ordem; ela não é calculada a partir deste recorte de partidas.</p></div>':''}`:empty('Classificação indisponível nesta edição.','Abra a fonte oficial para acompanhar a tabela atual.')}<p class="microcopy">A situação de vagas europeias, rebaixamento e desempates depende do regulamento aplicável. Este recorte não declara vagas garantidas nem títulos definidos.</p>${sourceLink(D.sources?.find(source=>/tabela|classifica/i.test(source.label))?.url || 'https://www.mancity.com/tables','Consultar a tabela na fonte oficial')}`;
  }
  function learnView() {
    return `${heading('ENTENDA O JOGO','Futebol, sem ficar perdido.','Uma base para acompanhar os resultados, as competições e as conversas sobre seu clube.')}${window.HuddleSoccerResearch?.markup ? window.HuddleSoccerResearch.markup(state.depth,state.spoilers) : ''}<section class="soccer-lessons" aria-label="Guia de futebol">${(D.lessons || []).map((lesson,index) => `<article class="soccer-lesson"><span class="eyebrow">${String(index+1).padStart(2,'0')} / GUIA RÁPIDO</span><h2>${esc(lesson.title)}</h2><p>${esc(lesson.body)}</p>${lesson.detail?`<details ${state.depth==='well'?'open':''}><summary>Um pouco mais de contexto</summary><p>${esc(lesson.detail)}</p></details>`:''}${lesson.source?sourceLink(lesson.source,'Consultar a fonte'):''}</article>`).join('')}</section>`;
  }
  function gameDetail(game) {
    const hide = game.completed && isHidden(game);
    let html = `<div class="game-detail-head"><span class="eyebrow">${esc(game.competition)} · ${esc(statusText(game))}</span><h2 id="game-dialog-title">${esc(teamName(game.home.team))} <span>×</span> ${esc(teamName(game.away.team))}</h2><p>${esc(timeText(game.date))}${game.venue?` · ${esc(game.venue)}`:''}</p></div>${scoreboard(game)}`;
    if (hide) return html + `<div class="protected-panel"><span aria-hidden="true">◉</span><h3>Este resultado está oculto.</h3><p>Revele apenas esta partida. Os demais resultados continuam protegidos.</p><button class="primary-button" data-reveal-game="${esc(game.id)}">Revelar esta partida</button></div>`;
    html += `<div class="game-read"><span class="status-pill">${esc(statusText(game))}</span><p>${esc(gameRead(game))}</p>${game.penalties?`<p>${esc(penaltyText(game))} (${esc(teamShort(game.home.team))} × ${esc(teamShort(game.away.team))}).</p>`:''}</div>`;
    if (state.depth === 'little') html += `<div class="explanation"><b>PARA ENTENDER</b><p>${game.penalties?'A disputa de pênaltis desempata uma partida eliminatória quando o regulamento prevê essa etapa. Os pênaltis são mostrados separadamente do placar do jogo.':game.competition === D.competition?'Na liga, uma vitória vale 3 pontos e um empate vale 1 para cada clube. O time da esquerda é o mandante; o da direita é o visitante.':'Cada competição tem sua própria tabela ou chave. Um resultado de copa não altera os pontos na Premier League.'}</p></div>`;
    html += `<p class="microcopy">${game.completed?'Este resumo descreve o placar verificado. Não inclui estatísticas de posse, chances ou escalações não confirmadas.':'Horários de Brasília (UTC−3). Consulte a fonte oficial perto da partida para confirmar alterações.'}</p><div class="detail-footer">${sourceLink(game.source,'Abrir a partida na fonte','secondary-button')}<span>Verificado em ${dateText(D.as_of)}. A fonte pode revelar outros resultados.</span></div>`;
    return html;
  }
  function openGame(id) {
    const game = D.games.find(entry => entry.id === id); if (!game) return;
    openedGame = id; $('#game-detail').innerHTML = gameDetail(game);
    if (!$('#game-dialog').open) $('#game-dialog').showModal();
  }
  function daysAgo(days) { return new Date(Date.parse(D.as_of+'T12:00:00Z') - days*86400000).toISOString().slice(0,10); }
  function periodDates() { return {'7':daysAgo(7),'14':daysAgo(14),'30':daysAgo(30),'season':D.season_start || `${D.as_of.slice(0,4)}-08-01`}; }
  function render() {
    document.documentElement.lang = 'pt-BR'; document.documentElement.dataset.theme = state.theme; document.documentElement.dataset.sport = 'soccer';
    document.title = `HUDDLE / ${state.team==='ALL'?'Futebol':teamName(state.team)} em português`;
    $('meta[name="theme-color"]').content = state.theme==='dark' ? '#090d16' : '#f1f3ef';
    $('#team').value = state.team; $('#spoilers').checked = state.spoilers; $('#since').value = state.since; $('#since').max = D.as_of; $('#since').min = D.season_start || `${D.as_of.slice(0,4)}-08-01`;
    const preset = Object.entries(periodDates()).find(([,date]) => date === state.since)?.[0];
    $('#period').value = preset || 'custom'; $('#custom-wrap').hidden = Boolean(preset);
    $('#theme-toggle').textContent = state.theme==='dark' ? '☾' : '☀';
    $('#theme-toggle').title = state.theme==='dark' ? 'Ativar modo claro' : 'Ativar modo escuro'; $('#theme-toggle').setAttribute('aria-label',$('#theme-toggle').title);
    $$('.depths button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.depth === state.depth)));
    $$('.main-nav button').forEach(button => { button.classList.toggle('active',button.dataset.tab===state.tab); button.setAttribute('aria-current',button.dataset.tab===state.tab?'page':'false'); });
    $('#breadcrumb-view').textContent = names[state.tab];
    $('#level-note').textContent = {little:'Começando: termos e regras explicados.',basics:'O básico: o que mudou e por quê.',well:'Acompanho: mais números e contexto.'}[state.depth];
    $('#coverage-line').textContent = `Edição de ${dateText(D.as_of)} · ${D.season}`;
    $('#edition-tag').textContent = `VERIFICADO EM ${dateText(D.as_of,true).toUpperCase()}`;
    $('#coverage-note').textContent = D.coverage_note;
    const age = Math.floor((Date.now()-Date.parse(D.as_of+'T23:59:59-03:00'))/86400000);
    $('#freshness').hidden = age < 2;
    if (age >= 2) $('#freshness').textContent = `Esta edição foi verificada em ${dateText(D.as_of,true)}. Novos jogos e alterações podem não estar incluídos. Consulte as fontes para as informações mais recentes.`;
    $('#source-links').innerHTML = (D.sources || []).map(source => sourceLink(source.url,source.label,'')).join('');
    scoreStrip();
    $('#view').innerHTML = ({brief,games:gamesView,teams:teamsView,league:leagueView,learn:learnView}[state.tab] || brief)();
    if (state.tab === 'learn') window.HuddleSoccerResearch?.bind?.();
    if (openedGame) { const game = D.games.find(entry => entry.id===openedGame); if (game) $('#game-detail').innerHTML = gameDetail(game); }
  }
  function share() {
    const u = new URL(location.href); u.search = ''; if (/\/v2\/?$/.test(u.pathname)) u.searchParams.set('product','huddle_soccer'); u.hash = 'soccer=' + encodeURIComponent(JSON.stringify({...C.shareState(state),locale:'pt-BR',spoilers:true,...(openedGame?{game:openedGame}:{})}));
    $('#share-url').value = u.href; $('#share-dialog').showModal(); $('#share-url').select();
  }
  clubs.forEach(team => { const option = document.createElement('option'); option.value = team.id; option.textContent = team.name; $('#team').append(option); });
  document.addEventListener('load',event => { if (event.target instanceof HTMLImageElement && event.target.closest('.team-badge')) event.target.parentElement.classList.add('loaded'); },true);
  document.addEventListener('error',event => { if (event.target instanceof HTMLImageElement && event.target.closest('.team-badge')) event.target.remove(); },true);
  document.addEventListener('click',event => {
    const target = event.target.closest('button,a'); if (!target) return;
    if (target.hasAttribute('data-home')) { event.preventDefault(); setState({tab:'brief'},{focus:true}); }
    else if (target.dataset.tab) setState({tab:target.dataset.tab},{focus:true});
    else if (target.dataset.depth) setState({depth:target.dataset.depth});
    else if (target.dataset.game) openGame(target.dataset.game);
    else if (target.hasAttribute('data-close-game')) $('#game-dialog').close();
    else if (target.dataset.revealGame) { revealed.add(target.dataset.revealGame); render(); }
    else if (target.dataset.revealStory) { revealed.add(target.dataset.revealStory); render(); }
    else if (target.hasAttribute('data-show-outcomes')) { revealed.clear(); setState({spoilers:false}); }
    else if (target.dataset.status) setState({gameStatus:target.dataset.status});
    else if (target.dataset.club) setState({teamFocus:target.dataset.club});
    else if (target.dataset.teamRoom) setState({teamFocus:target.dataset.teamRoom,tab:'teams'},{focus:true});
    else if (target.dataset.follow) setState({team:target.dataset.follow,teamFocus:target.dataset.follow,tab:'brief'},{focus:true});
  });
  $('#team').addEventListener('change',event => setState({team:event.target.value,...(event.target.value!=='ALL'?{teamFocus:event.target.value}:{})}));
  $('#period').addEventListener('change',event => { if (event.target.value==='custom') { $('#custom-wrap').hidden=false; $('#since').focus(); } else setState({since:periodDates()[event.target.value]}); });
  $('#since').addEventListener('change',event => setState({since:event.target.value}));
  $('#spoilers').addEventListener('change',event => { revealed.clear(); setState({spoilers:event.target.checked}); });
  $('#theme-toggle').addEventListener('click',() => setState({theme:state.theme==='dark'?'light':'dark'}));
  $('#share').addEventListener('click',share);
  $('#close-share').addEventListener('click',() => $('#share-dialog').close());
  $('#copy-share').addEventListener('click',async () => { try { await navigator.clipboard.writeText($('#share-url').value); notice('Link copiado.'); } catch { $('#share-url').select(); notice('Selecione e copie o link acima.'); } });
  $('#game-dialog').addEventListener('close',() => { openedGame=null; });
  $('#game-dialog').addEventListener('click',event => { if (event.target === $('#game-dialog')) { const box = $('#game-dialog').getBoundingClientRect(); if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) $('#game-dialog').close(); } });
  $('#reset').addEventListener('click',() => { revealed.clear(); openedGame=null; $('#game-dialog').close(); state=C.normalize({team:'MCI',teamFocus:'MCI',locale:'pt-BR'},D); try { history.replaceState(null,'',location.pathname + (/\/v2\/?$/.test(location.pathname)?'?product=huddle_soccer':'')); } catch {} persist(); render(); notice('Futebol redefinido para Manchester City, em português.'); window.scrollTo({top:0,behavior:'instant'}); });
  document.addEventListener('input',event => { if (event.target.id === 'game-search') setState({query:event.target.value},{input:'#game-search'}); });
  cleanEntryURL(); persist(); render();
  if (linked.game && D.games.some(game => game.id === linked.game)) openGame(linked.game);
})();
