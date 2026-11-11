import { recurringPresence } from './social-world.mjs';
/**
 * The people of a port share a clock, rather than each browser rolling an AI
 * tick. Routes are compiled once for a surface, then sampled by elapsed seconds.
 * One real second is one local minute. No offscreen population needs ticking.
 */
export const NPC_DAY_SECONDS = 24 * 60;
export const NPC_TALK_SECONDS = 24;
const caches = new WeakMap();
const PEOPLE = new Set(['npc', 'mechanic', 'medic']);
const BLOCKED = new Set([0, 2, 5]);
const mod = (n, length) => ((n % length) + length) % length;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const hash = value => {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};
const placeId = place => String(typeof place === 'string' ? place : place?.parentId || place?.id || '').split(':site:')[0];
const localOffset = place => hash(placeId(place)) % 61 - 30;

export function npcClock(seconds = 0, place = '') {
  const elapsed = finite(seconds) + 480 + localOffset(place);
  const minuteOfDay = Math.floor(mod(elapsed, NPC_DAY_SECONDS));
  const hour = Math.floor(minuteOfDay / 60), minute = minuteOfDay % 60;
  return {
    hour, minute, day: Math.floor(elapsed / NPC_DAY_SECONDS),
    text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    period: hour < 6 || hour >= 22 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  };
}

function eligible(surface, entity) {
  // Ship crew, rescued passengers and hostile actors already have canonical
  // combat/damage positions. Ambient routes must never move those bodies.
  return ['station', 'planet', 'site'].includes(surface.kind) && !surface.barren &&
    PEOPLE.has(entity.type) && !entity.data?.automated && !entity.data?.fixedPost && !entity.data?.rescuePassenger &&
    !entity.data?.encounter && !entity.hostile && (entity.data?.health ?? 100) > 0;
}

function navigation(surface) {
  const tile = surface.tileSize || 24, size = surface.cols * surface.rows;
  const open = new Uint8Array(size), horizontal = new Uint8Array(size), vertical = new Uint8Array(size);
  for (let y = 0; y < surface.rows; y++) for (let x = 0; x < surface.cols; x++) {
    if (!BLOCKED.has(surface.tiles[y]?.[x]) && surface.tiles[y]?.[x] !== undefined) open[y * surface.cols + x] = 1;
  }
  // Mark only the cells a solid can overlap. This avoids scanning every piece
  // of wilderness furniture for every tile when entering a large planet.
  for (const solid of surface.solids || []) {
    const left = Math.max(0, Math.floor((solid.x - 6) / tile - 1));
    const right = Math.min(surface.cols - 1, Math.ceil((solid.x + solid.w + 6) / tile));
    const top = Math.max(0, Math.floor((solid.y - 6) / tile - 1));
    const bottom = Math.min(surface.rows - 1, Math.ceil((solid.y + solid.h + 6) / tile));
    const intersects = (x, y) => x + 6 > solid.x && x - 6 < solid.x + solid.w && y + 6 > solid.y && y - 6 < solid.y + solid.h;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const px = (x + .5) * tile, py = (y + .5) * tile;
      if (intersects(px, py)) open[y * surface.cols + x] = 0;
      if (intersects(px + tile / 2, py)) horizontal[y * surface.cols + x] = 1;
      if (intersects(px, py + tile / 2)) vertical[y * surface.cols + x] = 1;
    }
  }
  const index = point => Math.floor(point.y / tile) * surface.cols + Math.floor(point.x / tile);
  const point = cell => ({ x: (cell % surface.cols + .5) * tile, y: (Math.floor(cell / surface.cols) + .5) * tile });
  const adjacent = cell => {
    const x = cell % surface.cols, y = Math.floor(cell / surface.cols), out = [];
    if (x > 0 && !horizontal[cell - 1]) out.push(cell - 1);
    if (x + 1 < surface.cols && !horizontal[cell]) out.push(cell + 1);
    if (y > 0 && !vertical[cell - surface.cols]) out.push(cell - surface.cols);
    if (y + 1 < surface.rows && !vertical[cell]) out.push(cell + surface.cols);
    return out;
  };
  const routeCache = new Map();
  const route = (from, to) => {
    if (from === to) return [point(from)];
    const key = `${from}:${to}`;
    if (routeCache.has(key)) return routeCache.get(key);
    const previous = new Int32Array(size).fill(-1), queue = new Int32Array(size);
    let read = 0, write = 0;
    if (!open[from] || !open[to]) return [point(from)];
    queue[write++] = from; previous[from] = from;
    while (read < write && previous[to] < 0) {
      const cell = queue[read++];
      for (const next of adjacent(cell)) if (open[next] && previous[next] < 0) {
        previous[next] = cell; queue[write++] = next;
      }
    }
    if (previous[to] < 0) return [point(from)];
    const cells = [];
    for (let cell = to; cell !== from; cell = previous[cell]) cells.push(cell);
    cells.push(from); cells.reverse();
    const result = cells.map(point);
    routeCache.set(key, result); routeCache.set(`${to}:${from}`, result.slice().reverse());
    return result;
  };
  const distances = from => {
    const values = new Int16Array(size).fill(-1), queue = new Int32Array(size);
    let read = 0, write = 0;
    values[from] = 0; queue[write++] = from;
    while (read < write) {
      const cell = queue[read++];
      if (values[cell] >= 36) continue;
      for (const next of adjacent(cell)) if (open[next] && values[next] < 0) {
        values[next] = values[cell] + 1; queue[write++] = next;
      }
    }
    return values;
  };
  return { tile, open, index, point, adjacent, route, distances };
}

