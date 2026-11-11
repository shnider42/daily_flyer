/** The opening is an ordinary paid job, presented through existing contacts and HUD. */
import { escapeHtml as esc, fmt } from './ui.mjs';

export function openingPrompt(status,{mode='person',touch=false,nearby=null,perspective=null,mining=null,interior=false}={}){
 if(!status?.active)return null;
 const use=touch?'Tap the highlighted action':'Press E',target=status.target;
 let title=status.objective,body=status.objective,controlTarget='stick';
 if(mode==='person'){
  if(status.stageId==='ore'&&!status.fallbackAvailable){
   title=interior?'Your ship is ready':'Your berth is waiting';
   body=touch?`Use ${perspective?.label||'Board ship'} at the top to continue.`:`Use ${perspective?.label||'Board ship'} at the top to continue.`;
   controlTarget='modePill';
  }else if(interior){
   title='Back to the concourse';body='Use the airlock to reach the marked contact.';
  }else if(status.stageId==='passage'){
   title='A note for Kettle';body='Port services → Book passenger passage → Kettle Station. The fare is shown before you pay.';controlTarget='modePill';
  }else if(target?.entityId&&nearby?.id===target.entityId){
   title=status.stageId==='repair'?'The amber relay':'Someone is expecting you';
   body=`${use} to ${status.stageId==='repair'?'open the relay':'talk'}.`;controlTarget='contextButton';
  }else{
   body=touch?'Walk toward the marker. The action changes when you are close.':'WASD moves. Walk to the marker, then press E when the action appears.';
  }
 }else if(status.stageId==='ore'&&!status.fallbackAvailable){
  if((status.miningInRange??mining?.inRange)&&!mining?.holdFull){title='A little ore for the dock';body=touch?'Hold MINE while the marked rock is within reach.':'Hold R to mine the marked rock.';controlTarget='mineButton';}
  else if(mining?.holdFull){title='Make room in your hold';body='Dock at Kettle and sell spare cargo, then return for the ore.';controlTarget='modePill';}
  else{title='Follow the ore marker';body=touch?'Point the STEER stick toward the rock. Release early; your ship keeps drifting.':'W adds thrust; arrows turn. S slows your drift as you reach the rock.';controlTarget='stick';}
 }else if(nearby?.type==='dock'&&nearby.id===target?.bodyId){
  title='Back at the port';body=`${use} to dock, then follow the contact marker.`;controlTarget='contextButton';
 }else{
  body=touch?'Steer toward the marked port. Release early and use BRAKE to slow your drift.':'Fly to the marked port. S or X slows your drift before docking.';
 }
 return {id:`opening:${status.stageId}:${mode}:${nearby?.id===target?.entityId?'near':controlTarget}`,title,body,compactBody:body,flow:'route',controlTarget};
}

