import { platformSolid } from './shadow.mjs';
import * as THREE from './vendor/three.module.js';

// All texture, creature and weapon artwork below is original and generated locally.
// Geometry is deliberately simple: artwork, silhouette and composition carry detail.
const WALL_HEIGHT = 2.5;
const EYE_HEIGHT = 1.25;
const VIEW_DEPTH = 28;
// A 32-cell batch keeps draw submission low while the 81-cell world still has
// independently culled regions. Smaller chunks cost more calls than they save.
const WORLD_CHUNK = 32;
const SECTORS = {
  arrival: { base:[67,69,63], panel:'#535d59', dark:'#222e2d', trim:'#b3b6a0', accent:'#e2b978', light:0xe6c590, motif:'ribs' },
  foundry: { base:[71,47,40], panel:'#6b4636', dark:'#302621', trim:'#b59068', accent:'#ed9b53', light:0xf4aa67, motif:'furnace' },
  floodworks: { base:[39,65,65], panel:'#31575b', dark:'#172f36', trim:'#7ca9a4', accent:'#79d0b9', light:0x8fe0ce, motif:'pipes' },
  archives: { base:[56,50,69], panel:'#50445e', dark:'#252533', trim:'#a9a0b7', accent:'#c8b5ed', light:0xcdbff0, motif:'shelves' },
  rail: { base:[67,60,42], panel:'#625739', dark:'#302b24', trim:'#a69b72', accent:'#e3c66d', light:0xe9d183, motif:'rails' },
  reactor: { base:[37,49,68], panel:'#304761', dark:'#1b273b', trim:'#829eae', accent:'#8cbddf', light:0x9ed9ef, motif:'coils' },
  hub: { base:[59,68,58], panel:'#465f55', dark:'#26362f', trim:'#adc3a2', accent:'#a2dbc0', light:0xb8ebce, motif:'ribs' },
};
const GARDEN_PALETTES = {
  cyan:{panel:'#477f88',dark:'#203f4a',trim:'#c6e8db',accent:'#9dece5',light:0xb0f2df,floor:'#577775',glass:'#39636e',leaf:'#78ae80'},
  green:{panel:'#567c5c',dark:'#293f35',trim:'#dbe8b4',accent:'#c3ec91',light:0xdaefb4,floor:'#677b59',glass:'#426f60',leaf:'#96be72'},
  amber:{panel:'#937349',dark:'#493d31',trim:'#f1d6a0',accent:'#f8ca78',light:0xffd88f,floor:'#847357',glass:'#6d7563',leaf:'#a3aa63'},
  violet:{panel:'#716884',dark:'#37344e',trim:'#dfd4e8',accent:'#d5b5f4',light:0xe5c7f5,floor:'#767186',glass:'#5e6a83',leaf:'#b7a6c5'},
};
const GARDEN_LANDMARKS = ['glass-lab','root-mass','cultivation-bed','pump-bank','water-vat'];
const NEW_ENEMY_ART = ['bulwark','bulwark-open','bulwark-back','mender','mender-healing'];
const PICKUP_ART = ['ammo','shells','cells','slugs','grenades','health','armor','shotgun','arc','ricochet','grenade','key','healthExpansion'];
const WEAPON_PICKUPS = ['shotgun','arc','ricochet','grenade','repeater','nullgun','lance'];
const WEAPON_RECOIL = {pistol:.58,shotgun:1,arc:.38,ricochet:.68,grenade:1.1,repeater:.28,nullgun:.32,lance:1.25};
const UPGRADE_COLORS = { cutter:'#f1a866', insulator:'#efcf63', phase:'#c5a1f2' };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const viewFov = (options, width, height) => {
  const requested = Number(options.fov);
  return Number.isFinite(requested) && requested > 0 ? clamp(requested, 60, 100) : width < height ? 78 : 68;
};
const missionVisuals = (level) => {
  const relay = level.missionId === 'relay-09' || String(level.id).startsWith('relay-09');
  const crosslink = level.missionId === 'crosslink-11' || String(level.id).startsWith('crosslink-11');
  const hollow = level.hollow === true;
  const underworks = level.shadow || hollow || level.missionId === 'underworks-13' || String(level.id).startsWith('underworks-13');
  const switchyard = level.missionId === 'switchyard-15' || String(level.id).startsWith('switchyard-15');
  const glasshouse = level.missionId === 'glasshouse-17' || String(level.id).startsWith('glasshouse-17');
  return {
    relay, crosslink, underworks, switchyard, glasshouse, hollow,
    signCode: level.signCode || (glasshouse ? 'GH 17' : switchyard ? 'SW 15' : underworks ? 'UW 13' : crosslink ? 'CROSSLINK 11' : relay ? 'RELAY 09' : 'BS 07'),
    doorCode: level.signCode || (glasshouse ? 'GLASSHOUSE 17' : switchyard ? 'SWITCHYARD 15' : underworks ? 'UNDERWORKS 13' : crosslink ? 'CROSSLINK 11' : relay ? 'DEAD RELAY 09' : 'BLACKSITE 07'),
    signColor: hollow ? '#9dcbd4' : glasshouse ? '#c4f4cf' : switchyard ? '#f1c579' : underworks ? '#d8c5a2' : crosslink ? '#e2c78c' : relay ? '#b6c5e6' : '#9fd8cf',
    fog: hollow ? 0x11131e : glasshouse ? 0x283c3d : switchyard ? 0x24272c : underworks ? 0x131917 : crosslink ? 0x101b19 : relay ? 0x0c1526 : 0x08131c,
    fogRgb: hollow ? [17,19,30] : glasshouse ? [40,60,61] : switchyard ? [36,39,44] : underworks ? [19,25,23] : crosslink ? [16, 27, 25] : relay ? [12, 21, 38] : [8, 19, 28],
  };
};
const exitReady = (state) => !!(state.power && state.player.key && (state.interactables || []).filter(i => i.type === 'relay').every(i => i.used));
const relayTitle = (item) => item.shortName || item.name || (/north/i.test(item.id) ? 'NORTH RELAY' : /south/i.test(item.id) ? 'SOUTH RELAY' : /east/i.test(item.id) ? 'EAST RELAY' : /west/i.test(item.id) ? 'WEST RELAY' : item.label?.replace(/^(synchronize|activate|align|restore)\s+/i, '').slice(0, 17) || 'RELAY NODE');
const zoneTitle = (zone,visuals) => visuals.underworks ? zone.shortName||zone.id?.replaceAll('-',' ')||zone.name : zone.name;
const localPlayerId = (state) => state.localPlayerId || state.player?.id;
const otherPlayers = (state) => Object.entries(state.players || {}).filter(([id, player]) => player && id !== localPlayerId(state) && player !== state.player && Number.isFinite(player.x) && Number.isFinite(player.z));
const localEvent = (event, state) => !event.playerId || !localPlayerId(state) || event.playerId === localPlayerId(state);
const doorKind = (door) => door.kind==='shutter'?'shutter':({cutter:'grille',insulator:'hazard',phase:'phase'}[door.requires] || (['grille','hazard','phase','shortcut'].includes(door.kind) ? door.kind : door.requires || 'plain'));
const circuitMark = item => String(item.mark||String(item.circuitId||'1').split('-').at(-1)).padStart(2,'0').slice(-2);
const doorStyleKey = door => doorKind(door)==='shutter'?`shutter:${circuitMark(door)}`:doorKind(door);
const stationKey = item => item.routing?`routing:${circuitMark(item)}`:item.type==='shutter-switch'?`shutter-switch:${circuitMark(item)}`:`${item.type}:${item.upgrade||''}`;
const explorationFeature = (item) => ['upgrade','refuge','transit','shutter-switch','record','jump'].includes(item.type);
const featureMode = (item,state) => item.type==='jump' ? Number(platformSolid(item.landingPhase||{},state.time+(item.duration||1.05)+.2)) : item.type==='upgrade' ? Number(!!(item.used||state.upgrades?.[item.upgrade]))
  : item.type==='shutter-switch' ? !state.power?0:(item.doorIds||[]).length&&(item.doorIds||[]).every(id=>(state.doors||[]).find(door=>door.id===id)?.open)?2:1
  : item.type==='transit' ? item.used ? (state.interactables||[]).some(other=>other.id===item.destination&&other.used)?2:1 : 0
  : Number(!!item.used);
const inEntityRange = (entity,player,range) => Math.abs(entity.x-player.x)<=range && Math.abs(entity.z-player.z)<=range;
const ENEMY_ART = ['runner','spitter','brute','stalker','sentry','sentry-hostile','guardian','guardian-exposed'];
const enemyArt = (enemy,observer) => {
  if(enemy.type==='hydra')return enemy.suppressedTimer>0?'hydra-marked':'hydra';
  if(enemy.stationary)return enemy.guardian?'mortar':'turret';
  if(enemy.echo)return 'echo';
  if(enemy.guardian)return enemy.bossPhase==='recover'?'guardian-exposed':'guardian';
  if(enemy.type==='bulwark'){
    const bearing=observer?Math.atan2(observer.x-enemy.x,enemy.z-observer.z):(enemy.angle||0);
    const relative=Math.atan2(Math.sin(bearing-(enemy.angle||0)),Math.cos(bearing-(enemy.angle||0)));
    if(Math.abs(relative)>.95)return 'bulwark-back';
    return enemy.shieldPhase==='exposed'?'bulwark-open':'bulwark';
  }
  if(enemy.type==='mender')return enemy.telegraph?.kind==='heal'&&enemy.telegraph.remaining>0&&!(enemy.stunTimer>0)?'mender-healing':'mender';
  return enemy.type==='sentry'&&enemy.provoked?'sentry-hostile':enemy.type;
};
const enemyHeight = enemy => enemy.guardian?2.22:enemy.type==='bulwark'?2.07:enemy.type==='mender'?1.91:enemy.type==='brute'?1.93:enemy.type==='stalker'?1.84:enemy.type==='sentry'?1.74:enemy.type==='spitter'?1.69:1.59;
const enemyArtTypes = level => [...ENEMY_ART,...((level.enemies||[]).some(enemy=>enemy.echo)?['echo']:[]),...((level.enemies||[]).some(enemy=>['bulwark','mender'].includes(enemy.type))?NEW_ENEMY_ART:[])];
const projectileAppearance = projectile => {
  if(projectile.type!=='grenade')return {kind:'plasma',size:.22,y:projectile.y??1.02};
  const remaining=clamp((projectile.life||0)/Math.max(.01,projectile.fuse||1.5),0,1);
  return {kind:'grenade',size:.32,y:projectile.y??(.28+Math.sin((1-remaining)*Math.PI)*.27),remaining};
};
const doorReady = (door,state) => door.kind==='shutter'?!!state.power:!door.requires || door.requires==='power'&&state.power || door.requires==='key'&&state.player.key || door.requires==='relays'&&(state.interactables||[]).filter(item=>item.type==='relay').every(item=>item.used) || !!state.upgrades?.[door.requires];
const doorFrame = (door,state,clock,reducedMotion) => ({ready:doorReady(door,state),frame:reducedMotion?0:Math.floor(clock*3)%4});

// A repeated shape is the vocabulary: tools and the material they affect carry
// the same mark. These are readable even without color or an explanatory HUD.
function capabilityGlyph(c,kind,x,y,size,color='#eee3be'){
  c.save();c.translate(x-size/2,y-size/2);c.scale(size/32,size/32);
  if(kind==='cutter'||kind==='grille'){
    poly(c,[[3,6],[8,2],[18,12],[14,17]],color);poly(c,[[24,2],[29,7],[18,18],[14,14]],color);
    poly(c,[[13,16],[18,16],[22,29],[17,31],[15,24],[12,31],[7,29]],color);
    rect(c,23,16,8,2,color);rect(c,24,20,6,2,color);
  }else if(kind==='insulator'||kind==='hazard'){
    poly(c,[[16,1],[29,7],[29,23],[16,31],[3,23],[3,7]],color);
    poly(c,[[16,5],[25,10],[25,21],[16,27],[7,21],[7,10]],'#17262c');
    poly(c,[[18,7],[10,18],[16,18],[12,26],[23,13],[17,13]],color);
  }else if(kind==='phase'){
    poly(c,[[16,1],[29,9],[29,23],[16,31],[3,23],[3,9]],color);
    poly(c,[[16,5],[25,11],[25,21],[16,27],[7,21],[7,11]],'#232438');
    rect(c,14,10,4,12,color);rect(c,10,14,12,4,color);
  }else if(kind==='key'){
    rect(c,6,3,21,27,color);rect(c,9,7,15,5,'#17262c');rect(c,10,17,5,6,'#17262c');
    rect(c,18,18,6,2,'#17262c');rect(c,18,23,6,2,'#17262c');
  }else if(kind==='relays'){
    rect(c,2,8,9,14,color);rect(c,21,8,9,14,color);rect(c,11,14,10,3,color);
    rect(c,5,11,3,8,'#17262c');rect(c,24,11,3,8,'#17262c');
  }else if(kind==='power'){
    rect(c,7,8,18,14,color);rect(c,10,2,3,8,color);rect(c,19,2,3,8,color);
    rect(c,14,22,4,9,color);rect(c,11,11,10,3,'#17262c');
  }else{
    poly(c,[[3,12],[18,12],[18,5],[30,16],[18,27],[18,20],[3,20]],color);
  }
  c.restore();
}

// Resolve authored sectors once. Rendering never searches zone rectangles per
// pixel or per wall; the largest map needs only a few kilobytes of cell indices.
function surfaceLayout(level,underworks=false){
  const garden=missionVisuals(level).glasshouse;
  const names=garden?Object.keys(GARDEN_PALETTES):underworks?Object.keys(SECTORS):['default'],indices=new Uint8Array(level.width*level.height);
  const hazards=new Uint8Array(indices.length),solid=(x,z)=>!level.grid[z]?.[x]||level.grid[z][x]==='#';
  if(underworks||garden)for(let z=0;z<level.height;z++)for(let x=0;x<level.width;x++){
    const zone=(level.zones||[]).find(zone=>x+.5>=zone.x1&&x+.5<zone.x2&&z+.5>=zone.z1&&z+.5<zone.z2);
    indices[z*level.width+x]=Math.max(0,names.indexOf(zone?.palette));
  }
  for(const area of level.hazards||[])for(let z=Math.max(0,Math.floor(area.z1));z<Math.min(level.height,Math.ceil(area.z2));z++)for(let x=Math.max(0,Math.floor(area.x1));x<Math.min(level.width,Math.ceil(area.x2));x++){
    if(!solid(x,z)&&x+.5>=area.x1&&x+.5<area.x2&&z+.5>=area.z1&&z+.5<area.z2)hazards[z*level.width+x]=area.type==='flood'?1:2;
  }
  const paletteAt=(x,z)=>indices[Math.floor(z)*level.width+Math.floor(x)]||0;
  const large=level.width>45||level.height>45;
  const chunkAt=(x,z)=>large?`${Math.floor(x/WORLD_CHUNK)},${Math.floor(z/WORLD_CHUNK)}`:'all';
  const walls=[],lights=[],runs=[],rails=[];let solidCells=0,exposedCells=0,walkableCells=0;
  for(let z=0;z<level.height;z++)for(let x=0;x<level.width;x++){
    if(!solid(x,z)){walkableCells++;continue;}solidCells++;
    const sides=[[0,-1],[1,0],[0,1],[-1,0]].filter(([dx,dz])=>!solid(x+dx,z+dz));
    if(sides.length)exposedCells++;
    for(const[dx,dz]of sides){
      const palette=paletteAt(x+dx,z+dz),chunk=chunkAt(x+dx,z+dz);
      walls.push({x:x+.5+dx*.5,z:z+.5+dz*.5,rot:Math.atan2(dx,dz),palette,chunk,shade:.75+hash(x,z)*.24});
      if((x+z*3)%4===0)lights.push({x:x+.5+dx*.515,z:z+.5+dz*.515,rot:Math.atan2(dx,dz),palette,chunk,warm:(x+z)%7===0});
    }
  }
  // Consecutive floor cells share a quad, split only at walls, sectors and
  // chunk boundaries. Ceiling uses these same runs with reversed winding.
  for(let z=0;z<level.height;z++){
    let run=null;
    for(let x=0;x<=level.width;x++){
      const palette=paletteAt(x,z),chunk=chunkAt(x,z),open=!solid(x,z);
      if(run&&(!open||run.palette!==palette||run.chunk!==chunk)){run.x2=x;runs.push(run);run=null;}
      if(open&&!run)run={x1:x,x2:x+1,z,palette,chunk};
    }
  }
  for(let z=2;z<level.height-1;z+=4){
    let start=-1;
    for(let x=0;x<=level.width;x++){
      if(!solid(x,z)&&start<0)start=x;
      if(solid(x,z)&&start>=0){
        if(x-start>=3)for(let a=start;a<x;){const b=large?Math.min(x,(Math.floor(a/WORLD_CHUNK)+1)*WORLD_CHUNK):x;rails.push({x:(a+b)/2,z:z+.5,width:b-a,palette:paletteAt(a,z),chunk:chunkAt(a,z)});a=b;}
        start=-1;
      }
    }
  }
  return {names,indices,hazards,paletteAt,large,walls,lights,runs,rails,stats:{gridCells:indices.length,solidCells,walkableCells,exposedCells,enclosedCells:solidCells-exposedCells,wallFaces:walls.length,wallTriangles:walls.length*2,previousWallTriangles:exposedCells*12,floorRuns:runs.length}};
}

function batches(records,key){
  const groups=new Map();for(const record of records){const id=key(record);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(record);}return groups.values();
}

function horizontalGeometry(runs,height=0,ceiling=false){
  const positions=[],uvs=[],indices=[];
  for(const run of runs){
    const i=positions.length/3,z2=run.z2??run.z+1;
    positions.push(run.x1,height,run.z, run.x1,height,z2, run.x2,height,z2, run.x2,height,run.z);
    uvs.push(run.x1/2,run.z/2,run.x1/2,z2/2,run.x2/2,z2/2,run.x2/2,run.z/2);
    if(ceiling)indices.push(i,i+2,i+1,i,i+3,i+2);else indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}
const teammateView = (player, observer, motion, dt, advancing, clock, firedAt) => {
  const speed = Math.hypot(player.x-motion.x,player.z-motion.z)/Math.max(.001,dt);
  motion.x=player.x;motion.z=player.z;if(advancing)motion.phase+=dt*(speed>.05?8:1.5);
  const bearing=Math.atan2(observer.x-player.x,-(observer.z-player.z));
  const relative=Math.atan2(Math.sin(bearing-(player.angle||0)),Math.cos(bearing-(player.angle||0)));
  const direction=Math.abs(relative)<Math.PI/4?'front':Math.abs(relative)>Math.PI*.75?'back':relative>0?'right':'left';
  const down=player.alive===false||player.health<=0;
  const frame=down?4:clock-(firedAt??-99)<.12?5:speed>.05?Math.floor(motion.phase)%4:0;
  return {direction,frame,down};
};
const hash = (x, y, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function canvas2d(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  return [canvas, context];
}

function textureFrom(canvas, repeat = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function makeWallTexture(variant = 0, relay = false, crosslink = false) {
  const [canvas, c] = canvas2d(64, 128);
  if (relay) {
    // Dead Relay uses poured concrete and blue service panels. The new room
    // identity remains within the same deliberately small texture palette.
    for (let y = 0; y < 128; y += 2) for (let x = 0; x < 64; x += 2) {
      const b = Math.round(50 + hash(x, y, variant + 9) * 26);
      rect(c, x, y, 2, 2, `rgb(${b},${b + 13},${b + 25})`);
    }
    rect(c, 0, 0, 64, 5, '#253746');rect(c, 0, 5, 64, 2, '#849398');
    rect(c, 0, 7, 2, 106, '#203541');rect(c, 3, 7, 1, 106, '#8b9697');
    rect(c, 61, 7, 3, 106, '#263b4b');
    rect(c, 7, 20, 50, 26, '#2b4053');rect(c, 8, 20, 48, 2, '#869aa6');
    for (let y = 26; y < 42; y += 5) {rect(c, 12, y, 38, 2, '#142b3b');rect(c, 12, y + 2, 38, 1, '#536e84');}
    rect(c, 9, 60, 34, 2, '#9aa7a7');rect(c, 9, 62, 34, 1, '#344e60');
    rect(c, 47, 51, 8, 55, '#1f3447');rect(c, 49, 52, 3, 54, '#6b8dba');rect(c, 49, 54, 1, 50, '#a2b9d0');
    rect(c, 43, 71, 16, 12, '#334959');rect(c, 46, 74, 10, 4, '#b8a7d4');
    rect(c, 9, 83, 32, 25, '#354e69');rect(c, 10, 84, 30, 2, '#7c98b2');
    rect(c, 14, 91, 6, 11, '#c4b797');rect(c, 23, 91, 13, 3, '#8fa6bf');rect(c, 23, 98, 9, 3, '#8fa6bf');
    for (const x of [7, 56]) for (const y of [12, 51, 106]) {rect(c, x, y, 3, 3, '#1e303c');rect(c, x, y, 2, 1, '#bac2ba');}
    rect(c, 0, 115, 64, 7, '#253546');
    for (let x = -12; x < 64; x += 18) poly(c, [[x,115],[x+8,115],[x+15,122],[x+7,122]], '#a8844e');
    rect(c, 0, 123, 64, 5, '#172b3c');
    return textureFrom(canvas);
  }
  rect(c, 0, 0, 64, 128, '#485052');
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 64; x += 2) {
      const light = Math.round(50 + hash(x, y, variant) * 25);
      rect(c, x, y, 2, 2, `rgb(${light},${light + 8},${light + 9})`);
    }
  }
  rect(c, 0, 0, 64, 8, '#171f24');
  rect(c, 0, 8, 64, 2, '#7a7d70');
  rect(c, 1, 10, 3, 110, '#687474');
  rect(c, 4, 10, 2, 110, '#1d292e');
  rect(c, 59, 10, 4, 110, '#17232a');
  rect(c, 7, 18, 49, 39, '#222e34');
  rect(c, 9, 20, 45, 2, '#677273');
  for (let y = 25; y < 51; y += 5) {
    rect(c, 11, y, 41, 2, '#121c22');
    rect(c, 11, y + 2, 41, 1, '#586465');
  }
  rect(c, 8, 63, 47, 43, '#38474c');
  rect(c, 9, 63, 46, 2, '#68716c');
  rect(c, 10, 67, 42, 36, '#3c4b4f');
  for (let i = 0; i < 32; i++) {
    const x = Math.floor(hash(i, 3, variant) * 44) + 10;
    const y = Math.floor(hash(4, i, variant) * 72) + 30;
    rect(c, x, y, 1 + hash(i, 7) * 4, 1, '#725c42');
  }
  rect(c, 0, 111, 64, 9, '#1d2427');
  for (let x = -12; x < 64; x += 17) {
    poly(c, [[x,111],[x+8,111],[x+17,120],[x+9,120]], '#9a783c');
  }
  rect(c, 0, 121, 64, 7, '#182127');
  for (const x of [8, 53]) for (const y of [13, 60, 105]) {
    rect(c, x, y, 3, 3, '#151d20');
    rect(c, x, y, 2, 1, '#a4a187');
  }
  if(crosslink){
    rect(c,9,65,44,40,'#31534f');rect(c,10,66,42,2,'#88a49a');
    rect(c,13,72,36,3,'#b5985c');rect(c,15,81,8,15,'#d3bb7b');rect(c,29,81,8,15,'#d3bb7b');
    rect(c,15,81,3,15,'#31534f');rect(c,29,81,3,15,'#31534f');
    rect(c,44,80,3,18,'#77c5b0');rect(c,13,100,35,2,'#1b3835');
    rect(c,0,8,64,2,'#c6a66a');
  }
  return textureFrom(canvas);
}

function makeFloorTexture(ceiling = false, relay = false, crosslink = false) {
  const [canvas,c] = canvas2d(64,64);
  rect(c,0,0,64,64,ceiling ? '#253138' : '#343f42');
  for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) {
    const b = (ceiling ? 26 : 37) + Math.floor(hash(x,y) * 15);
    rect(c,x,y,2,2,`rgb(${b},${b+(crosslink?16:relay?11:7)},${b+(crosslink?12:relay?24:9)})`);
  }
  rect(c,0,0,64,2,'#121c22');
  rect(c,0,0,2,64,'#121c22');
  rect(c,3,3,58,1,ceiling ? '#38454b':'#637071');
  rect(c,3,3,1,58,ceiling ? '#38454b':'#637071');
  if (ceiling) {
    rect(c,28,0,8,64,'#18252d');
    rect(c,30,0,1,64,'#48555b');
  } else if (relay) {
    rect(c, 30, 3, 2, 58, '#213b50');rect(c, 3, 30, 58, 2, '#213b50');
    rect(c, 32, 3, 1, 58, '#627990');rect(c, 3, 32, 58, 1, '#627990');
    for(const x of [8,55])for(const y of [8,55]){rect(c,x,y,2,2,'#183042');rect(c,x,y,1,1,'#8a9caa');}
  } else {
    for (let y = 10; y < 60; y += 12) for (let x = 8; x < 60; x += 12) {
      rect(c,x,y,5,2,'#4f5d5d');
      rect(c,x+2,y+2,5,2,'#222f36');
    }
  }
  if(crosslink&&!ceiling){rect(c,8,5,48,2,'#96855b');rect(c,8,57,48,2,'#96855b');}
  return textureFrom(canvas, true);
}

function makeSectorWallTexture(name){
  const p=SECTORS[name]||SECTORS.arrival,[canvas,c]=canvas2d(64,128);
  for(let y=0;y<128;y+=2)for(let x=0;x<64;x+=2){const n=hash(x,y,3)*16-8;rect(c,x,y,2,2,`rgb(${p.base.map(v=>Math.round(v+n)).join(',')})`);}
  rect(c,0,0,64,8,p.dark);rect(c,0,8,64,2,p.trim);rect(c,1,10,3,105,p.dark);rect(c,60,10,4,105,p.dark);
  rect(c,6,17,51,43,p.panel);rect(c,7,17,49,2,p.trim);rect(c,7,59,49,2,p.dark);
  if(p.motif==='furnace'){
    rect(c,11,24,42,30,'#211b1a');
    for(let x=15;x<52;x+=7){rect(c,x,27,3,24,'#e7a05b');rect(c,x,31,1,17,'#f4cd88');rect(c,x+3,24,3,30,p.dark);}
    rect(c,9,70,46,34,p.dark);for(let y=73;y<103;y+=6){rect(c,11,y,42,3,p.panel);rect(c,11,y,42,1,p.trim);}
  }else if(p.motif==='pipes'){
    for(const x of [14,44]){rect(c,x,10,8,102,p.dark);rect(c,x+2,10,4,102,p.trim);rect(c,x+2,12,1,98,p.accent);for(const y of[31,76,99])rect(c,x-2,y,12,5,p.panel);}
    rect(c,25,27,13,24,p.dark);rect(c,28,30,7,10,p.accent);rect(c,28,43,7,3,p.trim);
    rect(c,24,80,15,20,p.panel);rect(c,29,83,5,13,p.accent);rect(c,25,87,13,4,p.accent);
  }else if(p.motif==='shelves'){
    for(let y=24;y<103;y+=21){rect(c,8,y,48,18,p.dark);for(let x=12;x<54;x+=9){rect(c,x,y+2,6,13,p.panel);rect(c,x,y+3,6,2,p.trim);rect(c,x+1,y+11,2,2,p.accent);}rect(c,8,y+17,48,2,p.trim);}
  }else if(p.motif==='rails'){
    rect(c,10,25,44,82,p.dark);for(const x of[14,44]){rect(c,x,23,5,87,p.trim);rect(c,x+2,24,1,84,p.accent);}
    for(let y=32;y<105;y+=13){rect(c,12,y,39,4,p.panel);rect(c,12,y,39,1,p.trim);}
    poly(c,[[27,44],[36,44],[36,38],[46,50],[36,61],[36,55],[27,55]],p.accent);
  }else if(p.motif==='coils'){
    for(const x of[12,37]){rect(c,x,22,15,85,p.dark);rect(c,x+4,24,7,81,p.accent);rect(c,x+7,24,2,81,'#d3eaf0');for(let y=29;y<103;y+=8){rect(c,x,y,15,3,p.panel);rect(c,x,y,15,1,p.trim);}}
    rect(c,26,58,12,14,p.dark);rect(c,29,62,6,6,'#c6acdf');
  }else{
    for(let y=24;y<54;y+=7){rect(c,12,y,40,3,p.dark);rect(c,12,y+3,40,1,p.trim);}
    rect(c,9,71,46,35,p.panel);rect(c,11,73,42,2,p.trim);rect(c,15,81,7,16,p.accent);rect(c,27,81,20,3,p.trim);rect(c,27,88,15,2,p.trim);
    rect(c,27,95,20,2,p.dark);
  }
  for(const x of[7,55])for(const y of[12,65,110]){rect(c,x,y,3,3,p.dark);rect(c,x,y,2,1,p.trim);}
  rect(c,0,115,64,9,p.dark);
  for(let x=-10;x<64;x+=18)poly(c,[[x,115],[x+7,115],[x+15,124],[x+8,124]],p.accent);
  rect(c,0,125,64,3,p.dark);return textureFrom(canvas);
}

