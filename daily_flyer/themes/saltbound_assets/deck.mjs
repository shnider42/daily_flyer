import { SHIPS, STATIONS, DIFFICULTIES, compass } from './catalog.mjs';

export function emptyWatch() {
  return {distance:0,volleys:0,buckets:0,treatments:0,repairs:0,signals:0};
}
export const stationOrder = ['helm','guns','medic','mast'];
export function occupant(game, role) {
  return game.players.find(p => p.aboard && !p.down && p.connected && p.station === role);
}
export function takeStation(game,p,role) {
  if (!p || !p.aboard || p.down || !Object.hasOwn(STATIONS,role)) return false;
  const owner = role==='holding' ? null : occupant(game,role);
  if (owner && owner.id!==p.id) return false;
  if (game.ship.helm===p.id) game.ship.helm=null;
  if (game.ship.bucket?.owner===p.id && role!=='medic') game.ship.bucket=null;
  p.station=role;
  p.preferredStation=role;
  if (role==='helm') game.ship.helm=p.id;
  return true;
}
export function releaseStation(game,p) {
  if (game.ship.helm===p.id) game.ship.helm=null;
  if (game.ship.bucket?.owner===p.id) game.ship.bucket=null;
  p.station='holding';
}
export function canWork(game,p,role) {
  if (!p?.aboard || p.down || !p.connected || p.station==='holding') return false;
  if (p.station===role) return true;
  if (p.station!=='helm') return false;
  if (!game.campaign) return true;
  return role==='guns' && SHIPS[game.ship.type].compact && !occupant(game,'guns');
}
export function bucketFill(game) {
  if (!game.ship.bucket) return 0;
  const phase=Math.max(0,game.time-game.ship.bucket.start)%2;
  return 1-Math.abs(1-phase);
}
export function bail(game,p) {
  const ship=game.ship;
  if (!canWork(game,p,'medic') || ship.water<=0) return false;
  if (!ship.bucket) {
    ship.bucket={owner:p.id,start:game.time};
    return true;
  }
  if (ship.bucket.owner!==p.id) return false;
  const fill=bucketFill(game);
  const full=fill>=.64 && fill<=.92;
  const removed=Math.min(ship.water,SHIPS[ship.type].pump*(full?1:fill*.5));
  ship.water=Math.max(0,ship.water-removed);
  ship.bucket=null;
  if(removed>0)p.watch.buckets++;
  p.actionCd=.35;
  game.message=(full?'Full bucket':'Partial bucket')+' · '+Math.ceil(removed)+'% water bailed.';
  return true;
}
export function treat(game,p) {
  if (!canWork(game,p,'medic') || game.ship.meds<=0) return false;
  const patient=game.players.filter(q=>q.aboard && q.hp<q.maxHp)
    .sort((a,b)=>Number(b.down)-Number(a.down) || a.hp/a.maxHp-b.hp/b.maxHp)[0];
  if (!patient) return false;
  patient.down=false;
  patient.hp=Math.min(patient.maxHp,patient.hp+55);
  game.ship.meds--;p.watch.treatments++;
  p.actionCd=.8;
  game.message=p.name+' treated '+patient.name+'.';
  game.emit('repair',patient.x,patient.y);
  return true;
}
export function scan(game,p) {
  if (!canWork(game,p,'mast') || game.time<game.ship.scanAt) return false;
  const ship=game.ship,range=SHIPS[ship.type].sight;
  const contacts=game.hostiles.filter(h=>h.hp>0 && Math.hypot(h.x-ship.x,h.y-ship.y)<=range)
    .sort((a,b)=>Math.hypot(a.x-ship.x,a.y-ship.y)-Math.hypot(b.x-ship.x,b.y-ship.y));
  ship.scanAt=game.time+3;
  if (!contacts.length) {
    game.message='Lookout reports clear water within mast range.';
    return true;
  }
  const last=contacts.findIndex(h=>h.id===ship.mark?.id);
  const target=contacts[(last+1)%contacts.length];
  ship.mark={id:target.id,x:target.x,y:target.y,until:game.time+22};
  game.score.spotted++;p.watch.signals++;
  game.message=p.name+' marked a pirate '+target.type+' to the '+compass(ship,target)+'.';
  return true;
}
export function tickDeck(game,dt) {
  const ship=game.ship;
  if (ship.leaks) ship.water=Math.min(100,ship.water+dt*ship.leaks*DIFFICULTIES[game.difficulty].flood*.75);
  if (ship.water>=95) {
    ship.hp=Math.max(0,ship.hp-ship.maxHp*.012*dt);
    if (!ship.hp) game.finish(false,'The flooded ship slipped under. The haul is lost.');
  }
  if (ship.bucket && game.time-ship.bucket.start>5) ship.bucket=null;
  if (!ship.mark) return;
  const target=game.hostiles.find(h=>h.id===ship.mark.id && h.hp>0);
  if (!target || game.time>=ship.mark.until) ship.mark=null;
  else Object.assign(ship.mark,{x:target.x,y:target.y});
}
