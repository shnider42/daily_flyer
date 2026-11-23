// Finite, phase-based defenders at authored approaches. No around-player spawn ring.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const group=(id,stageId,points,kinds,delay=0)=>({id,stageId,points,kinds,delay});
export const ENCOUNTERS = [
  [group('cordon-south','cordon-entry',[{x:680,y:1000},{x:850,y:960},{x:1160,y:1340}],['rifleman','rifleman','flanker']),
    group('cordon-market','cordon-observe',[{x:1160,y:580},{x:1640,y:960},{x:1370,y:960}],['gunner','rifleman','rifleman']),
    group('cordon-withdraw','cordon-delivery',[{x:1640,y:200},{x:2120,y:580}],['rifleman','flanker'])],
  [group('crash-long-street','crash-observe',[{x:680,y:790},{x:1160,y:960}],['sniper','rifleman']),
    group('crash-wreck','crash-entry',[{x:1640,y:960},{x:1160,y:580},{x:1640,y:1340}],['gunner','rifleman','flanker']),
    group('crash-west','crash-west-route',[{x:680,y:200},{x:1160,y:200}],['rifleman','rifleman']),
    group('crash-pickup','crash-exit-observe',[{x:2120,y:200},{x:2120,y:960}],['rifleman','flanker'])],
  [group('relief-junction','relief-entry',[{x:680,y:960},{x:1160,y:1340}],['rifleman','rifleman']),
    group('relief-road','relief-convoy',[{x:1640,y:1340},{x:1640,y:960},{x:2120,y:1340}],['gunner','rifleman','flanker'],15),
    group('relief-collection','relief-radio',[{x:2120,y:200},{x:1640,y:580}],['rifleman','gunner'])],
  [group('dawn-south','dawn-entry',[{x:680,y:960},{x:1160,y:1340}],['rifleman','rifleman']),
    group('dawn-long-street','dawn-observe',[{x:1160,y:690},{x:1640,y:960}],['sniper','flanker']),
    group('dawn-north','dawn-route',[{x:1640,y:200},{x:2120,y:580}],['gunner','rifleman'])],
  [group('signal-south','signal-entry',[{x:680,y:960},{x:680,y:1340}],['rifleman','flanker']),
    group('signal-avenue','signal-observe',[{x:1160,y:790},{x:1640,y:960}],['sniper','rifleman']),
    group('signal-withdrawal','signal-restore',[{x:1640,y:580},{x:2120,y:580},{x:1640,y:200}],['gunner','rifleman','flanker'])],
  [group('evac-south','evac-entry',[{x:1160,y:1340},{x:680,y:790}],['rifleman','rifleman']),
    group('evac-crossing','evac-west-stop',[{x:1160,y:200},{x:1640,y:580}],['gunner','flanker']),
    group('evac-north','evac-north-route',[{x:2120,y:580},{x:2120,y:200}],['rifleman','rifleman'])],
];
export function initializeEncounters(s,hooks){
  const definitions=ENCOUNTERS[s.missionIndex]||[];
  s.encounters={version:1,groups:definitions.map(g=>({id:g.id,triggeredAt:null,cursor:0,spawned:0,closed:false})),totalSpawned:0,nextCheck:0};
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
    if(stageIndex<0||!preplacedSniper&&(s.stageIndex<stageIndex||initial&&stageIndex!==0))continue;
    if(progress.triggeredAt===null)progress.triggeredAt=s.time;
    if(s.time-progress.triggeredAt<(definition.delay||0))continue;
    // Groups which could not enter safely expire. They do not reappear behind
    // the player after a distant stage has already been completed.
    if(s.stageIndex>stageIndex+1||s.time-progress.triggeredAt>35+(definition.delay||0)){progress.closed=true;continue;}
    const count=definition.kinds.length+(s.difficulty==='veteran'?1:0);
    for(let i=progress.cursor;i<count;i++){
      const kind=definition.kinds[i%definition.kinds.length],base=definition.points[i%definition.points.length];
      if(!hooks.canAddEnemy(s,kind))break;
      let placed=false;
      for(const offset of [{x:0,y:0},{x:0,y:90},{x:90,y:0},{x:-90,y:0},{x:0,y:-90}]){
        const point=hooks.nearbyFree(s,base.x+offset.x,base.y+offset.y);
        if(standing.some(a=>distance(a,point)<=420)||hooks.squadCanSeePoint(s,point)||s.enemies.some(a=>a.alive&&distance(a,point)<60))continue;
        if(hooks.spawnEnemy(s,point,false,kind)){
          const actor=s.enemies.at(-1);actor.encounterId=progress.id;actor.defensive=true;actor.defenseRadius=kind==='sniper'?180:kind==='flanker'?500:310;
          progress.spawned++;s.encounters.totalSpawned++;placed=true;break;
        }
      }
      // An unsafe position can be skipped, but never moved to a random angle.
      if(!placed)break;
      progress.cursor=i+1;
    }
    if(progress.cursor>=count)progress.closed=true;
  }
}