function makeSectorFloorTexture(name,ceiling=false){
  const p=SECTORS[name]||SECTORS.arrival,[canvas,c]=canvas2d(64,64);
  for(let y=0;y<64;y+=2)for(let x=0;x<64;x+=2){const n=hash(x,y,11)*12-6;rect(c,x,y,2,2,`rgb(${p.base.map(v=>Math.round(v*(ceiling?.51:.70)+n)).join(',')})`);}
  rect(c,0,0,64,2,p.dark);rect(c,0,0,2,64,p.dark);rect(c,3,3,58,1,p.panel);rect(c,3,3,1,58,p.panel);
  if(ceiling){rect(c,27,0,10,64,p.dark);rect(c,29,0,2,64,p.trim);rect(c,35,0,1,64,p.panel);}
  else{
    for(const x of[8,54])for(const y of[8,54]){rect(c,x,y,3,3,p.dark);rect(c,x,y,2,1,p.trim);}
    if(name==='rail'){rect(c,15,0,4,64,p.trim);rect(c,44,0,4,64,p.trim);for(let y=7;y<64;y+=13)rect(c,19,y,25,4,p.dark);}
    else if(name==='floodworks'||name==='foundry'){for(let y=14;y<51;y+=6){rect(c,14,y,37,3,p.dark);rect(c,14,y+3,37,1,p.panel);}}
    else{rect(c,29,8,2,48,p.dark);rect(c,8,29,48,2,p.dark);rect(c,32,8,1,48,p.panel);rect(c,8,32,48,1,p.panel);}
    rect(c,7,59,50,2,p.accent);
  }
  return textureFrom(canvas,true);
}

function makeHazardTexture(type){
  const[canvas,c]=canvas2d(64,64);
  if(type==='flood'){
    rect(c,0,0,64,64,'#1c4349');
    for(let y=2;y<64;y+=6)for(let x=0;x<64;x+=16){const offset=Math.floor(hash(x,y)*5);rect(c,x+offset,y,12,1,'#4a8585');rect(c,x+offset+3,y+2,7,1,'#284f58');}
    rect(c,0,0,64,2,'#82bdb1');rect(c,0,0,2,64,'#274850');
  }else{
    rect(c,0,0,64,64,'#20303b');for(let x=8;x<60;x+=12){rect(c,x,0,5,64,'#101d28');rect(c,x+1,0,2,64,'#83b7c9');}
    for(let x=-12;x<64;x+=20)poly(c,[[x,26],[x+8,26],[x+20,38],[x+12,38]],'#d8ba66');
    rect(c,0,25,64,1,'#6d654c');rect(c,0,39,64,2,'#121e29');
  }
  return textureFrom(canvas,true);
}

function makeTraversalDoorTexture(kind,frame=0,ready=false){
  const[canvas,c]=canvas2d(64,128),color=kind==='grille'?UPGRADE_COLORS.cutter:kind==='hazard'?UPGRADE_COLORS.insulator:kind==='phase'?UPGRADE_COLORS.phase:'#8edbc5';
  rect(c,0,0,64,128,'#10191f');rect(c,0,0,5,128,'#667875');rect(c,59,0,5,128,'#667875');
  rect(c,5,0,54,6,'#9fa993');rect(c,5,121,54,7,'#3c514f');
  if(kind==='grille'){
    for(let x=-48;x<100;x+=13){poly(c,[[x,6],[x+3,6],[x+64,121],[x+61,121]],'#587071');poly(c,[[x,121],[x+3,121],[x+64,6],[x+61,6]],'#30444a');}
    // Heavy welded crossbraces and copper hot spots suggest cutting a material,
    // rather than a conventional key reader hidden behind a text label.
    poly(c,[[8,17],[14,13],[56,108],[50,112]],'#b68c61');poly(c,[[50,13],[56,17],[14,112],[8,108]],'#b68c61');
    for(const[x,y]of[[12,19],[52,19],[12,105],[52,105]]){rect(c,x-4,y-3,8,6,color);rect(c,x-2,y-1,4,2,'#ffe0a6');}
    for(let i=0;i<8;i++)rect(c,29+(i%2)*2,36+i*7,2,4,'#5c3e32');
  }else if(kind==='hazard'){
    for(const x of[8,51]){rect(c,x,8,5,109,'#83783d');for(let y=12;y<119;y+=9){rect(c,x-2,y,9,4,color);rect(c,x,y,5,1,'#fff0a0');}}
    for(let y=20;y<120;y+=23){const shift=(frame+y)%4*2;
      poly(c,[[13,y],[27,y-5+shift],[30,y+4],[43,y-3],[51,y+2],[44,y],[32,y+7],[26,y-2+shift],[13,y+3]],color);
      rect(c,28,y+1,3,2,'#fff8d5');
    }
    for(let x=5;x<59;x+=13)poly(c,[[x,111],[x+7,111],[x+14,121],[x+7,121]],'#d5b24c');
  }else if(kind==='phase'){
    rect(c,7,7,50,113,'#28243e');
    for(let y=9;y<120;y+=7){rect(c,8,y,48,1,'#68548f');rect(c,11+(y+frame*5)%27,y+2,14,2,'#b3a2dd');}
    for(const y of[24,102]){poly(c,[[32,y-12],[47,y-6],[47,y+6],[32,y+13],[17,y+6],[17,y-6]],color);poly(c,[[32,y-8],[43,y-3],[43,y+4],[32,y+9],[21,y+4],[21,y-3]],'#302844');}
    rect(c,6,12+frame*24,3,22,'#e7d7ff');rect(c,55,87-frame*24,3,22,'#e7d7ff');
  }else{
    for(let y=9;y<120;y+=12){rect(c,6,y,52,9,'#3b5553');rect(c,6,y,52,1,'#83a497');}
    for(const y of[28,96])poly(c,[[18,y],[34,y],[34,y-7],[47,y+5],[34,y+17],[34,y+10],[18,y+10]],color);
  }
  rect(c,14,46,36,36,'#101c25');rect(c,14,46,36,2,color);rect(c,14,80,36,2,color);
  capabilityGlyph(c,kind,32,64,27,color);
  // A fitted capability closes a little circuit around the emblem. An empty
  // socket remains an incomplete circuit, without spelling out the solution.
  for(const x of[8,54])rect(c,x,55,2,20,ready?'#c9f0cf':'#3f5352');
  if(ready){rect(c,8,53,8,2,'#c9f0cf');rect(c,48,53,8,2,'#c9f0cf');}
  return textureFrom(canvas);
}

function circuitBadge(c,mark,x,y,size,on=false){
  rect(c,x-size/2,y-size/2,size,size,'#14252b');
  const color=on?'#bce9d3':'#f0bd63';
  for(const dx of[-1,1]){rect(c,x+dx*(size/2-2)-1,y-size/2,2,size,color);rect(c,x-size/2,y+dx*(size/2-2)-1,size,2,color);}
  c.textAlign='center';c.font=`bold ${Math.floor(size*.66)}px monospace`;c.fillStyle=color;c.fillText(mark,x,y+size*.24);
}

function makeShutterTexture(mark,ready){
  const[canvas,c]=canvas2d(64,128);
  rect(c,0,0,64,128,'#18232a');
  for(let y=4;y<121;y+=9){rect(c,5,y,54,7,'#7d8986');rect(c,6,y,52,2,'#b5bab0');rect(c,6,y+6,52,2,'#3c4e52');}
  for(const x of[0,59]){rect(c,x,0,5,128,'#b29059');for(let y=8;y<120;y+=15)rect(c,x+1,y,3,5,'#18272e');}
  for(let x=5;x<59;x+=12)poly(c,[[x,111],[x+6,111],[x+12,122],[x+6,122]],'#dab563');
  rect(c,8,6,48,11,'#273b42');rect(c,11,9,11,4,ready?'#efca79':'#5c6055');
  rect(c,39,9,11,4,ready?'#efca79':'#5c6055');circuitBadge(c,mark,32,61,32);
  rect(c,15,82,34,5,'#253a42');rect(c,19,84,26,2,'#c5cabc');
  return textureFrom(canvas);
}

function makeShutterSwitchTexture(item,mode){
  const[canvas,c]=canvas2d(112,160),on=mode>0,open=mode===2,color=open?'#bce9d3':'#f0bd63';
  rect(c,34,103,45,52,'#394e52');rect(c,39,107,6,44,'#70847c');
  rect(c,14,12,85,102,'#14262e');rect(c,18,16,77,94,'#526a6a');rect(c,22,20,69,85,'#253b42');
  circuitBadge(c,circuitMark(item),56,45,34,open);
  // The same sliding bars and lever direction as the shutter make the switch
  // relationship legible even when the HUD offers no explanation.
  rect(c,32,72,28,25,'#10232b');rect(c,34,74,24,21,'#728e88');
  for(let y=75;y<(open?79:94);y+=5)rect(c,35,y,22,3,'#c9d2b9');
  rect(c,70,71,7,27,'#101f25');rect(c,66,open?71:86,15,10,on?color:'#65736b');rect(c,69,open?73:88,9,3,'#e4d9b2');
  for(const x of[21,87])rect(c,x,101,4,6,on?color:'#4a5d59');
  for(const x of[46,62]){rect(c,x,114,3,43,'#b38b59');rect(c,x+1,114,1,43,on?'#e6bf78':'#6e7056');}
  return textureFrom(canvas);
}

function makeDoorTexture(kind, visuals = {}, frame=0, ready=false,mark='01') {
  if(kind==='shutter')return makeShutterTexture(mark,ready);
  if(['grille','hazard','phase','shortcut'].includes(kind))return makeTraversalDoorTexture(kind,frame,ready);
  const [canvas,c] = canvas2d(64,128);
  rect(c,0,0,64,128,'#283339');
  for(let y=3;y<128;y+=16){
    rect(c,5,y,54,13,'#546062');rect(c,5,y,54,2,'#929789');
    rect(c,5,y+12,54,2,'#1a252c');rect(c,31,y,2,14,'#273940');
  }
  rect(c,0,0,4,128,'#15232a');rect(c,60,0,4,128,'#15232a');
  const color = kind === 'relays' ? '#b9a1ed' : kind === 'power' ? '#dd7840' : kind === 'key' ? '#54c6cb' : visuals.relay ? '#9db3db' : '#bca970';
  rect(c,12,45,40,43,'#111d25');rect(c,13,46,38,2,color);
  capabilityGlyph(c,kind,32,65,28,ready?'#c9f0cf':color);
  if(kind==='key'){rect(c,18,81,28,3,'#b9cbbe');rect(c,20,82,24,1,'#071216');}
  if(kind==='relays')for(const x of[15,39]){rect(c,x,89,10,6,ready?'#c9f0cf':'#433c59');rect(c,x+2,91,6,2,ready?'#efffdf':'#716081');}
  if(kind==='power'){
    rect(c,14,95,3,21,ready?'#efcc7b':'#655546');rect(c,47,95,3,21,ready?'#efcc7b':'#655546');
    rect(c,14,113,ready?36:13,3,ready?'#efcc7b':'#655546');rect(c,38,113,12,3,ready?'#efcc7b':'#655546');
  }
  return textureFrom(canvas);
}

function makeDoorRemnant(kind,mark='01'){
  const[canvas,c]=canvas2d(64,128),color=kind==='grille'?UPGRADE_COLORS.cutter:kind==='hazard'?UPGRADE_COLORS.insulator:kind==='phase'?UPGRADE_COLORS.phase:'#9ac8b9';
  for(const x of[1,58]){rect(c,x,1,5,126,'#465a59');rect(c,x+1,3,2,121,color);}
  if(kind==='grille')for(const[x,y,dx]of[[4,18,1],[59,18,-1],[4,105,1],[59,105,-1]]){
    poly(c,[[x,y],[x+dx*10,y+dx*14],[x+dx*6,y+dx*14],[x-dx*2,y+3]],'#8e785d');rect(c,x+dx*7,y+dx*12,3,3,'#ffe0ad');
  }
  if(kind==='hazard'){rect(c,5,119,54,5,'#b6aa69');for(let x=8;x<58;x+=9)rect(c,x,120,5,2,'#f0e4b4');}
  if(kind==='phase'){for(const y of[6,117]){rect(c,5,y,13,3,color);rect(c,46,y,13,3,color);}}
  if(kind==='shutter'){
    rect(c,1,0,62,12,'#a49a76');for(let x=5;x<59;x+=8)rect(c,x,2,5,7,'#405651');
    circuitBadge(c,mark,32,11,18,true);
  }
  return textureFrom(canvas);
}

function makeDoorFrameSet(kind,visuals,mark='01'){
  const count=['hazard','phase'].includes(kind)?4:1;
  return [false,true].map(ready=>Array.from({length:count},(_,frame)=>makeDoorTexture(kind,visuals,frame,ready,mark)));
}

function encounterCues(state){
  const cues=[];
  for(const control of state.interactables||[])if(control.containment&&state.power&&!control.used){
    const field=control.containment;
    cues.push({id:`field-${control.id}`,kind:'containment',x:field.x,z:field.z,radius:field.radius,progress:.75,color:'#91e5de',telegraph:false});
    cues.push({id:`emitter-${control.id}`,kind:'containment',x:field.x,z:field.z,radius:.45,progress:1,color:'#c5fff0',telegraph:false});
  }
  for(const enemy of state.enemies||[]){
    const t=enemy.telegraph;
    if(enemy.alive===false||enemy.health<=0||!t||!(t.remaining>0)||!Number.isFinite(t.x)||!Number.isFinite(t.z))continue;
    if(t.kind==='heal'&&(enemy.stunTimer>0||t.targetId&&!(state.enemies||[]).some(target=>target.id===t.targetId&&target.alive!==false&&target.health>0)))continue;
    cues.push({...t,id:enemy.id,progress:clamp(1-t.remaining/Math.max(.01,t.duration||1),0,1),
      fromX:Number.isFinite(t.fromX)?t.fromX:enemy.x,fromZ:Number.isFinite(t.fromZ)?t.fromZ:enemy.z,
      radius:Math.max(.25,t.radius||.6),color:t.kind==='heal'?'#c5ecac':t.kind==='blink'?'#d6baff':t.kind==='shot'?'#f0d58d':'#ffad76',telegraph:true});
  }
  for(const projectile of state.projectiles||[])if(projectile.type==='grenade'&&projectile.life>0){
    cues.push({id:projectile.id,kind:'grenade-danger',x:projectile.x,z:projectile.z,radius:projectile.blastRadius||2.8,
      progress:1-clamp(projectile.life/Math.max(.01,projectile.fuse||1.5),0,1),color:'#f4bd77',telegraph:true});
  }
  for(const effect of state.effects||[]){
    if(!(effect.life>0)||!Number.isFinite(effect.x)||!Number.isFinite(effect.z))continue;
    if(effect.type==='ricochet'){
      for(const[index,segment]of(effect.segments||[]).slice(0,2).entries()){
        if(![segment.x,segment.z,segment.targetX,segment.targetZ].every(Number.isFinite))continue;
        cues.push({id:effect.id,kind:'ricochet',fromX:segment.x,fromZ:segment.z,x:segment.targetX,z:segment.targetZ,
          radius:.14,progress:clamp(effect.life/.16,0,1),color:index?'#f1c5ff':'#dbd2ff',reflected:index>0,telegraph:false});
      }
      continue;
    }
    if(!['blink','beam','charge-trail','arc','heal','heal-interrupt','shield-hit','explosion'].includes(effect.type))continue;
    cues.push({...effect,kind:effect.type,fromX:effect.x,fromZ:effect.z,
      x:effect.targetX??effect.x,z:effect.targetZ??effect.z,radius:effect.type==='explosion'?(effect.radius||2.8):effect.type==='blink'?.65:.26,
      progress:clamp(effect.life/({blink:.45,arc:.18,beam:.14,heal:.5,'heal-interrupt':.22,'shield-hit':.18,explosion:.45}[effect.type]||.25),0,1),
      color:effect.type==='heal'?'#b7f29b':effect.type==='heal-interrupt'?'#dab7eb':effect.type==='shield-hit'?'#ffe3a2':effect.type==='arc'?'#9bf0ed':effect.type==='blink'?'#d6baff':effect.faction==='security'?'#ffe4a2':'#ffad76',telegraph:false});
  }
  return cues;
}

function cueBillboard(cue){
  if(cue.kind==='blink')return {map:'blink',x:cue.x,z:cue.z,width:.95,height:1.4,bottom:.015};
  if(cue.kind==='heal')return {map:cue.telegraph?'heal-windup':'heal',x:cue.x,z:cue.z,width:.65,height:.65,bottom:1.1};
  if(cue.kind==='heal-interrupt'||cue.kind==='shield-hit')return {map:cue.kind,x:cue.x,z:cue.z,width:.78,height:.78,bottom:.83};
  if(cue.kind==='ricochet'&&cue.reflected)return {map:'shield-hit',x:cue.fromX,z:cue.fromZ,width:.34,height:.34,bottom:.85};
  if(cue.kind==='explosion'){
    const size=cue.radius*(.65+(1-cue.progress)*.7);return {map:'explosion',x:cue.x,z:cue.z,width:size,height:size*.8,bottom:.03};
  }
  return null;
}

function makePhaseEcho(){
  const[canvas,c]=canvas2d(64,96);
  for(const x of[5,55]){rect(c,x,14,4,64,'#c5a1f2');rect(c,x+1,22,2,48,'#ede1ff');}
  for(const y of[11,80]){rect(c,9,y,18,3,'#c5a1f2');rect(c,38,y,18,3,'#c5a1f2');}
  capabilityGlyph(c,'phase',32,46,34,'#e0cdff');
  return textureFrom(canvas);
}

function makeYardWallTexture(){
  const[canvas,c]=canvas2d(64,128);
  rect(c,0,0,64,128,'#585c55');
  for(let x=0;x<64;x+=8){rect(c,x,0,5,128,'#85877a');rect(c,x,0,1,128,'#b1ad94');rect(c,x+5,0,3,128,'#414d4b');}
  for(const y of[7,94,121]){rect(c,0,y,64,5,'#454c46');rect(c,0,y,64,1,'#b5a37c');}
  for(let i=0;i<38;i++)rect(c,Math.floor(hash(i,6)*64),Math.floor(hash(i,11)*128),1+i%3,2+i%8,i%2?'#77553d':'#4d4c41');
  for(const x of[4,56])for(const y of[10,96]){rect(c,x,y,3,3,'#171e20');rect(c,x,y,2,1,'#c4b695');}
  return textureFrom(canvas,true);
}

function makeYardFloorTexture(){
  const[canvas,c]=canvas2d(64,64);
  rect(c,0,0,64,64,'#464944');
  for(let i=0;i<600;i++){const h=hash(i,25);rect(c,Math.floor(hash(i,7)*64),Math.floor(hash(i,13)*64),1+Math.floor(h*3),1+Math.floor(h*2),h>.7?'#818276':h>.3?'#5f655d':'#303b3a');}
  rect(c,0,1,64,1,'#596052');rect(c,1,0,1,64,'#596052');
  return textureFrom(canvas,true);
}

function makeShadowLandmark(type){
  const[canvas,c]=canvas2d(256,128);rect(c,0,0,256,128,'#181f2b');
  for(let x=0;x<256;x+=32){rect(c,x,0,2,128,'#48515b');for(let y=0;y<128;y+=24)rect(c,x,y,32,1,'#313e49');}
  if(type==='shadow-sun'){
    for(let r=51;r>8;r-=7){c.strokeStyle=r%2?'#a2805f':'#4f9d9d';c.lineWidth=3;c.beginPath();c.arc(128,62,r,0,Math.PI*2);c.stroke();}
    c.fillStyle='#03060c';c.beginPath();c.arc(128,62,27,0,Math.PI*2);c.fill();rect(c,125,39,5,47,'#ccf0cb');
  }else if(type==='shadow-arch'){
    poly(c,[[24,128],[24,50],[61,13],[195,13],[232,50],[232,128],[194,128],[194,55],[62,55],[62,128]],'#8c8c7b');
    for(const x of[37,207]){rect(c,x,56,12,48,'#c9ad70');rect(c,x+3,62,6,29,'#ffe7ac');}rect(c,62,28,132,8,'#48535b');
  }else{poly(c,[[104,124],[92,34],[128,3],[164,34],[152,124]],'#587b81');poly(c,[[128,3],[164,34],[152,124],[128,124]],'#2d4557');rect(c,123,29,6,76,'#b7ecd4');}
  return textureFrom(canvas);
}
function drawShadowEnemy(type,frame){
  const[canvas,c]=canvas2d(80,112),dead=frame===6,marked=type==='hydra-marked';
  if(dead){poly(c,[[6,104],[20,93],[58,95],[75,108],[14,111]],'#334654');rect(c,20,101,41,4,'#657880');return textureFrom(canvas);}
  if(type.startsWith('hydra')){
    const body=marked?'#60cddb':'#807aa0',glow=marked?'#d5ffff':'#e9c4a3';
    for(const[x,y]of[[15,30],[38,14],[61,31]]){poly(c,[[35,98],[x-6,53],[x-10,y+11],[x-3,y],[x+10,y+4],[x+12,y+20],[x+4,y+31],[46,95]],body);rect(c,x-6,y+10,15,10,'#1a1a2a');rect(c,x-3,y+12,10,3,glow);for(const dx of[0,6])rect(c,x-4+dx,y+20,3,7,'#dfd5bc');}
    poly(c,[[31,73],[51,70],[66,100],[76,109],[50,107],[40,94],[26,108],[4,110],[21,97]],'#45505f');
    for(const x of[23,36,49])rect(c,x,82,5,15,glow);
  }else{
    poly(c,[[9,108],[17,83],[26,73],[24,35],[33,19],[51,19],[59,37],[56,76],[68,90],[75,109]],'#273f4a');
    rect(c,24,40,34,38,type==='mortar'?'#ae8561':'#819697');rect(c,29,44,25,5,'#d9d6af');
    rect(c,34,14,14,38,'#8295a0');rect(c,32,12,18,8,'#d0ccac');rect(c,37,15,9,5,'#192d39');
    for(const x of[18,56]){rect(c,x,80,7,26,'#b3a27d');rect(c,x-6,104,20,5,'#5c7780');}
    rect(c,32,63,17,9,frame===4?'#ffcb84':'#a3cfba');
  }
  if(frame===5){c.globalCompositeOperation='source-atop';rect(c,0,0,80,112,'rgba(255,219,160,.45)');}
  return textureFrom(canvas);
}
function drawShadowWeapon(c,type,flash,clock){
  const nullgun=type==='nullgun',lance=type==='lance',accent=nullgun?'#93f0dc':lance?'#cdb6f4':'#efb96b';
  poly(c,[[-30,0],[-34,-50],[-22,-104],[-15,-145],[18,-145],[25,-104],[36,-48],[31,0]],'#182934');
  poly(c,[[-25,-4],[-27,-57],[-19,-99],[22,-99],[30,-55],[26,-4]],'#5f7785');
  rect(c,-19,-91,39,9,'#b4bec0');rect(c,-15,-76,31,34,'#233c48');
  for(const x of[-12,8]){rect(c,x,-137,6,49,'#a4bcc0');rect(c,x+1,-134,2,42,accent);}
  if(nullgun){for(const x of[-30,23]){rect(c,x,-131,8,44,'#b4a47e');for(let y=-126;y<-90;y+=9)rect(c,x-4,y,16,3,accent);}rect(c,-9,-112,20,22,'#3a888d');rect(c,-5,-108,12,14,accent);}
  else if(lance){rect(c,-8,-170,17,75,'#aabcc9');rect(c,-2,-168,4,69,'#303d5c');rect(c,-12,-174,25,6,accent);rect(c,-2,-178,4,7,'#f0d9fc');}
  else {rect(c,-8,-153,17,57,'#b5b4a2');rect(c,-2,-152,4,49,'#374c55');rect(c,17,-58,17,34,'#ad895b');for(let y=-54;y<-23;y+=7)rect(c,20,y,11,3,'#e8c791');}
  for(let y=-69;y<-45;y+=8){rect(c,-10,y,21,3,accent);rect(c,-9,y+3,19,2,'#19313e');}
  rect(c,-16,-30,33,26,'#384c59');rect(c,-12,-26,9,19,'#8c9b9e');
  c.font='bold 8px monospace';c.fillStyle=accent;c.fillText(nullgun?'NULL':lance?'LANCE':'RIVET',-15,-34);
  if(flash>0){const y=lance?-178:-151;poly(c,[[-11,y],[0,y-31],[6,y-8],[19,y-18],[8,y+4],[-15,y+10]],accent);rect(c,-2,y-19,5,23,'#effff1');}
}

