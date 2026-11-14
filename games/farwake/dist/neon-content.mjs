/** Voltage: an original city system. These identities never replace a saved world. */
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
export const NEON_SYSTEM_ID = 'voltage';
export const NEON_CITY_ID = 'glimmer';
export const NEON_SYSTEM = freeze({
  id: NEON_SYSTEM_ID, name: 'Voltage', gx: 3.2, gy: -4.9, faction: 'meridian', biome: 'industrial', danger: 3,
  authored: true, region: 'The Bright Circuit', systemTypeId: 'crossroads', neonTheme: true,
  description: 'Glimmer never turns its advertisements off. Corporate towers rise above wet streets, independent clinics and gaming rooms; the moons supplying its lights live on a very different clock.',
  bodies: [
    { id: 'voltage-crown', name: 'Crown Exchange', kind: 'station', biome: 'station', faction: 'meridian', x: 70, y: -115,
      stationTypeId: 'trade-hexagon', portType: 'hub', neonTheme: true,
      lore: 'An orbital customs and passenger exchange above Glimmer. Company liners use the bright arrival hall; refinery crews take the lift beside the freight cages. The after-shift lounge keeps three game tables.',
      stationGeography: {version: 1, legacyPosition: {x:210,y:-345}, kind: 'orbital', purpose: 'planetary-service', anchorBodyIds: ['glimmer'], nearbyBodyIds: ['glimmer'], servedBodyIds: ['glimmer','voltage-kilowatt','voltage-reservoir'], reason: 'Crown Exchange sits directly above Glimmer’s approach. It clears passenger liners for the city and transfers power cells from Kilowatt and clean water from Reservoir.'} },
    { id: NEON_CITY_ID, name: 'Glimmer', kind: 'planet', biome: 'industrial', faction: 'meridian', x: 290, y: 70,
      planetTypeId: 'ecumenopolis', sizeClass: 'super-earth', portType: 'metropolis', neonTheme: true,
      lore: 'A planet of linked cities beneath permanent rain bands. The landing region joins six districts: Dock Nine, Lantern Row, Chrome Ward, the Glass Mile, the Undergrid and Rustline. Meridian leases the infrastructure; local crews keep it alive. Gambling tables take ordinary credits, and a captain can earn a living without ever sitting at one.' },
    { id: 'voltage-kilowatt', name: 'Kilowatt', kind: 'moon', biome: 'volcanic', faction: 'freewake', x: -930, y: 420,
      planetTypeId: 'forge', portType: 'industrial', neonTheme: true,
      lore: 'The hard-working power moon behind Glimmer’s glamour. Foundry crews make replacement grid cells in shielded yards, then watch company freighters carry them to the towers first. The Burnt Copper union runs the public workshop.' },
    { id: 'voltage-reservoir', name: 'Reservoir', kind: 'planet', biome: 'ocean', faction: 'lantern', x: 760, y: -1080,
      planetTypeId: 'storm-ocean', sizeClass: 'terrestrial', portType: 'regional', neonTheme: true,
      lore: 'A storm ocean whose filter platforms supply the city’s drinking water and medical cooling fluid. Lantern technicians keep the monitors public. The export company considers that an inconvenient habit.' }
  ]
});

/** Append after procedural expansion: old indices, IDs, positions and RNG draws stay intact. */
export function appendNeonSystem(systems = []) {
  if (systems.some(system => system.id === NEON_SYSTEM_ID)) return systems;
  const system = structuredClone(NEON_SYSTEM);
  // Only the new map marker may move. Never rearrange a captain's known galaxy.
  for (let attempt = 0; attempt < 80; attempt++) {
    const radius = attempt === 0 ? 0 : .35 * Math.sqrt(attempt), angle = attempt * 2.399963229728653;
    const gx = NEON_SYSTEM.gx + Math.cos(angle) * radius, gy = NEON_SYSTEM.gy + Math.sin(angle) * radius;
    if (systems.every(other => Math.hypot(gx - other.gx, gy - other.gy) >= 1.15)) { system.gx = gx; system.gy = gy; break; }
  }
  system.index = systems.length;
  return [...systems, system];
}

export const NEON_DISTRICTS = freeze([
  {id:'dock-nine',name:'Dock Nine',x:25,y:83,color:'#e9b861',summary:'Freight lifts, shuttles and mechanics. Your ship returns here.'},
  {id:'lantern-row',name:'Lantern Row',x:28,y:47,color:'#ea82bd',summary:'Night market, food stalls and the Low Orbit gaming room.'},
  {id:'chrome-ward',name:'Chrome Ward',x:29,y:16,color:'#70d9cc',summary:'An independent clinic repairs people the corporate warranty rejected.'},
  {id:'glass-mile',name:'The Glass Mile',x:100,y:22,color:'#9ab9f0',summary:'Corporate offices, clean plazas and private generators.'},
  {id:'undergrid',name:'The Undergrid',x:103,y:58,color:'#bd9cdd',summary:'Utility channels and residential walkways beneath the rail line.'},
  {id:'rustline',name:'Rustline',x:99,y:87,color:'#dc9864',summary:'Reclaimed hulls, workshops and the city’s stubborn repair culture.'}
]);

