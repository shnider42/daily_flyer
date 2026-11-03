// Human-facing information. Never derive defensive guidance from the secret call.
export function showOffensiveRoutes(g){return g.userOffense&&!g.special&&!g.returnInfo&&['call','ready'].includes(g.phase);}
export function publicPlayName(g){return g.userOffense?g.playDefinition.name:g.teams[g.offense].abbr+' offense';}
export function suggestions(g,plays){
 const long=g.target-g.spot>6,side=g.userOffense?'offense':'defense',profile=g.teams[0].profile?.[side];
 const ranked=[...plays].sort((a,b)=>score(b)-score(a)),picks=ranked.slice(0,3);if(g.userOffense&&g.down<=2&&picks.every(p=>p.kind==='pass')){const run=ranked.find(p=>p.kind==='run');if(run)picks[2]=run;}return picks;
 function score(p){return (profile?.signature.includes(p.id)?2:0)+(g.userOffense?(p.kind===(long?'pass':'run')?3:0):((long?p.group==='zone':p.group==='pressure'||p.group==='man')?3:0));}
}
export function coachText(g,level){
 if(level==='expert')return '';
 if(g.phase==='dead')return g.contactFeedback||g.lastResult||'Choose your next call when the playbook opens.';
 if(g.phase==='penalty')return 'Accept applies the penalty. Decline keeps what happened on the play.';
 if(g.phase==='ready'&&g.userOffense&&g.playDefinition.exchange)return g.playDefinition.hint+' · steer after the exchange.';
 if(g.special?.goal)return g.userKicking?'Start the meter, set power, then stop accuracy in green.':'Opponent kicking.';
 if(g.phase.startsWith('kick_'))return g.userKicking?'Aim first. Tap twice to set power.':'Track the ring. Move after the catch; B calls a punt fair catch.';
 if(g.isLive||g.isLoose)return '';
 const profile=g.teams[0].profile?.[g.userOffense?'offense':'defense'];
 if(!g.userOffense)return level==='simple'?'Tap a defender or use PICK. Stay behind the blue line; the CPU snaps.':`${profile?.strength||'Keep the play in front of you'}. Opponent call is hidden.`;
 const distance=Math.ceil(g.target-g.spot),tip=g.down===4?'Reach the gold line to keep possession, or consider a kick.':g.down===3?'Look for a route that reaches the gold line.':distance<=3?'A short run can reach the gold line.':'Short passes can set up a manageable next down.';
 return level==='simple'?`${distance} yards to a first down. ${tip}`:`${profile?.strength||'Use your personnel'}. ${tip}`;
}
export function hitDefender(points,x,y,radius=26){return points.map(p=>({...p,d:Math.hypot(p.x-x,p.y-y)})).filter(p=>p.d<=radius).sort((a,b)=>a.d-b.d)[0]?.index??null;}

export const BOOK_FILTERS={offense:[['all','ALL'],['run','RUN'],['quick','QUICK'],['deep','DEEP']],defense:[['all','ALL'],['zone','ZONE'],['man','MAN'],['pressure','PRESSURE']]};
export function bookPage(plays,filter='all',page=0,size=6){
 const filtered=filter==='all'?plays:plays.filter(p=>p.group===filter),pages=Math.max(1,Math.ceil(filtered.length/size)),index=Math.max(0,Math.min(pages-1,page));
 return {plays:filtered.slice(index*size,(index+1)*size),page:index,pages,total:filtered.length};
}
