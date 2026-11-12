/**
 * Ten original pressure pieces. Every lead and response is an authored phrase;
 * the repeating figures below are arrangements, never random note selection.
 * Short bass notes, two-note backing voicings and light percussion leave space
 * for weapons, shouted warnings and the original score's quiet aftermath.
 */

function piece(id,title,bars,bpm,cooldownSeconds,tags,intensity,build){
 return Object.freeze({id,title,family:'combat',bars,bpm,cooldownSeconds,tags:Object.freeze(['combat',...tags]),intensity,build});
}

function bassFigure(s,beat,root,figure,level=.58){
 for(const [offset,duration,interval] of figure)s.note(beat+offset,duration,root+interval,'bass',level,0,'bass');
}
function hits(s,beat,pattern,level=.4){
 for(const [offset,instrument,accent=1] of pattern)s.note(beat+offset,instrument==='brush'?.2:.12,instrument==='kick'?36:instrument==='hat'?42:38,instrument,level*accent,instrument==='hat'?.28:instrument==='kick'?0:-.17,'rhythm');
}
function tones(s,beat,harmony,instrument='organ',velocity=.3,duration=1.1){
 s.chord(beat,duration,[harmony.notes[0],harmony.notes[2]],instrument,velocity,-.24,.025);
}

// E minor: an off-centre motor underneath a long guitar answer. The middle
// leaves the motor running without the kit, then brings the opening hook home.
function breakTheWake(s,H){
 const a=[[0,.65,64],[1,.4,67],[1.75,.8,66],[3,.7,71],[4,1.3,69],[6,.6,67],[7,.6,64],[8,.7,66],[9.5,.4,69],[10.25,1,71],[12,1.5,67],[14,1.4,64]];
 const b=[[0,1.2,74],[1.75,.6,71],[3,.6,69],[4,1.3,67],[6,1.5,66],[8,.65,67],[9,.65,71],[10.5,.65,74],[12,1.6,72],[14,1.3,71]];
 const low=[[0,.38,0],[.75,.32,12],[1.5,.4,7],[2.5,.5,0],[3.5,.3,7]];
 for(let bar=0;bar<28;bar++){
  const beat=bar*4,h=H[(bar>=14&&bar<20?['g','d','am','em','c','bm']:['em','em','c','d','g','bm','am','em'])[bar>=14&&bar<20?bar-14:bar%8]],end=bar>=26;
  bassFigure(s,beat,h.bass,end?[[0,2.5,0]]:low,bar<2?.43:.6);
  if(bar<26){tones(s,beat+1.25,h,'pluck',.3,.4);if(bar%2===1)s.note(beat+3,.45,h.notes[1]+12,'pluck',.25,.28,'answer');}
  if(bar<14||bar>=18)hits(s,beat,[[0,'kick'],[1.5,'rim',.72],[2.5,'kick',.7],[3,'snare',.68],[.5,'hat',.4],[2,'hat',.32]],end?.22:bar<2?.3:.42);
  if(bar%8===0)s.chord(beat+.3,3,[h.notes[1],h.notes[2]],'pad',.23,.05,.02);
 }
 s.phrase(1,[[0,.5,64],[1,.5,67],[2.5,1,66]],'pluck',.5,0,.22);
 s.phrase(8,a,'guitar',.67,0,.18);s.phrase(32,a,'piano',.62,0,.18);
 s.phrase(56,b,'guitar',.69,0,.2);s.phrase(80,a,'guitar',.7,0,.18);
 s.phrase(104,[[0,.6,71],[1,.6,69],[2,1.2,67],[4,3,64]],'piano',.49,0,.1);
}

