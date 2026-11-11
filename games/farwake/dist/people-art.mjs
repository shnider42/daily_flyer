/** Opaque pixel silhouettes for the galaxy's nonhuman people. No game state is changed here. */
import { pixelRect as pixel, pixelLine } from './pixel-art.mjs';
import { facingAngle } from './combat.mjs';
import { normalizeSpecies } from './species.mjs';

const hash = input => { let h = 2166136261; for (const c of String(input)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const PALETTES = Object.freeze({
  choral: [['#a9cfc9','#658c8b','#d5e1c9','#eff1bd'],['#b8cbb3','#718e82','#dbe1c4','#eff1bd'],['#a4c1d0','#627e9b','#cbdce4','#eff1bd']],
  vaeli: [['#7db9b3','#3f747e','#c1dfcf','#e7d79a'],['#8eb2c7','#526f91','#c8dbe8','#f0dca6'],['#90b3a3','#547b70','#d3dfbb','#e8d99e']],
  keth: [['#b6a590','#6c6464','#e0cfad','#f1d09b'],['#b19baf','#705b75','#dbc4cc','#f1d09b'],['#9ca6a0','#526e6a','#cfd5bb','#f1d09b']],
  oru: [['#baa8cc','#78628e','#e0d1df','#e5e0b5'],['#b6b6cd','#6a769a','#dbdfeb','#e5e0b5'],['#c2b5a7','#867764','#e4dcca','#e5e0b5']]
});
const shapeOf = species => species === 'keth' ? { half:10, top:-25, face:-19 } : species === 'vaeli' ? { half:7, top:-29, face:-22 } : species === 'oru' ? { half:6, top:-32, face:-25 } : { half:10, top:-31, face:-26 };

function equipment(ctx, options, pose) {
  const { color, skin, bob, angle, time, equipped, armed, species } = pose;
  if (options.helmet || options.team === 'hostile') {
    const { half, top, face } = shapeOf(species);
    pixel(ctx,'#253b46',-half,top+bob,half*2,3);
    pixel(ctx,'#253b46',-half,top+bob,2,face-top+5);
    pixel(ctx,'#253b46',half-2,top+bob,2,face-top+5);
    pixel(ctx,options.team==='hostile'?'#d9a07b':'#91c8ce',-half+2,face+bob,half*2-4,3);
    pixel(ctx,'#152e3b',-half+2,face+3+bob,half*2-4,2);
    pixel(ctx,color,-8,-14+bob,3,5);pixel(ctx,color,5,-14+bob,3,5);
  }
  if (armed) {
    const dx=Math.cos(angle),dy=Math.sin(angle),gx=dx*7,gy=-11+dy*7,mx=dx*19,my=-11+dy*19;
    pixelLine(ctx,gx,gy,mx,my,'#0b1d29',5);pixelLine(ctx,gx,gy,mx,my,'#b7cbcb',3);pixelLine(ctx,gx-dy*2,gy+dx*2,gx-dy*5,gy+dx*5,'#38505c',3);
    pixel(ctx,skin,gx-2,gy-2,3,3);pixel(ctx,options.team==='hostile'?'#eea58b':'#91e4df',dx*12-1,-12+dy*12,2,2);
    if(options.firing||(options.attackUntil||0)>time){pixel(ctx,'#fff1c6',mx+dx*3-2,my+dy*3-2,5,5);pixel(ctx,'#f2bc75',mx+dx*7-1,my+dy*7-1,3,3);}
  } else if (equipped) {
    pixel(ctx,'#102534',6,-10,5,9);pixel(ctx,'#b1c8c5',7,-10,3,5);pixel(ctx,'#83d5d0',7,-9,2,2);
  }
  if(options.carried){pixel(ctx,'#785d43',-9,-10,18,11);pixel(ctx,'#c2a572',-8,-10,16,3);pixel(ctx,'#e8d39c',-1,-8,2,9);}
}

function eyes(ctx, pose, y, separation=3) {
  const { facing, shade, eye, asleep } = pose;
  if(facing==='up'&&!asleep)return;
  const offsets=asleep||facing==='down'?[-separation,separation]:[facing==='left'?-separation-1:separation];
  for(const x of offsets){pixel(ctx,shade,x-1,y-1,4,4);pixel(ctx,asleep?shade:eye,x,y,2,asleep?1:2);}
}

function head(ctx, pose) {
  const { species, skin, shade, light, bob:b, facing, asleep } = pose;
  if(species==='vaeli') {
    // A fan of fins stays wider than the narrow neck, even in side view.
    pixel(ctx,shade,-11,-27+b,4,7);pixel(ctx,skin,-9,-30+b,4,12);pixel(ctx,light,-10,-29+b,2,6);
    pixel(ctx,shade,7,-27+b,4,7);pixel(ctx,skin,5,-30+b,4,12);pixel(ctx,light,8,-29+b,2,6);
    pixel(ctx,shade,-6,-29+b,12,12);pixel(ctx,skin,-5,-28+b,10,12);pixel(ctx,light,-3,-29+b,6,3);
    if(facing==='up'){pixel(ctx,shade,-1,-25+b,2,8);pixel(ctx,light,-4,-26+b,2,6);}
    else {eyes(ctx,pose,-23+b,3);pixel(ctx,shade,-2,-17+b,4,1);for(const side of[-1,1]){pixel(ctx,shade,side*5-1,-20+b,2,1);pixel(ctx,shade,side*5-1,-18+b,2,1);}}
  } else if(species==='keth') {
    // Low plated brow and short antennae; the head is broader than a human torso.
    pixel(ctx,shade,-7,-31+b,2,8);pixel(ctx,shade,5,-31+b,2,8);pixel(ctx,light,-8,-31+b,3,2);pixel(ctx,light,5,-31+b,3,2);
    pixel(ctx,shade,-11,-24+b,22,10);pixel(ctx,skin,-10,-25+b,20,10);pixel(ctx,light,-8,-25+b,16,3);
    pixel(ctx,shade,-1,-24+b,2,10);pixel(ctx,light,-9,-20+b,3,4);pixel(ctx,light,6,-20+b,3,4);
    if(facing==='up') {pixel(ctx,shade,-8,-21+b,16,2);pixel(ctx,light,-3,-22+b,6,4);}
    else {eyes(ctx,pose,-20+b,5);pixel(ctx,shade,-3,-15+b,6,1);}
  } else if(species==='oru') {
    // Tall paired sensory folds frame a small face. They are not hair or a hat.
    pixel(ctx,shade,-8,-35+b,3,16);pixel(ctx,light,-8,-36+b,2,13);pixel(ctx,skin,-6,-32+b,3,13);
    pixel(ctx,shade,5,-35+b,3,16);pixel(ctx,light,6,-36+b,2,13);pixel(ctx,skin,3,-32+b,3,13);
    pixel(ctx,shade,-4,-31+b,8,15);pixel(ctx,skin,-3,-32+b,6,17);pixel(ctx,light,-2,-31+b,4,3);
    if(facing==='up'){pixel(ctx,shade,-1,-28+b,2,11);pixel(ctx,light,-3,-20+b,6,2);}
    else {eyes(ctx,pose,-25+b,2);if(!asleep){pixel(ctx,shade,-1,-20+b,2,3);pixel(ctx,light,-1,-16+b,2,1);}}
  }
}

function drawChoral(ctx, pose) {
  const {skin:color, shade, light, eye, bob:b, facing, step, asleep}=pose;
  if(asleep){pixel(ctx,'#2c4249',-11,-27,22,29);pixel(ctx,'#b1c5b4',-8,-25,16,7);pixel(ctx,color,-9,-21,18,14);pixel(ctx,light,-6,-24,12,5);pixel(ctx,'#3d646c',-8,-14,16,14);pixel(ctx,color,-7,-13,14,11);for(const x of[-5,0,5])pixel(ctx,shade,x,-20,2,1);return;}
  for(const[leg,s]of[[-9,-step],[-4,step],[3,-step],[8,step]]){pixel(ctx,shade,leg,-9,2,8+s);pixel(ctx,'#bfccbc',leg-1,-2+s,4,2);}
  pixel(ctx,'#294d59',-6,-19+b,12,12);pixel(ctx,color,-4,-20+b,8,12);pixel(ctx,'#ceddc9',-1,-22+b,2,15);
  pixel(ctx,'#83aaa6',-9,-18+b,3,10);pixel(ctx,'#83aaa6',7,-18+b,3,10);pixel(ctx,color,-12,-12+b,4,3);pixel(ctx,color,9,-12+b,4,3);
  pixel(ctx,'#759ca4',-7,-31+b,14,11);pixel(ctx,color,-10,-29+b,20,7);pixel(ctx,light,-7,-31+b,14,3);pixel(ctx,'#bfd4cb',-8,-35+b,3,6);pixel(ctx,'#d3e2c7',-1,-37+b,3,7);pixel(ctx,'#bfd4cb',5,-35+b,3,6);
  if(facing==='up')pixel(ctx,'#bad0c9',-5,-27+b,10,5);
  else {for(const x of facing==='left'?[-7,-3]:facing==='right'?[2,6]:[-5,0,5])pixel(ctx,eye,x,-26+b,2,2);pixel(ctx,'#395969',facing==='left'?-6:facing==='right'?0:-3,-21+b,6,1);}
  pixel(ctx,'#c0c7a0',-7,-16+b,3,2);pixel(ctx,'#c0c7a0',5,-16+b,3,2);
}

/** Returns false for humans, so the established human customization renderer stays unchanged. */
export function drawAlienCharacter(ctx,x,y,options={}) {
  const species=normalizeSpecies(options.species);if(species==='human')return false;
  // Combat projections wrap a crew member's id in a boarding/session id.
  // Keep the underlying person for natural markings across those projections.
  const palette=PALETTES[species][hash(options.identityId||options.crewId||options.rescueGuestId||options.id||options.name||species)%3];
  const time=Number.isFinite(options.time)?options.time:0,moving=options.moving||options.walking||Math.hypot(options.vx||0,options.vy||0)>2;
  const equipped=!!options.weapon||options.team==='hostile'||options.firing,armed=equipped&&(options.armed??true),angle=Number.isFinite(options.aimAngle)?options.aimAngle:facingAngle(options.facing||'down');
  const facing=armed?(Math.abs(Math.cos(angle))>Math.abs(Math.sin(angle))?Math.cos(angle)<0?'left':'right':Math.sin(angle)<0?'up':'down'):options.facing||'down';
  const hurt=(options.hurtUntil||options.hitUntil||0)>time&&Math.floor(time*12)%2,asleep=!!options.asleep;
  const skin=hurt?'#e7c4b2':species==='choral'?(options.color||palette[0]):palette[0],color=hurt?'#e7c4b2':options.color||({vaeli:'#6a9199',keth:'#b38d61',oru:'#91809e'}[species]||skin);
  const pose={species,skin,shade:palette[1],light:palette[2],eye:palette[3],color,time,equipped,armed,angle,facing,asleep,bob:asleep?0:moving?Math.round(Math.sin(time*(species==='choral'?8:12))):options.resting?3:0,step:moving?(Math.sin(time*12)>0?1:-1):0};
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(options.scale||1,options.scale||1);
  pixel(ctx,'#112931',species==='choral'?-12:species==='keth'?-11:-8,-2,species==='choral'?24:species==='keth'?22:16,4);
  if(options.dead||Number.isFinite(options.health)&&options.health<=0){
    pixel(ctx,pose.shade,-14,-7,28,6);pixel(ctx,color,-9,-10,18,6);pixel(ctx,skin,7,-9,7,6);
    if(species==='choral')pixel(ctx,pose.light,8,-11,3,6);
    if(species==='vaeli'){pixel(ctx,pose.light,8,-13,2,6);pixel(ctx,pose.shade,12,-6,4,3);}
    if(species==='keth'){pixel(ctx,pose.light,6,-10,10,3);pixel(ctx,pose.shade,12,-13,2,4);}
    if(species==='oru'){pixel(ctx,pose.light,8,-14,2,7);pixel(ctx,pose.light,12,-14,2,7);}
    ctx.restore();return true;
  }
  if(species==='choral')drawChoral(ctx,pose);
  else if(asleep){
    pixel(ctx,'#253d43',-10,-29,20,31);pixel(ctx,'#a9bcb2',-8,-27,16,7);
    head(ctx,{...pose,bob:species==='oru'?9:species==='keth'?5:7});
    pixel(ctx,'#536b68',-8,-14,16,15);pixel(ctx,color,-7,-13,14,13);pixel(ctx,'#b7c5ad',-7,-13,14,2);
  } else {
    const {bob:b,step:s}=pose,wide=species==='keth',tall=species==='oru';
    if(options.resting){pixel(ctx,'#3b5458',-9,-10,18,8);pixel(ctx,'#81948a',-9,-10,18,2);pixel(ctx,'#263e45',-8,-3,3,6);pixel(ctx,'#263e45',5,-3,3,6);}
    for(const side of[-1,1]){const lx=side*(wide?5:3)-2,sy=s*side;pixel(ctx,pose.shade,lx,-(tall?11:8)+sy,wide?5:3,tall?11:8);pixel(ctx,pose.light,lx-1,-2+sy,wide?7:5,2);}
    const half=wide?9:tall?5:5;pixel(ctx,'#17313c',-half-1,-19+b,half*2+2,13);pixel(ctx,color,-half,-18+b,half*2,tall?15:11);pixel(ctx,pose.light,-half,-18+b,half*2,2);
    pixel(ctx,pose.shade,-1,-17+b,2,tall?12:9);pixel(ctx,'#acb8a5',-half,-8+b,half*2,2);
    for(const side of[-1,1]){pixel(ctx,color,side*(half+2)-1,-17+b,3,tall?12:9);pixel(ctx,skin,side*(half+2)-1,-(tall?6:9)+b,3,3);}
    head(ctx,pose);
  }
  if(!asleep)equipment(ctx,options,pose);
  ctx.restore();return true;
}
