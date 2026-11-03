// Original low-poly street furniture. A single local transform is shared by
// intact, airborne and resting poses; nothing is left behind in the world mesh.
export const PROP_SPECS=Object.freeze({
 bench:Object.freeze({w:2.4,d:.78,h:1.08,mass:65,breakSpeed:2.5,restitution:.22,friction:.74,baseW:2.4,baseD:.78}),
 lamp:Object.freeze({w:2.8,d:.56,h:5.85,mass:110,breakSpeed:4.5,restitution:.16,friction:.68,baseW:.28,baseD:.28}),
 bin:Object.freeze({w:.66,d:.66,h:.91,mass:20,breakSpeed:1.5,restitution:.3,friction:.63,baseW:.66,baseD:.66}),
 hydrant:Object.freeze({w:.7,d:.46,h:.81,mass:100,breakSpeed:5,restitution:.18,friction:.75,baseW:.54,baseD:.44}),
 sign:Object.freeze({w:.7,d:.16,h:2.85,mass:18,breakSpeed:2.8,restitution:.2,friction:.68,baseW:.15,baseD:.15}),
 newsbox:Object.freeze({w:.64,d:.66,h:1.26,mass:24,breakSpeed:2.2,restitution:.23,friction:.73,baseW:.64,baseD:.6}),
 cone:Object.freeze({w:.52,d:.52,h:.68,mass:3,breakSpeed:.6,restitution:.36,friction:.61,baseW:.45,baseD:.45}),
 bollard:Object.freeze({w:.26,d:.26,h:.95,mass:39,breakSpeed:4,restitution:.17,friction:.77,baseW:.26,baseD:.26}),
 dumpster:Object.freeze({w:2,d:1.3,h:1.35,mass:180,breakSpeed:3.5,restitution:.17,friction:.82,baseW:2,baseD:1.3}),
 crate:Object.freeze({w:.8,d:.8,h:.8,mass:12,breakSpeed:1,restitution:.28,friction:.72,baseW:.8,baseD:.8}),
 roadbarrier:Object.freeze({w:2.4,d:.55,h:1,mass:18,breakSpeed:1.5,restitution:.24,friction:.7,baseW:2.4,baseD:.55})
});
export const propSpec=kind=>PROP_SPECS[typeof kind==='object'?kind.kind:kind]||PROP_SPECS.bin;
const IRON='#46524d',WOOD='#9a7c55',LIGHTWOOD='#b29b72';
// Mesh.box omits its underside, which is exposed once an object tumbles.
function block(m,x,y,z,w,h,d,color){m.box(x,y,z,w,h,d,color);m.flat(x,z,w,d,color,y);}
function prism(m,y0,y1,r0,r1,color,n=6,x=0,z=0){
 for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;m.quad([x+Math.cos(a)*r0,y0,z+Math.sin(a)*r0],[x+Math.cos(b)*r0,y0,z+Math.sin(b)*r0],[x+Math.cos(b)*r1,y1,z+Math.sin(b)*r1],[x+Math.cos(a)*r1,y1,z+Math.sin(a)*r1],color);}
 m.disc(x,y0,z,r0,color,n);m.disc(x,y1,z,r1,color,n);
}
function bench(m,p,lod){
 for(const x of[-.91,.91])block(m,x,0,.01,.12,.51,.59,IRON);
 if(lod){block(m,0,.45,0,2.4,.09,.64,WOOD);block(m,0,.69,.31,2.4,.36,.09,WOOD);return;}
 for(let i=0;i<4;i++)block(m,0,.46,-.27+i*.18,2.4,.075,.14,i%2?LIGHTWOOD:WOOD);
 for(const x of[-.94,.94]){block(m,x,.5,.3,.075,.58,.075,IRON);m.tube([x,.63,-.27],[x,.68,.3],.037,IRON,4);}
 for(let i=0;i<3;i++){const displaced=p.broken&&i===1;block(m,displaced?.12:0,.69+i*.13,.32+(displaced?.025:0),displaced?2.1:2.4,.095,.075,i%2?LIGHTWOOD:WOOD);}
 m.tube([-.93,.17,.06],[.93,.17,.06],.037,IRON,4);
}
function lamp(m,p,lod){
 const metal='#65716b';block(m,0,0,0,.28,.2,.28,IRON);
 m.tube([0,.16,0],[0,5.37,0],.065,metal,4);
 m.tube([0,5.36,0],[.52,5.65,0],.06,metal,4);
 m.tube([.52,5.65,0],[1.05,5.65,0],.055,metal,4);
 block(m,1.03,5.61,0,.66,.2,.44,'#747d70');
 if(!lod){block(m,0,.21,0,.13,.4,.13,'#7d8779');m.flat(1.03,0,.5,.32,p.broken?'#414b45':'#ded7b0',5.605);}
}
function bin(m,p,lod){
 if(lod){block(m,0,.04,0,.58,.78,.58,'#53695f');block(m,0,.82,0,.66,.07,.66,'#89978a');return;}
 prism(m,.04,.8,.28,.31,'#586d62',8);prism(m,.8,.88,.33,.3,'#869486',8);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;m.tube([Math.cos(a)*.286,.16,Math.sin(a)*.286],[Math.cos(a)*.307,.72,Math.sin(a)*.307],.012,'#a2aa91',3);}
 block(m,0,.88,0,.17,.03,.11,IRON);block(m,0,.42,.299,.2,.2,.012,'#c9c5a8');
}
function hydrant(m,p,lod){
 prism(m,.03,.59,.16,.16,'#a35740',lod?4:6);prism(m,.58,.77,.2,.08,'#b06c4c',lod?4:6);
 m.tube([-.3,.43,0],[.3,.43,0],.075,'#a75c41',4);
 if(!lod){prism(m,0,.06,.23,.23,'#7f6950',6);for(const x of[-.32,.32])block(m,x,.36,0,.06,.14,.14,'#b5a27d');block(m,0,.77,0,.075,.04,.075,'#a29d82');}
}
function sign(m,p,lod){
 block(m,0,0,0,.07,2.63,.07,'#879183');
 const face=(r,z,color)=>{for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4,b=a+Math.PI/4;m.tri([0,2.48,z],[Math.cos(a)*r,2.48+Math.sin(a)*r,z],[Math.cos(b)*r,2.48+Math.sin(b)*r,z],color);}};
 face(.36,.035,'#cac7ad');face(.315,.041,'#9c503e');
 if(!lod){face(.36,-.039,'#8f9a8a');for(let i=0;i<3;i++)block(m,-.14+i*.14,2.42,.044,.075,.1,.008,'#ded7bd');}
}
function newsbox(m,p,lod){
 const blue=p.color||'#4c6a73';block(m,0,0,.015,.39,.53,.38,IRON);block(m,0,.48,0,.64,.75,.6,blue);
 if(lod){block(m,0,.66,-.304,.47,.37,.01,'#c4c5af');return;}
 block(m,0,1.23,0,.64,.03,.6,'#7b9190');block(m,0,.67,-.306,.5,.39,.014,'#293c3e');block(m,0,.71,-.315,.4,.28,.008,'#d2ccb0');
 for(let i=0;i<3;i++)block(m,0,.75+i*.065,-.321,.29,.016,.004,'#778274');
 block(m,0,1.1,-.309,.41,.055,.013,'#bfc4a8');block(m,.23,1.02,-.312,.065,.04,.015,'#c7c8ad');
}
function cone(m,p,lod){
 block(m,0,0,0,.52,.055,.52,'#4d5147');
 if(lod){prism(m,.055,.68,.21,.025,'#bd7747',4);prism(m,.37,.49,.117,.082,'#d5d1b4',4);return;}
 prism(m,.055,.37,.21,.115,'#bd7747',4);prism(m,.37,.49,.115,.08,'#d5d1b4',4);prism(m,.49,.68,.08,.025,'#bd7747',4);
}
function bollard(m,p,lod){
 prism(m,0,.78,.12,.105,IRON,lod?4:6);prism(m,.78,.88,.105,.105,'#c0b58d',lod?4:6);prism(m,.88,.95,.105,.06,IRON,lod?4:6);
}
function dumpster(m,p,lod){
 const paint=p.color||'#526b59',dent=p.broken?.15:0;
 if(lod){block(m,0,.13,0,1.96,1.03,1.25,paint);block(m,0,p.broken?1.25:1.16,.015,2,.08,1.27,'#3c4c45');for(const x of[-.72,.72])block(m,x,0,0,.13,.17,1.02,IRON);return;}
 const lower=[[-.79,.18,-.45],[.79,.18,-.45],[.79,.18,.45],[-.79,.18,.45]],upper=[[-.98,1.15,-.625],[.98,1.15,-.625],[.98-dent,1.15,.625],[-.98,1.15,.625]];
 for(let i=0;i<4;i++){const n=(i+1)%4;m.quad(lower[i],lower[n],upper[n],upper[i],paint);}
 m.flat(0,0,1.58,.9,IRON,.18);m.flat(0,0,1.94,1.23,'#303e35',1.145);
 for(const x of[-.76,.76])for(const z of[-.43,.43])block(m,x,0,z,.13,.2,.18,IRON);
 // The rear lid is pulled up after an impact, exposing the dark opening.
 block(m,0,1.15,-.32,2,.08,.65,'#394d40');
 if(p.broken){m.quad([-.98,1.18,.63],[.98,1.18,.63],[.91,1.34,.04],[-.91,1.34,.04],'#69765f');m.quad([-.98,1.17,.63],[-.91,1.33,.04],[.91,1.33,.04],[.98,1.17,.63],'#354a3b');block(m,.28,1.12,.2,.46,.13,.35,'#a09674');}
 else block(m,0,1.15,.32,2,.08,.65,'#405344');
 for(const z of[-.617,.617]){block(m,0,.27,z,1.68,.06,.025,'#72806b');for(const x of[-.58,.58])block(m,x,.31,z,.045,.68,.025,'#6d7a65');}
 for(const x of[-.987,.987])block(m,x,.75,0,.025,.09,.48,'#8e9782');
}
function crate(m,p,lod){
 const tan=p.color||'#aa8b5e';
 if(lod){block(m,0,0,0,.798,.8,.798,tan);m.quad([-.34,.07,-.4],[-.24,.07,-.4],[.34,.72,-.4],[.24,.72,-.4],'#6d5b3f');return;}
 // Separate wall and lid boards keep a broken top visibly open.
 for(const z of[-.39,.39])m.quad([-.39,0,z],[.39,0,z],[.39,.76,z],[-.39,.76,z],tan);
 for(const x of[-.39,.39])m.quad([x,0,-.39],[x,0,.39],[x,.76,.39],[x,.76,-.39],'#92794f');
 m.flat(0,0,.78,.78,'#64563e',.01);
 for(let i=0;i<3;i++)if(!p.broken||i!==1)block(m,-.26+i*.26,.75,0,.25,.05,.8,i%2?LIGHTWOOD:tan);
 for(const z of[-.395,.395]){
  for(const x of[-.33,.33])block(m,x,0,z,.11,.75,.01,'#b79e70');
  m.quad([-.31,.11,z],[ -.19,.06,z],[.31,.64,z],[.19,.71,z],'#7e6945');
  if(p.broken)m.quad([-.13,.5,z-.0001],[.08,.41,z-.0001],[.04,.73,z-.0001],[-.04,.64,z-.0001],'#4b4535');
 }
}
function roadbarrier(m,p,lod){
 for(const x of[-.83,.83])for(const z of[-.22,.22])m.tube([x,.04,z],[x,.83,0],.035,'#929583',lod?3:4);
 const top=p.broken?.88:1;
 block(m,0,.62,0,2.4,top-.62,.1,'#d1cbb0');
 for(const z of[-.052,.052])for(let i=0;i<(lod?4:5);i++){
  const x=-1.18+i*(lod?.58:.47),w=.2;
  m.quad([x,.64,z],[x+w,.64,z],[Math.min(1.19,x+w+.19),top-.02,z],[Math.min(1.19,x+.19),top-.02,z],'#b87543');
 }
 if(!lod){m.tube([-.83,.3,.19],[.83,.3,.19],.025,IRON,4);if(p.broken)m.quad([.45,.62,-.055],[.61,.62,-.055],[.57,top,-.055],[.51,top,-.055],'#62563f');}
}
const DRAW={bench,lamp,bin,hydrant,sign,newsbox,cone,bollard,dumpster,crate,roadbarrier};
export function drawStreetProp(m,p,{lod=false}={}){
 const transform=m.transform,heightSampler=m.heightSampler,material=m.material;
 m.heightSampler=null;m.material=0;m.transform={x:p.x,y:p.y||0,z:p.z,c:Math.cos(p.a||0),s:Math.sin(p.a||0),pitch:p.pitch||0,roll:p.roll||0};
 (DRAW[p.kind]||bin)(m,p,lod);
 m.transform=transform;m.heightSampler=heightSampler;m.material=material;
 return m;
}
