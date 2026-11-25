import * as THREE from './vendor/three.module.js';

/** Clip a polygon in view space. The camera looks down negative Z. */
export function clipDepth(vertices,depth,keepFarther=true) {
  if(!vertices.length)return [];
  const output=[],inside=v=>keepFarther?v.z<=-depth:v.z>=-depth;
  let previous=vertices.at(-1),wasInside=inside(previous);
  for(const current of vertices){
    const isInside=inside(current);
    if(isInside!==wasInside){
      const t=(-depth-previous.z)/(current.z-previous.z);
      output.push({x:previous.x+(current.x-previous.x)*t,y:previous.y+(current.y-previous.y)*t,z:-depth,u:previous.u+(current.u-previous.u)*t,v:previous.v+(current.v-previous.v)*t});
    }
    if(isInside)output.push(current);
    previous=current;wasInside=isInside;
  }
  return output;
}

/** A small CPU renderer for browsers without WebGL. It renders the same meshes,
 * transforms and perspective camera; this is not a different room slideshow.
 * Geometry receives flat lighting. CanvasTexture signs retain their lettering.
 */
export class SoftwareRenderer {
  constructor({canvas}) {
    this.domElement=canvas;this.context=canvas.getContext('2d',{alpha:false});
    if(!this.context)throw new Error('A 2D canvas is unavailable.');
    this.pixelRatio=1;this.width=1;this.height=1;this.lastFrame=-Infinity;this.forceFrame=true;
    this.geometryCache=new WeakMap();this.modelView=new THREE.Matrix4();this.instanceMatrix=new THREE.Matrix4();this.worldMatrix=new THREE.Matrix4();this.normalMatrix=new THREE.Matrix3();
    this.color=new THREE.Color();this.emissive=new THREE.Color();this.light=new THREE.Vector3(-.25,.8,.55).normalize();
    this.disposed=false;this.toneMappingExposure=1;
  }

