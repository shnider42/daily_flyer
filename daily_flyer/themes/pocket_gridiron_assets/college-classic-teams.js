import {rate} from './roster.js?v=33';
import {OFFENSE_STYLES,DEFENSE_STYLES} from './teams.js?v=33';
import {selectSpecialists} from './special-teams.js?v=33';

// Curated key season players, not a claim to reproduce every dressed player or
// the original depth chart. The challenge setups select the relevant principals.
// Jersey numbers / season membership come from the university roster archives;
// numerical attributes below are PGI estimates for these playable moments.
const GREEN={surface:'#356e50',material:'grass',alternate:'#3b7557'};
const ORANGE_BOWL={name:'Orange Bowl stadium',city:'Miami, Florida',climate:'florida',roof:'open'};
const JORDAN_HARE={name:'Jordan–Hare Stadium',city:'Auburn, Alabama',climate:'southeast',roof:'open'};
const FIESTA={name:'University of Phoenix Stadium · Fiesta Bowl',city:'Glendale, Arizona',climate:'desert',roof:'fixed'};
const kit=(helmet,jersey,pants,number,stripe,helmetPattern='double-stripe')=>({helmet,jersey,pants,number,stripe,helmetPattern});
const DATA=[
 {id:'CC_BC84',shortName:'BC',city:'1984 Boston College',season:1984,color:'#7a1739',accent:'#c7a96c',style:'vertical',venue:ORANGE_BOWL,
  source:'https://bceagles.com/sports/football/roster/1984',uniform:kit('#c7a96c','#f8f5eb','#c7a96c','#7a1739','#7a1739'),
  players:[
   ['Doug Flutie',22,'QB'],['Troy Stradford',23,'RB'],['Gerard Phelan',20,'WR'],['Kelvin Martin',82,'WR'],['Scott Gieselman',83,'TE'],
   ['Paul Holey',60,'OL'],['Steve Trapilo',65,'OL'],['David Widell',69,'OL'],['Doug Widell',74,'OL'],['Mark MacDonald',79,'OL'],['Steve Strachan',33,'FB'],
   ['Mike Ruth',68,'DL'],['John Bosa',97,'DL'],['John Galvin',38,'LB'],['Peter Holey',36,'LB'],['Todd Russell',45,'DB'],['Chris Murphy',91,'DB'],['Tony Thurman',17,'DB'],
   ['Eric Lindstrom',99,'DL'],['Scott Harrington',52,'DL'],['Ed Von Nessen',55,'LB'],['Ken Moriarty',12,'DB'],['Kevin Snow',2,'K'],['Rick Nickeson',15,'P']
  ],returner:'Kelvin Martin'},
 {id:'CC_MIA84',shortName:'MIA',city:'1984 Miami',season:1984,color:'#005b41',accent:'#ed6a20',style:'vertical',venue:ORANGE_BOWL,
  source:'https://miamihurricanes.com/sports/football/roster/season/1984-85',uniform:kit('#f7f6ef','#ed6a20','#f7f6ef','#ffffff','#005b41'),
  players:[
   ['Bernie Kosar',20,'QB'],['Melvin Bratton',5,'RB'],['Stanley Shakespeare',6,'WR'],['Michael Irvin',47,'WR'],['Willie Smith',84,'TE'],
   ['Matt Patchan',71,'OL'],['Juan Comenderio',69,'OL'],['Ian Sinclair',76,'OL'],['Dave Alekna',73,'OL'],['Paul Bertucelli',79,'OL'],['Alonzo Highsmith',30,'FB'],
   ['Kevin Fagan',95,'DL'],['Jerome Brown',98,'DL'],['Winston Moss',92,'LB'],['George Mira Jr.',45,'LB'],['Tolbert Bain',18,'DB'],['Darrell Fullington',19,'DB'],['Ken Calhoun',2,'DB'],
   ['Daniel Stubbs',96,'DL'],['Willie Lee Broughton',80,'DL'],['Mike Rodbro',51,'LB'],['Reggie Sutton',1,'DB'],['Mark Seelig',3,'K'],['Rick Tuten',12,'P']
  ],returner:'Stanley Shakespeare'},
 {id:'CC_AUB13',shortName:'AUB',city:'2013 Auburn',season:2013,color:'#0c2340',accent:'#e87722',style:'space',venue:JORDAN_HARE,
  source:'https://auburntigers.com/sports/football/roster/season/2013',uniform:kit('#f6f5ed','#0c2340','#f6f5ed','#ffffff','#e87722'),
  players:[
   ['Nick Marshall',14,'QB'],['Tre Mason',21,'RB'],['Ricardo Louis',5,'WR'],['Sammie Coates',18,'WR'],['C.J. Uzomah',81,'TE'],
   ['Greg Robinson',73,'OL'],['Alex Kozan',63,'OL'],['Reese Dismukes',50,'OL'],['Chad Slade',62,'OL'],['Avery Young',56,'OL'],['Jay Prosch',35,'FB'],
   ['Dee Ford',30,'DL'],['Gabe Wright',90,'DL'],['Jake Holland',5,'LB'],['Cassanova McKinzy',8,'LB'],['Chris Davis',11,'DB'],['Jonathon Mincy',6,'DB'],['Jermaine Whitehead',9,'DB'],
   ['Angelo Blackson',98,'DL'],['Nosa Eguae',94,'DL'],['Kris Frost',17,'LB'],['Ryan Smith',24,'DB'],['Cody Parkey',36,'K'],['Steven Clark',30,'P'],
   ['LaDarius Owens',10,'DL'],['Robenson Therezie',27,'DB']
  ],returner:'Chris Davis'},
 {id:'CC_BAMA13',shortName:'ALA',city:'2013 Alabama',season:2013,color:'#9e1b32',accent:'#f6f3eb',style:'power',venue:JORDAN_HARE,
  source:'https://rolltide.com/sports/football/roster/2013',uniform:kit('#9e1b32','#f6f3eb','#f6f3eb','#9e1b32','#f6f3eb','numbers'),
  players:[
   ['AJ McCarron',10,'QB'],['T.J. Yeldon',4,'RB'],['Amari Cooper',9,'WR'],['Kevin Norwood',83,'WR'],['O.J. Howard',88,'TE'],
   ['Cyrus Kouandjio',71,'OL'],['Arie Kouandjio',77,'OL'],['Ryan Kelly',70,'OL'],['Anthony Steen',61,'OL'],['Austin Shepherd',79,'OL'],['Jalston Fowler',45,'FB'],
   ['Ed Stinson',49,'DL'],['Jeoffrey Pagan',8,'DL'],['C.J. Mosley',32,'LB'],['Trey DePriest',33,'LB'],['Deion Belue',13,'DB'],['Eddie Jackson',4,'DB'],['HaHa Clinton-Dix',6,'DB'],
   ['Brandon Ivory',99,'DL'],["A'Shawn Robinson",86,'DL'],['Denzel Devall',30,'LB'],['Landon Collins',26,'DB'],['Adam Griffith',99,'K'],['Cody Mandell',29,'P'],
   ['Brian Vogler',84,'TE'],['Brandon Greene',58,'OL'],['Cole Mazza',55,'LS']
  ],returner:'Amari Cooper'},
 {id:'CC_BSU06',shortName:'BSU',city:'2006 Boise State',season:2006,color:'#0033a0',accent:'#f26522',style:'space',venue:FIESTA,
  source:'https://broncosports.com/sports/football/roster/2006',uniform:kit('#0033a0','#f8f7f0','#f26522','#0033a0','#f26522'),
  players:[
   ['Jared Zabransky',5,'QB'],['Ian Johnson',41,'RB'],['Drisan James',11,'WR'],['Jerard Rabb',1,'WR'],['Derek Schouman',91,'TE'],
   ['Ryan Clady',79,'OL'],['Tad Miller',66,'OL'],['Jadon Dailey',69,'OL'],['Pete Cavender',64,'OL'],['Jeff Cavender',54,'OL'],['Brad Lau',34,'FB'],
   ['Andrew Browning',57,'DL'],['Dennis Ellis',92,'DL'],['Korey Hall',25,'LB'],['Colt Brooks',31,'LB'],['Orlando Scandrick',8,'DB'],['Kyle Wilson',22,'DB'],['Marty Tadman',20,'DB'],
   ['Mike T. Williams',93,'DL'],['Nick Schlekeway',97,'DL'],['David Shields',43,'LB'],['Gerald Alexander',2,'DB'],['Anthony Montgomery',47,'K'],['Kyle Stringer',42,'P'],
   ['Legedu Naanee',4,'WR'],['Vinny Perretta',19,'WR']
  ],returner:'Drisan James'},
 {id:'CC_OU06',shortName:'OU',city:'2006 Oklahoma',season:2006,color:'#841617',accent:'#f4eada',style:'power',venue:FIESTA,
  source:'https://soonersports.com/documents/download/2013/7/25/2006_football_roster.pdf',uniform:kit('#841617','#841617','#f8f5ee','#ffffff','#f8f5ee'),
  players:[
   ['Paul Thompson',12,'QB'],['Adrian Peterson',28,'RB'],['Malcolm Kelly',4,'WR'],['Juaquin Iglesias',9,'WR'],['Joe Jon Finley',19,'TE'],
   ['Chris Messner',79,'OL'],['George Robinson',72,'OL'],['Jon Cooper',50,'OL'],['Brandon Walker',73,'OL'],['Trent Williams',71,'OL'],['Matt Clapp',34,'FB'],
   ['C.J. Ah You',99,'DL'],['Larry Birdine',92,'DL'],['Rufus Alexander',42,'LB'],['Zach Latimer',46,'LB'],['Marcus Walker',24,'DB'],['Reggie Smith',3,'DB'],['Darien Williams',41,'DB'],
   ['Steven Coleman',90,'DL'],['DeMarcus Granger',96,'DL'],['Curtis Lofton',40,'LB'],['Nic Harris',5,'DB'],['Garrett Hartley',10,'K'],['Michael Cohen',31,'P']
  ],returner:'Reggie Smith'}
];
const RATINGS={
 'Doug Flutie':{accuracy:93,armStrength:96,composure:97,speed:83,agility:91},'Gerard Phelan':{catching:96,routeRunning:94,ballSecurity:94},'Kelvin Martin':{speed:94,acceleration:95},
 'Bernie Kosar':{accuracy:94,composure:93,armStrength:91},'Jerome Brown':{power:94,shed:91},'Tony Thurman':{coverage:94,recognition:93},
 'Chris Davis':{speed:94,acceleration:96,agility:96,balance:92,catching:94,ballSecurity:96,endurance:96},'Nick Marshall':{speed:91,agility:94,accuracy:85},'Tre Mason':{speed:93,balance:92},
 'Jared Zabransky':{accuracy:89,composure:95,armStrength:89},'Ian Johnson':{speed:92,acceleration:94,agility:92,ballSecurity:95,balance:92},'Ryan Clady':{passBlock:94,runBlock:96,power:93},
 'Derek Schouman':{runBlock:94,catching:91},'Adrian Peterson':{speed:96,power:92,balance:95},'C.J. Mosley':{tackling:95,recognition:94},'Amari Cooper':{speed:95,catching:93}
};
export const COLLEGE_CLASSIC_TEAMS=DATA.map(({id,city,season,shortName})=>({id,city,season,shortName}));
export function collegeClassicTeam(id){
 const data=DATA.find(t=>t.id===id);if(!data)throw Error('Unknown college classic team');
 const roster=data.players.map(([name,number,pos],i)=>({...rate({name,number,pos,id:`${id}-${i}`,team:id,exp:3,draft:35}),...RATINGS[name],ratingSource:'PGI college moment estimate',ratingDate:'2026-11-07'}));
 const first=(pos,n)=>roster.filter(p=>p.pos===pos).slice(0,n),offense=[...first('QB',1),...first('RB',1),...first('WR',2),...first('TE',1),...first('OL',2)],defense=[...first('DL',2),...first('LB',2),...first('DB',3)];
 const specialists=selectSpecialists(roster),returner=roster.find(p=>p.name===data.returner);specialists.kr=returner;specialists.pr=returner;
 const profile={reviewed:'PGI interpretation of this season',offense:{id:data.style,...OFFENSE_STYLES[data.style]},defense:{id:'zone',...DEFENSE_STYLES.zone,personnel:'base'}};
 return {abbr:id,shortName:data.shortName,displayAbbr:data.shortName,city:data.city,college:true,historic:true,collegeClassic:true,season:data.season,color:data.color,accent:data.accent,source:data.source,
  rosterScope:'Curated key season players · estimated arcade ratings',roster,offense,defense,specialists,profile,venue:{...data.venue},field:{...GREEN},uniforms:{home:{...data.uniform},away:{...data.uniform}}};
}
