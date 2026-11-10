import { availableCaptains, collectBrowserData, requestCaptainData } from './privacy-data.mjs';

const browserStorage = () => { try { return globalThis.localStorage; } catch { return null; } };
const dateStamp = () => new Date().toISOString().slice(0, 10);

/** Opens the existing game dialog; reports are created only after a download is requested. */
export function openPrivacyData(dialog, {
  serverURL,
  currentPassport = null,
  getStorage = browserStorage,
  download,
  document: doc = globalThis.document,
  fetchImpl,
  collect = collectBrowserData,
  request = requestCaptainData
} = {}) {
  dialog.open('Privacy & data', 'privacy-data', { eyebrow: 'YOUR FARWAKE RECORDS' });
  dialog.html(`<div class="privacy-data">
    <p>See what Farwake keeps and download a readable JSON report. You do not need an email account to play.</p>
    <dl class="privacy-facts">
      <div><dt>Solo play</dt><dd>Your voyage, device preferences and action-tip progress stay in this browser.</dd></div>
      <div><dt>Shared play</dt><dd>The galaxy server saves your captain, progress and the shared-world records needed to continue playing.</dd></div>
      <div><dt>Service records</dt><dd>Render and Supabase can keep operational logs and other service records. These downloads do not include provider logs or backups.</dd></div>
    </dl>
    <section class="privacy-export-section" aria-labelledby="privacyBrowserHeading">
      <h3 id="privacyBrowserHeading">This browser</h3>
      <p>The last saved solo voyage, settings, action-tip profiles, saved captain identifiers and pending camera changes. This covers <strong>this browser profile</strong>, which may have been used by more than one person.</p>
      <p class="mini muted">No server data is included. Private recovery credentials are omitted.</p>
      <button id="privacyBrowserDownload" class="button-secondary" type="button">Download browser data</button>
      <p id="privacyBrowserStatus" class="privacy-export-status" role="status" aria-live="polite"></p>
    </section>
    <section class="privacy-export-section" aria-labelledby="privacyCaptainHeading">
      <h3 id="privacyCaptainHeading">One shared captain</h3>
      <p>Choose the captain whose server records you want. Access is verified using the private passport already on this device. Exporting does not join a galaxy or replace your current session.</p>
      <label class="form-field" for="privacyCaptain"><span>Saved captain</span><select id="privacyCaptain" aria-describedby="privacyCaptainIdentity privacyCaptainHelp"><option value="">Choose a captain</option></select></label>
      <p id="privacyCaptainIdentity" class="privacy-captain-identity"></p>
      <p id="privacyCaptainHelp" class="mini muted"></p>
      <button id="privacyServerDownload" class="button-primary" type="button" disabled>Get captain’s server data</button>
      <p id="privacyServerStatus" class="privacy-export-status" role="status" aria-live="polite"></p>
    </section>
    <p class="privacy-backup-note">These reports let you inspect your information. Keep using <strong>Export / import save</strong> or your private <strong>Captain passport</strong> for recovery.</p>
    <div class="privacy-more"><a href="./privacy.html" target="_blank" rel="noopener noreferrer">How Farwake handles data <span class="mini">(opens in a new tab)</span></a><a href="mailto:chris@holtsnidertech.com?subject=Farwake%20privacy%20request">Ask about access, correction or deletion</a></div>
  </div>`);
  const get = id => doc.getElementById(id);
  const localButton = get('privacyBrowserDownload'), localStatus = get('privacyBrowserStatus');
  const serverButton = get('privacyServerDownload'), serverStatus = get('privacyServerStatus');
  const select = get('privacyCaptain'), identity = get('privacyCaptainIdentity'), help = get('privacyCaptainHelp');
  let choices = [], preparedReport = null;
  try { choices = availableCaptains(getStorage(), currentPassport); }
  catch {
    // A current in-memory passport still authorizes its own report if storage is blocked.
    try { choices = availableCaptains({ getItem: () => null }, currentPassport); } catch { /* No identity is invented. */ }
    help.textContent = 'Saved passports could not be read from this browser. An active captain may still be available below.';
  }
  for (const choice of choices) {
    const option = doc.createElement('option');
    option.value = choice.id;
    option.textContent = `Galaxy ${choice.passport.realmCode} · ${choice.passport.captainId}${choice.current ? ' · current captain' : ''}`;
    select.append(option);
    if (choice.current) select.value = choice.id;
  }
  const selected = () => choices.find(choice => choice.id === select.value);
  const active = () => dialog.opened && dialog.kind === 'privacy-data' && get('privacyServerDownload') === serverButton;
  const updateSelection = () => {
    const choice = selected();
    preparedReport = null;
    serverButton.textContent = 'Get captain’s server data';
    serverButton.disabled = !choice;
    identity.textContent = choice ? `Galaxy: ${choice.passport.realmCode} · Captain: ${choice.passport.captainId}` : '';
    serverStatus.textContent = '';
  };
  if (!help.textContent) help.textContent = choices.length ? 'Only the selected captain is requested. The download excludes private recovery credentials and other captains’ private records.' : 'No shared captain is saved on this device. Restore an existing private captain passport through Crew to request that captain’s records. A galaxy invitation alone does not grant access.';
  select.disabled = choices.length === 0;
  select.onchange = updateSelection;
  updateSelection();

  localButton.onclick = () => {
    localStatus.textContent = '';
    try {
      const report = collect(getStorage());
      download(report, `farwake-browser-data-${dateStamp()}.json`);
      localStatus.textContent = 'Download started. Your browser may ask where to save it. The browser report contains no shared-galaxy server data.';
    } catch (error) {
      localStatus.textContent = error instanceof Error ? error.message : 'The browser report could not be created. Stored data has not been changed.';
    }
  };
  serverButton.onclick = async () => {
    const choice = selected();
    if (!choice || serverButton.disabled) return;
    if (preparedReport?.id === choice.id) {
      try {
        // A separate tap keeps the file save inside a direct user gesture on mobile browsers.
        download(preparedReport.report, preparedReport.filename);
        serverStatus.textContent = 'Download started. Your browser may ask where to save it. The report lists its scope and exclusions. Browser-only records are a separate download.';
      } catch {
        serverStatus.textContent = 'The download could not be started. Tap again to retry; the prepared report is still available here.';
      }
      return;
    }
    serverButton.disabled = true;
    select.disabled = true;
    serverButton.setAttribute('aria-busy', 'true');
    serverStatus.textContent = 'Requesting this captain’s server records…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const report = await request({ serverURL, passport: choice.passport, fetchImpl, signal: controller.signal });
      if (!active()) return;
      preparedReport = { id: choice.id, report, filename: `farwake-captain-data-${choice.passport.realmCode}-${dateStamp()}.json` };
      serverButton.textContent = 'Download captain’s server data';
      serverStatus.textContent = 'Captain report ready. Tap Download captain’s server data to save it. Browser-only records are a separate download.';
    } catch (error) {
      if (active()) serverStatus.textContent = error instanceof Error ? error.message : 'The server report could not be retrieved. No server data report was downloaded.';
    } finally {
      clearTimeout(timeout);
      if (active()) {
        serverButton.disabled = false;
        select.disabled = false;
        serverButton.setAttribute('aria-busy', 'false');
      }
    }
  };
}
