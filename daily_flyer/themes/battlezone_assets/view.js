/* Perspective vector renderer; the simulation never depends on drawing. */
(function (root) {
  'use strict';
  class View {
    constructor(canvas, radar) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.radar = radar; this.rctx = radar.getContext('2d');
      this.glow = true; this.width = 1200; this.height = 610;
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
      this.ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    camera(v) {
      const dx = v[0]-this.player.x, dz = v[2]-this.player.z;
      return [dx*this.cos-dz*this.sin,v[1]-2.4,dx*this.sin+dz*this.cos];
    }
    project(v) { return [this.width/2+v[0]*this.focal/v[2],this.horizon-v[1]*this.focal/v[2]]; }
    line(a,b,color='#8eff80',width=1.2) {
      let ca=this.camera(a), cb=this.camera(b);
      if(ca[2]<0.7 && cb[2]<0.7)return;
      if(ca[2]<0.7 || cb[2]<0.7) {
        const t=(0.7-ca[2])/(cb[2]-ca[2]);
        const cut=ca.map((v,i)=>v+(cb[i]-v)*t);
        if(ca[2]<0.7)ca=cut;else cb=cut;
      }
      const p=this.project(ca),q=this.project(cb),c=this.ctx;
      c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(...p);c.lineTo(...q);c.stroke();
    }
    mesh(vertices,faces,origin,angle,color) {
      const s=Math.sin(angle),c=Math.cos(angle);
      const transformed=vertices.map(v=>this.camera([origin.x+v[0]*c+v[2]*s,v[1],origin.z-v[0]*s+v[2]*c]));
      const sorted=faces.map(f=>({v:f.map(i=>transformed[i]),depth:f.reduce((sum,i)=>sum+transformed[i][2],0)/f.length})).sort((a,b)=>b.depth-a.depth);
      for(const face of sorted) {
        let points=[];
        for(let i=0;i<face.v.length;i++) {
          const a=face.v[i],b=face.v[(i+1)%face.v.length];
          if(a[2]>=0.7)points.push(a);
          if((a[2]>=0.7)!==(b[2]>=0.7)) {
            const t=(0.7-a[2])/(b[2]-a[2]);points.push(a.map((v,j)=>v+(b[j]-v)*t));
          }
        }
        if(points.length<3)continue;
        const p=points.map(v=>this.project(v)),ctx=this.ctx;
        ctx.beginPath();ctx.moveTo(...p[0]);p.slice(1).forEach(v=>ctx.lineTo(...v));ctx.closePath();
        ctx.fillStyle='#030805';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.stroke();
      }
    }
    box(origin,angle,w,d,bottom,top,color) {
      const vertices=[[-w,bottom,-d],[w,bottom,-d],[w,bottom,d],[-w,bottom,d],[-w,top,-d],[w,top,-d],[w,top,d],[-w,top,d]];
      this.mesh(vertices,[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],origin,angle,color);
    }
    tank(e) {
      const color=e.windup>0?'#ff9478':e.hit>0?'#e3ffdb':e.type==='flanker'?'#c8ff67':'#9aff83';
      const shadow=this.ctx.shadowColor;this.ctx.shadowColor=color;
      const scale=e.type==='heavy'?1.2:1;
      this.box(e,e.angle,2.5*scale,3.1*scale,0.25,1.2,color);
      this.box(e,e.angle,1.7*scale,2*scale,1.2,2.0,color);
      this.box(e,e.angle,1.0*scale,1.1*scale,2,2.9,color);
      const dx=Math.sin(e.angle),dz=Math.cos(e.angle);
      this.line([e.x+dx,e.type==='heavy'?2.6:2.4,e.z+dz],[e.x+dx*4.7,2.4,e.z+dz*4.7],color,2);
      // Tread seams keep even distant tanks recognizable.
      for(const side of [-1,1])for(const end of [-2,0,2]) {
        const x=e.x+side*2.51*scale*Math.cos(e.angle)+end*Math.sin(e.angle);
        const z=e.z-side*2.51*scale*Math.sin(e.angle)+end*Math.cos(e.angle);
        this.line([x,.3,z],[x,1.1,z],color,.9);
      }
      if(e.type==='flanker')this.line([e.x,3.5,e.z],[e.x,5,e.z],'#c8ff67',1.5);
      this.ctx.shadowColor=shadow;
    }
    saucer(o) {
      const vertices=Array.from({length:8},(_,i)=>[Math.sin(i*Math.PI/4)*3.6,1.9,Math.cos(i*Math.PI/4)*3.6]);
      vertices.push([0,3.5,0],[0,.9,0]);
      const faces=Array.from({length:8},(_,i)=>[i,(i+1)%8,8]).concat(Array.from({length:8},(_,i)=>[i,9,(i+1)%8]));
      this.ctx.shadowColor='#ffd580';this.mesh(vertices,faces,o,0,'#ffd580');this.ctx.shadowColor='#75ff68';
    }
    pickup(o, time) {
      const h=1.8+Math.sin(time*3)*.2, color='#83f4e1';
      this.ctx.shadowColor=color;
      this.box(o,time*.5,1.5,1.5,.2,2.7,color);
      this.line([o.x-1,h+3,o.z],[o.x+1,h+3,o.z],color,2);
      this.line([o.x,h+2,o.z],[o.x,h+4,o.z],color,2);
      this.ctx.shadowColor='#75ff68';
    }
    landscape(state) {
      const c=this.ctx,w=this.width,h=this.height;
      c.shadowBlur=this.glow?5:0;c.shadowColor='#74ff60';
      c.strokeStyle='#487846';c.lineWidth=1;c.beginPath();
      const shift=(state.player.angle/(Math.PI*2))*w*2;
      for(let i=-16;i<=32;i++) {
        const x=i*w/12-shift;
        const peak=(i%3===0?0.16:i%2===0?0.1:0.055)*h;
        if(i===-16)c.moveTo(x,this.horizon-peak);else c.lineTo(x,this.horizon-peak);
      }
      c.stroke();c.beginPath();c.moveTo(0,this.horizon);c.lineTo(w,this.horizon);c.stroke();
      c.shadowBlur=0;
      for(let k=-200;k<=200;k+=25) {
        this.line([k,0,-200],[k,0,200],'#15381e',0.8);
        this.line([-200,0,k],[200,0,k],'#15381e',0.8);
      }
      // Dashed perimeter is a visible boundary, not an invisible wall.
      for(let i=0;i<80;i++) {
        const a=i/80*Math.PI*2,b=(i+.55)/80*Math.PI*2;
        this.line([Math.sin(a)*194,0,Math.cos(a)*194],[Math.sin(b)*194,0,Math.cos(b)*194],'#c6a65d',1);
      }
    }
    draw(state) {
      this.player=state.player;this.sin=Math.sin(this.player.angle);this.cos=Math.cos(this.player.angle);
      this.focal=this.width*.72;this.horizon=this.height*.43;
      const c=this.ctx,w=this.width,h=this.height;
      c.clearRect(0,0,w,h);c.fillStyle='#030805';c.fillRect(0,0,w,h);
      this.landscape(state);
      const objects=[...state.obstacles.map(o=>({o,type:'cover'})),...state.enemies.map(o=>({o,type:'tank'})),
        ...state.pickups.map(o=>({o,type:'pickup'})),...(state.saucer?[{o:state.saucer,type:'saucer'}]:[])];
      objects.sort((a,b)=>VectorPatrol.distance(b.o,this.player)-VectorPatrol.distance(a.o,this.player));
      c.shadowBlur=this.glow?5:0;c.shadowColor='#75ff68';
      for(const {o,type} of objects) {
        if(type==='tank'){this.tank(o);continue;}
        if(type==='saucer'){this.saucer(o);continue;}
        if(type==='pickup'){this.pickup(o,state.time);continue;}
        const r=o.radius*.707,color='#608f55';
        if(o.type==='pyramid')this.mesh([[-r,0,-r],[r,0,-r],[r,0,r],[-r,0,r],[0,o.height,0]],[[0,1,4],[1,2,4],[2,3,4],[3,0,4]],o,0,color);
        else this.box(o,0,r,r,0,o.height,color);
      }
      for(const b of state.bullets)this.line([b.x,1.8,b.z],[b.x-b.vx*.045,1.8,b.z-b.vz*.045],b.owner==='player'?'#dcffc9':'#ffab78',2.5);
      for(const p of state.particles)this.line([p.x,p.y,p.z],[p.x-p.vx*.06,p.y-p.vy*.06,p.z-p.vz*.06],p.color==='dim'?'#6a955c':p.color==='bonus'?'#ffd580':'#c3ffad',1.3);
      c.shadowBlur=0;
      const x=w/2,y=this.horizon+this.focal*.6/70;
      c.strokeStyle=this.player.cooldown>0?'#6e9c65':'#b6ff98';c.lineWidth=1.3;
      c.beginPath();c.moveTo(x-30,y);c.lineTo(x-10,y);c.moveTo(x+10,y);c.lineTo(x+30,y);
      c.moveTo(x,y-25);c.lineTo(x,y-9);c.moveTo(x,y+9);c.lineTo(x,y+25);c.stroke();
      c.strokeRect(x-3,y-3,6,6);
      if(this.player.cooldown>0){c.beginPath();c.arc(x,y,37,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-this.player.cooldown/.7));c.stroke();}
      if(state.muzzle>0){c.strokeStyle='#e6ffd8';c.strokeRect(x-8,y-8,16,16);}
      if(state.hitMarker>0){c.strokeStyle='#edffe0';c.beginPath();for(const dx of [-1,1])for(const dy of [-1,1]){c.moveTo(x+dx*12,y+dy*12);c.lineTo(x+dx*20,y+dy*20);}c.stroke();}
      const target=state.phase==='playing'&&VectorPatrol.sightTarget(state);
      if(target){
        const position=this.camera([target.x,1.8,target.z]);
        if(position[2]>.7){
          const [tx,ty]=this.project(position),size=VectorPatrol.clamp(this.focal*3.8/position[2],10,70);
          c.strokeStyle=target.type==='saucer'?'#ffd580':'#d0ffb2';c.beginPath();
          for(const dx of [-1,1])for(const dy of [-1,1]){c.moveTo(tx+dx*(size-6),ty+dy*size);c.lineTo(tx+dx*size,ty+dy*size);c.lineTo(tx+dx*size,ty+dy*(size-6));}c.stroke();
          c.fillStyle=c.strokeStyle;c.font='10px monospace';c.textAlign='center';c.fillText(`${target.type.toUpperCase()} · ${target.hp} HIT${target.hp>1?'S':''}`,tx,ty+size+17);
        }
      }
      // Small cockpit marks frame the playfield without obscuring the horizon.
      c.strokeStyle='#375939';c.lineWidth=1;c.beginPath();
      c.moveTo(16,h-55);c.lineTo(16,h-72);c.lineTo(42,h-72);
      c.moveTo(w-16,h-55);c.lineTo(w-16,h-72);c.lineTo(w-42,h-72);c.stroke();
      if(state.flash>0){c.strokeStyle='#e49471';c.lineWidth=3;c.strokeRect(3,3,w-6,h-6);}
      this.drawRadar(state);
    }
    drawRadar(state) {
      const c=this.rctx,x=70,y=48,r=39;
      c.clearRect(0,0,140,100);c.strokeStyle='#6b3930';c.lineWidth=.8;
      for(const radius of [r,r/2]){c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.stroke();}
      c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();
      c.fillStyle='#ff806c0b';c.beginPath();c.moveTo(x,y);c.arc(x,y,r,-Math.PI/2-.61,-Math.PI/2+.61);c.closePath();c.fill();c.stroke();
      const sweep=state.time*.9-Math.PI/2;
      c.strokeStyle='#a65e49';c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(sweep)*r,y+Math.sin(sweep)*r);c.stroke();
      for(const e of state.enemies) {
        const dx=e.x-state.player.x,dz=e.z-state.player.z;
        const rx=(dx*this.cos-dz*this.sin)/140*r,ry=-(dx*this.sin+dz*this.cos)/140*r;
        if(Math.hypot(rx,ry)>r)continue;
        c.fillStyle=e.windup>0?'#ffdfaf':'#ff856d';c.fillRect(x+rx-2,y+ry-2,4,4);
        if(e.type==='heavy'){c.strokeStyle='#ff856d';c.strokeRect(x+rx-3.5,y+ry-3.5,7,7);}
      }
      for(const o of [...state.pickups,...(state.saucer?[state.saucer]:[])]){
        const dx=o.x-state.player.x,dz=o.z-state.player.z;
        const rx=(dx*this.cos-dz*this.sin)/140*r,ry=-(dx*this.sin+dz*this.cos)/140*r;
        if(Math.hypot(rx,ry)>r)continue;
        c.strokeStyle=o.type==='saucer'?'#ffd580':'#83f4e1';c.beginPath();
        if(o.type==='saucer'){c.moveTo(x+rx,y+ry-3);c.lineTo(x+rx+4,y+ry);c.lineTo(x+rx,y+ry+3);c.lineTo(x+rx-4,y+ry);c.closePath();}
        else{c.moveTo(x+rx-3,y+ry);c.lineTo(x+rx+3,y+ry);c.moveTo(x+rx,y+ry-3);c.lineTo(x+rx,y+ry+3);}c.stroke();
      }
      c.fillStyle='#ffe8c9';c.beginPath();c.moveTo(x,y-4);c.lineTo(x-3,y+3);c.lineTo(x+3,y+3);c.closePath();c.fill();
    }
  }
  root.VectorView=View;
})(globalThis);
