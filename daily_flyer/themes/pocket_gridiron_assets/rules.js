// Arcade tuning, not official individual player ratings. Denominators and
// calibration sources live in POCKET_GRIDIRON.md. No difficulty luck bonuses.
// Possession costs a little speed; ratings and burst still distinguish runners.
export const MOVEMENT_RULES=Object.freeze({carrierSpeed:.93});
export const BALL_RULES=Object.freeze({drop:.04,rushFumble:.016,catchFumble:.012,sackFumble:.065,intercept:.03,deflect:.18,tipCatch:.30,tipIntercept:.07});
export const AI_PROFILES=Object.freeze({
 rookie:{reaction:.46,readEvery:.34,recognizeRun:.70,error:2.2,vision:11,lead:.06,adapt:0,qbNoise:5},
 pro:{reaction:.26,readEvery:.20,recognizeRun:.38,error:1.0,vision:16,lead:.28,adapt:.55,qbNoise:2.5},
 legend:{reaction:.13,readEvery:.11,recognizeRun:.20,error:.35,vision:21,lead:.48,adapt:1,qbNoise:.7}
});
// Injectable, replayable randomness keeps simulation independent of UI/network.
export function seededRandom(seed=1){let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};random.getState=()=>state;return random;}
export function fumbleChance({sack=false,receiving=false,burst=false,diving=false,security=80}={}){
 const base=sack?BALL_RULES.sackFumble:receiving?BALL_RULES.catchFumble:BALL_RULES.rushFumble;
 return Math.max(.004,Math.min(.11,base*(burst?1.25:1)*(diving?1.35:1)*(1+(80-security)/100)));
}
