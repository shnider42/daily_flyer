export function reporterPose(time,moving=true,energy=0){
 if(!moving)return {cell:0,bob:0,lean:0};
 return {cell:[1,1,2,1,3,0][Math.floor(time/1.5)%6],bob:Math.round(Math.sin(time*2)*.7-energy),lean:Math.round(Math.sin(time*.9))};
}
export class SidelineStage {
 constructor(canvas){
  this.canvas=canvas;this.sheet=new Image();
  this.sheet.onload=()=>{this.measure();this.draw(this.last||{});};
  this.sheet.src=new URL('./reporter-poses.webp?v=21',import.meta.url);
 }
 measure(){
  const s=this.sheet,c=document.createElement('canvas');c.width=s.naturalWidth;c.height=s.naturalHeight;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(s,0,0);const {data}=ctx.getImageData(0,0,c.width,c.height);this.cells=[];
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
   const left=Math.floor(col*c.width/2),right=Math.floor((col+1)*c.width/2),top=Math.floor(row*c.height/2),bottom=Math.floor((row+1)*c.height/2);
   let x0=right,y0=bottom,x1=left,y1=top;
   for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(data[(y*c.width+x)*4+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
   this.cells.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1});
  }
  this.maxHeight=Math.max(...this.cells.map(c=>c.h));this.maxWidth=Math.max(...this.cells.map(c=>c.w));
 }
 draw({time=0,moving=false,energy=0,team={}}={}){
  this.last={time,moving,energy,team};const c=this.canvas.getContext('2d');if(!c)return;
  const w=this.canvas.width,h=this.canvas.height;c.imageSmoothingEnabled=false;
  c.fillStyle='#132a38';c.fillRect(0,0,w,h);
  for(let y=22;y<85;y+=8)for(let x=3;x<w;x+=10){c.fillStyle=(x+y)%3?'#5c7881':'#bdac6a';c.fillRect(x,y,4,3);}
  c.fillStyle='#294e42';c.fillRect(0,88,w,h-88);
  c.fillStyle='#386651';for(let y=92;y<h;y+=32)c.fillRect(0,y,w,16);
  c.fillStyle='#c7d1a3';c.fillRect(0,134,w,3);c.fillRect(0,182,w,5);
  for(let x=30;x<w;x+=70){c.fillRect(x,113,3,10);c.fillRect(x,158,3,10);}
  // A bench, cooler and down marker put the camera beside the field.
  c.fillStyle=team.color||'#627777';c.fillRect(17,153,105,9);c.fillStyle='#85988e';c.fillRect(23,162,4,26);c.fillRect(111,162,4,26);
  c.fillStyle='#d9a550';c.fillRect(35,132,22,21);c.fillStyle='#e3ded0';c.fillRect(33,128,26,5);
  c.fillStyle='#172b30';c.fillRect(w-39,95,4,90);c.fillStyle='#e0a359';c.fillRect(w-47,81,20,26);c.fillStyle='#273238';c.fillRect(w-43,85,12,18);
  if(!this.cells)return;
  const p=reporterPose(time,moving,energy),cell=this.cells[p.cell],scale=Math.min((w*.57)/this.maxWidth,(h-9)/this.maxHeight),dw=Math.round(cell.w*scale),dh=Math.round(cell.h*scale);
  c.drawImage(this.sheet,cell.x,cell.y,cell.w,cell.h,Math.round(w*.51-dw/2)+p.lean,h-dh+p.bob,dw,dh);
 }
}
