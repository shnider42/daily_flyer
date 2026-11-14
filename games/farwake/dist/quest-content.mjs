/** People and unfinished business. Original authored content; no generated live dialogue. */
import { EARTH_CAMPAIGN_CONTACTS, EARTH_CAMPAIGN_OBJECTS, EARTH_CAMPAIGN } from './earth-campaign-content.mjs';
import { NEON_QUEST_CONTACTS, NEON_QUEST_OBJECTS, NEON_QUEST_THREADS } from './neon-content.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const person=(id,name,systemId,bodyId,roleLabel,text,color='#8fc7bd',species='human')=>({id,name,systemId,bodyId,role:'contact',roleLabel,text,color,species});

export const QUEST_CONTACTS=freeze([
 person('len-vale','Len Vale','hearth','kettle','Night-shift dispatcher','Len keeps a kettle beneath the departure board. “A fare is a person. Remember that when the meter starts.”'),
 person('mara-reed','Mara Reed','hearth','morrow','Orchard mechanic','Mara has dismantled a pump on a folding table. She knows which families are behind on water and never says it aloud.'),
 person('ada-finch','Ada Finch','hearth','morrow','Weather observer','Ada watches the ridge while she talks. “The empty dome has started sending my shift reports. I have not worked there in eleven years.”','#c6afcc'),
 person('silas-voss','Silas Voss','hearth','kettle','Freight broker','Silas buys the first cup. He lets you notice that everyone else in the room has already paid for theirs.','#c4a17a'),
 person('orin-dax','Orin Dax','hearth','kettle','Independent warrant agent','A paper warrant rests beside Orin’s cold breakfast. “I get paid for a person arriving. Wreckage is a different form.”','#89a9ce'),
 person('nadi-vale','Nadi Vale','brindle','weighhouse','Kitchen steward','Nadi is feeding a roomful of people while negotiating grain prices. She asks whether Len is sleeping enough.'),
 person('commissioner-ryn','Commissioner Ryn','meridian','ledger','Combine claims officer','Ryn will show you the original agreement. She is less comfortable showing you the amendments.','#dfbc83'),
 person('doctor-sef','Doctor Sef','nacre','bastion','Refugee clinician','Sef keeps names in a paper book because the citizenship terminal keeps rejecting them.','#9eb6dc'),
 person('tiva','Tiva Ren','vesper','listening','Signal conservator','Tiva listens to the space between words. “A recording can be evidence. It can also be someone’s last private moment.”','#b9a2d2'),
 person('ferryman','The Ferryman','cinder','patchwork','Unlicensed passage broker','The Ferryman has no boat, no badge, and a wall of names crossed out in different inks. “People owe me because they are still alive.”','#d8937e'),
 person('vey','Vey-of-the-Interval','chorus','chora','Choral translator','Vey raises three luminous fingers, waits, then lowers one. Your translator offers six incompatible greetings.','#91cfe0','choral'),
 person('elet','Elet Sable','umbra','umbra-watch','Tidal observatory keeper','Elet’s wall clocks disagree by hours. A photograph taped between them shows two people wearing the same coat.','#bdabd3'),
 person('mother-rusk','Mother Rusk','ravel','ravel-market','Market patron','Rusk’s couriers call her Mother. She remembers every birthday and every missed payment.','#d0a4a0'),
 ...NEON_QUEST_CONTACTS,
 ...EARTH_CAMPAIGN_CONTACTS
]);

export const QUEST_OBJECTS=freeze([
 {id:'passenger-slip',name:'Uncollected passage slip',systemId:'hearth',bodyId:'kettle',kind:'evidence',text:'A medical exemption has been folded inside a cargo declaration. The name was erased so hard that the paper split.'},
 {id:'dome-recorder',name:'Northwatch shift recorder',systemId:'hearth',bodyId:'morrow',siteId:'northwatch',kind:'terminal',tileX:12,tileY:18,text:'Four lamps blink beside an empty chair. The chair is warm.'},
 {id:'reed-door',name:'Inside of the Reed door',systemId:'hearth',bodyId:'morrow',siteId:'reed-house',kind:'evidence',tileX:11,tileY:15,text:'The scratch marks face the room. Someone tried to get out without waking the person on the other side.'},
 {id:'freight-register',name:'Night freight register',systemId:'hearth',bodyId:'kettle',kind:'terminal',text:'Silas’s sealed crate has been billed as heater parts. Its power draw says otherwise.'},
 {id:'clinic-case',name:'Unmarked medicine case',systemId:'hearth',bodyId:'morrow',kind:'evidence',text:'The packing slip lists enough antibiotics for a settlement. The delivery address is one locked storeroom.'},
 {id:'warrant-camera',name:'Freight-lift camera buffer',systemId:'hearth',bodyId:'morrow',siteId:'orchard-pump',kind:'terminal',tileX:12,tileY:18,text:'Three images were added to Rook’s warrant. Only one comes from this camera.'},
 {id:'orchard-valves',name:'Outer-orchard valve manifold',systemId:'hearth',bodyId:'morrow',siteId:'orchard-pump',kind:'terminal',tileX:18,tileY:18,text:'A locked bypass divides drinking water from the export crop.'},
 {id:'blindpost-speaker',name:'Sealed observation intercom',systemId:'hush',bodyId:'blindpost',kind:'terminal',text:'The speaker says your ship’s name before you touch its switch. The microphone has been disconnected.'},
 {id:'chora-translation',name:'Choral interval stone',systemId:'chorus',bodyId:'chora',kind:'terminal',text:'Light runs through the stone at walking pace. The gaps change when someone stands nearby.'},
 {id:'umbra-register',name:'Delayed rescue register',systemId:'umbra',bodyId:'umbra-watch',kind:'terminal',text:'One distress call has arrived three times. Each copy is older than the last.'},
 {id:'rusk-book',name:'Rusk’s household ledger',systemId:'ravel',bodyId:'ravel-market',kind:'evidence',text:'Air, food, a bunk, and interest. Half the names belong to people who have never left this market.'},
 ...NEON_QUEST_OBJECTS,
 ...EARTH_CAMPAIGN_OBJECTS
]);