// A broad Navy call in D minor. Organ and piano share the tune rather than
// doubling it, and the half-time drum spacing keeps the carrier's guns clear.
function ordersAcrossTheDark(s,H){
 const a=[[0,1.4,57],[2,.55,62],[3,1,65],[4,1.4,64],[6,1.5,62],[8,1,60],[9.5,.5,62],[10.5,1.3,65],[12,2.8,64]];
 const b=[[0,.8,69],[1.5,.8,67],[3,1.5,65],[5,.7,64],[6.5,.8,62],[8,1.4,65],[10,.7,69],[11,1,70],[13,2,69]];
 const cycle=['dm','bb','gm','a7','dm','c','bb','a7'];
 for(let bar=0;bar<32;bar++){
  const beat=bar*4,h=H[bar>=16&&bar<24?['gm','gm','bb','c','dm','bb','gm','a7'][bar-16]:cycle[bar%8]],end=bar>=30;
  bassFigure(s,beat,h.bass,end?[[0,2.8,0]]:[[0,1.4,0],[2.75,.7,7]],bar<4?.45:.61);
  if(bar%2===0&&!end)tones(s,beat+.25,h,'organ',.4,2.2);
  if(bar%2===1&&bar<30)s.chord(beat+1.5,.6,[h.notes[1],h.notes[2]],'piano',.35,-.2,.035);
  hits(s,beat,bar>=14&&bar<16?[[0,'kick',.6]]:[[0,'kick'],[2,'snare',.7],[3.5,'hat',.35]],bar<4?.29:end?.2:.46);
  if(bar%8===7&&!end)hits(s,beat,[[3,'rim',.5],[3.5,'rim',.4]],.32);
 }
 s.phrase(1,[[0,1,57],[2,1.5,62]],'organ',.51,0,.15);
 s.phrase(16,a,'organ',.6,0,.15);s.phrase(40,a,'piano',.62,0,.14);
 s.phrase(64,b,'guitar',.64,0,.17);s.phrase(96,a,'organ',.63,0,.16);
 s.phrase(120,[[0,1.3,65],[2,1,64],[4,3.2,62]],'piano',.49,0,.15);
}

// B minor infantry movement: clipped piano questions, a dry rim cadence and
// a more sustained middle register when the section briefly holds position.
function bootsOnTheRelay(s,H){
 const a=[[0,.45,71],[.75,.45,69],[1.5,.7,66],[3,.5,62],[4,.6,64],[5,.45,66],[5.75,1.1,69],[8,.5,71],[9,.5,74],[10,.7,73],[11.5,.5,69],[13,1.8,66]];
 const b=[[0,1.5,67],[2,1.2,69],[4,1.5,71],[6,.7,66],[7,1.3,64],[9,.6,62],[10,1.3,66],[12,2.4,69]];
 const cycle=['bm','bm','g','d','em','bm','a','bm'];
 for(let bar=0;bar<28;bar++){
  const beat=bar*4,h=H[bar>=10&&bar<16?['g','g','em','d','a','a'][bar-10]:cycle[bar%8]],end=bar>=26;
  bassFigure(s,beat,h.bass,end?[[0,2.4,0]]:[[0,.75,0],[1.75,.5,7],[3,.6,12]],bar<2?.44:.55);
  if(!end){s.note(beat+.5,.45,h.notes[0],'pluck',.29,-.25);s.note(beat+2.75,.45,h.notes[2],'pluck',.26,-.25);}
  hits(s,beat,[[0,'kick',.75],[1,'rim',.8],[2.25,'kick',.55],[3,'rim'],[3.5,'hat',.32]],end?.18:bar<2?.3:.43);
  if(bar>=10&&bar<16&&bar%2===0)tones(s,beat+.2,h,'pad',.25,3.2);
 }
 s.phrase(.5,[[0,.45,71],[.75,.45,69],[2,1,66]],'piano',.51,0,.1);
 s.phrase(8,a,'piano',.63,0,.16);s.phrase(40,b,'guitar',.61,0,.18);
 s.phrase(72,a,'piano',.67,0,.16);s.phrase(104,[[0,.5,69],[1,.5,66],[2,1,64],[4,3,59]],'piano',.49);
}

