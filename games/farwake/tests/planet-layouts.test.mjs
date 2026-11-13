import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildGalaxy} from '../dist/engine.mjs';
import {PLANET_TYPES} from '../dist/world-types.mjs';
import {PLANET_LAYOUTS,PLANET_LAYOUT_VERSION,planetSettlementPlan} from '../dist/planet-layout.mjs';
import {generateSurface,isWalkable,TILE} from '../dist/surface.mjs';
import {reconcileSurfacePosition} from '../dist/surface-position.mjs';
import {explorationSites} from '../dist/exploration.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function reachable(surface) {
  const index = p => Math.floor(p.y / 24) * surface.cols + Math.floor(p.x / 24);
  const queue = [index(surface.spawn)], seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i], x = n % surface.cols, y = Math.floor(n / surface.cols);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const xx = x + dx, yy = y + dy, k = yy * surface.cols + xx;
      if (xx < 0 || yy < 0 || xx >= surface.cols || yy >= surface.rows || seen.has(k) || !isWalkable(surface, (xx + .5) * 24, (yy + .5) * 24)) continue;
      seen.add(k); queue.push(k);
    }
  }
  for (const entity of [surface.spawn, ...surface.entities]) {
    assert.ok(isWalkable(surface,entity.x,entity.y),`${surface.id}/${entity.id || 'spawn'}: standing point`);
    assert.ok(seen.has(index(entity)),`${surface.id}/${entity.id || 'spawn'}: return route`);
  }
  return seen;
}

test('worlds of one type have different landing districts, service relationships and first-view geography', () => {
  const districts = new Set(), relationships = new Set(), firstViews = new Set();
  for (let i = 0; i < 16; i++) {
    const body = {id:`garden-neighbor-${i}`,kind:'planet',biome:'temperate',planetTypeId:'garden'}, surface = generateSurface(body,'neighboring-gardens');
    districts.add(surface.settlementId);
    relationships.add(JSON.stringify(['mechanic','medic','jobs','story'].map(id => {
      const e = surface.entities.find(value => value.id === `${body.id}:${id}`);
      return [e.x-surface.spawn.x,e.y-surface.spawn.y];
    })));
    const x = Math.floor(surface.spawn.x/24), y = Math.floor(surface.spawn.y/24);
    firstViews.add(digest(Array.from({length:15},(_,dy)=>Array.from({length:21},(_,dx)=>surface.tiles[y+dy-7]?.[x+dx-10] ?? TILE.VOID))));
    assert.deepEqual(surface,generateSurface(body,'neighboring-gardens'));
    assert.ok(surface.settlementDescription.length>50);
  }
  assert.ok(districts.size >= 2, 'a planet type supports more than one settlement topology');
  assert.ok(relationships.size >= 14, 'services must move relative to the landing, beyond renaming or recoloring');
  assert.ok(firstViews.size >= 12, 'arrival views already show the different arrangements');
});

test('all regional plans retain reachable services, work and site doors over generated worlds and size classes', () => {
  const seed = 'regional-layout-regression', galaxy = buildGalaxy(seed), selected = new Map();
  for (const system of galaxy.filter(s=>!s.authored)) for (const body of system.bodies.filter(b=>b.kind==='planet')) {
    const key = planetSettlementPlan(body,seed).id;
    if (!selected.has(key)) selected.set(key,{...body,systemId:system.id});
  }
  assert.equal(selected.size,PLANET_LAYOUTS.length);
  for (const body of selected.values()) for (const sizeClass of ['moon','terrestrial','supermassive']) {
    const surface = generateSurface({...body,sizeClass},seed);
    reachable(surface);
    assert.equal(new Set(surface.entities.map(e=>e.id)).size,surface.entities.length);
    for (const role of ['mechanic','medic','bartender']) assert.ok(surface.entities.some(e=>e.role===role),`${body.id}/${role}`);
    for (const site of explorationSites(body,seed)) assert.ok(surface.entities.some(e=>e.id===`${body.id}:site:${site.id}`),`${body.id}/${site.id}`);
    const landing = surface.entities.find(e=>e.type==='exit'), passage = surface.entities.find(e=>e.data.serviceDesk==='passage'), medic = surface.entities.find(e=>e.type==='medic'), publicDesk = surface.entities.find(e=>e.data.professionDesk);
    assert.ok(Math.hypot(passage.x-landing.x,passage.y-landing.y)<400*surface.regionScale,'passage desk follows the landing');
    assert.ok(Math.hypot(publicDesk.x-medic.x,publicDesk.y-medic.y)<220*surface.regionScale,'public service desk follows the clinic');
  }
});

test('regional descriptions and geography stay deterministic without mutating bodies or shared catalog plans', () => {
  for (const type of PLANET_TYPES) {
    const body = {id:`immutable-${type.id}`,kind:'planet',biome:type.biome,planetTypeId:type.id}, original=structuredClone(body), plan=planetSettlementPlan(body,'stable-plans');
    assert.equal(plan.version,PLANET_LAYOUT_VERSION);assert.deepEqual(body,original);
    const copy=JSON.parse(JSON.stringify(plan));assert.deepEqual(copy,plan);
    copy.anchors.landing.x=-100;copy.links[0][0]='changed';
    assert.deepEqual(planetSettlementPlan(body,'stable-plans'),plan);
  }
  assert.ok(Object.isFrozen(PLANET_LAYOUTS[0].anchors));
});

test('planet layout migration runs once and preserves authored Morrow and preflight layouts', () => {
  const body={id:'returning-captain',kind:'planet',biome:'ocean',planetTypeId:'archipelago'},surface=generateSurface(body,'returning-world');
  const person={x:252,y:636,health:67,carrying:true,surfaceLayoutVersion:`${body.id}:place-1:archipelago:108x80`};
  assert.equal(reconcileSurfacePosition(person,surface),true);assert.deepEqual([person.x,person.y],[surface.spawn.x,surface.spawn.y]);
  assert.equal(person.health,67);assert.equal(person.carrying,true);
  assert.equal(reconcileSurfacePosition(person,surface),false);
  for (const id of ['morrow','reedbank']) {
    const preserved=generateSurface(id,'returning-world');assert.ok(!preserved.settlementId);assert.ok(!preserved.layoutVersion.includes('settlement-'));
    assert.equal(planetSettlementPlan({id},'returning-world').version,0);
  }
  const moon=generateSurface({id:'uncrewed-moon',kind:'moon',biome:'barren'},'returning-world');
  assert.equal(moon.barren,true);assert.ok(moon.layoutVersion.includes('settlement-'));
  assert.ok(!moon.entities.some(e=>e.data.serviceDesk||['mechanic','medic','npc','jobboard'].includes(e.type)));reachable(moon);
});
