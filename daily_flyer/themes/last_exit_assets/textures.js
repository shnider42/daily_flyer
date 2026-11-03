// Original, deterministic texture atlas. All detail is attached to world UVs.
import {random} from './engine.js';
export const TILE=256,ATLAS=1024;
export function createAtlas(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=ATLAS;const g=canvas.getContext('2d',{willReadFrequently:true}),r=random(3821);
 const rect=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
 const grain=(amount,alpha=.07)=>{for(let i=0;i<amount;i++){const v=r()>.5?255:0;rect(r()*256,r()*256,1+r()*3,1+r()*3,`rgba(${v},${v},${v},${alpha*r()})`);}};
 const tile=(n,draw)=>{g.save();g.translate((n%4)*256,Math.floor(n/4)*256);g.beginPath();g.rect(0,0,256,256);g.clip();draw();g.restore();};
 tile(0,()=>rect(0,0,256,256,'#ffffff'));
 tile(1,()=>{rect(0,0,256,256,'#575957');grain(11000,.065);for(let k=0;k<18;k++){const x=r()*256,y=r()*256;g.fillStyle='#2b302d';g.globalAlpha=.025;g.beginPath();g.ellipse(x,y,10+r()*40,5+r()*20,0,0,7);g.fill();g.globalAlpha=1;}g.strokeStyle='#454943';g.lineWidth=.7;g.beginPath();g.moveTo(12,75);g.lineTo(49,81);g.lineTo(64,66);g.lineTo(93,73);g.stroke();});
 tile(2,()=>{rect(0,0,256,256,'#a5a195');grain(8000,.08);for(let i=0;i<256;i+=64){rect(i,0,1,256,'#7e8075');rect(0,i,256,1,'#85867a');rect(i+1,0,1,256,'#b2ae9e');}for(let i=0;i<20;i++){rect(r()*256,r()*256,1,1,'#5d625b');}});
 const facade=(n,base,brick=true,lit=false)=>tile(n,()=>{
  rect(0,0,256,256,base);
  if(brick){for(let y=0;y<256;y+=8)for(let x=-16;x<256;x+=32){const X=x+(y%16?16:0);rect(X,y,30,7,`rgba(${r()>.5?'220,196,158':'28,23,19'},${.03+r()*.13})`);rect(X,y+7,32,1,'#5b554948');rect(X+30,y,1,8,'#4b483e66');}}
  else for(let x=0;x<256;x+=64){rect(x,0,1,256,'#5e5b502b');}
  for(let row=0;row<2;row++)for(let col=0;col<3;col++){
   const x=15+col*84,y=12+row*128,w=48,h=77;
   rect(x-4,y-3,w+8,h+8,'#5a554c');rect(x-2,y-2,w+4,h+4,'#b5ac91');rect(x,y,w,h,'#1e2a2d');
   const sky=g.createLinearGradient(x,y,x+w,y+h);sky.addColorStop(0,'#778385');sky.addColorStop(.42,'#4b5b5c');sky.addColorStop(.43,'#354344');sky.addColorStop(1,'#263233');g.fillStyle=sky;g.fillRect(x+2,y+2,w-4,h-4);
   if((col+row+n)%6===0||lit){rect(x+3,y+3,w-6,h-6,'#b8a271');rect(x+7,y+6,w-14,h-15,'#998466');}
   // Interior curtains, sash divisions, a narrow shadow below each sill.
   rect(x+4,y+4,5,h-8,'#d0c4a055');rect(x+w-9,y+4,5,h-8,'#d0c4a04a');rect(x+w/2-1,y,2,h,'#aaa48e');rect(x,y+37,w,3,'#a29a82');rect(x-5,y+h+2,w+10,4,'#c1b69a');rect(x-4,y+h+6,w+8,3,'#332e2655');
   const stain=g.createLinearGradient(0,y+h+10,0,y+126);stain.addColorStop(0,'#24221b22');stain.addColorStop(1,'#24221b00');g.fillStyle=stain;g.fillRect(x-2,y+h+10,w+4,28);
  }
  rect(0,117,256,5,'#514d3b66');rect(0,122,256,4,'#b2a187');grain(12000,.1);
 });
 facade(3,'#89735c');facade(4,'#8b5d48');facade(5,'#686d68');facade(6,'#b4a68a',false);facade(7,'#7d8074',false);
 tile(8,()=>{rect(0,0,256,256,'#3d4544');for(let i=0;i<256;i+=10){rect(0,i,256,2,'#858b7b');rect(0,i+2,256,1,'#292f30');}grain(4000,.1);rect(4,0,6,256,'#63695e');rect(246,0,6,256,'#252c2b');});
 tile(9,()=>{rect(0,0,256,256,'#32454b');let grad=g.createLinearGradient(0,0,256,256);grad.addColorStop(0,'#819494');grad.addColorStop(.45,'#4b6369');grad.addColorStop(.46,'#273a40');grad.addColorStop(1,'#16252a');g.fillStyle=grad;g.fillRect(8,8,240,240);rect(120,0,8,256,'#777c71');rect(0,120,256,8,'#777c71');grain(3000,.03);});
 const signs=[['MERIDIAN','MOTOR HOTEL','#6e302c'],['AUTO SERVICE','BRAKES · TIRES','#344e48'],['CORNER STORE','GROCERIES · SUNDRIES','#515e52'],['PORT AUTHORITY','WAREHOUSE No. 7','#6d6b5d']];
 signs.forEach(([a,b,c],i)=>tile(10+i,()=>{rect(0,0,256,256,c);rect(6,48,244,160,'#d8cead');rect(10,52,236,152,c);g.textAlign='center';g.fillStyle='#e0d6b6';g.font='bold 26px Georgia';g.fillText(a,128,115,224);g.font='12px monospace';g.fillText(b,128,148,220);grain(6000,.14);}));
 tile(14,()=>{rect(0,0,256,256,'#74634f');for(let y=0;y<256;y+=16)for(let x=-20;x<256;x+=40){rect(x+(y%32?20:0),y,38,14,`rgba(${r()>.5?'206,180,141':'30,20,18'},.16)`);}grain(14000,.16);});
 tile(15,()=>{g.clearRect(0,0,256,256);const mist=g.createRadialGradient(128,128,8,128,128,125);mist.addColorStop(0,'rgba(255,255,255,.4)');mist.addColorStop(.45,'rgba(255,255,255,.22)');mist.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=mist;g.fillRect(0,0,256,256);});
 return {canvas,pixels:new Uint32Array(g.getImageData(0,0,ATLAS,ATLAS).data.buffer)};
}
