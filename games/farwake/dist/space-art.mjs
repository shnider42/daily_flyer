import {pixelRect,pixelLine,pixelRing,labelSink} from './pixel-art.mjs';
import {resolveCabinClass} from './interior-layouts.mjs';
import {getShipClass} from './fleet.mjs';
import {beginPixelFrame,pixelCamera,worldToCanvas,canvasToWorld} from './render-viewport.mjs';
import {normalizeWorldZoom} from './camera-view.mjs';
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){return()=>{seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=t+Math.imul(t^(t>>>7),61|t)^t;return((t^(t>>>14))>>>0)/4294967296;};}
function mix(hex,m){if(!/^#[0-9a-f]{6}$/i.test(hex))return hex;const n=parseInt(hex.slice(1),16);return`rgb(${clamp(Math.round(((n>>16)&255)*m),0,255)},${clamp(Math.round(((n>>8)&255)*m),0,255)},${clamp(Math.round((n&255)*m),0,255)})`;}
function makeCanvas(w,h){const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas');c.width=w;c.height=h;return c;}
function polygon(ctx,points,color){
 const min=Math.floor(Math.min(...points.map(p=>p[1]))),max=Math.ceil(Math.max(...points.map(p=>p[1])));ctx.fillStyle=color;
 for(let y=min;y<=max;y++){const hits=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))hits.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i<hits.length;i+=2)if(hits[i+1]!==undefined)ctx.fillRect(Math.round(hits[i]),y,Math.max(1,Math.round(hits[i+1]-hits[i])),1);}
}
export const SHIP_VISUALS={
 sparrow:{length:64,width:42,thrusters:[[-30,-14],[-30,14]]},
 hauler:{length:104,width:66,thrusters:[[-50,-21],[-50,0],[-50,21]]},
 frigate:{length:154,width:72,thrusters:[[-74,-27],[-69,-10],[-69,10],[-74,27]]},
 capital:{length:260,width:128,thrusters:[[-125,-44],[-122,-27],[-119,-10],[-119,10],[-122,27],[-125,44]]}
};
const palettes={temperate:['#193d48','#2f6d70','#598f7d','#b5b982','#c4d1bd'],earth:['#183e56','#2b6d79','#5e956f','#a7b88b','#d5ddcb'],forest:['#173e42','#356b56','#6a8b58','#a7a16c','#c5caa6'],garden:['#183e46','#3c7772','#6b9f75','#a8b787','#d7dbc2'],arid:['#674a3b','#a07554','#c29e70','#dec59b','#f0dcbd'],desert:['#694a3c','#a37652','#c79e69','#d7b77e','#ebd2a7'],ice:['#244056','#4c788a','#83afbc','#c4d6d6','#edf2e4'],ocean:['#183d59','#2b6581','#5c96a1','#84aea2','#d6e0cc'],volcanic:['#342e39','#5e4042','#8c5545','#c47851','#e8ac6d'],industrial:['#34343b','#61545a','#8a7a71','#b59f7e','#d2c6a3'],ruin:['#343f42','#62766c','#8b9b82','#b4b59a','#d1d2b8'],barren:['#343b47','#58616b','#7d8990','#a3ada8','#d1d4c2'],station:['#233b4a','#385560','#718d8e','#a4b4a5','#d9d6b4']};
const shipCache=new Map(),workCanvases=new Map(),stationCache=new Map();
function hullSprite(shipClass,color,damage=0){
 const key=`${shipClass}:${color}:${Math.floor(damage*4)}`;if(shipCache.has(key))return shipCache.get(key);
 const profile=SHIP_VISUALS[shipClass],c=makeCanvas(profile.length+14,profile.width+14),ctx=c.getContext('2d');ctx.translate(c.width/2,c.height/2);const p=(col,x,y,w,h)=>pixelRect(ctx,col,x,y,w,h),dark='#152b38',edge='#526e7a',light=mix(color,1.13),shade=mix(color,.62);
 if(shipClass==='sparrow'){
  polygon(ctx,[[-31,-12],[-20,-21],[-5,-20],[8,-12],[31,-4],[33,0],[31,4],[8,12],[-5,20],[-20,21],[-31,12]],dark);
  p(edge,-28,-19,22,11);p(edge,-28,8,22,11);p(color,-25,-18,16,8);p(color,-25,10,16,8);p(light,-24,-18,16,2);p(light,-24,10,16,2);
  polygon(ctx,[[-22,-10],[7,-10],[31,-3],[31,3],[7,10],[-22,10]],shade);polygon(ctx,[[-19,-9],[7,-9],[27,-3],[27,2],[5,7],[-19,7]],color);
  p(light,-16,-9,20,2);p('#203b4d',7,-5,14,9);p('#70beca',10,-4,9,5);p('#c4e5d8',11,-4,6,1);p('#637f86',-27,-6,12,12);p('#233d4c',-31,-16,5,5);p('#233d4c',-31,11,5,5);p('#e4bd78',-17,-16,3,4);p('#e4bd78',-17,12,3,4);p('#7e8a81',-8,1,10,4);p('#1c3543',-7,2,7,1);
 }else if(shipClass==='hauler'){
  polygon(ctx,[[-51,-23],[-40,-31],[20,-31],[51,-12],[53,0],[51,12],[20,31],[-40,31],[-51,23]],dark);
  p(edge,-45,-18,83,36);polygon(ctx,[[22,-17],[46,-11],[51,0],[46,11],[22,17]],shade);p(color,-43,-13,71,26);p(light,-40,-13,61,3);
  const pods=['#829991','#b5a58a','#7d959e'];for(let i=0;i<3;i++)for(const side of[-1,1]){const x=-36+i*25,y=side<0?-31:16;p('#172f3c',x-2,y-2,25,18);p(pods[i],x,y,21,14);p('#c7c8ae',x+1,y,19,2);p('#3c5963',x+3,y+5,15,2);p('#e0c18b',x+8,y+3,3,9);}
  p('#1c3b4b',27,-7,17,14);p('#78b7c6',30,-5,10,9);p('#d1e7d6',31,-5,8,2);p('#718891',-48,-18,10,36);for(const y of[-23,-2,19])p('#173544',-52,y,6,6);for(let i=-25;i<22;i+=10){p('#597580',i,-7,5,14);p('#a8bdb3',i,-6,5,2);}p('#d6bd88',4,-3,14,6);
 }else if(shipClass==='frigate'){
  polygon(ctx,[[-75,-29],[-50,-35],[7,-31],[76,-5],[78,0],[76,5],[7,31],[-50,35],[-75,29]],dark);
  for(const side of[-1,1]){const y=side<0?-33:21;p(edge,-70,y,70,12);p(color,-67,y+1,58,8);p(light,-64,y+1,48,2);p('#1a3544',-75,y+3,9,7);polygon(ctx,[[-5,y],[25,y+4],[28,y+7],[-5,y+10]],shade);}
  polygon(ctx,[[-62,-19],[7,-23],[74,-4],[76,0],[74,4],[7,23],[-62,19]],shade);polygon(ctx,[[-57,-16],[6,-19],[69,-3],[69,2],[6,16],[-57,13]],color);
  pixelLine(ctx,-52,-16,6,-19,light,2);pixelLine(ctx,7,-19,65,-4,light);p('#253f4e',-32,-9,39,18);p('#90a9a9',-29,-10,32,4);p('#7bbbc7',-17,-5,16,10);p('#c5e4d8',-15,-5,11,2);p('#526f7d',-52,-8,14,16);p('#d7bd83',14,-5,23,3);p('#71858b',22,5,19,2);
  for(const[x,y]of[[-34,-24],[-34,24],[18,-17],[18,17]]){p('#233d4b',x-4,y-4,9,9);p('#a5b6ae',x-3,y-3,7,6);p('#c6ceba',x+2,y-1,10,2);}
  for(let x=-50;x<44;x+=12){p('#afcbc2',x,11,4,1);p('#2c4958',x,-12,5,1);}
 }else{
  polygon(ctx,[[-128,-42],[-104,-59],[-65,-64],[47,-48],[105,-24],[132,-5],[134,0],[132,5],[105,24],[47,48],[-65,64],[-104,59],[-128,42]],dark);
  polygon(ctx,[[-122,-38],[-100,-53],[-64,-59],[46,-43],[104,-20],[128,-3],[128,3],[104,20],[46,43],[-64,59],[-100,53],[-122,38]],shade);
  polygon(ctx,[[-104,-29],[-73,-47],[40,-36],[105,-15],[126,-2],[126,2],[42,32],[-75,44],[-104,27]],color);
  pixelLine(ctx,-73,-47,40,-36,light,2);pixelLine(ctx,41,-36,105,-15,light);p('#829aa0',-112,-29,24,58);p('#1a3342',-118,-26,8,52);
  for(const side of[-1,1]){
   const y=side<0?-48:31;p('#2a4554',-78,y,95,17);p('#142e3e',-73,y+3,83,10);for(let x=-68;x<10;x+=12){p('#6e8d95',x,y+4,2,8);p('#c6bc82',x+3,y+5,4,2);}
   polygon(ctx,[[19,side*35],[68,side*29],[90,side*17],[21,side*24]],edge);
   p('#94aaa9',-99,side<0?-56:45,26,10);p('#c8cdb2',-97,side<0?-56:45,21,2);
  }
  p('#294653',-65,-18,105,36);p('#607e89',-62,-16,98,32);p('#9bada7',-59,-16,90,3);p('#1d3e50',-28,-11,49,22);p('#6db7c9',-24,-8,40,16);p('#c1e0d9',-21,-8,32,2);p('#356b80',-8,-5,2,11);p('#356b80',7,-5,2,11);
  p('#bdc7b6',36,-10,37,20);p('#67858d',39,-7,27,14);p('#dfc387',72,-4,29,3);p('#607987',-85,-9,14,18);
  for(const[x,y]of[[-62,-52],[-62,52],[-16,-42],[-16,42],[39,-32],[39,32],[82,-16],[82,16]]){p('#203b4a',x-5,y-5,11,10);p('#a4b6b2',x-4,y-4,9,7);p('#d1d6bd',x+2,y-1,13,2);}
  for(const x of[-86,-70,-54,-38,-22,-6,10,26])for(const y of[-23,22])p('#c6d6bb',x,y,6,2);
  for(const[x,y]of SHIP_VISUALS.capital.thrusters)p('#132e3e',x-3,y-4,9,8);
 }
 // Readable habitation windows and a docking hatch distinguish crew hulls from fighters.
 const berths=getShipClass(shipClass).berths,windows=Math.ceil(berths/2),spacing=shipClass==='sparrow'?8:Math.min(16,profile.length*.075),start=-profile.length*.29;
 for(let i=0;i<windows;i++)for(const side of[-1,1]){const x=start+i*spacing,y=side*profile.width*.19;p('#19313e',x-1,y-1,5,4);p('#b9d7c7',x,y,3,2);}
 const hatchX=-profile.length*.12,hatchY=profile.width*.28;p('#112d3a',hatchX-5,hatchY-4,10,8);p('#94a9a6',hatchX-4,hatchY-3,8,6);p('#294a57',hatchX-2,hatchY-2,4,4);p('#d8c18b',hatchX-5,hatchY-4,3,2);p('#d8c18b',hatchX+2,hatchY+2,3,2);
 if(damage>.2){const r=random(hash(key));for(let i=0;i<Math.floor(damage*14);i++){const x=(r()-.5)*profile.length*.65,y=(r()-.5)*profile.width*.45;p('#273c43',x,y,5+r()*8,2+r()*4);if(damage>.6)p('#c8916f',x+1,y,2,1);}}
 const sprite={canvas:c,length:profile.length,width:profile.width};shipCache.set(key,sprite);if(shipCache.size>120)shipCache.delete(shipCache.keys().next().value);return sprite;
}
/** Backward-compatible positional sprite call. options.size is hull length before scale. */
export function drawShip(ctx,x,y,angle=0,color='#c5d4c9',scale=1,thrust=false,time=0,boost=false,options={}){
 if(typeof angle==='object'){options=angle;angle=options.angle||0;color=options.color||color;scale=options.scale??1;thrust=options.thrust||false;time=options.time||0;boost=options.boost||false;}
 if(typeof boost==='object'){options=boost;boost=options.boost||false;}
 if(typeof options==='string')options={shipClass:options};
 const shipClass=resolveCabinClass(options.shipClassId||options.shipClass||options.classId||'sparrow'),profile=SHIP_VISUALS[shipClass],factor=scale*(options.size?options.size/profile.length:1),sprite=hullSprite(shipClass,color,options.damage||0),margin=82;
 let work=workCanvases.get(shipClass);if(!work){work=makeCanvas(profile.length+margin*2,profile.width+40);workCanvases.set(shipClass,work);}const wc=work.getContext('2d');wc.clearRect(0,0,work.width,work.height);wc.imageSmoothingEnabled=false;const ox=work.width/2,oy=work.height/2;
 if(thrust&&!options.disabled&&options.thrusters!==false){const outlets=Array.isArray(options.thrusters)?options.thrusters:profile.thrusters;
  outlets.forEach((nozzle,i)=>{const nx=Array.isArray(nozzle)?nozzle[0]:nozzle.x,ny=Array.isArray(nozzle)?nozzle[1]:nozzle.y,phase=Math.floor(time*16+i*3)%5,length=(boost?29:13)+(shipClass==='capital'?15:shipClass==='frigate'?7:0)+phase*2;
   pixelRect(wc,boost?'#365e73':'#644d3b',ox+nx-length-8,oy+ny-3,length+6,6);pixelRect(wc,boost?'#6abcc8':'#cc9460',ox+nx-length,oy+ny-2,length,4);pixelRect(wc,boost?'#c1e9db':'#f1d49b',ox+nx-length*.55,oy+ny-1,length*.55+2,2);
   pixelRect(wc,boost?'#77c4c4':'#a77852',ox+nx-length-13-phase,oy+ny+(i%2?1:-2),3,1);
  });
 }
 wc.drawImage(sprite.canvas,Math.round(ox-sprite.canvas.width/2),Math.round(oy-sprite.canvas.height/2));
 if(options.firing){const front=ox+profile.length*.5;pixelRect(wc,'#f3e2b1',front+3,oy-2,7,4);pixelRect(wc,'#c8a568',front+11,oy-1,4,2);}
 if(options.disabled){for(let i=0;i<3;i++){const xx=ox-profile.length*.2+i*9;pixelRect(wc,'#d7a575',xx,oy+Math.sin(time+i)*5,2,2);}}
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(x),Math.round(y));ctx.rotate(angle);ctx.scale(factor,factor);ctx.drawImage(work,-work.width/2,-work.height/2);ctx.restore();
 return{length:profile.length*factor,width:profile.width*factor};
}
function stationSprite(ctx,x,y,r,time,id){
 const cacheKey=id+':'+(Math.sin(time*3)>0?1:0),cached=stationCache.get(cacheKey),cachedScale=Math.max(.62,r/66);if(cached){ctx.drawImage(cached,Math.round(x-96*cachedScale),Math.round(y-96*cachedScale),Math.round(192*cachedScale),Math.round(192*cachedScale));return;}
 const variant=id==='listening'?2:id==='ledger'?1:hash(id)%3,scale=Math.max(.62,r/66),c=makeCanvas(192,192),p=c.getContext('2d'),q=(col,a,b,w,h)=>pixelRect(p,col,a+96,b+96,w,h);
 if(variant===1){
  pixelRing(p,96,96,66,66,'#5e7881',{step:1});pixelRing(p,96,96,57,57,'#2e4b59',{step:1});pixelRing(p,96,96,62,62,'#7b8c86',{step:1});
  for(let i=0;i<8;i++){const a=i/8*TAU,xx=Math.round(Math.cos(a)*63),yy=Math.round(Math.sin(a)*63);pixelLine(p,96,96,xx+96,yy+96,'#304f5d',7);q('#193644',xx-12,yy-9,24,18);q('#6b858b',xx-11,yy-9,22,4);q('#adbca7',xx-7,yy-2,3,2);q('#83b7b0',xx+4,yy-2,3,2);}
 }else{
  q('#1b3443',-67,-15,134,30);q('#1b3443',-15,-67,30,134);q('#5b7580',-67,-15,134,3);q('#435f6e',-15,-65,3,130);
  for(const[a,b,w,h]of[[-79,-29,37,58],[42,-29,37,58],[-29,-79,58,37],[-29,42,58,37]]){q('#1a3443',a,b,w,h);q('#5f7c84',a+2,b+2,w-4,5);q('#355362',a+3,b+8,w-6,h-12);for(let i=7;i<w-8;i+=11){q('#a4b9a2',a+i,b+12,4,2);q('#7eaba5',a+i,b+h-9,4,2);}}
  if(variant===2){for(const side of[-1,1]){pixelLine(p,96+side*35,45,96+side*74,17,'#92a8a9',2);pixelLine(p,96+side*45,42,96+side*65,12,'#5e7d8a',2);q('#a9c5bd',side*69-4,-84,9,5);}}
 }
 q('#6b8a8e',-25,-25,50,50);q('#234755',-21,-21,42,42);q('#8ebeb5',-14,-14,28,28);q('#2c5a66',-10,-10,20,20);q('#c4d5b4',-6,-6,12,3);q('#123746',-4,-1,8,8);
 for(const side of[-1,1]){q('#dabd83',side*72-2,-20,4,3);q('#dabd83',side*72-2,17,4,3);}
 q(Math.sin(time*3)>0?'#ecc88b':'#647d73',-2,-89,4,4);pixelLine(p,96,6,96,18,'#79979c');
 q('#51696d',49,44,35,27);q('#102f3e',52,47,29,20);for(let i=54;i<78;i+=7)q('#bca46f',i,45,4,2);q('#a7c6ad',62,54,9,3);q('#a7c6ad',64,57,5,3);
 stationCache.set(cacheKey,c);if(stationCache.size>40)stationCache.delete(stationCache.keys().next().value);
 ctx.imageSmoothingEnabled=false;ctx.drawImage(c,Math.round(x-96*scale),Math.round(y-96*scale),Math.round(192*scale),Math.round(192*scale));
}
function asteroid(ctx,x,y,r,seed,type,damage=0){
 const rng=random(seed),points=[];for(let i=0;i<9;i++){const a=i/9*TAU,d=r*(.76+rng()*.24);points.push([Math.round(x+Math.cos(a)*d),Math.round(y+Math.sin(a)*d)]);}
 polygon(ctx,points,type==='crystal'?'#385c66':'#4b5961');polygon(ctx,points.map(([a,b])=>[a,b-2]).slice(0,5),type==='crystal'?'#66999b':'#7d8a85');pixelRect(ctx,'#273c48',x+r*.12,y+r*.13,Math.max(3,r*.35),Math.max(2,r*.21));pixelLine(ctx,x-r*.45,y-r*.13,x+r*.14,y+r*.35,'#334851');
 if(type==='crystal'){for(let i=0;i<3;i++){const px=x-r*.3+i*r*.25,py=y-r*.18+(i%2)*r*.25;pixelRect(ctx,'#a8d7c6',px,py,2,Math.max(3,r*.3));pixelRect(ctx,'#70b6ba',px+2,py+2,2,Math.max(2,r*.2));}}else if(seed%3===0)pixelRect(ctx,'#b6a781',x-r*.3,y-r*.3,Math.max(2,r*.23),2);
 if(damage>.2){pixelLine(ctx,x-r*.2,y-r*.3,x+r*.3,y+r*.3,'#192d38');pixelLine(ctx,x+r*.3,y+r*.3,x+r*.5,y,'#192d38');}
}
/** Exterior dimensions follow the deck class, including older enemy snapshots. */
export function vesselVisualProfile(value={}){
 const ship=value.ship||value,kind=resolveCabinClass(ship.shipClassId||ship.shipClass||ship.classId||ship.interiorClassId||value.shipClassId||value.classId||(ship.danger>=3?'hauler':'sparrow')),hull=getShipClass(kind);
 return{shipClass:kind,renderLength:hull.stats.renderLength,renderWidth:hull.stats.renderWidth,berths:hull.berths,subtitle:hull.subtitle};
}
function normalizeShip(value){const ship=value.ship||value;return{...value,...ship,...vesselVisualProfile(value),id:value.id||value.captainId||ship.id,name:ship.name||value.shipName||value.name};}

