import test from 'node:test';
import assert from 'node:assert/strict';
import {guidanceFlowMarkup} from '../dist/guidance-flows.mjs';

test('optional flow help retains full instructions, exposes actual progress, and escapes public names',()=>{
 const input={id:'crew-boarding',title:'Join <Ada>',steps:[{text:'Meet at Kettle',done:true},{text:'Allow <Ada> aboard',done:false},{text:'Wait for the pilot',done:false}],notes:['The owner keeps "Helm" permission.']};
 const simple=guidanceFlowMarkup(input),moderate=guidanceFlowMarkup({...input,level:'moderate'}),expert=guidanceFlowMarkup({...input,level:'expert'});
 assert.match(simple,/data-guidance-flow="crew-boarding" open/);assert.match(simple,/<li class="current" aria-current="step">/);assert.match(simple,/Join &lt;Ada&gt;/);assert.doesNotMatch(simple,/<Ada>/);
 assert.match(moderate,/<strong>Next:<\/strong> Allow &lt;Ada&gt; aboard/);assert.doesNotMatch(moderate,/data-guidance-flow="crew-boarding" open/);
 assert.doesNotMatch(expert,/guidance-flow-next/);assert.doesNotMatch(expert,/data-guidance-flow="crew-boarding" open/);assert.match(expert,/Wait for the pilot/);
});

test('completed and unavailable flows use their explicit next instruction without inventing a completed action',()=>{
 const ready=guidanceFlowMarkup({level:'moderate',steps:[{text:'Board',done:true}],next:'Wait for your friend.'});assert.match(ready,/<strong>Next:<\/strong> Wait for your friend/);assert.doesNotMatch(ready,/aria-current/);
 const blocked=guidanceFlowMarkup({level:'moderate',next:'This deployment has departed.',notes:['Meet for the next muster.']});assert.match(blocked,/<strong>Next:<\/strong> This deployment has departed/);assert.doesNotMatch(blocked,/aria-current/);
});
