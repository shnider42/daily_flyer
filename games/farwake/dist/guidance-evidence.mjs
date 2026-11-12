/** Translate confirmed local actions into practice evidence. Never issues commands. */
export function guidanceActionsForResult(name,args={},answer={},before={}) {
 if(answer?.ok!==true)return [];
 const action={dock:'dock',acceptJob:'job-accept',turnInJob:'job-turn-in',boardEnemy:'board-enemy',boardHostileShip:'board-enemy',boardShip:'board-friend',returnToOwnShip:'return-airlock',takeCapturedHelm:'take-helm',exitCabin:'take-helm',quickHelm:'take-helm',scan:'scan',travel:'jump',enterGunnery:'gunnery-enter',selectGunneryBattery:'gunnery-battery',startMilitaryPassage:'service-return'}[name];
 const unchangedBattery=name==='selectGunneryBattery'&&(!args.batteryId||before.gunnery?.batteryId===args.batteryId);
 const ownShip=name==='boardShip'&&args.vesselId===before.ownedVesselId;
 const actions=action&&!unchangedBattery&&!ownShip?[action]:[];
 if(name==='takePassengerTransit')actions.push('passage-book','passage-arrive');
 if(name==='disembark'||name==='completeNpcContract'&&(before.duty?.canFinish||before.recovery?.passage&&before.recovery.passagePhase==='docked')){
  actions.push('disembark');
  if(before.recovery?.passage&&before.recovery.passagePhase==='docked')actions.push('passage-arrive');
 }
 if(name==='takeStation'&&args.role==='helm')actions.push('take-helm');
 if(name==='setCrewAccess'&&args.allowed===true)actions.push('crew-permission');
 if(name==='surfaceAction'&&args.action==='repair'&&answer.first!==false)actions.push('work');
 if(name==='surfaceAction'&&['talk','read'].includes(args.action))actions.push('person-use');
 if(name==='crewAction'&&args.action==='scan')actions.push('scan');
 if(name==='militaryCareerAction'){
  const military={join:'military-enlist',createOperation:'military-muster',joinOperation:'military-muster',launchOperation:'military-deploy',start:'military-deploy',startDeployment:'military-deploy',retry:'military-deploy',debrief:'military-debrief',returnTransport:'service-return'}[args.action];
  if(military)actions.push(military);
 }
 if(name==='npcContractAction'&&args.action==='navyOrder')actions.push('navy-order');
 return [...new Set(actions)];
}

/** NPC fire on a borrowed carrier is not practice by its human passenger. */
export function localGuidanceEvent(event,playerId,{shared=false}={}) {
 const actors=[event?.attackerId,event?.shooterId].filter(Boolean);
 if(actors.length)return actors.includes(playerId)||!shared&&actors.includes('local');
 return !!event?.ownerId&&(event.ownerId===playerId||!shared&&event.ownerId==='local');
}