const ROLE_TASKS = {
  mechanic: ['workbench', 'equipment', 'work', 'Tuning couplers', 'Checking relays', 'tool'],
  engineer: ['workbench', 'equipment', 'work', 'Testing circuits', 'Checking relays', 'tool'],
  scientist: ['equipment', 'sample', 'console', 'Testing samples', 'Logging readings', 'scanner'],
  medic: ['cabinet', 'bed', 'console', 'Checking supplies', 'Reviewing charts', 'medical'],
  doctor: ['cabinet', 'bed', 'console', 'Checking supplies', 'Reviewing charts', 'medical'],
  bartender: ['bar', 'table', 'vending', 'Pouring drinks', 'Clearing tables', 'cup'],
  dockworker: ['cargo', 'crate', 'delivery', 'Checking freight', 'Moving freight', 'crate'],
  courier: ['delivery', 'cargo', 'jobboard', 'Sorting dispatches', 'Carrying dispatches', 'packet'],
  merchant: ['cargo', 'bar', 'market-stall', 'Checking stock', 'Tallying orders', 'ledger'],
  salvager: ['cargo', 'equipment', 'workbench', 'Sorting salvage', 'Testing parts', 'tool'],
  archivist: ['books', 'console', 'terminal', 'Filing records', 'Checking entries', 'ledger'],
  governor: ['console', 'table', 'terminal', 'Reading petitions', 'Checking notices', 'ledger'],
  settler: ['planter', 'table', 'market-stall', 'Tending supplies', 'Checking stores', 'packet'],
  broker: ['console', 'jobboard', 'terminal', 'Checking manifests', 'Reviewing contracts', 'ledger'],
  warden: ['exit', 'console', 'equipment', 'Checking arrivals', 'On patrol', 'scanner'],
  security: ['exit', 'console', 'equipment', 'Checking arrivals', 'On patrol', 'scanner'],
  pilot: ['console', 'jobboard', 'cargo', 'Checking departures', 'Updating flight plans', 'ledger'],
  refugee: ['bench', 'cargo', 'table', 'Sorting belongings', 'Checking departures', 'packet']
};
function residentRole(entity) {
  if (ROLE_TASKS[entity.role]) return entity.role;
  const label = String(entity.data?.roleLabel || '').toLowerCase();
  if (/medic|doctor|nurs|clinic/.test(label)) return 'medic';
  if (/engineer|mechanic|shipwright/.test(label)) return 'engineer';
  if (/dispatch|pilot|flight/.test(label)) return 'pilot';
  if (/courier|runner/.test(label)) return 'courier';
  if (/guard|warden|officer|marshal/.test(label)) return 'warden';
  if (/broker|handler|dealer|fixer|liaison/.test(label)) return 'broker';
  if (/archiv|record|custodian/.test(label)) return 'archivist';
  if (/foreman|dock|freight/.test(label)) return 'dockworker';
  if (/bartender|canteen|common.room/.test(label)) return 'bartender';
  if (/survey|research|scientist/.test(label)) return 'scientist';
  return ROLE_TASKS[entity.data?.dialogueRole] ? entity.data.dialogueRole : 'settler';
}
const roleTasks = entity => entity.data?.techLevel==='preflight'||entity.data?.culture==='reedbound'?['planter','table','bench',entity.data?.cultureRole==='guard'?'Walking the boundary':'Tending supplies','Carrying baskets','basket']:ROLE_TASKS[residentRole(entity)];