function makeLandmarkTexture(type,view='side'){
  const[canvas,c]=canvas2d(256,128);
  if(type==='freight-car'){
    rect(c,0,0,256,128,'#253432');rect(c,4,13,248,88,'#8b4e36');rect(c,6,15,244,6,'#b27d51');
    for(let x=10;x<250;x+=19){rect(c,x,21,5,73,'#533c32');rect(c,x+1,21,2,70,'#bd8455');}
    rect(c,5,72,246,6,'#d2b576');rect(c,5,80,246,4,'#4c3f31');
    if(view==='side'){
      rect(c,85,27,85,70,'#5d4032');rect(c,88,30,79,63,'#a56640');
      for(let x=94;x<165;x+=12)rect(c,x,32,3,58,'#654832');rect(c,124,34,3,54,'#342b29');
      rect(c,115,56,5,15,'#d1ac69');rect(c,131,56,5,15,'#d1ac69');
    }else{
      for(const x of[70,181]){rect(c,x,23,5,76,'#d5b078');rect(c,x-3,52,11,9,'#5e5746');}
    }
    rect(c,8,99,240,9,'#172327');rect(c,15,105,226,5,'#637169');
    for(const x of[40,211]){poly(c,[[x-16,111],[x-11,101],[x+11,101],[x+16,111],[x+11,122],[x-11,122]],'#111c21');rect(c,x-7,107,14,10,'#6c7469');rect(c,x-3,110,6,4,'#d1c3a0');}
    c.textAlign='left';c.font='bold 14px monospace';c.fillStyle='#e0c58b';c.fillText('NF / 15',15,43);
    rect(c,6,118,244,4,'#8a8f7c');
  }else if(type==='transformer'){
    rect(c,0,0,256,128,'#30494e');rect(c,5,36,246,86,'#52747b');rect(c,8,39,240,6,'#abc3b7');
    for(let x=14;x<244;x+=12){rect(c,x,51,7,60,'#233e48');rect(c,x+1,51,2,60,'#8da8a4');}
    for(const x of[39,96,157,215]){rect(c,x-4,5,8,32,'#8b6d4f');for(let y=8;y<36;y+=7){rect(c,x-12,y,24,4,'#b2c9b8');rect(c,x-8,y+3,16,2,'#6b8d86');}}
    rect(c,22,9,209,4,'#cf9861');rect(c,24,11,205,1,'#f1ca86');
    rect(c,100,55,56,50,'#263c43');capabilityGlyph(c,'power',128,80,38,'#f0ca76');
    for(let x=7;x<251;x+=20)poly(c,[[x,115],[x+10,115],[x+17,124],[x+7,124]],'#e1b86b');
  }else{
    rect(c,0,0,256,128,'#677d75');rect(c,0,0,256,14,'#304746');rect(c,0,4,256,4,'#a8aa8e');
    for(let x=9;x<250;x+=60){rect(c,x,24,50,55,'#203942');rect(c,x+3,27,44,48,'#8a9c88');rect(c,x+5,30,39,18,'#d6c693');rect(c,x+6,50,36,22,'#586b5f');rect(c,x+23,27,4,48,'#273f44');rect(c,x+3,47,44,4,'#273f44');}
    rect(c,6,83,244,5,'#bdb58e');rect(c,6,93,244,24,'#3d5755');
    c.textAlign='center';c.font='bold 17px monospace';c.fillStyle='#e2d9ae';c.fillText('SECURITY / 15',128,111);
    for(const x of[7,243])rect(c,x,15,5,108,'#d0c3a1');
  }
  return textureFrom(canvas);
}

function solidLandmarkPanels(level,types){
  const panels=[];
  for(const item of level.landmarks||[]){
    if(!types.includes(item.type))continue;
    const{x,z,width,depth}=item;if(![x,z,width,depth].every(Number.isFinite)||width<=0||depth<=0)continue;
    const x1=x-width/2,x2=x+width/2,z1=z-depth/2,z2=z+depth/2;
    let blocked=true;
    for(let cz=Math.floor(z1);cz<Math.ceil(z2);cz++)for(let cx=Math.floor(x1);cx<Math.ceil(x2);cx++)if(level.grid[cz]?.[cx]!=='#')blocked=false;
    if(!blocked)continue; // Artwork must never invent solid cover on playable cells.
    for(const face of[{x:x1-.012,z,dx:1,dz:0,width:depth},{x:x2+.012,z,dx:-1,dz:0,width:depth},{x,z:z1-.012,dx:0,dz:1,width},{x,z:z2+.012,dx:0,dz:-1,width}]){
      panels.push({...face,id:item.id,type:item.type,palette:gardenPalette(item,level),view:(item.axis==='z'?face.dx:face.dz)?'side':'end',height:item.type==='root-mass'?3.7:item.type==='glass-lab'?2.85:WALL_HEIGHT,bottom:0});
    }
  }
  return panels;
}

const yardLandmarkPanels=level=>solidLandmarkPanels(level,['freight-car','transformer','security-cabin']);
const gardenLandmarkPanels=level=>solidLandmarkPanels(level,GARDEN_LANDMARKS);
const allLandmarkPanels=level=>[...yardLandmarkPanels(level),...gardenLandmarkPanels(level),...solidLandmarkPanels(level,['shadow-arch','shadow-obelisk','shadow-sun']),...solidLandmarkPanels(level,['sealed-crate','sleep-pod','tape-vault','listening-array'])];
const landmarkKey=panel=>GARDEN_LANDMARKS.includes(panel.type)?`${panel.type}:${panel.type==='glass-lab'?panel.view:'shared'}:${panel.palette}`:`${panel.type}:${panel.view}`;
const landmarkTexture=panel=>panel.type.startsWith('shadow-')?makeShadowLandmark(panel.type):['sealed-crate','sleep-pod','tape-vault','listening-array'].includes(panel.type)?makeHollowLandmarkTexture(panel.type):GARDEN_LANDMARKS.includes(panel.type)?makeGardenLandmarkTexture(panel.type,panel.view,panel.palette):makeLandmarkTexture(panel.type,panel.view);

function destinationPanels(level){
  const labels=new Map((level.doors||[]).filter(door=>door.destinationLabel).map(door=>[door.id,{label:door.destinationLabel,mark:level.signCode||'SW 15'}]));
  if(level.destinationPreview)labels.set(level.destinationPreview.doorId,level.destinationPreview);
  const panels=[];
  for(const[doorId,meta]of labels){const door=(level.doors||[]).find(door=>door.id===doorId);if(!door)continue;
    for(const side of[-1,1])panels.push({doorId,x:door.x+(door.axis==='z'?side*.085:0),z:door.z+(door.axis==='z'?0:side*.085),dx:door.axis==='z'?-side:0,dz:door.axis==='z'?0:-side,width:.94,height:.29,bottom:2.04,label:meta.label,mark:meta.mark||'SW 15'});
  }
  for(const notice of level.wallNotices||[])panels.push({...notice,label:notice.title,mark:level.signCode});
  return panels;
}

function makeYardGroundDetails(level){
  const scale=8,[canvas,c]=canvas2d(level.width*scale,level.height*scale),paths=[];
  const solid=(x,z)=>!level.grid[z]?.[x]||level.grid[z][x]==='#';
  const pathBetween=(start,end)=>{
    const sx=Math.floor(start.x),sz=Math.floor(start.z),ex=Math.floor(end.x),ez=Math.floor(end.z),startKey=sz*level.width+sx,endKey=ez*level.width+ex;
    const queue=[startKey],parents=new Map([[startKey,-1]]);
    for(let n=0;n<queue.length&&!parents.has(endKey);n++){
      const key=queue[n],x=key%level.width,z=Math.floor(key/level.width);
      for(const[dx,dz]of[[1,0],[0,1],[-1,0],[0,-1]]){
        const nx=x+dx,nz=z+dz,next=nz*level.width+nx;
        if(solid(nx,nz)||parents.has(next))continue;parents.set(next,key);queue.push(next);
      }
    }
    if(!parents.has(endKey))return[];
    const points=[];for(let key=endKey;key!==-1;key=parents.get(key))points.push({x:key%level.width+.5,z:Math.floor(key/level.width)+.5});
    return points.reverse();
  };
  for(const feature of(level.interactables||[]).filter(item=>item.type==='shutter-switch'))for(const id of feature.doorIds||[]){
    const door=(level.doors||[]).find(item=>item.id===id);if(!door)continue;
    const points=pathBetween(feature,door);if(points.length<2)continue;paths.push({mark:circuitMark(feature),points});
    for(let n=1;n<points.length;n++){
      const a=points[n-1],b=points[n],x=Math.min(a.x,b.x)*scale,z=Math.min(a.z,b.z)*scale,w=Math.abs(a.x-b.x)*scale,h=Math.abs(a.z-b.z)*scale;
      rect(c,x-1,z-1,w+3,h+3,'#263b39');rect(c,x,z,w+1,h+1,'#b8a16b');
    }
  }
  for(const car of(level.landmarks||[]).filter(item=>item.type==='freight-car')){
    const alongZ=car.axis==='z',length=(alongZ?car.depth:car.width)+6;
    for(let n=-length/2;n<=length/2;n+=.8){
      const x=car.x+(alongZ?0:n),z=car.z+(alongZ?n:0);
      rect(c,(x-(alongZ?1.25:.08))*scale,(z-(alongZ?.08:1.25))*scale,(alongZ?2.5:.16)*scale,(alongZ?.16:2.5)*scale,'#4f4435');
    }
    for(const side of[-.83,.83]){
      const x=car.x+(alongZ?side:-length/2),z=car.z+(alongZ?-length/2:side);
      rect(c,x*scale,z*scale,(alongZ?.12:length)*scale,(alongZ?length:.12)*scale,'#bac0aa');
    }
  }
  return{texture:textureFrom(canvas),paths};
}

function gardenPalette(item,level){
  if(GARDEN_PALETTES[item.palette])return item.palette;
  const zone=(level.zones||[]).find(zone=>item.x>=zone.x1&&item.x<zone.x2&&item.z>=zone.z1&&item.z<zone.z2);
  return GARDEN_PALETTES[zone?.palette]?zone.palette:'cyan';
}

function gardenLeaves(c,x,y,size,color,seed=0){
  rect(c,x-1,y-size,2,size,'#334e38');
  for(let n=0;n<5;n++){
    const side=n%2?1:-1,cy=y-size*.22-n*size*.16,length=size*(.34+hash(n,seed)*.16);
    poly(c,[[x,cy],[x+side*length*.55,cy-size*.23],[x+side*length,cy-size*.18],[x+side*length*.73,cy+size*.03]],color);
    poly(c,[[x,cy],[x+side*length*.73,cy-size*.11],[x+side*length*.55,cy+size*.01]],'#afca8c');
  }
}

function makeGardenWallTexture(name){
  const[canvas,c]=canvas2d(64,128),p=GARDEN_PALETTES[name]||GARDEN_PALETTES.cyan;
  rect(c,0,0,64,128,p.dark);rect(c,4,8,56,105,p.panel);
  // Sealed glazing remains an opaque wall: reflections and interior planting
  // describe the material without promising line of sight through solid cells.
  for(const x of[7,34]){
    rect(c,x,14,22,69,p.glass);rect(c,x+1,15,20,12,'#8bbcaf');
    poly(c,[[x+1,26],[x+21,17],[x+21,27],[x+1,38]],'#76a99e');
    poly(c,[[x+3,44],[x+19,36],[x+19,40],[x+3,48]],p.trim);
    gardenLeaves(c,x+11,80,26,p.leaf,x);rect(c,x,80,22,4,p.dark);
    rect(c,x-2,10,2,78,p.trim);rect(c,x+21,10,2,78,p.trim);
  }
  for(const y of[5,86,116]){rect(c,0,y,64,5,p.dark);rect(c,0,y,64,2,p.trim);}
  rect(c,8,94,47,14,p.dark);rect(c,10,96,43,2,p.accent);
  for(let x=12;x<54;x+=7)rect(c,x,101,3,5,p.panel);
  for(const x of[1,61]){rect(c,x,0,2,128,p.trim);for(let y=18;y<123;y+=26)rect(c,x,y,2,3,p.dark);}
  if(name==='green'||name==='violet'){
    for(let n=0;n<6;n++)gardenLeaves(c,6+n*10,126,11+n%3*6,p.leaf,n+14);
    poly(c,[[2,4],[8,16],[5,34],[10,47],[8,59],[5,50],[2,35],[5,17]],'#547a4e');
  }
  return textureFrom(canvas,true);
}

function makeGardenFloorTexture(name,ceiling=false){
  const[canvas,c]=canvas2d(64,64),p=GARDEN_PALETTES[name]||GARDEN_PALETTES.cyan;
  if(ceiling){
    rect(c,0,0,64,64,'#81aaa1');
    for(const[x,y]of[[4,4],[34,4],[4,34],[34,34]]){
      rect(c,x,y,25,25,'#a4c8b5');rect(c,x+2,y+2,21,6,'#bed5b9');
      poly(c,[[x+3,y+22],[x+22,y+4],[x+22,y+12],[x+12,y+22]],'#cce2c4');
    }
    for(const n of[0,30,60]){rect(c,n,0,4,64,p.dark);rect(c,n+1,0,1,64,p.trim);rect(c,0,n,64,4,p.dark);rect(c,0,n+1,64,1,p.trim);}
    rect(c,8,31,17,2,p.accent);return textureFrom(canvas,true);
  }
  rect(c,0,0,64,64,p.floor);
  for(let y=0;y<64;y+=16)for(let x=0;x<64;x+=16){
    rect(c,x,y,16,1,p.dark);rect(c,x,y,1,16,p.dark);rect(c,x+2,y+2,12,1,'#a0ac8a');
    for(let n=0;n<3;n++)rect(c,x+3+hash(x,n)*9,y+5+hash(y,n+1)*8,1,1,p.trim);
  }
  rect(c,26,0,12,64,p.dark);for(let y=2;y<64;y+=5){rect(c,28,y,8,2,'#879f91');rect(c,30,y,4,1,p.trim);}
  return textureFrom(canvas,true);
}

function makeGardenLandmarkTexture(type,view='side',name='green'){
  const[canvas,c]=canvas2d(192,144),p=GARDEN_PALETTES[name]||GARDEN_PALETTES.green;
  rect(c,0,0,192,144,p.dark);
  if(type==='glass-lab'){
    rect(c,4,11,184,126,p.panel);rect(c,8,16,176,111,p.glass);
    for(let x=12;x<182;x+=42){
      rect(c,x,21,36,70,'#689e95');rect(c,x+2,23,32,12,'#b6d8be');
      gardenLeaves(c,x+17,95,45,p.leaf,x);rect(c,x+7,90,24,13,'#8c8464');rect(c,x+5,89,28,4,'#bcb99a');
      c.globalAlpha=.52;poly(c,[[x+1,51],[x+35,30],[x+35,41],[x+1,62]],'#c9eee1');c.globalAlpha=1;
      rect(c,x-4,16,4,113,p.trim);rect(c,x+34,16,3,113,p.dark);
    }
    for(const y of[12,106,131]){rect(c,0,y,192,6,p.trim);rect(c,0,y+5,192,2,p.dark);}
    rect(c,7,2,178,7,'#d3e6c1');rect(c,69,113,54,13,p.dark);
    c.textAlign='center';c.font='bold 8px monospace';c.fillStyle=p.accent;c.fillText(view==='side'?'CULTURE / 17':'BOTANY',96,123);
  }else if(type==='root-mass'){
    rect(c,0,0,192,144,'#273f36');
    for(let n=0;n<22;n++){
      const x=hash(n,8)*192,y=hash(n,11)*70;
      poly(c,[[x-20,y+13],[x-13,y],[x+2,y-7],[x+22,y+7],[x+11,y+27],[x-7,y+30]],n%3?'#608357':'#849c65');
    }
    // Multiple branching roots, rather than a flat crate, give the atrium a
    // recognizable central silhouette from every side of its solid footprint.
    for(let n=0;n<8;n++){
      const x=24+n*20,top=38+hash(n,2)*22,mid=75+hash(n,3)*16;
      poly(c,[[x-8,top],[x+10,top-5],[x+15,mid],[x+29,120],[x+44,144],[x+13,144],[x+2,119],[x-7,88]],n%2?'#8c8d61':'#686f4e');
      poly(c,[[x-3,top],[x+2,top],[x+7,mid],[x+19,122],[x+28,140],[x+19,138],[x+10,116],[x+1,82]],'#b3ad79');
    }
    for(let n=0;n<12;n++)gardenLeaves(c,hash(n,16)*192,42+hash(n,19)*93,22+hash(n,21)*25,p.leaf,n);
    for(const[x,y]of[[27,77],[154,60],[93,111]]){rect(c,x,y,5,8,'#d9e7a0');rect(c,x-3,y+3,11,3,'#c2d582');}
  }else if(type==='cultivation-bed'){
    rect(c,3,81,186,61,'#5d7265');rect(c,2,80,188,9,p.trim);rect(c,8,91,176,4,p.dark);
    for(let x=10;x<185;x+=16){rect(c,x,101,10,33,p.panel);rect(c,x,102,2,31,p.trim);}
    for(let n=0;n<11;n++)gardenLeaves(c,9+n*17,81,48+hash(n,4)*27,p.leaf,n+9);
    for(const x of[26,85,147]){rect(c,x,38,7,14,'#eee6b0');rect(c,x-5,43,17,5,name==='violet'?'#e0a0d5':'#eec77d');}
    rect(c,68,103,56,23,p.dark);c.textAlign='center';c.font='bold 10px monospace';c.fillStyle=p.trim;c.fillText('GH / 17',96,119);
  }else if(type==='pump-bank'){
    rect(c,4,25,184,112,'#616d64');rect(c,5,28,182,7,'#c4c2a0');
    for(const x of[33,96,160]){
      rect(c,x-18,45,37,82,'#344f51');rect(c,x-14,48,29,73,'#78938a');
      rect(c,x-11,60,22,35,'#213d48');rect(c,x-7,63,14,24,'#d4cb98');rect(c,x-2,65,4,20,'#72bead');
      for(const y of[53,103,118]){rect(c,x-18,y,37,5,'#b0b59a');rect(c,x-20,y+1,4,3,'#394d4d');}
      rect(c,x-5,5,10,37,'#acb5a2');rect(c,x-7,9,14,6,'#e7c27d');
    }
    rect(c,26,5,143,7,'#d8c291');rect(c,27,6,141,2,'#f4dfac');
    for(let x=5;x<189;x+=18)poly(c,[[x,132],[x+8,132],[x+16,142],[x+8,142]],'#e7b965');
  }else{
    rect(c,4,23,184,116,'#457b83');rect(c,8,29,176,99,'#649e9e');
    rect(c,8,62,176,66,'#417a88');
    for(let n=0;n<14;n++){const x=hash(n,8)*170+10,y=68+hash(n,11)*54;rect(c,x,y,11+n%7,2,'#92cfc4');}
    for(const y of[18,26,128,137]){rect(c,1,y,190,6,p.trim);rect(c,3,y+5,186,2,p.dark);}
    for(const x of[10,59,124,177]){rect(c,x,24,5,112,'#b3cec0');rect(c,x+1,29,2,94,'#eff0c7');}
    rect(c,67,39,58,17,'#274b58');c.textAlign='center';c.font='bold 9px monospace';c.fillStyle='#c6efcf';c.fillText('IRRIGATION',96,51);
    rect(c,147,42,17,64,'#233e49');rect(c,151,46,9,55,'#b4ddc4');rect(c,153,69,5,31,'#4a9eb1');
  }
  return textureFrom(canvas);
}

function makeGardenGroundDetails(level){
  const scale=8,[canvas,c]=canvas2d(level.width*scale,level.height*scale),waterCells=new Uint8Array(level.width*level.height),areas=[];
  const open=(x,z)=>!!level.grid[z]?.[x]&&level.grid[z][x]!=='#';
  for(const area of level.gardenZones||[]){
    const x1=area.x-area.width/2,x2=area.x+area.width/2,z1=area.z-area.depth/2,z2=area.z+area.depth/2;
    const cells=[];
    for(let z=Math.max(0,Math.floor(z1));z<Math.min(level.height,Math.ceil(z2));z++)for(let x=Math.max(0,Math.floor(x1));x<Math.min(level.width,Math.ceil(x2));x++){
      if(!open(x,z)||x+.5<x1||x+.5>=x2||z+.5<z1||z+.5>=z2)continue;cells.push({x,z});
      const px=x*scale,pz=z*scale;
      if(area.type==='water'){
        waterCells[z*level.width+x]=1;rect(c,px,pz,8,8,'#477c83');rect(c,px,pz,1,8,'#afcab5');rect(c,px+7,pz,1,8,'#afcab5');
        rect(c,px+2,pz+2,4,2,'#86b9ad');if(z%3===0)rect(c,px,pz+5,8,2,'#a4b699');
      }else if(area.type==='garden'){
        rect(c,px,pz,8,8,'#4c654b');for(let n=0;n<4;n++){const ax=px+hash(n,x+z)*6,ay=pz+hash(x,n+z)*6;poly(c,[[ax,ay+2],[ax+2,ay],[ax+4,ay+1],[ax+2,ay+4]],n%2?'#779d62':'#a3b777');}
      }else{
        rect(c,px,pz,8,8,area.type==='pumpworks'?'#8e8060':'#7c9d94');rect(c,px,pz,1,8,'#c0d6b4');rect(c,px,pz+7,8,1,'#c0d6b4');
      }
    }
    areas.push({type:area.type,cells});
  }
  // Authored borders and a drain make the walkable courtyard floor read as
  // landscaped space; foliage silhouettes stay on solid landmark footprints.
  for(let z=0;z<level.height;z++)for(let x=0;x<level.width;x++)if(open(x,z)){
    if(!open(x-1,z))rect(c,x*scale,z*scale,1,8,'#c3c7a0');
    if(!open(x,z-1))rect(c,x*scale,z*scale,8,1,'#c3c7a0');
  }
  const waterRuns=[];
  for(let z=0;z<level.height;z++){let start=-1;for(let x=0;x<=level.width;x++){
    const wet=x<level.width&&waterCells[z*level.width+x];if(wet&&start<0)start=x;
    if(!wet&&start>=0){waterRuns.push({x1:start,x2:x,z});start=-1;}
  }}
  return{texture:textureFrom(canvas),waterCells,waterRuns,areas};
}

function makeWaterHighlightsTexture(){
  const[canvas,c]=canvas2d(64,64);
  for(let n=0;n<16;n++){
    const x=hash(n,11)*58,y=hash(n,17)*61;rect(c,x,y,5+hash(n,19)*12,1,'#b6ded0');rect(c,x+3,y+2,4,1,'#77adab');
  }
  return textureFrom(canvas,true);
}

function makeStationTexture(item,mode){
  if(item.type==='jump'){
    const[canvas,c]=canvas2d(112,160),color=mode?'#a9edb4':'#d89a5b';
    rect(c,24,139,64,14,'#526575');rect(c,46,94,20,45,'#263944');rect(c,18,22,76,79,'#182c38');rect(c,22,26,68,4,color);
    poly(c,[[56,38],[78,63],[63,63],[63,80],[49,80],[49,63],[34,63]],color);
    c.font='bold 9px monospace';c.textAlign='center';c.fillStyle=color;c.fillText(mode?'JUMP WINDOW':'WAIT',56,116);return textureFrom(canvas);
  }
  if(item.type==='record')return makeRecordTexture(mode);
  if(item.routing)return makeContainmentSwitchTexture(item,mode);
  if(item.type==='shutter-switch')return makeShutterSwitchTexture(item,mode);
  const[canvas,c]=canvas2d(112,160),type=item.type,installed=mode>0;
  const color=type==='upgrade'?UPGRADE_COLORS[item.upgrade]||'#e0c080':type==='refuge'?'#b2e3a2':mode===2?'#85ebda':mode===1?'#e6c181':'#819caf';
  rect(c,22,144,70,12,'#17282e');rect(c,25,139,64,6,'#758680');rect(c,31,88,52,51,'#30454a');rect(c,33,91,5,46,'#81928a');
  for(let y=113;y<135;y+=6){rect(c,42,y,33,2,'#172b33');rect(c,42,y+2,33,1,'#56696a');}
  rect(c,9,80,94,31,'#14262d');rect(c,10,80,92,3,color);rect(c,13,108,86,2,'#58706c');
  c.textAlign='center';c.font='bold 10px monospace';c.fillStyle=color;
  const title=type==='upgrade'?(item.upgrade==='phase'?'PHASE MODULE':item.upgrade==='insulator'?'INSULATOR':'THERMAL CUTTER'):type==='refuge'?'REFUGE':'TRANSIT LINK';
  c.fillText(title,56,94);c.font='6px monospace';c.fillStyle='#c5d6c8';
  if(type==='upgrade')capabilityGlyph(c,item.upgrade,56,124,20,color);
  else if(type==='refuge'){rect(c,49,118,14,24,color);rect(c,43,124,26,10,color);}
  else{rect(c,42,118,8,16,color);rect(c,62,118,8,16,mode===2?color:'#43535f');if(mode===2)rect(c,50,124,12,3,color);}
  if(type==='upgrade'){
    rect(c,25,69,64,8,'#61777a');rect(c,29,72,56,3,color);
    if(installed){rect(c,43,56,26,8,'#253b40');poly(c,[[48,55],[54,61],[65,48],[68,51],[54,67],[45,58]],'#b7e6c4');}
    else if(item.upgrade==='cutter'){
      poly(c,[[34,28],[47,22],[65,35],[67,58],[52,64],[41,52],[34,52]],'#1b2c33');
      rect(c,39,33,16,22,'#af7751');rect(c,42,34,5,18,color);rect(c,52,40,20,7,'#82918a');
      poly(c,[[64,29],[80,18],[85,22],[72,37],[69,45],[65,43]],color);rect(c,39,55,11,10,'#52666a');
    }else if(item.upgrade==='insulator'){
      poly(c,[[38,21],[47,17],[65,17],[74,21],[83,36],[76,66],[36,66],[29,36]],'#1c2e35');
      poly(c,[[41,26],[71,26],[74,39],[68,61],[44,61],[38,39]],'#99945c');rect(c,43,29,25,4,color);
      poly(c,[[58,34],[49,48],[56,48],[51,58],[66,42],[59,42]],'#f2e6a1');
    }else{
      poly(c,[[56,15],[77,31],[73,57],[56,71],[38,57],[34,31]],'#405062');
      poly(c,[[56,20],[70,34],[66,55],[56,64],[45,55],[42,34]],color);poly(c,[[56,24],[61,36],[57,58],[51,36]],'#e1dcfa');
      rect(c,28,32,6,23,'#8a9a9b');rect(c,78,32,6,23,'#8a9a9b');
    }
  }else if(type==='refuge'){
    rect(c,20,12,7,126,'#586f67');rect(c,85,12,7,126,'#586f67');rect(c,24,11,64,7,color);
    poly(c,[[56,23],[77,31],[74,57],[56,73],[37,57],[34,31]],'#335c4d');
    rect(c,51,32,11,30,color);rect(c,41,42,31,10,color);rect(c,54,35,3,24,'#e2f4c8');
    for(const x of[22,87])rect(c,x,32,3,97,installed?'#b4e8a7':'#567765');
  }else{
    for(const x of[18,88]){rect(c,x,14,6,63,'#536c79');rect(c,x+1,20,3,49,color);}
    for(const y of[20,31,60,71]){rect(c,29,y,54,3,color);rect(c,34,y+3,44,1,'#3b6871');}
    poly(c,[[56,31],[72,45],[56,60],[40,45]],mode===2?'#b6fff0':mode===1?'#d6bd80':'#597783');
    poly(c,[[56,37],[64,45],[56,53],[48,45]],'#24414b');rect(c,52,43,8,4,color);
    rect(c,15,151,82,3,color);
  }
  return textureFrom(canvas);
}

