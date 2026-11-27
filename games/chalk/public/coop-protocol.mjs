/** CHALK co-op wire contract, adapted from Farwake's authoritative transport.
 * First C -> S: create {protocol,name,mission,difficulty,role,squadRoles}; join {protocol,code,name};
 *   resume {protocol,code,playerId,token}. S -> C: joined {session:{code,playerId,token},room}.
 * Then Farwake snapshot-delta packets decode to snapshot {state,room,init,worldProps,
 *   selfId,actorId,ack,tick,serverTime}. init={seed,mission,difficulty,epoch,campaign,squadRoles}.
 * Preserve a locally generated world's identity; merge state and worldProps in place.
 * C -> S input {seq,epoch,input}; order {id,epoch,order,point?}; start/restart/
 *   swap_roles/return_lobby/continue_operation {id,epoch}; configure {id,epoch,mission,difficulty,squadRoles};
 *   squadRoles contains four canonical loadout IDs; only the host configures them
 *   in the lobby. The chosen equipment does not change Hale's command identity.
 *   story_choice {id,epoch,decisionId,optionId}; members recommend, leaders decide.
 *   tactical_ping {id,epoch,point}; any live assigned soldier may mark a location.
 *   field_support {id,epoch,point}; request the one finite relief commitment.
 *   select_soldier {id,epoch,actorId}; either player chooses any unclaimed soldier.
 * Room soldiers=[{id,slot,slotId,name,role,commander,alive,downed,claimedBy,connected}] includes all
 * four actors even in the briefing. Disconnected players reserve their selection
 * during reconnect grace. Changing selection advances the epoch without resetting
 * the squad's physical state. Capacity remains two humans, in any of four slots.
 *   leave; ping {sentAt}; resync. Commands optionally receive result {id,ok,reason}.
 * Shared play has no global pause: opening a local menu sends neutral input.
 * Explicit neutral frames carry cancelActions:true to discard pending one-shots.
 */
// Version 12 adds configurable loadouts with command identity kept separate.
// Both ends refresh together; combat statistics remain server authoritative.
export const PROTOCOL = 12;
export const SIMULATION_HZ = 30;
export const INPUT_HZ = 30;
export const SNAPSHOT_HZ = 10;
export const INPUT_TIMEOUT_MS = 500;
export const DISCONNECT_GRACE_MS = 30000;
export const HOST_PROMOTION_MS = 5000;
export const MAX_HUMANS = 2;
export const THROW_ACTIONS = Object.freeze(['frag','flashbang','grenade','smoke']);
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const normalizeRoomCode = code => String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
export const validRoomCode = code => ROOM_CODE_PATTERN.test(normalizeRoomCode(code));
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const number = n => Number.isFinite(n) ? n : 0;
export function cleanInput(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  let moveX=clamp(number(raw.moveX),-1,1),moveY=clamp(number(raw.moveY),-1,1);
  const length=Math.hypot(moveX,moveY);if(length>1){moveX/=length;moveY/=length;}
  const throwTargets={};
  for(const type of THROW_ACTIONS){
    const point=raw.throwTargets?.[type];
    if(Number.isFinite(point?.x)&&Number.isFinite(point?.y))throwTargets[type]={x:clamp(point.x,-1200,3600),y:clamp(point.y,-1200,3100)};
  }
  return {moveX,moveY,aimX:Number.isFinite(raw.aimX)?clamp(raw.aimX,-1200,3600):null,
    aimY:Number.isFinite(raw.aimY)?clamp(raw.aimY,-1200,3100):null,
    throwAimX:Number.isFinite(raw.throwAimX)?clamp(raw.throwAimX,-1200,3600):null,
    throwAimY:Number.isFinite(raw.throwAimY)?clamp(raw.throwAimY,-1200,3100):null,
    throwTargets,
    fire:raw.fire===true,interact:raw.interact===true,reload:raw.reload===true,
    smoke:raw.smoke===true,sprint:raw.sprint===true,grenade:raw.grenade===true,observe:raw.observe===true,
    frag:raw.frag===true,flashbang:raw.flashbang===true};
}
export const EMPTY_INPUT = Object.freeze(cleanInput());
