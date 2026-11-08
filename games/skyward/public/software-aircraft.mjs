import * as THREE from './vendor/three.module.js';

const MAX_PIXELS=600000;
const DEFAULT_FOG=[160,180,180];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const colorCache=new WeakMap(),vertexCache=new WeakMap();
const mv=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();

function makeSurface(){
  try{
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1,1):globalThis.document?.createElement?.('canvas');
    const context=canvas?.getContext?.('2d',{alpha:true});return context?{canvas,context}:null;
  }catch{return null;}
}

function colorOf(material){
  if(!colorCache.has(material)){const c=material.color?.clone()||new THREE.Color('#b8c4c1');c.convertLinearToSRGB();colorCache.set(material,[c.r*255,c.g*255,c.b*255]);}
  return colorCache.get(material);
}

// A depth buffer is needed only for the nearby, detailed aircraft. Terrain,
// effects and distant silhouettes keep the much cheaper existing painter.
// The image is cropped to the model and supersampled within a fixed pixel cap.
export class SoftwareAircraftRasterizer{
  constructor(){
    this.surface=makeSurface();this.pool=[];this.opaque=[];this.transparent=[];this.count=0;
    this.depth=null;this.pixels=null;this.image=null;this.bufferWidth=0;this.bufferHeight=0;
  }

  _reserve(width,height){
    if(width<=this.bufferWidth&&height<=this.bufferHeight)return;
    // Reuse a bucket across small changes in bank, zoom and the projected box.
    // If an aspect change would exceed the cap, discard the old bucket first.
    let w=Math.max(this.bufferWidth,Math.ceil(width/16)*16),h=Math.max(this.bufferHeight,Math.ceil(height/16)*16);
    if(w*h>MAX_PIXELS*1.15){w=Math.ceil(width/16)*16;h=Math.ceil(height/16)*16;}
    const {canvas,context}=this.surface;canvas.width=w;canvas.height=h;
    this.image=context.createImageData(w,h);this.pixels=this.image.data;this.depth=new Float32Array(w*h);this.bufferWidth=w;this.bufferHeight=h;
  }

