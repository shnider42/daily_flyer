// Finite, phase-based defenders at authored approaches. No around-player spawn ring.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const group=(id,stageId,points,kinds,delay=0)=>({id,stageId,points,kinds,delay});
// Members occupy connected corners of one approach. The spread is intentional:
// a supporting weapon can cover a crossing while nearby rifles change angle.
// These remain fictional, finite encounters, not historical troop placements.
export const ENCOUNTERS = [
  [group('cordon-south','cordon-entry',[{x:680,y:1135},{x:680,y:1000},{x:820,y:960},{x:585,y:960}],['rifleman','gunner','flanker','rifleman']),
    group('cordon-market','cordon-observe',[{x:1160,y:760},{x:1010,y:960},{x:1300,y:960},{x:1160,y:1060}],['gunner','rifleman','rifleman','flanker']),
    group('cordon-withdraw','cordon-delivery',[{x:1640,y:365},{x:1510,y:580},{x:1770,y:580}],['rifleman','gunner','flanker'])],
  [group('crash-long-street','crash-observe',[{x:680,y:790},{x:575,y:960},{x:805,y:960}],['sniper','rifleman','rifleman']),
    group('crash-wreck','crash-entry',[{x:1160,y:740},{x:1030,y:960},{x:1320,y:960},{x:1160,y:1110}],['gunner','rifleman','flanker','rifleman']),
    group('crash-west','crash-west-route',[{x:680,y:355},{x:560,y:580},{x:815,y:580}],['rifleman','gunner','flanker']),
    group('crash-pickup','crash-exit-observe',[{x:2120,y:350},{x:1990,y:580},{x:2250,y:580}],['rifleman','flanker','rifleman'])],
  [group('relief-junction','relief-entry',[{x:680,y:1200},{x:680,y:1090},{x:820,y:1340},{x:1030,y:1340}],['rifleman','gunner','rifleman','flanker']),
    group('relief-road','relief-convoy',[{x:1640,y:1120},{x:1500,y:1340},{x:1790,y:1340},{x:1640,y:1460}],['gunner','rifleman','flanker','rifleman'],15),
    group('relief-collection','relief-radio',[{x:2120,y:355},{x:1980,y:580},{x:2260,y:580},{x:2120,y:735}],['gunner','rifleman','rifleman','flanker'])],
  [group('dawn-south','dawn-entry',[{x:680,y:1135},{x:580,y:960},{x:815,y:960}],['rifleman','rifleman','flanker']),
    group('dawn-long-street','dawn-observe',[{x:1160,y:690},{x:1035,y:960},{x:1295,y:960}],['sniper','rifleman','rifleman']),
    group('dawn-north','dawn-route',[{x:1640,y:355},{x:1510,y:200},{x:1780,y:200},{x:1640,y:95}],['gunner','rifleman','rifleman','flanker'])],
  [group('signal-south','signal-entry',[{x:680,y:1200},{x:680,y:1065},{x:825,y:1340},{x:1040,y:1340}],['rifleman','gunner','rifleman','flanker']),
    group('signal-avenue','signal-observe',[{x:1160,y:790},{x:1030,y:960},{x:1300,y:960}],['sniper','rifleman','rifleman']),
    group('signal-withdrawal','signal-restore',[{x:1640,y:365},{x:1505,y:580},{x:1780,y:580},{x:1640,y:715}],['gunner','rifleman','flanker','rifleman'])],
  [group('evac-south','evac-entry',[{x:680,y:1135},{x:680,y:1000},{x:550,y:960},{x:825,y:960}],['rifleman','gunner','rifleman','flanker']),
    group('evac-crossing','evac-west-stop',[{x:1160,y:365},{x:1020,y:580},{x:1295,y:580},{x:1160,y:710}],['gunner','flanker','rifleman','rifleman']),
    group('evac-north','evac-north-route',[{x:2120,y:350},{x:1980,y:200},{x:2260,y:200}],['rifleman','rifleman','flanker'])],
];
export function initializeEncounters(s,hooks){
  const definitions=ENCOUNTERS[s.missionIndex]||[];
  s.encounters={version:2,groups:definitions.map(g=>({id:g.id,triggeredAt:null,cursor:0,placedIndices:[],spawned:0,closed:false})),totalSpawned:0,nextCheck:0};
  updateEncounters(s,0,hooks,true);
}
export function updateEncounters(s,dt,hooks,initial=false){
  if(!s.encounters||s.maxEnemies<=0)return;
  s.encounters.nextCheck-=dt;if(!initial&&s.encounters.nextCheck>0)return;s.encounters.nextCheck=.5;
  const definitions=ENCOUNTERS[s.missionIndex]||[],standing=s.squad.filter(a=>a.alive&&!a.downed);
  for(const progress of s.encounters.groups){
    const definition=definitions.find(g=>g.id===progress.id);if(!definition||progress.closed)continue;
    const stageIndex=s.stages.findIndex(p=>p.id===definition.stageId);
    const preplacedSniper=initial&&definition.kinds.includes('sniper');
    // Populate the next authored approach while it is still off screen; do not
    // wait until the player is standing on its objective to invent defenders.
    const activationStage=Math.max(0,stageIndex-1);
    if(stageIndex<0||!preplacedSniper&&(s.stageIndex<activationStage||initial&&activationStage!==0))continue;
    if(progress.triggeredAt===null)progress.triggeredAt=s.time;
    if(s.time-progress.triggeredAt<(definition.delay||0))continue;
    // Groups which could not enter safely expire. They do not reappear behind
    // the player after a distant stage has already been completed.
    if(s.stageIndex>stageIndex+1||s.time-progress.triggeredAt>35+(definition.delay||0)){progress.closed=true;continue;}
    const count=definition.kinds.length+(s.difficulty==='veteran'?1:0);
    progress.placedIndices ||= [];
    for(let i=0;i<count;i++){
      if(progress.placedIndices.includes(i))continue;
      let kind=definition.kinds[i]||'rifleman';const base=definition.points[i%definition.points.length];
      if(!hooks.canAddEnemy(s,kind)){
        if(kind==='sniper'||!hooks.canAddEnemy(s,'rifleman'))continue;
        kind='rifleman';
      }
      let placed=false;
      const corners=hooks.approachPositions?.(s,base,kind)||[];
      const alternatives=[...corners,...[{x:0,y:0},{x:0,y:90},{x:90,y:0},{x:-90,y:0},{x:0,y:-90}].map(offset=>({x:base.x+offset.x,y:base.y+offset.y}))];
      for(const candidate of alternatives){
        const point=hooks.nearbyFree(s,candidate.x,candidate.y);
        if(standing.some(a=>distance(a,point)<=420)||hooks.squadCanSeePoint(s,point)||s.enemies.some(a=>a.alive&&distance(a,point)<60))continue;
        if(hooks.spawnEnemy(s,point,false,kind)){
          const actor=s.enemies.at(-1);actor.encounterId=progress.id;actor.encounterSlot=i;actor.defensive=true;actor.defenseRadius=kind==='sniper'?180:kind==='flanker'?480:350;
          progress.spawned++;s.encounters.totalSpawned++;placed=true;break;
        }
      }
      // One unsafe point must not suppress every other member of the group.
      // Retry only the unplaced member, within this group's short entry window.
      if(placed)progress.placedIndices.push(i);
    }
    progress.cursor=progress.placedIndices.length;
    if(progress.cursor>=count)progress.closed=true;
  }
}
