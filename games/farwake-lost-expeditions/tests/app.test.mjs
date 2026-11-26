import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHAPTER_ORDER, getChapter } from '../dist/content.mjs';
import { SAVE_KEY, LEGACY_SAVE_KEY } from '../dist/state.mjs';
import { missionStatus } from '../dist/mission.mjs';
import { installDOM } from './dom-fixture.mjs';
import { NightglassAudio } from '../dist/audio.mjs?v=0.4.0';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');

test('real app: select, complete and retain all chapters using the phone task controls',async t=>{
  const {document:doc,localStorage}=installDOM(t,html);
  const modes=[],originalMode=NightglassAudio.prototype.setMode;
  NightglassAudio.prototype.setMode=function(mode){modes.push(mode);return originalMode.call(this,mode);};
  t.after(()=>{NightglassAudio.prototype.setMode=originalMode;});
  await import(`../dist/app.mjs?dom-completion=${Date.now()}`);
  const click=async el=>{assert(el,'control exists');await el.click();};
  const saved=()=>JSON.parse(localStorage.getItem(SAVE_KEY));
  assert.equal(doc.querySelectorAll('[data-chapter]').length,3);
  for(const id of CHAPTER_ORDER){
    await click(doc.querySelector(`[data-chapter="${id}"]`));
    assert.equal(doc.querySelector('#intro-title').textContent,getChapter(id).title);
    await click(doc.querySelector('#begin-button'));
    assert.equal(doc.querySelector('#intro').hidden,true);
    let count=0;
    while(!saved().chapters[id].completed&&count++<100){
      const state=saved().chapters[id],next=missionStatus(state).nextActionId;
      if(doc.querySelector('#panel').open)await click(doc.querySelector('#panel-done'));
      const control=doc.querySelectorAll('[data-action]').find(e=>e.dataset.action===next&&!e.hidden);
      assert(control,`${id}: actual app renders ${next}`);
      await click(control);
    }
    assert.equal(saved().chapters[id].completed,true,id);
    assert.equal(doc.querySelector('#panel').open,true);
    assert.equal(doc.querySelector('#panel-title').textContent,getChapter(id).ending.title);
    assert.equal(doc.querySelector('#panel-done').textContent,'Choose another chapter');
    await click(doc.querySelector('#panel-done'));
    assert.equal(doc.querySelector('#intro').hidden,false);
  }
  assert(CHAPTER_ORDER.every(id=>saved().chapters[id].completed));
  assert(!modes.includes('report'),'last-witness endings never trigger the old victory reprise');
  await click(doc.querySelector('[data-chapter="mars"]'));
  await click(doc.querySelector('#intro-restart'));
  await click(doc.querySelector('[data-panel-action="confirm-restart"]'));
  assert.equal(saved().chapters.mars.completed,false);
  assert.equal(saved().chapters.nightglass.completed,true);
  assert.equal(saved().chapters.outpost.completed,true);
});

test('real app: an old recovery save produces a clear fresh-story notice and retains preferences',async t=>{
  const storage=new Map([[LEGACY_SAVE_KEY,JSON.stringify({version:1,completed:true,scene:'airlock'})],['farwake.lost-expeditions.preferences.v1',JSON.stringify({sound:false,music:false,reducedMotion:true})]]);
  const {document:doc,localStorage}=installDOM(t,html,{storage});
  await import(`../dist/app.mjs?dom-reset=${Date.now()}`);
  assert.equal(doc.querySelector('#save-reset-note').hidden,false);
  assert.match(doc.querySelector('#save-reset-note').textContent,/old recovery save/);
  assert.equal(doc.querySelector('#begin-button').textContent,'Begin chapter');
  assert.match(doc.querySelector('#sound-status').textContent,/Sound off/);
  await doc.querySelector('#begin-button').click();
  const saved=JSON.parse(localStorage.getItem(SAVE_KEY));
  assert.equal(saved.chapters.nightglass.scene,'survey');assert.equal(saved.chapters.nightglass.completed,false);
  assert(localStorage.getItem(LEGACY_SAVE_KEY),'historical data is left unused');
});
