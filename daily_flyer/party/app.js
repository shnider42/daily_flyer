'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
let room = (params.get('room') || 'main').trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(room)) room = 'main';
const store = {get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{toast('This browser cannot remember your seat. Keep this tab open.');}},remove(k){try{localStorage.removeItem(k);}catch{}}};
let token = store.get('loudsource-seat:'+room) || '', state = null, tab = 'music', playView = 'trivia', busy = false, polling = false, timer, searchResults = null, searchQuery = '', searchSeq = 0, pack = null, questionIndex = 0, selected = null, hostMode = params.get('host') === '1', searchOpen = false;
const pendingVotes = new Set();
let voteVersion=0;
const topicMarks = {music:'01',screen:'02',games:'03',sports:'04',food:'05',wild:'06'};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),4800);}
function prettyTime(seconds){seconds=Math.max(0,Math.floor(seconds||0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
function spotifySessionActive(){return state?.music?.control_session?.active===true&&!state.music.connection_error&&state.music.control_session.ended_reason!=='connection-error';}
function spotifySessionLabel(){
 const session=state?.music?.control_session;
 if(state?.music?.connection_error||session?.ended_reason==='connection-error')return 'Spotify needs reconnecting';
 if(spotifySessionActive())return 'Spotify session active';
 if(session?.ended_reason==='expired')return 'Spotify session expired';
 if(session?.ended_reason==='host-ended')return 'Spotify session ended';
 return 'Spotify session inactive';
}
function inviteURL(){return location.origin+'/?room='+encodeURIComponent(room);}
async function api(path, data, music=false){
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
  try {
    const res=await fetch((music?'/api/loudsource/':'/api/party/')+encodeURIComponent(room)+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Party-Token':token},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:controller.signal});
    const out=await res.json().catch(()=>({}));
    if(!res.ok){const error=new Error(out.error||out.message||'That did not go through. Try again.');error.status=res.status;throw error;}
    return out;
  } catch(e){if(e.name==='AbortError')throw new Error('The connection is taking a while. Your previous votes are safe. Try again.');throw e;}
  finally {clearTimeout(timeout);}
}
function brand(){return '<a class="brand" href="/" aria-label="Loudsource home"><span class="logo" aria-hidden="true"></span>LOUDSOURCE</a>';}
function landing(message=''){
 state=null;
 $('#app').innerHTML=`<div class="wrap"><header>${brand()}<span class="kicker muted">The room has the aux.</span></header><main id="main" class="landing"><div><span class="kicker orange">EVERYBODY GETS A SAY</span><h1>PICK THE<br><em>NEXT SONG.</em></h1><p class="intro muted">Vote for what you want to hear.<br>Add something good to the list.</p><p class="note">Just your name. No Spotify account needed.</p></div><section class="join-panel"><div class="record-stamp" aria-hidden="true">SIDE A</div><span class="kicker">${hostMode?'HOST DESK':'ROOM '+esc(room.toUpperCase())}</span><h2>${hostMode?'Open your host desk.':'Come on in.'}</h2><form id="join-form"><label>Your name<input id="name" name="nickname" autocomplete="nickname" maxlength="24" required placeholder="What do your friends call you?" value="${esc(store.get('loudsource-name')||'')}"></label><details class="room-picker" ${hostMode?'open':''}><summary>${hostMode?'Room':'Change room'}</summary><label>Room code<input id="room" name="room" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="64" required value="${esc(room.toUpperCase())}" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}"></label></details><div id="join-error" class="form-error" role="alert">${esc(message)}</div><button class="primary" type="submit">${hostMode?'Open host desk':'Join & vote'} <span aria-hidden="true">→</span></button></form><div class="rule"><button class="quiet" data-action="host-mode">${hostMode?'Join as a guest instead':'Hosting? Open your controls →'}</button><p class="note">${hostMode?'MAIN keeps the existing Spotify connection. Each different room has its own connection.':'One host handles the music. Everybody can vote.'}</p><button class="quiet" data-action="spotify-info">How Spotify fits in</button></div></section></main><footer class="landing-footer"><span>LOUDSOURCE / A DAILY FLYER EXPERIMENT</span><button class="quiet" data-action="privacy">What gets saved?</button></footer></div>`;
}
function shell(){
 $('#app').innerHTML=`<div class="wrap"><header>${brand()}<button class="quiet" data-action="invite">ROOM <b class="mono">${esc(room.toUpperCase())}</b> · Invite →</button></header><div class="topline"><div><span class="kicker muted" id="hello"></span><h1 id="party-title"></h1></div><span class="connection" id="connection">● Room live</span></div><nav class="tabs" aria-label="Party sections"><button data-tab="music" class="active">Vote</button><button data-tab="play">Play</button><button data-tab="room">The room</button><button data-tab="host" id="host-tab">Host desk</button></nav><div class="workspace"><main id="main"></main><aside id="sidebar"></aside></div></div>`;
 updateShell();renderTab();
}
function updateShell(){if(!state)return;$('#hello').textContent=`${state.people.length} IN THE ROOM / HEY, ${state.me.name.toUpperCase()}`;$('#party-title').textContent=state.title;$('#host-tab').classList.toggle('hide',!state.me.host);renderSidebar();}
function renderSidebar(){
 const me=state.people.find(p=>p.id===state.me.id);
 $('#sidebar').innerHTML=`<section class="side-rule"><h3>The room</h3><div class="room-code">${esc(room.toUpperCase())}</div><p class="note">Send the link. Scan the code.<br>Everybody gets a say.</p><button data-action="invite">Invite friends →</button></section><section class="side-rule"><h3>Need a song idea?</h3><p class="side-note">${esc(state.prompt)}</p></section><section class="side-rule"><h3>Everybody gets a vote</h3><p class="note">Vote for any songs you like. One vote per song; tap again to undo.</p><p class="note">You can add three songs at a time. Slots open as they play.</p><button class="quiet" data-action="spotify-info">How Spotify fits in →</button></section><section class="side-rule"><h3>Your little side quest</h3><p class="mini-stat">${me?.correct||0} correct / ${me?.attempted||0} answered</p><button class="quiet" data-action="privacy">What gets saved?</button></section>`;
}
function setTab(next){tab=next;pack=null;selected=null;renderTab();window.scrollTo({top:0,behavior:'instant'});}
function renderTab(){
 if(!state)return;
 if(tab==='host'&&!state.me.host)tab='room';
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
 if(tab==='music')renderMusic();else if(tab==='play')renderPlay();else if(tab==='room')renderRoom();else renderHost();
}
function nowPlaying(){
 if(!spotifySessionActive())return `<div class="music-note session-note"><span><strong>${spotifySessionLabel()}.</strong> Voting and games are open. Song search opens when the host starts a Spotify session.${state.me.host?' <button class="quiet" data-tab="host">Open host desk →</button>':''}</span></div>`;
 const np=state.music.connection_error?null:state.music.now_playing;
 if(!np)return '<div class="music-note"><span class="live-dot" aria-hidden="true">●</span><span>Voting is open. The host handles the music.</span></div>';
 return `<div class="now now-compact">${np.image?`<img class="cover" src="${esc(np.image)}" alt="${esc(np.name)} album artwork">`:''}<div class="now-copy"><span class="kicker ${np.is_playing?'orange':'muted'}">${np.is_playing?'ON THE SPEAKERS':'ON PAUSE'}</span><h2>${esc(np.name)}</h2><p>${esc(np.artist)}</p><a class="spotify-link" target="_blank" rel="noopener" href="https://open.spotify.com/track/${esc(np.track_id)}">Open in Spotify ↗</a></div></div>`;
}
function trackRow(item,index,search=false){
 const id=item.track_id, track=item.track||item, picked=state.mine.includes(id), queued=state.music.queue.find(t=>t.track_id===id), current=spotifySessionActive()&&state.music.now_playing?.track_id===id;
 const adding=search&&!queued&&!picked, count=queued?.votes??item.votes??0;
 const label=current?'Playing':picked?'✓ Voted':adding?'+ Add song':'↑ Vote';
 return `<div class="track">${!search?`<span class="rank">${String(index+1).padStart(2,'0')}</span>`:''}${track.image?`<img src="${esc(track.image)}" alt="" loading="lazy">`:''}<div class="track-copy"><span class="track-title">${esc(track.name||'Unknown track')}</span><p>${esc(track.artist)}</p><div class="track-meta">${!search||queued?`<span>${count} vote${count===1?'':'s'}</span>`:''}<a class="spotify-source" href="https://open.spotify.com/track/${esc(id)}" target="_blank" rel="noopener" aria-label="Open ${esc(track.name)} in Spotify">Spotify ↗</a></div></div><button class="vote ${picked?'picked':''}" data-action="vote" data-track="${esc(id)}" aria-label="${picked?'Undo vote for':adding?'Add':'Vote for'} ${esc(track.name)}" aria-pressed="${picked}" ${current||pendingVotes.has(id)?'disabled':''}>${label}</button>${!search&&state.me.host?`<button class="track-remove" data-action="remove" data-track="${esc(id)}" aria-label="Remove ${esc(track.name)} from queue">×</button>`:''}</div>`;
}
function queueHTML(){return state.music.queue.length?state.music.queue.map((t,i)=>trackRow(t,i)).join(''):'<div class="empty"><strong>What should we hear first?</strong>Add a song. Everyone else can vote it up.</div>';}
function renderMusic(){
 const active=spotifySessionActive();
 $('#main').innerHTML=`<div id="now-playing">${nowPlaying()}</div><section class="vote-section"><div class="section-title vote-heading"><h2>Vote for the next song</h2><button class="light add-song" data-action="show-search" aria-expanded="${searchOpen&&active}" aria-controls="add-song-panel" ${active?'':'disabled'}>+ Add a song</button></div><p class="note">Tap Vote on any songs you want to hear. Tap Voted to undo.</p><div class="queue-list" id="queue">${queueHTML()}</div><p class="note music-relationship">No Spotify login needed. Music plays through the host. <button class="quiet" data-action="spotify-info">How Spotify fits in</button></p></section><section id="add-song-panel" class="search-block ${searchOpen&&active?'':'hide'}"><div class="section-title"><h2>Add a song</h2><button class="quiet" data-action="hide-search">Close ×</button></div><p class="note" id="budget">${Math.max(0,3-(state.requests||[]).length)} of 3 song requests available. Voting is always open.</p><label for="song-search">Song or artist</label><form id="search-form" class="search-line"><input type="search" id="song-search" autocomplete="off" maxlength="150" placeholder="Song, artist, or Spotify link" value="${esc(searchQuery)}" required ${active?'':'disabled'}><button class="light" type="submit" ${active?'':'disabled'}>Search</button></form><div id="search-results" class="search-results"></div><p class="note">Adding a song includes your vote.</p></section><section id="recent">${historyHTML()}</section>`;
 if(searchResults)renderSearch();
}
function historyHTML(){return state.history.length?`<div class="section-title"><h2>Heard tonight</h2><button class="quiet" data-action="copy-history">Copy songs</button></div>${state.history.slice(0,5).map(t=>`<div class="track">${t.image?`<img src="${esc(t.image)}" alt="" loading="lazy">`:''}<div class="track-copy"><a class="track-title" href="https://open.spotify.com/track/${esc(t.track_id)}" target="_blank" rel="noopener">${esc(t.name)}</a><p>${esc(t.artist)}</p></div></div>`).join('')}`:'';}
function renderSearch(){if(!$('#search-results'))return;$('#search-results').innerHTML=`<div class="section-title"><span class="kicker muted">SEARCH RESULTS · SPOTIFY</span><button class="quiet" data-action="clear-search">Clear results</button></div>${searchResults.length?searchResults.map((t,i)=>trackRow(t,i,true)).join(''):'<p class="note">No matches. Try the song title and artist together.</p>'}`;}
function renderPlay(){
 $('#main').innerHTML=`<div class="page-intro"><span class="kicker orange">A LITTLE SIDE QUEST</span><h2 style="margin-top:10px">Got a minute?</h2><p class="muted">Pick what you’re into. There’s no clock, and nobody’s waiting on you.</p></div><div class="view-tabs"><button data-action="play-view" data-view="trivia" class="${playView==='trivia'?'active':''}">Quick trivia</button><button data-action="play-view" data-view="polls" class="${playView==='polls'?'active':''}">Settle this</button></div><div id="play-content"></div>`;
 if(playView==='polls')renderPolls();else renderTopics();
}
function renderTopics(){
 pack=null;
 $('#play-content').innerHTML=`<p class="note">Five questions per pack. One point for a right answer. All six packs stay open.</p><div class="topic-grid">${Object.entries(state.topics).map(([key,name])=>{const a=state.answers.filter(x=>x.question.startsWith(key+'-'));return `<button class="topic" data-action="topic" data-topic="${key}"><strong>${esc(name)}</strong><div class="meta"><small>${a.length===5?'Finished · '+a.filter(x=>x.correct).length+'/5 correct':a.length? a.length+'/5 answered':'5 questions'}</small><span>${a.length===5?'✓':topicMarks[key]+' →'}</span></div></button>`;}).join('')}</div><p class="note">Answers lock after you confirm. No speed bonuses; take your time.</p>`;
}
function renderQuestion(){
 const q=pack.questions[questionIndex], done=typeof q.choice==='number';
 $('#play-content').innerHTML=`<div class="trivia-head"><button class="quiet" data-action="topics">← All packs</button><span class="kicker muted">${esc(pack.topic)} · ${questionIndex+1}/5</span></div><article class="question"><h2>${esc(q.question)}</h2><div class="choices">${q.options.map((text,i)=>`<button class="choice ${done?(i===q.answer?'correct':i===q.choice?'wrong':''):selected===i?'selected':''}" data-action="choose" data-choice="${i}" ${done?'disabled':''} aria-pressed="${done?q.choice===i:selected===i}"><span class="letter">${'ABCD'[i]}</span>${esc(text)}${done&&q.answer===i?' ✓':''}</button>`).join('')}</div>${done?`<div class="answer-result"><strong>${q.correct?'That’s a point.':'One for next time.'}</strong><p>${esc(q.explanation)}</p></div><button class="primary" data-action="next-question">${questionIndex===4?'Finish pack':'Next question →'}</button>`:`<p class="note" style="margin-top:18px">Pick an answer, then lock it in.</p><button class="primary" data-action="answer" ${selected===null?'disabled':''}>Lock in answer</button>`}</article>`;
}
function renderPolls(){
 $('#play-content').innerHTML=`<p class="note">One vote each. Change your mind whenever you want. Results appear after you vote.</p><div id="polls">${state.polls.map(p=>{const total=p.counts.reduce((a,b)=>a+b,0),voted=p.mine!==null;return `<article class="poll"><h3>${esc(p.question)}</h3><div class="poll-options">${p.options.map((text,i)=>{const pct=total?Math.round(100*p.counts[i]/total):0;return `<button class="poll-option ${p.mine===i?'chosen':''}" data-action="poll" data-poll="${p.id}" data-choice="${i}" aria-pressed="${p.mine===i}">${voted?`<span class="fill" style="width:${pct}%"></span>`:''}<span>${p.mine===i?'✓ ':''}${esc(text)}</span><span>${voted?pct+'%':''}</span></button>`;}).join('')}</div><p class="note" style="margin-top:10px">${total} vote${total===1?'':'s'}${voted?' · Your vote is in.':''}</p></article>`;}).join('')}</div>`;
}
function boardHTML(){return `<table class="board"><thead><tr><th scope="col">FRIEND</th><th scope="col">ANSWERED</th><th scope="col">POINTS</th></tr></thead><tbody>${state.people.map(p=>`<tr class="${p.id===state.me.id?'self':''}"><td>${esc(p.name)}${p.id===state.me.id?' (you)':''}</td><td>${p.attempted}/30</td><td><b>${p.correct}</b></td></tr>`).join('')}</tbody></table>`;}
function renderRoom(){
 $('#main').innerHTML=`<div class="room-hero"><img class="qr" src="/api/party/${encodeURIComponent(room)}/qr.svg" alt="Scan to join this room"><div><span class="kicker">YOU’RE ALL INVITED</span><div class="room-code">${esc(room.toUpperCase())}</div><p class="muted">Scan, enter a name, you're in.</p><button data-action="copy-link">Copy invite link →</button></div></div><div class="section-title"><h2>A little friendly competition</h2></div><p class="note">Thirty questions across six interests. One point per correct answer. Same questions, same chances, no rush.</p><div id="leaderboard">${boardHTML()}</div><div class="controls"><button class="quiet" data-action="change-name">Change my name</button><button class="quiet" data-action="switch-room">Switch room</button><button class="quiet" data-action="privacy">What gets saved?</button></div>${!state.host_claimed?'<div class="banner">Nobody has opened the host desk yet. <button class="quiet" data-action="claim-host">I’m hosting →</button></div>':''}`;
}
function hostSessionHTML(){
 const active=spotifySessionActive(), session=state.music.control_session||{}, reconnect=!!state.music.connection_error||session.ended_reason==='connection-error';
 const expiry=session.expires_at?new Date(session.expires_at*1000).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}):null;
 let detail=active?'Loudsource can control playback on your connected Spotify account. Pausing in Spotify stays paused.':state.music.authed?'Your Spotify connection is saved. Start a session when you want Loudsource to control playback. Starting a session does not start music.':'Connect Spotify below, then start a session to use the music controls.';
 if(!active&&session.ended_reason==='expired')detail='No Spotify controls were used for 12 hours, so Loudsource stopped controlling playback. Your room and saved connection are still here.';
 if(!active&&session.ended_reason==='host-ended')detail='Loudsource has stopped controlling Spotify. Your room and saved connection are still here.';
 if(reconnect)detail='Loudsource has stopped controlling Spotify because the connection needs renewing. Choose Reconnect Spotify below, then start a new session. Voting and games are still open.';
 return `<div class="spotify-session ${reconnect?'session-expired':active?'session-active':session.ended_reason==='expired'?'session-expired':'session-inactive'}"><div class="session-heading"><span class="session-light" aria-hidden="true"></span><h3>${spotifySessionLabel()}</h3></div><p>${detail}</p>${active&&expiry?`<p class="session-deadline">Ends ${esc(expiry)} unless you use a Spotify control.</p>`:''}<div class="controls">${active?'<button class="danger" data-action="session-end">End Spotify session</button>':`<button class="primary" data-action="session-start" ${state.music.authed&&!reconnect?'':'disabled'}>Start Spotify session</button>`}</div><p class="note">Sessions end after 12 hours without using the Spotify controls. Leaving this page open or guest activity will not extend that time.</p><p class="note">Ending a session leaves Spotify playback as it is. Voting and games stay open.</p></div>`;
}
function hostConnectionText(){
 if(state.music.connection_error)return state.music.connection_error;
 if(!state.music.authed)return 'Connect your Spotify Premium account to use the music controls.';
 if(spotifySessionActive())return 'Spotify connection saved. '+(state.music.active_device_name?'Device: '+state.music.active_device_name+'.':'Open Spotify on your speaker or laptop, then check devices below.');
 return 'Spotify connection saved. Start a session above to check devices and control playback.';
}
function hostPlaybackHTML(){
 const active=spotifySessionActive(), disabled=active?'':'disabled';
 return `<h3>Playback</h3>${active?'':'<p class="note">Start a Spotify session above to use these controls.</p>'}<div class="controls"><button class="primary" data-action="start" ${disabled}>Play top pick</button><button data-action="pause" ${disabled}>Pause</button><button data-action="resume" ${disabled}>Resume</button></div><div class="switchline"><div><b>Auto queue</b><p class="note">Add the winning pick near the end of each song.</p></div><button data-action="auto" ${disabled}>${active&&state.music.auto_enabled?'On ✓':'Off'}</button></div><p class="note">Pausing in Spotify stays paused. Pausing here also turns auto queue off.</p><p class="note">Use an empty Spotify queue for the cleanest handoff. Existing Spotify queue entries may play before the next pick.</p>`;
}
let hostMusicKey='';
function updateHostMusic(force=false){
 if(tab!=='host'||!$('#host-session'))return;
 const key=JSON.stringify([state.music.control_session,state.music.authed,state.music.connection_error,state.music.active_device_name,state.music.auto_enabled]);
 if(!force&&hostMusicKey===key)return;
 hostMusicKey=key;
 $('#host-session').innerHTML=hostSessionHTML();
 $('#host-connection').textContent=hostConnectionText();
 $('#host-playback').innerHTML=hostPlaybackHTML();
 $('#check-devices').disabled=!spotifySessionActive();
 $('#connect-spotify').textContent=state.music.authed?'Reconnect Spotify':'Connect Spotify';
 if(state.music.connection_error||state.music.control_session?.ended_reason==='connection-error')$('.spotify-settings').open=true;
 if(!spotifySessionActive())$('#devices').innerHTML='';
}
function renderHost(){
 $('#main').innerHTML=`
 <section class="settings-block">
   <span class="kicker orange">YOU’RE HOSTING</span><h2 style="margin-top:10px">Keep the night moving.</h2>
   <p class="note">Music plays on your Spotify device. Guests just search and vote.</p>
   <div id="host-session" aria-live="polite"></div>
   <details class="spotify-settings" ${state.music.authed?'':'open'}><summary>Spotify connection & devices</summary>
     <div class="host-status" id="host-connection"></div>
     <p class="note">Only the host account connects. Guests never sign in to Spotify.</p>
     <div class="controls"><button id="connect-spotify" data-action="connect"></button><button id="check-devices" data-action="devices">Check devices</button></div>
     <div id="devices"></div><button class="quiet" data-action="spotify-info">What access does this use?</button>
   </details>
 </section>
 <section class="settings-block" id="host-playback"></section>
 <section class="settings-block"><h3>Make it your party</h3><form id="title-form" class="search-line"><input aria-label="Party name" id="party-name" maxlength="48" value="${esc(state.title)}" required><button type="submit">Save name</button></form><p class="note" style="margin-top:22px">Song prompt: ${esc(state.prompt)}</p><button data-action="prompt">Next song prompt →</button></section>
 <section class="settings-block"><h3>Pass the host desk</h3><p class="note">Handing over controls keeps the same Spotify account connected. The new host controls that account’s playback; their own Spotify account is not linked.</p><div class="search-line"><select id="next-host" aria-label="Next host">${state.people.filter(p=>p.id!==state.me.id).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')||'<option value="">Waiting for guests</option>'}</select><button data-action="transfer">Hand over</button></div></section>
 <section class="settings-block"><h3>Queue housekeeping</h3><p class="note">Removing requests doesn’t stop the current song.</p><button class="danger" data-action="clear-queue">Clear requests & votes</button></section>`;
 updateHostMusic(true);
}

function paintVotes(){
 if(tab!=='music'||!state||!$('#queue'))return;
 $('#queue').innerHTML=queueHTML();
 if(searchResults)renderSearch();
}
async function toggleVote(id){
 if(!state||pendingVotes.has(id))return;
 const voteState=state,voteRoom=room;
 const active=!state.mine.includes(id), row=state.music.queue.find(t=>t.track_id===id);
 const track=searchResults?.find(t=>t.track_id===id), wasRequest=!row&&active;
 pendingVotes.add(id);voteVersion++;
 if(active)state.mine.push(id);else state.mine=state.mine.filter(t=>t!==id);
 if(row)row.votes+=active?1:-1;
 else if(active&&track)state.music.queue.push({track_id:id,votes:1,track});
 paintVotes();
 try{
   await api('/vote',{track_id:id,active});
   toast(active?(wasRequest?'Song added. Your vote is in.':'Vote counted.'):'Vote removed.');
 }catch(err){
   if(state!==voteState||room!==voteRoom)return;
   if(active)state.mine=state.mine.filter(t=>t!==id);else if(!state.mine.includes(id))state.mine.push(id);
   if(row)row.votes+=active?-1:1;
   else if(wasRequest)state.music.queue=state.music.queue.filter(t=>t.track_id!==id);
   toast(err.message);
 }finally{
   pendingVotes.delete(id);
   if(state===voteState&&room===voteRoom){paintVotes();if(!pendingVotes.size)await refresh(true);}
 }
}

async function refresh(manual=false){
 if(!token||polling||pendingVotes.size)return;polling=true;
 try {const version=voteVersion,next=await api('/state');if(pendingVotes.size||version!==voteVersion)return;state=next;if(!$('#party-title'))shell();else{updateShell();$('#connection').textContent='● Room live';$('#connection').classList.remove('offline');if(tab==='music'){
 $('#now-playing').innerHTML=nowPlaying();$('#budget').textContent=Math.max(0,3-(state.requests||[]).length)+' of 3 song requests available. Voting is always open.';
 const active=spotifySessionActive();
 if(!active)searchOpen=false;
 const add=$('[data-action="show-search"]');add.disabled=!active;add.setAttribute('aria-expanded',String(searchOpen&&active));
 $('#add-song-panel').classList.toggle('hide',!searchOpen||!active);
 $('#song-search').disabled=!active;$('#search-form button').disabled=!active;
 if(manual||!$('#queue').contains(document.activeElement))$('#queue').innerHTML=queueHTML();
 $('#recent').innerHTML=historyHTML();if(searchResults&&(manual||!$('#search-results').contains(document.activeElement)))renderSearch();
 }else if(tab==='host'){if(!state.me.host)renderTab();else updateHostMusic();}else if(tab==='room'&&$('#leaderboard'))$('#leaderboard').innerHTML=boardHTML();else if(tab==='play'&&playView==='polls'&&(manual||!$('#polls')?.contains(document.activeElement)))renderPolls();}}
 catch(e){if(e.status===401){token='';store.remove('loudsource-seat:'+room);landing(e.message);}else if($('#connection')){$('#connection').textContent='Reconnecting…';$('#connection').classList.add('offline');if(manual)toast(e.message);}else landing(e.message);}
 finally{polling=false;}
}
function showModal(html){$('#modal-body').innerHTML=html;$('#modal').showModal();}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copied. Send it to the group.');}catch{showModal(`<h2>Copy this</h2><label>Press and hold to copy<input id="copy-fallback" readonly value="${esc(text)}"></label>`);$('#copy-fallback').select();}}
function confirmAction(title,detail,action){showModal(`<h2>${esc(title)}</h2><p class="muted">${esc(detail)}</p><div class="controls"><button class="primary" data-action="confirm" data-confirm="${action}">Yes, do it</button><button data-action="close">Cancel</button></div>`);}
async function hostAction(action,extra={}){await api('/host',{action,...extra});await refresh(true);if(tab==='host')renderHost();}
async function executeConfirmed(action){$('#modal').close();if(action==='clear'){await api('/clear',{},true);await refresh(true);toast('Music picks cleared.');}else if(action==='start'){const r=await api('/play-first',{},true);await refresh(true);toast(r.message);}else if(action.startsWith('transfer:')){await hostAction('transfer',{person_id:action.slice(9)});setTab('room');toast('The host desk has been passed on.');}}
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['join-form','search-form','title-form'].includes(form.id))return;e.preventDefault();if(busy)return;busy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
 try {
 if(form.id==='join-form'){
   const name=$('#name').value.trim();room=$('#room').value.trim().toLowerCase();token=store.get('loudsource-seat:'+room)||'';
   const data=await api('/join',{name,host:hostMode});token=data.token;store.set('loudsource-seat:'+room,token);store.set('loudsource-name',name);history.replaceState(null,'','/?room='+encodeURIComponent(room));tab=hostMode?'host':'music';await refresh(true);
 }else if(form.id==='search-form'){
   if(!spotifySessionActive())throw new Error('The host needs to start a Spotify session before song search opens.');
   searchQuery=$('#song-search').value.trim();const seq=++searchSeq;$('#search-results').innerHTML='<p class="note" role="status">Looking through Spotify…</p>';
   const r=await api('/search?q='+encodeURIComponent(searchQuery),undefined,true);if(seq===searchSeq){searchResults=Object.entries(r.results).map(([track_id,t])=>({track_id,...t}));renderSearch();}
 }else{await hostAction('title',{title:$('#party-name').value.trim()});toast('Party name saved.');}
 }catch(err){if(form.id==='join-form')$('#join-error').textContent=err.message;else {toast(err.message);if(form.id==='search-form'&&$('#search-results'))$('#search-results').innerHTML=`<p class="note" role="alert">${esc(err.message)}</p>`;}}
 finally{busy=false;button.disabled=form.id==='search-form'&&!spotifySessionActive();}
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.tab){setTab(b.dataset.tab);return;}
 if(b.classList.contains('dialog-close')){$('#modal').close();return;}
 const a=b.dataset.action;if(!a)return;
 if(a==='close'){$('#modal').close();return;}
 if(a==='privacy'){showModal('<h2>Just the party stuff.</h2><div class="privacy"><p>Your nickname, music picks, trivia answers, and room votes are saved on this app’s Render server so they survive refreshes. A random seat key stays in this browser.</p><p>Room members can see nicknames and trivia scores. Poll totals are shared. The host’s Spotify authorization is kept on the server; guests never receive it.</p><p>There are no ads or analytics scripts. Spotify receives song searches and playback requests. This first version keeps party records until the operator removes them. Use a nickname and share the room link only with your group.</p></div>');return;}
 if(a==='host-mode'){if($('#name'))store.set('loudsource-name',$('#name').value.trim());if($('#room'))room=$('#room').value.trim().toLowerCase()||'main';hostMode=!hostMode;landing();return;}
 if(a==='invite'){showModal(`<div class="dialog-center"><span class="kicker orange">COME ON IN</span><h2 style="margin-top:12px">Join the room.</h2><img class="qr" src="/api/party/${encodeURIComponent(room)}/qr.svg" alt="Scan to join room ${esc(room)}"><div class="room-code">${esc(room.toUpperCase())}</div><p class="link-copy">${esc(inviteURL())}</p><button class="primary" data-action="copy-link">Copy invite link</button></div>`);return;}
 if(a==='show-search'){searchOpen=true;renderMusic();$('#song-search').focus();$('#add-song-panel').scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(a==='hide-search'){searchOpen=false;renderMusic();return;}
 if(a==='spotify-info'){showModal(`<h2>One host. Everybody votes.</h2><div class="privacy"><p><b>Guests:</b> join with a nickname and vote. Song search opens when the host starts a Spotify session. No Spotify account, Premium, friend connection, or shared plan needed.</p><p><b>The host:</b> connects one Spotify Premium account, then starts a session explicitly. Starting a session does not start music. Playback buttons work on that account’s selected device.</p><p>Spotify sessions end after 12 hours without using the host’s Spotify controls. Opening this page or guest activity does not extend the session. Pausing in Spotify stays paused.</p><p><b>When you’re done:</b> choose End Spotify session in the host desk. Loudsource stops controlling Spotify and keeps the connection saved for next time. Anything already playing can continue. Voting, trivia, and polls stay open.</p><p>Loudsource requests playback access from the host. It does not request private playlists, saved libraries, or followers.</p></div>`);return;}
 if(a==='vote'){await toggleVote(b.dataset.track);return;}
 if(a==='copy-link'){await copy(inviteURL());return;}
 if(a==='copy-history'){await copy(state.history.map(t=>`${t.name} — ${t.artist}\nhttps://open.spotify.com/track/${t.track_id}`).join('\n\n'));return;}
 if(a==='clear-search'){searchSeq++;searchResults=null;searchQuery='';$('#song-search').value='';$('#search-results').innerHTML='';return;}
 if(a==='play-view'){playView=b.dataset.view;renderPlay();return;}
 if(a==='choose'){selected=Number(b.dataset.choice);renderQuestion();return;}
 if(a==='topics'){renderTopics();return;}
 if(a==='next-question'){selected=null;if(questionIndex===4){const score=pack.questions.filter(q=>q.correct).length;toast(`${score}/5 in ${pack.topic}. Try another pack whenever you feel like it.`);renderTopics();}else{questionIndex++;renderQuestion();}return;}
 if(a==='start'){confirmAction('Play the top pick now?',state.music.now_playing?'This replaces the current song on the host’s Spotify device.':'This starts the highest-voted track and turns auto queue on.','start');return;}
 if(a==='clear-queue'){confirmAction('Clear every music pick?','Song requests and votes are cleared. The current song keeps playing.','clear');return;}
 if(a==='transfer'){const id=$('#next-host').value;if(!id){toast('A guest needs to join first.');return;}confirmAction('Pass the host desk?','You’ll become a guest. This keeps the same Spotify account connected and gives the other person control of its playback. It does not switch to their Spotify account.','transfer:'+id);return;}
 if(a==='switch-room'){token='';hostMode=false;history.replaceState(null,'','/');landing();return;}
 if(a==='change-name'){hostMode=false;landing();return;}
 if(busy)return;busy=true;b.disabled=true;
 try {
 if(a==='remove'){await hostAction('remove',{track_id:b.dataset.track});toast('Removed from the queue.');}
 else if(a==='topic'){pack=await api('/trivia/'+b.dataset.topic);questionIndex=pack.questions.findIndex(q=>q.choice===undefined);if(questionIndex<0)questionIndex=0;selected=null;if(tab==='play'&&playView==='trivia')renderQuestion();}
 else if(a==='answer'){const q=pack.questions[questionIndex];const r=await api('/answer',{question:q.id,choice:selected});Object.assign(q,r);if(tab==='play'&&pack&&pack.questions.includes(q))renderQuestion();await refresh(true);}
 else if(a==='poll'){await api('/poll',{poll:Number(b.dataset.poll),choice:Number(b.dataset.choice)});await refresh(true);}
 else if(a==='connect'){const r=await api('/connect',{},true);location.assign(r.url);}
 else if(a==='session-start'){await hostAction('session-start');toast('Spotify session started. Choose Play top pick or Resume when you’re ready.');}
 else if(a==='session-end'){await hostAction('session-end');toast('Spotify session ended. Loudsource is no longer controlling playback.');}
 else if(a==='devices'){const r=await api('/devices',undefined,true);$('#devices').innerHTML=r.devices.length?`<p class="note">Choose where the music plays:</p><div class="devices">${r.devices.filter(d=>!d.is_restricted).map(d=>`<button class="device" data-action="device" data-device="${esc(d.id)}">${d.is_active?'● ':''}${esc(d.name)}<small>${esc(d.type)}${d.is_active?' · Active':''}</small></button>`).join('')}</div>`:`<p class="note" role="status">${r.authed?'No devices visible. Open Spotify on your speaker device and start a song, then check again.':'Spotify needs to be reconnected. Use the connect button above.'}</p>`;}
 else if(a==='device'){await hostAction('device',{device_id:b.dataset.device});toast('Spotify device selected.');}
 else if(['pause','resume','prompt'].includes(a)){await hostAction(a);toast(a==='prompt'?'New song prompt.':a==='pause'?'Paused. Auto queue is off.':'Playback resumed.');}
 else if(a==='auto'){await hostAction('auto',{enabled:!state.music.auto_enabled});}
 else if(a==='confirm'){await executeConfirmed(b.dataset.confirm);}
 else if(a==='claim-host'){await api('/join',{name:state.me.name,host:true});await refresh(true);setTab('host');}
 }catch(err){toast(err.message);if(err.status===409)await refresh(true);}finally{busy=false;b.disabled=a==='devices'&&!spotifySessionActive();}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token)refresh();});
window.addEventListener('online',()=>refresh());
setInterval(()=>{if(!document.hidden&&!busy&&token)refresh();},5000);
if(token){tab=hostMode?'host':'music';$('#app').innerHTML='<div class="wrap"><header>'+brand()+'</header><main id="main" class="loader">Finding your seat…</main></div>';refresh();}else landing();
