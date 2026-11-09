/** Small pixel primitives shared by the two world renderers. */
export function pixelRect(ctx,color,x,y,w=1,h=1){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
export function pixelLine(ctx,x0,y0,x1,y1,color,width=1){
 x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
 const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let err=dx+dy;
 for(let i=0;i<5000;i++){pixelRect(ctx,color,x0-Math.floor(width/2),y0-Math.floor(width/2),width,width);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
}
export function pixelRing(ctx,x,y,rx,ry,color,{step=2,dashed=false,phase=0,width=1}={}){
 const n=Math.max(18,Math.ceil(Math.max(rx,ry)*Math.PI/Math.max(1,step)));
 for(let i=0;i<n;i++){if(dashed&&(i+Math.floor(phase))%6>=3)continue;const a=i/n*Math.PI*2;pixelRect(ctx,color,x+Math.cos(a)*rx-Math.floor(width/2),y+Math.sin(a)*ry-Math.floor(width/2),width,width);}
}
/** label coordinates are canvas logical pixels; size is intended CSS pixels. */
export function labelSink(ctx,labels,{cameraX=0,cameraY=0,width=Infinity,height=Infinity}={}){
 const queue=labels&&typeof labels.push==='function';
 return(value,x,y,color='#dce6db',size=13,align='left',priority=10,kind='label')=>{
  if(value===null||value===undefined||String(value).length===0)return;
  const sx=Math.round(x-cameraX),sy=Math.round(y-cameraY);
  if(sx<-120||sx>width+120||sy<-30||sy>height+30)return;
  if(queue){labels.push({text:String(value),x:sx,y:sy,color,size,align,priority,kind});return;}
  ctx.font=`${Math.max(8,Math.round(size*.64))}px monospace`;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(String(value),Math.round(x),Math.round(y));
 };
}
