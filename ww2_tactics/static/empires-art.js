/* Empires presentation only. Shared DSL art preference; independent ancient-world art. */
'use strict';
(()=>{
 const ns='http://www.w3.org/2000/svg',file='/assets/unit-images/empires-miniatures-v1.webp';let serial=0;
 const portraits={
  scout:{box:[38,126,381,351]},
  spearman:{box:[506,1,324,477]},
  archer:{box:[943,0,357,478]},
  builder:{box:[1404,102,347,378]},
  settler:{box:[14,502,433,359]},
  galley:{box:[447,467,469,403],clip:'M447 467H892V767H916V870H447Z'},
  city:{box:[902,495,418,369],clip:'M916 495H1320V864H916V767H902V580H916Z'},
  walled_city:{box:[1330,501,444,359]}
 };
 const names={scout:'Scout',spearman:'Spearmen',archer:'Archers',builder:'Builders',settler:'Settlers',galley:'Galley',city:'City',walled_city:'Walled city'};
 const node=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const path=(d,cls)=>node('path',{d,class:cls});
 const kind=item=>item.kind||((item.buildings||[]).includes('walls')?'walled_city':'city');
 const style=()=>window.ww2UnitStyle?.value||'detailed';
 function silhouette(key){
  const g=node('g',{class:'emp-art-fallback'}),solid=d=>g.append(path(d,'emp-art-solid')),line=d=>g.append(path(d,'emp-art-line'));
  if(key==='scout'){
   solid('M-10 11Q-14 1-4-11Q1-16 6-10L3-5-2-2 5 1 11 8 7 12 1 5-3 11Z');
   line('M2-7 10-9 14-5M-4 1-8 13M11 1 11 14');
  }else if(key==='spearman'){
   solid('M-4-12Q0-17 4-12V-8H-4ZM-5-6H4L7 4 4 6 7 14H2L0 6-3 14H-8L-5 4Z');
   line('M-12-13V14');solid('M-12-18-15-11H-9Z');
   g.append(node('ellipse',{cx:8,cy:0,rx:7,ry:10,class:'emp-art-solid'}),path('M8-7V7','emp-art-cutline'));
  }else if(key==='archer'){
   solid('M-6-12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M-5-6H2L4 4 1 5 5 14H0L-3 6-6 14H-11L-6 3Z');
   line('M-2-4 10-3M10-15Q21 0 10 14M10-15 7-3 10 14M1-3H18M15-6 18-3 15 0');
  }else if(key==='builder'){
   solid('M-8-11a4 4 0 1 0 8 0a4 4 0 1 0-8 0M-7-5H1L5 5 2 6 5 14H0L-3 6-6 14H-11L-8 3Z');
   line('M-5-1 5 2M1-11 12 10');solid('M8 7 15 4 18 12Q16 17 12 15Z');
  }else if(key==='settler'){
   solid('M-17-3H7V7H-14ZM-14-11H-5V-4H-14ZM-3-9H5V-4H-3Z');
   g.append(node('circle',{cx:-8,cy:9,r:6,class:'emp-art-solid'}),node('circle',{cx:-8,cy:9,r:2,class:'emp-art-dark'}));
   line('M6 3H15M12-3 15 5 12 14M15 5 18 14');g.append(node('circle',{cx:12,cy:-8,r:3.5,class:'emp-art-solid'}));
  }else if(key==='galley'){
   solid('M-20 7H19L13 14H-12ZM-3-15H11V3H-3Z');line('M-5-17V8M-17 5-12 16M-9 5-4 16M-1 5 4 16M7 5 12 16M-18 4-21 1');
  }else{
   solid('M-16-1H-5V13H-16ZM-3-12H9V13H-3ZM11 1H18V13H11ZM-18-2-10-9-3-2ZM-6-13 3-19 12-13ZM9 0 15-6 20 0Z');
   line('M1-6H5M1 0H5');
   if(key==='walled_city')solid('M-20 7H-15V10H-11V7H-6V10H-2V7H3V10H7V7H12V10H16V7H21V18H5V13H-1V18H-20Z');
  }
  return g;
 }
 function artwork(key){
  const g=node('g',{class:'emp-unit-art','data-art-kind':key,'data-art-style':style(),'aria-hidden':'true'});g.append(silhouette(key));
  if(style()==='basic'||!portraits[key])return g;
  const p=portraits[key],[x,y,w,h]=p.box,id=`emp-art-clip-${++serial}`;
  const viewport=node('svg',{x:-19,y:-19,width:38,height:37,viewBox:p.box.join(' '),preserveAspectRatio:'xMidYMid meet',overflow:'hidden',class:'emp-art-image'});
  const defs=node('defs'),clip=node('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
  clip.append(node('path',{d:p.clip||`M${x} ${y}h${w}v${h}h-${w}Z`}));defs.append(clip);
  const image=node('image',{href:file,width:1774,height:887,'clip-path':`url(#${id})`});
  image.addEventListener('load',()=>g.classList.add('emp-art-ready'),{once:true});
  image.addEventListener('error',()=>{g.classList.remove('emp-art-ready');viewport.remove();},{once:true});
  viewport.append(defs,image);g.append(viewport);return g;
 }
 function counter(item,{stats=true}={}){
  const key=kind(item),g=node('g',{class:`emp-counter ${item.side||'river'}`,'aria-hidden':'true'});
  g.append(path(item.side==='highland'?'M-21-21H21V22H-21Z':'M-15-21H15Q21-21 21-15V16Q21 22 15 22H-15Q-21 22-21 16V-15Q-21-21-15-21Z','emp-counter-frame'));
  g.append(path(stats?'M-18-18H18V11H-18Z':'M-18-18H18V19H-18Z','emp-portrait-panel'));
  const art=artwork(key);art.setAttribute('transform',stats?'translate(0 -4) scale(.82)':'scale(.95)');g.append(art);
  if(stats){
   g.append(path('M-20 11H20V21H-20Z','emp-stat-strip'));
   const label=`${item.hp} HP${item.ap!==undefined?' · '+item.ap+' AP':''}`;
   g.append(node('text',{x:0,y:19,'text-anchor':'middle',textLength:Math.min(36,label.length*3.2),lengthAdjust:'spacingAndGlyphs',class:'emp-counter-stats'},label));
  }
  if(item.fortified)g.append(path('M-19-20H-9V-17H-12V-14H-16V-17H-19Z','emp-fortified-mark'));
  if(item.shaken){g.append(path('M10-22H23V-9H10Z','emp-shaken-flag'),path('M16.5-19V-15M16.5-12.5V-12','emp-shaken-mark'));}
  if(item.capital)g.append(path('M-15-20-13-16-9-18-10-12H-20L-21-18-17-16Z','emp-capital-mark'));
  g.append(path('M-24-12V-24H-12M12-24H24V-12M24 12V25H12M-12 25H-24V12','emp-selection-brackets'));
  return g;
 }
 function portrait(item){
  const svg=node('svg',{viewBox:'-25 -26 50 53',class:'emp-portrait','aria-hidden':'true',focusable:'false'});svg.append(counter(item,{stats:!!item.kind&&Number.isFinite(item.hp)}));return svg;
 }
 window.empiresArt={artwork,counter,portrait,kind,names,portraits,get style(){return style();},file};
})();