// A light, fast D-minor chase. The high plucked line is deliberately short;
// urgency comes from its rhythm, not a continuous loud upper register.
function needleThroughTheFleet(s,H){
 const a=[[0,.4,74],[.75,.4,69],[1.5,.7,72],[2.75,.4,74],[4,.4,77],[4.75,.4,76],[5.5,.7,72],[7,.5,69],[8,.4,70],[8.75,.4,74],[10,1,72],[12,.5,69],[13,.5,67],[14,1.3,65]];
 const b=[[0,.7,72],[1.25,.5,69],[2.25,.5,67],[3.25,.5,65],[4.5,1.2,64],[6.5,1,67],[8,.7,69],[9.5,.5,72],[10.5,1.3,76],[13,1.8,73]];
 for(let bar=0;bar<28;bar++){
  const beat=bar*4,h=H[(bar>=14&&bar<20?['c','c','bb','gm','a7','a7']:['dm','bb','dm','c','gm','bb','a7','dm'])[bar>=14&&bar<20?bar-14:bar%8]],end=bar>=26;
  bassFigure(s,beat,h.bass,end?[[0,2.3,0]]:[[0,.42,0],[1,.42,12],[2.5,.42,7],[3.25,.42,0]],bar<2?.43:.59);
  if(bar%2===0&&!end)tones(s,beat+1.5,h,'piano',.31,.55);
  hits(s,beat,[[0,'kick'],[1,'snare',.65],[2.5,'kick',.75],[3,'snare',.58],[.5,'hat',.32],[1.5,'hat',.28],[3.5,'hat',.32]],end?.19:bar<2?.3:.44);
  if(bar===15||bar===19)s.note(beat+3,.4,h.notes[2]+12,'bell',.23,.31,'answer');
 }
 s.phrase(.5,[[0,.4,74],[.75,.4,69],[1.5,.7,72]],'pluck',.49,0,.2);
 s.phrase(8,a,'pluck',.61,0,.2);s.phrase(32,a,'guitar',.6,0,.13);
 s.phrase(56,b,'piano',.62,0,.17);s.phrase(80,a,'pluck',.65,0,.2);
 s.phrase(104,[[0,.45,74],[.75,.45,72],[1.5,.7,69],[3,.7,67],[4.5,2.5,62]],'guitar',.5);
}

// Engineering under pressure: E-minor eighths yield to a short open middle.
// The bell is a musical answer, not an alarm that could mask an actual warning.
function theLastCoolantLine(s,H){
 const a=[[0,1,64],[1.5,.5,66],[2.5,1,67],[4,.75,71],[5.5,.5,69],[6.5,1,67],[8,1.5,66],[10,.5,64],[11,.7,62],[12.5,2.3,64]];
 const b=[[0,2,72],[3,1.3,71],[5,1,67],[7,1.5,64],[10,.75,66],[11.5,1,69],[13,2,67]];
 const cycle=['em','d','c','am','em','g','c','bm'];
 for(let bar=0;bar<32;bar++){
  const beat=bar*4,h=H[(bar>=16&&bar<24?['c','c','am','am','g','d','bm','em']:cycle)[bar%8]],open=bar>=16&&bar<20,end=bar>=30;
  bassFigure(s,beat,h.bass,open||end?[[0,2.7,0]]:[[0,.6,0],[1.5,.45,7],[2,.6,0],[3.5,.35,12]],bar<4?.44:.57);
  if(!open&&!end)tones(s,beat+.75,h,'piano',.32,.55);
  if(open&&bar%2===0)s.chord(beat+.2,3.5,[h.notes[0],h.notes[2]],'pad',.27,-.05);
  hits(s,beat,open?[[0,'kick',.6],[3,'rim',.5]]:[[0,'kick'],[1.5,'brush',.85],[2.5,'kick',.65],[3.25,'rim',.75]],end?.2:bar<2?.29:.46);
  if([5,13,25].includes(bar))s.phrase(beat+1,[[0,.65,76],[1.5,.7,74]],'bell',.25,0,.34,'answer');
 }
 s.phrase(1,[[0,.7,64],[1.25,.7,66],[2.5,1,67]],'piano',.52);
 s.phrase(16,a,'guitar',.62);s.phrase(40,a,'piano',.62);
 s.phrase(64,b,'guitar',.61);s.phrase(96,a,'guitar',.67);
 s.phrase(120,[[0,1.2,67],[2,.7,66],[3,1,62],[5,2,64]],'piano',.49);
}

