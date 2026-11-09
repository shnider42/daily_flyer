/* Presentation-only, deterministic effects. A burst has no secondary simulation
 * particles: both renderers derive its layers from the same id and age. */
import {AIRCRAFT} from './campaign.mjs';
import {orientationOf,basis} from './orientation.mjs';
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
export const EFFECT_BUDGET={effects:72,layers:576,smoke:96};
function hash(text){let a=2166136261;for(const c of String(text))a=Math.imul(a^c.charCodeAt(0),16777619);return a>>>0;}
function noise(seed,index){let a=Math.imul(seed^(index*374761393),668265263);a=Math.imul(a^(a>>>13),1274126177);return((a^(a>>>16))>>>0)/4294967296;}
const priority=e=>(e.type==='explosion'&&finite(e.age)<.45?4:e.type==='impact'?3:e.type==='explosion'?2:e.type==='trail'?0:1)-finite(e.age)*.01;

/** Reuses output records, leaves effects untouched, and applies one hard budget
 * before sorting or uploading. Recent impacts get room before old smoke. */
export function sampleCombatEffects(effects=[],options={},out=[]){
  let count=0,bursts=0;const capacity=options.capacity??EFFECT_BUDGET.layers;
  const motion=options.reducedMotion?.48:1,wind=options.wind||{};
  const write=(kind,x,y,z,radius,color,alpha,stretch=1,angle=0)=>{
    if(count>=capacity||alpha<.012||radius<=0)return;
    const p=out[count]||(out[count]={});
    Object.assign(p,{kind,x,y,z,radius,color,alpha:clamp(alpha,0,1),stretch,angle,index:count});count++;
  };
  const ordered=effects.length>1?effects.slice().sort((a,b)=>priority(b)-priority(a)):effects;
  for(const e of ordered){
    const age=Math.max(0,finite(e.age)),life=Math.max(.05,finite(e.life,2)),f=clamp(age/life,0,1);
    if(f>=1||bursts++>=(options.effects??EFFECT_BUDGET.effects))continue;
    const x=finite(e.x),y=finite(e.y),z=finite(e.z),kind=e.type||e.kind||'explosion';
    const r=clamp(finite(e.radius,kind==='flash'?100:12),.1,3200),seed=hash(e.seed??e.id??`${x},${y},${z}`);
    if(kind==='explosion'){
      const expansion=1-Math.exp(-age*8),fireEnd=Math.min(1.45,life*.58),fireFade=clamp(1-age/fireEnd,0,1),flashEnd=Math.min(.24,life*.17);
      // A crisp white-hot flash and incandescent center lead the burst. Its
      // flame and soot silhouettes separate as they expand; no temporal jitter.
      if(age<flashEnd)write('glow',x,y,z,r*(.22+expansion*.42),'#fff4da',Math.pow(1-age/flashEnd,.65)*motion);
      if(age<fireEnd*.65)write('core',x,y+age*r*.12,z,r*(.25+expansion*.34),'#fff0aa',clamp(1-age/(fireEnd*.65),0,1)*.98*motion);
      for(let i=0;i<8;i++){
        const a=noise(seed,i)*TAU,v=noise(seed,i+17),offset=i===0?0:r*expansion*(.28+v*.65);
        const px=x+Math.cos(a)*offset,py=y+(v-.18)*offset+age*r*.12,pz=z+Math.sin(a)*offset;
        const size=r*(.19+noise(seed,i+43)*.27)*(.6+expansion*.9);
        write('fire',px,py,pz,size,i%3===0?'#ffcb56':age<.38?'#ff791c':'#c73710',Math.pow(fireFade,.65)*.98,.72+v*.72,a+age*.28);
      }
      // Smoke becomes opaque enough to read as smoke, instead of a soft halo.
      // Small moving dark lobes break up the fire while the main column rises.
      for(let i=0;i<6;i++){
        const a=noise(seed,i+67)*TAU,v=noise(seed,i+91),rise=r*(.12+v*.25)*age+r*age*age*.012;
        const spread=r*(.2+f*.52),px=x+Math.cos(a)*spread+finite(wind.x)*age*.3,pz=z+Math.sin(a)*spread+finite(wind.z)*age*.3;
        const smokeFade=clamp((age-.13)*2.5,0,1)*Math.pow(1-f,.28)*clamp((1-f)/.19,0,1);
        write('smoke',px,y+rise+r*.05,pz,r*(.3+v*.22)*(1+f*1.9),i%2?'#252a2d':'#414344',smokeFade*.94,1.08+f*.48,a);
      }
      if(f<.66)for(let i=0;i<10;i++){
        const a=noise(seed,i+109)*TAU,v=noise(seed,i+133),speed=r*(.8+v*1.15),travel=age*speed,fade=clamp(1-f/.66,0,1);
        const px=x+Math.cos(a)*travel,py=y+travel*(.18+v*.75)-age*age*20,pz=z+Math.sin(a)*travel;
        write(i%3===0?'debris':'ember',px,py,pz,r*(.016+v*.016),i%3===0?'#292b2a':i%2?'#fff0a2':'#ff9b28',fade,.6+v*2.1,a+age*(v-.5)*7);
      }
      if(age<.45)write('ring',x,y,z,r*(.35+age*3.2),'#f8dbb2',clamp(1-age/.45,0,1)*.27*motion,1,0);
    }else if(kind==='impact'){
      const flash=clamp(1-age/.12,0,1);
      write('core',x,y,z,r*(.18+f*.2),'#fff2c0',flash*.96*motion);
      for(let i=0;i<8;i++){
        const a=noise(seed,i)*TAU,v=noise(seed,i+21),travel=r*(.12+f*(.65+v));
        write('ember',x+Math.cos(a)*travel,y+(v-.35)*travel-age*age*12,z+Math.sin(a)*travel,r*(.025+v*.02),'#ffd471',Math.pow(1-f,.55)*.94,2.3+v*1.5,a);
      }
      if(f>.15)write('smoke',x,y+f*r*.25,z,r*(.16+f*.36),'#3e4140',(1-f)*.5,1.15);
    }else if(kind==='trail'){
      write('smoke',x+finite(wind.x)*age*.5,y+age*(3+finite(e.severity)*4),z+finite(wind.z)*age*.5,r*(1+f*2.2),e.severity>.7?'#292e30':'#536064',Math.pow(1-f,.6)*(.34+finite(e.severity)*.3),1.15+f*.35,noise(seed,1)*TAU);
      if(e.burning&&age<.2)write('fire',x,y,z,r*.8,'#f49731',(1-age/.2)*.8,1.45);
    }else if(kind==='smoke'){
      write('smoke',x,y+f*12,z,r*(1+f*1.3)*1.8,'#68716c',(1-f)*.68,1.12,finite(e.x)*.03);
    }else if(kind==='flash'){
      write('glow',x,y,z,r*(.6+f*.6),'#fff0ca',Math.pow(1-f,1.4)*.8*motion);
    }else if(kind==='flare'){
      for(let i=0;i<6;i++){
        const a=TAU*i/6+.3,travel=r*f*(.45+noise(seed,i)*.55);
        write('ember',x+Math.cos(a)*travel,y-travel*.5,z+Math.sin(a)*travel,r*.035,'#ffe0a1',(1-f)*.8,1.4,a);
      }
    }else write('smoke',x,y,z,r*(1+f*1.3),kind==='drop'?'#d9debb':'#f4b762',(1-f)*.62);
  }
  out.length=count;return out;
}

