/** Sparse places where ordinary life continues without asking for a mission. */
const hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const clean=value=>typeof value==='string'?value.slice(0,160):'';
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const mod=(n,m)=>((n%m)+m)%m;
const record=(id,name,text,x=12,y=8)=>({id,name,text,x,y});
const local=(id,name,role,roleLabel,x,y,text,extra={})=>({id,name,role,roleLabel,x,y,text,rumors:[],...extra,data:{socialOnly:true,...extra.data}});
const place=(id,name,style,summary,story,extra={})=>({id,name,kind:'social',style,tileX:95,tileY:44,cols:44,rows:32,summary,story,hostile:false,caches:[],choices:[],records:[],residents:[],...extra});
export const SOCIAL_DAY_SECONDS=1440;
export const RECURRING_IDS=Object.freeze(['anja-pell','tamsin-rue','meli-rains']);
export const isPreflightBody=body=>body?.id==='reedbank'||body?.techLevel==='preflight'||body?.culture==='reedbound';

const recurring={
 'anja-pell':{name:'Anja Pell',role:'bartender',roleLabel:'Supper-hall keeper',color:'#c4a184',route:[['kindred-landing','table-of-arrivals']],intro:'I’m Anja. Take a bowl before you take a chair.',updates:['I leave the window seat for my brother. His letters arrive more reliably than he does.','My brother wrote. He found work where he is. I’ve moved his chair into the circle.','A new neighbor uses the window seat now. My brother sends recipes. That turns out to be another way of coming home.'],rumor:'Everyone washes one bowl. Nobody asks which bowl was yours.'},
 'tamsin-rue':{name:'Tamsin Rue',role:'courier',roleLabel:'Independent parcel runner',color:'#a7b9c7',route:[['tessera','small-mercy'],['kindred-landing','table-of-arrivals']],intro:'Tamsin. I carry small parcels and leave large explanations to their owners.',updates:['There’s a cracked music box in my pack. The address is good; I’m not sure the recipient wants it.','The recipient kept the box. Asked me to take the old winding key back to her sister.','Both sisters have written now. I’m carrying letters for them. The box can stay where it is.'],rumor:'Some deliveries are finished when somebody stops sending them back.'},
 'meli-rains':{name:'Meli-between-Rains',role:'archivist',roleLabel:'Choral field listener',species:'choral',color:'#b6d1b8',route:[['ochre-garden','held-breath'],['chora','interval-court']],intro:'You may call me Meli. I am learning which human silences are comfortable.',updates:['I am collecting permission to remember songs. It takes longer than collecting songs.','One singer asked me to remember the meal before the song. My notes have become much longer.','We agreed on a shared recording. It begins with the meal, and ends before anyone asks for another song.'],rumor:'A voice is not less personal because someone can copy it.'}
};
function visitor(id,x,y){const p=recurring[id];return local(`recurring:${id}`,p.name,p.role,p.roleLabel,x,y,p.intro,{color:p.color,species:p.species||'human',data:{recurringId:id}});}

