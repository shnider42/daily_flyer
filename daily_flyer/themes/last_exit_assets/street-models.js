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
 bollard:Object.freeze({w:.26,d:.26,h:.95,mass:39,breakSpeed:4,restitution:.17,friction:.77,baseW:.26,baseD:.26})
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
const DRAW={bench,lamp,bin,hydrant,sign,newsbox,cone,bollard};
export function drawStreetProp(m,p,{lod=false}={}){
 const transform=m.transform,heightSampler=m.heightSampler,material=m.material;
 m.heightSampler=null;m.material=0;m.transform={x:p.x,y:p.y||0,z:p.z,c:Math.cos(p.a||0),s:Math.sin(p.a||0),pitch:p.pitch||0,roll:p.roll||0};
 (DRAW[p.kind]||bin)(m,p,lod);
 m.transform=transform;m.heightSampler=heightSampler;m.material=material;
 return m;
}