export class SpaceRenderer{
 constructor(){const rng=random(832);this.stars=Array.from({length:500},()=>({x:rng(),y:rng(),size:rng()>.94?2:1,a:.25+rng()*.7,depth:.035+rng()*.16,color:rng()>.8?'#d5b98e':rng()>.75?'#83b8c5':'#a0bcc4'}));this.planetCache=new Map();this.nebulaCache=new Map();this.camera={x:0,y:0};this.particles=[];this.health=new Map();this.lastSystem=null;this.lastTime=0;}
 planet(body){
  const key=`${body.id}:${body.biome}`;if(this.planetCache.has(key))return this.planetCache.get(key);const c=makeCanvas(160,160),ctx=c.getContext('2d'),p=palettes[body.biome]||palettes.temperate,seed=hash(body.id),rng=random(seed),offset=rng()*100;
  for(let y=0;y<160;y++)for(let x=0;x<160;x++){const dx=(x-79.5)/79,dy=(y-79.5)/79,dist=dx*dx+dy*dy;if(dist>1)continue;const z=Math.sqrt(1-dist),terrain=Math.sin(dx*9+offset+Math.sin(dy*8)*1.5)+Math.cos(dy*11+offset*2+dx*7)*.5+Math.sin(dx*27+dy*17+offset)*.28,grain=rng()*.22;let index=clamp(Math.floor((terrain+1.8+grain)*1.25),0,3);
   if(body.biome==='ice'&&Math.abs(dy)>.62)index=4;
   const clouds=['temperate','earth','garden','ocean','forest'].includes(body.biome)&&Math.sin(dx*12+dy*9+offset)+Math.sin(dy*20+offset)*.7>1.23;if(clouds)index=4;
   const light=clamp(.18+(-dx*.61-dy*.36+z*.58)*.9,.13,1.05);ctx.fillStyle=mix(p[index],light);ctx.fillRect(x,y,1,1);
   if(body.biome==='volcanic'&&terrain>1.14&&light<.7&&rng()>.7)pixelRect(ctx,'#cf8a51',x,y,1,1);
   if(['earth','industrial'].includes(body.biome)&&light<.4&&index>1&&rng()>.985)pixelRect(ctx,'#d5b57b',x,y,1,1);
   if(dist>.96&&dx<.15)pixelRect(ctx,['barren','ruin'].includes(body.biome)?'#7d9296':'#6a9fba',x,y,1,1);
  }
  if(body.biome==='barren'){const r=random(seed+19);for(let i=0;i<9;i++){const xx=35+r()*83,yy=30+r()*95,rr=3+r()*8;if(Math.hypot(xx-80,yy-80)<63)pixelRing(ctx,xx,yy,rr,rr*.76,'#35434e');}}
  this.planetCache.set(key,c);if(this.planetCache.size>50)this.planetCache.delete(this.planetCache.keys().next().value);return c;
 }
 nebula(id){
  if(this.nebulaCache.has(id))return this.nebulaCache.get(id);const c=makeCanvas(512,512),p=c.getContext('2d'),seed=hash(id),r=random(seed),off=r()*20;
  for(let y=0;y<512;y+=4)for(let x=0;x<512;x+=4){const n=Math.sin(x*.008+off)*.5+Math.cos(y*.011+off)*.4+Math.sin((x+y)*.019)*.2,grain=r();if(n>.15&&grain>(n<.5?.55:.18)){p.globalAlpha=clamp((n-.1)*.17,0,.2);pixelRect(p,(seed%3===0)?'#60628d':seed%3===1?'#346f79':'#59694f',x,y,4,4);}}
  p.globalAlpha=1;this.nebulaCache.set(id,c);if(this.nebulaCache.size>5)this.nebulaCache.delete(this.nebulaCache.keys().next().value);return c;
 }
 draw(ctx,game,options={}){
  const{width:w=ctx.canvas.width,height:h=ctx.canvas.height,time=0,welcome=false,tracked=null,guidance='simple',motion=true,labels}=options,s=game.state,ship=normalizeShip(options.ship||s.ship),sys=options.world||game.system||{},profile=SHIP_VISUALS[resolveCabinClass(ship.shipClass)],combatTime=options.combatTime??s.stats?.time??time;
  const frameDt=clamp(options.dt??time-this.lastTime,0,.25),emit=labelSink(ctx,labels,{width:w,height:h}),dt=Math.min(frameDt,.06);this.lastTime=time;
  this.zoom=options.zoom??Math.min(w<330?.70:.82,Math.min(w,h)*.44/(ship.renderLength||profile.length))*normalizeWorldZoom(options.zoomMultiplier);const z=this.zoom;
  const targetX=ship.x+(welcome?-160:0),targetY=ship.y+(welcome?-40:0);
  if(this.lastSystem!==s.systemId){this.camera={x:targetX,y:targetY};this.lastSystem=s.systemId;this.particles=[];this.health.clear();}
  const follow=motion?1-Math.pow(.88,frameDt*60):1;this.camera.x+=(targetX-this.camera.x)*follow;this.camera.y+=(targetY-this.camera.y)*follow;const cx=this.camera.x,cy=this.camera.y;this.w=w;this.h=h;
  // A shared integer origin keeps adjacent world pixels moving together.
  // The eased camera above remains continuous for prediction and follow motion.
  const view=pixelCamera({cameraX:cx,cameraY:cy,width:w,height:h,zoom:z,centered:true});this.view=view;
  const to=(x,y)=>worldToCanvas(x,y,view),visible=(p,r=35)=>p.x>-r&&p.x<w+r&&p.y>-r&&p.y<h+r;
  beginPixelFrame(ctx);ctx.save();pixelRect(ctx,'#06121f',0,0,w,h);
  const nebula=this.nebula(s.systemId||'hearth'),nx=((Math.round(-cx*.024)%512)+512)%512,ny=((Math.round(-cy*.024)%512)+512)%512;for(let yy=ny-512;yy<h;yy+=512)for(let xx=nx-512;xx<w;xx+=512)ctx.drawImage(nebula,xx,yy);
  for(const st of this.stars){const x=((st.x*w*2-cx*st.depth)%(w*2)+w*2)%(w*2),y=((st.y*h*2-cy*st.depth)%(h*2)+h*2)%(h*2);if(x>w||y>h)continue;ctx.globalAlpha=st.a*(motion?.9+Math.sin(time*.3+st.x*45)*.1:1);pixelRect(ctx,st.color,x,y,st.size,st.size);if(st.size===2&&st.a>.8){ctx.globalAlpha=.22;pixelRect(ctx,st.color,x-2,y,6,1);pixelRect(ctx,st.color,x,y-2,1,6);}}ctx.globalAlpha=1;
  const bodies=sys.bodies||[],remoteShips=(options.remoteShips||[]).map(normalizeShip),parkedShips=(sys.parkedShips||[]).map(normalizeShip),enemies=(sys.enemies||[]).filter(e=>!e.promotedVesselId&&!e.canonicalVesselId);
  for(const b of bodies){const p=to(b.x,b.y),radius=(b.radius??b.r??65)*z;if(!visible(p,radius*2+40))continue;
   if(b.kind==='station')stationSprite(ctx,p.x,p.y,Math.max(24,radius),motion?time:0,b.id);
   else{const r=Math.max(18,radius);if(b.rings||b.biome==='arid'||b.biome==='desert'){pixelRing(ctx,p.x,p.y,r*1.56,r*.42,'#6f777180');pixelRing(ctx,p.x,p.y,r*1.72,r*.47,'#aaa88b70');}ctx.drawImage(this.planet(b),Math.round(p.x-r),Math.round(p.y-r),Math.round(r*2),Math.round(r*2));}
   const labelRadius=b.kind==='station'?Math.max(.62,Math.max(24,radius)/66)*86:Math.max(18,radius);
   if(!welcome){emit(b.name,p.x,p.y+labelRadius+13,b.id===tracked?'#efd6a0':'#bbcfcf',b.id===tracked?15:14,'center',b.id===tracked?75:35,'place');if(b.id===tracked)emit(`${b.kind==='station'?'DOCKING PORT':(b.kind||'world').toUpperCase()} · ${Math.round(Math.hypot(b.x-ship.x,b.y-ship.y))} m`,p.x,p.y+labelRadius+26,'#91b4bb',12,'center',50,'distance');}
  }
  for(const a of sys.asteroids||[]){if(a.depleted||a.hp===0||a.health===0)continue;const p=to(a.x,a.y),r=(a.radius??a.r??16)*z;if(visible(p,r))asteroid(ctx,p.x,p.y,r,a.seed??hash(a.id),a.type??a.resource,1-(a.hp??a.health??100)/(a.maxHp??a.maxHealth??100));}
  for(const item of sys.pickups||[]){const p=to(item.x,item.y);if(!visible(p,8))continue;const col=item.type==='ore'?'#ddc78f':'#8fcfc7';pixelRect(ctx,'#213c49',p.x-5,p.y-3,10,7);pixelRect(ctx,col,p.x-3,p.y-2,6,5);pixelRect(ctx,'#e2e5be',p.x-2,p.y-2,3,1);}
  for(const sig of sys.signals||[]){if(sig.resolved)continue;const p=to(sig.x,sig.y);if(!visible(p,45))continue;
   if(sig.kind==='derelict')drawShip(ctx,p.x,p.y,-.25,'#73817f',z*.75,false,time,false,{shipClass:'hauler',damage:.8,disabled:true});
   else{pixelRect(ctx,'#1a3647',p.x-5,p.y-7,10,14);pixelRect(ctx,'#a1c7c4',p.x-4,p.y-6,8,3);pixelRect(ctx,'#5a8e9b',p.x-9,p.y-2,18,4);pixelRect(ctx,'#cfc499',p.x-1,p.y-11,2,5);}
   pixelRing(ctx,p.x,p.y,17+Math.floor((motion?time:0)%2*6),17+Math.floor((motion?time:0)%2*6),'#7dbab477',{dashed:true,phase:time*4});emit(sig.name||'Unidentified signal',p.x,p.y+(sig.kind==='derelict'?34:28),'#9acbc7',13,'center',sig.id===tracked?75:25,'signal');
  }
  // A boarding party leaves two physical hulls in the system. Draw their tether
  // from stable vessel IDs, including when the target is a shared vessel actor.
  const vessels=[ship,...remoteShips,...parkedShips,...(sys.enemies||[]).map(normalizeShip)],findVessel=id=>vessels.find(v=>v.id===id||v.vesselId===id||v.ship?.id===id),links=new Map();
  for(const target of sys.enemies||[])if(target.boardingOriginId&&target.boardingTargetId){const source=findVessel(target.boardingOriginId),to=findVessel(target.canonicalVesselId||target.promotedVesselId||target.id);if(source&&to)links.set(`${source.id}:${to.id}`,{source,target:to,contested:target.occupation?.contested});}
  const boarding=options.boarding||s.boarding;
  if(boarding?.originVesselId&&(boarding.targetVesselId||boarding.vesselId)){const source=findVessel(boarding.originVesselId),target=findVessel(boarding.targetVesselId||boarding.vesselId);if(source&&target&&source!==target)links.set(`${source.id}:${target.id}`,{source,target,contested:boarding.phase==='active'});}
  for(const link of links.values()){
   if((link.source.hull??link.source.hp??1)<=0||(link.target.hull??link.target.hp??1)<=0)continue;
   const a=to(link.source.x,link.source.y),b=to(link.target.x,link.target.y),length=Math.hypot(b.x-a.x,b.y-a.y),color=link.contested?'#d6aa75':'#8ec9bf';
   if(!length||!visible(a,160)&&!visible(b,160))continue;
   ctx.globalAlpha=.68;for(let d=0;d<length;d+=8){const end=Math.min(d+4,length);pixelLine(ctx,a.x+(b.x-a.x)*d/length,a.y+(b.y-a.y)*d/length,a.x+(b.x-a.x)*end/length,a.y+(b.y-a.y)*end/length,color);}ctx.globalAlpha=1;
   emit(link.contested?'BOARDING LINK':'DOCKING LINK',(a.x+b.x)/2,(a.y+b.y)/2-13,color,12,'center',62,'boarding-link');
  }
  const paintVessel=(v,{remote=false,enemy=false,traffic=false,self=false,parked=false}={})=>{
   const data=normalizeShip(v),kind=resolveCabinClass(data.shipClass),pr=SHIP_VISUALS[kind],p=to(data.x,data.y),length=(data.renderLength||pr.length)*z;if(!visible(p,length))return;
   const hull=data.hull??data.hp??100,maxHull=data.maxHull??data.maxHp??100,disabled=data.disabled||data.disabledUntil>combatTime,speed=Math.hypot(data.vx||0,data.vy||0),hostile=(enemy||data.hostile===true)&&data.hostile!==false&&!data.capturedBy,col=self?'#c6d5c8':data.color|| (hostile?'#bb8d7b':remote||parked?'#9bbdc3':'#889fa8');
   if(hull<=0||data.dead)return;
   drawShip(ctx,p.x,p.y,data.angle||0,col,z,traffic||speed>10,motion?time:0,data.boosting||data.boost,{shipClass:kind,size:data.renderLength,damage:1-hull/maxHull,disabled,thrusters:data.thrusters,firing:(data.lastShot?.until||0)>combatTime});
   if((data.shield||0)>0&&(self||data.shieldHitUntil>combatTime)){ctx.globalAlpha=data.shieldHitUntil>combatTime?.55:.15;pixelRing(ctx,p.x,p.y,length*.57,(data.renderWidth||pr.width)*z*.68,'#8bced5');ctx.globalAlpha=1;}
   if(enemy){
    const barWidth=clamp(length*.55,30,70),labelY=p.y+data.renderWidth*z*.6+8;
    pixelRect(ctx,'#543b3c',p.x-barWidth/2,p.y-data.renderWidth*z*.6-7,barWidth,3);pixelRect(ctx,disabled?'#d9bf85':'#dc9781',p.x-barWidth/2,p.y-data.renderWidth*z*.6-7,barWidth*clamp(hull/maxHull,0,1),3);
    emit(data.name||'Hostile vessel',p.x,labelY,disabled?'#e6cc8c':'#e8b09a',13,'center',disabled?86:55,disabled?'boarding':'hostile');
    if(disabled||data.occupation?.contested||data.capturedBy){const status=data.occupation?.contested?'CONTESTED':data.capturedBy?'SECURED':data.boardable===false?'DISABLED':'BOARD';emit(`${status} · ${data.berths} BERTHS · ${data.subtitle.toUpperCase()}`,p.x,labelY+13,data.capturedBy?'#a8d7c9':'#c9b995',12,'center',85,'boarding');}
   }
   if(remote)emit(data.name||data.displayName||'Independent captain',p.x,p.y+(data.renderWidth||pr.width)*z*.6+10,'#add9d7',14,'center',70,'remote');
   if(parked){emit(data.name||'Parked vessel',p.x,p.y+data.renderWidth*z*.6+10,'#b7d2c6',14,'center',72,'parked');emit('PARKED · BOARD',p.x,p.y+data.renderWidth*z*.6+23,'#93b7b3',12,'center',65,'boarding');}
   const old=this.health.get(data.id|| (self?'player':null));if(old!==undefined&&hull<old&&motion)for(let i=0;i<7;i++)this.particles.push({x:data.x,y:data.y,vx:Math.cos(i*1.8+time)*35,vy:Math.sin(i*1.8+time)*35,ttl:.3+i*.035,color:i%2?'#d9b77f':'#97c0bd'});this.health.set(data.id||(self?'player':null),hull);
  };
  for(const t of sys.traffic||[])paintVessel(t,{traffic:true});
  for(const e of enemies)paintVessel(e,{enemy:true});
  for(const parked of parkedShips)if(!remoteShips.some(remote=>remote.id===parked.id||remote.ship?.id===parked.id)&&ship.id!==parked.id)paintVessel(parked,{parked:true});
  for(const remote of remoteShips)paintVessel(remote,{remote:true});
  for(const b of sys.bullets||[]){const p=to(b.x,b.y);if(!visible(p,12))continue;const col=b.owner==='player'||b.friendly?'#eddfaa':'#e8a182',back=to(b.x-(b.vx||Math.cos(b.angle||0)*400)*.018,b.y-(b.vy||Math.sin(b.angle||0)*400)*.018);pixelLine(ctx,p.x,p.y,back.x,back.y,col,2);pixelRect(ctx,'#fff0c6',p.x,p.y,2,2);}
  const sp=to(ship.x,ship.y);let mining=ship.miningTarget||sys.miningTarget||game.miningTarget;if(typeof mining==='string')mining=(sys.asteroids||[]).find(a=>a.id===mining);
  if(mining){const p=to(mining.x,mining.y);ctx.globalAlpha=.35;pixelLine(ctx,sp.x,sp.y,p.x,p.y,'#69cdbd',3);ctx.globalAlpha=1;pixelLine(ctx,sp.x,sp.y,p.x,p.y,'#c9f2d5');for(let i=0;i<5;i++){const a=time*13+i*1.3,d=2+(i*3+time*21)%11;pixelRect(ctx,i%2?'#eedba2':'#a8dbc3',p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,1,1);}}
  paintVessel(ship,{self:true});
  for(const particle of this.particles){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.ttl-=dt;const p=to(particle.x,particle.y);ctx.globalAlpha=clamp(particle.ttl*3,0,1);pixelRect(ctx,particle.color,p.x,p.y,2,1);}ctx.globalAlpha=1;this.particles=this.particles.filter(p=>p.ttl>0).slice(-150);
  if(!welcome&&guidance!=='expert'){
   const target=[...bodies,...(sys.signals||[]),...(sys.asteroids||[]),...enemies,...parkedShips,...remoteShips].find(b=>b.id===tracked);
   if(target){const p=to(target.x,target.y),d=Math.hypot(target.x-ship.x,target.y-ship.y);if(p.x<25||p.x>w-25||p.y<25||p.y>h-35){const ex=clamp(p.x,18,w-18),ey=clamp(p.y,28,h-35),angle=Math.atan2(p.y-sp.y,p.x-sp.x);const ax=ex+Math.cos(angle)*6,ay=ey+Math.sin(angle)*6;pixelLine(ctx,ax,ay,ex+Math.cos(angle+2.5)*5,ey+Math.sin(angle+2.5)*5,'#e6cb91',2);pixelLine(ctx,ax,ay,ex+Math.cos(angle-2.5)*5,ey+Math.sin(angle-2.5)*5,'#e6cb91',2);emit(`${target.name||'Mining belt'} · ${Math.round(d)} m`,ex+(ex>w/2?-9:9),ey-4,'#e8d4a4',13,ex>w/2?'right':'left',100,'objective');}else{pixelRing(ctx,p.x,p.y,Math.max(15,(target.radius||20)*z+7),Math.max(15,(target.radius||20)*z+7),'#d9c38b66',{dashed:true});}}
  }
  if(s.jumpFlash>0){ctx.globalAlpha=Math.min(.5,s.jumpFlash*.3);pixelRect(ctx,'#acdcd2',0,0,w,h);ctx.globalAlpha=1;}
  ctx.restore();return{cameraX:view.cameraX,cameraY:view.cameraY,zoom:z,width:w,height:h,offsetX:view.offsetX,offsetY:view.offsetY};
 }
 toWorld(x,y){return this.view?canvasToWorld(x,y,this.view):{x:(x-this.w/2)/this.zoom+this.camera.x,y:(y-this.h/2)/this.zoom+this.camera.y};}
 radar(ctx,game,tracked){const w=ctx.canvas.width,h=ctx.canvas.height,s=game.state.ship,sys=game.system||{},cx=w/2,cy=h/2,r=Math.min(w,h)/2-8;ctx.clearRect(0,0,w,h);for(const n of[.3,.65,1])pixelRing(ctx,cx,cy,r*n,r*n,'#35536288');pixelLine(ctx,cx-r,cy,cx+r,cy,'#2b475466');pixelLine(ctx,cx,cy-r,cx,cy+r,'#2b475466');const scale=r/1900,dot=(x,y,col,size=3)=>{const px=cx+(x-s.x)*scale,py=cy+(y-s.y)*scale;if(Math.hypot(px-cx,py-cy)>r)return;pixelRect(ctx,col,px-size/2,py-size/2,size,size);};for(const a of sys.asteroids||[])if(!a.depleted)dot(a.x,a.y,'#536768',2);for(const b of sys.bodies||[])dot(b.x,b.y,b.id===tracked?'#ebcf99':'#8bbfb5',b.kind==='station'?5:7);for(const e of sys.enemies||[])if(!e.dead)dot(e.x,e.y,'#db8870',4);for(const p of sys.signals||[])if(!p.resolved)dot(p.x,p.y,'#aab5d3',4);pixelLine(ctx,cx,cy,cx+Math.cos(s.angle||0)*7,cy+Math.sin(s.angle||0)*7,'#eee6c4',2);}
}
