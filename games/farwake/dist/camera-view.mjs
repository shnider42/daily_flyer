/** Presentation-only zoom. It never changes simulation coordinates or UI scale. */
import {pixelCamera} from './render-viewport.mjs';

export const WORLD_ZOOM = Object.freeze({min:.6,max:1.6,step:.05,default:1});
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const numeric=value=>typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;

export function normalizeWorldZoom(value,fallback=WORLD_ZOOM.default){
 const initial=numeric(value),backup=numeric(fallback),number=Number.isFinite(initial)?initial:Number.isFinite(backup)?backup:WORLD_ZOOM.default;
 const bounded=Math.max(WORLD_ZOOM.min,Math.min(WORLD_ZOOM.max,number));
 return Math.round((WORLD_ZOOM.min+Math.round((bounded-WORLD_ZOOM.min)/WORLD_ZOOM.step)*WORLD_ZOOM.step)*100)/100;
}

/** A surface camera is a top-left world origin, unlike the centered ship camera. */
export function surfaceCamera({x=0,y=0,worldWidth=1,worldHeight=1,width=1,height=1,zoom=1,cameraX,cameraY}={}){
 zoom=normalizeWorldZoom(zoom);width=Math.max(1,finite(width,1));height=Math.max(1,finite(height,1));
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
