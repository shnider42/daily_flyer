/** Three fictional final viewpoints, 93 years before Farwake. */
export const STORY_VERSION = '0.4.0';
export const ERA = '93 years before Farwake';
const record = (id,title,kind,source,body,takeaway='') => ({id,title,kind,source,body,takeaway});
const route = (target,label,direction='back',x=50,y=55,requires=[],reason='') => ({target,label,direction,x,y,requires,reason});
const detail = (id,title,body,anchor=[50,50]) => ({id,title,body,anchor});
const scene = (id,title,subtitle,image,description,routes,observations=[]) => ({id,title,subtitle,image,description,routes,observations});
const action = (id,scene,label,sets,requires,message,extra={}) => ({id,scene,label,sets,requires,message,kind:'operate',...extra});
const task = (flag,scene,action,title,text,hint) => ({flag,scene,action,title,text,hint});
const fiction = 'A fictional story in the Farwake universe. The people, installations and events are invented.';

const lunaRecords = [
  record('luna-handover','An overdue handover','document','Your shift sheet',
    'You are Mara Venn, the night communications operator at Nightglass. Tomas was due to relieve you forty minutes ago. His transfer has not checked in. Earth control has also missed its scheduled call. You have written both times on the shift sheet. Tomas left a note yesterday: “Save me the chair that doesn’t squeak.”',
    'Find out whether the station can transmit before trying Earth again.'),
  record('luna-fault','The local test fails','observation','Radio desk · diagnostic printout',
    'The radio passes its internal check. The antenna feed does not: the test signal is lost between the desk and the surface dish. This test uses a local load, not Earth. A failed feed could explain why your messages are not getting out. It cannot tell you why relief is late.',
    'Trace the antenna feed through the service bay and the lower landing.'),
  record('luna-circuits','Three separate supplies','diagram','Service-bay circuit card',
    'RETURN runs the green route lamps from an independent cell. INSPECTION powers the shaft lights. RADIO powers the desk and the cable to the surface dish. Switch RADIO off before changing a feed connector. Keep RETURN connected. A spare feed coupler is in the cabinet.',
    'Light the shaft, take the spare coupler, and isolate RADIO before touching the feed.'),
  record('luna-feed','A split connector','observation','Antenna feed · lower cable run',
    'The thick shielded cable runs from the radio desk, through this connector, and up to the surface dish. Its retaining collar has split. The plug can move in its socket. It is a physical break in the feed, not a sound coming from the tunnel.',
    'Replace this coupler with RADIO isolated. The independent green lamps stay on.'),
  record('luna-bench','The repaired feed passes','observation','Radio desk · repeated local test',
    'The test signal now reaches the local load at the dish and returns without a fault. The replacement coupler is seated properly. The microphone, transmitter and feed all pass. This proves your equipment works; it is not a reply from Earth.',
    'Check the surface dish is tracking Earth, then run its pointing check.'),
  record('luna-antenna','The dish is tracking','observation','Surface dish · pointing check',
    'EARTH TRACK is selected. The dish turns, settles on its stored track and reports that its position matches the command. The outgoing test pulse registers at the antenna. No incoming voice has been identified.',
    'Return to the radio desk and open the Earth channel.'),
  record('luna-relief','Nobody has cycled the lock','observation','Airlock access log',
    'Your own outside inspection is the last entry. No transfer craft has requested the pad. No other suit has entered since your shift began. The log is working: opening its cover adds the current time to the maintenance line.',
    'The missing arrival is real. It does not tell you what happened to Tomas.'),
];
const lunaScenes = {
  approach:scene('approach','The approach','Lunar survey perimeter','approach.webp','The pad is empty. Green lamps lead between the airlock and the surface dish. You checked this route at the start of your shift.',[route('airlock','Airlock','forward',55,54),route('beacon','Surface dish','right',88,58)],[detail('luna-pad','The empty pad','There should be a pair of lamps moving beyond the ridge by now. There are none. You wait long enough to be sure.',[72,46])]),
  airlock:scene('airlock','The airlock','Waiting for relief','airlock.webp','The green return lamps have their own supply. The arrivals display has no new entry.',[route('junction','Service junction','forward',53,53),route('approach','Outside')],[detail('luna-boots','A spare pair of boots','Tomas keeps a spare pair below the bench. One lace is tied around both boots so nobody borrows just one.',[36,72])]),
  junction:scene('junction','Service junction','The route you know','junction.webp','The radio room is on the left and the service bay is on the right. The lower shaft has no inspection lighting yet. The green route strip is still on.',[route('survey','Radio room','left',13,48),route('service','Service bay','right',87,48),route('shaft','Cable shaft','down',50,75,['inspectionPowered'],'Restore INSPECTION in the service bay before entering the dark shaft.'),route('airlock','Airlock')],[detail('luna-strip','The green strip','This strip belongs to the return supply. You can work on the radio without losing it.',[42,76])]),
  survey:scene('survey','The radio room','Mara Venn · night shift','survey.webp','Your chair is still warm. The radio is on, the shift sheet is unfinished, and the Earth channel has not answered.',[route('junction','Service junction')],[detail('luna-mug','Your mug','The tea has gone cold. You decide not to make another until you know whether Tomas is coming.',[80,68]),detail('luna-chair','The other chair','You repaired the loose foot last week. It still squeaks. You had planned to let Tomas discover that himself.',[48,78])]),
  service:scene('service','The service bay','Route lamps, inspection lights, radio','service.webp','The panel has separate switches for INSPECTION and RADIO. The green RETURN cable bypasses both. A spare feed coupler sits in the cabinet.',[route('junction','Service junction','right',93,54)],[detail('luna-card','A familiar repair','You have changed one of these couplers before. The difficulty is the walk down the shaft, not the part itself.',[40,51])]),
  shaft:scene('shaft','The cable shaft','Following the antenna feed','shaft.webp','A thick shielded cable runs down the wall. It is the radio feed. The old acoustic survey pickup beside it belongs to a different circuit.',[route('lower','Lower landing','down',54,72,['feedInspected'],'Inspect the radio feed before working at the lower landing.'),route('junction','Service junction')],[detail('luna-pickup','The unused pickup','The acoustic pickup is switched off. It measures sound inside the shaft; it does not carry your messages to Earth.',[24,48])]),
  lower:scene('lower','The lower landing','The damaged coupler','lower.webp','The antenna cable passes through a loose coupler beside the landing. Green route markers remain visible above you.',[route('shaft','Back up the shaft','forward',24,46)],[detail('luna-tools','Your tools','You put each tool in a pocket before reaching for the next. You do not want to climb down here twice.',[65,59])]),
  beacon:scene('beacon','The surface dish','Antenna pointing control','beacon.webp','The dish controller has a local-test position and an EARTH TRACK preset. Its speaker is only a maintenance monitor; the radio desk is inside.',[route('approach','Back to the station','forward',89,42)],[detail('luna-earth','Earth above the ridge','You have looked toward it every shift. Tonight you keep looking back at the radio indicator instead.',[64,28])]),
};
const lunaActions = [
  action('read-handover','survey','Read your shift sheet',['handoverRead'],[],'You check the overdue relief and missed call.',{record:'luna-handover',kind:'inspect',x:65,y:62}),
  action('test-radio','survey','Run the local radio test',['faultKnown'],[],'The radio passes. The antenna feed fails.',{record:'luna-fault',x:41,y:54}),
  action('read-circuit-card','service','Read the circuit card',['circuitsRead'],[],'The card identifies three independent supplies.',{record:'luna-circuits',kind:'inspect',x:25,y:44}),
  action('power-inspection','service','Switch on INSPECTION',['inspectionPowered'],['circuitsRead'],'The shaft lights come on. The green return lamps stay steady.',{reason:'Read the circuit card to identify the shaft-light supply.',x:48,y:51}),
  action('take-coupler','service','Take the spare feed coupler',['spareTaken'],['faultKnown'],'You put the spare coupler in your tool pocket.',{reason:'Test the radio at your desk before choosing a replacement part.',x:42,y:64}),
  action('isolate-radio','service','Switch RADIO off for the repair',['radioIsolated'],['circuitsRead','faultKnown'],'The RADIO indicator goes dark. The separate inspection and return lamps stay on. It is safe to work on the antenna feed.',{reason:'Identify the failed feed and read the circuit card first.',x:69,y:48}),
  action('test-lamp-supply','service','Check the green RETURN supply',[],[],'The return cell is healthy. It only powers the green route lamps. It cannot repair or supply the radio.',{kind:'inspect',x:23,y:62}),
  action('inspect-feed','shaft','Trace the antenna cable',['feedInspected'],['inspectionPowered'],'The feed connector has a split retaining collar.',{record:'luna-feed',kind:'inspect',x:39,y:42}),
  action('replace-coupler','lower','Replace the damaged feed coupler',['couplerReplaced'],['radioIsolated','spareTaken','feedInspected'],'You remove the split coupler, fit the spare and tighten its collar. The cable no longer moves in its socket.',{reason:'Take the spare from the service bay, inspect the feed, and switch RADIO off before replacing the connector.',x:65,y:59}),
  action('restore-radio','service','Switch RADIO back on',['radioRestored'],['couplerReplaced'],'The radio supply returns. The new connection is ready for a local test.',{reason:'Replace the damaged coupler at the lower landing first.',x:69,y:48}),
  action('repeat-radio-test','survey','Repeat the local radio test',['benchPassed'],['radioRestored'],'The repaired feed passes the local test.',{record:'luna-bench',reason:'Replace the coupler and restore RADIO at the service panel.',x:41,y:54}),
  action('align-earth','beacon','Select EARTH TRACK',['earthAligned'],['benchPassed'],'The dish moves out of its local-test position and settles on the Earth track.',{reason:'Prove the repaired radio feed works before checking the surface dish.',x:48,y:54}),
  action('test-pointing','beacon','Run the antenna pointing check',['antennaPassed'],['earthAligned'],'Pointing check passed. Outgoing pulse registered.',{record:'luna-antenna',reason:'Select EARTH TRACK at the dish controller first.',x:58,y:54}),
  action('check-relief','airlock','Check the arrivals log',['reliefChecked'],[],'No relief arrival has been logged.',{record:'luna-relief',kind:'inspect',x:38,y:50}),
  action('open-earth-channel','survey','Open the Earth channel',['finalEvent'],['antennaPassed'],'You open the channel and wait.',{reason:'Complete the local radio test and the surface dish pointing check first.',terminal:true,event:'static',x:53,y:57}),
];
const lunaTasks = [
  task('faultKnown','survey','test-radio','Test the radio','Check whether the fault is inside the station.','At the radio desk, run the local test. It does not need a reply from Earth.'),
  task('circuitsRead','service','read-circuit-card','Identify the supplies','Read the circuit card in the service bay.','Leave the radio room, turn right at the junction, and read the card beside the switches.'),
  task('inspectionPowered','service','power-inspection','Light the shaft','Switch on INSPECTION so you can reach the antenna cable.','The green RETURN supply is already on. INSPECTION is the separate overhead lighting circuit.'),
  task('spareTaken','service','take-coupler','Take a spare coupler','The service cabinet holds a replacement for the feed connector.','Take the spare before walking down the shaft.'),
  task('radioIsolated','service','isolate-radio','Isolate the radio','Switch RADIO off before touching its cable.','The card says RADIO can be isolated without cutting the route or inspection lights.'),
  task('feedInspected','shaft','inspect-feed','Find the broken connection','Trace the antenna cable in the shaft.','Return to the junction, take the cable shaft, and inspect the shielded feed.'),
  task('couplerReplaced','lower','replace-coupler','Replace the coupler','Fit the spare connector at the lower landing.','The spare is in your pocket and RADIO is off. Replace the split collar and seat the plug.'),
  task('radioRestored','service','restore-radio','Restore radio power','Return to the service bay and switch RADIO on.','Follow the green strip up to the junction. The service bay is on the right.'),
  task('benchPassed','survey','repeat-radio-test','Prove the repair worked','Repeat the test at your radio desk.','A successful local test proves the feed works. It is not contact with Earth.'),
  task('earthAligned','beacon','align-earth','Point the surface dish','Select EARTH TRACK on the outside controller.','Go through the airlock, cross the approach, and use the surface dish controls.'),
  task('antennaPassed','beacon','test-pointing','Check the antenna','Run the pointing check and confirm the outgoing pulse.','Use the check on the same controller after selecting EARTH TRACK.'),
  task('finalEvent','survey','open-earth-channel','Try Earth again','Return to the radio desk and open the channel.','The radio, feed and dish have passed their checks. You can now try the call.'),
];

