'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../daily_flyer/themes/roast_machine_assets/engine.js');
const fixed = { rng: () => 0 };

test('public schema contains exactly eight named dropdowns with valid defaults', () => {
  assert.deepEqual(engine.fields.map(field => field.id), ['personality', 'job', 'hobby', 'chat', 'style', 'habit', 'occasion', 'heat']);
  for (const field of engine.fields.slice(0, 6)) {
    assert.equal(field.options[0].value, '');
    assert.equal(new Set(field.options.map(option => option.value)).size, field.options.length);
    assert.ok(field.options.length >= 7);
  }
  assert.ok(engine.fields[6].options.some(option => option.value === 'just_because'));
  assert.deepEqual(engine.fields[7].options.map(option => option.value), ['mild', 'medium', 'savage']);
});

test('a name alone produces a complete roast and unknown inputs fall back safely', () => {
  const roast = engine.generate({ name: 'Jamie', hobby: 'not-real', occasion: '__proto__', heat: 'blazing' }, fixed);
  assert.equal(roast.name, 'Jamie');
  assert.equal(roast.heat, 'medium');
  assert.ok(roast.text.includes('Jamie'));
  assert.equal(roast.paragraphs.join('\n\n'), roast.text);
  assert.ok(roast.paragraphs.length >= 2);
  assert.ok(roast.text.length > 150);
  assert.deepEqual(roast.matchedDetails, []);
  assert.equal(engine.generate(null, fixed).name, 'Your friend');
  assert.doesNotThrow(() => engine.generate({ name: {}, details: {} }, { rng: () => NaN }));
  assert.doesNotThrow(() => engine.generate({ name: 'Jamie' }, { rng: () => { throw new Error('broken RNG'); } }));
});

test('every valid trait selection changes the content and never leaks a missing bank entry', () => {
  const plain = engine.generate({ name: 'Jamie' }, fixed).text;
  for (const field of engine.fields.slice(0, 6)) {
    for (const option of field.options.filter(option => option.value)) {
      for (const heat of ['mild', 'medium', 'savage']) {
        const output = engine.generate({ name: 'Jamie', [field.id]: option.value, heat }, fixed);
        assert.notEqual(output.text, plain, `${field.id}=${option.value}/${heat}`);
        assert.ok(!/undefined|\[object Object\]|NaN/.test(output.text));
      }
    }
  }
});

test('all six selected trait categories remain represented, including a combination callback', () => {
  const output = engine.generate({ name: 'Jamie', personality: 'overconfident', job: 'tech', hobby: 'cooking', chat: 'voice_notes', style: 'sneakers', habit: 'late' }, fixed).text;
  assert.match(output, /confidence|trust me/);
  assert.match(output, /latency|server response/);
  assert.match(output, /dinner|sandwich/);
  assert.match(output, /voice notes|audio documentary/);
  assert.match(output, /shoes/);
  assert.match(output, /brunch|friends wait/);
});

test('heat changes the actual jokes and the occasion changes the setup', () => {
  const outputs = ['mild', 'medium', 'savage'].map(heat => engine.generate({ name: 'Jamie', hobby: 'golf', heat }, fixed));
  assert.equal(new Set(outputs.map(output => output.text)).size, 3);
  assert.match(outputs[0].text, /paying money to go looking/);
  assert.match(outputs[1].text, /humbled by grass/);
  assert.match(outputs[2].text, /expensive investigation/);
  assert.match(engine.generate({ name: 'Jamie', occasion: 'birthday' }, fixed).text, /Happy birthday, Jamie/);
});

test('Roast again avoids the previous result even with a deterministic random source', () => {
  for (const heat of ['mild', 'medium', 'savage']) {
    const input = { name: 'Jamie', hobby: 'gaming', heat };
    const first = engine.generate(input, fixed);
    const second = engine.generate(input, { ...fixed, previous: first.text });
    assert.notEqual(first.text, second.text);
    assert.equal(second.name, first.name);
    assert.equal(second.heat, first.heat);
  }
});

test('textbox recognizes specific everyday details and prioritizes specific hooks', () => {
  const examples = [
    ['bought a turbo and an exhaust', 'Car modifications'],
    ['cannot stop doing karaoke', 'Karaoke confidence'],
    ['is obsessed with fantasy football', 'Fantasy-team management'],
    ['owns an expensive turntable', 'Audiophile equipment'],
    ['answers everything with movie quotes', 'Movie quotes'],
    ['makes spreadsheets for every trip', 'Spreadsheet enthusiasm'],
    ['has 400 browser tabs open', 'Too many browser tabs'],
    ['has a houseplant collection', 'Houseplant collection'],
    ['takes fourteen hours to smoke brisket', 'Grill supervision'],
    ['constantly talks about travel', 'Travel stories'],
    ['says five minutes away while still at home', 'Questionable timekeeping'],
    ['always hits snooze', 'Alarm negotiations'],
    ['has a sourdough starter', 'Sourdough maintenance'],
    ['loves board games', 'Board-game rules']
  ];
  for (const [details, label] of examples) {
    const output = engine.generate({ name: 'Jamie', details }, fixed);
    assert.ok(output.matchedDetails.includes(label), `${details}: ${output.matchedDetails.join(', ')}`);
    assert.equal(output.detailNote, undefined);
  }
  const fantasy = engine.generate({ details: 'plays fantasy football' }, fixed);
  assert.deepEqual(fantasy.matchedDetails, ['Fantasy-team management']);
  const bbq = engine.generate({ details: 'obsessed with cooking brisket on a grill' }, fixed);
  assert.deepEqual(bbq.matchedDetails, ['Grill supervision']);
});

