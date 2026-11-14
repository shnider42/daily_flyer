import {createMonitor, distanceMeters, nearestOnRoute, routeLength} from './navigation.mjs';
import {createProgress} from './progress.mjs';
import {parseGpx, parseRouteJson, exportTrackGpx, validateCoordinates} from './imports.mjs';
import {TrailMap} from './map.mjs';

const $ = id => document.getElementById(id);
const KEY = 'trailmark-v1';
const MAX_TRACK = 12000;
const readLocal = () => {try {return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
let saved=readLocal();if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const settings={sound:false,wake:false,record:true,...saved.settings};
let area, routes=[], currentRoute, map, monitor, progress, snapshot, mode='idle', watchId=null;
let demoTimer=null, demoNow=0, demoAlong=0, demoOffset=0, demoScenario='walk', demoBase=null;
let sessionStarted=0, sessionStartIndex=0, waypointSoundId=null, lastAcceptedTime=0, breadcrumbBreak=true;
let track=Array.isArray(saved.track)?saved.track.slice(-MAX_TRACK).filter(p=>Number.isFinite(p.longitude)&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&Number.isFinite(p.timestamp)&&Number.isFinite(p.accuracy)):[];
let notes=Array.isArray(saved.notes)?saved.notes.filter(n=>typeof n.text==='string').slice(-300):[];
let imported=[];
let audioContext, wakeLock, swRegistration, toastTimer;
let displayedCheckpoint=null, previousState='idle', transientError=null;

function persist() {
  try {localStorage.setItem(KEY,JSON.stringify({settings,notes,track,imported,routeId:currentRoute?.id}));return true;}
  catch {toast('Browser storage is unavailable or full. Export your notes and track to keep them.');return false;}
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
const meters = value => Number.isFinite(value)?value>=1000?`${(value/1000).toFixed(1)} km`:`${Math.round(value/5)*5} m`:'—';
const miles = value => `${(value/1609.344).toFixed(2)} mi`;
function switchTab(name){
  document.querySelectorAll('.tab-page').forEach(el=>el.hidden=el.id!==`tab-${name}`);
  document.querySelectorAll('[data-tab]').forEach(el=>{const active=el.dataset.tab===name;el.classList.toggle('active',active);el.setAttribute('aria-selected',active);});
  if(innerWidth>700)document.querySelector('.panel-content').scrollTop=0;
}
const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
function routeReady(route){
  const out={...route,coordinates:validateCoordinates(route.coordinates)};
  out.total=routeLength(out.coordinates);
  out.waypoints=(route.waypoints||[]).map((p,i)=>({...p,label:String.fromCharCode(65+i),distanceAlongM:Number.isFinite(p.distanceAlongM)?p.distanceAlongM:nearestOnRoute(p.coordinate,out.coordinates).along}));
  return out;
}
function selectRoute(route){
  if(mode!=='idle')stopHike(false);
  currentRoute=routeReady(route);
  monitor=createMonitor({coordinates:currentRoute.coordinates,mapUncertaintyM:currentRoute.mapUncertaintyM??25});
  progress=createProgress(currentRoute);snapshot=monitor.reset();displayedCheckpoint=null;waypointSoundId=null;
  map.setRoute(currentRoute);map.setPosition(null);map.setTrack([]);
  $('route-name').textContent=currentRoute.name;
  $('route-description').textContent=currentRoute.description;
  $('route-length').textContent=miles(currentRoute.total);
  const closed=distanceMeters(currentRoute.coordinates[0],currentRoute.coordinates.at(-1))<35;
  $('route-shape').textContent=closed?'Loop':'Point to point';
  $('route-junctions').textContent=currentRoute.waypoints.length||'—';
  $('source-state').replaceChildren(node('span',undefined,'source-dot'),document.createTextNode(currentRoute.validation==='imported'?'Imported route · not field checked':'Mapped pilot · not field checked'));
  $('area-title').textContent=currentRoute.validation==='imported'?'Your trail':area.name;
  $('area-subtitle').textContent=currentRoute.validation==='imported'?'Imported on this device':area.locality;
  $('official-map-link').hidden=currentRoute.validation==='imported';
  $('map-note').hidden=true;renderRoutes();renderCheckpoints();renderStatus();renderNext();persist();
}
function renderRoutes(){
  const list=$('route-list');list.replaceChildren();
  for(const route of [...routes,...imported]){
    const selected=currentRoute?.id===route.id;const button=node('button',undefined,`route-option${selected?' selected':''}`);
    button.setAttribute('aria-pressed',String(selected));button.append(node('strong',route.name),node('span',miles(routeLength(route.coordinates))),node('small',route.validation==='imported'?'Your GPX / GeoJSON · unverified':'Four Ponds · mapped pilot'));
    button.addEventListener('click',()=>{selectRoute(route);switchTab('hike');});list.append(button);
  }
}
function renderCheckpoints(){
  const list=$('checkpoint-list');list.replaceChildren();
  if(!currentRoute.waypoints.length){list.append(node('p','This imported route has no authored turn notes. The map and route-distance alerts are available.','muted'));return;}
  for(const p of currentRoute.waypoints){const li=node('li');const marker=node('span',p.label,'checkpoint-marker');const b=node('button',p.name);b.addEventListener('click',()=>focusCheckpoint(p));li.append(marker,b,node('p',`${meters(p.distanceAlongM)} from the start · ${p.note}`));list.append(li);}
  list.append(node('p','A–F are app checkpoints, not the town’s numbered trail posts. Match the map to posted signs.','muted'));
}
function focusCheckpoint(p){displayedCheckpoint=p;map.centerOn(p.coordinate,Math.min(map.view.w,600));map.selectCheckpoint(p.id);$('map-note').textContent=`${p.label} · ${p.name}. ${p.note}`;$('map-note').hidden=false;if(innerWidth<=700)document.querySelector('.map-panel').scrollIntoView({behavior:'smooth',block:'start'});}
function renderNext(){
  if(!currentRoute)return;
  const pState=progress.getSnapshot();
  const next=currentRoute.waypoints[pState.nextIndex||0];
  const now=mode==='demo'?demoNow:Date.now();
  const livePosition=mode!=='idle'&&!transientError&&snapshot?.state==='on-route'&&snapshot.lastGoodFix&&now-snapshot.lastGoodFix.timestamp<=15000&&snapshot.lastGoodFix.accuracy<=25;
  const confirmed=livePosition&&pState.positionConfirmed;
  if(!next){$('junction-number').textContent=pState.complete&&confirmed?'✓':'P';$('next-name').textContent=pState.complete&&confirmed?'At the route finish':currentRoute.waypoints.length?'Continue toward the finish':'Follow your selected route';$('next-note').textContent=currentRoute.waypoints.length?'Follow the highlighted route to its end. Check your recorded breadcrumbs and the trail signs.':'This imported line has no turn notes. Compare your position with the route on the map.';$('next-distance').textContent='';$('show-next').disabled=true;return;}
  $('show-next').disabled=false;$('junction-number').textContent=next.label;$('next-name').textContent=next.name;$('next-note').textContent=next.note;
  const along=pState.started?pState.along:0;
  $('next-distance').textContent=mode==='idle'?`${meters(next.distanceAlongM)} from start`:confirmed?(pState.atCheckpoint?'Nearby':`~${meters(Math.max(0,next.distanceAlongM-along))}`):livePosition?'Check map':'Awaiting GPS';
  if(mode!=='idle'&&!pState.started)$('next-note').textContent=`Progress begins near the mapped start. ${next.note}`;
  else if(mode!=='idle'&&!confirmed)$('next-note').textContent=`Checkpoint progress is unconfirmed. ${pState.positionConfirmed?'Wait for reliable GPS before using this distance.':pState.reason} ${next.note}`;
  if(confirmed&&pState.atCheckpoint&&waypointSoundId!==next.id){waypointSoundId=next.id;if(settings.sound)chime(false);toast(`${mode==='demo'?'Demo: ':''}${next.name} nearby. Check the map and signs.`);}
  map.selectCheckpoint(next.id);
}
const stateText={
  idle:['◎','A little more sure of the way.','Start GPS at the trailhead, or try a simulated walk from here.'],
  acquiring:['◎','Finding your position…','Allow precise location when your phone asks. Wait for a fresh reading before moving on.'],
  'on-route':['✓','Near your selected route','Your latest position is close to the mapped line. Check signs at forks; GPS may not distinguish nearby paths.'],
  checking:['◌','Checking your position…','You may be away from the selected route. Waiting for repeated, accurate readings before sounding an alert.'],
  'off-route':['!','You appear to be off route','Stop and check the map. Look for the last familiar junction or your recorded track. Do not cut straight across the terrain.'],
  uncertain:['?','GPS is too imprecise','Your position is uncertain. Pause and check the map and signs while the phone gets a clearer reading.'],
  stale:['◷','Waiting for fresh GPS','Your last position is out of date. Route monitoring cannot confirm where you are right now.'],
  paused:['Ⅱ','Monitoring is paused','Return to this app and wait for fresh GPS. Screen locking and switching apps interrupt this web pilot.'],
  error:['!','Location is unavailable','Check location permission for this website, then try starting again.']
};
function renderStatus(){
  if(!snapshot)return;
  let state=transientError?'error':mode==='idle'?'idle':snapshot.state;
  const content=stateText[state]||stateText.uncertain;
  $('status-card').dataset.state=state;$('status-icon').textContent=content[0];$('status-title').textContent=(mode==='demo'?'Demo · ':'')+content[1];
  let message=transientError||content[2];
  if((state==='uncertain'||state==='stale'||state==='paused'||state==='acquiring')&&snapshot.lastAssessment==='off-route')message+=' Your last confirmed reading was away from the route.';
  if(state==='uncertain'&&snapshot.rejectedReason==='position-jump')message='A sudden position jump needs another agreeing GPS reading. Your current route position is uncertain.';
  $('status-message').textContent=message;
  $('fix-metrics').hidden=mode==='idle'||!snapshot.lastFix;
  const good=['on-route','off-route','checking'].includes(state);
  $('distance-label').textContent=good&&Number.isFinite(snapshot.distance)?`~${meters(snapshot.distance)} from route`:'Route distance uncertain';
  $('accuracy-label').textContent=snapshot.lastFix?`Reported ±${Math.round(snapshot.lastFix.accuracy)} m`:'GPS —';
  if(snapshot.alert==='off-route'&&previousState!=='off-route'){if(settings.sound)chime(true);toast(`${mode==='demo'?'Demo: ':''}You appear to be off your selected route. Stop and check the map.`);}
  if(snapshot.alert==='returned')toast(`${mode==='demo'?'Demo: ':''}Position is close to your selected route again.`);
  previousState=state;
  $('start-button').textContent=mode==='live'?'Stop hike':'Start GPS hike →';
  $('demo-button').textContent=mode==='demo'?'End demo':'Try demo';
  $('action-caption').textContent=mode==='demo'?'Simulated location · no real GPS or hike recording':mode==='live'?'GPS active while this app stays visible':'Your location stays on this device.';
  $('demo-label').hidden=mode!=='demo';$('demo-controls').hidden=mode!=='demo';
  $('hike-stats').hidden=mode==='demo'||(!track.length&&mode!=='live');
  $('note-location').textContent=freshNoteFix()?'A recent GPS position will be attached to this note.':'No fresh GPS fix. This note will be saved without a location.';
  if(map)map.setPosition(mode==='idle'?null:snapshot.lastFix,{demo:mode==='demo',uncertain:!['on-route','off-route'].includes(state),stale:['stale','paused','acquiring','error'].includes(state)});
  renderNext();
}
function recordFix(fix){
  if(!settings.record||fix.timestamp===lastAcceptedTime)return;
  lastAcceptedTime=fix.timestamp;const prev=track.at(-1);
  if(prev&&fix.timestamp-prev.timestamp<4000&&distanceMeters([prev.longitude,prev.latitude],[fix.longitude,fix.latitude])<5)return;
  if(track.length>=MAX_TRACK){settings.record=false;$('record-toggle').checked=false;toast('Track recording reached its limit. Export your GPX before starting a new recording.');persist();return;}
  const gap=prev&&(fix.timestamp-prev.timestamp>30000||distanceMeters([prev.longitude,prev.latitude],[fix.longitude,fix.latitude])>200);
  track.push({...fix,breakBefore:breadcrumbBreak||!!gap});breadcrumbBreak=false;persist();map.setTrack(track.slice(sessionStartIndex));renderStats();
}
function consumeFix(fix,now){
  snapshot=monitor.update(fix,now);transientError=null;
  const accepted=snapshot.lastGoodFix?.timestamp===fix.timestamp&&!snapshot.rejectedReason;
  if(accepted){progress.update(fix,now);if(mode==='live')recordFix(fix);}
  map.setPosition(snapshot.lastFix,{demo:mode==='demo',uncertain:['uncertain','checking'].includes(snapshot.state),stale:['stale','paused'].includes(snapshot.state)});
  renderStatus();renderNext();
}
function clearWatch(){if(watchId!==null){navigator.geolocation?.clearWatch(watchId);watchId=null;}}
function requestWatch(){
  clearWatch();
  watchId=navigator.geolocation.watchPosition(pos=>{if(mode!=='live'||document.hidden)return;const c=pos.coords;consumeFix({longitude:c.longitude,latitude:c.latitude,accuracy:c.accuracy,timestamp:pos.timestamp},Date.now());},err=>{
    if(mode!=='live')return;
    breadcrumbBreak=true;
    snapshot=monitor.pause();
    transientError=err.code===1?'Location permission was denied. In your browser’s website settings, allow precise location, then tap Start GPS hike again.':err.code===2?'Your phone could not determine its location. Move to a clearer spot and try again.':'No fresh location arrived. Wait for a clearer signal, then try again.';
    if(err.code===1){clearWatch();mode='idle';releaseWake();}else snapshot=monitor.resume();
    renderStatus();
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
async function startLive(){
  if(mode==='live'){stopHike();return;}
  stopHike(false);
  if(!window.isSecureContext||!navigator.geolocation){transientError='GPS needs a secure HTTPS page in a browser that supports location. Open this site directly in Safari or Chrome.';renderStatus();return;}
  mode='live';transientError=null;sessionStarted=Date.now();sessionStartIndex=track.length;lastAcceptedTime=0;breadcrumbBreak=true;monitor.reset();progress.reset();snapshot=monitor.resume();map.setPosition(null);map.setTrack([]);persist();
  if(settings.sound)unlockAudio();renderStatus();renderStats();switchTab('hike');requestWatch();if(settings.wake)await acquireWake();
}
function stopHike(showToast=true){
  const was=mode;clearWatch();clearInterval(demoTimer);demoTimer=null;mode='idle';releaseWake();
  if(monitor)snapshot=monitor.reset();transientError=null;previousState='idle';breadcrumbBreak=true;
  if(map){map.setPosition(null);map.setTrack(was==='live'?track.slice(sessionStartIndex):[]);}
  if(was==='live'){persist();if(showToast)toast('GPS stopped. Your recorded walk is available to export on this device.');}
  if(currentRoute){progress.reset();renderStatus();renderNext();}
}
function pointAt(m){
  const c=currentRoute.coordinates;let total=0;
  for(let i=1;i<c.length;i++){const length=distanceMeters(c[i-1],c[i]);if(total+length>=m){const t=(m-total)/Math.max(length,.0001);return [c[i-1][0]+t*(c[i][0]-c[i-1][0]),c[i-1][1]+t*(c[i][1]-c[i-1][1])];}total+=length;}
  return [...c.at(-1)];
}
function startDemo(){
  if(mode==='demo'){stopHike(false);return;}
  stopHike(false);mode='demo';demoNow=Date.now();demoAlong=0;demoOffset=0;demoScenario='walk';demoBase=null;progress.reset();monitor.reset();snapshot=monitor.resume(demoNow-1);map.setTrack([]);if(settings.sound)unlockAudio();switchTab('hike');
  const p=pointAt(0);consumeFix({longitude:p[0],latitude:p[1],accuracy:8,timestamp:demoNow},demoNow);
  demoTimer=setInterval(demoStep,600);renderStatus();$('demo-explainer').textContent='A faster simulated walk. Try a wrong turn or weak signal to see how alerts behave.';
}
function demoStep(){
  if(document.hidden||mode!=='demo')return;
  demoNow+=3000;
  let p,accuracy=8;
  if(demoScenario==='wrong'){
    demoOffset=Math.min(180,demoOffset+8);p=offsetPoint(demoBase||pointAt(demoAlong),demoOffset);
  }else if(demoScenario==='return'&&demoOffset>0){demoOffset=Math.max(0,demoOffset-10);p=offsetPoint(demoBase||pointAt(demoAlong),demoOffset);}
  else {if(demoScenario==='return'){demoScenario='walk';demoBase=null;}demoAlong=Math.min(currentRoute.total-1,demoAlong+6);p=pointAt(demoAlong);if(demoScenario==='weak')accuracy=95;}
  consumeFix({longitude:p[0],latitude:p[1],accuracy,timestamp:demoNow},demoNow);
}
function offsetPoint(p,m){
  // The direction is deliberately selected to move away from the actual route,
  // and is only ever used by the labeled demo, never as recovery guidance.
  const east=m/(111195*Math.cos(p[1]*Math.PI/180)),north=m/111195;
  const choices=[[p[0]+east,p[1]],[p[0]-east,p[1]],[p[0],p[1]+north],[p[0],p[1]-north]];
  return choices.sort((a,b)=>nearestOnRoute(b,currentRoute.coordinates).distance-nearestOnRoute(a,currentRoute.coordinates).distance)[0];
}
function demoAction(scenario){
  if(mode!=='demo')return;
  document.querySelectorAll('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===scenario));
  if(scenario==='junction'){
    const next=currentRoute.waypoints.find(p=>p.distanceAlongM>demoAlong+35)||currentRoute.waypoints[0];
    demoAlong=next?Math.max(0,next.distanceAlongM-40):Math.min(currentRoute.total*.4,400);demoOffset=0;demoScenario='walk';demoBase=null;demoNow+=3000;monitor.reset();snapshot=monitor.resume(demoNow-1);progress.seek(demoAlong);const p=pointAt(demoAlong);consumeFix({longitude:p[0],latitude:p[1],accuracy:8,timestamp:demoNow},demoNow);map.centerOn(p,500);
    $('demo-explainer').textContent='Approaching a mapped checkpoint. The route card calls attention to it before the branch.';
  }else if(scenario==='wrong'){
    demoScenario='wrong';demoBase=pointAt(demoAlong);demoOffset=0;
    $('demo-explainer').textContent='Watch the distance grow. An alert needs several accurate fixes over at least 12 simulated seconds.';
  }else if(scenario==='weak'){
    demoScenario='weak';demoOffset=0;demoBase=null;
    $('demo-explainer').textContent='Accuracy drops to ±95 m. The app shows uncertainty instead of deciding you are safely on route.';
  }else{
    demoScenario='return';
    $('demo-explainer').textContent='Returning to the mapped line. Two accurate fixes over at least five simulated seconds confirm the recovery.';
  }
}
function renderStats(){
  const points=mode==='live'?track.slice(sessionStartIndex):track;
  let distance=0;for(let i=1;i<points.length;i++)if(!points[i].breakBefore)distance+=distanceMeters([points[i-1].longitude,points[i-1].latitude],[points[i].longitude,points[i].latitude]);
  let recordedTime=0;for(let i=1;i<track.length;i++)if(!track[i].breakBefore)recordedTime+=Math.max(0,track[i].timestamp-track[i-1].timestamp);
  $('walked-distance').textContent=meters(distance);const elapsed=mode==='live'?Date.now()-sessionStarted:recordedTime;const sec=Math.max(0,Math.floor(elapsed/1000));$('walked-time').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
}

function unlockAudio(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;audioContext??=new Audio();audioContext.resume();return true;}catch{return false;}
}
function chime(urgent=false){
  if(!unlockAudio())return;
  const base=audioContext.currentTime;
  [0,.22].forEach((delay,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=urgent?(i?460:620):(i?760:620);g.gain.setValueAtTime(0,base+delay);g.gain.linearRampToValueAtTime(.11,base+delay+.02);g.gain.exponentialRampToValueAtTime(.001,base+delay+.19);o.connect(g);g.connect(audioContext.destination);o.start(base+delay);o.stop(base+delay+.21);});
}
async function acquireWake(){
  if(!settings.wake||mode!=='live'||document.hidden)return;
  if(!('wakeLock' in navigator)){$('wake-status').textContent='This browser does not support keeping the screen awake.';return;}
  try{wakeLock=await navigator.wakeLock.request('screen');$('wake-status').textContent='Screen is being kept awake during this hike.';wakeLock.addEventListener('release',()=>{wakeLock=null;$('wake-status').textContent='Screen wake lock was released. Keep the app visible.';});}
  catch{$('wake-status').textContent='Your phone did not allow a screen wake lock. Keep this app visible manually.';}
}
function releaseWake(){if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}$('wake-status').textContent=settings.wake?'Ready for a GPS hike. The browser controls screen wake lock.':'Screen wake lock is off.';}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function freshNoteFix(){const f=mode==='live'?snapshot?.lastGoodFix:null;return f&&Date.now()-f.timestamp<=15000&&f.accuracy<=40&&!transientError&&snapshot.state!=='paused'?f:null;}
const noteNames={junction:'Confusing junction',sign:'Unclear sign',landmark:'Useful landmark',condition:'Trail condition'};
function renderNotes(){
  const list=$('notes-list');list.replaceChildren();
  if(!notes.length){list.append(node('p','No field notes yet. A note at a confusing fork is the most useful way to improve this pilot.','empty-state'));return;}
  for(const note of [...notes].reverse()){
    const card=node('article',undefined,'field-note');const head=node('div',undefined,'field-note-header');head.append(node('h4',noteNames[note.kind]||'Field note'),node('small',new Date(note.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})));
    card.append(head,node('p',note.text));
    const info=node('small',note.location?`GPS ${note.location.latitude.toFixed(5)}, ${note.location.longitude.toFixed(5)} · ±${Math.round(note.location.accuracy)} m`:'No GPS position attached');card.append(info,document.createElement('br'));
    const remove=node('button','Delete note');remove.addEventListener('click',()=>{notes=notes.filter(n=>n.id!==note.id);persist();renderNotes();});card.append(remove);list.append(card);
  }
}
function sourceLinks(){
  const list=$('source-list');list.replaceChildren();
  for(const source of area.sources){if(!source.url?.startsWith('https://'))continue;const li=node('li');const a=node('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener';li.append(a);if(source.date)li.append(document.createTextNode(` · ${source.date}`));list.append(li);}
}
async function workerMessage(type){
  if(!swRegistration)throw new Error('Offline saving is unavailable here. Open the HTTPS site directly and try again.');
  const reg=await navigator.serviceWorker.ready;const worker=reg.active;
  if(!worker)throw new Error('Offline support is still starting. Try again in a moment.');
  return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('The offline download timed out. Keep a connection and try again.')),25000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type},[channel.port2]);});
}
async function setupOffline(){
  if(!window.isSecureContext||!('serviceWorker' in navigator)){$('offline-status').textContent='Offline saving requires a secure site and service-worker support.';return;}
  try{swRegistration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});const status=await workerMessage('CHECK_OFFLINE');if(status.ready)$('offline-status').textContent=`Offline pack ready · version ${status.version||'0.1.0'}. Recheck before heading out.`;}
  catch{$('offline-status').textContent='Offline support could not start. Try opening the site directly in Safari or Chrome.';}
}
async function saveOffline(){
  const b=$('offline-button');b.disabled=true;$('offline-status').classList.remove('error');$('offline-status').textContent='Saving the app and complete Four Ponds map…';
  try{const result=await workerMessage('CACHE_OFFLINE');if(!result.ok||!result.ready)throw new Error(result.error||'The complete offline pack could not be saved.');const check=await workerMessage('CHECK_OFFLINE');if(!check.ready)throw new Error('The saved pack did not pass its readiness check.');$('offline-status').textContent=`Offline pack ready · version ${result.version||'0.1.0'}. Includes the map, route and app. External links still need reception.`;toast('Four Ponds is saved for offline use.');if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});}
  catch(e){$('offline-status').classList.add('error');$('offline-status').textContent=e.message;}
  finally{b.disabled=false;}
}
function bind(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('change-route').addEventListener('click',()=>switchTab('route'));
  $('about-button').addEventListener('click',()=>$('about-dialog').showModal());
  document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('fit-map').addEventListener('click',()=>{map?.fit();$('map-note').hidden=true;});
  $('zoom-in').addEventListener('click',()=>map?.zoom(1.5));$('zoom-out').addEventListener('click',()=>map?.zoom(1/1.5));
  $('locate-button').addEventListener('click',()=>{if(!snapshot?.lastFix){toast('Start a GPS hike to show your location, or try the demo.');return;}map.centerOn([snapshot.lastFix.longitude,snapshot.lastFix.latitude],500);if(transientError||!['on-route','off-route'].includes(snapshot.state))toast('This is the last reported position; its accuracy or freshness is uncertain.');});
  $('start-button').addEventListener('click',startLive);$('demo-button').addEventListener('click',startDemo);
  $('show-next').addEventListener('click',()=>{const next=currentRoute?.waypoints[progress.getSnapshot().nextIndex||0];if(next)focusCheckpoint(next);});
  document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>demoAction(b.dataset.scenario)));
  $('reverse-route').addEventListener('click',()=>{
    if(!currentRoute)return;const count=currentRoute.coordinates.length;
    // Named branch notes stay descriptive; entry/exit guidance must change when reversing.
    const waypoints=[...currentRoute.waypoints].reverse().map(p=>({...p,name:['fp-check-1','fp-check-6'].includes(p.id)?'Parking-path junction':p.name,distanceAlongM:currentRoute.total-p.distanceAlongM,routeIndex:Number.isInteger(p.routeIndex)?count-1-p.routeIndex:undefined,note:'Route direction is reversed. Follow the highlighted line through this mapped checkpoint and confirm the trail signs.'}));
    const reverse={...currentRoute,coordinates:[...currentRoute.coordinates].reverse(),waypoints,name:currentRoute.name.endsWith(' · reverse')?currentRoute.name.slice(0,-10):`${currentRoute.name} · reverse`};selectRoute(reverse);toast('Route direction reversed. Any active monitoring was stopped.');
  });
  $('route-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;$('import-status').classList.remove('error');
    try{if(file.size>2*1024*1024)throw new Error('Choose a route smaller than 2 MB.');const text=await file.text();const route=/\.gpx$/i.test(file.name)||text.trimStart().startsWith('<')?parseGpx(text):parseRouteJson(text);if(routeLength(route.coordinates)<10)throw new Error('This route is shorter than 10 meters. Choose a complete hiking route.');imported=imported.filter(r=>r.id!==route.id);if(imported.length>=12)throw new Error('This pilot stores up to 12 imported routes. Export anything you need, then clear saved data to start again.');imported.push(route);selectRoute(route);persist();$('import-status').textContent='Route imported on this device. Its geometry and access have not been verified.';toast('Your route is ready to inspect. Check it before starting GPS.');}
    catch(e){$('import-status').textContent=e.message;$('import-status').classList.add('error');}
    finally{event.target.value='';}
  });
  $('note-form').addEventListener('submit',e=>{
    e.preventDefault();const text=$('note-text').value.trim();if(!text)return;
    if(notes.length>=300){toast('You have reached 300 notes. Export and delete some notes before adding another.');return;}
    const fix=freshNoteFix();notes.push({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,kind:$('note-kind').value,text,createdAt:new Date().toISOString(),routeId:currentRoute.id,routeName:currentRoute.name,location:fix?{...fix}:null});
    const stored=persist();renderNotes();$('note-text').value='';$('notes-status').textContent=stored?'Field note saved on this device.':'Saved only in this open page. Export it before closing.';
  });
  $('export-notes').addEventListener('click',()=>{if(!notes.length){toast('Add a field note first.');return;}download(JSON.stringify({app:'Trailmark',version:1,exportedAt:new Date().toISOString(),notes},null,2),'trailmark-field-notes.json','application/json');});
  $('export-track').addEventListener('click',()=>{if(track.length<2){toast('A recorded walk needs at least two usable GPS points.');return;}download(exportTrackGpx(track,'Trailmark recorded hike'),'trailmark-hike.gpx','application/gpx+xml');});
  $('sound-toggle').checked=settings.sound;$('wake-toggle').checked=settings.wake;$('record-toggle').checked=settings.record;
  $('sound-toggle').addEventListener('change',e=>{settings.sound=e.target.checked;if(settings.sound)chime();persist();});
  $('test-sound').addEventListener('click',()=>{chime(true);toast('A short alert chime. Phone volume and browser audio settings still apply.');});
  $('wake-toggle').addEventListener('change',e=>{settings.wake=e.target.checked;persist();if(settings.wake){$('wake-status').textContent='Ready for your next GPS hike.';acquireWake();}else releaseWake();});
  $('record-toggle').addEventListener('change',e=>{settings.record=e.target.checked;breadcrumbBreak=true;persist();});
  $('offline-button').addEventListener('click',saveOffline);
  $('clear-data').addEventListener('click',()=>$('confirm-dialog').showModal());
  $('confirm-action').addEventListener('click',()=>{
    stopHike(false);notes=[];track=[];imported=[];settings.sound=false;settings.wake=false;settings.record=true;
    try{localStorage.removeItem(KEY);}catch{};$('sound-toggle').checked=false;$('wake-toggle').checked=false;$('record-toggle').checked=true;selectRoute(routes[0]);renderNotes();renderStats();$('confirm-dialog').close();toast('Saved notes, tracks, imports and settings cleared. The public offline map remains available.');
  });
  document.addEventListener('visibilitychange',()=>{
    if(mode==='idle')return;
    if(document.hidden){clearWatch();breadcrumbBreak=true;snapshot=monitor.pause(mode==='demo'?demoNow:Date.now());releaseWake();}
    else {snapshot=monitor.resume(mode==='demo'?demoNow:Date.now());if(mode==='live'){requestWatch();if(settings.wake)acquireWake();}}
    renderStatus();
  });
  window.addEventListener('pagehide',()=>{if(mode==='live'){persist();clearWatch();}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&mode==='live'){snapshot=monitor.resume();breadcrumbBreak=true;requestWatch();renderStatus();}});
  setInterval(()=>{if(!monitor||mode==='idle')return;const now=mode==='demo'?demoNow:Date.now();snapshot=monitor.tick(now);renderStatus();if(mode==='live'){renderStats();if(snapshot.state==='stale')map.setPosition(snapshot.lastFix,{stale:true});}},1000);
}
async function init(){
  bind();
  const response=await fetch('./data/area.json');if(!response.ok)throw new Error('The Four Ponds trail pack could not be loaded. Reconnect and reload.');area=await response.json();
  if(area.schemaVersion!==1||!area.routes?.length)throw new Error('The trail pack format is not supported.');
  routes=area.routes.map(routeReady);
  for(const item of Array.isArray(saved.imported)?saved.imported.slice(0,12):[]){try{imported.push(parseRouteJson(JSON.stringify(item)));}catch{}}
  map=new TrailMap($('map'),area,point=>{focusCheckpoint(point);});
  selectRoute([...routes,...imported].find(r=>r.id===saved.routeId)||routes[0]);
  $('start-button').disabled=false;$('demo-button').disabled=false;sourceLinks();renderNotes();renderStats();setupOffline();
}
init().catch(error=>{console.error(error);$('status-card').dataset.state='error';$('status-title').textContent='The map could not load';$('status-message').textContent=error.message;$('route-name').textContent='Four Ponds';$('route-description').textContent='Use the town’s official map while the pilot reconnects.';});