function drawEncounterEnemy(type,frame){
  const[canvas,c]=canvas2d(80,112),sentry=type.startsWith('sentry'),angry=type==='sentry-hostile',attack=frame===4,step=frame<4?[0,3,0,-3][frame]:0;
  const accent=sentry?(angry?'#f08a63':'#ecd28a'):'#d5bbff';
  if(frame===6){
    poly(c,[[8,102],[19,94],[58,94],[74,105],[62,110],[16,109]],'#14212b');
    rect(c,19,96,43,9,sentry?'#92a7a4':'#755d98');rect(c,23,99,11,3,accent);return textureFrom(canvas);
  }
  if(sentry){
    // A manufactured, symmetrical silhouette and white shield distinguish a
    // security actor from the creatures before the player fires a shot.
    poly(c,[[28,13],[52,13],[57,28],[66,36],[70,67],[61,79],[63,107],[45,109],[40,85],[35,109],[17,107],[19,78],[10,66],[14,36],[24,29]],'#101e26');
    for(const[x,offset]of[[22,step],[45,-step]]){rect(c,x+offset,73,12,31,'#586e76');rect(c,x+offset,82,12,5,accent);rect(c,x-3+offset,101,18,7,'#bac9bd');}
    poly(c,[[24,32],[56,32],[61,64],[53,81],[26,81],[18,59]],'#8fa8a6');
    rect(c,27,37,25,7,'#dce1c6');rect(c,29,48,22,27,'#233c46');
    poly(c,[[40,48],[49,53],[47,66],[40,73],[33,66],[31,53]],accent);
    if(angry){poly(c,[[33,53],[36,51],[47,65],[44,68]],'#662b2e');poly(c,[[44,51],[47,54],[36,68],[33,65]],'#662b2e');}
    else{poly(c,[[34,57],[40,61],[46,57],[46,61],[40,66],[34,61]],'#f6f2d4');}
    rect(c,14,35,12,14,'#c3c9ae');rect(c,54,35,12,14,'#c3c9ae');rect(c,14,38,12,4,accent);rect(c,54,38,12,4,accent);
    const lift=attack?-9:2;
    poly(c,[[15,48],[25,49],[30,63+lift],[46,62+lift],[48,72+lift],[25,77+lift],[13,63]],'#768b8b');
    poly(c,[[57,47],[67,48],[66,70+lift],[51,76+lift],[42,71+lift],[45,62+lift],[56,64+lift]],'#9dada3');
    rect(c,28,61+lift,29,6,'#c3d5cf');rect(c,30,67+lift,25,6,'#233843');rect(c,38,59+lift,9,12,'#526b77');
    poly(c,[[28,16],[50,16],[55,23],[51,34],[29,34],[25,24]],'#aebfb5');rect(c,27,23,27,7,'#172f3a');
    if(angry){poly(c,[[29,23],[39,25],[37,28],[29,26]],accent);poly(c,[[41,25],[51,23],[51,26],[43,28]],accent);}
    else rect(c,30,25,20,3,accent);
    rect(c,35,33,11,5,'#536f77');
    if(attack){poly(c,[[42,39],[47,49],[53,47],[49,57],[55,60],[45,64],[40,71],[36,63],[29,61],[34,55],[31,48],[39,50]],'#f4c578');rect(c,38,52,8,9,'#fff5d3');}
  }else{
    // A split, almost weightless outline and offset phase rings make the
    // stalker recognizable at a distance, including while standing still.
    poly(c,[[29,8],[35,2],[40,13],[47,3],[53,9],[51,24],[61,34],[66,56],[77,83],[69,89],[53,67],[48,88],[54,104],[43,110],[38,94],[31,108],[22,103],[28,83],[23,61],[10,89],[3,83],[17,47],[19,32],[30,23]],'#171a29');
    poly(c,[[25,30],[52,27],[57,48],[47,78],[33,89],[24,66],[20,46]],'#70598c');
    poly(c,[[33,32],[47,31],[48,53],[39,76],[32,62]],'#c0a2e6');rect(c,36,40,5,22,'#25283e');
    poly(c,[[20,32],[27,36],[25,57],[16,79+step],[7,85+step],[14,58]],'#9b84b5');
    poly(c,[[53,31],[60,36],[63,61],[73,80-step],[68,87-step],[55,68],[51,48]],'#b29bcb');
    poly(c,[[30,74],[38,82],[32+step,102],[24+step,106],[28+step,87]],'#81709d');
    poly(c,[[42,76],[50,72],[48-step,89],[53-step,104],[45-step,107],[38-step,88]],'#a28aba');
    poly(c,[[30,13],[48,12],[53,25],[43,35],[31,29],[27,22]],'#ddd2df');rect(c,30,20,20,6,'#282039');
    for(const x of[32,39,46])rect(c,x,21,2,3,accent);
    if(attack){capabilityGlyph(c,'phase',40,55,39,'#e5d4ff');rect(c,39,43,3,24,'#fff1ff');}
    else for(const[x,y]of[[11,34],[65,52],[20,92]]){rect(c,x,y,6,2,accent);rect(c,x+2,y-2,2,6,accent);}
  }
  if(frame===5){c.globalCompositeOperation='source-atop';rect(c,0,0,80,112,'rgba(255,190,151,.48)');}
  return textureFrom(canvas);
}

function drawEnemy(type, frame) {
  if(['hydra','hydra-marked','turret','mortar'].includes(type))return drawShadowEnemy(type,frame);
  if(type.startsWith('bulwark')||type.startsWith('mender'))return drawGardenEnemy(type,frame);
  if(type==='echo')return makeEchoEnemy(frame);
  if(type==='stalker'||type.startsWith('sentry'))return drawEncounterEnemy(type,frame);
  const [canvas,c] = canvas2d(80,112);
  const dead = frame === 6;
  const attack = frame === 4;
  const hurt = frame === 5;
  const step = frame < 4 ? [0,3,0,-3][frame] : 0;
  const bob = frame === 1 || frame === 3 ? 1 : 0;
  if (dead) {
    poly(c,[[7,100],[21,91],[47,90],[70,99],[66,106],[12,107]],'#271b1e');
    rect(c,16,93,45,8,type==='brute'?'#6c4d36':type==='spitter'?'#305658':'#673b37');
    rect(c,26,90,19,9,'#9a5641');
    rect(c,49,96,19,5,'#3c4545');
    rect(c,13,99,18,5,'#6f272c');
    return textureFrom(canvas);
  }
  c.save(); c.translate(0,bob);
  // A hard dark silhouette makes each hostile readable against the environment.
  poly(c,[[30,12],[49,12],[55,28],[67,35],[73,65],[62,76],[58,105],[45,107],[39,81],[34,106],[18,107],[20,77],[9,65],[15,37],[26,28]],'#11181c');
  if(type==='runner'){
    poly(c,[[22,71],[36,72],[35+step,93],[30+step,104],[17+step,104],[21+step,89]],'#354447');
    poly(c,[[41,73],[55,72],[57-step,89],[61-step,105],[46-step,105],[41-step,91]],'#304044');
    rect(c,17+step,101,15,6,'#19272d');rect(c,45-step,102,18,5,'#18252c');
    poly(c,[[25,29],[52,29],[58,56],[51,78],[26,78],[20,56]],'#6e463d');
    poly(c,[[24,30],[33,32],[30,58],[25,72],[20,54]],'#475856');
    poly(c,[[46,31],[56,34],[59,58],[53,74],[45,69]],'#4d5c55');
    rect(c,32,36,13,34,'#9c5b45');
    for(let y=40;y<65;y+=6){rect(c,31,y,16,2,'#352a29');rect(c,34,y+2,10,1,'#bc7a55');}
    rect(c,26,73,27,6,'#24333a');rect(c,35,73,6,5,'#a99565');
    const lift=attack?-14:0;
    poly(c,[[20,34],[27,41],[20,59+lift],[17,74+lift],[9,72+lift],[12,50]],'#97614a');
    poly(c,[[54,35],[61,33],[69,52],[70,72+lift],[61,77+lift],[57,58]],'#9f6249');
    for(let i=0;i<3;i++){rect(c,8+i*3,71+lift,2,9,'#c5a378');rect(c,62+i*3,73+lift,2,9,'#c5a378');}
    rect(c,29,12,22,23,'#955940');rect(c,26,16,6,13,'#633f34');
    rect(c,47,14,6,14,'#6d4234');rect(c,30,11,19,4,'#302c28');
    rect(c,30,20,7,5,'#211d20');rect(c,42,20,7,5,'#211d20');
    rect(c,31,21,5,2,'#f1a26b');rect(c,43,21,4,2,'#f1a26b');
    rect(c,36,25,5,5,'#60392c');rect(c,33,31,15,attack?7:3,'#251c21');
    rect(c,34,31,11,2,'#c7aa7f');
  }else if(type==='spitter'){
    poly(c,[[25,71],[38,75],[33+step,103],[20+step,105]],'#32424a');
    poly(c,[[41,74],[55,71],[61-step,104],[44-step,105]],'#354a50');
    rect(c,19+step,101,15,6,'#1c2b34');rect(c,45-step,102,17,5,'#1b2b34');
    poly(c,[[21,32],[57,30],[61,62],[51,81],[26,79],[18,56]],'#476467');
    poly(c,[[28,36],[50,36],[54,68],[43,76],[29,69]],'#253c43');
    rect(c,31,43,18,20,'#659481');rect(c,34,46,12,14,'#bdd38c');
    rect(c,36,48,8,10,attack?'#f3ffc1':'#96b970');
    poly(c,[[18,34],[26,40],[20,60],[20,77],[11,77],[10,55]],'#54736d');
    poly(c,[[55,33],[64,36],[70,57],[66,74],[57,70],[59,53]],'#55716a');
    rect(c,11,69,10,12,'#273b40');rect(c,58,65,11,12,'#283c40');
    poly(c,[[27,12],[48,9],[56,24],[51,37],[29,37],[22,24]],'#33474b');
    rect(c,29,16,20,17,'#a2a17e');rect(c,26,21,27,7,'#132d34');
    rect(c,28,22,9,3,'#91e1b0');rect(c,42,22,9,3,'#91e1b0');
    rect(c,35,28,10,9,'#263e3f');rect(c,37,30,6,7,attack?'#def5a2':'#8a9870');
    rect(c,23,16,4,13,'#a18c69');rect(c,51,17,5,13,'#927b5d');
    if(attack){rect(c,32,36,18,9,'#a2c476');rect(c,35,35,12,10,'#e1efa7');}
  }else{
    poly(c,[[19,70],[37,72],[36+step,103],[15+step,107],[14+step,90]],'#514c43');
    poly(c,[[40,73],[60,70],[65-step,106],[44-step,106],[40-step,90]],'#484940');
    rect(c,13+step,101,23,7,'#212e34');rect(c,43-step,101,24,7,'#1d2b31');
    poly(c,[[15,31],[27,25],[53,25],[65,33],[68,61],[56,82],[23,81],[12,61]],'#70533a');
    poly(c,[[23,33],[55,33],[59,61],[51,74],[29,74],[19,58]],'#ad7843');
    rect(c,28,39,25,21,'#323e43');rect(c,30,41,21,4,'#d29a53');
    for(let y=47;y<60;y+=5)rect(c,31,y,19,2,'#65706a');
    poly(c,[[9,29],[25,28],[26,43],[17,50],[4,43]],'#9d7546');
    poly(c,[[56,27],[70,30],[77,44],[64,49],[54,40]],'#a77a45');
    rect(c,10,29,13,3,'#d6a464');rect(c,58,29,13,3,'#d6a464');
    poly(c,[[10,46],[21,49],[17,72],[7,78],[2,68]],'#775440');
    poly(c,[[65,48],[74,46],[76,72],[66,81],[58,72]],'#71513e');
    rect(c,1,65,14,13,'#344248');rect(c,62,69,15,13,'#303e45');
    if(attack){poly(c,[[0,51],[5,42],[14,43],[16,69],[8,72]],'#829397');rect(c,3,47,5,15,'#b9c6bc');}
    rect(c,27,9,27,23,'#546162');rect(c,31,7,19,4,'#9b997d');
    rect(c,25,17,31,8,'#202d33');rect(c,28,20,24,3,'#fca260');
    rect(c,30,27,21,9,'#303c40');rect(c,32,29,17,2,'#9b9980');
    rect(c,21,75,36,5,'#17272e');rect(c,35,75,10,7,'#968b64');
  }
  if(type.startsWith('guardian')){
    // The guardian's exposed reactor is a different shape, not just a color
    // flash. Armor shutters separate after an attack to advertise the opening.
    poly(c,[[16,30],[12,12],[21,23],[26,10],[30,29]],'#bbc2ab');poly(c,[[52,29],[57,10],[62,23],[70,12],[66,32]],'#bbc2ab');
    poly(c,[[40,34],[57,43],[57,61],[40,72],[23,61],[23,43]],'#192c35');
    const exposed=type==='guardian-exposed';
    if(exposed){
      poly(c,[[40,38],[52,45],[52,58],[40,66],[28,58],[28,45]],'#88e9e7');
      poly(c,[[40,42],[47,48],[47,56],[40,61],[33,56],[33,48]],'#fff5cb');
      for(const x of[21,55])rect(c,x,39,4,26,'#d1b877');
    }else{
      for(let y=41;y<65;y+=6){rect(c,27,y,27,4,'#8a9693');rect(c,38,y,5,4,'#eeb36b');}
    }
  }
  // Deliberate sparse wear gives pixel sprites a material surface without noise mush.
  c.globalCompositeOperation='source-atop';
  for(let i=0;i<55;i++){
    const x=Math.floor(hash(i,7,type.length)*72),y=Math.floor(hash(11,i,type.length)*103);
    rect(c,x,y,1,1,i%3?'rgba(218,202,156,.17)':'rgba(1,8,13,.3)');
  }
  if(hurt){c.fillStyle='rgba(255,157,111,.45)';c.fillRect(0,0,80,112);}
  c.restore();
  return textureFrom(canvas);
}

function makeEnemyFrameSet(type,convert){
  const idle=convert(drawEnemy(type,0)),healing=type==='mender-healing';
  // Steps 0 and 2 are identical authored poses. A healing mender is stationary
  // throughout its windup; sharing those images keeps the richer roster small.
  return [idle,healing?idle:convert(drawEnemy(type,1)),idle,healing?idle:convert(drawEnemy(type,3)),
    type.startsWith('mender')||['bulwark-open','bulwark-back'].includes(type)?idle:convert(drawEnemy(type,4)),
    convert(drawEnemy(type,5)),convert(drawEnemy(type,6))];
}

function drawGardenEnemy(type,frame){
  const[canvas,c]=canvas2d(80,112),bulwark=type.startsWith('bulwark'),open=type==='bulwark-open',back=type==='bulwark-back',healing=type==='mender-healing';
  const step=frame<4?[0,2,0,-2][frame]:0,attack=frame===4;
  if(frame===6){
    poly(c,[[5,105],[16,93],[53,92],[75,104],[67,111],[13,111]],'#24362d');
    poly(c,[[14,101],[29,91],[59,97],[66,107],[22,108]],bulwark?'#c9bd8b':'#95ac91');
    rect(c,29,100,21,4,bulwark?'#695e48':'#466e62');return textureFrom(canvas);
  }
  if(bulwark){
    poly(c,[[27,8],[51,8],[59,25],[69,31],[77,57],[69,84],[67,110],[45,110],[39,91],[34,110],[12,110],[13,83],[3,63],[5,35],[20,26]],'#192b2b');
    for(const[x,offset]of[[18,step],[46,-step]]){poly(c,[[x,70],[x+17,70],[x+18+offset,102],[x+21+offset,109],[x-3+offset,109]],'#716c50');rect(c,x+offset,91,15,7,'#c4b782');rect(c,x-2+offset,105,21,5,'#354942');}
    poly(c,[[23,30],[57,28],[66,54],[55,83],[23,83],[13,58]],'#858b66');
    for(const x of[12,58]){poly(c,[[x-5,31],[x+12,27],[x+15,44],[x+7,52],[x-6,44]],'#ded3a4');rect(c,x-3,32,13,4,'#f1e7ba');}
    if(back){
      poly(c,[[29,26],[52,28],[58,68],[47,89],[29,79],[23,50]],'#c0aa7b');
      poly(c,[[33,34],[45,32],[50,66],[42,78],[32,68]],'#6a6d53');
      for(let y=37;y<76;y+=8){rect(c,33,y,15,4,'#e4c991');rect(c,38,y,5,5,'#67543f');}
      poly(c,[[4,37],[14,30],[19,41],[18,91],[9,96],[2,83]],'#d9c898');rect(c,7,43,3,39,'#f6dd9c');
      rect(c,30,15,23,17,'#9b986e');rect(c,34,20,14,9,'#5c6552');
    }else{
      poly(c,[[26,12],[48,10],[55,22],[50,36],[28,34],[22,24]],'#d2c99e');rect(c,26,22,26,7,'#35483f');rect(c,29,24,21,3,'#f5bc6e');
      const left=open?6:11,right=open?65:59;
      poly(c,[[left,37],[left+20,30],[left+25,39],[left+24,83],[left+9,96],[left-4,83],[left-6,49]],'#d8ca9b');
      poly(c,[[right,34],[right+11,42],[right+12,82],[right,96],[right-13,85],[right-17,41]],'#b7ae7e');
      rect(c,left+1,43,4,34,'#f5e3ad');rect(c,right+3,44,3,33,'#e0d098');
      if(open){
        poly(c,[[33,38],[47,38],[53,55],[46,78],[34,78],[27,54]],'#583c38');
        poly(c,[[39,43],[46,51],[44,67],[39,74],[33,61],[34,49]],'#efae82');rect(c,37,48,5,19,'#ffe4b0');
      }else{
        poly(c,[[26,33],[51,32],[61,43],[56,85],[40,99],[22,86],[18,44]],'#b9aa75');
        poly(c,[[39,39],[51,47],[48,74],[40,85],[30,75],[27,47]],'#607369');
        poly(c,[[39,43],[47,49],[45,70],[40,78],[34,71],[32,49]],'#e8d899');
        rect(c,38,48,4,22,'#8a7956');rect(c,24,81,31,5,'#6c765e');
        if(attack){rect(c,21,42,37,3,'#fff0b2');poly(c,[[31,75],[40,84],[49,75],[49,81],[40,91],[31,81]],'#f9bb70');}
      }
    }
  }else{
    // Six leaf-like limbs and a suspended seed sac read very differently from
    // the upright shield carrier and the older humanoid infestation shapes.
    poly(c,[[36,4],[45,9],[49,25],[59,29],[70,20],[77,25],[65,44],[59,49],[74,69],[70,77],[54,66],[49,87],[59,107],[49,111],[39,92],[28,111],[18,107],[29,84],[25,62],[9,78],[3,70],[21,46],[12,35],[6,23],[14,20],[28,31],[31,13]],'#1b3935');
    poly(c,[[29,28],[51,27],[58,51],[48,80],[39,89],[27,72],[23,49]],'#86a58b');
    poly(c,[[37,35],[48,39],[49,61],[40,76],[31,63],[31,44]],'#3d776d');
    poly(c,[[39,40],[46,47],[45,61],[39,68],[34,60],[34,48]],healing?'#e8f5ad':'#b0d993');
    for(const side of[-1,1]){
      const x=40+side*17,tip=healing?12:27;
      poly(c,[[x,35],[x+side*11,tip],[x+side*16,tip-4],[x+side*18,tip+3],[x+side*8,43],[x,47]],'#b9c5a2');
      poly(c,[[x,48],[x+side*11,63],[x+side*17,65],[x+side*14,72],[x+side*3,65],[x-side*4,54]],'#7bb69b');
      poly(c,[[40+side*6,77],[40+side*(12+step),94],[40+side*(20+step),107],[40+side*(12+step),108],[40+side*3,92]],'#a9ba94');
      if(healing){poly(c,[[x+side*14,3],[x+side*20,10],[x+side*14,18],[x+side*8,10]],'#d4ed9d');rect(c,x+side*14-1,6,3,8,'#ffffce');}
    }
    poly(c,[[37,8],[45,13],[50,24],[41,34],[29,27],[30,17]],'#d5d9b0');rect(c,31,22,16,5,'#36635b');rect(c,34,23,10,2,'#e1f5af');
    poly(c,[[35,13],[23,7],[27,1],[40,9],[52,2],[57,10],[45,16]],'#a4bd93');
    if(healing){rect(c,37,45,5,22,'#f5ffd3');rect(c,31,52,17,6,'#f5ffd3');}
  }
  if(frame===5){c.globalCompositeOperation='source-atop';rect(c,0,0,80,112,'rgba(255,211,155,.45)');}
  return textureFrom(canvas);
}

function drawTeammate(team, direction, frame){
  const [canvas,c]=canvas2d(80,112);
  const blue=team==='p2';
  const armor=blue?'#517ea6':'#468b85',light=blue?'#94c5e4':'#8dd6c4',dark=blue?'#263f5b':'#244b4c';
  const trim=blue?'#b2e2f2':'#c2ead7';
  if(frame===4){
    // A downed teammate stays recognizable, without a misleading revive prompt.
    poly(c,[[8,101],[20,91],[48,90],[69,99],[65,107],[12,107]],'#16262e');
    rect(c,17,94,40,9,armor);rect(c,24,92,15,7,light);rect(c,51,95,16,7,dark);
    rect(c,10,98,12,7,'#667d87');rect(c,11,99,10,3,trim);
    rect(c,35,95,3,8,'#e4e9d5');rect(c,32,98,9,3,'#e4e9d5');
    return textureFrom(canvas);
  }
  const step=frame<4?[0,3,0,-3][frame]:0;
  const bob=frame===1||frame===3?1:0;
  c.save();c.translate(0,bob);
  if(direction==='left'){c.translate(80,0);c.scale(-1,1);}
  // A pale team chevron and sealed helmet distinguish friendlies from creatures.
  poly(c,[[33,5],[40,9],[47,5],[47,8],[40,12],[33,8]],trim);
  if(direction==='right'||direction==='left'){
    poly(c,[[30,70],[41,72],[40+step,99],[45+step,107],[25+step,107],[28+step,89]],'#182a35');
    poly(c,[[41,72],[49,70],[53-step,98],[62-step,103],[61-step,108],[43-step,108],[39-step,91]],'#142631');
    rect(c,30+step,77,6,22,'#42596a');rect(c,45-step,78,5,20,'#4b6371');
    poly(c,[[27,34],[45,31],[53,42],[50,73],[29,77],[23,55]],dark);
    poly(c,[[32,35],[47,35],[49,57],[45,70],[30,69],[27,50]],armor);
    rect(c,29,38,4,24,light);rect(c,25,37,5,34,'#1d3540');
    rect(c,24,40,7,24,'#526d78');rect(c,25,42,4,18,dark);
    poly(c,[[38,39],[47,39],[55,51],[67,50],[70,57],[50,60],[37,50]],light);
    rect(c,57,52,13,7,'#293e4b');rect(c,47,50,27,4,'#8c9fa7');
    rect(c,49,54,20,5,'#253a48');rect(c,70,49,5,7,'#c0c9ba');
    rect(c,74,51,3,3,'#192d39');rect(c,55,47,3,3,trim);
    poly(c,[[32,15],[45,14],[52,21],[54,30],[48,36],[32,34],[27,24]],'#233c4b');
    rect(c,32,17,16,5,light);rect(c,38,22,15,7,'#15313f');
    rect(c,41,23,12,3,trim);rect(c,48,30,6,4,'#7a969e');
    rect(c,32,29,8,7,armor);rect(c,28,22,5,8,light);
    if(frame===5){poly(c,[[77,43],[78,49],[80,47],[80,58],[77,56],[75,61],[74,54],[70,52],[75,49]],'#f1c47c');rect(c,75,50,5,4,'#fff0ba');}
  }else{
    poly(c,[[23,71],[37,72],[35+step,99],[34+step,108],[17+step,108],[20+step,89]],'#1b2c37');
    poly(c,[[42,73],[56,71],[59-step,91],[64-step,107],[46-step,108],[41-step,91]],'#182c38');
    rect(c,24+step,79,7,22,'#4b626e');rect(c,47-step,79,7,22,'#455e6d');
    rect(c,17+step,103,18,6,'#152935');rect(c,46-step,102,19,6,'#152935');
    poly(c,[[23,33],[33,29],[48,29],[58,36],[61,60],[52,79],[27,78],[19,57]],dark);
    poly(c,[[27,35],[52,35],[56,58],[50,71],[29,71],[24,53]],armor);
    rect(c,29,37,21,4,light);rect(c,28,69,24,7,'#1e3540');rect(c,37,70,7,4,'#a7b49b');
    poly(c,[[17,36],[27,34],[28,47],[20,54],[12,49]],armor);
    poly(c,[[53,34],[63,37],[68,51],[58,55],[51,46]],armor);
    rect(c,17,37,8,3,light);rect(c,56,38,8,3,light);
    if(direction==='back'){
      rect(c,29,42,22,24,'#243d4b');rect(c,32,44,16,3,light);rect(c,33,51,14,13,'#516e7c');
      rect(c,38,51,4,13,trim);rect(c,12,50,10,23,'#304957');rect(c,60,50,9,23,'#304957');
      rect(c,10,69,11,9,'#162c39');rect(c,59,69,11,9,'#162c39');
      rect(c,61,41,4,21,'#869eaa');rect(c,61,39,4,4,'#243e4c');
    }else{
      rect(c,32,45,16,18,dark);rect(c,37,47,6,12,'#e4e9d5');rect(c,34,50,12,5,'#e4e9d5');
      poly(c,[[13,50],[24,49],[29,58],[43,57],[44,66],[25,69],[13,61]],'#66878d');
      poly(c,[[59,50],[67,54],[65,65],[48,68],[38,62],[42,55],[57,59]],'#75969a');
      rect(c,26,56,28,6,'#93a7ad');rect(c,28,61,23,6,'#243b48');
      rect(c,35,53,11,12,'#253d4a');rect(c,37,53,7,7,'#afc4c3');rect(c,39,54,3,4,'#152c3b');
      rect(c,36,50,3,3,trim);
      if(frame===5){poly(c,[[40,37],[44,47],[51,44],[47,52],[53,56],[44,58],[40,65],[36,58],[28,56],[34,52],[30,45],[37,47]],'#f1c47c');rect(c,37,49,7,8,'#fff0ba');}
    }
    poly(c,[[30,14],[48,14],[55,22],[51,35],[29,35],[24,24]],'#233d4c');
    rect(c,29,16,21,6,armor);rect(c,32,16,15,3,light);
    if(direction==='back'){rect(c,30,25,19,4,light);rect(c,33,30,13,4,dark);}
    else{rect(c,28,23,24,7,'#13303e');rect(c,30,24,20,3,trim);rect(c,34,31,12,4,'#78959a');}
    rect(c,25,22,4,9,light);rect(c,51,22,4,9,light);
  }
  c.restore();return textureFrom(canvas);
}

function makeTeammateWeapon(weapon,direction,firing=false){
  const[canvas,c]=canvas2d(80,112),side=direction==='left'||direction==='right';
  if(direction==='left'){c.translate(80,0);c.scale(-1,1);}
  const color=weapon==='arc'?'#a8e9dd':weapon==='ricochet'?'#d1c1e4':weapon==='grenade'?'#dfc28a':'#c9cdb7';
  if(direction==='back'){
    rect(c,59,40,8,31,'#263b43');rect(c,60,41,6,25,color);rect(c,58,56,10,9,weapon==='grenade'?'#a8ad7a':'#586c79');
  }else if(side){
    poly(c,[[45,49],[64,46],[76,49],[76,58],[62,62],[48,61]],'#273b46');
    rect(c,48,50,25,7,color);rect(c,52,57,11,9,'#536a70');
    if(weapon==='arc'){for(const y of[46,58]){rect(c,60,y,18,3,'#b7cdbb');rect(c,61,y-1,7,5,'#c6a573');}rect(c,51,50,9,7,'#74ceca');}
    else if(weapon==='ricochet'){rect(c,57,47,22,4,'#e1d8db');rect(c,53,60,7,10,'#9f93b3');}
    else if(weapon==='grenade'){poly(c,[[66,47],[76,49],[79,55],[75,61],[66,62],[63,56]],'#acc2ae');rect(c,69,51,7,7,'#304c55');rect(c,49,57,15,11,'#b8a575');}
    else{rect(c,57,47,23,3,'#bcc9bf');rect(c,57,51,22,3,'#94a99f');rect(c,52,56,14,6,'#b28c60');}
  }else{
    rect(c,25,54,31,14,'#29404a');rect(c,28,56,25,9,color);
    if(weapon==='arc'){
      rect(c,32,53,16,17,'#5f9d9d');for(const x of[27,49]){rect(c,x,44,5,20,'#c9d4bc');rect(c,x-1,55,7,6,'#bd9a62');}rect(c,36,56,7,10,'#b3f4e6');
    }else if(weapon==='grenade'){
      poly(c,[[31,47],[49,47],[56,55],[50,65],[31,65],[25,55]],'#bdc8ab');poly(c,[[35,51],[45,51],[49,55],[45,60],[35,60],[31,55]],'#253e4b');
      rect(c,28,65,26,10,'#9a9d73');for(const x of[30,38,46])rect(c,x,66,5,7,'#e2cb96');
    }else if(weapon==='ricochet'){
      rect(c,33,42,15,21,'#b2b4c4');rect(c,37,41,6,14,'#43516a');rect(c,39,42,2,4,'#e7d2f3');rect(c,43,65,8,11,'#9788a9');
    }else{
      rect(c,31,44,17,24,'#79908c');rect(c,33,43,5,7,'#263f4b');rect(c,41,43,5,7,'#263f4b');rect(c,29,63,21,8,'#b18b61');
    }
  }
  if(firing&&direction!=='back'){
    const x=side?77:40,y=side?53:weapon==='grenade'?54:44;
    const flash=weapon==='arc'?'#b7f7e6':weapon==='ricochet'?'#f0d3ff':weapon==='grenade'?'#c9d0b7':'#ffe0a1';
    poly(c,[[x,y-10],[x+3,y-3],[x+8,y-5],[x+5,y+2],[x+8,y+7],[x+1,y+5],[x-4,y+9],[x-4,y+2],[x-9,y],[x-3,y-3]],flash);
  }
  return textureFrom(canvas);
}