  setPixelRatio(value){this.pixelRatio=Math.min(1,Math.max(.5,value||1));this.setSize(this.width,this.height,false);}
  setSize(width,height,updateStyle=false){
    this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height));
    const w=Math.max(1,Math.round(this.width*this.pixelRatio)),h=Math.max(1,Math.round(this.height*this.pixelRatio));
    if(this.domElement.width!==w||this.domElement.height!==h){this.domElement.width=w;this.domElement.height=h;}
    if(updateStyle){this.domElement.style.width=`${this.width}px`;this.domElement.style.height=`${this.height}px`;}
    this.forceFrame=true;
  }

  _geometry(geometry){
    const position=geometry.attributes.position;if(!position)return null;
    let data=this.geometryCache.get(geometry);
    if(data&&data.version===position.version&&data.indexVersion===(geometry.index?.version||0))return data;
    const indices=geometry.index?.array||Array.from({length:position.count},(_,i)=>i),vertices=position.array,uv=geometry.attributes.uv?.array,faces=[];
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i],b=indices[i+1],c=indices[i+2];
      const ax=vertices[b*3]-vertices[a*3],ay=vertices[b*3+1]-vertices[a*3+1],az=vertices[b*3+2]-vertices[a*3+2];
      const bx=vertices[c*3]-vertices[a*3],by=vertices[c*3+1]-vertices[a*3+1],bz=vertices[c*3+2]-vertices[a*3+2];
      let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,len=Math.hypot(nx,ny,nz)||1;
      nx/=len;ny/=len;nz/=len;
      const materialIndex=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex||0;
      faces.push({a,b,c,nx,ny,nz,materialIndex});
    }
    data={version:position.version,indexVersion:geometry.index?.version||0,vertices,uv,faces,count:position.count};this.geometryCache.set(geometry,data);return data;
  }

  _project(vertex,projection){
    const e=projection,x=vertex.x,y=vertex.y,z=vertex.z,w=e[3]*x+e[7]*y+e[11]*z+e[15];
    return {x:((e[0]*x+e[4]*y+e[8]*z+e[12])/w*.5+.5)*this.domElement.width,
      y:(.5-(e[1]*x+e[5]*y+e[9]*z+e[13])/w*.5)*this.domElement.height,z,u:vertex.u,v:vertex.v};
  }

  _shade(material,face,normal,depth,fog){
    const n=normal,nx=n[0]*face.nx+n[3]*face.ny+n[6]*face.nz,ny=n[1]*face.nx+n[4]*face.ny+n[7]*face.nz,nz=n[2]*face.nx+n[5]*face.ny+n[8]*face.nz;
    const length=Math.hypot(nx,ny,nz)||1,dot=(nx*this.light.x+ny*this.light.y+nz*this.light.z)/length;
    const brightness=material.isMeshBasicMaterial?1:.55+.45*Math.max(0,dot);
    this.color.copy(material.color||new THREE.Color(0xaaaaaa)).multiplyScalar(brightness);
    if(material.emissive)this.color.add(this.emissive.copy(material.emissive).multiplyScalar((material.emissiveIntensity??1)*.5));
    if(fog?.isFogExp2)this.color.lerp(fog.color,Math.min(.8,1-Math.exp(-fog.density*fog.density*depth*depth)));
    return this.color.getStyle(THREE.SRGBColorSpace);
  }

  _mesh(object,world,camera,triangles){
    const data=this._geometry(object.geometry);if(!data)return;
    this.modelView.multiplyMatrices(camera.matrixWorldInverse,world);this.normalMatrix.getNormalMatrix(world);
    const transform=this.modelView.elements,normal=this.normalMatrix.elements,view=new Float32Array(data.count*3);
    for(let i=0;i<data.count;i++){
      const x=data.vertices[i*3],y=data.vertices[i*3+1],z=data.vertices[i*3+2];
      view[i*3]=transform[0]*x+transform[4]*y+transform[8]*z+transform[12];
      view[i*3+1]=transform[1]*x+transform[5]*y+transform[9]*z+transform[13];
      view[i*3+2]=transform[2]*x+transform[6]*y+transform[10]*z+transform[14];
    }
    const vertex=index=>({x:view[index*3],y:view[index*3+1],z:view[index*3+2],u:data.uv?data.uv[index*2]:0,v:data.uv?data.uv[index*2+1]:0});
    const projection=camera.projectionMatrix.elements;
    for(const face of data.faces){
      const material=Array.isArray(object.material)?object.material[face.materialIndex]:object.material;
      if(!material||material.visible===false||material.opacity===0)continue;
      const za=view[face.a*3+2],zb=view[face.b*3+2],zc=view[face.c*3+2];
      if(za>-camera.near&&zb>-camera.near&&zc>-camera.near||za<-camera.far&&zb<-camera.far&&zc<-camera.far)continue;
      let polygon=[vertex(face.a),vertex(face.b),vertex(face.c)];
      if(za>-camera.near||zb>-camera.near||zc>-camera.near)polygon=clipDepth(polygon,camera.near);
      if(za<-camera.far||zb<-camera.far||zc<-camera.far)polygon=clipDepth(polygon,camera.far,false);
      if(polygon.length<3)continue;
      const texture=object.geometry.type==='PlaneGeometry'&&material.map?.image?.width>=512?material.map.image:null;
      for(let i=1;i<polygon.length-1;i++){
        const vertices=[polygon[0],polygon[i],polygon[i+1]],points=vertices.map(v=>this._project(v,projection));
        const [a,b,c]=points,area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
        if(Math.abs(area)<.03||material.side===THREE.FrontSide&&area>0||material.side===THREE.BackSide&&area<0)continue;
        const minX=Math.min(a.x,b.x,c.x),maxX=Math.max(a.x,b.x,c.x),minY=Math.min(a.y,b.y,c.y),maxY=Math.max(a.y,b.y,c.y);
        if(maxX<0||minX>this.domElement.width||maxY<0||minY>this.domElement.height)continue;
        const depth=-(vertices[0].z+vertices[1].z+vertices[2].z)/3;
        triangles.push({points,depth,color:this._shade(material,face,normal,depth,this.fog),alpha:material.opacity??1,texture});
      }
    }
  }

  _textured(triangle){
    const ctx=this.context,image=triangle.texture,[a,b,c]=triangle.points;
    const x0=a.u*image.width,y0=(1-a.v)*image.height,x1=b.u*image.width,y1=(1-b.v)*image.height,x2=c.u*image.width,y2=(1-c.v)*image.height;
    const determinant=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);if(Math.abs(determinant)<1e-6)return;
    const ma=(a.x*(y1-y2)+b.x*(y2-y0)+c.x*(y0-y1))/determinant;
    const mb=(a.y*(y1-y2)+b.y*(y2-y0)+c.y*(y0-y1))/determinant;
    const mc=(a.x*(x2-x1)+b.x*(x0-x2)+c.x*(x1-x0))/determinant;
    const md=(a.y*(x2-x1)+b.y*(x0-x2)+c.y*(x1-x0))/determinant;
    const me=(a.x*(x1*y2-x2*y1)+b.x*(x2*y0-x0*y2)+c.x*(x0*y1-x1*y0))/determinant;
    const mf=(a.y*(x1*y2-x2*y1)+b.y*(x2*y0-x0*y2)+c.y*(x0*y1-x1*y0))/determinant;
    ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.clip();ctx.transform(ma,mb,mc,md,me,mf);ctx.drawImage(image,0,0);ctx.restore();
  }

  render(scene,camera){
    if(this.disposed)return;
    const now=performance.now();if(!this.forceFrame&&now-this.lastFrame<32)return;this.forceFrame=false;this.lastFrame=now;
    scene.updateMatrixWorld(true);camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this.fog=scene.fog;const ctx=this.context,w=this.domElement.width,h=this.domElement.height;
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.fillStyle=scene.background?.isColor?scene.background.getStyle(THREE.SRGBColorSpace):'#080d14';ctx.fillRect(0,0,w,h);
    const triangles=[],points=[];
    scene.traverseVisible(object=>{
      if(object.isMesh){
        if(object.isInstancedMesh){for(let i=0;i<object.count;i++){object.getMatrixAt(i,this.instanceMatrix);this.worldMatrix.multiplyMatrices(object.matrixWorld,this.instanceMatrix);this._mesh(object,this.worldMatrix,camera,triangles);}}
        else this._mesh(object,object.matrixWorld,camera,triangles);
      }else if(object.isPoints){
        const vertices=object.geometry.attributes.position?.array;if(!vertices)return;
        this.modelView.multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld);const e=this.modelView.elements;
        for(let i=0;i<vertices.length;i+=3){const x=vertices[i],y=vertices[i+1],z=vertices[i+2],v={x:e[0]*x+e[4]*y+e[8]*z+e[12],y:e[1]*x+e[5]*y+e[9]*z+e[13],z:e[2]*x+e[6]*y+e[10]*z+e[14],u:0,v:0};if(v.z>=-camera.near||v.z<-camera.far)continue;const p=this._project(v,camera.projectionMatrix.elements);if(p.x>=0&&p.x<w&&p.y>=0&&p.y<h)points.push(p);}
      }
    });
    ctx.fillStyle='#a7b9c8';for(const p of points)ctx.fillRect(p.x,p.y,1,1);
    triangles.sort((a,b)=>b.depth-a.depth);
    for(const triangle of triangles){
      ctx.globalAlpha=triangle.alpha;
      if(triangle.texture){this._textured(triangle);continue;}
      const [a,b,c]=triangle.points;ctx.fillStyle=triangle.color;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  dispose(){this.disposed=true;this.geometryCache=new WeakMap();}
}
