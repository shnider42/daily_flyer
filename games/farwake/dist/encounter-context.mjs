/** Shared geography policy. A quiet shipping hub and an isolated border are different places. */
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const inhabited=system=>system?.bodies?.some(body=>body&&body.portServices!==false&&body.landable!==false&&!['blackhole','site','ship'].includes(body.kind)&&!(['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome))));

export function systemContext(system={}){
 const radius=Math.hypot(finite(system.gx),finite(system.gy)),danger=Math.max(1,Math.min(5,finite(system.danger,1)));
 // Older authored frontier pockets keep their identity even inside the newer,
 // much larger chart. Geography never moves their existing save coordinates.
 const core=system.id==='hearth'||radius<=9&&danger<=2;
 const region=core?'core':radius>=42||danger>=5||system.cosmic?'deep':radius<=24&&danger<=2&&!system.frontier?'settled':'frontier';
 const border=!core&&danger>=3;
 const rules={
  core:{label:'Core shipping hub',security:'high',trafficCount:system.id==='hearth'?22:16,backgroundHostileCount:0,ambientEncounterChance:.025,encounterMinSeconds:1200,encounterMaxSeconds:2400,rescueSignalChance:.001,derelictSignalChance:.002,directorWeight:.025,localIncidentCooldownSeconds:14400},
  settled:{label:'Patrolled routes',security:'patrolled',trafficCount:10,backgroundHostileCount:0,ambientEncounterChance:.06,encounterMinSeconds:1050,encounterMaxSeconds:2100,rescueSignalChance:.025,derelictSignalChance:.035,directorWeight:.18,localIncidentCooldownSeconds:7200},
  frontier:{label:'Frontier lanes',security:'contested',trafficCount:5,backgroundHostileCount:Math.max(1,Math.min(3,danger-1)),ambientEncounterChance:.16,encounterMinSeconds:900,encounterMaxSeconds:1800,rescueSignalChance:.12,derelictSignalChance:.10,directorWeight:1,localIncidentCooldownSeconds:3600},
  deep:{label:'Remote space',security:'remote',trafficCount:2,backgroundHostileCount:Math.max(1,Math.min(4,danger-1)),ambientEncounterChance:.18,encounterMinSeconds:900,encounterMaxSeconds:1800,rescueSignalChance:.18,derelictSignalChance:.16,directorWeight:.8,localIncidentCooldownSeconds:3600}
 }[region];
 return{region,radius,danger,border,inhabited:!!inhabited(system),...rules};
}

/** Relative incident eligibility, not a per-frame chance. There are no core raids. */
export function incidentTypeWeight(system,type){
 const context=systemContext(system);if(!context.inhabited)return 0;
 const weights={core:{rescue:.001,outbreak:.12,raid:0,clash:0},settled:{rescue:.08,outbreak:.25,raid:0,clash:0},frontier:{rescue:.5,outbreak:.28,raid:.65,clash:.35},deep:{rescue:.7,outbreak:.16,raid:.5,clash:.25}}[context.region];
 if(type==='clash'&&!context.border)return 0;
 if(type==='raid'&&!context.border&&system.faction!=='cinder')return 0;
 return (weights[type]||0)*context.directorWeight;
}