const contacts=Object.fromEntries(QUEST_CONTACTS.map(value=>[value.id,value]));
const objects=Object.fromEntries(QUEST_OBJECTS.map(value=>[value.id,value]));
const at=id=>{const value=contacts[id]||objects[id];return{systemId:value.systemId,bodyId:value.bodyId,...(value.siteId?{siteId:value.siteId}:{}),entityId:`quest:${id}`,contactId:contacts[id]?id:undefined,objectId:objects[id]?id:undefined};};
const talk=(id,title,text,contact,objective=title)=>({id,title,text,kind:'talk',at:at(contact),objective,actionLabel:'Continue the conversation'});
const aftermath=(id,title,text,contact,respondTo,responses,objective=title)=>({...talk(id,title,text,contact,objective),respondTo,responses});
const inspect=(id,title,text,object,objective=title)=>({id,title,text,kind:'inspect',at:at(object),objective,actionLabel:'Examine it'});
const choose=(id,title,text,contact,options,objective=title)=>({id,title,text,kind:'choice',at:at(contact),objective,options});
const option=(id,label,detail,effects={},cost={})=>({id,label,detail,effects,cost});
const puzzle=(id,title,text,object,challenge,objective=title)=>({id,title,text,kind:'puzzle',at:at(object),objective,puzzle:challenge,actionLabel:'Check the solution'});
const values=(ids,labels=ids)=>ids.map((id,i)=>({id:String(id),label:String(labels[i])}));
const sequence={type:'sequence',prompt:'Reconstruct the shift from the recorder’s own clock. Put the signals in the order they actually happened.',clues:['The chair alarm sounded before the door opened.','The air monitor woke after the door opened.','The final entry is a voice saying “shift complete”.'],inputs:[0,1,2,3].map(i=>({id:`position-${i}`,label:`Signal ${i+1}`,options:values(['chair','door','air','voice'],['Chair alarm','Door contact','Air monitor','Voice'])})),solution:['chair','door','air','voice']};
const valves={type:'dials',prompt:'Restore the drinking-water bypass without starving the cooling loop. Set each valve to 0, 1, 2, or 3.',clues:['The cooling loop needs one unit.','The drinking-water valve must receive twice the cooling flow.','The export valve gets what is left from the four-unit supply.'],inputs:['drinking','cooling','export'].map(id=>({id,label:{drinking:'Drinking water',cooling:'Cooling loop',export:'Export crop'}[id],options:values([0,1,2,3])})),solution:['2','1','1']};
const evidence={type:'evidence',prompt:'Match each image to its source before accepting the warrant as fact.',clues:['The orchard lift uses an amber clock; its lens has no crack.','Rook’s cockpit has a cracked lens and a blue clock.','The Combine dock camera has an intact lens and a blue clock.'],inputs:[{id:'image-a',label:'Image A · amber clock, intact lens',options:values(['orchard','rook','dock'],['Orchard lift','Rook’s cockpit','Combine dock'])},{id:'image-b',label:'Image B · blue clock, cracked lens',options:values(['orchard','rook','dock'],['Orchard lift','Rook’s cockpit','Combine dock'])},{id:'image-c',label:'Image C · blue clock, intact lens',options:values(['orchard','rook','dock'],['Orchard lift','Rook’s cockpit','Combine dock'])}],solution:['orchard','rook','dock']};
const intervals={type:'sequence',prompt:'Build a greeting from Vey’s three demonstrated intervals. A pause belongs to the sentence.',clues:['An open hand means “I am listening”.','The long pause gives the other speaker room to refuse.','The paired light asks “may I approach?” It must come last.'],inputs:[0,1,2].map(i=>({id:`interval-${i}`,label:`Interval ${i+1}`,options:values(['hand','pause','light'],['Open hand','Long pause','Paired light'])})),solution:['hand','pause','light']};

