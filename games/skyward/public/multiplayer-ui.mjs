import {getAircraft} from './campaign.mjs';
import {teamDogfightStandings,teamName} from './arena.mjs';

const count=value=>Math.max(0,Math.floor(Number.isFinite(value)?value:0));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function formatRoundTime(seconds){
  const total=Math.ceil(Math.max(0,Number.isFinite(seconds)?seconds:0));
  return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}

export function formatKD(kills,deaths){
  return count(deaths)>0?(count(kills)/count(deaths)).toFixed(2):'—';
}

export function rankedPilots(players=[]){
  return [...players].sort((a,b)=>count(b.kills)-count(a.kills)||count(a.deaths)-count(b.deaths)||String(a.name||'').localeCompare(String(b.name||'')));
}

export function scoreboardMarkup(players=[],selfId=''){
  const teamTotals=players.some(p=>teamName(p.team))?teamDogfightStandings(players).teams:null;
  const rows=rankedPilots(players).map((p,index)=>{
    const aircraft=getAircraft(p.aircraft);
    const state=p.connected===false?' · reconnecting':p.alive===false?' · spectating':'';
    const flight=teamName(p.team),team=flight?`<span class="scoreboard-flight" data-team="${p.team}">${flight}</span> · `:'';
    return `<tr data-self="${p.id===selfId}" data-alive="${p.alive!==false}"><td>${String(index+1).padStart(2,'0')}</td><td><strong>${escape(p.name||'Pilot')}${p.id===selfId?' · YOU':''}</strong><small>${team}${escape(aircraft?.shortName||aircraft?.name||p.aircraft||'Aircraft')}${state}</small></td><td>${count(p.kills)}</td><td>${count(p.deaths)}</td><td>${formatKD(p.kills,p.deaths)}</td></tr>`;
  }).join('');
  const totals=teamTotals?`<div class="scoreboard-teams" aria-label="Team kills">${teamTotals.map(t=>`<span data-team="${t.team}">${t.name} <strong>${count(t.kills)}</strong></span>`).join('')}</div>`:'';
  return totals+'<table><thead><tr><th scope="col">#</th><th scope="col">PILOT / AIRCRAFT</th><th scope="col">KILLS</th><th scope="col">DEATHS</th><th scope="col">K/D</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

export function spectatorCandidates(players=[],selfId=''){
  const team=players.find(p=>p.id===selfId)?.team;
  return players.filter(p=>p.id!==selfId&&p.alive!==false&&p.connected!==false&&p.health!==0&&(!team||p.team===team));
}

export function chooseSpectator(players,selfId,currentId,step=0){
  const candidates=spectatorCandidates(players,selfId);
  if(!candidates.length)return null;
  const index=candidates.findIndex(p=>p.id===currentId);
  if(index<0)return candidates[step<0?candidates.length-1:0];
  return candidates[(index+step%candidates.length+candidates.length)%candidates.length];
}

export function aircraftLoadoutNote(aircraft,mode,mission){
  const weapons=[aircraft.gun?'guns':null,aircraft.missiles?'missiles':null,aircraft.bombs?'bombs':null].filter(Boolean);
  const armament=aircraft.id==='ac130'?'Pilot controls only here; switch to AC-130 crew mode for the three gun stations.':weapons.length?'Equipped with '+weapons.join(', ')+'.':'Unarmed aircraft. You can fly it, but it cannot score weapon kills.';
  const warning=mode==='squadron'&&mission?.goal?.type==='drop'&&aircraft.id!=='c47'
    ?' This sortie requires the C-47’s paratroopers; another pilot must bring them.'
    :mode==='squadron'&&['strike','bombing','nuclear'].includes(mission?.kind)&&!aircraft.bombs
      ?' This aircraft has no bombs; another pilot must carry the mission payload.'
      :mode==='coop'&&!weapons.length?' Bring a wingmate with weapons for the shared objectives.':'';
  return `${aircraft.role||'Aircraft'} · ${armament}${warning} Performance stays specific to this aircraft.`;
}
