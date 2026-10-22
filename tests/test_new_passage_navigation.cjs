/* Exercise view changes, deep links, and real browser-history events in jsdom.
   These checks deliberately do not claim to measure pixel layout. */
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2], 'utf8');
let passed = 0;
async function test(label, check) { await check(); passed += 1; console.log(`PASS: ${label}`); }
function make(hash = '', scripts = true) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {url: `https://new-passage.example/${hash}`, runScripts: scripts ? 'dangerously' : undefined, virtualConsole});
  assert.deepEqual(errors, []);
  return dom;
}
const visible = d => [...d.querySelectorAll('[data-page]')].filter(node => !node.hidden).map(node => node.dataset.page);
const click = (d, href) => d.querySelector(`a[href="${href}"]`).click();
function traverse(w, direction) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser-history navigation did not complete')), 1000);
    w.addEventListener('popstate', () => setTimeout(() => { clearTimeout(timer); resolve(); }, 0), {once:true});
    w.history[direction]();
  });
}
(async () => {
  await test('First visit presents only the introduction and a genuine booking link', () => {
    const dom = make(); const d = dom.window.document;
    assert.deepEqual(visible(d), ['home']);
    assert.equal(d.getElementById('practice').hidden, true);
    assert.equal(d.querySelector('.yp-hero .yp-button').href, 'https://calendly.com/tim-mypassages');
    assert.equal(d.querySelector('[data-nav-page="home"]').getAttribute('href'), '#starting-point');
    dom.window.close();
  });
  await test('Navigation changes view, URL, title, current link, and keyboard focus together', () => {
    const dom = make(); const w = dom.window; const d = w.document;
    click(d, '#approach');
    assert.deepEqual(visible(d), ['coaching']);
    assert.equal(w.location.hash, '#approach');
    assert.equal(d.title, 'Services | New Passage');
    assert.equal(d.activeElement.id, 'yp-approach-heading');
    assert.equal(d.querySelector('[aria-current="page"]').getAttribute('href'), '#approach');
    d.querySelector('[data-audience="parent"]').click();
    assert.equal(d.getElementById('parents').hidden, false);
    assert.equal(d.getElementById('individual').hidden, true);
    assert.match(d.getElementById('yp-audience-link').textContent, /student/);
    dom.window.close();
  });
  await test('Home conversation choices stay on the landing screen without changing practice or saving data', () => {
    const dom = make(); const w = dom.window; const d = w.document;
    const topic = d.getElementById('yp-topic').value;
    const question = d.getElementById('np-example-question');
    const initial = question.textContent;
    const interview = d.querySelector('[data-conversation="interview"]');
    interview.focus(); interview.click();
    assert.notEqual(question.textContent, initial);
    assert.match(question.textContent, /interviewer/);
    assert.deepEqual(visible(d), ['home']);
    assert.equal(d.activeElement, interview);
    assert.equal(w.location.hash, '');
    assert.equal(d.querySelectorAll('[data-conversation][aria-pressed="true"]').length, 1);
    assert.equal(d.getElementById('yp-topic').value, topic);
    assert.equal(w.localStorage.length, 0);
    click(d, '#tim'); click(d, '#starting-point');
    assert.match(question.textContent, /interviewer/);
    d.querySelector('[data-conversation="confidence"]').click();
    assert.match(question.textContent, /find the words/);
    d.querySelector('[data-conversation="direction"]').click();
    assert.equal(question.textContent, initial);
    dom.window.close();
  });
  await test('Parent and school entrances reach the selected service and booking without practice', () => {
    const dom = make(); const d = dom.window.document;
    for (const id of ['parents', 'schools']) {
      d.querySelector(`.np-home-paths a[href="#${id}"]`).click();
      assert.deepEqual(visible(d), ['coaching']);
      assert.equal(d.getElementById(id).hidden, false);
      assert.equal(d.getElementById('yp-audience-link').href, 'https://calendly.com/tim-mypassages');
      click(d, '#starting-point');
    }
    dom.window.close();
  });
  await test('Old audience, notebook, and practice-stage links open the correct content directly', () => {
    for (const [hash, page, id] of [['#parents','coaching','parents'], ['#schools','coaching','schools'], ['#groups','coaching','individual'], ['#notebook','practice','notebook'], ['#yp-panel-try','practice','yp-panel-try']]) {
      const dom = make(hash); const d = dom.window.document;
      assert.deepEqual(visible(d), [page]);
      assert.equal(d.getElementById(id).hidden, false);
      if (page === 'practice') assert.equal(d.getElementById('yp-practice-explorer').open, true);
      if (id === 'notebook') assert.equal(d.getElementById(id).open, true);
      dom.window.close();
    }
    const unknown = make('#%E0%A4%A');
    assert.deepEqual(visible(unknown.window.document), ['home']);
    unknown.window.close();
  });
  await test('A practice draft survives leaving and returning without being silently saved', () => {
    const dom = make('#practice'); const w = dom.window; const d = w.document;
    d.getElementById('yp-tab-try').click();
    const plan = d.getElementById('yp-plan'); plan.value = 'Ask for a practice interview.';
    plan.dispatchEvent(new w.Event('input'));
    click(d, '#tim'); click(d, '#practice');
    assert.equal(plan.value, 'Ask for a practice interview.');
    assert.equal(d.getElementById('yp-panel-try').hidden, false);
    assert.equal(w.localStorage.length, 0);
    dom.window.close();
  });
  await test('Repeated Back and Forward navigation keeps the correct screen visible', async () => {
    const dom = make(); const w = dom.window; const d = w.document;
    click(d, '#tim'); await traverse(w, 'back');
    assert.deepEqual(visible(d), ['home']);
    click(d, '#approach'); await traverse(w, 'back');
    assert.deepEqual(visible(d), ['home']);
    await traverse(w, 'forward'); assert.deepEqual(visible(d), ['coaching']);
    assert.equal(d.activeElement.id, 'yp-approach-heading');
    dom.window.close();
  });
  await test('Home navigation leaves focus view and makes marketing reachable again', () => {
    const dom = make('#practice'); const d = dom.window.document;
    d.getElementById('yp-start-practice').click();
    assert.equal(d.getElementById('yp').classList.contains('yp-focus'), true);
    d.querySelector('.yp-brand').click();
    assert.equal(d.getElementById('yp').classList.contains('yp-focus'), false);
    assert.deepEqual(visible(d), ['home']);
    assert.equal(d.getElementById('yp-exit-focus').hidden, true);
    // Home also returns a visitor to the top when the home view is already open.
    d.documentElement.scrollTop = 500;
    d.querySelector('[data-nav-page="home"]').click();
    assert.equal(d.documentElement.scrollTop, 0);
    dom.window.close();
  });
  await test('Without JavaScript, coaching content and real booking links stay available', () => {
    const dom = make('', false); const d = dom.window.document;
    assert.equal(visible(d).length, 7);
    assert.equal(d.querySelectorAll('[data-audience-panel][hidden]').length, 0);
    assert.ok(d.querySelectorAll('a[href="https://calendly.com/tim-mypassages"]').length >= 4);
    dom.window.close();
  });
  console.log(`${passed} navigation checks passed. DOM checks do not verify visual layout.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
