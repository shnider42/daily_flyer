import {CHAPTERS, DIFFICULTIES, SHIPS, STATIONS, compass} from './catalog.mjs';
import {bucketFill, canWork, occupant} from './deck.mjs';

const $=id=>document.getElementById(id);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function difficultyOptions(selected) {
  return Object.entries(DIFFICULTIES).map(([key,rules])=>
    '<option value="'+key+'" '+(selected===key?'selected':'')+'>'+rules.name+' · '+rules.minutes+' min · '+Math.round(rules.payout*100)+'% booty</option>'
  ).join('');
}
export function orderText(charter) {
  const chapter=CHAPTERS[charter.chapter];
  return chapter ? 'Chapter '+(charter.chapter+1)+' of '+CHAPTERS.length+' · '+chapter.name : 'Charter complete · Open voyages';
}
export function orders(charter,showModal) {
  const rows=CHAPTERS.map((chapter,i)=>{
    const status=i<charter.chapter?'Complete':i===charter.chapter?'Current order':'Ahead';
    return '<li><b>'+status+' · '+chapter.name+'</b><p>'+chapter.brief+' Bonus '+chapter.bonus+' ◈.</p></li>';
  }).join('');
  showModal('orders','<h2>'+escape(charter.name)+'</h2><p>'+orderText(charter)+'</p><ol class="orders">'+rows+'</ol>');
}
export function campaignShelf({log,showModal,launch,shop,difficulty,resume}) {
  const entries=log.list();
  const cards=entries.map(({charter,profile,watch})=>
    '<article class="charterCard"><h3>'+escape(charter.name)+'</h3><p>'+orderText(charter)+'</p><p>'+
    escape(CHAPTERS[charter.chapter]?.brief || 'Sail for treasure and continue outfitting your crew.')+'</p><small>'+
    profile.gold+' ◈ in your campaign vault · '+profile.extractions+' extractions</small>'+
    (profile.voyages?'<details><summary>My watch record</summary><p>'+watch.distance+' yd steered · '+watch.volleys+' volleys · '+watch.repairs+' patches · '+watch.buckets+' buckets · '+watch.treatments+' treatments · '+watch.signals+' signals</p></details>':'')+
    '<div class="panelbuttons"><button class="primary" data-launch="'+charter.id+'">Launch voyage</button>'+
    '<button data-shop="'+charter.id+'">Outfitter</button><button data-orders="'+charter.id+'">Orders</button></div></article>'
  ).join('');
  showModal('campaigns','<h2>Crew campaigns</h2><p>Invite two to four pirates. Each pirate earns gear for this charter and keeps a log on their own browser.</p>'+
    (resume?'<button id="resumeCrew">Reconnect to current voyage</button>':'')+cards+
    '<form id="newCharter" class="charterCard"><h3>Start a charter</h3><label>Crew name<input name="title" maxlength="36" value="Lantern Company" required></label>'+
    '<label>Sea conditions<select name="difficulty">'+difficultyOptions(difficulty)+'</select></label>'+
    '<button class="primary" type="submit">Create campaign & invite crew</button></form>'+
    (log.temporary?'<p>Browser storage is unavailable. This log lasts for this session.</p>':''));
  if(resume)$('resumeCrew').onclick=resume;
  $('newCharter').onsubmit=e=>{
    e.preventDefault();
    const form=new FormData(e.target);
    launch(log.create(String(form.get('title')),String(form.get('difficulty'))).charter);
  };
  for(const b of document.querySelectorAll('[data-launch]'))b.onclick=()=>launch(log.get(b.dataset.launch).charter);
  for(const b of document.querySelectorAll('[data-shop]'))b.onclick=()=>shop(b.dataset.shop);
  for(const b of document.querySelectorAll('[data-orders]'))b.onclick=()=>orders(log.get(b.dataset.orders).charter,showModal);
}

