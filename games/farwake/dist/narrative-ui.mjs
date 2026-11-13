/** The captain's notebook. Rules and prices always come from the game authority. */
import { escapeHtml as esc, fmt } from './ui.mjs';
import { navIcon } from './ui-icons.mjs';
import { earthCampaignPresentation } from './earth-campaign-ui.mjs';

const array=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value:'';

export function createNarrativeUI({getGame,dialog,invoke,acceptResult,track,legacyJournal,legacyJobs,drawPortrait}) {
  let busy=false;
  const game=()=>getGame();
  const board=()=>game().narrativeBoard();
  const wallet=()=>`You have ${fmt(game().state.credits)} cr · ${game().state.cargo.ore} ore`;
  const currentBody=()=>game().state.exploration?.bodyId||game().state.locationId;
  const place=target=>{
    if(!target)return '';
    const system=game().galaxy.find(s=>s.id===target.systemId);
    const body=system?.bodies.find(b=>b.id===target.bodyId);
    return [body?.name||target.bodyId,system?.name].filter(Boolean).join(' · ');
  };
  function frame(title,section='stories',eyebrow='CAPTAIN’S NOTEBOOK',{conversation=false}={}) {
    if(conversation){dialog.open(title,'npc',{eyebrow});dialog.html('<section class="narrative-view"><div class="notebook-content"></div></section>');return dialog.body.querySelector('.notebook-content');}
    dialog.open(title,'narrative',{eyebrow,wide:true});
    dialog.html('<section class="narrative-view"><nav class="notebook-nav" aria-label="Notebook sections"></nav><div class="notebook-content"></div></section>');
    const nav=dialog.body.querySelector('.notebook-nav');
    for(const [key,label,action] of [
      ['stories','Stories',()=>openBoard('stories')],['people','People',()=>openBoard('people')],
      ['factions','Factions',()=>openBoard('factions')],['professions','Work & service',()=>openProfessions()],
      ['contracts','Contracts',()=>legacyJournal('missions')],['log','Voyage log',()=>legacyJournal('log')]
    ]) {
      const b=document.createElement('button');b.type='button';b.textContent=label;b.className=section===key?'active':'';
      if(section===key)b.setAttribute('aria-current','page');b.onclick=action;nav.append(b);
    }
    return dialog.body.querySelector('.notebook-content');
  }
  function note(root,value,className='notebook-note') {const p=document.createElement('p');p.className=className;p.textContent=value;root.append(p);return p;}
  function heading(root,value) {const h=document.createElement('h3');h.className='notebook-heading';h.textContent=value;root.append(h);}
  function button(root,label,action,{secondary=false,disabled=false}={}) {
    const b=document.createElement('button');b.type='button';b.className=secondary?'notebook-button secondary':'notebook-button';b.textContent=label;b.disabled=disabled;b.onclick=action;root.append(b);return b;
  }
  function destination(root,target,id,{here=false}={}) {
    if(!target)return;
    if(here)return;
    const row=document.createElement('div');row.className='thread-destination';
    row.innerHTML=`<span><small>NEXT STOP</small><strong>${esc(place(target)||'Nearby')}</strong></span>`;
    button(row,'Show the way',()=>track(target,id),{secondary:true});root.append(row);
  }
  function money(root,cost) {
    if(!cost)return;
    const c=typeof cost==='number'?{credits:cost}:cost,have=game().state;
    const needed=[['credits',Number(c.credits)||0,have.credits,'cr'],['ore',Number(c.ore)||0,have.cargo.ore,'ore'],['crystal',Number(c.crystal)||0,have.cargo.crystal,'crystal'],['fuel',Number(c.fuel)||0,have.ship.fuel,'fuel']].filter(x=>x[1]>0);
    if(!needed.length)return;
    const out=document.createElement('div');out.className='thread-price';
    out.innerHTML=`<strong>Cost ${needed.map(x=>`${fmt(x[1])} ${x[3]}`).join(' + ')}</strong><span>You have ${needed.map(x=>`${fmt(x[2])} ${x[3]}`).join(' · ')}</span><small>${needed.some(x=>x[1]>x[2])?'Still need '+needed.filter(x=>x[1]>x[2]).map(x=>`${fmt(x[1]-x[2])} ${x[3]}`).join(' + '):'After: '+needed.map(x=>`${fmt(x[2]-x[1])} ${x[3]}`).join(' · ')}</small>`;root.append(out);
  }
  async function send(name,args,then) {
    if(busy)return;busy=true;
    const captain=game(),identity=[captain.state.multiplayer?.captainId||captain.state.seed,captain.state.systemId,captain.state.locationId].join(':');
    const owner=dialog.body.querySelector('.narrative-view');
    const enabled=[...owner?.querySelectorAll('button:not(:disabled),select:not(:disabled)')||[]];for(const control of enabled)control.disabled=true;
    try {const result=await invoke(name,args);busy=false;const current=game();if(current!==captain||identity!==[current.state.multiplayer?.captainId||current.state.seed,current.state.systemId,current.state.locationId].join(':'))return;if(acceptResult(result))then?.(result);}
    finally {busy=false;for(const control of enabled)if(control.isConnected)control.disabled=false;}
  }
  function storyCard(root,view,{compact=false,onOpen}={}) {
    const card=document.createElement('article');card.className='thread-card';
    if(view.campaign)card.classList.add('earth-campaign-card');
    card.innerHTML=`<div class="thread-card-top"><span class="thread-category">${esc(view.category||'A local story')}</span><span class="thread-status">${esc(view.status==='active'?'In progress':view.status==='completed'?'Recorded':'A lead')}</span></div><h3>${esc(view.title)}</h3><p>${esc(compact?(view.objective||view.summary):(view.summary||view.objective))}</p>`;
    if(view.target)note(card,place(view.target),'thread-place');
    if(view.campaign)campaignProgress(card,view);
    button(card,view.status==='active'?'Continue this story':'Read the lead',onOpen||(()=>openThread(view.id)),{secondary:true});root.append(card);
  }
  function openBoard(section='stories') {
    const data=board(),root=frame(section==='people'?'People you know':section==='factions'?'Where you stand':'Your unfinished stories',section);
    if(section==='people') {
      if(!data.contacts?.length)note(root,'You have not met these people yet. Talk to people at Kettle and Morrow; your notebook will remember their names and what passed between you.');
      for(const contact of array(data.contacts)) {
        const card=document.createElement('article');card.className='relationship-card';
        card.innerHTML=`<div><span class="thread-category">${esc(contact.attitude||'Acquaintance')}</span><h3>${esc(contact.name)}</h3></div><span class="trust-score">${contact.trust>0?'+':''}${fmt(contact.trust||0)} trust</span><p>${esc(contact.lastMemory||'You have met. What happens next is still open.')}</p>`;
        destination(card,{systemId:contact.systemId,bodyId:contact.bodyId,siteId:contact.siteId,entityId:'quest:'+contact.id});root.append(card);
      }
      return;
    }
    if(section==='factions') {renderFactions(root,array(data.factions));return;}
    note(root,'Follow a lead, meet the person behind it, and decide what you are willing to do. Only stories you can discover now appear here.');
    if(data.passenger)passengerCard(root,data.passenger);
    heading(root,'In your hands');
    if(!data.active?.length)note(root,'No unfinished favors yet. The leads below begin with someone you can meet.');
    for(const view of array(data.active))storyCard(root,view,{compact:true});
    if(data.available?.length){heading(root,'Available leads');for(const view of data.available)storyCard(root,view);}
    if(!data.available?.length&&!data.active?.length) {
      button(root,'Find someone at this port',()=>track({systemId:game().state.systemId,bodyId:currentBody()||'kettle',entityId:'quest:passage-desk:'+(currentBody()||'kettle')}),{secondary:true});
      note(root,'Try the concourse at Kettle, Morrow’s clinic, or a public-services desk.');
    }
    if(data.completed?.length) {
      const details=document.createElement('details');details.className='thread-history';details.innerHTML=`<summary>Stories you have finished · ${data.completed.length}</summary>`;
      for(const item of data.completed){const p=document.createElement('p');p.innerHTML=`<strong>${esc(item.title)}</strong>${item.outcome||item.summary?'<br>'+esc(item.outcome||item.summary):''}`;details.append(p);}root.append(details);
    }
  }
  function renderFactions(root,factions,entity) {
    note(root,'Work and decisions earn standing. Supporting one side can cost you trust with its rivals. A pledge is a commitment you make at a local liaison.');
    for(const faction of factions) {
      const card=document.createElement('article');card.className='faction-card';
      card.innerHTML=`<div class="thread-card-top"><span class="thread-category">${esc(faction.rank||'Independent')}</span><strong>${faction.standing>0?'+':''}${fmt(faction.standing||0)} standing</strong></div><h3>${esc(faction.name)}</h3><p>${esc(faction.benefit||faction.philosophy||'Your actions decide how this faction receives you.')}</p>`;
      const rival=factions.find(f=>f.id===faction.rivalId);
      if(rival)note(card,'Rival: '+rival.name,'notebook-note');
      if(faction.pledged)note(card,'Your pledged faction','faction-pledged');
      else if(entity)button(card,'Discuss joining '+faction.name,()=>{
        const confirm=frame('Give your word','factions','FACTION LIAISON');
        note(confirm,faction.pledgeText||`Pledge your support to ${faction.name}. Rival factions remember who you work for. Your existing relationships and decisions still matter.`);
        note(confirm,faction.benefit||'Future work will reflect your standing.');
        if(faction.pledgeCost)money(confirm,faction.pledgeCost);else note(confirm,'No joining fee. '+wallet());
        if(faction.pledgeReason)note(confirm,faction.pledgeReason);
        button(confirm,'Pledge to '+faction.name,()=>send('pledgeFaction',{factionId:faction.id,entityId:entity.id},()=>openContact(entity)),{disabled:faction.pledgeAvailable===false});
        button(confirm,'Keep your independence',()=>openContact(entity),{secondary:true});
      },{secondary:true});
      root.append(card);
    }
    if(!entity&&game().atInhabitedPort)button(root,'Find the local faction liaison',()=>track({systemId:game().state.systemId,bodyId:currentBody(),entityId:'quest:liaison:'+currentBody()}),{secondary:true});
  }
  function contactHeader(root,contact,entity) {
    const head=document.createElement('div');head.className='notebook-contact';
    if(entity.data?.automated){const terminal=document.createElement('span');terminal.className='service-symbol';terminal.innerHTML=navIcon(entity.data?.professionDesk?'Port services':'Contacts');head.append(terminal);}
    else{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=40;canvas.setAttribute('aria-label',contact.name+' portrait');drawPortrait?.(canvas.getContext('2d'),{...entity,...contact});head.append(canvas);}
    const words=document.createElement('div');words.innerHTML=`<span class="thread-category">${esc(contact.roleLabel||contact.role||contact.attitude||'Local contact')}</span>${contact.activity?`<span class="speaker-activity">${esc(contact.activity)}</span>`:''}<p>${esc(contact.greeting||contact.text||entity.text||'They make room for you to stop and talk.')}</p>`;head.append(words);root.append(head);
    if(contact.relationship&&contact.relationship!=='Unacquainted')note(root,contact.relationship,'speaker-relationship');
    if(contact.lastMemory){const history=document.createElement('details');history.className='contact-history';history.innerHTML=`<summary>Last time we spoke</summary><p>${esc(contact.lastMemory)}</p>`;root.append(history);}
  }
  async function openContact(entity) {
    await send('inspectContact',{entityId:entity.id},answer=>{
      const contact=answer.contact||entity,root=frame(contact.name||entity.name,'stories',game().currentBody?.name||'A CONVERSATION',{conversation:true});contactHeader(root,contact,entity);
      for(const view of array(answer.threads))renderStage(root,view,{entity});
      if(entity.data?.contactId?.startsWith('passage-desk:')) {
        if(answer.passenger)passengerCard(root,answer.passenger,entity);
        else {heading(root,'Passengers looking for a ride');note(root,'Fares travel in your own ship. Meet the passenger here, then use the passage desk at their destination.');
          for(const offer of array(answer.passengers)) {
            const card=document.createElement('article');card.className='thread-card';
            card.innerHTML=`<span class="thread-category">PASSENGER FARE</span><h3>${esc(offer.name||offer.title||'A passage request')}</h3><p>${esc(offer.description||offer.text||'A passenger needs a safe passage.')}</p><strong class="fare-value">${fmt(offer.fare??offer.reward??offer.credits??0)} cr</strong>`;
            destination(card,offer.target||{systemId:offer.targetSystem||game().state.systemId,bodyId:offer.targetBody||offer.destinationBody});
            if(offer.conditions)note(card,typeof offer.conditions==='string'?offer.conditions:'The accepted fare records the promised destination and condition of your ship.');
            button(card,offer.available===false?'Passage unavailable':'Accept this fare',()=>send('acceptPassenger',{offerId:offer.id,entityId:entity.id},()=>openContact(entity)),{disabled:offer.available===false});
            if(offer.reason)note(card,offer.reason);root.append(card);
          }
          if(!answer.passengers?.length)note(root,'No suitable fares are waiting here right now.');
        }
      }
      if(entity.data?.contactId?.startsWith('liaison:'))renderFactions(root,array(answer.factions),entity);
      if(!answer.threads?.length&&!answer.passengers?.length&&!answer.factions?.length&&!answer.passenger)note(root,answer.text||'No work to discuss just now.');
      note(root,wallet(),'notebook-wallet');
    });
  }
  function passengerCard(root,passenger,entity) {
    const card=document.createElement('article');card.className='passenger-ticket';
    card.innerHTML=`<span class="thread-category">PASSENGER ABOARD</span><h3>${esc(passenger.name||passenger.title||'Your passenger')}</h3><p>${esc(passenger.description||passenger.text||'A safe passage is still owed.')}</p><strong>${fmt(passenger.fare??passenger.reward??0)} cr agreed fare</strong>`;
    const target=passenger.target||{systemId:passenger.targetSystem||passenger.systemId||game().state.systemId,bodyId:passenger.targetBody||passenger.destinationBody,entityId:'quest:passage-desk:'+(passenger.targetBody||passenger.destinationBody)};destination(card,target,'@passenger');
    if(entity){button(card,'Complete the passage',()=>send('deliverPassenger',{entityId:entity.id},()=>openContact(entity)));button(card,'Cancel at this port · no fare',()=>send('abandonPassenger',{entityId:entity.id},()=>openContact(entity)),{secondary:true});}
    root.append(card);
  }
  async function openObject(entity) {await send('inspectQuestObject',{entityId:entity.id},answer=>{const root=frame(answer.object?.name||entity.name,'stories','IN THE FIELD');note(root,answer.object?.text||entity.text||'Examine what is in front of you.');for(const view of array(answer.threads))renderStage(root,view,{entity});if(!answer.threads?.length)note(root,answer.text||'You have no unfinished business with this object yet.');});}
  function openThread(id) {
    const data=board(),view=[...array(data.active),...array(data.available)].find(v=>v.id===id);
    if(!view){openBoard();return;}
    const root=frame(view.title,'stories',view.category||'A STORY IN PROGRESS');renderStage(root,view);
  }
  function campaignProgress(root,view) {
    const info=earthCampaignPresentation(view,game().state.earthCampaignView);if(!info)return;
    const panel=document.createElement('section');panel.className='earth-progress';panel.dataset.thread=view.id;panel.dataset.stage=info.stageId||'';
    panel.innerHTML='<strong class="earth-mission"></strong><p class="earth-operation"></p><label class="earth-integrity"><span></span><progress max="100"></progress></label>';
    root.append(panel);paintCampaign(panel,info);
  }
  function paintCampaign(panel,info) {
    panel.querySelector('.earth-mission').textContent=info.mission;
    panel.querySelector('.earth-operation').textContent=info.detail;
    const meter=panel.querySelector('.earth-integrity');meter.hidden=info.integrity===null;
    if(info.integrity!==null){meter.querySelector('span').textContent=`Protected contact · ${info.integrity}% integrity`;meter.querySelector('progress').value=info.integrity;}
  }
  function refreshCampaign() {
    const panels=[...dialog.body.querySelectorAll('.earth-progress')];if(!panels.length)return;
    const data=board(),views=[...array(data.active),...array(data.available)];
    for(const panel of panels){
      const view=views.find(value=>value.id===panel.dataset.thread),info=earthCampaignPresentation(view,game().state.earthCampaignView);
      if(!info||info.stageId!==panel.dataset.stage)continue;
      paintCampaign(panel,info);
      if(!busy)for(const control of panel.parentElement.querySelectorAll('button[data-earth-action]')){
        const action=view.actions?.find(value=>value.action===control.dataset.earthAction);
        control.disabled=!action||action.available===false;
      }
    }
  }
  function renderStage(root,view,{entity,profession=false,refresh}={}) {
    const section=document.createElement('section');section.className='thread-stage';
    section.innerHTML=`<span class="thread-category">${esc(view.category||view.stageTitle||'Your next step')}</span><h3>${esc(view.stageTitle||view.title)}</h3><p class="thread-prose">${esc(view.text||view.summary||view.description)}</p>${view.objective&&!(entity&&entity.id===view.target?.entityId&&array(view.actions).some(action=>action.available!==false))?`<div class="thread-objective"><span>WHAT TO DO</span><p>${esc(view.objective)}</p></div>`:''}`;
    destination(section,view.target,profession?'@profession':view.id,{here:!!entity&&entity.id===view.target?.entityId&&!view.target?.enemyId});
    if(view.campaign)campaignProgress(section,view);
    const actions=array(view.actions);let readSolution=null;
    if(view.puzzle)readSolution=renderPuzzle(section,view.puzzle);
    if(view.reward)note(section,`${fmt(view.reward)} cr on completion${profession&&view.status!=='active'?` · ${fmt(view.cost||0)} cr supplies to begin`:''}`,'thread-place');
    for(const action of actions) {
      const wrap=document.createElement('div');wrap.className='thread-action';
      if(action.detail||action.description)note(wrap,action.detail||action.description);
      money(wrap,action.cost??(profession&&action.action==='accept'?view.cost:null));
      const actionButton=button(wrap,action.label||'Continue',()=>{
        const name=profession?'professionAction':'threadAction';
        const args=profession?{jobId:action.jobId||view.jobId||view.id,eventId:action.eventId||view.eventId,action:action.action,choiceId:action.choiceId,entityId:action.entityId||entity?.id||view.target?.entityId}:{threadId:view.id,action:action.action,choiceId:action.choiceId,entityId:entity?.id||view.target?.entityId};
        if(action.action==='solve'||action.action==='triage')args.solution=readSolution?.()||[];
        send(name,args,answer=>{
          const next=profession?null:[...array(board().active),...array(board().available)].find(v=>v.id===view.id);
          const done=frame(answer.title||view.title,profession?'professions':'stories','RECORDED IN YOUR LOG');
          note(done,answer.text||answer.message||'Your decision has been recorded.','thread-prose');
          if(next?.objective) {heading(done,'Next');note(done,next.objective);destination(done,next.target,next.id);}
          note(done,wallet(),'notebook-wallet');
          button(done,profession?'Back to work':'Back to the story',()=>refresh?refresh():profession?openProfessions(entity):entity?.data?.objectId?openObject(entity):entity?openContact(entity):openThread(view.id),{secondary:true});
        });
      },{disabled:action.available===false});
      if(view.campaign)actionButton.dataset.earthAction=action.action;
      if(action.reason)note(wrap,action.reason,'action-reason');section.append(wrap);
    }
    if(!actions.length)note(section,view.reason||'Follow the destination above to continue.');
    root.append(section);
  }
  function renderPuzzle(root,puzzle) {
    const panel=document.createElement('fieldset');panel.className='field-puzzle';
    panel.innerHTML=`<legend>${esc(puzzle.title||(puzzle.type==='sequence'?'Signal decoder':puzzle.type==='evidence'?'Put the evidence together':puzzle.type==='triage'?'Patient board':'Control panel'))}</legend><p>${esc(puzzle.prompt)}</p>`;
    if(puzzle.clues?.length){const list=document.createElement('ol');list.className='puzzle-clues';for(const clue of puzzle.clues){const item=document.createElement('li');item.textContent=clue;list.append(item);}panel.append(list);}
    const fields=document.createElement('div');fields.className='puzzle-fields';
    for(const input of array(puzzle.inputs)) {
      const label=document.createElement('label');label.textContent=input.label;
      const select=document.createElement('select');select.setAttribute('aria-label',input.label);select.dataset.puzzleInput=input.id;
      const empty=document.createElement('option');empty.value='';empty.textContent='Choose…';select.append(empty);
      for(const option of array(input.options)){const item=document.createElement('option');item.value=String(option.id);item.textContent=option.label;select.append(item);}label.append(select);fields.append(label);
    }
    panel.append(fields);note(panel,'Take your time. Read the clues and set each control before submitting.','puzzle-note');root.append(panel);
    return()=>[...fields.querySelectorAll('select')].map(select=>select.value);
  }
  function openProfessions(entity) {
    const data=game().professionBoard?.(entity?.id)||{},root=frame('Work worth doing','professions',entity?.name||'PROFESSIONS & LOCAL EVENTS');
    note(root,'Medical work, civil service, and faction duty have different responsibilities. Your work can change how a situation ends; local crews keep acting while you are away.');
    if(!entity&&game().atInhabitedPort)button(root,'Find the public-services desk',()=>track({systemId:game().state.systemId,bodyId:currentBody(),entityId:'quest:profession-desk:'+currentBody()}),{secondary:true});
    const active=Array.isArray(data.active)?data.active:data.active?[data.active]:[];
    if(active.length){heading(root,'Your current duty');for(const view of active)renderStage(root,view,{entity,profession:true,refresh:()=>openProfessions(entity)});}
    const joined=new Set(array(data.careers).filter(c=>c.enlisted).map(c=>c.id));
    const roster=document.createElement('details');roster.className='profession-roster';roster.open=!joined.size||array(data.careers).some(c=>c.actions?.some(action=>action.action==='claimServiceShip'&&action.available));
    const summary=document.createElement('summary');summary.textContent=joined.size?'Your professions & ranks':'Choose a profession';roster.append(summary);root.append(roster);
    for(const career of array(data.careers)) {
      const card=document.createElement('article');card.className='career-card';
      card.innerHTML=`<div class="thread-card-top"><span class="thread-category">${esc(career.rank||'First shift')}</span><span>${fmt(career.completed||0)} shifts</span></div><h3>${esc(career.name)}</h3><p>${esc(career.description)}</p>`;
      if(career.benefit)note(card,career.benefit);
      const enlist=career.actions?.find(action=>action.action==='enlist');
      if(enlist)button(card,enlist.label,()=>send('enlistProfession',{professionId:career.id,factionId:enlist.factionId,entityId:enlist.entityId},()=>openProfessions(entity)),{disabled:enlist.available===false,secondary:true});
      if(enlist?.reason)note(card,enlist.reason,'action-reason');
      if(career.serviceProgress)note(card,career.serviceProgress,'service-progress');
      if(career.clearance)note(card,career.clearance.ok?'Faction base clearance active.':career.clearance.reason,career.clearance.ok?'faction-pledged':'action-reason');
      const commission=career.actions?.find(action=>action.action==='claimServiceShip');
      if(commission)button(card,commission.label,()=>send('professionAction',{action:commission.action,entityId:commission.entityId},()=>openProfessions(entity)),{disabled:commission.available===false,secondary:true});
      if(commission?.reason)note(card,commission.reason,'action-reason');
      if(career.enlisted)note(card,'On the roster'+(career.nextRank?` · ${career.progressValue??career.xp} / ${career.nextRank} ${career.progressUnit||'service marks'} to next rank`:''),'faction-pledged');roster.append(card);
    }
    const offers=array(data.offers).filter(offer=>joined.has(offer.professionId));
    if(!active.length&&offers.length){heading(root,'Available shifts');for(const view of offers)renderStage(root,view,{entity,profession:true,refresh:()=>openProfessions(entity)});}
    heading(root,'Live dispatches');
    if(!data.events?.length)note(root,'No active incidents are reported. New calls will reach this board.');
    for(const event of array(data.events))renderWorldEvent(root,event,entity);
    if(data.conditions?.length){const details=document.createElement('details');details.className='thread-history';details.innerHTML='<summary>Conditions around the galaxy</summary>';for(const condition of data.conditions){const card=document.createElement('article');card.className='world-event';card.innerHTML=`<h3>${esc(condition.title)}</h3><p>${esc(condition.text)}</p>`;note(card,place(condition),'thread-place');note(card,condition.serviceMultiplier>1?'Port services cost more while this shortage lasts.':'Relief has temporarily reduced port service prices.');details.append(card);}root.append(details);}
    if(data.history?.length){const details=document.createElement('details');details.className='thread-history';details.innerHTML='<summary>Recent outcomes & recorded assistance</summary>';for(const event of data.history)renderWorldEvent(details,event,entity);root.append(details);}
    if(data.workHistory?.length){const details=document.createElement('details');details.className='thread-history';details.innerHTML='<summary>Your completed shifts</summary>';for(const shift of data.workHistory)note(details,`${shift.title} · ${shift.paid} cr. ${shift.outcome}`);root.append(details);}
    note(root,wallet(),'notebook-wallet');
  }
  function renderWorldEvent(root,event,entity){
    const card=document.createElement('article');card.className='world-event';
    card.innerHTML=`<span class="event-phase">${esc(event.status==='resolved'?'Resolved':event.status==='warning'?'Incoming call':'Response under way')}</span><h3>${esc(event.title)}</h3><p>${esc(event.resultText||event.text)}</p>`;
    if(event.status!=='resolved')note(card,event.objective||'Local crews are responding.');
    if(event.target)destination(card,event.target);
    if(event.status==='warning')note(card,`Response begins in ${event.startsIn} seconds`,'thread-place');
    else if(event.status==='active')note(card,`${event.progress} / ${event.required} response goals met · ${Math.max(1,Math.ceil(event.remaining/60))} minutes remaining`,'thread-place');
    if(event.contribution&&(event.contribution.aid||event.contribution.damage))note(card,`Your contribution: ${event.contribution.aid||0} care actions · ${Math.round(event.contribution.damage||0)} combat damage${event.contribution.claimed?' · payment recorded':''}`);
    for(const action of array(event.actions)){
      button(card,action.label,()=>send('professionAction',{action:action.action,eventId:event.id,entityId:action.entityId||entity?.id||event.target?.entityId},()=>openProfessions(entity)),{disabled:action.available===false,secondary:true});
      if(action.reason)note(card,action.reason,'action-reason');
    }
    root.append(card);
  }
  return {openBoard,openThread,openContact,openObject,openProfessions,renderStage,refreshCampaign};
}
