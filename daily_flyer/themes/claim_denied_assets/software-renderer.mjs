// Canvas fallback renders the same authored Three scene when WebGL is unavailable.
// Flat, clipped triangles retain first-person geometry, windows and all actors.
import * as T from './vendor/three.module.js';
export class SoftwareRenderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});if(!this.ctx)throw new Error('Canvas unavailable');this.info={render:{calls:0}};this.isSoftware=true;this.matrix=new T.Matrix4();this.color=new T.Color();}
  setPixelRatio(){}
  setSize(w,h){const scale=Math.min(1,1100/w);this.canvas.width=Math.round(w*scale);this.canvas.height=Math.round(h*scale);}
  render(scene,camera){
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,faces=[];scene.updateMatrixWorld();camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    ctx.fillStyle='#17333f';ctx.fillRect(0,0,w,h);const proj=camera.projectionMatrix.elements,screen=v=>({x:(v.x*proj[0]/-v.z+1)*w/2,y:(1-v.y*proj[5]/-v.z)*h/2,u:v.u,v:v.v});
    scene.traverseVisible(obj=>{
      if(!obj.isMesh||!obj.geometry?.attributes.position)return;
      const geom=obj.geometry,pos=geom.attributes.position,uv=geom.attributes.uv,indices=geom.index,material=Array.isArray(obj.material)?obj.material[0]:obj.material;
      this.matrix.multiplyMatrices(camera.matrixWorldInverse,obj.matrixWorld);const m=this.matrix.elements,verts=[];
      for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);verts.push({x:m[0]*x+m[4]*y+m[8]*z+m[12],y:m[1]*x+m[5]*y+m[9]*z+m[13],z:m[2]*x+m[6]*y+m[10]*z+m[14],u:uv?.getX(i)||0,v:uv?.getY(i)||0});}
      const col=this.color.copy(material.color||new T.Color(0xffffff)).convertLinearToSRGB();const rgb=[col.r*255,col.g*255,col.b*255];
      const n=indices?indices.count:pos.count;
      for(let i=0;i<n;i+=3){
        const a=verts[indices?indices.getX(i):i],b=verts[indices?indices.getX(i+1):i+1],c=verts[indices?indices.getX(i+2):i+2];if(!a||!b||!c)continue;
        if(a.z>-.065&&b.z>-.065&&c.z>-.065||a.z<-85&&b.z<-85&&c.z<-85)continue;
        // Near-plane clipping is essential when the player walks beside a wall.
        const original=[a,b,c],clipped=[];for(let j=0;j<3;j++){const cur=original[j],next=original[(j+1)%3],inside=cur.z<=-.065,nextInside=next.z<=-.065;if(inside)clipped.push(cur);if(inside!==nextInside){const t=(-.065-cur.z)/(next.z-cur.z);clipped.push({x:cur.x+(next.x-cur.x)*t,y:cur.y+(next.y-cur.y)*t,z:-.065,u:cur.u+(next.u-cur.u)*t,v:cur.v+(next.v-cur.v)*t});}}
        if(clipped.length<3)continue;const points=clipped.map(screen);if(points.every(p=>p.x<0)||points.every(p=>p.x>w)||points.every(p=>p.y<0)||points.every(p=>p.y>h))continue;
        const depth=-(a.z+b.z+c.z)/3,ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};const nx=ab.y*ac.z-ab.z*ac.y,ny=ab.z*ac.x-ab.x*ac.z,nz=ab.x*ac.y-ab.y*ac.x,len=Math.hypot(nx,ny,nz)||1;
        const light=material.isMeshBasicMaterial?1:.68+.32*Math.abs((nx*.25+ny*.85+nz*.4)/len),fog=Math.min(.8,Math.max(0,depth-10)/65);
        const shade=rgb.map((v,k)=>Math.round(v*light*(1-fog)+[23,51,63][k]*fog));
        faces.push({points,depth,color:`rgb(${shade.join(',')})`,image:material.map?.image});
      }
    });
    faces.sort((a,b)=>b.depth-a.depth);this.info.render.calls=faces.length;
    for(const face of faces){const ps=face.points;ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);for(let i=1;i<ps.length;i++)ctx.lineTo(ps[i].x,ps[i].y);ctx.closePath();ctx.fillStyle=face.color;ctx.fill();
      if(face.image&&ps.length===3){const im=face.image,p=ps.map(v=>({...v,u:v.u*im.width,v:(1-v.v)*im.height}));const [a,b,c]=p,det=a.u*(b.v-c.v)+b.u*(c.v-a.v)+c.u*(a.v-b.v);if(Math.abs(det)>.01){
        const A=(a.x*(b.v-c.v)+b.x*(c.v-a.v)+c.x*(a.v-b.v))/det,C=(a.x*(c.u-b.u)+b.x*(a.u-c.u)+c.x*(b.u-a.u))/det,E=(a.x*(b.u*c.v-c.u*b.v)+b.x*(c.u*a.v-a.u*c.v)+c.x*(a.u*b.v-b.u*a.v))/det;
        const B=(a.y*(b.v-c.v)+b.y*(c.v-a.v)+c.y*(a.v-b.v))/det,D=(a.y*(c.u-b.u)+b.y*(a.u-c.u)+c.y*(b.u-a.u))/det,F=(a.y*(b.u*c.v-c.u*b.v)+b.y*(c.u*a.v-a.u*c.v)+c.y*(a.u*b.v-b.u*a.v))/det;
        ctx.save();ctx.clip();ctx.transform(A,B,C,D,E,F);ctx.drawImage(im,0,0);ctx.restore();
      }}
    }
    // Subtle rain overlay. The interior stays dry; rain is visible through windows.
    if(camera.position.y>5){ctx.strokeStyle='#b6d5d91f';ctx.lineWidth=1;const t=performance.now()/25;for(let i=0;i<80;i++){const x=(i*153.7+t*.2)%w,y=(i*81+t*4)%h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+9);ctx.stroke();}}
  }
}
