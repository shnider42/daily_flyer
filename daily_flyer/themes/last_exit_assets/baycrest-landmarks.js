// Original Baycrest landmarks. All y coordinates are relative to the parent's
// plateau sampler; walk-surface heights are measured above paving at y=.18.
const C=(x,z,w,d,h)=>({x,z,w,d,h,landmark:true});
const TERRACE=[{x:14,z:-6,w:14,d:22,height:1.8},...Array.from({length:12},(_,i)=>({x:14,z:16.5-i,w:14,d:1,height:(i+1)*15/100}))];
const DATA=[
 {kind:'painted',name:'PAINTED STEPS',x:-108,z:108,entryX:0,local:[...[-15,15].flatMap(x=>[-14,0,14].flatMap(z=>[C(x,z,14,10,12),C(Math.sign(x)*7.35,z,1.3,4.8,8)]))]},
 {kind:'telegraph',name:'TELEGRAPH TERRACE',x:-36,z:-36,entryX:0,local:[C(-8,-8,6.4,6.4,28)]},
 {kind:'cable',name:'CABLE YARD',x:108,z:108,entryX:21.5,local:[C(0,-14,36,16,10.1),C(-10,7,4.4,12.4,4.7)]},
 {kind:'ferry',name:'FERRY MARKET',x:180,z:36,entryX:0,local:[C(-13,-13,14,18,10),C(13,-13,14,18,10),...[-14,14].flatMap(x=>[C(x,8,6,5,1.6),C(x,17,6,5,1.6)])]},
 {kind:'fort',name:'FORT POINT',x:108,z:-180,entryX:0,local:[C(-17,-4,10,32,5),C(17,-4,10,32,5),C(-8,-17,8,6,5),C(8,-17,8,6,5),C(-9,16,2.2,4,1.8),C(9,16,2.2,4,1.8)]},
 {kind:'laurel',name:'LAUREL PARK',x:-180,z:-108,entryX:0,local:[...[-17,17].flatMap(x=>[-16,0,16].map(z=>C(x,z,.8,.8,7.7))),...Array.from({length:8},(_,i)=>C(Math.cos(i*Math.PI/4+Math.PI/8)*5.5,Math.sin(i*Math.PI/4+Math.PI/8)*5.5,.45,.45,5))]}
];
export function baycrestFeatures(){return DATA.map(({local,entryX,...f})=>({...f,w:49,d:49,colliders:local.map(c=>({...c,x:c.x+f.x,z:c.z+f.z,kind:f.kind})),walkSurfaces:(f.kind==='telegraph'?TERRACE:[]).map(s=>({...s,x:s.x+f.x,z:s.z+f.z})),entrance:{x:f.x+entryX,z:f.z+24},northEntrance:{x:f.x+entryX,z:f.z-24}}));}
function wall(m,x,z,w,h,d,slot=14,tint='#ffffff',y=.18){
 const X=x-w/2,xx=x+w/2,Z=z-d/2,zz=z+d/2,Y=y+h;
 m.surface([X,y,Z],[xx,y,Z],[xx,Y,Z],[X,Y,Z],slot,w/6,h/6,tint);m.surface([xx,y,zz],[X,y,zz],[X,Y,zz],[xx,Y,zz],slot,w/6,h/6,tint);
 m.surface([X,y,zz],[X,y,Z],[X,Y,Z],[X,Y,zz],slot,d/6,h/6,tint);m.surface([xx,y,Z],[xx,y,zz],[xx,Y,zz],[xx,Y,Z],slot,d/6,h/6,tint);m.flat(x,z,w,d,'#8b8a77',Y);
}
function cylinder(m,x,y,z,r,h,col,n=10,R=r){for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;m.quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*R,y+h,z+Math.sin(b)*R],[x+Math.cos(a)*R,y+h,z+Math.sin(a)*R],col);m.tri([x,y+h,z],[x+Math.cos(a)*R,y+h,z+Math.sin(a)*R],[x+Math.cos(b)*R,y+h,z+Math.sin(b)*R],col);}}
function placed(m,x,z,a,draw){const t=m.transform||{x:0,z:0,c:1,s:0},c=Math.cos(a),s=Math.sin(a);m.transform={x:t.x+x*t.c+z*t.s,z:t.z+z*t.c-x*t.s,c:t.c*c-t.s*s,s:t.s*c+t.c*s,y:t.y||0};draw();m.transform=t;}
function gable(m,x,z,w,d,y,rise,col){const X=x-w/2,xx=x+w/2,Z=z-d/2,zz=z+d/2;m.quad([X,y,Z],[x,y+rise,Z],[x,y+rise,zz],[X,y,zz],col);m.quad([x,y+rise,Z],[xx,y,Z],[xx,y,zz],[x,y+rise,zz],col);m.tri([X,y,Z],[xx,y,Z],[x,y+rise,Z],'#b7aa8d');m.tri([xx,y,zz],[X,y,zz],[x,y+rise,zz],'#cbbd9c');}
function lamp(m,x,z,y=.18){m.tube([x,y,z],[x,y+4.9,z],.075,'#4f6254',6);cylinder(m,x,y+4.8,z,.29,.4,'#c2c3a1',6,.22);cylinder(m,x,y+5.2,z,.38,.23,'#465c4d',6,0);}
function bench(m,x,z,y=.18){for(const q of[-1.05,1.05]){m.box(x+q,y,z,.11,.55,.6,'#54614b');m.tube([x+q,y,z+.25],[x+q,y+1,z+.25],.05,'#54614b',4);}m.box(x,y+.55,z,2.8,.12,.65,'#9c8960');m.box(x,y+.82,z+.28,2.8,.3,.1,'#a28f66');}
function tree(m,x,z,variant=0){m.tube([x,.18,z],[x+.2,4.5,z-.1],.2,'#79674e',6);const ellipsoid=(cx,cy,cz,rx,ry,rz,col)=>{const p=(j,k)=>{const a=k*Math.PI/3,t=-Math.PI/2+j*Math.PI/3;return[cx+Math.cos(t)*Math.cos(a)*rx,cy+Math.sin(t)*ry,cz+Math.cos(t)*Math.sin(a)*rz];};for(let j=0;j<3;j++)for(let k=0;k<6;k++)m.quad(p(j,k),p(j,k+1),p(j+1,k+1),p(j+1,k),col);};ellipsoid(x,5.4,z,2.4,2.2,2.25,variant?'#72805a':'#607652');ellipsoid(x+1.15,4.5,z+.8,1.5,1.4,1.4,'#7f8861');}
function clock(m,x,y,z,r=1.5){for(let k=0;k<20;k++){const a=k*Math.PI/10,b=(k+1)*Math.PI/10;m.tri([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],'#d4c9a8');}for(let k=0;k<12;k++){const a=k*Math.PI/6;m.tube([x+Math.sin(a)*r*.78,y+Math.cos(a)*r*.78,z+.025],[x+Math.sin(a)*r*.92,y+Math.cos(a)*r*.92,z+.025],.035,'#384d43',4);}m.tube([x,y,z+.05],[x-.58,y+.38,z+.05],.055,'#384d43',4);m.tube([x,y,z+.07],[x+.2,y+1.12,z+.07],.045,'#384d43',4);}
function victorian(m,col,index){
 wall(m,0,0,10,8.5,14,6,col);m.box(0,.18,0,10.25,.6,14.2,'#b8ad93');m.box(0,7.9,0,10.5,.3,14.4,'#d6c5a1');gable(m,0,0,10.8,14.8,8.6,2.8,index%2?'#7c7163':'#6b7b72');
 // Faceted bay windows project into the inner lane, with pale timber mullions.
 const section=[[-2.4,7],[-1.8,8.3],[1.8,8.3],[2.4,7]];
 for(let j=0;j<3;j++){const a=section[j],b=section[j+1];m.quad([a[0],.78,a[1]],[b[0],.78,b[1]],[b[0],7.6,b[1]],[a[0],7.6,a[1]],col);for(const y of[1.8,5]){m.quad([a[0]+(b[0]-a[0])*.12,y,a[1]+(b[1]-a[1])*.12+.015],[a[0]+(b[0]-a[0])*.88,y,a[1]+(b[1]-a[1])*.88+.015],[a[0]+(b[0]-a[0])*.88,y+1.8,a[1]+(b[1]-a[1])*.88+.015],[a[0]+(b[0]-a[0])*.12,y+1.8,a[1]+(b[1]-a[1])*.12+.015],'#4b6261');}m.tube([a[0],.78,a[1]+.03],[a[0],7.6,a[1]+.03],.065,'#dfd0aa',4);m.tube([a[0],4.35,a[1]+.03],[b[0],4.35,b[1]+.03],.09,'#d7c7a1',4);m.tri([a[0],7.6,a[1]],[b[0],7.6,b[1]],[0,8.5,7],'#708071');}
 m.quad([3,.8,7.02],[4.3,.8,7.02],[4.3,3.1,7.02],[3,3.1,7.02],'#526b5c');for(let i=0;i<3;i++)m.box(3.65,.18,8.1-i*.35,1.8,.18*(i+1),.35,'#c2b497');
 m.box(0,8.6,7.3,7.6,.18,.35,'#e0cfa8');m.tri([-2.4,8.8,7.42],[2.4,8.8,7.42],[0,10.6,7.42],col);m.quad([-.6,9.1,7.44],[.6,9.1,7.44],[.6,10.1,7.44],[-.6,10.1,7.44],'#435b57');m.box(-3.7,9.4,-4.8,1,2.2,1.3,'#99765d');
}
function painted(m){m.surface([-5.5,.176,-24],[5.5,.176,-24],[5.5,.176,24],[-5.5,.176,24],2,4,16,'#d0c4a3');const colors=['#b3b58a','#b98a79','#87aaa0','#c7b886','#a994a5','#7f9d92'];let i=0;for(const side of[-1,1])for(const z of[-14,0,14]){const k=i++;placed(m,side*15,z,side<0?Math.PI/2:-Math.PI/2,()=>victorian(m,colors[k],k));}for(const z of[-22,22])lamp(m,4.5,z);}
function telegraph(m){
 m.disc(-8,.176,-8,7,'#b6b197',24);cylinder(m,-8,.18,-8,3.2,.6,'#c4baa0',8,2.8);cylinder(m,-8,.78,-8,2.55,19.5,'#b5b8a1',10,2.15);cylinder(m,-8,20.28,-8,3.05,.5,'#d1c8a8',10,3.05);
 for(let i=0;i<10;i++){const a=i*Math.PI/5,b=(i+1)*Math.PI/5,p=(t,r,y)=>[-8+Math.cos(t)*r,y,-8+Math.sin(t)*r];m.quad(p(a,2.6,20.78),p(b,2.6,20.78),p(b,2.6,24.6),p(a,2.6,24.6),'#465e56');m.tube(p(a,2.68,20.78),p(a,2.68,24.7),.12,'#d2c9aa',5);}
 cylinder(m,-8,24.7,-8,3.2,.42,'#c6bda0',10,3.2);cylinder(m,-8,25.12,-8,3.45,.5,'#7b8c78',10,2.6);m.tube([-8,25.62,-8],[-8,28,-8],.07,'#66785e',5);
 const top=1.98;wall(m,14,-6,14,1.8,22,14,'#c2bca0');m.surface([7,top+.002,-17],[21,top+.002,-17],[21,top+.002,5],[7,top+.002,5],2,5,8,'#dbd1b0');
 for(const s of TERRACE.slice(1)){wall(m,s.x,s.z,s.w,s.height,s.d,14,'#bbb395');m.flat(s.x,s.z,s.w,s.d,'#cbc5a7',.182+s.height);m.flat(s.x,s.z+.46,s.w,.08,'#e9ddba',.184+s.height);}
 for(const x of[7,21]){for(const y of[top+.5,top+.95])m.tube([x,y,-17],[x,y,5],.045,'#63735a',5);for(let z=-17;z<=5;z+=2.75)m.tube([x,top,z],[x,top+1,z],.05,'#63735a',5);m.tube([x,top+.95,5],[x,1.13,17],.045,'#63735a',5);for(let z=5;z<=17;z+=3){const y=.18+Math.max(0,1.8-(z-5)*.15);m.tube([x,y,z],[x,y+1,z],.05,'#63735a',5);}}
 for(const y of[top+.5,top+.95])m.tube([7,y,-17],[21,y,-17],.045,'#63735a',5);bench(m,-15,13);lamp(m,-19,19);lamp(m,19,-20);
}
function cableCar(m){
 m.box(0,.52,0,4.2,.52,12,'#55594a');m.box(0,1.04,0,4.15,1.2,11.8,'#9e583e');m.box(0,1.45,0,4.3,.18,12.1,'#d0ae68');m.box(0,4.13,0,4.7,.22,12.4,'#cbbd96');m.box(0,4.35,0,4.3,.22,11.8,'#b5ab8c');
 for(const x of[-1.94,1.94]){for(const z of[-5.4,-2.8,0,2.8,5.4])m.tube([x,2.2,z],[x,4.14,z],.075,'#d0bd8f',5);for(const z of[-1.15,1.15])m.quad([x,2.2,z-1.05],[x,2.2,z+1.05],[x,3.9,z+1.05],[x,3.9,z-1.05],'#3c5c5c');}
 for(const z of[-4.2,4.2]){m.box(0,1.15,z,3.3,.16,1.2,'#a58d5c');m.box(0,1.3,z,3.3,.55,.18,'#b39965');for(const x of[-1.85,1.85])m.tube([x-.18,.5,z],[x+.18,.5,z],.41,'#37483e',7);}
 for(const z of[-6.05,6.05]){m.box(0,1.65,z,1.1,1,.15,'#a75d40');m.box(0,2,z+.04,.55,.45,.16,'#cfc394');m.tube([-.6,2.6,z],[.6,2.6,z],.07,'#746d50',5);}
}
function cable(m){wall(m,0,-14,36,6.8,16,4,'#c4b89b');gable(m,0,-14,37,17,6.98,3.1,'#747d6c');for(const x of[-12,0,12])m.surface([x-4,.2,-5.96],[x+4,.2,-5.96],[x+4,5.8,-5.96],[x-4,5.8,-5.96],8,1,1);m.box(0,5.7,-5.8,34,.4,.35,'#aa9d78');for(const x of[-10.75,-9.25,3.25,4.75])m.box(x,.18,8,.11,.07,29,'#a7afa0');for(let z=-5;z<23;z+=1.5){m.box(-10,.176,z,3,.045,.18,'#7d7258');m.box(4,.176,z,3,.045,.18,'#7d7258');}placed(m,-10,7,0,()=>cableCar(m));lamp(m,17,19);bench(m,-19,18);}
function ferry(m){
 for(const x of[-13,13]){wall(m,x,-13,14,8,18,7,'#c5c2a6');gable(m,x,-13,14.6,18.6,8.18,1.65,'#759186');for(const q of[-4,0,4])m.surface([x+q-1.25,1.3,-3.96],[x+q+1.25,1.3,-3.96],[x+q+1.25,5.8,-3.96],[x+q-1.25,5.8,-3.96],9,.7,1.4);}
 // A true open arch connects the terminal wings, leaving a twelve-metre passage.
 for(let i=0;i<12;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;for(const z of[-22,-4])m.quad([Math.cos(a)*6,3+Math.sin(a)*6,z],[Math.cos(b)*6,3+Math.sin(b)*6,z],[Math.cos(b)*7.05,3+Math.sin(b)*7.05,z],[Math.cos(a)*7.05,3+Math.sin(a)*7.05,z],'#c9bea0');m.quad([Math.cos(a)*6,3+Math.sin(a)*6,-22],[Math.cos(b)*6,3+Math.sin(b)*6,-22],[Math.cos(b)*6,3+Math.sin(b)*6,-4],[Math.cos(a)*6,3+Math.sin(a)*6,-4],'#a4a68e');}
 wall(m,0,-13,7,10.4,7,7,'#d0c6a5',9.4);m.box(0,19.8,-13,7.8,.45,7.8,'#c4b598');clock(m,0,17.2,-9.45,1.8);placed(m,0,-13,Math.PI,()=>clock(m,0,17.2,3.55,1.8));gable(m,0,-13,8.3,8.3,20.25,3,'#69907e');m.tube([0,23.25,-13],[0,25,-13],.07,'#aa9c68',5);
 for(const x of[-14,14])for(const z of[8,17]){m.box(x,.18,z,6,.95,5,'#94845f');m.box(x,1.13,z,6.1,.12,5.1,'#baaa7f');for(const xx of[x-2.8,x+2.8])m.tube([xx,1.25,z],[xx,3.6,z],.055,'#a59b78',5);for(let k=0;k<6;k++)m.quad([x-3+k,3.7,z-2.8],[x-2+k,3.7,z-2.8],[x-2+k,3.2,z+2.8],[x-3+k,3.2,z+2.8],k%2?'#b7ad80':'#698b75');for(let k=0;k<3;k++)m.box(x-1.9+k*1.9,1.25,z,1.5,.3,3.7,k%2?'#9d955b':'#879763');}
 m.surface([-5,.175,-24],[5,.175,-24],[5,.175,24],[-5,.175,24],2,3,16,'#d8cfad');lamp(m,-21,22);lamp(m,21,22);
}
function fort(m){
 for(const x of[-17,17]){wall(m,x,-4,10,3.8,32,14,'#a99a7c');m.box(x,3.98,-4,10.6,.35,32.6,'#b5ac91');for(let z=-19;z<12;z+=3.4)m.box(x,4.33,z,10.3,.6,1.2,'#b2a88b');for(const z of[-12,-4,4])m.quad([x-Math.sign(x)*5.01,.5,z-1.2],[x-Math.sign(x)*5.01,.5,z+1.2],[x-Math.sign(x)*5.01,2.6,z+1.2],[x-Math.sign(x)*5.01,2.6,z-1.2],'#495a4d');}
 for(const x of[-8,8]){wall(m,x,-17,8,3.8,6,14,'#a89a7b');m.box(x,4,-17,8.2,.9,6.2,'#b7ad8f');}
 m.surface([-11.5,.175,-24],[11.5,.175,-24],[11.5,.175,24],[-11.5,.175,24],2,6,16,'#c0b89a');
 for(const x of[-9,9]){m.box(x,.18,16,1.5,.65,2,'#7f7453');m.tube([x,1.05,14.3],[x,1.45,18],.34,'#536454',8);for(const q of[-.8,.8])m.tube([x+q-.1,.63,16],[x+q+.1,.63,16],.48,'#5e6753',8);}
 m.tube([18,4.4,-12],[18,13,-12],.065,'#9c9e7c',6);m.quad([18,12.8,-12],[18,10.8,-12],[18,10.6,-8.5],[18,12.4,-8.5],'#ba7e5e');bench(m,-6,22);lamp(m,-20,20);lamp(m,20,20);
}
function laurel(m){m.flat(0,0,46,46,'#71835e',.174);m.surface([-4,.179,-24],[4,.179,-24],[4,.179,24],[-4,.179,24],2,3,16,'#c7c2a1');m.surface([-24,.181,-2.2],[24,.181,-2.2],[24,.181,2.2],[-24,.181,2.2],2,16,2,'#c7c2a1');m.disc(0,.183,0,7.4,'#b9b798',16);for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,b=(k+1)*Math.PI/4+Math.PI/8,x=Math.cos(a)*5.5,z=Math.sin(a)*5.5;m.tube([x,.18,z],[x,4.8,z],.12,'#c9bea0',6);m.tube([x,4.7,z],[Math.cos(b)*5.5,4.7,Math.sin(b)*5.5],.1,'#b7b190',5);m.tri([Math.cos(a)*6.8,4.8,Math.sin(a)*6.8],[Math.cos(b)*6.8,4.8,Math.sin(b)*6.8],[0,7.4,0],k%2?'#5e7d67':'#718b70');}let i=0;for(const x of[-17,17])for(const z of[-16,0,16])tree(m,x,z,i++%2);for(const x of[-11,11])for(const z of[-9,9])bench(m,x,z);lamp(m,-20,21);lamp(m,20,-21);}
const DRAW={painted,telegraph,cable,ferry,fort,laurel};
export function drawBaycrestLandmarks(m,features){const old=m.transform;for(const f of features){const draw=DRAW[f.kind];if(!draw)continue;m.transform={x:f.x,z:f.z,c:1,s:0};draw(m);}m.transform=old;}
function boat(m,x,z,size,col){const w=size*.28,l=size/2,y=-1.55;m.quad([x-w,y,z-l],[x+w,y,z-l],[x+w*.8,y-1,z+l*.7],[x-w*.8,y-1,z+l*.7],col);m.tri([x-w,y,z-l],[x+w,y,z-l],[x,y-1,z-l-2],col);m.quad([x-w,y,z-l],[x-w*.8,y-1,z+l*.7],[x,y-.1,z+l],[x-w*.75,y+.4,z+l*.65],col);m.quad([x+w*.8,y-1,z+l*.7],[x+w,y,z-l],[x+w*.75,y+.4,z+l*.65],[x,y-.1,z+l],col);m.flat(x,z,size*.42,size*.75,'#c5b994',y+.05);m.box(x,y+.1,z-1,size*.3,size*.15,size*.32,'#c7c5ab');m.box(x,y+size*.15,z-1,size*.32,.2,size*.34,'#647c6d');m.tube([x,y+1,z],[x,y+size*.7,z],.075,'#aaa383',5);}
export function drawBaycrestHorizon(m){
 const old=m.transform;m.transform=null;
 // The offshore crossing is scenery only. Its whole footprint is east of x=250.
 const orange='#ad694d',dark='#8d5844',x=327;
 m.box(x,12,-50,22,1.5,460,'#8d8874');for(const side of[-1,1]){m.box(x+side*11,13.5,-50,.55,1.4,460,orange);for(const z of[-160,60]){m.box(x+side*8,-2,z,4.5,70,7,orange);m.box(x+side*8,64,z,5.3,3,8,orange);}}
 for(const z of[-160,60]){for(const y of[20,39,59])m.box(x,y,z,16,3,5.5,orange);for(const y of[24,43]){m.tube([x-6,y,z],[x+6,y+12,z],.42,dark,4);m.tube([x+6,y,z],[x-6,y+12,z],.42,dark,4);}m.box(x,-2,z,31,5,17,'#9a9d86');}
 const spans=[[-280,-160,16,65,14],[-160,60,65,65,28],[60,180,65,16,14]];
 for(const side of[-1,1])for(const [a,b,ya,yb,sag]of spans){const n=Math.ceil((b-a)/15),height=t=>ya+(yb-ya)*t-sag*4*t*(1-t);for(let i=0;i<n;i++){const t=i/n,T=(i+1)/n,z=a+(b-a)*t,Z=a+(b-a)*T,Y=height(t),YY=height(T);m.tube([x+side*8,Y,z],[x+side*8,YY,Z],.24,orange,4);if(i>0)m.tube([x+side*8,13.8,z],[x+side*8,Y,z],.07,dark,4);}}
 for(const z of[-280,180]){m.box(x,-2,z,30,17,15,'#9b9d86');m.box(x,15,z,25,2,17,'#ab9e7e');}
 boat(m,275,-220,13,'#6d8579');boat(m,286,-63,18,'#a28462');boat(m,267,157,10,'#8b7a64');m.transform=old;
}