export class StationControls {
  constructor(act) {
    this.act=act;
    this.signature='';
    $('stationButton').onclick=()=>this.toggle();
    $('bucketBtn').onclick=()=>act('bucket');
    $('patchBtn').onclick=()=>act('repair');
    $('treatBtn').onclick=()=>act('treat');
    $('scanBtn').onclick=()=>act('scan');
    $('stationMenu').addEventListener('click',e=>{
      const button=e.target.closest('[data-role]');
      if(button && !button.disabled) {act('station:'+button.dataset.role);this.close();}
    });
  }
  close() { $('stationMenu').hidden=true; $('stationButton').setAttribute('aria-expanded','false'); }
  toggle() {
    if($('stationDock').hidden)return;
    $('stationMenu').hidden=!$('stationMenu').hidden;
    $('stationButton').setAttribute('aria-expanded',String(!$('stationMenu').hidden));
  }
  update(game,p) {
    const ship=game.ship,aboard=p.aboard && !p.down;
    const role=p.station || 'holding';
    $('stationDock').hidden=!aboard;
    $('dutyTools').hidden=!aboard || !['medic','mast'].includes(role);
    $('contactText').hidden=!ship.mark;
    if(ship.mark) $('contactText').textContent='Lookout · '+compass(ship,ship.mark)+' · '+Math.round(Math.hypot(ship.mark.x-ship.x,ship.mark.y-ship.y))+' yd';
    if(!aboard){
      this.close();document.body.dataset.duty='shore';
      $('movePad').hidden=false;$('aimPad').hidden=false;$('repairBtn').hidden=false;
      return;
    }
    document.body.dataset.duty=role;
    $('stationButton').querySelector('strong').textContent=STATIONS[role].name+' ▴';
    const signature=game.players.map(q=>[q.id,q.name,q.station,q.aboard,q.down,q.connected].join('/')).join('|');
    if(signature!==this.signature){
      this.signature=signature;
      $('stationMenu').innerHTML=Object.entries(STATIONS).map(([key,info])=>{
        const owner=key==='holding'?null:occupant(game,key);
        const status=key===role?'You':owner?owner.name:key==='holding'?'Always open':'Open';
        return '<button data-role="'+key+'" '+(owner||key===role?'disabled':'')+'><b>'+info.name+'</b><span>'+escape(status)+'</span></button>';
      }).join('');
    }
    $('movePad').querySelector('span').textContent=role==='helm'?'STEER':STATIONS[role].name.toUpperCase();
    $('movePad').hidden=role!=='helm';
    $('aimPad').hidden=!canWork(game,p,'guns');
    $('broadside').hidden=!canWork(game,p,'guns');
    $('repairBtn').hidden=role==='medic'||!canWork(game,p,'medic');
    $('repairBtn').disabled=game.waiting || !ship.planks || (ship.hp>=ship.maxHp && !ship.leaks);
    $('medicTools').hidden=role!=='medic';
    $('mastTools').hidden=role!=='mast';
    if(role==='medic'){
      $('patchBtn').disabled=$('repairBtn').disabled;
      $('patchBtn').textContent=ship.leaks?'Patch leak':'Repair hull';
      $('bilgeStatus').textContent=ship.bucket?'Throw in the green band':Math.ceil(ship.water)+'% water · '+ship.leaks+' leaks';
      $('bucketGauge').hidden=!ship.bucket;
      $('bucketNeedle').style.left=(100*bucketFill(game))+'%';
      $('bucketBtn').textContent=ship.bucket?'Throw bucket':'Scoop water';
      $('bucketBtn').disabled=game.waiting||ship.water<=0;
      const patient=game.players.filter(q=>q.aboard && q.hp<q.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      $('treatBtn').textContent=patient?'Treat '+patient.name:'Crew healthy';
      $('treatBtn').disabled=game.waiting||!ship.meds||!patient;
    }
    if(role==='mast'){
      $('mastRange').textContent=SHIPS[ship.type].sight+' yd sightline';
      $('scanBtn').disabled=game.waiting||game.time<ship.scanAt;
      $('scanBtn').textContent=game.time<ship.scanAt?'Scanning…':ship.mark?'Mark next contact':'Scan horizon';
    }
  }
}
