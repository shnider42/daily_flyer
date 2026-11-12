/** Read-only explanations of the same equipment and story gates used by Game. */
import {UPGRADES} from './content.mjs';

const byId=id=>UPGRADES.find(upgrade=>upgrade.id===id);
const normalized=id=>String(id).toLowerCase().replace(/[^a-z0-9]/g,'');
const number=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0);
const price=upgrade=>`${upgrade.cost} credits${upgrade.ore?` + ${upgrade.ore} ore`:''}`;
// This deliberately matches upgradeInfo's compatibility rule for prerequisites.
const satisfies=(upgrades,id)=>!!upgrades?.[id]||Object.keys(upgrades||{}).some(key=>normalized(key)===normalized(id));
const row=(id,label,complete,detail)=>({id,label,complete:!!complete,detail});
const step=(id,title,complete,detail,extra={})=>({id,title,complete:!!complete,detail,...extra});

function personalEquipment(game){
 const state=game.state,mp=state.multiplayer||{},personal=state.npcContract?.personal;
 const displayed=mp.aboardVesselId||mp.portVesselId||state.ship?.id;
 const borrowed=!!(mp.serverAuthoritative&&displayed&&displayed!==mp.ownedVesselId);
 const known=!!personal||!borrowed;
 return {known,borrowed,upgrades:known?(personal?.upgrades||state.upgrades||{}):{},cargo:known?(personal?.cargo||state.cargo||{}):{},ship:personal?.ship||state.ship};
}

function accessRequirement(game,equipment){
 const access=game.ownShipAccess({atPort:true});
 const own=!!game.ownsShip&&!equipment.borrowed&&!game.state.npcContract?.active;
 const complete=own&&game.atInhabitedPort&&access.ok;
 const detail=equipment.borrowed?'You are using another vessel. Return to your own ship and bring it to an inhabited port shipwright.':!access.ok?access.reason:!game.atInhabitedPort?'Dock at an inhabited port, step out, and visit its shipwright. Tinbell is a barren moon and has no outfitter.':'Your own ship is at this port. Visit the shipwright in person to fit equipment.';
 return row('access','Your own ship at an inhabited port',complete,detail);
}

/** Every unmet gate stays visible; reading never purchases or completes anything. */
export function upgradeChecklist(game,id){
 const upgrade=byId(id),info=game.upgradeInfo(id);
 if(!upgrade)return {id,name:'Unknown upgrade',installed:false,ready:false,eligible:false,reason:info.reason,requirements:[]};
 const equipment=personalEquipment(game),installed=equipment.known&&!!equipment.upgrades[id],access=accessRequirement(game,equipment);
 const requirements=[access];
 for(const required of [...new Set([...(upgrade.requires||[]),...(id==='fold_1'?['thrusters_1','scanner_1']:[])])]){
  const part=byId(required),complete=equipment.known&&satisfies(equipment.upgrades,required);
  requirements.push(row(required,part?.name||required,complete,!equipment.known?'Return to your own ship to check its installed equipment.':complete?'Installed.':`Fit ${part?.name||required} at an inhabited port outfitter${part?` for ${price(part)}`:''}.`));
 }
 if(upgrade.conditions||id==='fold_1'){
  const complete=game.conditionsMet(upgrade.conditions)&&(id!=='fold_1'||game.hasFlag('belt_signal_found'));
  requirements.push(row('story',id==='fold_1'?'Complete “Something in the belt”':'Complete the equipment prerequisites',complete,complete?'Chapter complete; the calibration is available.':id==='fold_1'?'Meet Iona and collect payment for a local job at Kettle. Then personally mine six ore and scan the Tinbell evacuation beacon from your ship.':upgrade.requirementText||'Check the current story chapter in Log → Missions.'));
 }
 const credits=number(game.state.credits),ore=number(equipment.cargo.ore),oreCost=upgrade.ore||0;
 requirements.push(row('credits',`${upgrade.cost} credits`,credits>=upgrade.cost,`You have ${credits} credits${credits<upgrade.cost?`; need ${upgrade.cost-credits} more`:'. Enough for this upgrade'}.`));
 if(oreCost)requirements.push(row('ore',`${oreCost} ore in your hold`,equipment.known&&ore>=oreCost,!equipment.known?'Return to your own ship to check its cargo.':`You have ${ore} ore${ore<oreCost?`; need ${oreCost-ore} more`:'. Enough for this upgrade'}. Installation spends this ore.`));
 const ready=!installed&&info.ok&&access.complete;
 return {id,name:upgrade.name,installed,ready,eligible:!!info.ok,reason:installed?'Already installed.':!access.complete?access.detail:info.reason||'Equipment requirements met. Visit the shipwright to install.',requirements};
}

