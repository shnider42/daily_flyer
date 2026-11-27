/** Native pixel hulls at their actual physical scale; no simulation state is changed. */
import {FACTION_SUPERCAPITAL_HULLS,SUPERCAPITAL_OUTLINES} from './faction-supercapital-content.mjs';
import {pixelRect} from './pixel-art.mjs';

const mix=(color,factor)=>{const value=parseInt(color.replace('#',''),16);return'#'+[value>>16&255,value>>8&255,value&255].map(n=>Math.max(0,Math.min(255,Math.round(n*factor))).toString(16).padStart(2,'0')).join('');};
const inside=(x,y,points)=>{let found=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])found=!found;}return found;};
const thrusters={bastion:[[-1075,-230],[-1075,-115],[-1075,0],[-1075,115],[-1075,230]],commonwealth:[[-965,-180],[-965,-90],[-965,90],[-965,180]],dominion:[[-1015,-160],[-1015,-60],[-1015,45],[-1015,130]],palimpsest:[[-865,-95],[-865,0],[-865,95]],crucible:[[-915,-220],[-915,-110],[-915,0],[-915,110],[-915,220]]};
export const SUPERCAPITAL_VISUALS=Object.freeze(Object.fromEntries(FACTION_SUPERCAPITAL_HULLS.map(hull=>[hull.id,Object.freeze({length:hull.stats.renderLength,width:hull.stats.renderWidth,thrusters:Object.freeze(thrusters[hull.id].map(point=>Object.freeze(point))),outline:SUPERCAPITAL_OUTLINES[hull.id]})])));

/** Scanline rasterization also works with the game's small software test canvas. */
function polygon(ctx,points,color,step=3){
 const first=Math.floor(Math.min(...points.map(p=>p[1]))),last=Math.ceil(Math.max(...points.map(p=>p[1])));
 for(let y=first;y<last;y+=step){const line=y+step/2,crossings=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>line)!==(b[1]>line))crossings.push(a[0]+(line-a[1])*(b[0]-a[0])/(b[1]-a[1]));}crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)pixelRect(ctx,color,Math.ceil(crossings[i]),y,Math.max(1,Math.floor(crossings[i+1])-Math.ceil(crossings[i])),Math.min(step,last-y));}
}

