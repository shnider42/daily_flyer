import { BASES, STRIKE_ZONE, AIM_AREA, fieldRadius, FENCE_HEIGHT, inStrikeZone } from './engine.mjs?v=0.3.1';
import { samplePlayerMotion } from './renderer.mjs?v=0.3.1';

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
const shade = (hex,light) => { const n=parseInt(hex.slice(1),16);return `rgb(${Math.round(clamp(((n>>16)&255)*light,0,255))},${Math.round(clamp(((n>>8)&255)*light,0,255))},${Math.round(clamp((n&255)*light,0,255))})`; };

export class CompatibilityRenderer {
  constructor(canvas,{onContextLost}={}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('Canvas graphics are unavailable.');
    this.width=this.height=0;this.quality='auto';this.time=0;this.wasMenu=true;
    this.eye=vec(46,42,-42);this.look=vec(-4,2,40);this.fov=52;
    this.static=[];this.trail=[];this.lastTick=-1;this.crowd=[];this.frameAverage=1/60;
    this.stats={renderer:'software',drawCalls:0,triangles:0,pixelRatio:1};
    this.buildPark();this.resize();this.cameraBasis();
  }
  setQuality(quality){this.quality=quality;this.resize();}
  resize(){
    const w=Math.max(1,this.canvas.clientWidth||globalThis.innerWidth||800),h=Math.max(1,this.canvas.clientHeight||globalThis.innerHeight||600);
    const ratio=Math.min(globalThis.devicePixelRatio||1,this.quality==='low'?.8:this.quality==='high'?1.5:1.15);
    if(w!==this.width||h!==this.height||ratio!==this.dpr){this.width=w;this.height=h;this.dpr=ratio;this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);this.ctx.setTransform(ratio,0,0,ratio,0,0);}
    this.stats.pixelRatio=ratio;
  }
  cameraBasis(){
    this.forward=norm(sub(this.look,this.eye));this.right=norm(cross(this.forward,vec(0,1,0)));this.up=cross(this.right,this.forward);
    this.focal=this.height/(2*Math.tan(this.fov*Math.PI/360));
  }
  cameraPoint(p){const d=sub(vec(-p.x,p.y,p.z),this.eye);return vec(dot(d,this.right),dot(d,this.up),dot(d,this.forward));}
  screen(p){return{x:this.width/2+p.x*this.focal/p.z,y:this.height/2-p.y*this.focal/p.z,depth:p.z};}
  project(x,y,z){const p=this.cameraPoint(vec(x,y,z)),q=this.screen(p);return {...q,visible:p.z>.15&&q.x>-30&&q.x<this.width+30&&q.y>-30&&q.y<this.height+30};}
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
    for(let z=-130;z<220;z+=12)this.ground([[-180,z],[180,z],[180,z+12],[-180,z+12]],Math.round(z/12)%2?'#376d45':'#407a4c',-.03);
    const outside=[],inside=[];
    for(let i=0;i<=60;i++){const a=-Math.PI/4+i/60*Math.PI/2,r=fieldRadius(a);outside.push([Math.sin(a)*r,Math.cos(a)*r]);inside.unshift([Math.sin(a)*(r-4.2),Math.cos(a)*(r-4.2)]);}
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
      this.ground([[sign*.17,-.17],[sign*81,81],[sign*81.10,80.90],[sign*.27,-.27]],'#f2e5c7',.045);
      const x=sign*1.0;for(const[[a,b],[d,e]]of[[[x-.48,-.7],[x+.48,-.7]],[[x+.48,-.7],[x+.48,1.1]],[[x+.48,1.1],[x-.48,1.1]],[[x-.48,1.1],[x-.48,-.7]]])line(vec(a,.03,b),vec(d,.03,e),'#e2caa5',.9);
      this.disc(sign*8,-7,1.5,'#8b7053');this.disc(sign*8,-7,1.4,'#a88662',.025);
      this.box(sign*29,0,12,14,2,1,'#294c3f','#1a382e');this.box(sign*29,2.0,11,15,.22,3,'#1c3d34','#152e2b');
      this.box(sign*29,.4,10.8,13.5,.18,.65,'#8c7552','#645a41');
      for(const dx of[-6.8,6.8])this.box(sign*29+dx,0,9.6,.15,2.1,.15,'#7b8a77');
      this.box(sign*29,.85,9.6,14,.08,.08,'#89947d');
      this.box(sign*29+5,.5,10.2,.6,.6,.6,'#c16b3e','#945438');this.box(sign*29+5,1.1,10.2,.66,.05,.65,'#e5d8b8');
    }
    for(let i=0;i<48;i++){
      const a=-Math.PI/4+i/48*Math.PI/2,b=a+Math.PI/96,r=fieldRadius(a),s=fieldRadius(b);
      this.polygon([vec(Math.sin(a)*r,0,Math.cos(a)*r),vec(Math.sin(b)*s,0,Math.cos(b)*s),vec(Math.sin(b)*s,FENCE_HEIGHT,Math.cos(b)*s),vec(Math.sin(a)*r,FENCE_HEIGHT,Math.cos(a)*r)],i%2?'#1f4b39':'#24553e');
      line(vec(Math.sin(a)*r,3.24,Math.cos(a)*r),vec(Math.sin(b)*s,3.24,Math.cos(b)*s),'#c5a664',1.5);
    }
    const standRadius=a=>Math.abs(a)<=Math.PI/4?fieldRadius(a)+5:mix(110,36,clamp((Math.abs(a)-Math.PI/4)/(Math.PI*.53),0,1));
    for(let j=0;j<64;j++){
      const a=-Math.PI+j/64*TAU,b=a+TAU/64,mid=(a+b)/2;
      for(let row=0;row<8;row++){
        const r=standRadius(a)+row*1.7,s=standRadius(b)+row*1.7,y=1.7+row*.8;
        this.polygon([vec(Math.sin(a)*r,y,Math.cos(a)*r),vec(Math.sin(b)*s,y,Math.cos(b)*s),vec(Math.sin(b)*(s+1.7),y,Math.cos(b)*(s+1.7)),vec(Math.sin(a)*(r+1.7),y,Math.cos(a)*(r+1.7))],row%2?'#42584f':'#354d43');
        this.polygon([vec(Math.sin(a)*r,y-.7,Math.cos(a)*r),vec(Math.sin(b)*s,y-.7,Math.cos(b)*s),vec(Math.sin(b)*s,y,Math.cos(b)*s),vec(Math.sin(a)*r,y,Math.cos(a)*r)],'#2b443b');
        for(let k=0;k<3;k++){const angle=mix(a,b,(k+.5)/3),radius=standRadius(angle)+row*1.7+.6;this.crowd.push({x:Math.sin(angle)*radius,y:y+.45,z:Math.cos(angle)*radius,color:['#c5b697','#657f8b','#a14c41','#bdb398','#31485c'][(j+row+k)%5],skin:['#cfa57e','#ad815e','#987051'][(j+k)%3]});}
      }
      if(Math.abs(mid)>Math.PI/4){
        const r=standRadius(mid)-1;
        this.polygon([vec(Math.sin(a)*r,0,Math.cos(a)*r),vec(Math.sin(b)*r,0,Math.cos(b)*r),vec(Math.sin(b)*r,1.55,Math.cos(b)*r),vec(Math.sin(a)*r,1.55,Math.cos(a)*r)],j%3?'#795340':'#855b45');
        line(vec(Math.sin(a)*r,1.56,Math.cos(a)*r),vec(Math.sin(b)*r,1.56,Math.cos(b)*r),'#b4ab90',2);
        if(j%4===0)this.box(Math.sin(mid)*(r+5),3,Math.cos(mid)*(r+5),2.3,3,1,'#122e28','#102821');
        if(Math.abs(mid)>1.8){const q=standRadius(mid)+8;this.polygon([vec(Math.sin(a)*(q-6),11.7,Math.cos(a)*(q-6)),vec(Math.sin(b)*(q-6),11.7,Math.cos(b)*(q-6)),vec(Math.sin(b)*(q+6),11.7,Math.cos(b)*(q+6)),vec(Math.sin(a)*(q+6),11.7,Math.cos(a)*(q+6))],'#294640');if(j%3===0)this.box(Math.sin(mid)*(q-6),1.7,Math.cos(mid)*(q-6),.2,10,.2,'#7b8b79');}
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
    for(const sign of[-1,1]){const a=sign*Math.PI/4,r=fieldRadius(a);this.box(Math.sin(a)*r,0,Math.cos(a)*r,.20,16,.20,'#dfbb60');}
    this.box(0,.6,117,25,8.2,.8,'#142d29','#112821');
    this.box(0,4,123,30,14,1.3,'#193a32','#122d28');this.box(0,18.1,123,31,.4,1.8,'#d1b979');
    for(const x of[-16,16])this.box(x,0,123,.7,18,.7,'#465b4b');
    for(const x of[-23,0,23]){this.box(x,13,139,.13,15,.13,'#9eaa9b');this.polygon([vec(x,25,139),vec(x+3.5,24.9,139),vec(x+3.5,26.6,139),vec(x,26.7,139)],x<0?'#a94a42':x>0?'#375a76':'#e0d2ab');}
    for(let x=-17;x<=17;x+=2)line(vec(x,1.5,-16.5),vec(x,7.8,-16.5),'rgba(171,187,168,.23)',.7);
    for(let y=1.5;y<=7.8;y+=.9)line(vec(-17,y,-16.5),vec(17,y,-16.5),'rgba(171,187,168,.23)',.7);
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
  person(actor,state,home,role='fielder',facing=0){
    const c=this.ctx,foot=this.project(actor.x,0,actor.z);if(!foot.visible&&foot.depth<.15)return;
    const moving=Math.hypot(actor.x-(actor.prevX??actor.x),actor.z-(actor.prevZ??actor.z))>.001;
    const p=samplePlayerMotion(state,role,{moving,actor,index:actor.number||0});
    const scale=clamp(this.focal/Math.max(.2,foot.depth),0,180),jersey=home?'#eee3c8':'#b74a46',cap=home?'#234c3b':'#233c55',skin=['#c59167','#9e704c','#d4a47b','#b58057'][(actor.number||0)%4];
    const rotateX=(v,a)=>vec(v.x,v.y*Math.cos(a)-v.z*Math.sin(a),v.y*Math.sin(a)+v.z*Math.cos(a));
    const rotateY=(v,a)=>vec(v.x*Math.cos(a)+v.z*Math.sin(a),v.y,v.z*Math.cos(a)-v.x*Math.sin(a));
    const rotateZ=(v,a)=>vec(v.x*Math.cos(a)-v.y*Math.sin(a),v.x*Math.sin(a)+v.y*Math.cos(a),v.z);
    const add=(a,b)=>vec(a.x+b.x,a.y+b.y,a.z+b.z);
    const world=v=>{v=rotateY(v,facing);return vec(actor.x-v.x,v.y,actor.z+v.z);};
    const body=v=>world(add(rotateZ(rotateX(v,p.lean),p.roll||0),vec(p.hipX||0,.93+p.hipY,p.hipZ||0)));
    const torso=v=>body(rotateY(v,p.twist));
    const pieces=[],stroke=(a,b,color,width)=>pieces.push({kind:'line',a,b,color,width,depth:(this.cameraPoint(a).z+this.cameraPoint(b).z)/2});
    const poly=(points,color)=>pieces.push({kind:'poly',points,color,depth:points.reduce((v,q)=>v+this.cameraPoint(q).z,0)/points.length});
    const shadowRadius=Math.max(2,scale*(p.slide?.70:.40));c.save();c.translate(foot.x,foot.y);c.scale(1,.32);const shadow=c.createRadialGradient(0,0,0,0,0,shadowRadius);shadow.addColorStop(0,'rgba(10,25,18,.31)');shadow.addColorStop(1,'rgba(10,25,18,0)');c.fillStyle=shadow;c.beginPath();c.arc(0,0,shadowRadius,0,TAU);c.fill();c.restore();
    if(role==='runner'&&(p.slide||moving)){for(let i=0;i<(p.slide?7:3);i++){const age=((state?.time||0)*2.5+i*.29+(actor.number||1)*.37)%1,a=i*2.39996,q=this.project(actor.x+Math.sin(a)*age*(p.slide?.8:.22),.06+Math.sin(age*Math.PI)*.17,actor.z+Math.cos(a)*age*(p.slide?.8:.22)),radius=Math.max(1,scale*(.05+age*.11));c.fillStyle=`rgba(201,165,123,${(1-age)*.19})`;c.beginPath();c.ellipse(q.x,q.y,radius,radius*.55,0,0,TAU);c.fill();}}
    const hands={};
    for(const side of[-1,1]){
      const name=side<0?'right':'left',hip=vec(side*.125,0,role==='batter'?side*.06:0);
      const knee=add(hip,rotateX(vec(0,-.43,0),p[name+'Hip'])),ankle=add(knee,rotateX(vec(0,-.40,0),p[name+'Hip']+p[name+'Knee']));
      const toe=add(ankle,rotateX(vec(0,-.055,.16),p[name+'Hip']+p[name+'Knee']));
      stroke(body(hip),body(knee),home?'#ded8c4':'#d1d3cd',.205);
      stroke(body(knee),body(ankle),home?'#ebe3cc':'#e2e2d9',.16);
      stroke(body(ankle),body(toe),'#27332f',.14);
      if(role==='catcher')stroke(body(add(knee,vec(0,-.04,.08))),body(add(ankle,vec(0,.04,.08))),cap,.17);
      const shoulder=vec(side*.255,.46,0),armTransform=v=>rotateX(rotateZ(v,p[name+'Spread']),p[name+'Arm']);
      let elbow=add(shoulder,armTransform(vec(0,-.29,0)));
      let hand=add(elbow,armTransform(rotateX(vec(0,-.285,0),p[name+'Elbow'])));
      if(role==='batter'){
        const grip=rotateX(rotateY(rotateZ(vec(0,name==='right'?.055:.145,0),p.bat[2]),p.bat[1]),p.bat[0]);
        hand=add(vec(-.015,.42,.27),grip);
        const delta=sub(hand,shoulder),distance=clamp(Math.hypot(delta.x,delta.y,delta.z),.04,.572),direction=norm(delta),plane=vec(side,.15,-.25),along=dot(plane,direction),bend=norm(sub(plane,vec(direction.x*along,direction.y*along,direction.z*along))),cos=clamp((.29*.29+distance*distance-.285*.285)/(2*.29*distance),-1,1),sin=Math.sqrt(1-cos*cos);
        elbow=add(shoulder,vec(.29*(direction.x*cos+bend.x*sin),.29*(direction.y*cos+bend.y*sin),.29*(direction.z*cos+bend.z*sin)));
      }
      hands[name]=torso(hand);
      if(name==='right'&&role==='pitcher'&&state?.pitch&&state.time-state.pitch.releaseAt>-.065&&state.time-state.pitch.releaseAt<.035)hands[name]={...state.pitch.start};
      if(name==='right'&&actor.id===state?.play?.fielder&&state?.play?.stage==='throw'&&state.play.throw?.kind!=='carry'&&state.time-(state.play.throw.startedAt??state.time)<.05)hands[name]={...state.play.throw.from};
      const sleeve=vec(mix(shoulder.x,elbow.x,.17/.29),mix(shoulder.y,elbow.y,.17/.29),mix(shoulder.z,elbow.z,.17/.29));
      stroke(torso(shoulder),torso(sleeve),jersey,.17);stroke(torso(sleeve),torso(elbow),skin,.12);stroke(torso(elbow),hands[name],skin,.11);
      if(role==='batter'||role==='runner')stroke(torso(add(hand,vec(0,.03,0))),torso(hand),'#eeeadd',.12);
    }
    const frontDepth=this.cameraPoint(torso(vec(0,.3,.18))).z,backDepth=this.cameraPoint(torso(vec(0,.3,-.18))).z,faceFront=frontDepth<backDepth,faceZ=faceFront?.17:-.17;
    const rings=[[.065,.205],[.30,.234],[.49,.25],[.55,.14]];
    for(let row=0;row<rings.length-1;row++)for(let j=0;j<10;j++){
      const a=j/10*TAU,b=(j+1)/10*TAU,[y0,r0]=rings[row],[y1,r1]=rings[row+1],light=.79+.21*Math.cos((a+b)/2+.7);
      poly([torso(vec(Math.cos(a)*r0,y0,Math.sin(a)*r0*.68)),torso(vec(Math.cos(b)*r0,y0,Math.sin(b)*r0*.68)),torso(vec(Math.cos(b)*r1,y1,Math.sin(b)*r1*.68)),torso(vec(Math.cos(a)*r1,y1,Math.sin(a)*r1*.68))],shade(jersey,light));
    }
    stroke(body(vec(-.19,.07,.15)),body(vec(.19,.07,.15)),cap,.045);
    pieces.sort((a,b)=>b.depth-a.depth);
    for(const item of pieces)if(item.kind==='poly')this.drawPolygon(item.points,item.color);else{this.line(item.a,item.b,'rgba(21,32,28,.32)',Math.max(1,item.width*scale+1.0));this.line(item.a,item.b,item.color,Math.max(1,item.width*scale));if(scale>16&&item.width>.10){this.line(item.a,item.b,shade(item.color,1.07),Math.max(.8,item.width*scale*.48));}}
    const label=this.project(...Object.values(torso(vec(0,.31,faceZ*1.08))));
    if(scale>22&&role!=='catcher'){
      c.textAlign='center';c.fillStyle=home?'#244939':'#f3e7cc';c.font=`bold ${Math.max(4,scale*.075)}px Georgia`;c.fillText(home?'FOUNDRY':'HARBOR',label.x,label.y-scale*.075);
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
      const helmet=c.createLinearGradient(head.x-.15*scale,head.y-.20*scale,head.x+.15*scale,head.y);helmet.addColorStop(0,shade(cap,1.38));helmet.addColorStop(.45,cap);helmet.addColorStop(1,shade(cap,.68));c.fillStyle=helmet;c.beginPath();c.ellipse(head.x,head.y-.115*scale,Math.max(1,.15*scale),Math.max(1,.083*scale),0,0,TAU);c.fill();if(scale>20){c.strokeStyle='rgba(231,233,212,.19)';c.lineWidth=Math.max(.7,scale*.008);c.beginPath();c.ellipse(head.x-.03*scale,head.y-.143*scale,.10*scale,.035*scale,-.25,Math.PI,TAU);c.stroke();}
      const brim=torso(vec(0,.865,.22)),q=this.project(brim.x,brim.y,brim.z);this.line(torso(vec(-.115,.87,.20)),torso(vec(.115,.87,.20)),cap,Math.max(1,scale*.035));
      if(role==='batter'||role==='runner'||role==='catcher'){c.fillStyle=cap;c.fillRect(head.x-.15*scale,head.y-.07*scale,.045*scale,.15*scale);}
      if(role==='catcher'&&faceFront){for(const y of[.66,.73,.80,.87])this.line(torso(vec(-.12,y,.18)),torso(vec(.12,y,.18)),'#b8b9a8',Math.max(.7,scale*.012));for(const x of[-.11,.11])this.line(torso(vec(x,.65,.18)),torso(vec(x,.88,.18)),'#b8b9a8',Math.max(.7,scale*.012));}
    }
    if(role!=='batter'&&role!=='runner'){
      const glove=hands.left,q=this.project(glove.x,glove.y,glove.z);c.fillStyle='#926137';c.beginPath();c.ellipse(q.x,q.y,Math.max(1,.13*scale),Math.max(1,.16*scale),-.2,0,TAU);c.fill();c.strokeStyle='#d4aa70';c.lineWidth=Math.max(.6,.012*scale);c.beginPath();c.arc(q.x,q.y,Math.max(1,.09*scale),-.4,2.4);c.stroke();if(scale>15){c.strokeStyle='#5d3d25';c.lineWidth=Math.max(.5,scale*.010);for(let i=0;i<3;i++){c.beginPath();c.moveTo(q.x+(i-1)*scale*.047,q.y-.10*scale);c.lineTo(q.x+(i-1)*scale*.045,q.y+.045*scale);c.stroke();}}
    }
    if(role==='batter'){
      const pivot=vec(-.015,.42,.27),batVector=rotateX(rotateY(rotateZ(vec(0,.94,0),p.bat[2]),p.bat[1]),p.bat[0]);
      this.line(torso(pivot),torso(add(pivot,batVector)),'#4c4030',Math.max(2,scale*.055));this.line(torso(add(pivot,vec(0,.08,0))),torso(add(pivot,batVector)),'#d6b382',Math.max(1.6,scale*.045));
    }
    if(role==='pitcher'&&['ready','windup'].includes(state?.phase)&&!state?.ball?.visible){const q=this.project(hands.right.x,hands.right.y,hands.right.z);if(q.visible){c.fillStyle='#fff3d9';c.beginPath();c.arc(q.x,q.y,Math.max(1.2,.041*scale),0,TAU);c.fill();}}
    return hands;
  }

  render(state,dt=1/60,options={}){
    this.resize();dt=clamp(dt||0,0,.1);this.time+=dt;
    const menu=!!options.menu||!state,phase=state?.phase||'ready',fielding=!menu&&(phase==='live'||(phase==='result'&&state?.play));
    const ball=state?.ball,portrait=this.width<this.height;
    let eye,look;
    if(menu){const a=.50+Math.sin(this.time*.035)*.12;eye=vec(Math.sin(a)*94,42,-Math.cos(a)*44);look=vec(-4,2,40);}
    else if(fielding){eye=vec(-(ball?.x||0)*.24,25+clamp((ball?.y||0)*.25,0,13),-18+clamp((ball?.z||0)*.18,0,20));look=vec(-(ball?.x||0)*.65,Math.max(2,(ball?.y||0)*.38),Math.max(27,(ball?.z||0)*.68));}
    else{eye=vec(0,portrait?3.5:2.9,portrait?-7.6:-6.8);look=vec(0,1.6,16);}
    const ease=this.wasMenu&&!menu?1:1-Math.exp(-dt*(menu?1.5:fielding?5.5:7));
    for(const k of['x','y','z']){this.eye[k]=mix(this.eye[k],eye[k],ease);this.look[k]=mix(this.look[k],look[k],ease);}
    this.fov=mix(this.fov,menu?52:fielding?(portrait?71:58):(portrait?61:51),ease);this.wasMenu=menu;this.cameraBasis();
    const c=this.ctx,w=this.width,h=this.height,sky=c.createLinearGradient(0,0,0,h*.7);sky.addColorStop(0,'#14243e');sky.addColorStop(.48,'#49566b');sky.addColorStop(.83,'#b3958a');sky.addColorStop(1,'#d1ac93');c.fillStyle=sky;c.fillRect(0,0,w,h);
    for(let i=0;i<55;i++){const a=i*2.399963,q=this.project(Math.sin(a)*380,85+(i*47)%180,Math.cos(a)*380);if(q.visible){c.fillStyle='rgba(229,235,238,.48)';c.fillRect(q.x,q.y,i%6===0?1.5:1,i%6===0?1.5:1);}}
    // Coplanar paint follows construction order: grass, dirt, then chalk/bases.
    // Sorting a grass strip by its centre could otherwise erase the infield.
    for(const p of this.static)if(p.ground)this.drawPolygon(p.points,p.color,p.stroke);
    const all=this.static.filter(p=>!p.ground).map(p=>({...p,depth:p.points.reduce((n,v)=>n+this.cameraPoint(v).z,0)/p.points.length})).sort((a,b)=>b.depth-a.depth);
    for(const p of all)if(p.depth>0)this.drawPolygon(p.points,p.color,p.stroke);
    for(const p of this.parkLines)this.line(p.a,p.b,p.color,p.width);
    for(const p of this.crowd){const q=this.project(p.x,p.y,p.z);if(!q.visible)continue;const r=clamp(this.focal/q.depth*.28,.45,3.5);c.fillStyle='#23473f';c.fillRect(q.x-r*1.3,q.y-r*1.1,r*2.6,r*2.2);c.fillStyle=p.color;c.fillRect(q.x-r,q.y-r*1.4,r*2,r*2.5);c.fillStyle=p.skin;c.beginPath();c.arc(q.x,q.y-r*1.8,Math.max(.45,r*.60),0,TAU);c.fill();}
    for(const light of this.floodlights){const q=this.project(light.x,light.y,light.z);if(!q.visible)continue;const r=clamp(this.focal/q.depth*5,6,75),glow=c.createRadialGradient(q.x,q.y,0,q.x,q.y,r);glow.addColorStop(0,'rgba(255,239,194,.25)');glow.addColorStop(1,'rgba(255,239,194,0)');c.fillStyle=glow;c.fillRect(q.x-r,q.y-r,r*2,r*2);}
    const board=this.project(0,12,122),boardWidth=this.focal*27/board.depth;
    if(board.visible&&boardWidth>14){c.fillStyle='#0f3027';c.fillRect(board.x-boardWidth/2,board.y-boardWidth*.19,boardWidth,boardWidth*.38);c.textAlign='center';c.fillStyle='#f1dfae';c.font=`bold ${Math.max(4,boardWidth*.085)}px Georgia`;c.fillText('HARBOR FIELD',board.x,board.y-boardWidth*.065);c.font=`${Math.max(4,boardWidth*.07)}px monospace`;c.fillText(state?`HBR ${state.score[0]}   FDR ${state.score[1]}`:'GOOD EVENING, BASEBALL',board.x,board.y+boardWidth*.065);}
    const fallback=[{id:'P',x:0,z:18.44},{id:'1B',x:19,z:22},{id:'2B',x:12,z:34},{id:'SS',x:-12,z:34},{id:'3B',x:-22,z:19},{id:'LF',x:-43,z:66},{id:'CF',x:0,z:79},{id:'RF',x:43,z:66}];
    const homeDefense=!state||state.battingSide===0,people=(state?.fielders||fallback).filter(p=>p.id!=='C'||fielding).map(p=>({...p,home:homeDefense,role:p.id==='P'?'pitcher':p.id==='C'?'catcher':'fielder'}));
    for(const r of state?.runners||[])if(!r.out&&!r.scored)people.push({...r,home:!homeDefense,role:'runner'});
    people.sort((a,b)=>this.cameraPoint(vec(b.x,0,b.z)).z-this.cameraPoint(vec(a.x,0,a.z)).z);
    let heldHands=null;
    for(const p of people){
      const dx=-(p.x-(p.prevX??p.x)),dz=p.z-(p.prevZ??p.z),moving=Math.hypot(dx,dz)>.001;
      let facing=moving?Math.atan2(dx,dz):Math.atan2(p.x,-p.z);
      if(p.role==='pitcher'&&!fielding)facing=Math.PI;
      if(p.role==='runner'&&!moving){const target=BASES[p.targetBase??Math.min(4,(p.fromBase||0)+1)]||BASES[1];facing=Math.atan2(p.x-target.x,target.z-p.z);}
      if(p.id===state?.play?.fielder&&['held','throw'].includes(state.play.stage)){const target=state.play.throw?.to||BASES[state.play.throwBase??state.play.queuedBase??1]||BASES[1];facing=Math.atan2(p.x-target.x,target.z-p.z);}
      const hands=this.person(p,state,p.home,p.role,facing);
      if(p.id===state?.play?.fielder)heldHands=hands;
      if(p.id===options.selectedRunnerId&&p.role==='runner'&&!menu){const q=this.project(p.x,.04,p.z);if(q.visible){c.strokeStyle='#8bdbdf';c.lineWidth=2;c.beginPath();c.ellipse(q.x,q.y,Math.max(4,this.focal/q.depth*.48),Math.max(2,this.focal/q.depth*.16),0,0,TAU);c.stroke();}}
    }
    if(!fielding){
      this.person({x:-1.02,z:0,number:(state?.batterIndex?.[state?.battingSide||0]||0)+1},state,!homeDefense,'batter',-Math.PI/2);
      if(!menu)this.person({x:0,z:-2.1,number:2},state,homeDefense,'catcher',0);
    }

    if(ball?.visible&&!menu){
      const alpha=clamp(options.interpolationAlpha??1,0,1);let p=vec(mix(ball.prevX??ball.x,ball.x,alpha),mix(ball.prevY??ball.y,ball.y,alpha),mix(ball.prevZ??ball.z,ball.z,alpha));
      if(state?.play?.stage==='held'&&heldHands)p=state.time-(state.play.heldAt??state.time)<.14?heldHands.left:heldHands.right;
      if(this.lastTick!==state.tick&&['pitch','live'].includes(phase)){this.trail.unshift(p);this.trail.length=Math.min(10,this.trail.length);}this.lastTick=state.tick;
      for(let i=1;i<this.trail.length;i++)this.line(this.trail[i-1],this.trail[i],`rgba(255,239,189,${.28*(1-i/this.trail.length)})`,1.4);
      const shadow=this.project(p.x,.04,p.z);if(shadow.visible){c.fillStyle='rgba(15,35,22,.37)';c.beginPath();c.ellipse(shadow.x,shadow.y,Math.max(2,this.focal/shadow.depth*.17),1.3,0,0,TAU);c.fill();}
      const q=this.project(p.x,p.y,p.z);if(q.visible){const radius=clamp(this.focal/q.depth*(fielding?.20:.10),2,10);c.fillStyle='#fff9e7';c.shadowColor='rgba(255,241,184,.5)';c.shadowBlur=5;c.beginPath();c.arc(q.x,q.y,radius,0,TAU);c.fill();c.shadowBlur=0;c.strokeStyle='#ba5748';c.lineWidth=.6;c.beginPath();c.arc(q.x-radius*.2,q.y,radius*.6,-1.4,1.4);c.stroke();}
    }
    if(!['pitch','live'].includes(phase))this.trail=[];
    if(!menu&&!fielding&&!['half','final'].includes(phase)){
      const z=STRIKE_ZONE;
      if(options.guidance!=='expert'){
        for(const [x,sx]of[[z.left,1],[z.right,-1]])for(const[y,sy]of[[z.bottom,1],[z.top,-1]]){this.line(vec(x,y,-.025),vec(x+sx*.095,y,-.025),'rgba(255,243,214,.80)',1.6);this.line(vec(x,y,-.025),vec(x,y+sy*.13,-.025),'rgba(255,243,214,.80)',1.6);}
        for(const f of[1/3,2/3]){const x=z.left+(z.right-z.left)*f,y=z.bottom+(z.top-z.bottom)*f;this.line(vec(x,z.bottom,-.025),vec(x,z.top,-.025),'rgba(255,240,204,.20)',.7);this.line(vec(z.left,y,-.025),vec(z.right,y,-.025),'rgba(255,240,204,.20)',.7);}
      }
      if(phase!=='result'){const aim=options.aim||{},q=this.project((aim.x||0)*AIM_AREA.x,AIM_AREA.centerY+(aim.y||0)*AIM_AREA.y,-.04);if(q.visible){const radius=Math.max(5,this.focal/q.depth*.082);c.strokeStyle='#f4d486';c.lineWidth=1.5;c.beginPath();c.arc(q.x,q.y,radius,0,TAU);c.stroke();for(const[a,b]of[[[-radius-4,0],[-radius-1,0]],[[radius+1,0],[radius+4,0]],[[0,-radius-4],[0,-radius-1]],[[0,radius+1],[0,radius+4]]]){c.beginPath();c.moveTo(q.x+a[0],q.y+a[1]);c.lineTo(q.x+b[0],q.y+b[1]);c.stroke();}}}
    }
    // Review only after resolution: never reveal the active pitch's endpoint.
    if(!menu&&phase==='result'&&state?.pitch?.resolved&&options.guidance!=='expert'){
      const target=state.pitch.target,q=this.project(target.x,target.y,-.04);
      if(q.visible){c.strokeStyle=inStrikeZone(target)?'#efbf77':'#88d0d7';c.lineWidth=1.8;c.beginPath();c.arc(q.x,q.y,clamp(this.focal/q.depth*.053,3,7),0,TAU);c.stroke();}
    }

    this.stats.drawCalls=all.length;this.stats.triangles=all.length*2;
  }
  dispose(){this.static=[];this.crowd=[];this.trail=[];}
}
