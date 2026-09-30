/* Behavioral smoke test. Run against a local Flask server, never a user's workspace. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const url = process.env.METAL_BAND_TEST_URL || 'http://127.0.0.1:5055/?theme=metal_band';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use a local test server.');
const key = 'dfe.metal_band.workspace.v1';

(async () => {
  const out = process.env.METAL_BAND_QA_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'first-riff-'));
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    const go = async view => page.locator(`[data-view="${view}"]`).click();
    const field = (form, name) => page.locator(`#mb-${form}-form [name="${name}"]`);
    const save = async form => page.locator(`#mb-${form}-form button[type="submit"]`).click();
    const readState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const download = async button => {
      const result = page.waitForEvent('download'); await page.locator(button).click();
      const d = await result, file = path.join(out, d.suggestedFilename());
      await d.saveAs(file); return fs.readFile(file, 'utf8');
    };
    await page.goto(url);
    await page.screenshot({ path: path.join(out, 'desktop-start.png'), fullPage: true });
    assert.equal(await page.locator('#mb-song-count').textContent(), '0');
    await page.locator('[data-step="direction"]').check();
    await go('band');
    for (const [name, value] of Object.entries({ name: 'Iron Meridian', genre: 'Groove metal', location: 'Boston, MA', email: 'booking@example.com', tagline: 'Heavy riffs. No wasted motion.', bio: 'A test band for browser verification.' })) await field('profile', name).fill(value);
    await save('profile');
    await field('member', 'name').fill('Morgan'); await field('member', 'role').fill('Guitar & vocals'); await save('member');
    await page.locator('[data-edit="member"]').click(); await field('member', 'role').fill('Lead guitar & vocals'); await save('member');
    assert.equal((await readState()).members.length, 1);
    assert.equal((await readState()).members[0].role, 'Lead guitar & vocals');
    await go('music');
    await field('song', 'title').fill('Fracture & Flame'); await field('song', 'duration').fill('3:30'); await field('song', 'tuning').fill('Drop D'); await field('song', 'bpm').fill('124');
    await field('song', 'url').fill('https://example.com/demo'); await field('song', 'notes').fill('PRIVATE-REHEARSAL-NOTE');
    await field('song', 'inSet').check(); await field('song', 'published').check(); await save('song');
    await field('song', 'title').fill('Private unfinished song'); await field('song', 'duration').fill('4:00'); await field('song', 'inSet').check(); await save('song');
    assert.equal(await page.locator('#mb-set-summary').textContent(), 'Set: 7:50');
    await page.locator('#mb-gap').fill('30'); await page.locator('#mb-gap').blur();
    assert.equal(await page.locator('#mb-set-summary').textContent(), 'Set: 8:00');
    await page.locator('[data-move="1"]').first().click();
    assert.equal((await readState()).songs[0].title, 'Private unfinished song');
    await page.locator('[data-in-set]').first().uncheck();
    assert.equal(await page.locator('#mb-set-summary').textContent(), 'Set: 3:30');
    await page.locator('[data-in-set]').first().check();
    assert.match(await download('#mb-download-set'), /Runtime: 8:00/);
    await go('shows');
    for (const [venue, date, status] of [['Future confirmed venue', '2099-10-01', 'confirmed'], ['Unconfirmed venue', '2099-10-02', 'idea'], ['Past venue', '2020-01-01', 'confirmed']]) {
      await field('show', 'venue').fill(venue); await field('show', 'city').fill('Boston'); await field('show', 'date').fill(date); await field('show', 'status').selectOption(status); await field('show', 'notes').fill('PRIVATE-GIG-NOTE'); await save('show');
    }
    await go('share');
    const publicHTML = await download('#mb-download-page');
    for (const text of ['Iron Meridian', 'Fracture &amp; Flame', 'Future confirmed venue', 'Morgan']) assert(publicHTML.includes(text));
    for (const text of ['PRIVATE-REHEARSAL-NOTE', 'PRIVATE-GIG-NOTE', 'Private unfinished song', 'Unconfirmed venue', 'Past venue', '<script']) assert(!publicHTML.includes(text), `Leaked into public page: ${text}`);
    const backup = JSON.parse(await download('#mb-export'));
    assert(backup.songs.some(s => s.notes === 'PRIVATE-REHEARSAL-NOTE'));
    await page.reload();
    assert.deepEqual(await readState(), backup);
    assert.equal(await field('profile', 'name').inputValue(), 'Iron Meridian');
    await page.screenshot({ path: path.join(out, 'desktop-band-page.png'), fullPage: true });
    const invalid = JSON.parse(JSON.stringify(backup)); invalid.songs[0].url = 'javascript:alert(1)';
    const importData = data => page.locator('#mb-import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await importData(invalid);
    await page.waitForFunction(() => document.querySelector('#mb-status').textContent.startsWith('Import failed:'));
    assert.deepEqual(await readState(), backup);
    const restored = JSON.parse(JSON.stringify(backup)); restored.profile.name = 'Restored band'; restored.profile.bio = '<img src=x onerror="alert(1)">';
    await importData(restored);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).profile.name === 'Restored band', key);
    assert.equal(await field('profile', 'name').inputValue(), 'Restored band');
    const safe = await download('#mb-download-page');
    assert(safe.includes('&lt;img src=x onerror=')); assert(!safe.includes('<img'));
    await importData(backup);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).profile.name === 'Iron Meridian', key);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ['start', 'band', 'music', 'shows', 'share']) {
        await go(view);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} overflows at ${width}px`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await go('start');
    await page.screenshot({ path: path.join(out, 'mobile-start.png'), fullPage: true });
    await go('music'); await page.screenshot({ path: path.join(out, 'mobile-music.png'), fullPage: true });
    await go('band');
    await page.locator('[data-delete="member"]').click();
    assert.equal((await readState()).members.length, 0);
    assert.deepEqual(errors, []);

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'QuotaExceededError'); }; });
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(url + '#band');
    await blockedPage.locator('#mb-profile-form [name="name"]').fill('Unsaved band');
    await blockedPage.locator('#mb-profile-form button[type="submit"]').click();
    assert.equal(await blockedPage.locator('#mb-save-state').textContent(), 'Changes are not saved');
    assert(await blockedPage.locator('#mb-storage-warning').isVisible());
    const corrupt = await browser.newContext();
    await corrupt.addInitScript(key => localStorage.setItem(key, '{not-json'), key);
    const corruptPage = await corrupt.newPage(); await corruptPage.goto(url);
    assert(await corruptPage.getByRole('button', { name: 'Export recovery copy' }).isVisible());
    assert.equal(await corruptPage.evaluate(key => localStorage.getItem(key), key), '{not-json');
    console.log('PASS: editing, setlist timing/order, persistence, import/export, public/private separation, escaping, mobile overflow, storage failure and recovery.');
    console.log(`QA output: ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
