import {upgradeChecklist,foldDrivePlan} from './upgrade-guidance.mjs';

/** Requested equipment help. Only the existing outfitter can purchase an upgrade. */
export function createUpgradeGuideUI({dialog,getGame,getDevice=()=> 'keyboard',isShared=()=>false,onNextStep=()=>{},openReference=()=>{},openGalaxy=()=>{},document:doc=globalThis.document}) {
 const el=(tag,className='',text='')=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const button=(label,action,className='')=>{const node=el('button',className,label);node.type='button';node.onclick=action;return node;};
 let epoch=0;
 function appendRequirements(parent,id) {
  const checklist=upgradeChecklist(getGame(),id);
  if(!checklist||checklist.installed)return null;
  const details=el('details','upgrade-requirements'),summary=el('summary','','Requirements & help');
  const list=el('ul','upgrade-requirement-list');
  for(const item of checklist.requirements){
   const row=el('li',item.complete?'requirement-met':'requirement-missing');row.dataset.requirement=item.id;
   const heading=el('div','upgrade-requirement-heading'),status=el('span','requirement-status',item.complete?'Met':'Needed');
   heading.append(el('strong','',item.label),status);row.append(heading,el('p','',item.detail));list.append(row);
  }
  details.append(summary,list);
  const revision=dialog.revision,current=()=>dialog.opened&&dialog.revision===revision;
  details.append(button(id==='fold_1'?'Walk me through the fold drive':'Read the equipment guide',()=>{if(current())id==='fold_1'?openFoldDrive():openReference('upgrades');},'upgrade-help-button'));
  parent.append(details);return details;
 }
 function openFoldDrive() {
  const game=getGame(),plan=foldDrivePlan(game,{device:getDevice()}),owner=++epoch;
  dialog.open('Your first fold drive','upgrade-guide',{eyebrow:'REQUIREMENTS & NEXT STEP'});
  const root=el('div','fold-drive-guide');dialog.body.append(root);
  const current=()=>owner===epoch&&dialog.opened&&dialog.kind==='upgrade-guide'&&root.parentNode===dialog.body;
  const next=el('section','fold-drive-next');
  if(plan.installed){
   next.append(el('h3','','Your ship has a fold drive'),el('p','',plan.summary));
   next.append(button('Open the Galaxy chart',()=>{if(current())openGalaxy();},'button-primary'));
  }else if(plan.nextStep){
   next.append(el('span','fold-drive-label',plan.ready?'Equipment requirements met':'Your next step'),el('h3','',plan.nextStep.title),el('p','',plan.nextStep.detail));
   const action=button(plan.ready?'Find the shipwright':'Show me where to go',()=>{
    if(!current())return;
    // A shared captain may have changed ships since this panel was opened.
    const live=foldDrivePlan(getGame(),{device:getDevice()});
    if(live.installed){openFoldDrive();return;}
    if(live.nextStep)onNextStep(live.nextStep);
   },'button-primary');action.dataset.foldNextStep=plan.nextStep.id;next.append(action);
  }
  root.append(next);
  if(!plan.installed){
   const budget=el('section','fold-drive-budget');
   const known=Number.isFinite(plan.remainingCost.credits)&&Number.isFinite(plan.remainingCost.ore);
   budget.append(el('h3','','Equipment still to buy'),el('p','',known?`${plan.remainingCost.credits} credits + ${plan.remainingCost.ore} ore in total.`:'Return to your own ship to check the remaining equipment and cargo.'),el('p','fold-drive-note',known?`You have ${Math.floor(plan.resources.credits)} credits and ${plan.resources.ore} ore. This is the total still to spend, including missing prerequisite equipment.`:'The drive is fitted to your own vessel. Another ship’s equipment does not complete these requirements.'));
   root.append(budget);
  }
  if(!plan.installed){
  const progress=el('section','fold-drive-progress');progress.append(el('h3','','The full path'));
  const steps=el('ol','fold-drive-steps');
  for(const item of plan.steps){
   const row=el('li',item.complete?'step-complete':'step-pending'),details=el('details'),summary=el('summary');
   row.dataset.foldStep=item.id;details.open=!plan.installed&&item.id===plan.nextStep?.id;
   const title=el('strong','',item.title),status=el('span','requirement-status',item.complete?'Done':item.id===plan.nextStep?.id?'Next':'To do');
   summary.append(title,status);details.append(summary,el('p','',item.detail));row.append(details);steps.append(row);
  }
  progress.append(steps);root.append(progress);
  }
  const actions=el('div','fold-drive-actions');
  actions.append(button('Read the full instructions',()=>{if(current())openReference('fold-drive');}),button('Refresh my checklist',()=>{if(current())openFoldDrive();}));
  root.append(actions,el('p','fold-drive-note',isShared()?'Progress checked when opened. Your shared galaxy keeps moving; refresh to check again.':'This checklist uses your captain’s current progress. Opening it pauses your solo voyage.'));
  return root;
 }
 return {appendRequirements,openFoldDrive};
}
