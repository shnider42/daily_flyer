import {rate} from './roster.js?v=33';
import {OFFENSIVE_SYSTEMS} from './offensive-systems.js?v=33';
import {OFFENSE_STYLES,DEFENSE_STYLES} from './teams.js?v=33';
import {selectSpecialists} from './special-teams.js?v=33';

// PGI selections across eras, not official university all-time teams. Ratings
// describe each athlete's college peak on a college-only arcade scale. They are
// not NFL ratings or predictions about real college-versus-professional games.
// Rows: name, college jersey, position, speed, strength, signature skill, endurance.
// Real college numbers are retained, including numbers shared across eras.
export const COLLEGE_RATING_LABEL='PGI college-peak arcade estimate';
const ROSTERS={
 C_BC:[
  ['Doug Flutie',22,'QB',88,69,95,92],['Matt Ryan',12,'QB',61,78,94,91],
  ['Andre Williams',34,'RB',89,96,95,97],['AJ Dillon',2,'RB',88,98,94,96],['William Green',1,'RB',94,88,94,92],['Mike Cloud',21,'RB',91,84,93,94],
  ['Zay Flowers',4,'WR',97,66,96,92],['Gerard Phelan',20,'WR',86,76,96,94],['Brian Brennan',13,'WR',87,74,93,92],['Rich Gunnell',18,'WR',88,78,92,93],
  ['Pete Mitchell',82,'TE',82,90,97,94],['Mark Chmura',89,'TE',78,93,93,92],
  ['Anthony Castonzo',74,'OL',61,93,96,96],['Chris Snee',76,'OL',57,97,95,94],['Dan Koppen',77,'OL',55,93,94,95],['Damien Woody',63,'OL',61,97,95,95],['Gosder Cherilus',77,'OL',55,97,94,94],['Ron Stone',67,'OL',54,96,92,93],
  ['Mike Ruth',68,'DL',70,99,98,94],['Mathias Kiwanuka',94,'DL',87,91,96,94],['B.J. Raji',90,'DL',68,99,95,91],['Mike Mamula',59,'DL',90,89,94,93],['Chris Hovan',95,'DL',74,95,94,95],
  ['Luke Kuechly',40,'LB',91,88,99,99],['Bill Romanowski',53,'LB',86,93,94,96],['Mark Herzlich',94,'LB',83,92,95,94],['Stephen Boyd',50,'LB',80,95,94,97],
  ['Will Blackmon',1,'DB',96,78,93,94],['DeJuan Tribble',27,'DB',91,78,93,92],['Tony Thurman',17,'DB',91,83,98,94],['Jamie Silva',44,'DB',85,90,96,97],['John Johnson',9,'DB',90,82,92,94],
  ['Nate Freese',85,'K',49,64,95,88],['Ryan Quigley',46,'P',52,72,92,90]
 ],
 C_ND:[
  ['Joe Montana',3,'QB',77,73,94,91],['Tony Rice',9,'QB',92,83,91,95],['Brady Quinn',10,'QB',72,83,95,93],
  ['Jerome Bettis',6,'RB',86,99,97,96],['Marc Edwards',44,'FB',77,95,92,94],['Allen Pinkett',20,'RB',92,80,96,96],['Reggie Brooks',40,'RB',96,83,95,93],
  ['Tim Brown',81,'WR',97,79,98,96],['Raghib Ismail',25,'WR',99,70,96,93],['Golden Tate',23,'WR',94,81,97,94],['Michael Floyd',3,'WR',91,91,96,94],
  ['Ken MacAfee',81,'TE',80,96,98,96],['Dave Casper',86,'TE',82,97,95,95],
  ['Ronnie Stanley',78,'OL',62,95,97,95],['Quenton Nelson',56,'OL',61,99,99,96],['Jeff Faine',52,'OL',59,94,96,95],['Zack Martin',70,'OL',62,96,98,97],['Aaron Taylor',75,'OL',58,98,98,96],['Ryan Harris',68,'OL',61,94,94,94],
  ['Ross Browner',89,'DL',84,96,99,97],['Alan Page',81,'DL',88,93,97,98],['Chris Zorich',50,'DL',76,99,98,97],['Bryant Young',97,'DL',78,97,96,94],['Walt Patulski',85,'DL',81,94,97,95],
  ["Manti Te'o",5,'LB',85,94,98,98],['Jaylon Smith',9,'LB',94,89,97,96],['Bob Crable',43,'LB',84,93,98,98],['Jim Lynch',61,'LB',82,94,97,97],
  ['Todd Lyght',1,'DB',97,81,98,95],['Bobby Taylor',21,'DB',93,92,96,94],['Harrison Smith',22,'DB',88,91,95,96],['Kyle Hamilton',14,'DB',94,94,98,95],['Tom Zbikowski',9,'DB',90,88,93,95],
  ['John Carney',18,'K',49,65,94,88],['Craig Hentrich',28,'P',59,72,97,92]
 ],
 C_MICH:[
  ['Tom Brady',10,'QB',59,76,91,91],['Chad Henne',7,'QB',63,82,93,94],['Denard Robinson',16,'QB',98,76,88,94],
  ['Mike Hart',20,'RB',88,87,98,99],['B.J. Askew',35,'FB',85,93,94,95],['Tyrone Wheatley',6,'RB',97,94,96,95],['Anthony Thomas',32,'RB',90,96,95,97],
  ['Desmond Howard',21,'WR',97,72,98,95],['Anthony Carter',1,'WR',98,71,98,96],['Braylon Edwards',1,'WR',94,92,97,95],['Mario Manningham',86,'WR',96,72,94,91],
  ['Ron Kramer',87,'TE',83,95,97,96],['Jake Butt',88,'TE',80,88,95,94],
  ['Jake Long',77,'OL',58,99,99,97],['Steve Hutchinson',76,'OL',57,98,98,97],['David Baas',75,'OL',55,97,97,95],['Dan Dierdorf',72,'OL',59,97,97,96],['Jon Jansen',77,'OL',57,96,96,96],['Jeff Backus',79,'OL',60,94,95,96],
  ['Aidan Hutchinson',97,'DL',86,95,98,97],['Brandon Graham',55,'DL',85,96,98,96],['Mark Messner',60,'DL',84,94,98,98],['Maurice Hurst',73,'DL',80,95,95,94],['Alan Branch',80,'DL',65,99,95,92],
  ['Devin Bush',10,'LB',95,87,96,96],['LaMarr Woodley',56,'DL',85,98,98,96],['Larry Foote',17,'LB',87,91,95,97],['Jarrett Irons',37,'LB',85,91,97,98],['Erick Anderson',37,'LB',87,92,98,98],
  ['Ty Law',22,'DB',94,90,97,95],['Charles Woodson',2,'DB',97,86,99,98],['Jabrill Peppers',5,'DB',96,87,95,95],['Tripp Welborne',3,'DB',92,88,98,96],['Leon Hall',29,'DB',94,85,96,96],
  ['Jake Moody',13,'K',52,72,98,91],['Zoltan Mesko',41,'P',60,77,96,93]
 ],
 C_OSU:[
  ['Troy Smith',10,'QB',86,82,97,93],['Justin Fields',1,'QB',93,88,96,94],['C.J. Stroud',7,'QB',75,81,98,93],
  ['Archie Griffin',45,'RB',94,88,99,99],['Pete Johnson',33,'FB',80,99,97,97],['Eddie George',27,'RB',91,98,98,98],['Ezekiel Elliott',15,'RB',95,93,97,97],['Keith Byars',41,'RB',92,96,97,95],
  ['Cris Carter',2,'WR',89,87,98,95],['Marvin Harrison Jr.',18,'WR',96,89,98,96],['Terry Glenn',83,'WR',98,70,96,94],['David Boston',9,'WR',94,95,97,94],
  ['John Frank',89,'TE',81,88,94,94],['Rickey Dudley',80,'TE',88,94,94,92],
  ['Orlando Pace',75,'OL',62,99,99,98],['Jim Lachey',64,'OL',62,97,97,95],['Nick Mangold',55,'OL',62,95,97,97],['Jim Parker',62,'OL',58,99,99,97],['Wyatt Davis',52,'OL',59,96,96,94],['LeCharles Bentley',68,'OL',63,96,97,95],
  ['Chase Young',2,'DL',91,97,99,96],['Joey Bosa',97,'DL',85,98,98,96],['Dan Wilkinson',72,'DL',73,99,97,94],['Jim Stillwagon',68,'DL',78,98,99,98],['Nick Bosa',97,'DL',85,96,96,91],
  ['Chris Spielman',36,'LB',83,97,99,99],['A.J. Hawk',47,'LB',89,93,98,98],['James Laurinaitis',33,'LB',87,91,98,98],['Randy Gradishar',53,'LB',86,93,99,98],
  ['Antoine Winfield',11,'DB',96,90,99,96],['Shawn Springs',24,'DB',98,84,97,94],['Jack Tatum',32,'DB',92,99,98,96],['Mike Doss',2,'DB',90,93,97,97],['Malcolm Jenkins',2,'DB',92,91,97,97],
  ['Mike Nugent',85,'K',54,70,98,92],['Tom Skladany',1,'P',61,76,99,94]
 ],
 C_BAMA:[
  ['Tua Tagovailoa',13,'QB',80,76,98,91],['Bryce Young',9,'QB',85,65,97,92],['Joe Namath',12,'QB',77,81,94,89],
  ['Derrick Henry',2,'RB',94,99,98,99],['Mark Ingram',22,'RB',89,95,97,96],['Shaun Alexander',37,'RB',93,91,96,96],['Trent Richardson',3,'RB',92,98,96,94],
  ['DeVonta Smith',6,'WR',96,64,99,97],['Julio Jones',8,'WR',97,93,97,96],['Amari Cooper',9,'WR',96,81,98,97],['Don Hutson',14,'WR',97,73,97,96],
  ['Ozzie Newsome',82,'WR',87,88,97,96],['O.J. Howard',88,'TE',92,90,95,94],['Irv Smith Jr.',82,'TE',87,88,93,93],
  ['Chris Samuels',60,'OL',62,98,99,97],['John Hannah',73,'OL',60,99,99,97],['Ryan Kelly',70,'OL',62,94,97,97],['Barrett Jones',75,'OL',56,95,98,97],['Andre Smith',71,'OL',56,99,98,95],['Chance Warmack',65,'OL',58,99,97,95],
  ['Jonathan Allen',93,'DL',83,97,99,97],['Quinnen Williams',92,'DL',78,99,98,94],['Marcell Dareus',57,'DL',78,98,97,94],['Daron Payne',94,'DL',76,99,96,95],['John Copeland',94,'DL',85,96,98,96],
  ['Derrick Thomas',55,'LB',96,92,99,97],['Cornelius Bennett',97,'LB',93,95,99,97],['Lee Roy Jordan',54,'LB',84,97,99,99],['DeMeco Ryans',35,'LB',86,93,97,98],
  ['Patrick Surtain II',2,'DB',95,88,99,96],['Antonio Langham',43,'DB',95,84,98,95],['Minkah Fitzpatrick',29,'DB',95,89,99,97],['Mark Barron',4,'DB',90,95,97,96],['Ha Ha Clinton-Dix',6,'DB',93,86,96,94],
  ['Will Reichard',16,'K',52,70,99,94],['J.K. Scott',15,'P',58,76,99,94]
 ],
 C_AUB:[
  ['Cam Newton',2,'QB',94,98,98,98],['Pat Sullivan',7,'QB',78,74,97,93],['Nick Marshall',14,'QB',95,80,91,94],
  ['Bo Jackson',34,'RB',99,99,99,98],['Ronnie Brown',23,'RB',93,96,95,95],['Carnell Williams',24,'RB',95,85,97,96],['Tre Mason',21,'RB',94,86,96,98],
  ['Terry Beasley',88,'WR',96,76,98,96],['Frank Sanders',81,'WR',94,87,97,95],['Darvin Adams',89,'WR',91,80,94,93],['Seth Williams',18,'WR',91,91,93,94],
  ['Philip Lutzenkirchen',43,'TE',79,91,94,92],['Fred Baxter',85,'TE',80,93,91,93],
  ['Willie Anderson',71,'OL',59,99,98,96],['Ben Grubbs',69,'OL',62,96,96,95],['Reese Dismukes',50,'OL',60,94,98,97],['Ed King',67,'OL',58,98,98,95],['Marcus McNeill',73,'OL',57,98,97,95],['Kendall Simmons',73,'OL',60,96,95,94],
  ['Tracy Rocker',74,'DL',82,99,99,97],['Nick Fairley',90,'DL',81,99,98,95],['Kevin Greene',90,'DL',88,93,94,96],['Dee Ford',30,'DL',92,89,96,94],['Carl Lawson',55,'DL',88,96,95,93],
  ['Takeo Spikes',55,'LB',90,96,98,97],['Karlos Dansby',11,'LB',91,91,97,96],['Freddie Smith',31,'LB',84,94,98,99],['Kurt Crain',39,'LB',83,93,97,97],
  ['Carlos Rogers',14,'DB',95,88,99,95],['Chris Davis',11,'DB',94,80,94,94],['Junior Rosegreen',4,'DB',91,89,96,95],['David Langner',28,'DB',91,85,95,96],['Jerraud Powers',8,'DB',93,78,94,94],
  ['Al Del Greco',3,'K',51,68,96,90],['Steven Clark',30,'P',55,77,96,93]
 ],
 C_UF:[
  ['Tim Tebow',15,'QB',89,96,96,99],['Danny Wuerffel',7,'QB',65,72,99,94],['Steve Spurrier',11,'QB',76,72,96,94],
  ['Emmitt Smith',22,'RB',91,92,98,99],['John L. Williams',22,'FB',88,95,95,96],['Fred Taylor',21,'RB',98,93,96,94],['Errict Rhett',33,'RB',89,93,96,98],
  ['Percy Harvin',1,'WR',99,81,98,94],['Ike Hilliard',19,'WR',93,78,98,96],['Wes Chandler',89,'WR',97,78,98,96],['Carlos Alvarez',45,'WR',92,75,98,95],
  ['Kyle Pitts',84,'TE',95,86,98,94],['Ben Troupe',84,'TE',88,94,94,92],
  ['Lomas Brown',75,'OL',61,97,99,97],['Mike Pouncey',55,'OL',65,95,97,95],['Maurkice Pouncey',56,'OL',65,95,98,96],['Jason Odom',74,'OL',58,96,97,95],['Max Starks',77,'OL',54,99,94,94],['Jeff Mitchell',71,'OL',58,94,94,95],
  ['Jack Youngblood',74,'DL',83,95,99,99],['Alex Brown',13,'DL',88,92,98,97],['Sharrif Floyd',73,'DL',80,97,96,94],['Ellis Johnson',61,'DL',81,97,98,96],['Carlos Dunlap',8,'DL',89,97,95,93],['Kevin Carter',57,'DL',89,96,98,96],
  ['Wilber Marshall',88,'LB',93,97,99,98],['Brandon Spikes',51,'LB',83,97,98,98],['Jevon Kearse',42,'LB',99,92,98,94],['Channing Crowder',55,'LB',88,94,96,95],['Scot Brantley',55,'LB',81,96,96,97],
  ['Lito Sheppard',3,'DB',97,79,98,95],['Joe Haden',5,'DB',95,87,98,96],['Reggie Nelson',1,'DB',96,86,99,96],['Lawrence Wright',4,'DB',91,93,98,95],['Vernon Hargreaves III',1,'DB',95,82,98,94],
  ['Caleb Sturgis',19,'K',53,69,97,91],['Chas Henry',17,'P',59,74,98,94]
 ],
 C_BOISE:[
  ['Kellen Moore',11,'QB',62,71,99,96],['Jared Zabransky',5,'QB',88,79,93,95],['Brett Rypien',4,'QB',67,75,94,95],
  ['Ashton Jeanty',2,'RB',96,96,99,99],['Ian Johnson',41,'RB',92,87,96,98],['Doug Martin',22,'RB',94,95,96,96],['Jay Ajayi',27,'RB',94,94,96,97],
  ['Titus Young',1,'WR',98,68,96,94],['Austin Pettis',2,'WR',87,88,97,96],['Thomas Sperbeck',82,'WR',89,77,96,97],['Khalil Shakir',2,'WR',94,80,96,96],
  ['Derek Schouman',91,'TE',82,88,94,94],['Dave Stachelski',89,'TE',79,92,93,93],
  ['Ryan Clady',79,'OL',63,97,98,96],['Daryn Colledge',73,'OL',63,93,96,96],['Matt Paradis',65,'OL',60,92,95,97],['Nate Potter',73,'OL',60,94,97,96],['Ezra Cleveland',76,'OL',67,92,95,95],['John Ojukwu',70,'OL',61,96,94,96],
  ['Curtis Weaver',99,'DL',84,94,98,95],['DeMarcus Lawrence',8,'DL',89,93,97,94],['Shea McClellin',92,'DL',90,90,96,96],['Ryan Winterswyk',98,'DL',80,94,96,97],['Billy Winn',90,'DL',80,97,94,94],
  ['Leighton Vander Esch',38,'LB',91,91,98,98],['Korey Hall',25,'LB',87,91,98,98],['Andy Avalos',40,'LB',84,91,95,98],['Tanner Vallejo',20,'LB',90,88,94,96],
  ['Kyle Wilson',1,'DB',97,80,98,96],['Orlando Scandrick',8,'DB',97,78,95,94],['George Iloka',8,'DB',91,94,96,96],['Darian Thompson',4,'DB',91,87,97,96],['Quintin Mikell',9,'DB',91,85,96,97],['Winston Venable',17,'DB',91,87,94,96],
  ['Jonah Dalmas',35,'K',52,71,98,94],['Kyle Brotzman',35,'P',57,73,95,92]
 ],
 C_MIAMI:[
  ['Ken Dorsey',11,'QB',61,75,97,96],['Gino Torretta',13,'QB',67,78,97,95],['Bernie Kosar',20,'QB',57,80,96,94],
  ['Edgerrin James',5,'RB',95,93,98,98],['Alonzo Highsmith',30,'FB',89,99,97,97],['Clinton Portis',28,'RB',98,87,97,95],['Willis McGahee',2,'RB',97,95,98,95],
  ['Michael Irvin',47,'WR',94,93,98,96],['Andre Johnson',5,'WR',98,96,97,95],['Reggie Wayne',87,'WR',92,82,98,97],['Santana Moss',6,'WR',99,67,98,95],
  ['Jeremy Shockey',88,'TE',88,97,97,95],['Kellen Winslow II',81,'TE',91,93,98,94],
  ['Bryant McKinnie',78,'OL',56,99,99,97],['Leon Searcy',73,'OL',64,98,98,96],['Brett Romberg',66,'OL',57,96,98,97],['Vernon Carey',60,'OL',57,98,96,95],['Eric Winston',74,'OL',65,95,96,95],['Chris Myers',77,'OL',61,93,95,96],
  ['Ted Hendricks',89,'DL',88,93,99,98],['Warren Sapp',76,'DL',87,98,99,96],['Jerome Brown',98,'DL',82,99,99,97],['Calais Campbell',81,'DL',85,96,95,94],['Cortez Kennedy',96,'DL',73,99,97,94],['Vince Wilfork',75,'DL',69,99,96,95],
  ['Ray Lewis',52,'LB',93,95,98,99],['Dan Morgan',44,'LB',92,93,99,99],['Jonathan Vilma',51,'LB',91,89,98,98],['Jessie Armstead',1,'LB',92,91,97,96],
  ['Antrel Rolle',6,'DB',96,92,98,96],['Duane Starks',22,'DB',97,78,96,94],['Ed Reed',20,'DB',96,85,99,98],['Sean Taylor',26,'DB',97,99,99,97],['Bennie Blades',36,'DB',93,97,99,97],
  ['Carlos Huerta',27,'K',50,69,99,93],['Jeff Feagles',38,'P',55,73,96,92]
 ]
};

