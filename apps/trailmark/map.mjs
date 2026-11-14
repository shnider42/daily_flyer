const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };

/** An offline vector map. World units are local meters; north always stays up. */
export class TrailMap {
  constructor(container, area, onCheckpoint) {
    this.container = container;
    this.area = area;
    this.onCheckpoint = onCheckpoint;
    this.origin = area.center;
    this.view = {x:-500,y:-500,w:1000,h:1000};
    this.pointers = new Map();
    this.route = null;
    this.fix = null;
    this.track = [];
    this.svg = svgEl('svg', { role:'img', 'aria-label':'Four Ponds trail network and selected route', preserveAspectRatio:'xMidYMid meet' });
    const title = svgEl('title'); title.textContent = 'Four Ponds mapped trail network. Select a checkpoint in the route list for details.'; this.svg.append(title);
    this.base = svgEl('g'); this.network = svgEl('g'); this.routeGroup = svgEl('g'); this.trackGroup = svgEl('g'); this.labels = svgEl('g'); this.placesGroup = svgEl('g'); this.positionGroup = svgEl('g');
    this.svg.append(this.base, this.network, this.routeGroup, this.trackGroup, this.labels, this.placesGroup, this.positionGroup);
    container.append(this.svg);
    this.bind();
    this.resizeObserver = new ResizeObserver(() => { if(this.route) this.fit(false); });
    this.resizeObserver.observe(container);
  }
  project([lng,lat]) { return [(lng-this.origin[0])*111195*Math.cos(this.origin[1]*Math.PI/180), -(lat-this.origin[1])*111195]; }
  path(coordinates, close=false) { return coordinates.map((c,i)=>`${i?'L':'M'}${this.project(c).map(v=>v.toFixed(2)).join(',')}`).join('')+(close?'Z':''); }
  setRoute(route) {
    this.route = route;
    this.origin = route.validation === 'imported' ? route.coordinates[Math.floor(route.coordinates.length/2)] : this.area.center;
    this.renderBase();
    this.routeGroup.replaceChildren(svgEl('path',{d:this.path(route.coordinates),class:'route-casing'}), svgEl('path',{d:this.path(route.coordinates),class:'route-line'}));
    this.fit();
  }
  renderBase() {
    this.base.replaceChildren(); this.network.replaceChildren(); this.labelData=[];
    const nearby = Math.abs(this.origin[0]-this.area.center[0])<.1 && Math.abs(this.origin[1]-this.area.center[1])<.1;
    if (!nearby) return;
    const features = this.area.landFeatures?.features || [];
    for (const feature of features) {
      const g = feature.geometry; const p = feature.properties || {};
      const isWater = p.kind==='water' || p.type==='water' || p.natural==='water' || p.water;
      const isRoad = p.kind==='road' || p.type==='road' || p.highway;
      const polygons = g.type==='Polygon'?[g.coordinates] : g.type==='MultiPolygon'?g.coordinates : [];
      for (const polygon of polygons) this.base.append(svgEl('path',{d:polygon.map(r=>this.path(r,true)).join(''),fill:isWater?'#bfd8d5':'#dce5cd',stroke:isWater?'#a8c8c2':'#c8d5b7','stroke-width':isWater?1.2:1,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd'}));
      if (isRoad && g.type==='LineString') {
        this.base.append(svgEl('path',{d:this.path(g.coordinates),fill:'none',stroke:'#c3c9b6','stroke-width':11,'vector-effect':'non-scaling-stroke'}),svgEl('path',{d:this.path(g.coordinates),fill:'none',stroke:'#f3f0dc','stroke-width':8,'vector-effect':'non-scaling-stroke'}));
        if(p.name&&['Barlows Landing Road','Observatory Lane'].includes(p.name))this.labelData.push({name:p.name,coordinate:g.coordinates[Math.floor(g.coordinates.length/2)]});
      }
      if(p.kind==='stream'&&g.type==='LineString')this.base.append(svgEl('path',{d:this.path(g.coordinates),fill:'none',stroke:'#aaccc7','stroke-width':2,'vector-effect':'non-scaling-stroke'}));
      if (isWater && p.name && polygons.length) {
        const coords=polygons[0][0]; const sum=coords.reduce((s,c)=>[s[0]+c[0],s[1]+c[1]],[0,0]);
        this.labelData.push({name:p.name,coordinate:sum.map(v=>v/coords.length),water:true});
      }
    }
    for (const feature of this.area.trails?.features || []) {
      const lines=feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:feature.geometry.type==='LineString'?[feature.geometry.coordinates]:[];
      for (const line of lines) this.network.append(svgEl('path',{d:this.path(line),class:'trail-path'}));
    }
    if(!this.labelData.length) for(const p of this.area.places||[]) if(p.type==='pond') this.labelData.push({...p,water:true});
  }
  fit() {
    if(!this.route) return;
    const coords=this.route.coordinates.map(p=>this.project(p));
    const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const bounds=this.container.getBoundingClientRect(), aspect=Math.max(0.4,bounds.width/Math.max(bounds.height,1));
    let w=Math.max(260,x1-x0)*1.38,h=Math.max(260,y1-y0)*1.38;
    if(w/h<aspect) w=h*aspect; else h=w/aspect;
    this.view={x:(x0+x1-w)/2,y:(y0+y1-h)/2,w,h};
    this.draw();
  }
  centerOn(coordinate, desiredWidth=null) {
    if(!coordinate) return;
    const [x,y]=this.project(coordinate);
    if(desiredWidth){const ratio=this.view.h/this.view.w;this.view.w=desiredWidth;this.view.h=desiredWidth*ratio;}
    this.view.x=x-this.view.w/2;this.view.y=y-this.view.h/2;this.draw();
  }
  zoom(factor,screenPoint=null) {
    const b=this.container.getBoundingClientRect();
    const sx=screenPoint?(screenPoint[0]-b.left)/b.width:.5,sy=screenPoint?(screenPoint[1]-b.top)/b.height:.5;
    const newW=Math.max(90,Math.min(18000,this.view.w/factor)),newH=newW*this.view.h/this.view.w;
    this.view.x+=(this.view.w-newW)*sx;this.view.y+=(this.view.h-newH)*sy;this.view.w=newW;this.view.h=newH;this.draw();
  }
  setPosition(fix,options={}){this.fix=fix;this.positionOptions=options;this.drawPosition();}
  setTrack(track){this.track=track||[];this.drawTrack();}
  selectCheckpoint(id){this.selectedCheckpoint=id;this.drawPlaces();}
  draw() {
    const v=this.view;this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
    this.unit=v.w/Math.max(1,this.container.clientWidth);
    this.drawLabels();this.drawPlaces();this.drawPosition();this.drawTrack();
    const meters=80*this.unit;const scale=[10,20,50,100,200,500,1000,2000].filter(x=>x<=meters).pop()||10;
    const label=document.getElementById('map-scale');if(label){label.textContent=scale>=1000?`${scale/1000} km`:`${scale} m`;label.style.width=`${scale/this.unit}px`;label.style.minWidth='0';}
  }
  drawLabels(){
    this.labels.replaceChildren();
    for(const l of this.labelData||[]){const [x,y]=this.project(l.coordinate);const group=svgEl('g',{transform:`translate(${x} ${y}) scale(${this.unit})`});const label=svgEl('text',{class:l.water?'water-label':'map-label','text-anchor':'middle','font-size':l.water?14:11});label.textContent=l.name;group.append(label);this.labels.append(group);}
  }
  drawPlaces(){
    this.placesGroup.replaceChildren();
    if(!this.route)return;
    const points=this.route.waypoints||[];
    const seen=new Set();
    points.forEach((point,i)=>{
      const key=point.coordinate.join(',');if(seen.has(key))return;seen.add(key);
      const shared=points.filter(p=>p.coordinate.join(',')===key);const labels=shared.map(p=>p.label||String.fromCharCode(65+points.indexOf(p))).join('/');const selected=shared.some(p=>p.id===this.selectedCheckpoint);
      const [x,y]=this.project(point.coordinate);const group=svgEl('g',{transform:`translate(${x} ${y}) scale(${this.unit})`,class:`map-junction${selected?' selected':''}`,role:'button',tabindex:'0','aria-label':`${labels}: ${point.name}`});
      group.append(svgEl('circle',{r:labels.length>1?15:13}));const text=svgEl('text',{y:0});text.textContent=labels;group.append(text);
      const title=svgEl('title');title.textContent=point.name;group.append(title);group.addEventListener('click',e=>{e.stopPropagation();this.onCheckpoint?.(point,i);});group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.onCheckpoint?.(point,i);}});this.placesGroup.append(group);
    });
    const p=this.route.coordinates[0];const [x,y]=this.project(p);const group=svgEl('g',{transform:`translate(${x} ${y}) scale(${this.unit})`,class:'parking-pin'});group.append(svgEl('rect',{x:-12,y:-12,width:24,height:24,rx:4}));const text=svgEl('text');text.textContent=this.route.validation==='imported'?'S':'P';group.append(text);const title=svgEl('title');title.textContent=this.route.validation==='imported'?'Route start':'Mapped parking entrance';group.append(title);this.placesGroup.append(group);
  }
  drawPosition(){
    this.positionGroup.replaceChildren(); if(!this.fix || !this.unit)return;
    const [x,y]=this.project([this.fix.longitude,this.fix.latitude]);const o=this.positionOptions||{};
    const color=o.stale||o.uncertain?'#7c8178':o.demo?'#b67c26':'#276abb';
    this.positionGroup.append(svgEl('circle',{cx:x,cy:y,r:Math.min(500,this.fix.accuracy),fill:color,'fill-opacity':'.12',stroke:color,'stroke-opacity':'.35','stroke-width':1,'vector-effect':'non-scaling-stroke'}));
    const marker=svgEl('g',{transform:`translate(${x} ${y}) scale(${this.unit})`});marker.append(svgEl('circle',{r:8,fill:color,stroke:'#fff','stroke-width':3}));
    const title=svgEl('title');title.textContent=`${o.demo?'Simulated':'Last reported'} position; accuracy ±${Math.round(this.fix.accuracy)} meters`;marker.append(title);this.positionGroup.append(marker);
  }
  drawTrack(){
    this.trackGroup.replaceChildren(); if(!this.track.length)return;
    let segment=[];
    const append=()=>{if(segment.length>1)this.trackGroup.append(svgEl('path',{d:this.path(segment),class:'breadcrumb-line'}));segment=[];};
    for(const p of this.track){if(p.breakBefore)append();segment.push([p.longitude,p.latitude]);}append();
  }
  bind(){
    const el=this.container;
    el.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY<0?1.15:1/1.15,[e.clientX,e.clientY]);},{passive:false});
    el.addEventListener('pointerdown',e=>{if(e.target.closest('.map-junction'))return;el.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,[e.clientX,e.clientY]);this.previousPointer=[e.clientX,e.clientY];this.previousPinch=null;el.classList.add('dragging');});
    el.addEventListener('pointermove',e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,[e.clientX,e.clientY]);const pts=[...this.pointers.values()];if(pts.length===2){const d=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(this.previousPinch)this.zoom(d/this.previousPinch,[(pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2]);this.previousPinch=d;}else if(pts.length===1){const dx=e.clientX-this.previousPointer[0],dy=e.clientY-this.previousPointer[1];this.view.x-=dx*this.unit;this.view.y-=dy*this.unit;this.draw();}this.previousPointer=[e.clientX,e.clientY];});
    const end=e=>{this.pointers.delete(e.pointerId);this.previousPinch=null;const p=[...this.pointers.values()][0];if(p)this.previousPointer=p;if(!this.pointers.size)el.classList.remove('dragging');};
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
    el.addEventListener('keydown',e=>{if(e.target!==el)return;const step=this.view.w*.1;if(e.key==='ArrowLeft')this.view.x-=step;else if(e.key==='ArrowRight')this.view.x+=step;else if(e.key==='ArrowUp')this.view.y-=step;else if(e.key==='ArrowDown')this.view.y+=step;else if(e.key==='+'||e.key==='=')this.zoom(1.5);else if(e.key==='-')this.zoom(1/1.5);else if(e.key==='0')this.fit();else return;e.preventDefault();this.draw();});
  }
}