const marsRecords = [
  record('mars-log','Calls without replies','document','Your communications log',
    'You are Ivo Hale, the maintenance technician at Aster Station. Your last messages to Earth and the lunar relay are still unacknowledged. You have allowed for the usual transmission delay and sent them again. The rest of the station crew left in the crawler before the weather closed in. Its tracker has not updated.',
    'Your immediate job is to restore the east camera and inspect the crawler approach.'),
  record('mars-fault','Power, but no picture','observation','East camera · diagnostic',
    'The camera controller answers. Its lens-heater warning is active and the picture is white. The outside temperature sensor still updates. Frost on the lens fits the readings. The window beside your desk faces the opposite slope; it cannot show the crawler approach.',
    'The workshop card explains how to clear the camera without overloading the supply.'),
  record('mars-card','One load at a time','diagram','Workshop · camera supply card',
    'The backup supply can run the lens HEATER or the CAMERA, not both. Select HEATER. Run one complete de-icing cycle. When CLEAR appears, change the selector to CAMERA and run a live-image check. Leave habitat heat on its own supply.',
    'Heat the lens before switching the backup supply to the camera.'),
  record('mars-clear','The lens clears','observation','Heater controller',
    'The cycle completes. The lens temperature rises, the frost sensor changes to CLEAR, and the heater cuts out. This is a completed repair, not a guess. The camera still needs the selector moved back to CAMERA.',
    'Select CAMERA in the workshop, then check the live picture from your desk.'),
  record('mars-live','A live empty track','observation','East camera · live-image check',
    'The image counter advances. A test movement turns the camera past the numbered mast and back again. The picture is live. The crawler track is empty. There are no suit lamps. Something briefly obscures the far edge of the image before the picture steadies.',
    'You can turn the camera toward that edge from the control desk.'),
];
const marsScenes = {
  'mars-control':scene('mars-control','The control room','Ivo Hale · Aster Station','mars-control.webp','The east-camera screen is washed out. Dust moves beyond the west-facing window. Earth and Luna have not answered your messages.',[route('mars-workshop','Workshop','right',89,54)],[detail('mars-bowl','A second cup','You set out a cup for the crawler driver before the weather worsened. The ring it leaves on the desk has dried.',[69,61]),detail('mars-window','The west window','The crawler route is behind this building. Looking through this window cannot replace the east camera.',[51,30])]),
  'mars-workshop':scene('mars-workshop','The workshop','Backup camera supply','service.webp','A labeled selector shares one backup supply between the camera and its lens heater. Habitat heat is on a separate circuit.',[route('mars-control','Control room','right',93,54)],[detail('mars-tools','Tools put away','You put the tools back after every job. Somebody always used to complain until they needed to find one.',[47,68])]),
};
const marsActions = [
  action('read-contact-log','mars-control','Read your contact log',['contactRead'],[],'Your messages remain unacknowledged.',{record:'mars-log',kind:'inspect',x:63,y:63}),
  action('diagnose-camera','mars-control','Run the east-camera diagnostic',['cameraFault'],[],'The controller responds. The lens-heater warning is active.',{record:'mars-fault',x:48,y:48}),
  action('read-camera-card','mars-workshop','Read the camera supply card',['cameraCard'],['cameraFault'],'One backup supply serves two loads.',{record:'mars-card',kind:'inspect',reason:'Run the camera diagnostic at the control desk first.',x:25,y:44}),
  action('select-heater','mars-workshop','Select HEATER on the backup supply',['heaterSelected'],['cameraCard'],'The backup supply now powers only the lens heater. Habitat heat remains on.',{reason:'Read the supply card before changing the selector.',x:48,y:51}),
  action('run-deice','mars-workshop','Run the full de-icing cycle',['lensClear'],['heaterSelected'],'The cycle completes. The frost indicator changes to CLEAR.',{record:'mars-clear',reason:'Select HEATER before running the de-icing cycle.',x:61,y:51}),
  action('select-camera','mars-workshop','Select CAMERA on the backup supply',['cameraSelected'],['lensClear'],'The heater disconnects and the camera powers up. The two loads are never connected together.',{reason:'Run the de-icing cycle until the lens reports CLEAR before powering the camera.',x:48,y:51}),
  action('test-both-loads','mars-workshop','Check whether both loads can run',[],['cameraCard'],'The supply card and the current meter agree: both loads would overload the backup. You leave the interlock intact.',{kind:'inspect',x:70,y:48}),
  action('check-live-camera','mars-control','Check that the camera image is live',['liveVerified'],['cameraSelected'],'The image counter advances and the camera follows your test command.',{record:'mars-live',reason:'Clear the lens and switch the backup selector to CAMERA in the workshop.',x:48,y:48}),
  action('pan-east-camera','mars-control','Turn the camera toward the movement',['finalEvent'],['liveVerified'],'You turn the camera toward the edge of the track.',{terminal:true,event:'reveal',reason:'Restore the camera and verify a live picture first.',x:48,y:48}),
];
const marsTasks = [
  task('cameraFault','mars-control','diagnose-camera','Find the camera fault','Run the diagnostic at the control desk.','The west window cannot show the crawler approach. Test the east camera.'),
  task('cameraCard','mars-workshop','read-camera-card','Check the backup supply','Read the camera card in the workshop.','Use the door on the right. The card is beside the supply selector.'),
  task('heaterSelected','mars-workshop','select-heater','Power the lens heater','Select HEATER on the backup supply.','The supply can serve only one load. Clear the frost before powering the camera.'),
  task('lensClear','mars-workshop','run-deice','Clear the lens','Run one complete de-icing cycle.','The cycle ends with the CLEAR indicator. There is no timed input.'),
  task('cameraSelected','mars-workshop','select-camera','Power the camera','Change the selector from HEATER to CAMERA.','The warm lens is clear. The heater can now give up the backup supply.'),
  task('liveVerified','mars-control','check-live-camera','Verify the live picture','Return to the desk and test the camera movement.','An advancing counter and a response to your command establish that this is a live view.'),
  task('finalEvent','mars-control','pan-east-camera','Look at the track edge','Turn the camera toward the movement.','Use the camera control at the desk.'),
];

