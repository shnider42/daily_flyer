import { getAirlockStatus, getAirlockBoardingTargets, getDisembarkAction, getReturnToShipAction } from './perspective-controls.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** One entry airlock offers the actual nearby transfers to every occupant. */
export function createAirlockUI({getGame,getSnapshot,getNetwork,getSurface,dialog,runDeckAction,markAirlock,toast}){
 let view=null,pending=false;
 const options=()=>({shared:!!getNetwork(),connected:!getNetwork()||getNetwork().connected===true,fleet:getSnapshot()?.fleet||[],surface:getSurface()});
 const data=()=>{const game=getGame(),opts=options();return {game,opts,status:getAirlockStatus(game,opts),targets:getAirlockBoardingTargets(game,opts),exit:getDisembarkAction(game,opts),back:getReturnToShipAction(game,opts)};};
 const signature=value=>JSON.stringify({vessel:value.status?.vesselId,atAirlock:value.status?.atAirlock,exit:value.exit,back:value.back,targets:value.targets.map(target=>[target.id,target.name,target.boardingAction])});
 async function cross(id){
  if(pending)return;
  if(!view||view.game!==getGame()||view.network!==getNetwork()||!dialog.opened||dialog.kind!=='airlock')return;
  const value=data(),action=value.targets.find(target=>target.id===id)?.boardingAction;
  if(!action?.enabled){toast(action?.reason||'This ship is no longer available to board.','info');open();return;}
  pending=true;
  try{await runDeckAction(action.command,action.args);}finally{pending=false;}
 }
 function open(){
  const value=data();
  if(!value.status){toast('Use an airlock aboard a ship to cross to another vessel.','info');return;}
  dialog.open(`${value.status.name} · airlock`,'airlock',{eyebrow:'NEARBY SHIPS / BOARDING'});
  const choices=[];
  if(value.exit)choices.push({label:value.exit.label,detail:value.exit.reason||value.exit.detail,disabled:!value.exit.enabled,action:()=>runDeckAction(value.exit.command,value.exit.args)});
  if(value.back)choices.push({label:'Return across the tether',detail:value.back.reason||value.back.detail,disabled:!value.back.enabled,action:()=>runDeckAction(value.back.command,value.back.args)});
  for(const target of value.targets){const action=target.boardingAction;choices.push({label:action.label||`Board ${target.name}`,detail:action.reason||`${Math.round(target.distance||0)} m away · Cross onto this ship’s actual deck.`,disabled:!action.enabled,action:()=>cross(target.id)});}
  const instruction=!value.status.atAirlock?'Walk to this ship’s entry airlock, then choose the ship you want to board.':'Choose a nearby ship to cross to. Crew members can board without taking the helm.';
  const empty=!value.targets.length&&!value.exit&&!value.back?'<p>No nearby boarding targets. Have the pilot approach a disabled enemy or a ship that allows you aboard.</p>':'';
  dialog.html(`<p>${esc(instruction)}</p>${empty}<p class="mini">Both ships remain in space. Each person crosses separately; the pilot can stay at the helm.</p>`);
  if(!value.status.atAirlock&&value.status.targetId)choices.push({label:'Mark entry airlock',detail:'Follow the marker on your current deck.',action:()=>markAirlock(value.status.targetId)});
  choices.push({label:value.game.state.mode==='person'?'Back to the deck':'Keep flying',action:()=>dialog.close()});
  dialog.choices(choices);view={game:value.game,network:getNetwork(),signature:signature(value)};
 }
 function refresh(){
  if(pending||!view||!dialog.opened||dialog.kind!=='airlock')return false;
  if(view.game!==getGame()||view.network!==getNetwork()){dialog.close();view=null;return false;}
  const value=data();if(!value.status){dialog.close();view=null;return false;}
  if(signature(value)===view.signature)return false;
  const scroll=dialog.body.scrollTop;open();dialog.body.scrollTop=scroll;return true;
 }
 return {open,refresh};
}
