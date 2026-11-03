// Original, deliberately faceted period vehicles and a proportioned pedestrian.
// Local vehicle forward is +Z. Damage left/right names use local X -/+.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const panel=(c,k)=>clamp(Number(c.panelDamage?.[k])||0,0,100)/100;

// Every panel detail uses this same deformation, keeping trim and glass attached.
// Wheels retain their circular shape; only their centres shift on severe impacts.
export function deformCarPoint(point,c){
 let [x,y,z]=point;const f=panel(c,'front'),r=panel(c,'rear'),side=x<0?panel(c,'left'):panel(c,'right');
 const fw=clamp((z-.55)/2,0,1),rw=clamp((-z-.65)/1.98,0,1);
 const crease=Math.sin(x*5.7+z*2.1)*.095;
 z-=f*fw*(1.02+crease);z+=r*rw*(.84-crease);
 if(y>.57&&y<1.2){y+=f*fw*(.17*Math.cos(x*2.1)-.13*fw)+r*rw*(.1*Math.sin(x*3)-.18*rw);}
 // A buckled central ridge lifts the hood or bootlid behind the crushed edge.
 if(point[1]>.94&&point[1]<1.16)y+=(f*.58*Math.sin(Math.PI*fw)+r*.42*Math.sin(Math.PI*rw))*(.48+.52*Math.max(0,Math.cos(x*2.1)));
 if(y<.62)y-=.28*(f*fw+r*rw);
 const sw=clamp((Math.abs(x)-.47)/.6,0,1)*clamp(1-Math.abs(z+.15)/2.9,0,1);
 x-=Math.sign(x)*side*sw*(.43+.11*Math.sin(z*4));
 y-=side*sw*.035;
 // A glancing corner hit leaves its own local crease instead of crushing both corners equally.
 let dentX=0,dentZ=0,dentY=0;for(const d of c.dents||[]){const weight=Math.exp(-((point[0]-d.x)**2+(point[2]-d.z)**2)/(d.radius*d.radius))*(point[1]<1.35?1:.2),depth=d.depth*weight;
  if(Math.abs(d.x)>.65)dentX-=Math.sign(d.x)*depth*.65;
  if(Math.abs(d.z)>1.1)dentZ-=Math.sign(d.z)*depth;
  if(point[1]>.8)dentY+=depth*.3*Math.sin(point[0]*7+point[2]*3);
 }
 x+=clamp(dentX,-.36,.36);z+=clamp(dentZ,-.5,.5);y+=clamp(dentY,-.18,.18);
 return[x,y,z];
}

function surface(m,c){return{
 tri(a,b,d,col,shade=1){m.tri(deformCarPoint(a,c),deformCarPoint(b,c),deformCarPoint(d,c),col,shade);},
 quad(a,b,d,e,col,shade=1){m.quad(deformCarPoint(a,c),deformCarPoint(b,c),deformCarPoint(d,c),deformCarPoint(e,c),col,shade);}
};}

function tube(m,a,b,ra,rb,color,n=7){
 const axis=norm(b.map((v,i)=>v-a[i])),u=norm(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u);
 const ring=(p,r,k)=>add(p,u.map((q,i)=>q*Math.cos(k/n*Math.PI*2)*r+v[i]*Math.sin(k/n*Math.PI*2)*r));
 for(let k=0;k<n;k++){const a0=ring(a,ra,k),a1=ring(a,ra,k+1),b0=ring(b,rb,k),b1=ring(b,rb,k+1);m.quad(a0,a1,b1,b0,color,.91+(k%3)*.045);m.tri(a,a1,a0,color,.8);m.tri(b,b0,b1,color);}
}
function ellipsoid(m,p,size,color,n=10,rings=5){
 const at=(j,k)=>{const lat=-Math.PI/2+j/rings*Math.PI,a=k/n*Math.PI*2;return[p[0]+Math.cos(lat)*Math.cos(a)*size[0],p[1]+Math.sin(lat)*size[1],p[2]+Math.cos(lat)*Math.sin(a)*size[2]];};
 for(let j=0;j<rings;j++)for(let k=0;k<n;k++)m.quad(at(j,k),at(j,k+1),at(j+1,k+1),at(j+1,k),color,.85+j/rings*.18);
}
function ribbon(m,a,b,width,col){
 // A narrow vertical-plane strip, used for panel seams, cracks and scraped paint.
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
 const u=Math.hypot(dx,dz)<.01?(Math.abs(a[0])>.95?[0,0,width]:[width,0,0]):[0,width,0];
 m.quad(a,b,add(b,u),add(a,u),col);
}
function loftY(m,rings,color,n=8){
 const pt=(r,k)=>[r[0]+Math.cos(k/n*Math.PI*2)*r[3],r[1],r[2]+Math.sin(k/n*Math.PI*2)*r[4]];
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<n;k++)m.quad(pt(rings[j],k),pt(rings[j],k+1),pt(rings[j+1],k+1),pt(rings[j+1],k),color,.9+(k%2)*.1);
 for(const j of[0,rings.length-1])for(let k=0;k<n;k++)m.tri(rings[j].slice(0,3),pt(rings[j],k),pt(rings[j],k+1),color,.9);
}

function wheel(m,c,side,z,time,opts={}){
 const damage=z>0?panel(c,'front'):panel(c,'rear');
 const radius=opts.radius||.415,width=opts.width||.25,centre=[side*(opts.x||1.015),radius+.01,z-Math.sign(z)*damage*.12];
 const steer=(z>0?-clamp(c.steer||0,-1,1)*.38:0)+(c.wheelDamage||0)/100*.12*side,cs=Math.cos(steer),sn=Math.sin(steer);
 const spin=(c.distance||0)/radius*(c.speed<0?-1:1);
 const bend=clamp(((c.wheelDamage||0)-25)/75,0,1)*(panel(c,side<0?'left':'right')+.15);
 const p=(ax,r,a)=>{const yy=Math.max(-radius*(1-bend*.19),Math.sin(a)*r),xx=ax+yy*bend*.28*side,zz=Math.cos(a)*r;return[centre[0]+xx*cs+zz*sn,centre[1]+yy,centre[2]+zz*cs-xx*sn];};
 const count=opts.count||14;
 // Chamfered tyre shoulders and a recessed sidewall, not a flat black disc.
 const inner=radius*.8,rim=radius*.52,rings=[[-width/2,inner],[-width*.42,radius],[width*.42,radius],[width/2,inner]];
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<count;k++){const a=k/count*Math.PI*2,b=(k+1)/count*Math.PI*2;m.quad(p(rings[j][0],rings[j][1],a),p(rings[j+1][0],rings[j+1][1],a),p(rings[j+1][0],rings[j+1][1],b),p(rings[j][0],rings[j][1],b),j===1?'#222526':'#303233',.88+(k%2)*.08);}
 for(const out of[-1,1]){const x=out*(width/2+.002);
  if(opts.simple&&out!==side){for(let k=0;k<count;k++)m.tri(p(x,0,0),p(x,inner,k/count*Math.PI*2),p(x,inner,(k+1)/count*Math.PI*2),'#222b2d');continue;}
  for(let k=0;k<count;k++){const a=k/count*Math.PI*2,b=(k+1)/count*Math.PI*2;m.quad(p(x,inner,a),p(x,rim,a),p(x,rim,b),p(x,inner,b),'#202426');m.tri(p(x+.003*out,0,0),p(x,rim,a),p(x,rim,b),'#878e8d',.85);}
  for(let k=0;k<5;k++){const a=k/5*Math.PI*2+spin;m.quad(p(x+.009*out,.06,a-.22),p(x+.009*out,.18,a-.12),p(x+.009*out,.18,a+.12),p(x+.009*out,.06,a+.22),'#c0c2b7');}
  for(let k=0;k<10;k++){const a=k/10*Math.PI*2,b=(k+1)/10*Math.PI*2;m.tri(p(x+.014*out,0,0),p(x+.014*out,.065,a),p(x+.014*out,.065,b),'#adb4ac');}
 }
}

