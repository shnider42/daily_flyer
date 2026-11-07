/* Submission types v2. Copy changes never clear an in-progress draft. */
(function(root){
 'use strict';
 const types=Object.freeze({
  suggestion:{name:'Improvement idea',heading:'What could be better?',intro:'Describe the need first, then the change you have in mind.',title:'Give your idea a clear title',titleHint:'For example: A clearer helicopter controls guide',problem:'What inspired this idea?',problemHint:'Describe the situation, unmet need, or frustration behind it. Save the proposed solution for the next field.',outcome:'What would you change or add?',outcomeHint:'Describe your idea and how it would work.',problemHeading:'The need behind the idea',outcomeHeading:'The proposed idea',send:'Send idea to moderators',saved:'Your suggestion is saved.'},
  bug_priority:{name:'Prioritize a tracked bug',heading:'Which tracked problem could use more attention?',intro:'Choose an existing issue below. Explain its impact rather than submitting the same bug again.',title:'Give this priority request a clear title',titleHint:'For example: Prioritize unreliable voice chat',problem:'How does this tracked problem affect play?',problemHint:'Explain how often you encounter it and what it prevents you from doing.',outcome:'How could addressing it help?',outcomeHint:'Describe the benefit to players and why this issue matters to you.',problemHeading:'Impact on play',outcomeHeading:'Why prioritize it',send:'Send priority request to moderators',saved:'Your priority request is saved.'},
  problem_report:{name:'Report a problem',heading:'What happened?',intro:'Describe what you observed. Include your platform, game version and steps to reproduce when you know them. No diagnosis is required.',title:'Give this problem a clear title',titleHint:'For example: Voice chat stopped after switching servers',problem:'What happened, and how can it be reproduced?',problemHint:'What did you do, what happened next, and how often? Include platform and game version if known.',outcome:'What did you expect to happen?',outcomeHint:'Describe the expected behavior. You do not need to propose a fix.',problemHeading:'Reported behavior and steps',outcomeHeading:'Expected behavior',send:'Send problem report to moderators',saved:'Your problem report is saved.'}
 });
 const get=kind=>types[kind]||types.suggestion;
 function bind(form,{revision=false}={}){
  const kind=form.querySelector('#cbKind');if(!kind)return;
  const update=()=>{
   const t=get(kind.value);
   for(const [id,value] of Object.entries({cbTitleLabel:t.title,cbProblemLabel:t.problem,cbOutcomeLabel:t.outcome,cbTypeHelp:t.intro,cbFocus:revision?'Revise your '+(kind.value==='problem_report'?'problem report':'submission'):t.heading,cbIssueLabel:kind.value==='bug_priority'?'Related tracked issue · required':'Related tracked issue · optional'})){
    const node=document.getElementById(id);if(node)node.textContent=value;
   }
   for(const [id,key] of [['cbTitle','titleHint'],['cbProblem','problemHint'],['cbOutcome','outcomeHint']])form.querySelector('#'+id).placeholder=t[key];
   form.querySelector('#cbIssue').required=kind.value==='bug_priority';
   form.querySelector('#cbSend').textContent=revision?'Save revision for review →':t.send+' →';
  };
  kind.addEventListener('change',update);update();
 }
 root.HLLVSubmissionTypes=Object.freeze({types,get,bind});
})(globalThis);
