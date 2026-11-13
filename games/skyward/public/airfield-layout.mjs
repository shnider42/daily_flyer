// Pure layout metadata shared by terrain physics and visual scenery.
export const isPassengerAirport=runway=>!runway?.carrier&&(runway?.airport===true||runway?.airfieldType==='airport');
export function airportGroundBounds(runway){
  const width=Number.isFinite(runway?.width)?runway.width:140;
  return {acrossMin:-width/2-90,acrossMax:width/2+1080,alongMin:-760,alongMax:760,blend:260,maxBlend:1200};
}
export function airportGroundDistance(across,along,runway){
  const b=airportGroundBounds(runway);
  return Math.max(b.acrossMin-across,across-b.acrossMax,b.alongMin-along,along-b.alongMax,0);
}
