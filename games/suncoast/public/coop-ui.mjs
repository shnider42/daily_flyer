import {LOCATIONS,WORLD,islandAt} from './world.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function lobbyContent({name='',code='',hasCheckpoint=false,session=null,busy=false,reason=''}) {
  return `<p class="crew-intro">One city. Up to four of you. Share the story, ride together, and get each other out of trouble.</p>
  <label class="crew-field">Your name<input id="crew-name" type="text" value="${esc(name)}" maxlength="20" placeholder="A name your friends will recognize" autocomplete="nickname" ${busy?'disabled':''}></label>
  <div class="crew-entry-grid"><section><h3>Start a crew</h3><p>Invite friends into a fresh shared campaign.</p><button class="button primary" data-action="crew-host" ${busy?'disabled':''}>Host new crew</button>${hasCheckpoint?`<button class="button secondary" data-action="crew-resume-checkpoint" ${busy?'disabled':''}>Host saved crew story</button>`:''}</section>
  <section><h3>Join your friends</h3><label class="crew-field">Room code<input id="crew-code" type="text" value="${esc(code)}" maxlength="6" placeholder="ABCDEF" autocapitalize="characters" autocomplete="off" spellcheck="false" ${busy?'disabled':''}></label><button class="button secondary" data-action="crew-join" ${busy?'disabled':''}>Join crew</button></section></div>
  ${session?`<button class="quiet-button" data-action="crew-reconnect" ${busy?'disabled':''}>Reconnect to room ${esc(session.code)}</button>`:''}
  <p id="crew-feedback" class="crew-feedback" role="status">${esc(reason)}</p>
  <div class="hint-box"><strong>A separate story for your crew.</strong><p>Everyone can help with objectives. The host chooses story decisions. Your solo save stays separate.</p><p>Menus stop your controls; the city keeps going. Friendly fire is off.</p></div>`;
}

export function crewContent({game,room,ping=0,status,reason='',invite,host,saveAt=0}) {
  const me=game.coop?.playerId,connected=status==='connected';
  const roster=(game.crew||[]).map(member=>{
    const place=member.interior?(LOCATIONS[member.interior]||WORLD.buildings.find(b=>b.id===member.interior))?.name:WORLD.islands[islandAt(member.x,member.y)]?.name||'On the bay';
    const details=!member.connected?'Reconnecting':member.phase==='busted'?'At the station':member.phase==='down'?'At the hospital':member.vehicleId?member.seat==='passenger'?'Riding along':'Driving':'On foot';
    return `<li style="--crew-color:${esc(member.color||'#8dc6b1')}"><span class="crew-swatch" aria-hidden="true"></span><div><strong>${esc(member.name)}${member.id===me?' <small>YOU</small>':''}${member.id===room.hostId?' <small>HOST</small>':''}</strong><span>${esc(details)} · ${esc(place)}</span></div>${member.id!==me?`<button class="quiet-button" data-crew-follow="${esc(member.id)}">Find</button>`:''}</li>`;
  }).join('');
  return `<div class="crew-room-heading"><div><span>ROOM CODE</span><strong>${esc(room.code)}</strong></div><p>${(room.players||[]).filter(p=>p.connected).length} / 4 online<br>${connected?`${Math.round(ping)} ms`:'Reconnecting'}</p></div>
  <div class="crew-invite"><label class="crew-field">Invite link<input id="crew-invite" readonly value="${esc(invite)}" aria-label="Crew invitation link"></label><button class="button secondary" data-action="crew-copy">Copy invite</button></div>
  <p id="crew-feedback" class="crew-feedback" role="status">${esc(reason)}</p>
  <ul class="crew-roster">${roster}</ul>
  <div class="pause-actions"><button class="button primary" data-action="close">Back to the city</button><button class="button secondary" data-action="crew-ping" ${connected?'':'disabled'}>Ping my location</button><button class="button secondary" data-panel="map">Open crew map</button></div>
  ${game.coop?.storyTitle?`<div class="hint-box"><strong>${esc(game.coop.storyTitle)}</strong><p>The host is handling the conversation. You can keep moving.</p></div>`:''}
  <div class="pause-actions"><button class="button secondary" data-panel="settings">Options</button><button class="button secondary" data-panel="help">Controls &amp; city rules</button><button class="button secondary" data-panel="phone">Stories &amp; journal</button>${game.wanted.stars&&game.phase==='playing'?'<button class="button secondary" data-action="surrender">Surrender to police</button>':''}</div>
  <h3>The city keeps moving</h3><p>Your phone, map and this menu only stop your controls. Stop the car before checking your phone. Use a ping to mark a meeting point; press G or the middle mouse button on desktop.</p>
  <h3>Keep the crew story</h3><p>${host?'Your shared campaign and city checkpoint save on this device. Reopening a checkpoint starts a new room; friends join as new crew members.':'The host saves this shared campaign on their device. Your current character is kept during short connection interruptions.'}</p>
  ${host?`<div class="pause-actions"><button class="button secondary" data-action="crew-save" ${connected?'':'disabled'}>Save crew checkpoint</button><span id="crew-save-status">${saveAt?'Saved at '+esc(new Date(saveAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):'Waiting for first checkpoint'}</span></div>`:''}
  <p class="fine-print">Rooms are temporary and can end when the server restarts. Reconnect restores your character for up to 60 seconds; a saved checkpoint lets the host reopen the story later. Names and game actions are shared with your room. No account or chat.</p>
  <button class="quiet-button crew-leave" data-action="crew-leave">Leave crew and return to title</button>`;
}
