/** Presentation-only zoom. It never changes simulation coordinates or UI scale. */
import {pixelCamera} from './render-viewport.mjs';
import {PERSON_ZOOM,normalizeModeZoom} from './camera-preferences.mjs';

// Legacy imports use the person range; new callers choose their mode explicitly.
export const WORLD_ZOOM = PERSON_ZOOM;
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
export const normalizeShipZoom=(value,fallback=1)=>normalizeModeZoom(value,'ship',fallback);
export const normalizePersonZoom=(value,fallback=1)=>normalizeModeZoom(value,'person',fallback);
export const normalizeWorldZoom=normalizePersonZoom;

/** A surface camera is a top-left world origin, unlike the centered ship camera. */
export function surfaceCamera({x=0,y=0,worldWidth=1,worldHeight=1,width=1,height=1,zoom=1,rasterScale=1,cameraX,cameraY}={}){
 rasterScale=Math.max(1,finite(rasterScale,1));zoom=normalizePersonZoom(zoom)*rasterScale;width=Math.max(1,finite(width,1));height=Math.max(1,finite(height,1));
 const visibleWidth=width/zoom,visibleHeight=height/zoom;
 const center=(value,world,viewport)=>world<viewport?(world-viewport)/2:Math.max(0,Math.min(world-viewport,value-viewport/2));
 let cx=finite(cameraX,center(x,worldWidth,visibleWidth)),cy=finite(cameraY,center(y,worldHeight,visibleHeight));
 // Preserve the existing person camera exactly at its default scale.
 if(zoom===1){cx=Math.round(cx);cy=Math.round(cy);}
 const view=pixelCamera({cameraX:cx,cameraY:cy,width,height,zoom});
 return{cameraX:view.cameraX,cameraY:view.cameraY,width,height,zoom,offsetX:view.offsetX,offsetY:view.offsetY};
}

const transform=view=>{
 const zoom=finite(view?.zoom,1)>0?finite(view?.zoom,1):1;
 return{zoom,offsetX:finite(view?.offsetX,-finite(view?.cameraX,0)*zoom),offsetY:finite(view?.offsetY,-finite(view?.cameraY,0)*zoom)};
};
/** Exact inverses, including the final snapped raster origin. */
export function surfaceCanvasToWorld(x,y,view={}){
 const{zoom,offsetX,offsetY}=transform(view);return{x:(x-offsetX)/zoom,y:(y-offsetY)/zoom};
}
export function surfaceWorldToCanvas(x,y,view={}){
 const{zoom,offsetX,offsetY}=transform(view);return{x:x*zoom+offsetX,y:y*zoom+offsetY};
}