function makePickupTexture(type) {
  const [canvas,c]=canvas2d(64,64);
  if(['repeater','nullgun','lance'].includes(type)){
    c.save();c.translate(32,56);c.scale(.28,.28);drawShadowWeapon(c,type,0,0);c.restore();
  }else if(type==='ricochet'){
    poly(c,[[4,25],[13,20],[52,24],[60,28],[58,35],[33,37],[27,48],[17,45],[20,35],[4,34]],'#273142');
    rect(c,7,23,45,8,'#b3b9c5');rect(c,12,25,34,4,'#8c82b0');rect(c,28,31,20,10,'#616b82');
    rect(c,44,23,17,4,'#d5d8ca');rect(c,28,38,10,13,'#555671');rect(c,30,40,6,3,'#d6b9e6');
    poly(c,[[17,25],[23,25],[26,28],[23,31],[17,31],[21,28]],'#e4c7ff');
  }else if(type==='grenade'){
    poly(c,[[7,25],[40,20],[57,25],[60,38],[47,43],[26,42],[20,52],[11,49],[15,39],[6,37]],'#293b3e');
    rect(c,10,23,35,16,'#b29b68');rect(c,12,24,31,4,'#e2c89a');
    poly(c,[[43,21],[55,23],[61,30],[58,39],[47,41],[40,34]],'#708b85');poly(c,[[47,26],[54,27],[57,32],[54,36],[47,36],[45,31]],'#263e48');
    rect(c,22,38,19,11,'#617e76');rect(c,25,40,13,6,'#cbb67a');
  }else if(type==='slugs'){
    rect(c,11,28,43,24,'#3c4661');rect(c,12,29,41,4,'#b8bbd0');
    for(const x of[17,29,41]){rect(c,x,16,7,25,'#9e9ab8');poly(c,[[x,16],[x+3,10],[x+7,16]],'#e0c7ee');rect(c,x+2,19,3,18,'#e3d9df');}
    poly(c,[[22,42],[31,42],[35,45],[31,49],[22,49],[28,45]],'#dec8ec');
  }else if(type==='grenades'){
    for(const[x,y]of[[12,21],[28,14],[42,25]]){
      rect(c,x,y,12,28,'#8aa194');rect(c,x-2,y+6,16,12,'#d0b986');rect(c,x+2,y-5,8,7,'#d4ddbc');rect(c,x+4,y+8,4,8,'#f1d391');
    }
  }else if(type==='arc'){
    poly(c,[[6,28],[23,23],[50,27],[56,36],[40,42],[25,41],[20,54],[11,50],[16,38],[6,37]],'#18343e');
    rect(c,10,25,33,13,'#618a91');rect(c,12,26,29,3,'#b0d5ce');rect(c,17,30,17,9,'#65dce2');
    for(const y of[21,38]){rect(c,35,y,23,4,'#c6c2a7');for(let x=36;x<49;x+=4)rect(c,x,y-2,2,8,'#bc8358');}
    rect(c,51,19,7,5,'#9af3ed');rect(c,51,37,7,5,'#9af3ed');
    poly(c,[[58,24],[53,29],[58,32],[53,37],[59,33],[56,29]],'#defdf0');
  }else if(type==='cells'){
    rect(c,14,19,36,33,'#253e45');
    for(const x of[18,36]){rect(c,x,13,11,39,'#6ca6ad');rect(c,x+2,9,7,7,'#b7cbba');rect(c,x+3,17,5,28,'#a2f3e6');rect(c,x,25,11,4,'#8e6d4d');rect(c,x,43,11,4,'#8e6d4d');}
    rect(c,13,49,39,4,'#9eb3a7');poly(c,[[34,23],[27,34],[32,34],[29,42],[39,29],[34,29]],'#e7f7cd');
  }else if(type==='health'||type==='healthExpansion'){
    rect(c,11,21,44,29,'#1a2d32');rect(c,13,19,39,27,'#b8c2ae');
    rect(c,15,20,35,4,'#e0dfbb');rect(c,27,12,13,7,'#5d7774');
    rect(c,29,24,8,19,'#aa4d3d');rect(c,23,30,20,7,'#aa4d3d');
    rect(c,14,43,38,3,'#687f7a');
    if(type==='healthExpansion'){
      rect(c,29,24,8,19,'#5c9a65');rect(c,23,30,20,7,'#5c9a65');
      rect(c,9,15,3,37,'#e2ca87');rect(c,53,15,3,37,'#e2ca87');rect(c,9,12,47,3,'#e2ca87');rect(c,9,51,47,3,'#e2ca87');
      c.font='bold 6px monospace';c.fillStyle='#eddfab';c.textAlign='center';c.fillText('MAX +',33,61);
    }
  }else if(type==='ammo'||type==='shells'){
    rect(c,12,25,40,24,'#263b3b');rect(c,13,24,38,18,type==='shells'?'#8e4936':'#687250');
    rect(c,16,21,30,4,'#c0a570');rect(c,17,33,28,3,'#c1b78a');
    for(let x=18;x<45;x+=9){rect(c,x,14,5,11,type==='shells'?'#b46745':'#b39d63');rect(c,x+1,12,3,3,'#e0c38a');}
  }else if(type==='key'){
    poly(c,[[18,12],[47,12],[50,16],[50,50],[16,50],[16,17]],'#d2a55b');
    rect(c,20,17,26,8,'#2f4448');rect(c,21,19,15,3,'#7bf0dd');
    rect(c,22,30,10,10,'#ede0a1');rect(c,36,30,8,2,'#5f4c36');
    rect(c,36,35,8,2,'#5f4c36');rect(c,21,44,24,2,'#67533a');
  }else if(type==='armor'){
    poly(c,[[20,14],[27,10],[38,10],[45,14],[50,26],[47,49],[18,49],[15,26]],'#284c53');
    poly(c,[[24,17],[40,17],[44,27],[41,43],[23,43],[20,27]],'#5d9b97');
    rect(c,26,20,12,4,'#a1cec0');rect(c,31,28,3,14,'#28434a');
  }else{
    poly(c,[[4,26],[53,26],[61,30],[54,35],[29,35],[21,44],[13,44],[18,33],[4,33]],'#242f36');
    rect(c,4,24,47,5,'#b3bbae');rect(c,28,29,26,6,'#687878');
    rect(c,25,35,15,8,'#86613e');rect(c,29,35,2,8,'#b18a50');
    rect(c,51,25,10,4,'#d1cbb3');
  }
  return textureFrom(canvas);
}

function makeGrenadeTexture(frame=0){
  const[canvas,c]=canvas2d(48,48);
  poly(c,[[16,7],[31,7],[36,16],[36,35],[29,42],[17,42],[11,35],[11,16]],'#213940');
  rect(c,14,14,20,22,'#819d8a');rect(c,15,20,18,9,'#d5b56f');rect(c,18,9,12,8,'#cdd7ac');rect(c,20,5,8,6,'#b0bca2');
  for(let n=0;n<4;n++)rect(c,16+n*4,23,3,4,n<4-frame?'#ffedb0':'#5c6754');
  rect(c,17,16,3,18,'#b5c8a3');return textureFrom(canvas);
}

function makeCombatSignal(kind){
  const[canvas,c]=canvas2d(64,64);
  if(kind==='heal'||kind==='heal-windup'){
    const color=kind==='heal'?'#dcffb9':'#b7d9a0';
    for(const x of[8,49])for(const y of[8,49]){rect(c,x,y,7,2,color);rect(c,x,y,2,7,color);}
    if(kind==='heal'){rect(c,27,13,10,38,color);rect(c,13,27,38,10,color);rect(c,29,16,5,31,'#f4ffda');}
    else{for(const[x,y,w,h]of[[27,13,10,13],[27,38,10,13],[13,27,13,10],[38,27,13,10]])rect(c,x,y,w,h,color);}
  }else if(kind==='heal-interrupt'){
    for(const[x,y]of[[13,13],[38,12],[14,40],[42,39]]){rect(c,x,y,12,3,'#d9b9ea');rect(c,x,y,3,12,'#d9b9ea');}
    poly(c,[[19,20],[24,16],[46,42],[41,47]],'#ffe3bd');poly(c,[[42,17],[47,22],[22,47],[17,42]],'#ffe3bd');
  }else if(kind==='shield-hit'){
    for(let n=0;n<8;n++){const a=n*Math.PI/4,x=32+Math.cos(a)*10,y=32+Math.sin(a)*10;poly(c,[[x,y],[32+Math.cos(a+.13)*27,32+Math.sin(a+.13)*27],[32+Math.cos(a-.1)*16,32+Math.sin(a-.1)*16]],'#ffe8b1');}
    rect(c,27,27,10,10,'#fff9d7');
  }else{
    poly(c,[[32,3],[42,15],[57,13],[54,28],[63,37],[48,44],[44,59],[29,52],[13,59],[12,44],[2,35],[13,22],[11,8],[25,14]],'#d6a06c');
    poly(c,[[32,10],[42,22],[53,29],[45,43],[31,48],[18,43],[10,30],[23,17]],'#f4c88a');
    poly(c,[[32,18],[43,27],[40,39],[29,44],[19,32],[23,24]],'#fff0bb');
  }
  return textureFrom(canvas);
}

function makeStunTexture(){
  const[canvas,c]=canvas2d(64,48);
  for(const[x,y]of[[5,8],[39,7],[22,27]]){
    poly(c,[[x+9,y],[x,y+13],[x+8,y+13],[x+3,y+22],[x+18,y+8],[x+10,y+8]],'#9bedef');
    rect(c,x+9,y+8,2,5,'#efffe5');
  }
  return textureFrom(canvas);
}

function makeGlowTexture(color, core='#e8ffdb') {
  const [canvas,c]=canvas2d(32,32);
  c.fillStyle=color;c.globalAlpha=.13;c.fillRect(2,10,28,12);c.fillRect(10,2,12,28);
  c.globalAlpha=.3;c.fillRect(6,6,20,20);c.globalAlpha=.6;c.fillRect(10,7,12,18);
  c.globalAlpha=1;rect(c,11,11,10,10,core);rect(c,14,8,4,16,core);
  return textureFrom(canvas);
}

function makeHollowLandmarkTexture(type){
  const[canvas,c]=canvas2d(256,128);
  rect(c,0,0,256,128,'#15232d');rect(c,3,3,250,122,'#3d5056');
  for(const x of[5,246])rect(c,x,4,5,120,'#95a69a');
  if(type==='tape-vault'){
    for(let x=13;x<240;x+=45)for(let y=13;y<115;y+=32){
      rect(c,x,y,40,28,'#14232b');rect(c,x+2,y+2,36,3,'#82958e');
      for(const dx of[10,28]){poly(c,[[x+dx-6,y+8],[x+dx+5,y+8],[x+dx+8,y+15],[x+dx+4,y+22],[x+dx-5,y+22],[x+dx-8,y+15]],'#9eaa9a');rect(c,x+dx-2,y+13,4,4,'#17232f');}
      rect(c,x+15,y+24,12,2,'#b8916a');
    }
  }else if(type==='sleep-pod'){
    for(const x of[17,96,175]){
      rect(c,x,9,64,110,'#788c8d');rect(c,x+4,14,56,99,'#182934');
      poly(c,[[x+11,20],[x+49,20],[x+54,34],[x+50,93],[x+12,101],[x+8,40]],'#34464d');
      rect(c,x+12,25,36,3,'#657e7e');rect(c,x+11,102,41,6,'#ada98b');
      for(const y of[35,55,75])rect(c,x+48,y,4,12,'#8eb9b4');
      rect(c,x+26,65,11,21,'#17272f');rect(c,x+18,83,27,7,'#23343c');
      rect(c,x+26,116,15,3,'#bad4bf');
    }
  }else if(type==='listening-array'){
    for(let n=0;n<7;n++){const inset=n*8;rect(c,19+inset,6+inset*.6,218-2*inset,115-inset*1.2,n%2?'#1c2b38':'#83928c');}
    rect(c,87,37,82,58,'#101a25');rect(c,107,48,42,37,'#202b38');
    for(let n=0;n<14;n++)rect(c,16+n*16,113,6,4,n%3?'#a9c9b5':'#be956c');
    rect(c,113,58,30,16,'#0b131e');rect(c,122,60,12,12,'#b3c4b7');rect(c,125,62,6,8,'#0b131e');
  }else{
    rect(c,12,12,232,102,'#536167');
    for(let x=24;x<235;x+=29){rect(c,x,16,7,93,'#9baba3');rect(c,x+6,16,4,93,'#263844');}
    rect(c,84,31,88,57,'#17232e');rect(c,91,38,74,4,'#c7b795');
    c.textAlign='center';c.font='bold 17px monospace';c.fillStyle='#d0c9ae';c.fillText('SEALED',128,66);
    for(let x=12;x<240;x+=20)poly(c,[[x,104],[x+9,104],[x+18,114],[x+9,114]],'#d7b279');
  }
  return textureFrom(canvas);
}
function makeContainmentSwitchTexture(item,mode){
  const[canvas,c]=canvas2d(112,160),active=mode===1,route=mode===2;
  rect(c,33,98,48,58,'#40555d');rect(c,38,102,6,50,'#78968f');
  rect(c,10,9,92,107,'#172b36');rect(c,14,13,84,99,'#50656b');rect(c,18,17,76,91,'#1a2e3a');
  c.textAlign='center';c.font='bold 12px monospace';c.fillStyle='#e4d4ad';c.fillText(`GRID ${circuitMark(item)}`,56,33);
  const color=active?'#a7f0e0':route?'#e9bc7b':'#71818b';
  for(let n=0;n<16;n++){const a=n/16*Math.PI*2;rect(c,37+Math.cos(a)*12,58+Math.sin(a)*12,3,3,active?color:'#526777');}
  rect(c,67,46,16,26,route?color:'#526777');rect(c,70,49,10,20,'#1a2e3a');
  rect(c,53,57,13,3,color);rect(c,54,53,3,11,color);
  // A physical selector changes position as well as color.
  const leverX=active?35:route?74:55;rect(c,leverX-2,70,4,11,'#e0e8ce');rect(c,leverX-5,69,10,4,'#c1d4c7');
  c.font='bold 8px monospace';c.fillStyle=color;c.fillText(active?'FIELD ON':route?'ROUTE OPEN':'OFFLINE',56,90);
  rect(c,45,98,22,4,color);for(const x of[44,66])rect(c,x,116,3,38,color);
  return textureFrom(canvas);
}
function makeRecordTexture(mode){
  const[canvas,c]=canvas2d(112,160);
  rect(c,34,99,45,57,'#354651');rect(c,39,103,5,48,'#81938e');
  rect(c,13,16,87,94,'#18252f');rect(c,17,20,79,86,'#7c8e8c');rect(c,22,25,69,74,'#263a45');
  for(const x of[40,73]){poly(c,[[x-12,35],[x+10,35],[x+15,46],[x+10,59],[x-12,59],[x-17,46]],'#c5c4a8');rect(c,x-3,43,6,6,'#142631');}
  rect(c,39,61,36,3,'#b69d7e');c.textAlign='center';c.font='bold 11px monospace';c.fillStyle=mode?'#9fe2c8':'#eed6a0';c.fillText(mode?'FILED':'RECORD',56,85);
  rect(c,29,92,5,4,mode?'#9fe2c8':'#ddae7c');return textureFrom(canvas);
}
function makeEchoEnemy(frame){
  const[canvas,c]=canvas2d(80,112);
  if(frame===6){poly(c,[[6,99],[20,90],[48,92],[72,101],[61,108],[14,108]],'#3f5262');return textureFrom(canvas);}
  const shift=frame%2?2:0;
  poly(c,[[30,21],[49,20],[54,36],[61,49],[67,82],[61,84],[52,58],[49,79],[54,107],[45,109],[39,86],[33,108],[24,107],[28,78],[25,55],[17,83],[10,80],[20,41]],'#718c9c');
  poly(c,[[32,31],[47,31],[49,66],[41,81],[29,70]],'#293d4f');
  for(const x of[29,46])rect(c,x,37+shift,4,27,'#b8d1cc');
  poly(c,[[31,4],[47,4],[53,14],[48,29],[31,28],[26,14]],'#b6c9c5');
  rect(c,30,13,20,11,'#182638');rect(c,34,14,12,8,'#0e1724');rect(c,33,26,14,3,'#e0dfc3');
  if(frame===4){rect(c,6,46,15,3,'#c5d9db');rect(c,59,43,17,3,'#c5d9db');}
  if(frame===5){rect(c,29,35,23,5,'#e5c6b4');rect(c,32,52,16,4,'#e5c6b4');}
  return textureFrom(canvas);
}

function makeSign(text, sub, color='#9fd8cf') {
  const [canvas,c]=canvas2d(256,80);
  rect(c,0,0,256,80,'#101e27');rect(c,0,0,256,3,color);
  rect(c,0,76,256,4,'#1c3039');rect(c,6,7,3,66,'#2d4550');
  const title=text.toUpperCase().slice(0,27);
  c.font=`bold ${Math.min(24,Math.floor(224/Math.max(1,title.length)/.61))}px monospace`;c.fillStyle=color;c.textAlign='left';
  c.fillText(title,16,35);
  c.font='12px monospace';c.fillStyle='#99aaa5';c.fillText(sub.toUpperCase().slice(0,29),17,59);
  return textureFrom(canvas);
}

