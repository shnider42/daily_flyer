(() => {
  'use strict';

  const main = document.getElementById('main');
  const EVENT_SLUG = 'networking-night';
  const interestLabels = {
    network: 'Meet more alumni',
    committee: 'Explore a committee',
    volunteer: 'Volunteer for a project',
    mentor: 'Share a skill or mentor',
    event: 'Help with an event',
    idea: 'Bring an idea to LMW'
  };
  const availabilityLabels = {one_time: 'A one-time opportunity', occasional: 'An occasional invitation', ongoing: 'Something ongoing', unsure: 'Still figuring it out'};
  const engagementLabels = {yes: 'Yes, I’d like to get involved', maybe: 'Maybe—show me what’s involved', not_now: 'Not right now'};
  const statusLabels = {new: 'New', planned: 'Follow-up planned', connected: 'Connected', closed: 'Closed'};
  const emptyData = () => ({first_name:'', last_name:'', graduate_year:'', email:'', phone:'', current_employer:'', engagement:'', interests:[], availability:'', help_needed:'', contact_permission:'', phone_permission:false, privacy_consent:false});
  const state = {
    data: emptyData(), step: 0, event: {slug: EVENT_SLUG, title:'LMW networking night', is_open:true}, eventLoaded:false,
    manage:null, editing:false, submission:null, organizerKey:'', organizerMode:'locked', records:[], demoRecords:null,
    filters:{search:'', interest:'', status:'', permission:''}, busy:false, view:'preferences', organizerRevision:0, routeRevision:0
  };
  let toastTimer;
  let lastRoutedUrl = '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const checked = (value) => value ? ' checked' : '';
  const selected = (a,b) => a === b ? ' selected' : '';
  const apiUrl = () => window.LMW_CONFIG?.apiUrl || '';
  const eventUrl = () => `${location.origin}/?event=${EVENT_SLUG}`;
  const managementUrl = () => state.manage ? `${location.origin}/#manage=${state.manage.token}&id=${state.manage.id}` : '';
  const isOrganizerPath = () => /^\/organizer\/?$/.test(location.pathname);
  const yearLabel = (value) => value === 'current' ? 'Current participant' : value === 'unknown' ? 'Year not specified' : `Class of ${value}`;
  const recordData = (record) => ({...record, ...(record.data || {})});
  const organizerSession = () => ({key:state.organizerKey, revision:state.organizerRevision, route:state.routeRevision, mode:state.organizerMode});
  const sameOrganizerSession = session => session.key===state.organizerKey && session.revision===state.organizerRevision && session.route===state.routeRevision && session.mode===state.organizerMode;

  function notify(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  async function copy(text, fallback) {
    try {
      await navigator.clipboard.writeText(text);
      notify('Link copied.');
    } catch (_) {
      if (fallback) { fallback.focus(); fallback.select(); }
      notify('Select and copy the link shown here.');
    }
  }

  async function api(action, payload = {}, organizer = false) {
    if (!apiUrl()) throw new Error('The response service is not connected yet. Nothing has been saved.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    try {
      const headers = {'Content-Type':'application/json'};
      if (organizer) headers['X-LMW-Organizer-Key'] = state.organizerKey;
      const response = await fetch(apiUrl(), {method:'POST',headers,body:JSON.stringify({action,...payload}),signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'});
      let body;
      try { body = await response.json(); } catch (_) { throw new Error('The response service could not be reached. Please try again.'); }
      if (!response.ok || body.error || body.ok === false) {
        const message = typeof body.error === 'string' ? body.error : body.error?.message || body.message;
        throw new Error(message || 'That could not be saved. Please try again.');
      }
      return body;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The connection took too long. Your answers are still here—please try again.');
      if (error instanceof TypeError) throw new Error('Unable to connect. Check your connection and try again; your answers are still here.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function loadEvent() {
    if (!apiUrl()) return;
    try {
      const response = await fetch(`${apiUrl()}?event=${EVENT_SLUG}`, {cache:'no-store',referrerPolicy:'no-referrer'});
      if (!response.ok) return;
      const body = await response.json();
      if (body.event) state.event = {...state.event,...body.event};
      state.eventLoaded = true;
      document.querySelectorAll('[data-event-title]').forEach(node => { node.textContent = state.event.title; });
      syncClosedEvent();
    } catch (_) { /* Submission provides a clear retryable error if the service remains unavailable. */ }
  }

  function syncClosedEvent() {
    const banner = document.getElementById('event-closed');
    if (banner) banner.hidden = state.event.is_open !== false || state.editing;
    const submit = document.getElementById('save-preferences');
    if (submit && !state.editing) submit.disabled = state.event.is_open === false;
  }

  function setNav(view) {
    state.view = view;
    const organizerPage = isOrganizerPath();
    document.body.dataset.page = organizerPage ? 'organizer' : 'attendee';
    document.getElementById('organizer-navigation').hidden = !organizerPage;
    document.getElementById('portal-label').textContent = organizerPage ? 'Organizer workspace' : 'Alumni connections';
    document.getElementById('organizer-access-link').hidden = organizerPage;
    document.title = organizerPage ? 'Organizer workspace · Leadership MetroWest' : view === 'privacy' ? 'Privacy & your choices · LMW pilot' : 'Keep the connection going · Leadership MetroWest';
    document.querySelectorAll('[data-nav]').forEach(link => {
      const current = link.dataset.nav === view || (view === 'organizer-gate' && link.dataset.nav === 'organizer');
      link.classList.toggle('active', current);
      if (current) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
  }

  function intro() {
    return `<aside class="intro"><p class="eyebrow" data-event-title>${esc(state.event.title)}</p><h1>Keep the <br>connection <br>going<span class="accent">.</span></h1><p class="lead">A useful introduction. A chance to lend a hand. A community you can turn to.</p><p class="mobile-intro-note">About a minute. No account needed.</p><hr class="intro-rule"><h2 class="why-heading">What would make LMW useful to you?</h2><ul class="quiet-list"><li>Meet someone with a shared interest.</li><li>Find a way to help that fits your life.</li><li>Tell this community what you need.</li></ul><p class="intro-note">An interest is a starting point. You choose what happens next.</p></aside>`;
  }

  function stepper() {
    return `<ol class="stepper" aria-label="Your progress">${['About you','Get involved','Stay in touch'].map((name,i) => `<li class="${i===state.step?'current':i<state.step?'done':''}"${i===state.step?' aria-current="step"':''}>${name}</li>`).join('')}</ol>`;
  }

  function years() {
    let options = '<option value="">Choose your year</option>';
    options += `<option value="current"${selected(state.data.graduate_year,'current')}>Current participant</option><option value="unknown"${selected(state.data.graduate_year,'unknown')}>Not sure</option>`;
    for (let year = new Date().getFullYear(); year >= 1987; year--) options += `<option value="${year}"${selected(String(state.data.graduate_year),String(year))}>${year}</option>`;
    return options;
  }

  function firstStep() {
    const d = state.data;
    return `<p class="step-count">Step 1 of 3</p><h2 id="form-heading">A little about you.</h2><p class="form-help">Four details to start. Phone and employer are optional.</p>
      <div class="field-grid">
        <div class="field"><label for="first_name">First name</label><input id="first_name" name="first_name" autocomplete="given-name" maxlength="80" required value="${esc(d.first_name)}"></div>
        <div class="field"><label for="last_name">Last name</label><input id="last_name" name="last_name" autocomplete="family-name" maxlength="80" required value="${esc(d.last_name)}"></div>
        <div class="field full"><label for="graduate_year">LMW graduate year</label><select id="graduate_year" name="graduate_year" required>${years()}</select></div>
        <div class="field full"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" required value="${esc(d.email)}"><p class="hint">Sharing your email doesn’t sign you up for anything.</p></div>
      </div>
      <details class="optional-details"${d.phone || d.current_employer ? ' open':''}><summary>Add phone or employer <span class="optional">optional</span></summary><div class="field-grid">
        <div class="field full"><label for="phone">Phone <span class="optional">optional</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" value="${esc(d.phone)}"><p class="hint">A number alone is not permission to call you.</p></div>
        <div class="field full"><label for="current_employer">Current employer <span class="optional">optional</span></label><input id="current_employer" name="current_employer" autocomplete="organization" maxlength="150" value="${esc(d.current_employer)}"><p class="hint">An organization, your own business, or leave this blank.</p></div>
      </div></details>
      <div class="honeypot" aria-hidden="true"><label for="website">Leave this blank</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="form-actions"><p class="small-note">Your details stay out of any public directory.</p><button type="submit" class="primary">Continue</button></div>`;
  }

  function secondStep() {
    const d = state.data;
    return `<p class="step-count">Step 2 of 3</p><h2 id="form-heading">What interests you?</h2><p class="form-help">A conversation counts. So does helping once.</p>
      <fieldset class="choice-group"><legend>Are you willing to be more engaged in LMW?</legend><div class="choice-stack">
      ${Object.entries(engagementLabels).map(([value,label]) => `<label class="choice"><input type="radio" name="engagement" value="${value}" required${checked(d.engagement===value)}><span class="choice-copy">${esc(label)}${value==='not_now'?'<small>It’s fine to simply stay connected.</small>':''}</span></label>`).join('')}</div></fieldset>
      <div id="interest-section" class="interest-section"${d.engagement==='not_now'?' hidden':''}>
        <fieldset class="choice-group"><legend>What sounds interesting? <span class="optional">optional</span></legend><p class="hint">Pick any. This is an interest, not a commitment.</p><div class="choices-grid">
        ${Object.entries(interestLabels).map(([value,label]) => `<label class="choice"><input type="checkbox" name="interests" value="${value}"${checked(d.interests.includes(value))}><span>${esc(label)}</span></label>`).join('')}</div></fieldset>
        <div class="field"><label for="availability">What fits your schedule? <span class="optional">optional</span></label><select id="availability" name="availability"><option value="">No preference yet</option>${Object.entries(availabilityLabels).map(([value,label]) => `<option value="${value}"${selected(d.availability,value)}>${esc(label)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="help_needed">What could this community help you with? <span class="optional">optional</span></label><textarea id="help_needed" name="help_needed" maxlength="700" placeholder="A connection, an idea, something you’d like to learn…">${esc(d.help_needed)}</textarea><p class="hint">A sentence is plenty. Please leave out sensitive personal information.</p></div>
      <div class="form-actions"><button type="button" id="back" class="quiet">Back</button><button type="submit" class="primary">Continue</button></div>`;
  }

  function thirdStep() {
    const d = state.data;
    return `<p class="step-count">Step 3 of 3</p><h2 id="form-heading">You set the pace.</h2><p class="form-help">Choose what happens after you leave. There’s no automatic newsletter sign-up.</p>
      <fieldset class="choice-group"><legend>May an organizer follow up about what you shared?</legend><div class="choice-stack">
        <label class="choice"><input type="radio" name="contact_permission" value="email" required${checked(d.contact_permission==='email')}><span class="choice-copy">Yes, a personal email is welcome.<small>About my interests or the help I asked for.</small></span></label>
        <label class="choice"><input type="radio" name="contact_permission" value="none" required${checked(d.contact_permission==='none')}><span class="choice-copy">No follow-up for now.<small>Save my preferences without contacting me.</small></span></label>
      </div></fieldset>
      ${d.phone ? `<div id="phone-permission-wrap"${d.contact_permission==='none'?' hidden':''}><label class="check-consent"><input type="checkbox" name="phone_permission"${checked(d.phone_permission)}><span>An organizer may also call me about what I shared. <span class="optional">optional</span></span></label><p class="hint">This does not give permission for text messages.</p></div>`:''}
      <div class="privacy-brief"><p><strong>Your preferences are private.</strong> This independent pilot stores your answers for the pilot organizer. Your contact details are not shown to other attendees.</p><p>Preferences expire 90 days after your last save. You’ll get a private link to update or delete them. <a href="/#privacy" data-app-route>Read how this pilot handles your information.</a></p></div>
      <label class="check-consent"><input type="checkbox" name="privacy_consent" required${checked(d.privacy_consent)}><span>I agree to the storage and use of these details as described above, with only the follow-up I selected.</span></label>
      <div class="form-actions"><button type="button" id="back" class="quiet">Back</button><button type="submit" id="save-preferences" class="primary">${state.editing?'Save changes':'Save my preferences'}</button></div>`;
  }

  function captureForm() {
    const form = document.getElementById('preferences-form');
    if (!form) return;
    const data = new FormData(form);
    if (state.step === 0) {
      for (const key of ['first_name','last_name','graduate_year','email','phone','current_employer']) state.data[key] = String(data.get(key) || '').trim();
      if (!state.data.phone) state.data.phone_permission = false;
      state.website = String(data.get('website') || '');
    } else if (state.step === 1) {
      state.data.engagement = String(data.get('engagement') || '');
      state.data.interests = state.data.engagement==='not_now' ? [] : data.getAll('interests');
      state.data.availability = state.data.engagement==='not_now' ? '' : String(data.get('availability') || '');
      state.data.help_needed = String(data.get('help_needed') || '').trim();
    } else {
      state.data.contact_permission = String(data.get('contact_permission') || '');
      state.data.phone_permission = state.data.contact_permission === 'email' && !!state.data.phone && data.get('phone_permission') === 'on';
      state.data.privacy_consent = data.get('privacy_consent') === 'on';
    }
  }

  function formError(message) {
    const node = document.getElementById('form-error');
    node.textContent = message;
    node.hidden = false;
    node.focus();
  }

  function focusHeading() {
    const heading = document.getElementById('form-heading');
    if (heading) { heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
    document.querySelector('.form-panel')?.scrollIntoView({block:'start',behavior:'auto'});
  }

  function renderPreferences(moveFocus = false) {
    setNav('preferences');
    document.body.dataset.step = String(state.step);
    main.innerHTML = `<div class="experience">${intro()}<section class="form-panel" aria-labelledby="form-heading">
      ${state.editing?'<div class="manage-header">You’re updating your saved preferences. Only you and the pilot organizer can see these details.</div>':''}
      <div id="event-closed" class="form-error" hidden>Responses for this event are closed. Existing private links still let you update or delete a response.</div>
      ${stepper()}<form id="preferences-form"><div id="form-error" class="form-error" role="alert" tabindex="-1" hidden></div>${[firstStep,secondStep,thirdStep][state.step]()}</form>
      ${state.editing?'<div class="manage-danger"><button type="button" class="quiet danger" id="delete-mine">Delete my response</button><p>This removes your response from the pilot’s active records.</p></div>':''}
    </section></div>`;
    const form = document.getElementById('preferences-form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (state.busy) return;
      captureForm();
      if (state.step === 0 && (!state.data.first_name || !state.data.last_name)) { formError('Please add your first and last name.'); return; }
      if (state.step < 2) { state.step++; renderPreferences(true); return; }
      await savePreferences();
    });
    document.getElementById('back')?.addEventListener('click', () => { captureForm(); state.step--; renderPreferences(true); });
    form.querySelectorAll('[name=engagement]').forEach(input => input.addEventListener('change', () => {
      const hidden = input.value === 'not_now';
      document.getElementById('interest-section').hidden = hidden;
      if (hidden) {
        form.querySelectorAll('[name=interests]').forEach(checkbox => { checkbox.checked = false; });
        const availability = form.querySelector('[name=availability]');
        if (availability) availability.value = '';
      }
    }));
    form.querySelectorAll('[name=contact_permission]').forEach(input => input.addEventListener('change', () => {
      const wrap = document.getElementById('phone-permission-wrap');
      if (wrap) { wrap.hidden = input.value === 'none'; if (wrap.hidden) wrap.querySelector('input').checked = false; }
    }));
    document.getElementById('delete-mine')?.addEventListener('click', deleteMine);
    syncClosedEvent();
    if (moveFocus) focusHeading();
  }

  function randomToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2,'0')).join('');
  }

  async function savePreferences() {
    const routeRevision = state.routeRevision;
    const originalManage = state.manage;
    const originalData = state.data;
    const editing = state.editing;
    state.busy = true;
    const button = document.getElementById('save-preferences');
    button.disabled = true;
    button.textContent = 'Saving…';
    document.getElementById('form-error').hidden = true;
    try {
      if (editing) {
        await api('manage_update', {id:originalManage.id,manage_token:originalManage.token,data:originalData});
      } else {
        if (!state.submission) state.submission = {id:crypto.randomUUID(),token:randomToken()};
        const submission = state.submission;
        await api('submit', {event_slug:EVENT_SLUG,id:submission.id,manage_token:submission.token,website:state.website || '',data:originalData});
        if (state.manage!==originalManage || state.data!==originalData) return;
        state.manage = {...submission};
      }
      if (editing && (state.manage!==originalManage || state.data!==originalData)) return;
      state.editing = true;
      if (routeRevision === state.routeRevision) renderSuccess();
      else notify('Your preferences were saved. Return to the form to review them.');
    } catch (error) {
      if (routeRevision === state.routeRevision) {
        formError(error.message);
        button.disabled = false;
        button.textContent = state.editing ? 'Save changes' : 'Save my preferences';
      } else notify(error.message);
    } finally { state.busy = false; }
  }

  function renderSuccess() {
    setNav('preferences');
    document.body.dataset.step = 'success';
    const contact = state.data.contact_permission === 'email';
    main.innerHTML = `<div class="experience">${intro()}<section class="form-panel success-content" aria-labelledby="success-title"><div class="success-icon" aria-hidden="true">✓</div><p class="eyebrow">Preferences saved</p><h2 id="success-title">Thanks for letting<br>us know${state.data.first_name?', '+esc(state.data.first_name):''}.</h2><p>${contact?'An organizer may follow up about what you shared. Your preferences do not sign you up for a newsletter.':'Your preferences are saved. You haven’t asked to be contacted.'}</p><p>No email or text has been sent.</p><div class="private-link-box"><label for="private-link">Keep your private update link</label><p class="hint">Treat this like a password. Anyone with it can view, update, or delete your response. It won’t be emailed to you.</p><input id="private-link" readonly value="${esc(managementUrl())}" aria-label="Your private management link"><button type="button" id="copy-private" class="navy small">Copy private link</button></div><div class="button-row"><button type="button" id="edit-preferences">Review or change my answers</button></div><p class="hint">Preferences expire 90 days after your last save.</p></section></div>`;
    document.getElementById('copy-private').addEventListener('click',() => copy(managementUrl(),document.getElementById('private-link')));
    document.getElementById('edit-preferences').addEventListener('click',() => { state.editing = true; state.step = 0; renderPreferences(true); });
    const title = document.getElementById('success-title'); title.tabIndex = -1; title.focus({preventScroll:true});
    document.querySelector('.form-panel').scrollIntoView({block:'start'});
  }

  async function loadManagement(token, id) {
    const revision = state.routeRevision;
    setNav('preferences');
    main.innerHTML = '<div class="page narrow-page"><p class="loading" role="status">Opening your saved preferences…</p></div>';
    history.replaceState(null,'','/#manage');
    lastRoutedUrl = location.href;
    try {
      const result = await api('manage_get',{id,manage_token:token});
      if (revision !== state.routeRevision) return;
      if (!result.response) throw new Error('This private link is no longer available. The response may have expired or been deleted.');
      state.manage = {token,id};
      state.data = {...emptyData(),...recordData(result.response)};
      state.data.graduate_year = String(state.data.graduate_year || '');
      state.data.interests = Array.isArray(state.data.interests) ? state.data.interests : [];
      state.editing = true;
      state.step = 0;
      renderPreferences();
    } catch (error) {
      if (revision !== state.routeRevision) return;
      main.innerHTML = `<div class="page narrow-page"><div class="prose"><h1>We couldn’t open that response.</h1><p>${esc(error.message)}</p><p>Check that you copied the entire private link. Preferences expire 90 days after the last save.</p><a href="/" data-app-route>Return to the event form</a></div></div>`;
    }
  }

  async function deleteMine() {
    if (state.busy || !state.manage || !confirm('Delete your saved response? It will be removed from the pilot’s active records and this private link will stop working.')) return;
    state.busy=true;
    const routeRevision=state.routeRevision;
    const management=state.manage;
    const button = document.getElementById('delete-mine');
    button.disabled = true;
    try {
      await api('manage_delete',{id:management.id,manage_token:management.token});
      if (state.manage!==management) return;
      state.manage = null; state.submission = null; state.data = emptyData(); state.editing = false; state.step = 0;
      if (routeRevision!==state.routeRevision) {notify('Your saved response was deleted.');return;}
      history.replaceState(null,'','/');
      lastRoutedUrl = location.href;
      main.innerHTML = '<div class="page narrow-page"><div class="prose"><p class="eyebrow">Response deleted</p><h1>Your choice is yours.</h1><p>Your response has been removed from the pilot’s active records. Your private link no longer works.</p><p>Hosting providers may keep limited operational logs or backups under their own retention policies.</p><a href="#" id="return-form">Return to the event form</a></div></div>';
      document.getElementById('return-form').addEventListener('click',event => { event.preventDefault(); renderPreferences(); });
    } catch(error) { if(routeRevision===state.routeRevision){button.disabled=false;formError(error.message);}else notify(error.message); }
    finally {state.busy=false;}
  }

  function syntheticRecords() {
    const names = ['Alex','Jordan','Taylor','Casey','Morgan','Sam','Jamie','Riley','Avery','Drew','Cameron','Reese','Robin','Quinn','Blair','Emerson','Rowan','Parker','Kendall','Skyler','Finley','Sage','River','Hayden','Charlie','Dakota','Ellis','Frankie','Marley','Shawn'];
    const sets = [['network','mentor'],['volunteer','event'],['committee'],['network'],['volunteer'],['idea','committee']];
    const needs = ['An introduction to someone working in local education.','A one-day project I could help with.','Advice on joining my first nonprofit committee.','Meeting alumni from another class.','A sounding board for a community project.',''];
    return names.map((name,i) => {
      const engagement = i<18?'yes':i<26?'maybe':'not_now';
      const permission = i%5===0 || i>=26?'none':'email';
      return {id:`demo-${i+1}`,first_name:name,last_name:`Example ${String(i+1).padStart(2,'0')}`,graduate_year:String(1996+(i%30)),email:`${name.toLowerCase()}${i+1}@example.com`,phone:'',current_employer:i%3?'Example community organization':'',engagement,interests:engagement==='not_now'?[]:sets[i%sets.length],availability:Object.keys(availabilityLabels)[i%4],help_needed:needs[i%needs.length],contact_permission:permission,phone_permission:false,privacy_consent:true,status:permission==='none'?'closed':i%7===1?'connected':i%4===0?'planned':'new',note:'',created_at:new Date(Date.UTC(2026,10,20,17,i)).toISOString(),email_verified:false};
    });
  }

  function currentRecords() { return state.organizerMode==='demo' ? state.demoRecords : state.records; }
  function filteredRecords() {
    const f = state.filters;
    const query = f.search.trim().toLowerCase();
    return currentRecords().filter(raw => {
      const row = recordData(raw);
      return (!query || [row.first_name,row.last_name,row.email,row.current_employer,row.graduate_year].join(' ').toLowerCase().includes(query))
        && (!f.interest || (row.interests || []).includes(f.interest))
        && (!f.status || (f.status==='no_followup'?row.contact_permission==='none':row.status===f.status))
        && (!f.permission || row.contact_permission===f.permission);
    });
  }

  function adminHeader() {
    const isDemo = state.organizerMode === 'demo';
    return `<div class="page-header"><div><p class="eyebrow">For the organizer</p><h1>The follow-through.</h1><p class="page-subtitle">See what people are interested in, respect their choices, and help the right connections happen.</p></div><div class="page-toolbar">${isDemo?'<button id="open-login" class="navy small">Organizer sign in</button>':'<button id="refresh-records" class="small">Refresh responses</button><button id="sign-out" class="small">Sign out</button>'}</div></div>
      ${isDemo?'<div class="demo-banner"><strong>Demo · 30 made-up responses.</strong> Explore the organizer view. These are fictional people; changes here stay in this preview.</div>':'<div class="demo-banner"><strong>Private organizer view.</strong> These are real pilot responses. Email addresses are self-reported, not verified. Only follow up with the permission shown.</div>'}`;
  }

  function renderOrganizerGate(message = '') {
    setNav('organizer-gate');
    main.innerHTML = `<div class="page organizer-gate"><section class="organizer-welcome"><p class="eyebrow">The organizer workspace</p><h1>Good connections<br>need a next step<span class="accent">.</span></h1><p class="lead">Make it easy to follow through on what people shared.</p><ul class="gate-feature-list"><li>Find alumni by interest, class year, or organization.</li><li>See who welcomes a conversation—and who doesn’t.</li><li>Keep track of introductions and useful next steps.</li></ul><p class="login-demo">Want to take a look first? <a href="/organizer/#demo" data-app-route>Explore 30 fictional responses</a>.</p></section><section class="organizer-login" aria-labelledby="login-title"><p class="eyebrow">Private access</p><h2 id="login-title">Organizer sign in</h2><p class="login-note">Use the access key supplied by the pilot owner to open real responses.</p><form id="login-form"><div id="login-error" class="form-error" role="alert"${message?'':' hidden'}>${esc(message)}</div><div class="field"><label for="organizer-key">Organizer access key</label><input id="organizer-key" name="key" type="password" required autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="128"></div><button type="submit" class="navy">Open private responses</button></form><p class="login-note">Your key is kept only for this tab’s current session. Sign out when you’re finished, especially on a shared device.</p></section></div>`;
    document.getElementById('login-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target, button = form.querySelector('button');
      const key = String(new FormData(form).get('key') || '').trim();
      const box = document.getElementById('login-error');
      box.hidden = true;
      if (!/^[a-f0-9]{64}$/i.test(key)) {box.textContent='Please enter the full organizer access key.';box.hidden=false;return;}
      state.organizerKey = key;
      state.organizerRevision++;
      const revision = state.organizerRevision;
      button.disabled = true;button.textContent='Opening…';
      try { await loadLiveRecords(true); }
      catch(error) {
        if (revision !== state.organizerRevision) return;
        state.organizerKey='';state.organizerMode='locked';
        box.textContent=error.message;box.hidden=false;button.disabled=false;button.textContent='Open private responses';
      }
    });
  }

  function renderOrganizer() {
    setNav('organizer');
    if (!state.demoRecords) state.demoRecords = syntheticRecords();
    main.innerHTML = `<div class="page organizer-page organizer-shell">${adminHeader()}<div id="organizer-error" class="form-error" role="alert" hidden></div><div id="organizer-stats"></div>
      <div class="filters"><div class="field"><label for="search-responses">Find a person or organization</label><input type="search" id="search-responses" placeholder="Name, email, employer, or class year" value="${esc(state.filters.search)}"></div>
      <div class="field"><label for="filter-interest">Interest</label><select id="filter-interest"><option value="">All interests</option>${Object.entries(interestLabels).map(([value,label]) => `<option value="${value}"${selected(state.filters.interest,value)}>${esc(label)}</option>`).join('')}</select></div>
      <div class="field"><label for="filter-status">Progress</label><select id="filter-status"><option value="">All progress</option>${Object.entries({...statusLabels,no_followup:'No follow-up requested'}).map(([value,label]) => `<option value="${value}"${selected(state.filters.status,value)}>${esc(label)}</option>`).join('')}</select></div>
      <div class="field"><label for="filter-permission">Contact permission</label><select id="filter-permission"><option value="">Everyone</option><option value="email"${selected(state.filters.permission,'email')}>Email welcomed</option><option value="none"${selected(state.filters.permission,'none')}>No follow-up</option></select></div></div>
      <div class="result-summary"><span id="result-count" role="status"></span><button class="quiet" id="export-responses">${state.organizerMode==='demo'?'Export demo outreach CSV':'Export permitted outreach CSV'}</button></div><div id="response-list" class="response-list"></div>
      <p class="organizer-note">An expression of interest is not a commitment. The outreach export includes only people who chose a personal email, within your current filters. Phone numbers are included only with separate permission to call. No emails or messages are sent from this site.</p>
      ${state.organizerMode==='live'?`<details class="event-settings"><summary>Event settings</summary><form id="event-settings-form" class="settings-content"><div class="field"><label for="event-title">Event name</label><input id="event-title" name="title" required maxlength="120" value="${esc(state.event.title)}"></div><label class="check-consent"><input type="checkbox" name="is_open"${checked(state.event.is_open!==false)}><span>Accept new responses</span></label><button type="submit" class="small">Save event settings</button></form></details>`:''}
    </div>`;
    renderRecords();
    const bindings = {'search-responses':['search','input'],'filter-interest':['interest','change'],'filter-status':['status','change'],'filter-permission':['permission','change']};
    for (const [id,[key,event]] of Object.entries(bindings)) document.getElementById(id).addEventListener(event, e => { state.filters[key] = e.target.value; renderRecords(); });
    document.getElementById('open-login')?.addEventListener('click', openLogin);
    document.getElementById('refresh-records')?.addEventListener('click', () => loadLiveRecords());
    document.getElementById('sign-out')?.addEventListener('click', () => {
      state.organizerRevision++;
      state.organizerKey='';state.organizerMode='locked';state.records=[];
      state.filters={search:'',interest:'',status:'',permission:''};
      navigate('/organizer/', true);notify('Signed out. Private responses are closed.');
    });
    document.getElementById('export-responses').addEventListener('click',exportRecords);
    document.getElementById('event-settings-form')?.addEventListener('submit',async event => {
      event.preventDefault();
      const session=organizerSession();
      const form = event.target, button = form.querySelector('button'); button.disabled=true;
      try {
        const values = new FormData(form);
        const title = String(values.get('title') || '').trim();
        if (!title) throw new Error('Add an event name.');
        const is_open = values.get('is_open')==='on';
        await api('event_update',{event_slug:EVENT_SLUG,title,is_open},true);
        if(!sameOrganizerSession(session)) return;
        state.event = {...state.event,title,is_open}; notify('Event settings saved.');
      } catch(error) { if(sameOrganizerSession(session)) organizerError(error.message); } finally {button.disabled=false;}
    });
  }

  function organizerError(message) {
    const error = document.getElementById('organizer-error');
    if (error) {error.textContent=message;error.hidden=false;error.scrollIntoView({block:'nearest'});} else notify(message);
  }

  function renderRecords() {
    if(state.view!=='organizer' || !document.getElementById('response-list')) return;
    const all = currentRecords().map(recordData);
    const rows = filteredRecords().map(recordData);
    document.getElementById('organizer-stats').innerHTML = `<div class="stat-strip"><div class="stat"><strong>${all.length}</strong><span>${state.organizerMode==='demo'?'Example responses':'Responses saved'}</span></div><div class="stat"><strong>${all.filter(r=>r.engagement==='yes').length}</strong><span>Ready to get involved</span></div><div class="stat"><strong>${all.filter(r=>r.engagement==='maybe').length}</strong><span>Curious to learn more</span></div><div class="stat"><strong>${all.filter(r=>r.contact_permission==='email').length}</strong><span>Welcome a personal email</span></div></div>`;
    document.getElementById('result-count').textContent = `${rows.length} of ${all.length} ${state.organizerMode==='demo'?'example ':''}responses`;
    const list = document.getElementById('response-list');
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><h2>${all.length?'No responses match these filters.':'Ready when people are.'}</h2><p>${all.length?'Try another interest, contact choice, or search.':'Share the event QR code. New responses will appear here after you refresh.'}</p>${all.length?'<button id="clear-filters" class="small">Clear filters</button>':''}</div>`;
      document.getElementById('clear-filters')?.addEventListener('click',() => {state.filters={search:'',interest:'',status:'',permission:''};renderOrganizer();});
      return;
    }
    list.innerHTML = `<div class="response-head" aria-hidden="true"><span>Person</span><span>Interests</span><span>Follow-up</span><span>Progress</span><span></span></div>${rows.map(row => `<article class="response-row"><div class="row-name"><span class="person-name">${esc(row.first_name)} ${esc(row.last_name)}</span><span class="person-year">${esc(yearLabel(row.graduate_year))}</span></div><div class="row-interest interest-text">${(row.interests||[]).map(i=>esc(interestLabels[i]||i)).join(' · ') || (row.engagement==='not_now'?'Not right now':'Still exploring')}</div><div class="row-permission permission ${row.contact_permission==='email'?'allowed':'none'}">${row.contact_permission==='email'?'Personal email welcome':'No follow-up requested'}</div><div class="row-status"><span class="status ${esc(row.status)}">${esc(statusLabels[row.status]||'New')}</span></div><div class="row-action"><button class="small" data-record="${esc(row.id)}" aria-label="View ${esc(row.first_name+' '+row.last_name)}">View</button></div></article>`).join('')}`;
    list.querySelectorAll('[data-record]').forEach(button=>button.addEventListener('click',()=>openRecord(button.dataset.record)));
  }

  function openRecord(id) {
    const session=organizerSession();
    const raw = currentRecords().find(row => row.id===id);
    if (!raw) return;
    const row = recordData(raw);
    const dialog = document.getElementById('response-dialog');
    const allowed = row.contact_permission==='email';
    dialog.innerHTML = `<div class="dialog-top"><div><p class="eyebrow">${state.organizerMode==='demo'?'Fictional demo response':'Private response'}</p><h2 id="detail-name">${esc(row.first_name)} ${esc(row.last_name)}</h2></div><button class="close-dialog" aria-label="Close response">×</button></div><p class="detail-meta">${esc(yearLabel(row.graduate_year))}${row.current_employer?' · '+esc(row.current_employer):''}</p><div class="permission-banner${allowed?'':' none'}"><strong>${allowed?'A personal email is welcome.':'No follow-up requested.'}</strong><br>${allowed?'Contact only about their interests or the help they requested.':'Keep this response for planning. Do not add this person to an outreach list.'}${row.phone_permission?'<br>They also gave permission for a call. No text permission.':''}</div>
      <dl class="detail-grid"><div class="detail-item full"><dt>Email · self-reported, not verified</dt><dd>${esc(row.email)}</dd></div>${row.phone?`<div class="detail-item full"><dt>Phone · ${row.phone_permission?'call permission given':'no permission to call or text'}</dt><dd>${esc(row.phone)}</dd></div>`:''}<div class="detail-item full"><dt>Engagement</dt><dd>${esc(engagementLabels[row.engagement] || row.engagement)}</dd></div><div class="detail-item full"><dt>Interests</dt><dd>${(row.interests||[]).map(i=>esc(interestLabels[i]||i)).join(' · ')||'None selected'}</dd></div><div class="detail-item full"><dt>Availability</dt><dd>${esc(availabilityLabels[row.availability]||'No preference yet')}</dd></div><div class="detail-item full"><dt>What the community could help with</dt><dd>${esc(row.help_needed||'No request shared.')}</dd></div></dl>
      <form class="detail-form" id="detail-form"><div id="detail-error" class="form-error" role="alert" hidden></div><div class="field"><label for="detail-status">Progress</label><select id="detail-status" name="status">${Object.entries(statusLabels).map(([value,label])=>`<option value="${value}"${selected(row.status||'new',value)}>${esc(label)}</option>`).join('')}</select></div><div class="field"><label for="detail-note">Organizer note <span class="optional">optional</span></label><textarea id="detail-note" name="note" maxlength="500" placeholder="A useful next step, a promised introduction…">${esc(row.note||'')}</textarea><p class="hint">Keep notes brief and practical. Avoid sensitive personal details.</p></div><div class="dialog-actions"><button type="button" id="delete-response" class="quiet danger">Delete response</button><button type="submit" class="navy">Save progress</button></div></form><p class="dialog-note">${state.organizerMode==='demo'?'This example is fictional. Changes are temporary and stay in the demo.':'Saving progress does not send a message. Contact preferences always take priority.'}</p>`;
    dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
    dialog.querySelector('#detail-form').addEventListener('submit',async event => {
      event.preventDefault();
      const form = event.target, button = form.querySelector('[type=submit]'); button.disabled=true;
      const values = new FormData(form); const status = String(values.get('status'));const note = String(values.get('note')||'').trim();
      try {
        if (status === 'planned' && !allowed) throw new Error('This person has not requested follow-up. Please leave them uncontacted.');
        if (state.organizerMode==='live') {
          const result = await api('admin_update',{id,status,note},true);
          if(!sameOrganizerSession(session)) return;
          if (!result.response) throw new Error('The change was sent, but its saved state could not be confirmed. Refresh responses before continuing.');
          Object.assign(raw,result.response);
        } else Object.assign(raw,{status,note});
        dialog.close();renderRecords();notify(state.organizerMode==='demo'?'Demo progress updated.':'Progress saved.');
      } catch(error) {if(!sameOrganizerSession(session))return;const box=document.getElementById('detail-error');if(box){box.textContent=error.message;box.hidden=false;}button.disabled=false;}
    });
    dialog.querySelector('#delete-response').addEventListener('click',async event => {
      if (!confirm(`Delete ${row.first_name}’s ${state.organizerMode==='demo'?'example ':''}response? This cannot be undone.`)) return;
      event.target.disabled=true;
      try {
        if (state.organizerMode==='live') await api('admin_delete',{id},true);
        if(!sameOrganizerSession(session)) return;
        if (state.organizerMode==='demo') state.demoRecords=state.demoRecords.filter(r=>r.id!==id); else state.records=state.records.filter(r=>r.id!==id);
        dialog.close();renderRecords();notify('Response deleted.');
      } catch(error) {if(!sameOrganizerSession(session))return;const box=document.getElementById('detail-error');if(box){box.textContent=error.message;box.hidden=false;}event.target.disabled=false;}
    });
    dialog.showModal();
  }

  function openLogin() { navigate('/organizer/'); }

  async function loadLiveRecords(throwErrors = false) {
    const key = state.organizerKey;
    const revision = state.organizerRevision;
    const routeRevision = state.routeRevision;
    if (!key) return false;
    const button=document.getElementById('refresh-records');
    if(button){button.disabled=true;button.textContent='Refreshing…';}
    try {
      const body=await api('admin_list',{event_slug:EVENT_SLUG},true);
      if (key !== state.organizerKey || revision !== state.organizerRevision || routeRevision !== state.routeRevision) return false;
      state.records=Array.isArray(body.responses)?body.responses:[];
      if(body.event) state.event={...state.event,...body.event};
      state.organizerMode='live';
      if (isOrganizerPath() && !['#qr','#demo'].includes(location.hash)) {
        history.replaceState(null,'','/organizer/#responses');lastRoutedUrl=location.href;
        renderOrganizer();
        if (throwErrors) focusPageHeading();
      }
      return true;
    } catch(error) {
      if (key !== state.organizerKey || revision !== state.organizerRevision || routeRevision !== state.routeRevision) return false;
      if(throwErrors===true)throw error;
      organizerError(error.message);
      if(button){button.disabled=false;button.textContent='Refresh responses';}
      return false;
    }
  }

  function csvCell(value) {
    let text=String(value??'').replace(/[\r\n]+/g,' ');
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }

  async function exportRecords() {
    const session=organizerSession();
    const button=document.getElementById('export-responses');
    if(button?.disabled) return;
    const isDemo=state.organizerMode==='demo';
    const exportOrganizerKey=state.organizerKey;
    const originalLabel=button?.textContent;
    if(button){button.disabled=true;button.textContent=isDemo?'Preparing example export…':'Checking current permissions…';}
    try {
      let permissionsCheckedAt='Not applicable — fictional example';
      if(!isDemo) {
        const latest=await api('admin_list',{event_slug:EVENT_SLUG},true);
        if(!sameOrganizerSession(session) || state.organizerMode!=='live'||state.organizerKey!==exportOrganizerKey) return;
        if(!Array.isArray(latest.responses)) throw new Error('Current permissions could not be verified. Nothing was exported. Please refresh and try again.');
        state.records=latest.responses;
        if(latest.event) state.event={...state.event,...latest.event};
        permissionsCheckedAt=new Date().toISOString();
        if(document.getElementById('response-list')) renderRecords();
      }
      const rows=filteredRecords().map(recordData).filter(row=>row.contact_permission==='email');
      if(!rows.length){notify('No one in this view currently permits an email follow-up.');return;}
      const headers=['Data type','First name','Last name','LMW graduate year','Email (not verified)','Phone (calls permitted only)','Employer','Engagement','Interests','Availability','Help requested','Contact permission','Phone call permission','Progress','Permissions checked at (UTC)'];
      const lines=[headers,...rows.map(row=>[isDemo?'FICTIONAL DEMO':'Pilot response',row.first_name,row.last_name,row.graduate_year,row.email,row.phone_permission?row.phone:'',row.current_employer,engagementLabels[row.engagement],(row.interests||[]).map(i=>interestLabels[i]||i).join('; '),availabilityLabels[row.availability]||'',row.help_needed,'Personal email about shared interests only',row.phone_permission?'Call allowed; no texts':'No calls or texts',statusLabels[row.status]||'New',permissionsCheckedAt])];
      const blob=new Blob(['\ufeff'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`lmw-${isDemo?'demo-':''}permitted-outreach-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify(`${rows.length} ${isDemo?'fictional ':''}permitted contacts exported.`);
    } catch(error) {
      if(sameOrganizerSession(session)) organizerError(`Nothing was exported. ${error.message}`);
    } finally {
      if(button){button.disabled=false;button.textContent=originalLabel;}
    }
  }

  function renderQr() {
    setNav('qr');
    main.innerHTML=`<div class="page"><div class="page-header"><div><p class="eyebrow">At the event</p><h1>Start with a scan.</h1><p class="page-subtitle">A table sign, a quick invitation, and a minute on their own phone.</p></div></div><div class="qr-layout"><section class="qr-poster" aria-label="Printable event QR sign"><div class="poster-brand">Leadership<br>MetroWest</div><h2>Keep the<br>connection going<span class="accent">.</span></h2><p>What would make staying connected worthwhile for you?</p><img src="/qr.svg" alt="QR code opening the networking night preferences form" width="240" height="240"><p>Scan to share your interests.<br>About a minute. No account needed.</p><p class="qr-url">${esc(eventUrl())}</p><p class="poster-label">Independent DFE proof of concept · Holtsnider Tech</p></section><section class="qr-info"><p class="eyebrow" data-event-title>${esc(state.event.title)}</p><h2>Keep the invitation human.</h2><p>“We’d love to know what would make LMW useful to you. You can tell us what interests you—and whether you’d like us to follow up.”</p><ol><li>Put this sign near the welcome table or name tags.</li><li>Offer the link as an option. A conversation still works.</li><li>After the event, respond to the specific interests people shared.</li></ol><div class="link-field"><label for="event-link">Event form link</label><input id="event-link" value="${esc(eventUrl())}" readonly><div class="page-toolbar"><button id="copy-event" class="navy">Copy event link</button><button id="print-qr">Print QR sign</button></div></div><p class="hint">Before handing out the sign, test the QR with your phone. This pilot is independent of the official LMW website.</p></section></div></div>`;
    document.getElementById('copy-event').addEventListener('click',()=>copy(eventUrl(),document.getElementById('event-link')));
    document.getElementById('print-qr').addEventListener('click',()=>window.print());
  }

  function renderPrivacy() {
    setNav('privacy');
    main.innerHTML=`<div class="page narrow-page"><div class="page-header"><div><p class="eyebrow">Privacy &amp; your choices</p><h1>Your details, with a purpose.</h1><p class="page-subtitle">What this pilot collects, who can see it, and how you stay in control.</p></div></div><div class="prose"><h2>Who runs this pilot</h2><p>This is an independent DailyFlyer proof of concept operated by Holtsnider Tech. It is not the official Leadership MetroWest website and does not imply endorsement by LMW. The pilot owner controls organizer access.</p><h2>What you share</h2><p>The form asks for your first name, last name, LMW graduate year, and email. Phone and employer are optional. You can also share interests, availability, a brief request for help, and your follow-up choices. Please do not include sensitive information in free-text answers.</p><h2>What it is used for</h2><p>The pilot organizer can use your preferences to understand interests and plan useful connections or opportunities. Your email address is self-reported and is not verified. An email address alone is not permission to contact you.</p><p>If you choose a personal email, an organizer may follow up about what you shared. A phone call requires the separate call-permission checkbox. This pilot never grants text-message permission. “No follow-up” means your response is for planning only. Nothing here automatically signs you up for newsletters, marketing, or a public directory.</p><h2>Who can see it</h2><p>Your answers are stored with Supabase and restricted to the pilot organizer and people with authorized organizer access. Other attendees cannot browse your information. The public organizer demo contains fictional examples only. An authorized organizer can export permitted contacts for manual follow-up; an exported copy is outside the site’s direct control.</p><h2>Your private update link</h2><p>After saving, you receive a private link that can view, change, or delete your response. It is not emailed to you. Keep it somewhere safe and treat it like a password: anyone with that link has access to your response. The site does not keep your answers or access keys in your browser’s local storage. It remembers only your display preference (System, Light, Night, or High contrast) on this device.</p><h2>Retention and deletion</h2><p>Preferences expire 90 days after your last save. You can delete your response sooner through your private link. Deletion removes it from the pilot’s active records; hosting providers may retain limited operational logs or backups under their own policies. For an exported copy, a lost private link, or another privacy request, contact the pilot owner.</p><h2>Technical information</h2><p>This site does not use advertising, analytics, or tracking pixels. Supabase and the hosting provider process requests to operate the service and may keep operational logs. Temporary abuse controls may be used to protect the response form.</p><h2>Contact</h2><p>For questions, access requests, or deletion help: <a href="mailto:chris@holtsnidertech.com">chris@holtsnidertech.com</a>.</p><p><a href="/" data-app-route>Return to your preferences</a></p></div></div>`;
  }

  function focusPageHeading() {
    const heading = main.querySelector('#form-heading, #success-title') || main.querySelector('h1, h2') || main;
    heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
  }

  function navigate(url, replace = false) {
    if (document.getElementById('preferences-form')) captureForm();
    history[replace?'replaceState':'pushState'](null,'',url);
    return route(true);
  }

  async function route(force = false) {
    if (force !== true && location.href === lastRoutedUrl) return;
    const previousUrl = lastRoutedUrl;
    if (document.getElementById('preferences-form')) captureForm();
    state.routeRevision++;
    const revision = state.routeRevision;
    document.querySelectorAll('dialog').forEach(dialog=>{if(dialog.open)dialog.close();dialog.innerHTML='';});
    document.querySelector('.appearance-control')?.removeAttribute('open');
    let hash=location.hash.slice(1);
    if (hash==='organizer') {
      history.replaceState(null,'','/organizer/#demo');hash='demo';
    } else if (hash==='qr' && !isOrganizerPath()) {
      history.replaceState(null,'','/organizer/#qr');
    } else if (hash==='privacy' && isOrganizerPath()) {
      history.replaceState(null,'','/#privacy');
    } else if (isOrganizerPath() && location.pathname==='/organizer') {
      history.replaceState(null,'','/organizer/'+location.search+location.hash);
    }
    lastRoutedUrl=location.href;
    if(hash.startsWith('organizer=')) {
      const key=hash.slice('organizer='.length);
      history.replaceState(null,'','/organizer/#responses');lastRoutedUrl=location.href;
      state.organizerRevision++;
      state.organizerKey=/^[a-f0-9]{64}$/i.test(key)?key:'';
      state.organizerMode='locked';state.records=[];
      renderOrganizerGate();
      if(state.organizerKey){
        const revision=state.organizerRevision;
        try{await loadLiveRecords(true);}catch(error){
          if(revision===state.organizerRevision){state.organizerKey='';renderOrganizerGate(error.message);}
        }
      } else renderOrganizerGate('That organizer link is not valid. Use your organizer access key to sign in.');
    } else if(hash.startsWith('manage=')) {
      const params=new URLSearchParams(hash);
      const token=params.get('manage')||'',id=params.get('id')||'';
      history.replaceState(null,'','/#manage');lastRoutedUrl=location.href;
      if(/^[a-f0-9]{64}$/i.test(token)&&/^[a-f0-9-]{36}$/i.test(id)) await loadManagement(token,id);
      else {renderPreferences();formError('That private link is incomplete. Please copy the entire link you saved.');}
    } else if(isOrganizerPath()) {
      if(hash==='qr') renderQr();
      else if(hash==='demo') {state.organizerMode='demo';renderOrganizer();}
      else if(state.organizerKey) {renderOrganizerGate();await loadLiveRecords();}
      else {state.organizerMode='locked';renderOrganizerGate();}
    } else if(hash==='privacy') renderPrivacy();
    else if(hash==='manage'&&state.manage) {state.editing=true;renderPreferences();}
    else renderPreferences();
    if(revision===state.routeRevision){
      window.scrollTo({top:0,behavior:'auto'});
      if(previousUrl && !document.getElementById('form-error')?.matches(':not([hidden])')) focusPageHeading();
    }
  }

  document.addEventListener('click', event => {
    const link=event.target.closest('a');
    if(!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if(link.classList.contains('skip-link')) {event.preventDefault();main.focus();main.scrollIntoView({block:'start'});return;}
    if(!link.hasAttribute('data-app-route') || link.target || link.hasAttribute('download')) return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin) return;
    event.preventDefault();navigate(url.pathname+url.search+url.hash);
  });
  window.addEventListener('hashchange',()=>route());
  window.addEventListener('popstate',()=>route());
  // Opening another screen never writes form drafts or access keys into persistent browser storage.
  route();
  loadEvent();
})();