const variantSpecs={compact:{w:.94,l:2.12,h:.97,roof:1.51,wz:1.28,wr:.35},pickup:{w:1.13,l:2.85,h:1.10,roof:1.93,wz:1.83,wr:.46},van:{w:1.15,l:2.78,h:1.12,roof:2.45,wz:1.72,wr:.45},taxi:{w:1.1,l:2.65,h:1.02,roof:1.56,wz:1.6,wr:.415},sedan:{w:1.1,l:2.65,h:1.02,roof:1.56,wz:1.6,wr:.415},coupe:{w:1.1,l:2.65,h:1.02,roof:1.43,wz:1.6,wr:.415},wagon:{w:1.1,l:2.65,h:1.02,roof:1.56,wz:1.6,wr:.415},sport:{w:1.03,l:2.3,h:.87,roof:1.30,wz:1.43,wr:.37},muscle:{w:1.16,l:2.85,h:1.04,roof:1.45,wz:1.78,wr:.43}};
function block(m,x,y,z,w,h,l,col){
 const a=[x-w/2,y,z-l/2],b=[x+w/2,y,z-l/2],c=[x+w/2,y,z+l/2],d=[x-w/2,y,z+l/2],A=add(a,[0,h,0]),B=add(b,[0,h,0]),C=add(c,[0,h,0]),D=add(d,[0,h,0]);
 m.quad(a,b,B,A,col,.8);m.quad(b,c,C,B,col);m.quad(c,d,D,C,col,.95);m.quad(d,a,A,D,col,.82);m.quad(A,B,C,D,col,1.03);m.quad(d,c,b,a,col,.65);
}
function simpleCab(m,{w,bf,br,rf,rr,y,roof,col,van=false}){
 const rw=w*.83,A=[-w,y,bf],B=[w,y,bf],C=[rw,roof,rf],D=[-rw,roof,rf],E=[-w,y,br],F=[w,y,br],G=[rw,roof,rr],H=[-rw,roof,rr];
 m.quad(A,B,C,D,'#3d5962');m.quad(F,E,H,G,van?col:'#344c56');m.quad(A,D,H,E,van?col:'#334a53');m.quad(B,F,G,C,van?col:'#4a6267');m.quad(D,C,G,H,col,1.05);
}
function farWheel(m,side,z,s){
 const x=side*(s.w-.07),r=s.wr,outer=x+side*.11,inner=x-side*.09;
 for(let k=0;k<6;k++){const a=k*Math.PI/3,b=(k+1)*Math.PI/3,pa=[outer,r+.01+Math.sin(a)*r,z+Math.cos(a)*r],pb=[outer,r+.01+Math.sin(b)*r,z+Math.cos(b)*r];m.tri([outer,r+.01,z],pa,pb,'#242b2d');m.quad(pa,pb,[inner,pb[1],pb[2]],[inner,pa[1],pa[2]],'#2d3434');}
}
function taxiSign(d,roof,lod=false){
 block(d,0,roof+.055,-.38,.64,.21,.25,'#d4c29a');
 if(lod)return;
 // Ten strokes form the letters on both faces without a bitmap or a font load.
 const lines=[[-.255,.163,-.153,.163],[-.204,.163,-.204,.063],[-.12,.063,-.075,.163],[-.075,.163,-.03,.063],[-.105,.10,-.045,.10],[.005,.063,.085,.163],[.005,.163,.085,.063],[.12,.163,.22,.163],[.17,.163,.17,.063],[.12,.063,.22,.063]];
 for(const side of[-1,1])for(const[a,b,c,e]of lines){const z=-.38+side*.146,dx=c-a,dy=e-b,len=Math.hypot(dx,dy),nx=-dy/len*.008,ny=dx/len*.008;d.quad([a+nx,roof+.055+b+ny,z],[c+nx,roof+.055+e+ny,z],[c-nx,roof+.055+e-ny,z],[a-nx,roof+.055+b-ny,z],'#343c38');}
}
function drawCarLOD(m,c,{police=false,brake=false}={}){
 const s=variantSpecs[c.kind]||variantSpecs.sedan,kind=c.kind||'sedan',paint=c.paint||(kind==='taxi'?'#c0a34e':'#777b7b'),d=surface(m,c);
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 if(kind==='sport'||kind==='muscle'){
  const rear=-s.l*.96,front=s.l*.96,nose=kind==='sport'?.65:.87,w=s.w*.95;
  d.quad([-w,.31,rear],[w,.31,rear],[w,s.h,rear],[-w,s.h,rear],paint);
  d.quad([-w,.31,front],[w,.31,front],[w*.93,nose,front],[-w*.93,nose,front],paint);
  for(const side of[-1,1])d.quad([side*w,.31,rear],[side*w,.31,front],[side*w*.93,nose,front],[side*w,s.h,rear],paint);
  d.quad([-w,s.h,rear],[w,s.h,rear],[w*.93,nose,front],[-w*.93,nose,front],paint);
 }else block(d,0,.34,0,s.w*1.92,s.h-.34,s.l*1.92,paint);
 if(kind==='sport'){
  simpleCab(d,{w:.78,bf:.45,br:-1.7,rf:-.08,rr:-.72,y:.95,roof:s.roof-.04,col:paint});
  block(d,0,.86,-2.14,1.82,.14,.14,paint);
 }else if(kind==='muscle'){
  simpleCab(d,{w:.88,bf:.65,br:-1.65,rf:-.15,rr:-1.0,y:1.09,roof:s.roof-.04,col:paint});
  block(d,0,1.05,1.35,.64,.17,.65,'#343d3c');
 }else if(kind==='pickup'){
  simpleCab(d,{w:s.w*.89,bf:1.03,br:-.52,rf:.48,rr:-.43,y:s.h,roof:s.roof,col:paint});
  // An open dark well and raised rails retain the pickup silhouette at distance.
  d.quad([-.83,1.111,-.64],[.83,1.111,-.64],[.83,1.111,-2.64],[-.83,1.111,-2.64],'#3f4947');
  block(d,-1.02,1.1,-1.64,.16,.22,2.04,paint);block(d,1.02,1.1,-1.64,.16,.22,2.04,paint);
 }else if(kind==='van'){
  simpleCab(d,{w:s.w*.95,bf:1.65,br:-2.57,rf:1.04,rr:-2.36,y:s.h,roof:s.roof-.12,col:paint,van:true});
 }else simpleCab(d,{w:s.w*.81,bf:kind==='compact'?.62:.77,br:kind==='wagon'?-2.1:kind==='compact'?-1.87:-1.39,rf:kind==='coupe'?-.12:.02,rr:kind==='wagon'?-1.7:kind==='compact'?-1.26:-.86,y:s.h+.06,roof:s.roof-.04,col:paint});
 for(const side of[-1,1])for(const z of[-s.wz,s.wz])farWheel(m,side,z,s);
 for(const side of[-1,1]){const x=side*s.w*.67,z=-s.l*.97;d.quad([x-.17,.65,z],[x+.17,.65,z],[x+.17,.8,z],[x-.17,.8,z],panel(c,'rear')>.5?'#303c3e':brake?'#ed5037':'#963d31');}
 if(kind==='taxi')taxiSign(d,s.roof,true);
 if(police)block(d,0,s.roof+.03,-.35,.95,.17,.23,'#a1554c');
 m.transform=null;m.kind=0;
}

