// Accept only the complete previous authored revision; missing modern entities
// are corruption, not an invitation to manufacture progress.
import { SHADOW_WORLD_REVISION, SHADOW_ADDED_SOLID_BOUNDS } from './shadow.mjs';
const LEGACY = Object.freeze({
  "enemies": [
    "aqueduct-emplacement",
    "forge-watch",
    "forge-spitter",
    "forge-brute",
    "iron-warden",
    "exchange-runner",
    "exchange-emplacement",
    "lantern-stalker",
    "lantern-runner",
    "lab-runner",
    "lab-emplacement",
    "echo-bulwark",
    "echo-root-0",
    "echo-root-1",
    "echo-root-2",
    "echo-root-3",
    "echo-root-4",
    "echo-root-5",
    "echo-root-6",
    "sun-guardian",
    "sun-turret",
    "sun-turret-west"
  ],
  "pickups": [
    "arrival-ammo",
    "arrival-health",
    "rivet-repeater",
    "pump-shotgun",
    "null-projector",
    "breach-lance",
    "access-key",
    "health-expansion",
    "street-cache",
    "aqueduct-cache",
    "exchange-ammo",
    "exchange-rivets",
    "exchange-health",
    "exchange-shells",
    "exchange-cells",
    "exchange-slugs",
    "forge-ammo",
    "forge-rivets",
    "forge-health",
    "forge-shells",
    "forge-cells",
    "forge-slugs",
    "null-ammo",
    "null-rivets",
    "null-health",
    "null-shells",
    "null-cells",
    "null-slugs",
    "lantern-ammo",
    "lantern-rivets",
    "lantern-health",
    "lantern-shells",
    "lantern-cells",
    "lantern-slugs",
    "gantry-ammo",
    "gantry-rivets",
    "gantry-health",
    "gantry-shells",
    "gantry-cells",
    "gantry-slugs",
    "hydra-ammo",
    "hydra-rivets",
    "hydra-health",
    "hydra-shells",
    "hydra-cells",
    "hydra-slugs",
    "bridge-ammo",
    "bridge-rivets",
    "bridge-health",
    "bridge-shells",
    "bridge-cells",
    "bridge-slugs",
    "engine-ammo",
    "engine-rivets",
    "engine-health",
    "engine-shells",
    "engine-cells",
    "engine-slugs"
  ],
  "doors": [
    "arrival",
    "lab-seal",
    "lab-north",
    "sun-south",
    "sun-west",
    "security",
    "null-shortcut"
  ],
  "interactables": [
    "aux-power",
    "relay-west",
    "relay-east",
    "extraction",
    "exchange-refuge",
    "lantern-refuge",
    "lab-refuge",
    "chapel-refuge",
    "echo-refuge",
    "transit-road",
    "transit-sun",
    "transit-exchange",
    "transit-chapel",
    "jump-street-0",
    "jump-street-back-1",
    "jump-street-1",
    "jump-street-back-2",
    "jump-street-2",
    "jump-street-back-3",
    "jump-street-3",
    "jump-street-back-4",
    "jump-aqueduct-0",
    "jump-aqueduct-back-1",
    "jump-aqueduct-1",
    "jump-aqueduct-back-2",
    "jump-aqueduct-2",
    "jump-aqueduct-back-3",
    "jump-aqueduct-3",
    "jump-aqueduct-back-4",
    "cache-panel",
    "secret-chapel",
    "secret-gantry",
    "record-road",
    "record-exchange",
    "record-forge",
    "record-lab",
    "record-lantern",
    "record-hydra",
    "record-chapel",
    "record-engine"
  ]
});

