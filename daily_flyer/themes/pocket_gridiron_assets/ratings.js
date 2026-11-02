// Hand-tuned arcade estimates, not official NFL or licensed ratings.
export const RATING_DATE='2026-11-01';
const clamp=n=>Math.max(40,Math.min(99,Math.round(n)));
export function enrichRatings(p){
 const qb=p.pos==='QB',back=['RB','FB'].includes(p.pos),wr=p.pos==='WR',te=p.pos==='TE',line=['OL','C','G','T','OT','OG'].includes(p.pos),dl=['DL','DT','DE'].includes(p.pos),db=['DB','CB','S','FS','SS'].includes(p.pos),kick=['K','P'].includes(p.pos);
 const experience=Math.max(-2,Math.min(3,(p.exp||0)-2));
 const base={acceleration:wr?89:back?85:db?86:line?52:73,agility:wr?87:back?83:db?85:line?48:70,balance:back?84:te?80:74,catching:wr?83:te?85:back?77:48,routeRunning:wr?83:te?78:back?68:45,ballSecurity:80,armStrength:qb?85:45,composure:qb?80+experience:65,passBlock:line?82:back?65:te?67:45,runBlock:line?84:te?76:back?67:wr?56:48,tackling:dl?85:db?77:line?60:82,coverage:db?83:dl?45:72,recognition:78+experience,shed:dl?85:db?64:77,kickPower:kick?85:55,kickAccuracy:kick?82:50,hangTime:kick?83:50};
 const special=INDIVIDUAL[p.name]||{};
 return {...p,...Object.fromEntries(Object.entries({...base,...special}).map(([k,v])=>[k,clamp(v)])),ratingSource:INDIVIDUAL[p.name]?'Individual arcade estimate':'Position baseline',ratingDate:RATING_DATE};
}
// Overrides are kept separate from the live roster, so refreshes preserve tuning.
const INDIVIDUAL={
 'Lamar Jackson':{agility:96,acceleration:97,balance:90,armStrength:91,composure:88,ballSecurity:80},
 'Josh Allen':{balance:94,armStrength:99,composure:90,ballSecurity:78,agility:83},
 'Patrick Mahomes':{armStrength:96,composure:98,agility:88,ballSecurity:86},
 'Drake Maye':{armStrength:94,composure:81,agility:85,balance:85},
 'Joe Burrow':{accuracy:96,armStrength:89,composure:95},'Justin Herbert':{accuracy:92,armStrength:98,composure:89},
 'Jalen Hurts':{speed:87,power:92,agility:87,balance:94,armStrength:89,composure:87},
 'Jayden Daniels':{speed:95,agility:95,acceleration:95,accuracy:89,armStrength:89,composure:85},
 'Jordan Love':{armStrength:94,accuracy:86,composure:82},'Jared Goff':{accuracy:94,armStrength:85,composure:90,speed:65},
 'C.J. Stroud':{accuracy:91,armStrength:91,composure:85},'Brock Purdy':{accuracy:93,armStrength:82,composure:91},
 'Dak Prescott':{accuracy:90,armStrength:88,composure:88},'Baker Mayfield':{accuracy:88,armStrength:90,composure:87},
 'Trevor Lawrence':{armStrength:93,accuracy:86,composure:80},'Bo Nix':{speed:83,accuracy:87,composure:83},
 'Caleb Williams':{speed:84,agility:91,armStrength:95,accuracy:84,composure:78},
 'Matthew Stafford':{accuracy:94,armStrength:95,composure:95,speed:61},'Sam Darnold':{armStrength:92,accuracy:86,composure:81},
 'Kyler Murray':{speed:95,acceleration:96,agility:98,armStrength:91,composure:81},
 'Aaron Rodgers':{accuracy:93,armStrength:91,composure:96,speed:60},'Tua Tagovailoa':{accuracy:95,armStrength:80,composure:86},
 'Bryce Young':{accuracy:85,agility:84,armStrength:79,composure:80},'Cam Ward':{armStrength:95,agility:84,composure:75},
 'J.J. McCarthy':{armStrength:88,accuracy:83,composure:76},'Michael Penix Jr.':{armStrength:96,accuracy:86,composure:77},
 'Daniel Jones':{speed:86,accuracy:81,composure:77},'Jaxson Dart':{speed:84,armStrength:90,composure:74},
 'Dillon Gabriel':{accuracy:84,armStrength:78,composure:75},'Tyler Shough':{armStrength:90,accuracy:82,composure:74},
 'Geno Smith':{accuracy:89,armStrength:90,composure:85},'Tanner McKee':{accuracy:83,armStrength:87,composure:76},
 'Derrick Henry':{balance:99,agility:73,acceleration:80,ballSecurity:90,catching:65},
 'Saquon Barkley':{agility:97,balance:94,acceleration:96,ballSecurity:87,catching:83},
 'Bijan Robinson':{agility:96,balance:94,acceleration:94,catching:90,ballSecurity:86},
 'Jahmyr Gibbs':{agility:98,acceleration:99,balance:82,catching:89,ballSecurity:84},
 'James Cook':{speed:93,agility:93,acceleration:95,balance:81,catching:84},
 'Jonathan Taylor':{speed:93,power:91,balance:93,acceleration:94,ballSecurity:88},
 'Christian McCaffrey':{speed:90,agility:96,catching:96,routeRunning:94,balance:90,ballSecurity:90},
 "De'Von Achane":{speed:99,acceleration:99,agility:98,power:68,balance:77,catching:86},
 'Josh Jacobs':{power:94,balance:95,ballSecurity:88,agility:85},'Breece Hall':{speed:94,acceleration:95,catching:86},
 'Kenneth Walker III':{speed:92,agility:94,balance:89},'TreVeyon Henderson':{speed:95,acceleration:97,agility:93,balance:81,passBlock:78},
 'Ashton Jeanty':{power:91,balance:94,agility:90,acceleration:90},
 'Justin Jefferson':{catching:97,routeRunning:99,agility:95,balance:90,ballSecurity:89},
 "Ja'Marr Chase":{catching:95,routeRunning:95,agility:94,balance:94,ballSecurity:86},
 'Puka Nacua':{catching:95,routeRunning:94,power:88,balance:94,runBlock:82},
 'CeeDee Lamb':{speed:93,catching:94,routeRunning:96,agility:96,balance:89},
 'Amon-Ra St. Brown':{catching:97,routeRunning:98,ballSecurity:93,runBlock:78,speed:87},
 'A.J. Brown':{catching:94,routeRunning:90,balance:97,runBlock:83},
 'Nico Collins':{speed:92,power:89,catching:93,routeRunning:91,balance:91},
 'Malik Nabers':{speed:95,acceleration:97,agility:96,catching:89,routeRunning:89},
 'Garrett Wilson':{agility:96,catching:92,routeRunning:94},'Jaxon Smith-Njigba':{catching:94,routeRunning:96,agility:94},
 'Drake London':{power:91,catching:94,balance:94,routeRunning:89},'DeVonta Smith':{speed:94,catching:93,routeRunning:96,power:62},
 'Zay Flowers':{speed:96,agility:98,acceleration:97,routeRunning:91,power:62},'DJ Moore':{speed:94,power:85,catching:90,balance:90},
 'Khalil Shakir':{catching:94,agility:92,routeRunning:91},'Xavier Worthy':{acceleration:99,agility:97,catching:80,balance:70},
 'Rashee Rice':{catching:90,power:85,balance:91},'Ladd McConkey':{catching:94,routeRunning:97,agility:95},
 'Tee Higgins':{catching:94,power:88,balance:93},'Courtland Sutton':{catching:92,power:91,balance:93},
 'George Pickens':{catching:94,speed:93,balance:91},'Marvin Harrison Jr.':{catching:90,routeRunning:92,power:84},
 'Travis Kelce':{catching:97,routeRunning:98,balance:94,runBlock:78},'Brock Bowers':{speed:86,catching:95,routeRunning:95,balance:94},
 'Trey McBride':{catching:96,routeRunning:91,power:88},'George Kittle':{catching:93,runBlock:97,power:96,balance:96},
 'Sam LaPorta':{catching:92,routeRunning:92,runBlock:85},'Mark Andrews':{catching:93,routeRunning:91,power:90},
 'Hunter Henry':{catching:91,routeRunning:86,runBlock:83},'Dalton Kincaid':{catching:89,routeRunning:90},
 'Myles Garrett':{power:98,shed:99,tackling:95,recognition:95},'T.J. Watt':{shed:98,tackling:96,recognition:98,coverage:79},
 'Micah Parsons':{speed:93,shed:98,tackling:91,recognition:91},'Maxx Crosby':{shed:97,tackling:96,power:96,recognition:94},
 'Aidan Hutchinson':{shed:94,tackling:92,power:93},'Chris Jones':{power:99,shed:97,tackling:93},
 'Dexter Lawrence':{power:99,shed:97,tackling:95},'Christian Barmore':{power:94,shed:88,tackling:88},
 'Fred Warner':{coverage:96,recognition:99,tackling:97,speed:86},'Roquan Smith':{tackling:98,recognition:97,coverage:90},
 'Patrick Surtain II':{coverage:99,recognition:95,speed:93,tackling:82},'Sauce Gardner':{coverage:97,recognition:92,speed:94},
 'Derek Stingley Jr.':{coverage:96,speed:94,recognition:92},'Christian Gonzalez':{coverage:95,speed:95,recognition:90},
 'Kyle Hamilton':{coverage:94,recognition:97,tackling:95,power:91},'Antoine Winfield Jr.':{coverage:93,tackling:94,recognition:96},
 'Trent Williams':{passBlock:98,runBlock:99,power:99},'Penei Sewell':{passBlock:96,runBlock:99,power:98},
 'Lane Johnson':{passBlock:99,runBlock:95},'Joe Thuney':{passBlock:97,runBlock:94},'Quenton Nelson':{passBlock:93,runBlock:98},
 'Chris Boswell':{kickPower:92,kickAccuracy:97},'Harrison Butker':{kickPower:94,kickAccuracy:94},
 'Brandon Aubrey':{kickPower:99,kickAccuracy:94},'Jake Elliott':{kickPower:92,kickAccuracy:90},
 'A.J. Cole':{kickPower:96,kickAccuracy:94,hangTime:97},'Michael Dickson':{kickPower:97,kickAccuracy:93,hangTime:96}
};
export const RATING_LABELS={speed:'Speed',power:'Strength',acceleration:'Acceleration',agility:'Agility',balance:'Balance',catching:'Hands',routeRunning:'Routes',ballSecurity:'Ball security',accuracy:'Accuracy',armStrength:'Arm',composure:'Composure',passBlock:'Pass block',runBlock:'Run block',tackling:'Tackling',coverage:'Coverage',recognition:'Reads',shed:'Block shed',kickPower:'Kick power',kickAccuracy:'Kick accuracy',hangTime:'Hang time'};
export function visibleRatings(p){return p.pos==='QB'?['accuracy','armStrength','composure','speed']:['K','P'].includes(p.pos)?['kickPower','kickAccuracy','hangTime']:['OL','C','G','T','OT','OG'].includes(p.pos)?['passBlock','runBlock','power']:['QB','RB','FB','WR','TE'].includes(p.pos)?['speed','acceleration','agility','balance','catching','routeRunning','ballSecurity']:['speed','tackling','coverage','recognition','shed'];}
