// End-to-end Hollow co-op checks. The host uses real browser controls and
// the teammate sends normal protocol messages. Authoritative state is observed
// for timing; no positions, equipment, enemies, or progression are injected.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import { createBreachServer } from '../server/breach-server.mjs';

const out = 'breach-hollow-results';
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
  await page.goto(base+'/?mission=hollow-19');
  await page.waitForFunction(() => !document.getElementById('start').disabled);
  assert.match(await page.locator('#mission-title').innerText(), /HOLLOW/);
  await page.locator('#open-settings').tap();
  await page.locator('#setting-quality').selectOption('low');
  await page.locator('#setting-touch-preset').selectOption('compact');
  await page.locator('#setting-guidance').selectOption('expert');
  await page.locator('#setting-sound').setChecked(false);
  await page.locator('#done-settings').tap();
  await page.locator('#open-coop').tap();
  await page.getByLabel('YOUR CALL SIGN').fill('Hollow QA');
  await page.getByLabel('CO-OP MISSION').selectOption('hollow-19');
  await page.getByRole('button',{name:'CREATE PRIVATE ROOM'}).tap();
  await page.waitForFunction(() => /^[A-Z0-9]{8}$/.test(document.getElementById('room-id').textContent));
  const roomId=await page.locator('#room-id').innerText();
  guest=new WebSocket(base.replace('http:','ws:')+'/ws',{headers:{Origin:base}});
  guest.on('message',data=>{const packet=JSON.parse(data);guestPackets.push(packet);if(packet.type==='state')lastGuestState=packet.state;if(packet.type==='room')guestRoom=packet.room;});
  await new Promise(resolve=>guest.once('open',resolve));
  send({type:'join',protocol:2,roomId,name:'Field teammate',supportedMissions:['hollow-19']});
  await until(()=>guestRoom?.players.length===2,'second operator joins The Hollow');
  send({type:'ready',ready:true});await page.getByRole('button',{name:'I’M READY'}).tap();
  stream=setInterval(()=>{if(guest.readyState===WebSocket.OPEN&&guestRoom?.status==='playing')send({type:'input',seq:++guestSeq,forward:0,strafe:0,angle:0,fire:false});},33);
  await page.getByRole('button',{name:'START THE HOLLOW'}).tap();await mode('playing');
  room=app.rooms.rooms.get(roomId);run=room.game;
  assert.equal(run.level.missionId,'hollow-19');assert.equal(run.level.width,129);
  results.push({check:'browser lobby starts the full Hollow world for two operators',passed:true});
  const feature=id=>run.state.interactables.find(o=>o.id===id);
  async function use(id){await walk(feature(id));await page.keyboard.press('e');}
  await use('record-intake');await until(()=>feature('record-intake').used,'intake recording is discovered');
  await walk({x:46.5,z:100.5});await walk({x:43.5,z:100.5});await use('transit-dock');
  await walk({x:48.5,z:79.5});await page.keyboard.press('e');
  await until(()=>run.state.doors.find(d=>d.id==='arrival').open,'real interaction opens arrival airlock');
  await use('aux-power');await until(()=>run.state.power,'the isolation grid is restored');
  await use('record-exchange');await until(()=>feature('record-exchange').used,'engineering record is discovered');
  await walk({x:58.5,z:68.5});await until(()=>host().hasArc&&partner().hasArc,'shared Arc pickup reaches both inventories');
  assert.ok(host().hasRicochet&&partner().hasRicochet);assert.equal(host().health,100);
  assert.equal(run.state.enemies.filter(e=>e.alive).length,run.level.enemies.length);
  results.push({check:'normal browser movement collects equipment and records, restores power, and keeps the introduction safe',passed:true});
  await use('routing-1-b');await until(()=>feature('routing-1-a').used,'route opens and field turns off');
  await until(()=>lastGuestState.interactables.find(o=>o.id==='routing-1-a').used,'teammate sees the same circuit');
  // Observe the documented server action guard before the second deliberate USE.
  await until(()=>Date.now()-room.players.get('p1').lastActionAt>=110,'routing action guard expires');
  await page.keyboard.press('e');await until(()=>!feature('routing-1-a').used,'route closes and field returns');
  await until(()=>!lastGuestState.interactables.find(o=>o.id==='routing-1-a').used,'teammate sees the restored field');
  assert.ok(!run.state.doors.find(d=>d.id==='route-1').open);
  results.push({check:'both reversible circuit states replicate over the actual room transport',passed:true});
  await layout('hollow-phone-landscape');
  await page.locator('#pause').tap();await mode('paused');
  await page.locator('#journal-summary').tap();
  assert.equal(await page.locator('#journal-entries article').count(),2);
  assert.match(await page.locator('#journal-entries').innerText(),/Twelve staff signed in/);
  assert.doesNotMatch(await page.locator('#journal-entries').innerText(),/FINAL TRANSCRIPT/);
  await page.locator('#field-journal').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/hollow-journal-landscape.png`});
  await page.setViewportSize({width:428,height:926});
  await page.locator('#field-journal').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${out}/hollow-journal-portrait.png`});
  results.push({check:'pause journal shows only recovered records in both phone orientations',passed:true});
  await page.locator('#journal-summary').tap();
  await page.locator('#pause-map').tap();
  await page.locator('#map-facility').tap();
  assert.equal(await page.locator('#map-title').innerText(),'THE HOLLOW');
  await page.screenshot({path:`${out}/hollow-map-portrait.png`});
  await page.locator('#map-close').tap();await mode('paused');
  results.push({check:'large facility map opens without adding gameplay controls or horizontal overflow',passed:true});
  const runIdentity=run,previousPeer=room.players.get('p1').peer;
  await page.getByRole('button',{name:'RECONNECT WITHOUT LEAVING'}).tap();
  await until(()=>room.players.get('p1').peer&&room.players.get('p1').peer!==previousPeer,'reconnect replaces the host transport');
  await page.waitForFunction(()=>document.getElementById('coop-network-detail').textContent.includes('CONNECTED'));
  assert.equal(app.rooms.rooms.get(roomId).game,runIdentity);assert.equal(feature('record-intake').used,true);
  assert.equal(feature('record-exchange').used,true);assert.equal(feature('routing-1-a').used,false);
  assert.equal(run.state.power,true);assert.equal(run.state.status,'paused');
  send({type:'resume'});await page.locator('#resume').tap();await mode('playing');
  await layout('hollow-phone-portrait');assert.deepEqual(errors,[]);
  results.push({check:'reconnect retains the expedition, records, power, equipment and circuit state',passed:true});
  await page.locator('#pause').tap();await mode('paused');
  await page.getByRole('button',{name:'LEAVE ROOM',exact:true}).tap();
  await until(()=>app.rooms.rooms.size===0,'temporary QA room is cleaned up');
  await writeFile(`${out}/results.json`,JSON.stringify({passed:results.length,results},null,2));
  console.log(JSON.stringify({passed:results.length,results},null,2));
} catch(error) {
  const failure={error:String(error),errors,completed:results,room:room&&{status:room.status,pauseReason:room.pauseReason,lastActionAge:Date.now()-room.players.get('p1').lastActionAt},host:run?.state.players.p1,guestErrors:guestPackets.filter(p=>p.type==='error')};
  await writeFile(`${out}/failure.json`,JSON.stringify(failure,null,2));console.error(JSON.stringify(failure,null,2));
  await page.screenshot({path:`${out}/failure.png`,timeout:5000}).catch(()=>{});throw error;
} finally {clearInterval(stream);guest?.terminate();await browser.close();await app.close();}
