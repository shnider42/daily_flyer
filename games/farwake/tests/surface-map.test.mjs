import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSurface,drawSurfaceMap} from '../dist/surface.mjs';
import {explorationLocation,createSiteState} from '../dist/exploration.mjs';
class MapContext{
 constructor(width=360,height=280){this.canvas={width,height};this.fills=[];this.imageSmoothingEnabled=true;}
 save(){}restore(){}setTransform(){}fillRect(x,y,w,h){this.fills.push({x,y,w,h,color:this.fillStyle});}
 drawImage(){throw Error('A local map must not allocate or copy a full-world raster.');}
 fillText(){throw Error('Map text belongs in the readable DOM legend.');}
}

test('local maps fit large terrain into a bounded crisp canvas, with accurate player and selected POI positions',()=>{
 const surface=generateSurface('morrow','map-test'),target=surface.entities.find(e=>e.data?.siteId==='northwatch'),person={...surface.spawn,facing:'right'},before=JSON.stringify({surface,person}),ctx=new MapContext();
 const view=drawSurfaceMap(ctx,surface,{person,targetEntityId:target.id,width:360,height:280});
 assert.equal(ctx.imageSmoothingEnabled,false);assert.ok(Number.isInteger(view.cell));assert.ok(view.offsetX>=view.padding&&view.offsetY>=view.padding);assert.ok(view.offsetX+view.mapWidth<=360-view.padding);assert.ok(view.offsetY+view.mapHeight<=280-view.padding);
 assert.deepEqual({x:view.player.x,y:view.player.y},{x:Math.round(view.offsetX+person.x*view.scale),y:Math.round(view.offsetY+person.y*view.scale)});
 const marked=view.markers.find(m=>m.selected);assert.equal(marked.id,target.id);assert.equal(marked.x,Math.round(view.offsetX+target.x*view.scale));assert.ok(view.markers.some(m=>m.kind==='exit'));
 assert.ok(ctx.fills.every(f=>[f.x,f.y,f.w,f.h].every(Number.isInteger)));assert.ok(ctx.fills.length<surface.cols*surface.rows,'tile runs avoid a full-world per-pixel render');assert.equal(JSON.stringify({surface,person}),before);
 const bounded=drawSurfaceMap(new MapContext(2000,2000),surface,{width:2000,height:2000});assert.equal(bounded.width,720);assert.equal(bounded.height,720);
});

test('site maps distinguish claimed supplies and alert wildlife while ship maps retain helm, airlock and crew stations',()=>{
 const location=explorationLocation({id:'morrow',kind:'planet',biome:'verdant'},'chalkfold','map-test'),surface=generateSurface(location,'map-test'),encounter=createSiteState(location.site);
 encounter.collected.push('field-kit');encounter.monsters[0].alert=true;const before=JSON.stringify({surface,encounter});
 const view=drawSurfaceMap(new MapContext(),surface,{exploration:encounter});assert.equal(view.markers.filter(m=>m.kind==='hostile').length,1);assert.equal(view.markers.find(m=>m.kind==='cache').done,true);assert.ok(view.markers.some(m=>m.kind==='record'));assert.ok(view.markers.some(m=>m.kind==='exit'));assert.equal(JSON.stringify({surface,encounter}),before);
 const ship=generateSurface({id:'ship:map',kind:'ship',shipClass:'capital'},'map-test'),shipView=drawSurfaceMap(new MapContext(400,300),ship);assert.equal(shipView.markers.filter(m=>m.kind==='exit').length,2);assert.ok(shipView.markers.some(m=>m.kind==='station'));assert.ok(shipView.markers.some(m=>m.kind==='bunk'));
});