// Escort work with a G-Dorian colour: a patient melodic line over displaced
// kick beats, then a brighter upper answer as the protected crossing opens.
function coverTheCrossing(s,H){
 const a=[[0,1.1,67],[1.75,.6,69],[3,1,70],[4.5,1.2,72],[6.5,.7,69],[8,1.5,67],[10,.7,65],[11.25,.7,67],[12.5,2.1,69]];
 const b=[[0,1.3,74],[2,.7,72],[3.5,1.3,70],[6,1,69],[8,1.4,72],[10,1,74],[12,2.5,70]];
 const cycle=['gm','c','gm','f','bb','gm','c','gm'];
 for(let bar=0;bar<32;bar++){
  const beat=bar*4,h=H[bar>=12&&bar<20?['bb','bb','f','c','gm','c','bb','gm'][bar-12]:cycle[bar%8]],end=bar>=30;
  bassFigure(s,beat,h.bass,end?[[0,2.7,0]]:[[0,1.2,0],[2,.65,7],[3.25,.45,12]],bar<4?.43:.56);
  if(!end){s.note(beat+.75,.7,h.notes[0],'pluck',.3,-.3);s.note(beat+2.5,.65,h.notes[2],'pluck',.27,-.26);}
  if(bar%4===0&&!end)tones(s,beat+.1,h,'organ',.26,2.8);
  hits(s,beat,[[0,'kick',.7],[1.25,'brush',.8],[2.75,'kick',.65],[3.5,'rim',.75]],end?.18:bar<2?.27:.43);
 }
 s.phrase(.75,[[0,1,67],[1.5,.7,69],[3,1,70]],'guitar',.49);
 s.phrase(16,a,'guitar',.63,0,.2);s.phrase(48,b,'piano',.62,0,.18);
 s.phrase(80,a,'guitar',.65,0,.2);s.phrase(104,b.slice(0,4),'piano',.54,0,.18);
 s.phrase(120,[[0,1,70],[1.5,1,69],[3,1,65],[5,2.4,67]],'guitar',.48);
}

// Close quarters, low register. The fourth beat is often empty so shots and
// impacts are not buried under a continuous sixteenth-note percussion loop.
function throughTheBulkhead(s,H){
 const a=[[0,.45,59],[.75,.45,64],[1.5,.8,63],[3,.5,64],[4,.7,67],[5.25,.5,66],[6.25,1,62],[8,.5,59],[9,.5,62],[10.25,1,64],[12,1.5,66],[14,1,64]];
 const b=[[0,.8,67],[1.5,.6,71],[2.75,1.2,69],[5,.6,66],[6,1.3,67],[8,.7,64],[9.5,.7,62],[11,1.2,59],[13,1.8,63]];
 const cycle=['em','em','c','asus','em','bm','c','a7'];
 for(let bar=0;bar<28;bar++){
  const beat=bar*4,h=H[bar>=10&&bar<18?['bm','g','c','em','am','c','a7','a7'][bar-10]:cycle[bar%8]],end=bar>=26;
  bassFigure(s,beat,h.bass,end?[[0,2.4,0]]:[[0,.5,0],[1.5,.4,0],[2.25,.6,7]],bar<2?.44:.6);
  if(!end){tones(s,beat+.75,h,'pluck',.3,.36);if(bar%2===1)s.note(beat+2.75,.35,h.notes[1],'piano',.29,-.17,'answer');}
  hits(s,beat,[[0,'kick',.85],[.75,'rim',.7],[1.5,'kick',.65],[2.25,'snare',.7]],end?.18:bar<2?.3:.46);
  if(bar>=10&&bar<18&&bar%4===2)tones(s,beat+.25,h,'organ',.27,2.5);
 }
 s.phrase(.5,[[0,.45,59],[.75,.45,64],[1.5,.8,63]],'piano',.51);
 s.phrase(8,a,'piano',.63);s.phrase(40,b,'pluck',.62,0,.18);
 s.phrase(72,a,'guitar',.63,0,.15);
 s.phrase(104,[[0,.5,67],[1,.5,66],[2,1,63],[4,3,64]],'piano',.48);
}

