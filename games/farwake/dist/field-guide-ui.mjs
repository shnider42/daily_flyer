import {GUIDANCE_LEVELS,guidancePolicy} from './guidance.mjs';
import {fieldGuideTopics,searchFieldGuide,recommendFieldGuideTopics} from './field-guide.mjs';

/** An on-demand guide. Rendering never invokes a game command or records practice. */
export function createFieldGuideUI({dialog,getContext=()=>({}),getGuidance=()=> 'simple',setGuidance=()=>{},getProgress=()=>null,requestHelp=()=>{},resetProgress=()=>{},openFoldDrive=null,document:doc=globalThis.document}) {
 const el=(tag,className='',text='')=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const button=(label,action,className='')=>{const node=el('button',className,label);node.type='button';node.onclick=action;return node;};
 let root=null,search=null,currentTopic=null,results=null,resultStatus=null,progressRoot=null,epoch=0;
 const active=()=>dialog.opened&&dialog.kind==='help'&&root&&root.parentNode===dialog.body;
 function open({query='',topic=null}={}) {
  const context=getContext()||{},policy=guidancePolicy(getGuidance()),topics=fieldGuideTopics(context),byId=new Map(topics.map(item=>[item.id,item])),owner=++epoch,current=()=>active()&&owner===epoch;
  currentTopic=byId.has(topic)?topic:null;
  dialog.open('Captain’s field guide','help',{eyebrow:'GUIDANCE & EVERYDAY KNOW-HOW'});
  root=el('div','field-guide');dialog.body.append(root);
  const levelSection=el('section','field-guide-levels'),levelLabel=el('h3','','How much help would you like?'),levels=el('div','field-guide-level-buttons');
  levels.setAttribute('role','group');levels.setAttribute('aria-label','Guidance level');
  for(const level of GUIDANCE_LEVELS){
   const choice=button(level.name,()=>{
    if(!current())return;
    const nextQuery=search.value,nextTopic=currentTopic;
    setGuidance(level.id);open({query:nextQuery,topic:nextTopic});
    const selected=root.querySelector?.(`[data-guidance-level="${level.id}"]`);selected?.focus();
   });
   choice.dataset.guidanceLevel=level.id;choice.setAttribute('aria-pressed',String(policy.id===level.id));choice.setAttribute('aria-describedby','field-guide-level-description');levels.append(choice);
  }
  const description=el('p','field-guide-level-description',policy.behavior||policy.description||policy.summary);description.id='field-guide-level-description';
  levelSection.append(levelLabel,levels,description,el('p','field-guide-note','Your choice changes help and reminders. Combat, rewards, ranks, and permissions stay the same.'));
  root.append(levelSection);
  const actionHelp=button('Help with what I’m doing',()=>{if(!current()||context.playing===false)return;dialog.close();requestHelp();},'button-primary field-guide-action');actionHelp.disabled=context.playing===false;root.append(actionHelp);
  if(context.playing===false)root.append(el('p','field-guide-note','Start or resume a voyage to get help for your current situation. You can choose a guidance level and browse every topic here first.'));

  const useful=el('section','field-guide-useful'),links=el('div','field-guide-topic-links');useful.append(el('h3','','Useful here'));
  for(const id of recommendFieldGuideTopics(context))if(byId.has(id))links.append(button(byId.get(id).title,()=>showTopic(id)));
  useful.append(links);root.append(useful);

  const searchLabel=el('label','field-guide-search-label','Find an answer');searchLabel.htmlFor='field-guide-search';
  search=el('input','field-guide-search');search.id='field-guide-search';search.type='search';search.placeholder='Try “fold drive”, “same crew”, or “turret”…';search.maxLength=180;search.value=String(query||'').slice(0,180);search.setAttribute('autocomplete','off');search.setAttribute('aria-controls','field-guide-results');
  resultStatus=el('p','field-guide-result-status');resultStatus.setAttribute('role','status');resultStatus.setAttribute('aria-live','polite');
  results=el('div','field-guide-results');results.id='field-guide-results';
  root.append(searchLabel,search,resultStatus,results);search.oninput=()=>{if(current())renderTopics(context,byId);};
  progressRoot=el('div','field-guide-progress');root.append(progressRoot);renderProgress();
  root.append(el('p','field-guide-note',context.playing===false?'Your guidance choice is ready for your next voyage.':context.sharedGalaxy||context.online||context.multiplayer?'This shared galaxy keeps moving while you read. Choose a safe place before opening a long explanation.':context.recovery?.detained?'Your detention term continues while this guide is open. Release is automatic when the term is served.':'In a solo voyage, opening this guide pauses the game.'));
  renderTopics(context,byId);
  if(currentTopic){const article=[...results.children].find(node=>node.dataset.topic===currentTopic);article?.firstElementChild?.focus();article?.scrollIntoView?.({block:'nearest',behavior:'auto'});}
  function showTopic(id){
   if(!current()||!byId.has(id))return;
   search.value='';currentTopic=id;renderTopics(context,byId);
   const article=[...results.children].find(node=>node.dataset.topic===id),summary=article?.firstElementChild;
   summary?.focus();article?.scrollIntoView?.({block:'nearest',behavior:'auto'});
  }
  function renderTopics(options,lookup){
   const matches=searchFieldGuide(search.value,options);results.replaceChildren();
   resultStatus.textContent=`${matches.length} ${matches.length===1?'topic':'topics'}${search.value.trim()?' found':''}`;
   if(!matches.length){
    results.append(el('p','field-guide-empty','No matching topic. Try a shorter phrase such as “crew”, “dock”, “military”, or “save”.'));
    results.append(button('Show all topics',()=>{if(!current())return;search.value='';renderTopics(options,lookup);search.focus();}));return;
   }
   for(const item of matches){
    const article=el('details','field-guide-topic');article.dataset.topic=item.id;article.open=currentTopic===item.id||matches.length===1;
    const summary=el('summary'),title=el('strong','',item.title),preview=el('span','',item.summary);summary.append(title,preview);article.append(summary);
    const body=el('div','field-guide-topic-body'),steps=el('ol','field-guide-steps');for(const step of item.steps)steps.append(el('li','',step));body.append(steps);
    if(item.id==='fold-drive'&&context.playing!==false&&typeof openFoldDrive==='function')body.append(button('Check my fold-drive progress',()=>{if(current())openFoldDrive();},'button-primary'));
    body.append(el('p','field-guide-why',item.why));
    if(item.blockers.length){const heading=el('h4','','If you get stuck'),blockers=el('ul','field-guide-blockers');for(const detail of item.blockers)blockers.append(el('li','',detail));body.append(heading,blockers);}
    const related=el('div','field-guide-related');related.setAttribute('aria-label',`Related to ${item.title}`);
    for(const id of item.related)if(lookup.has(id))related.append(button(lookup.get(id).title,()=>showTopic(id)));
    body.append(related);article.append(body);results.append(article);
    article.ontoggle=()=>{if(!current())return;if(article.open)currentTopic=item.id;else if(currentTopic===item.id)currentTopic=null;};
   }
  }
  return root;
 }
 function renderProgress({expanded=false,message=''}={}) {
  if(!progressRoot)return;
  progressRoot.replaceChildren();
  const data=getProgress(),owner=epoch,current=()=>active()&&owner===epoch;if(!data?.flows?.length)return;
  const panel=el('details','field-guide-practice');panel.open=expanded;
  panel.append(el('summary','',`Your practice · ${data.completed} / ${data.total} actions familiar`));
  panel.append(el('p','field-guide-note',`Recorded successful actions for this captain on ${data.device==='touch'?'touch controls':'keyboard and mouse'}. Reading or dismissing a tip does not complete it. Progress is a reminder, not a requirement to explore.`));
  const rows=el('div','field-guide-practice-rows');
  for(const flow of data.flows){
   const row=el('details','field-guide-practice-row'),summary=el('summary'),label=el('strong','',flow.title),count=el('span','',`${flow.completed} / ${flow.total} actions familiar`);summary.append(label,count);row.append(summary);
   const list=el('ul','field-guide-practice-actions');
   for(const action of flow.actions){const li=el('li'),name=el('span','',action.title),done=el('span','',`${action.count} / ${action.required}${action.complete?' · familiar':''}`);li.append(name,done);list.append(li);}
   row.append(list,button(`Relearn ${flow.title.toLowerCase()}`,()=>{
    if(!current())return;resetProgress(flow.id);renderProgress({expanded:true,message:`${flow.title} practice restarted. Your voyage and guidance level are unchanged.`});
   }));rows.append(row);
  }
  panel.append(rows,el('p','field-guide-note','Relearn resets only these practice reminders. It does not remove missions, ranks, possessions, or discoveries. Expert still waits for you to ask for help.'));
  panel.append(button('Relearn all actions',()=>{if(!current())return;resetProgress('all');renderProgress({expanded:true,message:'All practice reminders restarted. Your voyage and guidance level are unchanged.'});}));
  const status=el('p','field-guide-practice-status',message);status.setAttribute('role','status');panel.append(status);progressRoot.append(panel);
 }
 return{open};
}