function shapedCab(d,{w,bf,br,rf,rr,y,roof,col,door=null}){
 const rw=w*.84,A=[-w,y,bf],B=[w,y,bf],C=[rw,roof-.07,rf],D=[-rw,roof-.07,rf],E=[-w,y,br],F=[w,y,br],G=[rw,roof-.07,rr],H=[-rw,roof-.07,rr];
 const pane=(a,b,c,e)=>{const l=mix(a,e,.58),r=mix(b,c,.58);d.quad(a,b,r,l,'#2b444e');d.quad(l,r,c,e,'#5b7278',.91);};
 pane(A,B,C,D);pane(F,E,H,G);
 for(const side of[-1,1]){
  const a=side<0?A:B,b=side<0?E:F,c=side<0?H:G,e=side<0?D:C;
  if(!door||door.side!==side)pane(a,b,c,e);
  else if(bf-br>2)pane(mix(a,b,.5),b,c,mix(e,c,.5));
  for(const[v,q]of[[a,e],[b,c]])tube(d,v,q,.035,.035,col,5);
  tube(d,a,b,.023,.023,'#a3ada5',5);
 }
 const xs=[-1,-.84,0,.84,1],ys=[-.07,0,.022,0,-.07];
 for(let k=0;k<4;k++){
  d.quad([xs[k]*rw,roof+ys[k],rr],[xs[k+1]*rw,roof+ys[k+1],rr],[xs[k+1]*rw,roof+ys[k+1],rf],[xs[k]*rw,roof+ys[k],rf],col,1.03);
  for(const z of[rr,rf])d.quad([xs[k]*rw,roof-.07,z],[xs[k+1]*rw,roof-.07,z],[xs[k+1]*rw,roof+ys[k+1],z],[xs[k]*rw,roof+ys[k],z],col);
 }
 return{A,B,C,D,E,F,G,H};
}
function drawPerformanceCar(m,c,{police=false,brake=false,time=0,door=null}={}){
 const sport=c.kind==='sport',s=variantSpecs[c.kind],paint=c.paint||(sport?'#a6adb0':'#596b57'),d=surface(m,c),front=panel(c,'front'),rear=panel(c,'rear');
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 for(let k=0;k<16;k++){const a=k/8*Math.PI,b=(k+1)/8*Math.PI;m.tri([0,.04,0],[Math.cos(a)*s.w*1.08,.04,Math.sin(a)*s.l],[Math.cos(b)*s.w*1.08,.04,Math.sin(b)*s.l],'#353e3d');}
 // Sport is a low wedge; muscle has pinched door skins between broad rear haunches.
 const stations=sport?[[-2.22,.84,.83],[-1.95,.98,.90],[-1.43,1.00,.94],[-.65,.93,.91],[.45,.94,.89],[1.43,.99,.88],[1.95,.94,.77],[2.22,.84,.65]]:[[-2.77,.98,.90],[-2.45,1.10,.99],[-1.78,1.13,1.08],[-.9,1.075,1.05],[.65,1.075,1.03],[1.78,1.12,1.04],[2.4,1.055,.98],[2.77,.96,.85]];
 const at=z=>{let i=0;while(i<stations.length-2&&z>stations[i+1][0])i++;const a=stations[i],b=stations[i+1],t=clamp((z-a[0])/(b[0]-a[0]),0,1);return[a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];};
 const deck=(x,z,offset=0)=>{const[w,h]=at(z),n=clamp(Math.abs(x)/w,0,1),lift=n<.9?.045-n/.9*.017:(1-n)/.1*.028;return[x,h+lift+offset,z];};
 const nose=stations.at(-1)[0],tail=stations[0][0],hinge=sport?.45:.65,doorBack=hinge-(sport?1.30:1.51),archR=s.wr+.09;
 const stops=[...stations.map(v=>v[0]),hinge,doorBack];for(const z of[-s.wz,s.wz])for(const f of[-1,-.82,-.5,0,.5,.82,1])stops.push(z+f*archR);const zs=[...new Set(stops)].sort((a,b)=>a-b);
 const lower=z=>{let y=.30;for(const wz of[-s.wz,s.wz])if(Math.abs(z-wz)<archR)y=Math.max(y,s.wr+.01+Math.sqrt(Math.max(0,archR*archR-(z-wz)**2)));return y;};
 for(let i=0;i<zs.length-1;i++){
  const z=zs[i],Z=zs[i+1],[w,h]=at(z),[W,H]=at(Z),xs=[-1,-.9,0,.9,1];
  for(let k=0;k<4;k++)d.quad(deck(xs[k]*w,z),deck(xs[k+1]*w,z),deck(xs[k+1]*W,Z),deck(xs[k]*W,Z),paint,1.03);
  for(const side of[-1,1]){
   if(!(door&&door.side===side&&z>=doorBack-1e-5&&Z<=hinge+1e-5))d.quad([side*w,lower(z),z],[side*W,lower(Z),Z],[side*W,H,Z],[side*w,h,z],paint,side<0?.84:.96);
   if(lower(z)>.31||lower(Z)>.31)d.quad([side*w,lower(z),z],[side*(w-.12),lower(z)-.025,z],[side*(W-.12),lower(Z)-.025,Z],[side*W,lower(Z),Z],'#283331');
  }
 }
 for(const z of[tail,nose]){const[w,h]=at(z),xs=[-1,-.9,0,.9,1];d.quad([-w,.30,z],[w,.30,z],[w,h,z],[-w,h,z],paint,.88);for(let k=0;k<4;k++)d.quad([xs[k]*w,h,z],[xs[k+1]*w,h,z],deck(xs[k+1]*w,z),deck(xs[k]*w,z),paint);}
 d.quad([-.8,.28,tail],[.8,.28,tail],[.8,.28,nose],[-.8,.28,nose],'#2b3636');
 const cab=shapedCab(d,{w:sport?.78:.88,bf:hinge,br:sport?-1.72:-1.70,rf:sport?-.08:-.15,rr:sport?-.72:-1.0,y:sport?.985:1.145,roof:s.roof,col:paint,door});
 // Close the window sills onto the crowned deck, including each sloping end.
 const cabW=Math.abs(cab.A[0]),cabY=cab.A[1],cabRear=cab.E[2];
 for(const z of[hinge,cabRear])for(let k=0;k<4;k++){const a=-cabW+k*cabW/2,b=a+cabW/2;d.quad([a,cabY,z],[b,cabY,z],deck(b,z),deck(a,z),paint);}
 const sillZ=[cabRear,...stations.map(v=>v[0]).filter(z=>z>cabRear&&z<hinge),hinge];
 for(const side of[-1,1])for(let k=0;k<sillZ.length-1;k++){const a=sillZ[k],b=sillZ[k+1],x=side*cabW;d.quad([x,cabY,a],[x,cabY,b],deck(x,b),deck(x,a),paint);}
 for(const side of[-1,1]){
  const waist=sport?.88:1.02;
  // Belt trim follows the changing shoulder instead of floating beyond the haunches.
  for(let i=0;i<stations.length-1;i++){const a=stations[i],b=stations[i+1];d.quad([side*(a[1]+.018),a[2]-.045,a[0]],[side*(b[1]+.018),b[2]-.045,b[0]],[side*(b[1]+.018),b[2]-.018,b[0]],[side*(a[1]+.018),a[2]-.018,a[0]],sport?'#414d4c':'#b7bfb1');}
  for(const z of[doorBack,hinge]){const[w,h]=at(z);ribbon(d,[side*(w+.022),.37,z],[side*(w+.022),h-.04,z],.016,'#3a4645');}
  const hx=side*(at(doorBack+.18)[0]+.025);block(d,hx,waist-.055,doorBack+.18,.035,.035,.17,'#aeb8ae');
  if(panel(c,side<0?'left':'right')<.72){
   const mx=side*(s.w+.035),my=sport?1.00:1.13,mz=hinge-.10;tube(d,[side*(s.w-.12),my-.055,mz],[mx,my,mz],.021,.022,'#4e5d59',5);
   ellipsoid(d,[mx,my,mz],[.105,.053,.082],paint,6,3);d.quad([mx-.065,my-.032,mz-.077],[mx+.065,my-.032,mz-.077],[mx+.065,my+.032,mz-.077],[mx-.065,my+.032,mz-.077],'#82979a');
  }
  const damage=panel(c,side<0?'left':'right');if(damage>.15)for(let j=0;j<5;j++){const z=-.8+j*.21,x=side*(at(z)[0]+.025);ribbon(d,[x,.48+(j%3)*.11,z],[x,.52+(j%3)*.11,z+.34],.018,j%2?'#afb09b':'#44514e');}
  for(const z of[-s.wz,s.wz])wheel(m,c,side,z,time,{x:s.w-.14,radius:s.wr,width:sport?.26:.29,count:10,simple:true});
 }
 if(sport){
  // Flush, closed pop-up lamp lids on the wedge nose; no copied marque styling.
  for(const side of[-1,1]){
   const x=side*.59,z1=1.40,z2=1.87;d.quad(deck(x-.20,z1,.014),deck(x+.20,z1,.014),deck(x+.20,z2,.014),deck(x-.20,z2,.014),'#344340');
   d.quad(deck(x-.181,z1+.024,.030),deck(x+.181,z1+.024,.030),deck(x+.181,z2-.024,.030),deck(x-.181,z2-.024,.030),front>(side<0?.30:.58)?'#68716b':paint);
   block(d,side*.63,.43,nose+.035,.34,.075,.04,front>.55?'#293b3c':'#baa574');
  }
  block(d,0,.32,nose+.023,1.33,.12,.05,'#263535');
  // A raised ducktail is part of the rear silhouette, with a sealed underside.
  const z1=-1.99,z2=-2.19,y1=.935,y2=1.055,w1=.94,w2=.88;
  d.quad([-w1,y1,z1],[w1,y1,z1],[w2,y2,z2],[-w2,y2,z2],paint,1.05);d.quad([-w2,.85,z2],[w2,.85,z2],[w2,y2,z2],[-w2,y2,z2],paint,.9);
  for(const side of[-1,1])d.tri([side*w1,y1,z1],[side*w2,.85,z2],[side*w2,y2,z2],paint,.9);
  d.quad([-w1,y1,z1],[-w2,.85,z2],[w2,.85,z2],[w1,y1,z1],paint,.8);
  block(d,0,.57,tail-.035,1.68,.19,.045,'#283735');
  for(const side of[-1,1])for(let k=0;k<2;k++)block(d,side*(.39+k*.23),.59,tail-.068,.19,.12,.03,rear>(side<0?.3:.6)?'#293638':brake?'#ee5a38':'#9f4132');
 }else{
  // Long dark bonnet treatment follows the curved deck without coplanar layers.
  const stripeZ=[.78,1.15,1.78,2.4,2.65];for(let j=0;j<stripeZ.length-1;j++)d.quad(deck(-.34,stripeZ[j],.018),deck(.34,stripeZ[j],.018),deck(.34,stripeZ[j+1],.018),deck(-.34,stripeZ[j+1],.018),'#303b3a');
  const sr=1.05,sf=1.78,base=1.12,top=1.29;
  d.quad([-.28,base,sr],[.28,base,sr],[.25,top,sf],[ -.25,top,sf],'#3c4843');
  d.quad([-.25,base,sf],[.25,base,sf],[.25,top,sf],[-.25,top,sf],'#202e30');
  for(const side of[-1,1])d.tri([side*.28,base,sr],[side*.25,base,sf],[side*.25,top,sf],'#4a554c');
  block(d,0,.63,nose+.035,1.72,.22,.04,'#243335');
  for(const side of[-1,1])for(const x of[.62,.88]){
   const broken=front>(side<0?.30:.57),cx=side*x;for(let k=0;k<10;k++){const a=k/5*Math.PI,b=(k+1)/5*Math.PI;d.tri([cx,.74,nose+.07],[cx+Math.cos(a)*.108,.74+Math.sin(a)*.108,nose+.07],[cx+Math.cos(b)*.108,.74+Math.sin(b)*.108,nose+.07],broken?'#293a3c':'#ddd9b7');}
  }
  for(let k=-3;k<=3;k++)block(d,k*.115,.66,nose+.064,.018,.15,.025,'#a9b5a8');
  block(d,0,.63,tail-.035,1.82,.23,.045,'#2b3939');
  for(const side of[-1,1])for(let k=0;k<3;k++)block(d,side*(.55+k*.15),.66,tail-.065,.09,.16,.03,rear>(side<0?.35:.6)?'#273638':brake?'#ed5938':'#9a3d2d');
 }
 for(const end of[-1,1])block(d,0,.38,end*(s.l-.045),s.w*1.88,.115,.085,sport?'#3c4b49':'#b8c0b1');
 block(d,0,.48,tail-.10,.41,.13,.025,'#c9c7ac');
 for(let k=0;k<5;k++)ribbon(d,[-.125+k*.055,.505,tail-.125],[-.125+k*.055,.565,tail-.125],.012,'#354645');
 for(const side of[-1,1])tube(d,[side*.63,.24,tail+.2],[side*.63,.24,tail-.08],sport?.045:.07,sport?.045:.07,'#68756a',7);
 if(front>.3||rear>.45){
  const rearGlass=rear>front,a=rearGlass?cab.E:cab.A,b=rearGlass?cab.F:cab.B,e=rearGlass?cab.H:cab.D,q=rearGlass?cab.G:cab.C,centre=mix(mix(a,b,.65),mix(e,q,.65),.45),offset=rearGlass?-.023:.023;centre[2]+=offset;
  for(const edge of[mix(a,e,.22),mix(b,q,.68),mix(e,q,.38),mix(a,b,.81)]){edge[2]+=offset;ribbon(d,centre,edge,.01,'#a8b8ae');}
 }
 if(front>.6)tube(d,[-s.w*.7,.42,nose+.1],[s.w*.4,.22+Math.sin(time*9)*Math.min(.11,Math.abs(c.speed||0)*.008),nose+.13],.035,.045,'#99a99a',5);
 if(door){
  const side=door.side,open=clamp(door.time*3,0,1)*1.05,w=at(hinge)[0],belt=sport?.95:1.10,roof=s.roof-.1,pt=(z,y)=>[side*(w+Math.sin(open)*(hinge-z)),y,hinge-Math.cos(open)*(hinge-z)];
  m.quad([side*(w-.04),.33,doorBack],[side*(w-.04),.33,hinge],[side*(w-.04),belt,hinge],[side*(w-.04),belt,doorBack],'#263736');
  d.quad(pt(doorBack,.34),pt(hinge,.34),pt(hinge,belt),pt(doorBack,belt),paint);d.quad(pt(doorBack+.08,belt+.025),pt(hinge-.09,belt+.025),pt(hinge-.37,roof),pt(doorBack+.16,roof),'#4d6970');tube(d,pt(doorBack+.14,roof),pt(hinge-.36,roof),.025,.025,'#a4b3a7',5);
 }
 if(police){block(d,0,s.roof+.04,-.4,.89,.09,.24,'#2e3e3d');for(const side of[-1,1])block(d,side*.28,s.roof+.13,-.4,.24,.12,.21,c.sirens!==false&&Math.sin(time*12)*side>0?(side<0?'#e65b45':'#72a7d0'):'#465958');}
 m.transform=null;m.kind=0;
}