const white='#FFFFFF';
const kit=(jersey,helmet,pants,number,stripe,helmetPattern='double-stripe')=>({jersey,helmet,pants,number,stripe,helmetPattern});
const settings=[
 ['C_BC','BC','Boston College','Eagles','#98002E','#BC9B6A','mobile','zone','westcoast','Alumni Stadium','Chestnut Hill, MA','north',
  'Flutie moving pocket','Move the launch point, use the tight end, then take the deep shot.',['flood','verts','sbstick','counter'],['pistolquick','pistolpa'],
  kit('#98002E','#BC9B6A','#BC9B6A',white,'#98002E','stripe'),kit(white,'#BC9B6A','#BC9B6A','#98002E','#98002E','stripe'),
  'https://bceagles.com/documents/download/2025/9/9/RecordBookFootball.pdf','Will Blackmon'],
 ['C_ND','ND','Notre Dame','Fighting Irish','#0C2340','#C99700','power','zone','poweri','Notre Dame Stadium','Notre Dame, IN','north',
  'Irish power & play action','Bettis behind a fullback, with Brown and Rocket stretching the field.',['iso','power','sbpa','tossright'],['wtbuck','wttrap'],
  kit('#0C2340','#C5B783','#C5B783',white,'#C5B783','plain'),kit(white,'#C5B783','#C5B783','#0C2340','#C5B783','plain'),
  'https://fightingirish.com/wp-content/uploads/2025/08/2025-Notre-Dame-Football-History-Records-Book.pdf','Raghib Ismail'],
 ['C_MICH','MICH','Michigan','Wolverines','#00274C','#FFCB05','power','man','poweri','Michigan Stadium','Ann Arbor, MI','lakes',
  'Michigan power & timing','Brady directs the pocket; Hart works behind an imposing offensive line.',['power','counter','sbstick','sbpa'],['wcslantflat','wcspot'],
  kit('#00274C','#00274C','#FFCB05','#FFCB05','#FFCB05','winged'),kit(white,'#00274C','#FFCB05','#00274C','#FFCB05','winged'),
  'https://bentley.umich.edu/discover/athletics/football/','Desmond Howard'],
 ['C_OSU','OSU','Ohio State','Buckeyes','#BB0000','#A7B1B7','mobile','pressure','spread','Ohio Stadium','Columbus, OH','lakes',
  'Buckeye power spread','Griffin and the quarterback run threat set up receivers outside.',['dive','keeper','qbdraw','verts'],['power','sbpa'],
  kit('#BB0000','#C6C6C6','#C6C6C6',white,'#BB0000'),kit(white,'#C6C6C6','#C6C6C6','#BB0000','#BB0000'),
  'https://ohiostatebuckeyes.com/documents/download/2025/9/9/FB2025MediaGuide.pdf','Terry Glenn'],
 ['C_BAMA','BAMA','Alabama','Crimson Tide','#9E1B32',white,'power','man','pistolpa','Bryant-Denny Stadium','Tuscaloosa, AL','southeast',
  'Crimson power & explosives','Henry draws the box in; Smith and Jones punish isolated coverage.',['dive','sbduo','pspaover','verts'],['sbstick','sbpa','slants'],
  kit('#9E1B32','#9E1B32',white,white,white,'numbers'),kit(white,'#9E1B32',white,'#9E1B32',white,'numbers'),
  'https://rolltide.com/documents/download/2025/7/28/2025_Record_Book.pdf','DeVonta Smith'],
 ['C_AUB','AUB','Auburn','Tigers','#0C2340','#E87722','mobile','pressure','spread','Jordan-Hare Stadium','Auburn, AL','southeast',
  'Plains power & misdirection','Cam and Bo threaten different gaps from the same backfield.',['keeper','qbdraw','counter','pspaboot'],['pscounter','sweepleft','sbpa'],
  kit('#0C2340',white,white,white,'#E87722'),kit(white,white,white,'#0C2340','#E87722'),
  'https://auburntigers.com/football-archives','Chris Davis'],
 ['C_UF','UF','Florida','Gators','#0021A5','#FA4616','mobile','man','spread','Ben Hill Griffin Stadium','Gainesville, FL','florida',
  'Tebow power spread','QB power and Harvin on the edge, with a vertical tight-end answer.',['keeper','qbdraw','jetsweep','spseam'],['psduo','seamstretch','slants'],
  kit('#0021A5','#FA4616',white,white,'#0021A5'),kit(white,'#FA4616',white,'#0021A5','#0021A5'),
  'https://floridagators.com/documents/download/2026/1/27/Florida_Football_Media_Guide_2025.pdf','Percy Harvin'],
 ['C_BOISE','BSU','Boise State','Broncos','#0033A0','#D64309','quick','zone','westcoast','Albertsons Stadium','Boise, ID','mountain',
  'Bronco shifts & deception','Moore finds rhythm throws; Jeanty and the play fake create space.',['counter','sbpa','mesh','flood'],['pscounter','pspaboot','bunchrub','bunchpa'],
  kit('#0033A0','#0033A0','#0033A0',white,'#D64309','stripe'),kit(white,'#0033A0','#D64309','#0033A0','#D64309','stripe'),
  'https://broncosports.com/documents/download/2025/8/15/2025_Boise_State_Football_Record_Book.pdf','Kyle Wilson'],
 ['C_MIAMI','MIA','Miami','Hurricanes','#F47321','#005030','vertical','man','rungun','Orange Bowl','Miami, FL','florida',
  'Hurricane speed & verticals','Fast receivers and powerful backs attack behind a deep defensive roster.',['verts','postwheel','stretch','sbpa'],['slants','seamstretch','sbstick'],
  kit('#F47321',white,white,white,'#005030'),kit(white,white,white,'#005030','#F47321'),
  'https://miamihurricanes.com/news/2012/07/25/205557530-2','Santana Moss']
];