const outpostRecords = [
  record('outpost-arrivals','No arrival expected','document','Latchkey Outpost · arrivals ledger',
    'You are Sera Vale, the caretaker at Latchkey, a small outpost on Callisto. The freight pilot left three days ago. No other arrival is scheduled. The landing receiver has logged no approach request today. You were eating when you heard three knocks at the outer access.',
    'Check the door and its pressure record before answering anyone.'),
  record('outpost-pressure','A latch short of its mark','observation','Pressure-door gauges',
    'Cabin pressure is normal. The outer compartment is at vacuum. The inner door is closed, but its mechanical latch is short of the seated mark. You must close the equalizer before turning the manual latch. The gauges do not show anyone waiting in the outer compartment.',
    'The hatch card in the utility room gives the safe order.'),
  record('outpost-card','Secure the inner door','diagram','Utility-room hatch card',
    'With the outer compartment at vacuum: close the EQUALIZER valve, seat the INNER LATCH, then run a pressure-hold check. Do not cycle the outer hatch for an unidentified arrival. The camera and intercom can be used with both doors closed.',
    'Close the equalizer, seat the latch, and test the seal. Neither door needs to open.'),
  record('outpost-seal','The seal holds','observation','Door · pressure-hold check',
    'The mechanical latch reaches its seated mark. The pressure-hold test passes with no loss. Both doors remain closed. Whatever made the earlier noise, you have fixed the loose latch and secured the cabin.',
    'Use the camera and intercom to check the arrival without opening the door.'),
  record('outpost-camera','An empty outer compartment','observation','Door camera',
    'The camera timestamp advances. You turn on the compartment lamp and watch it brighten in the image. The view is live. The outer compartment is empty, and the exterior hatch is shut.',
    'The image accounts for the compartment. It does not explain the knocking.'),
  record('outpost-intercom','No name given','audio','Your intercom call',
    '“This is Latchkey. Identify yourself.”\n\nYou release the talk switch. Only the room fan comes through your own microphone. You try once more. No answer. You leave the outer hatch locked.',
    'The door is secure. You can return to the table.'),
];
const outpostScenes = {
  'outpost-cabin':scene('outpost-cabin','Your cabin','Sera Vale · Latchkey Outpost','outpost-cabin.webp','Your supper is on the table. The outer access has just sounded three times. No visitor is expected.',[route('outpost-door','Pressure door','forward',66,55),route('outpost-utility','Utility room','left',7,52)],[detail('outpost-supper','Supper','You had just reached the part of the book where the detective names the wrong person. The page is still turned down.',[77,83]),detail('outpost-plant','A stubborn plant','The freight pilot brought the cutting in a food jar. It has put out two leaves since the last visit.',[17,23])]),
  'outpost-door':scene('outpost-door','The pressure door','Keep both doors closed','outpost-cabin.webp','The inner door is shut. Its latch and pressure gauges are within reach. The intercom has no incoming voice.',[route('outpost-cabin','Back to the table')],[detail('outpost-wheel','The latch wheel','There is a painted seated mark beside the wheel. You can check the mechanical bolt without relying on the indicator lamp.',[67,46])]),
  'outpost-utility':scene('outpost-utility','The utility room','Equalizer and hatch instructions','service.webp','The equalizer valve is beside the hatch card. Closing it isolates the cabin from the outer compartment.',[route('outpost-cabin','Cabin','right',93,54)],[detail('outpost-spare','A spare gasket','The packet has your handwriting on it: “Fits inner door. Not the kettle.” You remember the mistake that made the note necessary.',[35,65])]),
};
const outpostActions = [
  action('read-arrivals','outpost-cabin','Read the arrivals ledger',['arrivalsRead'],[],'No arrival is expected or logged.',{record:'outpost-arrivals',kind:'inspect',x:29,y:59}),
  action('inspect-door','outpost-door','Check pressure and the inner latch',['doorChecked'],[],'The pressure is steady, but the latch is not fully seated.',{record:'outpost-pressure',kind:'inspect',x:64,y:46}),
  action('read-hatch-card','outpost-utility','Read the hatch procedure',['hatchCard'],['doorChecked'],'The card gives the safe order for securing the door.',{record:'outpost-card',kind:'inspect',reason:'Check the door gauges and latch first.',x:25,y:44}),
  action('close-equalizer','outpost-utility','Close the EQUALIZER valve',['equalizerClosed'],['hatchCard'],'You turn the valve to CLOSED. The cabin is isolated from the outer compartment.',{reason:'Read the hatch procedure before changing the pressure connection.',x:48,y:51}),
  action('seat-latch','outpost-door','Seat the INNER LATCH',['latchSeated'],['equalizerClosed'],'You turn the wheel until the bolt reaches its seated mark. Neither door opens.',{reason:'Close the equalizer in the utility room before seating the latch.',x:67,y:46}),
  action('test-pressure-hold','outpost-door','Run a pressure-hold check',['sealVerified'],['latchSeated'],'The seal passes the pressure-hold check.',{record:'outpost-seal',reason:'Seat the inner latch before testing the seal.',x:58,y:48}),
  action('check-door-camera','outpost-door','Check the live door camera',['cameraChecked'],['sealVerified'],'The compartment lamp responds. The live view is empty.',{record:'outpost-camera',reason:'Secure the inner door and verify its pressure seal first.',x:50,y:28}),
  action('use-intercom','outpost-door','Ask the visitor to identify themselves',['intercomUsed'],['cameraChecked','arrivalsRead'],'You use the intercom without opening either door.',{record:'outpost-intercom',reason:'Check the arrival ledger and live camera before calling the unknown visitor.',x:50,y:38}),
  action('check-outer-control','outpost-door','Check the outer-hatch control',[],['doorChecked'],'No arrival has been authenticated. You leave the outer hatch locked. The camera and intercom work without opening it.',{kind:'inspect',x:61,y:63}),
  action('return-to-supper','outpost-cabin','Return to the table',['finalEvent'],['intercomUsed'],'You sit down beside your unfinished supper.',{terminal:true,event:'knock',reason:'Secure the door, check the live camera, and try the intercom before returning to the table.',x:79,y:82}),
];
const outpostTasks = [
  task('arrivalsRead','outpost-cabin','read-arrivals','Check who is expected','Read the arrivals ledger on your desk.','The landing receiver logs approach requests. Check it before going to the door.'),
  task('doorChecked','outpost-door','inspect-door','Check the pressure door','Read the gauges and look at the latch.','You can inspect both without opening either door.'),
  task('hatchCard','outpost-utility','read-hatch-card','Find the safe procedure','Read the hatch card in the utility room.','Return to the cabin and take the left door to the utility compartment.'),
  task('equalizerClosed','outpost-utility','close-equalizer','Isolate the cabin','Close the EQUALIZER valve.','The card specifies this before the manual latch.'),
  task('latchSeated','outpost-door','seat-latch','Seat the inner latch','Turn the wheel at the pressure door to its seated mark.','The equalizer is closed. The latch can now be secured.'),
  task('sealVerified','outpost-door','test-pressure-hold','Prove the door is sealed','Run the pressure-hold check.','The test must hold steady with the mechanical latch seated.'),
  task('cameraChecked','outpost-door','check-door-camera','Check the outer compartment','Use the camera and test its lamp.','The changing image shows whether the camera is live. Leave both doors closed.'),
  task('intercomUsed','outpost-door','use-intercom','Ask for a name','Call the visitor over the intercom.','Release the talk switch to listen after asking who is there.'),
  task('finalEvent','outpost-cabin','return-to-supper','Return to the table','You have secured the door and checked for a visitor.','Return to the cabin and sit at the table.'),
];