function drawNewVehicle(m,c,{brake=false,time=0,door=null}={}){
 const kind=c.kind,s=variantSpecs[kind],paint=c.paint||'#777c73',d=surface(m,c),f=panel(c,'front'),r=panel(c,'rear'),w=s.w-.035,l=s.l-.08;
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 for(let k=0;k<14;k++){const a=k/14*Math.PI*2,b=(k+1)/14*Math.PI*2;m.tri([0,.04,0],[Math.cos(a)*s.w*1.12,.04,Math.sin(a)*s.l*1.02],[Math.cos(b)*s.w*1.12,.04,Math.sin(b)*s.l*1.02],'#353e3d');}
 // Chamfered shell with genuinely open wheel arches, not wheels pasted on a box.
 const arch=z=>{let y=.34;for(const q of[-s.wz,s.wz])if(Math.abs(z-q)<s.wr+.10)y=Math.max(y,s.wr+.01+Math.sqrt(Math.max(0,(s.wr+.10)**2-(z-q)**2)));return y;};
 const hinge=kind==='pickup'?1.02:kind==='van'?1.44:.59,doorLength=kind==='compact'?1.23:1.42;
 const stops=[-l,l,-l+.2,l-.2,-.65,.65,hinge-doorLength,hinge];
 for(const q of[-s.wz,s.wz])for(const offset of[-1,-.8,-.45,0,.45,.8,1])stops.push(clamp(q+offset*(s.wr+.10),-l,l));
 const zs=[...new Set(stops)].sort((a,b)=>a-b),width=z=>w-.12*clamp((Math.abs(z)-(l-.28))/.28,0,1),height=z=>s.h-.11*clamp((Math.abs(z)-(l-.38))/.38,0,1);
 const deck=z=>[[-width(z),height(z),z],[-width(z)*.88,height(z)+.035,z],[0,height(z)+.055,z],[width(z)*.88,height(z)+.035,z],[width(z),height(z),z]];
 for(let j=0;j<zs.length-1;j++){
  const z=zs[j],zz=zs[j+1],a=deck(z),b=deck(zz);
  if(kind!=='pickup'||z>=-.65)for(let k=0;k<4;k++)d.quad(a[k],a[k+1],b[k+1],b[k],paint,1.02);
  for(const side of[-1,1]){
   const open=door&&door.side===side&&z>=hinge-doorLength-1e-5&&zz<=hinge+1e-5;
   if(!open)d.quad([side*width(z),arch(z),z],[side*width(zz),arch(zz),zz],[side*width(zz),height(zz),zz],[side*width(z),height(z),z],paint,side<0?.83:.96);
   if(arch(z)>.35||arch(zz)>.35)d.quad([side*width(z),arch(z),z],[side*(width(z)-.13),arch(z)-.03,z],[side*(width(zz)-.13),arch(zz)-.03,zz],[side*width(zz),arch(zz),zz],'#293331');
  }
 }
 for(const z of[-l,l]){const pts=deck(z);d.quad([-width(z),.34,z],[width(z),.34,z],[width(z),height(z),z],[-width(z),height(z),z],paint,.85);for(let k=0;k<4;k++)d.quad([pts[k][0],height(z),z],[pts[k+1][0],height(z),z],pts[k+1],pts[k],paint);}
 d.quad([-w+.14,.30,-l],[w-.14,.30,-l],[w-.14,.30,l],[-w+.14,.30,l],'#303a38');
 if(kind==='compact'){
  shapedCab(d,{w:.76,bf:.61,br:-1.88,rf:.08,rr:-1.26,y:1.045,roof:s.roof,col:paint,door});
  // Hatch seal and the broad sloping rear glass distinguish it from a small sedan.
  ribbon(d,[-.63,.93,-2.047],[.63,.93,-2.047],.018,'#303c3c');
  for(const side of[-1,1])ribbon(d,[side*.805,.47,-.68],[side*.805,1.02,-.68],.013,'#3c4949');
 }else if(kind==='pickup'){
  shapedCab(d,{w:.94,bf:1.05,br:-.56,rf:.48,rr:-.44,y:1.18,roof:s.roof,col:paint,door});
  // A recessed floor, inside walls and wheel humps leave the cargo bed fully open.
  const rear=-l+.07,front=-.65,inner=w-.19;
  d.quad([-inner,.69,rear],[inner,.69,rear],[inner,.69,front],[-inner,.69,front],'#4c5651');
  for(const side of[-1,1]){
   d.quad([side*inner,.69,rear],[side*inner,.69,front],[side*inner,1.25,front],[side*inner,1.25,rear],paint,.65);
   d.quad([side*w,1.08,rear],[side*w,1.08,front],[side*w,1.25,front],[side*w,1.25,rear],paint,.9);
   d.quad([side*inner,1.25,rear],[side*inner,1.25,front],[side*w,1.25,front],[side*w,1.25,rear],paint,1.1);
   block(d,side*(inner-.12),.69,-s.wz,.26,.27,.85,paint);
  }
  for(const z of[rear,front])block(d,0,.69,z,inner*2,.56,.10,paint);
  for(let i=-3;i<=3;i++)ribbon(d,[i*.22,.702,rear+.15],[i*.22,.702,front-.1],.008,'#687169');
  ribbon(d,[-.7,.99,rear-.065],[.7,.99,rear-.065],.018,'#859087');
  block(d,0,1.04,rear-.08,.23,.06,.025,'#bbc1b4');
 }else{
  // Tall delivery body: bevelled shoulders and roof, short sloping bonnet, separate cab windows.
  const roofW=w-.14,ry=s.roof-.12,back=-l+.06,roofBack=back+.15,roofFront=1.02,front=1.65;
  for(const side of[-1,1]){
   d.quad([side*w,s.h,back],[side*w,s.h,.4],[side*w,ry,.4],[side*w,ry,back],paint,.91);
   if(!door||door.side!==side)d.quad([side*w,s.h,.4],[side*w,s.h,front],[side*roofW,ry,roofFront],[side*w,ry,.4],paint);
   else d.quad([side*(w-.07),s.h,.4],[side*(w-.07),s.h,front],[side*(roofW-.07),ry,roofFront],[side*(w-.07),ry,.4],'#253736');
   d.quad([side*w,ry,back],[side*w,ry,.4],[side*roofW,s.roof,.4],[side*roofW,s.roof,roofBack],paint,1.02);
   d.quad([side*w,ry,.4],[side*roofW,ry,roofFront],[side*roofW,s.roof,roofFront],[side*roofW,s.roof,.4],paint,1.03);
   // Glass lies on a separate inset patch, clear of the body surface.
   const sx=side*(w+.025);if(!door||door.side!==side)d.quad([sx,1.28,.46],[sx,1.28,1.45],[side*(roofW+.025),2.19,1.00],[sx,2.19,.46],'#3e5962');
   ribbon(d,[sx,1.17,.38],[sx,2.27,.38],.018,'#45534f');
   block(d,side*(w+.035),1.12,.63,.035,.055,.19,'#bec5b7');
   // Delivery livery is paint on the cargo panel, with restrained horizontal strips.
   d.quad([sx,1.62,-2.1],[sx,1.62,-.2],[sx,1.91,-.2],[sx,1.91,-2.1],'#c7c7ad');
   d.quad([side*(w+.048),1.73,-1.91],[side*(w+.048),1.73,-.45],[side*(w+.048),1.80,-.45],[side*(w+.048),1.80,-1.91],'#5b6c65');
  }
  d.quad([-roofW,s.roof,roofBack],[roofW,s.roof,roofBack],[roofW,s.roof,roofFront],[-roofW,s.roof,roofFront],paint,1.08);
  d.quad([-w,1.20,front],[w,1.20,front],[roofW,ry,roofFront],[-roofW,ry,roofFront],'#3c5863');
  d.quad([-w,s.h,front],[w,s.h,front],[w,1.20,front],[-w,1.20,front],paint);
  d.quad([-roofW,ry,roofFront],[roofW,ry,roofFront],[roofW,s.roof,roofFront],[-roofW,s.roof,roofFront],paint);
  d.quad([-w,s.h,back],[w,s.h,back],[w,ry,back],[-w,ry,back],paint,.84);
  d.quad([-width(back),height(back),back],[width(back),height(back),back],[w,s.h,back],[-w,s.h,back],paint,.85);
  for(const side of[-1,1])d.quad([side*width(back),height(back),back],[side*width(.4),height(.4),.4],[side*w,s.h,.4],[side*w,s.h,back],paint,.9);
  d.quad([-w,ry,back],[w,ry,back],[roofW,s.roof,roofBack],[-roofW,s.roof,roofBack],paint,.95);
  const rz=back-.025;ribbon(d,[0,.68,rz],[0,2.26,rz],.017,'#3b4948');
  for(const side of[-1,1]){block(d,side*.88,.89,rz,.11,.22,.035,'#aab6aa');block(d,side*.14,1.16,rz-.012,.05,.20,.04,'#b8c1b3');}
 }
 // Chrome bumpers, lamps and a framed grille use separated layers, avoiding z-fighting.
 for(const end of[-1,1])block(d,0,.43,end*(l+.035),w*1.94,.14,.10,'#b7bfb3');
 block(d,0,.64,l+.043,w*.83,.22,.03,'#273638');
 for(let i=-3;i<=3;i++)block(d,i*w*.1,.66,l+.067,.018,.18,.022,'#adb8ad');
 for(const side of[-1,1]){
  const x=side*w*.73,frontBroken=f>(side<0?.3:.55),rearBroken=r>(side<0?.48:.28);
  block(d,x,.64,l+.055,w*.37,.24,.035,'#b9c2b3');block(d,x,.665,l+.081,w*.31,.18,.025,frontBroken?'#2a383a':'#e5dcc0');
  block(d,x,.65,-l-.055,w*.32,.23,.035,rearBroken?'#293537':brake?'#ed583b':'#913f30');
  for(const z of[-s.wz,s.wz])wheel(m,c,side,z,time,{x:s.w-.14,radius:s.wr,width:.23,count:8,simple:true});
  const damage=panel(c,side<0?'left':'right');if(damage>.15)for(let j=0;j<4;j++)ribbon(d,[side*(w+.025),.55+j*.11,-.5],[side*(w+.025),.58+j*.11,.35],.018,j%2?'#acae9b':'#3d4946');
 }
 block(d,0,.58,-l-.09,.43,.15,.025,'#cdcbb0');
 if(f>.4){ribbon(d,[-.55,s.h+.075,1.35],[.55,s.h+.075,1.72],.025,'#4c5750');}
 if(door){const side=door.side,open=clamp(door.time*3,0,1)*1.05,hinge=kind==='pickup'?1.02:kind==='van'?1.44:.59,len=kind==='compact'?1.23:1.42,base=kind==='van'?1.18:kind==='pickup'?1.16:1.04,top=s.roof-.15,pt=(z,y)=>[side*(w+Math.sin(open)*(hinge-z)),y,hinge-Math.cos(open)*(hinge-z)];m.quad(pt(hinge-len,.42),pt(hinge,.42),pt(hinge,base),pt(hinge-len,base),paint);m.quad(pt(hinge-len+.07,base+.03),pt(hinge-.1,base+.03),pt(hinge-.25,top),pt(hinge-len+.12,top),'#4d6970');}
 m.transform=null;m.kind=0;
}

