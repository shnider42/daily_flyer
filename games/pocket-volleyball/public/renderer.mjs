/* Pocket Volleyball — original procedural beach court and player art. */
import { predictLanding } from './sim.mjs';

const TAU = Math.PI * 2;
const INK = '#173f43';
const TEAMS = [
  { main: '#168fab', bright: '#66e0ed', dark: '#155365', trim: '#f3fcf6' },
  { main: '#e55b43', bright: '#ffab78', dark: '#862f32', trim: '#fff0d7' }
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hash = (n, salt = 0) => {
  let v = Math.imul(n + salt * 113, 374761393);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
};
function line(c, a, b, color, width = 1) {
  c.strokeStyle = color; c.lineWidth = width;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}
function circle(c, x, y, radius, color) {
  c.fillStyle = color; c.beginPath(); c.arc(x, y, Math.max(.1, radius), 0, TAU); c.fill();
}
function polygon(c, points, color) {
  c.fillStyle = color; c.beginPath();
  points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath(); c.fill();
}
function pill(c, text, x, y, color, fill = INK, size = 14) {
  c.save(); c.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 12;
  c.fillStyle = fill; c.beginPath(); c.roundRect(x - w / 2, y - size * .68, w, size * 1.36, 4); c.fill();
  c.fillStyle = color; c.fillText(text, x, y + .5); c.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1; this.height = 1; this.scale = 30; this.cx = 0; this.cy = 0;
    this.scaleX = 1; this.scaleY = 1; this.portrait = false;
    this.terrain = null; this.terrainKey = '';
    this.trail = []; this.footprints = []; this.sand = []; this.rings = [];
    this.previousPlayers = new Map(); this.previousTime = 0; this.lastTrail = -1;
    this.lastEventId = -1; this.lastState = null;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 1 || rect.height < 1) return false;
    const ratio = Number.isFinite(globalThis.devicePixelRatio) ? Math.max(1, globalThis.devicePixelRatio) : 1;
    const dpr = Math.min(ratio, 2, Math.sqrt(4_000_000 / (rect.width * rect.height)));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    this.width = rect.width; this.height = rect.height;
    this.scaleX = width / rect.width; this.scaleY = height / rect.height;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = true;
    return true;
  }

  worldPoint(x, y, z = 0) {
    return {
      x: this.cx + (this.portrait ? -y : x) * this.scale - z * this.scale * .16,
      y: this.cy + (this.portrait ? -x : y) * this.scale - z * this.scale * .68
    };
  }

  screenPointToWorld(x, y) {
    const dx = (x - this.cx) / this.scale, dy = (y - this.cy) / this.scale;
    return this.portrait ? { x: -dy, y: -dx } : { x: dx, y: dy };
  }

  screenDirection(dx, dy) {
    return this.portrait ? { mx: -dy, my: -dx } : { mx: dx, my: dy };
  }

  _camera(padding = {}) {
    const top = Math.max(0, padding.top ?? 95), bottom = Math.max(0, padding.bottom ?? 95);
    const left = Math.max(0, padding.left ?? 20), right = Math.max(0, padding.right ?? 20);
    const w = Math.max(40, this.width - left - right), h = Math.max(40, this.height - top - bottom);
    this.portrait = h > w * 1.08;
    this.scale = Math.max(3, Math.min(w / (this.portrait ? 10.8 : 19.6), h / (this.portrait ? 20.6 : 12.3)));
    this.cx = left + w / 2 + this.scale * .12;
    this.cy = top + h / 2 + this.scale * .6;
  }

  _ground() {
    const key = [this.canvas.width, this.canvas.height, Math.round(this.width), Math.round(this.height), this.scale.toFixed(2), this.cx.toFixed(1), this.cy.toFixed(1), this.portrait].join(':');
    if (key === this.terrainKey && this.terrain) return;
    this.terrainKey = key;
    const canvas = this.terrain ||= document.createElement('canvas');
    canvas.width = this.canvas.width; canvas.height = this.canvas.height;
    const c = canvas.getContext('2d'); c.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    const w = this.width, h = this.height, s = this.scale;
    const ground = c.createLinearGradient(0, 0, w * .5, h);
    ground.addColorStop(0, '#f2d8a0'); ground.addColorStop(.52, '#edcd8c'); ground.addColorStop(1, '#dbb372');
    c.fillStyle = ground; c.fillRect(0, 0, w, h);

    // The shore stays outside the playable boundary on every screen shape.
    const corners = [[-8, -4], [8, -4], [8, 4], [-8, 4]].map(([x,y]) => this.worldPoint(x,y));
    this.shore = Math.max(h * .82, Math.max(...corners.map(p => p.y)) + s * 1.5);
    const shore = this.shore;
    const shorePath = offset => {
      c.beginPath(); c.moveTo(-20, shore + offset + 5);
      c.bezierCurveTo(w * .22, shore - 25 + offset, w * .55, shore + 38 + offset, w + 20, shore - 17 + offset);
      c.lineTo(w + 20, h + 20); c.lineTo(-20, h + 20); c.closePath();
    };
    shorePath(-8); c.fillStyle = '#c5b87b'; c.fill();
    shorePath(0); c.fillStyle = '#77b9a4'; c.fill();
    shorePath(14); c.fillStyle = '#238f8c'; c.fill();
    shorePath(31); c.fillStyle = '#116b76'; c.fill();

    // Small, deterministic grains are cached, never regenerated each frame.
    const grains = Math.min(1300, Math.floor(w * h / 550));
    for (let i = 0; i < grains; i++) {
      const x = hash(i, 2) * w, y = hash(i, 9) * Math.min(h, shore - 10);
      c.fillStyle = i % 3 ? '#9a714015' : '#fff7d833';
      c.fillRect(x, y, i % 4 ? 1.2 : 2.3, 1.1);
    }

    const apron = [[-8.9,-4.85],[8.9,-4.85],[8.9,4.85],[-8.9,4.85]].map(([x,y]) => this.worldPoint(x,y));
    polygon(c, apron, '#ebc786');
    const inner = [[-8,-4],[8,-4],[8,4],[-8,4]].map(([x,y]) => this.worldPoint(x,y));
    polygon(c, inner, '#efd49b');
    polygon(c, [[-8,-4],[0,-4],[0,4],[-8,4]].map(([x,y]) => this.worldPoint(x,y)), '#f2d9a4');
    for (let i = 0; i < 220; i++) {
      const p = this.worldPoint(-8 + hash(i,17)*16, -4 + hash(i,23)*8);
      c.fillStyle = i % 2 ? '#aa854023' : '#fff7df44'; c.fillRect(p.x,p.y,1.6,1.2);
    }

    // Woven boundary tape with a subtle dark edge is visible on bright sand.
    c.lineJoin = 'miter'; c.strokeStyle = '#987957'; c.lineWidth = Math.max(3, s*.07) + 2;
    c.beginPath(); inner.forEach((p,i) => i ? c.lineTo(p.x,p.y) : c.moveTo(p.x,p.y)); c.closePath(); c.stroke();
    c.strokeStyle = '#fffbed'; c.lineWidth = Math.max(3, s*.07); c.stroke();
    for (const [x,y] of [[-8,-4],[8,-4],[8,4],[-8,4]]) {
      const p = this.worldPoint(x,y); circle(c,p.x,p.y,Math.max(2,s*.06),'#cf5d41');
    }
    line(c, this.worldPoint(0,-4.8), this.worldPoint(0,4.8), '#634d3930', Math.max(1,s*.035));
    c.setLineDash([s*.13,s*.15]);
    line(c, this.worldPoint(-8.6,-2), this.worldPoint(-8.6,2), '#b5915c', Math.max(1,s*.03));
    line(c, this.worldPoint(8.6,-2), this.worldPoint(8.6,2), '#b5915c', Math.max(1,s*.03)); c.setLineDash([]);

    this._towel(c,-8.4,-5.6,-.18,TEAMS[0].main);
    this._towel(c,8.1,5.6,.14,TEAMS[1].main);
    this._umbrella(c,-6.3,5.9,TEAMS[0].main);
    this._umbrella(c,6.2,-5.9,TEAMS[1].main);
    if (w > 600) {
      this._palm(c, Math.min(70,w*.06), Math.max(80,h*.17), Math.min(100,s*1.9), -.45);
      this._palm(c, w-20, h*.68, Math.min(95,s*1.8), 1.1);
    } else {
      this._palm(c,-9,h*.24,58,-.7);
      this._palm(c,w+8,h*.74,52,1.2);
    }
  }

  _towel(c, x, y, angle, color) {
    const p = this.worldPoint(x,y), s = this.scale;
    c.save(); c.translate(p.x,p.y); c.rotate(angle);
    c.fillStyle='#9d71302b'; c.fillRect(-s*.27+3,-s*.5+4,s*.54,s);
    c.fillStyle=color; c.fillRect(-s*.27,-s*.5,s*.54,s);
    c.fillStyle='#fff0ca'; for(let j=0;j<3;j++)c.fillRect(-s*.27,-s*.37+j*s*.33,s*.54,s*.055);
    c.restore();
  }

  _umbrella(c,x,y,color) {
    const p=this.worldPoint(x,y),r=this.scale*.72;
    c.save(); c.translate(p.x,p.y); c.fillStyle='#73542b21';c.beginPath();c.ellipse(r*.38,r*.32,r*.93,r*.62,.2,0,TAU);c.fill();
    c.translate(-r*.1,-r*.1);
    for(let i=0;i<8;i++){
      c.fillStyle=i%2?'#f8e8bd':color;c.beginPath();c.moveTo(0,0);c.arc(0,0,r,i*TAU/8,(i+1)*TAU/8);c.closePath();c.fill();
      line(c,{x:0,y:0},{x:Math.cos(i*TAU/8)*r,y:Math.sin(i*TAU/8)*r},'#143f3c22',1);
    }
    circle(c,-1,-1,r*.09,'#f9efd4');c.restore();
  }

  _palm(c,x,y,size,angle) {
    c.save();c.translate(x,y);c.rotate(angle);
    c.fillStyle='#3b60431a';c.beginPath();c.ellipse(size*.25,size*.35,size*.9,size*.48,.4,0,TAU);c.fill();
    line(c,{x:0,y:size*.45},{x:8,y:0},'#9e7950',Math.max(6,size*.1));
    line(c,{x:-2,y:size*.4},{x:5,y:0},'#d4ad71',Math.max(2,size*.035));
    c.translate(8,0);
    for(let i=0;i<7;i++){
      c.rotate(TAU/7);c.fillStyle=i%2?'#246e62':'#3e8569';c.beginPath();c.moveTo(-4,0);
      c.quadraticCurveTo(-size*.35,-size*.6,size*.05,-size);c.quadraticCurveTo(size*.23,-size*.5,4,0);c.fill();
      line(c,{x:0,y:-5},{x:size*.045,y:-size*.9},'#81aa76',Math.max(1,size*.014));
    }
    circle(c,0,0,size*.08,'#66855a');c.restore();
  }

  _wave(c,t) {
    if(this.shore>this.height+35)return;
    c.save();c.strokeStyle='#e2f3cc80';c.lineWidth=1.4;
    for(let row=0;row<3;row++) {
      c.beginPath();
      for(let x=-10;x<this.width+20;x+=14) {
        const y=this.shore+row*22+Math.sin(x*.009+t*.4+row)*7+Math.sin(x*.004)*9;
        x===-10?c.moveTo(x,y):c.lineTo(x,y);
      }
      c.globalAlpha=.45+Math.sin(t*.7+row)*.22;c.stroke();
    }c.restore();
  }

  _net(c) {
    const s=this.scale, p=(y,z)=>this.worldPoint(0,y,z);
    // A long shadow shows the height of the physical net.
    line(c,this.worldPoint(.55,-4.55),this.worldPoint(.55,4.55),'#5d523b24',Math.max(4,s*.15));
    for(const y of [-4.5,4.5]) {
      const a=p(y,0),b=p(y,2.4);line(c,a,{x:a.x+s*.45,y:a.y+s*.4},'#604f392b',s*.08);
      line(c,a,b,'#6b6357',Math.max(5,s*.11));line(c,{x:a.x-1,y:a.y},{x:b.x-1,y:b.y},'#e3ded0',Math.max(2,s*.055));
      circle(c,b.x,b.y,Math.max(3,s*.07),'#f6f0de');
      const anchor=this.worldPoint(0,y+(y>0?.65:-.65));line(c,b,anchor,'#987d51',Math.max(1,s*.018));
      circle(c,anchor.x,anchor.y,Math.max(2,s*.04),'#75604a');
    }
    polygon(c,[p(-4.35,.92),p(4.35,.92),p(4.35,2.2),p(-4.35,2.2)],'#23474715');
    for(let y=-4.32;y<=4.32;y+=.23)line(c,p(y,.92),p(y,2.2),'#23474766',Math.max(.7,s*.018));
    for(let z=.92;z<2.21;z+=.21)line(c,p(-4.35,z),p(4.35,z),'#23474766',Math.max(.7,s*.018));
    line(c,p(-4.4,.92),p(4.4,.92),'#eee7cf',Math.max(1.5,s*.035));
    line(c,p(-4.45,2.2),p(4.45,2.2),'#697875',Math.max(4,s*.10));
    line(c,p(-4.45,2.23),p(4.45,2.23),'#fff9e8',Math.max(3,s*.075));
    for(const y of [-4.05,4.05])for(let z=2.18;z<2.94;z+=.15)line(c,p(y,z),p(y,z+.15),Math.floor(z/.15)%2?'#d8573c':'#fff4dd',Math.max(2,s*.045));
  }

  _sample(state, t) {
    if (state.time < this.previousTime - .5 || (state !== this.lastState && state.time === 0 && this.previousTime > 2)) {
      this.trail.length=0; this.footprints.length=0; this.sand.length=0; this.rings.length=0;this.previousPlayers.clear();this.lastEventId=-1;
    }
    this.previousTime=state.time;this.lastState=state;
    if(t-this.lastTrail>.024){
      const b=state.ball;if(b && state.phase==='rally')this.trail.push({x:b.x,y:b.y,z:b.z,t});
      this.lastTrail=t;
    }
    this.trail=this.trail.filter(p=>t-p.t<.17).slice(-8);
    for(const a of state.players||[]){
      const prev=this.previousPlayers.get(a.id);
      if(prev&&Math.hypot(a.x-prev.x,a.y-prev.y)>.25){
        const dx=a.x-prev.x,dy=a.y-prev.y,len=Math.hypot(dx,dy)||1;
        this.footprints.push({x:a.x+(prev.side?1:-1)*dy/len*.12,y:a.y-(prev.side?1:-1)*dx/len*.12,a:Math.atan2(dy,dx),t});
        this.previousPlayers.set(a.id,{x:a.x,y:a.y,side:!prev.side});
      }else if(!prev)this.previousPlayers.set(a.id,{x:a.x,y:a.y,side:false});
    }
    this.footprints=this.footprints.filter(p=>t-p.t<7).slice(-150);
    const event=state.lastEvent;
    if(event&&event.id!==this.lastEventId){
      this.lastEventId=event.id;
      const x=Number.isFinite(event.x)?event.x:state.ball?.x||0,y=Number.isFinite(event.y)?event.y:state.ball?.y||0;
      if(['pass','set','spike','block','serve','dive','dig','hit'].includes(event.type))this.rings.push({x,y,t,color:TEAMS[event.team||0].main});
      if(['point','score','setWon','match','matchWon','spike','dive'].includes(event.type)){
        for(let i=0;i<(event.type==='dive'?12:20);i++){
          const a=hash(i,event.id||1)*TAU,v=.5+hash(i,5)*1.5;
          this.sand.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,z:.2+hash(i,9)*.6,t,color:['point','score','setWon','match','matchWon'].includes(event.type)?TEAMS[event.team||0].main:'#e6b569'});
        }
      }
    }
    this.sand=this.sand.filter(p=>t-p.t<.8);this.rings=this.rings.filter(p=>t-p.t<.5);
  }

  _traces(c,t) {
    c.save();
    for(const f of this.footprints){
      const p=this.worldPoint(f.x,f.y);c.globalAlpha=(1-(t-f.t)/7)*.21;c.fillStyle='#946934';
      c.beginPath();c.ellipse(p.x,p.y,this.scale*.065,this.scale*.105,this.portrait?-f.a:f.a+Math.PI/2,0,TAU);c.fill();
    }
    c.globalAlpha=1;
    for(const r of this.rings){
      const age=(t-r.t)/.5,p=this.worldPoint(r.x,r.y);c.strokeStyle=r.color;c.globalAlpha=(1-age)*.45;c.lineWidth=2;
      c.beginPath();c.ellipse(p.x,p.y,(.2+age*.7)*this.scale,(.2+age*.7)*this.scale*.7,0,0,TAU);c.stroke();
    }
    c.restore();
  }

  _landing(c,state,options,t) {
    if(!options.showLanding||state.phase!=='rally'||!state.ball)return;
    let land;try{land=predictLanding(state.ball);}catch{return;}
    if(!land||!Number.isFinite(land.x)||!Number.isFinite(land.y))return;
    const p=this.worldPoint(land.x,land.y),valid=Math.abs(land.x)<=8&&Math.abs(land.y)<=4;
    const color=valid?(land.x<0?TEAMS[0].dark:TEAMS[1].dark):'#ba442c';
    const radius=this.scale*.40;
    c.save();c.strokeStyle=color;c.lineWidth=1.6;c.globalAlpha=.7;
    c.setLineDash([4,5]);c.lineDashOffset=-t*8;
    c.beginPath();c.arc(p.x,p.y,radius,0,TAU);c.stroke();c.setLineDash([]);
    c.globalAlpha=.13;circle(c,p.x,p.y,radius,color);c.globalAlpha=.7;
    line(c,{x:p.x-4,y:p.y},{x:p.x+4,y:p.y},color,1.5);line(c,{x:p.x,y:p.y-4},{x:p.x,y:p.y+4},color,1.5);
    c.restore();
  }

  _player(c,a,state,options,t) {
    const team=TEAMS[a.team||0],s=clamp(this.scale,30,65)*.96;
    const jump=Number.isFinite(a.z)?a.z:(a.action==='spike'||a.action==='block')&&a.actionTimer>0?.42:0;
    const ground=this.worldPoint(a.x,a.y),p=this.worldPoint(a.x,a.y,jump);
    const controllers=(state.controls||[]).map((id,i)=>id===a.id?i:-1).filter(i=>i>=0);
    const visibleControllers=state.options?.mode==='solo'?controllers.filter(i=>i===0):controllers;
    const active=visibleControllers.includes(options.localSeat||0),controlled=visibleControllers.length>0;
    c.save();c.fillStyle='#57432a32';c.beginPath();c.ellipse(ground.x+s*.13,ground.y+s*.15,s*.37,s*.22,0,0,TAU);c.fill();
    if(controlled&&!options.menu){
      c.strokeStyle=active?'#fff9e7':team.bright;c.lineWidth=active?3:2;
      c.beginPath();c.ellipse(ground.x,ground.y,s*.49,s*.34,0,0,TAU);c.stroke();
      c.strokeStyle=team.dark;c.lineWidth=1;c.beginPath();c.ellipse(ground.x,ground.y,s*.54,s*.39,0,0,TAU);c.stroke();
    }

    const moving=Math.hypot(a.vx||0,a.vy||0)>.3;
    const step=moving?Math.sin(t*15+a.id*1.7):Math.sin(t*2+a.id)*.08;
    let dx=a.team===0?1:-1,dy=0;
    if(state.ball&&state.phase==='rally'){
      const bx=state.ball.x-a.x,by=state.ball.y-a.y,len=Math.hypot(bx,by);
      if(len>.3){dx=bx/len;dy=by/len;}
    }
    const screenDx=this.portrait?-dy:dx,screenDy=this.portrait?-dx:dy;
    const angle=Math.atan2(screenDy,screenDx)+Math.PI/2;
    const action=a.actionTimer>0?a.action:'idle';
    const diving=action==='dive';
    c.translate(p.x,p.y);c.rotate(angle);
    if(diving)c.scale(1,1.35);
    const skin=['#bb8057','#6e4431','#d89b6d','#8b593e'][a.id%4];
    const skinLight=['#d49a6c','#8b5e42','#edb789','#ab7750'][a.id%4];
    c.lineCap='round';
    // Legs are deliberately visible beneath shorts for a running silhouette.
    line(c,{x:-s*.13,y:s*.17},{x:-s*.15,y:s*(.39+step*.08)},skin,s*.105);
    line(c,{x:s*.13,y:s*.17},{x:s*.15,y:s*(.39-step*.08)},skin,s*.105);
    line(c,{x:-s*.16,y:s*(.39+step*.08)},{x:-s*.13,y:s*(.44+step*.08)},skinLight,s*.105);
    line(c,{x:s*.16,y:s*(.39-step*.08)},{x:s*.13,y:s*(.44-step*.08)},skinLight,s*.105);
    c.fillStyle=team.dark;c.beginPath();c.roundRect(-s*.215,s*.07,s*.43,s*.22,s*.07);c.fill();
    c.fillStyle=team.main;c.beginPath();c.roundRect(-s*.245,-s*.17,s*.49,s*.40,s*.12);c.fill();
    c.fillStyle=team.bright;c.fillRect(-s*.21,-s*.12,s*.065,s*.24);
    c.fillStyle=team.trim;c.fillRect(s*.145,-s*.12,s*.055,s*.24);
    // A raised two-hand set, one-hand spike, and low pass read differently.
    const reach=['pass','set','block','dive'].includes(action);
    const leftEnd={x:-s*(reach?.13:.31),y:s*(reach?-.48:.10+step*.08)};
    const rightEnd={x:s*(reach?.13:.31),y:s*(reach?-.48:.10-step*.08)};
    if(action==='spike'){rightEnd.x=s*.19;rightEnd.y=-s*.59;leftEnd.x=-s*.37;leftEnd.y=-s*.03;}
    line(c,{x:-s*.23,y:-s*.09},leftEnd,skin,s*.105);
    line(c,{x:s*.23,y:-s*.09},rightEnd,skinLight,s*.105);
    circle(c,leftEnd.x,leftEnd.y,s*.06,skinLight);circle(c,rightEnd.x,rightEnd.y,s*.06,skinLight);
    circle(c,0,-s*.215,s*.19,skin);
    circle(c,-s*.025,-s*.25,s*.16,skinLight);
    // Hair silhouettes differ by player, while their uniforms stay consistent.
    c.fillStyle=a.id===2?'#ad7438':'#3b3029';c.beginPath();c.ellipse(0,-s*.28,s*.17,s*.135,0,Math.PI,TAU);c.fill();
    if(a.id%2)circle(c,s*.02,-s*.13,s*.085,'#3b3029');
    else {c.fillStyle=a.id===2?'#8a5728':'#3b3029';c.beginPath();c.roundRect(-s*.17,-s*.34,s*.34,s*.105,s*.04);c.fill();}
    line(c,{x:-s*.10,y:-s*.33},{x:s*.11,y:-s*.33},team.trim,s*.035);
    c.restore();
    // Jersey numbers and controller badges remain upright in either camera.
    const chest=this.worldPoint(a.x,a.y,jump);
    c.save();c.font=`900 ${Math.max(14,s*.27)}px ui-sans-serif,system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff7dc';
    c.shadowColor=team.dark;c.shadowBlur=1;c.fillText(String(a.id%2+1),chest.x,chest.y+s*.02);c.restore();
    if(controlled&&!options.menu){
      const label=options.online&&visibleControllers[0]===(options.localSeat||0)?'YOU':`P${visibleControllers[0]+1}`;
      pill(c,label,ground.x,ground.y+s*.70,'#fff8e9',active?INK:team.dark,14);
    }
  }

  _ball(c,state,t) {
    const b=state.ball;if(!b)return;
    const ground=this.worldPoint(b.x,b.y),p=this.worldPoint(b.x,b.y,b.z||0);
    const r=clamp(this.scale*.16,5.5,10),height=Math.max(0,b.z||0);
    c.save();
    c.fillStyle=`rgba(67,58,40,${clamp(.27-height*.025,.08,.27)})`;c.beginPath();c.ellipse(ground.x,ground.y,r*(1+.06*height),r*.52,0,0,TAU);c.fill();
    if(height>.6){c.setLineDash([2,5]);line(c,{x:ground.x,y:ground.y-2},{x:p.x,y:p.y+r+3},'#52472b25',1);c.setLineDash([]);}
    if(Math.hypot(b.vx||0,b.vy||0)>5&&state.phase==='rally'){
      for(const trail of this.trail){const q=this.worldPoint(trail.x,trail.y,trail.z||0);c.globalAlpha=clamp(1-(t-trail.t)/.17,0,1)*.18;circle(c,q.x,q.y,r*.9,'#fff9dc');}
      c.globalAlpha=1;
    }
    c.translate(p.x,p.y);c.rotate(t*3+Number(b.x||0)*.8);
    // Three clean colored panels, dark seams and a highlight keep the ball legible.
    circle(c,0,0,r+1.7,'#694f35');circle(c,0,0,r+1,'#fff9e5');
    c.save();c.beginPath();c.arc(0,0,r,0,TAU);c.clip();
    for(let i=0;i<3;i++){
      c.rotate(TAU/3);c.fillStyle=['#f9bf43','#fff6d6','#168ba1'][i];
      c.beginPath();c.moveTo(-r*.1,-r*.03);c.bezierCurveTo(r*.6,-r*.3,r*.35,-r*.8,r*.07,-r*1.1);c.lineTo(r*1.3,-r);c.lineTo(r*1.2,r*.5);c.bezierCurveTo(r*.4,r*.8,r*.4,r*.1,-r*.1,-r*.03);c.fill();
      c.strokeStyle='#37605c';c.lineWidth=.7;c.stroke();
    }
    c.restore();circle(c,-r*.25,-r*.35,r*.18,'#ffffffad');c.restore();
  }

  _particles(c,t) {
    c.save();
    for(const dust of this.sand){
      const age=t-dust.t,p=this.worldPoint(dust.x+dust.vx*age,dust.y+dust.vy*age,Math.max(0,dust.z+age*.6-age*age*2));
      c.globalAlpha=1-age/.8;c.fillStyle=dust.color;c.save();c.translate(p.x,p.y);c.rotate(age*7+dust.vx);c.fillRect(-2,-2,4,3);c.restore();
    }c.restore();
  }

  draw(state, options = {}) {
    if(!state)return;
    const t=Number.isFinite(options.time)?options.time:Number(state.time||0);
    const opts={menu:false,localSeat:0,online:false,guidance:'simple',showLanding:true,...options};
    this._camera(opts.padding);this._ground();this._sample(state,t);
    const c=this.ctx;c.setTransform(this.scaleX,0,0,this.scaleY,0,0);c.clearRect(0,0,this.width,this.height);
    c.drawImage(this.terrain,0,0,this.terrain.width,this.terrain.height,0,0,this.width,this.height);
    this._wave(c,t);this._traces(c,t);this._landing(c,state,opts,t);this._net(c);
    const players=[...(state.players||[])].sort((a,b)=>this.worldPoint(a.x,a.y).y-this.worldPoint(b.x,b.y).y);
    for(const p of players)this._player(c,p,state,opts,t);
    this._particles(c,t);this._ball(c,state,t);
  }
}
