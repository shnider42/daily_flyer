/* Full application + real move, with local display fixtures for additional icons.
   Optional offline SVG proof; no browser/Safari layout claims. */
const {make,click,delay,root,cleanup}=require('./ww2-weather-debrief-dom.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kinds=['scout','spearman','archer','builder','settler','galley'];
async function proof(w){
 const sharp=require('sharp'),ns='http://www.w3.org/2000/svg';
 const data=await sharp(path.join(root,'ww2_tactics/static/unit-images/empires-miniatures-v1.webp')).png().toBuffer();
 const metadata=await sharp(data).metadata();assert.equal(metadata.width,1774);assert.equal(metadata.height,887);assert.equal(metadata.hasAlpha,true);
 const entries=kinds.map((kind,i)=>({kind,side:i%2?'highland':'river',hp:kind==='galley'?6:3,ap:kind==='settler'?0:2,fortified:kind==='spearman',shaken:kind==='archer'}));
 entries.push({side:'river',capital:true},{side:'highland',buildings:['walls']});
 const cards=[];
 for(const [theme,bg]of [['Night','#1c2a3d'],['Daylight','#e8e2d4']])for(const [i,item]of entries.entries()){
  const specimens=[];
  for(const [style,x,y,size]of [['detailed',12,12,112],['detailed',137,65,44],['basic',187,65,44]]){
   w.ww2UnitStyle.set(style);const svg=w.empiresArt.portrait(item);svg.removeAttribute('class');svg.setAttribute('x',x);svg.setAttribute('y',y);svg.setAttribute('width',size);svg.setAttribute('height',size*53/50);
   for(const im of svg.querySelectorAll('image')){
    im.dispatchEvent(new w.Event('load'));const use=w.document.createElementNS(ns,'use');use.setAttribute('href','#emp-atlas');use.setAttribute('clip-path',im.getAttribute('clip-path'));im.replaceWith(use);
   }
   specimens.push(svg.outerHTML);
  }
  const n=(theme==='Night'?0:8)+i,ink=theme==='Night'?'#f0e9dc':'#293947';
  cards.push(`<g transform="translate(${20+n%4*245} ${85+Math.floor(n/4)*185})"><rect width="235" height="175" rx="7" fill="${bg}" stroke="#6b7b8e"/>${specimens.join('')}<text x="12" y="150" font-size="14" fill="${ink}">${w.empiresArt.names[w.empiresArt.kind(item)]} · ${theme}</text><text x="137" y="124" font-size="9" fill="${ink}">Detailed / Basic</text></g>`);
 }
 const css=fs.readFileSync(path.join(root,'ww2_tactics/static/empires.css'),'utf8');
 const source=`<svg xmlns="${ns}" id="empires" width="1020" height="840" viewBox="0 0 1020 840"><style>${css}</style><defs><image id="emp-atlas" width="1774" height="887" href="data:image/png;base64,${data.toString('base64')}"/></defs><rect width="1020" height="840" fill="#101a29"/><text x="20" y="35" font-family="sans-serif" font-size="24" fill="#f0e9dc">EMPIRES · UNIT RECOGNITION</text><text x="20" y="61" font-family="sans-serif" font-size="13" fill="#bac8dc">Offline artwork proof · large portraits and 44 px counters · not an iPhone screenshot</text>${cards.join('')}</svg>`;
 const out=path.join(root,'docs/previews/empires-icons-v1.png');await sharp(Buffer.from(source)).png().toFile(out);console.log(out);
}
async function main(){
 const v=await make(390),{w,$}=v;
 try{
  assert.equal($('empUnitGuideList').querySelector('image'),null,'DSL-only visits do not request the Empires atlas');
  await click(v,$('modeEmpires'));await click(v,$('empCreate'));
  const state=()=>w.empiresUI.state,map=$('empMapWrap'),scout=state().units.find(u=>u.side===state().side&&u.kind==='scout');
  let posts=0;const realFetch=w.fetch;w.fetch=(url,opts)=>{if(opts?.method==='POST')posts++;return realFetch(url,opts);};
  const counter=$('empMap').querySelector(`[data-unit-id="${scout.id}"]`);
  assert.ok(counter.querySelector('.emp-art-fallback'));assert.ok(counter.querySelector('image'));
  assert.equal(counter.getAttribute('role'),'button');assert.equal(counter.getAttribute('tabindex'),'0');
  counter.querySelector('image').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await delay();
  assert.equal(w.empiresUI.selection,scout.id);assert.equal(posts,0);
  assert.equal($('empSelectedPortrait').querySelector('[data-art-kind]').dataset.artKind,'scout');
  assert.equal($('empPanel').querySelector('[data-art-kind]').dataset.artKind,'scout');
  const initial=JSON.stringify(state());map.scrollLeft=117;map.scrollTop=64;
  await click(v,$('empMenuOpen'));assert.equal($('empArtToggle').parentElement.id,'empMenuTools');
  for(const level of ['simple','moderate','expert']){
   w.ww2Experience.set(level);await delay();
   for(const style of ['basic','detailed']){
    if(w.empiresArt.style!==style)await click(v,$('empArtToggle'));
    assert.equal(w.ww2UnitStyle.value,style);assert.equal(w.localStorage.getItem('ww2-unit-style'),style);
    assert.match($('unitStyleToggle').textContent,new RegExp(style));assert.equal($('empMenu').open,true);
    assert.equal(!!$('empMap').querySelector('.unit image'),style==='detailed');
    assert.equal(!!$('empRoster').querySelector('image'),style==='detailed');
    assert.equal(!!$('empSelectedPortrait').querySelector('image'),style==='detailed');
    assert.equal(w.empiresUI.selection,scout.id);assert.equal(map.scrollLeft,117);assert.equal(map.scrollTop,64);
    assert.equal(JSON.stringify(state()),initial);assert.equal(posts,0);
   }
  }
  // The setting can change from DSL too, without stale Empires art.
  $('unitStyleToggle').click();assert.equal(w.empiresArt.style,'basic');assert.equal($('empMap').querySelector('image'),null);
  $('unitStyleToggle').click();assert.equal(w.empiresArt.style,'detailed');
  await click(v,w.document.querySelector('[data-emp-close="empMenu"]'));
  const move=state().legal[scout.id].moves[0],beforeAP=scout.ap;
  await w.empiresUI.order({kind:'move',unit:scout.id,pos:move.pos});
  assert.equal(posts,1);assert.equal(state().units.find(u=>u.id===scout.id).pos.join(','),move.pos.join(','));
  assert.equal(state().units.find(u=>u.id===scout.id).ap,beforeAP-move.cost);
  assert.equal($('empMap').querySelector(`[data-unit-id="${scout.id}"]`),counter,'Art uses retained input counters');
  // Additional roles and statuses are isolated renderer fixtures, never API orders.
  const host=w.document.createElement('div');w.document.body.append(host);
  for(const kind of kinds)host.append(w.empiresArt.portrait({kind,side:'river',hp:3,ap:0,shaken:true,fortified:true}));
  host.append(w.empiresArt.portrait({side:'highland',capital:true,buildings:['walls']}));
  for(const p of host.children){
   const drawing=p.querySelector('.emp-unit-art'),im=p.querySelector('image');assert.ok(im.getAttribute('clip-path'));
   assert.equal(drawing.classList.contains('emp-art-ready'),false);im.dispatchEvent(new w.Event('load'));assert.equal(drawing.classList.contains('emp-art-ready'),true);
   im.dispatchEvent(new w.Event('error'));assert.equal(drawing.querySelector('image'),null);assert.ok(drawing.querySelector('.emp-art-fallback'));assert.equal(drawing.classList.contains('emp-art-ready'),false);
   if(p.querySelector('[data-art-kind="walled_city"]'))assert.ok(p.querySelector('.emp-capital-mark'));
   else{assert.ok(p.querySelector('.emp-shaken-flag'));assert.ok(p.querySelector('.emp-fortified-mark'));assert.match(p.textContent,/3 HP · 0 AP/);}
  }
  host.remove();
  for(const [key,{box:[x,y,width,height]}]of Object.entries(w.empiresArt.portraits))assert.ok(x>=0&&y>=0&&x+width<=1774&&y+height<=887,key);
  assert.equal($('empUnitGuideList').children.length,6);assert.doesNotMatch($('empUnitGuideList').textContent,/undefined/);
  // Local stacked-counter fixture: neither own unit disappears when art changes.
  const own=state().units.filter(u=>u.side===state().side);own[1].pos=own[0].pos.slice();
  w.ww2UnitStyle.set('basic');
  const stacked=own.slice(0,2).map(u=>$('empMap').querySelector(`[data-unit-id="${u.id}"]`));
  assert.ok(stacked.every(g=>g.querySelector('.emp-counter').getAttribute('transform').includes('scale(0.85)')));
  assert.notEqual(stacked[0].getAttribute('transform'),stacked[1].getAttribute('transform'));assert.equal(posts,1);
  w.innerWidth=1440;w.dispatchEvent(new w.Event('resize'));await delay();assert.notEqual($('empArtToggle').parentElement.id,'empMenuTools');
  assert.equal(w.document.querySelectorAll('#empArtToggle').length,1);
  if(process.argv.includes('--proof'))await proof(w);
 }finally{await delay();w.close();}
 // Reload honors the same stored Basic preference and makes no Detailed images.
 const basic=await make(390,{'ww2-unit-style':'basic'});
 try{assert.equal(basic.w.empiresArt.style,'basic');assert.equal(basic.$('empUnitGuideList').querySelector('image'),null);}finally{basic.w.close();}
 console.log('PASS: six roles/cities, shared saved style, all Experiences, phone map/roster/orders/guide, image load/error fallback, retained input and real move/AP, status and stacked counters. DOM/API + optional offline art proof only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(cleanup);
