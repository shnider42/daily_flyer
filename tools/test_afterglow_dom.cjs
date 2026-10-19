/* Run with NODE_PATH pointing at an installed jsdom runtime. No network calls. */
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2],'utf8');
const errors=[], downloads=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!e.message.includes('CSS'))errors.push(e.message)});
const dom=new JSDOM(html,{url:'https://afterglow.test',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-19T12:00:00Z']))}static now(){return NativeDate.parse('2026-10-19T12:00:00Z')}};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.TextEncoder=TextEncoder;w.Blob=Blob;w.HTMLAnchorElement.prototype.click=function(){};w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test'};w.URL.revokeObjectURL=()=>{};}});
const w=dom.window,d=w.document;
const $=s=>d.querySelector(s);
const click=s=>{assert.ok($(s),s);$(s).click()};
const wait=()=>new Promise(r=>setTimeout(r,10));
const read=()=>JSON.parse(w.localStorage.getItem('dfe.afterglow.v1'));
const value=(name,value)=>{$(`[name="${name}"]`).value=value;};
const closeDialogForTest=()=>click('[data-action="close"]');
const submit=()=>$('#ag-show-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
(async()=>{
 assert.equal(d.querySelectorAll('.ag-event').length,20);
 assert.equal(d.querySelectorAll('.ag-coverage li').length,9);
 for(const [id,count] of Object.entries({'fkj':3,'griz':3,'muse':2,'the-wonder-years':1,'four-year-strong':2,'august-burns-red':3})){
  $('#ag-artist').value=id;$('#ag-artist').dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('.ag-event').length,count,id);assert.ok($('#ag-results').textContent.includes('Partial coverage'));
  assert.equal(d.querySelectorAll('.ag-listing-source a').length,count);
 }
 $('#ag-artist').value='all';$('#ag-artist').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(d.querySelectorAll('.ag-orbit-link').length,3);w.location.hash='artists';await wait();assert.equal(d.querySelectorAll('.ag-artist').length,9);for(const id of ['above-beyond','ilan-bluestone','oliver-smith'])click(`[data-action="follow"][data-id="${id}"]`);assert.equal(read().followed.length,3);
 click('[data-action="follow"][data-id="ilan-bluestone"]');assert.equal(read().followed.length,2);
 w.location.hash='discover';await wait();$('#ag-region').value='northeast';$('#ag-region').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelectorAll('.ag-event').length,6);assert.ok($('#ag-results').textContent.includes('SILO'));assert.ok($('#ag-results').textContent.includes('Boston'));
 click('[data-action="save-show"][data-id="oliver-brooklyn-20261205"]');assert.equal(read().entries.length,1);assert.equal(read().entries[0].status,'interested');
 w.location.hash='plans';await wait();click('[data-action="edit-show"]');value('notes','Trip plans');value('venue','My updated venue');submit();await wait();assert.equal(read().entries[0].notes,'Trip plans');assert.ok($('#ag-content').textContent.includes('My updated venue'));
 click('[data-action="edit-show"]');assert.equal($('[name="venue"]').value,'My updated venue');value('status','attended');submit();assert.ok(!$('#ag-form-error').hidden);assert.equal(read().entries[0].status,'interested');
 value('date','2026-01-02');value('moment','<img src=x onerror=alert(1)>');value('companions','A friend');submit();await wait();assert.equal(w.location.hash,'#memories');assert.equal(d.querySelectorAll('.ag-memory').length,1);assert.equal(d.querySelectorAll('.ag-memory img').length,0);assert.ok($('#ag-content').textContent.includes('<img src=x'));
 click('[data-action="edit-show"]');assert.equal($('[name="notes"]').value,'Trip plans');click('[data-action="close"]');
 w.location.hash='artists';await wait();click('[data-action="add-artist"]');value('name','Test artist');value('url','javascript:alert(1)');$('#ag-artist-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.ok(!$('#ag-form-error').hidden);assert.equal(read().customArtists.length,0);value('url','https://example.com');$('#ag-artist-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(read().customArtists.length,1);
 w.location.hash='memories';await wait();click('[data-action="add-memory"]');value('title','Another night');value('date','2025-08-02');value('city','Boston, MA');value('venue','Test venue');value('lineup','Test artist');value('artist',read().customArtists[0].id);submit();await wait();assert.equal(read().entries.length,2);assert.equal(d.querySelectorAll('.ag-memory').length,2);
 // Saving failure must not pretend data was persisted or discard the form.
 click('[data-action="edit-show"]');value('notes','Must not save');const originalSet=w.Storage.prototype.setItem;w.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError')};submit();assert.equal(read().entries[0].notes,'Trip plans');assert.ok($('#ag-dialog').open);assert.ok($('#ag-notice').textContent.includes('Could not save'));w.Storage.prototype.setItem=originalSet;click('[data-action="close"]');
 click('[data-action="edit-show"]');click('[data-action="delete-entry"]');click('[data-action="close"]');assert.equal(read().entries.length,2);
 click('[data-action="edit-show"]');click('[data-action="delete-entry"]');click('[data-action="confirm-delete"]');assert.equal(read().entries.length,1);
 const saved=read();assert.equal(saved.version,1);
 click('[data-action="export"]');const backup=JSON.parse(await downloads.at(-1).text());assert.equal(backup.entries.length,1);
 const importFile=async contents=>{const input=$('#ag-import');Object.defineProperty(input,'files',{configurable:true,value:[{size:contents.length,text:async()=>contents}]});input.dispatchEvent(new w.Event('change',{bubbles:true}));await wait();};
 await importFile('{broken');assert.equal(read().entries.length,1);assert.ok($('#ag-notice').textContent.includes('not a valid'));
 await importFile(JSON.stringify({...backup,entries:[]}));click('[data-action="close"]');assert.equal(read().entries.length,1);
 await importFile(JSON.stringify({...backup,entries:[]}));click('[data-action="confirm-import"]');assert.equal(read().entries.length,0);
 await importFile(JSON.stringify(backup));click('[data-action="confirm-import"]');assert.equal(read().entries.length,1);
 w.location.hash='discover';await wait();$('#ag-region').value='all';$('#ag-region').dispatchEvent(new w.Event('change',{bubbles:true}));click('[data-action="details"]');click('[data-action="calendar"]');const ics=await downloads.at(-1).text();assert.ok(ics.includes('DTSTART;VALUE=DATE:20261024'));assert.ok(ics.includes('DTEND;VALUE=DATE:20261025'));assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
 closeDialogForTest();
 $('#ag-artist').value='the-wonder-years';$('#ag-artist').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.ok($('#ag-results').textContent.includes('Jan 26, 2027'));
 click('[data-action="details"][data-id="wonder-years-end-cruise-20270122"]');assert.ok($('#ag-dialog-content').textContent.includes('not a confirmed set date'));
 click('[data-action="calendar"]');const cruiseIcs=await downloads.at(-1).text();assert.ok(cruiseIcs.includes('DTSTART;VALUE=DATE:20270122'));assert.ok(cruiseIcs.includes('DTEND;VALUE=DATE:20270127'));closeDialogForTest();
 click('[data-action="save-show"][data-id="wonder-years-end-cruise-20270122"]');assert.equal(read().entries.find(e=>e.id==='wonder-years-end-cruise-20270122').event.endDate,'2027-01-26');
 await wait();click('[data-action="edit-show"][data-id="wonder-years-end-cruise-20270122"]');assert.equal($('[name="endDate"]').value,'2027-01-26');value('endDate','2027-01-01');submit();assert.ok($('#ag-form-error').textContent.includes('end date'));value('endDate','2027-01-26');submit();await wait();
 click('[data-action="export"]');const rangeBackup=JSON.parse(await downloads.at(-1).text());await importFile(JSON.stringify(rangeBackup));click('[data-action="confirm-import"]');assert.equal(read().entries.find(e=>e.id==='wonder-years-end-cruise-20270122').event.endDate,'2027-01-26');
 const invalidRange=JSON.parse(JSON.stringify(rangeBackup));invalidRange.entries.find(e=>e.id==='wonder-years-end-cruise-20270122').event.endDate='2026-01-01';await importFile(JSON.stringify(invalidRange));assert.ok($('#ag-notice').textContent.includes('not a valid'));assert.equal(read().entries.length,2);
 for(const [today,count] of [['2027-01-24',1],['2027-01-27',0]]){
  const timed=new JSDOM(html,{url:'https://afterglow.test/#discover',runScripts:'dangerously',virtualConsole:vc,beforeParse(win){const NativeDate=win.Date;win.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[today+'T12:00:00Z']))}};win.scrollTo=()=>{};}});
  const input=timed.window.document.querySelector('#ag-artist');input.value='the-wonder-years';input.dispatchEvent(new timed.window.Event('change',{bubbles:true}));assert.equal(timed.window.document.querySelectorAll('.ag-event').length,count);timed.window.close();
 }
 const reload=new JSDOM(html,{url:'https://afterglow.test/#memories',runScripts:'dangerously',virtualConsole:vc,beforeParse(win){win.localStorage.setItem('dfe.afterglow.v1',JSON.stringify(backup));win.scrollTo=()=>{};}});assert.equal(reload.window.document.querySelectorAll('.ag-memory').length,1);reload.window.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: discovery, follow, filters, save/edit, date validation, XSS escaping, custom artist, memory timeline, storage failure, delete confirmation, backup export/import/cancel, source coverage for all nine artists, multi-day calendar boundaries, range validation and backup roundtrip, persisted reload.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close()});