const exactIds = (items, ids) => Array.isArray(items) && items.length === ids.length
  && new Set(items.map(item => item?.id)).size === ids.length
  && items.every(item => ids.includes(item?.id));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const corners = (actor, radius) => [[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]
  .map(([dx,dz]) => ({x:actor.x+dx,z:actor.z+dz}));

function clearAt(point, radius, level, snapshot) {
  return corners(point,radius).every(p => {
    const x=Math.floor(p.x),z=Math.floor(p.z);
    return level.grid[z]?.[x] === '.' && !snapshot.doors.some(saved => {
      const door=level.doors.find(d=>d.id===saved.id);
      return !saved.open && door && Math.floor(door.x)===x && Math.floor(door.z)===z;
    });
  });
}

function relocateNewCollider(actor, radius, level, snapshot) {
  if (!actor || !finite(actor.x) || !finite(actor.z)) return;
  const footprint=corners(actor,radius);
  const newlyBlocked=footprint.some(p => level.grid[Math.floor(p.z)]?.[Math.floor(p.x)]==='#'
    && SHADOW_ADDED_SOLID_BOUNDS.some(b=>p.x>=b.x1&&p.x<b.x2&&p.z>=b.z1&&p.z<b.z2));
  if (!newlyBlocked) return;
  // Never repair an actor that was also inside a pre-existing wall.
  const wasLegitimate=footprint.every(p=>level.grid[Math.floor(p.z)]?.[Math.floor(p.x)]==='.'
    || SHADOW_ADDED_SOLID_BOUNDS.some(b=>p.x>=b.x1&&p.x<b.x2&&p.z>=b.z1&&p.z<b.z2));
  if (!wasLegitimate) return;
  const candidates=[];
  for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++){
    const point={x:Math.floor(actor.x)+dx+.5,z:Math.floor(actor.z)+dz+.5};
    if(clearAt(point,radius,level,snapshot))candidates.push(point);
  }
  candidates.sort((a,b)=>Math.hypot(a.x-actor.x,a.z-actor.z)-Math.hypot(b.x-actor.x,b.z-actor.z));
  if(candidates[0])Object.assign(actor,candidates[0],{jump:null,elevation:0});
}

export function migrateShadowSnapshot(snapshot, level, difficulty, defaults, validateLegacy) {
  if (!level.shadow || snapshot?.shadowRevision===SHADOW_WORLD_REVISION) return true;
  if (!snapshot || snapshot.shadowRevision!==undefined
    || !Object.entries(LEGACY).every(([key,ids])=>exactIds(snapshot[key],ids))) return false;
  const legacyGrid=level.grid.map(row=>[...row]);
  for(const b of SHADOW_ADDED_SOLID_BOUNDS)for(let z=b.z1;z<b.z2;z++)for(let x=b.x1;x<b.x2;x++)legacyGrid[z][x]='.';
  const legacyLevel={...level,grid:legacyGrid.map(row=>row.join('')),
    ...Object.fromEntries(Object.entries(LEGACY).map(([key,ids])=>[key,level[key].filter(item=>ids.includes(item.id))]))};
  if(typeof validateLegacy!=='function'||!validateLegacy({...snapshot,shadowRevision:SHADOW_WORLD_REVISION},legacyLevel))return false;
  for(const key of ['pickups','doors','interactables']){
    const flag=key==='pickups'?'collected':key==='doors'?'open':'used';
    for(const base of level[key])if(!LEGACY[key].includes(base.id))snapshot[key].push({id:base.id,[flag]:false});
  }
  for(const base of level.enemies)if(!LEGACY.enemies.includes(base.id))snapshot.enemies.push({
    ...base,...defaults(base),health:Math.round(base.health*difficulty.health),
    maxHealth:Math.round(base.maxHealth*difficulty.health),active:false,angle:Math.PI,
    attackCooldown:1,hitTimer:0,pathTimer:0,
  });
  relocateNewCollider(snapshot.player,.22,level,snapshot);
  const newWall=(x,z)=>SHADOW_ADDED_SOLID_BOUNDS.some(b=>x>=b.x1&&x<b.x2&&z>=b.z1&&z<b.z2)
    &&level.grid[Math.floor(z)]?.[Math.floor(x)]==='#';
  for(const enemy of snapshot.enemies){
    relocateNewCollider(enemy,enemy.type==='brute'?.28:.2,level,snapshot);
    const mark=enemy.telegraph;
    if(mark&&(newWall(mark.x,mark.z)||newWall(mark.fromX,mark.fromZ))){
      enemy.telegraph=null;enemy.attackCooldown=Math.max(.8,enemy.attackCooldown||0);
      if(['charge-windup','volley-windup','charge'].includes(enemy.bossPhase)){
        enemy.bossPhase='recover';enemy.phaseTimer=1.65/difficulty.attackRate;enemy.chargeTargetId=null;enemy.chargeTargetKind=null;
      }
      if(enemy.shieldPhase==='windup'){enemy.shieldPhase='exposed';enemy.shieldTimer=1.4;}
    }
  }
  if(snapshot.projectiles)snapshot.projectiles=snapshot.projectiles.filter(shot=>!newWall(shot.x,shot.z));
  snapshot.shadowRevision=SHADOW_WORLD_REVISION;
  return true;
}
