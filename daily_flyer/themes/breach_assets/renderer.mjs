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
const UPGRADE_COLORS = { cutter:'#f1a866', insulator:'#efcf63', phase:'#c5a1f2' };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const viewFov = (options, width, height) => {
  const requested = Number(options.fov);
  return Number.isFinite(requested) && requested > 0 ? clamp(requested, 60, 100) : width < height ? 78 : 68;
};
const missionVisuals = (level) => {
  const relay = level.missionId === 'relay-09' || String(level.id).startsWith('relay-09');
  const crosslink = level.missionId === 'crosslink-11' || String(level.id).startsWith('crosslink-11');
  const underworks = level.missionId === 'underworks-13' || String(level.id).startsWith('underworks-13');
  return {
    relay, crosslink, underworks,
    signCode: level.signCode || (underworks ? 'UW 13' : crosslink ? 'CROSSLINK 11' : relay ? 'RELAY 09' : 'BS 07'),
    doorCode: level.signCode || (underworks ? 'UNDERWORKS 13' : crosslink ? 'CROSSLINK 11' : relay ? 'DEAD RELAY 09' : 'BLACKSITE 07'),
    signColor: underworks ? '#d8c5a2' : crosslink ? '#e2c78c' : relay ? '#b6c5e6' : '#9fd8cf',
    fog: underworks ? 0x131917 : crosslink ? 0x101b19 : relay ? 0x0c1526 : 0x08131c,
    fogRgb: underworks ? [19,25,23] : crosslink ? [16, 27, 25] : relay ? [12, 21, 38] : [8, 19, 28],
  };
};
const exitReady = (state) => !!(state.power && state.player.key && (state.interactables || []).filter(i => i.type === 'relay').every(i => i.used));
const relayTitle = (item) => item.shortName || item.name || (/north/i.test(item.id) ? 'NORTH RELAY' : /south/i.test(item.id) ? 'SOUTH RELAY' : /east/i.test(item.id) ? 'EAST RELAY' : /west/i.test(item.id) ? 'WEST RELAY' : item.label?.replace(/^(synchronize|activate|align|restore)\s+/i, '').slice(0, 17) || 'RELAY NODE');
const zoneTitle = (zone,visuals) => visuals.underworks ? zone.shortName||zone.id?.replaceAll('-',' ')||zone.name : zone.name;
const localPlayerId = (state) => state.localPlayerId || state.player?.id;
const otherPlayers = (state) => Object.entries(state.players || {}).filter(([id, player]) => player && id !== localPlayerId(state) && player !== state.player && Number.isFinite(player.x) && Number.isFinite(player.z));
const localEvent = (event, state) => !event.playerId || !localPlayerId(state) || event.playerId === localPlayerId(state);
const doorKind = (door) => ['grille','hazard','phase','shortcut'].includes(door.kind) ? door.kind : ({cutter:'grille',insulator:'hazard',phase:'phase'}[door.requires] || door.requires || 'plain');
const explorationFeature = (item) => ['upgrade','refuge','transit'].includes(item.type);
const featureMode = (item,state) => item.type==='upgrade' ? Number(!!(item.used||state.upgrades?.[item.upgrade]))
  : item.type==='transit' ? item.used ? (state.interactables||[]).some(other=>other.id===item.destination&&other.used)?2:1 : 0
  : Number(!!item.used);
const inEntityRange = (entity,player,range) => Math.abs(entity.x-player.x)<=range && Math.abs(entity.z-player.z)<=range;

