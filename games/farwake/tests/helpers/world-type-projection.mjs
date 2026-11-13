/** Release-compatibility projections for the intentional place-variety change.
 * Added descriptors, changed visual radii, themed instrument prose and appended
 * resource rocks are excluded. Station relocation is intentional: reconstruct
 * its recorded old pose, while every world/authored coordinate and rule stays in.
 */
const systemFields=['systemTypeId','typeLabel','typeDescription','stellar','activity'];
const bodyFields=['stationTypeId','planetTypeId','sizeClass','typeLabel','typeDescription','visualRadius','stationGeography'];
export const releasedRadius=body=>body.kind==='planet'?122:body.kind==='moon'?76:70;

export function releasedBody(body,{authored=false,runtime=false}={}){
 const result=structuredClone(body);
 // Procedural ports originally had implicit index-based positions. Runtime
 // comparisons use their independently retained previous metre coordinates;
 // catalog comparisons restore the absence of explicit x/y. Authored stations
 // and every planet/moon keep their actual unmodified coordinates covered.
 if(!authored&&body.kind==='station'&&body.stationGeography?.legacyPosition){
  if(runtime)Object.assign(result,body.stationGeography.legacyPosition);
  else{delete result.x;delete result.y;}
 }
 // Only new procedural port purposes were added; authored/base permissions
 // existed already and must remain covered by their original fixture bytes.
 if(!authored&&body.stationTypeId)delete result.portType;
 for(const key of bodyFields)delete result[key];
 if(runtime&&Object.hasOwn(result,'radius')&&['station','planet','moon','asteroid'].includes(result.kind))result.radius=releasedRadius(result);
 return result;
}
export function releasedChart(systems){
 return systems.map(system=>{
  const result={...structuredClone(system),bodies:system.bodies.map(body=>releasedBody(body,{authored:system.authored}))};
  for(const key of systemFields)delete result[key];
  return result;
 });
}
export function releasedAsteroids(asteroids){
 return asteroids.filter(rock=>{const match=String(rock.id).match(/:rock:(\d+)$/);return !match||Number(match[1])<46;});
}
export function releasedSignals(signals){
 return signals.map(signal=>{
  const result={...signal},match=String(signal.id).match(/:signal:(\d+)$/);
  if(match&&!signal.story&&!signal.encounterId){
   // Ordinary instrument names now describe their system. Their IDs, kinds,
   // source permissions, scan state and physical placement remain unchanged.
   result.name=['Lane navigation beacon','Survey marker','A bend in the light','Old survey buoy','A voice in the static'][Number(match[1])%5];
   delete result.description;
  }
  return result;
 });
}
