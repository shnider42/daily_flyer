import {checkContactInjury} from './injuries.js?v=29';
import {effects} from './weather.js?v=29';
import {fumbleChance} from './rules.js?v=29';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function resetContact(g){g.contact=null;g.breakArm=null;g.breakCooldown=0;g.offBalance=0;g.contactSlow=0;g.moveAnimation=null;g.contactFeedback='';}
export function nearestThreat(g){if(!g.isLive||g.pass||g.contact)return g.contact?g.defenders[g.contact.defender]:null;return g.defenders.filter(d=>d.stun<=0&&!d.blocked&&distance(d,g.carrier)<3.8).sort((a,b)=>distance(a,g.carrier)-distance(b,g.carrier))[0]||null;}
export function chooseMove(g,d,input=g.lastInput||{x:0,y:1}){
 const p=g.carrier;
 if(Math.abs(input.x)>.55&&(p.agility||75)>(p.power||75)-8)return 'spin';
 if(Math.abs(d.x-p.x)>Math.abs(d.y-p.y)*.7)return 'stiff';
 return 'truck';
}
export function armBreak(g,input){
 const d=nearestThreat(g);if(!d||g.breakArm||g.breakCooldown>0||g.stamina<24*effects(g.weather).cost)return false;
 g.breakArm={move:chooseMove(g,d,input),left:.55};g.breakCooldown=1.8;g.stamina-=24*effects(g.weather).cost;return true;
}
export function contactOdds(g,d,move){
 const p=g.carrier,others=g.defenders.filter(q=>q!==d&&q.stun<=0&&!q.blocked&&distance(q,p)<3.4).length;
 const speed=Math.hypot(p.vx||0,p.vy||0),balance=g.offBalance>0,skill=move==='spin'?((p.agility||75)*.65+(p.balance||75)*.35):move==='stiff'?((p.power||75)*.65+(p.balance||75)*.35):((p.power||75)*.8+(p.balance||75)*.2);
 const tackle=(d.tackling||80)*.75+(d.power||75)*.25;
 const chance=move?clamp(.30+(skill-tackle)*.007+Math.min(.08,speed*.012)-(balance?.16:0)-Math.min(3,others)*.14-(g.stamina<35?.09:0),.03,.72):0;
 const base=fumbleChance({sack:!g.isReturn&&p===g.players[0]&&!g.crossed&&g.playDefinition.kind==='pass',receiving:g.receivedPass&&!g.isReturn,burst:g.burstLeft>0,diving:g.isHumanDefender(d)&&g.diveLeft>0,security:p.ballSecurity??80});
 const risk=clamp(base+effects(g.weather).fumble+(move==='stiff'?.006:move==='spin'?.009:move==="truck"?.004:0)+(move&&balance?.004:0),.004,.10);
 return {chance,risk,others,balance};
}
export function beginContact(g,d){
 g.contact={defender:g.defenders.indexOf(d),left:.24};g.emit('contact','CONTACT');
 // CPU commits once per encounter using the same costs, ratings and outcome roll.
 if(!g.userOffense)armBreak(g,{x:Math.abs(g.carrier.vx||0)>2?Math.sign(g.carrier.vx):0,y:1});
}
export function tickContact(g,dt){
 const c=g.contact;if(!c)return false;c.left-=dt;
 if(!g.breakArm&&c.left>0)return true;
 const d=g.defenders[c.defender],move=g.breakArm?.move||null,o=contactOdds(g,d,move),roll=g.rng();
 g.contact=null;g.breakArm=null;checkContactInjury(g,d);
 if(roll<o.risk){g.contactFeedback=move?'The move exposed the ball.':'Contact dislodged the ball.';g.startFumble(d);return true;}
 if(move&&roll<o.risk+(1-o.risk)*o.chance){
  d.stun=.65;g.contactSlow=move==='spin'?.32:move==='truck'?.20:.12;
  g.moveAnimation={move,left:.45};g.stats.brokenTackles+=g.userOffense?1:0;
  g.contactFeedback=o.others?'Beat one tackler; help was nearby.':o.balance?'Escaped despite poor balance.':'Won the one-on-one contact.';
  g.emit('escape',move==='spin'?'SPIN!':move==='stiff'?'STIFF ARM!':'BULLDOZE!',g.contactFeedback);return true;
 }
 g.contactFeedback=move?(o.others?'Help defenders closed the escape.':o.balance?'Off balance at contact.':'The tackler won the matchup.'):'Brought down at contact.';
 if(!g.userOffense)g.stats.tackles++;
 g.finish('tackle',g.carrier.y,g.contactFeedback);return true;
}