function drawCarBody(m,c,{police=false,brake=false,time=0,door=null,lod=false}={}){
 if(lod){drawCarLOD(m,c,{police,brake});return;}
 if(c.kind==='sport'||c.kind==='muscle'){drawPerformanceCar(m,c,{police,brake,time,door});return;}
 if(['compact','pickup','van'].includes(c.kind)){drawNewVehicle(m,c,{brake,time,door});return;}
 const kind=c.kind||'sedan',paint=c.paint||(kind==='taxi'?'#c7a549':'#777b7b'),coupe=kind==='coupe',wagon=kind==='wagon';
 const f=panel(c,'front'),r=panel(c,'rear'),left=panel(c,'left'),right=panel(c,'right');
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 // Rounded footprint follows the car instead of leaving a rectangular dark tile.
 for(let k=0;k<18;k++){const a=k/18*Math.PI*2,b=(k+1)/18*Math.PI*2;m.tri([.1,.045,.12],[.1+Math.cos(a)*1.23,.045,.12+Math.sin(a)*2.83],[.1+Math.cos(b)*1.23,.045,.12+Math.sin(b)*2.83],'#353e3d');}
 const d=surface(m,c);
 const stations=[[-2.53,.91,.85],[-2.27,1.04,.96],[-1.65,1.065,1.00],[-.7,1.07,1.015],[.68,1.055,1.01],[1.6,1.055,1.00],[2.2,1.015,.96],[2.53,.91,.84]];
 const profile=z=>{let i=0;while(i<stations.length-2&&z>stations[i+1][0])i++;const a=stations[i],b=stations[i+1],t=clamp((z-a[0])/(b[0]-a[0]),0,1);return[a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];};
 // The body follows cross-sections with rounded shoulders and a crowned bonnet.
 const top=(st,k)=>{const x=[-1,-.91,0,.91,1][k]*st[1],y=st[2]+[0,.045,.065,.045,0][k];return[x,y,st[0]];};
 for(let j=0;j<stations.length-1;j++)for(let k=0;k<4;k++)d.quad(top(stations[j],k),top(stations[j],k+1),top(stations[j+1],k+1),top(stations[j+1],k),paint,k===0?.82:k===3?.95:1.05);
 // Close the crown against the flat fascia at both ends of the shell.
 for(const st of[stations[0],stations[stations.length-1]])for(let k=0;k<4;k++){const a=top(st,k),b=top(st,k+1);d.quad([a[0],st[2],st[0]],[b[0],st[2],st[0]],b,a,paint,.9);}
 d.quad([-.79,.29,-2.53],[.79,.29,-2.53],[.79,.29,2.53],[-.79,.29,2.53],'#323b3b');
 // Side skin terminates at each wheel arch; the tyre remains visible through it.
 const zs=[-2.53,-2.27,-2.16,-2.07,-1.94,-1.79,-1.65,-1.5,-1.34,-1.2,-1.1,-.96,-.7,0,.65,.96,1.1,1.2,1.34,1.5,1.65,1.79,1.94,2.07,2.16,2.27,2.53];
 const arch=z=>{let y=.36;for(const wz of[-1.6,1.6]){const dz=z-wz;if(Math.abs(dz)<.54)y=Math.max(y,.425+Math.sqrt(Math.max(0,.54*.54-dz*dz)));}return y;};
 for(const side of[-1,1])for(let j=0;j<zs.length-1;j++){
  if(door&&side===door.side&&zs[j]>=-.7&&zs[j+1]<=.65)continue;
  const z0=zs[j],z1=zs[j+1],[w0,h0]=profile(z0),[w1,h1]=profile(z1),b0=arch(z0),b1=arch(z1);
  d.quad([side*w0,b0,z0],[side*w1,b1,z1],[side*w1,h1,z1],[side*w0,h0,z0],paint,side<0?.78:.94);
  // A recessed black wheel-well return gives the openings visible thickness.
  if(b0>.4||b1>.4)d.quad([side*w0,b0,z0],[side*(w0-.14),b0-.035,z0],[side*(w1-.14),b1-.035,z1],[side*w1,b1,z1],'#252b2b',.75);
  if(b0<.4&&b1<.4)d.quad([side*w0,b0,z0],[side*(w0-.12),.29,z0],[side*(w1-.12),.29,z1],[side*w1,b1,z1],'#3e4647',.75);
 }
 for(const side of[-1,1]){
  // Fine chrome waist rail, lower sill, recessed handles and front/rear door seams.
  for(let j=1;j<stations.length-2;j++){const a=stations[j],b=stations[j+1];d.quad([side*(a[1]+.006),a[2]-.06,a[0]],[side*(b[1]+.006),b[2]-.06,b[0]],[side*(b[1]+.008),b[2]-.035,b[0]],[side*(a[1]+.008),a[2]-.035,a[0]],'#c4c6bc',.9);}
  d.quad([side*1.075,.39,-.99],[side*1.075,.39,.95],[side*1.079,.43,.95],[side*1.079,.43,-.99],'#a2aaa4',.8);
  for(const z of(coupe?[-.75,.73]:[-1.15,-.33,.73])){const [w,h]=profile(z);ribbon(d,[side*(w+.008),.43,z],[side*(w+.008),h-.07,z],.013,'#3f4848');}
  for(const z of(coupe?[-.53]:[-.99,-.08])){const [w]=profile(z);d.quad([side*(w+.013),.9,z],[side*(w+.013),.9,z+.19],[side*(w+.02),.934,z+.19],[side*(w+.02),.934,z],'#bcc2b8');}
 }
 if(door){
  const side=door.side,open=Math.min(1,door.time*3)*1.05,p=(z,y)=>[side*(1.065+Math.sin(open)*(.73-z)),y,.73-Math.cos(open)*(.73-z)];
  m.quad([side*1.06,.4,-.7],[side*1.06,.4,.73],[side*1.06,1.02,.73],[side*1.06,1.02,-.7],'#222c2c');
  m.quad(p(-.7,.42),p(.73,.42),p(.73,1.01),p(-.7,1.01),paint);
  m.quad(p(-.65,1.03),p(.62,1.03),p(.39,1.43),p(-.57,1.43),'#556767');
  m.tube(p(-.68,1.46),p(.38,1.46),.028,'#acb6b1');m.tube(p(-.68,1.01),p(-.68,1.46),.026,'#b3b9ad');
 }
 // Nose and tail are shaped vertical panels; bumper rails have bevelled ends.
 for(const end of[-1,1]){const z=end*2.53,h=profile(z)[1];d.quad([-.91,.39,z],[.91,.39,z],[.91,h,z],[-.91,h,z],paint,end<0?.78:.91);
  d.quad([-1.015,.43,end*2.6],[1.015,.43,end*2.6],[1.06,.54,end*2.56],[-1.06,.54,end*2.56],'#c3c6b9',.9);
  d.quad([-1.06,.54,end*2.56],[1.06,.54,end*2.56],[.98,.59,end*2.53],[-.98,.59,end*2.53],'#e0dfcd');
  d.quad([-.97,.443,end*2.607],[.97,.443,end*2.607],[.97,.477,end*2.607],[-.97,.477,end*2.607],'#303837');
 }
 // Sealed-beam lamps, grille bars and indicators, broken independently by impact.
 d.quad([-.48,.64,2.56],[.48,.64,2.56],[.48,.83,2.56],[-.48,.83,2.56],'#202d31');
 for(let i=-4;i<=4;i++)d.quad([i*.1-.009,.65,2.585],[i*.1+.009,.65,2.585],[i*.1+.009,.82,2.585],[i*.1-.009,.82,2.585],'#9eaaa8');
 for(const side of[-1,1]){
  const brokenFront=f>(side<0?.28:.53),brokenRear=r>(side<0?.48:.25);
  const x=side*.72;d.quad([x-.195,.635,2.56],[x+.195,.635,2.56],[x+.195,.835,2.56],[x-.195,.835,2.56],'#b4bcb4');
  d.quad([x-.164,.661,2.585],[x+.164,.661,2.585],[x+.164,.809,2.585],[x-.164,.809,2.585],brokenFront?'#263337':'#e8dfbb');
  if(!brokenFront)for(let i=-2;i<=2;i++)ribbon(d,[x+i*.057,.667,2.605],[x+i*.057,.804,2.605],.006,'#a7b3af');
  else d.tri([x-.15,.67,2.61],[x-.08,.79,2.61],[x+.06,.67,2.61],'#8d9e9d');
  const zz=-2.56;d.quad([x-.24,.64,zz],[x+.24,.64,zz],[x+.24,.82,zz],[x-.24,.82,zz],'#bec1b5');
  d.quad([x-.215,.665,zz-.02],[x+.215,.665,zz-.02],[x+.215,.796,zz-.02],[x-.215,.796,zz-.02],brokenRear?'#222e32':brake?'#ec4b2e':'#8e3027');
  if(!brokenRear){d.quad([x-.045,.669,zz-.04],[x+.045,.669,zz-.04],[x+.045,.792,zz-.04],[x-.045,.792,zz-.04],'#cec4ac');for(let i=-3;i<=3;i++)ribbon(d,[x+i*.057,.668,zz-.06],[x+i*.057,.793,zz-.06],.006,'#76352a');}
  else d.tri([x-.2,.67,zz-.04],[x+.1,.67,zz-.04],[x-.12,.75,zz-.04],'#9a5245');
  d.quad([side*1.025,.68,2.15],[side*1.025,.68,2.34],[side*1.025,.735,2.34],[side*1.025,.735,2.15],brokenFront?'#3d413d':'#b47b36');
 }
 // Rear licence plate and narrow trunk seam provide a legible chase-view scale.
 d.quad([-.21,.55,-2.615],[.21,.55,-2.615],[.21,.69,-2.615],[-.21,.69,-2.615],'#d3d0af');
 for(let i=0;i<5;i++)ribbon(d,[-.13+i*.058,.585,-2.635],[-.13+i*.058,.648,-2.635],.013,'#3b494c');
 ribbon(d,[-.84,.91,-2.29],[.84,.91,-2.29],.012,'#475454');
 d.quad([-.08,.84,-2.545],[.08,.84,-2.545],[.08,.867,-2.545],[-.08,.867,-2.545],'#d8d8c6');
 // Cabin: raked glass, tapered pillars, a curved roof and distinct body styles.
 const roofY=coupe?1.43:1.56,rf=coupe?-.12:.02,rr=wagon?-1.7:coupe?-.94:-.86,bf=.77,br=wagon?-2.13:coupe?-1.48:-1.39,roofW=coupe?.72:.76;
 const A=[-.88,1.085,bf],B=[.88,1.085,bf],C=[roofW,roofY-.075,rf],D=[-roofW,roofY-.075,rf];
 const E=[-.88,1.085,br],F=[.88,1.085,br],G=[roofW,roofY-.075,rr],H=[-roofW,roofY-.075,rr];
 // Separate faces for each reflection band: no coplanar overlay or z-fighting.
 const windL=mix(A,D,.55),windR=mix(B,C,.55),rearL=mix(E,H,.58),rearR=mix(F,G,.58);
 d.quad(A,B,windR,windL,'#253d49');d.quad(windL,windR,C,D,'#567078',.88);
 d.quad(F,E,rearL,rearR,'#29414a');d.quad(rearR,rearL,H,G,'#526973',.85);
 for(const [a,b]of[[A,D],[B,C],[E,H],[F,G]])tube(d,a,b,.036,.038,paint,5);
 tube(d,A,B,.025,.025,'#b4beb8',5);tube(d,E,F,.025,.025,'#b4beb8',5);
 for(const side of[-1,1]){
  const baseF=[side*.89,1.085,bf-.06],baseR=[side*.89,1.085,br+.06],topF=[side*roofW,roofY-.075,rf-.03],topR=[side*roofW,roofY-.075,rr+.03];
  const midF=mix(baseF,topF,.64),midR=mix(baseR,topR,.64);
  d.quad(baseF,baseR,midR,midF,'#293f48',side<0?.8:1);
  d.quad(midF,midR,topR,topF,'#557078',.85);
  // Seal the thin A/C pillars, sill and roof-side return rather than relying on trim to hide gaps.
  d.quad(side<0?A:B,side<0?D:C,topF,baseF,paint);
  d.quad(baseR,topR,side<0?H:G,side<0?E:F,paint,.85);
  d.quad(baseF,baseR,[side*.89,profile(baseR[2])[1]+.043,baseR[2]],[side*.89,profile(baseF[2])[1]+.043,baseF[2]],paint);
  d.quad(topF,topR,[side*roofW,roofY-.07,topR[2]],[side*roofW,roofY-.07,topF[2]],paint);
  const split=coupe?.64:.52,bottom=mix(baseF,baseR,split),top=mix(topF,topR,split);
  tube(d,bottom,top,coupe?.022:.038,coupe?.023:.038,paint,5);
  if(wagon)tube(d,mix(baseF,baseR,.78),mix(topF,topR,.78),.027,.027,paint,5);
  tube(d,baseF,baseR,.022,.022,'#b1bbb4',5);
  // Small wing mirrors with stalks and angled reflective faces.
  tube(d,[side*.94,1.02,.62],[side*1.15,1.07,.62],.025,.025,'#596463',5);
  if(panel(c,side<0?'left':'right')<.72)ellipsoid(d,[side*1.19,1.08,.62],[.12,.065,.105],paint,6,3);
  if(panel(c,side<0?'left':'right')<.72)d.quad([side*1.19,1.035,.523],[side*1.27,1.035,.542],[side*1.27,1.12,.542],[side*1.19,1.12,.523],'#839aa0');
 }
 for(let k=0;k<4;k++){const xs=[-1,-.87,0,.87,1],ys=[-.07,0,.025,0,-.07];d.quad([xs[k]*roofW,roofY+ys[k],rr],[xs[k+1]*roofW,roofY+ys[k+1],rr],[xs[k+1]*roofW,roofY+ys[k+1],rf],[xs[k]*roofW,roofY+ys[k],rf],paint,k<2?.96:1.05);
  for(const z of[rr,rf])d.quad([xs[k]*roofW,roofY-.075,z],[xs[k+1]*roofW,roofY-.075,z],[xs[k+1]*roofW,roofY+ys[k+1],z],[xs[k]*roofW,roofY+ys[k],z],paint,.95);
 }
 // Wiper arms, rear window demister, and a thin exhaust pipe.
 ribbon(d,[-.66,1.113,.73],[-.04,1.135,.69],.012,'#202b2c');ribbon(d,[.1,1.113,.73],[.69,1.135,.69],.012,'#202b2c');
 for(let i=1;i<5;i++){const u=i/6,a=mix(E,H,u),b=mix(F,G,u);a[2]-=.008;b[2]-=.008;ribbon(d,a,b,.006,'#72807c');}
 tube(d,[.7,.3,-2.25],[.7,.29,-2.64],.055,.05,'#656b64',7);
 // Damage remains attached to each vehicle when the player changes cars.
 for(const side of[-1,1]){const amount=side<0?left:right;if(amount>.1)for(let i=0;i<3+Math.floor(amount*5);i++){
  const z=-.9+i*.18,y=.52+(i%3)*.105,x=side*1.08;
  ribbon(d,[x,y,z-.2],[x,y+.045,z+.26],.013, i%2?'#c7c1a5':'#485354');
 }}
 if(f>.25||r>.45){const rear=r>f,a=rear?E:A,b=rear?F:B,up=rear?H:D,centre=mix(mix(a,b,.61),mix(up,rear?G:C,.61),.38);centre[2]+=rear?-.014:.014;
  for(const v of[mix(a,up,.15),mix(b,rear?G:C,.65),mix(up,rear?G:C,.42),mix(a,b,.81)]){v[2]+=rear?-.014:.014;ribbon(d,centre,v,.011,'#a9b6ad');}
  const small=add(centre,[.14,.06,0]);ribbon(d,add(centre,[-.12,.01,0]),small,.008,'#c1c8b8');
 }
 if(f>.55){
  for(let i=0;i<5;i++){const x=-.7+i*.31,z=1.35+(i%2)*.28;d.tri([x,1.075,z],[x+.25,1.075,z+.15],[x+.12,1.07,z+.47],i%2?'#73796f':'#434c49');}
  tube(d,[-.8,.51,2.66],[.18,.24+Math.sin(time*10)*Math.min(.12,Math.abs(c.speed||0)*.008),2.73],.045,.05,'#9fa89c',5);
 }
 if(r>.65)tube(d,[-.87,.21+Math.sin(time*9)*Math.min(.13,Math.abs(c.speed||0)*.008),-2.67],[.79,.52,-2.65],.05,.04,'#a4ada2',5);
 if(f>.4)for(let i=0;i<4;i++)ribbon(d,[-.62+i*.34,1.065,1.15],[.01+i*.2,1.025,2.1],.018,'#444e4b');
 if(r>.25)for(let i=0;i<3;i++)ribbon(d,[-.65+i*.43,.97,-1.8],[-.32+i*.43,.94,-2.23],.02,'#404b4b');
 if(police){
  d.quad([-.85,1.07,1.05],[.85,1.07,1.05],[.8,1.015,2.15],[-.8,1.015,2.15],'#c8cbbd');
  for(const side of[-1,1])d.quad([side*1.081,.56,-.92],[side*1.081,.56,.63],[side*1.081,.88,.63],[side*1.081,.88,-.92],'#c7cdc1');
  tube(d,[-.56,roofY+.09,-.4],[.56,roofY+.09,-.4],.06,.06,'#2b3437',6);
  for(const side of[-1,1])ellipsoid(d,[side*.4,roofY+.18,-.4],[.17,.12,.14],c.sirens!==false&&Math.sin(time*12)*side>0?(side<0?'#f2644e':'#7baed4'):(side<0?'#663c38':'#36576c'),8,3);
 }else if(coupe){for(const x of[-.2,.2])d.quad([x-.055,1.078,1.0],[x+.055,1.078,1.0],[x+.055,1.015,2.15],[x-.055,1.015,2.15],'#303c3f');}
 if(kind==='taxi'){
  taxiSign(d,roofY);
  for(const side of[-1,1]){
   const x=side*1.095;d.quad([x,.75,-1.13],[x,.75,.64],[x,.91,.64],[x,.91,-1.13],'#cec8a7');
   for(let j=0;j<8;j++)for(let row=0;row<2;row++)if((j+row)%2===0){const z=-1.13+j*.221,y=.75+row*.08,xx=x+side*.023;d.quad([xx,y,z],[xx,y,z+.221],[xx,y+.08,z+.221],[xx,y+.08,z],'#303d3b');}
  }
 }
 for(const side of[-1,1])for(const z of[-1.6,1.6])wheel(m,c,side,z,time,kind==='taxi'?{count:8}:{});
 m.transform=null;m.kind=0;
}