  _triangle(a,b,c,material,base,options){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,facing=nx*a[0]+ny*a[1]+nz*a[2];
    const back=material.side===THREE.BackSide;
    if(material.side!==THREE.DoubleSide&&(back?facing<=0:facing>=0))return;
    const reverse=facing>0;
    let flatLight;
    if(material.flatShading&&!material.isMeshBasicMaterial){const length=Math.hypot(nx,ny,nz)||1,sign=reverse?-1:1,{sun,up,night}=options;flatLight=(night?.7:.65)+Math.max(0,(nx*sun.x+ny*sun.y+nz*sun.z)*sign/length)*.38+Math.max(0,(nx*up.x+ny*up.y+nz*up.z)*sign/length)*.12;}
    if(a[2]<=-.6&&b[2]<=-.6&&c[2]<=-.6){this._emit(a,b,c,reverse,flatLight,material,base,options);return;}
    const source=[a,b,c],clipped=[];
    for(let i=0;i<3;i++){
      const p=source[i],q=source[(i+1)%3],pin=p[2]<=-.6,qin=q[2]<=-.6;
      if(pin)clipped.push(p);
      if(pin!==qin){const t=(-.6-p[2])/(q[2]-p[2]);clipped.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,-.6,p[3]+(q[3]-p[3])*t,p[4]+(q[4]-p[4])*t]);}
    }
    if(clipped.length<3)return;
    for(let i=1;i<clipped.length-1;i++)this._emit(clipped[0],clipped[i],clipped[i+1],reverse,flatLight,material,base,options);
  }

  _emit(a,b,c,reverse,flatLight,material,base,options){
    const {width,height,focal,fogFar=21000,fogColor=DEFAULT_FOG}=options,ai=-1/a[2],bi=-1/b[2],ci=-1/c[2];
    const ax=width*.5+a[0]*focal*ai,ay=height*.5-a[1]*focal*ai,bx=width*.5+b[0]*focal*bi,by=height*.5-b[1]*focal*bi,cx=width*.5+c[0]*focal*ci,cy=height*.5-c[1]*focal*ci;
    const minX=Math.max(0,Math.min(ax,bx,cx)),maxX=Math.min(width,Math.max(ax,bx,cx)),minY=Math.max(0,Math.min(ay,by,cy)),maxY=Math.min(height,Math.max(ay,by,cy));
    if(maxX<=minX||maxY<=minY)return;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(area)<.008)return;
    let tri=this.pool[this.count];if(!tri){tri={a:[0,0,0,1],b:[0,0,0,1],c:[0,0,0,1]};this.pool[this.count]=tri;}this.count++;
    const p=tri.a,q=area<0?tri.c:tri.b,r=area<0?tri.b:tri.c,shade=reverse?4:3;
    p[0]=ax;p[1]=ay;p[2]=ai;p[3]=flatLight??a[shade];q[0]=bx;q[1]=by;q[2]=bi;q[3]=flatLight??b[shade];r[0]=cx;r[1]=cy;r[2]=ci;r[3]=flatLight??c[shade];
    tri.alpha=clamp(Number.isFinite(material.opacity)?material.opacity:1,0,1);tri.depth=-(a[2]+b[2]+c[2])/3;tri.bias=material.polygonOffset?.008:0;
    const fog=clamp((tri.depth-1200)/Math.max(100,fogFar-1200),0,.97);tri.fog=fog*fog;
    tri.red=base[0];tri.green=base[1];tri.blue=base[2];tri.fogColor=fogColor;
    (material.transparent||tri.alpha<1?this.transparent:this.opaque).push(tri);
    this.minX=Math.min(this.minX,minX);this.maxX=Math.max(this.maxX,maxX);this.minY=Math.min(this.minY,minY);this.maxY=Math.max(this.maxY,maxY);
  }

  _draw(tri,originX,originY,scale,transparent,width,height){
    const a=tri.a,b=tri.b,c=tri.c;
    const ax=(a[0]-originX)*scale,ay=(a[1]-originY)*scale,bx=(b[0]-originX)*scale,by=(b[1]-originY)*scale,cx=(c[0]-originX)*scale,cy=(c[1]-originY)*scale;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(area<1e-8)return;
    const xMin=clamp(Math.floor(Math.min(ax,bx,cx)),0,width-1),xMax=clamp(Math.ceil(Math.max(ax,bx,cx)),0,width-1),yMin=clamp(Math.floor(Math.min(ay,by,cy)),0,height-1),yMax=clamp(Math.ceil(Math.max(ay,by,cy)),0,height-1);
    const e0x=by-cy,e0y=cx-bx,e1x=cy-ay,e1y=ax-cx,e2x=ay-by,e2y=bx-ax;
    const topLeft0=e0x>0||(e0x===0&&e0y>0),topLeft1=e1x>0||(e1x===0&&e1y>0),topLeft2=e2x>0||(e2x===0&&e2y>0);
    let row0=(cx-bx)*(yMin+.5-by)-(cy-by)*(xMin+.5-bx),row1=(ax-cx)*(yMin+.5-cy)-(ay-cy)*(xMin+.5-cx),row2=(bx-ax)*(yMin+.5-ay)-(by-ay)*(xMin+.5-ax);
    const inverseArea=1/area,depth=this.depth,pixels=this.pixels,stride=this.bufferWidth,alpha=tri.alpha;
    const f=tri.fog,keep=1-f,fr=tri.fogColor[0]*f,fg=tri.fogColor[1]*f,fb=tri.fogColor[2]*f;
    for(let y=yMin;y<=yMax;y++){
      let e0=row0,e1=row1,e2=row2,index=y*stride+xMin;
      for(let x=xMin;x<=xMax;x++,index++,e0+=e0x,e1+=e1x,e2+=e2x){
        if(e0<0||e1<0||e2<0||(e0===0&&!topLeft0)||(e1===0&&!topLeft1)||(e2===0&&!topLeft2))continue;
        const z=(e0*a[2]+e1*b[2]+e2*c[2])*inverseArea,biased=z+tri.bias*z*z;
        if(biased<depth[index]-1e-7)continue;
        const shade=(e0*a[2]*a[3]+e1*b[2]*b[3]+e2*c[2]*c[3])*(inverseArea/z);
        const red=clamp(tri.red*shade*keep+fr,0,255),green=clamp(tri.green*shade*keep+fg,0,255),blue=clamp(tri.blue*shade*keep+fb,0,255),pixel=index*4;
        if(!transparent){depth[index]=biased;pixels[pixel]=red;pixels[pixel+1]=green;pixels[pixel+2]=blue;pixels[pixel+3]=255;}
        else{
          const oldAlpha=pixels[pixel+3]/255,remaining=oldAlpha*(1-alpha),outAlpha=alpha+remaining;if(outAlpha<=0)continue;
          pixels[pixel]=(red*alpha+pixels[pixel]*remaining)/outAlpha;pixels[pixel+1]=(green*alpha+pixels[pixel+1]*remaining)/outAlpha;pixels[pixel+2]=(blue*alpha+pixels[pixel+2]*remaining)/outAlpha;pixels[pixel+3]=outAlpha*255;
        }
      }
      row0+=e0y;row1+=e1y;row2+=e2y;
    }
  }

  render(model,options){
    if(!this.surface)return false;
    this.count=0;this.opaque.length=0;this.transparent.length=0;this.minX=this.minY=Infinity;this.maxX=this.maxY=-Infinity;
    const {viewMatrix,sun,up,night=false}=options;
    model.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.visible||Array.isArray(mesh.material))return;
      for(let parent=mesh.parent;parent;parent=parent.parent)if(!parent.visible)return;
      const geometry=mesh.geometry,material=mesh.material,position=geometry?.attributes.position;if(!position||!material||material.opacity===0)return;
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      let vertices=vertexCache.get(mesh);if(!vertices||vertices.length!==position.count)vertices=Array.from({length:position.count},()=>[0,0,0,1,1]);vertexCache.set(mesh,vertices);
      mv.multiplyMatrices(viewMatrix,mesh.matrixWorld);normalMatrix.getNormalMatrix(mv);const e=mv.elements,ne=normalMatrix.elements,p=position.array,n=geometry.attributes.normal.array;
      for(let i=0;i<position.count;i++){
        const k=i*3,x=p[k],y=p[k+1],z=p[k+2],v=vertices[i];v[0]=e[0]*x+e[4]*y+e[8]*z+e[12];v[1]=e[1]*x+e[5]*y+e[9]*z+e[13];v[2]=e[2]*x+e[6]*y+e[10]*z+e[14];
        if(material.isMeshBasicMaterial){v[3]=v[4]=1;continue;}
        let nx=ne[0]*n[k]+ne[3]*n[k+1]+ne[6]*n[k+2],ny=ne[1]*n[k]+ne[4]*n[k+1]+ne[7]*n[k+2],nz=ne[2]*n[k]+ne[5]*n[k+1]+ne[8]*n[k+2];const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
        const sunlight=nx*sun.x+ny*sun.y+nz*sun.z,sky=nx*up.x+ny*up.y+nz*up.z,ambient=night?.7:.65;
        v[3]=ambient+Math.max(0,sunlight)*.38+Math.max(0,sky)*.12;v[4]=ambient+Math.max(0,-sunlight)*.38+Math.max(0,-sky)*.12;
      }
      const indices=geometry.index?.array,total=indices?indices.length:position.count,base=colorOf(material);
      for(let i=0;i<total;i+=3)this._triangle(vertices[indices?indices[i]:i],vertices[indices?indices[i+1]:i+1],vertices[indices?indices[i+2]:i+2],material,base,options);
    });
    if(!this.count||!Number.isFinite(this.minX))return null;
    const x=Math.max(0,Math.floor(this.minX)-1),y=Math.max(0,Math.floor(this.minY)-1),width=Math.min(options.width,Math.ceil(this.maxX)+1)-x,height=Math.min(options.height,Math.ceil(this.maxY)+1)-y;
    const samples=options.quality==='high'?2:1.5;
    const scale=Math.min(samples*(options.pixelRatio||1),Math.sqrt(MAX_PIXELS/Math.max(1,width*height))),sourceWidth=Math.max(1,Math.ceil(width*scale)),sourceHeight=Math.max(1,Math.ceil(height*scale));
    this._reserve(sourceWidth,sourceHeight);this.depth.fill(0);this.pixels.fill(0);
    for(const tri of this.opaque)this._draw(tri,x,y,scale,false,sourceWidth,sourceHeight);
    this.transparent.sort((a,b)=>b.depth-a.depth);
    for(const tri of this.transparent)this._draw(tri,x,y,scale,true,sourceWidth,sourceHeight);
    this.surface.context.putImageData(this.image,0,0,0,0,sourceWidth,sourceHeight);
    const world=model.matrixWorld.elements,view=viewMatrix.elements,depth=-(view[2]*world[12]+view[6]*world[13]+view[10]*world[14]+view[14]);
    return {canvas:this.surface.canvas,x,y,width,height,sourceWidth,sourceHeight,triangles:this.count,depth,alpha:1};
  }

  dispose(){this.surface=null;this.depth=this.pixels=this.image=null;this.pool.length=0;this.opaque.length=0;this.transparent.length=0;}
}
