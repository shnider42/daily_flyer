import {clamp,clearSight,mapFor} from './core.mjs';
export const DEFAULT_SETTINGS={padArea:25,buttonArea:50,touchSensitivity:1,mouseSensitivity:1,aimAssist:35,fov:80,opacity:80,volume:60,quality:1,invertY:false,motion:true,fireMode:'double',crosshair:100};
export function sanitizeSettings(value={}){
 const clean={...DEFAULT_SETTINGS};
 for(const [key,min,max] of [['padArea',10,200],['buttonArea',25,200],['touchSensitivity',.2,3],['mouseSensitivity',.2,3],['aimAssist',0,100],['fov',60,105],['opacity',20,100],['volume',0,100],['quality',.6,1.5],['crosshair',50,180]])if(Number.isFinite(value[key]))clean[key]=clamp(value[key],min,max);
 for(const key of ['invertY','motion'])if(typeof value[key]==='boolean')clean[key]=value[key];
 if(['double','hold','separate'].includes(value.fireMode))clean.fireMode=value.fireMode;
 return clean;
}
export function loadSettings(storage){try{return sanitizeSettings(JSON.parse(storage.getItem('claim-settings-v2'))||{});}catch{return {...DEFAULT_SETTINGS};}}
export function saveSettings(storage,settings){try{storage.setItem('claim-settings-v2',JSON.stringify(sanitizeSettings(settings)));}catch{}}
export function assistAim(state,player,angle,pitch,strength,dt){
 if(!strength||!player||player.down||player.dead)return {angle,pitch};
 const map=mapFor(state.mapId),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));let target=null,best=.16;
 for(const e of state.enemies){
  if(e.health<=0)continue;const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<.7||d>35)continue;
  const a=Math.atan2(e.x-player.x,-(e.z-player.z)),p=Math.atan2((e.y||0)+1.3-((player.y||0)+1.6),d),da=wrap(a-angle),dp=p-pitch,score=Math.hypot(da,dp);
  if(score<best&&clearSight(player,e,{bullets:true,y:(player.y||0)+1.6,pitch:p,map})){best=score;target={da,dp};}
 }
 if(target){const factor=1-Math.exp(-dt*strength*5);angle+=target.da*factor;pitch=clamp(pitch+target.dp*factor,-.85,.85);}
 return {angle,pitch};
}
export function mountSettings(container,settings,onChange){
 const sliders=[['padArea','Thumb pad area',10,200,5,'%'],['buttonArea','Other button area',25,200,5,'%'],['touchSensitivity','Touch sensitivity',.2,3,.05,'×'],['mouseSensitivity','Mouse sensitivity',.2,3,.05,'×'],['aimAssist','Aim assist',0,100,5,'%'],['fov','Field of view',60,105,1,'°'],['opacity','Touch control opacity',20,100,5,'%'],['crosshair','Crosshair size',50,180,10,'%'],['volume','Sound volume',0,100,5,'%'],['quality','Render resolution',.6,1.5,.1,'×']];
 const controls=[];
 function changed(key,value){settings[key]=value;onChange();}
 for(const [key,title,min,max,step,unit] of sliders){
  const label=document.createElement('label');label.className='setting-row';const name=document.createElement('span');name.textContent=title;
  const output=document.createElement('output'),input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=settings[key];input.setAttribute('aria-label',title);
  const sync=()=>{input.value=settings[key];output.textContent=Math.round(settings[key]*100)/100+unit;};sync();input.oninput=()=>{changed(key,Number(input.value));sync();};label.append(name,output,input);container.append(label);controls.push(sync);
 }
 const label=document.createElement('label');label.className='setting-row';label.textContent='Right thumb firing';const select=document.createElement('select');select.setAttribute('aria-label','Right thumb firing');
 for(const [value,title] of [['double','Double tap, hold second tap to fire'],['hold','Hold anywhere on LOOK to fire'],['separate','Separate FIRE button only']]){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);}select.value=settings.fireMode;select.onchange=()=>changed('fireMode',select.value);label.append(select);container.append(label);controls.push(()=>select.value=settings.fireMode);
 for(const [key,title] of [['invertY','Invert vertical look'],['motion','Weapon sway and recoil animation']]){const label=document.createElement('label');label.className='setting-check';const input=document.createElement('input');input.type='checkbox';input.checked=settings[key];input.onchange=()=>changed(key,input.checked);label.append(input,document.createTextNode(title));container.append(label);controls.push(()=>input.checked=settings[key]);}
 const preview=document.createElement('div');preview.className='control-preview';preview.innerHTML='<span class="preview-pad">MOVE</span><span class="preview-pad">LOOK</span><span class="preview-fire">FIRE</span>';container.append(preview);
 const reset=document.createElement('button');reset.textContent='RESET CONTROLS';reset.onclick=()=>{Object.assign(settings,DEFAULT_SETTINGS);onChange();for(const sync of controls)sync();};container.append(reset);
}