// A slow capital-ship engagement. Wide spaces between bass and organ attacks
// make the hull feel heavy; the centre moves upward without increasing density.
function aShipTooLargeToHide(s,H){
 const a=[[0,1.8,69],[3,1,74],[5,1.5,72],[7.5,1,69],[10,1.4,65],[12,2.8,64]];
 const b=[[0,1.4,65],[2.5,1,70],[4,1.5,72],[6.5,1.2,74],[9,1.5,77],[12,2.5,76]];
 const cycle=['dm','dm','bb','gm','dm','c','bb','a7'];
 for(let bar=0;bar<36;bar++){
  const beat=bar*4,h=H[bar>=16&&bar<24?['bb','bb','gm','c','f','c','gm','a7'][bar-16]:cycle[bar%8]],end=bar>=33;
  bassFigure(s,beat,h.bass,[[0,2.5,0]],bar<4?.46:.63);
  if(bar%2===0&&!end)tones(s,beat+.6,h,'organ',.42,2.5);
  if(bar%2===1&&bar<32)s.note(beat+2.5,.8,h.fifth+24,'piano',.33,-.24,'answer');
  hits(s,beat,[[0,'kick'],[2.5,'snare',.62]],end?.19:bar<4?.28:.46);
  if(bar%4===3&&bar<32)hits(s,beat,[[3.5,'brush',.65]],.29);
  if([4,12,24].includes(bar))s.chord(beat+.2,3.4,[h.notes[0],h.notes[1]],'pad',.24,.08,.02);
 }
 s.phrase(1,[[0,1.6,57],[3,2,62]],'organ',.5);
 s.phrase(16,a,'guitar',.65,0,.18);s.phrase(40,a,'organ',.59,0,.12);
 s.phrase(64,b,'guitar',.68,0,.2);s.phrase(96,a,'guitar',.67,0,.18);
 s.phrase(128,[[0,1.4,69],[2.5,1.2,65],[5,1.2,64],[8,3,62]],'piano',.51);
 s.chord(140,3.3,[50,57],'organ',.25,0,.04);
}

// A resolute major-mode defence. The answering piano avoids the guitar's
// attacks and the short bridge trades the marching pulse for a held chord.
function keepingTheCorridor(s,H){
 const a=[[0,.7,66],[1,.5,69],[2,1.1,76],[4,.6,74],[5.25,.6,71],[6.5,1,67],[8,.65,64],[9.25,.5,66],[10.5,1,69],[12,2,66],[14.5,.6,64]];
 const b=[[0,1.2,71],[2,.8,74],[4,1.3,78],[6,.7,76],[7.25,1,74],[9,1.2,69],[11,.7,67],[12.5,2,66]];
 const cycle=['d','d','g','a','bm','g','em','a'];
 for(let bar=0;bar<32;bar++){
  const beat=bar*4,h=H[bar>=16&&bar<24?['bm','g','d','a','g','em','a','a'][bar-16]:cycle[bar%8]],open=bar===15||bar===23,end=bar>=30;
  bassFigure(s,beat,h.bass,open||end?[[0,2.5,0]]:[[0,.8,0],[1.5,.45,7],[2.5,.65,12]],bar<4?.44:.59);
  if(!end)tones(s,beat+.3,h,open?'pad':'piano',open?.25:.3,open?3.2:.8);
  if(!open)hits(s,beat,[[0,'kick'],[1,'snare',.68],[2.5,'kick',.7],[3,'snare',.58],[1.5,'hat',.3],[3.5,'hat',.27]],end?.2:bar<2?.3:.43);
  if(bar%8===6)s.phrase(beat+1,[[0,.6,h.notes[0]+12],[1.5,.8,h.notes[2]+12]],'piano',.35,0,-.27,'answer');
 }
 s.phrase(1,[[0,.6,66],[1,.5,69],[2,1,76]],'guitar',.49);
 s.phrase(16,a,'guitar',.64,0,.18);s.phrase(40,a,'piano',.61,0,.13);
 s.phrase(64,b,'guitar',.66,0,.2);s.phrase(96,a,'guitar',.68,0,.18);
 s.phrase(120,[[0,1,69],[1.5,.75,67],[3,1,64],[5,2.5,62]],'piano',.5);
}

