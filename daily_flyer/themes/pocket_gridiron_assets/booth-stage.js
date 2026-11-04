// Swap authored pixel-art poses on whole-pixel boundaries. No gameplay state.
export function boothPose(speaker,active,pose,time,moving=true,energy=0){
 if(!moving)return {column:0,bob:0,lean:0};
 const toward=speaker==='al'?1:-1;
 if(!active){
  const phase=(time+(speaker==='john'?1.7:0))%5.2;
  // A listening nod, a lean toward the other host, then a quiet reset.
  return {column:0,bob:phase<.8?Math.round(Math.sin(phase/.8*Math.PI)*2):0,lean:Math.round(Math.sin(phase/5.2*Math.PI)*2)*toward};
 }
 const beat=Math.floor(time/1.35),rest=beat%4===3;
 const patterns={explain:[1,2,1,0],lean:[1,1,2,0],nod:[1,0,1,0],chuckle:[3,1,3,0],sweep:[2,1,2,0]};
 const column=rest?0:pose==='react'||pose==='big'?3:pose==='point'?2:patterns[pose]?.[beat%4]??(beat%3===1?2:1);
 const laugh=pose==='chuckle'?Math.sin(time*10)*2:0,nod=pose==='nod'?Math.sin(time*4)*2:0;
 const lean=(pose==='lean'?3:pose==='sweep'?Math.sin(time*2)*4:Math.sin(time*1.1)*1.5)*toward;
 return {column,bob:Math.round(Math.sin(time*2.6+(speaker==='john'?1:0))+laugh+nod-energy*2),lean:Math.round(lean)};
}
export class BoothStage {
 constructor(dialog){
  this.canvases=['al','john'].map(id=>dialog.querySelector(`#host-${id}`));
  this.sheet=new Image();this.sheet.onload=()=>{this.measure();this.draw(this.last||{});};this.sheet.src=new URL('./booth-poses.webp?v=30',import.meta.url);
 }
 measure(){
  const sheet=this.sheet,canvas=document.createElement('canvas');canvas.width=sheet.naturalWidth;canvas.height=sheet.naturalHeight;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(sheet,0,0);const {data}=c.getImageData(0,0,canvas.width,canvas.height);this.cells=[];
  for(let row=0;row<2;row++)for(let col=0;col<4;col++){
   const left=Math.floor(col*canvas.width/4),right=Math.floor((col+1)*canvas.width/4),top=Math.floor(row*canvas.height/2),bottom=Math.floor((row+1)*canvas.height/2);
   let x0=right,y0=bottom,x1=left,y1=top;
   for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(data[(y*canvas.width+x)*4+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
   this.cells.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1});
  }
  this.maxWidth=Math.max(...this.cells.map(c=>c.w));this.maxHeight=Math.max(...this.cells.map(c=>c.h));
 }
 draw({speaker='al',pose='talk',time=0,moving=false,energy=0}={}){
  this.last={speaker,pose,time,moving,energy};if(!this.cells)return;
  for(const [row,name] of ['al','john'].entries()){
   const canvas=this.canvases[row],c=canvas.getContext('2d');if(!c)continue;
   const p=boothPose(name,speaker===name,pose,time,moving,energy),w=canvas.width,h=canvas.height;
   c.clearRect(0,0,w,h);c.imageSmoothingEnabled=false;
   // Stadium lights and seats remain fixed while the host talks and gestures.
   c.fillStyle='#11273c';c.fillRect(0,0,w,h);
   for(let y=33;y<105;y+=8)for(let x=2;x<w;x+=10){c.fillStyle=(x+y)%3?'#746438':'#a28a4d';c.fillRect(x,y,4,3);}
   c.fillStyle='#2d694c';c.fillRect(0,108,w,40);c.fillStyle='#9cbb80';c.fillRect(0,121,w,2);
   for(const x of [12,w-26]){c.fillStyle='#52687a';c.fillRect(x+4,13,3,92);c.fillStyle='#f5d68a';c.fillRect(x,8,13,8);}
   const cell=this.cells[row*4+p.column],scale=Math.min((w-14)/this.maxWidth,(h-16)/this.maxHeight),dw=Math.round(cell.w*scale),dh=Math.round(cell.h*scale);
   c.drawImage(this.sheet,cell.x,cell.y,cell.w,cell.h,Math.round((w-dw)/2)+p.lean,h-12-dh+p.bob,dw,dh);
   c.fillStyle='#503e30';c.fillRect(0,h-12,w,12);c.fillStyle='#b78d56';c.fillRect(0,h-12,w,3);
   // The meter and emphasis follow syllables, with silence between words.
   if(speaker===name){c.fillStyle='#f7d66a';for(let i=0;i<4;i++){const height=moving?2+Math.round(energy*(9-i*2)):3;c.fillRect(w-27+i*5,h-3-height,3,height);}}
  }
 }
}
