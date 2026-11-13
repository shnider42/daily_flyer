import {foldDriveTestState} from './fold-drive-test.mjs';

const shown=value=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
const amount=value=>Number.isFinite(Number(value))?String(Math.round(Number(value)*10)/10):'—';
const resultLabel=result=>result?.ok?'Allowed':`Blocked${result?.code?` (${result.code})`:''}`;
const actionLabel=attempt=>({travel:'Jump attempt',buyUpgrade:'Installation attempt',launch:'Launch attempt',dock:'Docking attempt'}[attempt?.action]||'Test attempt');

/** A report contains only the isolated fixture and its command observations. */
export function foldDriveTestReport(state){
 if(!state)return '';
 return JSON.stringify({test:'Farwake fold-drive proving ground',setup:state.case?.id,goal:state.case?.goal,phase:state.phase,complete:!!state.complete,current:state.current,checks:state.checks,attempts:state.attempts},null,2);
}

/** Controls deliberately allow blocked attempts so players can check the real gates. */
export function createFoldDriveTestUI({dialog,getSession,runCommand,openMap=()=>{},chooseExercise=()=>{},retry=()=>{},exit=()=>{},resume=()=>dialog.close(),getDevice=()=> 'keyboard',document:doc=globalThis.document,clipboard=globalThis.navigator?.clipboard}){
 const el=(tag,className='',text='')=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 let epoch=0;
 function open({lastCommand=null,lastTarget=null,scrollTop=null}={}){
  const session=getSession(),state=foldDriveTestState(session);
  if(!state)return null;
  const owner=++epoch;
  dialog.open('Fold-drive proving ground','fold-test',{eyebrow:'TEST MODE · ISOLATED & UNSAVED'});
  const revision=dialog.revision,root=el('div','fold-drive-test');dialog.body.append(root);
  const current=()=>owner===epoch&&getSession()===session&&dialog.opened&&dialog.kind==='fold-test'&&dialog.revision===revision&&root.parentNode===dialog.body;
  let busy=false;
  const actionButtons=[];
  const notice=el('p','fold-test-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const button=(label,action,className='')=>{const node=el('button',className,label);node.type='button';node.onclick=()=>{if(current())return action();};return node;};
  const commandButton=(label,name,args={},primary=false)=>{
   const node=button(label,async()=>{
    if(busy)return;
    busy=true;for(const control of actionButtons)control.disabled=true;
    notice.textContent='Checking the game rules…';
    const priorScroll=dialog.body.scrollTop||0;
    try{
     await runCommand(name,args);
     if(current())open({lastCommand:name,lastTarget:args.id,scrollTop:priorScroll});
    }catch(error){
     if(current())notice.textContent=`The test command could not finish: ${error?.message||'try again.'}`;
    }finally{
     if(current()){busy=false;for(const control of actionButtons)control.disabled=false;}
    }
   },primary?'button-primary':'');
   node.dataset.foldCommand=name;if(args.id)node.dataset.foldTarget=args.id;actionButtons.push(node);return node;
  };
  const heading=el('section','fold-test-heading');
  heading.append(el('h3','',state.case.title),el('p','',state.case.description),el('p','fold-test-goal',state.case.goal));
  root.append(heading);
  if(state.complete||state.phase==='failed'){
   const status=el('section',`fold-test-status ${state.complete?'is-complete':'is-failed'}`);
   status.append(el('strong','',state.title));
   if(state.detail!==state.case.goal)status.append(el('p','',state.detail));
   root.append(status);
  }

  const metrics=el('dl','fold-test-metrics');
  for(const [label,value] of [
   ['System',state.current.systemName],['Position',state.current.atPort?'At the training port':state.current.mode==='ship'?'Flying your ship':'Aboard your ship'],
   ['Drive range',`${amount(state.current.range)} ly`],['Fuel',`${amount(state.current.fuel)} / ${amount(state.current.maxFuel)}`]
  ]){const row=el('div');row.append(el('dt','',label),el('dd','',shown(value)));metrics.append(row);}
  root.append(metrics);

  if(state.lastAttempt){
   const attempt=state.lastAttempt,receipt=el('section',`fold-test-receipt ${attempt.passed?'is-pass':'is-failed'}`);
   receipt.setAttribute('role','status');receipt.setAttribute('aria-live','polite');
   receipt.append(el('strong','',`${attempt.passed?'PASS':'CHECK FAILED'} · ${actionLabel(attempt)}`));
   receipt.append(el('p','',`Expected: ${resultLabel(attempt.expected)}. Actual: ${resultLabel(attempt.actual)}.`));
   if(attempt.actual.reason)receipt.append(el('p','fold-test-note',attempt.actual.reason));
   const observations=el('ul','fold-test-observations');
   for(const item of attempt.observations||[]){const row=el('li',item.passed?'is-pass':'is-failed');row.append(el('span','',`${item.passed?'✓':'!'} ${item.label}`),el('span','',`Expected ${shown(item.expected)} · got ${shown(item.actual)}`));observations.append(row);}
   if(attempt.actual.ok&&attempt.action==='travel')receipt.append(el('p','fold-test-note',`Fuel ${amount(attempt.before.fuel)} → ${amount(attempt.after.fuel)} · jumps ${amount(attempt.before.jumps)} → ${amount(attempt.after.jumps)}`));
   if(attempt.actual.ok&&attempt.action==='buyUpgrade')receipt.append(el('p','fold-test-note',`Credits ${amount(attempt.before.credits)} → ${amount(attempt.after.credits)} · ore ${amount(attempt.before.ore)} → ${amount(attempt.after.ore)}`));
   if(observations.children.length){const details=el('details','fold-test-details');details.open=!attempt.passed;details.append(el('summary','',`Observed checks · ${observations.children.length}`),observations);receipt.append(details);}
   root.append(receipt);
  }

  const installation=['installation','calibration'].includes(state.case.id);
  if(installation){
   const workshop=el('section','fold-test-workshop');
   workshop.append(el('h3','','Installation checks'),el('p','fold-test-note',`Test funds: ${amount(state.current.credits)} credits · ${amount(state.current.ore)} ore. Calibration: ${state.current.calibration?'supplied for this test':'missing in this test'}.`));
   workshop.append(el('p','fold-test-note','Try fitting the drive early to check a refusal, or fit the components in order. Each successful purchase spends the listed test resources.'));
   for(const upgrade of state.upgrades){
    const row=el('div','fold-test-upgrade'),title=el('div','fold-test-upgrade-title');
    title.append(el('strong','',upgrade.name),el('span','fold-test-note',upgrade.installed?'Installed':`${amount(upgrade.cost)} credits + ${amount(upgrade.ore)} ore`));row.append(title);
    if(!upgrade.installed){
     row.append(el('p','fold-test-note',upgrade.ok?'Requirements met.':upgrade.reason||'Requirements are not met.'));
     row.append(commandButton(`${upgrade.ok?'Install':'Try to install'} ${upgrade.name}`,'buyUpgrade',{id:upgrade.id},upgrade.id==='fold_1'));
     if(upgrade.requirements?.length){const details=el('details','fold-test-details'),list=el('ul','fold-test-requirements');details.append(el('summary','','Requirements'));
      for(const item of upgrade.requirements){const requirement=el('li',item.complete?'is-pass':'');requirement.append(el('strong','',`${item.complete?'Met':'Needed'} · ${item.label}`),el('span','',item.detail));list.append(requirement);}
      details.append(list);row.append(details);
     }
    }
    workshop.append(row);
   }
   if(state.current.atPort)workshop.append(commandButton('Launch the test ship','launch'));
   root.append(workshop);
  }

  const target=state.destinations.find(destination=>destination.id===state.targetId&&!destination.current)||state.destinations.find(destination=>!destination.current);
  if(target){
   const jump=el('section','fold-test-jump');
   jump.append(el('h3','',`Jump to ${target.name}`),el('p','fold-test-note',`${amount(target.distance)} ly away · ${amount(target.fuelCost)} fuel required · your range ${amount(state.current.range)} ly`));
   jump.append(el('p','',target.ok?'The drive is ready for this destination.':target.reason||'The jump is currently blocked.'));
   jump.append(commandButton(`Try jump to ${target.name}`,'travel',{id:target.id},!installation||state.upgrades.some(upgrade=>upgrade.id==='fold_1'&&upgrade.installed)));
   if(!target.ok)jump.append(el('p','fold-test-note','The attempt button stays available so you can verify this refusal.'));
   root.append(jump);
  }

  if(state.checks?.length){
   const checklist=el('ul','fold-test-checklist');checklist.setAttribute('aria-label','Exercise checks');
   for(const item of state.checks){const row=el('li',item.complete?'is-pass':'');row.append(el('span','',item.complete?'Passed':'Pending'),el('span','',item.label));checklist.append(row);}
   root.append(checklist);
  }
  const routes=el('div','fold-test-navigation');routes.append(button('Open Galaxy chart',openMap),button('Fly in test range',resume));root.append(routes);
  const more=el('details','fold-test-details'),moreActions=el('div','fold-test-extra-actions');more.append(el('summary','','Other destinations & controls'));
  for(const destination of state.destinations.filter(item=>!item.current&&item.id!==target?.id)){
   const row=el('div','fold-test-alternate');row.append(el('p','fold-test-note',`${destination.name} · ${amount(destination.distance)} ly · ${amount(destination.fuelCost)} fuel`),commandButton(`Try jump to ${destination.name}`,'travel',{id:destination.id}));moreActions.append(row);
  }
  if(state.current.atPort&&!installation)moreActions.append(commandButton('Launch the test ship','launch'));
  else if(state.current.mode==='ship'&&state.current.portId)moreActions.append(commandButton('Dock at this training port','dock',{id:state.current.portId}));
  moreActions.append(el('p','fold-test-note',`Calibration is ${state.current.calibration?'supplied':'missing'} in this setup. A fold drive is also called a hyperdrive. The test uses the game’s real installation, launch, and jump commands.`));
  more.append(moreActions);root.append(more,notice);

  const log=el('details','fold-test-details fold-test-log');log.append(el('summary','',`Test report · ${state.attempts.length} ${state.attempts.length===1?'attempt':'attempts'}`));
  if(state.attempts.length){
   const history=el('ol','fold-test-history');
   for(const attempt of [...state.attempts].reverse().slice(0,10)){const row=el('li',attempt.passed?'is-pass':'is-failed');row.append(el('strong','',`${attempt.passed?'PASS':'CHECK FAILED'} · ${actionLabel(attempt)}`),el('span','',`Expected ${resultLabel(attempt.expected)}; actual ${resultLabel(attempt.actual)}.`));history.append(row);}
   log.append(history);
  }else log.append(el('p','fold-test-note','No commands attempted yet. Inspecting requirements does not count as a test.'));
  const report=el('textarea','fold-test-report');report.id='fold-test-report';report.readOnly=true;report.spellcheck=false;report.rows=7;report.value=foldDriveTestReport(state);report.setAttribute('aria-label','Fold-drive test report');
  const copied=el('p','fold-test-note');copied.setAttribute('role','status');
  log.append(button('Copy test report',async()=>{
   if(!current())return;
   try{if(!clipboard?.writeText)throw new Error('Clipboard unavailable');await clipboard.writeText(report.value);if(current())copied.textContent='Test report copied.';}
   catch{if(current()){report.focus();report.select?.();copied.textContent='Select and copy the report below.';}}
  }),report,copied);root.append(log);
  const management=el('div','fold-test-management');management.append(button('Reset this setup',retry),button('Choose another setup',chooseExercise),button('Exit test mode',exit));root.append(management);
  root.append(el('p','fold-test-note',`${getDevice()==='touch'?'Tap':'Choose'} “Fly in test range” to use the ordinary ship controls. Test mode has no saved rewards or progression; exiting restores your voyage.`));
  if(scrollTop!==null){
   dialog.body.scrollTop=scrollTop;
   const next=actionButtons.find(control=>control.dataset.foldCommand===lastCommand&&control.dataset.foldTarget===lastTarget)||actionButtons.find(control=>control.dataset.foldCommand===lastCommand)||actionButtons.find(control=>control.dataset.foldCommand==='travel');
   next?.focus({preventScroll:true});
  }
  return root;
 }
 return {open};
}
