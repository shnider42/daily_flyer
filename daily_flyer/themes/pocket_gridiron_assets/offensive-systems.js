import {expandedOffense} from './expanded-offense.js?v=33';
// Original PGI interpretations: seven recognisable ideas, six executable calls each.
// No live coaching claims, hidden option reads, or new pass buttons.
export const OFFENSIVE_SYSTEMS={
 rungun:{name:'Run & Gun',formation:'shotgun',base:'vertical',runRate:.34,strength:'Vertical spacing, deep crossers and draw counters',weakness:'Long routes need protection; underneath space is the outlet'},
 westcoast:{name:'West Coast',formation:'proset',base:'quick',runRate:.44,strength:'Rhythm throws, short-to-long reads and yards after the catch',weakness:'Press coverage and crowded short zones can disrupt the timing'},
 wingt:{name:'Wing-T',formation:'wingt',base:'power',runRate:.68,strength:'Buck sweeps, traps and misdirection from one tight look',weakness:'Disciplined edges force the back into traffic'},
 airraid:{name:'Air Raid',formation:'airraid',base:'space',runRate:.26,strength:'Wide spacing, crossing routes and layered passing answers',weakness:'Light rushing volume and long throws invite pressure'},
 poweri:{name:'Power I',formation:'iform',base:'power',runRate:.64,strength:'Lead blocks, pulling guards and downhill runs',weakness:'An extra defender in the box can close the designed gap'},
 spread:{name:'Spread / QB Run',formation:'spread',base:'mobile',runRate:.50,strength:'Wide formations with called QB runs and receiver motion',weakness:'Contain and a fast spy make the quarterback earn the corner'},
 pistolpa:{name:'Pistol Play-Action',formation:'pistolstrong',base:'mobile',runRate:.53,strength:'Deep-back runs and convincing play-action from the same stance',weakness:'Repeated fakes lose their effect; deeper exchanges take time'}
};
const starts={shotgun:[[6,-.5],[47,-.5],[34,-1.5]],proset:[[7,-.5],[46,-1.5],[36.5,-.5]],wingt:[[7,-.5],[43,-.5],[36,-2]],airraid:[[3,-.5],[50,-.5],[33,-1.5]],iform:[[7,-.5],[46,-1.5],[36.5,-.5]],spread:[[5,-.5],[48,-.5],[37,-1.5]],pistolstrong:[[7,-.5],[46,-1.5],[36.5,-.5]]};
const pass=(system,id,name,hint,group,paths,wait=1.6,options={})=>({id,name,hint,system,formationId:OFFENSIVE_SYSTEMS[system].formation,kind:'pass',group,routes:paths.map((points,i)=>[starts[OFFENSIVE_SYSTEMS[system].formation][i],...points]),wait,...options});
const run=(system,id,name,hint,lane,options={})=>({id,name,hint,system,formationId:OFFENSIVE_SYSTEMS[system].formation,kind:'run',group:'run',lane,blockLane:lane,carrier:1,...options});
const hand=(x,y,release=.22)=>({release,flight:.09,xTarget:x,yTarget:y});
const pull=(slot,x,until=1.2)=>({slot,x,y:-.8,until});
const lead=(slot,x,until=1.8)=>({slot,x,until});
const pa=(lane,rollout)=>({playAction:{lane,duration:.9},...(rollout?{rollout}:{} )});
export const SYSTEM_PLAYS=[
 pass('rungun','rgseams','Gun switch seams','Cross releases attack both seams; C settles underneath','deep',[[[17,7],[20,39]],[[37,8],[32,38]],[[32,6],[26,6]]],2.3),
 pass('rungun','rgfade','Gun fade / dig','A fades wide; B digs behind the short C outlet','deep',[[[2,14],[2,42]],[[45,16],[17,16]],[[40,4],[49,4]]],2.4),
 pass('rungun','rgcross','Gun deep cross','A crosses deep; B runs off the safety; C works the sideline','deep',[[[8,13],[41,22]],[[47,37]],[[43,7],[50,7]]],2.5),
 pass('rungun','rgcurl','Gun curl / seam','Outside curls flank the vertical C seam','quick',[[[8,11],[11,8]],[[45,13],[42,10]],[[29,38]]],1.8),
 run('rungun','rgdraw','Gun delayed draw','Hold the pass look, then hand inside',27,{exchange:hand(26,-5,.65)}),
 run('rungun','rgcounter','Gun counter right','Back crosses the QB; left guard leads right',34,{exchange:hand(28,-5,.3),pull:pull(5,34),lead:lead(10,34)}),
 pass('westcoast','wcslantflat','Slant / flat','A slants behind the flat defender; C stretches the right flat','quick',[[[9,3],[27,12]],[[44,8],[41,6]],[[49,2]]],.95),
 pass('westcoast','wcspot','Snag triangle','A sits inside; B clears deep; C reaches the flat','quick',[[[18,6],[18,5]],[[45,28]],[[47,3]]],1.2),
 pass('westcoast','wcycross','Y cross / pivot','C crosses at eight yards; B pivots back outside','quick',[[[7,31]],[[38,5],[49,5]],[[29,8],[8,8]]],1.65),
 pass('westcoast','wcboot','Split-back boot left','Fake right; roll left to a three-level read','deep',[[[7,33]],[[44,12],[13,18]],[[15,3],[4,3]]],2.1,pa(32,12)),
 run('westcoast','wcsplit','Split zone left','Back takes the left crease; a back seals across',22,{exchange:hand(23,-4),lead:lead(10,31),doubleTeam:true}),
 run('westcoast','wcstretch','Pro stretch right','Press wide behind the strong-side lead block',44,{exchange:hand(29,-5),lead:lead(4,43)}),
 run('wingt','wtbuck','Buck sweep right','Two guards pull; follow the wing around the edge',44,{exchange:hand(26,-4),pulls:[pull(5,35),pull(6,41,1.5)],lead:lead(4,44)}),
 run('wingt','wtbelly','Belly lead','Press the interior behind the fullback',24,{exchange:hand(24,-4),lead:lead(10,24),doubleTeam:true}),
 run('wingt','wtcounter','Wing counter left','Wing takes the exchange left as the back blocks right',9,{carrier:4,exchange:{...hand(25,-3,.35),runner:4},pull:pull(6,13),lead:lead(1,10)}),
 run('wingt','wttrap','Wing-T inside trap','Invite penetration, then trap with the left guard',30,{exchange:hand(27,-4,.28),pull:pull(5,30,.9)}),
 pass('wingt','wtwaggle','Waggle flood','Show buck sweep right; boot back to the left','deep',[[[7,28]],[[39,12],[12,16]],[[17,3],[5,3]]],2.2,pa(44,12)),
 pass('wingt','wtpop','Belly pop pass','Show belly; pop C behind the linebackers','quick',[[[8,12],[3,20]],[[41,13],[50,20]],[[31,9],[28,13]]],1.25,pa(24)),
 pass('airraid','arshallow','Shallow / sit','A crosses low; B sits behind it; C clears the seam','quick',[[[8,2],[47,2]],[[38,10],[30,10]],[[28,36]]],1.4),
 pass('airraid','armeshwheel','Mesh / wheel','A and B cross at different depths; C wheels upfield','quick',[[[7,4],[44,4]],[[46,6],[9,6]],[[49,1],[49,33]]],1.8),
 pass('airraid','arstick','Wide stick switch','Wide outs stretch the flats; C settles, then breaks inside','quick',[[[3,5],[11,5]],[[50,4],[42,4]],[[32,7],[24,7]]],1.2),
 pass('airraid','arsail','Wide sail left','A clears left; B crosses deep; C takes the left flat','deep',[[[3,37]],[[45,14],[6,20]],[[20,2],[4,2]]],2.3),
 pass('airraid','arposts','Post / dig / seam','A posts over B dig, while C attacks the seam','deep',[[[5,12],[27,37]],[[48,14],[15,14]],[[34,32]]],2.4),
 run('airraid','arzone','Wide-gun inside zone','Spread them out, then cut behind the interior double team',25,{exchange:hand(25,-5,.25),doubleTeam:true}),
 run('poweri','piiso','I strong isolation','Fullback leads through the strong-side linebacker',31,{exchange:hand(27,-6),lead:lead(10,31,2)}),
 run('poweri','pipower','I power weak','Right guard and fullback lead to the weak side',19,{exchange:hand(25,-6),pull:pull(6,19),lead:lead(10,19,2)}),
 run('poweri','pigt','I counter GT','Guard and tackle pull together into the right crease',34,{exchange:hand(29,-6,.3),pulls:[pull(5,31),pull(7,35,1.5)],lead:lead(10,34)}),
 run('poweri','pitoss','I toss left','Pitch to the deep back; follow the fullback outside',8,{exchange:{release:.22,flight:.4,xTarget:16,yTarget:-7},pull:pull(5,14),lead:lead(10,8,2)}),
 pass('poweri','pipapost','I PA post / over','Show isolation; A posts as B crosses underneath','deep',[[[7,12],[29,36]],[[45,10],[13,19]],[[40,3],[49,3]]],2.4,pa(31)),
 pass('poweri','piflat','I PA TE leak','Show weak power; C waits before leaking right','quick',[[[9,13],[5,10]],[[43,18],[24,30]],[[46,2],[50,4]]],1.9,{...pa(19),releaseDelay:{4:.65}}),
 run('spread','spqbpower','Spread QB power','Called keeper; guard and back lead right',35,{carrier:0,delay:.3,pull:pull(5,34),lead:lead(1,36)}),
 run('spread','spqbcounter','Spread QB counter','Called keeper left behind the pulling right guard',16,{carrier:0,delay:.35,pull:pull(6,18),lead:lead(1,15)}),
 run('spread','spjet','Spread jet left','B crosses behind the QB for the handoff left',8,{carrier:3,exchange:{...hand(25,-5,.5),runner:3},pull:pull(5,13),lead:lead(1,8)}),
 pass('spread','spsprint','Spread sprint flood','Called rollout; C flat, B corner and A cross','quick',[[[7,8],[36,14]],[[45,10],[50,20]],[[49,3]]],1.6,{rollout:41}),
 pass('spread','spspot','Spread spacing','Three staggered sit routes stretch underneath coverage','quick',[[[13,5]],[[41,7]],[[27,4]]],1.05),
 pass('spread','spseam','Spread seam / out','C takes the seam; A and B break outside at different depths','deep',[[[7,8],[2,8]],[[46,14],[51,14]],[[30,37]]],2),
 run('pistolpa','psduo','Deep pistol duo','Long mesh, then downhill behind the double team',27,{exchange:hand(26.5,-7,.35),doubleTeam:true}),
 run('pistolpa','pscounter','Pistol counter left','Deep back crosses left behind the right guard',18,{exchange:hand(23,-7,.32),pull:pull(6,18),lead:lead(10,18)}),
 run('pistolpa','pspin','Pistol pin / pull','Seal inside and pull around the right edge',45,{exchange:{release:.3,flight:.28,xTarget:35,yTarget:-7},pull:pull(6,41),lead:lead(4,45)}),
 pass('pistolpa','pspaover','Pistol PA deep over','Show duo; B crosses deep behind C seam','deep',[[[8,14],[3,20]],[[44,12],[10,23]],[[31,36]]],2.5,pa(27)),
 pass('pistolpa','pspaboot','Pistol PA boot right','Show counter left; flood the opposite sideline','deep',[[[7,11],[35,16]],[[46,38]],[[49,3]]],2.2,pa(18,41)),
 pass('pistolpa','pspascissors','Pistol PA scissors','Fake right; cross C corner under B post','deep',[[[8,7],[13,5]],[[45,15],[23,38]],[[35,10],[50,27]]],2.6,pa(45))
];
SYSTEM_PLAYS.push(...expandedOffense({pass,run,hand,pull,lead,pa}).map(call=>({...call,edition:31})));
for(const [id,s] of Object.entries(OFFENSIVE_SYSTEMS)){s.plays=SYSTEM_PLAYS.filter(p=>p.system===id).map(p=>p.id);s.signature=s.plays.slice(0,3);}