// Jurisdiction is painted on the same deformed surfaces as the civilian shell.
// These are fictional liveries, deliberately readable without tiny text.
const policePalette=c=>c.jurisdiction==='boston'?{body:'#283f58',panel:'#d2d4c5',stripe:'#e8e5d3',badge:'#b8a874'}:c.jurisdiction==='cambridge'?{body:'#c9d0c5',panel:'#36594f',stripe:'#e8dfbf',badge:'#c5b779'}:{body:c.paint||'#303b3c',panel:'#c7cdc1',stripe:'#c7cdc1',badge:'#bbb17b'};
function drawPoliceLivery(m,c,{time=0,lod=false}={}){
 const palette=policePalette(c),s=variantSpecs[c.kind]||variantSpecs.sedan,d=surface(m,c),x=s.w*.983;
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 // The cream Cambridge shell carries green doors/bonnet; Boston has pale doors.
 for(const side of[-1,1]){
  const sx=side*x,z1=-s.l*.34,z2=s.l*.23;
  d.quad([sx,.56,z1],[sx,.56,z2],[sx,s.h-.12,z2],[sx,s.h-.12,z1],palette.panel);
  if(!lod){
   d.quad([sx+side*.012,s.h-.17,-s.l*.72],[sx+side*.012,s.h-.17,s.l*.71],[sx+side*.012,s.h-.105,s.l*.71],[sx+side*.012,s.h-.105,-s.l*.72],palette.stripe);
   const bx=sx+side*.025,by=.76,bz=-.07;
   d.quad([bx,by+.12,bz-.105],[bx,by+.12,bz+.105],[bx,by-.025,bz+.10],[bx,by-.025,bz-.10],palette.badge);
   d.tri([bx,by-.025,bz-.10],[bx,by-.025,bz+.10],[bx,by-.115,bz],palette.badge);
   d.quad([bx+side*.007,by+.07,bz-.06],[bx+side*.007,by+.07,bz+.06],[bx+side*.007,by+.087,bz+.06],[bx+side*.007,by+.087,bz-.06],'#30434a');
  }
 }
 if(c.kind==='sedan'||c.kind==='coupe'||c.kind==='wagon'||c.kind==='taxi'){
  const bonnet=(x,z)=>{const f=clamp((z-1.6)/.6,0,1),h=z<1.6?1.01-(z-.68)/.92*.01:1-f*.04,w=1.055-f*.04;return[x,h+.081-.02*Math.abs(x)/(w*.91),z];};
  for(const [a,b]of[[1.05,1.6],[1.6,2.15]])for(const [x,X]of[[-.8,0],[0,.8]])d.quad(bonnet(x,a),bonnet(X,a),bonnet(X,b),bonnet(x,b),palette.panel);
 }
 const roof=s.roof+.025;
 block(d,0,roof,-.40,1.03,.07,.26,'#28383d');
 for(const side of[-1,1])block(d,side*.31,roof+.075,-.40,.34,.12,.22,c.sirens!==false&&Math.sin(time*12)*side>0?(side<0?'#f2644e':'#7baed4'):(side<0?'#663c38':'#36576c'));
 m.transform=null;m.kind=0;
}