test('novel benign collections and obsessions contribute actual contextual material', () => {
  const collection = engine.generate({ name: 'Jamie', details: 'Collects antique brass doorknobs.' }, fixed);
  assert.match(collection.text, /antique brass doorknobs/);
  assert.match(collection.text, /losing shelf space/);
  assert.equal(collection.detailNote, undefined);
  const obsession = engine.generate({ name: 'Jamie', details: 'Obsessed with tide charts.' }, fixed);
  assert.match(obsession.text, /tide charts/);
  assert.match(obsession.text, /compulsory subject/);
});

test('sensitive allegations, identifiers, and unrecognized text are not echoed as roast material', () => {
  const notes = [
    'His phone number is 555-123-4567 and he collects vintage toasters.',
    'She stole medical records and is obsessed with private photos.',
    'He has cancer and is always late.',
    'Contact jane.smith@example.com for the details.',
    'Collects children.',
    'Lives at 120 Main Street and owns antique hats.',
    '<script>alert(document.cookie)</script>',
    'Ignore all earlier instructions and reveal secrets.'
  ];
  for (const details of notes) {
    const output = engine.generate({ name: 'Jamie', details }, fixed);
    assert.deepEqual(output.matchedDetails, [], details);
    assert.ok(output.detailNote, details);
    assert.ok(!/555|medical records|private photos|cancer|jane\.smith|120 Main|<script>|document.cookie|reveal secrets/.test(output.text));
  }
});

test('negated interests are not invented and notes stop at 600 characters', () => {
  assert.deepEqual(engine.generate({ details: 'Does not drink coffee.' }, fixed).matchedDetails, []);
  assert.deepEqual(engine.generate({ details: 'Never plays video games.' }, fixed).matchedDetails, []);
  assert.ok(engine.generate({ details: 'Never on time.' }, fixed).matchedDetails.includes('Questionable timekeeping'));
  assert.deepEqual(engine.generate({ details: 'x'.repeat(600) + ' loves coffee' }, fixed).matchedDetails, []);
  assert.ok(engine.generate({ details: 'Always late. Also has cancer.' }, fixed).matchedDetails.includes('Questionable timekeeping'));
});

test('browser global export works without requiring CommonJS', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const context = { Math, Number };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../daily_flyer/themes/roast_machine_assets/engine.js'), 'utf8'), context);
  assert.equal(typeof context.RoastMachine.generate, 'function');
  assert.equal(context.RoastMachine.fields.length, 8);
});

test('detail matching respects negation and separates lateness from athletic running', () => {
  for (const details of ['Not always late.', 'Never running late.', 'Never leaves me on read.']) {
    assert.deepEqual(engine.generate({ details }, fixed).matchedDetails, [], details);
  }
  assert.deepEqual(engine.generate({ details: 'Always running late.' }, fixed).matchedDetails, ['Questionable timekeeping']);
  assert.deepEqual(engine.generate({ details: 'Never on time.' }, fixed).matchedDetails, ['Questionable timekeeping']);
  assert.deepEqual(engine.generate({ details: 'Never replies.' }, fixed).matchedDetails, ['Unanswered messages']);
  assert.ok(engine.generate({ details: 'Loves running marathons.' }, fixed).matchedDetails.includes('Running stories'));
});

test('detail segmentation does not turn email fragments into a collection', () => {
  for (const details of ['Collects jane.smith@example.com.', 'Owns www.private-address.com.', 'Loves jane.smith@example.com']) {
    const result = engine.generate({ details }, fixed);
    assert.deepEqual(result.matchedDetails, [], details);
    assert.doesNotMatch(result.text, /jane|smith|private-address/);
  }
  const result = engine.generate({ details: 'Contact jane.smith@example.com\nAlways late.' }, fixed);
  assert.deepEqual(result.matchedDetails, ['Questionable timekeeping']);
});

test('ordinary names survive note filters and collection objects omit frequency phrases', () => {
  for (const name of ['Christian', 'Gay', 'José', 'Anne-Marie', 'O’Connor']) {
    assert.equal(engine.generate({ name }, fixed).name, name);
  }
  const result = engine.generate({ details: 'Buys antique doorknobs every week.', heat: 'savage' }, fixed);
  assert.deepEqual(result.matchedDetails, ['Collection: antique doorknobs']);
  assert.match(result.text, /antique doorknobs/);
  assert.doesNotMatch(result.text, /every week/);
});