export const QUEST_THREADS=freeze([
 EARTH_CAMPAIGN,
 ...NEON_QUEST_THREADS,
 {id:'last_fare',title:'The last fare of the night',category:'Passage',offeredBy:'len-vale',summary:'A passenger needs to reach Morrow before the clinic closes. Her documents say she should never have left.',reward:95,stages:[
  talk('booking','One seat, no questions','Len lowers his voice. “Her name is Nessa. She can pay for the seat. She cannot pay for someone to decide whether she deserves it.”','len-vale','Speak to Len at Kettle Station.'),
  inspect('papers','A name under the erasure','Nessa’s exemption was valid until her employer bought the clinic. Its new stamp calls her medicine a company asset.','passenger-slip','Read the passage slip on Kettle’s concourse.'),
  talk('arrival','The clinic door','Mara takes Nessa inside before asking who sent you. “The official route goes through Ledger. She would have died doing it correctly.”','mara-reed','Carry Nessa to Mara on Morrow.'),
  choose('privacy','Who gets the passenger list?','Len’s dispatch terminal has received an official request for your passenger’s destination. Returning the form will clear his overdue licensing inspection.','len-vale',[
   option('protect','Keep Nessa’s destination private','Len loses an easy inspection clearance. Nessa keeps her safety.',{rep:{freewake:8,concord:-4},trust:{'len-vale':4,'mara-reed':4},flags:['nessa_protected'],memory:'You kept Nessa’s name out of the inspection file.'}),
   option('register','Register the journey openly','Help Len retain his license; the authorities can now find Nessa.',{rep:{concord:7,meridian:3,freewake:-5},trust:{'len-vale':1,'mara-reed':-4},flags:['nessa_registered'],memory:'You filed Nessa’s destination to protect Len’s license.'}),
   option('appeal','Fund an independent medical appeal','Spend 45 cr. Neither secrecy nor disclosure fixes the debt, but a hearing might.',{rep:{lantern:5,freewake:4},trust:{'len-vale':3,'mara-reed':3},flags:['nessa_appeal'],memory:'You paid to put Nessa’s case before an independent clinician.'},{credits:45})
  ],'Return to Len on Kettle to settle the passenger record.')
 ]},
 {id:'nine_knocks',title:'The ninth shift',category:'Unsettling',offeredBy:'ada-finch',summary:'Northwatch has begun filing reports under the name of someone who left eleven years ago.',reward:155,stages:[
  talk('request','A report in Ada’s handwriting','Ada shows you a report dated tomorrow. It describes the weather outside right now, and finishes with a request for another chair.','ada-finch','Ask Ada about the deserted weather dome.'),
  puzzle('recorder','The occupied chair','The chair turns a few degrees when the recorder wakes. The floor underneath is clean. The rest of the room is full of dust.','dome-recorder',sequence,'Reconstruct the shift recorder inside Northwatch Weather Dome.'),
  inspect('door','Marks on the wrong side','Under the Reed doorframe is Ada’s old shift code. Her name was written by someone whose hand shook much more than hers.','reed-door','Inspect the inside of the door at Reed Family Shelter.'),
  talk('account','Someone went back','Ada admits her brother continued visiting the dome after it closed. He said it let him hear their mother. She never asked what the dome heard in return.','ada-finch','Bring the door marks back to Ada.'),
  choose('disposition','Leave a voice, or leave a silence?','The recorder holds voices that still answer new questions. Keeping it powered might preserve people. It might also preserve the thing that learned their names.','ada-finch',[
   option('seal','Seal the recorder for careful study','Lantern researchers gain access. Ada can keep listening under supervision.',{rep:{lantern:8,concord:2},trust:{'ada-finch':3,'tiva':2},flags:['voices_sealed'],memory:'You kept the recorder intact and arranged supervised listening.'}),
   option('cut','Cut its transmitter permanently','The unanswered voices stop. Ada asked for an explanation, not a verdict.',{rep:{concord:8,lantern:-5},trust:{'ada-finch':-3},flags:['voices_cut'],memory:'You silenced the Northwatch transmitter.'}),
   option('broadcast','Let the voices speak on an open channel','Everyone can hear them; nobody has consent from the dead or the living.',{rep:{freewake:6,lantern:-3},trust:{'ada-finch':1,'tiva':-2},flags:['voices_open'],memory:'You opened the Northwatch voices to the public.'})
  ])
 ]},
 {id:'salt_debt',title:'Interest paid in salt',category:'Underworld',offeredBy:'silas-voss',summary:'Silas needs a sealed crate moved. The paperwork is easy; deciding whose medicine it is will not be.',reward:180,stages:[
  talk('favor','The first favor is small','“Heater parts,” Silas says. “Deliver them to Morrow. If you look inside, I would rather you ask me than invent a story.”','silas-voss','Meet Silas at Kettle Station.'),
  inspect('manifest','A crate that needs refrigeration','The freight register lists a clinic lot number. Silas bought the shipment at a debt auction. The patients were not told there was an auction.','freight-register','Read the night freight register before departure.'),
  inspect('handoff','Medicine with an owner','The case arrives intact. The distributor intends to sell it by the dose. Mara’s patients need it today.','clinic-case','Bring the sealed case to its drop on Morrow.'),
  choose('distribution','Who owns a stolen cure?','Silas’s payment assumes the distributor keeps the case. Mara can use it now, but taking it puts a debt against her workshop.','mara-reed',[
   option('clinic','Give the case to the clinic','Immediate treatment; Silas and the distributor lose their margin.',{rep:{freewake:10,cinder:-6,meridian:-4},trust:{'mara-reed':5,'silas-voss':-4},flags:['medicine_shared'],memory:'You diverted the auction medicine to Mara’s patients.'}),
   option('contract','Honor the paid delivery','Keep your word to the broker; some patients cannot afford the new price.',{rep:{cinder:8,meridian:5,freewake:-7},trust:{'silas-voss':4,'mara-reed':-5},flags:['medicine_sold'],memory:'You honored Silas’s medicine contract.'}),
   option('buyout','Buy out the distributor’s claim','Spend 90 cr to get the medicine released. The auction system earns its fee.',{rep:{freewake:5,meridian:4,cinder:2},trust:{'mara-reed':3,'silas-voss':2},flags:['medicine_bought'],memory:'You bought the clinic’s medicine out of its own debt auction.'},{credits:90})
  ],'Speak to Mara about the medicine case.'),
  aftermath('reckoning','The next name in the book','Silas has heard. He gives you the name of the person who financed the auction: Mother Rusk, out in Ravel.','silas-voss','distribution',{
   clinic:'Silas closes the unpaid invoice. “The medicine reached sick people. My supplier will still collect.” He writes Mother Rusk’s address beneath it. You have helped the clinic and inherited a conversation nobody wanted.',
   contract:'Silas pays without counting twice. “The auction went well.” When you ask about the clinic, he looks at the sealed invoice. His confidence in you has grown; Mara will remember the empty shelf. Mother Rusk financed the shipment.',
   buyout:'Silas hands over the cancelled invoice. “You bought them a reprieve. Do not confuse that with changing the terms.” He gives you Mother Rusk’s address. She is the person who decides what the next shipment will cost.'
  },'Return to Silas. He will remember how you handled the favor.')
 ]},
 {id:'paper_bounty',title:'A warrant with clean edges',category:'Bounty',offeredBy:'orin-dax',summary:'A named fugitive is hiding in Hearth. The reward is real; the evidence deserves a second look.',reward:240,stages:[
  talk('warrant','Bring Rook in','Orin’s warrant names a pilot called Rook. Theft, assault, and a missing medical shipment. “Bring the pilot in alive if you can. And look at the camera buffer before you decide what happened.”','orin-dax','Collect the warrant from Orin at Kettle.'),
  puzzle('evidence','Three pictures, two stories','The orchard image shows Rook carrying a stretcher. The weapon in the warrant comes from another camera, three days earlier. Someone assembled a convincing sequence.','warrant-camera',evidence,'Check the freight-lift buffer inside Morrow’s Old Orchard Pump House.'),
  {id:'hunt',title:'The borrowed transponder',kind:'hunt',at:{systemId:'hearth'},objective:'Find Rook’s ship in Hearth. Disable it and hail within 220 m, or recover proof after its destruction.',text:'Rook’s ship transmits a maintenance code instead of a name. Orin can arrange a hearing if the pilot survives. A destroyed ship can still settle the warrant.',targetName:'Rook · Borrowed Luck',actionLabel:'Hail the disabled ship'},
  choose('judgment','A person, or a closed file','Orin recognizes the forged image. The Combine will still pay. Taking Rook to an independent hearing costs time and gives the injured dockworker a chance to testify too.','orin-dax',[
   option('hearing','Require an independent hearing','Accept a smaller immediate fee; preserve the evidence and the right to answer it.',{rep:{lantern:10,concord:5,meridian:-5},trust:{'orin-dax':5,'mara-reed':2},flags:['rook_hearing'],memory:'You insisted that Rook’s case be heard with the unaltered evidence.'}),
   option('employer','Hand the file to the employer','Earn a 70 cr supplement. The employer chooses which evidence becomes public.',{credits:70,rep:{meridian:10,freewake:-7},trust:{'orin-dax':-3,'silas-voss':2},flags:['rook_returned'],memory:'You let the employer close Rook’s warrant.'}),
   option('release','Publish the forgery and close the warrant','Rook avoids that employer. The alleged assault still has no hearing.',{rep:{freewake:9,cinder:4,concord:-4},trust:{'orin-dax':-1,'mara-reed':3},flags:['rook_released'],memory:'You published the forged warrant and refused the employer’s claim.'})
  ],'Bring Rook or the recovered evidence back to Orin.')
 ]},
 {id:'water_dividend',title:'The water between us',category:'Settlements',offeredBy:'mara-reed',requires:{anyCompleted:['last_fare','salt_debt']},summary:'Morrow can repair its water system. Paying for it will put three neighboring settlements at odds.',reward:260,stages:[
  talk('proposal','A repair that outlived its grant','Mara can rebuild the bypass. The old grant pays only if the export orchard gets priority over households. Nadi at the Weighhouse knows why that clause exists.','mara-reed','Ask Mara about the outer-orchard bypass.'),
  puzzle('manifold','Four units of pressure','The pressure gauge remembers the last dry season. Send enough water to the homes and cooling loop without bursting the export line.','orchard-valves',valves,'Balance the valve manifold inside the Old Orchard Pump House.'),
  talk('grain','The kitchen at the other end','Nadi shows you a meal rota for refinery workers who cannot grow food. The export orchard is feeding them. “Morrow deserves water. So do the people it has never met.”','nadi-vale','Visit Nadi at the Weighhouse in Brindle.'),
  choose('grant','Choose who carries the risk','Ryn can renew the grant if Morrow guarantees exports. A cooperative loan leaves the town independent but exposed to the next failed harvest. Publishing the old amendments could free the system—and freeze all funding during the dispute.','commissioner-ryn',[
   option('cooperative','Back the cooperative loan','Spend 70 cr. Local control, with the risk held by local families.',{rep:{freewake:12,meridian:-4},trust:{'mara-reed':4,'nadi-vale':2},flags:['water_cooperative'],memory:'You helped the orchard families finance their own water.'},{credits:70}),
   option('guarantee','Accept the export guarantee','No upfront cost. Keep distant kitchens supplied; surrender part of Morrow’s control.',{rep:{meridian:10,freewake:-4},trust:{'nadi-vale':4,'mara-reed':-2,'commissioner-ryn':3},flags:['water_guarantee'],memory:'You accepted a guaranteed export share to fund Morrow’s repairs.'}),
   option('publish','Publish the hidden amendments','Win a public case at the cost of a funding freeze. The temporary bypass must hold.',{rep:{lantern:8,freewake:7,meridian:-10},trust:{'mara-reed':2,'commissioner-ryn':-5},flags:['water_amendments_public'],memory:'You made the water contract’s hidden amendments public.'})
  ],'Take the competing claims to Ryn at Ledger Ring.'),
  aftermath('return','What the taps remember','Mara writes the agreement beside the repair rota, where the people who must live with it can read it.','mara-reed','grant',{
   cooperative:'Mara writes the cooperative terms beside the repair rota. “We own the pump. We also own the bad harvest.” She asks you to tell Nadi that the kitchen’s next shipment is still on the schedule, even without a guarantee.',
   guarantee:'Mara marks the promised export share in red. Nadi’s kitchen will receive its deliveries; the orchard will have to ask permission before changing them. “It is a working pump,” Mara says. She does not say thank you yet.',
   publish:'Mara pins the hidden amendments where everyone can read them. The grant account is frozen. She adds another volunteer shift to keep your temporary bypass running while the public challenge moves through the registry.'
  },'Return to Mara on Morrow with the agreement.')
 ]},
 {id:'borrowed_voice',title:'Someone using your voice',category:'Unsettling',offeredBy:'ada-finch',requires:{completed:['nine_knocks']},summary:'A second recorder has answered Northwatch. It is asking for a person who has never visited it.',reward:310,stages:[
  talk('reply','A reply after the line went quiet','Ada received a call from Blindpost. It used her brother’s voice to ask whether she had eaten. The call arrived even if you cut Northwatch’s transmitter.','ada-finch','Return to Ada after settling the Northwatch recorder.'),
  talk('listen','A voice can be a habitat','Tiva finds overlapping breaths in the signal. “If something learned to live in these recordings, destroying them may kill it. Giving it a channel may let it wear someone else.”','tiva','Take the reply to Tiva at Listening House in Vesper.'),
  inspect('intercom','The microphone is gone','The intercom knows which answer you chose at Northwatch. Its next sentence uses Ada’s voice: “Please stop calling me a recording.”','blindpost-speaker','Reach the sealed observation intercom at Blindpost in Hush.'),
  puzzle('consent','A gap it cannot cross','Tiva’s test asks the speaker to wait for a refusal. It repeats every word perfectly. The important part is whether it leaves the pause empty.','blindpost-speaker',intervals,'Run the turn-taking test at the Blindpost intercom.'),
  choose('custody','What does a voice get to own?','The speaker can imitate people but cannot leave its receiver without permission. Ada wants her brother’s voice back. Tiva wants it to choose a voice of its own. Neither knows whether the brother is still there.','tiva',[
   option('separate','Offer a receiver and a name of its own','Keep the signal isolated while allowing an identity beyond the borrowed voices.',{rep:{lantern:12,concord:-3},trust:{'tiva':5,'ada-finch':1},flags:['voice_named'],memory:'You gave the Blindpost speaker a separate receiver and the chance to choose a name.'}),
   option('family','Return it to Ada’s family','Preserve the relationship they recognize; the speaker keeps wearing a dead person’s voice.',{rep:{freewake:7,lantern:-3},trust:{'ada-finch':5,'tiva':-2},flags:['voice_returned'],memory:'You returned the speaking receiver to Ada’s family.'}),
   option('quarantine','Place it under Continuity quarantine','Protect other receivers, with no promise that the quarantine will ever end.',{rep:{concord:12,lantern:-6},trust:{'tiva':-4,'ada-finch':-2},flags:['voice_quarantined'],memory:'You placed the Blindpost speaker under an indefinite quarantine.'})
  ],'Return to Tiva to decide who controls the receiver.')
 ]},
 {id:'first_names',title:'Before we name each other',category:'First contact',offeredBy:'tiva',requires:{anyCompleted:['borrowed_voice','water_dividend']},summary:'At the edge of the chart, a nonhuman community has been refusing human trade without refusing human visitors.',reward:420,stages:[
  talk('invitation','A place between words','Tiva has an invitation from Chora. Human traders interpreted its silence as assent. The people who sent it disagree.','tiva','Ask Tiva about the invitation from Chora.'),
  talk('visitor','The visitor is being measured','Vey asks which parts of your name you chose. The translator calls this “customs inspection”, then “greeting”, then “apology”.','vey','Meet Vey on Chora in the Chorus system.'),
  puzzle('language','Permission has a shape','The interval stone responds when you stop filling the silence. Vey’s greeting contains room for the other person to walk away.','chora-translation',intervals,'Build a greeting at the interval stone on Chora.'),
  choose('terms','A price for being understood','A complete translation would let human companies negotiate directly. It would also expose ceremonial speech never intended for trade. Vey offers a narrow vocabulary; the Combine offers a much larger payment for the whole record.','vey',[
   option('limited','Publish only the agreed trade vocabulary','Respect the boundary. Negotiation stays slower and some misunderstandings remain.',{rep:{lantern:12,freewake:5,meridian:-3},trust:{'vey':6,'tiva':3},flags:['choral_consent'],memory:'You kept the Choral translation within the permission Vey gave you.'}),
   option('sell','Sell the complete recording','Earn 140 cr. Traders gain fluency in words they were never invited to use.',{credits:140,rep:{meridian:12,lantern:-8},trust:{'vey':-7,'tiva':-5},flags:['choral_recording_sold'],memory:'You sold the complete Choral recording without Vey’s consent.'}),
   option('return','Return the recording and trade in person','Keep no copy. Visitors must build relationships before they can negotiate.',{rep:{freewake:8,lantern:5,cinder:3},trust:{'vey':5,'tiva':1},flags:['choral_recording_returned'],memory:'You returned the Choral recording and kept only the greeting.'})
  ]),
  aftermath('echo','The people inside the translation','Tiva asks whose permission survives inside the translation.','tiva','terms',{
   limited:'Tiva publishes the agreed vocabulary with Vey listed as its author. There are gaps in every exchange, and now the gaps have names: words that were not offered, and questions still waiting for trust.',
   sell:'Tiva has already seen the complete recording on a Combine terminal. “You can translate a refusal,” she says. “That does not make it an invitation.” Vey’s next scheduled message is an empty interval.',
   return:'Tiva watches you delete the final local copy. The next visitor will have to sit with Vey and learn. “Slower,” she says. Then she starts planning the visit.'
  },'Return to Listening House with the terms of contact.')
 ]},
 {id:'borrowed_time',title:'A debt measured in years',category:'Deep space',offeredBy:'doctor-sef',requires:{anyCompleted:['paper_bounty','water_dividend']},summary:'A rescue call near Umbra has arrived late. The family waiting for it has grown old.',reward:440,stages:[
  talk('family','The patient with the younger parent','Sef has treated the same family for decades. A mother lost near Umbra has sent a new distress call. She believes she has been gone for nineteen minutes.','doctor-sef','Ask Doctor Sef at Bastion Three about the delayed distress call.'),
  inspect('register','Three versions of one call','The register confirms the sender and the changing clock offset. Elet has been keeping the receiver running with parts from the observatory’s own safety systems.','umbra-register','Read the delayed rescue register at Umbra Watch.'),
  {id:'reading',title:'The edge of the slow water',kind:'ship-scan',at:{systemId:'umbra',x:1450,y:-350},objective:'Fly to the marked reading point near Umbra’s black hole and take a sensor reading. Stay outside the inner hazard.',text:'The signal is strongest along the outer tidal contour. You need a clean reading, not a closer approach.',actionLabel:'Take the tidal reading'},
  choose('rescue','What can the rescue carry?','Elet can send a guided rescue capsule, or use the same reserve to stabilize the observatory for everyone working here. A paid fuel transfer can support both, but the delayed family will never recover the years they lost.','elet',[
   option('capsule','Send the rescue capsule','Use 4 ship fuel. One family gets an answer; the observatory loses its reserve.',{rep:{freewake:10,lantern:2},trust:{'elet':-1,'doctor-sef':5},flags:['umbra_rescue'],memory:'You sent the Umbra rescue capsule at the expense of the observatory’s reserve.'},{fuel:4}),
   option('station','Secure the observatory first','Protect its current crew. The stranded mother will keep waiting on a slower clock.',{rep:{concord:9,lantern:6},trust:{'elet':3,'doctor-sef':-4},flags:['umbra_station'],memory:'You stabilized Umbra Watch before attempting the delayed rescue.'}),
   option('both','Buy a replacement reserve and send the capsule','Spend 120 cr and 4 fuel. The rescue and station both retain a chance.',{rep:{freewake:8,lantern:8},trust:{'elet':4,'doctor-sef':5},flags:['umbra_both'],memory:'You funded a replacement reserve and sent Umbra’s rescue capsule.'},{credits:120,fuel:4})
  ],'Return to Elet at Umbra Watch with the reading.'),
  aftermath('news','The age of the person at the door','Sef waits with the family’s paper file open.','doctor-sef','rescue',{
   capsule:'The capsule has cleared the slow contour. Sef prepares two chairs for a mother who is now younger than her daughter. Elet’s next message requests reserve parts. The family has its reunion; the observatory still has your debt.',
   station:'Sef writes “rescue deferred” beside a name that has already waited decades. The observatory crew are safe. The patient asks whether another year here is another minute for her mother. You cannot give her a date.',
   both:'The reserve transfer cleared and the capsule is on its way. Sef prepares the family for a reunion without shared ages or shared memories. Your payment saved a chance; it could not purchase the years between them.'
  },'Return to Doctor Sef at Bastion Three.')
 ]},
 {id:'rusk_ledger',title:'The household book',category:'Underworld',offeredBy:'silas-voss',requires:{completed:['salt_debt'],minTrust:{'silas-voss':-4}},summary:'Mother Rusk’s protection keeps a market alive. Her household ledger makes leaving it almost impossible.',reward:360,stages:[
  talk('introduction','Someone who remembers birthdays','Silas offers an introduction to Rusk. “Do not mistake her for a fool because she is kind. Do not mistake kindness for a free room.”','silas-voss','Ask Silas about the market that financed the medicine auction.'),
  talk('welcome','The market’s mother','Rusk points to the kitchens and the patched air plant. “Governments sent flags. I sent filters. Yes, they pay me back.”','mother-rusk','Meet Mother Rusk at Ravel Market.'),
  inspect('accounts','The interest outlives the debt','The book records genuine rescues and deliberately impossible interest. There are no forged signatures. Some signatories were too young to read.','rusk-book','Read the household ledger at Ravel Market.'),
  choose('settlement','A protection racket with working kitchens','Destroying the book frees debtors but threatens the kitchens’ credit. Enforcing it keeps the air paid for and the workers trapped. The Ferryman can smuggle copies to an independent tribunal, if you finance the passage.','mother-rusk',[
   option('erase','Erase the inherited debts','The market loses collateral overnight. Families can finally leave.',{rep:{freewake:12,cinder:-6,meridian:-6},trust:{'mother-rusk':-6,'silas-voss':-2,'ferryman':3},flags:['rusk_debts_erased'],memory:'You erased the inherited debts in Rusk’s household book.'}),
   option('enforce','Honor the protection agreements','Earn 100 cr. Rusk keeps the kitchens and the debtors.',{credits:100,rep:{cinder:10,meridian:6,freewake:-12},trust:{'mother-rusk':6,'silas-voss':4},flags:['rusk_debts_enforced'],memory:'You helped Rusk enforce the household debts.'}),
   option('tribunal','Pay to move the evidence to a tribunal','Spend 85 cr. Relief will be slow, but the kitchens can stay funded during review.',{rep:{lantern:9,concord:7,cinder:-3},trust:{'mother-rusk':-2,'ferryman':4,'silas-voss':1},flags:['rusk_debts_reviewed'],memory:'You financed an independent review of Rusk’s protection debts.'},{credits:85})
  ]),
  aftermath('passage','A name crossed out for once','The Ferryman has heard what you did with the household book.','ferryman','settlement',{
   erase:'The Ferryman crosses out six inherited debts. The newly free families still need somewhere to live, and the kitchens have lost their credit. “Leaving is allowed now,” he says. “That is where my work starts.”',
   enforce:'The Ferryman leaves every name on the wall. Rusk’s kitchens remain funded, and the people who cook there remain bound to her. He accepts your report without offering you a seat.',
   tribunal:'The Ferryman seals copies of the ledger in three ordinary freight sleeves. The review will be slow, but no single lost courier can erase the record. For the first time, he has departure dates beside the names instead of balances.'
  },'Meet the Ferryman at Patchwork Anchorage to settle the passage accounts.')
 ]},
 {id:'lost_ticket',title:'The ticket under the bench',category:'Passing moment',offeredBy:'len-vale',summary:'A prepaid return ticket has fallen under the departure bench.',reward:0,stages:[choose('ticket','Nobody is looking for it yet','Len has not noticed the ticket under your boot. Its owner is asleep against the departure board. The fare could buy your next tank of fuel.','len-vale',[
  option('return','Wake the passenger and return it','No payment. Len will remember the small thing you did when nobody asked.',{trust:{'len-vale':2},rep:{freewake:2},memory:'You returned the lost ticket under the departure bench.'}),
  option('cash','Cash the unused ticket','Gain 28 cr. Someone will wake up without a way home.',{credits:28,trust:{'len-vale':-2},rep:{freewake:-2},memory:'The missing ticket was cashed through your transponder.'})
 ])]},
 {id:'quiet_meal',title:'A bowl left outside',category:'Passing moment',offeredBy:'nadi-vale',summary:'The communal kitchen has one bowl left and two people waiting.',reward:0,stages:[choose('meal','The last serving','One person worked all day in the mill. The other arrived yesterday and has not found work. Nadi can make another pot if someone pays for the power.','nadi-vale',[
  option('worker','Give it to the mill worker','Reward the labor that kept the kitchen supplied.',{rep:{meridian:2},trust:{'nadi-vale':1},memory:'You gave the last serving to the mill worker.'}),
  option('arrival','Give it to the new arrival','Need comes first tonight.',{rep:{freewake:2},trust:{'nadi-vale':1},memory:'You gave the last serving to the new arrival.'}),
  option('pot','Pay for another pot','Spend 12 cr. Both eat, and the kitchen still needs a plan for tomorrow.',{rep:{freewake:2,lantern:1},trust:{'nadi-vale':2},memory:'You paid for a second pot in the Weighhouse kitchen.'},{credits:12})
 ])]}
]);

