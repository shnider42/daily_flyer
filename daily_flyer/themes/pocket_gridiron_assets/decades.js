import {rate} from './roster.js?v=29';
import {OFFENSE_STYLES,DEFENSE_STYLES} from './teams.js?v=29';
import {selectSpecialists} from './special-teams.js?v=29';
// PGI selections, not the official Hall of Fame lists. Names span NFL/AFL eras;
// stats are authored gameplay ratings, normalized across eras, not career totals.
// Tuple: name, jersey, position, speed, strength, signature skill, endurance.
const DECADES=[
 [1950,'Leather & thunder','#72533e','#ead8ac','power','pressure','GB',[
 ['Otto Graham',14,'QB',76,78,97,87],['Bobby Layne',22,'QB',72,81,92,85],
 ['Marion Motley',76,'RB',87,99,94,92],['Joe Perry',34,'RB',96,89,93,94],['Frank Gifford',16,'RB',90,85,92,92],
 ['Tom Fears',80,'WR',85,78,97,92],['Elroy Hirsch',40,'WR',96,75,95,91],['Raymond Berry',82,'WR',82,74,99,95],['Billy Howton',86,'WR',91,72,92,88],
 ['Pete Pihos',35,'TE',79,93,95,92],['Jim Doran',83,'TE',84,86,89,87],
 ['Lou Groza',76,'OL',48,96,96,90],['Dick Stanfel',63,'OL',52,97,96,92],['Frank Gatski',52,'OL',48,95,95,95],['Roosevelt Brown',79,'OL',65,96,98,94],['Jim Parker',77,'OL',57,99,98,95],['Duane Putnam',66,'OL',54,91,91,88],
 ['Gino Marchetti',89,'DL',77,97,98,92],['Ernie Stautner',70,'DL',68,99,96,96],['Doug Atkins',81,'DL',72,99,96,90],['Andy Robustelli',81,'DL',76,93,95,93],['Leo Nomellini',73,'DL',70,98,94,96],
 ['Joe Schmidt',56,'LB',84,91,98,97],['Bill George',61,'LB',79,95,96,94],['Chuck Bednarik',60,'LB',78,98,98,99],['Les Richter',48,'LB',79,92,91,91],
 ['Dick Lane',81,'DB',94,96,98,94],['Jack Christiansen',24,'DB',95,77,97,95],['Emlen Tunnell',45,'DB',91,84,98,96],['Jack Butler',80,'DB',90,83,94,92],['Jim David',26,'DB',88,85,90,90],
 ['George Blanda',16,'K',51,67,88,88],['Yale Lary',28,'P',90,79,94,96]
 ]],
 [1960,'Sweep & swagger','#c0952c','#f1e5bb','power','man','GB',[
 ['Johnny Unitas',19,'QB',67,80,98,90],['Bart Starr',15,'QB',66,75,97,91],
 ['Jim Brown',32,'RB',96,99,98,99],['Gale Sayers',40,'RB',99,77,99,90],['Jim Taylor',31,'FB',84,98,92,96],
 ['Lance Alworth',19,'WR',98,72,97,94],['Charley Taylor',42,'WR',92,89,96,94],['Don Maynard',13,'WR',96,73,95,92],['Del Shofner',85,'WR',93,76,94,90],
 ['John Mackey',88,'TE',92,97,97,95],['Mike Ditka',89,'TE',79,99,92,96],
 ['Forrest Gregg',75,'OL',58,97,99,97],['Jerry Kramer',64,'OL',60,96,98,94],['Jim Ringo',51,'OL',54,93,96,97],['Gene Hickerson',66,'OL',65,96,97,96],['Bob Brown',76,'OL',60,99,96,91],['Billy Shaw',66,'OL',61,94,95,94],
 ['Deacon Jones',75,'DL',85,97,99,96],['Bob Lilly',74,'DL',76,99,99,98],['Merlin Olsen',74,'DL',68,99,98,97],['Willie Davis',87,'DL',83,92,96,93],['Buck Buchanan',86,'DL',73,99,96,94],
 ['Dick Butkus',51,'LB',84,99,99,94],['Bobby Bell',78,'LB',91,91,98,97],['Ray Nitschke',66,'LB',79,98,97,95],['Dave Robinson',89,'LB',87,91,94,94],
 ['Herb Adderley',26,'DB',97,87,98,96],['Lem Barney',20,'DB',97,78,96,94],['Willie Wood',24,'DB',92,83,98,97],['Larry Wilson',8,'DB',90,91,97,95],['Willie Brown',24,'DB',95,86,96,94],
 ['Jim Bakken',25,'K',48,65,92,86],['Don Chandler',34,'P',67,72,91,90]
 ]],
 [1970,'Steel & soul','#40556b','#f5ca5b','power','pressure','PIT',[
 ['Roger Staubach',12,'QB',88,79,96,94],['Terry Bradshaw',12,'QB',79,91,94,92],
 ['Earl Campbell',34,'RB',90,99,98,92],['Walter Payton',34,'RB',94,95,97,99],['Franco Harris',32,'FB',88,96,95,96],
 ['Paul Warfield',42,'WR',97,75,98,94],['Lynn Swann',88,'WR',94,73,97,92],['Drew Pearson',88,'WR',90,79,96,94],['Cliff Branch',21,'WR',99,66,92,91],
 ['Dave Casper',87,'TE',83,95,97,94],['Charlie Sanders',88,'TE',85,90,95,93],
 ['Art Shell',78,'OL',55,99,98,95],['Gene Upshaw',63,'OL',60,99,99,97],['Jim Langer',62,'OL',51,95,97,96],['Larry Little',66,'OL',63,96,97,95],['Ron Yary',73,'OL',57,97,98,95],['Mike Webster',52,'OL',50,98,98,98],
 ['Joe Greene',75,'DL',74,99,99,96],['Alan Page',88,'DL',89,93,99,98],['Carl Eller',81,'DL',84,95,97,95],['Jack Youngblood',85,'DL',81,94,98,98],['L.C. Greenwood',68,'DL',82,92,95,94],
 ['Jack Lambert',58,'LB',84,95,98,97],['Jack Ham',59,'LB',87,86,99,97],['Ted Hendricks',83,'LB',86,94,97,97],['Robert Brazile',52,'LB',89,93,96,94],
 ['Mel Blount',47,'DB',94,98,99,97],['Willie Brown',24,'DB',93,89,98,94],['Ken Houston',27,'DB',92,94,98,96],['Cliff Harris',43,'DB',90,90,95,94],['Roger Wehrli',22,'DB',92,79,96,95],
 ['Garo Yepremian',1,'K',48,60,93,83],['Ray Guy',8,'P',68,75,99,94]
 ]],
 [1980,'Neon playmakers','#644683','#e4b2db','quick','pressure','SF',[
 ['Joe Montana',16,'QB',78,72,99,92],['Dan Marino',13,'QB',55,80,99,86],
 ['Bo Jackson',34,'RB',99,98,96,97],['Walter Payton',34,'RB',94,96,99,99],['Roger Craig',33,'FB',90,90,95,97],['Eric Dickerson',29,'RB',98,91,97,96],
 ['Jerry Rice',80,'WR',94,81,99,99],['Steve Largent',80,'WR',85,76,99,97],['James Lofton',80,'WR',98,76,96,95],['Art Monk',81,'WR',90,87,97,97],
 ['Kellen Winslow',80,'TE',88,91,99,95],['Ozzie Newsome',82,'TE',84,86,97,97],
 ['Anthony Munoz',78,'OL',63,97,99,96],['John Hannah',73,'OL',56,99,99,96],['Dwight Stephenson',57,'OL',63,96,99,93],['Russ Grimm',68,'OL',52,98,97,94],['Gary Zimmerman',65,'OL',60,96,98,96],['Mike Munchak',63,'OL',58,96,96,96],
 ['Reggie White',92,'DL',83,99,99,96],['Randy White',54,'DL',80,99,98,98],['Howie Long',75,'DL',83,97,97,95],['Dan Hampton',99,'DL',75,98,96,92],['Bruce Smith',78,'DL',84,96,96,94],
 ['Lawrence Taylor',56,'LB',96,97,99,97],['Mike Singletary',50,'LB',82,95,99,98],['Andre Tippett',56,'LB',88,96,97,94],['Carl Banks',58,'LB',86,95,94,95],
 ['Mike Haynes',22,'DB',97,80,99,96],['Lester Hayes',37,'DB',93,91,98,94],['Ronnie Lott',42,'DB',92,99,99,97],['Kenny Easley',45,'DB',93,94,98,93],['Darrell Green',28,'DB',99,70,96,98],
 ['Morten Andersen',7,'K',49,65,97,89],['Reggie Roby',4,'P',59,78,97,91]
 ]],
 [1990,'Prime time','#177b81','#cde9e1','space','man','DAL',[
 ['Brett Favre',4,'QB',78,89,97,97],['Steve Young',8,'QB',93,85,98,94],
 ['Barry Sanders',20,'RB',98,78,99,96],['Emmitt Smith',22,'RB',90,91,98,99],['Thurman Thomas',34,'FB',91,88,96,95],
 ['Jerry Rice',80,'WR',92,83,99,99],['Michael Irvin',88,'WR',90,95,98,96],['Cris Carter',80,'WR',85,88,99,96],['Tim Brown',81,'WR',95,79,97,97],
 ['Shannon Sharpe',84,'TE',91,88,98,95],['Ben Coates',87,'TE',82,96,96,93],
 ['Willie Roaf',77,'OL',58,99,99,96],['Larry Allen',73,'OL',68,99,99,95],['Dermontti Dawson',63,'OL',66,97,99,97],['Randall McDaniel',64,'OL',69,95,98,97],['Tony Boselli',71,'OL',59,97,98,92],['Bruce Matthews',74,'OL',58,96,98,99],
 ['Bruce Smith',78,'DL',85,97,99,97],['Reggie White',92,'DL',80,99,99,96],['John Randle',93,'DL',83,95,98,96],['Cortez Kennedy',96,'DL',67,99,98,94],['Neil Smith',90,'DL',81,96,96,93],
 ['Derrick Thomas',58,'LB',94,90,99,95],['Junior Seau',55,'LB',91,94,99,98],['Kevin Greene',91,'LB',87,95,97,96],['Cornelius Bennett',97,'LB',90,94,96,94],
 ['Deion Sanders',21,'DB',99,66,99,96],['Rod Woodson',26,'DB',97,87,99,98],['Steve Atwater',27,'DB',91,99,96,96],['LeRoy Butler',36,'DB',92,90,97,94],['Aeneas Williams',35,'DB',93,86,98,95],
 ['Gary Anderson',1,'K',46,62,98,87],['Darren Bennett',2,'P',61,83,96,89]
 ]],
 [2000,'Sunday superstars','#ac393a','#edcfaf','vertical','zone','NE',[
 ['Peyton Manning',18,'QB',58,80,99,96],['Tom Brady',12,'QB',59,78,99,95],
 ['LaDainian Tomlinson',21,'RB',97,88,99,98],['Edgerrin James',32,'RB',92,92,97,96],['Lorenzo Neal',41,'FB',74,99,98,96],
 ['Randy Moss',84,'WR',99,78,98,95],['Terrell Owens',81,'WR',96,97,97,98],['Marvin Harrison',88,'WR',94,70,99,96],['Torry Holt',81,'WR',96,76,97,95],
 ['Tony Gonzalez',88,'TE',84,91,99,98],['Antonio Gates',85,'TE',83,94,98,95],
 ['Jonathan Ogden',75,'OL',57,99,99,95],['Alan Faneca',66,'OL',61,98,98,96],['Kevin Mawae',68,'OL',60,95,97,96],['Steve Hutchinson',76,'OL',57,99,99,96],['Walter Jones',71,'OL',61,98,99,97],['Orlando Pace',76,'OL',59,99,98,94],
 ['Michael Strahan',92,'DL',81,98,98,97],['Warren Sapp',99,'DL',79,97,98,94],['Dwight Freeney',93,'DL',92,90,98,92],['Richard Seymour',93,'DL',74,99,97,95],['Jason Taylor',99,'DL',88,92,98,96],
 ['Ray Lewis',52,'LB',90,97,99,99],['Brian Urlacher',54,'LB',92,94,98,97],['Derrick Brooks',55,'LB',92,85,99,98],['Zach Thomas',54,'LB',82,90,97,98],
 ['Champ Bailey',24,'DB',98,82,99,97],['Charles Woodson',24,'DB',94,90,99,98],['Ed Reed',20,'DB',94,84,99,97],['Troy Polamalu',43,'DB',95,93,98,96],['Brian Dawkins',20,'DB',92,96,98,97],
 ['Adam Vinatieri',4,'K',48,70,99,88],['Shane Lechler',9,'P',53,74,99,92],['Devin Hester',23,'WR',99,70,94,93]
 ]],
 [2010,'Space age','#3a5eaf','#d6e1f5','space','zone','SEA',[
 ['Aaron Rodgers',12,'QB',81,78,99,92],['Tom Brady',12,'QB',54,76,99,95],
 ['Adrian Peterson',28,'RB',98,97,98,97],['Marshawn Lynch',24,'RB',89,99,98,96],['LeSean McCoy',25,'RB',96,80,98,93],
 ['Calvin Johnson',81,'WR',98,98,99,95],['Julio Jones',11,'WR',97,94,98,95],['Antonio Brown',84,'WR',94,74,99,97],['Larry Fitzgerald',11,'WR',86,90,99,99],
 ['Rob Gronkowski',87,'TE',86,99,99,92],['Travis Kelce',87,'TE',86,90,98,96],
 ['Joe Thomas',73,'OL',54,96,99,99],['Marshal Yanda',73,'OL',56,97,99,97],['Maurkice Pouncey',53,'OL',64,94,97,94],['Zack Martin',70,'OL',60,97,99,97],['Tyron Smith',77,'OL',67,98,99,94],['Jason Peters',71,'OL',62,98,97,93],
 ['J.J. Watt',99,'DL',85,99,99,95],['Aaron Donald',99,'DL',91,99,99,98],['Fletcher Cox',91,'DL',80,98,97,95],['Calais Campbell',93,'DL',74,99,97,96],['Cameron Jordan',94,'DL',81,96,97,97],
 ['Luke Kuechly',59,'LB',91,89,99,98],['Bobby Wagner',54,'LB',90,94,99,98],['Von Miller',58,'LB',95,91,99,95],['Patrick Willis',52,'LB',93,96,99,97],
 ['Darrelle Revis',24,'DB',95,87,99,95],['Richard Sherman',25,'DB',89,92,99,97],['Earl Thomas',29,'DB',96,80,98,95],['Eric Berry',29,'DB',94,91,98,95],['Patrick Peterson',21,'DB',98,87,97,96],
 ['Justin Tucker',9,'K',52,66,99,89],['Johnny Hekker',6,'P',58,70,98,90],['Cordarrelle Patterson',84,'WR',99,93,91,94]
 ]],
 [2020,'New wave · so far','#5b7061','#d9f091','mobile','man','KC',[
 ['Patrick Mahomes',15,'QB',81,80,99,90],['Lamar Jackson',8,'QB',98,80,96,94],
 ['Derrick Henry',22,'RB',94,99,98,98],['Saquon Barkley',26,'RB',97,93,98,96],['Christian McCaffrey',23,'RB',93,84,99,94],
 ['Justin Jefferson',18,'WR',96,81,99,97],["Ja'Marr Chase",1,'WR',98,90,98,96],['Tyreek Hill',10,'WR',99,70,97,93],['A.J. Brown',11,'WR',94,98,97,95],
 ['Travis Kelce',87,'TE',84,91,99,96],['George Kittle',85,'TE',89,98,98,95],
 ['Trent Williams',71,'OL',67,99,99,95],['Quenton Nelson',56,'OL',59,99,98,96],['Jason Kelce',62,'OL',72,91,99,99],['Zack Martin',70,'OL',59,97,99,96],['Penei Sewell',58,'OL',69,99,99,97],['Lane Johnson',65,'OL',71,97,99,95],
 ['Myles Garrett',95,'DL',93,99,99,93],['Aaron Donald',99,'DL',90,99,99,97],['Chris Jones',95,'DL',76,99,98,91],['Maxx Crosby',98,'DL',85,96,98,99],['Nick Bosa',97,'DL',86,97,98,94],
 ['Fred Warner',54,'LB',91,88,99,99],['Roquan Smith',0,'LB',91,95,99,98],['T.J. Watt',90,'LB',89,97,99,97],['Micah Parsons',11,'LB',97,91,98,95],
 ['Patrick Surtain II',2,'DB',95,85,99,97],['Sauce Gardner',1,'DB',97,80,98,95],['Kyle Hamilton',14,'DB',92,96,98,97],['Antoine Winfield Jr.',31,'DB',93,91,98,96],['Derek Stingley Jr.',24,'DB',96,81,97,94],
 ['Brandon Aubrey',17,'K',56,72,98,89],['A.J. Cole',6,'P',58,73,98,91],['KaVontae Turpin',9,'WR',99,60,89,88]
 ]]
];
const BOOKS={
 1950:['dive','sbduo','iso','power','powerleft','counter','trapright','sweep','sweepleft','slants','curls','verts','flood'],
 1960:['dive','power','iso','sweep','sweepleft','tossright','tossleft','counter','slants','curls','verts','postwheel','smash'],
 1970:['dive','sbduo','counter','power','powerleft','trapright','iso','draw','sweep','verts','postwheel','dagger','flood','curls'],
 1980:['dive','counter','sweep','tossright','tossleft','slants','mesh','levels','drive','speedouts','comeback','flood','verts','smash','whip'],
 1990:['dive','stretch','counter','draw','power','iso','sweep','slants','curls','dagger','comeback','deepouts','mesh','smash','postwheel'],
 2000:['dive','sbduo','stretch','draw','counter','slants','mesh','verts','dagger','seamstretch','doublepost','scissors','bench','comeback','postwheel','deepouts'],
 2010:['dive','stretch','jetsweep','tossright','draw','slants','mesh','drive','levels','whip','spot','seamstretch','shallowwheel','bench','comeback','verts'],
 2020:['dive','sbduo','keeper','qbdraw','jetsweep','tossleft','stretch','mesh','drive','spot','flood','seamstretch','shallowwheel','cornerpost','verts','speedouts']
};
// Newer shotgun/pistol/bunch packages appear only in their appropriate PGI eras.
const PACKAGES={1980:['sbzone','sbstick','sbpa'],1990:['sbzone','sbstick','sbpa','sbpapost'],2000:['sbzone','sbstick','sbpa','bunchinside','bunchrub','bunchpa'],2010:['sbzone','sbstick','pistolzone','pistolquick','pistolpa','bunchinside','bunchrub','bunchpa'],2020:['sbzone','sbstick','pistolzone','pistoltoss','pistolquick','pistolpa','bunchinside','bunchtoss','bunchrub','bunchpa']};
const EXTRA={
 'Bo Jackson':{acceleration:99,agility:94,balance:97,catching:76,ballSecurity:86},'Barry Sanders':{acceleration:99,agility:99,balance:99,ballSecurity:92},
 'Walter Payton':{agility:96,balance:99,catching:91,ballSecurity:96},'Jim Brown':{agility:90,balance:99,ballSecurity:95},'Earl Campbell':{agility:79,balance:99,catching:65},
 'Gale Sayers':{acceleration:99,agility:99,balance:91},'Derrick Henry':{acceleration:85,agility:78,balance:99,catching:68},
 'Dan Marino':{accuracy:99,armStrength:99,agility:55},'Peyton Manning':{accuracy:99,armStrength:94,composure:99},'Tom Brady':{accuracy:99,composure:99,armStrength:94},
 'Deion Sanders':{acceleration:99,agility:99,coverage:99,tackling:66},'Devin Hester':{acceleration:99,agility:99,catching:83,ballSecurity:85},'Cordarrelle Patterson':{acceleration:99,agility:94,ballSecurity:89},
 'Jerry Rice':{routeRunning:99,catching:99,runBlock:85,ballSecurity:97},'Randy Moss':{acceleration:99,catching:98,routeRunning:95,runBlock:58}
};
export const DECADE_TEAMS=DECADES.map(([year,nickname,color,accent])=>({id:`D${year}`,year,city:`${year}s All-Decade${year===2020?' · so far':''}`,nickname,color,accent}));
export function decadeTeam(id,custom={}){
 const data=DECADES.find(t=>`D${t[0]}`===id);if(!data)throw Error('Unknown decade');
 const [year,nickname,color,accent,style,defStyle,venue,rows]=data;
 const roster=rows.map(([name,number,pos,speed,power,skill,endurance],i)=>{
  const p={...rate({id:`${id}-${i}`,name,number,pos,exp:6}),speed,power,endurance,durability:85,acceleration:Math.min(99,speed+2),agility:Math.min(99,speed+1),ratingSource:'PGI all-decade arcade estimate',ratingDate:'2026-11-03'};
  const keys=pos==='QB'?['accuracy','armStrength','composure']:['RB','FB'].includes(pos)?['balance','ballSecurity']:pos==='WR'?['catching','routeRunning']:pos==='TE'?['catching','runBlock']:pos==='OL'?['passBlock','runBlock']:['DL','LB','DB'].includes(pos)?['tackling','recognition',pos==='DL'?'shed':'coverage']:['kickPower','kickAccuracy','hangTime'];
  keys.forEach(k=>p[k]=skill);return {...p,...EXTRA[name]};
 });
 const used=new Set(),pick=(positions,key)=>{const eligible=roster.filter(p=>positions.includes(p.pos)&&!used.has(p.id)),p=eligible.find(p=>p.id===custom[key])||eligible[0];if(!p)throw Error(`Missing ${key} in ${id}`);used.add(p.id);return p;};
 const offense=[pick(['QB'],'qb'),pick(['RB','FB'],'rb'),pick(['WR'],'wr1'),pick(['WR'],'wr2'),pick(['TE'],'te'),pick(['OL'],'ol1'),pick(['OL'],'ol2')];used.clear();
 const defense=[pick(['DL'],'dl1'),pick(['DL'],'dl2'),pick(['LB'],'lb1'),pick(['LB'],'lb2'),pick(['DB'],'cb1'),pick(['DB'],'cb2'),pick(['DB'],'s')];
 const specialists=selectSpecialists(roster,custom);
 const byName=n=>roster.find(p=>p.name===n),returner={1950:'Frank Gifford',1960:'Gale Sayers',1970:'Cliff Branch',1980:'Bo Jackson',1990:'Deion Sanders',2000:'Devin Hester',2010:'Cordarrelle Patterson',2020:'KaVontae Turpin'}[year];
 for(const key of ['kr','pr'])if(!custom[key])specialists[key]=byName(returner);
 const profile={reviewed:'PGI era interpretation · 2020s through 2026',offense:{id:style,...OFFENSE_STYLES[style],name:nickname,strict:true,plays:[...BOOKS[year],...(PACKAGES[year]||[])],signature:BOOKS[year].slice(0,4)},defense:{id:defStyle,...DEFENSE_STYLES[defStyle],plays:year<1980?['zone','man','blitz','commit','cover2','cover3','press','prevent']:year===1980?['zone','man','blitz','commit','press','cover3','cover0','edgeleft','edgeright','twistleft']:DEFENSE_STYLES[defStyle].plays}};
 return {abbr:id,city:`${year}s All-Decade${year===2020?' · so far':''}`,decade:year,nickname,color,accent,venue,roster,offense,defense,specialists,profile,source:'https://www.profootballhof.com/news/nfl-s-all-decade-teams'};
}
