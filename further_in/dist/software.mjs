// Canvas renderer for devices without WebGL. Uses the same simulation and collision map.
import {CELL,clamp} from './core.mjs';
const colors={
  1:{wall:[114,126,109],floor:[56,64,51],ceiling:[92,100,87]},
  2:{wall:[181,164,100],floor:[102,91,58],ceiling:[170,168,139]},
  3:{wall:[67,86,80],floor:[31,47,42],ceiling:[48,64,59]},
  4:{wall:[146,156,145],floor:[77,98,96],ceiling:[164,173,164]},
  5:{wall:[103,118,123],floor:[68,75,77],ceiling:[123,133,131]},
  6:{wall:[161,152,132],floor:[100,89,75],ceiling:[185,172,146]}
};
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function serviceWallTexture(level){
  const c=canvas(128,128),x=c.getContext('2d');x.fillStyle=`rgb(${colors[level].wall})`;x.fillRect(0,0,128,128);
  let seed=2304;const r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<6000;i++){x.fillStyle=r()>.5?'#eee9d60c':'#111b1b10';x.fillRect(r()*128,r()*128,1,1);}
  if(level===4){
    x.strokeStyle='#233c3b50';x.lineWidth=1;
    for(let i=0;i<=128;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i,128);x.moveTo(0,i);x.lineTo(128,i);x.stroke();}
    x.fillStyle='#385d5788';x.fillRect(0,88,128,11);x.fillStyle='#d7ded73a';x.fillRect(0,87,128,1);
  }else if(level===5){
    x.fillStyle='#1a303b50';x.fillRect(0,68,128,22);x.fillStyle='#b09d6d77';x.fillRect(0,68,128,2);
    x.strokeStyle='#2238364a';x.strokeRect(0,0,128,128);
    for(const a of[6,122])for(const b of[6,122]){x.fillStyle='#344b4c';x.fillRect(a,b,2,2);}
  }else{
    x.fillStyle='#51473577';x.fillRect(0,85,128,43);x.fillStyle='#c2ab8d88';x.fillRect(0,85,128,2);
    for(let i=0;i<128;i+=21){x.fillStyle='#171b1524';x.fillRect(i,87,1,41);}
  }
  for(let i=0;i<7;i++){x.fillStyle='#15251b14';x.fillRect(r()*128,94+r()*16,4+r()*13,21+r()*16);}
  return c;
}

