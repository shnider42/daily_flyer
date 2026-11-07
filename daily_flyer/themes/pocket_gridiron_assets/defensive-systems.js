import {expandedDefense} from './assignment-books.js?v=33';
// Coverage assignments describe all eleven slots; seven-player adaptations have
// their own complete assignments. The 46 name honours the famous scheme, not 4–6 personnel.
const z=(x,y,drift=0)=>({x,y,drift});
const coverage=(rush,zones={},options={})=>({rush,zones:Object.fromEntries(Object.entries(zones).map(([i,p])=>[i,z(...p)])),...options});
const man7={2:4,4:2,5:3};
// Reduced sides keep each call's idea without inventing extra defenders.
const shell7={
 '43under':coverage([0,1],{2:[16,7],3:[38,7],4:[7,24,1],5:[46,24,1],6:[26.5,28,1]}),
 '43tampa':coverage([0,1],{2:[42,5],3:[27,20,1],4:[7,5],5:[41,28,1],6:[12,28,1]}),
 '43quarters':coverage([0,1],{2:[27,8],3:[6,24,1],4:[47,24,1],5:[20,28,1],6:[34,28,1]}),
 '43sam':coverage([0,1,3],{2:[27,8],4:[7,24,1],5:[46,24,1],6:[26.5,29,1]}),
 '34okie':coverage([0,1,3],{2:[7,5],4:[7,25,1],5:[46,25,1],6:[26.5,29,1]}),
 '34cross':coverage([0,1,2,3],{},{man:{4:2,5:3,6:4}}),
 '34drop':coverage([0,1],{2:[15,9],3:[38,9],4:[7,26,1],5:[46,26,1],6:[26.5,31,1]}),
 '34exchange':coverage([0,3],{1:[27,7],2:[7,5],4:[7,25,1],5:[46,25,1],6:[26.5,30,1]}),
 '46one':coverage([0,1,3],{},{man:man7,safety:6}),
 '46zero':coverage([0,1,3,6],{},{man:man7}),
 '46fire':coverage([0,2,3],{1:[27,8],4:[7,25,1],5:[46,25,1],6:[26.5,29,1]}),
 '46edge':coverage([0,1,4],{},{man:{2:4,3:2,5:3},safety:6}),
 'nk2man':coverage([0,1],{3:[13,28,1],6:[40,28,1]},{man:man7}),
 'nkquarters':coverage([0,1],{2:[19,8],3:[6,25,1],4:[47,25,1],5:[20,29,1],6:[34,29,1]}),
 'nkslot':coverage([0,1,3],{},{man:man7,safety:6}),
 'nkbracket':coverage([0,1],{3:[27,7]},{man:{2:4,5:3},bracket:{slot:2,under:4,over:6}}),
 'stthree':coverage([0,1],{2:[17,9],3:[48,5],4:[7,25,1],5:[46,25,1],6:[26.5,30,1]}),
 'stbandit':coverage([0,1,3],{2:[17,9],4:[7,25,1],5:[46,25,1],6:[26.5,30,1]}),
 'stspy':coverage([0,1],{},{man:{3:4,4:2,5:3},spies:[2,6]}),
 'stcloud':coverage([0,1,2],{3:[46,5],4:[7,5],5:[12,28,1],6:[41,28,1]})
};
export const FRONTS={
 fourthree:{x:[23,30,17,38,7,46,21,19,34,27,36],y:[1.2,1.2,5,5,7,7,16,1.8,1.8,6,17]},
 odd:{x:[21,26.5,17,37,7,46,22,32,13,40,36],y:[1.2,1,5,5,7,7,17,1.2,3,3,18]},
 bear:{x:[23.25,29.75,16,37,7,46,26.5,26.5,34,21,40],y:[1,1,2.5,2.5,3,3,18,1,1.5,4,4]},
 nickel:{x:[23,30,24,39,7,46,18,19,34,30,37],y:[1.2,1.2,5,5,7,7,18,1.8,1.8,6,18]},
 stack:{x:[21,26.5,21,41,7,46,19,32,27,33,37],y:[1.2,1,5,6,7,7,18,1.2,5,5,19]}
};
const call=(system,id,name,hint,group,fullCoverage,options={})=>({system,id,name,hint,group,depths:[...FRONTS[system].y.slice(0,7)],coverage:shell7[id],fullCoverage,...options});
const four=[0,1,7,8],three=[0,1,7];
export const SYSTEM_DEFENSE=[
 call('fourthree','43under','4–3 Under / Cover 3','Four down rushers; three deep thirds and four underneath zones','zone',coverage(four,{2:[17,8],3:[37,8],4:[7,25,1],5:[46,25,1],6:[26.5,30,1],9:[5,5],10:[48,5]}),{shift:-1.5}),
 call('fourthree','43tampa','4–3 Tampa 2','Middle linebacker carries the deep middle between two safeties','zone',coverage(four,{2:[42,5],3:[35,9],4:[7,5],5:[41,28,1],6:[12,28,1],9:[26.5,24,1],10:[19,9]})),
 call('fourthree','43quarters','4–3 Over / Quarters','Four deep quarters; three underneath defenders leave short outlets','zone',coverage(four,{2:[8,6],3:[45,6],4:[6,24,1],5:[47,24,1],6:[20,28,1],9:[27,9],10:[34,28,1]}),{shift:1.5}),
 call('fourthree','43sam','4–3 Sam fire','Strong-side linebacker joins the rush; six protect behind it','pressure',coverage([...four,3],{2:[26,9],4:[7,25,1],5:[46,25,1],6:[26.5,29,1],9:[6,5],10:[47,5]})),
 call('odd','34okie','3–4 Okie / Cover 3','Three down linemen plus a left edge linebacker; three deep','zone',coverage([...three,8],{2:[17,8],3:[47,5],4:[7,25,1],5:[46,25,1],6:[26.5,29,1],9:[35,9],10:[5,5]})),
 call('odd','34cross','3–4 Cross dog','Both inside linebackers blitz; outside backers fill the flats','pressure',coverage([...three,2,3],{4:[7,25,1],5:[46,25,1],6:[26.5,29,1],8:[6,5],9:[27,8],10:[47,5]})),
 call('odd','34drop','3–4 Drop eight','Rush only the three linemen; eight defenders cover space','zone',coverage(three,{2:[17,9],3:[37,9],4:[7,26,1],5:[46,26,1],6:[26.5,31,1],8:[5,5],9:[26.5,6],10:[48,5]})),
 call('odd','34exchange','3–4 Zone exchange','Two outside backers rush as a down lineman drops underneath','pressure',coverage([0,7,8,9],{1:[27,7],2:[7,6],3:[45,6],4:[7,25,1],5:[46,25,1],6:[26.5,30,1],10:[36,10]})),
 call('bear','46one','46 Bear / Cover 1','Crowd the interior; five rush with man coverage and one deep helper','man',coverage([...four,3],{10:[42,7]},{man:{2:4,4:2,5:3,9:1},safety:6})),
 call('bear','46zero','46 Bear / Zero','Six rush; five man assignments with no safety help','pressure',coverage([...four,3,9],{},{man:{2:4,4:2,5:3,6:1,10:10}})),
 call('bear','46fire','46 Bear zone fire','Five attack; an interior lineman drops into the hook','pressure',coverage([0,7,8,2,3],{1:[27,8],4:[7,25,1],5:[46,25,1],6:[26.5,29,1],9:[6,5],10:[47,5]})),
 call('bear','46edge','46 Bear corner fire','Left corner attacks; linebacker replaces his man assignment','pressure',coverage([...four,4],{9:[24,8],10:[43,15]},{man:{2:4,3:2,5:3},safety:6})),
 call('nickel','nk2man','Nickel two-man','Four rush; five man defenders work under two deep safeties','man',coverage(four,{6:[13,28,1],10:[40,28,1]},{man:{2:4,3:1,4:2,5:3,9:10}})),
 call('nickel','nkquarters','Nickel quarters','Five DBs spread the deep coverage; keep the run in front','zone',coverage(four,{2:[19,8],3:[46,5],4:[6,25,1],5:[47,25,1],6:[20,29,1],9:[7,6],10:[34,29,1]})),
 call('nickel','nkslot','Nickel slot fire','Slot DB rushes; linebacker replaces the short right zone','pressure',coverage([...four,3],{2:[25,9],4:[7,25,1],5:[46,25,1],6:[26.5,30,1],9:[47,5],10:[6,5]})),
 call('nickel','nkbracket','Nickel left bracket','Double the left receiver; concede space to the other targets','man',coverage(four,{3:[45,5],9:[28,7],10:[41,25,1]},{man:{2:4,5:3},bracket:{slot:2,under:4,over:6}})),
 call('stack','stthree','3–3–5 Stack / Cover 3','Three rushers with five DBs and layered underneath help','zone',coverage(three,{2:[17,9],3:[48,5],4:[7,25,1],5:[46,25,1],6:[26.5,30,1],8:[5,5],9:[26.5,6],10:[37,9]})),
 call('stack','stbandit','3–3–5 Bandit fire','Right hybrid DB joins the three-man rush','pressure',coverage([...three,3],{2:[17,9],4:[7,25,1],5:[46,25,1],6:[26.5,30,1],8:[6,5],9:[35,9],10:[47,5]})),
 call('stack','stspy','3–3–5 Double spy','Two linebackers watch the QB; only three rush','man',coverage(three,{9:[35,9],10:[40,24,1]},{man:{3:4,4:2,5:3},safety:6,spies:[2,8]})),
 call('stack','stcloud','3–3–5 Cloud 2','A stacked linebacker rushes; corners squat in the flats','zone',coverage([...three,9],{2:[18,9],3:[46,5],4:[7,5],5:[12,28,1],6:[41,28,1],8:[35,9],10:[27,20,1]}))
];
SYSTEM_DEFENSE.push(...expandedDefense(FRONTS));
export function systemCalls(all,system){return all.filter(p=>p.system===system);}
