import assert from 'node:assert/strict';
import {getShipClass} from '../../dist/fleet.mjs';

/** Give a rule fixture an earned, real hull without bypassing its capacity. */
export function withHull(game,id='tern'){
 const hull=getShipClass(id);assert.equal(hull.id,id);
 if(!game.state.fleet.owned.includes(id))game.state.fleet.owned.push(id);
 game.state.ship.classId=id;game.state.ship.unowned=false;game._updateStats(true);
 return game;
}
