/* SUNCOAST — a hand-drawn, chunk-cached overhead city. No external assets. */
import { WORLD, LOCATIONS, VEHICLE_TYPES, isLand, nearestRoad } from './world.mjs';

const TAU = Math.PI * 2;
const TILE = 256;
const WORLD_PIXELS = 4_000_000;
const MAP_PIXELS = 2_000_000;
const TERRAIN_BYTES = 48 * 1024 * 1024;
// A canvas's backing dimensions are device pixels, never a fallback CSS size.
// In particular a display:none minimap has a 0×0 CSS rect and must not be resized.
function canvasSize(canvas, pixelBudget) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width, height = rect.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const deviceRatio = Number.isFinite(globalThis.devicePixelRatio) && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  const dpr = Math.min(deviceRatio, 3, Math.sqrt(pixelBudget / (width * height)));
  const pixelWidth = Math.max(1, Math.floor(width * dpr)), pixelHeight = Math.max(1, Math.floor(height * dpr));
  return { width, height, pixelWidth, pixelHeight, dpr, scaleX: pixelWidth / width, scaleY: pixelHeight / height };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (x, y, salt = 0) => {
  let n = Math.imul((x | 0) + salt * 371, 374761393) ^ Math.imul((y | 0) + 91, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
};
const palette = { ocean: '#187e8b', shallow: '#51aaa4', beach: '#e6d2ae', land: '#c8c9ab', asphalt: '#3b4549', sidewalk: '#b9c0b6', yellow: '#edc46c', mint: '#91e3bc', pink: '#fa967d' };
const locationColors = { home:'#a7cfd0',cafe:'#efab77',garage:'#d9b75c',clinic:'#a4dbbd',precinct:'#91b5cc',docks:'#82c6ca',market:'#e6a68c',radio:'#c4b1da',club:'#d98cb9',hotel:'#b3d3d2',marina:'#9bd0c8',records:'#d8c8aa',port:'#b7c6bc',tower:'#a4b8cc',estate:'#d7c5a6',depot:'#cbbb8a' };

function pathPolygon(c, polygon) {
  if (!polygon?.length) return;
  c.beginPath(); c.moveTo(polygon[0][0], polygon[0][1]);
  for (let i = 1; i < polygon.length; i++) c.lineTo(polygon[i][0], polygon[i][1]); c.closePath();
}
function rr(c, x, y, w, h, r = 4) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function circle(c, x, y, r, color) { c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill(); }
function line(c, x1,y1,x2,y2,color,width=1) { c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke(); }
function box(c, x,y,w,h,color) {c.fillStyle=color;c.fillRect(x,y,w,h);}
function text(c, value,x,y,size=12,color='#f4eee0',align='center',weight=600) { c.fillStyle=color;c.font=`${weight} ${size}px system-ui, sans-serif`;c.textAlign=align;c.textBaseline='middle';c.fillText(value,x,y); }
function boundsHit(x,y,w,h,view,pad=0) {return x+w>=view.x-pad&&x<=view.x+view.w+pad&&y+h>=view.y-pad&&y<=view.y+view.h+pad;}
function dash(c,x1,y1,x2,y2,color,width=2,pattern=[10,14]) {c.setLineDash(pattern);line(c,x1,y1,x2,y2,color,width);c.setLineDash([]);}
function tint(hex, amount) {
  if (!/^#[\da-f]{6}$/i.test(hex||'')) return hex || '#c3b79d';
  return '#'+[1,3,5].map(i=>clamp(parseInt(hex.slice(i,i+2),16)+amount,0,255).toString(16).padStart(2,'0')).join('');
}
function icon(c,kind,x,y,size=11,color='#ececdf') {
  c.save(); c.translate(x,y);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;c.lineCap='round';c.lineJoin='round';
  if(kind==='clinic'){box(c,-size*.22,-size*.7,size*.44,size*1.4,color);box(c,-size*.7,-size*.22,size*1.4,size*.44,color);}
  else if(kind==='garage'){c.rotate(-.7);line(c,-size*.55,0,size*.35,0,color,3);c.beginPath();c.arc(size*.4,0,size*.4,.65,TAU-.65);c.stroke();}
  else if(kind==='home'){c.beginPath();c.moveTo(-size*.65,0);c.lineTo(0,-size*.6);c.lineTo(size*.65,0);c.stroke();box(c,-size*.45,0,size*.9,size*.6,color);box(c,-size*.12,size*.18,size*.24,size*.45,'#263d3c');}
  else if(kind==='cafe'){rr(c,-size*.6,-size*.4,size,size*.85,2);c.stroke();c.beginPath();c.arc(size*.5,-size*.05,size*.28,-1.5,1.5);c.stroke();line(c,-size*.7,size*.7,size*.7,size*.7,color,2);}
  else if(kind==='precinct'){c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?size*.35:size*.7;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}
  else if(['docks','marina','port'].includes(kind)){line(c,0,-size*.65,0,size*.6,color,2);line(c,-size*.45,-size*.25,size*.45,-size*.25,color,2);c.beginPath();c.arc(0,0,size*.65,.2,Math.PI-.2);c.stroke();circle(c,0,-size*.6,2,color);}
  else if(kind==='club'){line(c,-size*.2,-size*.7,-size*.2,size*.4,color,2);line(c,-size*.2,-size*.7,size*.6,-size*.9,color,2);line(c,size*.6,-size*.9,size*.6,size*.1,color,2);circle(c,-size*.4,size*.45,size*.25,color);circle(c,size*.4,size*.15,size*.25,color);}
  else{rr(c,-size*.55,-size*.6,size*1.1,size*1.2,2);c.stroke();line(c,-size*.3,-size*.2,size*.3,-size*.2,color,1);line(c,-size*.3,size*.15,size*.3,size*.15,color,1);}
  c.restore();
}

function drawPalm(c, d) {
  const size=22+(d.variant||0)%4*4,a=hash(d.x,d.y)*TAU;
  c.save();c.translate(d.x,d.y);
  c.globalAlpha=.2;c.fillStyle='#163d3b';c.beginPath();c.ellipse(17,22,size*.9,size*.42,.7,0,TAU);c.fill();
  c.globalAlpha=1;line(c,1,4,5,-7,'#75654a',5);line(c,0,4,3,-8,'#af996a',2);
  c.translate(3,-8);c.rotate(a);
  for(let i=0;i<7;i++) {c.rotate(TAU/7);c.fillStyle=i%2?'#3e7354':'#50845b';c.beginPath();c.moveTo(-2,0);c.quadraticCurveTo(-11,-size*.5,0,-size);c.quadraticCurveTo(6,-size*.45,3,0);c.fill();line(c,0,-3,0,-size*.8,'#729066',.7);}
  circle(c,0,0,4,'#b2a25a');c.restore();
}
function drawTree(c,d) {
  c.save();c.translate(d.x,d.y);circle(c,10,13,22,'#00000020');
  const col=d.type==='bush'?'#638b62':'#50785b';
  for(let i=0;i<5;i++)circle(c,Math.cos(i*1.26)*10,Math.sin(i*1.26)*10-4,12+(d.variant||0)%4,tint(col,i%2?9:-3));
  circle(c,-5,-9,9,'#6b9167');c.restore();
}

function drawBuilding(c,b) {
  const {x,y,w,h}=b;
  const col=b.color||locationColors[b.kind]||['#b9bdaf','#d9b39c','#b4c9bf','#d6c8aa'][Math.floor(hash(x,y)*4)];
  const kind=b.kind||b.id;
  box(c,x+12,y+15,w+2,h+3,'#173c3529');
  box(c,x-4,y-4,w+8,h+13,'#8e9489');
  box(c,x,y+8,w,h,col);box(c,x,y,w,h-3,tint(col,14));
  box(c,x+5,y+5,w-10,h-13,col);
  line(c,x+3,y+3,x+w-3,y+3,tint(col,35),3);
  line(c,x+3,y+3,x+3,y+h-4,tint(col,25),2);
  line(c,x+w-2,y+3,x+w-2,y+h-3,tint(col,-25),3);
  line(c,x+1,y+h-3,x+w-1,y+h-3,tint(col,-35),4);
  const roof=b.roof||Math.floor(hash(x,y,8)*3);
  if(roof==='tile'||roof===1||kind==='home'||kind==='cafe') {
    const tile=kind==='home'?'#b98465':tint(col,-16);
    box(c,x+8,y+8,w-16,h-20,tile);
    for(let yy=y+12;yy<y+h-14;yy+=9)line(c,x+9,yy,x+w-9,yy,tint(tile,14),1);
    for(let xx=x+13;xx<x+w-10;xx+=13)line(c,xx,y+9,xx,y+h-14,tint(tile,-15),1);
    line(c,x+w*.5,y+8,x+w*.5,y+h-12,tint(tile,27),4);
  } else if(roof==='metal'||roof===2||['garage','port','depot'].includes(kind)) {
    for(let xx=x+11;xx<x+w-8;xx+=12)line(c,xx,y+7,xx,y+h-13,tint(col,-15),1);
    for(let i=0;i<2;i++){const ww=Math.min(36,w*.22);box(c,x+20+i*(w*.42),y+h*.32,ww,26,'#557779');box(c,x+22+i*(w*.42),y+h*.32+2,ww-4,10,'#98bfba');}
  } else {
    box(c,x+12,y+12,w-24,h-29,tint(col,-8));
    if(w>75&&h>70){box(c,x+w*.65,y+h*.3,24,19,'#00000022');box(c,x+w*.65-3,y+h*.3-4,22,17,'#718480');for(let i=0;i<4;i++)line(c,x+w*.65,y+h*.3+i*3,x+w*.65+15,y+h*.3+i*3,'#a6b4aa',1);}
    if(w>130&&h>95){circle(c,x+30,y+30,11,'#566965');circle(c,x+29,y+28,9,'#a3b2a8');line(c,x+23,y+27,x+35,y+27,'#7c9288',1);}
  }
  // Window rhythms and small balconies give the blocks their coastal character.
  for(let xx=x+15;xx<x+w-12;xx+=26){box(c,xx,y+h+1,12,5,'#355a5b');line(c,xx,y+h+1,xx+11,y+h+1,'#c9ded0',1);}
  if(b.enterable&&b.door){
    const dx=b.door.x,dy=b.door.y;
    box(c,dx-18,dy-2,36,10,'#eadbc1');box(c,dx-11,dy-7,22,9,'#274d4d');
    if(['cafe','market','club','hotel'].includes(kind)){
      const awn=kind==='club'?'#b7648f':kind==='market'?'#60967c':'#e88670';
      box(c,dx-29,dy-19,58,14,awn);for(let j=0;j<6;j++)box(c,dx-29+j*10,dy-19,4,14,'#f8d8b3');box(c,dx-29,dy-5,58,3,tint(awn,-30));
    }
  }
  if(kind==='clinic') {box(c,x+w*.5-9,y+h*.5-24,18,48,'#e9eee2');box(c,x+w*.5-24,y+h*.5-9,48,18,'#e9eee2');}
  if(kind==='club'){line(c,x+6,y+6,x+w-6,y+6,'#f7a3c7',3);line(c,x+6,y+6,x+6,y+h-8,'#e8a0b4',2);text(c,'MIRADOR',x+w/2,y+h*.5,Math.min(15,w/7),'#65495b');}
  if(kind==='radio'){line(c,x+w*.6,y+h*.55,x+w*.6,y+h*.2,'#344d55',3);circle(c,x+w*.6,y+h*.2,5,'#e2aa6e');for(let i=1;i<3;i++){c.strokeStyle='#608080';c.lineWidth=2;c.beginPath();c.arc(x+w*.6,y+h*.2,i*14,-.8,.8);c.stroke();c.beginPath();c.arc(x+w*.6,y+h*.2,i*14,Math.PI-.8,Math.PI+.8);c.stroke();}}
  if(kind==='estate'){box(c,x+w*.15,y+h*.2,w*.3,h*.48,'#7eb5b2');box(c,x+w*.15+5,y+h*.2+5,w*.3-10,h*.48-10,'#48a8b0');}
  if(kind==='tower'){for(let xx=x+8;xx<x+w-8;xx+=18)box(c,xx,y+10,10,h-28,'#6d959f');line(c,x+5,y+h-9,x+w-5,y+h-9,'#c7d7d1',3);}
}

export class Renderer {
  constructor(canvas) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.camera={x:650,y:1000,zoom:1};this.width=1;this.height=1;this.dpr=1;
    this.cache=new Map();this.cacheBytes=0;this.tileDensity=1;this.mapCache=null;this.mapTransform={scale:1,ox:0,oy:0};
    this.lastAt=0;this.lastInterior=undefined;this.initial=true;this.elapsed=0;
    this.resize();
  }
  resize() {
    const size=canvasSize(this.canvas,WORLD_PIXELS);if(!size)return false;
    this.width=size.width;this.height=size.height;this.dpr=size.dpr;this.scaleX=size.scaleX;this.scaleY=size.scaleY;
    if(this.canvas.width!==size.pixelWidth)this.canvas.width=size.pixelWidth;
    if(this.canvas.height!==size.pixelHeight)this.canvas.height=size.pixelHeight;
    this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';
    return true;
  }
  screenToWorld(x,y) { return {x:(x-this.width/2)/this.camera.zoom+this.camera.x,y:(y-this.height/2)/this.camera.zoom+this.camera.y}; }
  worldToScreen(x,y){return{x:(x-this.camera.x)*this.camera.zoom+this.width/2,y:(y-this.camera.y)*this.camera.zoom+this.height/2};}
  _tile(tx,ty) {
    const density=this.tileDensity,key=density+':'+tx+','+ty;
    if(this.cache.has(key)){const v=this.cache.get(key);this.cache.delete(key);this.cache.set(key,v);return v;}
    const side=Math.ceil((TILE+2)*density),bytes=side*side*4;
    // Release evicted backing stores before allocating another retina tile.
    while(this.cache.size&&this.cacheBytes+bytes>TERRAIN_BYTES){
      const oldest=this.cache.keys().next().value,old=this.cache.get(oldest);
      this.cacheBytes-=old.width*old.height*4;this.cache.delete(oldest);old.width=1;old.height=1;
    }
    const tile=document.createElement('canvas');tile.width=side;tile.height=side;
    const c=tile.getContext('2d',{alpha:false});
    // Use the actual raster ratio after rounding so the 1-world-pixel bleed aligns.
    const raster=side/(TILE+2);c.setTransform(raster,0,0,raster,(-tx*TILE+1)*raster,(-ty*TILE+1)*raster);
    this._terrain(c,{x:tx*TILE-1,y:ty*TILE-1,w:TILE+2,h:TILE+2});
    this.cache.set(key,tile);this.cacheBytes+=bytes;
    return tile;
  }
  _terrain(c,v) {
    box(c,v.x,v.y,v.w,v.h,palette.ocean);
    // Stable, low-contrast ocean marks; animation is drawn separately.
    for(let x=Math.floor(v.x/65)*65;x<v.x+v.w;x+=65)for(let y=Math.floor(v.y/48)*48;y<v.y+v.h;y+=48){const k=hash(x,y);line(c,x+8*k,y+7*k,x+17+12*k,y+7*k,'#439aa032',1);}
    for(const island of WORLD.islands){
      pathPolygon(c,island.polygon);c.strokeStyle='#249397';c.lineWidth=54;c.lineJoin='round';c.stroke();
      pathPolygon(c,island.polygon);c.strokeStyle='#79b8a9';c.lineWidth=26;c.stroke();
      pathPolygon(c,island.polygon);c.fillStyle=island.color||palette.land;c.fill();c.strokeStyle=palette.beach;c.lineWidth=17;c.stroke();
    }
    // Gravel, faded grass and sand blemishes, stable in world coordinates.
    for(let x=Math.floor(v.x/40)*40;x<v.x+v.w;x+=40)for(let y=Math.floor(v.y/40)*40;y<v.y+v.h;y+=40){if(!isLand(x,y))continue;const k=hash(x,y,2);box(c,x+k*21,y+k*11,5+k*13,1+k*2,k>.5?'#7b906814':'#e5dac326');}
    const roads=[...WORLD.roads,...WORLD.bridges];
    for(const r of roads){if(!boundsHit(r.x,r.y,r.w,r.h,v,35))continue;box(c,r.x-12,r.y-12,r.w+24,r.h+24,'#a3afa5');box(c,r.x-9,r.y-9,r.w+18,r.h+18,'#c7caba');}
    for(const r of roads){
      if(!boundsHit(r.x,r.y,r.w,r.h,v,18))continue;
      box(c,r.x,r.y,r.w,r.h,palette.asphalt);
      const horizontal=r.axis==='h'||r.w>r.h;
      if(horizontal){line(c,r.x,r.y+4,r.x+r.w,r.y+4,'#758078',1);line(c,r.x,r.y+r.h-4,r.x+r.w,r.y+r.h-4,'#758078',1);dash(c,r.x,r.y+r.h/2-2,r.x+r.w,r.y+r.h/2-2,'#c6b479',1.7,[17,18]);dash(c,r.x,r.y+r.h/2+2,r.x+r.w,r.y+r.h/2+2,'#c6b479',1.7,[17,18]);}
      else{line(c,r.x+4,r.y,r.x+4,r.y+r.h,'#758078',1);line(c,r.x+r.w-4,r.y,r.x+r.w-4,r.y+r.h,'#758078',1);dash(c,r.x+r.w/2-2,r.y,r.x+r.w/2-2,r.y+r.h,'#c6b479',1.7,[17,18]);dash(c,r.x+r.w/2+2,r.y,r.x+r.w/2+2,r.y+r.h,'#c6b479',1.7,[17,18]);}
      if(r.to!==undefined){
        if(horizontal){line(c,r.x,r.y-7,r.x+r.w,r.y-7,'#e0ded0',4);line(c,r.x,r.y+r.h+7,r.x+r.w,r.y+r.h+7,'#e0ded0',4);for(let xx=r.x;xx<r.x+r.w;xx+=55){box(c,xx,r.y-13,8,15,'#6c8a85');box(c,xx,r.y+r.h,8,15,'#6c8a85');}}
        else{line(c,r.x-7,r.y,r.x-7,r.y+r.h,'#e0ded0',4);line(c,r.x+r.w+7,r.y,r.x+r.w+7,r.y+r.h,'#e0ded0',4);}
      }
    }
    // Paint each actual crossing after both road directions have been laid down.
    const hs=WORLD.roads.filter(r=>r.axis==='h'),vs=WORLD.roads.filter(r=>r.axis==='v');
    for(const h of hs)for(const q of vs){if(q.x<h.x||q.x+q.w>h.x+h.w||h.y<q.y||h.y+h.h>q.y+q.h||!boundsHit(q.x,h.y,q.w,h.h,v,25))continue;
      box(c,q.x,h.y,q.w,h.h,palette.asphalt);
      for(let xx=q.x+9;xx<q.x+q.w-4;xx+=12){box(c,xx,h.y+5,6,14,'#b6beb0');box(c,xx,h.y+h.h-19,6,14,'#b6beb0');}
      for(let yy=h.y+26;yy<h.y+h.h-23;yy+=12){box(c,q.x+5,yy,14,6,'#b6beb0');box(c,q.x+q.w-19,yy,14,6,'#b6beb0');}
      circle(c,q.x-6,h.y-6,3,'#d28568');circle(c,q.x+q.w+6,h.y+h.h+6,3,'#729e75');
    }
    // Optional parks and parking areas supported by authored world data.
    for(const p of WORLD.parks||[]){if(!boundsHit(p.x,p.y,p.w,p.h,v))continue;box(c,p.x,p.y,p.w,p.h,'#8da67c');line(c,p.x+8,p.y+p.h/2,p.x+p.w-8,p.y+p.h/2,'#d3c9ad',10);}
    for(const p of WORLD.parking||[]){if(!boundsHit(p.x,p.y,p.w,p.h,v))continue;box(c,p.x,p.y,p.w,p.h,'#7c8981');for(let xx=p.x+12;xx<p.x+p.w-10;xx+=29){line(c,xx,p.y+5,xx,p.y+36,'#b9bfad',2);line(c,xx,p.y+p.h-5,xx,p.y+p.h-36,'#b9bfad',2);}}
    // Paved front courts and short walkways explain how doors meet the street.
    for(const b of Object.values(LOCATIONS)){const d=b.door,n=nearestRoad(d.x,d.y);if(!n||!boundsHit(b.x-25,b.y,b.w+50,b.h+n.distance+70,v,40))continue;
      const wide=['garage','depot','port','clinic'].includes(b.kind),width=wide?58:24,edge=wide?'#a0aba0':'#cbd0bb',nx=n.road.axis==='v'?n.x+Math.sign(d.x-n.x)*(n.road.w/2+8):n.x,ny=n.road.axis==='h'?n.y+Math.sign(d.y-n.y)*(n.road.h/2+8):n.y;
      line(c,d.x,d.y+5,nx,ny,edge,width+6);line(c,d.x,d.y+5,nx,ny,wide?'#8e9b92':'#d8d4bf',width);
      box(c,b.x-15,b.y+b.h+10,b.w+30,43,'#b8c3ac');for(let xx=b.x;xx<b.x+b.w;xx+=38)line(c,xx,b.y+b.h+11,xx,b.y+b.h+51,'#a5b29e',1);
    }
    for(const b of WORLD.buildings)if(boundsHit(b.x,b.y,b.w,b.h,v,32))drawBuilding(c,b);
    for(const d of WORLD.decor||[]){if(!boundsHit(d.x,d.y,1,1,v,50))continue;
      if(d.type==='palm')drawPalm(c,d);
      else if(d.type==='tree'||d.type==='bush')drawTree(c,d);
      else if(d.type==='bench'){c.save();c.translate(d.x,d.y);c.rotate(d.angle||0);box(c,-11,-4,24,8,'#8c7057');line(c,-8,-4,-8,8,'#4f6258',2);line(c,8,-4,8,8,'#4f6258',2);c.restore();}
      else if(d.type==='lamp'){circle(c,d.x+8,d.y+11,5,'#163d3b33');circle(c,d.x,d.y,3,'#4a635d');circle(c,d.x,d.y-5,3,'#eee0aa');}
      else if(d.type==='umbrella'){circle(c,d.x+8,d.y+10,12,'#163d3b24');circle(c,d.x,d.y,12,d.variant%2?'#e2a27a':'#80adac');for(let i=0;i<8;i++)line(c,d.x,d.y,d.x+Math.cos(i*TAU/8)*11,d.y+Math.sin(i*TAU/8)*11,'#eadbbd',1);}
      else if(d.type==='container'){box(c,d.x,d.y,52,23,d.variant%2?'#ad7960':'#728f89');for(let xx=d.x+5;xx<d.x+48;xx+=7)line(c,xx,d.y+2,xx,d.y+20,'#00000019',1);}
      else if(d.type==='dock'){box(c,d.x,d.y,d.w||90,d.h||22,'#ad9776');for(let xx=d.x+4;xx<d.x+(d.w||90);xx+=12)line(c,xx,d.y,xx,d.y+(d.h||22),'#d2bb96',1);}
      else if(d.type==='crate'){box(c,d.x-8,d.y-8,16,16,'#ae966d');line(c,d.x-6,d.y-6,d.x+6,d.y+6,'#dac298',2);line(c,d.x+6,d.y-6,d.x-6,d.y+6,'#dac298',2);}
    }
    for(const [i,gr] of (WORLD.grids||[]).entries()){const labels=[['CALLE OCHO','PALMA AVENUE'],['OCEAN DRIVE','MIRADOR AVENUE'],['TERMINAL ROAD','UMBRAL AVENUE']][i]||[];const x=gr.xs[0]+260,y=gr.ys[1];if(boundsHit(x,y,1,1,v,180))text(c,labels[0]||'',x,y+24,9,'#9fa997','center',500);}
    for(const b of WORLD.buildings){if(!b.enterable||!b.door||!boundsHit(b.x,b.y,b.w,b.h,v,50))continue;
      if(b.w>95){const name=(b.shortName||b.name||'').toUpperCase();text(c,name,b.x+b.w/2,b.y-11,Math.min(11,b.w/(name.length*.65||1)),'#4d5f55');}
    }
  }
  render(g,{objective=null,waypoint=null,menu=false,zoom=1}={}) {
    if(!g)return;
    const now=performance.now(),dt=Math.min(.05,(now-this.lastAt)/1000||.016);this.lastAt=now;this.elapsed+=dt;
    const p=g.player||{x:650,y:1000,angle:0},interior=p.interior;this.playerMoved=!!this.lastPlayer&&Math.hypot(p.x-this.lastPlayer.x,p.y-this.lastPlayer.y)>.1;this.lastPlayer={x:p.x,y:p.y};
    const vehicle=g.vehicles?.find(v=>v.id===p.vehicleId);
    let targetX=p.x,targetY=p.y;
    let baseZoom=this.width<600?1.04:1.15;
    if(vehicle){baseZoom=this.width<600?.79:.94;targetX+=Math.cos(vehicle.angle||0)*clamp((vehicle.speed||0)*.2,-60,100);targetY+=Math.sin(vehicle.angle||0)*clamp((vehicle.speed||0)*.2,-60,100);}
    if(interior){
      const mobileView=this.width<=760||this.height<=600;
      baseZoom=mobileView?.9:Math.min((this.width-36)/700,(this.height-140)/540,1.7);
      if(mobileView){targetX=p.x;targetY=p.y;}
      else{const halfW=this.width/(2*baseZoom),halfH=this.height/(2*baseZoom);targetX=halfW>=320?320:clamp(p.x,halfW-15,640-halfW+15);targetY=halfH>=230?240:clamp(p.y,halfH-15,460-halfH+15);}
    }
    if(menu){targetX=800+Math.sin(this.elapsed*.025)*190;targetY=1450+Math.cos(this.elapsed*.02)*150;baseZoom=.9;}
    if(this.initial||this.lastInterior!==interior){this.camera.x=targetX;this.camera.y=targetY;this.camera.zoom=baseZoom*zoom;this.initial=false;}
    const follow=1-Math.exp(-dt*6);this.camera.x+=(targetX-this.camera.x)*follow;this.camera.y+=(targetY-this.camera.y)*follow;this.camera.zoom+=(baseZoom*zoom-this.camera.zoom)*(1-Math.exp(-dt*4));this.lastInterior=interior;
    const c=this.ctx,z=this.camera.zoom;
    c.setTransform(this.scaleX||this.dpr,0,0,this.scaleY||this.dpr,0,0);box(c,0,0,this.width,this.height,palette.ocean);
    c.save();c.translate(this.width/2,this.height/2);c.scale(z,z);c.translate(-this.camera.x,-this.camera.y);
    const v={x:this.camera.x-this.width/(2*z),y:this.camera.y-this.height/(2*z),w:this.width/z,h:this.height/z};
    if(interior){this._interior(c,g,LOCATIONS[interior]||WORLD.buildings.find(b=>b.id===interior),v,objective);}
    else{
      const minX=Math.floor(v.x/TILE),maxX=Math.floor((v.x+v.w)/TILE),minY=Math.floor(v.y/TILE),maxY=Math.floor((v.y+v.h)/TILE);
      const visibleTiles=(maxX-minX+1)*(maxY-minY+1);
      // Match device pixels at the requested zoom, while fitting all visible tiles
      // into the byte budget so a wide/zoomed-out view cannot churn the cache.
      // Using the target also avoids rebuilding at each intermediate zoom level
      // during the smooth transition into or out of a vehicle.
      this.tileDensity=clamp(Math.ceil(this.dpr*baseZoom*zoom*4)/4,.25,4);
      while(this.tileDensity>.25&&Math.ceil((TILE+2)*this.tileDensity)**2*4*visibleTiles>TERRAIN_BYTES)this.tileDensity-=.25;
      for(let tx=minX;tx<=maxX;tx++)for(let ty=minY;ty<=maxY;ty++)c.drawImage(this._tile(tx,ty),tx*TILE-1,ty*TILE-1,TILE+2,TILE+2);
      this._waterMotion(c,g,v);
      this._gates(c,g,v);
      if(!menu)this._route(c,g,objective,waypoint,v);
      const entities=[];
      for(const a of g.vehicles||[])if(boundsHit(a.x,a.y,1,1,v,100))entities.push({a,sort:a.y,type:'car'});
      for(const a of g.npcs||[])if(!a.interior&&boundsHit(a.x,a.y,1,1,v,60))entities.push({a,sort:a.y,type:'person'});
      for(const a of g.police||[])if(!a.interior&&a.kind!=='helicopter'&&boundsHit(a.x,a.y,1,1,v,100))entities.push({a,sort:a.y,type:a.kind==='car'||a.kind==='vehicle'||a.type==='police'?'copcar':'cop'});
      if(!p.vehicleId)entities.push({a:p,sort:p.y,type:'player'});
      entities.sort((a,b)=>a.sort-b.sort);
      for(const e of entities){if(e.type==='car'||e.type==='copcar')this._vehicle(c,e.a,g,e.type==='copcar');else this._person(c,e.a,g,e.type);}
      for(const h of g.police||[])if(h.kind==='helicopter'&&h.hp>0)this._helicopter(c,h,g);
      this._doorMarkers(c,g,v,objective);
      this._effects(c,g);
    }
    c.restore();
    if(!interior){const hour=((g.dayTime||16)%24+24)%24;const night=hour>=20||hour<5?.28:hour>=18?(hour-18)*.14:hour<7?(7-hour)*.14:0;if(night>0){c.fillStyle=`rgba(18,35,59,${night})`;c.fillRect(0,0,this.width,this.height);}}
    if(!menu&&objective&&Number.isFinite(objective.x)&&Number.isFinite(objective.y)&&(!interior||objective.interior))this._offscreen(c,objective,g);
    // A subtle photographic warmth keeps the city sunlit without obscuring its roads.
    c.save();c.fillStyle='#f0ba6210';c.fillRect(0,0,this.width,this.height);c.restore();
    if(g.phase==='down'||g.phase==='busted'){c.fillStyle=g.phase==='down'?'#471d2a45':'#192e4640';c.fillRect(0,0,this.width,this.height);}
    if(!menu&&p.hp>0&&p.hp<28){const grad=c.createRadialGradient(this.width/2,this.height/2,this.height*.2,this.width/2,this.height/2,this.width*.7);grad.addColorStop(0,'#8c273000');grad.addColorStop(1,'#8c273066');c.fillStyle=grad;c.fillRect(0,0,this.width,this.height);}
  }
  _waterMotion(c,g,v) {
    c.save();c.strokeStyle='#b4e2d022';c.lineWidth=1.3;
    for(let x=Math.floor(v.x/140)*140;x<v.x+v.w;x+=140)for(let y=Math.floor(v.y/110)*110;y<v.y+v.h;y+=110){const xx=x+Math.sin(this.elapsed*.5+hash(x,y)*10)*9,yy=y+hash(x,y,3)*35;if(isLand(xx,yy))continue;c.beginPath();c.moveTo(xx,yy);c.quadraticCurveTo(xx+11,yy+3,xx+24,yy);c.stroke();}
    c.restore();
  }
  _gates(c,g,v){
    for(const b of WORLD.bridges){if((g.progress?.unlocked||0)>=b.to||!boundsHit(b.x,b.y,b.w,b.h,v,80))continue;
      const hor=b.axis==='h'||b.w>b.h,x=hor?b.x+b.w*.32:b.x+b.w/2,y=hor?b.y+b.h/2:b.y+b.h*.32;
      c.save();c.translate(x,y);if(!hor)c.rotate(Math.PI/2);
      box(c,-6,-b.h/2+4,12,b.h-8,'#394a4a');
      for(let i=-b.h/2+6;i<b.h/2-8;i+=15){box(c,-8,i,16,8,'#e8b75c');line(c,-8,i,-1,i+8,'#493f32',3);}
      circle(c,-18,-b.h/2-15,6,'#d76c5f');circle(c,-18,b.h/2+15,6,'#d76c5f');
      rr(c,-92,-b.h/2-57,184,28,3);c.fillStyle='#293f40';c.fill();text(c,'CLOSED · 6-STAR RESPONSE',0,-b.h/2-43,10,'#ecc28e');c.restore();
    }
  }
  _route(c,g,obj,waypoint,v){
    const p=g.player,target=waypoint||obj;
    if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y)||p.interior)return;
    const dist=Math.hypot(target.x-p.x,target.y-p.y);if(dist<32)return;
    c.save();c.lineCap='round';c.globalAlpha=.32;c.setLineDash([3,13]);c.lineDashOffset=-this.elapsed*12;
    line(c,p.x,p.y,target.x,target.y,waypoint?'#a8cbdc':'#f2d27f',3);c.setLineDash([]);c.restore();
    if(boundsHit(target.x,target.y,1,1,v,30)){const pulse=1+Math.sin(this.elapsed*3)*.12;c.save();c.translate(target.x,target.y);c.strokeStyle=waypoint?'#b8e5e6':'#f5d38a';c.lineWidth=2;c.beginPath();c.arc(0,0,23*pulse,0,TAU);c.stroke();c.strokeStyle='#1d414166';c.lineWidth=6;c.beginPath();c.arc(0,0,28*pulse,0,TAU);c.stroke();c.restore();}
  }
  _doorMarkers(c,g,v,obj){
    const p=g.player;
    for(const b of WORLD.buildings){if(!b.enterable||!b.door||!boundsHit(b.door.x,b.door.y,1,1,v,50))continue;
      const d=b.door,near=Math.hypot(p.x-d.x,p.y-d.y)<180,active=obj&&Math.hypot(obj.x-d.x,obj.y-d.y)<70;
      if(!near&&!active)continue;
      c.save();c.translate(d.x,d.y+15);c.fillStyle=active?'#f4d17a':'#82bea9';c.globalAlpha=active?.9:.6;c.beginPath();c.moveTo(-7,1);c.lineTo(0,8);c.lineTo(7,1);c.lineTo(0,-6);c.closePath();c.fill();c.globalAlpha=1;
      if(near){rr(c,-13,-54,26,23,4);c.fillStyle='#274842ee';c.fill();icon(c,b.kind||b.id,0,-42,8,active?'#f4d17a':'#d5e1c9');}
      c.restore();
    }
  }
  _vehicle(c,a,g,isCop=false){
    const spec=VEHICLE_TYPES[a.type]||VEHICLE_TYPES.sedan||{w:25,h:48},length=spec.h||46,width=spec.w||24;
    const cop=isCop||a.type==='police',boat=spec.water||a.type==='boat',bike=a.type==='motorcycle';
    c.save();c.translate(a.x,a.y);c.rotate(a.angle||0);
    if(a.blockade){for(const yy of [-width-15,width+15]){box(c,-7,yy-4,14,10,'#384647');c.fillStyle='#e7a05e';c.beginPath();c.moveTo(0,yy-10);c.lineTo(6,yy+4);c.lineTo(-6,yy+4);c.closePath();c.fill();line(c,-3,yy-2,3,yy-2,'#eed8a6',2);}}
    if(boat&&Math.abs(a.speed||0)>5){c.strokeStyle='#ceeadd88';c.lineWidth=3;for(let i=0;i<3;i++){const xx=-length/2-5-i*13;c.beginPath();c.moveTo(xx,0);c.lineTo(xx-12,-width/2-i*3);c.moveTo(xx,0);c.lineTo(xx-12,width/2+i*3);c.stroke();}}
    c.fillStyle='#172b302e';rr(c,-length/2+5,-width/2+6,length,width,5);c.fill();
    if(boat){c.fillStyle=a.color||'#eee6d0';c.beginPath();c.moveTo(length/2,0);c.quadraticCurveTo(length*.32,-width*.58,-length/2,-width/2);c.lineTo(-length/2,width/2);c.quadraticCurveTo(length*.32,width*.58,length/2,0);c.fill();box(c,-length*.25,-width*.36,length*.48,width*.72,'#c6ba91');box(c,-length*.03,-width*.35,7,width*.7,'#477e85');box(c,-length*.3,-width*.25,9,width*.5,'#f0e4cf');}
    else if(bike){
      box(c,-length*.5,-3,9,6,'#1f2b2e');box(c,length*.25,-3,10,6,'#1f2b2e');rr(c,-length*.31,-width*.36,length*.63,width*.72,3);c.fillStyle=a.color||'#b85f4f';c.fill();box(c,-length*.2,-3,8,6,'#343b3d');line(c,length*.2,-width*.7,length*.2,width*.7,'#9aab9f',2);
      if(a.driver||a.id===g.player.vehicleId){circle(c,-2,0,6,'#317f7a');circle(c,3,0,4,'#292a2b');}
    }else{
      const col=cop?'#d8e0d3':a.color||spec.color||'#b28c64';
      box(c,-length*.32,-width/2-3,10,5,'#202f32');box(c,length*.2,-width/2-3,10,5,'#202f32');box(c,-length*.32,width/2-2,10,5,'#202f32');box(c,length*.2,width/2-2,10,5,'#202f32');
      rr(c,-length/2,-width/2,length,width,4);c.fillStyle=col;c.fill();
      line(c,-length*.41,-width*.38,length*.35,-width*.38,tint(col,35),1.5);
      if(a.type==='truck'){box(c,-length*.42,-width*.4,length*.48,width*.8,tint(col,-25));for(let i=0;i<3;i++)line(c,-length*.37+i*7,-width*.36,-length*.37+i*7,width*.36,tint(col,-12),1);box(c,length*.03,-width*.4,length*.25,width*.8,'#668785');}
      else if(a.type==='van'){rr(c,-length*.4,-width*.39,length*.68,width*.78,3);c.fillStyle=tint(col,10);c.fill();box(c,length*.22,-width*.35,7,width*.7,'#3f6d76');line(c,-length*.39,-width*.25,-length*.39,width*.25,'#75948d',2);}
      else{
        box(c,-length*.26,-width*.37,length*.12,width*.74,'#476e76');box(c,length*.14,-width*.39,length*.16,width*.78,'#3e6872');
        rr(c,-length*.16,-width*.35,length*.33,width*.7,3);c.fillStyle=cop?'#31454a':tint(col,7);c.fill();
        line(c,length*.19,-width*.3,length*.25,width*.27,'#95b2ac',1.5);
      }
      box(c,length/2-3,-width*.37,3,width*.22,'#f1e8bb');box(c,length/2-3,width*.15,3,width*.22,'#f1e8bb');
      box(c,-length/2,-width*.38,3,width*.22,(a.speed||0)<-1?'#ffe6bf':'#ad544b');box(c,-length/2,width*.16,3,width*.22,'#ad544b');
      if(cop){box(c,-2,-width*.42,5,width*.84,'#33434b');box(c,-2,-width*.42,5,width*.39,Math.sin(this.elapsed*13)>0?'#ed7367':'#99534e');box(c,-2,1,5,width*.39,Math.sin(this.elapsed*13)<0?'#70b8e8':'#49748c');}
    }
    if((a.hp??100)<32){circle(c,-length*.1,-5,10,'#22333770');circle(c,-length*.1-4,-10-Math.sin(this.elapsed*4)*4,8,'#4b565b60');}
    if(a.id===g.player.vehicleId){c.strokeStyle='#f5da8b';c.lineWidth=1.4;c.setLineDash([4,6]);rr(c,-length/2-5,-width/2-6,length+10,width+12,6);c.stroke();c.setLineDash([]);}
    c.restore();
  }
  _person(c,a,g,type='person'){
    if(a.hp!==undefined&&a.hp<=0){c.save();c.translate(a.x,a.y);c.rotate(a.angle||0);rr(c,-8,-4,17,8,4);c.fillStyle='#775e59';c.fill();c.restore();return;}
    const player=type==='player',cop=type==='cop'||a.type==='police',walking=a.walking||a.speed||(player&&this.playerMoved);
    c.save();c.translate(a.x,a.y);
    if(player&&a.swimming){c.strokeStyle='#d2ebe27a';c.lineWidth=1.5;c.beginPath();c.ellipse(0,3,16+Math.sin(this.elapsed*4)*2,8,0,0,TAU);c.stroke();}
    if(player){circle(c,0,2,15,'#f2d78b22');c.strokeStyle='#f4d58c';c.lineWidth=1.3;c.beginPath();c.arc(0,1,13,0,TAU);c.stroke();}
    circle(c,3,5,7,'#16343444');c.rotate(a.angle||0);
    const phase=walking?Math.sin(this.elapsed*9+hash(a.x,a.y)*.1):0;
    if(!a.swimming){line(c,-5,-3,-9-phase*2,-3,'#263c42',3);line(c,-5,3,-9+phase*2,3,'#263c42',3);}
    const col=player?'#267d78':cop?(a.kind==='tactical'?'#293e47':'#37566c'):a.color||['#bc7869','#c6b682','#78a4a1','#d6aa84','#7f8b9e'][Math.floor(hash(Number(String(a.id).replace(/\D/g,''))||10,73)*5)];
    rr(c,-6,-6,11,12,4);c.fillStyle=col;c.fill();line(c,1,-6,6,-4,player?'#c99476':'#b98b73',3);line(c,1,6,6,4,player?'#c99476':'#b98b73',3);
    circle(c,1,0,5,player?'#352d2c':cop?'#2c4a5a':'#51443a');circle(c,3.7,0,2.5,'#c08e70');
    if(player){circle(c,-3,-1,3.5,'#352d2c');if(g.player.weapon&&g.player.weapon!=='unarmed'&&g.player.weapon!=='fists')box(c,6,-2,10,3,'#273c40');line(c,18,0,24,0,'#f3d58b',1.5);}
    if(cop){box(c,5,-1,8,2,'#24353b');circle(c,0,-4,1.6,'#d0be77');if(a.kind==='tactical'){box(c,-5,-4,5,8,'#4f605c');circle(c,1,0,5.5,'#344a4b');}}
    c.restore();
    if(a.report>0){circle(c,a.x,a.y-22,9,'#deaa63');text(c,'!',a.x,a.y-22,12,'#493e37');}
  }
  _helicopter(c,h,g){
    const x=h.x,y=h.y;
    c.save();c.translate(x+35,y+45);c.rotate(h.angle||0);rr(c,-35,-9,70,18,9);c.fillStyle='#102d3d2b';c.fill();c.restore();
    if(g.wanted?.seen){const grad=c.createRadialGradient(g.player.x,g.player.y,5,g.player.x,g.player.y,90);grad.addColorStop(0,'#f1e8ad25');grad.addColorStop(1,'#f1e8ad00');c.fillStyle=grad;c.beginPath();c.arc(g.player.x,g.player.y,90,0,TAU);c.fill();}
    c.save();c.translate(x,y);c.rotate(h.angle||0);box(c,-37,-3,32,6,'#33464b');rr(c,-11,-10,35,20,9);c.fillStyle='#3b5260';c.fill();box(c,12,-8,8,16,'#83b6bd');line(c,-36,-12,-36,12,'#6e8588',3);c.rotate(this.elapsed*25);line(c,-48,0,48,0,'#243f4cbb',4);line(c,0,-48,0,48,'#243f4cbb',4);c.restore();
  }
  _effects(c,g){
    for(const b of g.bullets||[]){c.save();c.strokeStyle=b.owner==='police'?'#e8a892':'#ffe7ad';c.lineWidth=2.3;const a=b.angle||Math.atan2(b.vy||0,b.vx||1);line(c,b.x-Math.cos(a)*11,b.y-Math.sin(a)*11,b.x,b.y,c.strokeStyle,2.3);c.restore();}
    for(const e of g.effects||[]){const life=clamp(e.life/(e.maxLife||e.life||1),0,1);c.save();c.globalAlpha=life;c.strokeStyle=e.color||'#f1c37e';c.fillStyle=e.color||'#f1c37e';
      if(e.type==='explosion'){circle(c,e.x,e.y,(e.r||40)*(1-life*.4),'#d77e46');circle(c,e.x,e.y,(e.r||40)*.5*(1-life*.3),'#e9bb6c');}
      else if(e.type==='hit'||e.type==='spark'){for(let i=0;i<6;i++){const a=i*TAU/6;line(c,e.x+Math.cos(a)*5,e.y+Math.sin(a)*5,e.x+Math.cos(a)*(e.r||15),e.y+Math.sin(a)*(e.r||15),c.fillStyle,2);}}
      else{c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,(e.r||15)*(1.6-life*.6),0,TAU);c.stroke();}c.restore();}
  }
  _interior(c,g,loc,v,obj){
    const kind=loc?.kind||loc?.id||'home',color=locationColors[kind]||'#c2c8ae';
    box(c,v.x,v.y,v.w,v.h,'#1e3c3d');
    box(c,-18,-18,676,496,'#172d2c');box(c,-8,-8,656,476,tint(color,-45));box(c,0,0,640,460,'#c9bc98');
    // Tile floors, walls, trim and daylight at the windows.
    for(let x=0;x<640;x+=40)for(let y=0;y<460;y+=40){box(c,x+1,y+1,38,38,(x+y)%80?'#c8bfa3':'#d0c8ad');}
    if(['garage','port','depot'].includes(kind)){box(c,0,0,640,460,'#929a91');for(let x=0;x<640;x+=80)line(c,x,0,x,460,'#7f8d85',1);for(let y=0;y<460;y+=80)line(c,0,y,640,y,'#7f8d85',1);}
    if(kind==='club'){box(c,0,0,640,460,'#38444d');for(let x=20;x<620;x+=48)for(let y=80;y<330;y+=48)box(c,x,y,44,44,(x+y)%96?'#46515b':'#504b5b');}
    box(c,0,0,640,16,tint(color,-10));box(c,0,0,16,460,tint(color,-24));box(c,624,0,16,460,tint(color,-34));box(c,0,444,280,16,tint(color,-35));box(c,360,444,280,16,tint(color,-35));
    for(let x=55;x<590;x+=170){box(c,x,3,96,14,'#395e61');box(c,x+3,5,90,7,'#93b7b0');box(c,x+4,17,89,47,'#f4e8ba20');line(c,x+48,4,x+48,15,'#c8d1b7',2);}
    const furniture=(x,y,w,h,col,round=3)=>{box(c,x+5,y+6,w,h,'#102e2b20');rr(c,x,y,w,h,round);c.fillStyle=col;c.fill();line(c,x+2,y+2,x+w-2,y+2,tint(col,20),2);};
    const plant=(x,y)=>{circle(c,x,y,10,'#ad8a61');drawTree(c,{x,y:y-4,type:'bush',variant:0});};
    const chair=(x,y,a=0)=>{c.save();c.translate(x,y);c.rotate(a);furniture(-11,-9,22,19,'#8c705b');line(c,-11,-9,11,-9,'#b29370',4);c.restore();};
    if(kind==='cafe'||kind==='market'){
      furniture(40,70,180,48,'#9a6e50');box(c,50,80,70,25,'#c6b798');for(let i=0;i<5;i++)circle(c,140+i*13,91,4,'#eeeece');
      furniture(430,65,150,45,'#7b917b');box(c,445,72,24,25,'#a7c1b3');box(c,480,72,80,25,'#dbc79b');
      for(const [x,y]of[[135,235],[465,235],[150,350],[490,355]]){circle(c,x+4,y+5,29,'#14362c24');circle(c,x,y,29,'#b38862');circle(c,x-7,y-5,6,'#f3e5ba');circle(c,x+9,y+3,5,'#627e67');chair(x-42,y,-Math.PI/2);chair(x+42,y,Math.PI/2);}
      plant(45,410);plant(590,145);
    }else if(kind==='garage'||kind==='depot'||kind==='port'){
      furniture(38,55,145,45,'#576b69');for(let i=0;i<7;i++)box(c,45+i*18,62,8,21,['#ba8064','#c6ae70','#8caca0'][i%3]);
      furniture(455,55,145,45,'#6e8178');for(let i=0;i<3;i++){box(c,465+i*40,64,29,26,'#9aa594');}
      for(const x of [90,465]){box(c,x,195,95,174,'#a6a994');for(let yy=200;yy<360;yy+=25){line(c,x,yy,x+10,yy-10,'#d6b970',4);line(c,x+85,yy,x+95,yy-10,'#d6b970',4);}this._vehicle(c,{type:x===90?'sedan':'van',x:x+48,y:270,angle:-Math.PI/2,color:x===90?'#b56e5a':'#c7bf97',hp:100},g);}
      for(let i=0;i<3;i++){circle(c,45+i*27,405,10,'#334b46');circle(c,45+i*27,405,4,'#85978a');}
    }else if(kind==='clinic'){
      furniture(35,70,180,40,'#749a8d');icon(c,'clinic',92,90,13,'#e8efe1');furniture(420,70,170,40,'#90a697');
      for(const [x,y] of [[65,185],[455,185],[65,315],[455,315]]){furniture(x,y,108,65,'#e6e3cb');box(c,x+9,y+8,25,49,'#c1d8c5');box(c,x+40,y+6,60,53,'#9db9ab');circle(c,x+122,y+17,9,'#7c9b8d');}
      plant(590,410);
    }else if(kind==='home'){
      furniture(65,85,140,145,'#967c63');box(c,75,95,120,126,'#c2cbb0');box(c,79,100,52,29,'#e6e1c3');box(c,139,100,52,29,'#e6e1c3');box(c,75,153,120,68,'#8ea99a');
      furniture(440,110,130,65,'#8d9f85');furniture(450,205,110,48,'#a58c68');box(c,460,215,38,18,'#d8c9a5');
      furniture(54,315,160,52,'#8c7058');box(c,66,326,37,27,'#45656a');box(c,125,328,68,22,'#c1bc98');
      plant(575,360);text(c,'FAMILIA',500,54,13,'#7f7565');
    }else if(kind==='club'){
      furniture(45,70,190,47,'#865969');for(let i=0;i<8;i++)box(c,55+i*21,78,10,21,['#a2b4a1','#d4b28a','#c3839f'][i%3]);
      furniture(440,70,150,45,'#66596f');box(c,458,78,42,26,'#273b45');box(c,524,78,42,26,'#273b45');circle(c,480,91,12,'#9c9aa7');circle(c,545,91,12,'#9c9aa7');
      for(let i=0;i<4;i++){furniture(45,170+i*58,125,38,'#856275');furniture(470,170+i*58,125,38,'#856275');}
      c.fillStyle='#d699bf15';c.beginPath();c.arc(320,280,120,0,TAU);c.fill();text(c,'MIRADOR',320,40,23,'#d8a4bd');
    }else if(kind==='precinct'||kind==='records'||kind==='radio'||kind==='tower'){
      furniture(50,70,180,45,'#899a8b');furniture(420,70,170,45,'#899a8b');
      for(const [x,y]of[[70,205],[430,205],[70,330],[430,330]]){furniture(x,y,135,45,'#af9b78');box(c,x+14,y+8,38,20,'#46676c');box(c,x+72,y+8,30,25,'#e2d9b6');chair(x+60,y+68);}
      text(c,kind==='radio'?'RADIO LUCERO':kind==='precinct'?'BAHÍA LUCERO POLICE':kind==='records'?'PUBLIC RECORDS':'SUNCOAST DEVELOPMENT',320,41,14,'#5d766f');
    }else{
      furniture(45,75,180,48,'#9a8265');furniture(430,75,165,48,'#9a8265');
      furniture(55,230,150,64,'#9ba78e');furniture(450,230,130,64,'#9ba78e');furniture(253,275,130,60,'#b39170');plant(55,395);plant(580,395);
    }
    // The mission desk is always reachable down the center aisle.
    circle(c,320,150,27,'#e6c67529');c.strokeStyle='#e9c77c';c.lineWidth=2;c.beginPath();c.arc(320,150,22+Math.sin(this.elapsed*3)*2,0,TAU);c.stroke();
    this._person(c,{id:'contact',x:320,y:116,angle:Math.PI/2,hp:100,color:kind==='clinic'?'#d2e0ce':kind==='garage'?'#91795c':'#b98170'},g,'person');
    if(obj?.interior&&obj.y<250){text(c,'TALK / INTERACT',320,183,10,'#5b6753');}
    if(obj?.interior&&obj.y>300){c.strokeStyle='#efd380';c.lineWidth=3;c.beginPath();c.arc(320,420,25+Math.sin(this.elapsed*3)*2,0,TAU);c.stroke();}
    box(c,282,440,76,20,'#55796a');text(c,'EXIT',320,450,11,'#e6e5c9');
    this._person(c,g.player,g,'player');
    for(const npc of g.npcs||[])if(npc.interior===g.player.interior)this._person(c,npc,g,'person');
    this._effects(c,g);
    if(this.width>760&&this.height>600)text(c,(loc?.name||'INTERIOR').toUpperCase(),320,-33,15,'#d4dbc8');
  }
  _offscreen(c,obj,g){
    const pos=this.worldToScreen(obj.x,obj.y),pad=50;
    if(pos.x>pad&&pos.x<this.width-pad&&pos.y>95&&pos.y<this.height-100)return;
    const dx=pos.x-this.width/2,dy=pos.y-this.height/2,a=Math.atan2(dy,dx),rx=this.width/2-pad,ry=Math.max(50,this.height/2-95),scale=Math.min(rx/(Math.abs(dx)||1),ry/(Math.abs(dy)||1));
    const x=this.width/2+dx*scale,y=this.height/2+dy*scale;
    c.save();c.translate(x,y);c.rotate(a);c.fillStyle='#f1d18a';c.strokeStyle='#234643';c.lineWidth=3;c.beginPath();c.moveTo(12,0);c.lineTo(-6,-7);c.lineTo(-3,0);c.lineTo(-6,7);c.closePath();c.stroke();c.fill();c.restore();
    const distance=Math.round(Math.hypot(obj.x-g.player.x,obj.y-g.player.y)/4);text(c,`${distance} m`,x-Math.cos(a)*27,y-Math.sin(a)*27,11,'#f4e6c7');
  }
  drawMap(canvas,g,{waypoint=null,objective=null,full=true}={}){
    const size=canvasSize(canvas,MAP_PIXELS);if(!size)return null;
    const w=size.width,h=size.height;
    if(canvas.width!==size.pixelWidth)canvas.width=size.pixelWidth;
    if(canvas.height!==size.pixelHeight)canvas.height=size.pixelHeight;
    const c=canvas.getContext('2d');c.setTransform(size.scaleX,0,0,size.scaleY,0,0);box(c,0,0,w,h,'#173d43');
    let scale,ox,oy;
    if(full){scale=Math.min((w-38)/WORLD.width,(h-38)/WORLD.height);ox=(w-WORLD.width*scale)/2;oy=(h-WORLD.height*scale)/2;}
    else{scale=Math.max(w/1450,h/1100);const p=g.player.interior?(LOCATIONS[g.player.interior]||WORLD.buildings.find(b=>b.id===g.player.interior))?.door||g.player:g.player;ox=w/2-p.x*scale;oy=h/2-p.y*scale;}
    const transform={scale,ox,oy,width:w,height:h};if(full)this.mapTransform=transform;else this.minimapTransform=transform;
    c.save();c.translate(ox,oy);c.scale(scale,scale);
    for(const island of WORLD.islands){pathPolygon(c,island.polygon);c.fillStyle=(g.progress?.unlocked||0)>=island.id?'#839989':'#576d69';c.fill();c.strokeStyle='#c1bd97';c.lineWidth=6/scale;c.stroke();}
    for(const r of [...WORLD.roads,...WORLD.bridges])box(c,r.x,r.y,r.w,r.h,'#2e4c4c');
    for(const b of WORLD.buildings)box(c,b.x,b.y,b.w,b.h,b.enterable?'#bac7a7':'#9baa93');
    for(const b of WORLD.bridges){if(b.to<=(g.progress?.unlocked||0))continue;const x=b.x+b.w/2,y=b.y+b.h/2;c.strokeStyle='#dba16f';c.lineWidth=3/scale;c.beginPath();c.moveTo(x-8/scale,y-8/scale);c.lineTo(x+8/scale,y+8/scale);c.moveTo(x+8/scale,y-8/scale);c.lineTo(x-8/scale,y+8/scale);c.stroke();}
    if(g.wanted?.stars&&g.wanted?.mode==='search'){c.fillStyle='#b98c6324';c.strokeStyle='#d7aa6b88';c.lineWidth=2/scale;c.beginPath();c.arc(g.wanted.lastX??g.player.x,g.wanted.lastY??g.player.y,180+g.wanted.stars*55,0,TAU);c.fill();c.stroke();}
    const p=g.player.interior?(LOCATIONS[g.player.interior]||WORLD.buildings.find(b=>b.id===g.player.interior))?.door||g.player:g.player;
    if(full){for(const b of Object.values(LOCATIONS)){const d=b.door||{x:b.x+b.w/2,y:b.y+b.h};circle(c,d.x,d.y,4.5/scale,locationColors[b.kind||b.id]||'#c9dcbd');}}
    for(const cop of g.police||[])if(cop.hp>0)circle(c,cop.x,cop.y,full?2.5/scale:3/scale,'#ee987e');
    const target=waypoint||(g.player.interior&&objective?.interior?p:objective);
    if(target&&Number.isFinite(target.x)&&Number.isFinite(target.y)){c.strokeStyle='#e8c376';c.lineWidth=1.4/scale;c.setLineDash([4/scale,5/scale]);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(target.x,target.y);c.stroke();c.setLineDash([]);circle(c,target.x,target.y,7/scale,'#f0c878');circle(c,target.x,target.y,3/scale,'#35564e');}
    c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);c.fillStyle='#f5e6ba';c.strokeStyle='#254940';c.lineWidth=1.4/scale;c.beginPath();c.moveTo(9/scale,0);c.lineTo(-6/scale,-5/scale);c.lineTo(-3/scale,0);c.lineTo(-6/scale,5/scale);c.closePath();c.stroke();c.fill();c.restore();
    c.restore();
    if(full){const shortNames={cafe:'Café Inés',home:'Home',garage:'Garage',clinic:'Clinic',precinct:'Precinct',docks:'Docks',market:'Market',radio:'Radio',depot:'Tow yard',club:'Mirador',hotel:'Mar Azul',marina:'Marina',records:'Records',port:'Terminal',tower:'Suncoast HQ',estate:'Ward House'};if(w>=600)for(const b of Object.values(LOCATIONS)){const x=ox+b.door.x*scale,y=oy+b.door.y*scale;const name=shortNames[b.id]||b.name;c.font='600 10px system-ui, sans-serif';const width=c.measureText(name).width;rr(c,x-width/2-4,y-19,width+8,14,3);c.fillStyle='#244540e8';c.fill();text(c,name,x,y-12,10,'#e3e2c9');}
    for(const island of WORLD.islands){const xs=island.polygon.map(p=>p[0]),ys=island.polygon.map(p=>p[1]),x=ox+(Math.min(...xs)+Math.max(...xs))/2*scale,y=oy+(Math.max(...ys)+130)*scale;
      text(c,island.name.toUpperCase(),x,y,w<600?10:12,'#d9dfc8');text(c,island.id>(g.progress?.unlocked||0)?'RESTRICTED · SIX STARS':'OPEN DISTRICT',x,y+(w<600?14:18),w<600?8:10,island.id>(g.progress?.unlocked||0)?'#dbaa75':'#98b7a7');
    }}else{text(c,'N',w-12,13,10,'#cbdac1');}
    return transform;
  }
}