export function createOpeningUI({getGame,dialog,invoke,acceptResult,track,openPassage,openConversation,dialogueHeader,toast,document:doc=globalThis.document}){
 const status=()=>getGame().openingMissionStatus?.();
 let busy=false;
 const captainKey=()=>{const s=getGame().state;return `${s.seed}:${s.multiplayer?.captainId||'solo'}`;};
 function mark(){const mission=status();if(!mission?.active)return;dialog.close();track(mission.target);}
 async function act(action,entityId){
  if(busy)return;busy=true;const captain=captainKey();
  try{
   const answer=await invoke('openingAction',{action,...(entityId?{entityId}:{} )});
   if(captain!==captainKey())return;
   if(!acceptResult(answer))return;
   dialog.close();
   const mission=status();if(mission?.active)track(mission.target);
   if(action==='skip')toast('The opening job is left behind. Your voyage continues.');
  }finally{busy=false;}
 }
 function openLog(){
  const mission=status();if(!mission?.active)return false;
  dialog.open(mission.title||'A small favor','opening-mission',{eyebrow:'YOUR FIRST LOCAL JOB'});
  dialog.html(`<div class="guide-card"><strong>${esc(mission.objective)}</strong></div><p>${esc(stageDetail(mission))}</p><p class="mini muted">Completion pay: ${mission.reward||35} CR · You have ${fmt(getGame().state.credits)} CR</p>`);
  const choices=[{label:'Follow the current marker',action:mark}];
  if(mission.stageId==='passage'&&getGame().atInhabitedPort)choices.push({label:'Passenger departures',detail:'See the fare before booking.',action:openPassage});
  choices.push({label:'Leave this job and explore',detail:'Keep what you have already earned. Continue with the ordinary voyage.',action:()=>act('skip')},{label:'Back to the world',action:()=>dialog.close()});
  dialog.choices(choices);return true;
 }
 function openContact(entity){
  const mission=status();
  if(!mission?.active||!mission.contactIds?.includes(entity.id))return false;
  const origin=entity.id===mission.contactEntityId,hardcore=mission.branch==='hardcore';
  let words;
  if(mission.stageId==='meet'&&origin)words=hardcore?'“Heading out? That relay has been blinking all morning. Steady it for us, then take the service note to the dockworker at Kettle. There’s a small payment at the other end.”':'“Your berth is ready. One favor before you go? Steady that relay, then take your ship beyond the docking lights and mine two ore at the marked belt. Thirty-five credits when you return.”';
  else if(mission.canFinish)words=mission.fallbackAvailable?'“The marked belt has already been worked. The relay report will do. Let’s settle up.”':hardcore?'“Morrow’s service note? Good. The next passenger run can stop worrying about that relay. Here’s your pay.”':'“There you are. Two pieces of ore and a steady relay. That’ll keep this dock moving.”';
  else words=stageDialogue(mission);
  dialog.open(entity.name,'opening-contact',{eyebrow:'A SMALL FAVOR'});dialogueHeader(entity,words);
  const choices=[];
  if(mission.stageId==='meet'&&origin)choices.push({label:'I can do that',detail:'Repair pay: 12 CR · Completion pay: 35 CR.',action:()=>act('accept',entity.id)});
  else if(mission.canFinish&&origin)choices.push({label:'Hand it over · collect 35 CR',detail:mission.fallbackAvailable||hardcore?'Deliver the service note.':`Deliver 2 ore · Your ship holds ${mission.oreAvailable??getGame().state.cargo.ore} ore.`,action:()=>act('finish',entity.id)});
  else choices.push({label:'Show me where',detail:mission.objective,action:mark});
  choices.push({label:'Ask about something else',action:()=>openConversation(entity)},{label:'See you shortly',action:()=>dialog.close()});
  dialog.choices(choices);return true;
 }
 function appendEntry(root){
  const mission=status();if(!mission?.active)return;
  const card=doc.createElement('article');card.className='entry-card';
  card.innerHTML=`<span class="eyebrow">YOUR FIRST LOCAL JOB</span><h3>${esc(mission.title||'A small favor')}</h3><p>${esc(mission.objective)}</p>`;
  const button=doc.createElement('button');button.textContent='Follow up on this favor';button.onclick=openLog;card.append(button);root.append(card);
 }
 return {openLog,openContact,appendEntry,mark};
}

function stageDetail(mission){
 if(mission.stageId==='meet')return 'Someone near the landing has a little paid work. Follow the marker and see what they need.';
 if(mission.stageId==='repair')return 'Find the marked amber panel. Its reference arrows show how the conductors should line up.';
 if(mission.fallbackAvailable)return 'The marked belt has been worked out. Bring the completed relay report back to the dockworker instead.';
 if(mission.stageId==='ore')return `Fly your ship beyond Kettle’s docking lights for two pieces of freshly mined ore at the marked belt. ${mission.oreMined||0} / 2 collected for the job. Keep two in your hold for delivery.`;
 if(mission.stageId==='passage')return 'The repaired relay leaves you with a service note for Kettle. Book a normal passenger fare from Morrow, then meet the dockworker near the landing.';
 return mission.branch==='hardcore'?'The dockworker at Kettle is waiting for the service note.':'Bring your ship and two ore back to Kettle. The dockworker near the landing will pay you.';
}
function stageDialogue(mission){
 if(mission.stageId==='repair')return '“The amber panel is marked. Match its three reference arrows and reconnect it. The port pays twelve credits for the repair.”';
 if(mission.stageId==='ore')return mission.oreMined>=2?'“Keep two pieces in the hold for us. There are still rocks outside if you need more.”':'“Take your ship beyond the docking lights to the marked belt and bring back two pieces. You can head out whenever you’re ready.”';
 if(mission.stageId==='passage')return '“The next Kettle passenger run will do. Port services has the departures and fares. Take the note to their dockworker.”';
 return '“Your work is on the docket. Follow the marker when you’re ready to settle it.”';
}
