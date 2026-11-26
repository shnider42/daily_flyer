import { CHAPTERS, CHAPTER_ORDER, getChapter } from './content.mjs';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'farwake.lost-expeditions.chapters.v2';
export const LEGACY_SAVE_KEY = 'farwake.lost-expeditions.nightglass.v1';
export const RESET_NOTICE = 'Nightglass now takes place 93 years before Farwake. The old recovery save belongs to a different story. These chapters start fresh; your sound and display settings are kept.';
const knownChapter = id => Object.hasOwn(CHAPTERS,id) ? id : 'nightglass';
const flagNames = chapter => [...new Set(chapter.actions.flatMap(a=>a.sets))];
const uniqueKnown = (values,known) => [...new Set(Array.isArray(values)?values.filter(v=>known.includes(v)):[])];

export function initialState(chapterId='nightglass') {
  const chapter=getChapter(chapterId);
  return {version:SAVE_VERSION,chapter:chapter.id,scene:chapter.startScene,visited:[chapter.startScene],records:[],flags:Object.fromEntries(flagNames(chapter).map(id=>[id,false])),moves:0,completed:false};
}

/** A chapter save is never interpreted as another chapter or the old recovery. */
export function hydrateState(raw,chapterId=raw?.chapter) {
  const expected=knownChapter(chapterId), fresh=initialState(expected), chapter=getChapter(expected);
  if(!raw||raw.version!==SAVE_VERSION||raw.chapter!==expected)return fresh;
  const validFlags={...fresh.flags};
  // Only retain events whose prerequisite history is present. The authored
  // graph is acyclic; repeated passes also handle independent optional events.
  for(let pass=0;pass<chapter.actions.length;pass++){
    let changed=false;
    for(const a of chapter.actions){
      if(!a.requires.every(id=>validFlags[id]))continue;
      for(const id of a.sets)if(raw.flags?.[id]===true&&!validFlags[id]){validFlags[id]=true;changed=true;}
    }
    if(!changed)break;
  }
  const sceneIds=Object.keys(chapter.scenes);
  const s={...fresh,flags:validFlags,scene:sceneIds.includes(raw.scene)?raw.scene:chapter.startScene};
  if(expected==='nightglass'&&['shaft','lower'].includes(s.scene)&&!validFlags.inspectionPowered)s.scene='junction';
  if(expected==='nightglass'&&s.scene==='lower'&&!validFlags.feedInspected)s.scene='shaft';
  s.visited=uniqueKnown(raw.visited,sceneIds);
  for(const id of [chapter.startScene,s.scene])if(!s.visited.includes(id))s.visited.push(id);
  const earnedRecords=chapter.actions.filter(a=>a.record&&a.sets.every(id=>validFlags[id])).map(a=>a.record);
  s.records=uniqueKnown(raw.records,earnedRecords);
  // Every completed inspection keeps its note even after a partially written save.
  for(const id of earnedRecords)if(!s.records.includes(id))s.records.push(id);
  s.moves=Number.isSafeInteger(raw.moves)&&raw.moves>=0?Math.min(raw.moves,1000000):0;
  const final=chapter.actions.find(a=>a.terminal);
  s.completed=raw.completed===true&&Boolean(validFlags.finalEvent)&&s.scene===final.scene;
  if(!s.completed)s.flags.finalEvent=false;
  return s;
}

export function initialCollection(){return {version:SAVE_VERSION,selected:'nightglass',chapters:Object.fromEntries(CHAPTER_ORDER.map(id=>[id,initialState(id)]))};}
export function hydrateCollection(raw){
  const collection=initialCollection();
  if(!raw||raw.version!==SAVE_VERSION)return collection;
  collection.selected=knownChapter(raw.selected);
  for(const id of CHAPTER_ORDER)collection.chapters[id]=hydrateState(raw.chapters?.[id],id);
  return collection;
}
export function storeChapter(collection,raw){
  const next=hydrateCollection(collection), state=hydrateState(raw);
  next.selected=state.chapter;next.chapters[state.chapter]=state;return next;
}

export function availableActions(raw){
  const s=hydrateState(raw),chapter=getChapter(s.chapter);
  if(s.completed)return [];
  const moves=chapter.scenes[s.scene].routes.map(r=>({id:`go:${r.target}`,kind:'move',target:r.target,label:r.label,x:r.x,y:r.y,route:r,disabled:!r.requires.every(id=>s.flags[id]),reason:r.reason}));
  const actions=chapter.actions.filter(a=>a.scene===s.scene).filter(a=>!a.sets.length||!a.sets.every(id=>s.flags[id])).map(a=>({...a,disabled:!a.requires.every(id=>s.flags[id]),reason:a.reason||'Complete the preceding equipment check first.'}));
  return [...moves,...actions];
}