const extras={
 'Doug Flutie':{accuracy:94,armStrength:93,composure:98,agility:94},
 'Matt Ryan':{accuracy:96,armStrength:91,composure:96},
 'Tom Brady':{accuracy:92,armStrength:88,composure:95,agility:61},
 'Joe Montana':{accuracy:94,armStrength:88,composure:98},
 'Tony Rice':{accuracy:82,armStrength:87,balance:92,ballSecurity:91},
 'Denard Robinson':{accuracy:82,armStrength:88,agility:99,balance:91},
 'Cam Newton':{accuracy:92,armStrength:97,composure:98,balance:99,agility:94},
 'Tim Tebow':{accuracy:89,armStrength:90,composure:98,balance:98,ballSecurity:96},
 'Kellen Moore':{accuracy:99,armStrength:85,composure:99},
 'Tua Tagovailoa':{accuracy:99,armStrength:93,composure:97},
 'Bo Jackson':{acceleration:99,agility:97,balance:99,catching:78,ballSecurity:89},
 'Derrick Henry':{acceleration:85,agility:81,balance:99,catching:70},
 'Ashton Jeanty':{acceleration:97,agility:96,balance:99,ballSecurity:94},
 'Mike Hart':{acceleration:92,agility:96,balance:96,ballSecurity:99},
 'Andre Williams':{acceleration:87,agility:83,balance:98,catching:55},
 'AJ Dillon':{acceleration:85,agility:79,balance:98,catching:69},
 'Jerome Bettis':{acceleration:86,agility:83,balance:99,runBlock:85},
 'Percy Harvin':{acceleration:99,agility:99,balance:92,ballSecurity:88},
 'Raghib Ismail':{acceleration:99,agility:99,catching:91,ballSecurity:87},
 'Desmond Howard':{acceleration:98,agility:98,catching:98,ballSecurity:93},
 'Charles Woodson':{catching:93,agility:98,coverage:99,recognition:99},
 'Chris Davis':{agility:97,acceleration:96,catching:84,ballSecurity:92},
 'Ed Reed':{catching:96,coverage:99,recognition:99},
 'Sean Taylor':{tackling:99,coverage:97,recognition:97},
 'Luke Kuechly':{coverage:96,recognition:99,tackling:99},
 'Derrick Thomas':{shed:99,tackling:96,coverage:84},
 'Jevon Kearse':{acceleration:99,agility:94,shed:99}
};

