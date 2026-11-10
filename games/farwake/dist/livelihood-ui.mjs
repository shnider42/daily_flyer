/** Port travel and paid crew work share one compact, context-aware menu. */
import { escapeHtml as esc, fmt } from './ui.mjs';

export function createLivelihoodUI({getGame,dialog,invoke,acceptResult,refreshWorld,markEntity,openJobs,openShipyard,openProfile,openDamage}){
 const game=()=>getGame();
 const purse=()=>`${fmt(game().state.credits)} CR AVAILABLE`;
 const finish=async(name,args={})=>{const answer=await invoke(name,args);if(!acceptResult(answer))return false;dialog.close();refreshWorld();return true;};
 function openPort(){
  if(game().state.npcContract?.active){openDuty();return;}
  const g=game(),port=g.atInhabitedPort,berth=g.state.livelihoods?.parkedShip;
  const parked=g.galaxy.find(s=>s.id===berth?.systemId)?.bodies.find(b=>b.id===berth?.bodyId);
  dialog.open(port?'The port concourse':'Your life between voyages','port-services',{eyebrow:purse()});
  dialog.html(`<p>${g.ownsShip?(parked&&!g.canUseOwnShipHere()?`Your ship is parked at <strong>${esc(parked.name)}</strong>. It stays there while you travel or work as crew.`:'You can take local work, travel as a passenger, or sign on with an NPC captain. Your own ship stays at its berth.'):'You have your field kit and your credits. Local work and paid crew contracts can fund your first ship.'}</p><p class="mini muted">These services are available to regular and Hardcore captains alike.</p>`);
  dialog.choices([
   {label:'Book passenger passage',detail:'Paid travel to another inhabited planet or station. See the fare before buying.',disabled:!port,action:openPassage},
   {label:'Sign on as paid crew',detail:'Gunner, firehand, or medic aboard a vessel flown by its NPC captain.',disabled:!port,action:openCrewJobs},
   {label:'Find local work',detail:'Reach the contract exchange. Maintenance shifts need no ship or entry fee.',disabled:!port,action:()=>{dialog.close();markEntity({type:'jobboard'});}},
   {label:g.ownsShip?'Visit the shipwright':'Buy your first ship',detail:g.ownsShip?'Find the local workshop to inspect hulls and equipment.':'Used starters cost credits. No trade-in and no ore required.',disabled:!port,action:()=>{dialog.close();markEntity({type:'mechanic'});}},
   {label:'Your captain',detail:'Appearance and the traits you chose at departure.',action:openProfile},
   {label:'Return to the world',action:()=>dialog.close()}
  ]);
 }
 function openPassage(){
  const g=game(),routes=g.passengerRoutes();
  dialog.open('Passenger departures','passage',{eyebrow:`${g.currentBody?.name||'PORT'} / ${purse()}`});
  dialog.html(`<p>Choose a local destination. The fare is paid once on departure. ${g.ownsShip?'Your own ship and crew stay at their current berth.':'You arrive on foot and can buy another ticket when you are ready.'}</p>${routes.length?'':'<p>No passenger departures are available at this location.</p>'}`);
  dialog.choices([...routes.map(route=>({label:route.name||route.bodyName,detail:`Fare ${route.fare} CR · You have ${fmt(g.state.credits)} CR · After ${fmt(Math.max(0,g.state.credits-route.fare))} CR${route.ok?'':` · ${route.reason}`}`,disabled:!route.ok,action:()=>confirmPassage(route.bodyId)})),{label:'Back to port services',action:openPort}]);
 }
 function confirmPassage(bodyId){
  const g=game(),quote=g.passengerQuote(bodyId);
  dialog.open(`Passage to ${quote.name||'another port'}`,'passage-confirm',{eyebrow:'PAID PASSENGER SERVICE'});
  dialog.html(`<p><strong>${esc(quote.originName)} → ${esc(quote.name)}</strong></p><div class="guide-card"><p>Fare: <strong>${quote.fare} CR</strong><br>You have: <strong>${fmt(g.state.credits)} CR</strong><br>After payment: <strong>${fmt(g.state.credits-quote.fare)} CR</strong></p></div><p>You disembark at the destination landing. ${g.ownsShip?'Your ship is not transported with you.':''}</p>`);
  dialog.choices([{label:`Pay ${quote.fare} CR & travel`,disabled:!quote.ok,action:()=>finish('takePassengerTransit',{bodyId})},{label:'Choose another departure',action:openPassage}]);
 }
 function openCrewJobs(){
  const g=game();if(g.state.npcContract?.active){openDuty();return;}
  const offers=g.npcContractOffers();
  dialog.open('A berth on the watch','crew-jobs',{eyebrow:`PAID CREW CONTRACTS / ${purse()}`});
  dialog.html('<p>A local captain supplies the ship, flies the route, and brings you back to this port. You work aboard their actual vessel. Pay depends on the work you complete; waiting aboard earns nothing.</p>');
  dialog.choices([...offers.map(offer=>({label:offer.roleName||offer.name||offer.title,detail:`${offer.task||offer.description||''} · Up to ${offer.reward} CR · No sign-on fee.`,disabled:offer.available===false,action:()=>confirmCrew(offer)})),{label:'Back to port services',action:openPort}]);
 }
 function confirmCrew(offer){
  const roleId=offer.roleId||offer.id;
  dialog.open(offer.roleName||offer.name||offer.title,'crew-job-confirm',{eyebrow:'SIGNING ON / NPC CAPTAIN'});
  dialog.html(`<p>${esc(offer.description||offer.task)}</p><p><strong>Full duty pay: ${offer.reward} CR</strong><br>Sign-on cost: 0 CR · You have ${fmt(game().state.credits)} CR</p><p>Follow your duty marker aboard the ship. The captain handles flight. You can request an early return; wages reflect completed work. You disembark and collect pay after the ship docks.</p>`);
  dialog.choices([{label:'Sign on & board',action:()=>finish('acceptNpcContract',{roleId})},{label:'Choose another duty',action:openCrewJobs}]);
 }
 function markDuty(){
  const status=game().npcContractStatus();dialog.close();markEntity(status?.target||{});
 }
 function openDuty(){
  const g=game(),s=g.npcContractStatus();if(!s?.active){openPort();return;}
  const phases={boarding:'Preparing to depart',outbound:'On the outward leg',working:'Duty in progress',returning:'Returning to port',docked:'Docked · ready to disembark',failed:'Contract interrupted'};
  dialog.open(s.roleName||'Your crew duty','crew-duty',{eyebrow:`${s.shipName||'NPC VESSEL'} / ${phases[s.phase]||s.phase}`});
  dialog.html(`<div class="guide-card"><strong>${esc(s.task||'Follow the marked duty station.')}</strong><p>${s.done?'Duty completed.':`${Math.round((s.progress||0)*100)}% of assigned work completed.`}<br>Earned: <strong>${fmt(s.earned||0)} / ${s.reward} CR</strong></p></div><p>${esc(s.routeName||`Returning to ${s.origin?.name||'the hiring port'}`)}. The NPC captain is at the helm.</p>`);
  const choices=[];
  if(s.canFinish)choices.push({label:`Disembark & collect ${fmt(s.earned||0)} CR`,action:()=>finish('completeNpcContract')});
  else if(s.phase==='failed')choices.push({label:'Leave the interrupted contract',action:()=>finish('completeNpcContract')});
  else{
   choices.push({label:'Mark my duty location',detail:s.roleId==='gunner'?'Reach the weapons station, then hold FIRE while the target is in range.':'Return to the deck and follow the marker.',action:markDuty});
   if(s.roleId==='medic')choices.push({label:'Treat the injured crewmate',detail:s.phase==='working'?'Reach the patient and medical equipment first. The employer supplies treatment.':s.done?'Treatment complete. The captain is taking you home.':'Reach the medical station. Treatment begins on the service run.',disabled:s.phase!=='working',action:()=>finish('npcContractAction',{action:'heal'})});
   if(s.roleId==='firehand')choices.push({label:'Open damage control',detail:'Reach the marked compartment. Suppress the fire, then patch or repair as needed.',action:openDamage});
   if(s.phase!=='returning')choices.push({label:s.phase==='boarding'?'End the watch before departure':'Request an early return',detail:s.phase==='boarding'?'Disembark at this port. No work means no wages.':'The captain flies back. Partial pay reflects work actually completed.',action:async()=>{if(await finish('cancelNpcContract'))openDuty();}});
  }
  choices.push({label:'Back to the deck',action:()=>dialog.close()});dialog.choices(choices);
 }
 return {openPort,openPassage,openCrewJobs,openDuty,markDuty};
}
