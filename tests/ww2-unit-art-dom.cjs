/* Deterministic artwork wiring/fallback tests. Not a browser visual-layout test. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'ww2_tactics/static');
const kinds=['squad','leader','mg','commander','scout','engineer','at_team','tank','at_gun','amphibious','paratrooper','halftrack','sniper','carrier','battleship','cruiser','destroyer','fighter','bomber','aa_gun','radar','airfield','landing_craft','transport_aircraft','spotlight','supply','radioman','commando','mountain','partisan','askari','mortar','pathfinder','flak'];
const variants=[['tank','tiger'],['tank','firefly'],['tank','kv1'],['tank','matilda'],['bomber','lancaster'],['bomber','halifax'],['bomber','mosquito_pathfinder'],['fighter','mosquito_fighter'],['fighter','bf110'],['transport_aircraft','dakota'],['aa_gun','heavy_flak'],['aa_gun','light_flak'],['bomber','dive_bomber'],['bomber','torpedo_bomber'],['cruiser','aa_escort'],['cruiser','torpedo_cruiser']];
const entries=kinds.map(kind=>({kind})).concat(variants.map(([kind,variant])=>({kind,variant})),[{kind:'squad',faction:'de'},{kind:'carrier',faction:'jp'},{kind:'fighter',faction:'jp'},{kind:'fighter',faction:'gb'},{kind:'fighter',faction:'de'}]).map((u,i)=>({id:'art-'+i,side:'us',pos:[0,0],hp:3,ap:2,...u}));
entries.push({...entries[1],id:'captain',rank:'captain'});
const markup='<div id="playTools"></div><svg id="map" viewBox="0 0 60 50"></svg><svg id="playbackMap" viewBox="0 0 60 50"></svg><main id="artPlate"></main>';
function boot(width,preference){
 const dom=new JSDOM(markup,{url:'http://dsl.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.innerWidth=width;w.ResizeObserver=class{observe(){}unobserve(){}};
 Object.defineProperty(w.SVGSVGElement.prototype,'viewBox',{get(){return {baseVal:{width:Number((this.getAttribute('viewBox')||'0 0 52 50').split(' ')[2])}};}});
 if(preference)w.localStorage.setItem('ww2-unit-style',preference);
 w.state={units:JSON.parse(JSON.stringify(entries)),naval_version:1,map:[['water']]};w.center=()=>[30,25];w.sideLabel=s=>s;w.unitName=u=>u.variant||u.kind;w.playbackSession=null;
 for(const file of ['unit-art-illustrations.js','unit-art.js'])vm.runInContext(fs.readFileSync(path.join(assets,file),'utf8'),dom.getInternalVMContext(),{filename:file});
 return {dom,w};
}
function addCounter(w,u,svg){
 const ns='http://www.w3.org/2000/svg',g=w.document.createElementNS(ns,'g');g.classList.add('unit',u.side);g.dataset.unitId=u.id;g.setAttribute('tabindex','0');g.setAttribute('role','button');
 g.innerHTML='<rect x="10" y="9" width="40" height="33"/><text class="unit-name">SQ</text><text class="strength" x="30" y="35">3 · 2</text>';svg.append(g);return g;
}
for(const width of [2560,390]){
 const {dom,w}=boot(width),d=w.document,before=JSON.stringify(w.state),map=d.getElementById('map');
 const counter=addCounter(w,w.state.units[0],map);let clicks=0;counter.addEventListener('click',()=>clicks++);
 for(const u of w.state.units)d.getElementById('artPlate').append(w.makeUnitPortrait(u));
 d.dispatchEvent(new w.Event('ww2:render'));
 assert.equal(d.querySelectorAll('#artPlate .unit-illustration').length,entries.length);
 for(const [i,u] of entries.entries()){
  const portrait=d.getElementById('artPlate').children[i],ground=!['carrier','battleship','cruiser','destroyer','fighter','bomber','transport_aircraft','landing_craft'].includes(u.kind);
  assert.equal(!!portrait.querySelector('.unit-role-badge'),ground,u.kind);
  if(ground){assert.ok(w.unitBadgeLabel(u));assert.equal(portrait.querySelector('.illustration-role'),null,'Ground badges replace the older tiny overlay');}
 }
 assert.ok(d.querySelector('.badge-captain'));assert.ok(d.querySelector('.badge-leader'));assert.ok(d.querySelector('.badge-commander'));
 for(const image of d.querySelectorAll('image')){
  const p=path.join(assets,image.getAttribute('href').replace('/assets/',''));assert.ok(fs.existsSync(p),p);
  assert.ok(image.parentElement.querySelector('image'));assert.ok(image.getAttribute('clip-path'),'Every atlas window needs source clipping, including letterbox space');assert.ok(!image.closest('.unit-portrait').classList.contains('illustration-ready'));
  image.dispatchEvent(new w.Event('load'));assert.ok(image.closest('.unit-portrait').classList.contains('illustration-ready'));
 }
 counter.querySelector('image').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(clicks,1,'The existing counter still owns input');
 assert.equal(counter.getAttribute('tabindex'),'0');assert.equal(counter.querySelector('.strength').textContent,'3 · 2');
 const failed=d.querySelector('#artPlate image'),failedDrawing=failed.closest('.unit-portrait');failed.dispatchEvent(new w.Event('error'));
 assert.ok(!failedDrawing.classList.contains('illustration-ready'));assert.equal(failedDrawing.querySelector('image'),null);assert.ok(failedDrawing.querySelector('.art-solid'));
 const lib=w.ww2UnitIllustrations,resolve=(u,board=w.state)=>lib.resolve({side:'us',pos:[0,0],...u},board);
 for(const kind of kinds)assert.ok(resolve({kind}),kind);
 for(const [kind,variant] of variants)assert.ok(resolve({kind,variant}),variant);
 assert.equal(resolve({kind:'new_unrecognised_role'}),null);
 assert.equal(resolve({kind:'amphibious'}).key,'landing_craft');assert.equal(resolve({kind:'amphibious'},{naval_version:1,map:[['open']]}).key,'rifle_us');
 assert.equal(resolve({kind:'fighter',faction:'jp'}).key,'zero');assert.equal(resolve({kind:'fighter',faction:'gb'}).key,'spitfire');
 assert.notEqual(resolve({kind:'tank',variant:'firefly'}).key,resolve({kind:'tank',variant:'tiger'}).key);
 for(const portrait of Object.values(lib.portraits)){const a=lib.atlases[portrait.atlas],[x,y,width,height]=portrait.box;assert.ok(x>=0&&y>=0&&width>0&&height>0&&x+width<=a.width&&y+height<=a.height,portrait.key);}
 // Saved preference, close-ups, the map, reserves and replay all share the mode.
 const replayUnit={...entries[1],id:'replay'};w.playbackSession={frames:[{after:{units:[replayUnit]}}],index:0,phase:'after'};addCounter(w,replayUnit,d.getElementById('playbackMap'));
 d.dispatchEvent(new w.Event('ww2:playback'));assert.equal(d.querySelectorAll('#playbackMap image').length,1);
 const reserve=w.makeUnitPortrait({...entries[0],reserve:true,carrier_id:'cv'});d.body.append(reserve);assert.ok(reserve.querySelector('image'));
 d.getElementById('unitStyleToggle').click();assert.equal(d.querySelectorAll('image').length,0);assert.equal(w.localStorage.getItem('ww2-unit-style'),'basic');
 assert.equal(d.querySelectorAll('#artPlate .unit-art-basic').length,entries.length);
 assert.ok(counter.querySelector('.unit-role-badge'),'Role identity remains visible in Basic mode');
 d.getElementById('unitStyleToggle').click();assert.equal(d.querySelectorAll('#artPlate image').length,entries.length);assert.equal(w.localStorage.getItem('ww2-unit-style'),'detailed');
 assert.equal(JSON.stringify(w.state),before,'Artwork and preference changes must not alter battle state');
 const pinned=w.makeUnitPortrait({...entries[0],pinned:true,entrenched:true,overwatch:true});assert.ok(pinned.querySelector('.is-pinned .counter-pin'));assert.ok(pinned.querySelector('.counter-sandbags'));assert.ok(pinned.querySelector('.counter-overwatch'));
 assert.notEqual(pinned.querySelector('.counter-pin').getAttribute('transform'),pinned.querySelector('.unit-role-badge').getAttribute('transform'),'Pin and role must occupy different corners');
 dom.window.close();
}
for(const preference of ['basic','classic','detailed']){const {dom,w}=boot(390,preference);const portrait=w.makeUnitPortrait(entries[0]);assert.equal(!!portrait.querySelector('image'),preference==='detailed');dom.window.close();}
console.log(`PASS: ${kinds.length} roles, ${variants.length} variants, factions, reserves, replay, load/error fallbacks, input/status preservation and both persisted modes at desktop/phone widths. No game-state writes.`);
if(process.argv.includes('--render')){
 const {dom,w}=boot(1440),ns='http://www.w3.org/2000/svg',lib=w.ww2UnitIllustrations;
 // librsvg's embedded-image loader lacks WebP on some hosts; losslessly decode
 // to PNG only for this offline SVG proof. Production continues to use WebP.
 const defs=Object.entries(lib.atlases).map(([key,a])=>`<image id="atlas-${key}" width="${a.width}" height="${a.height}" href="data:image/png;base64,${require('node:child_process').execFileSync('convert',[path.join(assets,'unit-images',a.file),'png:-'],{maxBuffer:20*1024*1024}).toString('base64')}"/>`).join('');
 const all=process.argv.includes('--all'),chosen=process.argv.includes('--roles')?[entries[0],entries.at(-1),entries[3],entries[2],entries[4],entries[5],entries[31],{...entries[2],pinned:true,overwatch:true}]:all?entries:[entries[0],entries[4],entries[5],entries[6],entries[12],entries[7],entries[34],entries[11],entries[13],entries[14],entries[17],entries[46]];
 const cols=all?5:4,cardWidth=238,cardHeight=192,rows=Math.ceil(chosen.length/cols),width=cols*cardWidth+40,height=rows*cardHeight+110;
 const groups=chosen.map((u,i)=>{
  const svg=w.makeUnitPortrait(u),counter=svg.querySelector('.unit');
  for(const im of svg.querySelectorAll('image')){im.dispatchEvent(new w.Event('load'));const use=w.document.createElementNS(ns,'use'),atlas=Object.entries(lib.atlases).find(([,a])=>im.getAttribute('href').endsWith(a.file))[0];use.setAttribute('href','#atlas-'+atlas);if(im.hasAttribute('clip-path'))use.setAttribute('clip-path',im.getAttribute('clip-path'));im.replaceWith(use);}
  const text=w.document.createElementNS(ns,'text');text.setAttribute('x','30');text.setAttribute('y','35');text.setAttribute('text-anchor','middle');text.setAttribute('fill','#fff3c8');text.setAttribute('font-size','7');text.textContent='●●● · 2';counter.append(text);
  const large=svg.outerHTML.replace('<svg ','<svg x="8" y="12" width="158" height="152" '),small=svg.outerHTML.replaceAll('unit-illustration-','small-unit-illustration-').replace('<svg ','<svg x="177" y="99" width="44" height="42" ');
  return `<g transform="translate(${20+i%cols*cardWidth} ${90+Math.floor(i/cols)*cardHeight})"><rect width="230" height="184" rx="6" fill="#f6f4e9" stroke="#b5bcb0"/>${large}${small}<text x="115" y="170" text-anchor="middle" fill="#203b34" font-size="13" font-family="sans-serif">${(u.variant||u.kind).replaceAll('_',' ')}${u.faction?' · '+u.faction:''}</text></g>`;
 }).join('');
 const css=fs.readFileSync(path.join(assets,'unit-art.css'),'utf8').replaceAll('var(--art-ink)','#f3edce').replaceAll('var(--art-dark)','#162e35').replaceAll('var(--art-mid)','#c8ccb9');
 const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" class="illustrated-units"><style>${css}.illustrated-units .unit.us>rect{fill:#1264b1}.illustrated-units .unit.de>rect{fill:#b53c25}</style><defs>${defs}</defs><rect width="100%" height="100%" fill="#e5e7de"/><rect width="100%" height="72" fill="#172c28"/><text x="28" y="31" font-family="sans-serif" font-size="21" fill="#f3ead0">DSL · Detailed artwork preview</text><text x="28" y="55" font-family="sans-serif" font-size="13" fill="#c8d0be">Enlarged counters + map-size samples · Gameplay unchanged · Not live</text>${groups}</svg>`;
 const dir=path.join(root,'artifacts');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,all?'unit-art-v2-all.png':'unit-art-v2-counters.png');
 require('sharp')(Buffer.from(source)).png().toFile(file).then(()=>console.log(file)).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>dom.window.close());
}
if(process.argv.includes('--preview')){
 const {dom,w}=boot(1440),d=w.document,plate=d.getElementById('artPlate');
 const labels={squad:'Rifle squad',leader:'Lieutenant',commander:'Commander',tank:'Sherman',mg:'Machine gun',at_team:'Bazooka team',at_gun:'Anti-tank gun',amphibious:'Landing section',aa_gun:'Heavy AA',transport_aircraft:'Dakota',flak:'Light Flak'};
 for(const u of entries){const card=d.createElement('article'),name=d.createElement('h2'),sizes=d.createElement('div');name.textContent=(u.variant||labels[u.kind]||u.kind).replaceAll('_',' ')+(u.faction?' · '+u.faction.toUpperCase():'');sizes.className='sizes';for(const size of ['large','map-size']){const svg=w.makeUnitPortrait(u);svg.classList.add(size);sizes.append(svg);}card.append(sizes,name);plate.append(card);}
 const css=fs.readFileSync(path.join(assets,'unit-art.css'),'utf8');
 const script=fs.readFileSync(path.join(assets,'unit-art-illustrations.js'),'utf8')+'\n'+fs.readFileSync(path.join(assets,'unit-art.js'),'utf8');
 const imageData={};for(const a of Object.values(w.ww2UnitIllustrations.atlases))imageData['/assets/unit-images/'+a.file]='data:image/webp;base64,'+fs.readFileSync(path.join(assets,'unit-images',a.file)).toString('base64');
 // The same production renderer paints this preview, including image load/error handling.
 const preview=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DSL · Detailed artwork preview</title><style>${css}
 *{box-sizing:border-box}body{margin:0;background:#e5e7de;color:#172c2b;font:14px system-ui}header{padding:24px 32px;background:#172c28;color:#f1e8cf}h1{font:600 28px Georgia;margin:4px 0 8px}header p{margin:6px 0;color:#cbd1bd;max-width:780px}#playTools{position:sticky;top:0;padding:12px 32px;background:#ccd3c4;z-index:1;display:flex;align-items:center;gap:18px}button{background:#213d35;color:#fff0cf;border:1px solid #667c65;padding:10px 16px;border-radius:4px;cursor:pointer}#playTools #unitStyleToggle{font-size:13px;width:160px}#artPlate{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;padding:24px 32px}article{background:#f6f4e9;border:1px solid #b5bcb0;border-radius:6px;padding:14px 10px}h2{text-transform:capitalize;text-align:center;font-size:13px;font-weight:600;margin:10px 0 0}.sizes{display:flex;justify-content:center;align-items:flex-end;gap:6px}.large{width:140px;height:135px}.map-size{width:44px;height:42px}footer{padding:0 32px 32px;color:#475c50}@media(max-width:600px){header{padding:18px}#playTools{padding:10px 18px;flex-wrap:wrap}#artPlate{padding:16px;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.large{width:100%;height:auto;max-width:125px}.map-size{width:36px;flex:none}article{padding:12px 4px}.sizes{gap:0}}
 </style><header><small>DSL / ART DIRECTION PREVIEW / NOT LIVE</small><h1>Detailed military miniatures</h1><p>New painted artwork in the existing faction-coloured counters. Each role appears enlarged and at map size. Basic symbols and all gameplay remain unchanged.</p></header><div id="playTools"><span>Compare both unit styles</span></div><main id="artPlate"></main><footer>Preview only. Generic role illustrations are recognition aids, not exact historical model specifications. Rank and cruiser-role badges preserve shared-model distinctions.</footer><script>
 const state={units:${JSON.stringify(entries)},naval_version:1,map:[['water']]};const center=()=>[30,25],sideLabel=s=>s,unitName=u=>u.variant||u.kind;let playbackSession=null;
 ${script}
 const labels=${JSON.stringify(labels)},imageData=${JSON.stringify(imageData)};
 const originalSetAttribute=SVGElement.prototype.setAttribute;SVGElement.prototype.setAttribute=function(k,v){return originalSetAttribute.call(this,k,k==='href'&&imageData[v]?imageData[v]:v)};
 for(const u of state.units){const card=document.createElement('article'),name=document.createElement('h2'),sizes=document.createElement('div');name.textContent=(u.variant||labels[u.kind]||u.kind).replaceAll('_',' ')+(u.faction?' · '+u.faction.toUpperCase():'');sizes.className='sizes';for(const size of ['large','map-size']){const svg=makeUnitPortrait(u);svg.classList.add(size);sizes.append(svg);}card.append(sizes,name);document.getElementById('artPlate').append(card);}
 </script></html>`;
 const dir=path.join(root,'artifacts');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'unit-art-v2-preview.html');fs.writeFileSync(file,preview);console.log(file);dom.window.close();
}
