import { updateNpcLife } from './npc-life.mjs';

/** Use the physical room already being simulated, never a different port's map. */
export function liveInteractionSurface(game, fallback) {
  const live = game._surfaceForInteraction?.();
  if (live && fallback && live.id === fallback.id && !(live.systemId && fallback.systemId && live.systemId !== fallback.systemId)) return live;
  // Snapshot rules can be queried before the first person-mode render. Sample
  // that same authoritative clock instead of briefly reverting to spawn poses.
  const view = game.state?.npcLife;
  if (fallback && view?.surfaceId === fallback.id && Number.isFinite(view.time)) updateNpcLife(fallback,view.time,{holds:view.holds||[]});
  return fallback;
}

/** A walking resident may leave the visible 43px prompt during one network
 * transit. Check at most 150ms of their real route, with a 58px hard bound;
 * fixtures and remote contacts never receive a larger interaction radius. */
export function interactionInRange(game, surface, entity, range = 46) {
  const person = game.state?.person;
  if (!person || !entity) return false;
  const distance = () => Math.hypot(entity.x - person.x, entity.y - person.y);
  const current = distance();
  if (current <= range) return true;
  if (current > Math.min(58, range + 12) || !entity.life || !['npc', 'mechanic', 'medic'].includes(entity.type) || entity.data?.automated || (!game._sharedWorld && !game.state.multiplayer?.serverAuthoritative)) return false;
  const view = game.state.npcLife, time = game._npcTime?.() ?? view?.time;
  if (!Number.isFinite(time) || !surface?.entities?.includes(entity)) return false;
  const holds = game._npcHoldsForInteraction?.() ?? (view?.surfaceId === surface.id ? view.holds || [] : []);
  const pause = holds.find(hold => hold.id === entity.id && time >= hold.at && time <= hold.until);
  // A menu opened from that recent pose keeps the same small spatial grace
  // while its resident is paused. Otherwise its next choice could fail merely
  // because the first successful talk froze them a few pixels farther away.
  const referenceTime = pause ? pause.at : time;
  try {
    for (const ago of [.075, .15]) {
      updateNpcLife(surface, Math.max(0, referenceTime - ago), { holds });
      if (distance() <= range) return true;
    }
    return false;
  } finally {
    updateNpcLife(surface, time, { holds });
  }
}