export function drawFactionSupercapitalHull(ctx,{shipClass,color='#b7c6c8',damage=0}={}){
 const profile=SUPERCAPITAL_VISUALS[shipClass];if(!profile)return false;
 const outline=profile.outline,light=mix(color,1.16),shade=mix(color,.63),dark='#172b37',accent={bastion:'#8db7d6',commonwealth:'#99d0b3',dominion:'#d7bd81',palimpsest:'#c3b0dc',crucible:'#dfa180'}[shipClass];
 const panel=(x,y,w,h,tint=color)=>{if([[x,y],[x+w,y],[x,y+h],[x+w,y+h]].every(([a,b])=>inside(a,b,outline))){pixelRect(ctx,dark,x-2,y-2,w+4,h+4);pixelRect(ctx,tint,x,y,w,h);pixelRect(ctx,light,x+2,y+2,w-4,3);return true;}return false;};
 polygon(ctx,outline,dark);polygon(ctx,outline.map(([x,y])=>[x*.986,y*.96]),shade);polygon(ctx,outline.map(([x,y])=>[x*.975,y*.925]),color);
 // Repeated hull modules establish scale without enlarging a small-ship sprite.
 const offset={bastion:0,commonwealth:25,dominion:50,palimpsest:75,crucible:100}[shipClass];
 for(let x=-profile.length*.42;x<profile.length*.43;x+=112)for(let y=-profile.width*.4;y<profile.width*.4;y+=72){
  const px=Math.round(x),py=Math.round(y),warm=((Math.floor((x+offset)/112)+Math.floor(y/72))%3+3)%3;
  if(panel(px,py,84,48,warm===1?mix(color,.83):mix(color,.95))){pixelRect(ctx,'#435c67',px+9,py+17,62,5);for(let n=0;n<5;n++)pixelRect(ctx,n%2?accent:'#b8d5c9',px+10+n*12,py+31,4,2);}
 }
 if(shipClass==='bastion'){
  panel(-670,-83,1220,166,shade);panel(-420,-54,360,108,light);panel(35,-46,420,92,mix(color,.88));
  panel(-370,-33,250,66,'#7196ab');for(let x=-330;x<-140;x+=27)pixelRect(ctx,'#b1d5df',x,-21,10,4);
  for(const side of[-1,1])for(let x=-530;x<620;x+=190){panel(x,side*180-21,88,42,'#536d7c');pixelRect(ctx,accent,x+8,side*180-3,63,6);}
 }else if(shipClass==='commonwealth'){
  panel(-620,-54,1370,108,shade);for(const x of[-700,420])for(const side of[-1,1]){panel(x,side*255-62,220,124,mix(color,1.04));panel(x+28,side*255-36,155,72,'#54776f');for(let i=0;i<9;i++)pixelRect(ctx,'#d4dfc2',x+35+i*16,side*255-18,5,3);}
  panel(555,-70,245,140,light);panel(590,-38,160,76,'#729d9a');
 }else if(shipClass==='dominion'){
  panel(-780,-46,1430,92,shade);for(const [x,y]of[[-600,-210],[-100,180],[480,-200],[560,130]]){panel(x,y,200,75,mix(color,1.08));panel(x+20,y+17,150,32,'#667986');pixelRect(ctx,accent,x+30,y+24,125,5);}
  panel(640,-85,230,140,light);panel(685,-48,140,58,'#7899a6');
 }else if(shipClass==='palimpsest'){
  panel(-540,-46,1110,92,shade);for(const x of[-640,430])for(const side of[-1,1]){panel(x,side*180-38,170,76,'#8e86a9');for(let n=0;n<8;n++)pixelRect(ctx,'#d5c9e2',x+14+n*19,side*180-10,5,3);}
  panel(-70,-90,240,180,light);panel(-33,-52,162,100,'#7a91ad');for(const side of[-1,1])panel(250,side*140-15,310,30,'#587b96');
 }else{
  panel(-780,-160,750,320,shade);panel(-600,-90,470,180,mix(color,.95));panel(-530,-54,310,108,'#7b8f8e');
  for(const side of[-1,1]){panel(160,side*235-38,600,76,mix(color,1.02));for(let x=200;x<760;x+=90){pixelRect(ctx,'#d7aa6b',x,side*235-24,12,48);pixelRect(ctx,'#354e59',x+16,side*235-21,30,42);}}
 }
 // A visible hangar mouth and tiny approach lamps correspond to the tractor anchor.
 const hx=shipClass==='crucible'?-.16*profile.length:.2*profile.length,hy=-.28*profile.width;
 if(panel(hx-76,hy-21,152,42,'#1b3440'))for(let i=0;i<7;i++){pixelRect(ctx,'#90bca9',hx-65+i*21,hy-13,6,3);pixelRect(ctx,'#d6c594',hx-65+i*21,hy+10,6,3);}
 for(const [x,y]of profile.thrusters){panel(x-4,y-26,44,52,'#486675');pixelRect(ctx,'#203c51',x-2,y-18,19,36);pixelRect(ctx,'#8ab7cc',x+4,y-13,6,26);}
 const scars=Math.min(18,Math.max(0,Math.floor(damage*18)));for(let i=0;i<scars;i++){const x=-profile.length*.34+(i*173)%(profile.length*.66),y=-profile.width*.28+(i*97)%(profile.width*.56);if(inside(x,y,outline)){pixelRect(ctx,'#263238',x,y,34,9);pixelRect(ctx,'#9b7658',x+6,y+5,19,4);}}
 return true;
}
