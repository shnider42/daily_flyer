import {DuelClient} from './duel-client.js?v=29';
export function setupDuel(callbacks){
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const intro=document.querySelector('.intro');document.title='PGI · Play a friend';document.querySelector('.lede').textContent='A private 1v1. Share a room, call your plays, and settle it on the field.';
 $('difficulty').disabled=true;$('showRoster').hidden=true;
 const join=make('div',null,'dueljoin'),label=make('label','HAVE A ROOM CODE?'),input=make('input');input.id='duelCode';input.maxLength=8;input.autocomplete='off';input.autocapitalize='characters';input.placeholder='8-character code';label.append(input);const joinButton=make('button','JOIN FRIEND ↗','secondary');joinButton.id='duelJoin';join.append(label,joinButton);$('start').after(join);
 const solo=make('a','Play solo ↗','textbutton');solo.href='https://dfe-pocket-gridiron.onrender.com/gridiron/';join.after(solo);
 const message=make('p','Create a room with the matchup above, or enter your friend’s code.','datafoot');message.id='duelMessage';join.after(message);
 const dialog=make('dialog');dialog.id='duelRoom';const tag=make('span','PGI · PRIVATE 1V1','eyebrow'),title=make('h2','Your room.'),details=make('p'),invite=make('input'),copy=make('button','COPY INVITE LINK','secondary'),ready=make('button','READY TO PLAY ↗','primary'),leave=make('button','LEAVE ROOM','secondary');invite.readOnly=true;invite.setAttribute('aria-label','Invite link');invite.onclick=()=>invite.select();ready.id='duelReady';details.id='duelDetails';invite.id='duelInvite';dialog.append(tag,title,details,invite,copy,ready,leave);document.body.append(dialog);
 const strip=make('div',null,'duelstatus');strip.id='duelStatus';document.querySelector('.console').prepend(strip);
 const reconnect=make('button','RECONNECT WITHOUT LEAVING','secondary');reconnect.id='duelReconnect';$('resume').after(reconnect);
 const pauseNote=make('p','','datafoot');pauseNote.id='duelPauseNote';reconnect.after(pauseNote);
 let status='Connecting…';
 const client=new DuelClient({
  status(text){status=text;message.textContent=text;pauseNote.textContent=text;},
  welcome(m){input.value=m.roomId;},
  error(text){message.textContent=text;details.textContent=text;},
  room(room){
   const own=room.players[client.team],other=room.players[1-client.team],abbr=client.team===0?room.home:room.away;
   title.textContent=`Room ${room.id}`;invite.value=`${location.origin}/?room=${room.id}`;
   details.textContent=`You play ${abbr}. ${room.home} vs ${room.away}. ${other?(other.connected?'Your opponent is connected.':'Your opponent is reconnecting.'):'Waiting for your friend.'} ${own?.ready?'You are ready.':''}`;
   ready.textContent=own?.ready?'READY · WAITING FOR FRIEND':'READY TO PLAY ↗';ready.disabled=!!own?.ready;status=room.reason||`You: ${abbr}`;
   if(room.status==='lobby'){ready.hidden=copy.hidden=invite.hidden=false;copy.textContent='COPY INVITE LINK';if(!dialog.open)dialog.showModal();}else if(room.status!=='lobby')dialog.close();
   pauseNote.textContent=room.reason;
   callbacks.room?.(room);
  },
  state(g,fresh){callbacks.state(g,fresh);},
  closed(text){status=text;message.textContent=text;details.textContent=text;title.textContent='Room ended';ready.hidden=true;copy.hidden=true;invite.hidden=true;if(!dialog.open)dialog.showModal();callbacks.closed?.(text);}
 });
 joinButton.onclick=()=>{ready.hidden=copy.hidden=invite.hidden=false;client.join(input.value.trim().toUpperCase());};
 ready.onclick=()=>client.ready();leave.onclick=()=>{client.leave();dialog.close();callbacks.leave();};dialog.addEventListener('cancel',e=>{e.preventDefault();leave.click();});
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(invite.value);copy.textContent='LINK COPIED';}catch{invite.select();copy.textContent='SELECT LINK ABOVE TO COPY';}};
 reconnect.onclick=()=>client.reconnect();
 const roomParam=new URLSearchParams(location.search).get('room');if(roomParam)input.value=roomParam.toUpperCase().slice(0,8);
 if(client.pass){const restore=make('button',`RECONNECT TO ${client.pass.roomId}`,'secondary');restore.id='duelRestore';join.after(restore);restore.onclick=()=>{client.reconnect();restore.remove();};}
 setInterval(()=>{const room=client.room;if(!room){strip.textContent='PRIVATE 1V1';return;}const abbr=client.team===0?room.home:room.away;strip.textContent=`YOU: ${abbr} · ${room.id} · ${client.rtt===null?'connecting':`${Math.round(client.rtt)} ms`}${room.status==='playing'&&['call','ready','kick_ready','kick_charge','penalty'].includes(client.view?.phase)?` · PLAY CLOCK ${Math.max(0,Math.ceil(client.view?.playClock||0))}`:' · '+status}`;},500);
 return client;
}