function buildPlan(surface, entity, nav, reserved) {
  const origin = nav.index(entity), home = nav.point(origin), salt = hash(entity.id), distance = nav.distances(origin);
  const occupied = new Set(surface.entities.filter(other => other !== entity).map(nav.index));
  const tasks = roleTasks(entity), taskKinds = tasks.slice(0, 3);
  const props = [...surface.decor, ...surface.entities.map(other => ({ ...other, kind: other.type, w: 0, h: 0 }))];
  const anchor = (kinds, purpose, avoid = []) => {
    const choices = [];
    for (const prop of props) {
      if (!kinds.includes(prop.kind)) continue;
      const target = { x: prop.x + (prop.w || 0) / 2, y: prop.y + (prop.h || 0) / 2 };
      if (purpose === 'rest' && prop.kind === 'bed' && reserved.has(`bed:${target.x}:${target.y}`)) continue;
      const cells = [];
      // Candidate floor is outside the fixture. Navigation neighbors cannot
      // start inside a solid bed/table, so enumerate its small perimeter here.
      const left = Math.max(0, Math.floor(prop.x / nav.tile) - 2), right = Math.min(surface.cols - 1, Math.floor((prop.x + (prop.w || 0)) / nav.tile) + 2);
      const top = Math.max(0, Math.floor(prop.y / nav.tile) - 2), bottom = Math.min(surface.rows - 1, Math.floor((prop.y + (prop.h || 0)) / nav.tile) + 2);
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) cells.push(y * surface.cols + x);
      for (const cell of cells) {
        if (!nav.open[cell] || distance[cell] < 0 || distance[cell] > 24 || occupied.has(cell) || avoid.includes(cell)) continue;
        const point = nav.point(cell), dx = Math.max(prop.x - point.x, 0, point.x - prop.x - (prop.w || 0));
        const dy = Math.max(prop.y - point.y, 0, point.y - prop.y - (prop.h || 0));
        if (Math.hypot(dx, dy) > nav.tile * 1.8) continue;
        const travelScore = purpose === 'errand' ? Math.abs(distance[cell] - 10) * 3 : distance[cell] * 2;
        const score = travelScore + Math.hypot(dx, dy) / 6 + kinds.indexOf(prop.kind) * 5 + (reserved.has(`${purpose}:${cell}`) ? 90 : 0) + ((hash(`${entity.id}:${cell}`) % 11) / 10);
        choices.push({ cell, point, target, kind: prop.kind, score });
      }
    }
    choices.sort((a, b) => a.score - b.score);
    let chosen = choices[0];
    if (!chosen) {
      const nearby = [];
      for (let cell = 0; cell < distance.length; cell++) if (distance[cell] >= 2 && distance[cell] <= 5 && !occupied.has(cell) && !avoid.includes(cell)) {
        nearby.push({ cell, point: nav.point(cell), target: home, kind: 'open', score: distance[cell] + (reserved.has(`${purpose}:${cell}`) ? 90 : 0) + (hash(`${entity.id}:${cell}`) % 19) / 10 });
      }
      nearby.sort((a, b) => a.score - b.score);
      chosen = nearby[0] || { cell: origin, point: home, target: home, kind: 'open' };
    }
    reserved.add(`${purpose}:${chosen.cell}`);
    if (purpose === 'rest' && chosen.kind === 'bed') reserved.add(`bed:${chosen.target.x}:${chosen.target.y}`);
    return chosen;
  };
  const workA = anchor(taskKinds, 'work', [origin]);
  const workB = anchor([...taskKinds].reverse(), 'errand', [origin, workA.cell]);
  const meal = anchor(['table', 'bar', 'vending', 'bench'], 'meal', [origin]);
  const rest = anchor(salt % 2 === 0 ? ['bed'] : ['bench', 'table', 'bed'], 'rest', [origin, meal.cell]);
  const sleeping = rest.kind === 'bed', restAction = sleeping ? 'sleeping' : 'resting';
  const stop = (place, activity, label, phase, item = null) => ({ ...place, activity, label, phase, item });
  const restStop = stop(rest, restAction, sleeping ? 'Sleeping' : 'Off watch', 'rest');
  const mealStop = stop(meal, 'eating', 'Meal break', 'meal', 'cup');
  const first = stop(workA, 'working', tasks[3], 'work', tasks[5]);
  const second = stop(workB, 'working', tasks[4], 'work', tasks[5]);
  const homeStop = stop({ cell: origin, point: home, target: home, kind: 'home' }, 'working', tasks[3], 'work', tasks[5]);
  const segments = [], speed = 27 + salt % 7;
  let cursor = rest.cell, time = 0;
  const phase = (duration, stops) => {
    const paths = [], source = cursor;
    for (const target of stops) {
      const points = nav.route(cursor, target.cell), length = (points.length - 1) * nav.tile;
      paths.push({ points, length, target }); cursor = target.cell;
    }
    const distance = paths.reduce((n, path) => n + path.length, 0), travelTime = distance / speed;
    // Nearest reachable destinations keep travel modest. This fallback also
    // accommodates unusual imported surfaces without overrunning the day.
    const factor = Math.min(1, duration * .8 / Math.max(.001, travelTime));
    const dwell = Math.max(0, duration - travelTime * factor) / stops.length;
    for (const path of paths) {
      const length = path.length / speed * factor;
      if (length > 0) {
        segments.push({ start: time, end: time + length, path: path.points, target: path.target, moving: true });
        time += length;
      }
      segments.push({ start: time, end: time + dwell, path: [path.target.point], target: path.target, moving: false });
      time += dwell;
    }
    return source;
  };
  phase(330, [restStop]);
  phase(90, [mealStop]);
  phase(300, [first, second, homeStop, first, second, homeStop, first, second, homeStop, first, second, homeStop]);
  phase(60, [mealStop]);
  phase(300, [homeStop, second, first, homeStop, second, first, homeStop, second, first, homeStop, second, first]);
  phase(180, [mealStop, stop(rest, 'resting', 'Off watch', 'rest')]);
  phase(180, [restStop]);
  const role = residentRole(entity), nightShift = /night[ -]?shift/i.test(entity.data?.roleLabel || '') ? 720 : role === 'bartender' ? 1080 : ['warden', 'security'].includes(role) && salt % 2 === 0 ? 720 : 0;
  return { entity, origin: home, segments, offset: 480 + localOffset(surface) + (salt % 51 - 25) + nightShift, tasks, speed, transitions:new Map() };
}