const AUTHORED={
 'kindred-landing':[place('table-of-arrivals','The Table of Arrivals','supper','Steam rises through the open shutters of a small supper hall.','The long table is built from doors brought from different homes. A quiet alcove holds letters instead of an altar.',{
  residents:[visitor('anja-pell',12,16),visitor('tamsin-rue',17,16),local('bowl-mender','Jo Venn','settler','Volunteer bowl mender',23,17,'This one belonged to my mother. The repair is mine. Both parts can be useful.')],
  records:[record('bowls','A row of repaired bowls','The cracks are filled in contrasting colors. A sign asks visitors to leave repairs visible.'),record('chair','A chair beside the shutters','One place has a folded letter beneath the bowl. The envelope has been opened and carefully resealed.',33,9),record('names','Names on the door lintel','Names have been added in several alphabets. None have been crossed out.',34,24)]
 })],
 tessera:[place('small-mercy','Small Mercy','tavern','A narrow tavern occupies the ground floor of a leaning house.','The front room sells tea. A card game has been abandoned mid-hand in the back, but nobody seems alarmed.',{
  residents:[local('mercy-keeper','Sana Vey','bartender','Tea-house keeper',12,16,'The small cup is strong. The large cup is less of a promise.'),visitor('tamsin-rue',18,16),local('old-player','Pell Arden','settler','Retired card player',23,17,'We stopped keeping score when I began remembering every hand.')],
  records:[record('tab','Three versions of a tab','One bill is itemized. One has been crossed out. One is written as hours spent repairing a roof.'),record('cards','Cards left on felt','The best hand belongs to the empty chair. Beside it, somebody has set a cup upside down.',33,9)]
 })],
 'ochre-garden':[place('held-breath','Held Breath Commons','farm','Low fences separate a shared garden from a grazing enclosure.','Small four-legged grazers nibble fallen pods. Human pruning tools hang beside a Choral note asking that the cut branches be kept for discussion.',{
  culture:'choral',animals:'grazer',residents:[visitor('meli-rains',13,16),local('pod-keeper','Iru-at-the-Gate','settler','Commons keeper',19,16,'Fallen pods are offered. Growing pods are still part of a conversation.',{species:'choral',color:'#b7cdb3'})],
  records:[record('gate','A gate with two latches','The low latch can be opened by a grazer. The high latch is labeled VISITORS; it is already open.'),record('shears','Pruning tools left on cloth','A note in two scripts reads: WE AGREED TO THIS BRANCH. ASK ABOUT THE NEXT ONE.',33,9)]
 })],
 chora:[place('interval-court','The Interval Court','park','A winding path enters a public garden with no central monument.','Stone basins answer footsteps at different pitches. Two benches face each other across an intentionally empty space.',{
  culture:'choral',residents:[visitor('meli-rains',13,16),local('court-tender','Esi-of-the-Long-Tide','settler','Court tender',19,16,'The empty place is for the part of a conversation nobody can own.',{species:'choral',color:'#a8c8ca'})],
  records:[record('stones','A path of replaced stones','Every damaged stone has been kept beside its replacement. Nobody has tried to hide the uneven years.'),record('invitation','A visitor’s slate','PLEASE WAIT FOR AN ANSWER. A second line was added later: PLEASE TELL US IF THE WAIT IS HURTING YOU.',33,9)]
 })],
 noonless:[place('third-floor','Third Floor, Warm Side','apartments','Laundry hangs in the sheltered stairwell of a modest apartment block.','The corridor smells of cooking oil and warm dust. Behind one door a child repeats a scale on an instrument missing a note.',{
  residents:[local('stairs-keeper','Reva Cale','settler','Building caretaker',13,16,'The hot pipe is communal. The arguments about the hot pipe are private.'),local('returning-neighbor','Iven Pell','merchant','Returning tenant',19,16,'My old key still fits. I haven’t decided how I feel about that.')],
  records:[record('chalk','Chalk marks by a door','Three children have marked their heights. The fourth line belongs to an adult who has started growing older in the other direction.'),record('rota','A heater rota','Every room gets the same hours except Room Four. Beside it someone has written: NEW BABY.',33,9)]
 })]
};

