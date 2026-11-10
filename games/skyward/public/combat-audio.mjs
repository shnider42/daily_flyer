// Cache these short, layered sounds once per audio context. Combat never builds
// a buffer in the flight loop; the engine's brown noise is not an impact sound.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TAU=Math.PI*2;
export const COMBAT_AUDIO_LIMITS=Object.freeze({voices:12,hitInterval:.055,explosionInterval:.045});
export const COMBAT_SOUND_SECONDS=Object.freeze({hit:.34,heavyhit:.95,explosion:2.25,nuclear:6.8,gun:.115,cannon:.62,heavycannon:1.3});
const decay=(t,life)=>t<0?0:Math.exp(-t/life);
const HIT_DEBRIS=[[.028,.26],[.069,.17],[.116,.08]];
const HEAVY_DEBRIS=[[.036,.28],[.093,.23],[.17,.17],[.29,.11],[.42,.06]];
const BLAST_ROLL=[[.065,.6,.07],[.145,.41,.11],[.27,.28,.16]];
const NUCLEAR_ROLL=[[.22,.7,.28],[.61,.55,.42],[1.12,.46,.6],[1.86,.38,.78],[2.7,.26,.9],[3.7,.17,1.1]];
const BLAST_DEBRIS=[[.10,.26],[.18,.22],[.32,.17],[.49,.13],[.71,.1],[.97,.07],[1.26,.04]];

/** Deterministic PCM permits the same sound and checks on every device. The
 * midrange transient is intentional: a phone speaker must convey the strike
 * even when it cannot reproduce the sub-bass pressure layer. */
export function synthesizeCombatSound(kind,sampleRate=48000,seed=0x51a7c0de){
  const seconds=COMBAT_SOUND_SECONDS[kind]||COMBAT_SOUND_SECONDS.explosion;
  const rate=clamp(Number.isFinite(sampleRate)?sampleRate:48000,8000,192000);
  const out=new Float32Array(Math.ceil(seconds*rate));
  let state=seed>>>0,low=0,mid=0,body=0,peak=0;
  const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2147483648-1;};
  const filtered=(hz)=>1-Math.exp(-TAU*Math.min(hz,rate*.42)/rate);
  const lowA=filtered(180),midA=filtered(1900),bodyA=filtered(460);
  const metal=(t,freq,life)=>Math.sin(TAU*Math.min(freq,rate*.42)*t)*decay(t,life);
  for(let i=0;i<out.length;i++){
    const t=i/rate,white=rand();low+=(white-low)*lowA;mid+=(white-mid)*midA;body+=(white-body)*bodyA;
    const high=white-mid,band=mid-body,attack=Math.min(1,t/.0005);let s=0;
    if(kind==='hit'){
      // Sheet metal crack, short airframe thump, then three loose fragments.
      s=high*decay(t,.012)*.82+band*decay(t,.038)*.78;
      s+=Math.sin(TAU*(178*t-105*t*t))*decay(t,.065)*.43;
      s+=metal(t,973,.032)*.19+metal(t,1537,.048)*.14+metal(t,2471,.023)*.11;
      for(const [at,gain] of HIT_DEBRIS)s+=high*decay(t-at,.008)*gain;
    }else if(kind==='heavyhit'){
      s=high*decay(t,.018)*.88+band*decay(t,.12)*1.25+body*decay(t,.24)*1.7;
      s+=Math.sin(TAU*(108*t-35*t*t))*decay(t,.22)*.72;
      s+=metal(t,412,.14)*.21+metal(t,887,.063)*.18;
      for(const [at,gain] of HEAVY_DEBRIS)s+=high*decay(t-at,.014)*gain;
    }else if(kind==='nuclear'){
      // Broad pressure crack, descending body and a long turbulent roll. The
      // 200–900 Hz layer survives phone speakers; bass is not the sole cue.
      s=high*decay(t,.026)*.85+band*decay(t,.21)*1.8;
      s+=Math.sin(TAU*(72*t-5.2*t*t))*decay(t,.82)*.75;
      s+=low*decay(t,2.35)*4.4+body*decay(t,1.6)*2.2;
      s+=band*decay(t,2.1)*(.35+.12*Math.sin(t*8.3)+.08*Math.sin(t*17.7));
      for(const [at,gain,life] of NUCLEAR_ROLL)s+=(body*2.3+band*.6)*decay(t-at,life)*gain;
    }else if(kind==='gun'){
      s=high*decay(t,.006)*.88+band*decay(t,.025)*1.5;
      s+=Math.sin(TAU*(205*t-490*t*t))*decay(t,.024)*.58;
      s+=metal(t,1210,.009)*.13;
    }else{
      const scale=kind==='cannon'?.40:kind==='heavycannon'?.68:1,u=t/scale;
      // Separate crack and pressure, followed by a ragged, non-periodic roll.
      s=high*decay(u,.017)*.92+band*decay(u,.16)*1.7;
      s+=Math.sin(TAU*(103*t-22*t*t))*decay(u,.35)*.73;
      s+=low*decay(u,.76)*3.2+body*decay(u,.32)*1.9;
      for(const [at,gain,life] of BLAST_ROLL)s+=band*decay(u-at,life)*gain;
      for(const [at,gain] of BLAST_DEBRIS)s+=high*decay(u-at,.012)*gain;
      if(kind!=='explosion')s+=metal(t,290,.055)*.15;
    }
    // Soft saturation gives the transient body without an over-range sample.
    const tail=Math.min(1,(seconds-t)/.075),value=Math.tanh(s*1.18)*attack*tail;
    out[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  const gain=peak>0?.94/peak:0;
  for(let i=0;i<out.length;i++)out[i]*=gain;
  return out;
}

export function combatCueProfile(kind,details={}){
  const intensity=clamp(Number.isFinite(details.intensity)?details.intensity:1,0,1);
  const pan=clamp(Number.isFinite(details.pan)?details.pan:0,-.85,.85);
  const distance=Math.max(0,Number.isFinite(details.distance)?details.distance:0);
  const explosive=/missile|bomb|nuclear|rocket|flak|105|40mm|cannon/i.test(String(details.weapon||''));
  const heavy=kind==='major-hit'||kind==='heavyhit'||kind==='hit'&&(explosive||intensity>=.7);
  const sound=heavy?'heavyhit':kind,nuclear=kind==='nuclear';
  const hit=kind==='hit'||kind==='major-hit'||kind==='heavyhit';
  return {sound,intensity,pan,distance,playbackRate:nuclear?(details.payload==='tsar'?.8:details.payload==='hydrogen'?.9:1):1,
    gain:(hit?.82:nuclear?.9:kind==='explosion'?.9:kind==='gun'?.39:.65)*Math.sqrt(intensity),
    lowpass:hit?7200:nuclear?clamp(5200/(1+distance/4500),700,5200):clamp(7600/(1+distance/650),950,7600),
    priority:hit?8:nuclear?7:kind==='explosion'?6:kind==='gun'?2:4,
    duck:hit?.77:nuclear?.8*intensity:kind==='explosion'?.68*intensity:kind==='heavycannon'?.36:0,
    duckSeconds:hit?(heavy?.55:.29):nuclear?1.5+intensity*2.2:kind==='explosion'?.35+intensity*.4:.2,
  };
}
