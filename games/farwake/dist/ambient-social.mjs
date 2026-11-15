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
const RECENT_SECONDS=1800, SPEAKER_SECONDS=720, HISTORY_LIMIT=12;
const recentRows=(rows,seconds)=>Array.isArray(rows)?rows.filter(row=>row&&typeof row.key==='string'&&row.key.length<=180&&Number.isFinite(row.at)&&row.at<=seconds&&seconds-row.at<RECENT_SECONDS).slice(-HISTORY_LIMIT):[];
const addressedLines={
 preflight:['There is shade beside the path if you need to rest.','Please keep the path clear while the baskets pass.'],
 farm:['Mind the little one. It follows unfamiliar boots.','The gate swings out. Leave enough room for it.'],
 tavern:['There’s a place here if you need a minute.','That chair has a loose foot. The next one is steadier.'],
 supper:['There’s a place here if you need a minute.','Pass the empty bowls this way, please.'],
 default:['Watch that step. It catches everybody once.','You can get through on this side. There’s more room.']
};
export const createAmbientMemory=(surface,seconds)=>({surfaceId:surface?.id||'',enteredAt:seconds,lastAt:seconds,lastWindow:-1,lastAddressAt:seconds,heard:[],speakers:[]});
export function sampleAmbientConversation(surface,seconds,person,{memory,allow=true}={}){
 if(!allow||!surface||!person||!Number.isFinite(seconds)||surface.systemId==='hearth'||['kettle','morrow','tinbell'].includes(surface.parentId||surface.id)||!['planet','station','site'].includes(surface.kind)||!memory||memory.surfaceId!==surface.id||seconds-memory.enteredAt<45||seconds-memory.lastAt<240)return null;
 const window=Math.floor(seconds/240),social=!!surface.socialStyle,key=`${surface.seed}:${surface.id}:chatter:${window}`,roll=hash(key);
 if(memory.lastWindow===window||roll%(social?2:7)!==0)return null;
 const phase=seconds-window*240,opens=45+Math.floor(roll/7)%130;if(phase<opens||phase>opens+28)return null;
 const heard=recentRows(memory.heard,seconds),speakers=recentRows(memory.speakers,seconds);
 const people=surface.entities.filter(entity=>['npc','mechanic','medic'].includes(entity.type)&&!entity.hidden&&!entity.data?.automated&&!entity.data?.encounter&&!['sleeping','talking'].includes(entity.life?.activity)&&distance(entity,person)<=180&&!speakers.some(row=>row.key===entity.id&&seconds-row.at<SPEAKER_SECONDS)).sort((a,b)=>distance(a,person)-distance(b,person));
 if(!people.length)return null;
 const style=surface.socialStyle|| (surface.culture==='reedbound'?'preflight':'default');
 const speaker=people[0],addressed=roll%5===0&&distance(speaker,person)<65&&seconds-memory.lastAddressAt>=720;
 let lines,kind,heardKey;
 if(addressed){kind='addressed';const options=addressedLines[style]||addressedLines.default,available=options.filter(line=>!heard.some(row=>row.key===`addressed:${hash(line)}`));if(!available.length)return null;const text=available[Math.floor(roll/11)%available.length];heardKey=`addressed:${hash(text)}`;lines=[{speakerId:speaker.id,speaker:speaker.name,text}];}
 else{const other=people.slice(1).find(entity=>distance(entity,speaker)<=96);if(!other)return null;const options=exchanges[style]||exchanges.default,available=options.filter(pair=>!heard.some(row=>row.key===`exchange:${hash(pair.join('|'))}`));if(!available.length)return null;const pair=available[Math.floor(roll/11)%available.length];heardKey=`exchange:${hash(pair.join('|'))}`;kind='overheard';lines=[{speakerId:speaker.id,speaker:speaker.name,text:pair[0]},{speakerId:other.id,speaker:other.name,text:pair[1]}];}
 return{id:`${surface.id}:${window}`,kind,lines,duration:7,until:seconds+7,nextMemory:{...memory,lastAt:seconds,lastWindow:window,lastAddressAt:addressed?seconds:memory.lastAddressAt,heard:[...heard,{key:heardKey,at:seconds}].slice(-HISTORY_LIMIT),speakers:[...speakers,...lines.map(line=>({key:line.speakerId,at:seconds}))].slice(-HISTORY_LIMIT)}};
}
