/* UI contract tests use a mocked client; hosted SQL permission tests are separate. */
const {JSDOM,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(process.argv[2],'utf8').replace('await import(config.sdk_url)','await window.__testSDK');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
let passed=0;
async function test(label,fn){await fn();passed++;console.log('PASS: '+label);}
function setup({member=true,signed=false}={}){
 const state={member,signed,rows:[],publicRows:[],calls:[],imports:0,fetches:0,conflict:false,delay:null,authCallback:null};
 const client={auth:{
  getUser:async()=>({data:{user:state.signed?{id:'test-user',email:'editor@example.invalid'}:null},error:null}),
  signInWithPassword:async()=>{state.signed=true;return{data:{},error:null};},
  onAuthStateChange:fn=>{state.authCallback=fn;},
  signOut:async()=>{state.signed=false;state.authCallback('SIGNED_OUT',null);return{error:null};}
 },rpc:async(name,args)=>{
  state.calls.push({name,args});
  if(!state.member||!state.signed)return{error:{code:'42501'},data:null};
  if(name==='np_editor_entries')return{data:structuredClone(state.rows),error:null};
  if(state.delay)return state.delay;
  if(state.conflict)return{error:{code:'40001'},data:null};
  if(name==='np_save_entry'){
   let row=state.rows.find(x=>x.id===args.entry_id);
   if(!row){row={id:args.entry_id,version:0,published:false};state.rows.push(row);}
   row.draft=structuredClone(args.content);row.version++;row.has_changes=true;
  }
  if(name==='np_set_publication'){
   const row=state.rows.find(x=>x.id===args.entry_id);row.version++;row.published=args.make_public;row.has_changes=!args.make_public;
   state.publicRows=args.make_public?[{id:row.id,...structuredClone(row.draft)}]:[];
  }
  return{data:structuredClone(state.rows),error:null};
 },storage:{from:()=>({upload:async(path,file)=>{state.calls.push({name:'upload',path,type:file.type});return{error:null};},createSignedUrl:async()=>({data:{signedUrl:'https://uwbhjgvpaetrhfvcpvsg.supabase.co/storage/v1/object/sign/test'},error:null})})}};
 const virtualConsole=new VirtualConsole(); const errors=[]; virtualConsole.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(source,{url:'https://new-passage.example/',runScripts:'dangerously',virtualConsole,beforeParse(w){
  w.fetch=async()=>{state.fetches++;return{ok:true,json:async()=>structuredClone(state.publicRows)};};
  w.__testSDK={createClient:()=>{state.imports++;return client;}};
  w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:photo-test';w.URL.revokeObjectURL=()=>{};
 }});
 assert.deepEqual(errors,[]);
 const d=dom.window.document;
 const set=(id,value)=>{d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const click=id=>d.getElementById(id).click();
 const submit=id=>d.getElementById(id).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 const go=hash=>d.querySelector(`a[href="${hash}"]`).click();
 async function login(){go('#portfolio-editor');await tick();set('np-login-email','editor@example.invalid');set('np-login-password','not-a-real-password');submit('np-login-form');await tick();}
 return{dom,d,w:dom.window,state,set,click,submit,go,login};
}
(async()=>{
 await test('Home stays independent of Auth; service entrances remain available and portfolio loads on demand',async()=>{
  const t=setup();assert.equal(t.state.imports,0);assert.equal(t.state.fetches,0);
  assert.equal(t.d.querySelector('.yp-hero img'),null);
  assert.equal(t.d.querySelector('.np-mobile-services').getAttribute('href'),'#approach');
  assert.equal(t.d.getElementById('np-home-heading').textContent,'What comesnext?');
  t.go('#experience');await tick();assert.equal(t.state.fetches,1);assert.equal(t.state.imports,0);
  assert.match(t.d.getElementById('np-portfolio-list').textContent,/on its way/);t.dom.window.close();
 });
 await test('A valid Auth account without an editor role cannot open the private workspace',async()=>{
  const t=setup({member:false});await t.login();assert.equal(t.d.getElementById('np-editor-workspace').hidden,true);
  assert.equal(t.d.getElementById('np-login-password').value,'');assert.match(t.d.getElementById('np-editor-status').textContent,/does not have/);t.dom.window.close();
 });
 await test('Draft save and publication are separate, literal-text safe, and unsaved edits block publication',async()=>{
  const t=setup();await t.login();assert.equal(t.d.getElementById('np-editor-workspace').hidden,false);
  t.set('np-entry-title','<img src=x onerror=alert(1)>');t.set('np-entry-summary','A real summary about the experience.');t.set('np-entry-link','javascript:alert(1)');
  assert.equal(t.d.querySelector('#np-entry-preview img'),null);assert.equal(t.d.querySelector('#np-entry-preview a'),null);
  t.set('np-entry-link','https://example.com/work');t.submit('np-entry-form');await tick();assert.equal(t.state.publicRows.length,0);
  assert.equal(t.d.getElementById('np-entry-publish').disabled,false);
  t.click('np-entry-publish');await tick();assert.equal(t.state.publicRows[0].summary,'A real summary about the experience.');
  t.set('np-entry-summary','A second version that has not been published.');assert.equal(t.d.getElementById('np-entry-publish').disabled,true);assert.equal(t.d.getElementById('np-entry-unpublish').disabled,true);
  t.submit('np-entry-form');await tick();assert.equal(t.state.publicRows[0].summary,'A real summary about the experience.');
  t.click('np-entry-unpublish');await tick();assert.equal(t.state.publicRows.length,0);assert.equal(t.state.rows.length,1);t.dom.window.close();
 });
 await test('A stale save preserves the local text and offers recovery instead of claiming success',async()=>{
  const t=setup();await t.login();t.set('np-entry-title','Original entry');t.set('np-entry-summary','A summary for the original entry.');t.submit('np-entry-form');await tick();
  t.state.conflict=true;t.set('np-entry-summary','Keep this unsaved text.');t.submit('np-entry-form');await tick();
  assert.equal(t.d.getElementById('np-entry-summary').value,'Keep this unsaved text.');assert.match(t.d.getElementById('np-editor-status').textContent,/another tab/);
  assert.equal(t.d.getElementById('np-entry-publish').disabled,true);t.dom.window.close();
 });
 await test('Photo uploads are raster-only and are linked to a draft before publishing',async()=>{
  const t=setup();await t.login();t.set('np-entry-title','A workshop');t.set('np-entry-summary','A summary of a workshop and its purpose.');
  const input=t.d.getElementById('np-entry-image');
  Object.defineProperty(input,'files',{configurable:true,value:[new t.w.File(['<svg>'],'bad.svg',{type:'image/svg+xml'})]});input.dispatchEvent(new t.w.Event('change'));assert.match(t.d.getElementById('np-editor-status').textContent,/JPEG/);
  Object.defineProperty(input,'files',{configurable:true,value:[new t.w.File(['raster'],'photo.jpg',{type:'image/jpeg'})]});input.dispatchEvent(new t.w.Event('change'));
  t.set('np-entry-alt','Tim leading a workshop.');t.submit('np-entry-form');await tick();
  assert.equal(t.state.calls.filter(x=>x.name==='upload').length,1);assert.match(t.state.rows[0].draft.image_path,/\.jpg$/);assert.equal(t.state.publicRows.length,0);t.dom.window.close();
 });
 await test('Sign-out clears private content and ignores a save response arriving after sign-out',async()=>{
  const t=setup();await t.login();t.go('#practice');t.set('yp-plan','Keep my separate practice note.');t.go('#portfolio-editor');await tick();
  let resolve;t.state.delay=new Promise(r=>resolve=r);t.set('np-entry-title','Private draft');t.set('np-entry-summary','Private text must clear after sign-out.');t.submit('np-entry-form');await tick();
  t.click('np-editor-signout');await tick();resolve({data:[{id:'late',draft:{title:'Late private data'},version:1}],error:null});await tick();
  assert.equal(t.d.getElementById('np-editor-workspace').hidden,true);assert.equal(t.d.getElementById('np-entry-title').value,'');
  assert.equal(t.d.getElementById('np-editor-entries').textContent,'');assert.equal(t.d.getElementById('yp-plan').value,'Keep my separate practice note.');t.dom.window.close();
 });
 console.log(`${passed} portfolio UI checks passed. Mocked Auth does not verify real credentials or visual layout.`);
})().catch(error=>{console.error(error);process.exit(1);});
