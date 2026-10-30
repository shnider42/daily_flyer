// End-to-end Glasshouse co-op checks. The host uses real browser controls and
// the teammate sends normal protocol messages. Authoritative state is observed
// for timing; no positions, equipment, enemies, or progression are injected.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { createBreachServer } from '../server/breach-server.mjs';

const out = 'breach-glasshouse-results';
await mkdir(out, { recursive: true });
const app = createBreachServer();
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--disable-webgl'] });
const context = await browser.newContext({ viewport: { width: 926, height: 428 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await context.newPage();
let guest, stream, room, run, lastGuestState, guestRoom, guestSeq = 0, guestFire = false;
const results = [], errors = [], guestPackets = [];
page.on('pageerror', error => errors.push(error.message));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await sleep(25); }
  throw new Error(message);
}
const host = () => run.state.players.p1;
const partner = () => run.state.players.p2;
const send = message => guest.send(JSON.stringify(message));
const mode = value => page.waitForFunction(expected => document.body.dataset.mode === expected, value);

// Shortest cardinal path over the current authored floor and door state.
function routeTo(goal) {
  const { width, height, grid } = run.level;
  const start = [Math.floor(host().x), Math.floor(host().z)], end = [Math.floor(goal.x), Math.floor(goal.z)];
  const key = (x, z) => z * width + x, startKey = key(...start), endKey = key(...end);
  const blocked = (x, z) => x < 0 || z < 0 || x >= width || z >= height || grid[z][x] === '#'
    || run.state.doors.some(d => !d.open && Math.floor(d.x) === x && Math.floor(d.z) === z);
  const queue = [start], previous = new Map([[startKey, null]]);
  for (let cursor = 0; cursor < queue.length && !previous.has(endKey); cursor++) {
    const [x, z] = queue[cursor];
    for (const [nx, nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]) {
      const nextKey = key(nx, nz);
      if (blocked(nx, nz) || previous.has(nextKey)) continue;
      previous.set(nextKey, key(x,z)); queue.push([nx,nz]);
    }
  }
  assert.ok(previous.has(endKey), `reachable floor route to ${goal.x},${goal.z}`);
  const cells = [];
  for (let current = endKey; current !== null; current = previous.get(current)) cells.push({ x: current % width + .5, z: Math.floor(current / width) + .5 });
  cells.reverse();
  const turns = [];
  for (let i = 1; i < cells.length; i++) {
    if (i === cells.length - 1 || cells[i+1].x-cells[i].x !== cells[i].x-cells[i-1].x || cells[i+1].z-cells[i].z !== cells[i].z-cells[i-1].z) turns.push(cells[i]);
  }
  if (!turns.length) turns.push(goal);
  return turns;
}
async function moveAxis(axis, target) {
  for (let correction = 0; correction < 3 && Math.abs(host()[axis] - target) > .24; correction++) {
    const direction = Math.sign(target - host()[axis]);
    const key = axis === 'x' ? direction > 0 ? 'd' : 'a' : direction > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    try {
      await until(() => direction * (target - host()[axis]) <= .22 || run.state.status !== 'playing', `host must walk ${axis} to ${target}`, 16000);
    } finally { await page.keyboard.up(key); }
    await until(() => room.players.get('p1').input.forward === 0 && room.players.get('p1').input.strafe === 0, 'released movement must reach the server');
    assert.equal(run.state.status, 'playing', 'safe introduction route stays playable');
  }
  assert.ok(Math.abs(host()[axis] - target) < .45, `stopped near ${axis}=${target}`);
}
async function walk(goal) {
  const points = routeTo(goal);
  for (const point of points) {
    // Align the short component before taking the long straight corridor.
    const axes = Math.abs(host().x-point.x) < Math.abs(host().z-point.z) ? ['x','z'] : ['z','x'];
    for (const axis of axes) await moveAxis(axis, point[axis]);
  }
}
async function equip(id) {
  await page.locator(`[data-weapon="${id}"]`).tap();
  await until(() => host().weapon === id, `bottom selector must equip ${id} on the server`);
  await page.waitForFunction(weapon => document.querySelector(`[data-weapon="${weapon}"]`).getAttribute('aria-pressed') === 'true', id);
  await until(() => run._playerRuntime.p1.shotCooldown === 0, `switch cooldown must finish before firing ${id}`);
}
async function layout(name) {
  const view = await page.evaluate(() => {
    const bounds = element => { const r = element.getBoundingClientRect(); return { id: element.id || element.dataset.weapon, x:r.x, y:r.y, width:r.width, height:r.height }; };
    return { width:innerWidth, height:innerHeight, overflow:document.documentElement.scrollWidth>innerWidth,
      swap:!!document.getElementById('touch-weapon'),
      guns:[...document.querySelectorAll('[data-weapon]')].filter(el=>!el.hidden).map(bounds),
      controls:['fire-pad','move-zone','touch-interact','pause','map-toggle'].map(id=>document.getElementById(id)).filter(el=>!el.hidden).map(bounds) };
  });
  assert.equal(view.swap, false); assert.equal(view.overflow, false); assert.ok(view.guns.length >= 4);
  for (const control of [...view.guns, ...view.controls]) {
    assert.ok(control.width >= 44 && control.height >= 44, `${name}: ${control.id} keeps a 44px target`);
    assert.ok(control.x >= -1 && control.y >= -1 && control.x+control.width <= view.width+1 && control.y+control.height <= view.height+1, `${name}: ${control.id} fits the screen`);
  }
  const overlaps = (a,b) => a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
  for (const gun of view.guns) for (const control of view.controls) assert.equal(overlaps(gun,control),false,`${name}: ${gun.id} does not overlap ${control.id}`);
  for (let i=0;i<view.controls.length;i++) for (let j=i+1;j<view.controls.length;j++) assert.equal(overlaps(view.controls[i],view.controls[j]),false,`${name}: ${view.controls[i].id} does not overlap ${view.controls[j].id}`);
  await page.screenshot({ path:`${out}/${name}.png` });
  results.push({ check:`${name}: four carried guns fit without SWAP or control overlap`, passed:true });
}

try {
  await page.goto(base+'/?mission=glasshouse-17');
  await page.waitForFunction(() => !document.getElementById('start').disabled);
  assert.match(await page.locator('#mission-title').innerText(), /GLASSHOUSE/);
  await page.locator('#open-settings').tap();
  await page.locator('#setting-quality').selectOption('low');
  await page.locator('#setting-touch-preset').selectOption('compact');
  await page.locator('#setting-guidance').selectOption('expert');
  await page.locator('#setting-sound').setChecked(false);
  await page.locator('#done-settings').tap();
  await page.locator('#open-coop').tap();
  await page.getByLabel('YOUR CALL SIGN').fill('Glasshouse QA');
  await page.getByLabel('CO-OP MISSION').selectOption('glasshouse-17');
  await page.getByRole('button',{name:'CREATE PRIVATE ROOM'}).tap();
  await page.waitForFunction(() => /^[A-Z0-9]{8}$/.test(document.getElementById('room-id').textContent));
  const roomId = await page.locator('#room-id').innerText();
  guest = new WebSocket(base.replace('http:','ws:')+'/ws',{headers:{Origin:base}});
  guest.on('message',data=>{const packet=JSON.parse(data);guestPackets.push(packet);if(packet.type==='state')lastGuestState=packet.state;if(packet.type==='room')guestRoom=packet.room;});
  await new Promise(resolve=>guest.once('open',resolve));
  send({type:'join',protocol:2,roomId,name:'Garden teammate',supportedMissions:['glasshouse-17']});
  await until(()=>guestRoom?.players.length===2,'second operator joins Glasshouse');
  send({type:'ready',ready:true}); await page.getByRole('button',{name:'I’M READY'}).tap();
  stream=setInterval(()=>{if(guest.readyState===WebSocket.OPEN&&guestRoom?.status==='playing')send({type:'input',seq:++guestSeq,forward:0,strafe:0,angle:0,fire:guestFire});},33);
  await page.getByRole('button',{name:'START THE GLASSHOUSE'}).tap(); await mode('playing');
  room=app.rooms.rooms.get(roomId);run=room.game;
  assert.equal(run.level.missionId,'glasshouse-17');
  results.push({check:'browser lobby advertises Glasshouse and starts its shared world',passed:true});

  await walk({x:12.5,z:48.5});
  await until(()=>host().hasRicochet&&partner().hasRicochet,'practice rack shares Rebound with both operators');
  assert.ok(host().ammo.slugs>0&&partner().ammo.slugs>0);
  await walk({x:23.5,z:47.5});
  await until(()=>host().hasShotgun&&partner().hasShotgun,'scattergun rack shares ownership');
  await walk({x:26.5,z:42.5});
  await page.keyboard.press('e');
  await until(()=>run.state.doors.find(d=>d.id==='arrival').open,'arrival door opens through the interaction command');
  await walk({x:20.5,z:36.5});
  await page.keyboard.press('e');
  await until(()=>run.state.power,'power is restored by normal player interaction');
  assert.ok(run.state.checkpoint);
  await walk({x:31.5,z:36.5});
  await until(()=>host().hasGrenade&&partner().hasGrenade,'powered Thumper rack shares both ownership and starter ammo');
  assert.ok(host().ammo.grenades>0&&partner().ammo.grenades>0);
  results.push({check:'real traversal acquires both new weapons for both players and restores power/checkpoint',passed:true});

  await equip('ricochet'); send({type:'weapon',weapon:'grenade'});
  await until(()=>partner().weapon==='grenade','teammate selects Thumper directly');
  assert.equal(host().weapon,'ricochet');
  const hostSlugs=host().ammo.slugs,guestGrenades=partner().ammo.grenades;
  const eventStart=guestPackets.length;
  await page.locator('#fire-pad').tap();
  await until(()=>host().ammo.slugs===hostSlugs-1,'tap spends exactly one host slug');
  guestFire=true;
  await until(()=>partner().ammo.grenades===guestGrenades-1,'teammate independently launches a grenade');
  guestFire=false;
  await until(()=>run.state.projectiles.some(p=>p.type==='grenade'),'the shared world contains a real grenade projectile');
  await until(()=>guestPackets.slice(eventStart).some(packet=>packet.events?.some(event=>event.type==='explosion')),'grenade fuse produces a replicated explosion');
  assert.equal(host().ammo.slugs,hostSlugs-1);assert.equal(partner().ammo.grenades,guestGrenades-1);
  assert.equal(host().weapon,'ricochet');assert.equal(partner().weapon,'grenade');
  results.push({check:'independent exact selection, ammunition, ricochet fire, and grenade explosion replicate',passed:true});

  await equip('grenade');
  const hostGrenades=host().ammo.grenades;
  await page.locator('#fire-pad').tap();
  await until(()=>host().ammo.grenades===hostGrenades-1,'phone tap launches the host Thumper');
  await until(()=>!run.state.projectiles.some(p=>p.type==='grenade'),'launched grenades finish on their fuse');
  await layout('glasshouse-phone-landscape');
  await page.setViewportSize({width:428,height:926});
  await layout('glasshouse-phone-portrait');

  await page.locator('#pause').tap(); await mode('paused');
  const runIdentity=run,ammoBefore=host().ammo.grenades,previousPeer=room.players.get('p1').peer;
  await page.getByRole('button',{name:'RECONNECT WITHOUT LEAVING'}).tap();
  await until(()=>room.players.get('p1').peer && room.players.get('p1').peer!==previousPeer,'reconnect must replace the host transport');
  await page.waitForFunction(()=>document.getElementById('coop-network-detail').textContent.includes('CONNECTED'));
  assert.equal(app.rooms.rooms.get(roomId).game,runIdentity);
  assert.equal(host().hasGrenade,true);assert.equal(host().hasRicochet,true);assert.equal(host().ammo.grenades,ammoBefore);
  assert.equal(run.state.power,true);assert.equal(run.state.status,'paused');
  send({type:'resume'});await page.locator('#resume').tap();await mode('playing');
  await equip('pistol');assert.equal(partner().weapon,'grenade');
  results.push({check:'reconnect retains both new weapons, ammunition, checkpoint progress and independent selection',passed:true});
  assert.deepEqual(errors,[]);
  await page.locator('#pause').tap();await mode('paused');
  await page.getByRole('button',{name:'LEAVE ROOM',exact:true}).tap();
  await until(()=>app.rooms.rooms.size===0,'temporary Glasshouse room is cleaned up');
  await writeFile(`${out}/results.json`,JSON.stringify({passed:results.length,results},null,2));
  console.log(JSON.stringify({passed:results.length,results},null,2));
} catch(error) {
  await writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,completed:results,room:room&&{status:room.status,pauseReason:room.pauseReason},host:run?.state.players.p1,guest:run?.state.players.p2,guestErrors:guestPackets.filter(p=>p.type==='error')},null,2));
  await page.screenshot({path:`${out}/failure.png`,timeout:5000}).catch(()=>{});
  throw error;
} finally {
  clearInterval(stream);guest?.terminate();await browser.close();await app.close();
}
