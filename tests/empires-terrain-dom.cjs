/* Landscape regression checks and an optional offline artwork proof.
   Uses the real application and API; no rendered browser/Safari claims. */
const {make,click,delay,root,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function proof(w){
 const ns='http://www.w3.org/2000/svg',el=(tag,attrs={},text)=>{const n=w.document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;};
 const svg=el('svg',{xmlns:ns,id:'empMap',width:1040,height:760,viewBox:'0 0 1040 760'});
 const css=['empires.css','empires-learning.css','empires-terrain.css'].map(p=>fs.readFileSync(path.join(root,'ww2_tactics/static',p),'utf8')).join('\n');
 svg.append(el('style',{},css),el('rect',{width:1040,height:760,fill:'#142131'}));w.empiresTerrain.install(svg);
 svg.append(el('text',{x:28,y:37,fill:'#e7c58e','font-family':'sans-serif','font-size':23},'EMPIRES · THE RIVERLANDS'),el('text',{x:28,y:61,fill:'#b9c7da','font-family':'sans-serif','font-size':13},'Actual vector terrain · offline artwork proof, not a phone screenshot'));
 const items=[['Grassland','grass'],['Woods','woods'],['Hills','hill'],['Mountains','mountain'],['Water','water'],['Bridge','bridge'],['Farm','grass','farm'],['Mine','hill','mine']];
 for(const [i,[label,kind,improvement]]of items.entries()){
  const x=87+i*124,g=el('g',{transform:`translate(${x} 139) scale(1.65)`,class:'emp-landscape'});
  w.empiresTerrain.draw(g,{tile:{terrain:kind,improvement},adjacent:Array(6).fill(null),variant:i%4});svg.append(g);
  svg.append(el('text',{x,y:211,'text-anchor':'middle',fill:'#e7e5cf','font-family':'sans-serif','font-size':13},label));
 }
 const fixture=['ggwwhhgggg','gwwwhhgggg','ggwhhgmggg','gggghmbggg','gggghhwwww','gggggwwwww','gggwwwwwww'];
 const terrain={g:'grass',w:'woods',h:'hill',m:'mountain',b:'bridge'};
 const map=fixture.map((row,y)=>[...row].map((k,x)=>({terrain:y>=4&&x>=6||x===6&&y<=3?'water':terrain[k],road:y===3&&(x>=3&&x<=8),resource:x===2&&y===4?'ruins':null,improvement:x===2&&y===2?'farm':x===4&&y===2?'mine':null})));
 // A two-hex east-west crossing and a road through farmland.
 map[3][6].terrain='bridge';map[3][7].terrain='bridge';map[3][8].terrain='grass';map[3][9].terrain='grass';map[2][2].terrain='grass';map[2][3].terrain='grass';map[2][3].improvement='farm';
 const landscape=el('g',{transform:'translate(28 258) scale(1.15)'}),roadLayer=el('g',{class:'emp-land-roads'}),outlines=el('g',{class:'emp-land-outlines'});
 for(let y=0;y<map.length;y++)for(let x=0;x<map[0].length;x++){
  const [cx,cy]=[27+x*52+(y%2)*26,33+y*49],g=el('g',{transform:`translate(${cx} ${cy})`,class:'emp-landscape'});
  w.empiresTerrain.draw(g,w.empiresTerrain.descriptor(map,x,y));landscape.append(g);
  outlines.append(el('polygon',{points:w.empiresTerrain.points.map(([a,b])=>[cx+a,cy+b].join(',')).join(' '),class:'emp-land-outline'}));
 }
 const game={map,width:10,height:7,visible:map.flatMap((r,y)=>r.map((_,x)=>`${x},${y}`))};
 w.empiresTerrain.roads(roadLayer,game,(x,y)=>[27+x*52+(y%2)*26,33+y*49]);landscape.append(roadLayer,outlines);svg.append(landscape);
 svg.append(el('text',{x:692,y:287,fill:'#e7c58e','font-family':'sans-serif','font-size':20},'Connected terrain'));
 for(const [i,text]of ['Forests meet across hexes.','Sandy shores follow known water.','Roads connect to timber bridges.','Farms and mines change the land.','Landmarks remain stable as you play.'].entries())svg.append(el('text',{x:692,y:320+i*27,fill:'#c8d0d2','font-family':'sans-serif','font-size':13},text));
 svg.append(el('text',{x:692,y:500,fill:'#e7c58e','font-family':'sans-serif','font-size':20},'Readable at map scale'));
 for(const [i,kind]of ['woods','hill','water','grass'].entries()){
  const g=el('g',{transform:`translate(${726+i*76} 553)`,class:'emp-landscape'});w.empiresTerrain.draw(g,{tile:{terrain:kind,improvement:i===3?'farm':null},adjacent:Array(6).fill(null),variant:i});svg.append(g);
  svg.append(el('text',{x:726+i*76,y:602,fill:'#b9c7da','text-anchor':'middle','font-family':'sans-serif','font-size':11},kind));
 }
 svg.append(el('text',{x:28,y:724,fill:'#b9c7da','font-family':'sans-serif','font-size':12},'Gameplay labels, legal-move outlines, fog, cities and units are rendered in separate layers above the landscape.'));
 const out=path.join(root,'docs/previews/empires-terrain-v1.svg');fs.writeFileSync(out,svg.outerHTML);
 const sharp=require('sharp');await sharp(Buffer.from(svg.outerHTML)).png().toFile('/tmp/empires-terrain-v1.png');console.log(out);
 // A separate actual-game crop checks the landscape against unit/yield overlays.
 w.ww2Experience.set('simple');await delay();
 const actual=w.document.getElementById('empMap').cloneNode(true);actual.setAttribute('xmlns',ns);actual.setAttribute('width',861);actual.setAttribute('height',600);actual.prepend(el('style',{},css+'#empMap .emp-coordinate{display:none}'));
 const atlas=await sharp(path.join(root,'ww2_tactics/static/unit-images/empires-miniatures-v1.webp')).png().toBuffer();
 for(const im of actual.querySelectorAll('image')){im.setAttribute('href','data:image/png;base64,'+atlas.toString('base64'));im.closest('.emp-unit-art')?.classList.add('emp-art-ready');}
 await sharp(Buffer.from(actual.outerHTML)).extract({left:0,top:115,width:390,height:370}).png().toFile('/tmp/empires-terrain-game.png');
}
async function main(){
 const v=await make(390),{w,$}=v;
 try{
  await click(v,$('modeEmpires'));await click(v,$('empCreate'));w.document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  const game=()=>w.empiresUI.state,svg=$('empMap'),scout=game().units.find(u=>u.side===game().side&&u.kind==='scout');
  assert.equal(svg.querySelectorAll('[data-emp-land-defs]').length,1);assert.equal(svg.querySelectorAll('polygon[role="button"]').length,192);
  assert.equal(svg._terrain.nextSibling,svg._roads);assert.equal(svg._roads.nextSibling,svg._outlines);assert.equal(svg._outlines.nextSibling,svg._labels);
  for(const [key,n]of svg._tiles){const [x,y]=key.split(',').map(Number);assert.equal(!!n.land.querySelector('use'),!!game().map[y][x]);}
  const retained=[...svg._tiles.values()].find(n=>n.land.firstChild),land=retained.land.firstChild,road=svg._roads.firstChild;
  let posts=0;const fetch=w.fetch;w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return fetch(url,opts);};
  const before=JSON.stringify(game());$('empMapWrap').scrollLeft=88;$('empMapWrap').scrollTop=37;
  for(const level of ['expert','moderate','simple']){
   w.ww2Experience.set(level);await delay();assert.equal(retained.land.firstChild,land);assert.equal(svg._roads.firstChild,road);assert.equal(JSON.stringify(game()),before);assert.equal($('empMapWrap').scrollLeft,88);assert.equal($('empMapWrap').scrollTop,37);
  }
  assert.equal(posts,0);
  const tile=(terrain,extra={})=>({terrain,resource:null,improvement:null,road:false,...extra});
  const publicMap=Array.from({length:3},()=>Array(3).fill(null));publicMap[1][1]=tile('grass',{improvement:'farm'});
  const g=w.document.createElementNS('http://www.w3.org/2000/svg','g');
  w.empiresTerrain.draw(g,w.empiresTerrain.descriptor(publicMap,1,1));assert.equal(g.querySelectorAll('.emp-shore').length,0,'Unknown neighbors do not reveal coastlines');assert.ok(g.querySelector('.emp-land-improvement'));
  const initial=g.outerHTML;w.empiresTerrain.draw(g,w.empiresTerrain.descriptor(publicMap,1,1));assert.equal(g.outerHTML,initial);
  publicMap[1][2]=tile('water');w.empiresTerrain.draw(g,w.empiresTerrain.descriptor(publicMap,1,1));assert.equal(g.querySelectorAll('.emp-shore').length,1);assert.equal(g.querySelector('.emp-shore').dataset.edge,'1');
  publicMap[1][1]=null;w.empiresTerrain.draw(g,w.empiresTerrain.descriptor(publicMap,1,1));assert.equal(g.childElementCount,0);
  // Selecting/inspecting artwork cannot change legal actions or spend AP.
  svg.querySelector(`[data-unit-id="${scout.id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();
  const move=game().legal[scout.id].moves[0],n=svg._tiles.get(move.pos.join(','));assert.ok(n.outline.classList.contains('can-move'));
  n.p.focus();assert.ok(n.outline.classList.contains('key-focus'));n.p.blur();assert.ok(!n.outline.classList.contains('key-focus'));
  await click(v,$('empInspectToggle'));n.p.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();assert.equal(posts,0);assert.equal($('empHexSheet').open,true);
  await click(v,w.document.querySelector('[data-emp-close="empHexSheet"]'));await click(v,$('empInspectToggle'));
  n.p.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();await delay();assert.equal(posts,1);assert.equal(game().units.find(u=>u.id===scout.id).pos.join(','),move.pos.join(','));assert.equal(game().units.find(u=>u.id===scout.id).ap,scout.ap-move.cost);assert.equal(svg._tiles.get(move.pos.join(',')).p,n.p);
  // Display-only remembered tile: whole landscape dims, including improvements.
  const known=[...svg._tiles.keys()].find(k=>{const [x,y]=k.split(',').map(Number);return !!game().map[y][x];});
  game().visible=game().visible.filter(k=>k!==known);w.ww2Experience.set('expert');await delay();assert.ok(svg._tiles.get(known).land.classList.contains('remembered'));
  if(process.argv.includes('--proof'))await proof(w);
 }finally{await delay();w.close();}
 console.log('PASS: landscape caching, stable variants, fog-safe coastlines, separate overlays, retained touch/keyboard input, real move/AP, inspection and Experience/camera isolation. DOM/API; optional offline artwork proof.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
