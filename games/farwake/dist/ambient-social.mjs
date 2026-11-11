/** Quiet, optional nearby chatter. Sampling never creates a quest or stops play. */
const hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const exchanges={
 default:[['Did the roof hold?','All night. We still put the buckets out.'],['You’re early.','Couldn’t sleep. Thought I might as well bring the cups.'],['Same time tomorrow?','If the shift ends when it says it will.']],
 tavern:[['You kept a place?','Only because you always take this one.'],['Who won the last hand?','We decided remembering was more trouble than playing.']],
 supper:[['There’s one more bowl.','Then there’s room for one more person.'],['That isn’t how my mother made it.','Stay tomorrow. You can show me.']],
 farm:[['The gate’s open again.','They opened it. I’m beginning to think they live here.'],['Leave the fallen pods.','I know. That was the agreement.']],
 park:[['Shall I say something?','You don’t have to. This is comfortable.'],['The old tree was taller.','Give this one the same years.']],
 gym:[['A little lighter today?','A little steadier. That counts.']],
 civic:[['Has the ladder come back?','With a repaired rung. I’m marking the complaint resolved.']],
 apartments:[['You can borrow our kettle.','I’ll leave it beside the warm pipe.']],
 preflight:[['The lower field is ready.','Then the first basket goes to the households upstream.'],['That knot is wrong.','Then we undo it together.']]
};
export const createAmbientMemory=(surface,seconds)=>({surfaceId:surface?.id||'',enteredAt:seconds,lastAt:seconds,lastWindow:-1,lastAddressAt:seconds});
export function sampleAmbientConversation(surface,seconds,person,{memory,allow=true}={}){
 if(!allow||!surface||!person||!Number.isFinite(seconds)||surface.systemId==='hearth'||['kettle','morrow','tinbell'].includes(surface.parentId||surface.id)||!['planet','station','site'].includes(surface.kind)||!memory||memory.surfaceId!==surface.id||seconds-memory.enteredAt<45||seconds-memory.lastAt<240)return null;
 const window=Math.floor(seconds/240),social=!!surface.socialStyle,key=`${surface.seed}:${surface.id}:chatter:${window}`,roll=hash(key);
 if(memory.lastWindow===window||roll%(social?2:7)!==0)return null;
 const phase=seconds-window*240,opens=45+Math.floor(roll/7)%130;if(phase<opens||phase>opens+28)return null;
 const people=surface.entities.filter(entity=>['npc','mechanic','medic'].includes(entity.type)&&!entity.hidden&&!entity.data?.automated&&!entity.data?.encounter&&!['sleeping','talking'].includes(entity.life?.activity)&&distance(entity,person)<=180).sort((a,b)=>distance(a,person)-distance(b,person));
 if(!people.length)return null;
 const style=surface.socialStyle|| (surface.culture==='reedbound'?'preflight':'default');
 const speaker=people[0],addressed=roll%5===0&&distance(speaker,person)<65&&seconds-memory.lastAddressAt>=720;
 let lines,kind;
 if(addressed){kind='addressed';const text=style==='preflight'?'The shade reaches the path. You may rest here.':style==='farm'?'Mind the little one. It follows unfamiliar boots.':style==='tavern'||style==='supper'?'There’s a place here if you need a minute.':'Watch that step. It catches everybody once.';lines=[{speakerId:speaker.id,speaker:speaker.name,text}];}
 else{const other=people.slice(1).find(entity=>distance(entity,speaker)<=96);if(!other)return null;const options=exchanges[style]||exchanges.default,pair=options[Math.floor(roll/11)%options.length];kind='overheard';lines=[{speakerId:speaker.id,speaker:speaker.name,text:pair[0]},{speakerId:other.id,speaker:other.name,text:pair[1]}];}
 return{id:`${surface.id}:${window}`,kind,lines,duration:7,until:seconds+7,nextMemory:{...memory,lastAt:seconds,lastWindow:window,lastAddressAt:addressed?seconds:memory.lastAddressAt}};
}