function createPlayer(id,row,index){
 const [name,number,pos,speed,power,skill,endurance]=row;
 // An empty name deliberately bypasses the live NFL name-based overrides.
 const p={...rate({id:`${id}-${index}`,name:'',number,pos,exp:3}),name,speed,power,endurance,durability:87,
  acceleration:Math.min(99,speed+2),agility:Math.min(99,speed+1),ratingSource:COLLEGE_RATING_LABEL,ratingDate:'2026-11-07'};
 const keys=pos==='QB'?['accuracy','armStrength','composure']:['RB','FB'].includes(pos)?['balance','ballSecurity']:pos==='WR'?['catching','routeRunning']:pos==='TE'?['catching','runBlock']:pos==='OL'?['passBlock','runBlock']:['DL','LB','DB'].includes(pos)?['tackling','recognition',pos==='DL'?'shed':'coverage']:['kickPower','kickAccuracy','hangTime'];
 keys.forEach(k=>p[k]=skill);
 if(pos==='FB'){p.runBlock=skill;p.passBlock=skill-3;}
 return {...p,...extras[name]};
}

export const COLLEGE_TEAMS=settings.map(([id,displayAbbr,city,nickname,color,accent,style,defense,system,stadium,locale,climate,identity,description,signature,additional,home,away,source,returner])=>({
 id,abbr:id,displayAbbr,city,nickname,color,accent,college:true,level:'college',ruleset:'college',allTime:true,
 identity,description,style,defenseStyle:defense,system,signature,additional,returner,source,
 ratingScale:'college',ratingLabel:COLLEGE_RATING_LABEL,
 venue:{name:stadium,city:locale,climate,roof:'open',...(id==='C_MIAMI'?{historic:true}:{})},
 field:{surface:id==='C_BOISE'?'#0057B8':'#466B46',alternate:id==='C_BOISE'?'#0751A5':'#426640',endZone:color},
 uniforms:{home,away}
}));