export const FACTION_RELATIONS=freeze({
 concord:{rivalId:'cinder',benefit:'Continuity passenger work pays 12% more while pledged.',pitch:'Rescue coverage in exchange for inspection and registry cooperation.'},
 freewake:{rivalId:'meridian',benefit:'Freewake passenger work pays 12% more while pledged.',pitch:'Mutual aid and local ownership, even when a strike disrupts a distant port.'},
 meridian:{rivalId:'freewake',benefit:'Combine passenger work pays 12% more while pledged.',pitch:'Reliable lanes and contracts, with debts that travel farther than people.'},
 lantern:{rivalId:'meridian',benefit:'Lantern passenger work pays 12% more while pledged.',pitch:'Evidence, patient inquiry, and a refusal to let ownership decide what is true.'},
 cinder:{rivalId:'concord',benefit:'Cinder passenger work pays 12% more while pledged.',pitch:'Sanctuary and salvage rights; ask carefully who counts as a guest.'}
});

export const PASSENGER_NAMES=freeze(['Eda Moss','Jori Pell','Tamsin Roe','Pax Imani','Arlen Soto','Mina Sol','Kess Rowan','Nell Aster']);
export const PASSENGER_TYPES=freeze([
 {id:'commuter',label:'Shift change',text:'A worker whose connecting shuttle was cancelled.',base:48,bonus:12,comfort:'A smooth trip earns a 12 cr tip.'},
 {id:'patient',label:'Clinic passage',text:'A passenger traveling for treatment, with a sealed medical bag.',base:64,bonus:15,comfort:'Arrive without taking hull damage for a 15 cr care bonus.'},
 {id:'courier',label:'Carry-on only',text:'A courier with one bag who would rather keep it on their lap.',base:58,bonus:10,comfort:'Deliver intact for a 10 cr tip. You are paid for passage, not the bag.'}
]);

export const questContact=id=>QUEST_CONTACTS.find(value=>value.id===id)||null;
export const questObject=id=>QUEST_OBJECTS.find(value=>value.id===id)||null;
export const questThread=id=>QUEST_THREADS.find(value=>value.id===id)||null;