function compiled(surface) {
  let cached = caches.get(surface);
  if (cached) return cached;
  const actors = surface.entities.filter(entity => eligible(surface, entity)).sort((a, b) => a.id.localeCompare(b.id));
  const nav = actors.length ? navigation(surface) : null, reserved = new Set();
  const plans = actors.filter(entity => nav.open[nav.index(entity)]).map(entity => buildPlan(surface, entity, nav, reserved));
  cached = { actors: plans.map(plan => plan.entity), plans, nav };
  caches.set(surface, cached);
  return cached;
}

export function npcLifeActors(surface) {
  return surface?.entities ? compiled(surface).actors : [];
}

function sample(plan, seconds) {
  const time = mod(seconds + plan.offset, NPC_DAY_SECONDS), segments = plan.segments;
  let low = 0, high = segments.length - 1;
  while (low < high) { const mid = (low + high) >>> 1; if (time < segments[mid].end) high = mid; else low = mid + 1; }
  const segment = segments[low], target = segment.target, route = segment.path;
  let point = route[0], facing;
  if (segment.moving && route.length > 1) {
    const progress = Math.min(1, Math.max(0, (time - segment.start) / (segment.end - segment.start)));
    const at = progress * (route.length - 1), index = Math.min(route.length - 2, Math.floor(at)), part = at - index;
    const from = route[index], to = route[index + 1];
    point = { x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part };
    facing = to.x !== from.x ? to.x > from.x ? 'right' : 'left' : to.y > from.y ? 'down' : 'up';
  } else {
    const dx = target.target.x - point.x, dy = target.target.y - point.y;
    facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
  }
  return { ...point, facing, moving: segment.moving, target };
}

