import * as T from './vendor/three.module.js';
import {mapFor} from './world.mjs';
export function buildRetreat(r){
 const map=mapFor('executive-retreat'),box=(...args)=>r.box(...args);
 box(0,-.22,0,80,.3,80,0x263f3b);box(0,-.05,0,24,.22,22,0x6e7470);
 // Gallery slabs: central atrium and two full-length staircase openings.
 for(const z of [-8,8])box(0,3.48,z,24,.24,6,0x586d68);
 for(const x of [-6.3,6.3])box(x,3.48,0,2.6,.24,10,0x586d68);
 for(const x of [-11.2,11.2])box(x,3.48,0,1.6,.24,10,0x586d68);
 // One-metre landings close the ends of each stairwell at z +/- 4..5.
 for(const x of [-9,9])for(const z of [-4.5,4.5])box(x,3.48,z,2.8,.24,1,0x586d68);
 for(const side of [{horizontal:true,v:11,edge:12,windows:[-7,7]},{horizontal:true,v:-11,edge:12,windows:[-7,7]},{horizontal:false,v:12,edge:11,windows:[-7,7]},{horizontal:false,v:-12,edge:11,windows:[-7,7]}]){
  const part=(a,b,y,h,color=0x496c68,depth=.3)=>side.horizontal?box((a+b)/2,y,side.v,b-a,h,depth,color):box(side.v,y,(a+b)/2,depth,h,b-a,color);
  let cursor=-side.edge;
  for(const pos of side.windows){part(cursor,pos-1.25,3.6,7.2);for(const y of [0,3.6]){part(pos-1.25,pos+1.25,y+.4,.8);part(pos-1.25,pos+1.25,y+3.04,.78);}cursor=pos+1.25;}
  part(cursor,side.edge,3.6,7.2);part(-side.edge,side.edge,.2,.3,0xc39a5f,.4);part(-side.edge,side.edge,3.7,.18,0xc39a5f,.42);
 }
 for(const w of map.windows){
  const group=new T.Group();group.position.set(w.x,0,w.z);group.rotation.y=w.nx?Math.PI/2:0;r.scene.add(group);
  for(const y of [0,3.6]){for(const x of [-1.32,1.32])box(x,y+1.73,0,.12,2.05,.46,0xe0c6a0,group);box(0,y+.8,0,2.8,.15,.6,0xe0c6a0,group);box(0,y+2.7,0,2.8,.15,.48,0xe0c6a0,group);}
  const boards=[];for(let i=0;i<3;i++){const b=box(0,1.04+i*.52,0,2.55,.26,.13,0xb88d5b,group);b.rotation.z=(i-1)*.06;boards.push(b);}r.boards.set(w.id,boards);
  const label=r.label(w.name.toUpperCase(),'#e7c88d','#224745',1.8,.4);label.position.set(w.x-w.nx*.3,2.96,w.z-w.nz*.3);label.rotation.y=w.nz===1?Math.PI:w.nx===1?-Math.PI/2:w.nx===-1?Math.PI/2:0;r.scene.add(label);
 }
 for(const stair of map.stairs){
  for(let i=0;i<24;i++){const z=stair.z0+(i+.5)*(stair.z1-stair.z0)/24,h=(i+1)*3.6/24;box(stair.x,h/2,z,stair.w,h,(stair.z1-stair.z0)/24,0x8e9a88);}
  for(const side of [-1,1])for(let i=0;i<=8;i++){const z=stair.z0+i;box(stair.x+side*1.48,3.6*i/8+.5,z,.07,1,.07,0xd5b675);}
  const label=r.label('GALLERY ↑','#f6d79b','#224745',1.6,.4);label.position.set(stair.x,1.9,stair.z0-.25);label.rotation.y=Math.PI;r.scene.add(label);
 }
 // Low solid gallery edges match the collision boundary around the open atrium.
 for(const z of [-5,5]){box(0,4.1,z,10,1,.12,0x2b494b);box(0,4.64,z,10,.08,.18,0xc6a46e);}
 for(const x of [-5,5]){box(x,4.1,0,.12,1,10,0x2b494b);box(x,4.64,0,.18,.08,10,0xc6a46e);}
 for(const x of [-5,5])for(const z of [-5,5])box(x,1.8,z,.45,3.6,.45,0x294d4d);
 for(const o of map.obstacles){box(o.x,(o.y||0)+o.h/2,o.z,o.w,o.h,o.d,o.kind==='sofa'?0xae7c52:0x64867b);box(o.x,(o.y||0)+o.h+.05,o.z,o.w+.08,.1,o.d+.08,0xc8b88c);}
 for(const st of map.stations){
  const y=st.y||0;box(st.x,y+.6,st.z,1.05,1.2,.65,st.id==='health'?0xd6d0b0:0x354d4b);
  const sign=r.label(st.name.toUpperCase()+'\n'+st.cost+' CREDITS','#edca80','#1c3e44',1.8,.65);sign.position.set(st.x,y+1.75,st.z);sign.rotation.y=st.x>0?-Math.PI/2:st.x<0?Math.PI/2:0;r.scene.add(sign);
 }
 const title=r.label('EVERWELL RETREAT\nYOUR FUTURE. OUR ASSET.','#e9c891','#183f40',6,1.4);title.position.set(0,5.6,-10.8);r.scene.add(title);
 for(const x of [-7,7])for(const z of [-7,7]){const lamp=new T.PointLight(0xffd3a0,24,14,2);lamp.position.set(x,6,z);r.scene.add(lamp);box(x,6.4,z,.5,.25,.5,0xeed9ae);}
 r.ceiling=box(0,7.4,0,24.4,.2,22.4,0x354d4b);r.roof=new T.Group();r.scene.add(r.roof);box(0,7.5,0,25,.3,23,0x274b4e,r.roof);
 // Skylight frame, trees and rain maintain the blue-hour neighborhood palette.
 for(const x of [-4,4])box(x,7.2,0,.18,.18,9,0xbca273);
 for(let i=0;i<18;i++){const angle=i*2.399,x=Math.cos(angle)*24,z=Math.sin(angle)*24;r.cylinder(x,2,z,.22,4,0x324c43);const crown=new T.Mesh(new T.IcosahedronGeometry(2,0),r.mat(0x3b6053));crown.position.set(x,4,z);r.scene.add(crown);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([],3));r.rain=new T.Points(geo,new T.PointsMaterial({color:0xa0c6c9}));r.scene.add(r.rain);
}
