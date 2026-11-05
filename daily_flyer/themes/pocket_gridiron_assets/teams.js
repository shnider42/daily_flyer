import {OFFENSIVE_SYSTEMS} from './offensive-systems.js?v=32';
// Dated, hand-reviewed arcade identities; not official coaching tendencies.
export const PROFILE_DATE='2026-11-01';
export const OFFENSE_STYLES={
 power:{name:'Power ground game',strength:'Inside runs and lead blocks',weakness:'Less room if the box is crowded',signature:['counter','power'],plays:['dive','slants','verts','curls','counter','power','draw','flood']},
 quick:{name:'Quick timing',strength:'Short routes and reliable outlets',weakness:'Tight underneath coverage disrupts timing',signature:['mesh','levels'],plays:['dive','slants','verts','curls','mesh','levels','smash','draw']},
 vertical:{name:'Vertical attack',strength:'Deep routes and isolated receivers',weakness:'Deep routes need time in the pocket',signature:['postwheel','smash'],plays:['dive','slants','verts','curls','postwheel','smash','sweep','flood']},
 mobile:{name:'Moving pocket',strength:'QB movement and changing launch points',weakness:'Disciplined contain narrows escape lanes',signature:['keeper','flood'],plays:['dive','slants','verts','curls','keeper','flood','counter','mesh']},
 space:{name:'Space and speed',strength:'Outside runs and crossing routes',weakness:'Sideline contain and physical tackling',signature:['stretch','mesh'],plays:['dive','slants','verts','curls','stretch','mesh','sweep','spot']}
};
export const DEFENSE_STYLES={
 pressure:{name:'Pressure front',strength:'Extra rushers and run pressure',weakness:'Short throws behind the rush',signature:['blitz','commit'],plays:['zone','man','blitz','commit','press','cover3']},
 man:{name:'Man matchups',strength:'Individual coverage and press',weakness:'Crossing routes and mobile QBs',signature:['press','robber'],plays:['zone','man','blitz','press','robber','cover2']},
 zone:{name:'Layered zone',strength:'Help coverage and deep protection',weakness:'Patient runs and underneath completions',signature:['cover2','cover3'],plays:['zone','man','blitz','cover2','cover3','prevent']}
};
// Expanded calls preserve each team's established identity and signatures.
const addedOffense={power:['comeback','dagger','bench','speedouts','trapright','powerleft','qbdraw','iso'],quick:['comeback','speedouts','deepouts','drive','whip','bench','dagger','iso'],vertical:['deepouts','dagger','scissors','doublepost','cornerpost','seamstretch','shallowwheel','trapright'],mobile:['comeback','speedouts','drive','scissors','shallowwheel','qbdraw','powerleft','doublepost'],space:['speedouts','drive','whip','seamstretch','shallowwheel','qbdraw','trapright','bench']};
const addedDefense={pressure:['cover0','firezone','edgeleft','edgeright','spy','cover4'],man:['cover0','spy','bracketleft','bracketright','edgeleft','edgeright'],zone:['cover4','cover6','firezone','spy','bracketleft','bracketright']};
for(const [id,plays] of Object.entries(addedOffense)){OFFENSE_STYLES[id].plays.push(...plays,'sweep','sweepleft','tossright','tossleft','jetsweep');OFFENSE_STYLES[id].plays=[...new Set(OFFENSE_STYLES[id].plays)];}
for(const [id,plays] of Object.entries(addedDefense))DEFENSE_STYLES[id].plays.push(...plays,'twistleft','twistright');
const assignments={ARI:['mobile','zone'],ATL:['power','zone'],BAL:['mobile','pressure'],BUF:['mobile','zone'],CAR:['quick','zone'],CHI:['mobile','zone'],CIN:['vertical','man'],CLE:['power','pressure'],DAL:['vertical','man'],DEN:['quick','man'],DET:['power','man'],GB:['vertical','zone'],HOU:['vertical','zone'],IND:['power','zone'],JAX:['vertical','man'],KC:['quick','pressure'],LA:['quick','zone'],LAC:['power','zone'],LV:['power','pressure'],MIA:['space','zone'],MIN:['quick','pressure'],NE:['mobile','man'],NO:['quick','zone'],NYG:['vertical','pressure'],NYJ:['space','man'],PHI:['power','zone'],PIT:['power','pressure'],SEA:['space','zone'],SF:['quick','zone'],TB:['vertical','pressure'],TEN:['vertical','zone'],WAS:['mobile','pressure']};
const systemFor={power:'poweri',quick:'westcoast',vertical:'rungun',mobile:'spread',space:'airraid'};
const teamSystems={BAL:'pistolpa',PHI:'pistolpa',SF:'westcoast',DET:'poweri',MIA:'airraid',PIT:'wingt'};
const teamFronts={BAL:'odd',PIT:'odd',NE:'odd',CHI:'bear',MIN:'stack',SEA:'stack',KC:'nickel',NYJ:'nickel'};
export function teamProfile(abbr){const [o,d]=assignments[abbr]||['quick','zone'],system=teamSystems[abbr]||systemFor[o];return {offense:{id:o,...OFFENSE_STYLES[o],system,plays:[...OFFENSE_STYLES[o].plays,...OFFENSIVE_SYSTEMS[system].plays]},defense:{id:d,...DEFENSE_STYLES[d],personnel:teamFronts[abbr]||'base'},reviewed:PROFILE_DATE};}
export function withOffensiveSystem(team,id='team'){
 const system=OFFENSIVE_SYSTEMS[id];if(!system)return team;
 const core=OFFENSE_STYLES[system.base];
 return {...team,profile:{...team.profile,offense:{...core,...system,id:system.base,system:id,strict:true,plays:[...new Set([...core.plays,...system.plays])]},reviewed:'PGI scheme interpretation · 2026-11-04'}};
}
export function playbook(team,side,all){const ids=team.profile?.[side]?.plays;return ids?all.filter(p=>ids.includes(p.id)||side==='offense'&&p.universal&&!team.profile?.offense?.strict):all;}
export function teamStrengths(team){const a=team.offense,d=team.defense,mean=(ps,key)=>Math.round(ps.reduce((n,p)=>n+(p[key]||75),0)/ps.length);return {Passing:Math.round((a[0].accuracy+mean(a.slice(2,5),'catching'))/2),Running:Math.round((a[1].power+a[1].agility+mean(a.slice(5),'runBlock'))/3),Protection:mean(a.slice(5),'passBlock'),Coverage:mean(d.slice(2),'coverage'),Pressure:mean(d.slice(0,4),'shed')};}
