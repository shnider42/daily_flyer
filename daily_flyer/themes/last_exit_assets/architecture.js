// Compact original architecture: silhouettes and ground-floor details carry the district identity.
// Shared by the three cities; dimensions are the same footprint used by collision.
const palettes={
 tripledecker:['#96a79b','#acada0','#a59485'],bowfront:['#bd9276','#a77b63'],glass:['#729da5','#8aa9ac'],brutalist:['#b5b4a4','#a5aa9e'],firehouse:['#b17c63'],pub:['#a68b73'],bookshop:['#9a9986'],cinema:['#c1b69b'],
 brownstone:['#b3917d','#a88773','#c1a38c','#a5a394'],tenement:['#ae9b85','#b39e87','#bba994','#9e9d8e'],
 shop:['#c0b6a0','#b0aa92','#b3a18e'],diner:['#c4c4b1','#adb9ad'],warehouse:['#aaa38c','#b5a087'],
 factory:['#ac9b83','#b4a18c'],office:['#b2b8ad','#c2bdab'],apartments:['#b7b4a4','#a4b3a9','#c2afa0'],
 college:['#d0c4a9','#bebca7'],church:['#c1b79c'],civic:['#c6c4ae'],rowhouse:['#a9aaa0','#bbad8c','#829c93','#b19689']
};
export function drawArchitecture(m,b,{mapId='meridian',base,low,index=0}={}){
 const saved={transform:m.transform,height:m.heightSampler,material:m.material},a=b.a||0,co=Math.cos(a),si=Math.sin(a),point=(x,z)=>({x:b.x+x*co+z*si,z:b.z+z*co-x*si});
 const samples=[-1,1].flatMap(x=>[-1,1].map(z=>{const p=point(x*b.w/2,z*b.d/2);return(m.heightSampler||(()=>base||0))(p.x,p.z);}));if(!Number.isFinite(base))base=Math.max(...samples);if(!Number.isFinite(low))low=Math.min(...samples);
 m.heightSampler=null;m.transform={x:b.x,y:base,z:b.z,c:co,s:si};
 const kind=b.style==='market'?'shop':b.style==='brick'?'tenement':b.style==='stucco'?'apartments':b.style||'tenement',palette=palettes[kind]||palettes.tenement,color=palette[Math.abs((b.color||0)+index)%palette.length],W=b.w,D=b.d,H=b.h,X=-W/2,Z=-D/2,x=W/2,z=D/2,stone=['college','church','civic'].includes(kind),industrial=['warehouse','factory'].includes(kind),slot=industrial?14:kind==='glass'?9:kind==='office'||kind==='brutalist'?7:stone||kind==='apartments'||kind==='rowhouse'?6:3+(b.color||0)%3;
 const face=(x1,y1,x2,y2,slot=9,u=1,tint='#d0d2bf',zz=z+.035)=>m.surface([x1,y1,zz],[x2,y1,zz],[x2,y2,zz],[x1,y2,zz],slot,u,1,tint);
 const cornice=(y,w=W+.12,d=D+.12,t=.22,c='#b8b09b')=>m.box(0,y,0,w,t,d,c);
 const sign=(tile=12,y=3.35)=>face(-Math.min(W*.42,5),y,Math.min(W*.42,5),y+1.25,tile,1,'#e6ddc3');
 const door=(xx=0,y=.12)=>{m.box(xx,y,z+.045,1.05,2.25,.09,'#344343');face(xx-.4,y+.75,xx+.4,y+2.05,9,1,'#c2c9bb',z+.095);m.box(xx+.32,y+.82,z+.11,.07,.12,.025,'#c6b996');};
 const foundation=Math.min(-.55,low-base-.18);m.box(0,foundation,0,W,.15-foundation,D,'#898c7d');
 m.surface([X,.15,Z],[x,.15,Z],[x,H,Z],[X,H,Z],slot,W/7,H/7,color);m.surface([x,.15,z],[X,.15,z],[X,H,z],[x,H,z],slot,W/7,H/7,color);m.surface([X,.15,z],[X,.15,Z],[X,H,Z],[X,H,z],slot,D/7,H/7,color);m.surface([x,.15,Z],[x,.15,z],[x,H,z],[x,H,Z],slot,D/7,H/7,color);
 cornice(H);m.flat(0,0,W-.2,D-.2,'#626d66',H+.23);
 if(b.infill&&!b.placeId&&index%5!==0){m.box(0,H+.22,0,W*.65,.5,D*.65,'#899183');m.transform=saved.transform;m.heightSampler=saved.height;m.material=saved.material;return m;}
 if(kind==='tripledecker'){
  for(let yy=.6;yy<H;yy+=3.5){m.box(0,yy,z-.38,W*.78,.2,.8,'#d1c8ac');for(const xx of[-W*.35,W*.35])m.box(xx,yy,z-.32,.18,3.3,.18,'#c5c6ae');face(-W*.3,yy+1.1,W*.3,yy+1.65,8,2,'#c1c5ad');}
  for(let yy=.4;yy<H;yy+=.65)m.box(0,yy,Z-.01,W,.06,.03,'#bec5af');door();
  m.tri([X,H,z],[x,H,z],[0,H+2.5,z],'#c1baa1');m.quad([X,H,Z],[0,H+2.5,Z],[0,H+2.5,z],[X,H,z],'#52645e');m.quad([0,H+2.5,Z],[x,H,Z],[x,H,z],[0,H+2.5,z],'#70847b');
 }else if(kind==='bowfront'){
  for(const xx of[-W*.22,W*.22]){m.box(xx,1,z-.2,W*.36,H-1,.5,color);for(let yy=2;yy<H-1;yy+=3.5)face(xx-W*.14,yy,xx+W*.14,yy+2.1,9,1,'#cad0ba',z+.07);}
  door();cornice(H+.2,W+.35,D+.2,.4);m.box(0,H+.6,0,W*.7,.7,D*.8,'#8d8170');
 }else if(kind==='glass'){
  // A tall, thin blue-green curtain wall with a stepped crown.
  for(let yy=3;yy<H;yy+=4.5)cornice(yy,W+.03,D+.03,.12,'#8fa9a6');
  for(const xx of[-W*.33,0,W*.33])m.box(xx,.2,z+.02,.09,H,.06,'#b2c1b2');
  m.box(0,H+.2,0,W*.62,4,D*.63,'#718f91');m.box(0,H+4.2,0,W*.4,1.2,D*.42,'#bac1ad');door();
 }else if(kind==='brutalist'){
  for(let yy=3;yy<H;yy+=5){m.box(0,yy,0,W+.45,.7,D+.45,'#a6a795');face(X+.7,yy+1.2,x-.7,yy+3,9,3,'#8faaa4');}for(const xx of[-W*.35,W*.35])m.box(xx,.2,z+.08,.7,H,.35,'#c7c5ae');door();
 }else if(kind==='firehouse'){
  for(const xx of[-W*.25,W*.25]){face(xx-W*.2,.2,xx+W*.2,3.8,8,1,'#b17962');m.box(xx,3.9,z+.08,W*.42,.4,.18,'#c2b79e');}sign(11,4.7);m.box(-W*.3,H+.2,0,W*.27,5,D*.35,'#b39078');
 }else if(kind==='pub'||kind==='bookshop'||kind==='cinema'){
  face(X+.3,.4,x-.3,2.6,9,3);door(W*.3);m.box(0,2.8,z+.08,W,.45,.24,kind==='pub'?'#31584d':kind==='bookshop'?'#365d65':'#9b5945');
  sign(kind==='bookshop'?12:10,3.35);if(kind==='cinema'){m.box(0,3,z-.2,W+.2,.5,1,'#b79f73');for(let i=0;i<6;i++)m.box(X+W*(i+.5)/6,3.1,z+.32,.18,.18,.07,'#eed29a');m.box(X+.6,4,z+.12,.85,H-3,.2,'#b3694a');}else m.box(0,H+.2,0,W+.2,.5,D+.2,'#a8987a');
 }else if(kind==='brownstone'||kind==='rowhouse'){
  const count=Math.max(1,Math.round(W/5.5)),width=W/count;
  for(let i=0;i<count;i++){const xx=X+width*(i+.5);door(xx-width*.2);m.box(xx,.15,z-.22,width-.12,.28,.5,'#a29e8b');if(kind==='rowhouse'){const left=xx-width/2+.06,right=xx+width/2-.06,y=H+.23,top=y+1.9;m.tri([left,y,z],[right,y,z],[xx,top,z],color);m.tri([right,y,Z],[left,y,Z],[xx,top,Z],color);m.quad([left,y,Z],[xx,top,Z],[xx,top,z],[left,y,z],'#63756d');m.quad([xx,top,Z],[right,y,Z],[right,y,z],[xx,top,z],'#849083');}else m.box(xx,H+.22,0,width-.12,.42,D-.1,i%2?'#aaa893':'#c4b69f');
   // Shallow bay windows remain within the collision footprint except their thin trim.
   const yy=3.5;m.box(xx+width*.12,yy,z-.16,width*.54,Math.min(2.7,H-yy-.5),.39,color);face(xx-width*.1,yy+.2,xx+width*.33,Math.min(H-.6,yy+2.3),9,1,'#c6c7b3',z+.05);
  }
  m.box(W*.25,H+.65,-D*.2,.85,1.6,1,'#8c7a64');
 }else if(kind==='tenement'){
  door(-W*.26);face(-W*.04,.55,W*.43,2.65,index%3?9:8,2);m.box(0,3.05,0,W+.12,.25,D+.12,'#bdab8f');
  // One compact iron fire escape reads clearly against the brick without hundreds of bars.
  if(H>9){const xx=W*.2;for(let yy=5.5;yy<H-2;yy+=4.8){m.box(xx,yy,z+.04,Math.min(2.6,W*.4),.1,.24,'#414d47');m.quad([xx-1,yy+.7,z+.17],[xx+1,yy+.7,z+.17],[xx+1,yy+.85,z+.17],[xx-1,yy+.85,z+.17],'#48544c');m.tube([xx-.7,yy,z+.16],[xx+.7,yy-3.8,z+.16],.065,'#4e5a51',4);}}
 }else if(kind==='shop'||kind==='diner'){
  face(X+.35,.6,x-.35,2.6,9,Math.max(1,Math.floor(W/4)));door(W*.28);const aw=kind==='diner'?'#a65b49':'#61776a';
  for(let i=0;i<8;i++){const l=X+.15+(W-.3)*i/8,r=X+.15+(W-.3)*(i+1)/8;m.quad([l,2.7,z+.12],[r,2.7,z+.12],[r,3.2,z-.65],[l,3.2,z-.65],i%2?'#d2c7aa':aw);}
  sign(kind==='diner'?10:12,3.3);if(kind==='diner'){m.box(0,H+.22,0,W+.15,.5,D+.15,'#a2aaa0');m.box(-W*.25,H+.72,0,.7,.6,.7,'#8b948b');}
 }else if(industrial){
  const gates=Math.max(1,Math.floor(W/8));for(let i=0;i<gates;i++){const xx=X+W*(i+.5)/gates;face(xx-W/gates*.36,.25,xx+W/gates*.36,Math.min(4,H-1),8,1,'#c7bfab');m.box(xx,.1,z-.12,W/gates*.82,.32,.45,'#7c8478');}
  if(b.sign)sign(13,Math.min(5,H-1.7));
  if(kind==='factory'){m.box(W*.27,H+.22,-D*.25,Math.min(2,W*.18),H*.65,Math.min(2,D*.18),'#8e7f68');for(let yy=H+3;yy<H*1.65;yy+=4)m.box(W*.27,yy,-D*.25,Math.min(2.2,W*.2),.2,Math.min(2.2,D*.2),'#c0aa87');}
  else{for(const xx of[-W*.23,W*.23])m.box(xx,H+.23,0,W*.18,.55,D*.45,'#738279');}
 }else if(kind==='office'){
  for(let yy=3.4;yy<H;yy+=4.2){face(X+.15,yy,x-.15,Math.min(H-.1,yy+1.65),9,Math.max(2,Math.floor(W/3)),'#afc0b9');m.box(0,yy-.15,z+.025,W,.16,.08,'#c1c1ac');}
  door();m.box(0,H+.23,0,W*.55,2.4,D*.6,'#929f94');m.box(W*.22,H+2.63,0,W*.2,1.5,D*.35,'#818f87');
 }else if(kind==='apartments'){
  door();for(let yy=3.2;yy<H-1;yy+=4.2){for(const xx of[-W*.27,W*.27]){m.box(xx,yy,z-.13,W*.36,.18,.38,'#c3bca6');m.quad([xx-W*.18,yy+.65,z+.1],[xx+W*.18,yy+.65,z+.1],[xx+W*.18,yy+.82,z+.1],[xx-W*.18,yy+.82,z+.1],'#747e70');}}
  m.box(-W*.25,H+.25,0,W*.2,1.1,D*.3,'#838e7e');
 }else if(stone){
  const count=Math.max(3,Math.min(5,Math.floor(W/4)));for(let i=0;i<count;i++){const xx=(i-(count-1)/2)*W/(count+1);m.box(xx,.15,z-.2,.55,4.1,.45,'#cbc7ae');}m.box(0,4.25,z-.12,W,.55,.6,'#d3c9ac');door();
  const top=kind==='church'?H+3.7:H+2.2;m.tri([X,H+.23,z],[x,H+.23,z],[0,top,z],'#c5bda4');m.quad([X,H+.23,Z],[0,top,Z],[0,top,z],[X,H+.23,z],'#68766b');m.quad([0,top,Z],[x,H+.23,Z],[x,H+.23,z],[0,top,z],'#859180');
  if(kind==='church'){const T=H+6;m.box(0,H+.3,D*.22,3.1,5.7,3.1,'#b6b39d');for(let i=0;i<4;i++){const a=i*Math.PI/2,b=(i+1)*Math.PI/2;m.tri([Math.cos(a)*2,T,D*.22+Math.sin(a)*2],[Math.cos(b)*2,T,D*.22+Math.sin(b)*2],[0,T+8,D*.22],i%2?'#6b7c70':'#829080');}}
 }else door();
 if(!industrial&&kind!=='church'&&index%5===0)m.box(-W*.25,H+.23,-D*.24,Math.min(2.7,W*.3),1.2,Math.min(3.1,D*.3),'#7e897e');
 m.transform=saved.transform;m.heightSampler=saved.height;m.material=saved.material;return m;
}
