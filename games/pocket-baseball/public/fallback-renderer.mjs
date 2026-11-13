import { BASES, STRIKE_ZONE, AIM_AREA, fieldRadius, FENCE_HEIGHT } from './engine.mjs';

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
    for(let z=-130;z<220;z+=12)this.ground([[-180,z],[180,z],[180,z+12],[-180,z+12]],Math.round(z/12)%2?'#477f4e':'#518a55',-.03);
    const outside=[],inside=[];
    for(let i=0;i<=60;i++){const a=-Math.PI/4+i/60*Math.PI/2,r=fieldRadius(a);outside.push([Math.sin(a)*r,Math.cos(a)*r]);inside.unshift([Math.sin(a)*(r-4.2),Math.cos(a)*(r-4.2)]);}
    this.ground([...outside,...inside],'#b7976d');
    this.ground([[0,-3],[23,22],[0,44],[-23,22]],'#bd8d63');
    this.ground([[0,6.4],[14.9,21.2],[0,35.8],[-14.9,21.2]],'#4d8652',.025);
    this.disc(0,0,4.1,'#bb885f');this.disc(0,18.44,2.9,'#c2946c');
    for(const p of BASES.slice(1,4)){this.disc(p.x,p.z,2.3,'#bd8d63');this.ground([[p.x-.31,p.z],[p.x,p.z+.31],[p.x+.31,p.z],[p.x,p.z-.31]],'#fff3d6',.08);}
    this.ground([[-.215,.215],[.215,.215],[.215,0],[0,-.215],[-.215,0]],'#fff4dc',.06);
    this.ground([[-.31,18.36],[.31,18.36],[.31,18.52],[-.31,18.52]],'#fff2d2',.07);
    for(const sign of[-1,1]){
      this.ground([[sign*.17,-.17],[sign*81,81],[sign*81.10,80.90],[sign*.27,-.27]],'#eee4c5',.045);
      const x=sign*1.0;this.ground([[x-.48,-.7],[x+.48,-.7],[x+.48,1.1],[x-.48,1.1]],'#d8ba92',.025);
      this.box(sign*29,0,12,14,2,1,'#234c3c');this.box(sign*29,2.0,11,15,.22,3,'#193f35');
    }
    for(let i=0;i<48;i++){
      const a=-Math.PI/4+i/48*Math.PI/2,b=a+Math.PI/96,r=fieldRadius(a),s=fieldRadius(b);
      this.polygon([vec(Math.sin(a)*r,0,Math.cos(a)*r),vec(Math.sin(b)*s,0,Math.cos(b)*s),vec(Math.sin(b)*s,FENCE_HEIGHT,Math.cos(b)*s),vec(Math.sin(a)*r,FENCE_HEIGHT,Math.cos(a)*r)],i%2?'#245c45':'#28654b');
    }
    const standRadius=a=>Math.abs(a)<=Math.PI/4?fieldRadius(a)+5:mix(110,36,clamp((Math.abs(a)-Math.PI/4)/(Math.PI*.53),0,1));
    for(let j=0;j<64;j++){
      const a=-Math.PI+j/64*TAU,b=a+TAU/64;
      for(let row=0;row<7;row++){
        const r=standRadius(a)+row*1.7,s=standRadius(b)+row*1.7,y=1.7+row*.8;
        this.polygon([vec(Math.sin(a)*r,y,Math.cos(a)*r),vec(Math.sin(b)*s,y,Math.cos(b)*s),vec(Math.sin(b)*(s+1.7),y,Math.cos(b)*(s+1.7)),vec(Math.sin(a)*(r+1.7),y,Math.cos(a)*(r+1.7))],row%2?'#5f7265':'#4d6458');
        for(let k=0;k<3;k++){const angle=mix(a,b,(k+.5)/3),radius=standRadius(angle)+row*1.7+.6;this.crowd.push({x:Math.sin(angle)*radius,y:y+.45,z:Math.cos(angle)*radius,color:['#d3c3a0','#82959c','#a7594b','#c3b89a','#374c60'][(j+row+k)%5]});}
      }
    }
    for(let i=0;i<25;i++)this.box(-180+i*15,0,176+(i%4)*11,11,12+(i*13)%34,15,i%3?'#435b60':'#50676a','#394f54');
    for(const [x,z]of[[-90,84],[90,84],[-68,-9],[68,-9]]){this.box(x,0,z,.5,34,.5,'#7c877a');this.box(x,33,z,8,2.5,.5,'#b8b7a2');}
    for(const sign of[-1,1]){const a=sign*Math.PI/4,r=fieldRadius(a);this.box(Math.sin(a)*r,0,Math.cos(a)*r,.20,16,.20,'#dfbb60');}
    this.box(0,4,123,30,14,1.3,'#193c32','#17342d');
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
  person(p,time,home,batter=false){
    const c=this.ctx,foot=this.project(p.x,0,p.z),head=this.project(p.x,1.7,p.z);if(!head.visible)return;
    const scale=clamp(this.focal/head.depth,0,160),moving=p.prevX!==undefined&&Math.hypot(p.x-p.prevX,p.z-p.prevZ)>.002;
    const stride=moving?Math.sin(time*13)*.27:0,body=home?'#eee3c8':'#b84945',cap=home?'#234c3b':'#233c55';
    c.fillStyle='rgba(10,30,20,.23)';c.beginPath();c.ellipse(foot.x,foot.y,scale*.34,Math.max(1,scale*.10),0,0,TAU);c.fill();
    const limb=(a,b,color,w)=>this.line(vec(p.x+a[0],a[1],p.z+a[2]),vec(p.x+b[0],b[1],p.z+b[2]),color,Math.max(1,w*scale));
    limb([-.12,.9,0],[-.15,.10,stride],'#e1dcc5',.18);limb([.12,.9,0],[.15,.10,-stride],'#ded7be',.18);
    limb([-.15,.08,stride],[-.15,.08,stride+.16],cap,.14);limb([.15,.08,-stride],[.15,.08,-stride+.16],cap,.14);
    limb([0,.95,0],[0,1.45,0],body,.45);limb([-.24,1.42,0],[-.30,.98,-stride],'#bc9169',.13);limb([.24,1.42,0],[.30,1.03,stride],'#bc9169',.13);
    c.fillStyle='#c79a6c';c.beginPath();c.ellipse(head.x,head.y,Math.max(1,.145*scale),Math.max(1,.17*scale),0,0,TAU);c.fill();
    c.fillStyle=cap;c.beginPath();c.ellipse(head.x,head.y-.12*scale,Math.max(1,.17*scale),Math.max(1,.075*scale),0,0,TAU);c.fill();
    if(!batter){const glove=this.project(p.x-.31,1.02,p.z);c.fillStyle='#a37341';c.beginPath();c.arc(glove.x,glove.y,Math.max(1,.13*scale),0,TAU);c.fill();}
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
    const c=this.ctx,w=this.width,h=this.height,sky=c.createLinearGradient(0,0,0,h*.7);sky.addColorStop(0,'#23465c');sky.addColorStop(.65,'#bba99a');sky.addColorStop(1,'#e0c29f');c.fillStyle=sky;c.fillRect(0,0,w,h);
    // Coplanar paint follows construction order: grass, dirt, then chalk/bases.
    // Sorting a grass strip by its centre could otherwise erase the infield.
    for(const p of this.static)if(p.ground)this.drawPolygon(p.points,p.color,p.stroke);
    const all=this.static.filter(p=>!p.ground).map(p=>({...p,depth:p.points.reduce((n,v)=>n+this.cameraPoint(v).z,0)/p.points.length})).sort((a,b)=>b.depth-a.depth);
    for(const p of all)if(p.depth>0)this.drawPolygon(p.points,p.color,p.stroke);
    for(const p of this.crowd){const q=this.project(p.x,p.y,p.z);if(!q.visible)continue;const r=clamp(this.focal/q.depth*.28,.4,3);c.fillStyle=p.color;c.fillRect(q.x-r,q.y-r*1.8,r*2,r*2.8);}
    const board=this.project(0,12,122),boardWidth=this.focal*27/board.depth;
    if(board.visible&&boardWidth>14){c.fillStyle='#0f3027';c.fillRect(board.x-boardWidth/2,board.y-boardWidth*.19,boardWidth,boardWidth*.38);c.textAlign='center';c.fillStyle='#f1dfae';c.font=`bold ${Math.max(4,boardWidth*.085)}px Georgia`;c.fillText('HARBOR FIELD',board.x,board.y-boardWidth*.065);c.font=`${Math.max(4,boardWidth*.07)}px monospace`;c.fillText(state?`HBR ${state.score[0]}   FDR ${state.score[1]}`:'GOOD EVENING, BASEBALL',board.x,board.y+boardWidth*.065);}
    const fallback=[{id:'P',x:0,z:18.44},{id:'1B',x:19,z:22},{id:'2B',x:12,z:34},{id:'SS',x:-12,z:34},{id:'3B',x:-22,z:19},{id:'LF',x:-43,z:66},{id:'CF',x:0,z:79},{id:'RF',x:43,z:66}];
    const homeDefense=!state||state.battingSide===0,people=(state?.fielders||fallback).filter(p=>p.id!=='C').map(p=>({...p,home:homeDefense}));
    for(const r of state?.runners||[])people.push({...r,home:!homeDefense});
    people.sort((a,b)=>this.cameraPoint(vec(b.x,0,b.z)).z-this.cameraPoint(vec(a.x,0,a.z)).z);
    for(const p of people)this.person(p,state?.time||0,p.home);
    if(!fielding){this.person({x:-1.02,z:0},state?.time||0,!homeDefense,true);if(!menu){this.person({x:0,z:-1.8},0,homeDefense);const swing=state?.swing,age=swing?state.time-swing.time:100,u=age>=0&&age<.4?Math.sin((.5+age/.8)*Math.PI):0;this.line(vec(-.9,1.35,.1),vec(-1.15+u*1.45,2.25-u*.9,.2+u*.4),'#dab783',Math.max(2,this.focal/9*.045));}}
    if(ball?.visible&&!menu){
      const alpha=clamp(options.interpolationAlpha??1,0,1),p=vec(mix(ball.prevX??ball.x,ball.x,alpha),mix(ball.prevY??ball.y,ball.y,alpha),mix(ball.prevZ??ball.z,ball.z,alpha));
      if(this.lastTick!==state.tick&&['pitch','live'].includes(phase)){this.trail.unshift(p);this.trail.length=Math.min(10,this.trail.length);}this.lastTick=state.tick;
      for(let i=1;i<this.trail.length;i++)this.line(this.trail[i-1],this.trail[i],`rgba(255,239,189,${.28*(1-i/this.trail.length)})`,1.4);
      const shadow=this.project(p.x,.04,p.z);if(shadow.visible){c.fillStyle='rgba(15,35,22,.37)';c.beginPath();c.ellipse(shadow.x,shadow.y,Math.max(2,this.focal/shadow.depth*.17),1.3,0,0,TAU);c.fill();}
      const q=this.project(p.x,p.y,p.z);if(q.visible){const radius=clamp(this.focal/q.depth*(fielding?.20:.10),2,10);c.fillStyle='#fff9e7';c.shadowColor='rgba(255,241,184,.5)';c.shadowBlur=5;c.beginPath();c.arc(q.x,q.y,radius,0,TAU);c.fill();c.shadowBlur=0;c.strokeStyle='#ba5748';c.lineWidth=.6;c.beginPath();c.arc(q.x-radius*.2,q.y,radius*.6,-1.4,1.4);c.stroke();}
    }
    if(!['pitch','live'].includes(phase))this.trail=[];
    if(!menu&&!fielding&&!['half','final','result'].includes(phase)){
      const z=STRIKE_ZONE;if(options.guidance!=='expert'){const pts=[vec(z.left,z.bottom,0),vec(z.right,z.bottom,0),vec(z.right,z.top,0),vec(z.left,z.top,0)];for(let i=0;i<4;i++)this.line(pts[i],pts[(i+1)%4],'rgba(255,240,201,.5)',1);}
      const aim=options.aim||{},q=this.project((aim.x||0)*AIM_AREA.x,AIM_AREA.centerY+(aim.y||0)*AIM_AREA.y,-.04);if(q.visible){c.strokeStyle='#f4d486';c.lineWidth=1.8;c.beginPath();c.arc(q.x,q.y,Math.max(7,this.focal/q.depth*.13),0,TAU);c.stroke();}
    }
    this.stats.drawCalls=all.length;this.stats.triangles=all.length*2;
  }
  dispose(){this.static=[];this.crowd=[];this.trail=[];}
}
