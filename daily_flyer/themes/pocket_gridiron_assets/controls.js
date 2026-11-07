// Shared with Pocket Hockey and Pocket Soccer. Keep football command selection here.
export { bindGameButton, stickInput, movementInput, setGameButtonEnabled, protectGameSurface } from "../pocket_sports_assets/core/pgi-controls.js";

export function primaryCommand(game){
  if(!game||game.paused)return null;
  if(game.phase==='penalty')return 'accept';
  if(['kick_ready','kick_charge','kick_accuracy'].includes(game.phase))return game.special?.goal&&!game.userKicking?null:'kick';
  if(game.phase==='ready')return game.userOffense?'snap':null;
  if(game.userOffense&&game.fakeActive)return null;
  if(game.userOffense&&game.breakAvailable)return 'break';
  if(game.userOffense&&(game.contact||game.breakArm))return null;
  if(game.isLive&&(!game.userOffense||!game.pass)&&(game.userOffense?game.burstCooldown<=0&&(game.stamina??100)>=12:game.diveCooldown<=0))return 'burst';
  return null;
}
