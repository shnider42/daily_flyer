/* New Passage portfolio. Public snapshots and editor-only drafts are separate. */
(() => {
  'use strict';
  const root = document.getElementById('yp');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const config = JSON.parse($('yp-data').textContent).portfolio;
  if (!config) return;
  const storageKey = 'new-passage:editor-session';
  let clientPromise, client, authorized = false, busy = false, dirty = false;
  let entries = [], current = null, imagePath = '', file = null, fileURL = '';
  let epoch = 0, publicRequest = 0, verifying = false;
  const imageURLs = new Map();
  const fields = {title:'title',category:'category',organization:'organization',period:'period',summary:'summary',story:'story',outcome:'outcome',link_url:'link',image_alt:'alt',accent:'accent',sort_order:'order'};
  const say = text => { $('np-editor-status').textContent = text; };
  const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; } };
  const textNode = (tag, text, className) => { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; };
  function newId() { return crypto.randomUUID(); }
  function messageFor(error) {
    if (error?.code === '40001') return 'This entry changed in another tab. Your current text is still here. Copy anything you need, then reload saved entries before saving.';
    if (error?.code === '42501' || error?.status === 401 || error?.status === 403) return 'This account does not have active portfolio-editor access. Tim’s access can be assigned when his account is ready.';
    if (error?.code === '22023' || error?.code === '54000') return error.message;
    return 'The connection could not complete. Check your connection and try again. Nothing has been confirmed saved.';
  }
  function releaseFileURL() { if (fileURL) URL.revokeObjectURL(fileURL); fileURL = ''; }
  function clearPrivate(message = 'Signed out. Private drafts have been cleared from this page.') {
    epoch += 1; authorized = false; entries = []; current = null; imagePath = ''; file = null; dirty = false; busy = false;
    releaseFileURL(); imageURLs.clear();
    $('np-entry-form').reset(); $('np-login-password').value = '';
    $('np-editor-entries').replaceChildren(); $('np-entry-preview').replaceChildren();
    $('np-editor-email').textContent = ''; $('np-editor-workspace').hidden = true;
    $('np-editor-account').hidden = true; $('np-login-form').hidden = false;
    setBusy(false); say(message);
  }
  async function getClient() {
    if (!clientPromise) clientPromise = (async () => {
      const sdk = await import(config.sdk_url);
      let storage;
      try { const probe = storageKey + ':test'; sessionStorage.setItem(probe,'1'); sessionStorage.removeItem(probe); storage = sessionStorage; }
      catch (_) { const memory = new Map(); storage = {getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}; }
      client = sdk.createClient(config.supabase_url,config.publishable_key,{auth:{storage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (!session && authorized)) clearPrivate();
        if (event === 'TOKEN_REFRESHED' && authorized) setTimeout(() => verifyEditor(true), 0);
      });
      return client;
    })().catch(error => { clientPromise = null; throw error; });
    return clientPromise;
  }
  async function rpc(name, args) {
    const c = await getClient(); const result = await c.rpc(name,args);
    if (result.error) throw result.error;
    return result.data;
  }
  async function attachImage(img, path) {
    try {
      const cached = imageURLs.get(path);
      if (cached && cached.until > Date.now()) { if (img.isConnected) img.src = cached.url; return; }
      const c = await getClient();
      const {data,error} = await c.storage.from(config.storage_bucket).createSignedUrl(path,120);
      if (error || !data?.signedUrl || !img.isConnected) return;
      const u = new URL(data.signedUrl);
      if (u.origin !== new URL(config.supabase_url).origin) return;
      imageURLs.set(path,{url:u.href,until:Date.now()+90000}); img.src = u.href;
    } catch (_) { img.remove(); }
  }
  function card(value, preview = false) {
    const article = document.createElement('article'); article.className = 'np-portfolio-card';
    article.dataset.accent = ['aqua','warm','mint','navy'].includes(value.accent) ? value.accent : 'aqua';
    if (value.image_path || (preview && fileURL)) {
      const img = document.createElement('img'); img.alt = value.image_alt || ''; img.loading = 'lazy';
      img.addEventListener('error', () => img.remove(), {once:true}); article.append(img);
      if (preview && fileURL) img.src = fileURL;
      else setTimeout(() => attachImage(img,value.image_path),0);
    }
    const body = document.createElement('div'); body.className = 'np-portfolio-card-body';
    body.append(textNode('div',[value.category,value.period].filter(Boolean).join(' · '),'np-portfolio-card-meta'));
    body.append(textNode('h3',value.title || (preview ? 'Your entry title' : 'Experience')));
    if (value.organization) body.append(textNode('div',value.organization,'np-portfolio-card-meta'));
    body.append(textNode('p',value.summary || (preview ? 'Your short introduction will appear here.' : '')));
    const url = safeURL(value.link_url);
    if (value.story || value.outcome || url) {
      const details = document.createElement('details');
      details.append(textNode('summary','Read the story +'));
      const content = document.createElement('div');
      if (value.story) { content.append(textNode('h4','The work')); content.append(textNode('p',value.story)); }
      if (value.outcome) { content.append(textNode('h4','What it made possible')); content.append(textNode('p',value.outcome)); }
      if (url) { const a = textNode('a','View supporting link ↗'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; content.append(a); }
      details.append(content); body.append(details);
    }
    article.append(body); return article;
  }
  async function loadPublic() {
    const requestId = ++publicRequest;
    $('np-portfolio-status').textContent = 'Loading selected experience…'; $('np-portfolio-retry').hidden = true;
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),12000);
    try {
      const response = await fetch(config.supabase_url+'/rest/v1/rpc/np_portfolio',{method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:config.publishable_key,'Content-Type':'application/json'},body:'{}',signal:controller.signal});
      if (!response.ok) throw Error('Portfolio unavailable');
      const items = await response.json(); if (!Array.isArray(items)) throw Error('Invalid portfolio');
      if (requestId !== publicRequest) return;
      const nodes = items.map(item=>card(item));
      if (!nodes.length) {
        const empty = document.createElement('div'); empty.className='np-portfolio-empty';
        empty.append(textNode('h3','More of Tim’s story is on its way.'));
        empty.append(textNode('p','Selected experience is being prepared. In the meantime, you can explore Tim’s background and the ways to work with him.'));
        const a=textNode('a','Meet Tim →','yp-textlink'); a.href='#tim'; empty.append(a); nodes.push(empty);
      }
      $('np-portfolio-list').replaceChildren(...nodes);
      $('np-portfolio-status').textContent = items.length ? `${items.length} ${items.length===1?'entry':'entries'}` : '';
    } catch (_) {
      if (requestId !== publicRequest) return;
      $('np-portfolio-status').textContent = 'The portfolio could not be refreshed. Services and booking are still available.';
      $('np-portfolio-retry').hidden = false;
    } finally { clearTimeout(timer); }
  }
  function values() {
    const result = Object.fromEntries(Object.entries(fields).map(([name,id])=>[name,$('np-entry-'+id).value.trim()]));
    result.sort_order = Number(result.sort_order); result.image_path = imagePath; return result;
  }
  function updateControls() {
    $('np-entry-publish').disabled = busy || dirty || !current?.version || !current?.has_changes;
    $('np-entry-unpublish').hidden = !current?.published;
    $('np-entry-unpublish').disabled = busy || dirty;
    $('np-entry-save').disabled = busy || !authorized;
    $('np-entry-remove-image').hidden = !(imagePath || file);
    $('np-entry-alt').required = !!(imagePath || file);
    $('np-entry-state').textContent = dirty ? 'Unsaved changes. Save your draft before publishing.' : !current?.version ? 'New entry. Nothing has been saved.' : current.published ? (current.has_changes ? 'Draft saved. The published version is unchanged.' : 'This version is published.') : 'Saved draft. Not visible to visitors.';
  }
  function setBusy(flag) {
    busy=flag;
    $('np-entry-form').querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=flag);
    ['np-editor-new','np-editor-reload'].forEach(id=>$(id).disabled=flag);
    $('np-editor-entries').querySelectorAll('button').forEach(n=>n.disabled=flag);
    $('np-login-form').querySelector('button').disabled=flag;
    updateControls();
  }
  function renderPreview() { $('np-entry-preview').replaceChildren(card(values(),true)); updateControls(); }
  function renderEntryList() {
    $('np-editor-entries').replaceChildren(...entries.map(entry=>{
      const button=textNode('button',entry.draft.title); button.type='button'; button.setAttribute('aria-pressed',String(entry.id===current?.id));
      button.append(textNode('small',entry.published ? (entry.has_changes?'Published · draft changes':'Published') : 'Draft'));
      button.addEventListener('click',()=>{ if (!busy && (!dirty || window.confirm('Discard the unsaved changes in this entry?'))) openEntry(entry); });
      return button;
    }));
    if (!entries.length) $('np-editor-entries').append(textNode('p','No entries yet.','yp-small'));
  }
  function openEntry(entry) {
    current=entry || {id:newId(),version:0,published:false,has_changes:true,draft:{category:'Coaching',accent:'aqua',sort_order:0}};
    imagePath=current.draft.image_path || ''; file=null; releaseFileURL(); $('np-entry-image').value='';
    Object.entries(fields).forEach(([name,id])=>{ $('np-entry-'+id).value=current.draft[name] ?? ''; });
    dirty=false; renderEntryList(); renderPreview();
  }
  function acceptEntries(data, id) {
    if (!Array.isArray(data)) throw Error('Invalid entries');
    entries=data; openEntry(entries.find(entry=>entry.id===id) || entries[0] || null);
  }
  async function verifyEditor(quiet = false) {
    if (verifying) return; verifying=true; const requestEpoch=epoch;
    if (!quiet) say('Checking your editor access…');
    try {
      const c=await getClient(); const checked=await c.auth.getUser();
      if (requestEpoch!==epoch) return;
      if (checked.error || !checked.data?.user) { clearPrivate('Sign in with your assigned portfolio-editor account.'); return; }
      const list=await rpc('np_editor_entries',{}); if (requestEpoch!==epoch) return;
      if (!Array.isArray(list)) throw Error('Invalid entries');
      const wasAuthorized=authorized; authorized=true;
      $('np-login-form').hidden=true; $('np-editor-workspace').hidden=false; $('np-editor-account').hidden=false;
      $('np-editor-email').textContent=checked.data.user.email || 'Signed in';
      if (!wasAuthorized || !quiet) acceptEntries(list,current?.id);
      if (!quiet) say('Signed in. Only published entries appear in the public portfolio.');
    } catch(error) {
      if (requestEpoch!==epoch) return;
      if (error?.code==='42501') {
        clearPrivate(messageFor(error));
        $('np-editor-account').hidden=false; // An unassigned Auth session can still be signed out.
      } else if (!quiet) say(messageFor(error));
    } finally { verifying=false; }
  }
  $('np-login-form').addEventListener('submit',async event=>{
    event.preventDefault(); if (busy) return; setBusy(true); const requestEpoch=epoch;
    say('Signing in…');
    try {
      const c=await getClient(); const email=$('np-login-email').value.trim(); const password=$('np-login-password').value;
      const {error}=await c.auth.signInWithPassword({email,password}); $('np-login-password').value='';
      if (requestEpoch!==epoch) return;
      if (error) { say('Sign-in was not completed. Check your email and password.'); return; }
      await verifyEditor();
    } catch (_) { if (requestEpoch===epoch) say('Sign-in could not connect. Please try again.'); }
    finally { if (requestEpoch===epoch) setBusy(false); }
  });
  $('np-editor-signout').addEventListener('click',async()=>{
    clearPrivate();
    try {
      const c=await getClient(); const {error}=await c.auth.signOut({scope:'local'});
      if(error) { await c.auth.signOut({scope:'local'}); say('Private content is hidden. The server could not confirm sign-out; close this tab and sign in again when connected.'); }
    } catch (_) { say('Private content is hidden. Close this tab to clear its editor session.'); }
  });
  $('np-entry-form').addEventListener('input',event=>{ if (event.target.type!=='file') { dirty=true; renderPreview(); } });
  $('np-entry-form').addEventListener('change',event=>{ if(event.target.type!=='file') { dirty=true; renderPreview(); } });
  $('np-entry-image').addEventListener('change',()=>{
    const selected=$('np-entry-image').files[0]; if(!selected) return;
    if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>4194304||!selected.size){ say('Choose a JPEG, PNG, or WebP photo up to 4 MB.'); $('np-entry-image').value=''; return; }
    file=selected; releaseFileURL(); fileURL=URL.createObjectURL(file); dirty=true; renderPreview();
  });
  $('np-entry-remove-image').addEventListener('click',()=>{file=null; imagePath=''; releaseFileURL(); $('np-entry-image').value=''; dirty=true; renderPreview();});
  $('np-entry-form').addEventListener('submit',async event=>{
    event.preventDefault(); if(!authorized||busy) return;
    const requestEpoch=epoch, id=current.id, version=current.version; setBusy(true); say('Saving draft…');
    try {
      if(file){
        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
        const path=id+'/'+newId()+'.'+ext; const c=await getClient();
        const {error}=await c.storage.from(config.storage_bucket).upload(path,file,{contentType:file.type,upsert:false,cacheControl:'120'});
        if(error) throw error; if(requestEpoch!==epoch) return;
        imagePath=path; file=null; $('np-entry-image').value='';
      }
      const result=await rpc('np_save_entry',{entry_id:id,expected_version:version,content:values()});
      if(requestEpoch!==epoch) return; acceptEntries(result,id); say('Draft saved. Publishing is a separate step.');
    } catch(error){ if(requestEpoch===epoch) { if(error?.code==='42501') clearPrivate(messageFor(error)); else say(messageFor(error)); } }
    finally { if(requestEpoch===epoch) setBusy(false); }
  });
  async function publish(makePublic){
    if(!authorized||busy||!current?.version||dirty) return;
    if(!window.confirm(makePublic?'Publish this saved entry to the public portfolio?':'Remove this entry from the public portfolio? The saved draft will remain.')) return;
    const requestEpoch=epoch,id=current.id; setBusy(true); say(makePublic?'Publishing…':'Unpublishing…');
    try {
      const result=await rpc('np_set_publication',{entry_id:id,expected_version:current.version,make_public:makePublic});
      if(requestEpoch!==epoch) return; acceptEntries(result,id); say(makePublic?'Published. Visitors can now see this version.':'Unpublished. Your draft is still saved.');
      loadPublic();
    } catch(error){ if(requestEpoch===epoch) { if(error?.code==='42501') clearPrivate(messageFor(error)); else say(messageFor(error)); } }
    finally { if(requestEpoch===epoch) setBusy(false); }
  }
  $('np-entry-publish').addEventListener('click',()=>publish(true));
  $('np-entry-unpublish').addEventListener('click',()=>publish(false));
  $('np-editor-new').addEventListener('click',()=>{ if(!dirty||window.confirm('Discard the unsaved changes in this entry?')) {openEntry(null); $('np-entry-title').focus();} });
  $('np-editor-reload').addEventListener('click',()=>{ if(!dirty||window.confirm('Discard local changes and reload the saved entries?')) verifyEditor(); });
  $('np-portfolio-retry').addEventListener('click',loadPublic);
  window.addEventListener('beforeunload',event=>{if(authorized&&dirty){event.preventDefault(); event.returnValue='';}});
  function enter(page){ if(page==='portfolio') loadPublic(); if(page==='editor') verifyEditor(authorized); }
  root.addEventListener('np:viewchange',event=>enter(event.detail.page));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authorized) verifyEditor(true);});
  setInterval(()=>{if(authorized&&!document.hidden) verifyEditor(true);},60000);
  enter(root.dataset.currentPage);
})();
