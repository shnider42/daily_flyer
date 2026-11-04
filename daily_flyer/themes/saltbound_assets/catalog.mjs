// Ship handling and station rules use the same hull specification on both peers.
export const SHIPS = {
  sloop: { name:'Weathered sloop', price:0, hp:360, speed:265, turn:2.2, capacity:8, cannons:2, reload:2.9, size:.97, draft:35, sight:2150, compact:true, pump:28, sail:'#f4e8c1', desc:'The helm can cover an empty gun deck. Easy beach landings.' },
  yawl: { name:'Needlefish yawl', price:215, hp:250, speed:345, turn:3.3, capacity:5, cannons:1, reload:1.65, size:.76, draft:18, sight:1900, compact:true, pump:34, sail:'#d4e8c4', desc:'A shallow-draft scout with a fast swivel gun and a small hold.' },
  cutter: { name:'Reef runner', price:650, hp:450, speed:320, turn:2.5, capacity:12, cannons:2, reload:2.5, size:1.03, draft:30, sight:2450, compact:true, pump:26, sail:'#dce9e0', desc:'A quick courier. Its helmsman can cover an empty gun deck.' },
  schooner: { name:'Trade Wind schooner', price:1050, hp:465, speed:350, turn:2.05, capacity:15, cannons:2, reload:2.7, size:1.16, draft:40, sight:3400, compact:true, pump:24, sail:'#b4d8c2', desc:'Fast passage and an excellent lookout mast for scouting cargo routes.' },
  gunboat: { name:'Cinder gunboat', price:1400, hp:590, speed:225, turn:2.15, capacity:8, cannons:3, reload:2.25, size:1.13, draft:38, sight:2200, compact:false, pump:23, sail:'#d5ab94', desc:'Quick volleys and a dedicated gunnery station. Limited cargo space.' },
  brig: { name:'Iron Gull brig', price:1900, hp:720, speed:245, turn:1.6, capacity:18, cannons:3, reload:3.0, size:1.25, draft:50, sight:2900, compact:false, pump:21, sail:'#efdfb7', desc:'A deep hold and a heavy battery. Needs a gunner for broadsides.' },
  frigate: { name:'Admiral’s frigate', price:2850, hp:890, speed:236, turn:1.35, capacity:20, cannons:4, reload:3.5, size:1.42, draft:60, sight:3650, compact:false, pump:19, sail:'#c4d3e2', desc:'Four guns per side and the tallest lookout mast. Slow to turn.' },
  galleon: { name:'Marigold galleon', price:3700, hp:1100, speed:195, turn:1.12, capacity:30, cannons:5, reload:4.1, size:1.58, draft:72, sight:3200, compact:false, pump:17, sail:'#e9c780', desc:'A treasure carrier with five guns per side. Its deep bilge takes more work to empty.' },
};

export const DIFFICULTIES = {
  relaxed: {name:'Fair winds', damage:.6, enemyReload:5, detection:900, minutes:22, payout:.85, flood:.65},
  normal: {name:'Corsair', damage:1, enemyReload:3.8, detection:1100, minutes:18, payout:1, flood:1},
  hard: {name:'Black flag', damage:1.35, enemyReload:3.3, detection:1300, minutes:16, payout:1.25, flood:1.15},
  gale: {name:'Gale warning', damage:1.55, enemyReload:2.9, detection:1480, minutes:14, payout:1.55, flood:1.4},
  maelstrom: {name:'Maelstrom', damage:1.85, enemyReload:2.5, detection:1650, minutes:12, payout:1.9, flood:1.7},
};

export const CHAPTERS = [
  {name:'First colors', brief:'Bring a Palmwater Cay chest through any passage.', bonus:125, check:g=>g.cargo.some(c=>c.island==='palm')},
  {name:'The rum ledger', brief:'Extract the marked ledger from Rumrunner’s Rest.', bonus:190, target:'rum', prize:'Rum ledger', check:g=>g.cargo.some(c=>c.contract==='Rum ledger')},
  {name:'Break the blockade', brief:'Sink a patrol ship and extract its salvaged strongbox.', bonus:260, check:g=>g.score.ships>0 && g.cargo.some(c=>c.salvage)},
  {name:'Signal from Sable', brief:'Mark a hostile ship from the mast and extract the lens from Sable Observatory.', bonus:340, target:'sable', prize:'Observatory lens', check:g=>g.score.spotted>0 && g.cargo.some(c=>c.contract==='Observatory lens')},
  {name:'The Marrow warrant', brief:'Defeat the captain at Fort Marrow and extract with the fort’s warrant.', bonus:440, target:'fort', prize:'Marrow warrant', check:g=>g.score.captains.includes('fort') && g.cargo.some(c=>c.contract==='Marrow warrant')},
  {name:'The king’s ransom', brief:'Take the royal seal from Dead King’s Crown, sink two patrols, and extract.', bonus:650, target:'crown', prize:'Royal seal', check:g=>g.score.ships>=2 && g.cargo.some(c=>c.contract==='Royal seal')},
];

export const STATIONS = {
  helm:{name:'Helm', hint:'Steer with the left stick or movement keys.'},
  guns:{name:'Guns', hint:'Fire the port or starboard battery.'},
  medic:{name:'Damage control', hint:'Patch leaks, bail the bilge, and treat your crew.'},
  mast:{name:'Mast', hint:'Scan for distant ships and share a bearing.'},
  holding:{name:'Holding', hint:'Stay aboard with your hands free to switch stations.'},
};

export function compass(from, to) {
  const angle = Math.atan2(to.x-from.x, from.y-to.y) * 180 / Math.PI;
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round((angle+360)/45)%8];
}
