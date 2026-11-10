/** Shared, DOM-free deck geometry. Fore is up; each plan follows its physical hull. */
export const CABIN_TILE=24;
export const CABIN_REVISION=3;
export const CABIN_CLASSES=['sparrow','hauler','frigate','capital','kestrel','mule','petrel','marten','atlas','tern','quill','mender','bulwark','cairn'];
const pt=(x,y)=>({x:(x+.5)*CABIN_TILE,y:(y+.5)*CABIN_TILE});
const room=(id,name,x,y,w,h,color)=>({id,name,x,y,w,h,color});
const fixture=(kind,x,y,w=1,h=1,color=null,solid=true)=>({kind,x,y,w,h,color,solid});
const passage=(x,y,w,h)=>({x,y,w,h});
const C={bridge:'#97c6ce',engineering:'#e5ba7b',medical:'#82bcae',quarters:'#a6accc',cargo:'#c6af82',security:'#d29783',science:'#90c7b5',common:'#b7c09b'};
// These outlines are the exterior pixel-art pressure hulls, viewed bow-right.
// Rotating their coordinates into the deck gives every floor the same bow-up frame.
const silhouettes={
 sparrow:[[-31,-12],[-20,-21],[-5,-20],[8,-12],[31,-4],[33,0],[31,4],[8,12],[-5,20],[-20,21],[-31,12]],
 kestrel:[[-28,-11],[-17,-15],[-4,-9],[27,-2],[28,0],[27,2],[-4,9],[-17,15],[-28,11]],
 mule:[[-35,-18],[-25,-24],[27,-24],[35,-18],[35,-10],[8,-10],[8,10],[35,10],[35,18],[27,24],[-25,24],[-35,18]],
 hauler:[[-51,-23],[-40,-31],[20,-31],[51,-12],[53,0],[51,12],[20,31],[-40,31],[-51,23]],
 petrel:[[-44,-25],[22,-25],[22,-16],[37,-12],[45,-3],[45,3],[37,12],[22,16],[22,25],[-44,25],[-44,15],[-31,15],[-31,11],[-44,11],[-44,-11],[-31,-11],[-31,-15],[-44,-15]],
 marten:[[-63,-26],[-49,-38],[12,-35],[56,-17],[63,-7],[63,7],[56,17],[12,35],[-49,38],[-63,26]],
 frigate:[[-75,-29],[-50,-35],[7,-31],[76,-5],[78,0],[76,5],[7,31],[-50,35],[-75,29]],
 atlas:[[-107,-45],[-92,-58],[17,-58],[107,-43],[107,-25],[19,-21],[19,21],[107,25],[107,43],[17,58],[-92,58],[-107,45]],
 capital:[[-128,-42],[-104,-59],[-65,-64],[47,-48],[105,-24],[134,0],[105,24],[47,48],[-65,64],[-104,59],[-128,42]],
 tern:[[-39,-18],[-30,-25],[23,-25],[39,-12],[39,12],[23,25],[-30,25],[-39,18]],
 quill:[[-55,-16],[-42,-29],[-16,-23],[17,-11],[55,-3],[55,3],[17,11],[-16,23],[-42,29],[-55,16]],
 mender:[[-63,-13],[-30,-13],[-30,-38],[25,-38],[25,-15],[63,-10],[63,10],[25,15],[25,38],[-30,38],[-30,13],[-63,13]],
 bulwark:[[-83,-24],[-64,-50],[22,-50],[70,-30],[83,-14],[83,14],[70,30],[22,50],[-64,50],[-83,24]],
 cairn:[[-94,-43],[-74,-68],[52,-68],[94,-34],[94,34],[52,68],[-74,68],[-94,43]]
};
const definitions={
 sparrow:{name:'Sparrow',cols:14,rows:20,berths:2,plan:'A small cockpit opens directly into one shared work cabin with two fold-down bunks.',
  rooms:[room('bridge','COCKPIT',4,5,6,7,C.bridge),room('work','WORK CABIN',2,11,10,7,C.cargo)],
  corridors:[passage(6,8,2,9)],doors:[passage(6,11,2,2)],
  stations:{helm:[6,8],navigation:[7,10],engineering:[6,16],medical:[4,15],security:[9,15]},
  spawn:[6,13],bunks:[[3,16],[9,16]],breaches:[[4,14],[10,16]],combatSpawns:[[4,14],[5,14],[8,15],[10,16]],crewSpawns:[[6,11],[7,11],[5,13],[7,13],[8,13],[4,14],[5,15],[7,15],[8,15],[7,16]],archive:[6,14],manifest:[7,14],
  fixtures:[fixture('console',6,6,2,1,'#59878f'),fixture('window',6,5,2,1,null,false),fixture('workbench',5,12,1,1,'#9c896a'),fixture('engine',8,16,1,1,'#528491')]
 },
 kestrel:{name:'Kestrel',cols:12,rows:22,berths:1,plan:'A narrow cockpit and a single bunk share a tiny aft service cabin; there are no separate wings.',
  rooms:[room('bridge','SCOUT COCKPIT',3,6,6,8,C.bridge),room('quarters','SOLO CABIN',2,12,8,8,C.quarters)],
  corridors:[passage(5,9,2,10)],doors:[passage(5,12,2,2)],
  stations:{helm:[5,9],navigation:[6,11],engineering:[7,18],medical:[4,17],security:[7,15]},
  spawn:[5,15],bunks:[[3,18]],breaches:[[4,13],[7,17]],combatSpawns:[[4,13],[5,13],[6,16],[7,17]],crewSpawns:[[4,10],[6,12],[4,13],[6,13],[4,15],[6,15],[3,17],[7,16],[7,17],[5,18]],archive:[6,17],manifest:[5,17],
  fixtures:[fixture('console',5,7,2,1,'#6498a0'),fixture('window',5,6,2,1,null,false),fixture('engine',8,16,1,2,'#628c99'),fixture('equipment',7,13,1,1,'#89bdc8')]
 },
 mule:{name:'Mule',cols:18,rows:24,berths:2,plan:'Narrow salvage arms surround an open cradle ahead of a small shared bridge and two-bunk service cabin.',
  rooms:[room('portwork','GRAPPLE',2,2,4,10,C.cargo),room('starboardwork','CUTTER',12,2,4,10,C.cargo),room('bridge','CRADLE CONTROL',6,10,6,6,C.bridge),room('engineering','DRIVE',2,15,6,7,C.engineering),room('medical','SERVICE LOCKER',10,10,6,6,C.medical),room('quarters','TWO BUNKS',10,14,6,8,C.quarters)],
  corridors:[passage(3,11,12,3),passage(7,12,3,9),passage(3,19,12,1)],doors:[passage(4,9,1,4),passage(13,9,1,4),passage(10,14,2,7)],
  stations:{helm:[8,13],navigation:[10,12],engineering:[5,19],medical:[13,13],security:[4,11]},
  spawn:[8,17],bunks:[[11,20],[13,20]],breaches:[[4,8],[13,8]],combatSpawns:[[4,11],[5,12],[12,12],[13,11]],crewSpawns:[[4,13],[5,13],[7,14],[8,15],[9,15],[9,18],[12,19],[14,19],[5,20],[8,20]],archive:[7,16],manifest:[10,17],
  fixtures:[fixture('workbench',3,4,1,3,'#d4b47e'),fixture('cargo',14,5,1,2,'#9f936d'),fixture('console',7,11,3,1,'#648d96'),fixture('engine',3,16,1,3,'#628c99'),fixture('window',7,10,3,1,null,false)]
 },
 hauler:{name:'Wayfarer Hauler',cols:38,rows:58,berths:6,plan:'A forward bridge feeds a long freight spine between paired cargo pods and aft living spaces.',
  rooms:[room('bridge','FORWARD BRIDGE',13,6,12,13,C.bridge),room('portcargo','PORT CARGO PODS',3,19,12,15,C.cargo),room('starboardcargo','STARBOARD CARGO PODS',23,19,12,15,C.cargo),room('medical','MEDICAL & MESS',3,34,12,8,C.medical),room('security','FREIGHT CONTROL',14,28,10,11,C.security),room('galley','CREW MESS',23,34,12,8,C.common),room('engineering','CARGO ENGINES',3,41,12,14,C.engineering),room('quarters','SIX AFT BERTHS',23,38,12,17,C.quarters)],
  corridors:[passage(17,14,3,39),passage(10,26,19,2),passage(4,33,30,3),passage(10,46,19,2)],doors:[passage(14,36,4,2),passage(20,36,4,2)],
  stations:{helm:[18,11],navigation:[21,15],engineering:[10,47],medical:[9,37],security:[20,34]},
  spawn:[18,34],bunks:[[25,45],[28,45],[31,45],[25,51],[28,51],[31,51]],breaches:[[4,34],[33,34]],combatSpawns:[[4,34],[5,33],[5,35],[6,34]],crewSpawns:[[11,48],[20,13],[10,38],[21,35],[27,37],[26,52],[30,52],[18,23],[18,49]],archive:[32,53],manifest:[15,34],
  fixtures:[fixture('console',15,8,7,1,'#59878f'),fixture('window',15,7,7,1,null,false),fixture('cargo',5,21,3,3,'#93866b'),fixture('cargo',10,21,3,3,'#607d83'),fixture('cargo',5,29,3,3,'#a18459'),fixture('cargo',25,21,3,3,'#879a83'),fixture('cargo',30,28,3,3,'#a18459'),fixture('bed',5,36,1,2,'#91c3b3'),fixture('table',26,36,5,1,'#978469'),fixture('engine',6,44,2,7,'#57818a'),fixture('equipment',12,43,1,2,'#b6a783')]
 },
 petrel:{name:'Petrel',cols:32,rows:54,berths:6,plan:'A slim central listening hull connects to long quarters and laboratory nacelles.',
  rooms:[room('bridge','SURVEY COCKPIT',11,5,10,15,C.bridge),room('survey','LISTENING WELL',11,20,10,14,C.science),room('engineering','LONG-RANGE DRIVES',11,37,10,15,C.engineering),room('quarters','PORT HABITAT NACELLE',3,20,7,31,C.quarters),room('laboratory','STARBOARD FIELD LAB',22,20,7,16,C.science),room('medical','ISOLATION BAY',22,36,7,15,C.medical)],
  corridors:[passage(15,15,2,35),passage(6,32,20,3),passage(6,42,20,2)],doors:[passage(16,24,7,2)],
  stations:{helm:[15,10],navigation:[25,25],engineering:[15,45],medical:[25,43],security:[19,33]},
  spawn:[15,33],bunks:[[4,27],[7,27],[4,36],[7,36],[4,45],[7,45]],breaches:[[5,33],[26,33]],combatSpawns:[[5,34],[6,32],[6,34],[8,34]],crewSpawns:[[16,45],[17,12],[26,43],[19,32],[13,26],[5,47],[6,48],[25,29],[15,37]],archive:[13,29],manifest:[17,33],
  fixtures:[fixture('console',13,7,6,1,'#648d96'),fixture('window',13,6,6,1,null,false),fixture('equipment',12,22,2,3,'#90c7b5'),fixture('equipment',18,26,1,3,'#89bdc8'),fixture('workbench',23,21,4,1,'#90c7b5'),fixture('books',27,27,1,3,'#82988b'),fixture('engine',12,40,2,7,'#628c99'),fixture('engine',18,40,1,7,'#628c99'),fixture('bed',23,38,1,3,'#91c5b7'),fixture('cabinet',27,38,1,2,'#779b9f')]
 },
 marten:{name:'Marten',cols:36,rows:60,berths:6,plan:'Armored weapons shoulders wrap a protected ready room and an aft service corridor.',
  rooms:[room('bridge','ARMORED BRIDGE',11,8,14,14,C.bridge),room('security','READY ROOM',11,22,14,12,C.security),room('portbattery','PORT PULSE BATTERY',3,22,10,16,C.security),room('starboardbattery','STARBOARD PULSE BATTERY',23,22,10,16,C.security),room('medical','TRAUMA BAY',4,39,9,14,C.medical),room('quarters','ESCORT BERTHS',23,39,9,14,C.quarters),room('engineering','SHIELD & DRIVE',11,44,14,12,C.engineering)],
  corridors:[passage(16,18,3,35),passage(7,35,23,3),passage(7,43,23,2)],doors:[passage(11,28,14,2),passage(11,48,7,2),passage(18,48,7,2)],
  stations:{helm:[17,13],navigation:[20,17],engineering:[17,50],medical:[8,47],security:[21,28]},
  spawn:[17,36],bunks:[[24,45],[27,45],[30,45],[24,51],[27,51],[30,51]],breaches:[[7,36],[29,36]],combatSpawns:[[7,36],[8,35],[8,37],[9,36]],crewSpawns:[[18,51],[19,15],[9,47],[20,30],[9,32],[25,50],[29,50],[17,40],[26,32]],archive:[13,25],manifest:[20,36],
  fixtures:[fixture('console',14,10,8,1,'#59878f'),fixture('window',14,9,8,1,null,false),fixture('armory',5,24,5,2,'#9b9e9b'),fixture('armory',25,24,5,2,'#9b9e9b'),fixture('equipment',5,30,1,3,'#a98c7a'),fixture('equipment',30,30,1,3,'#a98c7a'),fixture('commandtable',14,24,3,2,'#7c9c9e'),fixture('bed',5,41,1,3,'#91c5b7'),fixture('engine',12,47,2,6,'#628c99'),fixture('engine',21,47,2,6,'#628c99')]
 },
 frigate:{name:'Peregrine Frigate',cols:40,rows:84,berths:8,plan:'A long pointed command spine opens into protected medical, armory, and twin aft quarters.',
  rooms:[room('bridge','COMMAND BRIDGE',13,10,14,16,C.bridge),room('navigation','EXPEDITION CHART ROOM',16,25,8,17,C.science),room('medical','PORT MEDICAL',5,43,12,14,C.medical),room('security','STARBOARD ARMORY',23,43,12,14,C.security),room('portquarters','PORT QUARTERS',3,61,14,18,C.quarters),room('starboardquarters','STARBOARD QUARTERS',23,61,14,18,C.quarters),room('engineering','TWIN REACTORS',15,62,10,18,C.engineering)],
  corridors:[passage(18,22,4,57),passage(10,48,20,2),passage(8,57,25,4),passage(10,66,20,2)],doors:[passage(10,55,2,4),passage(29,55,2,4),passage(10,59,2,4),passage(29,59,2,4)],
  stations:{helm:[19,16],navigation:[20,32],engineering:[20,73],medical:[10,49],security:[29,49]},
  spawn:[19,58],bunks:[[6,76],[9,76],[12,76],[15,76],[25,76],[28,76],[31,76],[34,76]],breaches:[[8,58],[32,58]],combatSpawns:[[8,58],[9,57],[9,59],[10,58]],crewSpawns:[[20,75],[21,18],[12,49],[30,50],[17,58],[7,77],[13,77],[26,77],[33,77]],archive:[18,37],manifest:[23,58],
  fixtures:[fixture('console',16,12,8,1,'#5c8c98'),fixture('window',16,11,8,1,null,false),fixture('commandtable',17,28,2,2,'#6fa6a5'),fixture('books',22,35,1,3,'#82988b'),fixture('bed',7,45,1,3,'#90c0b1'),fixture('bed',14,45,1,3,'#90c0b1'),fixture('cabinet',7,53,2,1,'#799f98'),fixture('armory',25,45,7,1,'#8e8b8a'),fixture('table',26,53,3,1,'#9b896d'),fixture('engine',16,69,1,7,'#64949b'),fixture('engine',23,69,1,7,'#64949b')]
 },
 atlas:{name:'Atlas',cols:54,rows:100,berths:10,plan:'Long working arms enclose an open salvage cradle above a broad industrial stern.',
  rooms:[room('portclamp','PORT GRAPPLE CONTROL',3,6,14,20,C.cargo),room('starboardclamp','STARBOARD CUTTERS',36,6,15,20,C.cargo),room('portstores','PORT REPAIR STORES',3,28,14,23,C.cargo),room('starboardstores','STARBOARD MACHINE SHOP',36,28,15,23,C.cargo),room('bridge','SALVAGE BRIDGE',21,56,12,15,C.bridge),room('engineering','INDUSTRIAL DRIVE HALL',4,72,16,23,C.engineering),room('quarters','TENDER HABITAT',34,72,16,23,C.quarters),room('medical','CREW INFIRMARY',21,74,12,12,C.medical),room('galley','MESS & ARCHIVE',21,86,12,11,C.common)],
  corridors:[passage(11,15,3,41),passage(41,15,3,41),passage(10,53,35,4),passage(25,54,3,41),passage(11,70,33,3)],doors:[passage(12,70,2,5),passage(41,70,2,5)],
  stations:{helm:[26,60],navigation:[28,67],engineering:[12,88],medical:[27,79],security:[47,47]},
  spawn:[26,54],bunks:[[37,82],[39,82],[41,82],[43,82],[45,82],[37,91],[39,91],[41,91],[43,91],[45,91]],breaches:[[11,16],[43,16]],combatSpawns:[[12,54],[13,53],[13,55],[14,54]],crewSpawns:[[12,87],[27,64],[28,79],[44,54],[20,54],[38,92],[44,92],[26,90],[27,73]],archive:[29,92],manifest:[22,54],
  fixtures:[fixture('workbench',8,9,3,2,'#ad956e'),fixture('equipment',45,9,1,5,'#8ba29d'),fixture('cargo',5,30,4,4,'#ad956e'),fixture('cargo',5,40,4,4,'#7f9c99'),fixture('workbench',46,31,3,2,'#cfbd8a'),fixture('equipment',46,39,2,4,'#879a99'),fixture('console',23,57,8,1,'#648d96'),fixture('window',23,56,8,1,null,false),fixture('engine',7,76,3,8,'#628c99'),fixture('engine',15,76,3,8,'#628c99'),fixture('bed',23,76,1,3,'#91c5b7'),fixture('table',22,88,3,1,'#9a866b'),fixture('table',29,88,2,1,'#9a866b')]
 },
 tern:{name:'Tern',cols:20,rows:30,berths:3,plan:'A blunt shuttle cockpit opens into a little passenger saloon, with three bunks and a drive cupboard aft.',
  rooms:[room('bridge','SHUTTLE COCKPIT',6,4,8,8,C.bridge),room('saloon','PASSENGER SALOON',4,12,12,8,C.common),room('quarters','THREE BERTHS',3,20,8,7,C.quarters),room('engineering','SERVICE DRIVE',11,20,6,7,C.engineering)],
  corridors:[passage(9,8,2,18),passage(5,19,10,3)],doors:[passage(9,11,2,3)],
  stations:{helm:[9,7],navigation:[11,9],engineering:[12,24],medical:[6,17],security:[13,17]},
  spawn:[9,19],bunks:[[4,25],[6,25],[8,25]],breaches:[[5,19],[14,19]],combatSpawns:[[5,19],[6,19],[7,20],[14,19]],crewSpawns:[[9,11],[10,13],[6,15],[8,17],[12,17],[10,22],[12,25],[5,25],[7,25],[9,25]],archive:[11,15],manifest:[11,19],
  fixtures:[fixture('console',8,5,4,1,'#729b9d'),fixture('window',8,4,4,1,null,false),fixture('seat',5,14,2,1,'#8d9d9c'),fixture('seat',13,14,2,1,'#8d9d9c'),fixture('table',8,15,2,1,'#aa906e'),fixture('engine',14,22,1,3,'#628c99')]
 },
 quill:{name:'Quill',cols:24,rows:46,berths:4,plan:'A long courier nose feeds a chart spine, with four stacked bunks to port and dispatch lockers to starboard.',
  rooms:[room('bridge','DISPATCH COCKPIT',9,8,6,12,C.bridge),room('navigation','ROUTE SPINE',9,19,6,10,C.science),room('quarters','COURIER BERTHS',4,28,7,13,C.quarters),room('medical','PARCELS & MEDICAL',13,28,7,10,C.cargo),room('engineering','SLIPSTREAM DRIVE',8,37,8,7,C.engineering)],
  corridors:[passage(11,13,2,29),passage(6,28,12,2),passage(6,33,12,2),passage(9,38,4,2)],doors:[passage(12,26,2,3)],
  stations:{helm:[11,12],navigation:[12,22],engineering:[11,40],medical:[15,32],security:[15,35]},
  spawn:[11,33],bunks:[[6,34],[8,34],[6,39],[8,39]],breaches:[[6,28],[17,28]],combatSpawns:[[6,28],[7,28],[16,28],[17,29]],crewSpawns:[[11,17],[12,25],[10,28],[14,29],[16,32],[10,34],[12,38],[13,40],[7,39],[9,39]],archive:[10,26],manifest:[13,33],
  fixtures:[fixture('console',11,9,2,1,'#689aa2'),fixture('window',11,8,2,1,null,false),fixture('cargo',17,30,1,2,'#a39075'),fixture('cabinet',17,35,1,2,'#779b9f'),fixture('engine',9,40,1,2,'#628c99'),fixture('engine',14,40,1,2,'#628c99'),fixture('equipment',10,21,1,2,'#90c7b5')]
 },
 mender:{name:'Mender',cols:28,rows:48,berths:5,plan:'A cross-shaped rescue hull: treatment ward to port, crew recovery bunks to starboard, and a narrow flight-to-drive spine.',
  rooms:[room('bridge','RESCUE BRIDGE',10,5,8,11,C.bridge),room('medical','TRIAGE WARD',3,16,10,19,C.medical),room('quarters','RECOVERY BERTHS',15,17,10,17,C.quarters),room('engineering','LIFE-SUPPORT DRIVE',10,35,8,10,C.engineering)],
  corridors:[passage(12,11,4,32),passage(8,20,12,2),passage(8,30,12,3)],doors:[passage(12,16,4,2),passage(12,33,4,3)],
  stations:{helm:[13,9],navigation:[15,12],engineering:[14,40],medical:[7,25],security:[18,32]},
  spawn:[13,30],bunks:[[16,23],[19,23],[22,23],[16,30],[19,30]],breaches:[[5,24],[23,24]],combatSpawns:[[5,24],[6,24],[22,24],[23,24]],crewSpawns:[[13,14],[14,18],[9,23],[8,26],[10,30],[15,31],[21,31],[14,37],[13,42],[20,24]],archive:[10,32],manifest:[15,30],
  fixtures:[fixture('console',12,6,4,1,'#84b3b3'),fixture('window',12,5,4,1,null,false),fixture('bed',4,18,1,3,'#91c5b7'),fixture('bed',7,18,1,3,'#91c5b7'),fixture('bed',4,28,1,3,'#91c5b7'),fixture('cabinet',10,18,1,2,'#779b9f'),fixture('workbench',5,32,3,1,'#9caa9e'),fixture('engine',11,38,1,4,'#628c99'),fixture('engine',16,38,1,4,'#628c99')]
 },
 bulwark:{name:'Bulwark',cols:36,rows:60,berths:8,plan:'A blunt armored bow shields the central magazine; paired weapons shoulders sit ahead of two four-person berth bays.',
  rooms:[room('bridge','PATROL BRIDGE',12,6,12,13,C.bridge),room('magazine','CENTRAL MAGAZINE',12,20,12,15,C.security),room('portbattery','PORT BATTERY',3,19,10,15,C.security),room('starboardbattery','STARBOARD BATTERY',23,19,10,15,C.security),room('portquarters','PORT BERTHS',3,36,10,17,C.quarters),room('starboardquarters','STARBOARD BERTHS',23,36,10,17,C.quarters),room('medical','PATROL MEDICAL',13,37,10,9,C.medical),room('engineering','REACTOR & DRIVES',12,47,12,10,C.engineering)],
  corridors:[passage(16,15,3,41),passage(7,33,22,3),passage(7,45,22,2)],doors:[passage(7,35,2,3),passage(26,35,2,3),passage(11,28,3,2),passage(22,28,3,2)],
  stations:{helm:[17,11],navigation:[20,15],engineering:[18,52],medical:[17,41],security:[20,29]},
  spawn:[17,34],bunks:[[4,43],[7,43],[4,50],[7,50],[25,43],[28,43],[25,50],[28,50]],breaches:[[7,34],[28,34]],combatSpawns:[[7,34],[8,34],[27,34],[28,34]],crewSpawns:[[17,17],[20,25],[8,30],[27,30],[17,38],[20,42],[8,51],[29,51],[17,50],[19,54]],archive:[14,39],manifest:[20,34],
  fixtures:[fixture('console',15,8,6,1,'#648d96'),fixture('window',15,7,6,1,null,false),fixture('armory',4,23,5,2,'#a9a6a0'),fixture('armory',26,23,5,2,'#a9a6a0'),fixture('commandtable',13,23,3,2,'#8f9d98'),fixture('equipment',21,25,1,2,'#9f8b75'),fixture('bed',14,40,1,3,'#91c5b7'),fixture('engine',13,50,2,4,'#628c99'),fixture('engine',21,50,1,4,'#628c99')]
 },
 cairn:{name:'Cairn',cols:50,rows:70,berths:10,plan:'Two huge ore holds flank a processing-control spine; separate aft habitat blocks carry five bunks each around the engine room.',
  rooms:[room('bridge','BARGE BRIDGE',18,5,14,12,C.bridge),room('portore','PORT ORE HOLD',3,17,16,27,C.cargo),room('starboardore','STARBOARD ORE HOLD',31,17,16,27,C.cargo),room('control','CUTTER CONTROL',19,21,12,18,C.science),room('portquarters','PORT MINING CREW',5,48,15,17,C.quarters),room('starboardquarters','STARBOARD MINING CREW',30,48,15,17,C.quarters),room('medical','CREW INFIRMARY',19,44,12,11,C.medical),room('engineering','HEAVY DRIVE',20,55,10,12,C.engineering)],
  corridors:[passage(23,13,3,52),passage(10,43,30,3),passage(10,54,30,3)],doors:[passage(11,46,2,5),passage(36,46,2,5),passage(17,30,4,2),passage(29,30,4,2)],
  stations:{helm:[24,11],navigation:[27,15],engineering:[24,61],medical:[25,49],security:[29,43]},
  spawn:[24,44],bunks:[[7,61],[9,61],[11,61],[13,61],[15,61],[32,61],[34,61],[36,61],[38,61],[40,61]],breaches:[[10,44],[39,44]],combatSpawns:[[10,44],[11,44],[38,44],[39,44]],crewSpawns:[[24,18],[25,26],[18,31],[31,31],[16,44],[34,44],[25,51],[18,62],[42,62],[24,64]],archive:[27,37],manifest:[21,44],
  fixtures:[fixture('console',21,7,8,1,'#648d96'),fixture('window',21,6,8,1,null,false),fixture('cargo',6,20,4,7,'#a58c64'),fixture('cargo',12,20,4,7,'#869a91'),fixture('cargo',6,33,4,6,'#869a91'),fixture('cargo',12,33,4,6,'#a58c64'),fixture('cargo',34,20,4,7,'#869a91'),fixture('cargo',40,20,4,7,'#a58c64'),fixture('cargo',34,33,4,6,'#a58c64'),fixture('cargo',40,33,4,6,'#869a91'),fixture('workbench',21,23,2,1,'#b5a381'),fixture('bed',21,47,1,3,'#91c5b7'),fixture('bed',28,47,1,3,'#91c5b7'),fixture('engine',21,57,2,6,'#628c99'),fixture('engine',27,57,1,6,'#628c99')]
 },
 capital:{name:'Horizon Capital',cols:58,rows:118,berths:10,plan:'A tapered command bow, broad habitation wings, and two hangar shoulders around the reactor spine.',
  rooms:[room('bridge','COMMAND BOW',22,16,14,24,C.bridge),room('medical','PORT MEDICAL WING',7,42,17,21,C.medical),room('security','STARBOARD SECURITY WING',34,42,17,21,C.security),room('portquarters','PORT HABITAT / 01–05',5,66,20,25,C.quarters),room('starboardquarters','STARBOARD / 06–10',33,66,20,25,C.quarters),room('hangar','PORT HANGAR & FREIGHT',5,95,20,16,C.cargo),room('engineering','REACTOR SPINE',23,94,12,22,C.engineering),room('galley','STARBOARD COMMON DECK',34,95,19,16,C.common)],
  corridors:[passage(27,31,4,80),passage(12,62,34,4),passage(18,78,22,3),passage(11,91,36,4)],doors:[passage(15,61,2,8),passage(42,61,2,8),passage(15,89,2,8),passage(42,89,2,8)],
  stations:{helm:[29,24],navigation:[32,33],engineering:[29,107],medical:[15,51],security:[43,51]},
  spawn:[29,92],bunks:[[9,86],[12,86],[15,86],[18,86],[21,86],[37,86],[40,86],[43,86],[46,86],[49,86]],breaches:[[12,92],[46,93]],combatSpawns:[[12,92],[13,91],[13,94],[14,92]],crewSpawns:[[29,105],[31,32],[17,51],[44,51],[22,63],[11,87],[20,87],[40,87],[49,87]],archive:[44,104],manifest:[39,99],
  fixtures:[fixture('console',25,20,8,1,'#628e9c'),fixture('window',25,19,8,1,null,false),fixture('commandtable',25,34,2,3,'#6fa6a5'),fixture('bed',9,45,1,4,'#94c9b9'),fixture('bed',12,45,1,4,'#94c9b9'),fixture('bed',20,45,1,4,'#94c9b9'),fixture('cabinet',18,58,3,1,'#7ba49d'),fixture('armory',36,45,5,1,'#9c9183'),fixture('armory',44,45,5,1,'#9c9183'),fixture('table',38,57,4,1,'#897d67'),fixture('cargo',8,98,3,3,'#9e8c6d'),fixture('cargo',18,98,3,3,'#6c8c8d'),fixture('shuttle',9,104,9,3,'#98b8b7',false),fixture('engine',24,99,2,9,'#60969e'),fixture('engine',32,99,2,9,'#60969e'),fixture('table',36,98,3,1,'#9d8b6f'),fixture('table',46,98,4,1,'#9d8b6f'),fixture('books',50,103,1,4,'#8d9d8f'),fixture('plant',36,107,1,1,'#76a78b',false)]
 }
};
export function resolveCabinClass(value='sparrow'){
 const key=typeof value==='object'?value.shipClassId||value.shipClass||value.classId||value.id:value;
 return CABIN_CLASSES.includes(key)?key:'sparrow';
}
function insidePolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function deckOutline(shipClass,cols,rows){const points=silhouettes[shipClass],minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));return points.map(([x,y])=>({x:2+(y-minY)/(maxY-minY)*(cols-4),y:2+(maxX-x)/(maxX-minX)*(rows-4)}));}
/** Tile layout is authority-safe: walkable excludes all bulkheads and solid furniture. */
function buildCabinLayout(value='sparrow'){
 const shipClass=resolveCabinClass(value),d=definitions[shipClass],outline=deckOutline(shipClass,d.cols,d.rows),layout={...d,shipClass,revision:CABIN_REVISION,hullForward:'up',tile:CABIN_TILE,tileSize:CABIN_TILE,width:d.cols*CABIN_TILE,height:d.rows*CABIN_TILE};
 layout.rooms=d.rooms.map(r=>({...r}));layout.corridors=d.corridors.map(r=>({...r}));layout.doors=d.doors.map(r=>({...r}));layout.fixtures=d.fixtures.map(f=>({...f}));
 layout.hullOutline=outline.map(p=>({x:p.x*CABIN_TILE,y:p.y*CABIN_TILE}));layout.hullMask=Array.from({length:d.cols*d.rows},(_,i)=>Number(insidePolygon(i%d.cols+.5,Math.floor(i/d.cols)+.5,outline)));
 layout.bunks=d.bunks.map(([x,y],index)=>({...pt(x,y),index,tileX:x,tileY:y}));
 for(const bunk of layout.bunks)layout.fixtures.push(fixture('bunk',bunk.tileX,bunk.tileY-4,1,3,indexColor(bunk.index),true));
 layout.stations=Object.fromEntries(Object.entries(d.stations).map(([role,[x,y]])=>[role,{...pt(x,y),role,tileX:x,tileY:y}]));
 for(const key of ['spawn','archive','manifest'])layout[key]=pt(...d[key]);
 for(const key of ['breaches','combatSpawns','crewSpawns'])layout[key]=d[key].map(p=>pt(...p));
 const floor=new Uint8Array(d.cols*d.rows),paint=r=>{for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(x>=0&&y>=0&&x<d.cols&&y<d.rows&&layout.hullMask[y*d.cols+x])floor[y*d.cols+x]=1;};
 for(const r of layout.rooms)paint({x:r.x+1,y:r.y+1,w:r.w-2,h:r.h-2});
 for(const r of [...layout.corridors,...layout.doors])paint(r);
 layout.floor=Array.from(floor);layout.walkable=Array.from(floor);
 for(const bunk of layout.bunks){const x=bunk.tileX+1,y=bunk.tileY-4;if(floor[y*d.cols+x])layout.fixtures.push(fixture('cabinet',x,y,1,1,'#7e9499',true));}
 for(const f of layout.fixtures)if(f.solid)for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)if(x>=0&&y>=0&&x<d.cols&&y<d.rows)layout.walkable[y*d.cols+x]=0;
 // Standing places preserve older crowded rosters and visiting parties. They
 // never create beds, expand the pressure hull, or increase hiring capacity.
 const standing=[layout.spawn,layout.archive,layout.manifest,...layout.bunks,...Object.values(layout.stations),...layout.crewSpawns];
 for(let i=0;i<layout.walkable.length&&layout.crewSpawns.length<12;i++)if(layout.walkable[i]){
  const point=pt(i%d.cols,Math.floor(i/d.cols));
  if(standing.every(other=>Math.hypot(point.x-other.x,point.y-other.y)>=24)){layout.crewSpawns.push(point);standing.push(point);}
 }
 return layout;
}
const layoutCache=new Map();
/** Geometry is compiled once; callers receive independent mutable arrays. */
export function cabinLayout(value='sparrow'){
 const id=resolveCabinClass(value);if(!layoutCache.has(id))layoutCache.set(id,buildCabinLayout(id));const base=layoutCache.get(id),layout={...base};
 for(const key of ['rooms','corridors','doors','fixtures','bunks','hullOutline','breaches','combatSpawns','crewSpawns'])layout[key]=base[key].map(value=>({...value}));
 for(const key of ['floor','walkable','hullMask'])layout[key]=base[key].slice();
 for(const key of ['spawn','archive','manifest'])layout[key]={...base[key]};
 layout.stations=Object.fromEntries(Object.entries(base.stations).map(([role,p])=>[role,{...p}]));return layout;
}
function indexColor(index){return['#819aab','#9fa58d','#a293aa','#b39979','#79a49b'][index%5];}
export function isCabinWalkable(layout,x,y,radius=6){
 for(const[ox,oy]of[[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]){
  const tx=Math.floor((x+ox)/layout.tile),ty=Math.floor((y+oy)/layout.tile);
  if(tx<0||ty<0||tx>=layout.cols||ty>=layout.rows||!layout.walkable[ty*layout.cols+tx])return false;
 }
 return true;
}
/** Migrate an invalid saved deck pose without disturbing a still-valid position. */
export function nearestCabinPoint(layout,x,y,radius=6){
 if(isCabinWalkable(layout,x,y,radius))return{x,y};
 const targetX=Number.isFinite(x)?x:layout.spawn.x,targetY=Number.isFinite(y)?y:layout.spawn.y;let best=null,bestDistance=Infinity;
 for(let i=0;i<layout.walkable.length;i++)if(layout.walkable[i]){const p=pt(i%layout.cols,Math.floor(i/layout.cols)),distance=(p.x-targetX)**2+(p.y-targetY)**2;if(distance<bestDistance&&isCabinWalkable(layout,p.x,p.y,radius)){best=p;bestDistance=distance;}}
 return best||{...layout.spawn};
}