export const CHAPTERS = Object.freeze({
  nightglass:{id:'nightglass',title:'Nightglass',subtitle:'The overdue shift',location:'Luna',character:'Mara Venn',role:'Communications operator',startScene:'survey',image:'survey.webp',fiction,archive:'Your shift notebook',
    tagline:'Your relief is late. Earth has stopped answering.',
    brief:'You are Mara Venn, the night operator at a lunar survey station. Your relief is overdue and Earth has missed its scheduled call. Test the radio, repair the local fault, and try to reach Earth.',
    scenes:lunaScenes,records:lunaRecords,actions:lunaActions,tasks:lunaTasks,
    milestones:[{label:'Repair the antenna feed',flag:'benchPassed'},{label:'Check the surface dish',flag:'antennaPassed'},{label:'Call Earth',flag:'finalEvent'}],
    ending:{title:'An open channel',paragraphs:['The local-test lamp is green. You key the Earth channel.','“Nightglass to Earth control. My relief is overdue. Is anyone receiving?”','A click comes through the speaker. You lean closer.','“Tomas? If that’s you, say something.”','Static. You keep the channel open. The green lamps behind you do not flicker.','You press the talk switch again. “Please.”'],details:['The radio, antenna feed and pointing checks passed.','No reply you could identify reached the speaker.','Your relief had not arrived.']}
  },
  mars:{id:'mars',title:'The Empty Track',subtitle:'The east camera',location:'Mars',character:'Ivo Hale',role:'Maintenance technician',startScene:'mars-control',image:'mars-control.webp',fiction,archive:'Your maintenance notebook',
    tagline:'Neither Earth nor Luna answers. The crawler is late.',
    brief:'You are Ivo Hale, alone at Aster Station while its crew is out in the crawler. Their tracker has stopped updating. Earth and Luna have not answered. Restore the east camera so you can inspect the approach.',
    scenes:marsScenes,records:marsRecords,actions:marsActions,tasks:marsTasks,
    milestones:[{label:'Diagnose the camera',flag:'cameraCard'},{label:'Clear the lens and restore power',flag:'cameraSelected'},{label:'Inspect the track',flag:'finalEvent'}],
    ending:{title:'Beside the glass',paragraphs:['You turn the camera toward the edge of the track. A shape slips behind the near mast. The image counter keeps advancing.','“Aster to crawler. I can see someone by the—”','Movement crosses the window beside your desk. The opposite side of the building.','You turn. The shape stops against your reflection.','“No. No, don’t—”','A scream fills the room.'],details:['The de-icing cycle cleared the lens.','The restored camera supplied a live picture.','You saw movement outside. You did not identify it.']}
  },
  outpost:{id:'outpost',title:'No Arrival Logged',subtitle:'The closed door',location:'Callisto · Latchkey Outpost',character:'Sera Vale',role:'Outpost caretaker',startScene:'outpost-cabin',image:'outpost-cabin.webp',fiction,archive:'Your station notebook',
    tagline:'You are alone. Someone knocks at the access door.',
    brief:'You are Sera Vale, the caretaker of a small outpost on Callisto. Nobody is expected. Three knocks interrupt your supper. Check the arrival record, secure the pressure door, and find out who is there without opening it.',
    scenes:outpostScenes,records:outpostRecords,actions:outpostActions,tasks:outpostTasks,
    milestones:[{label:'Check the arrival and door',flag:'doorChecked'},{label:'Secure the cabin',flag:'sealVerified'},{label:'Identify the visitor',flag:'finalEvent'}],
    ending:{title:'The nearer door',paragraphs:['You put the spoon back in your bowl. The inner latch is seated. The pressure check passed. Both access doors are still closed.','You look toward the camera. The outer compartment is empty.','Three knocks.','You do not move.','This time they came from the utility door beside your chair.'],details:['You repaired the loose latch and verified the pressure seal.','The live camera showed an empty outer compartment.','No visitor gave a name.']}
  }
});
export const CHAPTER_ORDER = Object.freeze(['nightglass','mars','outpost']);
export const getChapter = id => CHAPTERS[id] || CHAPTERS.nightglass;
export const ALL_SCENES = Object.freeze(Object.assign({},...CHAPTER_ORDER.map(id=>CHAPTERS[id].scenes)));
export const RECORDS = Object.freeze(Object.fromEntries(CHAPTER_ORDER.flatMap(id=>CHAPTERS[id].records.map(r=>[r.id,Object.freeze(r)]))));
export const recordOrder = chapterId => getChapter(chapterId).records.map(r=>r.id);
// Retain the original scene map exports for the parked geometry experiment.
export const CHAPTER = CHAPTERS.nightglass;
export const SCENES = CHAPTER.scenes;
export const RECORD_ORDER = Object.freeze(recordOrder('nightglass'));
export const ENDINGS = Object.freeze(Object.fromEntries(CHAPTER_ORDER.map(id=>[id,CHAPTERS[id].ending])));