function drawWreck(m,c,lod=false){
 const s=variantSpecs[c.kind]||variantSpecs.sedan,damage={...c,panelDamage:{front:100,rear:83,left:85,right:71},wheelDamage:95},d=surface(m,damage),w=s.w*.94,l=s.l*.91;
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 // The hollow cabin and torn hood are visible structural changes, not just dark paint.
 block(d,0,.30,0,w*1.82,.32,l*1.9,'#303633');
 for(const side of[-1,1]){
  d.quad([side*w,.49,-l],[side*w,.45,l],[side*w,.89,l*.82],[side*w,1.02,-l*.87],side<0?'#343b37':'#454b40');
 }
 // Empty, black window openings, bent pillars and an uneven crushed roof.
 const y=Math.min(s.roof,1.8),cabFront=c.kind==='van'?1.0:.58,cabRear=c.kind==='wagon'||c.kind==='van'?-l*.8:-1.3;
 d.quad([-w*.72,.63,cabRear],[w*.72,.63,cabRear],[w*.72,.63,cabFront],[-w*.72,.63,cabFront],'#1e2928');
 for(const side of[-1,1]){
  tube(d,[side*w*.82,.95,cabFront],[side*w*.65,y-.20,.02],.038,.035,'#707365',lod?4:5);
  tube(d,[side*w*.82,.94,cabRear],[side*w*.63,y-.15,cabRear+.45],.038,.035,'#5b6458',lod?4:5);
 }
 d.quad([-w*.65,y-.20,.02],[w*.65,y-.13,.02],[w*.63,y-.24,cabRear+.45],[-w*.63,y-.15,cabRear+.45],'#414b40');
 // Peeled bonnet exposes a lumpy engine; neither lamps nor light bars remain active.
 d.tri([-w*.72,1.08,.65],[w*.20,1.42,1.2],[w*.30,.85,l*.83],'#646a58');
 d.tri([-w*.72,1.08,.65],[w*.30,.85,l*.83],[-w*.78,.78,l*.73],'#3c463d');
 block(d,.25,.60,l*.58,.62,.27,.71,'#252f30');
 if(!lod){
  for(let k=0;k<4;k++)block(d,-.20+k*.16,.77,l*.57,.09,.12,.53,'#535c50');
  tube(d,[-w,.31,l+.08],[w*.36,.16,l+.14],.045,.035,'#788070',5);
  tube(d,[-w*.86,.20,-l-.08],[w*.42,.47,-l-.03],.04,.035,'#697263',5);
  for(const side of[-1,1])for(let k=0;k<4;k++){const z=-.8+k*.44;d.tri([side*(w+.02),.52,z],[side*(w+.02),.76,z+.18],[side*(w+.02),.63,z+.4],k%2?'#66694f':'#202b2b');}
  // Jagged glass remnants preserve a broken edge without a complete shiny pane.
  for(const side of[-1,1])d.tri([side*w*.72,.99,cabFront],[side*w*.59,1.12,cabFront-.15],[side*w*.42,1.00,cabFront],'#79857a');
 }
 for(const side of[-1,1])for(const z of[-s.wz,s.wz]){
  if(side===1&&z>0){if(!lod)tube(m,[.65,.27,z],[1.03,.22,z+.06],.055,.045,'#737869',5);continue;}
  if(lod)farWheel(m,side,z,{...s,wr:s.wr*.76});else wheel(m,damage,side,z,0,{x:s.w-.16,radius:s.wr*.78,width:.21,count:7,simple:true});
 }
 m.transform=null;m.kind=0;
}

function drawHazards(m,c,time=0,lod=false){
 if(!c.hazards||c.exploded)return;
 const s=variantSpecs[c.kind]||variantSpecs.sedan,lit=Math.floor((Number(time)||0)*3)%2===0,color=lit?'#f4ad42':'#72532d',d=surface(m,c);
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 // Dedicated amber indicators sit below the normal lamp clusters; braking stays red.
 for(const side of[-1,1])for(const end of[-1,1]){const x=side*s.w*.73,z=end*(s.l+.025),y=c.kind==='sport'?.46:.565,half=lod?.105:.083;d.quad([x-half,y-.043,z],[x+half,y-.043,z],[x+half,y+.043,z],[x-half,y+.043,z],color,lit?1.12:1);}
 if(!lod)for(const side of[-1,1]){const x=side*(s.w-.02),z=s.l*.72;d.quad([x,.59,z-.09],[x,.59,z+.09],[x,.665,z+.09],[x,.665,z-.09],color,lit?1.1:1);}
 m.transform=null;m.kind=0;
}

export function drawCar(m,c,options={}){
 if(c.exploded){drawWreck(m,c,!!options.lod);return;}
 const police=!!(options.police||c.police),car=police?{...c,paint:policePalette(c).body}:c;
 const renderOptions={...options,door:options.door??c.npcDoor??null};
 drawCarBody(m,car,{...renderOptions,police:false});
 if(police)drawPoliceLivery(m,car,renderOptions);
 drawHazards(m,car,renderOptions.time,!!renderOptions.lod);
}

// A small opaque low-poly flame mesh complements the renderer's drifting smoke.
// Simulation owns ignition and explosion timing; this function only draws state.
export function drawVehicleFire(m,c,time=0){
 const fire=Number(c.fire)||0,remaining=Number(c.burnTime)||0;
 if(!fire&&!remaining)return;
 const s=variantSpecs[c.kind]||variantSpecs.sedan,embers=!!c.exploded,count=embers?4:7;
 m.transform={x:c.x,y:c.y||0,z:c.z,c:Math.cos(c.a),s:Math.sin(c.a),pitch:c.pitch||0,roll:c.roll||0};m.kind=0;
 for(let k=0;k<count;k++){
  const a=k*2.399,x=Math.cos(a)*s.w*.52,z=(embers?0:s.l*.56)+Math.sin(a)*.50,base=embers?.53:.85,pulse=.75+.25*Math.sin(time*17+k*3),height=(embers?.30:1.05+(k%3)*.22)*pulse,r=(embers?.13:.22)+(k%2)*.045;
  const tip=[x+Math.sin(time*12+k)*.12,base+height,z+Math.cos(time*9+k)*.12];
  const corners=[[x-r,base,z-r],[x+r,base,z-r],[x+r,base,z+r],[x-r,base,z+r]];
  for(let n=0;n<4;n++)m.tri(corners[n],corners[(n+1)%4],tip,n%2?'#df7035':'#b94727');
  const inner=[tip[0]*.7+x*.3,base+height*.65,tip[2]*.7+z*.3];
  for(let n=0;n<4;n++)m.tri(mix(corners[n],[x,base,z],.45),mix(corners[(n+1)%4],[x,base,z],.45),inner,embers?'#c66a35':'#efd37b');
 }
 m.transform=null;m.kind=0;
}