const contact = (id,name,bodyId,roleLabel,text,tileX,tileY,color) => ({id,name,systemId:NEON_SYSTEM_ID,bodyId,role:'contact',roleLabel,text,tileX,tileY,color,species:'human'});
export const NEON_QUEST_CONTACTS = freeze([
  contact('voltage-juno','Juno Saye','glimmer','Night-market fixer','Juno runs Low Orbit with a paper ledger. “Play if you like. The work board pays even when the cards do not. We have a problem with the lights.”',18,58,'#dc8cae'),
  contact('voltage-asa','Dr. Asa Linn','glimmer','Independent implant clinician','Asa sets a repaired hand on the bench. “The warranty expired. The hand did not. Somebody should tell the manufacturer.”',29,16,'#78cabb'),
  contact('voltage-vale','Mara Vey','glimmer','Asterion Utilities liaison','Vey can see the dark streets from her office. “A grid has obligations. A company has creditors. The difficult part is where those sentences meet.”',94,29,'#99b7db'),
  contact('voltage-rook','Rook Halden','voltage-kilowatt','Burnt Copper shift steward','Rook’s shift coat smells of hot insulation. “Our overtime keeps the towers lit. Our families pay the surge tariff.”',null,null,'#c49b70'),
  contact('voltage-tamsin','Tamsin Orra','voltage-reservoir','Filter-platform technician','Tamsin keeps two monitors: the official water report and the measurements before anyone edits them.',null,null,'#9bc6d0')
]);
export const NEON_QUEST_OBJECTS = freeze([
  {id:'voltage-grid-log',name:'Undergrid load recorder',systemId:NEON_SYSTEM_ID,bodyId:'glimmer',kind:'terminal',tileX:102,tileY:61,text:'The blackout begins at 21:00 exactly. Street pumps lose supply while the Glass Mile’s advertising reserve rises by the same amount.'},
  {id:'voltage-router',name:'Chrome Ward emergency router',systemId:NEON_SYSTEM_ID,bodyId:'glimmer',kind:'terminal',tileX:39,tileY:20,text:'Three marked circuits share six available power cells: the clinic, residential pumps and advertisement reserve. The mechanical bypass still accepts local input.'},
  {id:'voltage-implant',name:'Unpatched implant controller',systemId:NEON_SYSTEM_ID,bodyId:'glimmer',kind:'evidence',tileX:20,tileY:17,text:'The prosthetic passes every movement test. Its hidden service channel still reports the wearer’s location to a debt-collection endpoint.'},
  {id:'voltage-manifest',name:'Coolant export register',systemId:NEON_SYSTEM_ID,bodyId:'voltage-reservoir',kind:'terminal',text:'Cooling fluid is billed as a medical supply, then bundled with a compulsory remote-monitoring license. Clinics pay again for the right to stop reporting their patients.'}
]);
const contacts = new Map(NEON_QUEST_CONTACTS.map(value => [value.id,value]));
const objects = new Map(NEON_QUEST_OBJECTS.map(value => [value.id,value]));
const at = id => { const entry=contacts.get(id)||objects.get(id); return {systemId:entry.systemId,bodyId:entry.bodyId,entityId:`quest:${id}`,...(contacts.has(id)?{contactId:id}:{objectId:id})}; };
const talk = (id,title,text,who,objective=title) => ({id,title,text,kind:'talk',at:at(who),objective,actionLabel:'Continue the conversation'});
const inspect = (id,title,text,object,objective=title) => ({id,title,text,kind:'inspect',at:at(object),objective,actionLabel:'Examine it'});
const choose = (id,title,text,who,options,objective=title) => ({id,title,text,kind:'choice',at:at(who),objective,options});
const option = (id,label,detail,effects={},cost={}) => ({id,label,detail,effects,cost});
export const NEON_QUEST_THREADS = freeze([
  {id:'voltage_after_hours',title:'After the lights go out',category:'Voltage',offeredBy:'voltage-juno',summary:'The market loses power at the same time every night. Follow the missing current from the street to the company ledger.',reward:155,stages:[
    talk('request','A city on somebody else’s clock','“Look at the load recorder,” Juno says. “The outage comes on time. Maintenance never does.”','voltage-juno','Speak to Juno Saye at Low Orbit on Glimmer.'),
    inspect('meter','Power does not disappear','The log shows a scheduled transfer. Somebody has been billing households for electricity diverted to the tower displays.','voltage-grid-log','Read the load recorder in Glimmer’s Undergrid.'),
    talk('workers','The people behind the switch','Rook confirms that the cells are sound. The shortages begin in allocation software. “Do not blame the night crew for an order signed upstairs.”','voltage-rook','Visit Rook Halden on Kilowatt.'),
    {id:'bypass',title:'Keep the clinic breathing',text:'The clinic has six emergency cells. A correct allocation will last until the next shipment without shutting down the residential water pumps.',kind:'puzzle',at:at('voltage-router'),objective:'Balance Chrome Ward’s emergency router.',actionLabel:'Apply the allocation',puzzle:{type:'dials',prompt:'Allocate six power cells. Every circuit must match its written requirement.',clues:['The clinic needs three cells to keep its sterile equipment running.','Residential water pumps need two cells.','The warning beacon uses the remaining cell; advertisements can wait.'],inputs:[{id:'clinic',label:'Clinic',options:[0,1,2,3,4].map(v=>({id:String(v),label:String(v)}))},{id:'pumps',label:'Residential pumps',options:[0,1,2,3,4].map(v=>({id:String(v),label:String(v)}))},{id:'beacon',label:'Warning beacon',options:[0,1,2,3,4].map(v=>({id:String(v),label:String(v)}))}],solution:['3','2','1']}},
    choose('allocation','Who owns the night?','Vey offers a private correction and a sealed report. Juno wants the meter logs published. Rook wants the people running the grid to control its reserve.','voltage-vale',[
      option('publish','Publish the meter logs','Expose the diversion. Residents gain evidence; the Combine loses face.',{rep:{freewake:8,lantern:5,meridian:-6},trust:{'voltage-juno':4,'voltage-vale':-3},flags:['voltage_grid_public'],memory:'You made Glimmer’s missing-current records public.'}),
      option('cooperative','Back the workers’ reserve','Spend 40 cr on independent cells. The night crews can keep homes supplied.',{rep:{freewake:10,meridian:-3},trust:{'voltage-rook':5,'voltage-asa':3},flags:['voltage_grid_cooperative'],memory:'You helped the night crews build an independent reserve.'},{credits:40}),
      option('settlement','Take the negotiated correction','Secure an immediate supply agreement; the evidence remains in corporate hands.',{rep:{meridian:7,freewake:-3},trust:{'voltage-vale':4,'voltage-juno':-2},flags:['voltage_grid_settlement'],memory:'You negotiated Glimmer’s supply correction behind closed doors.'})
    ],'Bring the load record to Mara Vey in the Glass Mile.')
  ]},
  {id:'voltage_borrowed_skin',title:'Borrowed skin',category:'Voltage',offeredBy:'voltage-asa',summary:'An implant repair reveals a tracking channel. Find out what patients are being asked to surrender in exchange for treatment.',reward:175,stages:[
    talk('patient','A hand that owes somebody money','Asa has removed a controller from a patient’s replacement hand. “They paid for the surgery. The contract says the controller is still leased.”','voltage-asa','Meet Dr. Asa Linn in Chrome Ward on Glimmer.'),
    inspect('controller','The owner’s return address','The diagnostic channel carries movement records, location and missed-payment notices. The medical functions work when the transmitter is disconnected.','voltage-implant','Examine the implant controller at the clinic.'),
    talk('supply','Follow the clean-water invoice','Tamsin has seen the same compulsory license on clinic cooling supplies. “It is easier to sell surveillance when it arrives in a medical crate.”','voltage-tamsin','Ask Tamsin Orra on Reservoir about the bundled license.'),
    inspect('license','Terms written after the signature','The register contains an older contract without tracking. The new monitoring clause was attached when the supplier changed ownership.','voltage-manifest','Read Reservoir’s coolant export register.'),
    choose('consent','The patient chooses','Asa can patch this controller now. A public release could protect thousands of patients, but the clinic must be able to support implants if the supplier retaliates.','voltage-asa',[
      option('open_patch','Release a documented privacy patch','Make the repair public with testing notes. Patients gain a choice; the supplier loses control.',{rep:{lantern:9,freewake:5,meridian:-6},trust:{'voltage-asa':5,'voltage-tamsin':4},flags:['voltage_patch_open'],memory:'You helped Asa publish a patient-controlled implant patch.'}),
      option('clinic_stock','Fund independent clinic stock','Spend 60 cr to stock controllers the clinic can service without permission.',{rep:{freewake:8,lantern:4},trust:{'voltage-asa':5},flags:['voltage_clinic_independent'],memory:'You funded controllers the independent clinic can repair itself.'},{credits:60}),
      option('casework','Challenge the lease through the charter office','Pursue an official case using the earlier contract. Slower, but it may protect clinics that cannot switch suppliers.',{rep:{concord:7,meridian:2},trust:{'voltage-asa':2,'voltage-vale':2},flags:['voltage_lease_challenged'],memory:'You carried the original implant agreement into a public charter challenge.'})
    ],'Return to Asa in Chrome Ward and decide how to support the patients.')
  ]}
]);
