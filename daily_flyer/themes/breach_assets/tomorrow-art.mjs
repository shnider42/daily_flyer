// Original local artwork for Tomorrow. Shared by WebGL and the software fallback.
export const TOMORROW_PALETTES = {
  arrivals:{base:[57,77,80],panel:'#385961',dark:'#142a37',trim:'#e0d6ba',accent:'#ffc785',light:0xffd29c,fog:[15,29,39],motif:'doors'},
  orchard:{base:[92,46,56],panel:'#813c51',dark:'#321f35',trim:'#e8d9b8',accent:'#f8aba3',light:0xffc0ae,fog:[38,16,35],motif:'teeth'},
  aquarium:{base:[39,83,100],panel:'#285b78',dark:'#152b48',trim:'#bcf2ec',accent:'#7fe9e6',light:0xa2f7ee,fog:[10,27,47],motif:'fish'},
  wardrobe:{base:[83,58,104],panel:'#694c83',dark:'#282240',trim:'#e7d7ed',accent:'#e9b0ff',light:0xe3bcf6,fog:[26,16,42],motif:'faces'},
  exchange:{base:[89,76,48],panel:'#80683c',dark:'#302e2b',trim:'#f0dfb3',accent:'#f5ca72',light:0xffdf98,fog:[34,29,25],motif:'clock'},
  sunday:{base:[105,71,73],panel:'#99645e',dark:'#442c37',trim:'#ffdcca',accent:'#ffd183',light:0xffcfa0,fog:[45,27,38],motif:'window'},
  museum:{base:[49,82,74],panel:'#396f61',dark:'#172e32',trim:'#cedbc3',accent:'#9fe3bd',light:0xb8ebc8,fog:[12,31,31],motif:'frames'},
  court:{base:[81,48,42],panel:'#794133',dark:'#2e2330',trim:'#e9c1a1',accent:'#ffad67',light:0xffbc8b,fog:[37,19,28],motif:'eye'},
  weather:{base:[62,64,103],panel:'#494e83',dark:'#24233c',trim:'#d5d9ed',accent:'#bdc7ff',light:0xd2d9ff,fog:[20,20,44],motif:'storm'},
};
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
const line=(c,points,color,width=2)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();};
const poly=(c,points,color)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
const oval=(c,x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
const text=(c,word,x,y,size,color)=>{c.fillStyle=color;c.textAlign='center';c.font=`bold ${size}px monospace`;c.fillText(word,x,y);};
function tooth(c,x,y,size,p){
  c.save();c.translate(x,y);c.scale(size/60,size/60);
  poly(c,[[-25,-26],[-13,-35],[0,-29],[16,-34],[29,-20],[24,1],[16,32],[7,23],[0,4],[-9,30],[-17,33],[-23,9]],p.trim);
  poly(c,[[-25,-26],[-13,-35],[-12,-2],[-17,25],[-23,9]],'#a69ba5');
  line(c,[[-15,-21],[-4,-13],[8,-20],[19,-17]],p.dark,3);
  oval(c,2,-8,4,5,p.dark);c.restore();
}
function eye(c,x,y,w,p){
  c.save();c.translate(x,y);c.scale(w/70,w/70);
  poly(c,[[-35,0],[-17,-17],[4,-23],[23,-13],[35,0],[17,16],[-2,22],[-24,12]],p.trim);
  oval(c,1,0,15,19,p.accent);oval(c,1,0,6,16,p.dark);oval(c,-4,-8,3,4,'#fff5d8');c.restore();
}
function clock(c,x,y,r,p){
  oval(c,x,y,r,r,p.trim);oval(c,x,y,r-3,r-3,p.dark);oval(c,x,y,r-8,r-8,p.panel);
  for(let n=0;n<12;n++){const a=n*Math.PI/6;line(c,[[x+Math.sin(a)*(r-5),y-Math.cos(a)*(r-5)],[x+Math.sin(a)*(r-9),y-Math.cos(a)*(r-9)]],p.accent,2);}
  text(c,'13',x,y-r+18,8,p.trim);text(c,'00',x,y+r-10,8,p.trim);
  line(c,[[x-15,y+5],[x,y],[x+5,y-21]],p.trim,3);oval(c,x,y,4,4,p.accent);
}
function face(c,x,y,size,p){
  c.save();c.translate(x,y);c.scale(size/64,size/64);
  poly(c,[[-24,-30],[21,-32],[31,-11],[23,17],[5,35],[-19,21],[-29,-5]],p.trim);
  poly(c,[[-24,-30],[-12,-20],[-15,10],[5,35],[-19,21],[-29,-5]],'#9a9aaa');
  oval(c,-11,-8,7,4,p.dark);oval(c,12,-11,8,4,p.dark);line(c,[[3,-4],[-1,7],[7,7]],p.panel,3);oval(c,3,18,8,3,p.dark);c.restore();
}
function fish(c,x,y,size,p){
  c.save();c.translate(x,y);c.scale(size/80,size/80);
  poly(c,[[-30,0],[-49,-24],[-45,24]],p.accent);
  oval(c,0,0,34,16,p.trim);poly(c,[[-13,-13],[-4,-27],[13,-14]],p.accent);
  for(let n=0;n<5;n++)line(c,[[-22+n*8,-11],[-17+n*8,0],[-22+n*8,11]],p.panel,2);
  oval(c,21,-3,7,9,p.dark);oval(c,23,-6,2,3,'#f7f0d1');c.restore();
}
function doorway(c,x,y,w,h,p){
  rect(c,x-w/2-5,y-h,w+10,h+5,p.trim);rect(c,x-w/2,y-h+4,w,h-4,p.dark);
  for(let i=0;i<4;i++){c.strokeStyle=i%2?p.accent:p.panel;c.lineWidth=2;c.strokeRect(x-w/2+5+i*4,y-h+10+i*6,w-10-i*8,h-17-i*9);}
  oval(c,x+w/2-7,y-h*.45,2,2,p.accent);
}
function storm(c,x,y,w,p){
  oval(c,x-w*.25,y,w*.28,w*.17,p.trim);oval(c,x,y-w*.09,w*.3,w*.23,p.trim);oval(c,x+w*.27,y,w*.25,w*.16,p.trim);
  poly(c,[[x+2,y+6],[x-15,y+30],[x-2,y+26],[x-9,y+47],[x+17,y+17],[x+2,y+21]],p.accent);
  for(let n=-2;n<=2;n++)line(c,[[x+n*w*.16,y-25],[x+n*w*.16+3,y-43]],p.accent,2);
}
function stairs(c,x,y,w,p){
  for(let n=0;n<7;n++){let xx=x-w/2+n*w/7,yy=y-n*w/11;rect(c,xx,yy,w/7+1,w*.65+n*w/11,p.panel);rect(c,xx,yy,w/7+1,3,p.trim);}
  line(c,[[x-w/2-5,y+4],[x+w/2,y-w*.59]],p.accent,2);
}
function motif(c,name,p){
  if(name==='teeth'){line(c,[[8,114],[25,88],[18,64],[44,42],[49,16]],p.accent,4);tooth(c,76,63,69,p);}
  else if(name==='fish'){for(let y=18;y<120;y+=20)line(c,[[0,y],[25,y+3],[62,y],[92,y+4],[128,y]],p.accent,1);fish(c,65,63,99,p);}
  else if(name==='faces'){for(const[x,y,size]of[[36,50,44],[88,77,52]]){line(c,[[x,0],[x,y-size/2]],p.trim,1);face(c,x,y,size,p);}}
  else if(name==='clock')clock(c,64,63,42,p);
  else if(name==='window'){rect(c,20,17,88,89,p.trim);rect(c,25,22,78,78,'#274b70');oval(c,78,45,14,14,p.accent);poly(c,[[25,100],[25,79],[45,66],[65,87],[84,68],[103,86],[103,100]],'#607d81');line(c,[[64,22],[64,101]],p.trim,4);line(c,[[25,61],[103,61]],p.trim,4);}
  else if(name==='frames'){for(let i=0;i<5;i++){c.strokeStyle=i%2?p.accent:p.trim;c.lineWidth=3;c.strokeRect(13+i*8,16+i*8,102-i*16,94-i*16);}oval(c,65,62,5,7,p.accent);}
  else if(name==='eye'){for(let n=0;n<12;n++){let a=n*Math.PI/6;line(c,[[64+Math.sin(a)*31,63+Math.cos(a)*31],[64+Math.sin(a)*53,63+Math.cos(a)*53]],p.accent,2);}eye(c,64,63,82,p);}
  else if(name==='storm')storm(c,64,58,80,p);
  else {doorway(c,64,111,59,90,p);text(c,'YESTERDAY',64,14,8,p.accent);}
}
export function paintTomorrowSurface(c,kind,name,ceiling=false){
  const p=TOMORROW_PALETTES[name]||TOMORROW_PALETTES.arrivals;
  c.save();c.scale(c.canvas.width/128,c.canvas.height/128);rect(c,0,0,128,128,p.dark);
  if(kind==='wall'){
    rect(c,6,9,116,110,p.panel);line(c,[[6,119],[6,9],[122,9]],p.trim,2);
    for(let n=0;n<16;n++){let x=(n*37)%124,y=(n*53)%120;rect(c,x,y,2,2,'rgba(230,228,205,.07)');}
    motif(c,p.motif,p);rect(c,0,119,128,9,p.dark);text(c,name.toUpperCase(),64,126,6,p.trim);
  }else if(ceiling){
    // Indoor night, ceiling tracks and upside-down wayfinding.
    for(let y=0;y<128;y+=32)for(let x=0;x<128;x+=32){rect(c,x,y,1,32,p.panel);rect(c,x,y,32,1,p.panel);if((x+y)%64===0){rect(c,x+13,y+13,2,2,p.accent);}}
    c.translate(128,128);c.rotate(Math.PI);text(c,name==='arrivals'?'THIS WAY DOWN':'DO NOT LOOK UP',64,69,8,p.trim);
  }else{
    for(let y=0;y<4;y++)for(let x=0;x<4;x++)rect(c,x*32,y*32,31,31,(x+y)%2?p.panel:p.dark);
    line(c,[[4,4],[124,4],[124,124],[4,124],[4,4]],p.trim,2);
    if(name==='aquarium'||name==='weather')for(let y=10;y<128;y+=18)line(c,[[0,y],[25,y-4],[66,y+2],[100,y-3],[128,y]],p.accent,1);
    else if(name==='arrivals'||name==='exchange')poly(c,[[55,86],[73,86],[73,62],[86,62],[64,39],[42,62],[55,62]],p.accent);
    else {c.globalAlpha=.35;motif(c,p.motif,p);}
  }
  c.restore();
}
export function paintTomorrowLandmark(c,type,name){
  const p=TOMORROW_PALETTES[name]||TOMORROW_PALETTES.arrivals;
  paintTomorrowSurface(c,'wall',name);c.save();c.scale(c.canvas.width/128,c.canvas.height/128);
  rect(c,8,12,112,104,p.dark);
  motif(c,({teeth:'teeth',clock:'clock',faces:'faces',stairs:'doors',door:'doors',storm:'storm',core:'eye',fish:'fish',frame:'frames',window:'window',bench:'doors'})[type.replace('tomorrow-','')]||p.motif,p);
  c.restore();
}
export function paintTomorrowProp(c,kind,name){
  const p=TOMORROW_PALETTES[name]||TOMORROW_PALETTES.arrivals;
  c.save();c.scale(c.canvas.width/256,c.canvas.height/256);
  if(kind==='inverted-benches'){
    c.translate(256,235);c.rotate(Math.PI);
    for(let n=0;n<3;n++){const x=20+n*76,y=85+(n%2)*34;rect(c,x,y,65,13,p.trim);rect(c,x+4,y+13,7,39,p.panel);rect(c,x+52,y+13,7,39,p.panel);rect(c,x+4,y-32,57,9,p.accent);rect(c,x+5,y-23,6,23,p.trim);rect(c,x+53,y-23,6,23,p.trim);}
  }else if(kind==='porcelain-crown'){
    for(let n=0;n<7;n++){const a=n*Math.PI*2/7;tooth(c,128+Math.cos(a)*70,128+Math.sin(a)*65,65,p);}
    oval(c,128,128,25,21,p.dark);eye(c,128,128,41,p);
  }else if(kind==='orbit-clocks'){
    fish(c,72,82,105,p);clock(c,83,80,26,p);fish(c,173,145,126,p);clock(c,185,143,31,p);fish(c,88,211,91,p);clock(c,98,209,23,p);
  }else if(kind==='inside-horizon'){
    oval(c,128,125,112,69,p.dark);oval(c,180,92,24,24,p.accent);
    for(let n=0;n<4;n++){const x=32+n*46,y=143+n%2*14;rect(c,x,y-43,39,59,p.trim);poly(c,[[x-5,y-43],[x+17,y-68],[x+44,y-43]],p.panel);rect(c,x+7,y-32,9,13,p.dark);rect(c,x+24,y-32,9,13,p.dark);rect(c,x+17,y-3,10,19,p.panel);}
    line(c,[[13,166],[243,166]],p.accent,4);line(c,[[42,166],[88,221],[201,173]],p.trim,3);
  }else if(kind==='broken-orbit'){
    for(let n=0;n<3;n++){c.save();c.translate(128,128);c.rotate(n*.9);c.strokeStyle=p.accent;c.lineWidth=5;c.beginPath();c.ellipse(0,0,112,45,0,.2,Math.PI*1.8);c.stroke();c.restore();}eye(c,128,128,104,p);
  }else if(/stair/.test(kind)){stairs(c,128,100,165,p);c.translate(256,190);c.rotate(Math.PI);stairs(c,128,50,110,p);}
  else if(/fish|whale/.test(kind))fish(c,129,124,225,p);
  else if(/tooth|teeth/.test(kind)){for(const[x,y,sz]of[[75,109,105],[176,85,81],[137,179,114]])tooth(c,x,y,sz,p);}
  else if(/face|mask/.test(kind)){for(const[x,y,sz]of[[72,102,94],[177,164,114]]){line(c,[[x,0],[x,y-sz/2]],p.accent,2);face(c,x,y,sz,p);}}
  else if(/clock|sun/.test(kind)){clock(c,128,128,101,p);eye(c,128,128,77,p);}
  else if(/storm|cloud/.test(kind))storm(c,128,104,195,p);
  else if(/eye|core/.test(kind)){for(let n=0;n<16;n++){let a=n*Math.PI/8;line(c,[[128+Math.sin(a)*80,128+Math.cos(a)*80],[128+Math.sin(a)*120,128+Math.cos(a)*120]],p.accent,3);}eye(c,128,128,210,p);}
  else if(/frame|museum/.test(kind)){for(let i=0;i<6;i++){c.strokeStyle=i%2?p.trim:p.accent;c.lineWidth=5;c.strokeRect(20+i*15,15+i*14,216-i*30,226-i*28);}text(c,'YOU',128,125,17,p.trim);text(c,'WERE HERE',128,144,11,p.accent);}
  else doorway(c,128,232,145,209,p);
  c.restore();
}
export function paintTomorrowStation(c,item,mode){
  if(item.tomorrowAction==='mimic'){paintTomorrowMimic(c,item.mimicKind,mode===2?6:mode===1?1:0,true);return;}
  const endingPalette={escape:'exchange',seal:'aquarium',rewrite:'wardrobe'}[item.ending];
  const p=TOMORROW_PALETTES[endingPalette||item.zoneId]||TOMORROW_PALETTES.exchange;
  c.save();c.scale(c.canvas.width/96,c.canvas.height/128);
  rect(c,7,11,82,109,'#152632');rect(c,11,16,74,80,mode?p.panel:p.dark);line(c,[[9,15],[87,15],[87,98],[9,98],[9,15]],p.trim,3);
  const action=String(item.tomorrowAction||'');
  if(action==='npc'){
    rect(c,24,30,48,51,'#dbc99e');rect(c,28,34,5,43,'#394652');
    for(let y=39;y<75;y+=8)rect(c,39,y,25-(y%3)*3,2,'#4c5860');
    text(c,item.npcAction==='expose'?'!':'?',62,71,22,item.npcAction==='expose'?'#a34c4a':'#2e675f');
  }
  else if(/memory|anchor/.test(action)){eye(c,48,52,53,p);}
  else if(/portal|fold|shift/.test(action)){doorway(c,48,86,38,62,p);}
  else if(action==='ending'||/exit|escape|seal|rewrite/.test(action)){clock(c,48,55,28,p);text(c,item.ending==='rewrite'?'III':item.ending==='seal'?'II':'I',48,60,14,p.trim);}
  else if(/power/.test(action)){poly(c,[[51,23],[29,58],[44,57],[39,83],[68,45],[51,47]],p.accent);}
  else {text(c,/west/.test(item.id)?'01':'02',48,65,27,p.accent);}
  rect(c,13,101,70,13,p.dark);text(c,mode===2?(action==='fold'?'FOLD AGAIN':'RECORDED'):mode===1?(action==='ending'?item.ending.toUpperCase():'USE'):'OFFLINE',48,111,8,mode?p.accent:'#9fa3ab');
  c.restore();
}

// People have upright coats, readable faction insignia and visible hands. They
// never reuse a hostile monster silhouette as a shorthand for "friendly".
export function paintTomorrowNpc(c,role,frame,hostile=false){
  const palettes={archivist:{coat:'#76afa0',shade:'#385d59',mark:'#eee1b9',skin:'#bf9276',label:'MARA'},warden:{coat:'#91b4d0',shade:'#465e79',mark:'#e4c88b',skin:'#b98970',label:'WARDEN'},broker:{coat:'#c18ca2',shade:'#67465f',mark:'#f0d7a2',skin:'#d0ab8a',label:'CLERK'},unfiled:{coat:'#d3ac76',shade:'#795744',mark:'#e4d5ae',skin:'#a67f68',label:'UNFILED'}};
  const p=palettes[role]||palettes.unfiled,step=frame<4?[0,3,0,-3][frame]:0,attack=frame===4;
  c.save();c.scale(c.canvas.width/80,c.canvas.height/112);
  if(frame===6){poly(c,[[9,99],[27,92],[52,94],[71,102],[64,108],[13,108]],'#172330');rect(c,18,97,41,8,p.coat);rect(c,53,96,10,8,p.skin);c.restore();return;}
  text(c,p.label,40,8,6,hostile?'#ff997b':p.mark);
  // Broad shoulders and enclosed outlines separate people from thin scenery.
  poly(c,[[27,29],[53,29],[65,40],[66,74],[58,82],[61,106],[45,108],[39,85],[34,108],[18,107],[22,80],[14,72],[16,41]],'#14212a');
  rect(c,23+step,78,13,26,p.shade);rect(c,44-step,78,13,26,p.shade);
  rect(c,20+step,101,17,7,'#192c38');rect(c,43-step,101,18,7,'#192c38');
  poly(c,[[25,31],[53,31],[60,60],[55,84],[21,84],[20,59]],p.coat);
  rect(c,38,32,3,50,p.shade);rect(c,25,64,30,5,'#243942');rect(c,37,64,8,5,p.mark);
  for(const y of[43,52,74])rect(c,42,y,2,2,p.mark);
  rect(c,18,38,10,29,p.shade);rect(c,53,38,10,29,p.shade);
  rect(c,17,62,10,13,p.skin);rect(c,54,62,10,13,p.skin);
  rect(c,28,14,24,24,p.skin);rect(c,27,15,5,18,p.shade);rect(c,49,15,5,18,p.shade);
  rect(c,32,24,5,3,'#1b2930');rect(c,44,24,5,3,'#1b2930');rect(c,37,33,8,2,'#674f49');
  if(role==='archivist'){
    rect(c,28,14,25,5,'#e0c7ab');line(c,[[30,23],[38,23],[38,29],[30,29],[30,23],[49,23],[49,29],[42,29],[42,23]],'#253f42',1);
    rect(c,22,48,28,23,'#263f4b');rect(c,26,50,20,17,'#e5d5aa');rect(c,29,54,14,2,p.shade);rect(c,29,60,11,2,p.shade);rect(c,45,62,11,7,p.skin);
  }else if(role==='broker'){
    rect(c,23,15,35,5,p.shade);rect(c,29,10,24,7,p.coat);rect(c,32,11,18,2,p.mark);
    for(let n=0;n<3;n++){rect(c,22+n*11,45+n*4,8,30-n*4,p.mark);rect(c,24+n*11,51+n*4,4,2,p.shade);}
    rect(c,30,36,18,4,p.mark);
  }else{
    if(role==='warden'){rect(c,25,12,30,8,p.shade);rect(c,22,19,36,5,p.coat);rect(c,35,13,9,6,p.mark);rect(c,16,35,14,10,p.mark);}
    else {poly(c,[[25,13],[41,10],[54,18],[50,23],[30,19]],p.shade);poly(c,[[28,34],[51,34],[44,45],[26,51]],p.mark);}
    const gunY=attack?43:59;rect(c,25,gunY,36,7,'#1b2d38');rect(c,48,gunY-4,12,4,'#70818b');rect(c,31,gunY+5,8,9,'#2d3b43');rect(c,23,gunY+3,10,6,p.skin);
    if(attack){poly(c,[[63,gunY-6],[70,gunY],[77,gunY-5],[72,gunY+5],[77,gunY+11],[68,gunY+8],[62,gunY+13]],'#f7db9a');}
  }
  // An open ring is a person; red crossed lines signal a broken truce.
  c.strokeStyle=hostile?'#ff805e':p.mark;c.lineWidth=2;c.strokeRect(45,42,8,8);
  if(hostile){line(c,[[44,41],[54,51]],'#ff805e',2);line(c,[[54,41],[44,51]],'#ff805e',2);}
  if(frame===5){c.globalCompositeOperation='source-atop';rect(c,0,0,80,112,'rgba(255,171,134,.45)');}
  c.restore();
}

export function paintTomorrowMimic(c,kind,frame,concealed=false){
  const exhibit=kind==='exhibit',base=exhibit?'#8d8eaa':'#aa835d',edge=exhibit?'#c5c5dc':'#e6c899',dark='#26323d';
  c.save();c.scale(c.canvas.width/80,c.canvas.height/112);
  if(frame===6){poly(c,[[8,96],[30,85],[45,91],[68,94],[72,106],[9,108]],dark);rect(c,15,96,45,8,base);for(let n=0;n<6;n++)poly(c,[[13+n*9,96],[17+n*9,87],[21+n*9,97]],edge);c.restore();return;}
  if(concealed){
    rect(c,12,34,56,65,dark);rect(c,16,38,48,58,base);rect(c,16,40,48,4,edge);
    if(exhibit){rect(c,21,46,38,35,'#31485d');oval(c,40,63,12,13,'#e3d2b1');rect(c,25,85,30,7,edge);text(c,'DISPLAY',40,91,5,dark);}
    else {for(const y of[49,70]){rect(c,20,y,40,17,dark);rect(c,22,y+2,36,12,base);rect(c,36,y+5,9,2,edge);}text(c,'SPARES',40,43,5,dark);}
    // A crooked seam and tiny warm sliver remain visible before the reveal.
    line(c,[[15,64],[33,62],[48,65],[65,63]],'#492d39',2);rect(c,42,63,8,1,frame===1?'#ffdca0':'#ccad8b');
    rect(c,17,99,7,8,dark);rect(c,56,99,7,8,dark);c.restore();return;
  }
  const lift=frame===4?13:frame===1?3:0;
  for(const side of[-1,1]){const x=40+side*25;line(c,[[x,73],[x+side*10,91],[x+side*7,106]],dark,7);line(c,[[x,73],[x+side*10,91],[x+side*7,106]],base,3);}
  rect(c,10,58,60,38,dark);rect(c,14,68,52,25,base);rect(c,19,75,42,9,edge);
  poly(c,[[10,48-lift],[17,25-lift],[64,30-lift],[71,51-lift],[62,61],[17,62]],dark);
  poly(c,[[15,46-lift],[21,30-lift],[60,34-lift],[66,49-lift]],base);
  rect(c,18,49-lift,44,21+lift,'#591f37');
  for(let n=0;n<7;n++){const x=17+n*7;poly(c,[[x,48-lift],[x+3,59-lift],[x+6,49-lift]],'#ecddbb');poly(c,[[x,70],[x+3,60],[x+6,70]],'#ecddbb');}
  oval(c,28,38-lift,4,4,'#f0c786');oval(c,52,40-lift,4,4,'#f0c786');
  if(frame===4)poly(c,[[34,62],[45,61],[50,87],[40,98],[37,83]],'#b56f90');
  if(frame===5){c.globalCompositeOperation='source-atop';rect(c,0,0,80,112,'rgba(255,155,121,.48)');}
  c.restore();
}

export function paintTomorrowHatch(c,phase='closed'){
  c.save();c.scale(c.canvas.width/128,c.canvas.height/128);
  const warning=phase==='warning',spent=phase==='spent',accent=warning?'#ff8567':spent?'#8fc6ac':'#e0b36d';
  rect(c,0,0,128,128,'#1c2a34');rect(c,4,4,120,120,accent);rect(c,12,12,104,104,'#39454f');
  for(let n=0;n<8;n++){const x=4+n*16;poly(c,[[x,4],[x+8,4],[x+16,12],[x+8,12]],'#29313b');poly(c,[[x,116],[x+8,116],[x+16,124],[x+8,124]],'#29313b');}
  for(const x of[17,111])for(const y of[19,109])oval(c,x,y,3,3,'#c8c7b6');
  rect(c,62,14,4,100,warning?'#160d20':'#19242d');
  if(warning){poly(c,[[26,22],[60,14],[60,114],[26,106]],'#52616a');poly(c,[[102,22],[68,14],[68,114],[102,106]],'#52616a');}
  if(spent){for(let y=23;y<111;y+=12)rect(c,20,y,88,4,'#77968e');line(c,[[45,60],[59,74],[86,45]],accent,7);}
  else{poly(c,[[49,36],[79,36],[79,65],[91,65],[64,94],[37,65],[49,65]],accent);rect(c,58,42,12,34,'#35404c');}
  text(c,spent?'JAMMED SAFE':warning?'STEP OFF':'SERVICE CHUTE',64,108,8,accent);c.restore();
}
