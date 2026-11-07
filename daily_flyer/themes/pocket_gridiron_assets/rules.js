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

// The college profile implements the differences that have a physical effect in
// this game. The pro profile retains PGI's existing short-game kickoff/OT model.
// Sources: NCAA 2026 Rules 1-2-1-j, 2-4-3, 3-1-3, 4-1-3, 6-5-1, 8-3-2;
// https://ncaaorg.s3.amazonaws.com/championships/sports/football/rules/PRMFB_RulesBook.pdf
// NFL 2026 Rules 1-1-1, 8-1-3, 11-3-1:
// https://operations.nfl.com/rules-officiating/2026-nfl-rulebook
export const FOOTBALL_RULESETS=Object.freeze({
 pro:Object.freeze({id:'pro',name:'Pro arcade',hashMarksYards:Object.freeze([70.75/3,160/3-70.75/3]),hashSpotting:false,catchFeet:2,downWithoutContact:false,extraPointSpot:85,twoPointSpot:98,kickoffFairCatch25:false,kickoffGroundTouchback:false,kickoffTouchback:25,puntTouchback:20,overtime:'sudden-death'}),
 college:Object.freeze({id:'college',name:'College',hashMarksYards:Object.freeze([20,160/3-20]),hashSpotting:true,catchFeet:1,downWithoutContact:true,extraPointSpot:97,twoPointSpot:97,kickoffFairCatch25:true,kickoffGroundTouchback:true,kickoffTouchback:25,puntTouchback:20,overtime:'possessions'})
});
export function footballRules(options={},teams=[]){
 const id=options.ruleset??(teams.length===2&&teams.every(t=>t.college||t.ruleset==='college')?'college':'pro');
 return FOOTBALL_RULESETS[id]||FOOTBALL_RULESETS.pro;
}
// A small two-foot footprint makes sideline/end-line catches use the selected
// rule without inventing a random "toe tap" outcome. There is no replay booth or
// full three-dimensional catch animation in this arcade model.
export function catchFootCount(player){
 const feet=player.catchFeet||[{x:player.x-.32,y:player.y-.16},{x:player.x+.32,y:player.y+.16}];
 return feet.filter(p=>p.x>.4&&p.x<52.9&&p.y> -10&&p.y<110).length;
}
export function catchInBounds(player,rules=FOOTBALL_RULESETS.pro){return catchFootCount(player)>=rules.catchFeet;}
