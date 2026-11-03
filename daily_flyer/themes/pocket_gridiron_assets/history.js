import {HISTORIC_ROSTERS} from './historic-rosters.js?v=23';
import {TEAMS,rate} from './roster.js?v=23';
import {teamProfile,OFFENSE_STYLES,DEFENSE_STYLES} from './teams.js?v=23';
import {selectSpecialists} from './special-teams.js?v=23';
export const CLASSICS=[
 {id:'catch',name:'The Catch',date:'January 10, 1982',home:'SF81',away:'DAL81',venue:'Candlestick Park',score:[21,27],spot:94,down:3,target:97,clock:58,hero:'Dwight Clark',
  story:'San Francisco needs a touchdown. Joe Montana rolls right and finds Dwight Clark high in the back of the end zone. The extra point and a defensive stop finish the 28–27 win.',
  simple:'Move Montana right. Throw A to Clark in the end zone.',moderate:'3rd & 3 at the Dallas 6. Roll right, buy time, then find Clark at the back of the end zone.',expert:'Q4 · 0:58 · SF 21–27 DAL. Sprint-right concept. Keep the QB behind the line; A is Clark.',
  source:'https://www.dallascowboys.com/news/spagnola-heartbreaking-moments-change-course-of-cowboys-history-453541'},
 {id:'immaculate',name:'The Immaculate Reception',date:'December 23, 1972',home:'PIT72',away:'OAK72',venue:'Three Rivers Stadium',score:[6,7],spot:40,down:4,target:50,clock:22,hero:'Franco Harris',
  story:'A pass toward John “Frenchy” Fuqua ricochets near Jack Tatum. Franco Harris catches it before it reaches the turf and runs for the winning touchdown. Who the ball touched remains disputed.',
  simple:'Follow the gold ring as Harris. Tap SCOOP, then run to the end zone.',moderate:'4th & 10. Stay with the deflected ball, scoop it before it falls, then turn upfield.',expert:'Q4 · 0:22 · PIT 6–7 OAK · own 40. Playable checkpoint: Harris tracks the ricochet, then finishes the return.',
  source:'https://www.raiders.com/news/fifty-years-raiders-oral-history-immaculate-reception-steelers-nfl-franco-harris'},
 {id:'roller',name:'The Holy Roller',date:'September 10, 1978',home:'OAK78',away:'SD78',venue:'San Diego Stadium',score:[14,20],spot:86,down:2,target:90,clock:10,hero:'Dave Casper',
  story:'Stabler loses the ball forward under pressure. Banaszak and Casper keep it moving, and Casper recovers in the end zone. The touchdown stands; the extra point gives Oakland a 21–20 win.',
  simple:'Chase the loose ball. BUMP with Banaszak, then DIVE with Casper.',moderate:'Ten seconds, fourteen yards. Keep the ball moving and recover it in the end zone. This challenge uses the famous 1978 ruling.',expert:'Q4 · 0:10 · OAK 14–20 SD · SD 14. Two recovery checkpoints. Historical exception is confined to this scripted chapter.',
  source:'https://www.profootballhof.com/news/the-holy-roller'},
 {id:'edelman',name:'Edelman • inches from the turf',date:'February 5, 2017',home:'NE16',away:'ATL16',venue:'NRG Stadium · Super Bowl LI',score:[20,28],spot:36,down:1,target:46,clock:148,hero:'Julian Edelman',
  story:'Trailing by eight, New England needs to keep its drive alive. A deflected pass becomes Edelman’s 23-yard catch at the Atlanta 41. It helps the tying drive; the catch itself is not a touchdown.',
  simple:'Stay under the gold ring. Tap CATCH before the ball touches grass.',moderate:'Track the tip between Alford, Allen and Neal. Secure the ball to keep the tying drive alive.',expert:'Q4 · 2:28 · NE 20–28 ATL · own 36. Playable checkpoint: a 23-yard contested catch, not a scoring play.',
  source:'https://www.patriots.com/news/julian-edelman-s-crazy-catch-keys-historic-super-bowl-win-290971'}
];
export const HISTORIC_TEAMS=HISTORIC_ROSTERS.map(({id,city,season})=>({id,city,season}));
// Authored game balance, not measurements or licensed ratings.
const LEGEND_RATINGS={
 'Joe Montana':{accuracy:96,composure:99,armStrength:88},'Tom Brady':{accuracy:97,composure:99,armStrength:93,speed:59},
 'Terry Bradshaw':{accuracy:85,armStrength:97,power:90},'Ken Stabler':{accuracy:91,composure:96,armStrength:89},
 'Daryle Lamonica':{armStrength:96,accuracy:86},'Dan Fouts':{accuracy:94,armStrength:94},'Danny White':{accuracy:88,hangTime:86,kickPower:87},'Matt Ryan':{accuracy:95,composure:93,armStrength:91},
 'Franco Harris':{speed:89,power:94,balance:97,ballSecurity:90},'Tony Dorsett':{speed:98,acceleration:98,agility:97},
 'Dwight Clark':{catching:97,routeRunning:94,balance:94},'Freddie Solomon':{speed:95,agility:92},'Julian Edelman':{catching:95,agility:96,routeRunning:96,balance:94},
 'Julio Jones':{speed:96,power:92,catching:98},'Cliff Branch':{speed:99,acceleration:98},'Fred Biletnikoff':{catching:98,routeRunning:98},
 'Dave Casper':{catching:96,power:93,runBlock:90},'James White':{catching:95,routeRunning:92,agility:91},
 'Joe Greene':{power:99,shed:99,tackling:96},'Jack Ham':{recognition:98,coverage:94,tackling:95},'Mel Blount':{coverage:98,power:93},
 'Ronnie Lott':{tackling:97,coverage:96,recognition:95},'Randy White':{power:98,shed:98},'Ted Hendricks':{shed:97,recognition:97},
 'Art Shell':{passBlock:98,runBlock:97,power:97},'Gene Upshaw':{runBlock:99,passBlock:95},'Ray Guy':{kickPower:98,hangTime:99,kickAccuracy:96},
 'Stephen Gostkowski':{kickAccuracy:95,kickPower:93},'Matt Bryant':{kickAccuracy:96,kickPower:91}
};
export function historicTeam(id){
 const data=HISTORIC_ROSTERS.find(t=>t.id===id);if(!data)throw Error('Unknown classic team');
 const meta=TEAMS.find(t=>t.abbr===data.franchise),roster=data.players.map((p,i)=>({...rate({...p,id:`${id}-${i}`,team:id,draft:i+1,exp:5}),...LEGEND_RATINGS[p.name],ratingSource:'Historic arcade estimate',ratingDate:'2026-11-03'}));
 const byName=name=>roster.find(p=>p.name===name),offense=data.offense.map(byName),defense=data.defense.map(byName);
 const specialists=selectSpecialists(roster);specialists.punter=byName(data.punter);
 const named=(key,name)=>{const p=byName(name);if(p)specialists[key]=p;};
 if(id==='NE16'){named('kr','Dion Lewis');named('pr','Julian Edelman');named('gunner1','Matthew Slater');}
 if(id==='ATL16'){named('kr','Eric Weems');named('pr','Eric Weems');}
 if(id==='OAK78'){named('kr','Arthur Whittington');named('pr','Neal Colzie');}
 if(id==='SD78'){named('kr','Artie Owens');named('pr','Mike Fuller');}
 const profile=teamProfile(data.franchise),o={NE16:'quick',SF81:'quick',PIT72:'power',OAK72:'vertical',OAK78:'vertical',SD78:'vertical',DAL81:'power',ATL16:'space'}[id];profile.offense={id:o,...OFFENSE_STYLES[o]};profile.defense={id:'zone',...DEFENSE_STYLES.zone};profile.reviewed='historic arcade interpretation';
 return {...meta,abbr:id,city:data.city,franchise:data.franchise,season:data.season,historic:true,source:data.source,roster,offense,defense,specialists,profile};
}
