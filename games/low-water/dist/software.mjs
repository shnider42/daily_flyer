/* Canvas compatibility renderer: clipped 3D polygons, no WebGL dependency. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const COLORS={wall:[100,119,107],lower:[32,68,59],floor:[59,77,68],ceiling:[22,37,32],metal:[71,97,83],dark:[19,36,30],rust:[120,79,51],amber:[190,149,67],cream:[174,189,158],lamp:[216,223,170],teal:[99,166,141],water:[34,85,76],black:[10,20,17]};

function midpoint(points){return points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length,a[2]+p[2]/points.length],[0,0,0]);}
function makePoly(points,color,normal=null,extra={}){
  const center=midpoint(points);
  const radius=Math.max(...points.map(p=>Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])));
  return {points,color,normal,center,radius,...extra};
}
function addBox(list,x,y,z,w,h,d,color,rotation=0){
  const c=Math.cos(rotation),s=Math.sin(rotation);
  const v=(px,py,pz)=>[x+px*c+pz*s,y+py,z-px*s+pz*c];
  const n=(nx,ny,nz)=>[nx*c+nz*s,ny,-nx*s+nz*c];
  const a=w/2,b=h/2,e=d/2;
  const p=[v(-a,-b,-e),v(a,-b,-e),v(a,b,-e),v(-a,b,-e),v(-a,-b,e),v(a,-b,e),v(a,b,e),v(-a,b,e)];
  for(const [indices,normal] of [[[0,3,2,1],n(0,0,-1)],[[4,5,6,7],n(0,0,1)],[[0,4,7,3],n(-1,0,0)],[[1,2,6,5],n(1,0,0)],[[3,7,6,2],n(0,1,0)]])list.push(makePoly(indices.map(i=>p[i]),color,normal));
}
function addCylinder(list,x,y,z,radius,h,color,segments=8){
  const top=[];
  for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
    const ax=x+Math.sin(a)*radius,az=z+Math.cos(a)*radius,bx=x+Math.sin(b)*radius,bz=z+Math.cos(b)*radius;
    list.push(makePoly([[ax,y,az],[bx,y,bz],[bx,y+h,bz],[ax,y+h,az]],color,[Math.sin((a+b)/2),0,Math.cos((a+b)/2)]));
    top.push([ax,y+h,az]);
  }
  list.push(makePoly(top,color,[0,1,0]));
}
function clipNear(points,near){
  const out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],insideA=a[2]>=near,insideB=b[2]>=near;
    if(insideA)out.push(a);
    if(insideA!==insideB){const t=(near-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,near]);}
  }
  return out;
}

export class SoftwareView {
  constructor(canvas,level){
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('A Canvas 2D context is unavailable.');
    this.width=canvas.width||960;this.height=canvas.height||540;
    this.static=[];this.labels=[];this.lastTime=0;this.gateLift=new Map();this.waterHeight=null;this.bridgeProgress=null;
    this.stats={polygons:0,renderer:'software'};
    this.setLevel(level);
  }

  resize(width,height){
    // The compatibility tier spends its budget on room geometry, not high DPI.
    const scale=Math.min(1,1100/Math.max(1,width));
    this.width=Math.max(240,Math.round(width*scale));this.height=Math.max(180,Math.round(height*scale));
    this.canvas.width=this.width;this.canvas.height=this.height;
    this.ctx.imageSmoothingEnabled=true;
  }

  setLevel(level){
    this.level=level;
    this.static=[];this.labels=[];this.gateLift.clear();this.waterHeight=null;this.bridgeProgress=null;
    if(!level)return;
    const cells=new Map();
    for(const room of level.rooms||[]){
      for(let x=room.x;x<room.x+room.w-.01;x+=2)for(let z=room.z;z<room.z+room.d-.01;z+=2){
        const old=cells.get(`${x},${z}`);
        if(!old||(room.y||0)>=(old.room.y||0))cells.set(`${x},${z}`,{x,z,room});
      }
    }
    this.cells=cells;
    const rampAt=(x,z)=>(level.ramps||[]).some(r=>x>=r.x&&x<=r.x+r.w&&z>=r.z&&z<=r.z+r.d);
    const wallRuns=new Map(),floorRows=new Map();
    for(const {x,z,room} of cells.values()){
      const y=room.y||0,h=room.h||6,open=room.open||room.kind==='dock';
      if(!rampAt(x+1,z+1)&&!room.void){
        const key=[z,y,room.kind].join('|');if(!floorRows.has(key))floorRows.set(key,[]);floorRows.get(key).push({x,z,y,room});
      }
      // Coarse ceiling segments make depth legible without a second full tile grid.
      if(!open&&!room.noRoof&&x%4===0&&z%4===0){
        const w=cells.has(`${x+2},${z}`)?4:2,d=cells.has(`${x},${z+2}`)?4:2;
        this.static.push(makePoly([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]],COLORS.ceiling,[0,-1,0]));
      }
      for(const side of [{dx:-2,dz:0,axis:'z',fixed:x,start:z,n:[1,0,0]},{dx:2,dz:0,axis:'z',fixed:x+2,start:z,n:[-1,0,0]},{dx:0,dz:-2,axis:'x',fixed:z,start:x,n:[0,0,1]},{dx:0,dz:2,axis:'x',fixed:z+2,start:x,n:[0,0,-1]}]){
        const adjacent=cells.get(`${x+side.dx},${z+side.dz}`);
        if(adjacent){
          const higher=(adjacent.room.y||0)-y;
          if(higher>.1&&!rampAt(x+1+side.dx/2,z+1+side.dz/2))this.wallSegment(side.axis,side.fixed,side.start,side.start+2,y,y+higher,COLORS.wall,side.n);
          continue;
        }
        const key=[side.axis,side.fixed,y,h,room.kind,open?1:0,...side.n].join('|');
        if(!wallRuns.has(key))wallRuns.set(key,{...side,y,h,room,open,starts:[]});
        wallRuns.get(key).starts.push(side.start);
      }
    }
    for(const rows of floorRows.values()){
      rows.sort((a,b)=>a.x-b.x);
      for(let i=0;i<rows.length;){
        const first=rows[i];let width=2;i++;
        while(i<rows.length&&rows[i].x===first.x+width&&width<6){width+=2;i++;}
        const {x,z,y,room}=first;
        const tint=(Math.floor(x/4)+Math.floor(z/4))%2?1.04:.97;
        const color=(['office','lab'].includes(room.kind)?[88,107,92]:COLORS.floor).map(v=>v*tint);
        this.addFloor(x,z,width,2,y,color);
      }
    }
    for(const run of wallRuns.values()){
      run.starts.sort((a,b)=>a-b);
      for(let i=0;i<run.starts.length;){
        const start=run.starts[i];let end=start+2;i++;
        while(i<run.starts.length&&run.starts[i]===end&&end-start<8){end+=2;i++;}
        if(run.open){
          this.wallSegment(run.axis,run.fixed,start,end,run.y+.45,run.y+.52,COLORS.amber,run.n);
          this.wallSegment(run.axis,run.fixed,start,end,run.y+1.02,run.y+1.1,COLORS.amber,run.n);
          for(let p=start;p<=end;p+=2){const x=run.axis==='x'?p:run.fixed,z=run.axis==='z'?p:run.fixed;addBox(this.static,x,run.y+.55,z,.07,1.1,.07,COLORS.amber);}
        } else {
          this.wallSegment(run.axis,run.fixed,start,end,run.y,run.y+1.15,COLORS.lower,run.n);
          this.wallSegment(run.axis,run.fixed,start,end,run.y+1.15,run.y+1.23,COLORS.amber,run.n);
          this.wallSegment(run.axis,run.fixed,start,end,run.y+1.23,run.y+run.h,COLORS.wall,run.n);
          // Thin upright bulkheads repeat at human scale along long rooms.
          for(let p=start+.04;p<end;p+=4){const x=run.axis==='x'?p:run.fixed+run.n[0]*.04,z=run.axis==='z'?p:run.fixed+run.n[2]*.04;addBox(this.static,x,run.y+run.h/2,z,.10,run.h,.10,COLORS.dark);}
        }
      }
    }
    for(const r of level.ramps||[]){
      const low=r.fromY||0,high=r.toY||0;
      const points=r.axis==='x'?[[r.x,low,r.z],[r.x,low,r.z+r.d],[r.x+r.w,high,r.z+r.d],[r.x+r.w,high,r.z]]:[[r.x,low,r.z],[r.x,high,r.z+r.d],[r.x+r.w,high,r.z+r.d],[r.x+r.w,low,r.z]];
      this.static.push(makePoly(points,[88,100,78],null,{floor:true}));
      for(let i=1;i<6;i++){
        const t=i/6,y=low+(high-low)*t+.014;
        if(r.axis==='x')addBox(this.static,r.x+r.w*t,y,r.z+r.d/2,.04,.025,r.d,COLORS.dark);
        else addBox(this.static,r.x+r.w/2,y,r.z+r.d*t,r.w,.025,.04,COLORS.dark);
      }
    }
    for(const room of level.rooms||[])this.decorateRoom(room);
    for(const prop of level.props||[])this.addProp(prop);
    const bridge=level.bridge;
    if(bridge?.requires){
      const x0=bridge.x-bridge.w/2,x1=bridge.x+bridge.w/2,z0=bridge.z-bridge.d/2,z1=bridge.z+bridge.d/2,y=bridge.y||0;
      this.static.push(makePoly([[x0,y-3,z0],[x0,y-3,z1],[x1,y-3,z1],[x1,y-3,z0]],COLORS.black,[0,1,0]));
      this.wallSegment('z',x0,z0,z1,y-3,y,COLORS.dark,[1,0,0]);
      this.wallSegment('z',x1,z0,z1,y-3,y,COLORS.dark,[-1,0,0]);
      this.wallSegment('x',z0,x0,x1,y-3,y,COLORS.lower,[0,0,1]);
      this.wallSegment('x',z1,x0,x1,y-3,y,COLORS.lower,[0,0,-1]);
      for(const z of [z0-.07,z1+.07])addBox(this.static,bridge.x,y+.015,z,bridge.w,.03,.14,COLORS.amber);
    }
  }

  addFloor(x,z,w,d,y,color){
    const bridge=this.level.bridge;
    const rectangles=[];
    if(bridge?.requires&&Math.abs((bridge.y||0)-y)<.1){
      const x0=Math.max(x,bridge.x-bridge.w/2),x1=Math.min(x+w,bridge.x+bridge.w/2),z0=Math.max(z,bridge.z-bridge.d/2),z1=Math.min(z+d,bridge.z+bridge.d/2);
      if(x1>x0&&z1>z0)rectangles.push([x,z,x0,z+d],[x1,z,x+w,z+d],[x0,z,x1,z0],[x0,z1,x1,z+d]);
      else rectangles.push([x,z,x+w,z+d]);
    }else rectangles.push([x,z,x+w,z+d]);
    for(const [a,b,c,dz] of rectangles)if(c-a>.001&&dz-b>.001)this.static.push(makePoly([[a,y,b],[a,y,dz],[c,y,dz],[c,y,b]],color,[0,1,0],{floor:true}));
  }

  wallSegment(axis,fixed,a,b,y0,y1,color,normal){
    const points=axis==='x'?[[a,y0,fixed],[b,y0,fixed],[b,y1,fixed],[a,y1,fixed]]:[[fixed,y0,a],[fixed,y0,b],[fixed,y1,b],[fixed,y1,a]];
    this.static.push(makePoly(points,color,normal));
  }

  floorAt(x,z){
    const candidates=(this.level.rooms||[]).filter(r=>x>=r.x&&x<=r.x+r.w&&z>=r.z&&z<=r.z+r.d);
    return candidates.length?Math.max(...candidates.map(r=>r.y||0)):0;
  }

  decorateRoom(r){
    const y=r.y||0,h=r.h||6,x=r.x,z=r.z,mx=x+r.w/2,mz=z+r.d/2;
    const corridor=r.kind==='corridor';
    if(!r.open&&r.kind!=='dock'){
      const count=Math.min(3,Math.max(1,Math.floor(r.d/6)));
      for(let i=0;i<count;i++){
        const lz=z+(i+.5)*r.d/count;
        addBox(this.static,mx,y+h-.25,lz,Math.min(2.5,r.w-1),.12,.32,COLORS.lamp);
      }
      // Two large ducts rather than dozens of tiny boxes keep this tier usable.
      addBox(this.static,x+.55,y+h-.65,mz,.24,.24,r.d-.3,COLORS.rust);
      addBox(this.static,x+.98,y+h-.58,mz,.14,.14,r.d-.3,COLORS.metal);
    }
    if(!corridor){
      this.labels.push({point:[mx,y+2.3,z+.26],normal:[0,0,1],text:r.name||r.id||'',color:COLORS.cream});
      if(['office','arrival','lab'].includes(r.kind)){
        addBox(this.static,x+.9,y+.78,z+1.3,1.2,.12,.7,COLORS.metal);
        addBox(this.static,x+.9,y+1.1,z+1.2,.48,.45,.30,COLORS.dark);
        addBox(this.static,x+.9,y+1.12,z+1.37,.36,.26,.02,COLORS.teal);
      }
    }
  }

  addProp(p){
    const list=this.static,x=p.x,z=p.z,y=p.y??this.floorAt(x,z),w=p.w||1.2,d=p.d||1.2,h=p.h||1.3,type=p.type||'crate',rot=p.rotation||0;
    if(type==='sign'||type==='decal'||type==='poster'){
      this.labels.push({point:[x,y+1.7,z],normal:null,text:p.text||p.label||'',color:COLORS.cream});return;
    }
    if(type==='partition'){
      // The centre pane stays dark and translucent-looking while the frame and
      // upper bulkhead retain a clear separation between reference cells.
      const windowBottom=Math.min(h*.35,1.1),windowTop=Math.min(h-.4,2.65);
      addBox(list,x,y+windowBottom/2,z,w,windowBottom,d,COLORS.lower,rot);
      addBox(list,x,y+(windowTop+h)/2,z,w,h-windowTop,d,COLORS.wall,rot);
      const sx=Math.sin(rot),cx=Math.cos(rot),alongX=w>=d;
      const glassColor=[41,74,66];
      const paneStart=list.length;
      addBox(list,x,y+(windowTop+windowBottom)/2,z,w,windowTop-windowBottom,d,glassColor,rot);
      for(let i=paneStart;i<list.length;i++)list[i].alpha=.22;
      const span=alongX?w:d;
      for(let at=-span/2;at<=span/2+.01;at+=Math.max(1,span/3)){
        const px=x+(alongX?at*cx:at*sx),pz=z+(alongX?-at*sx:at*cx);
        addBox(list,px,y+(windowTop+windowBottom)/2,pz,.07,windowTop-windowBottom,.07,COLORS.metal);
      }
      addBox(list,x,y+windowBottom,z,w+.03,.07,d+.03,COLORS.amber,rot);
    }else if(/tank|barrel|turbine|pump|reactor|core/.test(type)){
      addCylinder(list,x,y,z,Math.max(.3,Math.min(w,d)/2),h,type.includes('core')?COLORS.teal:COLORS.metal,8);
      addBox(list,x,y+h*.7,z,w*1.08,.13,d*1.08,COLORS.rust,rot);
    }else if(/desk|console|table/.test(type)){
      addBox(list,x,y+.8,z,w,.18,d,COLORS.metal,rot);
      addBox(list,x,y+.4,z,w*.65,.8,d*.65,COLORS.dark,rot);
      if(type!=='table')addBox(list,x,y+1.12,z,.55,.45,.32,COLORS.teal,rot);
    }else if(type==='pillar'||type==='column')addBox(list,x,y+h/2,z,w,h,d,COLORS.wall,rot);
    else if(/locker|cabinet|server/.test(type)){
      addBox(list,x,y+h/2,z,w,h,d,COLORS.lower,rot);
      addBox(list,x,y+h*.55,z+d*.51,w*.7,.05,.02,COLORS.amber,rot);
    }else if(type==='light')addBox(list,x,y,z,w,.12,d,COLORS.lamp,rot);
    else if(type==='bridge')addBox(list,x,y-.1,z,w,.2,d,COLORS.metal,rot);
    else {
      addBox(list,x,y+h/2,z,w,h,d,type==='crate'?COLORS.rust:COLORS.metal,rot);
      addBox(list,x,y+h*.72,z,w+.03,.08,d+.03,COLORS.dark,rot);
    }
  }

  dynamicGeometry(state,time,dt){
    const list=[],labels=[];
    const bridge=this.level.bridge;
    if(bridge?.requires){
      const target=state[bridge.requires]?1:0;
      this.bridgeProgress=this.bridgeProgress===null?target:this.bridgeProgress+(target-this.bridgeProgress)*(1-Math.exp(-dt*2.2));
      if(this.bridgeProgress>.015){
        const length=bridge.w*this.bridgeProgress,x=bridge.x-bridge.w/2+length/2,y=bridge.y||0;
        addBox(list,x,y-.12,bridge.z,length,.24,bridge.d,COLORS.metal);
        for(const z of [bridge.z-bridge.d/2+.04,bridge.z+bridge.d/2-.04])addBox(list,x,y+.02,z,length,.04,.10,COLORS.amber);
        const divisions=Math.floor(length/.7);
        for(let i=0;i<divisions;i++)addBox(list,bridge.x-bridge.w/2+.3+i*.7,y+.018,bridge.z,.045,.02,bridge.d-.2,COLORS.dark);
      }
    }
    for(const g of this.level.gates||[]){
      const target=state[g.requires]?1:0,old=this.gateLift.get(g.id)??target;
      const lift=old+(target-old)*(1-Math.exp(-dt*4));this.gateLift.set(g.id,lift);
      const h=g.h||3,y=g.y??this.floorAt(g.x,g.z);
      addBox(list,g.x,y+h/2+lift*(h+.2),g.z,g.w||3,h,g.d||.3,COLORS.lower);
      addBox(list,g.x,y+.25+lift*(h+.2),g.z,(g.w||3)+.03,.25,(g.d||.3)+.03,COLORS.amber);
      addBox(list,g.x,y+h+.2,g.z,(g.w||3)+.4,.35,(g.d||.3)+.4,COLORS.dark);
      const marker=state[g.requires]?COLORS.teal:COLORS.amber;
      addBox(list,g.x,y+h+.22,g.z+.23,.5,.13,.03,marker);
    }
    const water=this.level.water;
    if(water){
      const target=state[water.flag||'waterDrained']?(water.low??-.4):(water.high??.7);
      this.waterHeight=this.waterHeight===null?target:this.waterHeight+(target-this.waterHeight)*(1-Math.exp(-dt*.85));
      const x0=water.x-water.w/2,z0=water.z-water.d/2,y=this.waterHeight+Math.sin(time*.7)*.008;
      for(let i=0;i<water.w;i+=4)for(let j=0;j<water.d;j+=4){
        const x=x0+i,z=z0+j,w=Math.min(4,water.w-i),d=Math.min(4,water.d-j);
        const tint=1+Math.sin(time*.6+i*.5+j*.3)*.06;
        list.push(makePoly([[x,y,z],[x,y,z+d],[x+w,y,z+d],[x+w,y,z]],COLORS.water.map(v=>v*tint),[0,1,0],{water:true}));
      }
    }
    for(const item of this.level.interactables||[]){
      if((item.id==='arc-tool'||item.type==='pickup')&&state.tool)continue;
      const x=item.x,z=item.z,y=item.y??this.floorAt(x,z)+1.3,rot=item.rotation||0;
      const note=item.type==='note';
      let active=item.id==='crane-breaker'?!!state.breakers?.crane:item.id==='exit-breaker'?!!state.breakers?.exit:item.id==='intake-valve'?state.intakeClosed:item.id==='bypass-valve'?state.bypassOpen:item.id==='emergency-seal'?state.evacReady:state[this.level.exit?.requires];
      const color=note?COLORS.cream:active?COLORS.teal:COLORS.amber;
      addBox(list,x,y-.1,z,note?.4:.72,note?.55:.8,note?.035:.38,note?COLORS.cream:COLORS.lower,rot);
      if(!note){
        const offset=.22,s=Math.sin(rot),c=Math.cos(rot);
        addBox(list,x+s*offset,y+.03,z+c*offset,.38,.22,.04,color,rot);
        if(item.type==='damper'){
          const index=item.id.endsWith('a')?0:item.id.endsWith('b')?1:2;
          labels.push({point:[x,y+.12,z+.24],text:String(state.dampers?.[index]||1),color:COLORS.cream,small:true});
        }
      }
      labels.push({point:[x,y+.7,z],text:item.label||item.id,color:COLORS.cream,small:true});
    }
    for(const enemy of state.enemies||[]){
      if(enemy.alive===false)continue;
      const x=enemy.x,z=enemy.z,y=enemy.y??this.floorAt(x,z),sway=Math.sin(time*2.2+x)*.04;
      const eyes=enemy.stunned>0?COLORS.teal:COLORS.cream;
      if(enemy.kind==='watcher'){
        addBox(list,x,y+1.4+sway,z,.65,.65,.65,COLORS.dark,time*.3);
        addBox(list,x,y+1.4+sway,z+.34,.2,.05,.03,eyes);
      }else{
        const rotation=Math.atan2((state.player?.x||0)-x,(state.player?.z||0)-z);
        addBox(list,x,y+1.0+sway,z,.42,.78,.30,COLORS.dark,rotation);
        addBox(list,x,y+1.61+sway,z,.26,.34,.25,COLORS.lower,rotation);
        for(const side of [-1,1]){
          addBox(list,x+side*.13,y+.34,z,.14,.68,.17,COLORS.dark,rotation);
          addBox(list,x+side*.3,y+.92+sway,z,.12,.85,.14,COLORS.lower,rotation);
        }
        addBox(list,x+Math.sin(rotation)*.14,y+1.65+sway,z+Math.cos(rotation)*.14,.16,.035,.03,eyes,rotation);
      }
    }
    return {list,labels};
  }

  transform(point,e){
    const [x,y,z]=point;
    return [e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],-(e[2]*x+e[6]*y+e[10]*z+e[14])];
  }

  projectPolygon(poly,e,camera,focal){
    const center=poly.center,n=poly.normal,dx=camera.position.x-center[0],dy=camera.position.y-center[1],dz=camera.position.z-center[2];
    if(n&&n[0]*dx+n[1]*dy+n[2]*dz<-.02)return null;
    if(Math.hypot(dx,dy,dz)-poly.radius>42)return null;
    const view=poly.points.map(p=>this.transform(p,e));
    if(view.every(p=>p[2]<.07))return null;
    const clipped=clipNear(view,.07);if(clipped.length<3)return null;
    const points=clipped.map(p=>[this.width/2+p[0]*focal/p[2],this.height/2-p[1]*focal/p[2]]);
    if(points.every(p=>p[0]<0)||points.every(p=>p[0]>this.width)||points.every(p=>p[1]<0)||points.every(p=>p[1]>this.height))return null;
    const depth=clipped.reduce((sum,p)=>sum+p[2],0)/clipped.length;
    return {...poly,points,depth,viewCenter:this.transform(center,e)};
  }

  shade(poly,state,brightness){
    const fog=clamp((poly.depth-5)/36,0,.9),n=poly.normal;
    const lamp=poly.color===COLORS.lamp;
    let light=lamp?1.12:n?.[1]>.5?.77:n?.[1]<-.5?.67:.88+Math.abs(n?.[0]||0)*.12;
    const v=poly.viewCenter;
    if(state.flashlight&&v?.[2]>.05){
      const angular=Math.hypot(v[0],v[1])/(v[2]+.5);
      light+=Math.max(0,1-angular*1.7)*Math.max(0,.56-poly.depth*.018);
    }
    brightness=Number(brightness)||Number(state.brightness)||1.08;
    const fogColor=state.chapter===4?[20,29,24]:[15,29,26];
    return `rgb(${poly.color.map((c,i)=>Math.round(clamp(c*light*brightness*(1-fog)+fogColor[i]*fog,0,255))).join(',')})`;
  }

  render(state,camera,time=0,brightness=1.08){
    if(!this.level||!camera)return;
    const ctx=this.ctx,w=this.width,h=this.height,dt=clamp(time-this.lastTime,0,.1);this.lastTime=time;
    camera.updateMatrixWorld?.(true);
    const e=camera.matrixWorldInverse.elements,focal=h/(2*Math.tan((camera.fov||76)*Math.PI/360));
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#12251f');sky.addColorStop(.5,'#203c33');sky.addColorStop(1,'#0e1b16');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const dynamic=this.dynamicGeometry(state,time,dt),queue=[];
    for(const poly of [...this.static,...dynamic.list]){const projected=this.projectPolygon(poly,e,camera,focal);if(projected)queue.push(projected);}
    for(const label of [...this.labels,...dynamic.labels]){
      if(!label.text)continue;
      const n=label.normal,p=label.point;
      if(n&&(camera.position.x-p[0])*n[0]+(camera.position.y-p[1])*n[1]+(camera.position.z-p[2])*n[2]<0)continue;
      const v=this.transform(p,e);if(v[2]<.3||v[2]>18)continue;
      const x=w/2+v[0]*focal/v[2],y=h/2-v[1]*focal/v[2];
      if(x<0||x>w||y<0||y>h)continue;
      queue.push({label:true,text:label.text,small:label.small,depth:v[2]-.02,x,y,scale:clamp(focal/v[2]*.11,8,18)});
    }
    queue.sort((a,b)=>b.depth-a.depth);
    const visible=queue.length>650?queue.slice(-650):queue;
    for(const poly of visible){
      if(poly.label){
        const size=poly.scale;if(size<9&&poly.small)continue;
        ctx.font=`${poly.small?'500':'700'} ${Math.round(size)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
        const text=String(poly.text).toUpperCase(),width=Math.min(w*.7,ctx.measureText(text).width+12);
        ctx.fillStyle='rgba(12,31,24,.94)';ctx.fillRect(poly.x-width/2,poly.y-size*.7,width,size*1.4);
        ctx.fillStyle='#d1dcc1';ctx.fillText(text,poly.x,poly.y,width-8);continue;
      }
      ctx.beginPath();ctx.moveTo(...poly.points[0]);for(let i=1;i<poly.points.length;i++)ctx.lineTo(...poly.points[i]);ctx.closePath();
      ctx.globalAlpha=poly.alpha??1;
      ctx.fillStyle=this.shade(poly,state,brightness);ctx.fill();
      ctx.globalAlpha=1;
      if(poly.floor||poly.water){ctx.strokeStyle=poly.water?'rgba(130,184,155,.07)':'rgba(8,23,16,.15)';ctx.lineWidth=.65;ctx.stroke();}
    }
    const vignette=ctx.createRadialGradient(w/2,h/2,h*.15,w/2,h/2,Math.hypot(w,h)*.58);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,8,4,.43)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    this.stats.polygons=visible.filter(p=>!p.label).length;
  }

  dispose(){this.static.length=0;this.labels.length=0;this.cells?.clear();this.gateLift.clear();}
}