const FRONTIER_VARIANTS=[
 place('quiet-social','The Last Cup','tavern','A hand-painted cup hangs beside a very ordinary door.','A worker has fallen asleep over a puzzle. The keeper has put a cloth under their cheek without moving the pieces.',{residents:[local('keeper','Eda Rill','bartender','Evening keeper',13,16,'There’s no cover charge for a quiet minute.'),local('regular','Tor Vale','settler','Local regular',19,16,'I nearly finished the puzzle yesterday. Today it has become a different puzzle.')],records:[record('puzzle','A partly finished wooden puzzle','One piece has been carved from different wood. It fits better than the original.'),record('closing','Closing times','The last line reads: WHEN EVERYONE HAS SOMEWHERE TO GO.',33,9)]}),
 place('quiet-social','The Borrowed Hour','gym','A weight hangs from the sign outside a small public gym.','The equipment has been repaired many times. A climbing rope has knots added for shorter hands.',{residents:[local('trainer','Ari Hosk','settler','Volunteer trainer',13,16,'The lighter bar is still a bar. Use the one you can control.'),local('trainee','Nell Kest','courier','Off-watch runner',19,16,'I come here to become tired for a reason I chose.')],records:[record('board','A training board','The records are grouped by improvement, not by weight lifted.'),record('rope','A repaired climbing rope','Every replaced strand carries a tiny colored marker. A note records who tested the repair.',33,9)]}),
 place('quiet-social','Rainbreak Park','park','An unfashionable little park sits between two service roads.','A bench faces a tree rather than a view. Someone has replanted the same patch of grass around a worn shortcut.',{residents:[local('gardener','Sela Moss','settler','Park gardener',13,16,'The shortcut will win. I plant it anyway.'),local('walker','Noa Marr','settler','Daily walker',19,16,'One lap before work, one afterward. It makes the days feel less like one long day.')],records:[record('tag','A brass tree tag','PLANTED TO REPLACE THE TREE PLANTED TO REPLACE THE FIRST TREE. The most recent date is handwritten.'),record('bench','A bench with one new slat','The new slat has already acquired an initial beside the old names.',33,9)]}),
 place('quiet-social','The Upstairs Rooms','apartments','A stairwell window is propped open with a shoe.','Cooking smells meet in the corridor. The floor outside one door is cleaner than the rest.',{residents:[local('tenant','Rafi Oran','settler','Longtime tenant',13,16,'We leave the spare key with whoever is home. It works more often than you’d expect.'),local('neighbor','Tess Aster','settler','New neighbor',19,16,'I know the sound of everybody’s footsteps. I’m still learning the names.')],records:[record('notices','A notice board','A lost-pet notice has been changed to FOUND. Somebody has left the picture up.'),record('door','A recently painted door','The paint stops neatly around an old pencil height mark.',33,9)]}),
 place('quiet-social','The Small Watch House','civic','A public watch house shares its entrance with a lending shelf.','A kettle is warming beside a stack of disputed boundary maps. The cells are being used to store winter blankets.',{residents:[local('watchkeeper','Darin Wren','warden','Local watchkeeper',13,16,'Most of my work is returning things before anyone decides they were stolen.'),local('neighbor','Mina Tal','settler','Boundary petitioner',19,16,'The fence is six centimeters over. I know how that sounds. My father built it.')],records:[record('ledger','The watch ledger','MISSING LADDER: RETURNED. STRAY ANIMAL: OWNER FOUND. BOUNDARY DISPUTE: TEA REQUIRED.'),record('blankets','Folded blankets behind a cell door','The lock has been removed. The oldest blankets carry the watch emblem of another jurisdiction.',33,9)]}),
 place('quiet-social','A Farm at the Bend','farm','Small animals graze behind a gate that never quite closes.','The water trough is newer than the farmhouse. Children have painted names on the fence posts.',{animals:'goat',residents:[local('farmer','Oren Raye','settler','Smallholder',13,16,'They can open that gate. Closing it is a custom we share.'),local('hand','Bren Voss','settler','Farmhand',19,16,'The one with the dark ear knows which pocket holds the feed.')],records:[record('trough','A patched water trough','Three generations of repairs overlap. The newest patch is cut from a ship’s old maintenance placard.'),record('names','Names on the fence','Most names belong to animals. Two have been carefully crossed out and rewritten on the garden side.',33,9)]}),
 place('quiet-social','The Sevenfold Door','vault','A sealed habitation vault sits beneath an old sheltering wall.','The entrance has been maintained by people who never lived inside. The seal’s date is measured in generations.',{empty:true,records:[record('oath','A public promise','WE KEEP THE DOOR UNTIL THOSE INSIDE ASK US TO OPEN IT. Below are seven generations of witnesses.'),record('window','A dark observation window','No face appears. The inside edge of the glass is clean.',33,13)],choices:[{id:'witness',name:'The witness book',x:33,y:24,text:'There is room for one more witness. Nothing here asks you to open the door.',options:[{id:'sign',label:'Add your name as a witness',text:'You add your name below the latest caretaker’s. The door stays sealed.'},{id:'leave',label:'Leave the promise to its keepers',text:'You close the book without adding a name. The door stays sealed.'}]}]})
];

export function socialPlaces(body={},seed='farwake'){
 if(isPreflightBody(body))return[place('reed-house','The House of Knotted Reeds','preflight','Open shutters look onto a floor woven from reed mats.','Banners record agreements between river households. A public promise is woven twice: once by each household.',{tileX:52,tileY:29,
  culture:'reedbound',residents:[local('weaver','Sori Fen','settler','Promise weaver',13,16,'A knot is a promise we can touch. If it is wrong, we must undo it together.',{data:{culture:'reedbound',techLevel:'preflight'}}),local('witness','En Mar','settler','River witness',19,16,'The visitors’ place is beside the door. That is so you can leave without asking.',{data:{culture:'reedbound',techLevel:'preflight'}})],
  records:[record('banners','Two unfinished banners','The patterns agree except for one knot. Neither household has finished its border.'),record('bowl','A bowl of river stones','Each household leaves one stone before a public discussion. Several have worn smooth from repeated use.',33,9)]
 })];
 if(body.systemId==='hearth'||['kettle','morrow','tinbell'].includes(body.id))return[];
 const authored=AUTHORED[body.id];if(authored)return authored.map(value=>({...value}));
 if(body.kind!=='planet'||!String(body.id).startsWith('frontier-')||/barren|rock|dust|volcan/.test(String(body.biome)))return[];
 const roll=hash(`${seed}:${body.id}:ordinary-place`);if(roll%25!==0)return[];
 const value=FRONTIER_VARIANTS[Math.floor(roll/25)%FRONTIER_VARIANTS.length];
 return[{...value,name:value.name,seeded:true}];
}