// B-minor escape music with a five-attack bass cell and a falling answer.
// The return shortens the accompaniment before a two-note unresolved ending.
function noCleanExit(s,H){
 const a=[[0,.4,66],[.75,.4,71],[1.5,.65,73],[2.75,.5,74],[4,.65,73],[5,.45,69],[6,.7,66],[8,.45,69],[9,.45,71],[10,.9,74],[12,.7,73],[13.5,1.4,71]];
 const b=[[0,.7,78],[1.25,.6,76],[2.5,.8,74],[4,.7,73],[5.5,1,69],[8,.8,71],[9.5,.8,69],[11,1.1,66],[13,1.8,65]];
 const cycle=['bm','bm','a','g','em','g','d','a'];
 for(let bar=0;bar<28;bar++){
  const beat=bar*4,h=H[bar>=14&&bar<20?['g','a','bm','em','g','a'][bar-14]:cycle[bar%8]],end=bar>=26;
  bassFigure(s,beat,h.bass,end?[[0,1.5,0],[2.75,.7,7]]:[[0,.35,0],[.75,.35,7],[1.5,.4,12],[2.75,.3,0],[3.25,.35,7]],bar<2?.43:.59);
  if(bar%2===0&&!end)tones(s,beat+1,h,'organ',.31,.7);
  hits(s,beat,[[0,'kick'],[1.5,'snare',.65],[2.75,'kick',.72],[3.5,'rim',.7],[.5,'hat',.32]],end?.2:bar<2?.3:.44);
  if(bar===13||bar===19)s.note(beat+2.5,.6,h.notes[2]+12,'piano',.35,-.2,'answer');
 }
 s.phrase(.5,[[0,.4,66],[.75,.4,71],[1.5,.65,73]],'pluck',.5);
 s.phrase(8,a,'guitar',.65,0,.17);s.phrase(32,a,'pluck',.62,0,.2);
 s.phrase(56,b,'piano',.64,0,.17);s.phrase(80,a,'guitar',.68,0,.17);
 s.phrase(104,[[0,.65,74],[1.25,.6,73],[2.5,1,69],[4,2.8,66]],'piano',.5);
 s.note(108.2,3,59,'organ',.25,-.2,'accompaniment');
}

export const DANGER_COMPOSITIONS=Object.freeze([
 piece('break-the-wake','Break the Wake',28,124,210,['pursuit','flight','ship'],.79,breakTheWake),
 piece('orders-across-the-dark','Orders Across the Dark',32,104,240,['navy','capital','ship','defense'],.76,ordersAcrossTheDark),
 piece('boots-on-the-relay','Boots on the Relay',28,116,210,['ground','surface','infantry'],.73,bootsOnTheRelay),
 piece('needle-through-the-fleet','Needle Through the Fleet',28,128,200,['pursuit','flight','evasion'],.82,needleThroughTheFleet),
 piece('the-last-coolant-line','The Last Coolant Line',32,110,240,['emergency','engineering','ship'],.77,theLastCoolantLine),
 piece('cover-the-crossing','Cover the Crossing',32,102,240,['escort','defense','ground','flight'],.69,coverTheCrossing),
 piece('through-the-bulkhead','Through the Bulkhead',28,120,210,['boarding','ground','ship'],.8,throughTheBulkhead),
 piece('a-ship-too-large-to-hide','A Ship Too Large to Hide',36,96,300,['capital','navy','flight'],.81,aShipTooLargeToHide),
 piece('keeping-the-corridor','Keeping the Corridor',32,118,240,['infantry','defense','ground'],.75,keepingTheCorridor),
 piece('no-clean-exit','No Clean Exit',28,126,210,['pursuit','emergency','flight'],.85,noCleanExit),
]);
