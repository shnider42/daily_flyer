import {addCoachInterview} from './coach-interview.js?v=31';
import {EXTRA_EXCHANGES} from './booth-extras.js?v=31';
import {addSideline} from './sideline.js?v=31';
import {wordTimeline,wordAt} from './booth-chatter.js?v=31';
// Original fictional fan-tribute exchanges, not transcripts or voice imitations.
// Each topic has eight exchanges: John explains, Al responds, John buttons it.
// Facts are supplied separately from the selected lineup or settled game ledger.
const exchanges={
 welcome:[
  ['I have a fresh marker and no idea where the cap went. That means we are ready for football.','We may be ready. The desk is in some danger.','The desk can take it. The important thing is that everybody on that field has a job.'],
  ['Look at that field, Al. All that room, and somehow the football always finds the busiest part.','You make traffic sound almost inviting.','Only when a good blocker is clearing it. Then I want a front-row seat.'],
  ['The scoreboard starts at zero. The enthusiasm does not have to. I love this part.','You were ready about three minutes before we came on.','Somebody said kickoff. I did not need the rest of the sentence.'],
  ['You can fit football in your pocket now. The linemen would still like a little more room.','Their union has already asked about a larger screen.','Give them a lane and somebody to block. They will make their own room.'],
  ['New game, clean field, and both playbooks still full of possibilities. There is a lot to like here.','And no yellow ink on the monitor. Yet.','That is a temporary condition, Al. A very temporary condition.']
 ],
 team:[
  ['Start with {qb}, but do not stop there. Somebody has to protect him and somebody has to catch it.','So the glamour job comes with quite a supporting cast.','Exactly. The quarterback gets introduced first; the other fellows keep him in the conversation.'],
  ['{rb} can give this offense another way to move. A running back appreciates directions that include daylight.','Preferably without a defender standing in it.','That is the trick. The playbook gives you a gap; the blockers have to keep it open.'],
  ['I want to see how {team} puts these pieces together. A roster is a list. An offense has to work as a group.','Names on paper, then a rather demanding group project.','And everybody gets graded at once. That is why a small assignment matters so much.'],
  ['Keep an eye on {target}. But watch the protection too. A route needs time to become interesting.','You have managed to turn a receiver preview into a line meeting.','The receivers ought to attend. Those big fellows are buying their time for them.'],
  ['{team} has choices. The good choice is the one the players can finish together.','The fanciest drawing is not necessarily the best call.','Right. If you need three markers just to explain the handoff, simplify the handoff.']
 ],
 board:[
  ['Circle the blocker, find the space, then follow the runner. Three things. I can make three things look very complicated.','I have seen what happens when we give you a fourth arrow.','Then the arrow needs a blocker. That is how you know the board is getting crowded.'],
  ['Here is the whole idea: one teammate makes room for another. The yellow ink is just how I point at it.','A fairly generous amount of pointing.','If the runner can see daylight, I can spare a little ink.'],
  ['This is an illustration, Al. That arrow does not score unless somebody on the field does the work.','We have ruled out awarding points to the marker.','Good. It has terrible ball security. No thumbs.'],
  ['See this space? The offense wants it open and the defense wants it closed. That is a fine little argument.','And you have drawn yourself right into the middle of it.','Best seat in the house. Now let us see who can finish the block.'],
  ['A good diagram should explain one thing clearly. Mine occasionally explains where my hand has been.','We will put that in the equipment report.','But this circle matters: help the teammate with the ball. Start there.']
 ],
 block:[
  ['Watch that engagement. The ball is somewhere else, but the work is right in the circle.','A supporting actor getting the close-up.','Give the big fellow his close-up! The runner did not bring a bulldozer.'],
  ['There! That is a teammate taking on a job so somebody else has a chance. I love that part.','You spotted the block before you watched the ball.','The ball will still be there on the replay. The block is what I came back to see.'],
  ['You cannot judge a block by how pretty it looks. You want position, effort, and enough time for the play.','So no artistic scores from the booth.','Only a very enthusiastic yellow circle. Those are difficult to earn.'],
  ['That is the work people miss when they follow the football. Freeze it and the whole picture gets better.','We have slowed the game down to your favorite speed.','Slow enough to thank the blocker. Fast enough to want another play.'],
  ['The lineman does not get to carry the ball here. He gets to deal with the fellow who wants it.','An important distinction on the job application.','And a great reason to appreciate him. There is no easy part of that assignment.']
 ],
 touchdown:[
  ['BOOM! That is the part everybody sees. Now roll it back and look at the work that got the ball there.','The celebration is over; the film session has begun.','Best kind of film session. You already know you like the ending.'],
  ['The end zone makes a nice finish, but a touchdown has teammates all over it.','You would like a few more names on the scoring summary.','Start with whoever helped clear the way. There is plenty of credit to pass around.'],
  ['I like a touchdown on the first viewing. On the second, I start looking for the little things.','And on the third?','More little things. By the fourth, somebody usually asks for the football back.'],
  ['There is the payoff. Get the football across that line and you have done something worth watching again.','A review the scoring sideline will happily sit through.','Let them enjoy it. Then get ready, because the next play starts a whole new job.'],
  ['That is why they paint the end zone, Al. It gives everybody a very clear destination.','A destination with a welcoming committee.','Sometimes an unfriendly one! That makes getting there even better.']
 ],
 takeaway:[
  ['The ball changes hands and the job descriptions change immediately. Everybody has to react.','There is no time to update the paperwork.','The new ball carrier has already left the meeting. Somebody had better go with him.'],
  ['A takeaway is a wonderful invitation for your offense. First, make sure you keep hold of the invitation.','You would prefer it not be returned to sender.','Very much. Secure the football before you start imagining the end zone.'],
  ['Look at how quickly the roles switch. The hunters become the blockers, and the offense has to tackle.','A rather abrupt department transfer.','That is football. You do not get to say that tackling is outside your usual duties.'],
  ['There is a football available and everybody wants it. You cannot find a more popular object in this stadium.','Even your marker has to settle for second place.','The marker stays here. That ball belongs with a teammate who can protect it.'],
  ['The defense has its chance to bring something back to the sideline. That is a good reason to stay with the play.','No spectator passes for the other six players.','Exactly. Run with your teammate or get back and make the tackle.']
 ],
 stop:[
  ['The defense gets a say in this game too. Closing space is how you make that opinion known.','A fairly direct response to the play call.','There are no polite detours around a good tackle. You have to finish it.'],
  ['This is why defenders keep moving their feet. A runner needs somewhere to go; you want to take that away.','The available real estate is shrinking.','And the defense would like to close the office right there.'],
  ['There is value in a play that sends an offense backward. It makes the next decision a little harder.','A small change on the field, a larger conversation in the huddle.','That is it. Make them earn the easy yards before they ask for the difficult ones.'],
  ['A tackle is not finished when you get close. Close is where the work starts.','You cannot collect credit for good intentions.','No. Get in position, wrap up, and let your teammates help.'],
  ['You can draw the runner a new path on this screen. On the field, the defender gets to object.','The yellow arrow is unusually difficult to tackle.','That is why it stays in the booth. The players have the hard job.']
 ],
 gain:[
  ['Follow the recorded path. The runner has to deal with the actual space, not the space we wish was there.','The replay makes the choices look rather comfortable.','It does. Try making them with somebody closing in and the whole picture changes.'],
  ['That is the useful thing about a replay: you can watch the ball, then go back and watch the help.','You have enough homework for both of us.','Good homework, Al. Football you already watched, and now you get to watch it again.'],
  ['Moving the ball means the next call has a different starting point. A few yards can change a lot.','The field gets a little shorter.','And the defense has a little more to think about. Keep making them work.'],
  ['The yellow trail follows the tape. I cannot make the runner faster by drawing faster.','That has not stopped you trying.','It is an enthusiastic pen. But the player earns every yard himself.'],
  ['Sometimes the best part is finding the space that was actually available. You do not need a miracle on every snap.','A practical gain has its admirers in this booth.','Absolutely. There is nothing boring about keeping the offense moving.']
 ],
 tie:[
  ['Nothing separates them on the scoreboard. That makes the small jobs even more interesting.','A block here, a catch there.','Exactly. You do not need to announce the turning point before you make it.'],
  ['The score is level and the next possession still needs an entire team. Nobody gets to skip the basics.','The scoreboard has declined to choose a favorite.','Then let the players settle it. That is the best part of having more football.'],
  ['A tie gives both sidelines the same question: what can we finish a little better?','A question with several possible answers.','Start with one you can execute. The chalkboard will happily promise you anything.'],
  ['I like a game that is still asking questions. The answer might be one good drive away.','You will be watching the line for clues.','Always. A lot of answers start with somebody doing the unglamorous work.'],
  ['Neither team has a cushion here. Take care of the ball and make the next opportunity count.','No room to coast.','Not even a little. Coasting is for the bus ride after the game.']
 ],
 close:[
  ['That margin keeps both sidelines involved. One good possession can change the conversation.','And perhaps the volume in this booth.','The volume is ready. I would like to see the football first.'],
  ['This is a game where a routine play can matter an awful lot. Finish the routine ones.','An endorsement of doing the small things well.','Small things become big things when the scoreboard is this close.'],
  ['A lead this size does not come with a comfortable chair. You still have to play.','The comfortable chairs are up here.','Mine is not comfortable when somebody misses a block. I start leaning forward.'],
  ['Both teams have something to work with. The next drive needs a plan, and then somebody has to carry it out.','The second part tends to be the more difficult one.','That is why the players get the field and we get the pencils.'],
  ['When it is close, protect the football and give yourself another chance. You cannot score with it in the other huddle.','A useful limitation to remember.','Very useful. I would circle it, but the ball has already moved.']
 ],
 lead:[
  ['A cushion is useful. It is not a substitute for finishing the next assignment.','The leading team still has work on the schedule.','Every snap. The scoreboard does not block anybody for you.'],
  ['The team behind needs something it can build on. One sound possession is a better start than ten imaginary touchdowns.','We will keep the imaginary ones off the scoreboard.','Thank you. My imaginary defense was having a terrible afternoon.'],
  ['You cannot get the whole margin back with one ordinary play. Find the next useful play and finish it.','A little patience from a very enthusiastic man.','I can be patient about the plan. I get excited when the blocking starts.'],
  ['The lead has been earned. Now the challenge is to keep making the decisions that help the team.','Success creates another assignment.','Right. Football does not stop handing those out until the game is over.'],
  ['There is still something to learn on both sidelines. Keep competing and see what the next possession gives you.','Even a difficult stretch can leave useful film.','Especially then. Find what you can fix, and give the players a clear job.']
 ],
 run:[
  ['A running play is a group effort with one fellow getting to hold the football.','And several fellows applying for a little recognition.','Put them on the screen. The runner can share the spotlight for a moment.'],
  ['The back has to read what opens. The lane on the drawing is only a suggestion until the blocking happens.','The field reserves the right to amend the diagram.','It amends it very quickly. Keep your eyes open and your feet underneath you.'],
  ['A good run starts before the runner reaches the line. Timing gives the blockers a chance to help.','Patience, followed by a fairly urgent departure.','That is a beautiful description. Wait for the door, then get through the door.'],
  ['Running the ball asks the whole front to work together. One missed piece can change the picture.','A whole unit, one moving puzzle.','And the defense is trying to put the pieces somewhere else.'],
  ['The rushing numbers have a lot of effort inside them. Somebody had to carry it and somebody had to make room.','The box score does leave out a few job titles.','That is why I brought the marker. We can add some appreciation.']
 ],
 pass:[
  ['A pass needs time, placement, and a receiver ready to finish it. That is quite a little partnership.','With the defense attempting to join uninvited.','Leave them out if you can. The safest guest list has your teammates on it.'],
  ['The quarterback and receiver need to agree about where the ball belongs. The defense would love a misunderstanding.','A conversation best kept between two uniforms.','Preferably the same color. That is a helpful place to start.'],
  ['Watch where the space is, then think about where it will be when the ball arrives.','Football with a little forecasting involved.','And a very short forecast. The weather can change while the pass is in the air.'],
  ['The catch finishes the throw. Until then, everybody is still working.','A reminder for anyone already celebrating the release.','You can enjoy the spiral. Just do not forget the fellow who has to come down with it.'],
  ['Protection is part of passing. You cannot separate a clean look from the people trying to give it to you.','Back to the line again.','I never really left. The quarterback is looking downfield; I am checking who lets him.']
 ],
 possession:[
  ['Ball security sounds ordinary until the football is on the ground. Then it becomes the most interesting subject anywhere.','The entire field suddenly attends the same meeting.','And nobody wants to leave without the ball. Keep it close before that happens.'],
  ['A possession is a chance for your teammates. Take care of it and they get another assignment.','The useful kind of extra work.','Exactly. Offensive players are much happier when their offense has the football.'],
  ['Return yards matter too. The next offense appreciates a shorter trip.','Special teams arranging better accommodations.','Better field position, at least. I cannot promise anything about the seats.'],
  ['When possession changes, the whole field has to respond. Watch the teammates away from the ball.','You are handing out another film assignment.','A short one. Find who helps, and suddenly the play makes more sense.'],
  ['Keeping the football gives you choices. Losing it gives the other sideline choices, and they have plenty of their own.','A generous gift to the wrong people.','Save the generosity for helping your teammates off the turf. Hold on to the ball.']
 ],
 kickoff:[
  ['Enough drawing. There is a football waiting to be kicked and a whole field waiting to see where it goes.','We will temporarily separate you from the marker.','Temporarily is the important word. I will be right here when there is a play to explain.'],
  ['Here comes the part where everybody gets a job at once. Cover the kick, set the blocks, find the ball.','A busy way to open proceedings.','A great way. You do not have to wait around for football to start being football.'],
  ['The returner needs the ball and the blockers need a plan. That first possession starts with all of them.','We will watch for the opening they can create.','And if it is there, get through it. Daylight does not stay available forever.'],
  ['Let us play. We have talked about the teams; now they get to tell their own story.','A welcome change for anyone hoping to touch the football.','They have waited long enough for us. Kick it and let the game get going.'],
  ['Fresh start, live football, and everybody looking for the next opportunity. That will do nicely.','Marker capped?','For now. Do not put it too far away.']
 ],
 final:[
  ['That is the work finished on the field. There is always something worth taking from the tape.','And you have left us a fairly colorful set of notes.','Find a good block, a good decision, a teammate helping out. That is the stuff I like keeping.'],
  ['The score tells you who won. The film lets you appreciate how much everybody had to do.','A little more to it than the final numbers.','A whole game more. That is why we watch the plays in between.'],
  ['Football is a wonderful team problem. Seven players trying to solve it together, seven trying to stop them.','And one man upstairs trying to circle all fourteen.','I showed restraint, Al. There is still some field visible.'],
  ['Win or lose, there is a play in here to learn from. Keep the useful part and get ready for the next game.','The booth remains available for further homework.','I would be delighted. Bring the football; I will bring another marker.'],
  ['I hope people enjoyed the game and noticed somebody doing a good job for a teammate.','That is a fine way to leave it.','The football gets the attention. The teamwork makes it worth watching.']
 ],
 goodbye:[
  ['Finish a block, find a teammate, make the tackle. Clear jobs give a team somewhere to start.','A manageable list for the locker room.','Good. I was worried I had used all the space on the board again.'],
  ['Take the useful part of that first half and build on it. The next play still needs everybody.','We will see which sideline finds the better answer.','And I will try to leave enough yellow ink for both of them.'],
  ['The adjustments do not need to sound impressive. They need to help the players do their jobs.','A refreshing standard for a halftime speech.','If it helps a teammate, I am interested. If it only fills the board, I already do that.'],
  ['The game is waiting. Give the players a clear idea and let them get back to it.','You sound ready for another half.','I was ready when somebody said there would be another half.'],
  ['We have looked at the tape. Now the fun is seeing what the teams do with the next opportunity.','Our seats are staying right here.','So is my marker. Somebody should probably keep an eye on it.']
 ]
};
for(const [topic,lines] of Object.entries(EXTRA_EXCHANGES))(exchanges[topic]??=[]).push(...lines);
export const BOOTH_EXCHANGES=Object.freeze(exchanges);
const fill=(s,context)=>s.replace(/\{(\w+)\}/g,(_,key)=>context[key]||'the offense');
const hash=s=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export class BoothVoices {
 constructor(saved={}){this.seed=Number.isFinite(saved.seed)?saved.seed:Date.now()>>>0;this.counts={...saved.counts};}
 take(topic,context={}){
  const bank=exchanges[topic]||exchanges.gain,order=bank.map((_,i)=>i).sort((a,b)=>hash(`${this.seed}:${topic}:${a}`)-hash(`${this.seed}:${topic}:${b}`));
  const count=Math.max(0,Number(this.counts[topic])||0);this.counts[topic]=count+1;
  const variant=order[count%bank.length],[john,al,button]=bank[variant];
  return {john:fill(john,context),al:fill(al,context),button:fill(button,context),
   poses:{john:['explain','lean','sweep','nod'][variant%4],al:['react','nod','chuckle','lean'][variant%4],button:['chuckle','explain','lean','sweep'][variant%4]}};
 }
 snapshot(){return {seed:this.seed,counts:{...this.counts}};}
 sidelineVisit(mode='halftime'){const key=`sideline:${mode}`,count=Math.max(0,Number(this.counts[key])||0);this.counts[key]=count+1;return count;}
}
export function giveBoothVoice(report,voices){
 const voiced={...report,segments:report.segments.map(s=>{
  if(s.turns)return s;
  const v=voices.take(s.topic||'gain',s.context),mark=['diagram','highlight','package'].includes(s.visual);
  const factualFocus=s.visual==='highlight'&&s.focus?.focus?`Look at #${s.focus.focus.number} ${s.focus.focus.name}${s.focus.block?' in that block':''}. `:'';
  const turns=[{speaker:'al',text:s.al,pose:'explain'},{speaker:'john',text:s.analysis||factualFocus+v.john,pose:mark?'point':s.topic==='touchdown'?'big':v.poses.john},
   {speaker:'al',text:v.al,pose:v.poses.al},{speaker:'john',text:v.button,pose:s.topic==='touchdown'?'big':v.poses.button}];
  if(s.closing)turns.push({speaker:'al',text:s.closing,pose:'talk'});
  return {...s,al:turns.filter(t=>t.speaker==='al').map(t=>t.text).join(' '),john:turns.filter(t=>t.speaker==='john').map(t=>t.text).join(' '),turns};
 })};
 const visit=voices.sidelineVisit(report.mode);return addCoachInterview(addSideline(voiced,visit),visit);
}
export function broadcastBeat(segment,elapsed){
 const turns=segment.turns||[{speaker:'al',text:segment.al,pose:'talk'},{speaker:'john',text:segment.john,pose:'talk'}];
 const timelines=turns.map(t=>wordTimeline(t.text)),durations=timelines.map(t=>t.duration);
 let start=0,index=turns.length-1;for(let i=0;i<turns.length;i++){if(elapsed<start+durations[i]||i===turns.length-1){index=i;break;}start+=durations[i];}
 const turnElapsed=Math.max(0,elapsed-start);
 return {turn:turns[index],index,turnElapsed,duration:durations.reduce((a,b)=>a+b,0),turns,...wordAt(timelines[index],turnElapsed)};
}
