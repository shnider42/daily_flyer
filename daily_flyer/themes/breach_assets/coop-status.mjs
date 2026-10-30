// Small, optional browser adapter. The network client also runs without a DOM.
// Only timing/connection health reaches this UI; never expose reconnect tokens.
export function createConnectionStatus(reconnect) {
  const doc=globalThis.document;
  if(!doc?.getElementById||!doc.getElementById('team-status'))return null;
  if(!doc.getElementById('breach-network-style')){
    const style=doc.createElement('style');style.id='breach-network-style';
    style.textContent=`
      .network-pill{flex:0 0 auto!important;white-space:nowrap;padding-left:8px;border-left:1px solid #8acac155;color:#8acac1;font-size:8px;letter-spacing:0}
      .network-pill[data-quality=unstable],.network-pill[data-quality=stalled],.network-pill[data-quality=reconnecting]{color:#f2a744}
      .network-room-info{font-size:9px;line-height:1.6;color:#a8b1a7;margin:0 0 12px}
      .network-pause-info{border-top:1px solid #dce7d233;padding:12px 0;margin:0 0 14px}
      .network-pause-info p{font-size:10px;line-height:1.6;color:#a8b1a7;margin:0 0 9px}
      .network-pause-info .button{font-size:10px;min-height:44px;padding:11px 14px}
      .network-pause-info small{display:block;font-size:9px;line-height:1.5;color:#748078;margin-top:8px}
      #team-status-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:600px){.network-pill{font-size:7px;padding-left:5px}}
    `;
    doc.head.appendChild(style);
  }
  const pill=doc.createElement('span');pill.className='network-pill';pill.id='coop-network-indicator';
  doc.getElementById('team-status').appendChild(pill);
  const room=doc.createElement('p');room.className='network-room-info';room.id='coop-network-room';
  doc.getElementById('room-status')?.after(room);
  const panel=doc.createElement('div');panel.className='network-pause-info';
  const detail=doc.createElement('p');detail.id='coop-network-detail';
  const button=doc.createElement('button');button.type='button';button.className='button secondary';button.id='coop-network-reconnect';button.textContent='RECONNECT WITHOUT LEAVING ↗';
  const note=doc.createElement('small');note.textContent='Keeps this room and its progress while the server still holds the session. Both players resume afterward.';
  panel.append(detail,button,note);doc.getElementById('pause-room-status')?.after(panel);
  button.addEventListener('click',reconnect);
  return {
    update(status){
      const label={connected:'CONNECTED',unstable:'UNSTABLE',stalled:'STALLED',reconnecting:'REJOINING',connecting:'CONNECTING',away:'AWAY',idle:'CONNECTING',error:'OFFLINE'}[status.quality]||'CONNECTING';
      const timing=status.rtt===null?'Measuring server round-trip time…':`${status.rtt} ms round trip · ${status.jitter} ms variation`;
      const summary=`${label} · ${timing}`;
      pill.textContent=status.quality==='connected'&&status.rtt!==null?`${status.rtt} ms`:label;
      pill.dataset.quality=status.quality;pill.title=summary;pill.setAttribute('aria-label',summary);
      room.textContent=summary;detail.textContent=`Connection: ${summary}`;
      button.disabled=!status.canReconnect||['connecting','reconnecting','away'].includes(status.quality);
    },
    dispose(){button.removeEventListener('click',reconnect);pill.remove();room.remove();panel.remove();},
  };
}