export function collegeTeam(id,custom={}){
 const meta=COLLEGE_TEAMS.find(t=>t.id===id);if(!meta)throw Error('Unknown college team');
 const roster=ROSTERS[id].map((row,i)=>createPlayer(id,row,i));
 const used=new Set();
 const pick=(positions,key)=>{
  const eligible=roster.filter(p=>positions.includes(p.pos)&&!used.has(p.id));
  const p=eligible.find(p=>p.id===custom[key])||eligible[0];
  if(!p)throw Error(`Missing ${key} in ${id}`);used.add(p.id);return p;
 };
 const offense=[pick(['QB'],'qb'),pick(['RB','FB'],'rb'),pick(['WR'],'wr1'),pick(['WR'],'wr2'),pick(['TE'],'te'),pick(['OL'],'ol1'),pick(['OL'],'ol2')];
 used.clear();
 const defense=[pick(['DL'],'dl1'),pick(['DL'],'dl2'),pick(['LB'],'lb1'),pick(['LB'],'lb2'),pick(['DB'],'cb1'),pick(['DB'],'cb2'),pick(['DB'],'s')];
 const specialists=selectSpecialists(roster,custom),returner=roster.find(p=>p.name===meta.returner);
 for(const key of ['kr','pr'])if(!custom[key])specialists[key]=returner;
 const plays=[...new Set([...meta.signature,...OFFENSE_STYLES[meta.style].plays,...OFFENSIVE_SYSTEMS[meta.system].plays,...meta.additional])];
 const profile={reviewed:'PGI college identity interpretation · 2026-11-07',
  offense:{...OFFENSE_STYLES[meta.style],id:meta.style,system:meta.system,name:meta.identity,strength:meta.description,strict:true,plays,signature:[...meta.signature]},
  defense:{...DEFENSE_STYLES[meta.defenseStyle],id:meta.defenseStyle,personnel:['C_BAMA','C_BOISE','C_UF'].includes(id)?'nickel':'base',plays:[...DEFENSE_STYLES[meta.defenseStyle].plays]}};
 return {...meta,venue:{...meta.venue},field:{...meta.field},uniforms:{home:{...meta.uniforms.home},away:{...meta.uniforms.away}},roster,offense,defense,specialists,profile};
}
