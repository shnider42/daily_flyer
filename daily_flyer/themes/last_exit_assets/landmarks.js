// Original Port Meridian landmarks. Geometry and collision footprints share one definition.
const C=(x,z,w,d,h)=>({x,z,w,d,h,landmark:true});
// Walk heights are measured above the plaza paving at y=.18. Rectangles use
// their centers; these are traversal surfaces, deliberately not solid colliders.
const PLAZA_WALK=[
 {x:17.5,z:-6,w:9,d:22,height:1.8},
 ...Array.from({length:12},(_,i)=>({x:17.5,z:16.5-i,w:9,d:1,height:(i+1)*15/100}))
];
const FEATURES=[
 {kind:'plaza',name:'CLOCK SQUARE',x:36,z:108,w:49,d:49,local:[C(0,0,8,8,28.2),C(-14,-12,5.6,5.6,2.4)]},
 {kind:'depot',name:'UNION DEPOT',x:-180,z:-108,w:49,d:49,local:[C(0,-17,34,9,7.3),C(0,-6,40,11,.55),C(0,7,30,3.8,4.1)]},
 {kind:'harbor',name:'IRON QUAY',x:180,z:108,w:49,d:49,local:[C(-7,-18,30,9,8.7),C(-16,0,5.3,12.57,5.18),C(-7,0,5.3,12.57,2.7),C(-13,17,17.1,5.37,2.7),C(10,0,1.4,1.4,26),C(20,0,1.4,1.4,26),C(10,10,1.4,1.4,26),C(20,10,1.4,1.4,26)]},
 {kind:'motel',name:'PALM COURT MOTEL',x:108,z:36,w:49,d:49,local:[C(0,-17,42,10,7),C(-17,3,8,30,7),C(17,3,8,30,7),C(-5.2,15.8,.5,.5,3.6),C(5.2,15.8,.5,.5,3.6),C(22,20,.7,.7,9)]},
 {kind:'park',name:'MERCER GARDENS',x:-108,z:-36,w:49,d:49,local:[C(0,0,8.4,8.4,3.9),...[-16,16].flatMap(x=>[-16,-7,7,16].map(z=>C(x,z,.8,.8,7))),C(-8,-7,3.2,.8,1),C(8,7,3.2,.8,1),C(-8,7,3.2,.8,1),C(8,-7,3.2,.8,1)]}
];
export function districtFeatures(){return FEATURES.map(({local,...f})=>({...f,colliders:local.map(c=>({...c,x:c.x+f.x,z:c.z+f.z,kind:f.kind})),walkSurfaces:(f.kind==='plaza'?PLAZA_WALK:[]).map(s=>({...s,x:s.x+f.x,z:s.z+f.z}))}));}
export function walkSurfaces(){return districtFeatures().flatMap(f=>f.walkSurfaces);}
function wall(m,x,z,w,h,d,slot=14,tint='#ffffff',y=.18){
 const X=x-w/2,xx=x+w/2,Z=z-d/2,zz=z+d/2,Y=y+h;
 m.surface([X,y,Z],[xx,y,Z],[xx,Y,Z],[X,Y,Z],slot,w/6,h/6,tint);
 m.surface([xx,y,zz],[X,y,zz],[X,Y,zz],[xx,Y,zz],slot,w/6,h/6,tint);
 m.surface([X,y,zz],[X,y,Z],[X,Y,Z],[X,Y,zz],slot,d/6,h/6,tint);
 m.surface([xx,y,Z],[xx,y,zz],[xx,Y,zz],[xx,Y,Z],slot,d/6,h/6,tint);
 m.flat(x,z,w,d,'#77796c',Y);
}
function cylinder(m,x,y,z,r,h,color,n=12,rTop=r){
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;m.quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*rTop,y+h,z+Math.sin(b)*rTop],[x+Math.cos(a)*rTop,y+h,z+Math.sin(a)*rTop],color);m.tri([x,y+h,z],[x+Math.cos(a)*rTop,y+h,z+Math.sin(a)*rTop],[x+Math.cos(b)*rTop,y+h,z+Math.sin(b)*rTop],color);}
}
function foliage(m,x,y,z,rx,ry,rz,color,n=7,rings=3){
 const p=(j,k)=>{const a=k/n*Math.PI*2,t=-Math.PI/2+j/rings*Math.PI;return[x+Math.cos(a)*Math.cos(t)*rx,y+Math.sin(t)*ry,z+Math.sin(a)*Math.cos(t)*rz];};
 for(let j=0;j<rings;j++)for(let k=0;k<n;k++)m.quad(p(j,k),p(j,k+1),p(j+1,k+1),p(j+1,k),color,.88+(k%3)*.055);
}
function tree(m,x,z,index){
 m.tube([x,.18,z],[x+.2,4.8,z-.12],.17,'#746650',7);m.tube([x+.05,2.8,z],[x+1,4.5,z+.6],.075,'#6f614b',5);
 foliage(m,x,5.5,z,2.1,2.15,2,'#657652');foliage(m,x+1.25,4.7,z+.65,1.4,1.4,1.3,index%2?'#77845a':'#586f50');
}
function bench(m,x,z,a=0){
 const co=Math.cos(a),si=Math.sin(a),p=(xx,yy,zz)=>[x+xx*co+zz*si,yy,z+zz*co-xx*si];
 for(const xx of[-1.1,1.1]){m.tube(p(xx,.19,-.2),p(xx,.75,-.2),.065,'#3b4943',5);m.tube(p(xx,.19,.22),p(xx,1.15,.22),.065,'#3b4943',5);}
 for(let k=0;k<3;k++)m.quad(p(-1.5,.72,-.3+k*.2),p(1.5,.72,-.3+k*.2),p(1.5,.72,-.17+k*.2),p(-1.5,.72,-.17+k*.2),'#9b8359');
 for(let k=0;k<2;k++)m.quad(p(-1.5,.88+k*.2,.23),p(1.5,.88+k*.2,.23),p(1.5,1.02+k*.2,.23),p(-1.5,1.02+k*.2,.23),'#94805b');
}
function lamp(m,x,z){m.tube([x,.18,z],[x,5.2,z],.07,'#3e5047',6);cylinder(m,x,5.05,z,.34,.45,'#a8b09b',6,.23);cylinder(m,x,5.5,z,.42,.28,'#384b42',6,0);}
function dial(m,cx,y,cz,normal){
 const [nx,nz]=normal,rx=nz,rz=-nx,p=(u,v,depth=.045)=>[cx+rx*u+nx*depth,y+v,cz+rz*u+nz*depth];
 for(let k=0;k<24;k++){const a=k/24*Math.PI*2,b=(k+1)/24*Math.PI*2;m.tri(p(0,0),p(Math.cos(a)*1.86,Math.sin(a)*1.86),p(Math.cos(b)*1.86,Math.sin(b)*1.86),'#d2ccb1');}
 for(let k=0;k<12;k++){const a=k/12*Math.PI*2;m.tube(p(Math.sin(a)*1.48,Math.cos(a)*1.48,.07),p(Math.sin(a)*1.7,Math.cos(a)*1.7,.07),.045,'#343f38',4);}
 m.tube(p(0,0,.1),p(-.65,.53,.1),.067,'#3c443b',5);m.tube(p(0,0,.115),p(.28,1.27,.115),.05,'#3c443b',5);
}
function fountain(m,x,z,r=2.8){
 cylinder(m,x,.18,z,r,.38,'#b4ad90',16,r);cylinder(m,x,.56,z,r,.35,'#928f77',16,r-.28);m.disc(x,.91,z,r-.33,'#6f9290',24);cylinder(m,x,.91,z,.35,1.3,'#9fa78f',10,.24);cylinder(m,x,2.2,z,1.5,.18,'#bbb89d',16,1.2);m.disc(x,2.39,z,1.18,'#85a5a0',16);
 for(let k=0;k<8;k++){const a=k*Math.PI/4; m.tube([x+Math.sin(a)*1.1,2.4,z+Math.cos(a)*1.1],[x+Math.sin(a)*1.7,1,z+Math.cos(a)*1.7],.025,'#9bbcb1',4);}
}
function clockTerrace(m){
 const base=.18,top=base+1.8,metal='#53695c';
 wall(m,17.5,-6,9,1.8,22,14,'#b8ad8d',base);
 m.surface([13,top+.002,-17],[22,top+.002,-17],[22,top+.002,5],[13,top+.002,5],2,3,7,'#e0d8b9');
 // Twelve broad, shallow treads share the exact footprint used for walking.
 for(const s of PLAZA_WALK.slice(1)){
  wall(m,s.x,s.z,s.w,s.height,s.d,14,'#c3b794',base);
  m.surface([13,base+s.height+.002,s.z-.5],[22,base+s.height+.002,s.z-.5],[22,base+s.height+.002,s.z+.5],[13,base+s.height+.002,s.z+.5],2,3,.33,'#e2d9b7');
  m.flat(s.x,s.z+.46,s.w,.08,'#eee3bf',base+s.height+.004);
 }
 // Open south entrance, with railings only on the terrace's exposed sides.
 const rail=(a,b,y)=>{m.tube([a[0],y,a[1]],[b[0],y,b[1]],.045,metal,5);};
 for(const x of[13,22]){
  rail([x,-17],[x,5],top+.95);rail([x,-17],[x,5],top+.5);
  for(let z=-17;z<=5;z+=2.75)m.tube([x,top,z],[x,top+1,z],.05,metal,5);
  for(let z=5;z<=17;z+=3){const y=base+Math.max(0,1.8-(z-5)*.15);m.tube([x,y,z],[x,y+1,z],.05,metal,5);}
  m.tube([x,top+.95,5],[x,base+.95,17],.045,metal,5);
 }
 rail([13,-17],[22,-17],top+.95);rail([13,-17],[22,-17],top+.5);
 for(const x of[15.25,17.5,19.75])m.tube([x,top,-17],[x,top+1,-17],.05,metal,5);
}
function clockSquare(m){
 m.disc(0,.174,0,13,'#aaa590',32);m.ring(0,.18,0,12.4,'#d1c8a7');m.ring(0,.18,0,10.8,'#777e6d');
 cylinder(m,0,.18,0,4.5,.35,'#c4b899',8,4.35);cylinder(m,0,.53,0,4.2,.4,'#b6aa8c',8,3.85);
 wall(m,0,0,5.7,17.8,5.7,14,'#dad1b5',.93);
 for(const x of[-2.92,2.92])for(const z of[-2.92,2.92])m.box(x,1,z,.32,17.8,.32,'#c4b590');
 m.box(0,18.7,0,7.2,.4,7.2,'#c0b89a');wall(m,0,0,6.9,5.5,6.9,14,'#ded5b9',19.1);
 for(const n of[[0,1],[1,0],[0,-1],[-1,0]])dial(m,n[0]*3.46,21.8,n[1]*3.46,n);
 m.box(0,24.6,0,7.5,.32,7.5,'#cabf9e');for(let k=0;k<4;k++){const a=k*Math.PI/2,b=(k+1)*Math.PI/2;m.tri([Math.cos(a)*5.3,24.92,Math.sin(a)*5.3],[Math.cos(b)*5.3,24.92,Math.sin(b)*5.3],[0,27.3,0],'#536c60');}m.tube([0,27.3,0],[0,28.1,0],.06,'#bdad76',5);
 fountain(m,-14,-12,2.8);for(const x of[-19,19])for(const z of[-19,19])lamp(m,x,z);
 clockTerrace(m);
 bench(m,10,13);bench(m,-12,13);bench(m,11,-11,Math.PI/2);
}
function depot(m){
 wall(m,0,-17,34,6.8,9,4,'#d7cfbb');m.box(0,7,-17,35,.3,10,'#8f9585');
 m.surface([-14,2,-12.45],[14,2,-12.45],[14,5.8,-12.45],[-14,5.8,-12.45],9,5,1);
 m.box(0,.18,-6,40,.36,11,'#aaa28b');
 // Ribbed barrel-vault roof: the curved silhouette reads from across the grid.
 for(let i=0;i<10;i++){const a=i/10*Math.PI,b=(i+1)/10*Math.PI,z=-6+Math.cos(a)*6.2,Z=-6+Math.cos(b)*6.2,y=4.6+Math.sin(a)*3.2,Y=4.6+Math.sin(b)*3.2;m.quad([-20,y,z],[20,y,z],[20,Y,Z],[-20,Y,Z],i%2?'#727e72':'#839080');}
 for(const x of[-19,-10,0,10,19]){for(const z of[-11.8,-.2])m.tube([x,.54,z],[x,4.6,z],.1,'#44594b',6);for(let i=0;i<10;i++){const a=i/10*Math.PI,b=(i+1)/10*Math.PI;m.tube([x,4.64+Math.sin(a)*3.2,-6+Math.cos(a)*6.2],[x,4.64+Math.sin(b)*3.2,-6+Math.cos(b)*6.2],.07,'#cad0b9',5);}}
 for(const z of[4.5,6.4,9.2,11.1])m.box(0,.22,z,45,.09,.12,'#b3b5a3');for(let x=-22;x<23;x+=1.6){m.box(x,.18,5.45,.22,.07,3,'#645b47');m.box(x,.18,10.15,.22,.07,3,'#645b47');}
 // A short two-car electric train, with sloped roof and dark repeated windows.
 for(const x of[-7.6,7.6]){m.box(x,.85,7,14.1,2.3,3.4,'#716c4f');m.box(x,.9,7,14.2,.45,3.5,'#7e4035');m.quad([x-7,3.15,5.3],[x+7,3.15,5.3],[x+6.7,3.65,5.8],[x-6.7,3.65,5.8],'#b3ad94');m.flat(x,7,13.4,2.4,'#a39f89',3.65);m.quad([x-6.7,3.65,8.2],[x+6.7,3.65,8.2],[x+7,3.15,8.7],[x-7,3.15,8.7],'#8e947f');
  for(const z of[5.28,8.72])for(let q=-5.8;q<6;q+=1.8)m.quad([x+q,1.7,z],[x+q+1.2,1.7,z],[x+q+1.2,2.8,z],[x+q,2.8,z],'#344b50');
  for(const xx of[-4.5,4.5])for(const zz of[5.7,8.3])m.tube([x+xx-.4,.65,zz],[x+xx+.4,.65,zz],.37,'#303c3a',8);
 }
 for(const x of[-17,17])lamp(m,x,18);bench(m,-10,-4);bench(m,10,-4);
}
function container(m,x,y,z,w,d,col){
 m.box(x,y,z,w,2.5,d,col);for(let q=-w/2+.35;q<w/2;q+=.6){m.box(x+q,y+.12,z-d/2-.025,.055,2.25,.05,'#a1a393');m.box(x+q,y+.12,z+d/2+.025,.055,2.25,.05,'#757e72');}
 for(let q=-d/2+.35;q<d/2;q+=.6){m.box(x-w/2-.025,y+.12,z+q,.05,2.25,.055,col);m.box(x+w/2+.025,y+.12,z+q,.05,2.25,.055,'#6c7467');}
 m.box(x,y+.15,z+d/2+.06,.05,2.16,.05,'#bac0a6');m.box(x-w*.32,y+.15,z+d/2+.06,.04,2.16,.05,'#bac0a6');m.box(x+w*.32,y+.15,z+d/2+.06,.04,2.16,.05,'#bac0a6');
}
function harbor(m){
 m.surface([-24,.172,-24],[24,.172,-24],[24,.172,24],[-24,.172,24],1,8,8,'#d0c9ae');
 wall(m,-7,-18,30,6.7,9,14,'#d8d4c1');for(let i=0;i<3;i++){const x=-17+i*10;m.surface([x-3,.2,-13.46],[x+3,.2,-13.46],[x+3,5,-13.46],[x-3,5,-13.46],8,1,1);}
 m.quad([-22,6.9,-22.5],[8,6.9,-22.5],[8,8.7,-18],[-22,8.7,-18],'#8c8e7b');m.quad([-22,8.7,-18],[8,8.7,-18],[8,6.9,-13.5],[-22,6.9,-13.5],'#737e70');
 container(m,-16,.18,0,5.2,12.4,'#904d39');container(m,-16,2.68,0,5.2,12.4,'#747f68');container(m,-7,.18,0,5.2,12.4,'#b19d61');container(m,-13,.18,17,17,5.2,'#4d6e74');
 // Four crane legs and diagonal braces leave open ground-level driving lanes.
 const steel='#a2904d',dark='#615b3d';for(const x of[10,20])for(const z of[0,10]){m.box(x,.18,z,1.4,.45,1.4,'#787e6a');m.tube([x,.63,z],[15+(x-15)*.65,25,z],.22,steel,6);}
 for(const z of[0,10])for(let y=5;y<25;y+=5){const width=5*(1-y*.014);m.tube([15-width,y,z],[15+width,y+4.5,z],.10,dark,5);m.tube([15+width,y,z],[15-width,y+4.5,z],.10,steel,5);m.tube([15-width,y,z],[15+width,y,z],.12,steel,5);}
 m.box(15,24.3,5,8,.5,11,'#736c45');m.box(12,25,5,3,2.4,3,'#a3975b');m.surface([10.48,25.5,3.5],[10.48,25.5,6.5],[10.48,27,6.5],[10.48,27,3.5],9,1,1);
 for(const z of[3.6,6.4]){m.tube([20,25.1,z],[-16,29,z],.16,steel,6);m.tube([20,27.1,z],[-16,30.1,z],.16,steel,6);for(let x=-16;x<20;x+=4)m.tube([x,29-(x+16)*.108,z],[x+4,30.1-(x+20)*.083,z],.08,dark,5);}
 m.tube([-9,29.8,5],[-9,10,5],.027,'#3a4841',5);m.tube([-9,10,5],[-9,9.3,5],.15,'#5c6150',7);m.tube([-9,9.3,5],[-8.5,9,5],.08,'#b7b492',6);
 for(const x of[-21,1,21])m.flat(x,21,1.1,3,'#cfbf7b',.183);lamp(m,22,-18);
}
function motel(m){
 wall(m,0,-17,42,6.6,10,6,'#e3d2ac');wall(m,-17,3,8,6.6,30,6,'#dfd4b7');wall(m,17,3,8,6.6,30,6,'#dfd4b7');
 for(const [x,z,w,d]of[[0,-17,43,11],[-17,3,9,31],[17,3,9,31]]){m.box(x,6.82,z,w,.25,d,'#9a624a');m.box(x,3.48,z,w+.4,.2,d+.3,'#cebfa1');}
 // Open upper walkways and room doors face the courtyard.
 for(const side of[-1,1]){const x=side*12.92;for(let z=-8;z<18;z+=4.6){for(const y of[.35,3.7]){m.quad([x,y,z],[x,y,z+1.2],[x,y+2.25,z+1.2],[x,y+2.25,z],'#55756d');m.quad([x,y+.65,z+1.7],[x,y+.65,z+3.3],[x,y+1.9,z+3.3],[x,y+1.9,z+1.7],'#40565b');}m.tube([side*11.7,3.5,z],[side*11.7,4.3,z],.035,'#c9c6a8',4);}m.tube([side*11.7,4.3,-12],[side*11.7,4.3,18],.035,'#c9c6a8',5);m.box(side*12.1,3.45,3,1.6,.16,30,'#beb69b');}
 for(let x=-10;x<11;x+=5){m.flat(x,3,2.3,5,'#d0c9ac',.181);m.flat(x,8,2.3,.1,'#eee2bc',.185);}
 // Entry canopy is deliberately open below: only its two slender columns collide.
 for(const x of[-5.2,5.2])m.tube([x,.18,15.8],[x,3.5,15.8],.14,'#ded3ae',7);
 m.box(0,3.5,17.3,12,.25,6.5,'#a25846');m.box(0,3.75,17.3,11.7,.12,6.2,'#d8c9a6');
 m.tube([22,.18,20],[22,8.6,20],.17,'#6e7364',7);m.surface([18.5,6.2,20.25],[24,6.2,20.25],[24,10.4,20.25],[18.5,10.4,20.25],10,1,1);m.box(21.25,6.05,20.2,5.7,.14,.35,'#c8b997');
 for(const x of[-9,9]){m.tube([x,.18,20],[x+.2,5.8,20],.12,'#938569',6);for(let k=0;k<7;k++){const a=k/7*Math.PI*2;m.tri([x,5.9,20],[x+Math.sin(a)*2.1,5.2,20+Math.cos(a)*2.1],[x+Math.cos(a)*.4,5.7,20-Math.sin(a)*.4],'#65794f');}}
}
function park(m){
 m.flat(0,0,46,46,'#6d8058',.174);m.surface([-24,.179,-1.8],[24,.179,-1.8],[24,.179,1.8],[-24,.179,1.8],2,12,1);m.surface([-1.8,.181,-24],[1.8,.181,-24],[1.8,.181,24],[-1.8,.181,24],2,1,12);m.disc(0,.183,0,8,'#b5b395',24);
 fountain(m,0,0,4.2);cylinder(m,0,2.39,0,.26,1.4,'#8b9b7f',8,.12);
 let i=0;for(const x of[-16,16])for(const z of[-16,-7,7,16])tree(m,x,z,i++);
 for(const [x,z]of[[-8,-7],[8,7],[-8,7],[8,-7]])bench(m,x,z,z>0?Math.PI:0);
 for(const x of[-20,20])for(const z of[-20,20])lamp(m,x,z);
 for(const x of[-7,7])for(const z of[-15,15]){m.disc(x,.19,z,3.5,'#75825a',12);for(let k=0;k<7;k++){const a=k/7*Math.PI*2;foliage(m,x+Math.sin(a)*2,.5,z+Math.cos(a)*2,.6,.45,.6,k%2?'#9c9860':'#79895c',5,2);}}
}
export function drawLandmarks(m,features,time=0){
 const draw={plaza:clockSquare,depot,harbor,motel,park};
 for(const f of features){if(!draw[f.kind])continue;m.transform={x:f.x,z:f.z,c:1,s:0};draw[f.kind](m);m.transform=null;}
}
