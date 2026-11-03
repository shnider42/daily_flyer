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

function wheel(m,c,side,z,time){
 const damage=z>0?panel(c,'front'):panel(c,'rear');
 const centre=[side*1.015,.425,z-Math.sign(z)*damage*.12],radius=.415,width=.25;
 const steer=(z>0?-clamp(c.steer||0,-1,1)*.38:0)+(c.wheelDamage||0)/100*.12*side,cs=Math.cos(steer),sn=Math.sin(steer);
 const spin=(c.distance||0)/radius*(c.speed<0?-1:1);
 const p=(ax,r,a)=>{const xx=ax,zz=Math.cos(a)*r;return[centre[0]+xx*cs+zz*sn,centre[1]+Math.sin(a)*r,centre[2]+zz*cs-xx*sn];};
 const count=14;
 // Chamfered tyre shoulders and a recessed sidewall, not a flat black disc.
 const rings=[[-width/2,.33],[-width*.42,radius],[width*.42,radius],[width/2,.33]];
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<count;k++){const a=k/count*Math.PI*2,b=(k+1)/count*Math.PI*2;m.quad(p(rings[j][0],rings[j][1],a),p(rings[j+1][0],rings[j+1][1],a),p(rings[j+1][0],rings[j+1][1],b),p(rings[j][0],rings[j][1],b),j===1?'#222526':'#303233',.88+(k%2)*.08);}
 for(const out of[-1,1]){const x=out*(width/2+.002);for(let k=0;k<count;k++){const a=k/count*Math.PI*2,b=(k+1)/count*Math.PI*2;m.quad(p(x,.33,a),p(x,.215,a),p(x,.215,b),p(x,.33,b),'#202426');m.tri(p(x+.003*out,0,0),p(x,.215,a),p(x,.215,b),'#878e8d',.85);}
  for(let k=0;k<5;k++){const a=k/5*Math.PI*2+spin;m.quad(p(x+.009*out,.06,a-.22),p(x+.009*out,.18,a-.12),p(x+.009*out,.18,a+.12),p(x+.009*out,.06,a+.22),'#c0c2b7');}
  for(let k=0;k<10;k++){const a=k/10*Math.PI*2,b=(k+1)/10*Math.PI*2;m.tri(p(x+.014*out,0,0),p(x+.014*out,.065,a),p(x+.014*out,.065,b),'#adb4ac');}
 }
}

export function drawCar(m,c,{police=false,brake=false,time=0,door=null}={}){
 const paint=c.paint||'#777b7b',kind=c.kind||'sedan',coupe=kind==='coupe',wagon=kind==='wagon';
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
  ellipsoid(d,[side*1.19,1.08,.62],[.12,.065,.105],paint,6,3);
  d.quad([side*1.19,1.035,.523],[side*1.27,1.035,.542],[side*1.27,1.12,.542],[side*1.19,1.12,.523],'#839aa0');
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
  tube(d,[-.8,.51,2.66],[.18,.34,2.73],.045,.05,'#9fa89c',5);
 }
 if(r>.65)tube(d,[-.87,.34,-2.67],[.79,.52,-2.65],.05,.04,'#a4ada2',5);
 if(f>.4)for(let i=0;i<4;i++)ribbon(d,[-.62+i*.34,1.065,1.15],[.01+i*.2,1.025,2.1],.018,'#444e4b');
 if(r>.25)for(let i=0;i<3;i++)ribbon(d,[-.65+i*.43,.97,-1.8],[-.32+i*.43,.94,-2.23],.02,'#404b4b');
 if(police){
  d.quad([-.85,1.07,1.05],[.85,1.07,1.05],[.8,1.015,2.15],[-.8,1.015,2.15],'#c8cbbd');
  for(const side of[-1,1])d.quad([side*1.081,.56,-.92],[side*1.081,.56,.63],[side*1.081,.88,.63],[side*1.081,.88,-.92],'#c7cdc1');
  tube(d,[-.56,roofY+.09,-.4],[.56,roofY+.09,-.4],.06,.06,'#2b3437',6);
  for(const side of[-1,1])ellipsoid(d,[side*.4,roofY+.18,-.4],[.17,.12,.14],Math.sin(time*12)*side>0?(side<0?'#f2644e':'#7baed4'):(side<0?'#663c38':'#36576c'),8,3);
 }else if(coupe){for(const x of[-.2,.2])d.quad([x-.055,1.078,1.0],[x+.055,1.078,1.0],[x+.055,1.015,2.15],[x-.055,1.015,2.15],'#303c3f');}
 for(const side of[-1,1])for(const z of[-1.6,1.6])wheel(m,c,side,z,time);
 m.transform=null;m.kind=0;
}

export function drawPerson(m,p){
 m.transform={x:p.x,y:p.y??p.ground??0,z:p.z,c:Math.cos(p.a),s:Math.sin(p.a)};m.kind=0;
 m.disc(0,.043,0,.36,'#303732',12);
 const moving=(p.speed||0)>.08,phase=p.walk||0,run=(p.speed||0)>4;
 const bounce=moving?Math.abs(Math.sin(phase))*(run?.035:.018):0;
 const torso=.93+bounce;
 // Eight-sided rings narrow at the waist, broaden through the shoulders.
 loftY(m,[[0,torso-.12,0,.185,.135],[0,torso+.03,.005,.205,.15],[0,torso+.30,.015,.255,.155],[0,torso+.43,.005,.245,.14],[0,torso+.47,.01,.105,.09]],p.coat||'#6f6757',8);
 loftY(m,[[0,.80+bounce,0,.17,.125],[0,.94+bounce,0,.185,.13]],'#3c4652',8);
 // Open jacket front, muted shirt and stitched lower edge.
 m.quad([-.07,torso+.04,.155],[.07,torso+.04,.155],[.085,torso+.38,.155],[-.085,torso+.38,.155],'#a19c89');
 m.tri([-.085,torso+.38,.16],[-.14,torso+.33,.165],[-.06,torso+.20,.17],'#4b514b');
 m.tri([.085,torso+.38,.16],[.14,torso+.33,.165],[.06,torso+.20,.17],'#4b514b');
 for(const side of[-1,1]){
  const cycle=phase+(side>0?Math.PI:0),swing=moving?Math.sin(cycle)*(run?.44:.30):0,lift=moving?Math.max(0,Math.cos(cycle))*(run?.14:.065):0;
  const hip=[side*.115,.86+bounce,0],knee=[side*.13,.48+lift,swing*.48],ankle=[side*.13,.13+lift,swing];
  tube(m,hip,knee,.108,.084,'#434c56',7);tube(m,knee,ankle,.083,.062,'#3a434e',7);
  ellipsoid(m,[ankle[0],ankle[1]-.057,ankle[2]+.065],[.085,.067,.17],'#2d3437',8,3);
  const shoulder=[side*.254,torso+.33,.005],elbow=[side*.30,torso+.10,-swing*.57],hand=[side*.29,torso-.11,-swing*.85+(run?.08:0)];
  tube(m,shoulder,elbow,.089,.071,'#6c6657',7);tube(m,elbow,hand,.073,.052,'#77705f',7);
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
 m.transform=null;m.kind=0;
}