/** Cosmetic emitters store puffs in world space so a damaged plane leaves a
 * curved trail instead of dragging a straight smoke tube around with it. */
export class DamageSmokeTrails{
  constructor(){this.reset();}
  reset(){this.puffs=[];this.sources=new Map();this.serial=0;this.time=null;}
  sample(sim,options={},out=[]){
    const time=finite(sim.time,finite(options.time));
    if(this.time!==null&&(time<this.time||time-this.time>2.5))this.reset();
    this.time=time;
    const poses=[sim.player,...(sim.enemies||[]),...(options.remotePlayers||[]).map(p=>p.pose||p.player||p)];
    const sources=new Map();for(const p of poses)if(p&&Number.isFinite(p.x)&&p.alive!==false&&!p.crashed&&finite(p.health,1)>0)sources.set(String(p.id||'local'),p);
    for(const [id,state]of this.sources){const p=sources.get(id);if(!p||state.lifeId!==p.lifeId){this.sources.delete(id);this.puffs=this.puffs.filter(puff=>puff.source!==id);}}
    for(const [id,p]of sources){
      const profile=typeof p.aircraft==='string'?AIRCRAFT[p.aircraft]:p.aircraft||{},maxHealth=Math.max(1,finite(p.initialHealth,finite(p.maxHealth,finite(profile?.health,sim.player===p?finite(sim.aircraft?.health,120):120))));
      const fraction=clamp(finite(p.health,maxHealth)/maxHealth,0,1);if(fraction>=.64)continue;
      let state=this.sources.get(id);if(!state)this.sources.set(id,state={next:time,lifeId:p.lifeId});
      if(time<state.next)continue;state.next=time+(options.reducedMotion?.2:.11);
      const severity=clamp((.64-fraction)/.5,0,1),{forward,up}=basis(orientationOf(p)),heavy=['b17','b2','c47','ac130'].includes(typeof p.aircraft==='string'?p.aircraft:p.aircraft?.id),tail=heavy?10:4.2;
      this.puffs.push({id:'damage-smoke-'+(++this.serial),source:id,type:'trail',x:p.x-forward.x*tail+up.x*.2,y:p.y-forward.y*tail+up.y*.2,z:p.z-forward.z*tail+up.z*.2,radius:(heavy?1.4:.8)+severity*(heavy?1.6:1.2),severity,burning:fraction<.2,born:time,age:0,life:2.4});
    }
    this.puffs=this.puffs.filter(p=>time-p.born<p.life).slice(-EFFECT_BUDGET.smoke);
    let count=0;for(const p of this.puffs){p.age=Math.max(0,time-p.born);out[count++]=p;}out.length=count;return out;
  }
}

export function sortEffectLayers(layers,eye,forward){
  for(const p of layers)p.depth=(p.x-eye.x)*forward.x+(p.y-eye.y)*forward.y+(p.z-eye.z)*forward.z;
  layers.sort((a,b)=>b.depth-a.depth||a.index-b.index);return layers;
}

// A camera can be inside its own blast. Thin the very near particles instead
// of turning a short impact into an opaque screen-sized disc.
export function effectViewAlpha(layer,eye){
  if(layer.kind==='ring'||layer.kind==='ember'||layer.kind==='debris')return layer.alpha;
  const distance=Math.hypot(layer.x-eye.x,layer.y-eye.y,layer.z-eye.z),ratio=distance/Math.max(.1,layer.radius);
  return layer.alpha*(.055+.945*clamp((ratio-.45)/2.05,0,1));
}