class WebGLBreachRenderer {
  constructor(canvas, game, options={}) {
    if(!canvas)throw new Error('BREACH could not find its game screen.');
    this.canvas=canvas;this.game=game;this.options={quality:'auto',fov:null,reducedMotion:false,...options};
    this.visuals=missionVisuals(game.level);
    this.ceilingHeight=this.visuals.glasshouse?4.2:WALL_HEIGHT;
    this.mode='webgl';this.isSoftware=false;
    this.textures=new Set();this.materials=new Set();this.geometries=new Set();
    this.enemyVisuals=new Map();this.pickupVisuals=new Map();this.doorVisuals=new Map();
    this.teammateVisuals=new Map();this.teammateFrames={};this.teammateFireAt=new Map();this.teammateWeaponMaps=new Map();
    this.projectileVisuals=new Map();this.featureVisuals=new Map();this.impacts=[];this.cueVisuals=[];this.doorMaterials=new Map();
    this.clock=0;this.recoil=0;this.flash=0;this.bobPhase=0;this.moveAmount=0;
    this.lastX=game.state.player.x;this.lastZ=game.state.player.z;this.deadAt=new Map();
    this.hitAt=new Map();this.lastWeapon=game.state.player.weapon;this.weaponSwap=0;
    try{
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',stencil:false});
    }catch(error){throw new Error('This browser could not start WebGL. Open BREACH in Safari or Chrome and try again.');}
    this.layout=surfaceLayout(game.level,this.visuals.underworks);this.stats={...this.layout.stats};this.staticBatches=[];this.stationMaps=new Map();
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setClearColor(this.visuals.fog,1);
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(this.visuals.fog);
    this.scene.fog=new THREE.Fog(this.visuals.fog,this.visuals.glasshouse?7:5,this.visuals.glasshouse?27:23);
    this.camera=new THREE.PerspectiveCamera(68,1,.045,38);
    this.weaponCanvas=document.createElement('canvas');
    this.weaponCanvas.className='breach-weapon-canvas';
    this.weaponCanvas.setAttribute('aria-hidden','true');
    Object.assign(this.weaponCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'2',pointerEvents:'none',imageRendering:'pixelated'});
    canvas.parentElement.appendChild(this.weaponCanvas);
    this.weaponContext=this.weaponCanvas.getContext('2d');
    this.enemyFrames={};
    for(const type of enemyArtTypes(game.level))this.enemyFrames[type]=makeEnemyFrameSet(type,map=>this.texture(map));
    this.pickupMaps={};
    for(const type of PICKUP_ART)this.pickupMaps[type]=this.texture(makePickupTexture(type));
    this.plasmaMap=this.texture(makeGlowTexture('#7fe8b1','#e6ffb5'));
    this.impactMap=this.texture(makeGlowTexture('#f8aa58','#fff0b0'));
    this.phaseEchoMap=this.texture(makePhaseEcho());this.stunMap=this.texture(makeStunTexture());
    this.grenadeMaps=Array.from({length:4},(_,frame)=>this.texture(makeGrenadeTexture(frame)));
    this.combatMaps=Object.fromEntries(['heal-windup','heal','heal-interrupt','shield-hit','explosion'].map(kind=>[kind,this.texture(makeCombatSignal(kind))]));
    this.buildEnvironment();this.resize();
  }

  texture(texture){this.textures.add(texture);return texture;}
  material(material){this.materials.add(material);return material;}
  geometry(geometry){this.geometries.add(geometry);return geometry;}
  getEnemyFrames(art){
    if(!this.enemyFrames[art]){
      this.enemyFrames[art]=makeEnemyFrameSet(art,map=>this.texture(map));
      this.stats.textureSourceBytes+=new Set(this.enemyFrames[art]).size*80*112*4;
    }
    return this.enemyFrames[art];
  }
  getTeammateFrames(id){
    const team=id==='p2'?'p2':'p1';
    if(!this.teammateFrames[team]){
      this.teammateFrames[team]=Object.fromEntries(['front','back','right','left'].map(direction=>[direction,Array.from({length:6},(_,frame)=>this.texture(drawTeammate(team,direction,frame)))]));
      if(this.stats.textureSourceBytes)this.stats.textureSourceBytes+=24*80*112*4;
    }
    return this.teammateFrames[team];
  }
  getTeammateWeapon(weapon,direction,firing){
    const key=`${weapon}:${direction}:${Number(firing)}`;
    if(!this.teammateWeaponMaps.has(key)){this.teammateWeaponMaps.set(key,this.texture(makeTeammateWeapon(weapon,direction,firing)));this.stats.textureSourceBytes+=80*112*4;}
    return this.teammateWeaponMaps.get(key);
  }
  mesh(geometry,material,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);this.scene.add(mesh);return mesh;
  }
  solid(x,z){return this.game.level.grid[z]?.[x]==='#'||!this.game.level.grid[z]?.[x];}

  buildEnvironment(){
    const level=this.game.level,layout=this.layout,underworks=this.visuals.underworks,garden=this.visuals.glasshouse;
    const transform=new THREE.Object3D(),color=new THREE.Color();
    const install=(geometry,material,cells,place,tint=false)=>{
      const mesh=new THREE.InstancedMesh(geometry,material,cells.length);
      cells.forEach((cell,i)=>{
        transform.position.set(0,0,0);transform.rotation.set(0,0,0);transform.scale.set(1,1,1);
        place(cell,transform);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
        if(tint){color.setRGB(cell.shade*.91,cell.shade*.98,cell.shade);mesh.setColorAt(i,color);}
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.frustumCulled=true;
      this.scene.add(mesh);this.staticBatches.push(mesh);return mesh;
    };
    const wallGeometry=this.geometry(new THREE.PlaneGeometry(1,WALL_HEIGHT));
    const wallMaterials=layout.names.map(name=>this.material(new THREE.MeshBasicMaterial({
      map:this.texture(garden?makeGardenWallTexture(name):underworks?makeSectorWallTexture(name):this.visuals.switchyard?makeYardWallTexture():makeWallTexture(0,this.visuals.relay,this.visuals.crosslink)),
      color:garden?0xf0f4dd:underworks?0xd1d5c8:this.visuals.crosslink?0xc7cabc:this.visuals.relay?0xc3cedb:0xb5c4c1,
    })));
    for(const cells of batches(layout.walls,cell=>`${cell.chunk}:${cell.palette}`))install(wallGeometry,wallMaterials[cells[0].palette],cells,(cell,t)=>{t.position.set(cell.x,WALL_HEIGHT/2,cell.z);t.rotation.y=cell.rot;},true);

    if(underworks||garden){
      for(const ceiling of[false,true]){
        const materials=layout.names.map(name=>this.material(new THREE.MeshBasicMaterial({map:this.texture(garden?makeGardenFloorTexture(name,ceiling):makeSectorFloorTexture(name,ceiling)),color:garden?ceiling?0xe4edcf:0xd0ddbe:ceiling?0x9ca9a6:0xb4bdb0})));
        for(const runs of batches(layout.runs,run=>`${run.chunk}:${run.palette}`)){
          const mesh=this.mesh(this.geometry(horizontalGeometry(runs,ceiling?this.ceilingHeight:0,ceiling)),materials[runs[0].palette]);this.staticBatches.push(mesh);
        }
      }
      const hazardMaterials=underworks?{flood:this.material(new THREE.MeshBasicMaterial({map:this.texture(makeHazardTexture('flood')),color:0xc0d7ca})),conduit:this.material(new THREE.MeshBasicMaterial({map:this.texture(makeHazardTexture('conduit')),color:0xc5d1bf}))}:{};
      for(const area of level.hazards||[]){
        const mesh=this.mesh(this.geometry(horizontalGeometry([{x1:area.x1,x2:area.x2,z:area.z1,z2:area.z2}],.012)),hazardMaterials[area.type]||hazardMaterials.conduit);this.staticBatches.push(mesh);
      }
    }else{
      const floorMap=this.texture((this.visuals.switchyard?makeYardFloorTexture():makeFloorTexture(false,this.visuals.relay,this.visuals.crosslink)));floorMap.repeat.set(level.width/2,level.height/2);
      const floor=this.mesh(this.geometry(new THREE.PlaneGeometry(level.width,level.height)),this.material(new THREE.MeshBasicMaterial({map:floorMap,color:this.visuals.crosslink?0xb2baa0:this.visuals.relay?0x9eacbd:0x919d94})),level.width/2,0,level.height/2);floor.rotation.x=-Math.PI/2;
      const ceilingMap=this.texture(makeFloorTexture(true,this.visuals.relay,this.visuals.crosslink));ceilingMap.repeat.set(level.width/2,level.height/2);
      const ceiling=this.mesh(this.geometry(new THREE.PlaneGeometry(level.width,level.height)),this.material(new THREE.MeshBasicMaterial({map:ceilingMap,color:0x68787f})),level.width/2,WALL_HEIGHT,level.height/2);ceiling.rotation.x=Math.PI/2;ceiling.visible=!this.visuals.switchyard;
      this.staticBatches.push(floor,ceiling);
    }
    this.groundPaths=[];
    if(this.visuals.switchyard||this.visuals.hollow||garden){
      const details=garden?makeGardenGroundDetails(level):makeYardGroundDetails(level);this.groundPaths=details.paths||[];
      const floorDetails=this.mesh(this.geometry(new THREE.PlaneGeometry(level.width,level.height)),this.material(new THREE.MeshBasicMaterial({map:this.texture(details.texture),transparent:true,depthWrite:false,alphaTest:.08})),level.width/2,.012,level.height/2);
      floorDetails.rotation.x=-Math.PI/2;this.staticBatches.push(floorDetails);
      if(garden){
        this.gardenDetails=details;this.waterMap=this.texture(makeWaterHighlightsTexture());
        const water=this.mesh(this.geometry(horizontalGeometry(details.waterRuns,.022)),this.material(new THREE.MeshBasicMaterial({map:this.waterMap,transparent:true,depthWrite:false,opacity:.5})));
        this.staticBatches.push(water);this.stats.waterCells=details.waterCells.reduce((sum,value)=>sum+value,0);
      }
    }
    this.shadowPlatforms=[];
    for(const room of level.platformRooms||[]){
      const pit=this.mesh(this.geometry(new THREE.PlaneGeometry(room.x2-room.x1,room.z2-room.z1)),this.material(new THREE.MeshBasicMaterial({color:0x020308})),(room.x1+room.x2)/2,.025,(room.z1+room.z2)/2);pit.rotation.x=-Math.PI/2;this.staticBatches.push(pit);
      for(const pad of room.platforms){
        const mat=this.material(new THREE.MeshBasicMaterial({color:0x83bba7}));
        const mesh=this.mesh(this.geometry(new THREE.BoxGeometry(pad.x2-pad.x1,.18,pad.z2-pad.z1)),mat,(pad.x1+pad.x2)/2,.08,(pad.z1+pad.z2)/2);
        this.shadowPlatforms.push({pad,mesh,mat});this.staticBatches.push(mesh);
      }
    }
    const lightGeometry=this.geometry(new THREE.BoxGeometry(.62,.065,.045));
    const lightMaterials=layout.names.map(name=>[this.material(new THREE.MeshBasicMaterial({color:garden?GARDEN_PALETTES[name].light:underworks?SECTORS[name].light:this.visuals.crosslink?0x7be1c5:this.visuals.relay?0xb4c8eb:0x8bd6ce})),this.material(new THREE.MeshBasicMaterial({color:0xea9752}))]);
    for(const cells of batches(layout.lights,cell=>`${cell.chunk}:${cell.palette}:${cell.warm}`))install(lightGeometry,lightMaterials[cells[0].palette][Number(cells[0].warm)],cells,(cell,t)=>{t.position.set(cell.x,2.12,cell.z);t.rotation.y=cell.rot;});
    const beamGeometry=this.geometry(new THREE.BoxGeometry(1,.13,.16));
    const beamMaterials=layout.names.map(name=>this.material(new THREE.MeshBasicMaterial({color:garden?GARDEN_PALETTES[name].trim:underworks?SECTORS[name].dark:0x293b44})));
    for(const cells of batches(layout.rails,cell=>`${cell.chunk}:${cell.palette}`))install(beamGeometry,beamMaterials[cells[0].palette],cells,(cell,t)=>{t.position.set(cell.x,garden?this.ceilingHeight-.14:2.35,cell.z);t.scale.set(cell.width,1,1);});
    this.canopyVisuals=[];
    if(garden){
      const supports=layout.lights.filter((cell,index)=>index%3===0),supportGeometry=this.geometry(new THREE.BoxGeometry(.11,this.ceilingHeight,.11));
      for(const cells of batches(supports,cell=>`${cell.chunk}:${cell.palette}`)){
        const mesh=install(supportGeometry,beamMaterials[cells[0].palette],cells,(cell,t)=>{t.position.set(cell.x,this.ceilingHeight/2,cell.z);});this.canopyVisuals.push(mesh);
      }
      const roofMaterial=this.material(new THREE.MeshBasicMaterial({color:0xd7e4bd}));
      for(const roof of level.skylights||[]){
        for(const[width,depth,x,z]of[[roof.width,.14,roof.x,roof.z-roof.depth/2],[roof.width,.14,roof.x,roof.z+roof.depth/2],[.14,roof.depth,roof.x-roof.width/2,roof.z],[.14,roof.depth,roof.x+roof.width/2,roof.z]]){
          const mesh=this.mesh(this.geometry(new THREE.BoxGeometry(width,.16,depth)),roofMaterial,x,this.ceilingHeight-.1,z);this.canopyVisuals.push(mesh);this.staticBatches.push(mesh);
        }
      }
    }

    // Door artwork and geometry are shared by kind, even across dozens of gates.
    const doorGeometry={x:this.geometry(new THREE.BoxGeometry(.98,WALL_HEIGHT,.14)),z:this.geometry(new THREE.BoxGeometry(.14,WALL_HEIGHT,.98))};
    const remnants=new Map(),frameGeometry=this.geometry(new THREE.PlaneGeometry(.98,WALL_HEIGHT));
    for(const door of this.game.state.doors){
      const kind=doorKind(door),styleKey=doorStyleKey(door);
      if(!this.doorMaterials.has(styleKey))this.doorMaterials.set(styleKey,makeDoorFrameSet(kind,this.visuals,circuitMark(door)).map(frames=>frames.map(map=>this.material(new THREE.MeshBasicMaterial({map:this.texture(map),color:0xd8dfcf})))));
      if(!remnants.has(styleKey))remnants.set(styleKey,this.material(new THREE.MeshBasicMaterial({map:this.texture(makeDoorRemnant(kind,circuitMark(door))),transparent:true,alphaTest:.2,side:THREE.DoubleSide})));
      const maps=this.doorMaterials.get(styleKey),mesh=this.mesh(doorGeometry[door.axis]||doorGeometry.x,maps[Number(doorReady(door,this.game.state))][0],door.x,WALL_HEIGHT/2,door.z);
      const remnant=this.mesh(frameGeometry,remnants.get(styleKey),door.x,WALL_HEIGHT/2,door.z);remnant.rotation.y=door.axis==='z'?Math.PI/2:0;remnant.visible=door.open;
      this.doorVisuals.set(door.id,{mesh,remnant,maps,amount:door.open?1:0});
    }
    for(const [index,zone]of (level.zones||[]).entries())this.addZoneSign(zone,index);
    for(const item of this.game.state.interactables||[])this.addFeature(item);
    this.landmarkVisuals=[];this.destinationSigns=[];
    const landmarkMaps=new Map();
    for(const panel of allLandmarkPanels(level)){
      const key=landmarkKey(panel);
      if(!landmarkMaps.has(key))landmarkMaps.set(key,this.material(new THREE.MeshBasicMaterial({map:this.texture(landmarkTexture(panel)),color:garden?0xf5f3dc:0xe0dfc9})));
      const mesh=this.mesh(this.geometry(new THREE.PlaneGeometry(panel.width,panel.height)),landmarkMaps.get(key),panel.x,panel.bottom+panel.height/2,panel.z);
      mesh.rotation.y=Math.atan2(-panel.dx,-panel.dz);this.staticBatches.push(mesh);this.landmarkVisuals.push({panel,mesh});
    }
    for(const panel of destinationPanels(level)){
      const material=this.material(new THREE.MeshBasicMaterial({map:this.texture(makeSign(panel.label,panel.sub||`LIFT ${panel.mark}`,'#eec882'))}));
      const mesh=this.mesh(this.geometry(new THREE.PlaneGeometry(panel.width,panel.height)),material,panel.x,panel.bottom+panel.height/2,panel.z);
      mesh.rotation.y=Math.atan2(-panel.dx,-panel.dz);this.staticBatches.push(mesh);this.destinationSigns.push({panel,mesh});
    }
    this.stats.landmarkPanels=this.landmarkVisuals.length;
    this.stats.staticBatches=this.staticBatches.length;
    this.stats.staticInstanceBytes=this.staticBatches.reduce((sum,mesh)=>sum+(mesh.instanceMatrix?.array.byteLength||0)+(mesh.instanceColor?.array.byteLength||0),0);
    this.stats.geometryBytes=[...this.geometries].reduce((sum,geometry)=>sum+Object.values(geometry.attributes).reduce((n,attribute)=>n+attribute.array.byteLength,0)+(geometry.index?.array.byteLength||0),0);
    this.stats.textureSourceBytes=[...this.textures].reduce((sum,texture)=>sum+(texture.image?.width||0)*(texture.image?.height||0)*4,0);
    for(const key of['walls','lights','runs','rails'])delete this.layout[key];
  }

  addZoneSign(zone,index){
    const cx=(zone.x1+zone.x2)/2,cz=(zone.z1+zone.z2)/2;
    let candidate=null;
    for(let z=Math.ceil(zone.z1);z<=Math.floor(zone.z2);z++)for(let x=Math.ceil(zone.x1);x<=Math.floor(zone.x2);x++){
      if(this.solid(x,z))continue;
      for(const [dx,dz,rotation]of [[0,-1,0],[-1,0,Math.PI/2],[0,1,Math.PI],[1,0,-Math.PI/2]])if(this.solid(x+dx,z+dz)){
        const score=Math.hypot(x-cx,z-cz)+(dz===-1?0:2);
        if(!candidate||score<candidate.score)candidate={x:x+.5+dx*.48,z:z+.5+dz*.48,rotation,score};
      }
    }
    if(!candidate)return;
    const map=this.texture(makeSign(zoneTitle(zone,this.visuals),`${this.visuals.signCode} / SECTOR ${String(index+1).padStart(2,'0')}`,this.visuals.glasshouse?GARDEN_PALETTES[zone.palette]?.accent||this.visuals.signColor:this.visuals.underworks?SECTORS[zone.palette]?.accent||this.visuals.signColor:this.visuals.signColor));
    const sign=this.mesh(this.geometry(new THREE.PlaneGeometry(this.visuals.underworks?1.15:.88,this.visuals.underworks?.36:.275)),this.material(new THREE.MeshBasicMaterial({map})),candidate.x,1.83,candidate.z);
    sign.rotation.y=candidate.rotation;
  }

  addFeature(item){
    if(explorationFeature(item)){
      const key=stationKey(item);
      if(!this.stationMaps.has(key))this.stationMaps.set(key,Array.from({length:['transit','shutter-switch'].includes(item.type)?3:2},(_,mode)=>this.texture(makeStationTexture(item,mode))));
      const maps=this.stationMaps.get(key),sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:maps[featureMode(item,this.game.state)],transparent:true,alphaTest:.18})));
      sprite.center.set(.5,0);sprite.position.set(item.x,.015,item.z);sprite.scale.set(1.19,1.7,1);this.scene.add(sprite);
      this.featureVisuals.set(item.id,{sprite,maps,type:item.type,station:true});return;
    }
    if(item.type==='secret'){
      const sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.texture(makeSign('MAINT.','AUTHORIZED STAFF','#87948d')),transparent:true})));
      sprite.position.set(item.x,1.35,item.z);sprite.scale.set(.55,.17,1);this.scene.add(sprite);
      this.featureVisuals.set(item.id,{sprite});return;
    }
    const group=new THREE.Group();group.position.set(item.x,0,item.z);this.scene.add(group);
    const base=new THREE.Mesh(this.geometry(new THREE.BoxGeometry(.34,.65,.32)),this.material(new THREE.MeshBasicMaterial({color:0x34464d})));
    base.position.y=.325;group.add(base);
    const isRelay=item.type==='relay';
    const title=isRelay?relayTitle(item):item.type==='power'?(this.visuals.glasshouse?'PUMP POWER':this.visuals.underworks?'CORE POWER':this.visuals.crosslink?'LINK POWER':this.visuals.relay?'RING POWER':'AUX POWER'):this.visuals.glasshouse?'LAB LIFT':this.visuals.switchyard?'FREIGHT LIFT':'EXTRACTION';
    const maps={
      off:this.texture(makeSign(title,isRelay?'LINK 01 / LINK 02':item.type==='power'?'GRID OFFLINE':'LIFT OFFLINE',isRelay?'#b9a1ed':item.type==='power'?'#ecc477':'#81d9c7')),
      on:this.texture(makeSign(title,isRelay?'NODE SYNCHRONIZED':'SYSTEM ONLINE','#a1e4c5')),
    };
    const screen=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:maps.off})));
    screen.position.y=1.05;screen.scale.set(.86,.27,1);group.add(screen);
    const beacon=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.plasmaMap,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})));
    beacon.position.y=1.43;beacon.scale.set(.19,.19,1);group.add(beacon);
    this.featureVisuals.set(item.id,{group,beacon,screen,maps,type:item.type});
    if(isRelay){
      const antennaMaterial=this.material(new THREE.MeshBasicMaterial({color:0x9ca6d3}));
      for(const side of [-1,1]){
        const antenna=new THREE.Mesh(this.geometry(new THREE.BoxGeometry(.045,.43,.045)),antennaMaterial);antenna.position.set(side*.3,1.40,.03);group.add(antenna);
        const cap=new THREE.Mesh(this.geometry(new THREE.BoxGeometry(.10,.06,.10)),antennaMaterial);cap.position.set(side*.3,1.62,.03);group.add(cap);
      }
    }
    if(item.type==='exit'){
      const barMaterial=this.material(new THREE.MeshBasicMaterial({color:0x79c6b5}));
      for(const side of [-1,1]){
        const bar=new THREE.Mesh(this.geometry(new THREE.BoxGeometry(.055,1.8,.06)),barMaterial);bar.position.set(side*.46,.9,0);group.add(bar);
      }
    }
  }

  resize(){
    const bounds=this.canvas.getBoundingClientRect();
    const width=Math.max(1,bounds.width||window.innerWidth),height=Math.max(1,bounds.height||window.innerHeight);
    const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;
    const low=this.options.quality==='low',high=this.options.quality==='high';
    const pixelBudget=low?210000:high?(coarse?480000:960000):coarse?360000:650000;
    const scale=Math.min(1,Math.sqrt(pixelBudget/(width*height)));
    const rw=Math.max(1,Math.round(width*scale)),rh=Math.max(1,Math.round(height*scale));
    if(this.width!==rw||this.height!==rh){
      this.width=rw;this.height=rh;this.renderer.setSize(rw,rh,false);
      this.weaponCanvas.width=rw;this.weaponCanvas.height=rh;this.weaponContext.imageSmoothingEnabled=false;
    }
    // Projection settings must update even when no backing-buffer resize occurs.
    const fov=viewFov(this.options,width,height),aspect=width/height;
    if(this.camera.aspect!==aspect||this.camera.fov!==fov){this.camera.aspect=aspect;this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    this.fieldOfView=fov;
    this.entityRange=VIEW_DEPTH*Math.sqrt(1+Math.pow(Math.tan(fov*Math.PI/360)*aspect,2))+2;
  }

  setOptions(options={}){Object.assign(this.options,options);this.resize();}

  handleEvents(events){
    for(const event of events||[]){
      if(event.type==='shot'){
        if(localEvent(event,this.game.state)){this.flash=['arc','grenade'].includes(event.weapon)?.11:.075;this.recoil=WEAPON_RECOIL[event.weapon]||.58;}
        else this.teammateFireAt.set(event.playerId,this.clock);
      }
      if(event.type==='hit'){
        const id=event.enemyId??event.id??event.targetId;
        if(id)this.hitAt.set(id,this.clock);
      }
      if(event.type==='kill'){
        const id=event.enemyId??event.id??event.targetId;
        if(id)this.deadAt.set(id,this.clock);
      }
      if(event.type==='hit'||event.type==='kill'){
        const enemy=this.game.state.enemies.find(e=>e.id===(event.enemyId??event.id??event.targetId));
        if(enemy){
          const sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.impactMap,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})));
          sprite.position.set(enemy.x,.9,enemy.z);sprite.scale.set(.22,.22,1);this.scene.add(sprite);
          this.impacts.push({sprite,life:.13});
        }
      }
    }
  }

  render(dt=1/60){
    dt=clamp(Number.isFinite(dt)?dt:0,0,.08);
    const state=this.game.state,p=state.player;
    const advancing=state.status==='playing'||state.status==='ready';
    if(advancing)this.clock+=dt;
    this.flash=Math.max(0,this.flash-dt);this.recoil=Math.max(0,this.recoil-dt*4);
    this.weaponSwap=Math.max(0,this.weaponSwap-dt*4);
    const moved=Math.hypot(p.x-this.lastX,p.z-this.lastZ);
    this.lastX=p.x;this.lastZ=p.z;
    this.moveAmount+=(Math.min(1,moved/Math.max(.001,dt)*.3)-this.moveAmount)*Math.min(1,dt*12);
    if(advancing)this.bobPhase+=dt*(6+this.moveAmount*5);
    const reduced=this.options.reducedMotion;
    let angle=p.angle;
    if(state.status==='ready'&&!reduced)angle+=Math.sin(this.clock*.19)*.16;
    const bob=reduced||state.status!=='playing'?0:Math.sin(this.bobPhase)*this.moveAmount*.025;
    this.camera.position.set(p.x,EYE_HEIGHT+bob+(p.elevation||0)*(reduced?.4:1),p.z);this.camera.rotation.set(0,-angle,0);
    if(state.status==='dead'||p.alive===false||p.health<=0)this.camera.position.y=.65;
    for(const {pad,mesh,mat} of this.shadowPlatforms||[]){const solid=platformSolid(pad,state.time);mesh.position.y=solid?.08:-.14;mat.color.setHex(solid?(pad.period?0x76dec3:0x748c98):0x372331);}
    this.updateEntities(dt,advancing);
    if(this.waterMap){const time=this.options.reducedMotion?0:this.clock;this.waterMap.offset.set(time*.025,time*.013);}
    this.renderer.render(this.scene,this.camera);
    this.stats.drawCalls=this.renderer.info.render.calls;this.stats.drawTriangles=this.renderer.info.render.triangles;
    this.drawWeapon();
  }

  updateEntities(dt,advancing){
    const state=this.game.state;
    this.updateTeammates(dt,advancing);
    for(const enemy of state.enemies){
      let visual=this.enemyVisuals.get(enemy.id);
      if(enemy.dormant||!inEntityRange(enemy,state.player,this.entityRange)){if(visual){visual.sprite.visible=false;visual.shadow.visible=false;visual.stun.visible=false;}continue;}
      if(!visual){
        const material=this.material(new THREE.SpriteMaterial({map:(this.enemyFrames[enemy.type]||this.enemyFrames.runner)[0],transparent:true,alphaTest:.25,depthWrite:true}));
        const sprite=new THREE.Sprite(material);sprite.center.set(.5,0);this.scene.add(sprite);
        if(!this.enemyShadowGeometry){this.enemyShadowGeometry=this.geometry(new THREE.CircleGeometry(.27,12));this.enemyShadowMaterial=this.material(new THREE.MeshBasicMaterial({color:0x050b10,transparent:true,opacity:.45,depthWrite:false}));}
        const shadow=new THREE.Mesh(this.enemyShadowGeometry,this.enemyShadowMaterial);
        shadow.rotation.x=-Math.PI/2;this.scene.add(shadow);
        const stun=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.stunMap,transparent:true,depthWrite:false,alphaTest:.15})));this.scene.add(stun);
        visual={sprite,shadow,stun,x:enemy.x,z:enemy.z,phase:hash(enemy.x,enemy.z)*5};this.enemyVisuals.set(enemy.id,visual);
      }
      visual.sprite.visible=true;visual.shadow.visible=true;
      const dead=enemy.alive===false||enemy.health<=0;
      const speed=Math.hypot(enemy.x-visual.x,enemy.z-visual.z)/Math.max(dt,.001);
      visual.x=enemy.x;visual.z=enemy.z;
      if(advancing)visual.phase+=dt*(speed>.05?8:2);
      let frame=speed>.05?Math.floor(visual.phase)%4:0;
      const close=Math.hypot(enemy.x-state.player.x,enemy.z-state.player.z)<1.7;
      if(close&&!['sentry','bulwark','mender'].includes(enemy.type)&&enemy.active!==false&&Math.sin(this.clock*5+enemy.x)>.4)frame=4;
      if(enemy.type==='spitter'&&enemy.attackCooldown>.8&&Math.sin(this.clock*5)>.5)frame=4;
      if(enemy.telegraph||enemy.bossPhase==='charge')frame=4;
      if(enemy.guardian&&enemy.bossPhase==='recover')frame=0;
      const stunned=!enemy.guardian&&enemy.stunTimer>0&&!dead;
      if(stunned)frame=0;
      if(enemy.hitTimer>0||this.clock-(this.hitAt.get(enemy.id)??-99)<.14)frame=5;
      if(dead)frame=6;
      const maps=this.getEnemyFrames(enemyArt(enemy,state.player));
      visual.sprite.material.map=maps[frame];
      const height=enemyHeight(enemy);
      visual.sprite.position.set(enemy.x,.015,enemy.z);visual.sprite.scale.set(height*80/112,height,1);
      visual.shadow.position.set(enemy.x,.008,enemy.z);
      visual.shadow.scale.setScalar(enemy.type==='brute'?1.3:1);
      visual.sprite.material.color.setHex(dead?0x9aa6a5:enemy.contained?0x9edfd5:0xffffff);
      visual.sprite.material.opacity=enemy.type==='stalker'&&enemy.telegraph?.kind==='blink'?.65:1;
      visual.stun.visible=stunned||!!enemy.contained;visual.stun.position.set(enemy.x,height+.05,enemy.z);visual.stun.scale.set(.62,.46,1);
    }
    for(const pickup of state.pickups){
      let sprite=this.pickupVisuals.get(pickup.id);
      if(pickup.collected||!inEntityRange(pickup,state.player,this.entityRange)){if(sprite)sprite.visible=false;continue;}
      if(!sprite){
        sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.pickupMaps[pickup.type]||this.pickupMaps.ammo,transparent:true,alphaTest:.25})));
        sprite.scale.setScalar(WEAPON_PICKUPS.includes(pickup.type)?.78:pickup.type==='healthExpansion'?.7:.56);this.scene.add(sprite);this.pickupVisuals.set(pickup.id,sprite);
      }
      sprite.visible=!pickup.collected;
      sprite.position.set(pickup.x,.35+(this.options.reducedMotion?0:Math.sin(this.clock*2.4+pickup.x)*.035),pickup.z);
    }
    for(const door of state.doors){
      const visual=this.doorVisuals.get(door.id);if(!visual)continue;
      const target=door.open?1:0;
      visual.amount+=clamp(target-visual.amount,-dt*1.7,dt*1.7);
      visual.mesh.position.y=WALL_HEIGHT/2+visual.amount*2.7;
      const visible=inEntityRange(door,state.player,this.entityRange),status=doorFrame(door,state,this.clock,this.options.reducedMotion);
      const frames=visual.maps[Number(status.ready)];visual.mesh.material=frames[status.frame%frames.length];
      visual.mesh.visible=visual.amount<.99&&visible;visual.remnant.visible=door.open&&visible;
    }
    const featureEntities=new Map((state.interactables||[]).map(item=>[item.id,item]));
    for(const [id,feature]of this.featureVisuals){
      const entity=featureEntities.get(id);if(!entity)continue;
      const visible=inEntityRange(entity,state.player,this.entityRange);(feature.group||feature.sprite).visible=visible;
      if(feature.station){if(visible)feature.sprite.material.map=feature.maps[featureMode(entity,state)];continue;}
      if(!feature.beacon||!visible)continue;
      const on=feature.type==='power'?state.power:feature.type==='relay'?!!entity?.used:exitReady(state);
      feature.screen.material.map=on?feature.maps.on:feature.maps.off;
      if(feature.type==='power')feature.beacon.material.color.setHex(on?0x8affd0:0xffb25a);
      if(feature.type==='relay')feature.beacon.material.color.setHex(on?0x8affd0:0xc9a6ff);
      if(feature.type==='exit')feature.beacon.material.color.setHex(on?0x8affd0:0x547f78);
      if(feature.beacon&&!this.options.reducedMotion)feature.beacon.scale.setScalar(.19+Math.sin(this.clock*3)*.018);
    }
    this.updateEncounterCues();
    const projectileIds=new Set();
    for(const projectile of state.projectiles||[]){
      projectileIds.add(projectile.id);
      let sprite=this.projectileVisuals.get(projectile.id);
      const appearance=projectileAppearance(projectile),grenade=appearance.kind==='grenade';
      if(!sprite){sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.plasmaMap,transparent:true,depthWrite:false})));this.scene.add(sprite);this.projectileVisuals.set(projectile.id,sprite);}
      sprite.material.map=grenade?this.grenadeMaps[Math.min(3,Math.floor((1-appearance.remaining)*4))]:this.plasmaMap;
      sprite.material.blending=grenade?THREE.NormalBlending:THREE.AdditiveBlending;sprite.material.alphaTest=grenade?.15:0;sprite.scale.setScalar(appearance.size);
      sprite.position.set(projectile.x,appearance.y,projectile.z);
      sprite.visible=inEntityRange(projectile,state.player,this.entityRange);
    }
    for(const[id,sprite]of this.projectileVisuals)if(!projectileIds.has(id)){this.scene.remove(sprite);this.projectileVisuals.delete(id);this.materials.delete(sprite.material);sprite.material.dispose();}
    for(let i=this.impacts.length-1;i>=0;i--){
      const impact=this.impacts[i];if(advancing)impact.life-=dt;
      impact.sprite.material.opacity=Math.max(0,impact.life/.13);
      if(impact.life<=0){this.scene.remove(impact.sprite);this.materials.delete(impact.sprite.material);impact.sprite.material.dispose();this.impacts.splice(i,1);}
    }
  }

  updateEncounterCues(){
    const cues=encounterCues(this.game.state).filter(cue=>inEntityRange(cue,this.game.state.player,this.entityRange));
    this.stats.encounterCues=cues.length;
    if(!this.cueRingGeometry){this.cueRingGeometry=this.geometry(new THREE.RingGeometry(.90,1,32));this.cueBeamGeometry=this.geometry(new THREE.BoxGeometry(1,1,1));}
    for(let i=0;i<Math.max(cues.length,this.cueVisuals.length);i++){
      const cue=cues[i];let visual=this.cueVisuals[i];
      if(!cue){visual.ring.visible=visual.beam.visible=visual.echo.visible=false;for(const piece of [...visual.arc||[],...visual.dots||[]])piece.visible=false;continue;}
      if(!visual){
        const ring=this.mesh(this.cueRingGeometry,this.material(new THREE.MeshBasicMaterial({color:0xffbd88,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide})));ring.rotation.x=-Math.PI/2;
        const beam=this.mesh(this.cueBeamGeometry,this.material(new THREE.MeshBasicMaterial({color:0xffbd88,transparent:true,opacity:.3,depthWrite:false})));
        const echo=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.phaseEchoMap,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending})));
        echo.center.set(.5,0);this.scene.add(echo);visual={ring,beam,echo};this.cueVisuals.push(visual);
      }
      const line=['charge','beam','shot','ricochet'].includes(cue.kind)||cue.kind==='heal'&&!cue.telegraph;
      visual.ring.visible=!['beam','arc','ricochet','shield-hit','heal-interrupt'].includes(cue.kind);visual.beam.visible=line;
      visual.ring.position.set(cue.x,.035,cue.z);visual.ring.scale.setScalar(cue.radius);
      visual.ring.material.color.set(cue.color);visual.ring.material.opacity=cue.telegraph?.38+.45*cue.progress:.6*cue.progress;
      if(line){
        const length=Math.hypot(cue.x-cue.fromX,cue.z-cue.fromZ),charge=cue.kind==='charge';
        visual.beam.position.set((cue.x+cue.fromX)/2,charge?.025:.96,(cue.z+cue.fromZ)/2);
        visual.beam.rotation.y=Math.atan2(cue.x-cue.fromX,cue.z-cue.fromZ);
        visual.beam.scale.set(charge?cue.radius*1.6:cue.kind==='shot'?.025:cue.kind==='heal'?.075:.055,charge?.015:.025,Math.max(.01,length));
        visual.beam.material.color.set(cue.color);visual.beam.material.opacity=charge?.14+.14*cue.progress:cue.kind==='shot'?.25:.9*cue.progress;
      }
      const signal=cueBillboard(cue);visual.echo.visible=!!signal;
      if(signal){
        visual.echo.material.map=signal.map==='blink'?this.phaseEchoMap:this.combatMaps[signal.map];
        visual.echo.position.set(signal.x,signal.bottom,signal.z);visual.echo.scale.set(signal.width,signal.height,1);visual.echo.material.opacity=cue.telegraph?.35+.5*cue.progress:.8*cue.progress;
      }
      if(cue.kind==='heal'&&cue.telegraph){
        if(!visual.dots)visual.dots=Array.from({length:8},()=>this.mesh(this.cueBeamGeometry,this.material(new THREE.MeshBasicMaterial({color:0xc5ecac,transparent:true,opacity:.5,depthWrite:false}))));
        visual.dots.forEach((piece,n)=>{const t=(n+1)/9;piece.visible=true;piece.position.set(cue.fromX+(cue.x-cue.fromX)*t,1.02,cue.fromZ+(cue.z-cue.fromZ)*t);piece.scale.set(.065,.065,.065);piece.material.opacity=.3+.4*cue.progress;});
      }else for(const piece of visual.dots||[])piece.visible=false;
      if(cue.kind==='arc'){
        if(!visual.arc)visual.arc=Array.from({length:4},()=>this.mesh(this.cueBeamGeometry,this.material(new THREE.MeshBasicMaterial({color:0x9bf0ed,transparent:true,depthWrite:false,opacity:.9}))));
        const dx=cue.x-cue.fromX,dz=cue.z-cue.fromZ,length=Math.max(.01,Math.hypot(dx,dz));
        const points=Array.from({length:5},(_,n)=>{const offset=n===0||n===4?0:(n%2?.10:-.10);return{x:cue.fromX+dx*n/4+dz/length*offset,z:cue.fromZ+dz*n/4-dx/length*offset};});
        visual.arc.forEach((piece,n)=>{const a=points[n],b=points[n+1];piece.visible=true;piece.position.set((a.x+b.x)/2,1.02,(a.z+b.z)/2);piece.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);piece.scale.set(.045,.045,Math.max(.01,Math.hypot(b.x-a.x,b.z-a.z)));piece.material.opacity=.9*cue.progress;});
      }else for(const piece of visual.arc||[])piece.visible=false;
    }
  }

  updateTeammates(dt,advancing){
    const state=this.game.state,p=state.player,present=new Set();
    for(const[id,player]of otherPlayers(state)){
      present.add(id);let visual=this.teammateVisuals.get(id);
      const frames=this.getTeammateFrames(id);
      if(!visual){
        const material=this.material(new THREE.SpriteMaterial({map:frames.front[0],transparent:true,alphaTest:.25,depthWrite:true}));
        const sprite=new THREE.Sprite(material);sprite.center.set(.5,0);this.scene.add(sprite);
        if(!this.teammateShadowGeometry){
          this.teammateShadowGeometry=this.geometry(new THREE.CircleGeometry(.27,12));
          this.teammateShadowMaterial=this.material(new THREE.MeshBasicMaterial({color:0x051116,transparent:true,opacity:.4,depthWrite:false}));
        }
        const shadow=new THREE.Mesh(this.teammateShadowGeometry,this.teammateShadowMaterial);shadow.rotation.x=-Math.PI/2;this.scene.add(shadow);
        visual={sprite,shadow,x:player.x,z:player.z,phase:0};this.teammateVisuals.set(id,visual);
      }
      const pose=teammateView(player,p,visual,dt,advancing,this.clock,this.teammateFireAt.get(id));
      const equipped=WEAPON_PICKUPS.includes(player.weapon),bodyFrame=equipped&&pose.frame===5?0:pose.frame;
      visual.sprite.material.map=frames[pose.direction][bodyFrame];
      visual.sprite.position.set(player.x,.015,player.z);visual.sprite.scale.set(1.74*80/112,1.74,1);
      // Co-op allows walking through each other. Hide a body once inside the
      // camera, avoiding a full-screen sprite while two players cross paths.
      visual.sprite.visible=Math.hypot(player.x-p.x,player.z-p.z)>.32;
      visual.shadow.position.set(player.x,.008,player.z);visual.shadow.visible=visual.sprite.visible;
      if(equipped&&!pose.down){
        if(!visual.weapon){visual.weapon=new THREE.Sprite(this.material(new THREE.SpriteMaterial({transparent:true,alphaTest:.2,depthWrite:false})));visual.weapon.center.set(.5,0);visual.weapon.renderOrder=2;this.scene.add(visual.weapon);}
        visual.weapon.material.map=this.getTeammateWeapon(player.weapon,pose.direction,pose.frame===5);visual.weapon.position.copy(visual.sprite.position);visual.weapon.scale.copy(visual.sprite.scale);visual.weapon.visible=visual.sprite.visible;
      }else if(visual.weapon)visual.weapon.visible=false;
    }
    for(const[id,visual]of this.teammateVisuals)if(!present.has(id)){
      this.scene.remove(visual.sprite,visual.shadow);this.materials.delete(visual.sprite.material);visual.sprite.material.dispose();
      if(visual.weapon){this.scene.remove(visual.weapon);this.materials.delete(visual.weapon.material);visual.weapon.material.dispose();}
      this.teammateVisuals.delete(id);this.teammateFireAt.delete(id);
    }
  }

  drawWeapon(){
    const c=this.weaponContext,w=this.width,h=this.height,p=this.game.state.player;
    c.clearRect(0,0,w,h);
    if(this.game.state.status==='won'||p.alive===false||p.health<=0)return;
    if(this.lastWeapon!==p.weapon){this.lastWeapon=p.weapon;this.weaponSwap=1;}
    const reduced=this.options.reducedMotion;
    const scale=Math.min(w/400,h/270)*.9;
    const sway=reduced?0:Math.sin(this.bobPhase*.5)*this.moveAmount*4;
    const bob=reduced?0:Math.abs(Math.sin(this.bobPhase))*this.moveAmount*3;
    const recoil=reduced?this.recoil*3:this.recoil*13;
    c.save();c.translate(Math.round(w*.51+sway),Math.round(h+12+bob+recoil+this.weaponSwap*60));c.scale(scale,scale);
    // Gloved forearms and a steel weapon drawn as a low-resolution first-person sprite.
    poly(c,[[-75,0],[-63,-37],[-40,-60],[-20,-41],[-10,0]],'#17232a');
    poly(c,[[-70,0],[-59,-32],[-40,-51],[-28,-36],[-19,0]],'#52615b');
    poly(c,[[28,0],[30,-42],[48,-52],[68,-34],[84,0]],'#17242b');
    poly(c,[[38,0],[39,-36],[49,-45],[62,-28],[75,0]],'#617064');
    rect(c,-52,-31,13,18,'#2d3c3c');rect(c,45,-27,14,15,'#344744');
    if(['repeater','nullgun','lance'].includes(p.weapon)){drawShadowWeapon(c,p.weapon,this.flash,this.clock);
    }else if(p.weapon==='shotgun'){
      poly(c,[[-27,0],[-27,-55],[-18,-110],[-15,-144],[15,-144],[19,-110],[30,-55],[30,0]],'#17242d');
      poly(c,[[-21,-57],[-14,-139],[-2,-142],[-3,-57]],'#7c8c8a');
      poly(c,[[3,-57],[3,-141],[13,-138],[22,-57]],'#52676c');
      rect(c,-14,-142,27,5,'#b6bca5');rect(c,-10,-145,4,6,'#1a3038');rect(c,7,-145,4,6,'#1a3038');
      rect(c,-2,-135,4,78,'#243b43');
      poly(c,[[-27,-54],[-21,-83],[21,-83],[28,-54]],'#8c6442');
      for(let y=-78;y<-50;y+=6){rect(c,-22,y,45,2,'#3a3630');rect(c,-20,y+2,41,1,'#b58b54');}
      rect(c,-21,-49,44,40,'#4d6264');rect(c,-16,-46,7,37,'#879791');rect(c,13,-46,8,38,'#283c45');
      rect(c,-8,-34,17,23,'#172a34');rect(c,-5,-30,11,2,'#a9b6a4');
    }else if(p.weapon==='ricochet'){
      // The carbine's long split rail and violet ceramic recoil chambers are
      // repeated in its pickup and reflected tracer.
      poly(c,[[-29,0],[-31,-50],[-24,-88],[-18,-147],[-9,-159],[13,-159],[22,-146],[26,-87],[34,-48],[28,0]],'#212c3c');
      poly(c,[[-24,-2],[-26,-58],[-17,-104],[18,-104],[29,-55],[24,-2]],'#747f94');
      rect(c,-17,-139,35,45,'#696d8e');rect(c,-13,-136,27,5,'#d9d9d5');
      for(const x of[-13,7]){rect(c,x,-154,7,60,'#bcc4c4');rect(c,x+1,-151,2,54,'#f1e9d9');}
      rect(c,-18,-154,37,5,'#d5dbd4');rect(c,-4,-160,8,8,'#31394f');rect(c,-1,-160,3,4,'#d6bef0');
      poly(c,[[-18,-88],[-11,-96],[15,-96],[23,-83],[22,-45],[-20,-45]],'#3e4765');
      for(const y of[-84,-70,-56]){rect(c,-16,y,35,7,'#a6a2bd');rect(c,-10,y+1,22,4,'#dfc6ee');}
      poly(c,[[-7,-40],[15,-40],[19,-1],[-8,-1]],'#4e526f');rect(c,-3,-34,6,30,'#a7a0b6');
      rect(c,-25,-48,6,27,'#d4c5a2');rect(c,24,-49,6,25,'#536477');
    }else if(p.weapon==='grenade'){
      // A drum and broad hollow muzzle communicate the Thumper's heavy, slow
      // round before firing; it shares no pistol-shaped barrel or flash.
      poly(c,[[-43,0],[-47,-47],[-37,-82],[-32,-110],[-19,-124],[21,-124],[36,-110],[42,-81],[49,-45],[39,0]],'#25373b');
      poly(c,[[-38,-6],[-40,-45],[-30,-78],[31,-78],[42,-44],[35,-6]],'#7b927c');
      poly(c,[[-28,-91],[-34,-110],[-23,-126],[23,-126],[35,-110],[29,-91],[18,-84],[-18,-84]],'#a1b3a1');
      poly(c,[[-19,-96],[-24,-110],[-16,-118],[17,-118],[26,-109],[19,-96]],'#263e47');
      poly(c,[[-11,-99],[-16,-108],[-10,-114],[10,-114],[17,-108],[11,-99]],'#142832');
      rect(c,-32,-81,64,10,'#cfb17a');rect(c,-27,-79,54,3,'#f2d6a0');
      poly(c,[[-37,-60],[-21,-70],[24,-69],[39,-54],[38,-28],[21,-18],[-24,-21],[-39,-36]],'#4c625f');
      for(const x of[-26,-10,6,22]){rect(c,x,-59,11,31,'#ac9d70');rect(c,x+2,-56,4,25,'#e2c98b');rect(c,x,-43,11,5,'#6a7561');}
      rect(c,-18,-18,38,19,'#3f5557');rect(c,-10,-14,6,13,'#9bb29a');rect(c,27,-89,6,17,'#f3d394');
    }else if(p.weapon==='arc'){
      // A wide capacitor, copper induction coils and two exposed prongs keep
      // the caster distinct from either conventional firearm at phone size.
      poly(c,[[-40,0],[-43,-52],[-34,-94],[-23,-103],[25,-103],[40,-83],[44,-47],[37,0]],'#142b37');
      poly(c,[[-34,-5],[-36,-61],[-25,-92],[25,-92],[35,-61],[35,-5]],'#4b747c');
      rect(c,-24,-82,49,53,'#173b47');rect(c,-19,-78,38,42,'#5ebbc2');rect(c,-14,-74,10,34,'#a9f2df');
      for(const y of[-70,-54,-38])rect(c,-22,y,44,5,'#304c55');
      for(const side of[-1,1]){
        const x=side*29;rect(c,x-6,-133,12,72,'#9eaca0');rect(c,x-3,-131,4,64,'#d3d4b6');
        for(let y=-112;y<-67;y+=8){rect(c,x-10,y,20,5,'#bc8655');rect(c,x-7,y,14,2,'#e8b36d');}
        rect(c,x-7,-139,14,12,'#416a79');rect(c,x-5,-138,10,5,'#b5f8ec');
      }
      rect(c,-28,-27,56,19,'#263f4c');rect(c,-19,-22,14,6,'#d3bc7f');rect(c,4,-22,20,6,'#77c7c1');
      poly(c,[[-24,-110],[-13,-116],[2,-109],[15,-115],[25,-109],[22,-106],[14,-111],[1,-105],[-14,-112],[-23,-107]],'#76d9dc');
    }else{
      poly(c,[[-17,0],[-24,-35],[-19,-71],[-12,-113],[12,-113],[20,-71],[28,-35],[20,0]],'#16262f');
      poly(c,[[-15,-26],[-16,-74],[-9,-109],[8,-109],[16,-74],[17,-25]],'#61787b');
      poly(c,[[-10,-31],[-10,-78],[-7,-110],[-2,-110],[-3,-31]],'#a0afa4');
      poly(c,[[6,-31],[6,-108],[11,-107],[19,-69],[18,-31]],'#354e59');
      rect(c,-11,-115,22,6,'#b5c3b4');rect(c,-3,-120,6,7,'#233740');rect(c,-1,-119,2,3,'#efce8d');
      rect(c,-14,-72,28,5,'#253d48');rect(c,-12,-67,24,2,'#c0c5ab');
      rect(c,-7,-61,16,18,'#223b46');rect(c,-4,-59,9,2,'#83a397');
      for(let y=-34;y<-9;y+=5){rect(c,-15,y,33,2,'#2f454b');}
      rect(c,-8,-12,22,12,'#2b414a');
    }
    if(this.flash>0&&p.weapon==='arc'){
      poly(c,[[-31,-137],[-15,-146],[-7,-133],[3,-155],[10,-139],[28,-138],[11,-134],[5,-147],[-5,-123],[-16,-139],[-29,-133]],'#8ce7ec');
      poly(c,[[0,-140],[8,-166],[2,-164],[12,-183],[5,-156],[10,-158],[2,-133]],'#c7ffeb');
      rect(c,-34,-140,8,6,'#f2ffe0');rect(c,26,-140,8,6,'#f2ffe0');
    }else if(this.flash>0&&p.weapon==='grenade'){
      poly(c,[[-24,-118],[-30,-137],[-16,-152],[10,-158],[30,-144],[34,-124],[18,-111],[-7,-109]],'#adbaaa');
      poly(c,[[-14,-124],[-18,-137],[-7,-147],[10,-146],[20,-137],[18,-123],[5,-117]],'#e5d8b4');
      poly(c,[[-5,-127],[-9,-135],[0,-142],[10,-136],[9,-127],[2,-122]],'#f5c77d');
    }else if(this.flash>0&&p.weapon==='ricochet'){
      poly(c,[[0,-193],[7,-171],[18,-180],[10,-160],[22,-157],[8,-151],[2,-143],[-6,-153],[-20,-159],[-7,-165],[-15,-180],[-3,-173]],'#ceb4ed');
      poly(c,[[0,-183],[4,-167],[11,-159],[2,-152],[-6,-160],[-3,-170]],'#fff0d8');
    }else if(this.flash>0&&!['repeater','nullgun','lance'].includes(p.weapon)){
      const my=p.weapon==='shotgun'?-149:-124;
      poly(c,[[0,my-37],[8,my-13],[26,my-28],[16,my-3],[37,my+2],[14,my+11],[20,my+32],[1,my+18],[-20,my+29],[-14,my+8],[-35,my+1],[-13,my-10],[-23,my-28],[-5,my-18]],'#eab05d');
      poly(c,[[0,my-20],[8,my-5],[17,my],[7,my+6],[0,my+16],[-7,my+5],[-17,my],[-6,my-8]],'#fff1b0');
      rect(c,-4,my-6,8,12,'#fffde0');
    }
    c.restore();
  }

  dispose(){
    for(const texture of this.textures)texture.dispose();
    for(const material of this.materials)material.dispose();
    for(const geometry of this.geometries)geometry.dispose();
    this.renderer.dispose();this.weaponCanvas.remove();
    this.textures.clear();this.materials.clear();this.geometries.clear();
  }
}

