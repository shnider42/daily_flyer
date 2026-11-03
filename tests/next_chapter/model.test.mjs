import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,emptyWorkspace,validateWorkspace,summary,visibleJobs,pendingTasks,dateKey,relativeDate,dayDiff,safeURL,escapeHTML,csvExport} from '../../next_chapter/model.mjs';
import {prepareImport} from '../../next_chapter/store.mjs';

test('demo is valid, fictional, and dates are relative to the current day',()=>{
 const w=demoWorkspace();assert.equal(validateWorkspace(w),w);assert.equal(w.jobs.length,9);assert.equal(summary(w).active.length,7);assert.equal(summary(w).due,2);assert.equal(summary(w).interviews,2);assert.equal(summary(w).offers,1);assert.equal(w.jobs[0].tasks[0].date,dateKey());
});
test('completed, archived, closed, and on-hold tasks do not surface as due',()=>{
 const w=demoWorkspace();w.jobs[0].tasks[0].done=true;assert.equal(summary(w).due,1);w.jobs[1].archived=true;assert.equal(summary(w).due,0);w.jobs[2].outcome='On hold';assert(!pendingTasks(w).some(t=>t.job.id==='j3'));w.jobs[3].stage='Closed';assert(!pendingTasks(w).some(t=>t.job.id==='j4'));
});
test('stream, stage, search, and archive filters compose correctly',()=>{
 const w=demoWorkspace();assert.equal(visibleJobs(w,{stream:'se',stage:'Interviewing',query:'halcyon'}).length,1);assert.equal(visibleJobs(w,{query:'does not exist'}).length,0);w.jobs[0].archived=true;assert.equal(visibleJobs(w,{archived:true}).length,1);
});
test('empty workspace has no invented metrics and excludes unknown pay',()=>{
 const w=emptyWorkspace();assert.equal(summary(w).avgSalary,null);assert.equal(summary(w).active.length,0);const d=demoWorkspace();d.jobs.filter(j=>j.outcome==='Active').forEach(j=>j.salary=0);assert.equal(summary(d).avgSalary,null);
});
test('date differences use calendar dates across DST boundaries',()=>{
 assert.equal(dayDiff('2026-11-02','2026-11-01'),1);assert.equal(dayDiff('2026-03-09','2026-03-08'),1);assert.equal(dayDiff('2026-10-31','2026-11-01'),-1);assert.equal(dayDiff(relativeDate(1)),1);assert.equal(dayDiff(''),null);
});
test('links and markup cannot introduce script execution',()=>{
 assert.equal(safeURL('javascript:alert(1)'), '');assert.equal(safeURL('data:text/html,test'),'');assert.equal(safeURL('https://example.com/job'),'https://example.com/job');assert.equal(escapeHTML('<img src=x onerror="run()">'),'&lt;img src=x onerror=&quot;run()&quot;&gt;');
});
test('backup validation rejects corrupted collections and invalid dates',()=>{
 for(const mutate of [w=>w.jobs[0].tasks=null,w=>w.jobs[0].salary=-1,w=>w.jobs[0].stage='Hired?',w=>w.jobs[0].created='2026-02-31',w=>w.jobs[0].fit=100,w=>w.jobs.push(w.jobs[0]),w=>w.streams=[]]){const w=demoWorkspace();mutate(w);assert.throws(()=>validateWorkspace(w));}
});
test('CSV escapes fields and mitigates spreadsheet formula injection',()=>{
 const w=demoWorkspace();w.jobs[0].company='=HYPERLINK("evil")';w.jobs[0].role='Quoted, "role"';const csv=csvExport(w);assert(csv.includes('"\'=HYPERLINK(""evil"")"'));assert(csv.includes('"Quoted, ""role"""'));assert(csv.split('\r\n').length===10);
});
test('import requires all attachment bytes and restores valid attachments',async()=>{
 const workspace=demoWorkspace();workspace.documents.push({id:'att',name:'example.txt',kind:'Other',job:'',date:dateKey(),fileKey:'old-key',size:5});const raw={format:'next-chapter',version:1,workspace,files:{}};await assert.rejects(()=>prepareImport(raw),/attachment/);raw.files.att='data:text/plain;base64,aGVsbG8=';const result=await prepareImport(raw);assert.equal(await result.prepared[0].blob.text(),'hello');assert.notEqual(result.data.documents.at(-1).fileKey,'old-key');assert.equal(raw.workspace.documents.at(-1).fileKey,'old-key');
});
