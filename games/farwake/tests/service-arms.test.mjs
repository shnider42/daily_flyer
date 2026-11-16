import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {PERSONAL_WEAPONS,getPersonalWeapon,personalWeaponDamage} from '../dist/combat.mjs';
import {MILITARY_RECRUITER} from '../dist/military-content.mjs';
import {generateSurface} from '../dist/surface.mjs';
const ok=r=>assert.equal(r?.ok,true,r?.reason);
function enlist(faction='freewake'){
 const g=new Game('service-arms',{startMode:'hardcore'});g.state.professions.careers.military.enlisted=true;g.state.professions.careers.military.factionId=faction;g.issueServiceWeapon();
 const e={id:'test-armory',type:'armory',x:g.state.person.x,y:g.state.person.y,data:{factionId:faction}};
 g._surfaceForInteraction=()=>({kind:'planet',entities:[e]});return {g,e};
}
test('joining the Army physically issues its rifle, without taking credits or replacing an advanced personal weapon',()=>{
 const g=new Game('enlist-arms',{startMode:'hardcore'}),surface=generateSurface(g.currentBody,g.state.seed,g.state.flags),recruiter=surface.entities.find(e=>e.id===MILITARY_RECRUITER.id);
 Object.assign(g.state.person,{x:recruiter.x,y:recruiter.y});const credits=g.state.credits;
 ok(g.militaryCareerAction({action:'join',branchId:'army',entityId:recruiter.id}));assert.equal(getPersonalWeapon(g.state.person).id,'union-service-rifle');assert.equal(g.state.credits,credits);
 const restored=Game.fromSave(g.save());assert.equal(restored.state.person.ownedWeapons.filter(id=>id==='union-service-rifle').length,1);
 const {g:advanced}=enlist();advanced.state.person.ownedWeapons.push('breach-rifle');advanced.state.person.weapon='breach-rifle';advanced.issueServiceWeapon();assert.equal(advanced.state.person.weapon,'breach-rifle');
});
test('each faction grants its own issue, and specialist requisitions need real military work and a physical friendly armory',()=>{
 for(const faction of ['freewake','meridian']){
  const {g,e}=enlist(faction),weapons=PERSONAL_WEAPONS.filter(w=>w.factionId===faction),credits=g.state.credits;
  assert.equal(getPersonalWeapon(g.state.person).id,weapons[0].id);
  assert.equal(g.buyPersonalWeapon(weapons[1].id).code,'requirements');g.state.stats.jobs=999;assert.equal(g.buyPersonalWeapon(weapons[1].id).code,'requirements');
  g.state.professions.careers.military.completed=2;ok(g.buyPersonalWeapon(weapons[1].id));assert.equal(g.state.credits,credits);
  assert.equal(g.buyPersonalWeapon(weapons[2].id).code,'requirements');g.state.professions.careers.military.completed=5;
  e.x+=300;assert.equal(g.buyPersonalWeapon(weapons[2].id).ok,false);e.x-=300;ok(g.buyPersonalWeapon(weapons[2].id));
  const other=PERSONAL_WEAPONS.find(w=>w.factionId&&w.factionId!==faction);assert.equal(g.buyPersonalWeapon(other.id).code,'faction');
  const p=g.state.person;p.weaponReadyAt=999;g._boardingShotTimer=.9;ok(g.equipPersonalWeapon(weapons[0].id));assert.equal(p.weaponReadyAt,999);assert.equal(g._boardingShotTimer,.9);
  const save=g.save();assert.deepEqual(Game.fromSave(save).state.person.ownedWeapons,p.ownedWeapons);
 }
});
test('support weapons lose force with distance while precision rifles retain their penetration',()=>{
 const {g}=enlist(),p=g.state.person;p.ownedWeapons.push('union-support-repeater','union-longwatch');p.weapon='union-support-repeater';
 const near={x:p.x+10,y:p.y,armor:0},far={x:p.x+210,y:p.y,armor:0};assert.ok(personalWeaponDamage(p,near)>personalWeaponDamage(p,far));
 p.weapon='union-longwatch';assert.equal(personalWeaponDamage(p,{...far,armor:16}),68);
 assert.ok(getPersonalWeapon(p).range>300);assert.ok(getPersonalWeapon(p).cooldown>.9);
});