export function perform(raw,actionId){
  const current=hydrateState(raw), entry=availableActions(current).find(a=>a.id===actionId);
  if(!entry||entry.disabled)return {state:current,message:entry?.reason||'That action is not available from here.',event:null};
  const s={...current,flags:{...current.flags},records:[...current.records],visited:[...current.visited]};
  if(entry.kind==='move'){
    s.scene=entry.target;s.moves++;
    if(!s.visited.includes(s.scene))s.visited.push(s.scene);
    return {state:s,message:sceneDescription(s),event:'move'};
  }
  for(const id of entry.sets)s.flags[id]=true;
  if(entry.record&&!s.records.includes(entry.record))s.records.push(entry.record);
  if(entry.terminal)s.completed=true;
  return {state:s,message:entry.message,title:entry.label,event:entry.event||(entry.record?'record':'switch'),record:entry.record||null};
}

export function sceneDescription(raw){
  const s=hydrateState(raw),chapter=getChapter(s.chapter),base=chapter.scenes[s.scene].description;
  if(s.chapter==='nightglass'){
    if(s.scene==='junction'&&s.flags.inspectionPowered)return 'The shaft lights are on. The green strip still marks the fixed route between the radio room, service bay and airlock.';
    if(s.scene==='survey'&&s.flags.benchPassed)return 'The local test has passed. Your radio and antenna feed work. Earth has still not answered.';
    if(s.scene==='lower'&&s.flags.couplerReplaced)return 'The spare coupler is seated firmly. Your tools are back in your pockets. The green route markers remain visible above.';
    if(s.scene==='service'&&s.flags.radioRestored)return 'RADIO and INSPECTION are on. The independent RETURN supply stays connected. The replaced feed is ready to use.';
    if(s.scene==='service'&&s.flags.radioIsolated)return 'RADIO is isolated for the repair. INSPECTION and the independent green RETURN supply remain on.';
    if(s.scene==='beacon'&&s.flags.antennaPassed)return 'The dish tracks Earth. Its position check passed and the outgoing pulse registered. No incoming voice has been identified.';
  }
  if(s.chapter==='mars'){
    if(s.scene==='mars-workshop'&&s.flags.cameraSelected)return 'The selector is on CAMERA. The lens is clear and the heater is disconnected. Habitat heat has remained on throughout.';
    if(s.scene==='mars-workshop'&&s.flags.lensClear)return 'The de-icing cycle has finished and the lens reads CLEAR. Move the selector to CAMERA to restore the picture.';
    if(s.scene==='mars-control'&&s.flags.liveVerified)return 'The east-camera picture is live. The crawler track is empty. You saw movement at the far edge of the frame.';
  }
  if(s.chapter==='outpost'){
    if(s.scene==='outpost-door'&&s.flags.sealVerified)return 'The inner latch is seated and the pressure seal passed its test. Both doors remain closed. You can use the camera and intercom safely.';
    if(s.scene==='outpost-utility'&&s.flags.equalizerClosed)return 'The equalizer is closed. The cabin is isolated from the outer compartment. The hatch card remains beside the valve.';
    if(s.scene==='outpost-cabin'&&s.flags.intercomUsed)return 'Your supper is still on the table. The door is secure. The camera showed an empty compartment, and nobody answered the intercom.';
  }
  return base;
}

export function objective(raw){
  const s=hydrateState(raw),c=getChapter(s.chapter);
  if(s.completed)return {title:'Chapter complete',text:'You can revisit your notes or choose another chapter.',hint:'Each chapter keeps its own progress.',nextScene:s.scene};
  const next=c.tasks.find(t=>!s.flags[t.flag]);
  return {title:next.title,text:next.text,hint:next.hint,nextScene:next.scene};
}
export function getEnding(raw){
  const s=hydrateState(raw);if(!s.completed)return null;
  const chapter=getChapter(s.chapter);
  return {...chapter.ending,text:chapter.ending.paragraphs.join('\n\n'),chapter:chapter.id,recordsRecovered:s.records.length,totalRecords:chapter.records.length};
}
