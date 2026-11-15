import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import {atmosphereFor} from '../public/atmosphere.mjs';
import {FlightRenderer} from '../public/renderer.mjs';
import {SoftwareFlightRenderer} from '../public/software.mjs';

test('daylight biomes and the four lighting phases keep distinct tones',()=>{
  const day=atmosphereFor({biome:'pacific'}),desert=atmosphereFor({biome:'desert'});
  assert.notEqual(day.fog,desert.fog);
  assert.notDeepEqual(day.ground,desert.ground);
  const phases=['day','dawn','dusk','night'].map(timeOfDay=>atmosphereFor({biome:'pacific',weather:{timeOfDay}}));
  assert.equal(new Set(phases.map(p=>p.horizon)).size,4);
  assert.equal(new Set(phases.map(p=>p.cloud)).size,4);
  assert.ok(phases[1].direction[0]<0&&phases[2].direction[0]>0);
  assert.ok(phases[3].sunIntensity<phases[0].sunIntensity);
  assert.equal(atmosphereFor({biome:'night',weather:{timeOfDay:'dawn'}}).name,'night');
});

test('both renderers use the same lighting and cloud color without adding geometry',()=>{
  const mission={id:'island-evening',biome:'pacific',weather:{timeOfDay:'dusk'}};
  const web=Object.create(FlightRenderer.prototype);
  Object.assign(web,{scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),hemi:new THREE.HemisphereLight(),
    settings:{quality:'low'},worldCenter:{x:0,z:0},worldSize:52000,_world:new THREE.Group()});
  web.scene.fog=new THREE.Fog('#c8d2c5',1300,19000);
  web._buildSky();web._setAtmosphere(mission);web._buildClouds(mission);

  const noop=()=>{},ctx={setTransform:noop};
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:1280,height:720})};
  const software=new SoftwareFlightRenderer(canvas,{quality:'low'});
  software.loadMission(mission,'f16');
  assert.deepEqual(software.palette,web.palette);
  const sky=web.skyMaterial.uniforms;
  assert.ok(software._sunDirection.distanceTo(sky.sunDirection.value)<1e-12);
  assert.ok(web.sun.position.clone().normalize().distanceTo(software._sunDirection)<1e-12);
  assert.equal(sky.horizon.value.getHexString(),web.palette.horizon.slice(1));
  assert.equal(web.scene.fog.color.getHexString(),web.palette.fog.slice(1));
  assert.equal(web._clouds.material.color.getHexString(),web.palette.cloud.slice(1));
  assert.equal(web.scene.children.length,1,'a single sky mesh shades the background');
  assert.equal(web._world.children.length,1,'the existing batched cloud draw is reused');
  assert.equal(web._clouds.count,140);
  assert.equal(software._clouds.length,84);
  software.dispose();
});
