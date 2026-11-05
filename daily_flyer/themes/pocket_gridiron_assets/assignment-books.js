// Each row is ordered by defensive roster slot, from 0 through 10 (or 6).
// R rushes, S spies, H is free safety, mN covers offensive slot N.
// uN and oN play the underneath and over-the-top halves of a bracket.
const landmarks={
 FL:[6,5],FR:[47,5],HL:[17,9],HR:[36,9],MID:[26.5,8],POLE:[26.5,22,1],
 TL:[8,26,1],TM:[26.5,30,1],TR:[45,26,1],L:[13,29,1],D:[40,29,1],
 Q1:[6,25,1],Q2:[20,28,1],Q3:[34,28,1],Q4:[47,25,1],LOW:[26.5,4],HIGH:[26.5,39,1]
};
export function jobs(row) {
 const c={rush:[],zones:{}};
 row.split(' ').forEach((job,slot)=>{
  if(job==='R')c.rush.push(slot);
  else if(job==='S')(c.spies??=[]).push(slot);
  else if(job==='H')c.safety=slot;
  else if(job[0]==='m')(c.man??={})[slot]=Number(job.slice(1));
  else if(job[0]==='u'||job[0]==='o'){
   c.bracket??={slot:Number(job.slice(1))};
   c.bracket[job[0]==='u'?'under':'over']=slot;
  }else{
   const [x,y,drift=0]=landmarks[job];c.zones[slot]={x,y,drift};
  }
 });
 return c;
}
export const legacyEleven={
 zone:'R R HL HR FL FR L R R MID D',
 man:'R R m4 MID m2 m3 H R R m1 m10',
 blitz:'R R R HR TL TR TM R R FL FR',
 cover2:'R R HL HR FL FR L R R POLE D',
 cover3:'R R HL HR TL TR TM R R FL FR',
 commit:'R R R R FL FR H R R LOW MID',
 press:'R R m4 R m2 m3 H R R m1 m10',
 robber:'R R m4 LOW m2 m3 H R R m1 m10',
 prevent:'R R HL HR Q1 Q4 HIGH R MID Q2 Q3',
 twistleft:'R R HL HR TL TR TM R R FL FR',
 twistright:'R R HL HR TL TR TM R R FL FR',
 cover4:'R R HL HR Q1 Q4 Q2 R R MID Q3',
 cover6:'R R HL HR Q1 FR Q2 R R FL D',
 cover0:'R R m4 R m2 m3 R R R m1 m10',
 spy:'R R m4 S m2 m3 H R R m1 m10',
 bracketleft:'R R m4 u2 m2 m3 o2 R R m1 m10',
 bracketright:'R R m4 u3 m2 m3 o3 R R m1 m10',
 firezone:'R MID R R TL TR TM R R FL FR',
 edgeleft:'R R m4 m2 R m3 H R R m1 m10',
 edgeright:'R R m4 m3 m2 R H R R m1 m10'
};
const designs=[
 ['fourthree','43sky','Sky rotation','Strong safety fills the right flat under three deep zones.','zone','R R HL MID TL TR TM R R FL FR','R R HL FR TL TR TM'],
 ['fourthree','43weak','Will plug','Weak linebacker hits the inside gap with man coverage behind.','pressure','R R R m4 m2 m3 H R R m1 m10','R R R m4 m2 m3 H'],
 ['fourthree','43palms','Split palms','Four quarters with the shallow help shaded left.','zone','R R FL HL Q1 Q4 Q2 R R HR Q3','R R FL Q3 Q1 Q4 Q2'],
 ['fourthree','43rat','Low-hole rat','Four rush. The strong linebacker sits under crossing routes.','man','R R m4 LOW m2 m3 H R R m1 m10','R R m4 LOW m2 m3 H'],
 ['fourthree','43safe','Safety insert','Safety blitzes inside. The right corner rotates deep.','pressure','R R FL HR TL TM R R R HL TR','R R FL HR TL TR R'],
 ['fourthree','43fence','Sticks fence','Drop seven with a middle pole behind the first-down line.','zone','R R HL HR FL FR L R R POLE D','R R HL POLE FL D L'],
 ['odd','34strong','Strong dog','Right edge linebacker is the fourth rusher behind man-free.','man','R R m4 MID m2 m3 H R m1 R m10','R R m4 R m2 m3 H'],
 ['odd','34mug','Mug weak A','Inside linebacker shoots the weak A gap under two deep halves.','pressure','R R R HL FL FR L R HR POLE D','R R R HL FL D L'],
 ['odd','34field','Field overload','Send both field-side backers. Rotate three deep.','pressure','R R HL R TL TR TM R FL R FR','R R HL R TL TR TM'],
 ['odd','34mirror','Mirror robber','Spy the QB behind a three-man rush with a low hole and deep help.','man','R R S LOW m2 m3 H R m4 m1 m10','R R S m4 m2 m3 H'],
 ['odd','34half','Boundary half','A half-field safety works opposite two quarters.','zone','R R HL HR L Q4 FL R R FR Q3','R R HL FR L Q4 Q3'],
 ['odd','34weakfire','Weak exchange','Drop the weak end. Rush the nose and two looping linebackers.','pressure','HL R R HR TL TR TM R R FL FR','HL R R HR TL TR TM'],
 ['bear','46pinch','Bear pinch dog','Pinch six inside and cover every eligible man to man.','pressure','R R R m4 m2 m3 m1 R R R m10','R R R m4 m2 m3 R'],
 ['bear','46lurk','Bear lurk','Crowd the line, rush four and sit a robber in the low hole.','man','R R m4 LOW m2 m3 H R R m1 m10','R R m4 LOW m2 m3 H'],
 ['bear','46trap','Bear flat trap','Corners squat in the flats beneath split deep halves.','zone','R R HL HR FL FR L R R POLE D','R R HL POLE FL D L'],
 ['bear','46strong','Strong corner dog','Send the right corner. Replace him with the strong linebacker.','pressure','R R m4 m3 m2 R H R R m1 m10','R R m4 m3 m2 R H'],
 ['bear','46wall','Bear wall three','Bluff pressure and retreat to three deep thirds.','zone','R R LOW FR TL TR TM R R FL HR','R R LOW FR TL TR TM'],
 ['bear','46shadow','Bear shadow','Give the quarterback a dedicated spy under a single-high safety.','man','R R S m4 m2 m3 H R R m1 m10','R R S m4 m2 m3 H'],
 ['nickel','nkdimepress','Nickel overload','Slot and inside backer rush together. Five defenders play zero.','pressure','R R R R m2 m3 m4 R R m1 m10','R R R R m2 m3 m4'],
 ['nickel','nkcloud','Cloud left','Left corner squats. Roll deep coverage over him.','zone','R R HL HR FL TR TL R R FR TM','R R HL FR FL TR TL'],
 ['nickel','nkycone','Cone the tight end','Bracket C inside and over the top. Leave the wideouts in single coverage.','man','R R u4 m1 m2 m3 o4 R R MID m10','R R u4 MID m2 m3 o4'],
 ['nickel','nkspy2','Two-high spy','Keep both safeties deep and mirror the QB with a linebacker.','zone','R R S HR FL FR L R R HL D','R R S HR FL D L'],
 ['nickel','nkweak','Boundary cat','Blitz the boundary corner and replace his flat with the slot.','pressure','R R MID FL R TR TL R R FR TM','R R MID FL R TR TL'],
 ['nickel','nktrips','Trips tilt','Slide underneath help to the right and protect four deep lanes.','zone','R R MID FR Q1 Q4 Q2 R R HR Q3','R R FR Q3 Q1 Q4 Q2'],
 ['stack','stbacker','Stack crossfire','Two stacked backers attack inside behind the three linemen.','pressure','R R R FR TL TR TM R R FL MID','R R R FR TL TR TM'],
 ['stack','stcut','Cut robber','Three rush. Rob the low middle with single-high help.','man','R R m4 LOW m2 m3 H R m1 HR m10','R R m4 LOW m2 m3 H'],
 ['stack','stquarters','Stack quarters','Three rushers leave four underneath and four deep.','zone','R R HL FR Q1 Q4 Q2 R FL HR Q3','R R HL Q3 Q1 Q4 Q2'],
 ['stack','ststar','Star edge','Bring the hybrid off the edge and spy behind him.','pressure','R R S R m2 m3 H R m4 m1 m10','R R S R m2 m3 H'],
 ['stack','stpole','Stack pole two','Middle linebacker carries the seam between deep halves.','zone','R R HL FR FL HR L R POLE MID D','R R HL POLE FL D L'],
 ['stack','stcloudrush','Cloud exchange','Drop the nose, send two linebackers and rotate the secondary.','pressure','R LOW R FR TL TR TM R FL R HR','R LOW R FR TL TR TM']
];
export function expandedDefense(fronts) {
 return designs.map(([system,id,name,hint,group,full,pocket])=>({
  system,id,name,hint,group,edition:31,depths:fronts[system].y.slice(0,7),
  fullCoverage:jobs(full),coverage:jobs(pocket)
 }));
}
