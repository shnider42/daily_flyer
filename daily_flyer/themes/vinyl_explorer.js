/* A small, source-first listening room. Curated history and live edition credits
   share the same graph controls; they never share an inferred credit. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  const roleNames = {all:'All roles',production:'Production',performance:'Performance',songwriting:'Songwriting',career:'Career'};
  const colors = {production:'#df846a',performance:'#9bc7b1',songwriting:'#d9be77',career:'#8eaec5'};
  const typeName = type => ({person:'Person',album:'Album',group:'Group',song:'Song'}[type] || 'Credit');
  let instanceCount = 0;

  class Explorer {
    constructor(container, dataset, options = {}) {
      this.root = container;
      this.data = dataset;
      this.catalog = Boolean(options.catalog);
      this.mobile = window.matchMedia('(max-width: 700px)').matches;
      this.uid = `vx-${++instanceCount}`;
      this.nodes = new Map(dataset.nodes.map(n => [n.id,n]));
      this.edges = new Map(dataset.edges.filter(e => this.nodes.has(e.source) && this.nodes.has(e.target)).map(e => [e.id,e]));
      this.sources = new Map((dataset.sources || []).map(s => [s.id,s]));
      this.state = {role:'all',view:'graph',selected:{kind:'node',id:dataset.focus || dataset.nodes[0]?.id},overview:true,showAll:!this.catalog&&!this.mobile,trail:null,step:0,path:null};
      this.camera = {x:0,y:0,scale:1};
      this.positions = this.layout(dataset.nodes);
      this.renderShell();
      this.bind();
      this.update();
    }
    $(s) { return this.root.querySelector(s); }
    $$(s) { return [...this.root.querySelectorAll(s)]; }
    layout(nodes) {
      const positions = new Map();
      const focus = this.data.focus || nodes[0]?.id;
      positions.set(focus, {x:480,y:325});
      const outer = nodes.filter(n => n.id !== focus);
      const custom = outer.some(n => Number.isFinite(n.x) && Number.isFinite(n.y));
      if (custom) {
        nodes.forEach((n,i) => positions.set(n.id,{x:Number.isFinite(n.x)?n.x:480+350*Math.cos(i*2.4),y:Number.isFinite(n.y)?n.y:325+230*Math.sin(i*2.4)}));
        return positions;
      }
      // Fixed rings keep labels at a useful size. Larger catalog maps can be panned.
      const step = outer.length > 22 ? 17 : Math.max(1,outer.length);
      outer.forEach((node,i) => {
        const ring = Math.floor(i/step), count = Math.min(step,outer.length-ring*step);
        const angle = -Math.PI/2 + (i%step)*Math.PI*2/count + ring*.13;
        const rx = 365 + ring*225, ry = 230 + ring*170;
        positions.set(node.id,{x:480+Math.cos(angle)*rx,y:325+Math.sin(angle)*ry});
      });
      return positions;
    }
    compactLayout(nodes){const positions=new Map();const chosen=this.state.selected;const center=chosen.kind==='node'?chosen.id:this.edges.get(chosen.id)?.source||this.data.focus;positions.set(center,{x:480,y:315});const outer=nodes.filter(n=>n.id!==center);outer.forEach((n,i)=>{const angle=-Math.PI/2+i*2*Math.PI/outer.length;positions.set(n.id,{x:480+Math.cos(angle)*166,y:315+Math.sin(angle)*166});});return positions;}
    renderShell() {
      const d = this.data;
      this.root.innerHTML = `<div class="vx-shell${this.catalog?' vx-catalog':''}">
        <header class="vx-heading"><div class="vx-kicker">${this.catalog?'YOUR RECORDS · DOCUMENTED CREDITS':'THE LISTENING ROOM · PETER ASHER'}</div>
          <h2 id="${this.catalog?this.uid+'-title':'explorer-title'}">${esc(d.title || 'One name. A world of records.')}</h2>
          <p>${esc(d.description || '')}</p></header>
        <div class="vx-toolbar">
          <div class="vx-role-filters" role="group" aria-label="Filter connections by role">${Object.entries(roleNames).map(([key,label])=>`<button type="button" data-role="${key}" aria-pressed="${key==='all'}">${label}</button>`).join('')}</div>
          <div class="vx-search-wrap"><label for="${this.uid}-search">Find a person or record</label><input id="${this.uid}-search" type="search" placeholder="${this.catalog?'Search the credits…':'Try Carole King…'}" autocomplete="off" aria-controls="${this.uid}-results" aria-expanded="false"><div id="${this.uid}-results" class="vx-search-results" hidden></div></div>
          <div class="vx-view-tabs" role="tablist" aria-label="Explore connections as a graph, list or timeline">${['graph','list','timeline'].map((v,i)=>`<button id="${this.uid}-${v}-tab" type="button" role="tab" aria-selected="${i===0}" aria-controls="${this.uid}-${v}" tabindex="${i===0?'0':'-1'}" data-view="${v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</div>
        </div>
        <div class="vx-map-topline"><p class="vx-count" aria-live="polite"></p><label class="vx-all-toggle"><input type="checkbox" data-all ${this.state.showAll?'checked':''}> All connections</label><button type="button" class="vx-reset" data-reset>Reset map ↺</button></div>
        <div class="vx-workspace">
          <div class="vx-stage">
            ${(d.trails||[]).length?'<div class="vx-trail-reader" aria-live="polite" hidden></div>':''}
            <div id="${this.uid}-graph" class="vx-graph-wrap" role="tabpanel" aria-labelledby="${this.uid}-graph-tab">
              <svg class="vx-graph" viewBox="0 0 960 660" role="group" aria-label="Interactive music relationship map. Tab to a person, record or connection and press Enter to read its sources." tabindex="0"><title>Music connections</title><desc>Circles represent people; squares represent albums. Each line is a documented relationship. Use the list tab for a complete text alternative.</desc><g class="vx-camera"></g></svg>
              <div class="vx-graph-controls" role="group" aria-label="Move and zoom the graph"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset" aria-label="Fit graph to the starting view">Fit</button><button type="button" data-pan="left" aria-label="Pan left">←</button><button type="button" data-pan="up" aria-label="Pan up">↑</button><button type="button" data-pan="down" aria-label="Pan down">↓</button><button type="button" data-pan="right" aria-label="Pan right">→</button></div>
              <p class="vx-graph-hint">Select a name or line for sleeve notes. Drag sideways to explore; use arrows to move up or down.</p>
            </div>
            <div id="${this.uid}-list" class="vx-list" role="tabpanel" aria-labelledby="${this.uid}-list-tab" hidden></div>
            <div id="${this.uid}-timeline" class="vx-timeline" role="tabpanel" aria-labelledby="${this.uid}-timeline-tab" hidden></div>
            <div class="vx-legend" aria-label="Graph legend">${Object.entries(colors).map(([r,c])=>`<span><i data-role="${r}" style="background:${c}"></i>${roleNames[r]}</span>`).join('')}<span>○ Person / group</span><span>□ Album</span><span>◇ Song</span></div>
          </div>
          <aside class="vx-detail" aria-label="Selected connection sleeve notes" aria-live="polite" aria-atomic="true"></aside>
        </div>
        <section class="vx-path-finder" aria-label="Find a documented path"><div><span class="vx-kicker">MAKE A CONNECTION</span><h3>How do they connect?</h3><p>Follow the shortest sourced path in this map. Each hop keeps its actual role.</p></div><form><label>From<select name="from" aria-label="Start of connection">${d.nodes.map(n=>`<option value="${esc(n.id)}"${n.id===d.focus?' selected':''}>${esc(n.label)}</option>`).join('')}</select></label><span class="vx-path-arrow" aria-hidden="true">→</span><label>To<select name="to" aria-label="End of connection">${d.nodes.map((n,i)=>`<option value="${esc(n.id)}"${i===d.nodes.length-1?' selected':''}>${esc(n.label)}</option>`).join('')}</select></label><button type="submit">Trace a path ↗</button></form><div class="vx-path-result" aria-live="polite"></div></section>
        ${(d.trails||[]).length?`<section class="vx-stories" aria-label="Guided listening trails"><div class="vx-section-heading"><span class="vx-kicker">FOLLOW THE THREAD</span><h3>There is a story between the names.</h3><p>Take a short guided route through the records.</p></div><div class="vx-trail-grid">${d.trails.map((t,i)=>`<button type="button" class="vx-trail-card" data-trail="${esc(t.id)}" aria-pressed="false"><span>${esc(t.kicker || 'TRAIL '+String(i+1).padStart(2,'0'))}</span><strong>${esc(t.title)}</strong><p>${esc(t.description)}</p><small>${t.steps.length} stops <span aria-hidden="true">↗</span></small></button>`).join('')}</div></section>`:''}
        ${!this.catalog?`<section class="vx-albums" aria-label="Records in this story"><div class="vx-section-heading"><span class="vx-kicker">PULL A RECORD FROM THE SHELF</span><h3>Four sleeves. More than four stories.</h3></div><div class="vx-album-grid">${d.nodes.filter(n=>n.type==='album').slice(0,4).map((n,i)=>`<article><button type="button" class="vx-album-sleeve" data-sleeve="${i}" data-node="${esc(n.id)}" aria-label="Explore ${esc(n.label)} by ${esc(n.artist||n.subtitle)}"><span class="vx-sleeve-year">${esc(n.year)}</span><span class="vx-sleeve-title">${esc(n.label)}</span><span class="vx-sleeve-artist">${esc(n.artist||n.subtitle)}</span><span class="vx-sleeve-mark" aria-hidden="true">${['◒','◌','↗','≈'][i]}</span></button><div class="vx-listen-links"><span>Open an external listening search:</span><a target="_blank" rel="noopener noreferrer" href="https://open.spotify.com/search/${encodeURIComponent((n.artist||'')+' '+n.label)}">Spotify ↗</a><a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent((n.artist||'')+' '+n.label)}">YouTube ↗</a></div></article>`).join('')}</div><p class="vx-provenance">Typographic sleeves are a visual interpretation, not original cover artwork. This room uses curated historical sources; the album search below reads separate MusicBrainz edition credits.</p></section>`:''}
        <p class="vx-status sr-only" role="status" aria-live="polite"></p>
      </div>`;
    }
    bind() {
      this.root.addEventListener('click', event => {
        const button = event.target.closest('button,[data-edge],[data-node]');
        if (!button || !this.root.contains(button)) return;
        if (button.tagName==='BUTTON' && button.hasAttribute('data-role')) { this.state.role=button.dataset.role; this.state.path=null; this.state.trail=null; this.update(); }
        else if (button.hasAttribute('data-node')) this.select('node',button.dataset.node);
        else if (button.hasAttribute('data-edge')) this.select('edge',button.dataset.edge);
        else if (button.hasAttribute('data-view')) this.switchView(button.dataset.view);
        else if (button.hasAttribute('data-reset')) this.reset();
        else if (button.hasAttribute('data-zoom')) this.zoom(button.dataset.zoom);
        else if (button.hasAttribute('data-pan')) this.pan(button.dataset.pan);
        else if (button.hasAttribute('data-trail')) this.startTrail(button.dataset.trail);
        else if (button.hasAttribute('data-trail-next')) this.moveTrail(1);
        else if (button.hasAttribute('data-trail-prev')) this.moveTrail(-1);
        else if (button.hasAttribute('data-trail-exit')) {this.state.trail=null;this.state.path=null;this.update();}
      });
      this.$('[data-all]').addEventListener('change',event=>{this.state.showAll=event.target.checked;this.update();if(this.state.showAll)this.fitGraph();});
      this.$('.vx-path-finder form').addEventListener('submit',event=>{event.preventDefault();this.tracePath(event.currentTarget.elements.from.value,event.currentTarget.elements.to.value);});
      const input = this.$('.vx-search-wrap input');
      input.addEventListener('input',()=>this.search(input.value));
      input.addEventListener('keydown',event=>{
        if (event.key==='Escape') this.closeSearch();
        if (event.key==='ArrowDown') {event.preventDefault();this.$('.vx-search-results button')?.focus();}
        if (event.key==='Enter') {event.preventDefault();const first=this.$('.vx-search-results button');if(first){first.click();const heading=this.$('.vx-detail h3');heading.tabIndex=-1;heading.focus({preventScroll:true});}}
      });
      this.$('.vx-search-results').addEventListener('keydown',event=>{
        if(event.key==='Escape'){this.closeSearch();input.focus();}
        if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=this.$$('.vx-search-results button');const next=(buttons.indexOf(document.activeElement)+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
      });
      this.$('.vx-view-tabs').addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const names=['graph','list','timeline'];let i=names.indexOf(this.state.view);
        i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;
        this.switchView(names[i]);this.$(`[data-view="${names[i]}"]`).focus();
      });
      const svg=this.$('svg');
      const sizeGraph=()=>{const box=svg.getBoundingClientRect();if(!box.width||!box.height)return;const mobile=window.matchMedia('(max-width: 700px)').matches;const w=mobile?Math.max(480,530*box.width/box.height):960,h=mobile?Math.max(530,480*box.height/box.width):660;svg.setAttribute('viewBox',`${480-w/2} ${330-h/2} ${w} ${h}`);if(mobile!==this.mobile){this.mobile=mobile;this.state.showAll=!this.catalog&&!mobile;this.update();}else if(mobile&&!this.state.showAll)this.fitGraph();};
      if(window.ResizeObserver){this.resizeObserver=new ResizeObserver(sizeGraph);this.resizeObserver.observe(svg);}sizeGraph();
      svg.addEventListener('keydown',event=>{
        const interactive=event.target.closest('[data-node],[data-edge]');
        if(interactive&&['Enter',' '].includes(event.key)){event.preventDefault();this.select(interactive.hasAttribute('data-node')?'node':'edge',interactive.dataset.node||interactive.dataset.edge);return;}
        if(event.target!==svg)return;
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();this.pan(event.key.replace('Arrow','').toLowerCase());}
        else if(['+','=','-'].includes(event.key)){event.preventDefault();this.zoom(event.key==='-'?'out':'in');}
      });
      let drag=null,dragged=false;
      svg.addEventListener('pointerdown',event=>{
        if(event.target.closest('[data-node],[data-edge]')||event.button!==0)return;
        drag={x:event.clientX,y:event.clientY,cx:this.camera.x,cy:this.camera.y};dragged=false;svg.setPointerCapture(event.pointerId);svg.classList.add('is-dragging');
      });
      svg.addEventListener('pointermove',event=>{
        if(!drag)return;
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
        dragged=dragged||Math.abs(dx)+Math.abs(dy)>4;
        const box=svg.getBoundingClientRect();this.camera.x=drag.cx+dx*svg.viewBox.baseVal.width/box.width;this.camera.y=drag.cy+dy*svg.viewBox.baseVal.height/box.height;this.applyCamera();
      });
      const stop=()=>{drag=null;svg.classList.remove('is-dragging');};
      svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);
      // Preserve scrolling on touch screens. Zoom is an explicit button action.
      svg.addEventListener('click',event=>{if(dragged){event.stopPropagation();dragged=false;}},true);
    }
    select(kind,id,keepTrail=false) {
      if(!(kind==='node'?this.nodes:this.edges).has(id))return;
      const focused=document.activeElement;
      const restoreFocus=focused&&this.root.contains(focused)&&focused.hasAttribute('data-'+kind)&&focused.dataset[kind]===id;
      const searchFocus=Boolean(focused?.closest('.vx-search-results'));
      const sleeveFocus=Boolean(focused?.classList.contains('vx-album-sleeve'));
      this.state.selected={kind,id};this.state.overview=false;
      if(!keepTrail){this.state.trail=null;this.state.path=null;}
      this.closeSearch();this.update();
      if(restoreFocus){const replacement=this.$$('[data-'+kind+']').find(el=>el.dataset[kind]===id&&el.tagName===focused.tagName);replacement?.focus({preventScroll:true});}
      if(searchFocus){const heading=this.$('.vx-detail h3');heading.tabIndex=-1;heading.focus({preventScroll:true});}
      if(sleeveFocus)this.$('.vx-workspace').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      const item=(kind==='node'?this.nodes:this.edges).get(id);
      this.$('.vx-status').textContent=`Selected ${item.label}. Sleeve notes updated.`;
    }
    closeSearch(){const box=this.$('.vx-search-results');box.hidden=true;this.$('.vx-search-wrap input').setAttribute('aria-expanded','false');}
    search(value){
      const query=value.trim().toLocaleLowerCase(),box=this.$('.vx-search-results');
      if(!query){this.closeSearch();return;}
      const matches=this.data.nodes.filter(n=>(n.label+' '+(n.subtitle||'')).toLocaleLowerCase().includes(query));
      box.innerHTML=matches.length?`<p>${matches.length>8?'First 8 of '+matches.length:matches.length} result${matches.length===1?'':'s'}</p>${matches.slice(0,8).map(n=>`<button type="button" data-node="${esc(n.id)}"><strong>${esc(n.label)}</strong><span>${esc(typeName(n.type))}${n.subtitle?' · '+esc(n.subtitle):''}</span></button>`).join('')}`:'<p>No name or record in this map matches. Try the album search below for the wider catalog.</p>';
      box.hidden=false;this.$('.vx-search-wrap input').setAttribute('aria-expanded','true');
    }
    switchView(view){this.state.view=view;this.updateViews();}
    reset(){this.state={role:'all',view:'graph',selected:{kind:'node',id:this.data.focus||this.data.nodes[0].id},overview:true,showAll:!this.catalog&&!this.mobile,trail:null,step:0,path:null};this.camera={x:0,y:0,scale:1};this.$('.vx-search-wrap input').value='';this.closeSearch();this.$('.vx-path-result').innerHTML='';this.update();}
    visible(){
      let edges=[...this.edges.values()].filter(e=>this.state.role==='all'||e.role===this.state.role);
      const total=edges.length;
      if(!this.state.showAll){
        const s=this.state.selected,selectedNodes=s.kind==='node'?[s.id]:[this.edges.get(s.id)?.source,this.edges.get(s.id)?.target];
        if(this.state.trail||this.state.path){const active=this.highlight();edges=edges.filter(e=>active.edges.has(e.id));}
        else {edges=edges.filter(e=>selectedNodes.includes(e.source)||selectedNodes.includes(e.target));
          if(this.catalog&&edges.length>24){const shared=new Set((this.data.shared||[]));edges.sort((a,b)=>(shared.has(b.source)||shared.has(b.target))-(shared.has(a.source)||shared.has(a.target)));edges=edges.slice(0,24);}}
      }
      const ids=new Set(edges.flatMap(e=>[e.source,e.target]));
      if(this.state.selected.kind==='node')ids.add(this.state.selected.id);
      return {edges,nodes:this.data.nodes.filter(n=>ids.has(n.id)),total};
    }
    highlight(){
      if(this.state.overview&&!this.state.trail&&!this.state.path)return {nodes:new Set(this.nodes.keys()),edges:new Set(this.edges.keys())};
      if(this.state.trail){const step=this.data.trails.find(t=>t.id===this.state.trail)?.steps[this.state.step];return{nodes:new Set(step?.nodeIds||[]),edges:new Set(step?.edgeIds||[])};}
      if(this.state.path)return{nodes:new Set(this.state.path.nodes),edges:new Set(this.state.path.edges)};
      const selected=this.state.selected,nodes=new Set(),edges=new Set();
      if(selected.kind==='edge'){const edge=this.edges.get(selected.id);if(edge){nodes.add(edge.source);nodes.add(edge.target);edges.add(edge.id);}}
      else {nodes.add(selected.id);for(const e of this.edges.values())if(e.source===selected.id||e.target===selected.id){nodes.add(e.source);nodes.add(e.target);edges.add(e.id);}}
      return {nodes,edges};
    }
    update(){
      const visible=this.visible(),highlight=this.highlight();this.currentVisible=visible;if(this.mobile&&!this.state.showAll)this.positions=this.compactLayout(visible.nodes);else if(this.catalog)this.positions=this.layout(visible.nodes);else this.positions=this.layout(this.data.nodes);
      this.$$('[data-role]').forEach(button=>{if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.role===this.state.role));});
      this.$('[data-all]').checked=this.state.showAll;
      this.$('.vx-count').textContent=`${visible.nodes.length} names & records · ${visible.edges.length}${visible.edges.length!==visible.total?' of '+visible.total:''} sourced links${!this.state.showAll?' · focused view':''}`;
      this.drawGraph(visible,highlight);if(this.mobile&&!this.state.showAll)this.fitGraph();this.renderList(visible);this.renderTimeline(visible);this.renderDetail();this.renderTrail();this.updateViews();
    }
    updateViews(){
      ['graph','list','timeline'].forEach(v=>{this.$('#'+this.uid+'-'+v).hidden=this.state.view!==v;const b=this.$(`[data-view="${v}"]`);b.setAttribute('aria-selected',String(this.state.view===v));b.tabIndex=this.state.view===v?0:-1;});
    }
    drawGraph({nodes,edges},highlight){
      const selected=this.state.selected;
      const edgeMarkup=edges.map((e,i)=>{
        const a=this.positions.get(e.source),b=this.positions.get(e.target),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
        const bend=14*((i%3)-1),cx=(a.x+b.x)/2-dy/length*bend,cy=(a.y+b.y)/2+dx/length*bend;
        const path=`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
        const tx=(a.x+b.x)/2-dy/length*(bend*.5+10),ty=(a.y+b.y)/2+dx/length*(bend*.5+10);
        const active=highlight.edges.has(e.id),isSelected=selected.kind==='edge'&&selected.id===e.id;
        return `<g class="vx-edge${active?' is-active':' is-dimmed'}${isSelected?' is-selected':''}" data-role="${esc(e.role)}" data-edge="${esc(e.id)}" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="${esc(this.nodes.get(e.source).label+' '+e.label+' '+this.nodes.get(e.target).label)}"><title>${esc(e.description)}</title><path class="vx-edge-line" d="${path}" fill="none" stroke="${colors[e.role]||colors.career}" stroke-width="${active?2.6:1.3}"/><path class="vx-edge-hit" d="${path}" fill="none" stroke="transparent" stroke-width="18"/><text class="vx-edge-label" x="${tx}" y="${ty}" text-anchor="middle">${esc(e.graphLabel || e.label)}</text></g>`;
      }).join('');
      const nodeMarkup=nodes.map(n=>{
        const p=this.positions.get(n.id),active=highlight.nodes.has(n.id),isSelected=selected.kind==='node'&&selected.id===n.id;
        const lines=this.labelLines(n.label),album=n.type==='album';
        const shape=n.type==='song'?'<path class="vx-node-shape" d="M0,-32 L32,0 0,32 -32,0 Z"/>':album?'<rect class="vx-node-shape" x="-29" y="-29" width="58" height="58" rx="2"/>':'<circle class="vx-node-shape" r="31"/>';
        const initials=n.label.split(/\s+/).filter(w=>!['the','and','&','a'].includes(w.toLowerCase())).slice(0,2).map(w=>w[0]).join('');
        return `<g class="vx-node is-${esc(n.type)}${active?' is-active':' is-dimmed'}${isSelected?' is-selected':''}${n.id===this.data.focus?' is-hub':''}" transform="translate(${p.x},${p.y})" data-node="${esc(n.id)}" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="${esc(n.label+', '+typeName(n.type)+(n.subtitle?', '+n.subtitle:''))}"><title>${esc(n.label+' — '+(n.subtitle||typeName(n.type)))}</title>${shape}${album?'<circle class="vx-record-groove" r="18" fill="none"/><circle class="vx-record-center" r="4"/>':`<text class="vx-node-initials" text-anchor="middle" y="5" aria-hidden="true">${esc(initials)}</text>`}<text class="vx-node-label" text-anchor="middle" y="48">${lines.map((line,i)=>`<tspan x="0" dy="${i?17:0}">${esc(line)}</tspan>`).join('')}</text>${n.year?`<text class="vx-node-subtitle" text-anchor="middle" y="${48+lines.length*17}">${esc(n.year)}</text>`:''}</g>`;
      }).join('');
      this.$('.vx-camera').innerHTML=edgeMarkup+nodeMarkup;
      this.applyCamera();
    }
    labelLines(text){
      const max=this.mobile?13:20;if(text.length<=max)return[text];const words=text.split(' '),lines=[''];for(const word of words){if(lines[lines.length-1].length+word.length+(lines[lines.length-1]?1:0)>max&&lines.length<3)lines.push(word);else lines[lines.length-1]+=(lines[lines.length-1]?' ':'')+word;}return lines;
    }
    applyCamera(){this.$('.vx-camera').setAttribute('transform',`translate(${480+this.camera.x},${330+this.camera.y}) scale(${this.camera.scale}) translate(-480,-330)`);}
    zoom(direction){if(direction==='reset'){this.fitGraph();return;}this.camera.scale=Math.min(3,Math.max(.08,this.camera.scale*(direction==='in'?1.2:1/1.2)));this.applyCamera();}
    fitGraph(){
      const items=this.$$('.vx-node').map(element=>{const p=this.positions.get(element.dataset.node),b=element.getBBox();return {left:p.x+b.x,right:p.x+b.x+b.width,top:p.y+b.y,bottom:p.y+b.y+b.height};});
      if(!items.length)return;
      const left=Math.min(...items.map(p=>p.left))-20,right=Math.max(...items.map(p=>p.right))+20,top=Math.min(...items.map(p=>p.top))-20,bottom=Math.max(...items.map(p=>p.bottom))+20;
      const vb=this.$('svg').viewBox.baseVal;const scale=Math.min(1.15,.95*Math.min(vb.width/(right-left),vb.height/(bottom-top)));
      this.camera={scale,x:(480-(left+right)/2)*scale,y:(330-(top+bottom)/2)*scale};this.applyCamera();
    }
    destroy(){this.resizeObserver?.disconnect();this.root.replaceChildren();}
    pan(direction){const movement={left:[70,0],right:[-70,0],up:[0,60],down:[0,-60]}[direction];this.camera.x+=movement[0];this.camera.y+=movement[1];this.applyCamera();}
    sourceLinks(ids){const sources=[...new Set(ids||[])].map(id=>this.sources.get(id)).filter(s=>s&&url(s.url));return sources.length?`<div class="vx-sources"><h4>Read the source</h4>${sources.map(s=>`<a href="${esc(url(s.url))}" target="_blank" rel="noopener noreferrer"><span>${esc(s.publisher||'Source')}</span>${esc(s.title)} ↗</a>`).join('')}</div>`:'<p class="vx-source-missing">No source link is listed for this item.</p>';}
    edgeButton(e){return `<button type="button" class="vx-link-row" data-edge="${esc(e.id)}"><i style="background:${colors[e.role]||colors.career}"></i><span><strong>${esc(this.nodes.get(e.source).label)} <em>${esc(e.label)}</em> ${esc(this.nodes.get(e.target).label)}</strong><small>${e.year?esc(e.year)+' · ':''}${esc(roleNames[e.role]||'Credit')}</small></span><span aria-hidden="true">↗</span></button>`;}
    renderDetail(){
      const selection=this.state.selected;
      if(selection.kind==='edge'){
        const e=this.edges.get(selection.id);if(!e)return;
        this.$('.vx-detail').innerHTML=`<div class="vx-detail-kicker">${esc(roleNames[e.role])} ${e.year?'· '+esc(e.year):''}</div><h3>${esc(this.nodes.get(e.source).label)} <span class="vx-detail-arrow">→</span> ${esc(this.nodes.get(e.target).label)}</h3><p class="vx-fact">${esc(e.label)}</p><p class="vx-detail-description">${esc(e.description)}</p><p class="vx-source-type">${this.catalog?'MusicBrainz catalog credit · edition or album group identified in the source':'Curated historical connection · source checked'}</p>${this.sourceLinks(e.sourceIds)}<div class="vx-adjacent"><h4>Open either end</h4>${[e.source,e.target].map(id=>`<button type="button" data-node="${esc(id)}">${esc(this.nodes.get(id).label)} <span aria-hidden="true">↗</span></button>`).join('')}</div>`;
      }else{
        const n=this.nodes.get(selection.id);if(!n)return;
        const edges=[...this.edges.values()].filter(e=>(e.source===n.id||e.target===n.id)&&(this.state.role==='all'||e.role===this.state.role));
        this.$('.vx-detail').innerHTML=`<div class="vx-detail-kicker">${esc(typeName(n.type))}${n.year?' · '+esc(n.year):''}</div><h3>${esc(n.label)}</h3><p class="vx-fact">${esc(n.subtitle||'')}</p><p class="vx-detail-description">${esc(n.description||'Select a linked role below to inspect the documented credit.')}</p>${this.sourceLinks(n.sourceIds)}<div class="vx-adjacent"><h4>${edges.length} connection${edges.length===1?'':'s'}${this.state.role!=='all'?' in this role':''}</h4>${edges.map(e=>this.edgeButton(e)).join('')||'<p>Choose All connections to see the other roles.</p>'}</div>`;
      }
    }
    renderList({edges}){this.$('.vx-list').innerHTML=`<h3>Every line has a role.</h3><p>Select a relationship to read the evidence and open its source.</p>${edges.map(e=>this.edgeButton(e)).join('')||'<p>No connections in this view. Choose another role or turn on All connections.</p>'}`;}
    renderTimeline({edges}){
      const sorted=[...edges].sort((a,b)=>String(a.year||'9999').localeCompare(String(b.year||'9999'))||a.label.localeCompare(b.label));
      let previous='';this.$('.vx-timeline').innerHTML='<h3>The connections, in time.</h3><p>Dates describe the relationship or release, not the lifetime of a collaboration.</p>'+sorted.map(e=>{const year=String(e.year||'Date not listed'),heading=year!==previous?`<h4 class="vx-timeline-year">${esc(year)}</h4>`:'';previous=year;return heading+`<div class="vx-timeline-item">${this.edgeButton(e)}</div>`;}).join('');
    }
    startTrail(id){const trail=this.data.trails.find(t=>t.id===id);if(!trail)return;this.state.trail=id;this.state.overview=false;this.state.step=0;this.state.path=null;this.state.role='all';this.state.showAll=!this.mobile;this.state.view='graph';this.camera={x:0,y:0,scale:1};const step=trail.steps[0];this.state.selected=step.edgeIds?.length?{kind:'edge',id:step.edgeIds[0]}:{kind:'node',id:step.nodeIds[0]};this.update();this.$('.vx-workspace')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
    moveTrail(delta){const trail=this.data.trails.find(t=>t.id===this.state.trail);if(!trail)return;this.state.step=Math.max(0,Math.min(trail.steps.length-1,this.state.step+delta));const step=trail.steps[this.state.step];this.state.selected=step.edgeIds?.length?{kind:'edge',id:step.edgeIds[0]}:{kind:'node',id:step.nodeIds[0]};this.update();const next=this.$(delta>0?'[data-trail-next]':'[data-trail-prev]');if(next&&!next.disabled)next.focus({preventScroll:true});else {const heading=this.$('.vx-trail-reader h3');heading.tabIndex=-1;heading.focus({preventScroll:true});}}
    renderTrail(){
      const reader=this.$('.vx-trail-reader');if(!reader)return;
      this.$$('[data-trail]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trail===this.state.trail)));
      const trail=this.data.trails.find(t=>t.id===this.state.trail);reader.hidden=!trail;if(!trail)return;
      const step=trail.steps[this.state.step];reader.innerHTML=`<span class="vx-kicker">${esc(trail.title)} · STOP ${this.state.step+1} OF ${trail.steps.length}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p><div class="vx-trail-progress" aria-hidden="true">${trail.steps.map((_,i)=>`<i class="${i===this.state.step?'is-current':''}"></i>`).join('')}</div><div class="vx-trail-actions"><button type="button" data-trail-prev ${this.state.step===0?'disabled':''}>← Previous</button><button type="button" data-trail-next ${this.state.step===trail.steps.length-1?'disabled':''}>Next connection →</button><button type="button" data-trail-exit>Leave trail</button></div>`;
    }
    tracePath(from,to){
      this.state.trail=null;this.state.path=null;this.state.overview=false;
      if(from===to){this.$('.vx-path-result').textContent='Choose two different names or records to trace a connection.';return;}
      const queue=[from],seen=new Map([[from,null]]),via=new Map();
      while(queue.length){const id=queue.shift();if(id===to)break;for(const edge of this.edges.values()){if(this.state.role!=='all'&&edge.role!==this.state.role)continue;const next=edge.source===id?edge.target:edge.target===id?edge.source:null;if(next&&!seen.has(next)){seen.set(next,id);via.set(next,edge.id);queue.push(next);}}}
      if(!seen.has(to)){this.$('.vx-path-result').textContent=`No documented path in this ${this.state.role==='all'?'map':'role filter'}. ${this.state.role==='all'?'An absent link is not evidence that a connection never existed.':'Try All connections to include other roles.'}`;this.update();return;}
      const nodes=[],edges=[];let cursor=to;while(cursor){nodes.unshift(cursor);if(via.has(cursor))edges.unshift(via.get(cursor));cursor=seen.get(cursor);}
      this.state.path={nodes,edges};this.state.selected={kind:'edge',id:edges[0]};this.state.view='graph';this.state.showAll=!this.mobile;this.camera={x:0,y:0,scale:1};this.update();
      this.$('.vx-path-result').innerHTML=`<p><strong>${edges.length} sourced hop${edges.length===1?'':'s'}</strong> · ${nodes.map(id=>esc(this.nodes.get(id).label)).join(' → ')}</p>${edges.map(id=>this.edgeButton(this.edges.get(id))).join('')}<small>This is a route through documented relationships, not a claim that everyone met or played together.</small>`;
    }
  }

  function catalogDataset(result){
    const nodes=new Map(),edges=[],sources=new Map(),shared=new Set((result.connections||[]).map(c=>'person-'+(c.id||c.person)));
    const sourceId=(href,label)=>{const safe=url(href);if(!safe)return null;const id='source-'+sources.size;for(const [key,s] of sources)if(s.url===safe)return key;sources.set(id,{id,title:label||'MusicBrainz catalog entry',publisher:'MusicBrainz',url:safe});return id;};
    const classify=role=>/produc|engineer|mix|master/i.test(role)?'production':/writ|compos|lyric|arrang/i.test(role)?'songwriting':/manage|label|a&r/i.test(role)?'career':'performance';
    const albums=result.albums||[];
    for(const album of albums){
      const aid='album-'+album.id,source=sourceId(album.source,`${album.title} · selected edition`);
      nodes.set(aid,{id:aid,label:album.title,type:'album',artist:album.artist,subtitle:album.artist,year:album.first_year||String(album.date||'').slice(0,4),description:`Credits from the selected ${album.date||'undated'} edition${album.label?' on '+album.label:''}. Track roles remain attached to their named source; missing catalog credits cannot establish that someone did not participate.`,sourceIds:source?[source]:[]});
      for(const credit of album.credits||[]){
        if(!credit.name)continue;
        const pid='person-'+(credit.id||album.id+'-'+credit.name),sid=sourceId(credit.source||album.source,`${album.title} · credit source`);
        if(!nodes.has(pid))nodes.set(pid,{id:pid,label:credit.name,type:'person',subtitle:'Named in the catalog',description:'This name appears in the cataloged credits. Select an individual line to see the role, track and source.',sourceIds:sid?[sid]:[]});
        else if(sid&&!nodes.get(pid).sourceIds.includes(sid))nodes.get(pid).sourceIds.push(sid);
        // Keep distinct roles, while grouping repeat track appearances into one line.
        let edge=edges.find(e=>e.source===pid&&e.target===aid&&e.fullRole===credit.role);
        if(!edge){edge={id:'catalog-edge-'+edges.length,source:pid,target:aid,role:classify(credit.role||''),fullRole:credit.role||'Credit',label:credit.role||'Credit',year:album.first_year||String(album.date||'').slice(0,4),description:'',sourceIds:[],tracks:[]};edges.push(edge);}
        if(sid&&!edge.sourceIds.includes(sid))edge.sourceIds.push(sid);if(credit.track&&!edge.tracks.includes(credit.track))edge.tracks.push(credit.track);
      }
    }
    for(const item of result.other_albums||[]){
      const matches=[...nodes.values()].filter(n=>n.type==='person'&&n.label===item.person);if(matches.length!==1)continue;const existing=matches[0];
      const aid='outside-'+(item.other_source||item.other_title),sid=sourceId(item.other_source,`${item.other_title} · linked catalog entry`);
      if(!nodes.has(aid))nodes.set(aid,{id:aid,label:item.other_title,type:'album',artist:item.other_artist,subtitle:item.other_artist||'Linked catalog album',year:item.other_year,description:'An additional album linked by a named catalog role. Open the source to check the edition or release group.',sourceIds:sid?[sid]:[]});
      if(!edges.some(e=>e.source===existing.id&&e.target===aid&&e.fullRole===item.other_role))edges.push({id:'catalog-edge-'+edges.length,source:existing.id,target:aid,role:classify(item.other_role||''),fullRole:item.other_role,label:item.other_role||'Credit',year:item.other_year,description:`${item.person} is listed as ${item.other_role} on “${item.other_title}”${item.other_artist?' by '+item.other_artist:''}. This role comes from the linked catalog entry; it does not imply the same role as on the starting record.`,sourceIds:sid?[sid]:[],tracks:[]});
    }
    for(const edge of edges){
      if(!edge.description)edge.description=`${nodes.get(edge.source).label}: ${edge.fullRole} on “${nodes.get(edge.target).label}”${edge.tracks.length?'. Track'+(edge.tracks.length===1?'':'s')+': '+edge.tracks.map(t=>'“'+t+'”').join(', '):'. The source does not specify a track for this role'}.`;
    }
    // Put the selected albums and shared musicians on the first ring, then the rest.
    const ordered=[...nodes.values()].sort((a,b)=>(b.type==='album')-(a.type==='album')||Number(shared.has(b.id))-Number(shared.has(a.id))||a.label.localeCompare(b.label));
    return {title:albums.length===2?'The people between these records.':'Open the sleeve. Follow a name.',description:'This map is built from the cataloged credits returned for your records. Color shows the role; select any line for the exact credit and source. Focused view starts with up to 24 links; All connections includes every returned credit.',focus:'album-'+albums[0]?.id,nodes:ordered,edges,sources:[...sources.values()],shared:[...shared],trails:[]};
  }

  window.VinylExplorer={
    renderCatalog(container,result){if(!container||!(result?.albums||[]).length)return null;const data=catalogDataset(result);if(!data.edges.length){container.innerHTML='<p class="vx-provenance">No named relationships were returned for this edition. The catalog source links below remain available for checking its sleeve credits.</p>';return null;}return new Explorer(container,data,{catalog:true});}
  };
  const mount=document.getElementById('vinyl-explorer-content');
  if(mount){mount.setAttribute('aria-busy','true');fetch('/daily_flyer/themes/vinyl_spotlight.json',{headers:{Accept:'application/json'}}).then(response=>{if(!response.ok)throw new Error('The listening room could not load.');return response.json();}).then(data=>{new Explorer(mount,data);mount.setAttribute('aria-busy','false');}).catch(()=>{mount.innerHTML='<div class="vx-load-error"><h2 id="explorer-title">The listening room is taking a moment.</h2><p>Reload to try the curated map again. You can still explore a record using the album search below.</p><a href="https://www.grammy.com/news/grammy-hall-of-fame-inspirations-peter-asher/" target="_blank" rel="noopener noreferrer">Read Peter Asher’s GRAMMY interview ↗</a></div>';mount.setAttribute('aria-busy','false');});}
})();
