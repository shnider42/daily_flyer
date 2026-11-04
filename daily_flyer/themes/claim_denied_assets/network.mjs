// Private room transport mirrors Breach: server snapshots, sequenced inputs,
// token-based reconnect, protective shared pause, no client-authored health.
export class PartyClient {
  constructor(callbacks={},server=''){this.callbacks=callbacks;this.server=server;this.ws=null;this.room=null;this.selfId=null;this.seq=0;this.intentional=false;this.retry=0;this.token=null;this.lastState=0;}
  send(data){if(this.ws?.readyState===1)this.ws.send(JSON.stringify(data));}
  connect({code,name,difficulty='standard',mission='everwell-house',resume=false}={}){
    clearTimeout(this.timer);clearInterval(this.watchdog);this.intentional=false;this.params={code,name,difficulty,mission};this.callbacks.status?.('Connecting to the night shift…');
    const base=this.server&&this.server!=='same-origin'?this.server:location.href;const url=new URL('./ws',base);url.protocol=url.protocol==='https:'||url.protocol==='wss:'?'wss:':'ws:';
    const ws=new WebSocket(url);this.ws=ws;
    this.deadline=setTimeout(()=>{if(ws.readyState===0){this.callbacks.status?.('The room server is still waking up. Reconnecting…');ws.close();}},20000);
    ws.onopen=()=>{if(this.ws!==ws)return;clearTimeout(this.deadline);this.seq=0;this.lastState=Date.now();this.send({type:code?'join':'create',protocol:2,game:'claim-denied',mission,name:name||'Neighbor',difficulty,roomId:code,...(resume&&this.token?{token:this.token,replace:true}:{})});};
    ws.onmessage=e=>{if(this.ws!==ws)return;let packet;try{packet=JSON.parse(e.data);}catch{return;}
      if(packet.type==='welcome'){this.retry=0;this.selfId=packet.selfId;this.token=packet.token;this.params.code=packet.roomId;try{sessionStorage.setItem('claim-room',JSON.stringify({code:packet.roomId,token:packet.token,name:name||'Neighbor'}));}catch{}this.callbacks.status?.(packet.resumed?'Reconnected. Everyone must resume.':'Connected. Invite your neighbors.');}
      if(packet.type==='room'){if(packet.room.status==='playing'&&this.room?.status!=='playing')this.lastState=Date.now();this.room=packet.room;this.callbacks.room?.(packet.room);}
      if(packet.type==='state'){this.lastState=Date.now();this.callbacks.state?.(packet.state,packet.events||[]);}
      if(packet.type==='error'){this.callbacks.status?.(packet.message);if(['ROOM_NOT_FOUND','INVALID_TOKEN','VERSION_MISMATCH','ROOM_FULL','ROOM_STARTED'].includes(packet.code)){this.intentional=true;this.clearSession();ws.close();this.callbacks.closed?.(packet.message);}}
      if(packet.type==='closed'){this.intentional=true;this.clearSession();this.callbacks.closed?.(packet.message);ws.close();}
    };
    // A resumed room gets a fresh grace period; short snapshot gaps never open
    // a pause dialog. A truly silent socket reconnects through the normal path.
    this.watchdog=setInterval(()=>{if(this.ws===ws&&ws.readyState===1&&this.room?.status==='playing'&&Date.now()-this.lastState>8000)ws.close();},1000);
    ws.onerror=()=>this.callbacks.status?.('Connection interrupted. Your place is reserved for 60 seconds.');
    ws.onclose=()=>{if(this.ws!==ws)return;clearTimeout(this.deadline);clearInterval(this.watchdog);if(this.intentional)return;this.callbacks.disconnected?.();if(this.retry++<7){const delay=Math.min(8000,1000*2**(this.retry-1));this.callbacks.status?.('Reconnecting… The house is on hold.');this.timer=setTimeout(()=>this.connect({...this.params,resume:!!this.token}),delay);}else this.callbacks.closed?.('Unable to reconnect. Return to the menu and create a new room.');};
  }
  input(input){this.send({type:'input',seq:this.seq++,...input});}
  clearSession(){this.token=null;try{sessionStorage.removeItem('claim-room');}catch{}}
  leave(){this.intentional=true;clearTimeout(this.timer);clearTimeout(this.deadline);clearInterval(this.watchdog);this.send({type:'leave'});this.ws?.close();this.room=null;this.clearSession();}
}