/** The first-drive route advances from actual personal progress, not a fixed FAQ. */
export function foldDrivePlan(game,{device='keyboard'}={}){
 const state=game.state,equipment=personalEquipment(game),fold=byId('fold_1'),parts=['thrusters_1','scanner_1'].map(byId),chain=[...parts,fold];
 const touch=['touch','mobile','phone','tablet'].includes(device),has=flag=>game.hasFlag(flag);
 const fitted=equipment.known&&(satisfies(equipment.upgrades,'fold_1')||Object.keys(equipment.upgrades).some(id=>/hyperdrive|fold.?drive|lightdrive|jumpdrive|ftldrive/i.test(id))||number(equipment.ship?.warpRange)>0);
 const installed=!!game.ownsShip&&fitted;
 const totalCost=chain.reduce((total,upgrade)=>({credits:total.credits+upgrade.cost,ore:total.ore+(upgrade.ore||0)}),{credits:0,ore:0});
 const remainingCost=installed?{credits:0,ore:0}:equipment.known?chain.filter(upgrade=>!satisfies(equipment.upgrades,upgrade.id)).reduce((total,upgrade)=>({credits:total.credits+upgrade.cost,ore:total.ore+(upgrade.ore||0)}),{credits:0,ore:0}):{credits:null,ore:null};
 const checklist=upgradeChecklist(game,'fold_1'),calibrated=has('belt_signal_found'),firstShift=calibrated||has('first_shift_done'),mined=calibrated||has('mined_six_ore'),scanned=calibrated||has('belt_signal_scanned'),credits=number(state.credits),ore=number(equipment.cargo.ore),minedCount=number(state.stats?.oreMined);
 const controls=touch?'Open Tools and hold MINE.':'Hold R to use the mining beam.';
 const scanControls=touch?'Approach the signal until Investigate is offered, then tap it.':'Approach until the signal is within scanner range, then press F to scan.';
 const steps=[
  step('meet-iona','Meet Iona at Kettle Station',firstShift||has('talked_mechanic'),'Dock at Kettle in Hearth. On foot, find Iona Vale, the shipwright in the northern workshop, and talk to her.'),
  step('first-job','Finish a local contract and collect payment',firstShift||has('first_job'),'At a contract exchange, take “An honest shift”, repair its three service panels, then return to the exchange to collect payment. Completing the panels alone does not finish the job.'),
  step('first-shift','Finish “A ship of your own” at Kettle',firstShift,'After meeting Iona and collecting a job payment, be on foot at Kettle Station with a ship of your own. The first chapter completes there.'),
  step('mine-six','Personally mine six ore',mined,`Your mining record: ${minedCount} / 6 ore. Fly to a mineable asteroid in Hearth, slow beside it, and mine. ${controls} This is cumulative mined ore: gifts or cargo already in your hold do not count; spending ore does not erase mining progress.`),
  step('beacon','Scan the Tinbell evacuation beacon',scanned,`From your ship in Hearth, track “Tinbell evacuation beacon”, the signal near Tinbell. ${scanControls} Do this after the first chapter and six mined ore. You do not need to land on Tinbell or buy the Echo scanner to scan this beacon. The scanner needs 8 reactor charge.`),
  step('calibration','Complete “Something in the belt”',calibrated,'The chapter completes in ship mode in Hearth after the first chapter, six mined ore, and the beacon scan. This unlocks calibration automatically; there is no separate calibration item to buy.'),
  ...parts.map(part=>step(part.id,`Fit ${part.name}`,equipment.known&&satisfies(equipment.upgrades,part.id),`Visit an inhabited port outfitter with your own ship present. ${part.name} costs ${price(part)}.`,{upgradeId:part.id})),
  step('credits',`Keep ${fold.cost} credits for the drive`,credits>=fold.cost,`You have ${credits} credits${credits<fold.cost?`; earn ${fold.cost-credits} more for the drive itself`:''}. Prerequisite upgrades are paid separately. Repeat local maintenance contracts if you need more.`),
  step('ore',`Keep ${fold.ore} ore for the drive`,equipment.known&&ore>=fold.ore,equipment.known?`Your own hold has ${ore} ore${ore<fold.ore?`; collect ${fold.ore-ore} more for the drive itself`:''}. Prerequisite upgrades also spend ore. Keep this ore instead of selling it or turning it in for a mining contract.`:'Return to your own ship to check its ore. The drive alone consumes 8 ore; prerequisites consume more.'),
  step('port','Bring your ship to an inhabited port',checklist.requirements.find(item=>item.id==='access').complete,checklist.requirements.find(item=>item.id==='access').detail),
  step('install','Fit Fold Drive I at the shipwright',installed,`At the outfitter, choose Fold Drive I → Install upgrade. It spends ${price(fold)} and opens travel to nearby systems.`,{upgradeId:'fold_1'})
 ];
 const find=id=>steps.find(item=>item.id===id),pending=id=>({...find(id),complete:false});
 let nextStep=null;
 if(!installed){
  if(state.npcContract?.active)nextStep=step('finish-duty','Return from your current crew duty',false,'Open Crew duty, finish the watch or request a return to port, then disembark and return to your own ship. An employer’s or Navy ship is not yours to refit.');
  else if(!game.ownsShip)nextStep=step('own-ship','Earn a ship of your own first',false,'Open Port services for local work and the used-ship counter. A first used hull is bought with credits only; a borrowed ship does not give you ownership or permission to refit it.');
  else if(equipment.borrowed)nextStep=step('return-own-ship','Return to your own ship',false,'You are looking at another vessel’s equipment. Use Crew & boarding or Port services to return to your own hull; its equipment and remaining cost cannot be checked from this view.');
  else if(game.ownShipAccess({atPort:true}).code==='ship-location')nextStep=step('return-own-ship','Return to the port where your ship is berthed',false,game.ownShipAccess({atPort:true}).reason);
  else if(!firstShift){
   if(!has('talked_mechanic'))nextStep=pending('meet-iona');
   else if(!has('first_job'))nextStep=pending('first-job');
   else nextStep=pending('first-shift');
  }else if(!mined)nextStep=pending('mine-six');
  else if(!scanned)nextStep=pending('beacon');
  else if(!calibrated)nextStep=pending('calibration');
  else {
   const part=parts.find(item=>!satisfies(equipment.upgrades,item.id)),purchase=part||fold,access=checklist.requirements.find(item=>item.id==='access');
   if(credits<purchase.cost)nextStep=step('credits',`Earn ${purchase.cost-credits} more credits for ${purchase.name}`,false,`You have ${credits}; ${purchase.name} costs ${price(purchase)}. Visit a contract exchange for a paid maintenance shift, then collect its payment.`,{upgradeId:purchase.id});
   else if(ore<(purchase.ore||0))nextStep=step('ore',`Mine ${purchase.ore-ore} more ore for ${purchase.name}`,false,`Your hold has ${ore}; ${purchase.name} needs ${purchase.ore} ore. ${controls} Keep the ore for fitting this upgrade.`,{upgradeId:purchase.id});
   else if(!access.complete)nextStep=step('port',game.ownShipAccess({atPort:true}).code==='ship-location'?'Return to the port where your ship is berthed':'Visit an inhabited port shipwright',false,access.detail,{upgradeId:purchase.id});
   else nextStep=part?pending(part.id):pending('install');
  }
  // Cargo can block both the story's mining lesson and later parts gathering.
  if(['mine-six','ore'].includes(nextStep?.id)&&equipment.known&&game.cargoUsed>=number(equipment.ship?.cargoCap))nextStep=step('port','Make room in your cargo hold',false,`Your hold is full. Visit an inhabited port to sell unneeded crystal or fit an affordable prerequisite, then return to mining. The ore sale sells all ore, so check what you need for the remaining upgrades before using it.`,{resumeStep:nextStep.id});
 }
 const summary=installed?`A fold-capable drive is already fitted to your own ship. ${state.npcContract?.active?'Finish your current crew duty and return to that ship before travelling.':'Launch, open the galaxy map, and select a destination within range; the map checks fuel and access.'}`:!equipment.known?`Return to your own ship to check its equipment. The complete first-drive chain costs ${totalCost.credits} credits + ${totalCost.ore} ore before any chapter or job rewards.`:`Still to fit: ${remainingCost.credits} credits + ${remainingCost.ore} ore across the missing equipment. This is the remaining purchase total, not an extra fee; your current credits and ore count toward it. The complete chain starts at ${totalCost.credits} credits + ${totalCost.ore} ore.`;
 return {installed,ready:!installed&&checklist.ready,summary,steps,nextStep,remainingCost,resources:{credits,ore:equipment.known?ore:null}};
}