function routePose(points,progress){
 const distances=points.slice(1).map((p,index)=>Math.hypot(p.x-points[index].x,p.y-points[index].y)),length=distances.reduce((a,b)=>a+b,0);let at=Math.max(0,Math.min(1,progress))*length;
 for(let index=0;index<distances.length;index++){const span=distances[index],from=points[index],to=points[index+1];if(at<=span||index===distances.length-1){const t=span?at/span:0,dx=to.x-from.x,dy=to.y-from.y;return{x:from.x+dx*t,y:from.y+dy*t,facing:Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up'};}at-=span;}
 return{...points[0],facing:'down'};
}
function recurringPose(surface,plan,nav,presence){
 if(!['arriving','leaving'].includes(presence.phase))return null;
 const key=`${presence.phase}:${presence.slot}`;let path=plan.transitions.get(key);
 if(!path){const start=presence.phase==='arriving'?surface.exit:sample(plan,presence.start),end=presence.phase==='arriving'?sample(plan,presence.end):surface.exit;path=[{x:start.x,y:start.y},...nav.route(nav.index(start),nav.index(end)),{x:end.x,y:end.y}].filter((point,index,all)=>!index||Math.hypot(point.x-all[index-1].x,point.y-all[index-1].y)>.001);plan.transitions.set(key,path);}
 return{...routePose(path,presence.progress),moving:true,target:{label:presence.phase==='arriving'?'Just arrived':'Leaving for passage',phase:'travel',item:null,kind:'route'}};
}

function updateAnimals(surface,seconds){
 for(const animal of surface.ambientAnimals||[]){
  const points=animal.path;if(!Array.isArray(points)||points.length<2)continue;
  const phase=mod(seconds+hash(animal.id)%31,15),walking=Math.floor((seconds+hash(animal.id)%31)/15)*9+Math.min(9,phase),loop=[...points,points[0]],length=loop.slice(1).reduce((n,p,index)=>n+Math.hypot(p.x-loop[index].x,p.y-loop[index].y),0),progress=mod(walking*(8+hash(animal.id)%4),length)/length;
  Object.assign(animal,routePose(loop,progress),{moving:phase<9});
 }
}

/** Freeze a conversation at its real route point. No client coordinates needed. */
export function makeNpcHold(surface, id, seconds, duration = NPC_TALK_SECONDS) {
  const entity = npcLifeActors(surface).find(actor => actor.id === id);
  if (!entity || !Number.isFinite(seconds)) return null;
  const phaseAt = finite(entity.life?.routeTime, seconds), until = seconds + Math.max(1, Math.min(90, finite(duration, NPC_TALK_SECONDS)));
  return { id, at: seconds, until, phaseAt, resumeAt: 2 * until - phaseAt, x: entity.x, y: entity.y, facing: entity.facing || 'down' };
}

/**
 * Holds are authority-authored records in this same seconds domain. After a
 * conversation a resident walks briskly along their existing route to catch up;
 * removing the hold at resumeAt is position-continuous, including day wrap.
 */
export function updateNpcLife(surface, seconds = 0, { holds = [], disabled = false } = {}) {
  if (!surface?.entities || disabled || !Number.isFinite(seconds)) return surface;
  const { plans, nav } = compiled(surface), clock = npcClock(seconds, surface);
  for (const plan of plans) {
    const entity = plan.entity;
    if (entity.hidden&&!entity.data?.recurringId || (entity.data?.health ?? 100) <= 0) continue;
    const hold = holds.find(record => record?.id === entity.id && Number.isFinite(record.at) && Number.isFinite(record.until) && record.until >= record.at && seconds >= record.at && seconds < (record.resumeAt ?? 2 * record.until - finite(record.phaseAt, record.at)));
    const phaseAt = hold ? finite(hold.phaseAt, hold.at) : seconds;
    const talking = !!hold && seconds <= hold.until;
    const routeTime = hold ? talking ? phaseAt : Math.min(seconds, phaseAt + 2 * (seconds - hold.until)) : seconds;
    const presence=recurringPresence(entity,routeTime,surface);
    if(presence){entity.hidden=!presence.present;if(!presence.present){entity.moving=false;entity.life={activity:'traveling',label:'Away',phase:'travel',routeTime,localHour:clock.hour,clock:clock.text};continue;}}
    const pose = presence&&recurringPose(surface,plan,nav,presence)||sample(plan, routeTime), task = pose.target;
    entity.x = pose.x; entity.y = pose.y; entity.facing = talking ? hold.facing || pose.facing : pose.facing;
    entity.moving = !talking && pose.moving;
    entity.life = {
      activity: talking ? 'talking' : pose.moving ? 'walking' : task.activity,
      label: talking ? 'In conversation' : task.phase==='travel'?task.label:pose.moving ? task.phase === 'meal' ? 'To the canteen' : task.phase === 'rest' ? 'Going off watch' : task.item === 'crate' ? 'Moving freight' : 'On an errand' : task.label,
      task: task.label, phase: task.phase, item: talking ? null : task.item,
      carrying: !talking && pose.moving && task.item === 'crate',
      routeTime, localHour: clock.hour, clock: clock.text,
      // Feet remain on reachable floor; these cues never change hitboxes.
      restingAt: task.kind, restTarget: task.phase === 'rest' ? task.target : null
    };
  }
  updateAnimals(surface,seconds);
  return surface;
}