// Resolve authored sectors once. Rendering never searches zone rectangles per
// pixel or per wall; the largest map needs only a few kilobytes of cell indices.
function surfaceLayout(level,underworks=false){
  const names=underworks?Object.keys(SECTORS):['default'],indices=new Uint8Array(level.width*level.height);
  const hazards=new Uint8Array(indices.length),solid=(x,z)=>!level.grid[z]?.[x]||level.grid[z][x]==='#';
  if(underworks)for(let z=0;z<level.height;z++)for(let x=0;x<level.width;x++){
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

function makeTraversalDoorTexture(kind){
  const[canvas,c]=canvas2d(64,128),color=kind==='grille'?UPGRADE_COLORS.cutter:kind==='hazard'?UPGRADE_COLORS.insulator:kind==='phase'?UPGRADE_COLORS.phase:'#8edbc5';
  rect(c,0,0,64,128,'#131e24');rect(c,0,0,5,128,'#667875');rect(c,59,0,5,128,'#667875');
  rect(c,5,0,54,6,'#9fa993');rect(c,5,121,54,7,'#3c514f');
  if(kind==='grille'){
    for(let x=-48;x<100;x+=13){poly(c,[[x,6],[x+3,6],[x+64,121],[x+61,121]],'#688082');poly(c,[[x,121],[x+3,121],[x+64,6],[x+61,6]],'#35474e');}
    for(const y of[20,105]){rect(c,5,y,54,5,'#9a7957');rect(c,5,y,54,1,color);}
    for(const y of[14,35,86,107]){rect(c,4,y,7,8,color);rect(c,53,y,7,8,color);}
  }else if(kind==='hazard'){
    for(let y=18;y<120;y+=21){rect(c,6,y,52,3,'#d8b94f');rect(c,7,y+1,50,1,'#fff2a3');}
    for(const x of[10,46]){poly(c,[[x+6,9],[x,28],[x+6,28],[x+2,45],[x+13,23],[x+7,23]],color);}
    for(let x=5;x<59;x+=13)poly(c,[[x,110],[x+7,110],[x+14,120],[x+7,120]],color);
  }else if(kind==='phase'){
    rect(c,7,7,50,113,'#302844');
    for(let y=9;y<120;y+=7){rect(c,8,y,48,1,'#6a5592');rect(c,16+(y%3)*8,y+2,12,1,'#b0a0d3');}
    for(const y of[25,94]){poly(c,[[32,y-13],[47,y-6],[47,y+7],[32,y+14],[17,y+7],[17,y-6]],color);poly(c,[[32,y-9],[43,y-4],[43,y+5],[32,y+10],[21,y+5],[21,y-4]],'#302844');}
  }else{
    for(let y=9;y<120;y+=12){rect(c,6,y,52,9,'#3b5553');rect(c,6,y,52,1,'#83a497');}
    for(const y of[28,93])poly(c,[[18,y],[34,y],[34,y-7],[47,y+5],[34,y+17],[34,y+10],[18,y+10]],color);
  }
  rect(c,7,49,50,30,'#101c25');rect(c,8,49,48,2,color);rect(c,8,77,48,1,color);
  c.textAlign='center';c.fillStyle=color;c.font='bold 8px monospace';c.fillText(kind==='grille'?'CUTTER':kind==='hazard'?'HIGH VOLT':kind==='phase'?'PHASE':'SHORTCUT',32,62);
  c.font='6px monospace';c.fillText(kind==='grille'?'SEALED GRILLE':kind==='hazard'?'INSULATION':kind==='phase'?'FIELD BARRIER':'SERVICE LINK',32,72);
  return textureFrom(canvas);
}

function makeDoorTexture(kind, visuals = {}) {
  if(['grille','hazard','phase','shortcut'].includes(kind))return makeTraversalDoorTexture(kind);
  const [canvas,c] = canvas2d(64,128);
  rect(c,0,0,64,128,'#283339');
  for(let y=3;y<128;y+=16){
    rect(c,5,y,54,13,'#546062');
    rect(c,5,y,54,2,'#929789');
    rect(c,5,y+12,54,2,'#1a252c');
    rect(c,31,y,2,14,'#273940');
  }
  rect(c,0,0,4,128,'#15232a');
  rect(c,60,0,4,128,'#15232a');
  const color = kind === 'relays' ? '#b9a1ed' : kind === 'power' ? '#dd7840' : kind === 'key' ? '#54c6cb' : visuals.relay ? '#9db3db' : '#bca970';
  rect(c,7,50,50,26,'#111d25');
  rect(c,8,51,48,2,color);
  c.font='bold 8px monospace'; c.textAlign='center';c.fillStyle=color;
  c.fillText(kind==='relays'?'RELAY GATE':kind==='power'?'AUX POWER':kind==='key'?'SECURITY':'ACCESS',32,63);
  c.font='6px monospace';c.fillText(kind==='relays'?'SYNC BOTH NODES':kind==='key'?'KEY REQUIRED':visuals.doorCode||'BLACKSITE 07',32,71);
  if(kind==='relays'){rect(c,17,80,11,4,'#b9a1ed');rect(c,36,80,11,4,'#b9a1ed');}
  return textureFrom(canvas);
}

function makeStationTexture(item,mode){
  const[canvas,c]=canvas2d(112,160),type=item.type,installed=mode>0;
  const color=type==='upgrade'?UPGRADE_COLORS[item.upgrade]||'#e0c080':type==='refuge'?'#b2e3a2':mode===2?'#85ebda':mode===1?'#e6c181':'#819caf';
  rect(c,22,144,70,12,'#17282e');rect(c,25,139,64,6,'#758680');rect(c,31,88,52,51,'#30454a');rect(c,33,91,5,46,'#81928a');
  for(let y=113;y<135;y+=6){rect(c,42,y,33,2,'#172b33');rect(c,42,y+2,33,1,'#56696a');}
  rect(c,9,80,94,31,'#14262d');rect(c,10,80,92,3,color);rect(c,13,108,86,2,'#58706c');
  c.textAlign='center';c.font='bold 10px monospace';c.fillStyle=color;
  const title=type==='upgrade'?(item.upgrade==='phase'?'PHASE MODULE':item.upgrade==='insulator'?'INSULATOR':'THERMAL CUTTER'):type==='refuge'?'REFUGE':'TRANSIT LINK';
  c.fillText(title,56,94);c.font='6px monospace';c.fillStyle='#c5d6c8';
  c.fillText(type==='upgrade'?(installed?'MODULE INSTALLED':'USE TO INSTALL'):type==='refuge'?(installed?'VISITED / CHECKPOINT':'USE / CHECKPOINT'):mode===2?'LINKED / USE TO TRAVEL':mode===1?'FIND PAIRED STATION':'USE TO ACTIVATE',56,104);
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

function drawEnemy(type, frame) {
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

function makePickupTexture(type) {
  const [canvas,c]=canvas2d(64,64);
  if(type==='health'||type==='healthExpansion'){
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

function makeGlowTexture(color, core='#e8ffdb') {
  const [canvas,c]=canvas2d(32,32);
  c.fillStyle=color;c.globalAlpha=.13;c.fillRect(2,10,28,12);c.fillRect(10,2,12,28);
  c.globalAlpha=.3;c.fillRect(6,6,20,20);c.globalAlpha=.6;c.fillRect(10,7,12,18);
  c.globalAlpha=1;rect(c,11,11,10,10,core);rect(c,14,8,4,16,core);
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
    this.mode='webgl';this.isSoftware=false;
    this.textures=new Set();this.materials=new Set();this.geometries=new Set();
    this.enemyVisuals=new Map();this.pickupVisuals=new Map();this.doorVisuals=new Map();
    this.teammateVisuals=new Map();this.teammateFrames={};this.teammateFireAt=new Map();
    this.projectileVisuals=new Map();this.featureVisuals=new Map();this.impacts=[];
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
    this.scene.fog=new THREE.Fog(this.visuals.fog,5,23);
    this.camera=new THREE.PerspectiveCamera(68,1,.045,38);
    this.weaponCanvas=document.createElement('canvas');
    this.weaponCanvas.className='breach-weapon-canvas';
    this.weaponCanvas.setAttribute('aria-hidden','true');
    Object.assign(this.weaponCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'2',pointerEvents:'none',imageRendering:'pixelated'});
    canvas.parentElement.appendChild(this.weaponCanvas);
    this.weaponContext=this.weaponCanvas.getContext('2d');
    this.enemyFrames={};
    for(const type of ['runner','spitter','brute'])this.enemyFrames[type]=Array.from({length:7},(_,i)=>this.texture(drawEnemy(type,i)));
    this.pickupMaps={};
    for(const type of ['ammo','shells','health','armor','shotgun','key','healthExpansion'])this.pickupMaps[type]=this.texture(makePickupTexture(type));
    this.plasmaMap=this.texture(makeGlowTexture('#7fe8b1','#e6ffb5'));
    this.impactMap=this.texture(makeGlowTexture('#f8aa58','#fff0b0'));
    this.buildEnvironment();this.resize();
  }

  texture(texture){this.textures.add(texture);return texture;}
  material(material){this.materials.add(material);return material;}
  geometry(geometry){this.geometries.add(geometry);return geometry;}
  getTeammateFrames(id){
    const team=id==='p2'?'p2':'p1';
    if(!this.teammateFrames[team]){
      this.teammateFrames[team]=Object.fromEntries(['front','back','right','left'].map(direction=>[direction,Array.from({length:6},(_,frame)=>this.texture(drawTeammate(team,direction,frame)))]));
      if(this.stats.textureSourceBytes)this.stats.textureSourceBytes+=24*80*112*4;
    }
    return this.teammateFrames[team];
  }
  mesh(geometry,material,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);this.scene.add(mesh);return mesh;
  }
  solid(x,z){return this.game.level.grid[z]?.[x]==='#'||!this.game.level.grid[z]?.[x];}

  buildEnvironment(){
    const level=this.game.level,layout=this.layout,underworks=this.visuals.underworks;
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
      map:this.texture(underworks?makeSectorWallTexture(name):makeWallTexture(0,this.visuals.relay,this.visuals.crosslink)),
      color:underworks?0xd1d5c8:this.visuals.crosslink?0xc7cabc:this.visuals.relay?0xc3cedb:0xb5c4c1,
    })));
    for(const cells of batches(layout.walls,cell=>`${cell.chunk}:${cell.palette}`))install(wallGeometry,wallMaterials[cells[0].palette],cells,(cell,t)=>{t.position.set(cell.x,WALL_HEIGHT/2,cell.z);t.rotation.y=cell.rot;},true);

    if(underworks){
      for(const ceiling of[false,true]){
        const materials=layout.names.map(name=>this.material(new THREE.MeshBasicMaterial({map:this.texture(makeSectorFloorTexture(name,ceiling)),color:ceiling?0x9ca9a6:0xb4bdb0})));
        for(const runs of batches(layout.runs,run=>`${run.chunk}:${run.palette}`)){
          const mesh=this.mesh(this.geometry(horizontalGeometry(runs,ceiling?WALL_HEIGHT:0,ceiling)),materials[runs[0].palette]);this.staticBatches.push(mesh);
        }
      }
      const hazardMaterials={flood:this.material(new THREE.MeshBasicMaterial({map:this.texture(makeHazardTexture('flood')),color:0xc0d7ca})),conduit:this.material(new THREE.MeshBasicMaterial({map:this.texture(makeHazardTexture('conduit')),color:0xc5d1bf}))};
      for(const area of level.hazards||[]){
        const mesh=this.mesh(this.geometry(horizontalGeometry([{x1:area.x1,x2:area.x2,z:area.z1,z2:area.z2}],.012)),hazardMaterials[area.type]||hazardMaterials.conduit);this.staticBatches.push(mesh);
      }
    }else{
      const floorMap=this.texture(makeFloorTexture(false,this.visuals.relay,this.visuals.crosslink));floorMap.repeat.set(level.width/2,level.height/2);
      const floor=this.mesh(this.geometry(new THREE.PlaneGeometry(level.width,level.height)),this.material(new THREE.MeshBasicMaterial({map:floorMap,color:this.visuals.crosslink?0xb2baa0:this.visuals.relay?0x9eacbd:0x919d94})),level.width/2,0,level.height/2);floor.rotation.x=-Math.PI/2;
      const ceilingMap=this.texture(makeFloorTexture(true,this.visuals.relay,this.visuals.crosslink));ceilingMap.repeat.set(level.width/2,level.height/2);
      const ceiling=this.mesh(this.geometry(new THREE.PlaneGeometry(level.width,level.height)),this.material(new THREE.MeshBasicMaterial({map:ceilingMap,color:0x68787f})),level.width/2,WALL_HEIGHT,level.height/2);ceiling.rotation.x=Math.PI/2;
      this.staticBatches.push(floor,ceiling);
    }
    const lightGeometry=this.geometry(new THREE.BoxGeometry(.62,.065,.045));
    const lightMaterials=layout.names.map(name=>[this.material(new THREE.MeshBasicMaterial({color:underworks?SECTORS[name].light:this.visuals.crosslink?0x7be1c5:this.visuals.relay?0xb4c8eb:0x8bd6ce})),this.material(new THREE.MeshBasicMaterial({color:0xea9752}))]);
    for(const cells of batches(layout.lights,cell=>`${cell.chunk}:${cell.palette}:${cell.warm}`))install(lightGeometry,lightMaterials[cells[0].palette][Number(cells[0].warm)],cells,(cell,t)=>{t.position.set(cell.x,2.12,cell.z);t.rotation.y=cell.rot;});
    const beamGeometry=this.geometry(new THREE.BoxGeometry(1,.13,.16));
    const beamMaterials=layout.names.map(name=>this.material(new THREE.MeshBasicMaterial({color:underworks?SECTORS[name].dark:0x293b44})));
    for(const cells of batches(layout.rails,cell=>`${cell.chunk}:${cell.palette}`))install(beamGeometry,beamMaterials[cells[0].palette],cells,(cell,t)=>{t.position.set(cell.x,2.35,cell.z);t.scale.set(cell.width,1,1);});

    // Door artwork and geometry are shared by kind, even across dozens of gates.
    const doorMaterials=new Map(),doorGeometry={x:this.geometry(new THREE.BoxGeometry(.98,WALL_HEIGHT,.14)),z:this.geometry(new THREE.BoxGeometry(.14,WALL_HEIGHT,.98))};
    for(const door of this.game.state.doors){
      const kind=doorKind(door);
      if(!doorMaterials.has(kind))doorMaterials.set(kind,this.material(new THREE.MeshBasicMaterial({map:this.texture(makeDoorTexture(kind,this.visuals)),color:0xc4cec0})));
      const mesh=this.mesh(doorGeometry[door.axis]||doorGeometry.x,doorMaterials.get(kind),door.x,WALL_HEIGHT/2,door.z);
      this.doorVisuals.set(door.id,{mesh,amount:door.open?1:0});
    }
    for(const [index,zone]of (level.zones||[]).entries())this.addZoneSign(zone,index);
    for(const item of this.game.state.interactables||[])this.addFeature(item);
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
    const map=this.texture(makeSign(zoneTitle(zone,this.visuals),`${this.visuals.signCode} / SECTOR ${String(index+1).padStart(2,'0')}`,this.visuals.underworks?SECTORS[zone.palette]?.accent||this.visuals.signColor:this.visuals.signColor));
    const sign=this.mesh(this.geometry(new THREE.PlaneGeometry(this.visuals.underworks?1.15:.88,this.visuals.underworks?.36:.275)),this.material(new THREE.MeshBasicMaterial({map})),candidate.x,1.83,candidate.z);
    sign.rotation.y=candidate.rotation;
  }

  addFeature(item){
    if(explorationFeature(item)){
      const key=`${item.type}:${item.upgrade||''}`;
      if(!this.stationMaps.has(key))this.stationMaps.set(key,Array.from({length:item.type==='transit'?3:2},(_,mode)=>this.texture(makeStationTexture(item,mode))));
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
    const title=isRelay?relayTitle(item):item.type==='power'?(this.visuals.underworks?'CORE POWER':this.visuals.crosslink?'LINK POWER':this.visuals.relay?'RING POWER':'AUX POWER'):'EXTRACTION';
    const maps={
      off:this.texture(makeSign(title,isRelay?'NODE OFFLINE / SYNCHRONIZE':item.type==='power'?'RESTORE GRID':'CLEARANCE REQUIRED',isRelay?'#b9a1ed':item.type==='power'?'#ecc477':'#81d9c7')),
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
        if(localEvent(event,this.game.state)){this.flash=.075;this.recoil=event.weapon==='shotgun'?1:.58;}
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
    this.camera.position.set(p.x,EYE_HEIGHT+bob,p.z);this.camera.rotation.set(0,-angle,0);
    if(state.status==='dead'||p.alive===false||p.health<=0)this.camera.position.y=.65;
    this.updateEntities(dt,advancing);
    this.renderer.render(this.scene,this.camera);
    this.stats.drawCalls=this.renderer.info.render.calls;this.stats.drawTriangles=this.renderer.info.render.triangles;
    this.drawWeapon();
  }

  updateEntities(dt,advancing){
    const state=this.game.state;
    this.updateTeammates(dt,advancing);
    for(const enemy of state.enemies){
      let visual=this.enemyVisuals.get(enemy.id);
      if(!inEntityRange(enemy,state.player,this.entityRange)){if(visual){visual.sprite.visible=false;visual.shadow.visible=false;}continue;}
      if(!visual){
        const material=this.material(new THREE.SpriteMaterial({map:(this.enemyFrames[enemy.type]||this.enemyFrames.runner)[0],transparent:true,alphaTest:.25,depthWrite:true}));
        const sprite=new THREE.Sprite(material);sprite.center.set(.5,0);this.scene.add(sprite);
        if(!this.enemyShadowGeometry){this.enemyShadowGeometry=this.geometry(new THREE.CircleGeometry(.27,12));this.enemyShadowMaterial=this.material(new THREE.MeshBasicMaterial({color:0x050b10,transparent:true,opacity:.45,depthWrite:false}));}
        const shadow=new THREE.Mesh(this.enemyShadowGeometry,this.enemyShadowMaterial);
        shadow.rotation.x=-Math.PI/2;this.scene.add(shadow);
        visual={sprite,shadow,x:enemy.x,z:enemy.z,phase:hash(enemy.x,enemy.z)*5};this.enemyVisuals.set(enemy.id,visual);
      }
      visual.sprite.visible=true;visual.shadow.visible=true;
      const dead=enemy.alive===false||enemy.health<=0;
      const speed=Math.hypot(enemy.x-visual.x,enemy.z-visual.z)/Math.max(dt,.001);
      visual.x=enemy.x;visual.z=enemy.z;
      if(advancing)visual.phase+=dt*(speed>.05?8:2);
      let frame=speed>.05?Math.floor(visual.phase)%4:0;
      const close=Math.hypot(enemy.x-state.player.x,enemy.z-state.player.z)<1.7;
      if(close&&enemy.active!==false&&Math.sin(this.clock*5+enemy.x)>.4)frame=4;
      if(enemy.type==='spitter'&&enemy.attackCooldown>.8&&Math.sin(this.clock*5)>.5)frame=4;
      if(enemy.hitTimer>0||this.clock-(this.hitAt.get(enemy.id)??-99)<.14)frame=5;
      if(dead)frame=6;
      const maps=this.enemyFrames[enemy.type]||this.enemyFrames.runner;
      visual.sprite.material.map=maps[frame];
      const height=enemy.type==='brute'?1.93:enemy.type==='spitter'?1.69:1.59;
      visual.sprite.position.set(enemy.x,.015,enemy.z);visual.sprite.scale.set(height*80/112,height,1);
      visual.shadow.position.set(enemy.x,.008,enemy.z);
      visual.shadow.scale.setScalar(enemy.type==='brute'?1.3:1);
      visual.sprite.material.color.setHex(dead?0x9aa6a5:0xffffff);
    }
    for(const pickup of state.pickups){
      let sprite=this.pickupVisuals.get(pickup.id);
      if(pickup.collected||!inEntityRange(pickup,state.player,this.entityRange)){if(sprite)sprite.visible=false;continue;}
      if(!sprite){
        sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.pickupMaps[pickup.type]||this.pickupMaps.ammo,transparent:true,alphaTest:.25})));
        sprite.scale.setScalar(pickup.type==='shotgun'?.78:pickup.type==='healthExpansion'?.7:.56);this.scene.add(sprite);this.pickupVisuals.set(pickup.id,sprite);
      }
      sprite.visible=!pickup.collected;
      sprite.position.set(pickup.x,.35+(this.options.reducedMotion?0:Math.sin(this.clock*2.4+pickup.x)*.035),pickup.z);
    }
    for(const door of state.doors){
      const visual=this.doorVisuals.get(door.id);if(!visual)continue;
      const target=door.open?1:0;
      visual.amount+=clamp(target-visual.amount,-dt*1.7,dt*1.7);
      visual.mesh.position.y=WALL_HEIGHT/2+visual.amount*2.7;
      visual.mesh.visible=visual.amount<.99&&inEntityRange(door,state.player,this.entityRange);
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
    const projectileIds=new Set();
    for(const projectile of state.projectiles||[]){
      projectileIds.add(projectile.id);
      let sprite=this.projectileVisuals.get(projectile.id);
      if(!sprite){sprite=new THREE.Sprite(this.material(new THREE.SpriteMaterial({map:this.plasmaMap,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})));sprite.scale.setScalar(.22);this.scene.add(sprite);this.projectileVisuals.set(projectile.id,sprite);}
      sprite.position.set(projectile.x,projectile.y??1.02,projectile.z);
      sprite.visible=inEntityRange(projectile,state.player,this.entityRange);
    }
    for(const[id,sprite]of this.projectileVisuals)if(!projectileIds.has(id)){this.scene.remove(sprite);this.projectileVisuals.delete(id);this.materials.delete(sprite.material);sprite.material.dispose();}
    for(let i=this.impacts.length-1;i>=0;i--){
      const impact=this.impacts[i];if(advancing)impact.life-=dt;
      impact.sprite.material.opacity=Math.max(0,impact.life/.13);
      if(impact.life<=0){this.scene.remove(impact.sprite);this.materials.delete(impact.sprite.material);impact.sprite.material.dispose();this.impacts.splice(i,1);}
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
      visual.sprite.material.map=frames[pose.direction][pose.frame];
      visual.sprite.position.set(player.x,.015,player.z);visual.sprite.scale.set(1.74*80/112,1.74,1);
      // Co-op allows walking through each other. Hide a body once inside the
      // camera, avoiding a full-screen sprite while two players cross paths.
      visual.sprite.visible=Math.hypot(player.x-p.x,player.z-p.z)>.32;
      visual.shadow.position.set(player.x,.008,player.z);visual.shadow.visible=visual.sprite.visible;
    }
    for(const[id,visual]of this.teammateVisuals)if(!present.has(id)){
      this.scene.remove(visual.sprite,visual.shadow);this.materials.delete(visual.sprite.material);visual.sprite.material.dispose();
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
    if(p.weapon==='shotgun'){
      poly(c,[[-27,0],[-27,-55],[-18,-110],[-15,-144],[15,-144],[19,-110],[30,-55],[30,0]],'#17242d');
      poly(c,[[-21,-57],[-14,-139],[-2,-142],[-3,-57]],'#7c8c8a');
      poly(c,[[3,-57],[3,-141],[13,-138],[22,-57]],'#52676c');
      rect(c,-14,-142,27,5,'#b6bca5');rect(c,-10,-145,4,6,'#1a3038');rect(c,7,-145,4,6,'#1a3038');
      rect(c,-2,-135,4,78,'#243b43');
      poly(c,[[-27,-54],[-21,-83],[21,-83],[28,-54]],'#8c6442');
      for(let y=-78;y<-50;y+=6){rect(c,-22,y,45,2,'#3a3630');rect(c,-20,y+2,41,1,'#b58b54');}
      rect(c,-21,-49,44,40,'#4d6264');rect(c,-16,-46,7,37,'#879791');rect(c,13,-46,8,38,'#283c45');
      rect(c,-8,-34,17,23,'#172a34');rect(c,-5,-30,11,2,'#a9b6a4');
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
    if(this.flash>0){
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
    this.layout=surfaceLayout(game.level,this.visuals.underworks);this.stats={...this.layout.stats,viewDepth:VIEW_DEPTH,maxRaySteps:160};
    this.mode='software';this.isSoftware=true;this.clock=0;this.recoil=0;this.flash=0;
    this.bobPhase=0;this.moveAmount=0;this.weaponSwap=0;this.lastWeapon=game.state.player.weapon;
    this.lastX=game.state.player.x;this.lastZ=game.state.player.z;this.hitAt=new Map();this.impacts=[];
    this.teammateMotion=new Map();this.teammateFrames={};this.teammateFireAt=new Map();
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
    this.wallImages=this.layout.names.map(name=>image(this.visuals.underworks?makeSectorWallTexture(name):makeWallTexture(0,this.visuals.relay,this.visuals.crosslink)));
    this.floorPixelsByPalette=this.layout.names.map(name=>image(this.visuals.underworks?makeSectorFloorTexture(name):makeFloorTexture(false,this.visuals.relay,this.visuals.crosslink)).getContext('2d').getImageData(0,0,64,64).data);
    this.ceilingPixelsByPalette=this.layout.names.map(name=>image(this.visuals.underworks?makeSectorFloorTexture(name,true):makeFloorTexture(true,this.visuals.relay,this.visuals.crosslink)).getContext('2d').getImageData(0,0,64,64).data);
    this.hazardPixels=this.visuals.underworks?[null,...['flood','conduit'].map(type=>image(makeHazardTexture(type)).getContext('2d').getImageData(0,0,64,64).data)]:[null];
    this.doorImages={};for(const kind of new Set(['plain',...game.state.doors.map(doorKind)]))this.doorImages[kind]=image(makeDoorTexture(kind,this.visuals));
    this.doorCells=new Array(game.level.width*game.level.height).fill(null);
    this.enemyFrames={};for(const type of ['runner','spitter','brute'])this.enemyFrames[type]=Array.from({length:7},(_,i)=>image(drawEnemy(type,i)));
    this.pickupImages={};for(const type of ['ammo','shells','health','armor','shotgun','key','healthExpansion'])this.pickupImages[type]=image(makePickupTexture(type));
    this.plasmaImage=image(makeGlowTexture('#7fe8b1','#e6ffb5'));
    this.impactImage=image(makeGlowTexture('#f8aa58','#fff0b0'));
    this.powerImages={off:this.featureImage('power',false),on:this.featureImage('power',true)};
    this.exitImages={off:this.featureImage('exit',false),on:this.featureImage('exit',true)};
    this.relayImages=new Map((game.state.interactables||[]).filter(item=>item.type==='relay').map(item=>[item.id,{off:this.featureImage('relay',false,relayTitle(item)),on:this.featureImage('relay',true,relayTitle(item))}]));
    this.stationImages=new Map();for(const item of game.state.interactables||[])if(explorationFeature(item)){
      const key=`${item.type}:${item.upgrade||''}`;
      if(!this.stationImages.has(key))this.stationImages.set(key,Array.from({length:item.type==='transit'?3:2},(_,mode)=>image(makeStationTexture(item,mode))));
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
      if(best)this.zoneSigns.push({...best,width:this.visuals.underworks?1.15:.88,height:this.visuals.underworks?.36:.275,bottom:this.visuals.underworks?1.65:1.69,image:image(makeSign(zoneTitle(zone,this.visuals),`${this.visuals.signCode} / SECTOR ${String(index+1).padStart(2,'0')}`,this.visuals.underworks?SECTORS[zone.palette]?.accent||this.visuals.signColor:this.visuals.signColor))});
    }
    this.stats.textureSourceBytes=this.textures.reduce((sum,texture)=>sum+(texture.image?.width||0)*(texture.image?.height||0)*4,0);
    this.stats.textureSourceBytes+=(4+2*this.relayImages.size)*96*128*4;
    this.stats.textureReadbackBytes=[...this.floorPixelsByPalette,...this.ceilingPixelsByPalette,...this.hazardPixels.filter(Boolean)].reduce((sum,pixels)=>sum+pixels.byteLength,0);
    this.stats.cellLookupBytes=this.layout.indices.byteLength+this.layout.hazards.byteLength;
    for(const key of['walls','lights','runs','rails'])delete this.layout[key];
    this.enemyMotion=new Map();this.resize();
  }

  solid(x,z){return this.game.level.grid[z]?.[x]==='#'||!this.game.level.grid[z]?.[x];}

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

  featureImage(type,on,title=null){
    const [canvas,c]=canvas2d(96,128);
    const color=on?'#8bd7b4':type==='relay'?'#b9a1ed':type==='power'?'#e1b26b':'#6b9791';
    rect(c,31,68,35,60,'#293c45');rect(c,33,69,5,59,'#6a7e7b');
    rect(c,39,80,21,3,'#182c36');rect(c,39,87,21,3,'#182c36');rect(c,39,94,21,3,'#182c36');
    rect(c,8,37,80,34,'#101f28');rect(c,8,37,80,3,color);rect(c,12,41,72,2,'#354d54');
    c.font='bold 9px monospace';c.fillStyle=color;c.textAlign='center';c.fillText((title||(type==='power'?(this.visuals.underworks?'CORE POWER':this.visuals.crosslink?'LINK POWER':this.visuals.relay?'RING POWER':'AUX POWER'):'EXTRACTION')).slice(0,13),48,54);
    c.font='6px monospace';c.fillStyle='#b5c3b4';c.fillText(on?(type==='relay'?'SYNCHRONIZED':'SYSTEM ONLINE'):type==='relay'?'NODE OFFLINE':type==='power'?'RESTORE GRID':'CLEARANCE REQUIRED',48,65);
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
      this.depth=new Float32Array(w);this.floorBuffer=this.context.createImageData(w,h);
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
        if(localEvent(event,this.game.state)){this.flash=.075;this.recoil=event.weapon==='shotgun'?1:.58;}
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
    this.eye=(state.status==='dead'||p.alive===false||p.health<=0)? .65:EYE_HEIGHT;
    this.horizon=Math.round(this.height/2+(this.options.reducedMotion||state.status!=='playing'?0:Math.sin(this.bobPhase)*this.moveAmount*1.2));
    this.drawPlanes(p);this.drawWalls(p);this.drawWallSigns(p);this.drawSprites(dt,advancing,p);
    WebGLBreachRenderer.prototype.drawWeapon.call(this);
  }

  drawPlanes(p){
    const data=this.floorBuffer.data,w=this.width,h=this.height;
    const level=this.game.level,sectorCells=this.layout.indices,hazardCells=this.layout.hazards,underworks=this.visuals.underworks;
    const [fogR,fogG,fogB]=this.visuals.fogRgb;
    const lx=this.forwardX-this.rightX*this.planeLength,lz=this.forwardZ-this.rightZ*this.planeLength;
    const stepDirectionX=2*this.rightX*this.planeLength/w,stepDirectionZ=2*this.rightZ*this.planeLength/w;
    for(let y=0;y<h;y++){
      const isFloor=y>=this.horizon;
      const screenDistance=Math.abs(y-this.horizon)+.5;
      const distance=(isFloor?this.eye:WALL_HEIGHT-this.eye)*this.projection/screenDistance;
      const textures=isFloor?this.floorPixelsByPalette:this.ceilingPixelsByPalette,baseTexture=textures[0];
      const shade=(isFloor?.96:.78)*(1-clamp(distance/27,0,.88));
      const fog=clamp(distance/27,0,.88);
      const stepX=distance*stepDirectionX,stepZ=distance*stepDirectionZ;
      let worldX=p.x+distance*lx,worldZ=p.z+distance*lz;
      let offset=y*w*4;
      for(let x=0;x<w;x++){
        const tx=Math.floor(worldX*32)&63,tz=Math.floor(worldZ*32)&63,index=(tz*64+tx)*4;
        const cell=underworks&&worldX>=0&&worldZ>=0&&worldX<level.width&&worldZ<level.height?Math.floor(worldZ)*level.width+Math.floor(worldX):-1;
        const texture=cell<0?baseTexture:isFloor&&hazardCells[cell]?this.hazardPixels[hazardCells[cell]]:textures[sectorCells[cell]];
        data[offset]=texture[index]*shade+fogR*fog;
        data[offset+1]=texture[index+1]*shade+fogG*fog;
        data[offset+2]=texture[index+2]*shade+fogB*fog;
        offset+=4;worldX+=stepX;worldZ+=stepZ;
      }
    }
    this.context.putImageData(this.floorBuffer,0,0);
  }

  drawWalls(p){
    const c=this.context,w=this.width,h=this.height,level=this.game.level;
    const fogRgb=this.visuals.fogRgb.join(',');
    const closed=this.doorCells;closed.fill(null);
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
      if(!hit){this.depth[column]=VIEW_DEPTH;continue;}
      distance=Math.max(.035,distance);this.depth[column]=distance;
      const wallHeight=WALL_HEIGHT*this.projection/distance;
      const top=this.horizon-(WALL_HEIGHT-this.eye)*this.projection/distance;
      let wallX=side===0?p.z+distance*rayZ:p.x+distance*rayX;wallX-=Math.floor(wallX);
      const sector=this.layout.paletteAt(mapX-(side===0?stepX:0),mapZ-(side===1?stepZ:0));
      const texture=door?this.doorImages[doorKind(door)]||this.doorImages.plain:this.wallImages[sector];
      let texX=Math.floor(wallX*texture.width);
      // U must increase from screen-left to screen-right. Our camera's right
      // vector is (cos(angle), sin(angle)): west/south faces need the reversal,
      // while north/east faces already run in the readable direction.
      if(side===0&&rayX<0||side===1&&rayZ>0)texX=texture.width-texX-1;
      c.drawImage(texture,texX,0,1,texture.height,column,top,1,wallHeight);
      const shade=clamp(.10+(side===0?.10:0)+distance/30,0,.91);
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
      if(Math.hypot(player.x-p.x,player.z-p.z)>.32)add(this.getTeammateFrames(id)[pose.direction][pose.frame],player.x,player.z,1.74*80/112,1.74,.015);
    }
    for(const id of this.teammateMotion.keys())if(!present.has(id)){this.teammateMotion.delete(id);this.teammateFireAt.delete(id);}
    for(const enemy of state.enemies){
      if(!inEntityRange(enemy,p,this.entityRange))continue;
      let motion=this.enemyMotion.get(enemy.id);
      if(!motion){motion={x:enemy.x,z:enemy.z,phase:hash(enemy.x,enemy.z)*5};this.enemyMotion.set(enemy.id,motion);}
      const speed=Math.hypot(enemy.x-motion.x,enemy.z-motion.z)/Math.max(.001,dt);motion.x=enemy.x;motion.z=enemy.z;
      if(advancing)motion.phase+=dt*(speed>.05?8:2);
      let frame=speed>.05?Math.floor(motion.phase)%4:0;
      const close=Math.hypot(enemy.x-p.x,enemy.z-p.z)<1.7;
      if(close&&enemy.active!==false&&Math.sin(this.clock*5+enemy.x)>.4)frame=4;
      if(enemy.type==='spitter'&&enemy.attackCooldown>.8&&Math.sin(this.clock*5)>.5)frame=4;
      if(enemy.hitTimer>0||this.clock-(this.hitAt.get(enemy.id)??-99)<.14)frame=5;
      if(enemy.alive===false||enemy.health<=0)frame=6;
      const height=enemy.type==='brute'?1.93:enemy.type==='spitter'?1.69:1.59;
      add((this.enemyFrames[enemy.type]||this.enemyFrames.runner)[frame],enemy.x,enemy.z,height*80/112,height,.015);
    }
    for(const pickup of state.pickups)if(!pickup.collected){
      const size=pickup.type==='shotgun'?.78:pickup.type==='healthExpansion'?.7:.56;
      const bob=this.options.reducedMotion?0:Math.sin(this.clock*2.4+pickup.x)*.035;
      add(this.pickupImages[pickup.type]||this.pickupImages.ammo,pickup.x,pickup.z,size,size,.35-size/2+bob);
    }
    for(const feature of state.interactables||[]){
      if(explorationFeature(feature)){
        const frames=this.stationImages.get(`${feature.type}:${feature.upgrade||''}`);
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
    for(const projectile of state.projectiles||[])add(this.plasmaImage,projectile.x,projectile.z,.22,.22,(projectile.y??1.02)-.11,true);
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

  drawWallSigns(p){
    // A wall sign is a plane, not a billboard. Per-column perspective depth
    // prevents angled lettering from clipping into the wall behind it.
    const c=this.context,w=this.width;
    for(const sign of this.zoneSigns){
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
        if(depth>this.depth[x]+.015)continue;
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
