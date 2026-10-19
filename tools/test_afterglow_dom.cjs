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
 assert.equal(d.querySelectorAll('.ag-event').length,38);
 assert.equal(d.querySelectorAll('.ag-coverage li').length,13);
 for(const [id,count] of Object.entries({'fkj':3,'griz':3,'muse':2,'the-wonder-years':1,'four-year-strong':2,'august-burns-red':3,'born-without-bones':7,'ben-howard':0,'mt-joy':4,'zach-bryan':7})){
  $('#ag-artist').value=id;$('#ag-artist').dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('.ag-event').length,count,id);assert.ok($('#ag-results').textContent.includes('Partial coverage'));
  assert.equal(d.querySelectorAll('.ag-listing-source a').length,count);
 }
 $('#ag-artist').value='all';$('#ag-artist').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(d.querySelectorAll('.ag-orbit-link').length,3);w.location.hash='artists';await wait();assert.equal(d.querySelectorAll('.ag-artist').length,13);for(const id of ['above-beyond','ilan-bluestone','oliver-smith'])click(`[data-action="follow"][data-id="${id}"]`);assert.equal(read().followed.length,3);
 click('[data-action="follow"][data-id="ilan-bluestone"]');assert.equal(read().followed.length,2);
 w.location.hash='discover';await wait();$('#ag-region').value='northeast';$('#ag-region').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelectorAll('.ag-event').length,11);assert.ok($('#ag-results').textContent.includes('SILO'));assert.ok($('#ag-results').textContent.includes('Boston'));
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
 w.location.hash='discover';await wait();$('#ag-region').value='all';$('#ag-region').dispatchEvent(new w.Event('change',{bubbles:true}));click('[data-action="details"][data-id="warehouse-birmingham-20261024"]');click('[data-action="calendar"]');const ics=await downloads.at(-1).text();assert.ok(ics.includes('DTSTART;VALUE=DATE:20261024'));assert.ok(ics.includes('DTEND;VALUE=DATE:20261025'));assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
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
 // A direct band URL works on first load and preserves the existing journal format.
 const profileReload=new JSDOM(html,{url:'https://afterglow.test/#artist/born-without-bones',runScripts:'dangerously',virtualConsole:vc,beforeParse(win){win.localStorage.setItem('dfe.afterglow.v1',JSON.stringify(backup));}});
 assert.equal(profileReload.window.document.querySelector('.ag-profile h1').textContent,'Born Without Bones');
 assert.equal(profileReload.window.document.querySelectorAll('.ag-releases li').length,8);profileReload.window.close();
 w.location.hash='artist/born-without-bones';await wait();
 assert.equal($('.ag-tabs [aria-current="page"]').getAttribute('href'),'#artists');
 assert.equal(d.querySelectorAll('.ag-members li').length,4);assert.ok($('.ag-members').textContent.includes('Ryan McKenna'));
 assert.equal(d.querySelectorAll('.ag-profile .ag-event').length,7);
 assert.equal(d.querySelectorAll('.ag-listen a').length,4);
 click('[data-action="follow"][data-id="born-without-bones"]');assert.ok(read().followed.includes('born-without-bones'));assert.equal(w.location.hash,'#artist/born-without-bones');
 for(const part of ['early','late'])click(`[data-action="save-show"][data-id="bwb-los-angeles-${part}-20261106"]`);
 const laPlans=read().entries.filter(r=>r.id.startsWith('bwb-los-angeles-'));assert.equal(laPlans.length,2);assert.notEqual(laPlans[0].event.source,laPlans[1].event.source);
 assert.ok($('.ag-profile-journal').textContent.includes('2 saved plans'));
 click('[data-action="artist-add-show"]');assert.equal($('[name="artist"]').value,'born-without-bones');assert.equal($('[name="status"]').value,'interested');closeDialogForTest();
 click('[data-action="artist-memory"]');assert.equal($('[name="lineup"]').value,'Born Without Bones');assert.equal($('[name="artist"]').value,'born-without-bones');assert.equal($('[name="status"]').value,'attended');
 value('date','2025-01-02');value('city','Boston, MA');value('moment','The whole room singing');submit();await wait();assert.equal(w.location.hash,'#memories');
 assert.ok(read().entries.some(r=>r.status==='attended'&&r.event.artists.includes('born-without-bones')));
 w.location.hash='artist/born-without-bones';await wait();assert.ok($('.ag-profile-journal').textContent.includes('1 night remembered'));
 click('[data-action="artist-shows"][data-id="born-without-bones"]');await wait();assert.equal($('#ag-artist').value,'born-without-bones');assert.equal(d.querySelectorAll('.ag-event').length,7);
 w.location.hash='artists';await wait();assert.ok($('.ag-profile-link[href="#artist/born-without-bones"]'));
 w.location.hash='artist/unknown';await wait();assert.ok($('#ag-shows-title'));
 // New profiles use their own identity and solo/band wording.
 for(const [id,name,releases,shows,solo] of [['ben-howard','Ben Howard',6,0,true],['mt-joy','Mt. Joy',5,4,false],['zach-bryan','Zach Bryan',6,7,true]]){
  w.location.hash='artist/'+id;await wait();
  assert.equal($('.ag-profile h1').textContent,name);
  assert.equal(d.querySelectorAll('.ag-releases li').length,releases);
  assert.equal(d.querySelectorAll('.ag-profile .ag-event').length,shows);
  assert.equal($('#ag-members-title').textContent,solo?'The artist.':'In the band.');
  assert.ok(!$('.ag-profile-print').textContent.includes('Milford'));
  assert.ok(!$('.ag-profile').textContent.includes('Invalid Date'));
  click(`[data-action="follow"][data-id="${id}"]`);assert.ok(read().followed.includes(id));
  click('[data-action="artist-memory"]');assert.equal($('[name="artist"]').value,id);assert.equal($('[name="lineup"]').value,name);closeDialogForTest();
 }
 w.location.hash='artist/ben-howard';await wait();assert.ok($('.ag-profile').textContent.includes('No upcoming date was verified'));
 w.location.hash='discover';await wait();$('#ag-artist').value='all';$('#ag-artist').dispatchEvent(new w.Event('change',{bubbles:true}));
 $('#ag-search').value='Mount Joy';$('#ag-search').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('.ag-event').length,4);
 click('[data-action="details"][data-id="mt-joy-out-of-blue-20270107"]');assert.ok($('#ag-dialog-content').textContent.includes('not a confirmed Mt. Joy performance date'));
 click('[data-action="calendar"]');const blueIcs=await downloads.at(-1).text();assert.ok(blueIcs.includes('DTSTART;VALUE=DATE:20270107'));assert.ok(blueIcs.includes('DTEND;VALUE=DATE:20270111'));closeDialogForTest();
 w.location.hash='artists';await wait();click('[data-action="add-artist"]');value('name','Mount Joy');$('#ag-artist-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.ok($('#ag-form-error').textContent.includes('already'));closeDialogForTest();
 assert.deepEqual(errors,[]);
 console.log('PASS: discovery, follow, filters, save/edit, date validation, XSS escaping, custom artist, memory timeline, storage failure, delete confirmation, backup export/import/cancel, source coverage for all thirteen artists, multi-day calendar boundaries, range validation and backup roundtrip, persisted reload, artist deep links, band notebook, separate early/late plans and pre-linked artist memories, solo profiles, unknown tour coverage, Mount Joy search alias and festival calendar boundaries.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close()});