export function recurringPresence(entity,seconds=0,location={}){
 const id=entity.data?.recurringId,profile=recurring[id];if(!profile)return null;
 const bodyId=location.parentId||entity.data?.bodyId||location.id,siteId=location.siteId||location.site?.id||entity.data?.siteId;
 const time=Math.max(0,finite(seconds)),day=Math.floor(time/SOCIAL_DAY_SECONDS),slot=profile.route.length===1?0:mod(day+(id==='meli-rains'?1:0),profile.route.length),[body,site]=profile.route[slot];
 const local=time%SOCIAL_DAY_SECONDS;
 if(body!==bodyId||site!==siteId)return{present:false,phase:'away',slot,day};
 if(profile.route.length===1)return{present:true,phase:'staying',slot,day};
 if(local<120||local>=1320)return{present:false,phase:'away',slot,day};
 if(local<150)return{present:true,phase:'arriving',progress:(local-120)/30,start:day*SOCIAL_DAY_SECONDS+120,end:day*SOCIAL_DAY_SECONDS+150,slot,day};
 if(local>=1260)return{present:true,phase:'leaving',progress:(local-1260)/60,start:day*SOCIAL_DAY_SECONDS+1260,end:day*SOCIAL_DAY_SECONDS+1320,slot,day};
 return{present:true,phase:'staying',slot,day};
}

export function normalizeSocialVisits(raw){
 const rows=Array.isArray(raw?.people)?raw.people:[],people=[];
 for(const id of RECURRING_IDS){const value=rows.find(row=>row?.id===id);if(!value)continue;people.push({id,meetings:Math.max(1,Math.min(99,Math.floor(finite(value.meetings,1)))),firstAt:Math.max(0,Math.min(1e12,finite(value.firstAt))),lastAt:Math.max(0,Math.min(1e12,finite(value.lastAt))),bodyId:clean(value.bodyId),storyStage:Math.max(0,Math.min(2,Math.floor(finite(value.storyStage))))});}
 return{version:1,people};
}

export function socialConversation(state,entity,seconds,{record:remember=true}={}){
 if(entity.data?.culture==='reedbound'||entity.data?.techLevel==='preflight'){
  const lines={farmer:'The lower field flooded. We will sow it later. The river has not broken an agreement; it was here first.',herder:'Hold out an empty hand. They trust a hand that has nothing to hide.',guard:'The path is open. Leave blades covered, and do not enter a house without an answer.',weaver:'Each household keeps half the pattern. A promise cannot belong to only one of us.'};
  const known=state.conversations?.people?.some(row=>row.id===entity.id);
  return{context:'culture',greeting:known?'You have returned. There is room beside the doorway.':entity.text||'You may share the shade. Tell us what name to use.',rumor:lines[entity.data?.cultureRole]||'The river households meet when the reed shadows reach the center stone. The youngest witness speaks first.',relationship:known?'Recognized':'Visitor'};
 }
 const id=entity.data?.recurringId,profile=recurring[id];if(!profile)return null;
 const time=Math.max(0,finite(seconds)),memory=normalizeSocialVisits(state.socialVisits),prior=memory.people.find(row=>row.id===id),bodyId=entity.data?.bodyId||entity.data?.homeLocationId||state.locationId||'';
 // The project advances by the galaxy's clock for everyone. A captain's memory
 // controls recognition, not contradictory private versions of the same life.
 const stage=Math.min(2,Math.floor(time/(SOCIAL_DAY_SECONDS*2))),newVisit=!prior||prior.bodyId!==bodyId||time-prior.lastAt>=SOCIAL_DAY_SECONDS;
 let greeting=!prior?`${profile.intro} ${profile.updates[stage]}`:stage>prior.storyStage?`Since we last spoke: ${profile.updates[stage]}`:prior.bodyId!==bodyId?`You found me again. ${profile.updates[stage]}`:newVisit?`Good to see you back. ${profile.updates[stage]}`:'Still here. A familiar face makes a place easier to leave—and harder.';
 if(entity.life?.activity==='sleeping')greeting=`You caught me asleep. ${prior?'I remember you. ':''}${profile.updates[stage]}`;
 if(remember){if(!prior)memory.people.push({id,meetings:1,firstAt:time,lastAt:time,bodyId,storyStage:stage});else if(newVisit||stage!==prior.storyStage){prior.meetings=Math.min(99,prior.meetings+(newVisit?1:0));prior.lastAt=time;prior.bodyId=bodyId;prior.storyStage=stage;}state.socialVisits=memory;}
 return{context:'recurring',greeting,rumor:profile.rumor,relationship:prior?(prior.meetings>=3?'Old acquaintance':'Familiar'):'First meeting',recurringId:id,storyStage:stage};
}