// Software rendering is a real compatibility path for browsers without a usable
// GPU context. It uses exactly the same simulation, level and original artwork.
// The small pixel budget keeps the CPU renderer responsive on constrained devices.
class SoftwareBreachRenderer {
  constructor(canvas,game,options={}){
    this.canvas=canvas;this.game=game;this.options={quality:'auto',fov:null,reducedMotion:false,...options};
    this.visuals=missionVisuals(game.level);
    this.ceilingHeight=this.visuals.glasshouse?4.2:WALL_HEIGHT;
    this.layout=surfaceLayout(game.level,this.visuals.underworks);this.stats={...this.layout.stats,viewDepth:VIEW_DEPTH,maxRaySteps:160};
    this.mode='software';this.isSoftware=true;this.clock=0;this.recoil=0;this.flash=0;
    this.bobPhase=0;this.moveAmount=0;this.weaponSwap=0;this.lastWeapon=game.state.player.weapon;
    this.lastX=game.state.player.x;this.lastZ=game.state.player.z;this.hitAt=new Map();this.impacts=[];
    this.teammateMotion=new Map();this.teammateFrames={};this.teammateFireAt=new Map();this.teammateWeaponMaps=new Map();
    this.textures=[];this._oldOpacity=canvas.style.opacity;
    // A failed WebGL constructor can reserve the canvas context. Use a separate
    // visual surface while preserving #world and all its existing input handlers.
    this.outputCanvas=document.createElement('canvas');
    this.outputCanvas.className='breach-software-canvas';this.outputCanvas.setAttribute('aria-hidden','true');
    Object.assign(this.outputCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'0',pointerEvents:'none',imageRendering:'pixelated'});
    canvas.insertAdjacentElement('afterend',this.outputCanvas);canvas.style.opacity='0';
    this.context=this.outputCanvas.getContext('2d',{alpha:false});
    if(!this.context)throw new Error('This browser could not start the game screen. Please try Safari or Chrome.');
    this.weaponCanvas=document.createElement('canvas');this.weaponCanvas.className='breach-weapon-canvas';
    this.weaponCanvas.setAttribute('aria-hidden','true');
    Object.assign(this.weaponCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'2',pointerEvents:'none',imageRendering:'pixelated'});
    canvas.parentElement.appendChild(this.weaponCanvas);this.weaponContext=this.weaponCanvas.getContext('2d');
    const image=(texture)=>{this.textures.push(texture);return texture.image;};
    this.wallImages=this.layout.names.map(name=>image(this.visuals.glasshouse?makeGardenWallTexture(name):this.visuals.underworks?makeSectorWallTexture(name):this.visuals.switchyard?makeYardWallTexture():makeWallTexture(0,this.visuals.relay,this.visuals.crosslink)));
    this.floorPixelsByPalette=this.layout.names.map(name=>image(this.visuals.glasshouse?makeGardenFloorTexture(name):this.visuals.underworks?makeSectorFloorTexture(name):(this.visuals.switchyard?makeYardFloorTexture():makeFloorTexture(false,this.visuals.relay,this.visuals.crosslink))).getContext('2d').getImageData(0,0,64,64).data);
    this.ceilingPixelsByPalette=this.layout.names.map(name=>image(this.visuals.glasshouse?makeGardenFloorTexture(name,true):this.visuals.underworks?makeSectorFloorTexture(name,true):makeFloorTexture(true,this.visuals.relay,this.visuals.crosslink)).getContext('2d').getImageData(0,0,64,64).data);
    this.hazardPixels=this.visuals.underworks?[null,...['flood','conduit'].map(type=>image(makeHazardTexture(type)).getContext('2d').getImageData(0,0,64,64).data)]:[null];
    this.groundPaths=[];this.groundPixels=null;
    if(this.visuals.switchyard||this.visuals.hollow||this.visuals.glasshouse){
      const details=this.visuals.glasshouse?makeGardenGroundDetails(game.level):makeYardGroundDetails(game.level),map=image(details.texture);this.groundPaths=details.paths||[];
      this.groundWidth=map.width;this.groundHeight=map.height;this.groundPixels=map.getContext('2d').getImageData(0,0,map.width,map.height).data;
      if(this.visuals.glasshouse){this.gardenDetails=details;this.waterPixels=image(makeWaterHighlightsTexture()).getContext('2d').getImageData(0,0,64,64).data;this.stats.waterCells=details.waterCells.reduce((sum,value)=>sum+value,0);}
    }
    this.doorImages={};this.doorRemnants={};
    for(const door of[{kind:'plain'},...game.state.doors]){
      const kind=doorKind(door),key=doorStyleKey(door);if(this.doorImages[key])continue;
      this.doorImages[key]=makeDoorFrameSet(kind,this.visuals,circuitMark(door)).map(frames=>frames.map(image));
      this.doorRemnants[key]=image(makeDoorRemnant(kind,circuitMark(door)));
    }
    this.doorCells=new Array(game.level.width*game.level.height).fill(null);
    this.enemyFrames={};for(const type of enemyArtTypes(game.level))this.enemyFrames[type]=makeEnemyFrameSet(type,image);
    this.pickupImages={};for(const type of PICKUP_ART)this.pickupImages[type]=image(makePickupTexture(type));
    this.plasmaImage=image(makeGlowTexture('#7fe8b1','#e6ffb5'));
    this.impactImage=image(makeGlowTexture('#f8aa58','#fff0b0'));
    this.phaseEchoImage=image(makePhaseEcho());this.stunImage=image(makeStunTexture());
    this.grenadeImages=Array.from({length:4},(_,frame)=>image(makeGrenadeTexture(frame)));
    this.combatImages=Object.fromEntries(['heal-windup','heal','heal-interrupt','shield-hit','explosion'].map(kind=>[kind,image(makeCombatSignal(kind))]));
    this.powerImages={off:this.featureImage('power',false),on:this.featureImage('power',true)};
    this.exitImages={off:this.featureImage('exit',false),on:this.featureImage('exit',true)};
    this.relayImages=new Map((game.state.interactables||[]).filter(item=>item.type==='relay').map(item=>[item.id,{off:this.featureImage('relay',false,relayTitle(item)),on:this.featureImage('relay',true,relayTitle(item))}]));
    this.stationImages=new Map();for(const item of game.state.interactables||[])if(explorationFeature(item)){
      const key=stationKey(item);
      if(!this.stationImages.has(key))this.stationImages.set(key,Array.from({length:['transit','shutter-switch'].includes(item.type)?3:2},(_,mode)=>image(makeStationTexture(item,mode))));
    }
    this.secretImage=image(makeSign('MAINT.','AUTHORIZED STAFF','#87948d'));
    this.zoneSigns=[];
    for(const [index,zone] of (game.level.zones||[]).entries()){
      const cx=(zone.x1+zone.x2)/2,cz=(zone.z1+zone.z2)/2;let best=null;
      for(let z=Math.ceil(zone.z1);z<=Math.floor(zone.z2);z++)for(let x=Math.ceil(zone.x1);x<=Math.floor(zone.x2);x++){
        if(this.solid(x,z))continue;
        for(const[dx,dz]of [[0,-1],[-1,0],[0,1],[1,0]])if(this.solid(x+dx,z+dz)){
          const score=Math.hypot(x-cx,z-cz)+(dz===-1?0:2);
          if(!best||score<best.score)best={x:x+.5+dx*.45,z:z+.5+dz*.45,dx,dz,score};
        }
      }
      if(best)this.zoneSigns.push({...best,width:this.visuals.underworks?1.15:.88,height:this.visuals.underworks?.36:.275,bottom:this.visuals.underworks?1.65:1.69,image:image(makeSign(zoneTitle(zone,this.visuals),`${this.visuals.signCode} / SECTOR ${String(index+1).padStart(2,'0')}`,this.visuals.glasshouse?GARDEN_PALETTES[zone.palette]?.accent||this.visuals.signColor:this.visuals.underworks?SECTORS[zone.palette]?.accent||this.visuals.signColor:this.visuals.signColor))});
    }
    const landmarkImages=new Map();
    this.landmarkPanels=allLandmarkPanels(game.level).map(panel=>{
      const key=landmarkKey(panel);
      if(!landmarkImages.has(key))landmarkImages.set(key,image(landmarkTexture(panel)));
      return{...panel,image:landmarkImages.get(key)};
    });
    this.destinationSigns=destinationPanels(game.level).map(panel=>({...panel,image:image(makeSign(panel.label,panel.sub||`LIFT ${panel.mark}`,'#eec882'))}));
    this.stats.landmarkPanels=this.landmarkPanels.length;
    this.stats.textureSourceBytes=this.textures.reduce((sum,texture)=>sum+(texture.image?.width||0)*(texture.image?.height||0)*4,0);
    this.stats.textureSourceBytes+=(4+2*this.relayImages.size)*96*128*4;
    this.stats.textureReadbackBytes=[...this.floorPixelsByPalette,...this.ceilingPixelsByPalette,...this.hazardPixels.filter(Boolean)].reduce((sum,pixels)=>sum+pixels.byteLength,0)+(this.groundPixels?.byteLength||0)+(this.waterPixels?.byteLength||0);
    this.stats.cellLookupBytes=this.layout.indices.byteLength+this.layout.hazards.byteLength;
    for(const key of['walls','lights','runs','rails'])delete this.layout[key];
    this.enemyMotion=new Map();this.resize();
  }

  solid(x,z){return this.game.level.grid[z]?.[x]==='#'||!this.game.level.grid[z]?.[x];}

  getEnemyFrames(art){
    if(!this.enemyFrames[art]){
      this.enemyFrames[art]=makeEnemyFrameSet(art,texture=>{this.textures.push(texture);return texture.image;});
      this.stats.textureSourceBytes+=new Set(this.enemyFrames[art]).size*80*112*4;
    }
    return this.enemyFrames[art];
  }

  getTeammateFrames(id){
    const team=id==='p2'?'p2':'p1';
    if(!this.teammateFrames[team]){
      this.teammateFrames[team]=Object.fromEntries(['front','back','right','left'].map(direction=>[direction,Array.from({length:6},(_,frame)=>{
        const texture=drawTeammate(team,direction,frame);this.textures.push(texture);return texture.image;
      })]));
      if(this.stats.textureSourceBytes)this.stats.textureSourceBytes+=24*80*112*4;
    }
    return this.teammateFrames[team];
  }

  getTeammateWeapon(weapon,direction,firing){
    const key=`${weapon}:${direction}:${Number(firing)}`;
    if(!this.teammateWeaponMaps.has(key)){const texture=makeTeammateWeapon(weapon,direction,firing);this.textures.push(texture);this.teammateWeaponMaps.set(key,texture.image);this.stats.textureSourceBytes+=80*112*4;}
    return this.teammateWeaponMaps.get(key);
  }

  featureImage(type,on,title=null){
    const [canvas,c]=canvas2d(96,128);
    const color=on?'#8bd7b4':type==='relay'?'#b9a1ed':type==='power'?'#e1b26b':'#6b9791';
    rect(c,31,68,35,60,'#293c45');rect(c,33,69,5,59,'#6a7e7b');
    rect(c,39,80,21,3,'#182c36');rect(c,39,87,21,3,'#182c36');rect(c,39,94,21,3,'#182c36');
    rect(c,8,37,80,34,'#101f28');rect(c,8,37,80,3,color);rect(c,12,41,72,2,'#354d54');
    c.font='bold 9px monospace';c.fillStyle=color;c.textAlign='center';c.fillText((title||(type==='power'?(this.visuals.glasshouse?'PUMP POWER':this.visuals.underworks?'CORE POWER':this.visuals.crosslink?'LINK POWER':this.visuals.relay?'RING POWER':'AUX POWER'):this.visuals.glasshouse?'LAB LIFT':this.visuals.switchyard?'FREIGHT LIFT':'EXTRACTION')).slice(0,13),48,54);
    c.font='6px monospace';c.fillStyle='#b5c3b4';c.fillText(on?(type==='relay'?'SYNCHRONIZED':'SYSTEM ONLINE'):type==='relay'?'NODE OFFLINE':type==='power'?'GRID OFFLINE':'LIFT OFFLINE',48,65);
    rect(c,43,19,11,12,color);rect(c,46,16,5,18,on?'#d2f0c5':'#f4cf86');
    if(type==='exit'){rect(c,2,12,3,116,color);rect(c,91,12,3,116,color);rect(c,2,10,92,3,color);}
    if(type==='relay'){
      for(const x of [17,76]){rect(c,x,7,3,29,'#8e9db9');rect(c,x-2,6,7,4,color);}
      for(let x=38;x<60;x+=7)rect(c,x,103,4,7,on?'#8bd7b4':'#6c608a');
    }
    return canvas;
  }

  resize(){
    const bounds=this.canvas.getBoundingClientRect();
    const cssWidth=Math.max(1,bounds.width||window.innerWidth),cssHeight=Math.max(1,bounds.height||window.innerHeight);
    const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;
    const low=this.options.quality==='low',high=this.options.quality==='high';
    const maxWidth=low?256:high?(coarse?448:560):coarse?320:400;
    // Compatibility mode runs on the CPU, including in GPU-disabled browsers.
    // Keep its pixel budget close to the original era instead of taxing input.
    const pixelBudget=low?64000:high?160000:96000;
    const scale=Math.min(1,maxWidth/cssWidth,Math.sqrt(pixelBudget/(cssWidth*cssHeight)));
    const w=Math.max(2,Math.floor(cssWidth*scale/2)*2),h=Math.max(2,Math.floor(cssHeight*scale/2)*2);
    if(w!==this.width||h!==this.height){
      this.width=w;this.height=h;this.outputCanvas.width=w;this.outputCanvas.height=h;
      this.weaponCanvas.width=w;this.weaponCanvas.height=h;
      this.context.imageSmoothingEnabled=false;this.weaponContext.imageSmoothingEnabled=false;
      this.depth=new Float32Array(w);this.depthDoorIds=new Array(w);this.floorBuffer=this.context.createImageData(w,h);
      // Canvas pixels are opaque; set alpha once rather than once per frame.
      for(let i=3;i<this.floorBuffer.data.length;i+=4)this.floorBuffer.data[i]=255;
    }
    this.fieldOfView=viewFov(this.options,cssWidth,cssHeight);
    this.fov=this.fieldOfView*Math.PI/180;
    this.projection=h/(2*Math.tan(this.fov/2));
    this.planeLength=w/(2*this.projection);
    this.entityRange=VIEW_DEPTH*Math.sqrt(1+this.planeLength*this.planeLength)+2;
    this.stats.pixelCount=w*h;this.stats.frameBufferBytes=this.floorBuffer.data.byteLength+this.depth.byteLength;
  }

  setOptions(options={}){Object.assign(this.options,options);this.resize();}

  handleEvents(events){
    for(const event of events||[]){
      if(event.type==='shot'){
        if(localEvent(event,this.game.state)){this.flash=['arc','grenade'].includes(event.weapon)?.11:.075;this.recoil=WEAPON_RECOIL[event.weapon]||.58;}
        else this.teammateFireAt.set(event.playerId,this.clock);
      }
      if(event.type==='hit'||event.type==='kill'){
        const id=event.enemyId??event.id??event.targetId;
        if(id)this.hitAt.set(id,this.clock);
        const enemy=this.game.state.enemies.find(e=>e.id===id);
        if(enemy)this.impacts.push({x:enemy.x,z:enemy.z,life:.13});
      }
    }
  }

  render(dt=1/60){
    dt=clamp(Number.isFinite(dt)?dt:0,0,.08);
    const state=this.game.state,p=state.player,advancing=state.status==='playing'||state.status==='ready';
    if(advancing)this.clock+=dt;
    this.flash=Math.max(0,this.flash-dt);this.recoil=Math.max(0,this.recoil-dt*4);this.weaponSwap=Math.max(0,this.weaponSwap-dt*4);
    const moved=Math.hypot(p.x-this.lastX,p.z-this.lastZ);this.lastX=p.x;this.lastZ=p.z;
    this.moveAmount+=(Math.min(1,moved/Math.max(.001,dt)*.3)-this.moveAmount)*Math.min(1,dt*12);
    if(advancing)this.bobPhase+=dt*(6+this.moveAmount*5);
    let angle=p.angle;if(state.status==='ready'&&!this.options.reducedMotion)angle+=Math.sin(this.clock*.19)*.16;
    this.forwardX=Math.sin(angle);this.forwardZ=-Math.cos(angle);this.rightX=Math.cos(angle);this.rightZ=Math.sin(angle);
    this.eye=(state.status==='dead'||p.alive===false||p.health<=0)? .65:EYE_HEIGHT+(p.elevation||0)*(this.options.reducedMotion?.4:1);
    this.horizon=Math.round(this.height/2+(this.options.reducedMotion||state.status!=='playing'?0:Math.sin(this.bobPhase)*this.moveAmount*1.2));
    this.drawPlanes(p);this.drawWalls(p);this.drawWallSigns(p);this.drawDoorRemnants(p);this.drawEncounterCues(p);this.drawSprites(dt,advancing,p);
    WebGLBreachRenderer.prototype.drawWeapon.call(this);
  }

  drawPlanes(p){
    const data=this.floorBuffer.data,w=this.width,h=this.height;
    const level=this.game.level,sectorCells=this.layout.indices,hazardCells=this.layout.hazards,underworks=this.visuals.underworks,garden=this.visuals.glasshouse;
    const waterShiftX=this.options.reducedMotion?0:Math.floor(this.clock*1.6),waterShiftZ=this.options.reducedMotion?0:Math.floor(this.clock*.83);
    const [fogR,fogG,fogB]=this.visuals.fogRgb;
    const lx=this.forwardX-this.rightX*this.planeLength,lz=this.forwardZ-this.rightZ*this.planeLength;
    const stepDirectionX=2*this.rightX*this.planeLength/w,stepDirectionZ=2*this.rightZ*this.planeLength/w;
    for(let y=0;y<h;y++){
      const isFloor=y>=this.horizon;
      if(this.visuals.switchyard&&!isFloor){
        const glow=clamp(y/Math.max(1,this.horizon),0,1),r=29+glow*25,g=39+glow*15,b=50+glow*7;
        for(let x=0,offset=y*w*4;x<w;x++,offset+=4){data[offset]=r;data[offset+1]=g;data[offset+2]=b;}
        continue;
      }
      const screenDistance=Math.abs(y-this.horizon)+.5;
      const distance=(isFloor?this.eye:this.ceilingHeight-this.eye)*this.projection/screenDistance;
      const textures=isFloor?this.floorPixelsByPalette:this.ceilingPixelsByPalette,baseTexture=textures[0];
      const shade=(garden?isFloor?1:.97:isFloor?.96:.78)*(1-clamp(distance/(garden?34:27),0,.88));
      const fog=clamp(distance/(garden?34:27),0,.88);
      const stepX=distance*stepDirectionX,stepZ=distance*stepDirectionZ;
      let worldX=p.x+distance*lx,worldZ=p.z+distance*lz;
      let offset=y*w*4;
      for(let x=0;x<w;x++){
        const tx=Math.floor(worldX*32)&63,tz=Math.floor(worldZ*32)&63,index=(tz*64+tx)*4;
        const cell=(underworks||garden)&&worldX>=0&&worldZ>=0&&worldX<level.width&&worldZ<level.height?Math.floor(worldZ)*level.width+Math.floor(worldX):-1;
        const texture=cell<0?baseTexture:isFloor&&hazardCells[cell]?this.hazardPixels[hazardCells[cell]]:textures[sectorCells[cell]];
        let red=texture[index],green=texture[index+1],blue=texture[index+2];
        if(isFloor&&this.groundPixels&&worldX>=0&&worldZ>=0&&worldX<level.width&&worldZ<level.height){
          const detail=(Math.floor(worldZ*8)*this.groundWidth+Math.floor(worldX*8))*4,alpha=this.groundPixels[detail+3]/255;
          if(alpha){red=red*(1-alpha)+this.groundPixels[detail]*alpha;green=green*(1-alpha)+this.groundPixels[detail+1]*alpha;blue=blue*(1-alpha)+this.groundPixels[detail+2]*alpha;}
        }
        if(isFloor&&this.waterPixels&&cell>=0&&this.gardenDetails.waterCells[cell]){
          const waterIndex=(((tz+waterShiftZ)&63)*64+((tx+waterShiftX)&63))*4,alpha=this.waterPixels[waterIndex+3]/510;
          if(alpha){red=red*(1-alpha)+this.waterPixels[waterIndex]*alpha;green=green*(1-alpha)+this.waterPixels[waterIndex+1]*alpha;blue=blue*(1-alpha)+this.waterPixels[waterIndex+2]*alpha;}
        }
        if(isFloor&&level.shadow){
          const room=level.platformRooms.find(r=>worldX>=r.x1&&worldX<r.x2&&worldZ>=r.z1&&worldZ<r.z2);
          if(room){const pad=room.platforms.find(q=>worldX>=q.x1&&worldX<q.x2&&worldZ>=q.z1&&worldZ<q.z2);const solid=pad&&platformSolid(pad,this.game.state.time);
            const edge=pad&&(worldX-pad.x1<.14||pad.x2-worldX<.14||worldZ-pad.z1<.14||pad.z2-worldZ<.14);
            [red,green,blue]=solid?(edge?[146,231,202]:[62,89,100]):edge?[110,44,42]:[2,3,8];
          }
        }
        data[offset]=red*shade+fogR*fog;
        data[offset+1]=green*shade+fogG*fog;
        data[offset+2]=blue*shade+fogB*fog;
        offset+=4;worldX+=stepX;worldZ+=stepZ;
      }
    }
    this.context.putImageData(this.floorBuffer,0,0);
  }

  drawWalls(p){
    const c=this.context,w=this.width,h=this.height,level=this.game.level;
    const fogRgb=this.visuals.fogRgb.join(',');
    const closed=this.doorCells;closed.fill(null);
    const currentDoorImages=new Map();
    for(const door of this.game.state.doors){const status=doorFrame(door,this.game.state,this.clock,this.options.reducedMotion),frames=this.doorImages[doorStyleKey(door)][Number(status.ready)];currentDoorImages.set(door.id,frames[status.frame%frames.length]);}
    for(const door of this.game.state.doors)if(!door.open)closed[Math.floor(door.z)*level.width+Math.floor(door.x)]=door;
    let traversed=0,maxSteps=0;
    for(let column=0;column<w;column++){
      const cameraX=2*(column+.5)/w-1;
      const rayX=this.forwardX+this.rightX*this.planeLength*cameraX,rayZ=this.forwardZ+this.rightZ*this.planeLength*cameraX;
      let mapX=Math.floor(p.x),mapZ=Math.floor(p.z);
      const deltaX=Math.abs(1/(rayX||1e-12)),deltaZ=Math.abs(1/(rayZ||1e-12));
      const stepX=rayX<0?-1:1,stepZ=rayZ<0?-1:1;
      let nextX=(rayX<0?p.x-mapX:mapX+1-p.x)*deltaX;
      let nextZ=(rayZ<0?p.z-mapZ:mapZ+1-p.z)*deltaZ;
      let side=0,distance=VIEW_DEPTH,door=null,hit=false,steps=0;
      const stepLimit=Math.min(160,Math.ceil(VIEW_DEPTH*(Math.abs(rayX)+Math.abs(rayZ)))+2);
      for(let step=0;step<stepLimit;step++){
        steps++;
        if(nextX<nextZ){distance=nextX;nextX+=deltaX;mapX+=stepX;side=0;}
        else{distance=nextZ;nextZ+=deltaZ;mapZ+=stepZ;side=1;}
        if(distance>VIEW_DEPTH)break;
        door=closed[mapZ*level.width+mapX];
        if(door||this.solid(mapX,mapZ)){hit=true;break;}
      }
      traversed+=steps;maxSteps=Math.max(maxSteps,steps);
      this.depthDoorIds[column]=door?.id||null;
      if(!hit){this.depth[column]=VIEW_DEPTH;continue;}
      distance=Math.max(.035,distance);this.depth[column]=distance;
      const wallHeight=WALL_HEIGHT*this.projection/distance;
      const top=this.horizon-(WALL_HEIGHT-this.eye)*this.projection/distance;
      let wallX=side===0?p.z+distance*rayZ:p.x+distance*rayX;wallX-=Math.floor(wallX);
      const sector=this.layout.paletteAt(mapX-(side===0?stepX:0),mapZ-(side===1?stepZ:0));
      const texture=door?currentDoorImages.get(door.id):this.wallImages[sector];
      let texX=Math.floor(wallX*texture.width);
      // U must increase from screen-left to screen-right. Our camera's right
      // vector is (cos(angle), sin(angle)): west/south faces need the reversal,
      // while north/east faces already run in the readable direction.
      if(side===0&&rayX<0||side===1&&rayZ>0)texX=texture.width-texX-1;
      c.drawImage(texture,texX,0,1,texture.height,column,top,1,wallHeight);
      const shade=clamp(this.visuals.glasshouse?.04+(side===0?.05:0)+distance/45:.10+(side===0?.10:0)+distance/30,0,.91);
      c.fillStyle=`rgba(${fogRgb},${shade.toFixed(2)})`;
      c.fillRect(column,Math.max(0,top),1,Math.min(h,top+wallHeight)-Math.max(0,top));
    }
    this.stats.raySteps=traversed;this.stats.lastMaxRaySteps=maxSteps;
  }

  drawSprites(dt,advancing,p){
    const sprites=[];const state=this.game.state;
    const add=(image,x,z,width,height,bottom=0,additive=false)=>{
      const dx=x-p.x,dz=z-p.z,depth=dx*this.forwardX+dz*this.forwardZ;
      const side=dx*this.rightX+dz*this.rightZ;
      if(depth<=.06||depth>VIEW_DEPTH||Math.abs(side)>depth*this.planeLength+width)return;
      sprites.push({image,x,z,width,height,bottom,depth,side,additive});
    };
    const present=new Set();
    for(const[id,player]of otherPlayers(state)){
      present.add(id);let motion=this.teammateMotion.get(id);
      if(!motion){motion={x:player.x,z:player.z,phase:0};this.teammateMotion.set(id,motion);}
      const pose=teammateView(player,p,motion,dt,advancing,this.clock,this.teammateFireAt.get(id));
      if(Math.hypot(player.x-p.x,player.z-p.z)>.32){
        const equipped=WEAPON_PICKUPS.includes(player.weapon),bodyFrame=equipped&&pose.frame===5?0:pose.frame;
        add(this.getTeammateFrames(id)[pose.direction][bodyFrame],player.x,player.z,1.74*80/112,1.74,.015);
        if(equipped&&!pose.down)add(this.getTeammateWeapon(player.weapon,pose.direction,pose.frame===5),player.x,player.z,1.74*80/112,1.74,.015);
      }
    }
    for(const id of this.teammateMotion.keys())if(!present.has(id)){this.teammateMotion.delete(id);this.teammateFireAt.delete(id);}
    for(const enemy of state.enemies){
      if(enemy.dormant||!inEntityRange(enemy,p,this.entityRange))continue;
      let motion=this.enemyMotion.get(enemy.id);
      if(!motion){motion={x:enemy.x,z:enemy.z,phase:hash(enemy.x,enemy.z)*5};this.enemyMotion.set(enemy.id,motion);}
      const speed=Math.hypot(enemy.x-motion.x,enemy.z-motion.z)/Math.max(.001,dt);motion.x=enemy.x;motion.z=enemy.z;
      if(advancing)motion.phase+=dt*(speed>.05?8:2);
      let frame=speed>.05?Math.floor(motion.phase)%4:0;
      const close=Math.hypot(enemy.x-p.x,enemy.z-p.z)<1.7;
      if(close&&!['sentry','bulwark','mender'].includes(enemy.type)&&enemy.active!==false&&Math.sin(this.clock*5+enemy.x)>.4)frame=4;
      if(enemy.type==='spitter'&&enemy.attackCooldown>.8&&Math.sin(this.clock*5)>.5)frame=4;
      if(enemy.telegraph||enemy.bossPhase==='charge')frame=4;
      if(enemy.guardian&&enemy.bossPhase==='recover')frame=0;
      const stunned=!enemy.guardian&&enemy.stunTimer>0&&enemy.alive!==false&&enemy.health>0;
      if(stunned)frame=0;
      if(enemy.hitTimer>0||this.clock-(this.hitAt.get(enemy.id)??-99)<.14)frame=5;
      if(enemy.alive===false||enemy.health<=0)frame=6;
      const height=enemyHeight(enemy);
      add(this.getEnemyFrames(enemyArt(enemy,p))[frame],enemy.x,enemy.z,height*80/112,height,.015);
      if(stunned||enemy.contained)add(this.stunImage,enemy.x,enemy.z,.62,.46,height-.18,true);
    }
    for(const pickup of state.pickups)if(!pickup.collected){
      const size=WEAPON_PICKUPS.includes(pickup.type)?.78:pickup.type==='healthExpansion'?.7:.56;
      const bob=this.options.reducedMotion?0:Math.sin(this.clock*2.4+pickup.x)*.035;
      add(this.pickupImages[pickup.type]||this.pickupImages.ammo,pickup.x,pickup.z,size,size,.35-size/2+bob);
    }
    for(const feature of state.interactables||[]){
      if(explorationFeature(feature)){
        const frames=this.stationImages.get(stationKey(feature));
        if(frames)add(frames[featureMode(feature,state)],feature.x,feature.z,1.19,1.7,.015);
        continue;
      }
      if(feature.type==='power')add(state.power?this.powerImages.on:this.powerImages.off,feature.x,feature.z,1.05,1.5);
      if(feature.type==='relay'){
        const images=this.relayImages.get(feature.id);
        if(images)add(feature.used?images.on:images.off,feature.x,feature.z,1.05,1.5);
      }
      if(feature.type==='exit')add(exitReady(state)?this.exitImages.on:this.exitImages.off,feature.x,feature.z,1.1,1.6);
      if(feature.type==='secret')add(this.secretImage,feature.x,feature.z,.55,.17,1.26);
    }
    for(const cue of encounterCues(state)){
      const signal=cueBillboard(cue);if(signal)add(signal.map==='blink'?this.phaseEchoImage:this.combatImages[signal.map],signal.x,signal.z,signal.width,signal.height,signal.bottom,true);
    }
    for(const projectile of state.projectiles||[]){
      const appearance=projectileAppearance(projectile),grenade=appearance.kind==='grenade';
      add(grenade?this.grenadeImages[Math.min(3,Math.floor((1-appearance.remaining)*4))]:this.plasmaImage,projectile.x,projectile.z,appearance.size,appearance.size,appearance.y-appearance.size/2,!grenade);
    }
    for(let i=this.impacts.length-1;i>=0;i--){
      const impact=this.impacts[i];if(advancing)impact.life-=dt;
      if(impact.life<=0){this.impacts.splice(i,1);continue;}
      add(this.impactImage,impact.x,impact.z,.22,.22,.8,true);
    }
    sprites.sort((a,b)=>b.depth-a.depth);
    const c=this.context,w=this.width;
    for(const sprite of sprites){
      const sw=sprite.width*this.projection/sprite.depth,sh=sprite.height*this.projection/sprite.depth;
      const left=w/2+sprite.side*this.projection/sprite.depth-sw/2;
      const top=this.horizon+(this.eye-sprite.bottom-sprite.height)*this.projection/sprite.depth;
      const begin=Math.max(0,Math.floor(left)),end=Math.min(w,Math.ceil(left+sw));
      if(end<=begin||top>this.height||top+sh<0)continue;
      c.globalCompositeOperation=sprite.additive?'lighter':'source-over';
      c.globalAlpha=1-clamp((sprite.depth-7)/32,0,.6);
      let run=-1;
      for(let x=begin;x<=end;x++){
        const visible=x<end&&sprite.depth<this.depth[x]+.015;
        if(visible&&run<0)run=x;
        if(!visible&&run>=0){
          const sourceStart=clamp((run-left)/sw*sprite.image.width,0,sprite.image.width);
          const sourceEnd=clamp((x-left)/sw*sprite.image.width,0,sprite.image.width);
          if(sourceEnd>sourceStart)c.drawImage(sprite.image,sourceStart,0,sourceEnd-sourceStart,sprite.image.height,run,top,x-run,sh);
          run=-1;
        }
      }
    }
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }

  drawEncounterCues(p){
    const cues=encounterCues(this.game.state),c=this.context;
    this.stats.encounterCues=cues.length;this.stats.drawnCuePoints=0;
    const dot=(x,z,y,color,width=.07)=>{
      const dx=x-p.x,dz=z-p.z,depth=dx*this.forwardX+dz*this.forwardZ;
      if(depth<.06||depth>VIEW_DEPTH)return;
      const sx=this.width/2+(dx*this.rightX+dz*this.rightZ)*this.projection/depth,index=Math.floor(sx);
      if(index<0||index>=this.width||depth>this.depth[index]+.04)return;
      const sy=this.horizon+(this.eye-y)*this.projection/depth,size=clamp(width*this.projection/depth,1,5);
      if(sy<0||sy>this.height)return;
      c.fillStyle=color;c.fillRect(Math.round(sx-size/2),Math.round(sy-size/2),Math.ceil(size),Math.ceil(size));this.stats.drawnCuePoints++;
    };
    const line=(ax,az,bx,bz,y,color,width)=>{const steps=clamp(Math.ceil(Math.hypot(ax-bx,az-bz)/.10),2,96);for(let i=0;i<=steps;i++)dot(ax+(bx-ax)*i/steps,az+(bz-az)*i/steps,y,color,width);};
    for(const cue of cues){
      if(!inEntityRange(cue,p,this.entityRange))continue;
      c.globalAlpha=cue.telegraph?.55+.4*cue.progress:.8*cue.progress;
      if(!['beam','arc','ricochet','shield-hit','heal-interrupt'].includes(cue.kind))for(let i=0;i<40;i++){const a=i/40*Math.PI*2;dot(cue.x+Math.cos(a)*cue.radius,cue.z+Math.sin(a)*cue.radius,.035,cue.color,.085);}
      if(cue.kind==='charge'){
        const dx=cue.x-cue.fromX,dz=cue.z-cue.fromZ,length=Math.max(.01,Math.hypot(dx,dz)),ox=dz/length*cue.radius*.8,oz=-dx/length*cue.radius*.8;
        for(const side of[-1,1])line(cue.fromX+ox*side,cue.fromZ+oz*side,cue.x+ox*side,cue.z+oz*side,.04,cue.color,.08);
      }else if(['beam','shot','ricochet'].includes(cue.kind)||cue.kind==='heal'&&!cue.telegraph)line(cue.fromX,cue.fromZ,cue.x,cue.z,.96,cue.color,cue.kind==='shot'?.025:.065);
      else if(cue.kind==='heal'&&cue.telegraph){for(let n=1;n<=8;n++){const t=n/9;dot(cue.fromX+(cue.x-cue.fromX)*t,cue.fromZ+(cue.z-cue.fromZ)*t,1.02,cue.color,.075);}}
      else if(cue.kind==='arc'){
        const dx=cue.x-cue.fromX,dz=cue.z-cue.fromZ,length=Math.max(.01,Math.hypot(dx,dz));
        const points=Array.from({length:5},(_,n)=>{const offset=n===0||n===4?0:(n%2?.10:-.10);return{x:cue.fromX+dx*n/4+dz/length*offset,z:cue.fromZ+dz*n/4-dx/length*offset};});
        for(let n=0;n<4;n++)line(points[n].x,points[n].z,points[n+1].x,points[n+1].z,1.02,cue.color,.055);
      }
    }
    c.globalAlpha=1;
  }

  drawDoorRemnants(p){
    const panels=[];
    for(const door of this.game.state.doors)if(door.open&&inEntityRange(door,p,this.entityRange)){
      panels.push({x:door.x,z:door.z,dx:door.axis==='z'?(p.x>door.x?-1:1):0,dz:door.axis==='z'?0:(p.z>door.z?-1:1),
        width:.98,height:WALL_HEIGHT,bottom:0,image:this.doorRemnants[doorStyleKey(door)]});
    }
    this.drawWallPanels(p,panels);
  }

  drawWallSigns(p){this.drawWallPanels(p,this.landmarkPanels);this.drawWallPanels(p,this.zoneSigns);this.drawWallPanels(p,this.destinationSigns);}

  drawWallPanels(p,panels){
    // A wall sign is a plane, not a billboard. Per-column perspective depth
    // prevents angled lettering from clipping into the wall behind it.
    const c=this.context,w=this.width;
    for(const sign of panels){
      if((p.x-sign.x)*-sign.dx+(p.z-sign.z)*-sign.dz<=0)continue;
      const tx=-sign.dz*sign.width/2,tz=sign.dx*sign.width/2;
      const ax=sign.x-tx-p.x,az=sign.z-tz-p.z,bx=sign.x+tx-p.x,bz=sign.z+tz-p.z;
      const da=ax*this.forwardX+az*this.forwardZ,db=bx*this.forwardX+bz*this.forwardZ;
      if(da<=.04||db<=.04||Math.min(da,db)>VIEW_DEPTH)continue;
      const left=w/2+(ax*this.rightX+az*this.rightZ)*this.projection/da;
      const right=w/2+(bx*this.rightX+bz*this.rightZ)*this.projection/db;
      if(right<=left)continue;
      for(let x=Math.max(0,Math.floor(left));x<Math.min(w,Math.ceil(right));x++){
        const t=clamp((x+.5-left)/(right-left),0,1),inverse=(1-t)/da+t/db,depth=1/inverse;
        if(depth>this.depth[x]+.015&&(!sign.doorId||this.depthDoorIds[x]!==sign.doorId))continue;
        const u=clamp(t/db/inverse,0,.9999),top=this.horizon+(this.eye-sign.bottom-sign.height)*this.projection/depth;
        c.drawImage(sign.image,Math.floor(u*sign.image.width),0,1,sign.image.height,x,top,1,sign.height*this.projection/depth);
      }
    }
  }

  dispose(){
    for(const texture of this.textures)texture.dispose();
    this.outputCanvas.remove();this.weaponCanvas.remove();this.canvas.style.opacity=this._oldOpacity;
  }
}

export class BreachRenderer {
  constructor(canvas,game,options={}){
    try{return new WebGLBreachRenderer(canvas,game,options);}
    catch(error){
      // Context creation fails before the WebGL renderer appends its overlay.
      // Canvas rendering remains fully playable, with no browser setting changes.
      return new SoftwareBreachRenderer(canvas,game,options);
    }
  }
}
