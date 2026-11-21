'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('../../hllv_tracker/evidence.js');
const dataset = JSON.parse(fs.readFileSync('hllv_tracker/data/issues.json', 'utf8'));
const source = {type:'patch notes', publisher:'Publisher', title:'Patch notes', url:'https://example.org/patch', date:'2026-09-29', claim:'A particular correction was documented as shipped.'};
const issue = {id:'TEST', sources:[source]};

test('every existing citation renders a scoped assessment without mutation', () => {
  const before = JSON.stringify(dataset);
  assert.ok(dataset.issues.length >= 66);
  assert.equal(new Set(dataset.issues.map(i=>i.id)).size,dataset.issues.length);
  assert.ok(dataset.issues.every(i=>Array.isArray(i.sources)&&i.sources.length>0));
  const urls = new Set();
  let gaps = 0;
  for (const i of dataset.issues) {
    const html = E.renderSources(i, dataset);
    assert.equal((html.match(/class="evidence-source"/g) || []).length, i.sources.length);
    for (const s of i.sources) {
      urls.add(s.url);
      const a = E.assessment(i,s);
      assert.notEqual(a.profile.key, 'unknown', `${i.id}: ${s.type}`);
      assert.ok(a.limit.length > 50);
      assert.equal(a.claim, s.claim);
      assert.equal(a.outcome, null);
      if (a.needsDetail) gaps++;
    }
    assert.match(html, /Does not prove/);
    assert.match(html, /Independent outcome check/);
    assert.doesNotMatch(html, /Invalid Date|undefined/);
  }
  assert.ok(urls.size >= 33);
  assert.ok(Number.isInteger(gaps));
  assert.equal(JSON.stringify(dataset), before);
  console.log(JSON.stringify({issues:dataset.issues.length, references:dataset.issues.reduce((n,i)=>n+i.sources.length,0), distinctURLs:urls.size, claimsNeedingDetail:gaps}));
});
test('source roles stay distinct', () => {
  for (const [type,key] of Object.entries({'patch notes':'release','official update':'official','official known issues':'known','support thread':'support','player report':'player','developer AMA':'ama'})) {
    assert.equal(E.sourceProfile(issue,{...source,type}).key,key);
  }
});
test('unknown type stays unassessed even on an official-looking domain', () => {
  assert.equal(E.sourceProfile(issue,{...source,type:'unclassified',url:'https://www.hellletloose.com/blog/new'}).key,'unknown');
});
test('support developer badge cannot manufacture reproduction', () => {
  const a = E.assessment(issue,{...source,type:'support thread',publisher:'Team17 [developer]'});
  assert.equal(a.profile.key,'support');
  assert.match(a.limit,/not developer reproduction/);
  assert.equal(a.outcome,null);
});
test('player report is not upgraded by publisher text', () => {
  assert.equal(E.sourceProfile(issue,{...source,type:'player report',publisher:'Steam / Team17 Support'}).key,'player');
});
test('future targets inside a release note are explicit plans', () => {
  const a = E.assessment({id:'HLLV-027'},{...source,url:'https://www.hellletloose.com/blog/hllv-patch-1-2'});
  assert.equal(a.profile.key,'plan');
});
test('scheduling VLOG is not proof a fix shipped', () => {
  const a = E.assessment(issue,{...source,url:'https://steamcommunity.com/gid/103582791475269461/announcements/detail/676259427855107286'});
  assert.equal(a.profile.key,'plan');
  assert.match(a.limit,/does not prove the change shipped/);
});
test('recon AMA possible cause stays a hypothesis', () => {
  assert.equal(E.sourceProfile({id:'HLLV-001'},{...source,type:'developer AMA'}).key,'hypothesis');
});
test('topic-only claims get no automatic strong rating', () => {
  for (const claim of ['Documents the issue and stated status.','Server Browser filters','Stability monitoring','']) {
    assert.equal(E.assessment(issue,{...source,claim}).strength,'Claim needs detail');
  }
});
test('specific short claims are not rejected by arbitrary length', () => {
  assert.equal(E.claimNeedsDetail({...source,claim:'VIP reset fix shipped'}),false);
});
test('bad and missing dates are explicit', () => {
  for (const date of [null,undefined,'','yesterday','2026-02-30','2026-13-10']) assert.equal(E.validDate(date),false);
  assert.equal(E.validDate('2026-10-05'),true);
  assert.match(E.dateLabel('2026-10-05'),/Oct 5, 2026/);
  assert.equal(E.dateLabel(null),'Not separately recorded');
});
test('malicious source text is escaped', () => {
  const html=E.renderSource(issue,{...source,title:'<img src=x onerror=alert(1)>',claim:'<script>alert(1)</script>',publisher:'" onclick="alert(1)'});
  assert.doesNotMatch(html,/<script>|<img/);
  assert.match(html,/&lt;script&gt;/);
});
test('unsafe source URL schemes are never linked', () => {
  for (const url of ['javascript:alert(1)','data:text/html,x','//example.org','https://name:password@example.org/','http://example.org']) {
    assert.equal(E.safeURL(url),'');
    assert.match(E.renderSource(issue,{...source,url}),/Link unavailable/);
  }
});
test('references and distinct URLs are not independent confirmations', () => {
  const i={sources:[source,{...source,url:'https://example.org/patch/'},{...source,url:'https://example.org/patch#comment'}]};
  assert.deepEqual(E.counts(i),{references:3,urls:1});
  assert.match(E.renderSources(i,dataset),/not necessarily independent confirmation/);
});
test('review and link dates cannot turn into outcome verification', () => {
  const s={...source,link_checked_at:'2026-10-05',source_reviewed_at:'2026-10-06',verified:true};
  assert.equal(E.outcome(s),null);
  const html=E.renderSource({last_reviewed:'2026-10-06'},s);
  assert.match(html,/accessibility only, not claim validation/);
  assert.match(html,/Independent outcome check:<\/strong> Not recorded/);
});
test('bare or incomplete outcome flags are ignored', () => {
  for (const outcome_verification of [{result:'verified'}, {independent:true,result:'verified',date:'2026-10-06',url:'https://example.org/test',method:'Steps'}]) {
    assert.equal(E.outcome({...source,outcome_verification}),null);
  }
});
test('a fully specified scoped outcome can be represented without closing issue', () => {
  const outcome_verification={independent:true,result:'mixed',date:'2026-10-06',url:'https://example.org/test',method:'Repeat steps on two clients',scope:'Only build X on those clients'};
  const s={...source,outcome_verification};
  assert.equal(E.outcome(s),outcome_verification);
  const html=E.renderSources({sources:[s]},dataset);
  assert.match(html,/Mixed results were recorded/);
  assert.match(html,/not every affected player/);
  assert.match(E.renderSummary({status_key:'investigating',sources:[s]}),/inspect its scope and result/);
});
test('optional outcome rejects unsafe URLs and invalid dates', () => {
  const record={independent:true,result:'verified',date:'2026-02-30',url:'javascript:alert(1)',method:'Steps',scope:'Build X'};
  assert.equal(E.outcome({...source,outcome_verification:record}),null);
});
test('empty issue degrades gracefully', () => {
  assert.match(E.renderSources({},{}),/No sources are recorded/);
  assert.deepEqual(E.counts({}),{references:0,urls:0});
  assert.doesNotMatch(E.renderSummary({}),/undefined/);
});
test('no numeric quality score or refreshed snapshot is introduced', () => {
  assert.ok(E.validDate(dataset.generated_at));
  for(const i of dataset.issues) {
    assert.doesNotMatch(E.renderSources(i,dataset), /\b\d+\s*\/\s*(?:5|10|100)\b|trust score:|confidence score:/i);
  }
});
