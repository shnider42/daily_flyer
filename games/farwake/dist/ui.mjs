import {normalizeThumbPreferences} from './touch-control-layout.mjs';
import { normalizeCameraPreferences, normalizeModeZoom } from './camera-preferences.mjs';
import { pickDeviceSettings } from './privacy-data.mjs';
import { createNoticeCenter } from './notice-center.mjs';
import { GALAXY_SAVE_STORAGE_KEY } from './galaxy-epoch.mjs';

export const $=id=>document.getElementById(id);
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=n=>Math.round(Number(n)||0).toLocaleString();
export function actionButton(label,fn,{secondary=false,disabled=false,title=''}={}){const b=document.createElement('button');b.className=secondary?'button-secondary':'button-primary';b.textContent=label;b.disabled=disabled;b.title=title;b.addEventListener('click',fn);return b;}
const dialogFocusSelector='button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]';
const compactLabel=value=>String(value||'').replace(/\s+/g,' ').trim();
function controlIdentity(element){
 if(!element)return null;
 return{tag:element.tagName,key:element.dataset?.dialogKey||element.id||element.getAttribute?.('name')||'',
  label:compactLabel(element.getAttribute?.('aria-label')||element.textContent),scope:element.closest?.('[data-dialog-scope]')?.dataset.dialogScope||'',
  start:element.selectionStart,end:element.selectionEnd};
}
function captureDialogView(body){
 const active=document.activeElement;
 return{scrollTop:body.scrollTop,focus:body.contains(active)?controlIdentity(active):null,
  details:[...body.querySelectorAll('details')].map(node=>({key:node.dataset.dialogKey||node.id||compactLabel(node.querySelector('summary')?.textContent),open:node.open}))};
}
function restoreDialogView(dialog,view,revision){
 if(!dialog.opened||dialog.revision!==revision)return;
 for(const node of dialog.body.querySelectorAll('details')){
  const key=node.dataset.dialogKey||node.id||compactLabel(node.querySelector('summary')?.textContent),prior=view.details.find(entry=>entry.key===key);
  if(prior)node.open=prior.open;
 }
 // A synchronous rebuild is allowed to put focus somewhere deliberately. Do
 // not override it, or a user who has already moved focus to another control.
 const active=document.activeElement,canRestore=active===dialog.el||active===document.body||!active?.isConnected;
 if(view.focus&&canRestore){
  const wanted=view.focus,match=[...dialog.body.querySelectorAll(dialogFocusSelector)].find(node=>{
   const current=controlIdentity(node);return current.tag===wanted.tag&&current.scope===wanted.scope&&(wanted.key?current.key===wanted.key:current.label===wanted.label);
  });
  (match||dialog.el).focus({preventScroll:true});
  if(match&&Number.isInteger(wanted.start)&&typeof match.setSelectionRange==='function')try{match.setSelectionRange(wanted.start,wanted.end);}catch{}
 }
 dialog.body.scrollTop=view.scrollTop;
}
export class Dialog{
 constructor({onOpen=()=>{},onClose=()=>{}}={}){this.backdrop=$('modalBackdrop');this.el=$('modal');this.body=$('modalBody');this.onOpen=onOpen;this.onClose=onClose;this.opened=false;this.kind=null;this.contextKey=null;this.revision=0;$('closeModal').onclick=()=>this.close();this.backdrop.addEventListener('click',e=>{if(e.target===this.backdrop)this.close();});this.el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.close();}if(e.key==='Tab'){const list=[...this.el.querySelectorAll(dialogFocusSelector)].filter(x=>x.offsetParent!==null),first=list[0],last=list.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===this.el)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});}
 open(title,kind='dialogue',{eyebrow='SHIP COMPUTER',wide=false,contextKey=title,reset=false}={}){
  const sameView=this.opened&&this.kind===kind&&this.contextKey===contextKey&&!reset,view=sameView?captureDialogView(this.body):null;
  if(!this.opened)this.previousFocus=document.activeElement;
  this.opened=true;this.revision++;this.kind=kind;this.contextKey=contextKey;this.el.dataset.kind=kind;this.backdrop.hidden=false;
  if(!sameView)this.el.classList.toggle('wide',wide);
  $('modalTitle').textContent=title;$('modalEyebrow').textContent=eyebrow;this.body.replaceChildren();
  if(sameView){const revision=this.revision;queueMicrotask(()=>restoreDialogView(this,view,revision));}
  else{this.body.scrollTop=0;this.onOpen();this.el.focus({preventScroll:true});}
  return this.body;
 }
 close(){if(!this.opened)return;const kind=this.kind;this.revision++;this.opened=false;this.kind=null;this.contextKey=null;this.backdrop.hidden=true;this.onClose(kind);this.previousFocus?.focus?.({preventScroll:true});}
 html(markup){this.body.innerHTML=markup;return this.body;}
 choices(items){const revision=this.revision,list=document.createElement('div');list.className='choice-list';items.forEach(item=>{const b=document.createElement('button');b.type='button';b.className=`choice ${item.warning?'warning':''}`;b.disabled=!!item.disabled;b.dataset.dialogKey=String(item.id||item.key||item.label);b.innerHTML=`<span class="choice-index" aria-hidden="true">${this.kind==='npc'?'›':'→'}</span><span><strong>${escapeHtml(item.label)}</strong>${item.detail?`<small>${escapeHtml(item.detail)}</small>`:''}</span>`;b.onclick=(event)=>{if(this.opened&&this.revision===revision&&b.isConnected&&!b.disabled)return item.action?.(event);};list.append(b);});this.body.append(list);return list;}
}
export const STORAGE_KEY=GALAXY_SAVE_STORAGE_KEY;
export function readSave(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;const parsed=JSON.parse(raw);return parsed?.state??parsed;}catch{return null;}}
export function saveGame(game){try{const serialized=game.serialize();localStorage.setItem(STORAGE_KEY,typeof serialized==='string'?serialized:JSON.stringify(serialized));$('saveState').textContent='SAVED JUST NOW';return true;}catch{$('saveState').textContent='SAVE UNAVAILABLE';return false;}}
export function readSettings(){
 const defaults={guidance:'simple',controlScale:1,...normalizeThumbPreferences(),textScale:1,...normalizeCameraPreferences(),immersiveHud:true,translucentHud:true,compactTips:true,sound:true,music:true,musicVolume:.65,musicPresence:'balanced',musicSettingsVersion:1,reduceMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,leftHanded:false,flightAssist:true,showPerformance:false};
 try{const raw=pickDeviceSettings(JSON.parse(localStorage.getItem('dfe.farwake.settings.v1')||'{}'),{includeLegacy:true}),legacy={shipZoom:normalizeModeZoom(raw?.worldZoom,'ship'),personZoom:normalizeModeZoom(raw?.worldZoom,'person')};const settings={...defaults,...raw,...normalizeThumbPreferences(raw),...normalizeCameraPreferences(raw,legacy)};if(raw.sound===false&&raw.musicSettingsVersion!==1)settings.music=false;settings.musicSettingsVersion=1;settings.musicVolume=Math.max(0,Math.min(1,Number.isFinite(settings.musicVolume)?settings.musicVolume:.65));delete settings.worldZoom;return settings;}catch{return defaults;}
}
export function applySettings(settings,{cameraPreferences=settings}={}){
 if(!['simple','moderate','expert'].includes(settings.guidance))settings.guidance='simple';
 document.body.classList.toggle('guidance-simple',settings.guidance==='simple');
 document.body.classList.toggle('guidance-moderate',settings.guidance==='moderate');
 document.body.classList.toggle('guidance-expert',settings.guidance==='expert');
 settings.textScale=Math.max(1,Math.min(1.6,Number(settings.textScale)||1));settings.controlScale=Math.max(.8,Math.min(1.2,Number(settings.controlScale)||1));Object.assign(settings,normalizeThumbPreferences(settings),normalizeCameraPreferences(settings));delete settings.worldZoom;
 settings.musicVolume=Math.max(0,Math.min(1,Number.isFinite(Number(settings.musicVolume))?Number(settings.musicVolume):.65));if(!['quiet','balanced','frequent'].includes(settings.musicPresence))settings.musicPresence='balanced';settings.musicSettingsVersion=1;
 for(const[key,className]of [['immersiveHud','immersive-hud'],['translucentHud','translucent-hud'],['compactTips','compact-tips']]){if(typeof settings[key]!=='boolean')settings[key]=true;document.body.classList.toggle(className,settings[key]);}
 document.body.classList.toggle('large-text',settings.textScale>=1.25);document.documentElement.style.setProperty('--control-scale',String(settings.controlScale));document.documentElement.style.setProperty('--font-scale',String(settings.textScale));document.body.classList.toggle('left-handed',!!settings.leftHanded);document.body.classList.toggle('reduce-motion',!!settings.reduceMotion);
 // Shared captains and practice use their own camera scope. Device controls and
 // accessibility still save here without replacing this browser's solo camera.
 try{localStorage.setItem('dfe.farwake.settings.v1',JSON.stringify(pickDeviceSettings({...settings,...normalizeCameraPreferences(cameraPreferences)})));}catch{}
}
let notices = null;
const noticeParts = new WeakMap();
function noticeStack(){return typeof document==='undefined'?null:document.getElementById('toastStack');}
function updateNotice(element,record,{priority}){
 const parts=noticeParts.get(element);if(!parts)return;
 const className=`toast ${record.type}${priority==='urgent'?' notice-urgent':''}`;if(element.className!==className)element.className=className;
 if(element.dataset.priority!==priority){element.dataset.priority=priority;element.setAttribute('role',priority==='urgent'?'alert':'status');element.setAttribute('aria-live',priority==='urgent'?'assertive':'polite');element.setAttribute('aria-atomic','true');}
 element.dataset.noticeId=record.id;
 if(parts.text.textContent!==record.text){parts.text.textContent=record.text;parts.message.setAttribute('aria-label',`Read full notice: ${record.text}`);}
 const count=record.count>1?`×${record.count}`:'';if(parts.count.textContent!==count)parts.count.textContent=count;parts.count.hidden=record.count<=1;
}
function noticeController(){
 if(notices)return notices;
 notices=createNoticeCenter({
  render(record,{priority,onRead,onDismiss}){
   const stack=noticeStack();if(!stack)return null;
   const element=document.createElement('div'),message=document.createElement('button'),text=document.createElement('span'),count=document.createElement('span'),dismiss=document.createElement('button');
   message.type='button';message.className='toast-message';text.className='toast-text';count.className='toast-count';count.setAttribute('aria-hidden','true');
   dismiss.type='button';dismiss.className='toast-dismiss';dismiss.textContent='×';dismiss.setAttribute('aria-label','Dismiss notice');
   message.addEventListener('click',event=>{event.stopPropagation();onRead();});dismiss.addEventListener('click',event=>{event.stopPropagation();onDismiss();});
   message.append(text,count);element.append(message,dismiss);noticeParts.set(element,{message,text,count,dismiss});updateNotice(element,record,{priority});stack.append(element);return element;
  },update:updateNotice,
  onConfigure({compact,quiet}){const stack=noticeStack();if(stack){stack.dataset.compact=String(compact);stack.dataset.quiet=String(quiet);}}
 });return notices;
}
export function toast(message,type='info',duration=4600,options={}){return noticeController().show(message,type,duration,options);}
export function configureNotices(options={}){noticeController().configure(options);}
export function noticeHistory(){return noticeController().history();}
export function recordNotice(message,type='info',options={}){return noticeController().record(message,type,options);}
export function clearNotices(options={}){noticeController().clear(options);}
export function hasVisibleNotice(){return noticeController().hasVisible();}
export function portrait(canvas,color='#83cbbb',seed=1){const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#162635';c.fillRect(0,0,32,40);c.fillStyle='#293f4d';for(let i=0;i<7;i++){c.fillRect((i*7+seed*3)%32,i*6,4,1);}c.fillStyle='#0c1923';c.fillRect(6,31,21,9);c.fillStyle=color;c.fillRect(7,28,18,12);c.fillRect(4,31,6,9);c.fillRect(24,31,5,9);c.fillStyle='#384c5b';c.fillRect(15,28,3,12);c.fillStyle='#deb48e';c.fillRect(10,9,13,17);c.fillRect(8,14,3,8);c.fillRect(23,14,2,7);c.fillStyle='#be8f71';c.fillRect(10,22,13,4);c.fillRect(14,26,6,4);c.fillStyle=['#706457','#352b2b','#a6a294','#4e453e'][seed%4];c.fillRect(9,5,15,7);c.fillRect(7,9,5,7);c.fillRect(22,9,3,6);c.fillStyle='#1e2930';c.fillRect(12,16,2,2);c.fillRect(20,16,2,2);c.fillStyle='#785a4b';c.fillRect(15,22,5,1);c.fillStyle='#ead3a0';c.fillRect(10,31,3,2);}
