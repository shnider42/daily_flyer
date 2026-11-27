import { BASES, STRIKE_ZONE, AIM_AREA, PITCH_AIM_AREA, inStrikeZone } from './engine.mjs?v=0.8.0';
import { samplePlayerMotion, playerAppearance, presentationBatter, presentationHand, presentationBrawl, brawlCamera } from './renderer.mjs?v=0.8.0';
import { getPark, resolveParkId, fieldRadius, fenceHeight, getWallSegments } from './parks.mjs?v=0.8.0';
import { getPitcher, getRoster } from './rosters.mjs?v=0.8.0';

// Perspective software renderer. Geometry uses the same metres and boundaries
// as the simulation; only presentation is simplified when WebGL is unavailable.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a+(b-a)*t;
const vec = (x=0,y=0,z=0) => ({x,y,z});
const sub = (a,b) => vec(a.x-b.x,a.y-b.y,a.z-b.z);
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const norm = v => {const d=Math.hypot(v.x,v.y,v.z)||1;return vec(v.x/d,v.y/d,v.z/d);};
const cross = (a,b) => vec(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const TAU = Math.PI*2;
const shades = new Map();
const shade = (hex,light) => {
  let colors=shades.get(hex);if(!colors){colors=new Map();shades.set(hex,colors);}
  let color=colors.get(light);if(color)return color;
  const n=parseInt(hex.slice(1),16);color=`rgb(${Math.round(clamp(((n>>16)&255)*light,0,255))},${Math.round(clamp(((n>>8)&255)*light,0,255))},${Math.round(clamp((n&255)*light,0,255))})`;
  colors.set(light,color);return color;
};

export class CompatibilityRenderer {
  constructor(canvas,{onContextLost}={}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('Canvas graphics are unavailable.');
    this.width=this.height=0;this.quality='auto';this.time=0;this.wasMenu=true;
    this.eye=vec(46,42,-42);this.look=vec(-4,2,40);this.fov=52;
    this.static=[];this.trail=[];this.lastTick=-1;this.crowd=[];this.frameAverage=1/60;
    this.stats={renderer:'software',drawCalls:0,triangles:0,pixelRatio:1,backgroundBuilds:0,backgroundReused:false};
    this.backgroundCanvas=null;this.backgroundContext=null;this.backgroundView=null;this.backgroundDirty=true;
    this.parkId='harbor';this.buildPark();this.resize();this.cameraBasis();
  }
  setPark(id){
    const parkId=resolveParkId(id);if(parkId===this.parkId)return false;
    this.parkId=parkId;this.static=[];this.crowd=[];this.wallLabels=[];this.wallSurfaces=[];this.lastBoard='';this.backgroundDirty=true;this.buildPark();return true;
  }
  standRadius(a){
    if(Math.abs(a)<=Math.PI/4)return fieldRadius(a,this.parkId)+5;
    const corner=this.parkId!=='harbor'?fieldRadius(Math.sign(a)*Math.PI/4,this.parkId)+5:110;
    return mix(corner,this.parkId!=='harbor'?31:36,clamp((Math.abs(a)-Math.PI/4)/(Math.PI*.53),0,1));
  }
  standBase(a){return ['fenway','wrigley'].includes(this.parkId)&&Math.abs(a)<=Math.PI/4?fenceHeight(a,this.parkId)+.25:1.7;}
  standRows(a){return this.parkId==='fenway'&&a<=-8*Math.PI/180&&a>=-Math.PI/4?3:8;}
  setQuality(quality){this.quality=quality;this.resize();}
  resize(){
    const w=Math.max(1,this.canvas.clientWidth||globalThis.innerWidth||800),h=Math.max(1,this.canvas.clientHeight||globalThis.innerHeight||600);
    this.deviceDpr=globalThis.devicePixelRatio||1;
    const ratio=Math.min(this.deviceDpr,this.quality==='low'?.8:this.quality==='high'?1.5:1.15);
    if(w!==this.width||h!==this.height||ratio!==this.dpr){this.width=w;this.height=h;this.dpr=ratio;this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);this.ctx.setTransform(ratio,0,0,ratio,0,0);this.backgroundDirty=true;}
    this.stats.pixelRatio=ratio;
  }
  getDiagnostics(){return {...this.stats,width:this.canvas.width,height:this.canvas.height,backgroundCached:!!this.backgroundCanvas&&!this.backgroundDirty};}
  cameraBasis(){
    this.forward=norm(sub(this.look,this.eye));this.right=norm(cross(this.forward,vec(0,1,0)));this.up=cross(this.right,this.forward);
    this.focal=this.height/(2*Math.tan(this.fov*Math.PI/360));
  }
  cameraPoint(p){const x=-p.x-this.eye.x,y=p.y-this.eye.y,z=p.z-this.eye.z;return vec(x*this.right.x+y*this.right.y+z*this.right.z,x*this.up.x+y*this.up.y+z*this.up.z,x*this.forward.x+y*this.forward.y+z*this.forward.z);}
  screen(p){return{x:this.width/2+p.x*this.focal/p.z,y:this.height/2-p.y*this.focal/p.z,depth:p.z};}
  project(x,y,z){
    const dx=-x-this.eye.x,dy=y-this.eye.y,dz=z-this.eye.z,depth=dx*this.forward.x+dy*this.forward.y+dz*this.forward.z;
    const sx=this.width/2+(dx*this.right.x+dy*this.right.y+dz*this.right.z)*this.focal/depth,sy=this.height/2-(dx*this.up.x+dy*this.up.y+dz*this.up.z)*this.focal/depth;
    return {x:sx,y:sy,depth,visible:depth>.15&&sx>-30&&sx<this.width+30&&sy>-30&&sy<this.height+30};
  }
  polygon(points,color,stroke=null){this.static.push({points,color,stroke});}
  ground(points,color,y=.01){this.static.push({points:points.map(([x,z])=>vec(x,y,z)),color,ground:true});}
  disc(x,z,r,color,y=.02,n=20){this.ground(Array.from({length:n},(_,i)=>[x+Math.cos(i/n*TAU)*r,z+Math.sin(i/n*TAU)*r]),color,y);}
  box(x,y,z,w,h,d,color,side='#344a43'){
    const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2;
    this.polygon([vec(a,y,c),vec(b,y,c),vec(b,y+h,c),vec(a,y+h,c)],color);
    this.polygon([vec(b,y,e),vec(a,y,e),vec(a,y+h,e),vec(b,y+h,e)],color);
    this.polygon([vec(a,y,e),vec(a,y,c),vec(a,y+h,c),vec(a,y+h,e)],side);
    this.polygon([vec(b,y,c),vec(b,y,e),vec(b,y+h,e),vec(b,y+h,c)],side);
    this.polygon([vec(a,y+h,c),vec(b,y+h,c),vec(b,y+h,e),vec(a,y+h,e)],color);
  }
  buildPark(){
    const park=getPark(this.parkId),palette=park.palette;
    this.boardPosition={x:0,y:12,z:122,width:27};
    for(let z=-130;z<220;z+=12)this.ground([[-180,z],[180,z],[180,z+12],[-180,z+12]],Math.round(z/12)%2?palette?.grass||'#376d45':palette?.stripe||'#407a4c',-.03);
    const walls=getWallSegments(this.parkId),boundary=[walls[0].a,...walls.map(w=>w.b)];
    const outside=boundary.map(p=>[p.x,p.z]),inside=boundary.map(p=>{const r=Math.hypot(p.x,p.z),k=(r-4.2)/r;return[p.x*k,p.z*k];}).reverse();
    this.ground([...outside,...inside],'#a5825f');
    const skin=[[0,-3]];for(let i=0;i<=48;i++){const a=-Math.PI/4+i/48*Math.PI/2;skin.push([Math.sin(a)*42.5,Math.cos(a)*42.5]);}
    this.ground(skin,'#b88861');
    this.ground([[0,6.4],[14.9,21.2],[0,35.8],[-14.9,21.2]],'#417749',.025);
    this.disc(0,0,4.1,'#bc8c66');this.disc(0,18.44,2.9,'#c1936b');
    for(const p of BASES.slice(1,4)){this.disc(p.x,p.z,2.3,'#bc8d65');this.ground([[p.x-.31,p.z],[p.x,p.z+.31],[p.x+.31,p.z],[p.x,p.z-.31]],'#fff0cc',.08);}
    this.ground([[-.215,.215],[.215,.215],[.215,0],[0,-.215],[-.215,0]],'#fff0d2',.06);
    this.ground([[-.31,18.36],[.31,18.36],[.31,18.52],[-.31,18.52]],'#fff2d2',.07);
    this.parkLines=[];
    const line=(a,b,color,width=1)=>this.parkLines.push({a,b,color,width});
    for(const sign of[-1,1]){
      const chalkEnd=fieldRadius(sign*Math.PI/4,this.parkId)/Math.SQRT2+4;
      this.ground([[sign*.17,-.17],[sign*chalkEnd,chalkEnd],[sign*(chalkEnd+.1),chalkEnd-.1],[sign*.27,-.27]],'#f2e5c7',.045);
      const x=sign*1.0;for(const[[a,b],[d,e]]of[[[x-.48,-.7],[x+.48,-.7]],[[x+.48,-.7],[x+.48,1.1]],[[x+.48,1.1],[x-.48,1.1]],[[x-.48,1.1],[x-.48,-.7]]])line(vec(a,.03,b),vec(d,.03,e),'#e2caa5',.9);
      this.disc(sign*8,-7,1.5,'#8b7053');this.disc(sign*8,-7,1.4,'#a88662',.025);
      this.box(sign*29,0,12,14,2,1,'#294c3f','#1a382e');this.box(sign*29,2.0,11,15,.22,3,'#1c3d34','#152e2b');
      this.box(sign*29,.4,10.8,13.5,.18,.65,'#8c7552','#645a41');
      for(const dx of[-6.8,6.8])this.box(sign*29+dx,0,9.6,.15,2.1,.15,'#7b8a77');
      this.box(sign*29,.85,9.6,14,.08,.08,'#89947d');
      this.box(sign*29+5,.5,10.2,.6,.6,.6,'#c16b3e','#945438');this.box(sign*29+5,1.1,10.2,.66,.05,.65,'#e5d8b8');
    }
    this.wallSurfaces=[];
    for(const [i,wall] of walls.entries()){
      this.wallSurfaces.push({segment:wall,points:[vec(wall.a.x,0,wall.a.z),vec(wall.b.x,0,wall.b.z),vec(wall.b.x,wall.height,wall.b.z),vec(wall.a.x,wall.height,wall.a.z)]});
      const pieces=Math.max(1,Math.ceil(wall.length/5));
      for(let j=0;j<pieces;j++){
        const a=vec(mix(wall.a.x,wall.b.x,j/pieces),0,mix(wall.a.z,wall.b.z,j/pieces));
        const b=vec(mix(wall.a.x,wall.b.x,(j+1)/pieces),0,mix(wall.a.z,wall.b.z,(j+1)/pieces));
        this.polygon([a,b,vec(b.x,wall.height,b.z),vec(a.x,wall.height,a.z)],wall.zone==='monster'?'#285b49':palette?.wall||(i%2?'#1f4b39':'#24553e'));
      }
      line(vec(wall.a.x,wall.height+.035,wall.a.z),vec(wall.b.x,wall.height+.035,wall.b.z),'#c5a664',1.5);
    }
    if(park.neighborhood){this.buildNeighborhood();this.finalizePark();return;}
    const standRadius=a=>this.standRadius(a);
    for(let j=0;j<64;j++){
      const a=-Math.PI+j/64*TAU,b=a+TAU/64,mid=(a+b)/2;
      for(let row=0;row<this.standRows(mid);row++){
        const r=standRadius(a)+row*1.7,s=standRadius(b)+row*1.7,y=this.standBase(mid)+row*.8;
        this.polygon([vec(Math.sin(a)*r,y,Math.cos(a)*r),vec(Math.sin(b)*s,y,Math.cos(b)*s),vec(Math.sin(b)*(s+1.7),y,Math.cos(b)*(s+1.7)),vec(Math.sin(a)*(r+1.7),y,Math.cos(a)*(r+1.7))],row%2?'#42584f':'#354d43');
        this.polygon([vec(Math.sin(a)*r,y-.7,Math.cos(a)*r),vec(Math.sin(b)*s,y-.7,Math.cos(b)*s),vec(Math.sin(b)*s,y,Math.cos(b)*s),vec(Math.sin(a)*r,y,Math.cos(a)*r)],'#2b443b');
        for(let k=0;k<3;k++){const angle=mix(a,b,(k+.5)/3),radius=standRadius(angle)+row*1.7+.6;this.crowd.push({x:Math.sin(angle)*radius,y:y+.45,z:Math.cos(angle)*radius,color:['#c5b697','#657f8b','#a14c41','#bdb398','#31485c'][(j+row+k)%5],skin:['#cfa57e','#ad815e','#987051'][(j+k)%3]});}
      }
      if(Math.abs(mid)>Math.PI/4){
        const r=standRadius(mid)-1;
        this.polygon([vec(Math.sin(a)*r,0,Math.cos(a)*r),vec(Math.sin(b)*r,0,Math.cos(b)*r),vec(Math.sin(b)*r,1.55,Math.cos(b)*r),vec(Math.sin(a)*r,1.55,Math.cos(a)*r)],j%3?'#795340':'#855b45');
        line(vec(Math.sin(a)*r,1.56,Math.cos(a)*r),vec(Math.sin(b)*r,1.56,Math.cos(b)*r),'#b4ab90',2);
        if(j%4===0)this.box(Math.sin(mid)*(r+5),3,Math.cos(mid)*(r+5),2.3,3,1,'#122e28','#102821');
        if(Math.abs(mid)>(this.parkId==='fenway'?1.25:1.8)){const q=standRadius(mid)+8;this.polygon([vec(Math.sin(a)*(q-6),11.7,Math.cos(a)*(q-6)),vec(Math.sin(b)*(q-6),11.7,Math.cos(b)*(q-6)),vec(Math.sin(b)*(q+6),11.7,Math.cos(b)*(q+6)),vec(Math.sin(a)*(q+6),11.7,Math.cos(a)*(q+6))],'#294640');if(j%3===0)this.box(Math.sin(mid)*(q-6),1.7,Math.cos(mid)*(q-6),.2,10,.2,'#7b8b79');}
      }
    }
    this.skyWindows=[];
    for(let i=0;i<25;i++){
      const x=-180+i*15,z=176+(i%4)*11,height=12+(i*13)%34;
      this.box(x,0,z,11,height,15,i%3?'#2a3d4b':'#354654','#223541');
      if(i%4===0)this.box(x+2,height,z,2,7,2,'#263d49');
      for(let row=0;row<Math.floor(height/3);row++)for(let column=0;column<3;column++)if((row*7+column+i)%3!==0){
        const a=x-3.4+column*3,y=3+row*2.6;
        this.polygon([vec(a,y,z-7.6),vec(a+.65,y,z-7.6),vec(a+.65,y+.9,z-7.6),vec(a,y+.9,z-7.6)],(i+row)%3?'#a58b5c':'#d7b574');
      }
    }
    this.floodlights=[];
    for(const [x,z]of[[-90,84],[90,84],[-68,-9],[68,-9]]){
      this.box(x,0,z,.5,34,.5,'#7b8178','#475950');this.box(x,33,z,8,2.5,.5,'#495b54');
      for(let row=0;row<2;row++)for(let k=0;k<5;k++){const a=x-3.3+k*1.5,y=33.3+row*1.2;this.polygon([vec(a,y,z-.28),vec(a+.9,y,z-.28),vec(a+.9,y+.8,z-.28),vec(a,y+.8,z-.28)],'#fff1c7');}
      this.floodlights.push(vec(x,34.2,z-.6));
    }
    for(const sign of[-1,1]){const a=sign*Math.PI/4,r=fieldRadius(a,this.parkId),height=this.parkId==='fenway'?(sign<0?23:18):16;this.box(Math.sin(a)*r,0,Math.cos(a)*r,.20,height,.20,'#e1c14f');}
    const eyeZ=this.parkId!=='harbor'?Math.max(...walls.flatMap(s=>[s.a.z,s.b.z]))+2:117;
    this.box(0,.6,eyeZ,25,8.2,.8,'#142d29','#112821');
    if(this.parkId==='fenway')this.buildFenwayDetails();else{
      this.box(0,4,123,30,14,1.3,'#193a32','#122d28');this.box(0,18.1,123,31,.4,1.8,'#d1b979');
      for(const x of[-16,16])this.box(x,0,123,.7,18,.7,'#465b4b');
    }
    if(this.parkId==='wrigley')this.buildIvyDetails();
    for(const x of[-23,0,23]){this.box(x,13,139,.13,15,.13,'#9eaa9b');this.polygon([vec(x,25,139),vec(x+3.5,24.9,139),vec(x+3.5,26.6,139),vec(x,26.7,139)],x<0?'#a94a42':x>0?'#375a76':'#e0d2ab');}
    for(let x=-17;x<=17;x+=2)line(vec(x,1.5,-16.5),vec(x,7.8,-16.5),'rgba(171,187,168,.23)',.7);
    for(let y=1.5;y<=7.8;y+=.9)line(vec(-17,y,-16.5),vec(17,y,-16.5),'rgba(171,187,168,.23)',.7);
    // The park never deforms. Reuse its paint lists and sort records when the
    // camera moves, instead of cloning every polygon on every animation frame.
    this.finalizePark();
  }
  finalizePark(){
    this.groundPolygons=this.static.filter(p=>p.ground);
    this.sortedPolygons=this.static.filter(p=>!p.ground);
    for(const p of this.sortedPolygons){const center=vec();for(const v of p.points){center.x+=v.x;center.y+=v.y;center.z+=v.z;}center.x/=p.points.length;center.y/=p.points.length;center.z/=p.points.length;p.center=center;p.depth=0;}
    this.backgroundDirty=true;
  }
  buildIvyDetails(){
    for(const wall of getWallSegments(this.parkId))for(let i=0;i<Math.ceil(wall.length/2);i++){
      const t=(i+.5)/Math.ceil(wall.length/2),x=mix(wall.a.x,wall.b.x,t)-wall.normal.x*.12,z=mix(wall.a.z,wall.b.z,t)-wall.normal.z*.12;
      this.box(x,.35,z,1.6,wall.height-.50,.18,i%3?'#3d683e':'#597e3f');
    }
    for(const side of[-1,1])for(let i=0;i<5;i++){
      const x=side*(42+i*12),z=125-i*8,h=8+i%3*1.3;
      this.box(x,0,z,10,h,12,i%2?'#9b6954':'#886449','#6c4a3c');this.box(x,h,z,11,.5,13,'#35453e');
      for(let row=0;row<3;row++)this.box(x,h+.7+row*.65,z+row*1.1,8,.24,.8,'#53766a');
      for(let col=0;col<3;col++)this.box(x-3+col*3,h-3,z-6.1,1.2,1.7,.08,'#304544');
    }
    this.wallLabels=[];
  }
  buildNeighborhood(){
    const park=getPark(this.parkId),style=park.style;this.floodlights=[];this.wallLabels=[];
    const tree=(x,z,r=5)=>{this.box(x,0,z,.8,8,.8,'#796147');for(let i=0;i<2;i++){
      const y=6+i*3,q=r*(1-i*.25);this.polygon([vec(x-q,y,z),vec(x-q*.7,y+q,z),vec(x,y+q*1.4,z),vec(x+q*.8,y+q,z),vec(x+q,y,z)],i?'#557b43':'#426b3e');
    }};
    for(const wall of getWallSegments(this.parkId)){
      const count=Math.ceil(wall.length/(style==='backyard'?.8:4));
      for(let i=0;i<=count;i++){const t=i/count,x=mix(wall.a.x,wall.b.x,t),z=mix(wall.a.z,wall.b.z,t);this.box(x,0,z,.1,wall.height+.3,.12,style==='backyard'?'#c2af86':'#899285');}
      if(style==='schoolyard'&&wall.height>3)for(let y=.5;y<wall.height;y+=.5)this.parkLines.push({a:vec(wall.a.x,y,wall.a.z-.05),b:vec(wall.b.x,y,wall.b.z-.05),color:'#c79577',width:.8});
    }
    for(const side of[-1,1])for(let row=0;row<3;row++){
      this.box(side*(39+row),.5+row*.48,4,1.1,.15,9,'#879789');
      for(let i=0;i<4;i++)this.crowd.push({x:side*(39+row),y:1.1+row*.48,z:1+i*2,color:['#aa6557','#7393a3','#d4be88'][i%3],skin:'#bf916e'});
    }
    if(style==='backyard'){
      for(let i=0;i<5;i++){
        const x=-70+i*34,z=108+i%2*9,h=5+i%2*1.7;this.box(x,0,z,19,h,13,['#c1af8b','#93a8a1','#b8a391'][i%3]);
        this.box(x,h,z,21,1.4,15,'#59635d');for(const dx of[-6,6])this.box(x+dx,1.8,z-6.6,2.4,2.1,.12,'#4c6268');this.box(x,0,z-9,12,.4,5,'#765f49');
      }
      tree(-80,75,8);tree(70,75,8);tree(-18,108,6);tree(38,119,7);
      this.box(59,0,63,7,4.2,5,'#987747');this.box(59,4.2,63,8,.35,6,'#655848');
      for(const x of[57,72])this.box(x,0,90,.12,5,.12,'#8c8d78');this.parkLines.push({a:vec(57,4.4,90),b:vec(72,4.4,90),color:'#d0c7ad',width:1});
      for(let i=0;i<5;i++)this.box(59+i*2.6,2.8,90,.95,1.6,.035,['#d5c18e','#7393a3','#ab6657'][i%3]);
    }else if(style==='sandlot'){
      this.box(55,0,119,42,12,18,'#8c735f');this.box(55,12,119,44,.4,20,'#5c6965');for(let i=0;i<4;i++)this.box(40+i*10,1,109.9,6,8,.15,'#4c5b57');
      for(const z of[125,130])this.box(-25,.10,z,105,.16,.16,'#4d5148');for(let x=-78;x<27;x+=2)this.box(x,0,127.5,.35,.15,7,'#776957');
      for(let i=0;i<3;i++){const x=15-i*31;this.box(x,.9,127.5,27,5.8,5,i%2?'#99714d':'#7b5345');this.box(x,.5,127.5,25,.7,5.3,'#574d41');}
      tree(-78,97,5);tree(91,63,6);
    }else{
      this.box(-21,0,113,73,13,16,'#a06c55');this.box(-21,13,113,75,.6,18,'#716a58');
      for(let i=0;i<12;i++)for(const y of[2.6,7.6])this.box(10-i*5.6,y,104.9,2.5,2.7,.15,'#547277');
      this.box(-21,0,103.5,6,3.6,2,'#87735a');this.ground([[50,29],[76,29],[76,61],[50,61]],'#696f6b',.02);
      for(const z of[33,57]){this.box(63,0,z,.2,4.6,.2,'#84938b');this.box(63,3.4,z,2.8,1.8,.12,'#d2d4ba');this.box(63,3.6,z-.5,.9,.07,.8,'#a65c3d');}
      for(const x of[-62,-75])this.box(x,0,68,.2,4.2,.2,'#5b7974');this.box(-68.5,4.2,68,13.4,.16,.16,'#607e75');
      for(const x of[-65,-71]){this.box(x,1.1,68,2,.15,.7,'#867451');for(const dx of[-.8,.8])this.box(x+dx,1.1,68,.035,3.1,.035,'#9aab9e');}
      tree(-82,84,7);tree(82,82,6);
    }
    const z=fieldRadius(0,this.parkId)+7;this.boardPosition={x:0,y:6.2,z:z-.3,width:16};
    this.box(0,2.9,z,17,6.5,.45,'#324c3e');for(const x of[-7,7])this.box(x,0,z,.35,6,.35,'#665b44');
    this.box(0,0,z-2,18,4,.3,'#2c4836');
    for(const sign of[-1,1]){const a=sign*Math.PI/4,r=fieldRadius(a,this.parkId);this.box(Math.sin(a)*r,0,Math.cos(a)*r,.15,8,.15,'#e1c14f');}
  }
  buildFenwayDetails(){
    const walls=getWallSegments(this.parkId),monster=walls[0];
    const at=(wall,t,y,offset=0)=>vec(mix(wall.a.x,wall.b.x,t)+wall.normal.x*offset,y,mix(wall.a.z,wall.b.z,t)+wall.normal.z*offset);
    const line=(a,b,color,width=1)=>this.parkLines.push({a,b,color,width});
    for(let i=0;i<=25;i++)line(at(monster,i/25,.10,-.03),at(monster,i/25,monster.height-.05,-.03),'#1c4638',.7);
    for(const y of[6.1,9.65])line(at(monster,0,y,-.04),at(monster,1,y,-.04),'#3d715a',.8);
    line(at(monster,0,monster.height+.5,1.6),at(monster,1,monster.height+.5,1.6),'#b2b89a',1);
    for(let i=0;i<=22;i++)line(at(monster,i/22,monster.height,1.6),at(monster,i/22,monster.height+.6,1.6),'#81997d',.8);
    const urban=[at(monster,0,.005,10),at(monster,1,.005,10),at(monster,1,.005,37),at(monster,0,.005,37)];this.polygon(urban,'#4e5548');
    for(let i=0;i<5;i++){
      const p=at(monster,.10+i*.18,0,17),h=8.4+(i%2)*2.1;
      this.box(p.x,0,p.z,12,h,11,i%2?'#79503f':'#8b5c45','#654638');this.box(p.x,h,p.z,12.6,.35,11.6,'#314d41');
      for(let j=0;j<3;j++)this.box(p.x-4+j*4,h-3.4,p.z-5.6,1.2,1.8,.12,'#263a32');
    }
    for(const wall of walls.filter(w=>w.zone==='bullpen')){
      const a=at(wall,.10,.04,1.3),b=at(wall,.90,.04,1.3),c=at(wall,.90,.04,5.4),d=at(wall,.10,.04,5.4);this.polygon([a,b,c,d],'#a58d68');
      for(const[p,q]of[[a,b],[b,c],[c,d],[d,a]])line(vec(p.x,1.55,p.z),vec(q.x,1.55,q.z),'#85a186',1);
      for(const t of[.14,.86]){const p=at(wall,t,.1,3.3);this.disc(p.x,p.z,.8,'#b49369',.15);}
      const p=at(wall,.5,.55,5);this.box(p.x,.55,p.z,5,.17,.55,'#2a503f');
    }
    this.wallLabels=getPark(this.parkId).dimensions.map(marker=>{
      const wall=walls.find(w=>marker.angle<=Math.atan2(w.b.x,w.b.z)+1e-7)||walls.at(-1),r=fieldRadius(marker.angle,this.parkId);
      return {text:String(marker.feet),position:vec(Math.sin(marker.angle)*r-wall.normal.x*.15,Math.min(wall.height*.55,2),Math.cos(marker.angle)*r-wall.normal.z*.15),height:Math.min(1.2,wall.height*.65),wall};
    });
    this.wallLabels.push({text:'FENWAY PARK',position:at(monster,.73,8.2,-.15),height:1.8,wall:monster});
    const center=.46,half=13/monster.length,top=5.5,bottom=.8;
    this.boardSurface=[at(monster,center-half,top,-.2),at(monster,center+half,top,-.2),at(monster,center+half,bottom,-.2),at(monster,center-half,bottom,-.2)];
    this.boardCanvas ||= document.createElement('canvas');this.boardCanvas.width=1024;this.boardCanvas.height=400;this.lastBoard='';
  }
  updateManualBoard(state){
    const key=state?`${state.score}/${state.lineScore}/${state.hits}/${state.balls}/${state.strikes}/${state.outs}`:'menu';
    if(this.lastBoard===key)return;this.lastBoard=key;
    const c=this.boardCanvas.getContext('2d');c.fillStyle='#183e30';c.fillRect(0,0,1024,400);c.strokeStyle='#d0cfa6';c.lineWidth=3;c.strokeRect(9,9,1006,382);
    c.fillStyle='#e7e3bc';c.font='bold 35px Georgia';c.textAlign='center';c.fillText('FENWAY PARK  ·  BOSTON',512,61);
    c.fillStyle='#c4cfab';c.font='25px monospace';c.fillText('1  2  3  4  5  6  7  8  9    R  H',623,121);c.textAlign='left';
    for(let side=0;side<2;side++){
      const y=189+side*64;c.font='bold 35px monospace';c.fillStyle='#eee9ce';c.fillText(getRoster(side,state).abbrev,36,y);c.font='32px monospace';
      for(let inning=0;inning<9;inning++){c.fillStyle='#102b22';c.fillRect(323+inning*52,y-36,44,48);c.fillStyle='#eee9ce';c.fillText(String(state?.lineScore?.[side]?.[inning]??'·'),332+inning*52,y);}
      c.fillText(String(state?.score?.[side]??0),848,y);c.fillText(String(state?.hits?.[side]??0),926,y);
    }
    c.textAlign='center';c.fillStyle='#d5c889';c.font='29px monospace';c.fillText(state?`BALL ${state.balls}    STRIKE ${state.strikes}    OUT ${state.outs}`:'GOOD EVENING, BASEBALL.',512,340);
  }
  drawSurface(image,points){
    const p=points.map(v=>this.project(v.x,v.y,v.z));if(p.some(v=>v.depth<=.15))return;
    // In portrait the Monster scoreboard can sit wholly to the left of the
    // picture. Do not rasterize two large, transformed images for an invisible sign.
    if(p.every(v=>v.x<0)||p.every(v=>v.x>this.width)||p.every(v=>v.y<0)||p.every(v=>v.y>this.height))return;
    const c=this.ctx,w=image.width,h=image.height,uv=[[0,0],[w,0],[w,h],[0,h]];
    for(const indices of[[0,1,2],[0,2,3]]){
      const a=p[indices[0]],b=p[indices[1]],d=p[indices[2]],[u0,v0]=uv[indices[0]],[u1,v1]=uv[indices[1]],[u2,v2]=uv[indices[2]];
      const denominator=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);
      const m11=((b.x-a.x)*(v2-v0)-(d.x-a.x)*(v1-v0))/denominator,m12=((b.y-a.y)*(v2-v0)-(d.y-a.y)*(v1-v0))/denominator;
      const m21=((d.x-a.x)*(u1-u0)-(b.x-a.x)*(u2-u0))/denominator,m22=((d.y-a.y)*(u1-u0)-(b.y-a.y)*(u2-u0))/denominator;
      c.save();c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(d.x,d.y);c.closePath();c.clip();
      c.transform(m11,m12,m21,m22,a.x-m11*u0-m21*v0,a.y-m12*u0-m22*v0);c.drawImage(image,0,0);c.restore();
    }
  }
  drawParkSigns(state){
    if(this.parkId!=='fenway')return;
    this.updateManualBoard(state);this.drawSurface(this.boardCanvas,this.boardSurface);
    const c=this.ctx;
    for(const label of this.wallLabels){
      const p=label.position,q=this.project(p.x,p.y,p.z);if(!q.visible)continue;
      const edge=this.project(p.x+label.wall.b.x-label.wall.a.x,p.y,p.z+label.wall.b.z-label.wall.a.z),size=clamp(this.focal/q.depth*label.height,3,26);
      c.save();c.translate(q.x,q.y);c.rotate(Math.atan2(edge.y-q.y,edge.x-q.x));c.font=`bold ${size}px ${label.text.length>4?'Georgia':'Arial'}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#e5e4bd';c.fillText(label.text,0,0);c.restore();
    }
  }
  clip(points){
    const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],insideA=a.z>=.15,insideB=b.z>=.15;if(insideA)out.push(a);if(insideA!==insideB){const t=(.15-a.z)/(b.z-a.z);out.push(vec(mix(a.x,b.x,t),mix(a.y,b.y,t),.15));}}
    return out;
  }
  drawPolygon(points,color,stroke){
    const p=this.clip(points.map(v=>this.cameraPoint(v)));if(p.length<3)return;
    const q=p.map(v=>this.screen(v));
    if(q.every(v=>v.x<0)||q.every(v=>v.x>this.width)||q.every(v=>v.y<0)||q.every(v=>v.y>this.height))return;
    const c=this.ctx;c.beginPath();q.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.6;c.stroke();}
  }
  line(a,b,color,width=1){const A=this.cameraPoint(a),B=this.cameraPoint(b);if(A.z<.15||B.z<.15)return;const p=this.screen(A),q=this.screen(B),c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();}
  paintEnvironment(state){
    const c=this.ctx,w=this.width,h=this.height,palette=getPark(this.parkId).palette,sky=c.createLinearGradient(0,0,0,h*.7);sky.addColorStop(0,palette?.sky||'#14243e');sky.addColorStop(.48,palette?.sky||'#49566b');sky.addColorStop(.83,palette?.horizon||'#b3958a');sky.addColorStop(1,palette?.horizon||'#d1ac93');c.fillStyle=sky;c.fillRect(0,0,w,h);
    for(let i=0;i<(palette?0:55);i++){const a=i*2.399963,q=this.project(Math.sin(a)*380,85+(i*47)%180,Math.cos(a)*380);if(q.visible){c.fillStyle='rgba(229,235,238,.48)';c.fillRect(q.x,q.y,i%6===0?1.5:1,i%6===0?1.5:1);}}
    // Coplanar paint follows construction order: grass, dirt, then chalk/bases.
    // Sorting a grass strip by its centre could otherwise erase the infield.
    for(const p of this.groundPolygons)this.drawPolygon(p.points,p.color,p.stroke);
    const all=this.sortedPolygons;
    for(const p of all)p.depth=this.cameraPoint(p.center).z;
    all.sort((a,b)=>b.depth-a.depth);
    for(const p of all)if(p.depth>0)this.drawPolygon(p.points,p.color,p.stroke);
    for(const p of this.parkLines)this.line(p.a,p.b,p.color,p.width);
    for(const p of this.crowd){const q=this.project(p.x,p.y,p.z);if(!q.visible)continue;const r=clamp(this.focal/q.depth*.28,.45,3.5);c.fillStyle='#23473f';c.fillRect(q.x-r*1.3,q.y-r*1.1,r*2.6,r*2.2);c.fillStyle=p.color;c.fillRect(q.x-r,q.y-r*1.4,r*2,r*2.5);c.fillStyle=p.skin;c.beginPath();c.arc(q.x,q.y-r*1.8,Math.max(.45,r*.60),0,TAU);c.fill();}
    for(const light of this.floodlights){const q=this.project(light.x,light.y,light.z);if(!q.visible)continue;const r=clamp(this.focal/q.depth*5,6,75),glow=c.createRadialGradient(q.x,q.y,0,q.x,q.y,r);glow.addColorStop(0,'rgba(255,239,194,.25)');glow.addColorStop(1,'rgba(255,239,194,0)');c.fillStyle=glow;c.fillRect(q.x-r,q.y-r,r*2,r*2);}
    this.drawParkSigns(state);
    const position=this.boardPosition||{x:0,y:12,z:122,width:27},board=this.project(position.x,position.y,position.z),boardWidth=this.focal*position.width/board.depth;
    if(this.parkId!=='fenway'&&board.visible&&boardWidth>14){c.fillStyle='#0f3027';c.fillRect(board.x-boardWidth/2,board.y-boardWidth*.19,boardWidth,boardWidth*.38);c.textAlign='center';c.fillStyle='#f1dfae';c.font=`bold ${Math.max(4,boardWidth*.085)}px Georgia`;c.fillText(getPark(this.parkId).shortName,board.x,board.y-boardWidth*.065);c.font=`${Math.max(4,boardWidth*.07)}px monospace`;c.fillText(state?`${getRoster(0,state).abbrev} ${state.score[0]}   ${getRoster(1,state).abbrev} ${state.score[1]}`:'GOOD EVENING, BASEBALL',board.x,board.y+boardWidth*.065);}
  }
  drawEnvironment(state){
    const view=[this.eye.x,this.eye.y,this.eye.z,this.look.x,this.look.y,this.look.z,this.fov,this.width,this.height,this.dpr];
    const boardKey=state?`${state.score}/${state.lineScore}/${state.hits}/${state.balls}/${state.strikes}/${state.outs}`:'menu';
    const moved=!!this.backgroundView&&view.some((value,index)=>value!==this.backgroundView[index]);
    if(moved){
      // Moving cameras draw directly. Copying a freshly repainted full-size
      // layer every frame would add a needless bitmap resolve during fielding.
      this.paintEnvironment(state);this.backgroundView=view;this.backgroundDirty=true;
      this.stats.backgroundBuilds++;this.stats.backgroundReused=false;return;
    }
    const changed=this.backgroundDirty||!this.backgroundView||boardKey!==this.backgroundBoard;
    this.stats.backgroundReused=!changed;
    if(changed){
      if(!this.backgroundCanvas){this.backgroundCanvas=document.createElement('canvas');this.backgroundContext=this.backgroundCanvas.getContext('2d',{alpha:false});}
      const layer=this.backgroundCanvas;
      if(layer.width!==this.canvas.width||layer.height!==this.canvas.height){layer.width=this.canvas.width;layer.height=this.canvas.height;this.backgroundContext.setTransform(this.dpr,0,0,this.dpr,0,0);}
      const front=this.ctx;
      try{this.ctx=this.backgroundContext;this.paintEnvironment(state);}finally{this.ctx=front;}
      this.backgroundView=view;this.backgroundBoard=boardKey;this.backgroundDirty=false;this.stats.backgroundBuilds++;
    }
    this.ctx.drawImage(this.backgroundCanvas,0,0,this.width,this.height);
  }
  person(actor,state,home,role='fielder',facing=0){
    const c=this.ctx,foot=this.project(actor.x,0,actor.z);if(foot.depth<.15)return;
    const projectedScale=this.focal/Math.max(.2,foot.depth),scale=clamp(projectedScale,0,180);
    // Include the whole animated body/bat, not just the feet, in the cull.
    if(foot.depth>2&&(foot.x+projectedScale*1.8<0||foot.x-projectedScale*1.8>this.width||foot.y+projectedScale*.5<0||foot.y-projectedScale*3.1>this.height))return;
    const moving=!!actor.moving||Math.hypot(actor.x-(actor.prevX??actor.x),actor.z-(actor.prevZ??actor.z))>.001;
    const p=samplePlayerMotion(state,role,{moving,actor,index:actor.number||0});
    const hand=presentationHand(state,role,actor),lefty=hand==='L',throwingHand=lefty?'left':'right',gloveHand=lefty?'right':'left';
    const appearance=playerAppearance(actor),jersey=role==='umpire'?'#38454b':appearance.jersey||(home?'#eee3c8':'#b74a46'),cap=role==='umpire'?'#263239':appearance.cap||(home?'#234c3b':'#233c55'),skin=appearance.skin;
    const rotateX=(v,a)=>vec(v.x,v.y*Math.cos(a)-v.z*Math.sin(a),v.y*Math.sin(a)+v.z*Math.cos(a));
    const rotateY=(v,a)=>vec(v.x*Math.cos(a)+v.z*Math.sin(a),v.y,v.z*Math.cos(a)-v.x*Math.sin(a));
    const rotateZ=(v,a)=>vec(v.x*Math.cos(a)-v.y*Math.sin(a),v.x*Math.sin(a)+v.y*Math.cos(a),v.z);
    const add=(a,b)=>vec(a.x+b.x,a.y+b.y,a.z+b.z);
    const world=v=>{v=rotateY(v,facing);return vec(actor.x-v.x,v.y,actor.z+v.z);};
    const body=v=>world(add(rotateZ(rotateX(vec(v.x*appearance.build,v.y*appearance.height,v.z*appearance.build),p.lean),p.roll||0),vec(p.hipX||0,(.93+p.hipY)*appearance.height,p.hipZ||0)));
    const torso=v=>body(rotateY(v,p.twist));
    const pieces=[],stroke=(a,b,color,width)=>pieces.push({kind:'line',a,b,color,width,depth:(this.cameraPoint(a).z+this.cameraPoint(b).z)/2});
    const poly=(points,color)=>pieces.push({kind:'poly',points,color,depth:points.reduce((v,q)=>v+this.cameraPoint(q).z,0)/points.length});
    const shadowRadius=Math.max(2,scale*(p.slide?.70:.40));c.save();c.translate(foot.x,foot.y);c.scale(1,.32);const shadow=c.createRadialGradient(0,0,0,0,0,shadowRadius);shadow.addColorStop(0,'rgba(10,25,18,.31)');shadow.addColorStop(1,'rgba(10,25,18,0)');c.fillStyle=shadow;c.beginPath();c.arc(0,0,shadowRadius,0,TAU);c.fill();c.restore();
    if((role==='runner'||actor.brawlSide!==undefined)&&(p.slide||moving)){for(let i=0;i<(p.slide?7:3);i++){const age=((state?.time||0)*2.5+i*.29+(actor.number||1)*.37)%1,a=i*2.39996,q=this.project(actor.x+Math.sin(a)*age*(p.slide?.8:.22),.06+Math.sin(age*Math.PI)*.17,actor.z+Math.cos(a)*age*(p.slide?.8:.22)),radius=Math.max(1,scale*(.05+age*.11));c.fillStyle=`rgba(201,165,123,${(1-age)*.19})`;c.beginPath();c.ellipse(q.x,q.y,radius,radius*.55,0,0,TAU);c.fill();}}
    if(appearance.wheelchair){
      // The chair frame is fixed to the ground while the torso can wind up.
      for(const side of[-1,1]){
        const wheel=world(vec(side*.38,.41,.05)),q=this.project(wheel.x,wheel.y,wheel.z);
        c.strokeStyle='#263539';c.lineWidth=Math.max(2,scale*.07);c.beginPath();c.ellipse(q.x,q.y,Math.max(2,scale*.19),Math.max(2,scale*.38),0,0,TAU);c.stroke();
        c.strokeStyle='#a9b7ae';c.lineWidth=Math.max(.7,scale*.018);c.beginPath();c.ellipse(q.x,q.y,Math.max(1,scale*.14),Math.max(1,scale*.29),0,0,TAU);c.stroke();
        this.line(world(vec(side*.29,.65,-.10)),world(vec(side*.29,.95,-.1)),'#7c919a',Math.max(1,scale*.05));
      }
      this.line(world(vec(-.28,.58,0)),world(vec(.28,.58,0)),'#305f8a',Math.max(2,scale*.13));
      this.line(world(vec(-.28,.80,-.20)),world(vec(.28,.80,-.20)),'#305f8a',Math.max(2,scale*.32));
    }
    const hands={};
    for(const side of[-1,1]){
      const name=side<0?'right':'left',hip=vec(side*.125,0,role==='batter'?side*.06*(lefty?-1:1):0);
      const knee=add(hip,rotateX(vec(0,-.43,0),p[name+'Hip'])),ankle=add(knee,rotateX(vec(0,-.40,0),p[name+'Hip']+p[name+'Knee']));
      const toe=add(ankle,rotateX(vec(0,-.055,.16),p[name+'Hip']+p[name+'Knee']));
      stroke(body(hip),body(knee),home?'#ded8c4':'#d1d3cd',.205);
      stroke(body(knee),body(ankle),home?'#ebe3cc':'#e2e2d9',.16);
      stroke(body(ankle),body(toe),'#27332f',.14);
      if(role==='catcher')stroke(body(add(knee,vec(0,-.04,.08))),body(add(ankle,vec(0,.04,.08))),cap,.17);
      const shoulder=vec(side*.255,.46,0),armTransform=v=>rotateX(rotateZ(v,p[name+'Spread']),p[name+'Arm']);
      let elbow=add(shoulder,armTransform(vec(0,-.29,0)));
      let hand=add(elbow,armTransform(rotateX(vec(0,-.285,0),p[name+'Elbow'])));
      if(role==='batter'&&p.batVisible){
        const grip=rotateX(rotateY(rotateZ(vec(0,name===(lefty?'left':'right')?.055:p.batTopGrip,0),p.bat[2]),p.bat[1]),p.bat[0]);
        hand=add(vec(lefty?.015:-.015,p.batHeight,p.batReach),grip);
        const delta=sub(hand,shoulder),distance=clamp(Math.hypot(delta.x,delta.y,delta.z),.04,.572),direction=norm(delta),plane=vec(side,.15,-.25),along=dot(plane,direction),bend=norm(sub(plane,vec(direction.x*along,direction.y*along,direction.z*along))),cos=clamp((.29*.29+distance*distance-.285*.285)/(2*.29*distance),-1,1),sin=Math.sqrt(1-cos*cos);
        elbow=add(shoulder,vec(.29*(direction.x*cos+bend.x*sin),.29*(direction.y*cos+bend.y*sin),.29*(direction.z*cos+bend.z*sin)));
      }
      hands[name]=torso(hand);
      if(name===throwingHand&&role==='pitcher'&&state?.pitch&&state.time-state.pitch.releaseAt>-.065&&state.time-state.pitch.releaseAt<.035)hands[name]={...state.pitch.start};
      if(name===throwingHand&&actor.id===state?.play?.fielder&&state?.play?.stage==='throw'&&state.play.throw?.kind!=='carry'&&state.time-(state.play.throw.startedAt??state.time)<.05)hands[name]={...state.play.throw.from};
      const sleeve=vec(mix(shoulder.x,elbow.x,.17/.29),mix(shoulder.y,elbow.y,.17/.29),mix(shoulder.z,elbow.z,.17/.29));
      stroke(torso(shoulder),torso(sleeve),jersey,.17);stroke(torso(sleeve),torso(elbow),skin,.12);stroke(torso(elbow),hands[name],skin,.11);
      if(role==='batter'||role==='runner')stroke(torso(add(hand,vec(0,.03,0))),torso(hand),'#eeeadd',.12);
    }
    const frontDepth=this.cameraPoint(torso(vec(0,.3,.18))).z,backDepth=this.cameraPoint(torso(vec(0,.3,-.18))).z,faceFront=frontDepth<backDepth,faceZ=faceFront?.17:-.17;
    const rings=[[.065,.205],[.30,.234],[.49,.25],[.55,.14]];
    const ringPoints=rings.map(([y,r])=>Array.from({length:10},(_,j)=>{const a=j/10*TAU;return torso(vec(Math.cos(a)*r,y,Math.sin(a)*r*.68));}));
    for(let row=0;row<rings.length-1;row++)for(let j=0;j<10;j++){
      const a=j/10*TAU,b=(j+1)/10*TAU,next=(j+1)%10,light=.79+.21*Math.cos((a+b)/2+.7);
      poly([ringPoints[row][j],ringPoints[row][next],ringPoints[row+1][next],ringPoints[row+1][j]],shade(jersey,light));
    }
    stroke(body(vec(-.19,.07,.15)),body(vec(.19,.07,.15)),cap,.045);
    pieces.sort((a,b)=>b.depth-a.depth);
    for(const item of pieces)if(item.kind==='poly')this.drawPolygon(item.points,item.color);else{this.line(item.a,item.b,'rgba(21,32,28,.32)',Math.max(1,item.width*scale+1.0));this.line(item.a,item.b,item.color,Math.max(1,item.width*scale));if(scale>16&&item.width>.10){this.line(item.a,item.b,shade(item.color,1.07),Math.max(.8,item.width*scale*.48));}}
    const label=this.project(...Object.values(torso(vec(0,.31,faceZ*1.08))));
    if(scale>22&&role!=='catcher'&&role!=='umpire'){
      c.textAlign='center';c.fillStyle=appearance.trim||(home?'#244939':'#f3e7cc');c.font=`bold ${Math.max(4,scale*.075)}px Georgia`;c.fillText(String(actor.playerId||actor.id||'').startsWith('backyard-')?'BACKYARD':String(actor.playerId||actor.id||'').startsWith('harbor-')?'HARBOR':String(actor.playerId||actor.id||'').startsWith('foundry-')?'FOUNDRY':home?'FOUNDRY':'HARBOR',label.x,label.y-scale*.075);
      c.font=`bold ${Math.max(5,scale*.18)}px Arial`;c.fillText(String(actor.number||1),label.x,label.y+scale*.11);
      if(faceFront){const button=this.project(...Object.values(torso(vec(.018,.47,faceZ*1.08))));c.fillStyle=home?'#b0a98e':'#eadcc2';c.fillRect(button.x,button.y,Math.max(1,scale*.014),Math.max(1,scale*.014));}
    }
    if(role==='catcher'&&faceFront)for(let i=0;i<5;i++)stroke(torso(vec(-.16,.15+i*.07,.20)),torso(vec(.16,.15+i*.07,.20)),i%2?cap:'#3d5948',.045);
    // Catcher's padded ribs are in front of the jersey.
    if(role==='catcher'&&faceFront)for(let i=pieces.length-5;i<pieces.length;i++){const a=pieces[i];if(a?.kind==='line')this.line(a.a,a.b,a.color,Math.max(1,a.width*scale));}
    if(role==='catcher'&&!faceFront)for(const side of[-1,1])this.line(torso(vec(side*.16,.49,-.18)),torso(vec(-side*.16,.12,-.18)),cap,Math.max(1,scale*.035));
    const headPoint=torso(vec(0,.76,.015)),head=this.project(headPoint.x,headPoint.y,headPoint.z);
    if(head.visible){
      const face=c.createRadialGradient(head.x-.045*scale,head.y-.04*scale,.015*scale,head.x,head.y,.18*scale);face.addColorStop(0,shade(skin,1.12));face.addColorStop(1,shade(skin,.79));c.fillStyle=face;c.beginPath();c.ellipse(head.x,head.y,Math.max(1,.125*scale),Math.max(1,.159*scale),0,0,TAU);c.fill();
      const nose=torso(vec(0,.742,.155)),n=this.project(nose.x,nose.y,nose.z);
      if(faceFront&&scale>15){c.fillStyle=skin;c.beginPath();c.ellipse(n.x,n.y,.028*scale,.042*scale,0,0,TAU);c.fill();for(const side of[-1,1]){const eye=torso(vec(side*.053,.79,.13)),q=this.project(eye.x,eye.y,eye.z);c.fillStyle='#352b25';c.fillRect(q.x-.011*scale,q.y,.022*scale,Math.max(1,.012*scale));}const mouth=torso(vec(0,.68,.13)),q=this.project(mouth.x,mouth.y,mouth.z);c.fillStyle='#674634';c.fillRect(q.x-.024*scale,q.y,.048*scale,Math.max(1,.009*scale));}
      const headwear=!appearance.noCap||role==='catcher',cover=headwear?cap:appearance.hair;
      const helmet=c.createLinearGradient(head.x-.15*scale,head.y-.20*scale,head.x+.15*scale,head.y);helmet.addColorStop(0,shade(cover,1.38));helmet.addColorStop(.45,cover);helmet.addColorStop(1,shade(cover,.68));c.fillStyle=helmet;c.beginPath();c.ellipse(head.x,head.y-.115*scale,Math.max(1,.15*scale),Math.max(1,.083*scale),0,0,TAU);c.fill();if(scale>20){c.strokeStyle='rgba(231,233,212,.19)';c.lineWidth=Math.max(.7,scale*.008);c.beginPath();c.ellipse(head.x-.03*scale,head.y-.143*scale,.10*scale,.035*scale,-.25,Math.PI,TAU);c.stroke();}
      if(headwear)this.line(torso(vec(-.115,.87,.20)),torso(vec(.115,.87,.20)),appearance.capTrim||cap,Math.max(1,scale*.035));
      if(headwear&&(role==='batter'||role==='runner'||role==='catcher')){c.fillStyle=cap;c.fillRect(head.x+(role==='batter'&&lefty?.105:-.15)*scale,head.y-.07*scale,.045*scale,.15*scale);}
      if(appearance.hairStyle==='curly'||appearance.hairBuns){
        c.fillStyle=appearance.hair;
        for(let i=0;i<(appearance.hairBuns?2:7);i++){const a=appearance.hairBuns?i*Math.PI:i/7*TAU;c.beginPath();c.arc(head.x+Math.cos(a)*scale*.12,head.y-.08*scale+Math.sin(a)*scale*.065,Math.max(1,scale*(appearance.hairBuns?.08:.055)),0,TAU);c.fill();}
      }
      if(appearance.hairStyle==='long'||appearance.hairStyle==='braids')for(const side of[-1,1])this.line(torso(vec(side*.12,.74,-.06)),torso(vec(side*.12,.52,-.06)),appearance.hair,Math.max(1,scale*.065));
      if(appearance.pompadour){c.fillStyle=appearance.hair;c.beginPath();c.ellipse(head.x,head.y-.16*scale,.14*scale,.07*scale,0,0,TAU);c.fill();}
      if(appearance.accessory==='headphones'){
        for(const side of[-1,1]){c.fillStyle='#b73b32';c.beginPath();c.ellipse(head.x+side*.15*scale,head.y,.045*scale,.09*scale,0,0,TAU);c.fill();}
        c.strokeStyle='#b73b32';c.lineWidth=Math.max(1,scale*.03);c.beginPath();c.arc(head.x,head.y-.025*scale,.17*scale,Math.PI,TAU);c.stroke();
      }
      if(appearance.glasses&&faceFront){c.strokeStyle='#263238';c.lineWidth=Math.max(.8,scale*.014);for(const side of[-1,1])c.strokeRect(head.x+side*.057*scale-.035*scale,head.y-.025*scale,.07*scale,.043*scale);this.line(torso(vec(-.02,.79,.14)),torso(vec(.02,.79,.14)),'#263238',Math.max(.8,scale*.014));}
      if(appearance.freckles&&faceFront&&scale>22){c.fillStyle='#a56f49';for(const side of[-1,1])for(let i=0;i<3;i++)c.fillRect(head.x+side*(.05+i*.016)*scale,head.y+.01*scale+(i%2)*.012*scale,Math.max(.6,scale*.009),Math.max(.6,scale*.009));}
      if(role==='catcher'&&faceFront){for(const y of[.66,.73,.80,.87])this.line(torso(vec(-.12,y,.18)),torso(vec(.12,y,.18)),'#b8b9a8',Math.max(.7,scale*.012));for(const x of[-.11,.11])this.line(torso(vec(x,.65,.18)),torso(vec(x,.88,.18)),'#b8b9a8',Math.max(.7,scale*.012));}
    }
    if(role!=='batter'&&role!=='runner'&&role!=='umpire'){
      const glove=hands[gloveHand],q=this.project(glove.x,glove.y,glove.z);c.fillStyle='#926137';c.beginPath();c.ellipse(q.x,q.y,Math.max(1,.13*scale),Math.max(1,.16*scale),-.2,0,TAU);c.fill();c.strokeStyle='#d4aa70';c.lineWidth=Math.max(.6,.012*scale);c.beginPath();c.arc(q.x,q.y,Math.max(1,.09*scale),-.4,2.4);c.stroke();if(scale>15){c.strokeStyle='#5d3d25';c.lineWidth=Math.max(.5,scale*.010);for(let i=0;i<3;i++){c.beginPath();c.moveTo(q.x+(i-1)*scale*.047,q.y-.10*scale);c.lineTo(q.x+(i-1)*scale*.045,q.y+.045*scale);c.stroke();}}
    }
    if(role==='batter'&&p.batVisible){
      const pivot=vec(lefty?.015:-.015,p.batHeight,p.batReach),batVector=rotateX(rotateY(rotateZ(vec(0,.94,0),p.bat[2]),p.bat[1]),p.bat[0]);
      this.line(torso(pivot),torso(add(pivot,batVector)),'#4c4030',Math.max(2,scale*.055));this.line(torso(add(pivot,vec(0,.08,0))),torso(add(pivot,batVector)),'#d6b382',Math.max(1.6,scale*.045));
    }
    if(role==='pitcher'&&['ready','windup'].includes(state?.phase)&&!state?.ball?.visible){const holding=hands[throwingHand],q=this.project(holding.x,holding.y,holding.z);if(q.visible){c.fillStyle='#fff3d9';c.beginPath();c.arc(q.x,q.y,Math.max(1.2,.041*scale),0,TAU);c.fill();}}
    return {...hands,throwingHand,gloveHand};
  }

  render(state,dt=1/60,options={}){
    this.setPark(state?.options?.park??options.park??this.parkId);
    // Resize is driven by viewport/fullscreen/orientation changes. Reading
    // clientWidth here after the HUD writes would force a browser layout per frame.
    if((globalThis.devicePixelRatio||1)!==this.deviceDpr)this.resize();
    dt=clamp(dt||0,0,.1);this.time+=dt;
    const menu=!!options.menu||!state,phase=state?.phase||'ready',fielding=!menu&&(phase==='live'||(phase==='result'&&state?.play));
    const ball=state?.ball,portrait=this.width<this.height,brawl=!menu&&presentationBrawl(state);
    let eye,look;
    if(menu){const a=.50+Math.sin(this.time*.035)*.12;eye=vec(Math.sin(a)*94,42,-Math.cos(a)*44);look=vec(-4,2,40);}
    else if(brawl){const shot=brawlCamera(state,portrait);eye=vec(shot.eye.x,shot.eye.y,shot.eye.z);look=vec(shot.look.x,shot.look.y,shot.look.z);}
    else if(fielding){eye=vec(-(ball?.x||0)*.24,25+clamp((ball?.y||0)*.25,0,13),-18+clamp((ball?.z||0)*.18,0,20));look=vec(-(ball?.x||0)*.65,Math.max(2,(ball?.y||0)*.38),Math.max(27,(ball?.z||0)*.68));}
    else{eye=vec(0,portrait?3.5:2.9,portrait?-7.6:-6.8);look=vec(0,1.6,16);}
    const ease=this.wasMenu&&!menu?1:1-Math.exp(-dt*(menu?1.5:fielding?5.5:7));
    for(const k of['x','y','z']){this.eye[k]=ease===1||Math.abs(this.eye[k]-eye[k])<.00005?eye[k]:mix(this.eye[k],eye[k],ease);this.look[k]=ease===1||Math.abs(this.look[k]-look[k])<.00005?look[k]:mix(this.look[k],look[k],ease);}
    const targetFov=menu?52:brawl?brawlCamera(state,portrait).fov:fielding?(portrait?71:58):(portrait?61:51);
    this.fov=ease===1||Math.abs(this.fov-targetFov)<.00005?targetFov:mix(this.fov,targetFov,ease);this.wasMenu=menu;this.cameraBasis();
    this.drawEnvironment(state);
    const c=this.ctx;
    const fallback=[{id:'P',x:0,z:18.44},{id:'1B',x:19,z:22},{id:'2B',x:12,z:34},{id:'SS',x:-12,z:34},{id:'3B',x:-22,z:19},{id:'LF',x:-43,z:66},{id:'CF',x:0,z:79},{id:'RF',x:43,z:66}];
    const homeDefense=!state||state.battingSide===0,people=(state?.fielders||fallback).filter(p=>p.id!=='C'||fielding).map(p=>({...p,...(p.id==='P'?(brawl?brawl.fighters[1]:getPitcher(state)):{}),id:p.id,home:homeDefense,role:p.id==='P'?'pitcher':p.id==='C'?'catcher':'fielder'}));
    for(const r of state?.runners||[])if(!r.out&&!r.scored&&(!brawl||r.playerId!==state.brawl.batter.id))people.push({...r,home:!homeDefense,role:'runner'});
    if(brawl){
      people.push({...brawl.fighters[0],home:!homeDefense,role:'batter'});
      people.push({x:mix(0,1.65-brawl.separate*.55,brawl.charge),z:mix(-2.1,17.1,brawl.charge),number:state.fielders?.find(p=>p.id==='C')?.number||2,home:homeDefense,role:'catcher',displayFacing:.35,moving:brawl.stage==='charge'});
      people.push({x:-.35,z:mix(-2.75,19.4-brawl.separate*1.3,brawl.charge),number:0,home:true,role:'umpire',displayFacing:Math.PI,moving:brawl.stage==='charge'});
    }
    people.sort((a,b)=>this.cameraPoint(vec(b.x,0,b.z)).z-this.cameraPoint(vec(a.x,0,a.z)).z);
    let heldHands=null;
    for(const p of people){
      const dx=-(p.x-(p.prevX??p.x)),dz=p.z-(p.prevZ??p.z),moving=Math.hypot(dx,dz)>.001;
      let facing=moving?Math.atan2(dx,dz):Math.atan2(p.x,-p.z);
      if(p.role==='pitcher'&&!fielding)facing=Math.PI;
      if(brawl)facing=p.displayFacing??Math.atan2(p.x,18.1-p.z);
      if(p.role==='runner'&&!moving){const target=BASES[p.targetBase??Math.min(4,(p.fromBase||0)+1)]||BASES[1];facing=Math.atan2(p.x-target.x,target.z-p.z);}
      if(p.id!=null&&p.id===state?.play?.fielder&&['held','throw'].includes(state.play.stage)){const target=state.play.throw?.to||BASES[state.play.throwBase??state.play.queuedBase??1]||BASES[1];facing=Math.atan2(p.x-target.x,target.z-p.z);}
      const hands=this.person(p,state,p.home,p.role,facing);
      if(p.id!=null&&p.id===state?.play?.fielder)heldHands=hands;
      if(p.id===options.selectedRunnerId&&p.role==='runner'&&!menu&&!brawl){const q=this.project(p.x,.04,p.z);if(q.visible){c.strokeStyle='#8bdbdf';c.lineWidth=2;c.beginPath();c.ellipse(q.x,q.y,Math.max(4,this.focal/q.depth*.48),Math.max(2,this.focal/q.depth*.16),0,0,TAU);c.stroke();}}
    }
    if(!fielding&&!brawl){
      const batter=presentationBatter(state),lefty=batter.hand==='L';
      this.person({...batter,x:lefty?1.02:-1.02,z:-.04},state,!homeDefense,'batter',(lefty?1:-1)*Math.PI/2);
      if(!menu)this.person({...state?.fielders?.find(p=>p.id==='C'),x:0,z:-2.1,number:state?.fielders?.find(p=>p.id==='C')?.number||2},state,homeDefense,'catcher',0);
    }

    if(ball?.visible&&!menu&&!brawl){
      const alpha=clamp(options.interpolationAlpha??1,0,1);let p=vec(mix(ball.prevX??ball.x,ball.x,alpha),mix(ball.prevY??ball.y,ball.y,alpha),mix(ball.prevZ??ball.z,ball.z,alpha));
      if(state?.play?.stage==='held'&&heldHands)p=heldHands[state.time-(state.play.heldAt??state.time)<.14?heldHands.gloveHand:heldHands.throwingHand];
      if(this.lastTick!==state.tick&&['pitch','live'].includes(phase)){this.trail.unshift(p);this.trail.length=Math.min(10,this.trail.length);}this.lastTick=state.tick;
      for(let i=1;i<this.trail.length;i++)this.line(this.trail[i-1],this.trail[i],`rgba(255,239,189,${.28*(1-i/this.trail.length)})`,1.4);
      const shadow=this.project(p.x,.04,p.z);if(shadow.visible){c.fillStyle='rgba(15,35,22,.37)';c.beginPath();c.ellipse(shadow.x,shadow.y,Math.max(2,this.focal/shadow.depth*.17),1.3,0,0,TAU);c.fill();}
      const q=this.project(p.x,p.y,p.z);if(q.visible){const radius=clamp(this.focal/q.depth*(fielding?.20:.10),2,10);c.fillStyle='#fff9e7';c.shadowColor='rgba(255,241,184,.5)';c.shadowBlur=5;c.beginPath();c.arc(q.x,q.y,radius,0,TAU);c.fill();c.shadowBlur=0;c.strokeStyle='#ba5748';c.lineWidth=.6;c.beginPath();c.arc(q.x-radius*.2,q.y,radius*.6,-1.4,1.4);c.stroke();}
    }
    if(!['pitch','live'].includes(phase))this.trail=[];
    if(!menu&&!brawl&&!fielding&&!['half','final'].includes(phase)){
      const z=STRIKE_ZONE;
      if(options.guidance!=='expert'){
        for(const [x,sx]of[[z.left,1],[z.right,-1]])for(const[y,sy]of[[z.bottom,1],[z.top,-1]]){this.line(vec(x,y,-.025),vec(x+sx*.095,y,-.025),'rgba(255,243,214,.80)',1.6);this.line(vec(x,y,-.025),vec(x,y+sy*.13,-.025),'rgba(255,243,214,.80)',1.6);}
        for(const f of[1/3,2/3]){const x=z.left+(z.right-z.left)*f,y=z.bottom+(z.top-z.bottom)*f;this.line(vec(x,z.bottom,-.025),vec(x,z.top,-.025),'rgba(255,240,204,.20)',.7);this.line(vec(z.left,y,-.025),vec(z.right,y,-.025),'rgba(255,240,204,.20)',.7);}
      }
      if(phase!=='result'){const aim=options.aim||{},area=options.batting===false?PITCH_AIM_AREA:AIM_AREA,q=this.project((aim.x||0)*area.x,area.centerY+(aim.y||0)*area.y,-.04);if(q.visible){const radius=Math.max(5,this.focal/q.depth*.082);c.strokeStyle='#f4d486';c.lineWidth=1.5;c.beginPath();c.arc(q.x,q.y,radius,0,TAU);c.stroke();for(const[a,b]of[[[-radius-4,0],[-radius-1,0]],[[radius+1,0],[radius+4,0]],[[0,-radius-4],[0,-radius-1]],[[0,radius+1],[0,radius+4]]]){c.beginPath();c.moveTo(q.x+a[0],q.y+a[1]);c.lineTo(q.x+b[0],q.y+b[1]);c.stroke();}}}
    }
    // Review only after resolution: never reveal the active pitch's endpoint.
    if(!menu&&phase==='result'&&state?.pitch?.resolved&&!state.pitch.hitByPitch&&options.guidance!=='expert'){
      const target=state.pitch.target,q=this.project(target.x,target.y,-.04);
      if(q.visible){c.strokeStyle=inStrikeZone(target)?'#efbf77':'#88d0d7';c.lineWidth=1.8;c.beginPath();c.arc(q.x,q.y,clamp(this.focal/q.depth*.053,3,7),0,TAU);c.stroke();}
    }
    const impact=state?.pitch?.hitByPitch,impactAge=impact?state.time-impact.at:-1;
    if(!menu&&!brawl&&!state?.swing&&impactAge>=0&&impactAge<.22){const q=this.project(impact.point.x,impact.point.y,impact.point.z);if(q.visible){c.strokeStyle=`rgba(240,205,139,${.75*(1-impactAge/.22)})`;c.lineWidth=1.4;c.beginPath();c.arc(q.x,q.y,Math.max(4,this.focal/q.depth*(.06+impactAge*.4)),0,TAU);c.stroke();}}

    if(brawl){
      const struck=brawl.fighters.find(actor=>{const hit=state.brawl.fighters[actor.brawlSide]?.hitAt;return hit!=null&&state.time-hit>=0&&state.time-hit<.18;});
      if(struck){const age=state.time-state.brawl.fighters[struck.brawlSide].hitAt,q=this.project(struck.x,1.25,struck.z);if(q.visible){c.strokeStyle=`rgba(240,205,139,${.65*(1-age/.18)})`;c.lineWidth=1.5;c.beginPath();c.arc(q.x,q.y,Math.max(4,this.focal/q.depth*(.055+age*.48)),0,TAU);c.stroke();}}
    }
    this.stats.drawCalls=this.stats.backgroundReused?1:this.sortedPolygons.length;this.stats.triangles=this.stats.backgroundReused?2:this.sortedPolygons.length*2;
  }
  dispose(){this.backgroundCanvas=null;this.backgroundContext=null;this.backgroundView=null;this.groundPolygons=[];this.sortedPolygons=[];this.static=[];this.crowd=[];this.trail=[];this.parkLines=[];this.wallSurfaces=[];this.wallLabels=[];this.boardCanvas=null;}
}
