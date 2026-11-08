/* Presentation-only, deterministic effects. A burst has no secondary simulation
 * particles: both renderers derive its layers from the same id and age. */
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
export const EFFECT_BUDGET={effects:72,layers:576};
function hash(text){let a=2166136261;for(const c of String(text))a=Math.imul(a^c.charCodeAt(0),16777619);return a>>>0;}
function noise(seed,index){let a=Math.imul(seed^(index*374761393),668265263);a=Math.imul(a^(a>>>13),1274126177);return((a^(a>>>16))>>>0)/4294967296;}

/** Reuses output records, leaves effects untouched, and applies one hard budget
 * before sorting or uploading. Small muzzle flashes stay small and short. */
export function sampleCombatEffects(effects=[],options={},out=[]){
  let count=0,bursts=0;const capacity=options.capacity??EFFECT_BUDGET.layers;
  const motion=options.reducedMotion?.48:1,wind=options.wind||{};
  const write=(kind,x,y,z,radius,color,alpha,stretch=1,angle=0)=>{
    if(count>=capacity||alpha<.012||radius<=0)return;
    const p=out[count]||(out[count]={});
    Object.assign(p,{kind,x,y,z,radius,color,alpha:clamp(alpha,0,1),stretch,angle,index:count});count++;
  };
  for(const e of effects){
    const age=Math.max(0,finite(e.age)),life=Math.max(.05,finite(e.life,2)),f=clamp(age/life,0,1);
    if(f>=1||bursts++>=(options.effects??EFFECT_BUDGET.effects))continue;
    const x=finite(e.x),y=finite(e.y),z=finite(e.z),kind=e.type||e.kind||'explosion';
    const r=clamp(finite(e.radius,kind==='flash'?100:12),.1,3200),seed=hash(e.seed??e.id??`${x},${y},${z}`);
    if(kind==='explosion'){
      const expansion=1-Math.exp(-age*7),fireFade=clamp(1-f*2.3,0,1);
      // An initial white core gives way to irregular orange lobes, then rising
      // smoke. Different seeds change the silhouette without temporal jitter.
      if(f<.19)write('glow',x,y,z,r*(.13+expansion*.35),'#fff3ce',(1-f/.19)*.92*motion);
      for(let i=0;i<6;i++){
        const a=noise(seed,i)*TAU,v=noise(seed,i+17),offset=i===0?0:r*expansion*(.3+v*.65);
        const px=x+Math.cos(a)*offset,py=y+(v-.2)*offset+age*r*.08,pz=z+Math.sin(a)*offset;
        const size=r*(.16+noise(seed,i+43)*.27)*(.4+expansion);
        write('fire',px,py,pz,size,i%3===0?'#ffdd8a':f<.17?'#ff902f':'#e65a24',fireFade*.96,.78+v*.55,a+age*.2);
      }
      for(let i=0;i<5;i++){
        const a=noise(seed,i+67)*TAU,v=noise(seed,i+91),rise=r*(.16+v*.33)*age+r*age*age*.025;
        const spread=r*(.25+f*.5),px=x+Math.cos(a)*spread+finite(wind.x)*age*.3,pz=z+Math.sin(a)*spread+finite(wind.z)*age*.3;
        const smokeFade=clamp((f-.16)*5.5,0,1)*Math.pow(1-f,.4)*clamp((1-f)/.2,0,1);
        write('smoke',px,y+rise+r*.05,pz,r*(.28+v*.24)*(1+f*1.7),i%2?'#343a3f':'#485054',smokeFade*.88,1.1+f*.45,a);
      }
      if(f<.52)for(let i=0;i<7;i++){
        const a=noise(seed,i+109)*TAU,v=noise(seed,i+133),speed=r*(.6+v*.75),travel=age*speed;
        write('ember',x+Math.cos(a)*travel,y+travel*(.15+v*.7)-age*age*18,z+Math.sin(a)*travel,r*(.012+v*.015),i%2?'#ffc15c':'#fb682e',(1-f/.52)*.9,2.1,a);
      }
      if(f<.22)write('ring',x,y,z,r*(.25+f*4.2),'#f1d6a5',(1-f/.22)*.15*motion,1,0);
    }else if(kind==='smoke'){
      write('smoke',x,y+f*12,z,r*(1+f*1.3)*1.8,'#79817b',(1-f)*.56,1.12,finite(e.x)*.03);
    }else if(kind==='flash'){
      write('glow',x,y,z,r*(.6+f*.6),'#fff0ca',Math.pow(1-f,1.4)*.8*motion);
    }else if(kind==='flare'){
      for(let i=0;i<6;i++){
        const a=TAU*i/6+.3,travel=r*f*(.45+noise(seed,i)*.55);
        write('ember',x+Math.cos(a)*travel,y-travel*.5,z+Math.sin(a)*travel,r*.035,'#ffe0a1',(1-f)*.8,1.4,a);
      }
    }else{
      write(kind==='impact'?'fire':'smoke',x,y,z,r*(1+f*1.3),kind==='drop'?'#d9debb':'#f4b762',(1-f)*.62,kind==='impact'?.55:1);
    }
  }
  out.length=count;return out;
}

export function sortEffectLayers(layers,eye,forward){
  for(const p of layers)p.depth=(p.x-eye.x)*forward.x+(p.y-eye.y)*forward.y+(p.z-eye.z)*forward.z;
  layers.sort((a,b)=>b.depth-a.depth||a.index-b.index);return layers;
}