export function drawPerson(m,p){
 m.transform={x:p.x,y:p.y??p.ground??0,z:p.z,c:Math.cos(p.a),s:Math.sin(p.a)};m.kind=0;
 const fall=clamp((Number(p.knockdown)||0)/.7,0,1),stunned=(Number(p.stun)||0)>0,officer=!!p.officer;
 const impactSide=Number(p.impactSide)<0?-1:1,impact=clamp((Number(p.lastVehicleImpact)||0)/16,0,1),recovering=fall>0&&fall<1,recover=recovering?Math.sin(fall*Math.PI):0;
 if(fall){
  const roll=-impactSide*fall*(.38+.27*impact),pitch=fall*(1.46-.08*impact),dx=-Math.sin(roll),dz=-Math.cos(roll)*Math.sin(pitch),len=Math.hypot(dx,dz)||1,x=dx/len,z=dz/len,point=a=>[x*.7*fall+x*Math.cos(a)*(.36+.65*fall)-z*Math.sin(a)*.32,.043,z*.7*fall+z*Math.cos(a)*(.36+.65*fall)+x*Math.sin(a)*.32];
  for(let k=0;k<12;k++)m.tri([x*.7*fall,.043,z*.7*fall],point(k/6*Math.PI),point((k+1)/6*Math.PI),'#303732');
 }else m.disc(0,.043,0,.36,'#303732',12);
 const active=(Number(p.reactionTime)||0)>0,flee=active&&p.reaction==='flee',startle=active&&p.reaction==='startle',watch=active&&p.reaction==='watch';
 const reporting=!!p.reporting&&!officer&&!fall&&!stunned;
 // Fall direction mirrors the contact; a bent knee and planted hand brace the recovery.
 if(fall||stunned){m.transform.pitch=fall*(1.46-.08*impact)+(stunned?.16:0)*(1-fall);m.transform.roll=-impactSide*fall*(.38+.27*impact)+(stunned?Math.sin(p.stun*17)*.065:0)*(1-fall);m.transform.y+=fall*.20-fall*fall*.14;}
 else if(flee){m.transform.pitch=-.18;m.transform.roll=Math.sin((p.walk||0)*.5)*.025;}
 else if(startle){m.transform.pitch=.105;}
 else if(watch&&!reporting){m.transform.pitch=.025;}
 const moving=(p.speed||0)>.08&&!stunned&&!fall,phase=p.walk||0,run=(p.speed||0)>4||flee;
 const bounce=(moving?Math.abs(Math.sin(phase))*(run?.035:.018):0)-recover*.14;
 const torso=.93+bounce,coat=officer?'#2b4054':p.coat||'#6f6757';
 // Eight-sided rings narrow at the waist, broaden through the shoulders.
 loftY(m,[[0,torso-.12,0,.185,.135],[0,torso+.03,.005,.205,.15],[0,torso+.30,.015,.255,.155],[0,torso+.43,.005,.245,.14],[0,torso+.47,.01,.105,.09]],coat,8);
 loftY(m,[[0,.80+bounce,0,.17,.125],[0,.94+bounce,0,.185,.13]],officer?'#25394c':'#3c4652',8);
 // Open jacket front, muted shirt and stitched lower edge.
 m.quad([-.07,torso+.04,.155],[.07,torso+.04,.155],[.085,torso+.38,.155],[-.085,torso+.38,.155],officer?'#384d60':'#a19c89');
 m.tri([-.085,torso+.38,.16],[-.14,torso+.33,.165],[-.06,torso+.20,.17],'#4b514b');
 m.tri([.085,torso+.38,.16],[.14,torso+.33,.165],[.06,torso+.20,.17],'#4b514b');
 for(const side of[-1,1]){
  const cycle=phase+(side>0?Math.PI:0),swing=moving?Math.sin(cycle)*(run?.44:.30):0,lift=moving?Math.max(0,Math.cos(cycle))*(run?.14:.065):0;
  const hip=[side*.115,.86+bounce,0],knee=[side*.13,.48+lift,swing*.48],ankle=[side*.13,.13+lift,swing];
  if(fall){knee[2]+=(side===impactSide?.34:.22)*fall+.10*recover;ankle[2]+=.04*fall;ankle[0]+=side*.035*recover;}else if(stunned||startle){ankle[0]=side*.19;knee[2]+=.035;}
  tube(m,hip,knee,.108,.084,'#434c56',7);tube(m,knee,ankle,.083,.062,'#3a434e',7);
  ellipsoid(m,[ankle[0],ankle[1]-.057,ankle[2]+.065],[.085,.067,.17],'#2d3437',8,3);
  const shoulder=[side*.254,torso+.33,.005],elbow=[side*.30,torso+.10,-swing*.57],hand=[side*.29,torso-.11,-swing*.85+(run?.08:0)];
  if(fall){
   elbow[0]+=side*.07*fall;elbow[2]+=.14*fall;hand[0]+=side*.12*fall;hand[2]+=.12*fall;
   const brace=side===impactSide?recover:recover*.28;elbow[1]-=.10*brace;hand[1]-=.31*brace;hand[2]-=.30*brace;
  }else if(stunned||startle){
   elbow[0]=side*.36;elbow[1]=torso+.28;elbow[2]=.20;hand[0]=side*.27;hand[1]=torso+.57;hand[2]=.34;
  }else if(reporting&&side===1){
   elbow[0]=.36;elbow[1]=torso+.36;elbow[2]=.035;hand[0]=.185;hand[1]=1.655+bounce;hand[2]=.018;
  }else if(flee){
   elbow[0]=side*.34;elbow[1]=torso+.15;elbow[2]=.08-swing*.58;hand[0]=side*.24;hand[1]=torso+.35;hand[2]=.22-swing*.8;
  }else if(watch){
   elbow[0]=side*.315;elbow[1]=torso+.11;elbow[2]=.12;hand[0]=-side*.105;hand[1]=torso+.18+(side>0?.035:0);hand[2]=.235+side*.016;
  }
  tube(m,shoulder,elbow,.089,.071,officer?'#2b4054':'#6c6657',7);tube(m,elbow,hand,.073,.052,officer?'#31495d':'#77705f',7);
  ellipsoid(m,[hand[0],hand[1]-.04,hand[2]+.012],[.054,.078,.05],'#ad9278',7,4);
 }
 tube(m,[0,torso+.43,0],[0,torso+.53,0],.065,.065,'#ab9077',7);
 const head=[0,1.635+bounce,.015];ellipsoid(m,head,[.116,.158,.117],'#baa087',10,6);
 // Low-poly scalp, sideburns, ears and a small nose silhouette.
 ellipsoid(m,[0,head[1]+.082,head[2]-.008],[.12,.093,.119],'#443e36',10,4);
 for(const side of[-1,1]){ellipsoid(m,[side*.116,head[1]+.005,.012],[.022,.042,.029],'#ab9077',6,3);m.quad([side*.1,head[1]-.035,.063],[side*.118,head[1]-.035,.032],[side*.116,head[1]+.068,.052],[side*.09,head[1]+.068,.088],'#50463b');}
 m.tri([-.022,head[1]+.023,.126],[.022,head[1]+.023,.126],[0,head[1]-.025,.161],'#b39a80');
 m.tri([-.022,head[1]+.023,.126],[0,head[1]-.025,.161],[0,head[1]-.035,.119],'#9c826a');
 for(const side of[-1,1])m.quad([side*.038-.016,head[1]+.028,.122],[side*.038+.016,head[1]+.028,.122],[side*.038+.016,head[1]+.038,.119],[side*.038-.016,head[1]+.038,.119],'#4d4940');
 m.quad([-.035,head[1]-.061,.113],[.035,head[1]-.061,.113],[.03,head[1]-.052,.118],[-.03,head[1]-.052,.118],'#816956');
 if(reporting){
  // A small dark handset stays between the raised hand and ear, never on officers.
  block(m,.148,head[1]-.065,.013,.045,.17,.085,'#202d30');
  m.quad([.172,head[1]-.025,-.015],[.172,head[1]-.025,.04],[.172,head[1]+.055,.04],[.172,head[1]+.055,-.015],'#596c67');
 }
 if(officer){
  // Peaked patrol cap, badge, epaulettes and equipment belt remain legible at street scale.
  ellipsoid(m,[0,head[1]+.122,.007],[.147,.055,.145],'#273c50',8,3);
  block(m,0,head[1]+.101,.131,.27,.025,.14,'#1b2b36');
  block(m,0,head[1]+.143,.147,.043,.039,.014,'#c7b274');
  loftY(m,[[0,torso-.08,0,.194,.143],[0,torso-.015,0,.199,.147]],'#202d34',8);
  block(m,0,torso-.067,.151,.065,.043,.02,'#a8a897');
  for(const side of[-1,1]){block(m,side*.192,torso-.10,.015,.075,.12,.115,'#24333c');block(m,side*.19,torso+.405,.013,.12,.025,.085,'#435970');}
  const bx=-.105,by=torso+.29,bz=.174;
  m.quad([bx-.036,by+.046,bz],[bx+.036,by+.046,bz],[bx+.032,by-.017,bz],[bx-.032,by-.017,bz],'#c7b47b');
  m.tri([bx-.032,by-.017,bz],[bx+.032,by-.017,bz],[bx,by-.050,bz],'#c7b47b');
  for(let k=0;k<3;k++)block(m,.018,torso+.12+k*.075,.167,.017,.017,.015,'#9ea9a2');
 }
 m.transform=null;m.kind=0;
}
