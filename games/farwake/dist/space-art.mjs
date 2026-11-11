import {pixelRect,pixelLine,pixelRing,labelSink} from './pixel-art.mjs';
import {resolveCabinClass} from './interior-layouts.mjs';
import {getShipClass} from './fleet.mjs';
import {beginPixelFrame,pixelCamera,worldToCanvas,canvasToWorld} from './render-viewport.mjs';
import {normalizeShipZoom} from './camera-view.mjs';
import {cosmicInfluence,COSMIC_RULES} from './galaxy-expansion.mjs';
import {portProfile} from './port-traffic.mjs';
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
 capital:{length:260,width:128,thrusters:[[-125,-44],[-122,-27],[-119,-10],[-119,10],[-122,27],[-125,44]]},
 kestrel:{length:56,width:30,thrusters:[[-26,-8],[-26,8]]},
 mule:{length:70,width:48,thrusters:[[-33,-17],[-33,17]]},
 petrel:{length:90,width:52,thrusters:[[-43,-18],[-43,18]]},
 marten:{length:126,width:76,thrusters:[[-60,-26],[-60,0],[-60,26]]},
 atlas:{length:214,width:116,thrusters:[[-104,-44],[-104,-23],[-104,23],[-104,44]]},
 tern:{length:78,width:50,thrusters:[[-37,-15],[-37,15]]},
 quill:{length:110,width:58,thrusters:[[-53,-13],[-50,0],[-53,13]]},
 mender:{length:126,width:76,thrusters:[[-61,-8],[-61,8]]},
 bulwark:{length:166,width:100,thrusters:[[-80,-22],[-78,0],[-80,22]]},
 cairn:{length:188,width:136,thrusters:[[-91,-34],[-91,-11],[-91,11],[-91,34]]},
 lark:{length:92,width:58,thrusters:[[-44,-18],[-44,18]]},
 puffin:{length:124,width:78,thrusters:[[-60,-24],[-58,0],[-60,24]]},
 osprey:{length:166,width:94,thrusters:[[-80,-24],[-77,-8],[-77,8],[-80,24]]},
 leviathan:{length:330,width:176,thrusters:[[-162,-55],[-159,-28],[-157,0],[-159,28],[-162,55]]},
 judicator:{length:500,width:280,thrusters:[[-247,-96],[-247,-64],[-247,-32],[-247,0],[-247,32],[-247,64],[-247,96]]}
};
const palettes={temperate:['#193d48','#2f6d70','#598f7d','#b5b982','#c4d1bd'],earth:['#183e56','#2b6d79','#5e956f','#a7b88b','#d5ddcb'],forest:['#173e42','#356b56','#6a8b58','#a7a16c','#c5caa6'],garden:['#183e46','#3c7772','#6b9f75','#a8b787','#d7dbc2'],arid:['#674a3b','#a07554','#c29e70','#dec59b','#f0dcbd'],desert:['#694a3c','#a37652','#c79e69','#d7b77e','#ebd2a7'],ice:['#244056','#4c788a','#83afbc','#c4d6d6','#edf2e4'],ocean:['#183d59','#2b6581','#5c96a1','#84aea2','#d6e0cc'],volcanic:['#342e39','#5e4042','#8c5545','#c47851','#e8ac6d'],industrial:['#34343b','#61545a','#8a7a71','#b59f7e','#d2c6a3'],ruin:['#343f42','#62766c','#8b9b82','#b4b59a','#d1d2b8'],barren:['#343b47','#58616b','#7d8990','#a3ada8','#d1d4c2'],station:['#233b4a','#385560','#718d8e','#a4b4a5','#d9d6b4']};
const shipCache=new Map(),workCanvases=new Map(),stationCache=new Map();
const blackHoleCache=new Map();
function blackHoleSprite(phase){
 const frame=((phase%4)+4)%4;if(blackHoleCache.has(frame))return blackHoleCache.get(frame);
 const c=makeCanvas(256,184),ctx=c.getContext('2d'),x=128,y=92;
 // Four small integer-pixel frames are shared by every stellar remnant.
 for(const [rx,ry,color] of [[117,36,'#60424b'],[111,32,'#b06c54'],[104,29,'#e1a470'],[97,26,'#f1ce91'],[91,23,'#8c5860']])pixelRing(ctx,x,y,rx,ry,color,{width:2,step:1});
 for(let i=0;i<=75;i++){const a=Math.PI+i/75*Math.PI;pixelRect(ctx,'#7e85a2',x+Math.cos(a)*48,y+Math.sin(a)*58,2,2);}
 for(let yy=-43;yy<=43;yy++){const half=Math.sqrt(43*43-yy*yy);pixelRect(ctx,'#03070f',x-half,y+yy,half*2+1,1);}
 pixelRing(ctx,x,y,44,44,'#8a83a1',{width:2,step:1});pixelRing(ctx,x,y,41,41,'#202233',{step:1});
 for(let i=0;i<=90;i++){const a=i/90*Math.PI;pixelRect(ctx,i%7===frame?'#fff0bc':'#dba06c',x+Math.cos(a)*105,y+Math.sin(a)*29,2,2);}
 for(let i=0;i<20;i++){const a=(i/20+frame/80)*TAU;const xx=x+Math.cos(a)*111,yy=y+Math.sin(a)*32;if(Math.hypot(xx-x,yy-y)>45)pixelRect(ctx,i%3?'#e5ba80':'#fff0bd',xx,yy,3,2);}
 blackHoleCache.set(frame,c);return c;
}
function hazardBoundary(ctx,x,y,radius,color,{width,height,rasterScale=1,dashed=true}={}){
 const step=2*rasterScale,n=Math.min(1100,Math.max(72,Math.ceil(radius*Math.PI/step)));
 for(let i=0;i<n;i++){
  if(dashed&&i%8>=4)continue;const a=i/n*TAU,px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;
  if(px<0||py<0||px>width||py>height)continue;
  pixelRect(ctx,color,px,py,rasterScale,rasterScale);
 }
}
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
 }else if(shipClass==='kestrel'){
  // A narrow arrowhead and swept engine wings distinguish the scout at a glance.
  polygon(ctx,[[-28,-11],[-17,-15],[-4,-9],[27,-2],[28,0],[27,2],[-4,9],[-17,15],[-28,11]],dark);
  polygon(ctx,[[-23,-7],[-4,-7],[25,-1],[25,1],[-4,7],[-23,7]],shade);
  polygon(ctx,[[-18,-6],[-2,-6],[20,-1],[20,1],[-2,5],[-18,5]],color);
  p(light,-16,-6,13,2);p('#1f3b4b',1,-4,13,7);p('#7ec6d0',3,-3,9,5);p('#d5e4c6',4,-3,6,1);
  for(const side of[-1,1]){const y=side<0?-13:8;polygon(ctx,[[-26,y],[-17,y],[-8,y+3],[-23,y+5]],edge);p(color,-24,y,9,3);p('#17313f',-28,y+1,5,3);}
  p('#dfc68a',-13,-3,5,6);pixelLine(ctx,16,-2,26,-2,light);p('#6b939e',-5,-13,2,5);p('#bddecd',-5,-14,2,2);
 }else if(shipClass==='mule'){
  // Forward salvage jaws enclose an open cradle rather than a pointed bow.
  polygon(ctx,[[-35,-18],[-25,-24],[27,-24],[35,-18],[35,-10],[8,-10],[8,10],[35,10],[35,18],[27,24],[-25,24],[-35,18]],dark);
  p(edge,-31,-19,28,38);p(color,-28,-17,25,34);p(light,-26,-17,21,3);p('#41606a',-31,-11,7,22);
  for(const side of[-1,1]){const y=side<0?-22:12;p(shade,-7,y,36,10);p(color,-5,y+1,31,7);p(light,-4,y+1,26,2);p('#d7ae67',25,y+1,8,7);p('#573f35',29,y+1,2,7);p('#17313f',-35,side<0?-20:14,7,7);}
  p('#1b3443',-19,-8,18,16);p('#7fb8ba',-16,-6,11,10);p('#d2e0ca',-15,-6,8,2);p('#b5a07c',-21,10,15,4);
  p('#586b6c',3,-7,3,14);p('#d3b67c',6,-6,4,3);p('#d3b67c',6,3,4,3);for(const y of[-15,12])for(let x=1;x<21;x+=6)p('#253e47',x,y,3,3);
 }else if(shipClass==='petrel'){
  // Long survey nacelles flank a slim pressure hull and a visible listening dish.
  polygon(ctx,[[-44,-11],[-25,-15],[13,-12],[44,-4],[45,0],[44,4],[13,12],[-25,15],[-44,11]],dark);
  p(edge,-31,-22,50,44);p('#193441',-27,-18,42,36);p(shade,-30,-12,57,24);
  for(const side of[-1,1]){const y=side<0?-25:16;p('#152d3d',-44,y,66,10);p(color,-40,y+1,58,7);p(light,-38,y+1,51,2);p('#1c3847',-45,y+2,7,6);p('#9dd2c7',14,y+2,7,3);pixelLine(ctx,24,side*20,37,side*12,'#8baea6',2);}
  polygon(ctx,[[-33,-10],[13,-9],[42,-3],[42,3],[13,8],[-33,10]],color);p(light,-29,-10,38,2);
  p('#213b4b',19,-6,15,12);p('#8bbfc9',21,-4,10,8);p('#c4e2d5',22,-4,7,1);
  pixelRing(ctx,-9,0,9,8,'#516f7d',{step:1});pixelRing(ctx,-9,0,6,6,'#c9d3b4',{step:1});pixelLine(ctx,-9,-7,-9,7,'#9ab9b4');pixelLine(ctx,-16,0,-2,0,'#9ab9b4');p('#d2bb83',-10,-1,3,3);
 }else if(shipClass==='marten'){
  // Armored shoulders and paired forward pulse mounts make the escort recognizable.
  polygon(ctx,[[-63,-26],[-49,-38],[12,-35],[56,-17],[63,-7],[63,7],[56,17],[12,35],[-49,38],[-63,26]],dark);
  polygon(ctx,[[-58,-23],[-46,-33],[10,-30],[48,-15],[55,-6],[55,6],[48,15],[10,30],[-46,33],[-58,23]],shade);
  polygon(ctx,[[-50,-18],[-36,-27],[12,-24],[43,-12],[51,0],[43,12],[12,24],[-36,27],[-50,18]],color);
  pixelLine(ctx,-34,-27,12,-24,light,2);p('#708894',-58,-16,14,32);p('#172f3e',-63,-5,8,10);
  for(const side of[-1,1]){const y=side<0?-32:22;p(edge,-42,y,40,10);p(light,-39,y,32,2);p('#2d4654',7,side<0?-23:14,34,9);p('#9caea8',12,side<0?-22:15,31,6);p('#c6c9b3',32,side<0?-20:17,29,3);p('#172e3d',-62,side<0?-29:22,8,7);}
  p('#294452',-26,-13,37,26);p('#91aaa8',-23,-12,31,4);p('#234350',-17,-6,24,12);p('#7fb7c7',-14,-4,17,8);p('#d4e2c8',-12,-4,12,2);p('#dfbd7c',15,-4,20,7);p('#243f4d',19,-3,12,5);
  for(const x of[-39,-23,-7]){p('#344d5b',x,12,10,3);p('#a6b6ac',x,12,10,1);}
 }else if(shipClass==='atlas'){
  // A broad industrial stern carries two long salvage arms and an exposed cradle.
  polygon(ctx,[[-107,-45],[-92,-58],[17,-58],[107,-43],[107,-25],[19,-21],[19,21],[107,25],[107,43],[17,58],[-92,58],[-107,45]],dark);
  p(edge,-101,-48,101,96);p(shade,-96,-44,91,88);p(color,-90,-39,74,78);p(light,-87,-39,67,3);
  for(const side of[-1,1]){const y=side<0?-53:27;polygon(ctx,[[-18,y],[17,y-2],[101,y+8],[101,y+23],[-18,y+24]],shade);p(color,-15,y+3,107,17);p(light,-12,y+3,99,3);p('#c5aa70',89,y+5,14,12);for(let x=-3;x<85;x+=16){p('#25414e',x,y+7,10,8);p('#6d9097',x+1,y+8,8,2);}}
  p('#1d3745',-77,-23,55,46);p('#637f87',-73,-20,47,40);p('#bbcbba',-69,-20,39,3);p('#244957',-57,-12,29,24);p('#82bbc3',-54,-9,21,18);p('#c4e0ca',-52,-9,17,2);
  p('#1e3947',-12,-19,26,38);p('#799590',-9,-16,18,32);for(const y of[-11,1]){p('#a19375',-7,y,14,8);p('#d7be87',-5,y,10,2);}
  for(const y of[-42,-24,18,36]){p('#193341',-107,y,10,9);p('#8eaaa6',-95,y+1,8,7);}
  for(let y=-27;y<=24;y+=17){p('#506b74',-87,y,10,11);p('#9fb7ac',-86,y,8,2);}pixelLine(ctx,15,-21,78,-21,'#8da6a2',2);pixelLine(ctx,15,21,78,21,'#8da6a2',2);
 }else if(shipClass==='tern'){
  // A blunt shuttle nose and a broad glazed saloon: visibly one size above a starter.
  polygon(ctx,[[-39,-18],[-30,-25],[23,-25],[39,-12],[39,12],[23,25],[-30,25],[-39,18]],dark);
  polygon(ctx,[[-34,-16],[-27,-21],[21,-21],[34,-10],[34,10],[21,21],[-27,21],[-34,16]],shade);
  p(color,-27,-18,46,36);p(light,-24,-18,39,3);polygon(ctx,[[18,-18],[33,-9],[33,9],[18,18]],color);
  p('#1d3949',18,-11,12,22);p('#84c8ca',21,-8,7,16);p('#d5e3ce',22,-8,5,2);
  for(const side of[-1,1]){const y=side<0?-19:15;p('#d7bd83',-22,y,37,4);p('#24434e',-21,side<0?-13:8,31,5);for(let x=-18;x<8;x+=8)p('#90c1bd',x,side<0?-12:9,5,3);p('#1a3544',-39,side<0?-18:11,7,7);}
  p('#65858a',-32,-9,11,18);p('#b7c5ad',-30,-9,7,3);p('#ad9878',-13,-5,17,10);p('#715f50',-10,-3,11,6);
 }else if(shipClass==='quill'){
  // A long dispatch nose and swept, ribbon-like drive shoulders.
  polygon(ctx,[[-55,-16],[-42,-29],[-16,-23],[17,-11],[55,-3],[55,3],[17,11],[-16,23],[-42,29],[-55,16]],dark);
  for(const side of[-1,1]){polygon(ctx,[[-51,side*14],[-41,side*25],[-16,side*20],[16,side*9],[-17,side*12]],shade);pixelLine(ctx,-40,side*24,-16,side*19,light,2);p(color,-44,side<0?-21:13,20,8);p('#1a3443',-55,side<0?-16:10,7,6);p('#e0bf7e',-33,side<0?-20:14,8,2);}
  polygon(ctx,[[-45,-10],[-15,-13],[20,-8],[52,-2],[52,2],[20,8],[-15,13],[-45,10]],color);
  pixelLine(ctx,-16,-13,20,-8,light,2);pixelLine(ctx,20,-8,49,-2,light);p('#67858d',-49,-7,12,14);p('#203b4c',-4,-7,25,14);p('#8cc5d1',-1,-5,17,10);p('#d3e8d7',0,-5,13,2);
  p('#a9b7aa',-28,-6,17,12);p('#3c5961',-26,-3,13,6);p('#dcbd82',24,-2,17,4);p('#193341',-54,-3,8,6);
 }else if(shipClass==='mender'){
  // Medical side pods form the same cross-shaped plan as the treatment ward.
  polygon(ctx,[[-63,-13],[-30,-13],[-30,-38],[25,-38],[25,-15],[63,-10],[63,10],[25,15],[25,38],[-30,38],[-30,13],[-63,13]],dark);
  p(edge,-27,-35,49,70);p(shade,-24,-32,43,64);p(color,-22,-30,39,60);p(light,-20,-30,35,3);
  p(edge,-59,-10,116,20);p(color,-55,-8,108,16);p(light,-52,-8,99,2);
  for(const side of[-1,1]){const y=side<0?-31:19;p('#afc6b4',-20,y,35,12);p('#598d88',-17,y+2,29,8);for(let x=-14;x<12;x+=9)p('#b8d8cb',x,y+3,5,5);p('#7fb1a1',-29,side<0?-27:18,5,9);}
  p('#1c3b4b',31,-8,19,16);p('#94ced0',34,-6,12,12);p('#d6e9d6',35,-6,9,2);p('#94b9ad',-13,-11,23,22);p('#dae1c7',-6,-8,8,16);p('#dae1c7',-10,-4,16,8);p('#6c9b8b',-6,-4,8,8);
  p('#657f88',-50,-9,16,18);p('#273f4b',-63,-11,8,7);p('#273f4b',-63,4,8,7);for(const y of[-35,31])p('#d3c695',-8,y,15,3);
 }else if(shipClass==='bulwark'){
  // Armored shoulders protect a central magazine and three exposed pulse barrels.
  polygon(ctx,[[-83,-24],[-64,-50],[22,-50],[70,-30],[83,-14],[83,14],[70,30],[22,50],[-64,50],[-83,24]],dark);
  polygon(ctx,[[-77,-22],[-60,-44],[20,-44],[65,-26],[76,-12],[76,12],[65,26],[20,44],[-60,44],[-77,22]],shade);
  polygon(ctx,[[-65,-24],[-51,-37],[15,-37],[54,-22],[64,-9],[64,9],[54,22],[15,37],[-51,37],[-65,24]],color);
  pixelLine(ctx,-50,-37,15,-37,light,2);pixelLine(ctx,15,-37,54,-22,light,2);p('#718890',-75,-19,18,38);
  for(const side of[-1,1]){const y=side<0?-43:30;p(edge,-53,y,65,13);p(light,-49,y+1,54,2);for(let x=-44;x<9;x+=14){p('#2b4653',x,y+4,9,7);p('#a2b4a9',x,y+4,9,2);}p('#203847',34,side<0?-25:14,36,11);p('#aeb9ae',40,side<0?-23:16,37,7);p('#d4c6a5',62,side<0?-21:18,23,3);p('#183340',-82,side<0?-25:18,9,8);}
  p('#283e4a',-35,-20,55,40);p('#788f92',-32,-17,49,34);p('#bbc8b9',-30,-17,45,3);p('#233f4d',-21,-11,31,22);p('#7db9c5',-18,-8,23,16);p('#d1e2cf',-16,-8,18,2);
  p('#3b5460',22,-6,44,12);p('#b7bda9',39,-4,43,8);p('#e2cea4',65,-2,23,4);p('#233a49',-83,-5,9,10);p('#d3ac78',-50,-5,10,10);
 }else if(shipClass==='cairn'){
  // Broad paired ore tanks surround the inhabited control spine and rear service deck.
  polygon(ctx,[[-94,-43],[-74,-68],[52,-68],[94,-34],[94,34],[52,68],[-74,68],[-94,43]],dark);
  polygon(ctx,[[-87,-39],[-69,-61],[49,-61],[86,-30],[86,30],[49,61],[-69,61],[-87,39]],shade);
  p(edge,-78,-54,126,108);p(color,-74,-49,118,98);p(light,-70,-49,110,3);
  for(const side of[-1,1]){const y=side<0?-59:24;p('#25434d',-69,y,115,35);p('#8b9180',-65,y+3,106,29);p('#c0ac81',-61,y+3,98,3);for(let x=-58;x<36;x+=22){p('#516e72',x,y+8,16,19);p('#a5b5a2',x+1,y+8,14,3);p('#c9ad73',x+5,y+13,6,12);}polygon(ctx,[[45,y+2],[78,side<0?-34:25],[78,side<0?-24:34],[45,y+30]],edge);p('#c9ad73',70,side<0?-35:25,16,10);}
  p('#37535c',-68,-18,130,36);p(color,-61,-15,120,30);p(light,-57,-15,109,3);p('#788f91',-20,-18,48,36);p('#b1c1af',-17,-18,42,3);p('#234552',22,-11,38,22);p('#8cc1c4',26,-8,28,16);p('#dae5ce',28,-8,22,2);
  for(let x=-56;x<-25;x+=12){p('#bea57b',x,-9,8,18);p('#7b6b53',x+2,-6,4,12);}p('#d0b780',64,-5,24,10);p('#695b43',69,-3,3,6);p('#695b43',77,-3,3,6);
  for(const y of[-38,-15,8,31]){p('#193341',-94,y,11,9);p('#8ca5a0',-80,y,8,8);}
 }else if(shipClass==='lark'){
  // A small communal cabin, visible chart skylight and paired service shoulders.
  polygon(ctx,[[-46,-20],[-34,-29],[19,-26],[42,-12],[46,0],[42,12],[19,26],[-34,29],[-46,20]],dark);
  polygon(ctx,[[-40,-17],[-31,-24],[16,-22],[37,-10],[41,0],[37,10],[16,22],[-31,24],[-40,17]],shade);
  p(color,-32,-20,45,40);p(light,-29,-20,39,3);polygon(ctx,[[12,-19],[34,-9],[40,0],[34,9],[12,19]],color);
  for(const side of[-1,1]){const y=side<0?-26:17;p(edge,-38,y,30,9);p('#9eb3a6',-34,y+1,22,6);p('#d7bf87',-30,y+2,4,4);p('#1b3443',-46,side<0?-21:14,9,7);}
  p('#1d3b49',18,-10,17,20);p('#8ec9ca',21,-7,10,14);p('#d3e5d0',22,-7,7,2);
  p('#617f86',-19,-11,30,22);p('#b7c7b7',-17,-11,26,3);p('#244551',-12,-6,18,12);p('#8cacaa',-9,-4,12,8);p('#cfbd91',-5,-3,4,6);
  p('#667d80',-38,-9,11,18);p('#344c57',-35,-6,5,12);p('#c1ab7f',-23,12,15,3);
 }else if(shipClass==='puffin'){
  // A broad civilian transport with a wraparound saloon and working cargo hatches.
  polygon(ctx,[[-62,-27],[-48,-39],[30,-39],[62,-20],[62,20],[30,39],[-48,39],[-62,27]],dark);
  polygon(ctx,[[-56,-24],[-45,-34],[27,-34],[55,-17],[55,17],[27,34],[-45,34],[-56,24]],shade);
  p(color,-44,-29,69,58);p(light,-41,-29,63,3);polygon(ctx,[[25,-29],[52,-15],[56,0],[52,15],[25,29]],color);
  for(const side of[-1,1]){const y=side<0?-34:23;p('#c4b18c',-39,y,63,11);p('#405d66',-35,y+2,55,6);for(let x=-31;x<19;x+=10){p('#8cbfb9',x,y+3,6,4);p('#d5dfc2',x,y+3,4,1);}p('#1b3443',-61,side<0?-27:18,10,9);}
  p('#294550',27,-20,22,40);polygon(ctx,[[29,-18],[48,-10],[48,10],[29,18]],'#8fc3c6');pixelLine(ctx,31,-16,46,-9,'#d4e4d1',2);p('#456b74',37,-14,2,28);
  p('#6f8b8e',-45,-16,28,32);p('#a5b9aa',-42,-16,22,3);for(const y of[-11,3]){p('#273f48',-40,y,20,10);p('#b39b75',-37,y+2,14,6);p('#d0bc8b',-35,y+2,9,2);}
  p('#496872',-9,-15,29,30);p('#a3b4aa',-6,-14,23,27);p('#d1ccb0',-4,-14,19,3);p('#6f8e8b',-2,-5,15,10);p('#173341',-62,-5,9,10);
 }else if(shipClass==='osprey'){
  // Swept expedition shoulders carry long habitable pods, with a shared workroom roof.
  polygon(ctx,[[-83,-27],[-70,-44],[-18,-47],[28,-34],[77,-12],[83,0],[77,12],[28,34],[-18,47],[-70,44],[-83,27]],dark);
  polygon(ctx,[[-77,-24],[-66,-38],[-19,-41],[26,-29],[72,-9],[77,0],[72,9],[26,29],[-19,41],[-66,38],[-77,24]],shade);
  for(const side of[-1,1]){polygon(ctx,[[-67,side*32],[-21,side*39],[30,side*25],[43,side*17],[-62,side*21]],color);pixelLine(ctx,-63,side*32,-21,side*38,light,2);p('#314e57',-59,side<0?-32:22,31,10);p('#b6b799',-56,side<0?-31:23,25,3);p('#1a3442',-81,side<0?-29:21,11,8);}
  polygon(ctx,[[-68,-18],[-26,-26],[31,-21],[75,-5],[79,0],[75,5],[31,21],[-26,26],[-68,18]],color);
  pixelLine(ctx,-25,-26,30,-21,light,2);pixelLine(ctx,31,-21,71,-6,light,2);
  p('#4e6a74',-43,-17,62,34);p('#94aca5',-39,-14,54,28);p('#c3cfb9',-36,-14,48,3);p('#385762',-27,-8,29,16);p('#83b5b4',-24,-6,23,12);p('#bdc9ad',-20,-4,15,8);
  polygon(ctx,[[35,-13],[64,-7],[69,0],[64,7],[35,13]],'#23434f');polygon(ctx,[[39,-9],[60,-5],[64,0],[60,5],[39,9]],'#8dc4ca');pixelLine(ctx,40,-9,59,-5,'#d3e7d1',2);
  p('#78918e',-70,-14,18,28);for(const y of[-10,4]){p('#273f4b',-67,y,12,7);p('#bdac82',-64,y+2,6,3);}p('#b7a279',20,-4,13,8);
 }else if(shipClass==='leviathan'){
  // A purpose-built mobile yard: long open booms, broad habitat and a full repair hall.
  polygon(ctx,[[-165,-66],[-142,-88],[48,-88],[165,-66],[165,-41],[30,-35],[30,35],[165,41],[165,66],[48,88],[-142,88],[-165,66]],dark);
  polygon(ctx,[[-157,-61],[-138,-79],[36,-79],[30,-44],[20,-39],[20,39],[30,44],[36,79],[-138,79],[-157,61]],shade);
  p(edge,-146,-69,158,138);p(color,-138,-62,139,124);p(light,-133,-62,128,4);
  for(const side of[-1,1]){
   const y=side<0?-81:43;polygon(ctx,[[-12,y],[45,y],[157,side<0?-62:47],[157,side<0?-45:62],[38,y+31],[-12,y+31]],shade);
   polygon(ctx,[[-7,y+5],[42,y+5],[151,side<0?-59:51],[151,side<0?-49:60],[37,y+26],[-7,y+26]],color);
   pixelLine(ctx,2,side<0?-75:52,145,side<0?-58:57,light,3);
   for(let x=8;x<135;x+=26){const yy=side*(66-(x-8)*.1);p('#26434c',x,yy-7,17,14);p('#79978f',x+2,yy-5,13,10);p('#baa77b',x+5,yy-4,6,8);}
   p('#bd9d63',142,side<0?-65:45,18,18);p('#5e503b',148,side<0?-64:46,3,16);
   pixelLine(ctx,31,side*35,145,side*40,'#a2b5a3',2);
  }
  // Separate repair and medical roofs are visible, as on the walkable deck.
  p('#29434e',-117,-49,88,38);p('#879c91',-112,-45,78,30);p('#c4c4a4',-108,-45,70,3);for(let x=-105;x<-37;x+=19){p('#455f64',x,-38,13,18);p('#a99973',x+2,-35,9,11);}
  p('#29434e',-117,11,88,38);p('#7d9c93',-112,15,78,30);p('#b8ccba',-108,15,70,3);for(let x=-103;x<-39;x+=18){p('#5e8e88',x,23,12,13);p('#b7d1bf',x+3,26,6,7);}
  p('#294653',-76,-19,88,38);p('#698891',-71,-15,77,30);p('#b7c7b5',-67,-15,69,3);p('#203f4c',-38,-9,38,18);p('#8ec6c9',-34,-6,29,12);p('#d3e4cb',-31,-6,22,2);
  p('#7e918a',-143,-52,19,104);for(const y of[-53,-27,-1,25,51]){p('#19313f',-163,y-8,21,16);p('#4c6873',-156,y-5,11,10);p('#8da9a7',-151,y-4,4,8);}
  for(const y of[-64,57])for(let x=-117;x<-24;x+=15){p('#334f59',x,y,10,5);p('#bdd1b4',x+2,y+1,5,2);}p('#ad986d',3,-12,14,24);p('#554b38',6,-9,3,18);p('#554b38',12,-9,2,18);
 }else if(shipClass==='judicator'){
  // An armored line destroyer, drawn at its native 500-pixel length. Stepped
  // superstructure and a recessed seven-engine stern give the wedge real scale.
  polygon(ctx,[[-250,-122],[-230,-140],[-165,-132],[245,-9],[250,0],[245,9],[-165,132],[-230,140],[-250,122]],dark);
  polygon(ctx,[[-242,-116],[-225,-132],[-166,-124],[236,-8],[242,0],[236,8],[-166,124],[-225,132],[-242,116]],shade);
  polygon(ctx,[[-224,-116],[-165,-119],[218,-6],[131,-9],[-181,-41],[-224,-44]],color);
  polygon(ctx,[[-224,116],[-165,119],[218,6],[131,9],[-181,41],[-224,44]],mix(color,.84));
  pixelLine(ctx,-222,-117,-165,-120,light,3);pixelLine(ctx,-164,-119,224,-7,light,2);
  pixelLine(ctx,-223,117,-164,120,edge,3);pixelLine(ctx,-163,120,225,7,edge,2);
  // Recesses, armor seams and narrow lit galleries remain readable at overview zoom.
  for(const side of[-1,1]){
   polygon(ctx,[[-210,side*91],[-165,side*98],[104,side*21],[67,side*19],[-171,side*74],[-210,side*69]],'#35505b');
   pixelLine(ctx,-207,side*89,-166,side*94,'#758e92',2);pixelLine(ctx,-165,side*94,93,side*23,'#758e92',2);
   for(let index=0;index<10;index++){const x=-194+index*31,y=side*(100-index*8.6);pixelLine(ctx,x,y,x+12,y-side*13,shade,2);p('#cfdbc4',x+3,y-side*6,4,2);}
   for(let index=0;index<8;index++){const x=-191+index*32,y=side*(61-index*6.2);p('#233d48',x,y-3,17,6);p('#8a9f98',x+2,y-2,12,2);}
  }
  polygon(ctx,[[-207,-26],[-102,-30],[211,-4],[235,0],[211,4],[-102,30],[-207,26]],'#425f6b');
  polygon(ctx,[[-197,-19],[-101,-23],[204,-3],[222,0],[204,3],[-101,23],[-197,19]],mix(color,1.02));
  pixelLine(ctx,-190,-19,-102,-23,light,2);pixelLine(ctx,-101,-23,196,-3,light,2);
  for(let x=-55;x<170;x+=31){p('#5c7780',x,-8,18,16);p('#aabbb0',x+2,-8,14,2);p('#314b57',x+3,-3,12,5);}
  // Raised bridge terraces are physically aft of the forward plot and galleries.
  p('#132c3b',-172,-43,97,86);p('#4f6975',-167,-38,87,76);p('#93a9aa',-162,-34,77,68);p('#c5d0bd',-157,-34,67,4);
  p('#2e4855',-154,-25,61,50);p('#6a8791',-149,-22,51,44);p('#abc0b9',-145,-22,43,3);
  polygon(ctx,[[-146,-38],[-129,-47],[-112,-38],[-105,-13],[-105,13],[-112,38],[-129,47],[-146,38]],'#445f6d');
  p('#a5bab5',-141,-29,27,58);p('#dae0c9',-138,-29,21,3);p('#244754',-137,-21,19,42);p('#83b9c4',-134,-18,13,36);
  for(const y of[-12,-1,10])p('#416e7b',-134,y,13,3);
  for(const side of[-1,1]){pixelRing(ctx,-127,side*48,9,8,'#708b95',{step:1});pixelRing(ctx,-127,side*48,6,5,'#c0cec0',{step:1});p('#a1bcb3',-129,side*48-2,4,4);}
  // The paired banks match the optional local muzzle geometry used by the authority.
  for(const [x,y] of [[-95,-96],[125,-32],[125,32],[-95,96]]){p('#1d3643',x-18,y-8,22,16);p('#829c9f',x-15,y-6,16,12);p('#c9d0b9',x-12,y-6,12,2);p('#d0c6a6',x-7,y-3,17,2);p('#d0c6a6',x-7,y+1,17,2);}
  // Engines sit inside a dark stern recess instead of hanging off an enlarged scout.
  p('#0d2636',-248,-112,26,224);p('#536f7b',-222,-110,6,220);p('#99aea7',-220,-108,2,216);
  for(const [,y] of SHIP_VISUALS.judicator.thrusters){p('#344f60',-246,y-12,23,24);p('#77919b',-244,y-10,18,20);p('#203e51',-244,y-7,13,14);p('#547f91',-242,y-5,8,10);p('#8cabb2',-239,y-3,3,6);}
  p('#b8c6b4',-206,-10,16,20);p('#557b86',-202,-6,8,12);
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
 const berths=getShipClass(shipClass).berths,windows=Math.ceil(berths/2),spacing=shipClass==='sparrow'?8:Math.min(16,profile.length*.075),start=shipClass==='mender'?-24:-profile.length*.29;
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
  outlets.forEach((nozzle,i)=>{const nx=Array.isArray(nozzle)?nozzle[0]:nozzle.x,ny=Array.isArray(nozzle)?nozzle[1]:nozzle.y,phase=Math.floor(time*16+i*3)%5,length=(boost?29:13)+(profile.length>=300?22:shipClass==='capital'?15:shipClass==='frigate'?7:0)+phase*2;
   pixelRect(wc,boost?'#365e73':'#644d3b',ox+nx-length-8,oy+ny-3,length+6,6);pixelRect(wc,boost?'#6abcc8':'#cc9460',ox+nx-length,oy+ny-2,length,4);pixelRect(wc,boost?'#c1e9db':'#f1d49b',ox+nx-length*.55,oy+ny-1,length*.55+2,2);
   pixelRect(wc,boost?'#77c4c4':'#a77852',ox+nx-length-13-phase,oy+ny+(i%2?1:-2),3,1);
  });
 }
 wc.drawImage(sprite.canvas,Math.round(ox-sprite.canvas.width/2),Math.round(oy-sprite.canvas.height/2));
 if(options.firing){const mounts=getShipClass(shipClass).systems.pulseMuzzles||[[profile.length*.5,0]];for(const [mx,my] of mounts){const front=ox+mx;pixelRect(wc,'#f3e2b1',front+3,oy+my-2,7,4);pixelRect(wc,'#c8a568',front+11,oy+my-1,4,2);}}
 if(options.disabled){for(let i=0;i<3;i++){const xx=ox-profile.length*.2+i*9;pixelRect(wc,'#d7a575',xx,oy+Math.sin(time+i)*5,2,2);}}
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(x),Math.round(y));ctx.rotate(angle);ctx.scale(factor,factor);ctx.drawImage(work,-work.width/2,-work.height/2);ctx.restore();
 return{length:profile.length*factor,width:profile.width*factor};
}
function stationSprite(ctx,x,y,r,time,id,minScale=.62){
 const cacheKey=id+':'+(Math.sin(time*3)>0?1:0),cached=stationCache.get(cacheKey),cachedScale=Math.max(minScale,r/66);if(cached){ctx.drawImage(cached,Math.round(x-96*cachedScale),Math.round(y-96*cachedScale),Math.round(192*cachedScale),Math.round(192*cachedScale));return;}
 const variant=id==='listening'?2:id==='ledger'?1:hash(id)%3,scale=Math.max(minScale,r/66),c=makeCanvas(192,192),p=c.getContext('2d'),q=(col,a,b,w,h)=>pixelRect(p,col,a+96,b+96,w,h);
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
function asteroid(ctx,x,y,r,seed,type,damage=0,detailScale=1){
 const rng=random(seed),points=[];for(let i=0;i<9;i++){const a=i/9*TAU,d=r*(.76+rng()*.24);points.push([Math.round(x+Math.cos(a)*d),Math.round(y+Math.sin(a)*d)]);}
 polygon(ctx,points,type==='crystal'?'#385c66':'#4b5961');polygon(ctx,points.map(([a,b])=>[a,b-2*detailScale]).slice(0,5),type==='crystal'?'#66999b':'#7d8a85');pixelRect(ctx,'#273c48',x+r*.12,y+r*.13,Math.max(3*detailScale,r*.35),Math.max(2*detailScale,r*.21));pixelLine(ctx,x-r*.45,y-r*.13,x+r*.14,y+r*.35,'#334851',detailScale);
 if(type==='crystal'){for(let i=0;i<3;i++){const px=x-r*.3+i*r*.25,py=y-r*.18+(i%2)*r*.25;pixelRect(ctx,'#a8d7c6',px,py,2*detailScale,Math.max(3*detailScale,r*.3));pixelRect(ctx,'#70b6ba',px+2*detailScale,py+2*detailScale,2*detailScale,Math.max(2*detailScale,r*.2));}}else if(seed%3===0)pixelRect(ctx,'#b6a781',x-r*.3,y-r*.3,Math.max(2*detailScale,r*.23),2*detailScale);
 if(damage>.2){pixelLine(ctx,x-r*.2,y-r*.3,x+r*.3,y+r*.3,'#192d38',detailScale);pixelLine(ctx,x+r*.3,y+r*.3,x+r*.5,y,'#192d38',detailScale);}
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
  const rasterScale=Number.isFinite(options.rasterScale)&&options.rasterScale>=1?options.rasterScale:1,r=rasterScale,frameWidth=w/r,frameHeight=h/r,zoomMultiplier=normalizeShipZoom(options.zoomMultiplier);
  // Frame the ship in the established game units, then sample at the chosen
  // raster density. More display pixels must never make the camera zoom in.
  const framing=Math.min(frameWidth<330?.70:.82,Math.min(frameWidth,frameHeight)*.44/(ship.renderLength||profile.length));
  this.zoom=(options.zoom??framing*zoomMultiplier)*r;const z=this.zoom;
  const targetX=ship.x+(welcome?-160:0),targetY=ship.y+(welcome?-40:0);
  if(this.lastSystem!==s.systemId){this.camera={x:targetX,y:targetY};this.lastSystem=s.systemId;this.particles=[];this.health.clear();}
  const follow=motion?1-Math.pow(.88,frameDt*60):1;this.camera.x+=(targetX-this.camera.x)*follow;this.camera.y+=(targetY-this.camera.y)*follow;const cx=this.camera.x,cy=this.camera.y;this.w=w;this.h=h;
  // A shared integer origin keeps adjacent world pixels moving together.
  // The eased camera above remains continuous for prediction and follow motion.
  const view=pixelCamera({cameraX:cx,cameraY:cy,width:w,height:h,zoom:z,centered:true});this.view=view;
  const to=(x,y)=>worldToCanvas(x,y,view),visible=(p,margin=35*r)=>p.x>-margin&&p.x<w+margin&&p.y>-margin&&p.y<h+margin,ring={width:r,step:2*r},bodyMinScale=r*Math.min(1,zoomMultiplier);
  beginPixelFrame(ctx);ctx.save();pixelRect(ctx,'#06121f',0,0,w,h);
  const nebula=this.nebula(s.systemId||'hearth'),tile=512*r,nx=((Math.round(-cx*.024*r)%tile)+tile)%tile,ny=((Math.round(-cy*.024*r)%tile)+tile)%tile;for(let yy=ny-tile;yy<h;yy+=tile)for(let xx=nx-tile;xx<w;xx+=tile)ctx.drawImage(nebula,xx,yy,tile,tile);
  for(const st of this.stars){const x=((st.x*w*2-cx*st.depth*r)%(w*2)+w*2)%(w*2),y=((st.y*h*2-cy*st.depth*r)%(h*2)+h*2)%(h*2);if(x>w||y>h)continue;ctx.globalAlpha=st.a*(motion?.9+Math.sin(time*.3+st.x*45)*.1:1);pixelRect(ctx,st.color,x,y,st.size*r,st.size*r);if(st.size===2&&st.a>.8){ctx.globalAlpha=.22;pixelRect(ctx,st.color,x-2*r,y,6*r,r);pixelRect(ctx,st.color,x,y-2*r,r,6*r);}}ctx.globalAlpha=1;
  const bodies=sys.bodies||[],remoteShips=(options.remoteShips||[]).map(normalizeShip),parkedShips=(sys.parkedShips||[]).map(normalizeShip),enemies=(sys.enemies||[]).filter(e=>!e.promotedVesselId&&!e.canonicalVesselId);
  const stellarHazard=cosmicInfluence(ship,bodies).hazard;
  for(const b of bodies){const p=to(b.x,b.y),radius=(b.radius??b.r??65)*z,well=b.kind==='blackhole',margin=well?(b.warningRadius||COSMIC_RULES.warningRadius)*z:radius*2+40*r;if(!visible(p,margin))continue;
   if(well){
    hazardBoundary(ctx,p.x,p.y,(b.warningRadius||COSMIC_RULES.warningRadius)*z,'#ccaa6a88',{width:w,height:h,rasterScale:r});
    hazardBoundary(ctx,p.x,p.y,(b.tideRadius||COSMIC_RULES.tideRadius)*z,'#d9857177',{width:w,height:h,rasterScale:r});
    if(visible(p,radius*3)){const core=Math.max(9*r,radius),sprite=blackHoleSprite(motion?Math.floor(time*.6)%4:0);ctx.drawImage(sprite,Math.round(p.x-core*128/43),Math.round(p.y-core*92/43),Math.round(core*256/43),Math.round(core*184/43));}
   }
   else if(b.kind==='station')stationSprite(ctx,p.x,p.y,Math.max(24*bodyMinScale,radius),motion?time:0,b.id,.62*bodyMinScale);
   else{const radiusPx=Math.max(18*bodyMinScale,radius);if(b.rings||b.biome==='arid'||b.biome==='desert'){pixelRing(ctx,p.x,p.y,radiusPx*1.56,radiusPx*.42,'#6f777180',ring);pixelRing(ctx,p.x,p.y,radiusPx*1.72,radiusPx*.47,'#aaa88b70',ring);}ctx.drawImage(this.planet(b),Math.round(p.x-radiusPx),Math.round(p.y-radiusPx),Math.round(radiusPx*2),Math.round(radiusPx*2));}
   const labelRadius=well?Math.max(9*r,radius)*1.5:b.kind==='station'?Math.max(.62*bodyMinScale,Math.max(24*bodyMinScale,radius)/66)*86:Math.max(18*bodyMinScale,radius);
   if(!welcome){emit(b.name,p.x,p.y+labelRadius+13*r,well?'#e7bd87':b.id===tracked?'#efd6a0':'#bbcfcf',b.id===tracked?15:14,'center',b.id===tracked?75:35,'place');if(well||b.id===tracked){const port=portProfile(sys,b);emit(`${well?'BLACK HOLE · NO LANDING':port?.restricted?'MILITARY · CLEARANCE':port?.label?.toUpperCase()||(b.kind||'world').toUpperCase()} · ${Math.round(Math.hypot(b.x-ship.x,b.y-ship.y))} m`,p.x,p.y+labelRadius+26*r,well?'#c5a58b':port?.restricted?'#d6b997':'#91b4bb',12,'center',50,'distance');}}
  }
  if(!welcome&&stellarHazard){const danger=stellarHazard.level==='danger';emit(stellarHazard.warning,w/2,32*r,danger?'#f2b3a0':'#edd3a2',14,'center',120,'hazard');}
  for(const a of sys.asteroids||[]){if(a.depleted||a.hp===0||a.health===0)continue;const p=to(a.x,a.y),radius=(a.radius??a.r??16)*z;if(visible(p,radius))asteroid(ctx,p.x,p.y,radius,a.seed??hash(a.id),a.type??a.resource,1-(a.hp??a.health??100)/(a.maxHp??a.maxHealth??100),r*Math.min(1,zoomMultiplier));}
  for(const item of sys.pickups||[]){const p=to(item.x,item.y);if(!visible(p,8*r))continue;const col=item.type==='ore'?'#ddc78f':'#8fcfc7';pixelRect(ctx,'#213c49',p.x-5*r,p.y-3*r,10*r,7*r);pixelRect(ctx,col,p.x-3*r,p.y-2*r,6*r,5*r);pixelRect(ctx,'#e2e5be',p.x-2*r,p.y-2*r,3*r,r);}
  for(const sig of sys.signals||[]){if(sig.resolved)continue;const p=to(sig.x,sig.y);if(!visible(p,45*r))continue;
   if(sig.kind==='derelict')drawShip(ctx,p.x,p.y,-.25,'#73817f',z*.75,false,time,false,{shipClass:'hauler',damage:.8,disabled:true});
   else{pixelRect(ctx,'#1a3647',p.x-5*r,p.y-7*r,10*r,14*r);pixelRect(ctx,'#a1c7c4',p.x-4*r,p.y-6*r,8*r,3*r);pixelRect(ctx,'#5a8e9b',p.x-9*r,p.y-2*r,18*r,4*r);pixelRect(ctx,'#cfc499',p.x-r,p.y-11*r,2*r,5*r);}
   const signalRadius=(17+Math.floor((motion?time:0)%2*6))*r;pixelRing(ctx,p.x,p.y,signalRadius,signalRadius,'#7dbab477',{...ring,dashed:true,phase:time*4});emit(sig.name||'Unidentified signal',p.x,p.y+(sig.kind==='derelict'?34:28)*r,'#9acbc7',13,'center',sig.id===tracked?75:25,'signal');
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
   if(!length||!visible(a,160*r)&&!visible(b,160*r))continue;
   ctx.globalAlpha=.68;for(let d=0;d<length;d+=8*r){const end=Math.min(d+4*r,length);pixelLine(ctx,a.x+(b.x-a.x)*d/length,a.y+(b.y-a.y)*d/length,a.x+(b.x-a.x)*end/length,a.y+(b.y-a.y)*end/length,color,r);}ctx.globalAlpha=1;
   emit(link.contested?'BOARDING LINK':'DOCKING LINK',(a.x+b.x)/2,(a.y+b.y)/2-13*r,color,12,'center',62,'boarding-link');
  }
  const paintVessel=(v,{remote=false,enemy=false,traffic=false,self=false,parked=false}={})=>{
   const data=normalizeShip(v),kind=resolveCabinClass(data.shipClass),pr=SHIP_VISUALS[kind],p=to(data.x,data.y),length=(data.renderLength||pr.length)*z;if(!visible(p,length))return;
   const hull=data.hull??data.hp??100,maxHull=data.maxHull??data.maxHp??100,disabled=data.disabled||data.disabledUntil>combatTime,speed=Math.hypot(data.vx||0,data.vy||0),hostile=(enemy||data.hostile===true)&&data.hostile!==false&&!data.capturedBy,col=self?'#c6d5c8':data.color|| (hostile?'#bb8d7b':remote||parked?'#9bbdc3':'#889fa8');
   if(hull<=0||data.dead)return;
   drawShip(ctx,p.x,p.y,data.angle||0,col,z,speed>(traffic?4:10),motion?time:0,data.boosting||data.boost,{shipClass:kind,size:data.renderLength,damage:1-hull/maxHull,disabled,thrusters:data.thrusters,firing:(data.lastShot?.until||0)>combatTime});
   if((data.shield||0)>0&&(self||data.shieldHitUntil>combatTime)){ctx.globalAlpha=data.shieldHitUntil>combatTime?.55:.15;pixelRing(ctx,p.x,p.y,length*.57,(data.renderWidth||pr.width)*z*.68,'#8bced5',ring);ctx.globalAlpha=1;}
   // At overview range a small hull stays its true size. Separate brackets and
   // a heading tick identify the contact without exaggerating its collision or
   // boarding footprint, or replacing its art with an undiscovered ship type.
   if(zoomMultiplier<=.45&&length/r<18){
    const mark=self?'#c6dfcf':hostile?'#dca18b':'#8fbec7',radius=Math.max(length*.63,8*r),corner=3*r;
    for(const side of[-1,1])for(const vertical of[-1,1]){const x=p.x+side*radius,y=p.y+vertical*radius;pixelLine(ctx,x,y,x-side*corner,y,mark,r);pixelLine(ctx,x,y,x,y-vertical*corner,mark,r);}
    const angle=data.angle||0;pixelLine(ctx,p.x+Math.cos(angle)*(radius+2*r),p.y+Math.sin(angle)*(radius+2*r),p.x+Math.cos(angle)*(radius+5*r),p.y+Math.sin(angle)*(radius+5*r),mark,r);
   }
   if(enemy){
    const barWidth=clamp(length*.55,30*r,70*r),labelY=p.y+data.renderWidth*z*.6+8*r;
    pixelRect(ctx,'#543b3c',p.x-barWidth/2,p.y-data.renderWidth*z*.6-7*r,barWidth,3*r);pixelRect(ctx,disabled?'#d9bf85':'#dc9781',p.x-barWidth/2,p.y-data.renderWidth*z*.6-7*r,barWidth*clamp(hull/maxHull,0,1),3*r);
    emit(data.name||'Hostile vessel',p.x,labelY,disabled?'#e6cc8c':'#e8b09a',13,'center',disabled?86:55,disabled?'boarding':'hostile');
    if(disabled||data.occupation?.contested||data.capturedBy){const status=data.occupation?.contested?'CONTESTED':data.capturedBy?'SECURED':data.boardable===false?'DISABLED':'BOARD';emit(`${status} · ${data.berths} BERTHS · ${data.subtitle.toUpperCase()}`,p.x,labelY+13*r,data.capturedBy?'#a8d7c9':'#c9b995',12,'center',85,'boarding');}
   }
   if(remote)emit(data.name||data.displayName||'Independent captain',p.x,p.y+(data.renderWidth||pr.width)*z*.6+10*r,'#add9d7',14,'center',70,'remote');
   if(traffic&&data.peacekeeper&&!welcome){const labelY=p.y+data.renderWidth*z*.6+11*r;emit(data.name||'Peacekeeping vessel',p.x,labelY,'#c1d5ce',14,'center',58,'peacekeeper');emit(`${data.faction==='freewake'?'FREEWAKE':String(data.faction||'LOCAL').toUpperCase()} · PEACEKEEPING`,p.x,labelY+14*r,'#8fafa9',12,'center',42,'peacekeeper-role');}
   if(parked){emit(data.name||'Parked vessel',p.x,p.y+data.renderWidth*z*.6+10*r,'#b7d2c6',14,'center',72,'parked');emit('PARKED · BOARD',p.x,p.y+data.renderWidth*z*.6+23*r,'#93b7b3',12,'center',65,'boarding');}
   const old=this.health.get(data.id|| (self?'player':null));if(old!==undefined&&hull<old&&motion)for(let i=0;i<7;i++)this.particles.push({x:data.x,y:data.y,vx:Math.cos(i*1.8+time)*35,vy:Math.sin(i*1.8+time)*35,ttl:.3+i*.035,color:i%2?'#d9b77f':'#97c0bd'});this.health.set(data.id||(self?'player':null),hull);
  };
  for(const t of sys.traffic||[])paintVessel(t,{traffic:true});
  for(const e of enemies)paintVessel(e,{enemy:true});
  for(const parked of parkedShips)if(!remoteShips.some(remote=>remote.id===parked.id||remote.ship?.id===parked.id)&&ship.id!==parked.id)paintVessel(parked,{parked:true});
  for(const remote of remoteShips)paintVessel(remote,{remote:true});
  for(const b of sys.bullets||[]){const p=to(b.x,b.y);if(!visible(p,12*r))continue;const col=b.owner==='player'||b.friendly?'#eddfaa':'#e8a182',back=to(b.x-(b.vx||Math.cos(b.angle||0)*400)*.018,b.y-(b.vy||Math.sin(b.angle||0)*400)*.018);pixelLine(ctx,p.x,p.y,back.x,back.y,col,2*r);pixelRect(ctx,'#fff0c6',p.x,p.y,2*r,2*r);}
  const sp=to(ship.x,ship.y);let mining=ship.miningTarget||sys.miningTarget||game.miningTarget;if(typeof mining==='string')mining=(sys.asteroids||[]).find(a=>a.id===mining);
  if(mining){const p=to(mining.x,mining.y);ctx.globalAlpha=.35;pixelLine(ctx,sp.x,sp.y,p.x,p.y,'#69cdbd',3*r);ctx.globalAlpha=1;pixelLine(ctx,sp.x,sp.y,p.x,p.y,'#c9f2d5',r);for(let i=0;i<5;i++){const a=time*13+i*1.3,d=(2+(i*3+time*21)%11)*r;pixelRect(ctx,i%2?'#eedba2':'#a8dbc3',p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,r,r);}}
  paintVessel(ship,{self:true});
  for(const particle of this.particles){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.ttl-=dt;const p=to(particle.x,particle.y);ctx.globalAlpha=clamp(particle.ttl*3,0,1);pixelRect(ctx,particle.color,p.x,p.y,2*r,r);}ctx.globalAlpha=1;this.particles=this.particles.filter(p=>p.ttl>0).slice(-150);
  if(!welcome&&guidance!=='expert'){
   const target=[...bodies,...(sys.signals||[]),...(sys.asteroids||[]),...enemies,...parkedShips,...remoteShips,...(options.waypoint?[options.waypoint]:[])].find(b=>b.id===tracked);
   if(target){const p=to(target.x,target.y),d=Math.hypot(target.x-ship.x,target.y-ship.y);if(p.x<25*r||p.x>w-25*r||p.y<25*r||p.y>h-35*r){const ex=clamp(p.x,18*r,w-18*r),ey=clamp(p.y,28*r,h-35*r),angle=Math.atan2(p.y-sp.y,p.x-sp.x);const ax=ex+Math.cos(angle)*6*r,ay=ey+Math.sin(angle)*6*r;pixelLine(ctx,ax,ay,ex+Math.cos(angle+2.5)*5*r,ey+Math.sin(angle+2.5)*5*r,'#e6cb91',2*r);pixelLine(ctx,ax,ay,ex+Math.cos(angle-2.5)*5*r,ey+Math.sin(angle-2.5)*5*r,'#e6cb91',2*r);emit(`${target.name||'Mining belt'} · ${Math.round(d)} m`,ex+(ex>w/2?-9:9)*r,ey-4*r,'#e8d4a4',13,ex>w/2?'right':'left',100,'objective');}else{pixelRing(ctx,p.x,p.y,Math.max(15*r,(target.radius||20)*z+7*r),Math.max(15*r,(target.radius||20)*z+7*r),'#d9c38b66',{...ring,dashed:true});}}
  }
  if(s.jumpFlash>0){ctx.globalAlpha=Math.min(.5,s.jumpFlash*.3);pixelRect(ctx,'#acdcd2',0,0,w,h);ctx.globalAlpha=1;}
  ctx.restore();return{cameraX:view.cameraX,cameraY:view.cameraY,zoom:z,width:w,height:h,offsetX:view.offsetX,offsetY:view.offsetY};
 }
 toWorld(x,y){return this.view?canvasToWorld(x,y,this.view):{x:(x-this.w/2)/this.zoom+this.camera.x,y:(y-this.h/2)/this.zoom+this.camera.y};}
 radar(ctx,game,tracked){const w=ctx.canvas.width,h=ctx.canvas.height,s=game.state.ship,sys=game.system||{},cx=w/2,cy=h/2,r=Math.min(w,h)/2-8;ctx.clearRect(0,0,w,h);for(const n of[.3,.65,1])pixelRing(ctx,cx,cy,r*n,r*n,'#35536288');pixelLine(ctx,cx-r,cy,cx+r,cy,'#2b475466');pixelLine(ctx,cx,cy-r,cx,cy+r,'#2b475466');const scale=r/1900,dot=(x,y,col,size=3)=>{const px=cx+(x-s.x)*scale,py=cy+(y-s.y)*scale;if(Math.hypot(px-cx,py-cy)>r)return;pixelRect(ctx,col,px-size/2,py-size/2,size,size);};for(const a of sys.asteroids||[])if(!a.depleted)dot(a.x,a.y,'#536768',2);for(const b of sys.bodies||[]){if(b.kind==='blackhole'){const px=cx+(b.x-s.x)*scale,py=cy+(b.y-s.y)*scale;if(Math.hypot(px-cx,py-cy)<r){pixelRing(ctx,px,py,6,6,b.id===tracked?'#f0d6a0':'#d09b78');pixelRect(ctx,'#03070f',px-2,py-2,4,4);}}else dot(b.x,b.y,b.id===tracked?'#ebcf99':'#8bbfb5',b.kind==='station'?5:7);}for(const e of sys.enemies||[])if(!e.dead)dot(e.x,e.y,'#db8870',4);for(const p of sys.signals||[])if(!p.resolved)dot(p.x,p.y,'#aab5d3',4);pixelLine(ctx,cx,cy,cx+Math.cos(s.angle||0)*7,cy+Math.sin(s.angle||0)*7,'#eee6c4',2);}
}