function serviceSprite(kind,text=''){
  const c=canvas(256,384),x=c.getContext('2d');
  let info={};if(text.startsWith('{')){try{info=JSON.parse(text);}catch{}}
  const label=(str,y=50)=>{x.textAlign='center';x.fillStyle='#d2ceb6';x.font='22px Arial';x.fillText(str,128,y,225);};
  if(kind==='shutter'){
    c.width=512;x.fillStyle='#465a51';x.fillRect(0,0,512,384);x.fillStyle='#293d34';for(let i=0;i<512;i+=25)x.fillRect(i,0,2,384);x.fillStyle='#303e35';x.fillRect(170,128,172,35);x.fillStyle='#c7b98e';x.textAlign='center';x.font='18px Arial';x.fillText('ACCESS LOCKED',256,152,162);
  }else if(kind==='control'){
    x.fillStyle='#354e4b';x.fillRect(38,80,180,304);x.fillStyle='#687c70';x.fillRect(35,75,186,11);
    x.fillStyle=info.active?'#bacd98':'#887a4e';x.fillRect(182,104,16,11);
    x.fillStyle='#b7bba6';x.fillRect(8,12,240,47);x.fillStyle='#273c35';x.textAlign='center';x.font='23px Arial';x.fillText(info.label||'',128,44,226);
    if(info.controlType==='valve'){
      x.strokeStyle='#ad9773';x.lineWidth=10;x.beginPath();x.arc(128,210,56,0,Math.PI*2);x.stroke();
      const a=info.active?Math.PI/3:0;
      for(const angle of[a,a+Math.PI/2]){x.beginPath();x.moveTo(128-Math.cos(angle)*54,210-Math.sin(angle)*54);x.lineTo(128+Math.cos(angle)*54,210+Math.sin(angle)*54);x.stroke();}
      x.fillStyle='#536c61';x.fillRect(116,198,24,24);
    }else{
      x.fillStyle='#203934';x.fillRect(103,145,50,137);
      x.fillStyle='#aa9572';x.fillRect(91,info.active?163:243,74,20);
    }
    if(info.active)label('SET',347);
  }else if(kind==='exit'){
    x.fillStyle='#263e3b';x.fillRect(19,0,218,384);x.fillStyle='#5c6a59';x.fillRect(28,8,200,376);
    x.fillStyle='#263b33';for(let i=0;i<4;i++)x.fillRect(38+i*47,96,33,274);
    x.fillStyle=info.locked?'#4d4030':'#354e3d';x.fillRect(41,47,174,35);
    x.fillStyle=info.locked?'#c9ab7b':'#c7dcb4';x.textAlign='center';x.font='18px Arial';x.fillText(info.locked?'LOCKED':'RELEASED',128,71,164);
    label(info.label||'SERVICE',31);x.fillStyle='#ac9770';x.fillRect(202,205,10,23);
  }else if(kind==='signal'){
    x.fillStyle='#34413a';x.fillRect(55,130,146,145);x.fillStyle=text==='active'?'#eed095':text==='warning'?'#b9934f':text==='quiet'||text==='off'?'#45524b':text==='safe'?'#c8bd90':'#b6cea1';
    x.fillRect(75,156,106,76);x.fillStyle='#242f29';x.fillRect(91,178,74,9);
  }else if(kind==='bench'){
    x.fillStyle='#79694b';x.fillRect(5,150,246,85);x.fillRect(4,252,248,20);x.fillStyle='#344237';
    for(const pos of[25,217])x.fillRect(pos,273,12,111);
  }else if(kind==='pipe'){
    x.fillStyle='#61786d';x.fillRect(110,0,36,384);x.fillStyle='#8d9a81';
    for(const y of[65,325])x.fillRect(87,y,82,15);
  }else if(kind==='shelf'){
    x.fillStyle='#3c504a';x.fillRect(10,0,13,384);x.fillRect(233,0,13,384);
    for(let i=0;i<3;i++){
      const y=96+i*115;x.fillRect(10,y,236,10);
      for(let j=0;j<3;j++){x.fillStyle=['#99967b','#9e9f89','#8b8b72'][j];x.fillRect(30+j*70,y-66,59,65);x.fillStyle='#d4ceae';x.fillRect(39+j*70,y-54,35,8);}
      x.fillStyle='#3c504a';
    }
  }
  return c;
}
function wallTexture(level){const c=canvas(128,128),x=c.getContext('2d'),base=colors[level].wall;x.fillStyle=`rgb(${base})`;x.fillRect(0,0,128,128);let seed=8104;const r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<8000;i++){x.fillStyle=r()>.5?'#ffffff0a':'#0000000a';x.fillRect(r()*128,r()*128,1,1);}x.strokeStyle='#141b1624';for(let i=0;i<128;i+=8){x.beginPath();x.moveTo(i,0);x.lineTo(i,128);x.stroke();}for(let y=7;y<115;y+=18)for(let i=6;i<128;i+=18){x.beginPath();x.ellipse(i,y,2,4,0,0,Math.PI*2);x.stroke();}x.fillStyle='#20302388';x.fillRect(0,117,128,11);x.fillStyle='#c6d6a322';x.fillRect(0,116,128,1);return c;}
function sprite(kind,text=''){if(['control','exit','signal','bench','pipe','shelf','shutter'].includes(kind))return serviceSprite(kind,text);const c=canvas(192,320),x=c.getContext('2d');if(kind==='door'){x.fillStyle='#263b2d';x.fillRect(13,0,166,320);x.fillStyle='#66745b';x.fillRect(22,8,148,312);x.strokeStyle='#27372a';x.lineWidth=5;x.strokeRect(35,72,122,90);x.strokeRect(35,185,122,110);x.fillStyle='#bab498';x.fillRect(65,29,62,29);x.fillStyle='#263526';x.textAlign='center';x.font='19px Georgia';x.fillText(text,96,50);x.fillStyle='#cab994';x.fillRect(145,165,8,14);}else if(kind==='note'||kind==='tool'){x.fillStyle='#494c3b';x.fillRect(29,150,135,170);x.fillStyle=kind==='note'?'#cac5a7':'#314d3f';x.fillRect(50,129,92,33);x.fillStyle=kind==='note'?'#454c34':'#a8d0a0';for(let i=0;i<3;i++)x.fillRect(65,136+i*6,61,2);}else if(kind==='chair'){x.fillStyle='#725e43';x.fillRect(32,50,125,150);x.fillRect(30,200,132,25);for(const dx of[38,145]){x.fillStyle='#3b4131';x.fillRect(dx,220,8,100);}x.fillStyle='#b1a28220';x.fillRect(40,65,105,120);}else if(kind==='cabinet'){x.fillStyle='#61674f';x.fillRect(30,35,132,285);for(let i=0;i<3;i++){x.strokeStyle='#333e2b';x.strokeRect(35,45+i*90,122,80);x.fillStyle='#bdb08c';x.fillRect(80,75+i*90,35,4);}}else if(kind==='ghost'){const g=x.createLinearGradient(0,30,0,320);g.addColorStop(0,'#c3d9d1dd');g.addColorStop(.7,'#a0c8b887');g.addColorStop(1,'#b2d6c500');x.fillStyle=g;x.shadowBlur=15;x.shadowColor='#93b4a955';x.beginPath();x.ellipse(96,56,26,38,0,0,Math.PI*2);x.fill();x.beginPath();x.moveTo(83,75);x.bezierCurveTo(38,116,49,213,21,310);x.lineTo(171,310);x.bezierCurveTo(139,203,149,117,111,75);x.fill();x.shadowBlur=0;x.fillStyle='#12291fbb';x.beginPath();x.ellipse(96,60,12,20,0,0,Math.PI*2);x.fill();for(let i=0;i<6;i++){x.strokeStyle='#dbebe522';x.beginPath();x.moveTo(80+i*7,101);x.lineTo(30+i*28,299);x.stroke();}}else if(kind==='entity'){x.strokeStyle='#121d13';x.lineWidth=10;x.beginPath();x.moveTo(98,60);x.lineTo(84,205);x.moveTo(87,132);x.lineTo(37,182);x.lineTo(15,250);x.moveTo(94,111);x.lineTo(149,168);x.lineTo(182,250);x.moveTo(83,194);x.lineTo(54,251);x.lineTo(33,320);x.moveTo(86,198);x.lineTo(128,250);x.lineTo(147,320);x.stroke();x.fillStyle='#101a12';x.beginPath();x.ellipse(102,45,17,36,.15,0,Math.PI*2);x.fill();x.fillStyle='#7d8a54';x.fillRect(94,39,17,3);}else if(kind==='sign'){c.width=384;c.height=128;x.fillStyle='#263b2e';x.fillRect(0,0,384,128);x.strokeStyle='#bbc9a650';x.strokeRect(4,4,376,120);x.textAlign='center';x.fillStyle='#d0dbc0';const lines=text.split('\n');x.font=lines.length>2?'21px Arial':'27px Arial';lines.forEach((line,i)=>x.fillText(line,192,64+(i-(lines.length-1)/2)*(lines.length>2?30:39),360));}return c;}
export class SoftwareRenderer{
constructor(surface){this.surface=surface;this.ctx=surface.getContext('2d',{alpha:false});if(!this.ctx)throw Error('No graphics context is available.');this.buf=canvas(420,240);this.b=this.buf.getContext('2d',{alpha:false});this.wall=Object.fromEntries(Object.keys(colors).map(level=>[level,Number(level)>3?serviceWallTexture(Number(level)):wallTexture(Number(level))]));this.sprites=new Map();this.lastRevision=-1;this.renderer={info:{render:{calls:0},memory:{geometries:0,textures:3}}};this.resize();}
resize(){this.surface.width=innerWidth;this.surface.height=innerHeight;let h=Math.min(440,innerHeight),w=h*innerWidth/innerHeight;const max=this.q==='high'?640:this.q==='low'?320:440;if(w>max){h*=max/w;w=max;}this.buf.width=Math.round(w);this.buf.height=Math.round(h);this.data=this.b.createImageData(this.buf.width,this.buf.height);this.depth=new Float32Array(this.buf.width);}
quality(q){this.q=q;this.resize();}
asset(kind,text=''){const key=kind+text;if(!this.sprites.has(key))this.sprites.set(key,sprite(kind,text));return this.sprites.get(key);}
build(s){
  this.state=s;this.lastRevision=s.revision;this.sprites.clear();
  this.objects=[
    ...s.doors.map(d=>({...d,kind:'door',text:d.label||(s.level===1?'•'.repeat(d.id):String(104+s.choices)),height:2.7,width:1.45})),
    ...s.items.map(item=>{
      if(item.kind==='control')return {...item,text:JSON.stringify({label:item.label,active:item.active,controlType:item.controlType}),height:1.95,width:1.12};
      if(item.kind==='exit')return {...item,text:JSON.stringify({label:item.label,locked:item.locked}),height:2.7,width:1.5};
      return {...item,height:1.2,width:.7};
    }),
    ...s.props.map(prop=>{
      if(prop.kind==='sign')return {...prop,height:prop.height||.62,width:prop.width||2.1,elevation:(prop.elevation||2.15)-(prop.height||.62)/2};
      if(prop.kind==='bench')return {...prop,height:1.1,width:1.8};
      if(prop.kind==='pipe')return {...prop,height:2.8,width:.45};
      if(prop.kind==='shelf')return {...prop,height:2.35,width:1.4};
      return {...prop,kind:prop.kind==='closedDoor'?'door':prop.kind,height:prop.kind==='closedDoor'?2.7:prop.kind==='chair'?1.1:1.3,width:prop.kind==='closedDoor'?1.5:.7};
    })
  ];
  if(s.level===1){
    this.objects.push({x:11.5*CELL,z:18*CELL,kind:'sign',text:'104 / SERVICE ACCESS',height:.45,width:1.6,elevation:2.25},
      {x:11.5*CELL,z:8*CELL,kind:'sign',text:'EXIT  ↑',height:.4,width:1,elevation:2.3});
  }
  if(s.level===3&&s.phase==='doors')this.objects.push({x:s.player.x,z:s.player.z-2,kind:'sign',text:s.choices===3?'BE STILL':s.choices===4?'LOOK BACK':s.choices>=5?'STAY WITH ME':'PLEASE DO NOT LEAVE',height:.3,width:1.5,elevation:2.35});
  const gate=(s.gate||[]).filter(cell=>s.map[cell.z]?.[cell.x]!==0);
  if(gate.length)this.objects.push({x:gate.reduce((sum,cell)=>sum+(cell.x+.5)*CELL,0)/gate.length,z:(gate[0].z+1)*CELL+.025,kind:'shutter',height:3.5,width:gate.length*CELL});
  if(s.level===5&&s.quietHall){
    const h=s.quietHall;
    for(let z=h.minZ+CELL;z<h.maxZ;z+=CELL*4)this.objects.push({x:(h.minX+h.maxX)/2,z,kind:'signal',signalType:'generator',height:.8,width:.65,elevation:2.15});
  }
  for(const r of s.refuges||[])this.objects.push({x:r.x,z:r.z,kind:'sign',text:'STAFF',width:.55,height:.2,elevation:2},{x:r.x,z:r.z,kind:'signal',text:'safe',width:.45,height:.6,elevation:2.15});
}
render(s,dt,settings={},menu=false){if(this.state!==s||this.lastRevision!==s.revision)this.build(s);const ctx=this.b,W=this.buf.width,H=this.buf.height,p=menu?{x:11.5*CELL,z:16*CELL,yaw:-.1+(settings.bob===false?0:Math.sin(performance.now()*.00006)*.035),pitch:0}:s.player;const fov=(settings.fov||73)*Math.PI/180,proj=H/(2*Math.tan(fov/2)),horizon=H/2+Math.tan(p.pitch||0)*proj,eye=1.58+(menu||settings.bob===false?0:Math.sin(s.step*3.3)*.025*Math.min(1,s.moving/2.8)),wallHeight=s.level===3?(s.roomVariant===1?4.8:3.3):3.5,fwX=Math.sin(p.yaw),fwZ=-Math.cos(p.yaw),rtX=Math.cos(p.yaw),rtZ=Math.sin(p.yaw),pal=colors[s.level]||colors[1],garden=s.phase==='garden',exposure=settings.brightness||1.1,lampOn=settings.lamp!==false;let data=this.data.data;for(let y=0;y<H;y++){const floor=y>horizon,d=(floor?eye:wallHeight-eye)*proj/Math.max(.5,Math.abs(y-horizon));let wx=p.x+d*(fwX-rtX*W/(2*proj)),wz=p.z+d*(fwZ-rtZ*W/(2*proj));const stepx=d*rtX/proj,stepz=d*rtZ/proj;for(let x=0;x<W;x++,wx+=stepx,wz+=stepz){const idx=(y*W+x)*4;const modx=((wx%CELL)+CELL)%CELL/CELL,modz=((wz%CELL)+CELL)%CELL/CELL;let color=floor?pal.floor:pal.ceiling;let shade=(s.level===2?.95:s.level===3?(lampOn?.65:.22):(lampOn?.65:.46))/(1+d*(s.level===3?.07:.023));const noise=(((Math.floor(wx*40)*374761393)^(Math.floor(wz*40)*668265263))>>>0)%19/100;if(floor){shade+=noise-.09;if(modx<.008||modz<.008)shade*=.5;}else{if(modx<.012||modz<.012||Math.abs(modx-.5)<.009)shade*=.6;const gx=Math.floor(wx/CELL),gz=Math.floor(wz/CELL);if((gz%4===2&&gx%3===2||s.level===2&&gz%6===3&&gx%6===3)&&modx>.36&&modx<.64&&modz>.25&&modz<.75){color=s.level===5?(s.puzzle?.warning?[209,173,91]:s.puzzle?.hum?[184,206,161]:[60,73,67]):[235,235,201];shade=1.15;}}
if(floor&&s.level>=4){
  if(s.level===4&&(s.puzzle?.water||0)>.005){
    for(const area of s.waterAreas||[]){
      if(Math.abs(wx-area.x)<area.width/2&&Math.abs(wz-area.z)<area.depth/2){
        const amount=s.puzzle.water,reflection=Math.max(0,1-Math.abs(wx-area.x)/Math.max(.1,area.width*.3));
        color=[pal.floor[0]*(1-amount)+(72+reflection*36)*amount,pal.floor[1]*(1-amount)+(115+reflection*35)*amount,pal.floor[2]*(1-amount)+(109+reflection*28)*amount];
        shade+=amount*.09;break;
      }
    }
  }
  for(const field of s.inspections||[]){
    if(Math.abs(wx-field.x)<field.width/2&&Math.abs(wz-field.z)<field.depth/2){
      if(Math.abs(Math.abs(wz-field.z)-field.depth/2)<.05){color=[168,151,102];shade=Math.max(shade,.7);}
      else if(field.active){color=[199,173,117];shade=Math.max(shade,.82);}
      else if(field.warning){color=[140,117,73];shade=Math.max(shade,.58);}
    }
  }
}
if(s.level===5&&!s.puzzle?.hum)shade*=.76;
if(s.level===2&&s.chasing&&floor&&Math.abs(wx-s.hole.x)<CELL*.49&&Math.abs(wz-s.hole.z)<CELL*.49){color=[2,8,6];shade=1;}if(garden){if(!floor){const sky=clamp(y/Math.max(1,horizon),0,1);color=[142+89*sky,184+40*sky,186-10*sky];shade=.96;}else{color=[198,191,157];shade=.94-Math.min(d,80)*.0015;if(modx<.012||modz<.012)shade*=.9;const poolX=Math.abs(wx-22.8);if(poolX<3.15&&wz>13.85&&wz<34.55){color=[228,219,185];shade=1;}if(poolX<2.8&&wz>14.2&&wz<34.2){const reflection=Math.exp(-poolX*poolX/.9),ripple=Math.sin(wz*8+Math.sin(wx*2.7)*.45-s.time*.95);color=[55+95*reflection,145+48*reflection,142+16*reflection];shade=.91+ripple*.055;if(ripple>.92)shade+=.1*reflection;}}}
shade=clamp(shade*exposure,.03,1.3);data[idx]=color[0]*shade;data[idx+1]=color[1]*shade;data[idx+2]=color[2]*shade;data[idx+3]=255;}}
ctx.putImageData(this.data,0,0);this.depth.fill(1e5);if(garden){this.drawGarden(p,proj,horizon,fwX,fwZ,rtX,rtZ,eye);this.blit();this.renderer.info.render.calls=W+12;return;}
for(let x=0;x<W;x++){const u=(x-W/2)/proj,dx=fwX+rtX*u,dz=fwZ+rtZ*u,px=p.x/CELL,pz=p.z/CELL;let mx=Math.floor(px),mz=Math.floor(pz),stepX=dx<0?-1:1,stepZ=dz<0?-1:1,deltaX=Math.abs(1/dx),deltaZ=Math.abs(1/dz),sideX=(dx<0?px-mx:mx+1-px)*deltaX,sideZ=(dz<0?pz-mz:mz+1-pz)*deltaZ,side=0,n=0;while(n++<220){if(sideX<sideZ){sideX+=deltaX;mx+=stepX;side=0;}else{sideZ+=deltaZ;mz+=stepZ;side=1;}if(s.map[mz]?.[mx]!==0)break;}let d=Math.max(.05,(side===0?(mx-px+(1-stepX)/2)/dx:(mz-pz+(1-stepZ)/2)/dz)*CELL);this.depth[x]=d;const tx=((side===0?pz+d/CELL*dz:px+d/CELL*dx)%1+1)%1;const top=horizon-(wallHeight-eye)*proj/d,bottom=horizon+eye*proj/d;ctx.drawImage(this.wall[s.level],Math.floor(tx*128),0,1,128,x,top,1,bottom-top);const beam=Math.max(0,1-Math.abs(u)*.55);const light=(s.level===2?.96:s.level===3?.22+(lampOn?beam*.64:0):.46+(lampOn?beam*.4:0))/(1+d*(s.level===3?.075:.025))*(side===0?.88:1)*exposure;ctx.fillStyle=`rgba(0,8,4,${clamp(1-light,0,.97)})`;ctx.fillRect(x,top,1,bottom-top);}
let objects=this.objects.map(o=>o.signalType==='generator'?{...o,text:s.puzzle?.warning?'warning':s.puzzle?.hum?'on':'quiet'}:o);for(const field of s.inspections||[])objects.push({x:field.x,z:field.z,kind:'signal',text:field.active?'active':field.warning?'warning':'off',height:.8,width:.65,elevation:2.15});if(s.disturbance&&s.time<s.disturbance.until)objects.push({...s.disturbance,kind:'entity',height:2.7,width:1.3});if(s.entity)objects.push({...s.entity,kind:s.phase==='ghost'?'ghost':'entity',height:s.phase==='ghost'?2.75:3.1,width:s.phase==='ghost'?1.25:1.9,elevation:s.phase==='ghost'?.12:0,opacity:s.phase==='ghost'?clamp(1-s.stare/4.6,0,1):1});if(s.level===1&&s.time<s.glimpseUntil)objects.push({x:11.5*CELL+(s.glimpseUntil-s.time-.19)*11,z:6.5*CELL,kind:'entity',height:3.1,width:1.6});objects.sort((a,b)=>Math.hypot(b.x-p.x,b.z-p.z)-Math.hypot(a.x-p.x,a.z-p.z));for(const o of objects){const dx=o.x-p.x,dz=o.z-p.z,depth=dx*fwX+dz*fwZ;if(depth<.1)continue;const sx=W/2+(dx*rtX+dz*rtZ)*proj/depth,sh=o.height*proj/depth,sw=o.width*proj/depth,top=horizon+(eye-(o.elevation||0)-o.height)*proj/depth,left=sx-sw/2,img=this.asset(o.kind,o.text);ctx.globalAlpha=(o.opacity??1)*clamp((s.level===2?1:.95)/(1+depth*.012),.15,1);for(let x=Math.max(0,Math.floor(left));x<Math.min(W,left+sw);x++){if(depth>this.depth[x]+.1)continue;const src=clamp((x-left)/sw*img.width,0,img.width-1);ctx.drawImage(img,src,0,1,img.height,x,top,1,sh);}}
ctx.globalAlpha=1;this.blit();this.renderer.info.render.calls=W+objects.length;this.renderer.info.memory.textures=this.sprites.size+Object.keys(colors).length;}
drawGarden(p,proj,hor,fx,fz,rx,rz,eye=1.58){
const c=this.b,W=this.buf.width,center=22.8;
const project=(x,y,z)=>{const dx=x-p.x,dz=z-p.z,d=dx*fx+dz*fz;return d>.25?{x:W/2+(dx*rx+dz*rz)*proj/d,y:hor+(eye-y)*proj/d,scale:proj/d,depth:d}:null;};
const sun=project(center,7.2,2);if(sun){const r=6*sun.scale,glow=c.createRadialGradient(sun.x,sun.y,sun.scale*.5,sun.x,sun.y,r);glow.addColorStop(0,'#fff3cbee');glow.addColorStop(.3,'#ffe0a966');glow.addColorStop(1,'#ffe0a900');c.fillStyle=glow;c.fillRect(sun.x-r,sun.y-r,r*2,r*2);c.fillStyle='#fff0c3';c.beginPath();c.arc(sun.x,sun.y,1.25*sun.scale,0,Math.PI*2);c.fill();}
const points=[{x:center,z:12,kind:'arch'},{x:center,z:6,kind:'sign'}];for(let i=0;i<6;i++)for(const x of[11,35])points.push({x,z:8+i*6,kind:'column'});for(let i=0;i<4;i++)for(const x of[17.9,27.7])points.push({x,z:13+i*4.2,kind:i===1?'tree':'bush',index:i});for(let i=0;i<3;i++)for(const x of[19.5,26.1])points.push({x,z:27+i*2.6,kind:'bush',index:i+4});
points.sort((a,b)=>((b.x-p.x)*fx+(b.z-p.z)*fz)-((a.x-p.x)*fx+(a.z-p.z)*fz));
const quad=(x,z,w,h,color)=>{const q=[project(x-w/2,0,z),project(x+w/2,0,z),project(x+w/2,h,z),project(x-w/2,h,z)];if(q.some(v=>!v))return;c.fillStyle=color;c.beginPath();q.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fill();};
for(const o of points){const base=project(o.x,0,o.z);if(!base)continue;const k=base.scale;if(o.kind==='arch'){for(const x of[o.x-4.4,o.x+4.4]){quad(x,o.z,.86,4.6,'#bfb48f');quad(x-.08,o.z+.03,.63,4.6,'#e8ddbd');const cap=project(x,4.6,o.z);if(cap){c.fillStyle='#e6dbb7';c.fillRect(cap.x-.57*k,cap.y-.08*k,1.14*k,.28*k);c.fillRect(cap.x-.57*k,base.y-.22*k,1.14*k,.22*k);}}for(const pass of[{width:.88,color:'#b7ad88'},{width:.6,color:'#ece2c3'}]){c.strokeStyle=pass.color;c.lineWidth=pass.width*k;c.beginPath();let first=true;for(let i=0;i<=40;i++){const a=i/40*Math.PI,q=project(o.x+Math.cos(a)*4.4,4.6+Math.sin(a)*4.4,o.z);if(!q){first=true;continue;}if(first){c.moveTo(q.x,q.y);first=false;}else c.lineTo(q.x,q.y);}c.stroke();}const key=project(o.x,9,o.z);if(key){c.fillStyle='#f0e5c6';c.fillRect(key.x-.34*k,key.y-.3*k,.68*k,.8*k);}continue;}
if(o.kind==='column'){const top=project(o.x,6,o.z);if(!top)continue;c.fillStyle='#ddd2af';c.fillRect(base.x-.32*k,top.y,.64*k,base.y-top.y);c.fillStyle='#c3bb98';c.fillRect(base.x+.13*k,top.y,.18*k,base.y-top.y);c.fillStyle='#eee3c3';c.fillRect(base.x-.5*k,top.y-.15*k,k,.3*k);continue;}
if(o.kind==='sign'){const q=project(o.x,1.8,o.z);if(q){c.fillStyle='#586e54';c.font=`${Math.max(3,.18*k)}px Georgia`;c.textAlign='center';c.fillText('YOU MADE IT',q.x,q.y);}continue;}
const tall=o.kind==='tree',size=tall?1.45:.8,crown=tall?3.5:.9,q=project(o.x,crown,o.z);if(!q)continue;if(tall){c.fillStyle='#777756';c.fillRect(base.x-.1*k,q.y,.2*k,base.y-q.y);}for(let j=0;j<3;j++){c.fillStyle=['#446e52','#567c57','#779260'][j];c.beginPath();c.ellipse(q.x+Math.sin(j*2.1)*size*k*.4,q.y-(j===2?.32*k:0),size*k*(j===2?.76:1),size*k*(j===2?.76:.88),0,0,Math.PI*2);c.fill();}
for(let j=0;j<(tall?12:7);j++){const a=j*2.4+o.index,x=q.x+Math.sin(a)*size*k*.9,y=q.y+Math.cos(j*1.4)*size*k*.62-.2*k,r=Math.max(.7,(tall?.16:.12)*k);c.fillStyle=j%3?'#edb9c5':'#f5ddb2';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();if(r>1){c.fillStyle='#fff1c9';c.fillRect(x-.3*r,y-.3*r,.6*r,.6*r);}}
}
}

blit(){this.ctx.imageSmoothingEnabled=true;this.ctx.drawImage(this.buf,0,0,this.surface.width,this.surface.height);}
}
