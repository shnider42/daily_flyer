// A lightweight panoramic matte: original Boston-inspired silhouettes, not a geographic replica.
// Drawn behind transparent world pixels; yaw and pitch follow the real camera in both renderers.
export const BOSTON_FOG=[.72,.72,.66];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export class Atmosphere{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas?.getContext('2d');}
 draw(eye,target,time,mapId,inside=false){if(!this.ctx)return;const canvas=this.canvas,g=this.ctx,w=canvas.width=640,h=canvas.height=Math.round(640*innerHeight/innerWidth);canvas.style.display=inside?'none':'block';if(inside)return;
  const boston=mapId==='boston',yaw=Math.atan2(target[0]-eye[0],target[2]-eye[2]),pitch=Math.atan2(eye[1]-target[1],Math.hypot(target[0]-eye[0],target[2]-eye[2])),f=h/(2*Math.tan((innerWidth<innerHeight?68:58)*Math.PI/360)),horizon=h*.5-Math.tan(pitch)*f;
  const sky=g.createLinearGradient(0,boston?horizon-h*.6:0,0,boston?horizon+60:h);sky.addColorStop(0,boston?'#456d82':'#74858c');sky.addColorStop(.35,boston?'#86a6ac':'#a0aaa8');sky.addColorStop(.64,boston?'#e7bf99':'#babbb0');sky.addColorStop(1,boston?'#b8b8a8':'#a6aaa0');g.fillStyle=sky;g.fillRect(0,0,w,h);if(!boston)return;
  // A pale sunrise and torn Atlantic cloud banks rather than an undirected grey gradient.
  const project=a=>{const d=wrap(a-yaw);return Math.abs(d)<1.4?w/2+Math.tan(d)*f:null;};
  const sun=project(1.42);if(sun!==null){g.fillStyle='#efd1a1';g.beginPath();g.arc(sun,horizon-48,17,0,Math.PI*2);g.fill();}
  for(let i=0;i<13;i++){const x=project(i*.49+time*.0006);if(x===null)continue;const y=horizon-48-(i%4)*22;g.fillStyle=i%2?'#b4bcbb55':'#edceb150';g.beginPath();g.ellipse(x,y,36+i%3*20,4+i%3*2,0,0,7);g.fill();}
  for(let layer=0;layer<2;layer++)for(let i=0;i<68;i++){const a=i/68*Math.PI*2+.04*layer,x=project(a);if(x===null)continue;const width=(9+(i*7)%15)*(layer?1:.75),height=(14+(i*17)%37)*(layer?1:.72),base=horizon+12+layer*8;g.fillStyle=layer?'#727e7d':'#8d9690';g.fillRect(x-width/2,base-height,width,height+Math.max(0,h-base));
   if(i%11===0){g.fillStyle=layer?'#7b8d8e':'#97a19a';g.beginPath();g.moveTo(x-width/2,base-height);g.lineTo(x+width/2,base-height-12);g.lineTo(x+width/2,base);g.lineTo(x-width/2,base);g.fill();}
  }
  const tower=(a,kind)=>{const x=project(a);if(x===null)return;const base=horizon+22;g.fillStyle='#627b81';
   if(kind==='glass'){g.beginPath();g.moveTo(x-13,base);g.lineTo(x-13,base-100);g.lineTo(x+11,base-112);g.lineTo(x+16,base-8);g.closePath();g.fill();g.fillStyle='#9bb1ae';g.fillRect(x-9,base-98,2,88);}
   if(kind==='antenna'){g.fillRect(x-15,base-91,30,91);g.fillStyle='#a3b1a7';g.fillRect(x-13,base-94,26,5);g.fillRect(x-9,base-101,18,7);g.fillRect(x-1,base-124,2,23);for(let j=0;j<4;j++){g.fillStyle='#b8bda560';g.fillRect(x-11+j*7,base-88,2,80);}}
   if(kind==='clock'){g.fillStyle='#a49d87';g.fillRect(x-9,base-62,18,62);g.fillRect(x-6,base-79,12,18);g.beginPath();g.moveTo(x-9,base-79);g.lineTo(x,base-97);g.lineTo(x+9,base-79);g.fill();g.fillStyle='#e4d4af';g.beginPath();g.arc(x,base-69,4,0,7);g.fill();g.fillStyle='#526e73';g.fillRect(x,base-72,1,4);}
   if(kind==='dome'){g.fillStyle='#b6a377';g.beginPath();g.ellipse(x,base-25,13,12,0,Math.PI,2*Math.PI);g.fill();g.fillStyle='#8f8c78';g.fillRect(x-22,base-25,44,25);}
  };tower(.45,'clock');tower(.92,'antenna');tower(1.18,'glass');tower(1.62,'dome');
  // Sparse gulls drift above the river; no sprites or extra simulation bodies.
  g.strokeStyle='#596f75';g.lineWidth=1;for(let i=0;i<5;i++){const x=project(i*.39+time*.008+2),y=horizon-56-i%3*17;if(x===null)continue;const wing=2+Math.sin(time*3+i)*1.5;g.beginPath();g.moveTo(x-4,y-wing);g.lineTo(x,y);g.lineTo(x+4,y-wing);g.stroke();}
 }
}
