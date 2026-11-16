import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {makeTask, normalizeWorkspace, transitionTask} from '../public/model.mjs';

// Synthetic identities and Auth schema exist only in this isolated test DB.
// The migration itself neither creates accounts nor bypasses verification.
const ids={owner:'10000000-0000-4000-8000-000000000001',member:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',unverified:'10000000-0000-4000-8000-000000000004',anonymous:'10000000-0000-4000-8000-000000000005',banned:'10000000-0000-4000-8000-000000000006'};
const emails=Object.fromEntries(Object.keys(ids).map(name=>[name,`${name}@dayboard.invalid`]));
const NOW='2026-11-16T12:00:00.000Z';
let db;
before(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,email text,email_confirmed_at timestamptz,
      is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz,
      raw_user_meta_data jsonb default '{}'
    );
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
  `);
  for(const [name,id] of Object.entries(ids)) await db.query(
    'insert into auth.users(id,email,email_confirmed_at,is_anonymous,banned_until,raw_user_meta_data) values($1,$2,$3,$4,$5,$6)',
    [id,emails[name],name==='unverified'?null:NOW,name==='anonymous',name==='banned'?'2099-01-01T00:00:00.000Z':null,JSON.stringify({display_name:name,role:'owner'})]
  );
  const directory=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
  for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) await db.exec(readFileSync(`${directory}/${file}`,'utf8'));
});
after(async()=>{await db?.close();});

async function as(user,callback,{role='authenticated'}={}){
  return db.transaction(async tx=>{
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(user?{sub:ids[user],email:emails[user],role:'authenticated',user_metadata:{role:'owner'}}:{role})]);
    return callback(tx);
  });
}
async function rpc(user,name,args=[]){
  return as(user,async tx=>(await tx.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args.map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value))).rows[0].result);
}
const create=(owner='owner',request=crypto.randomUUID(),name='Shared test board')=>rpc(owner,'dayboard_create_workspace',[name,request]);
const snapshot=(workspace,user='owner')=>rpc(user,'dayboard_snapshot',[workspace]);
const commit=(workspace,changes,user='owner',request=crypto.randomUUID())=>rpc(user,'dayboard_commit',[workspace,request,changes]);
const put=(entity,value,expectedVersion=0,extras={})=>({entity,id:value.id,operation:'put',expectedVersion,value,...extras});
const remove=(entity,id,expectedVersion)=>({entity,id,operation:'delete',expectedVersion});
const task=(id,title=id,fields={})=>makeTask({id,title,area:'general',...fields},NOW);
const project=(id,area='general')=>({id,name:`Project ${id}`,area,url:'',description:'',starter:false,archived:false});
const pin=(id,pinned,expectedVersion=0)=>({entity:'pin',id,operation:'put',expectedVersion,value:{pinned}});
async function joined(){
  const board=await create();
  const invite=await rpc('owner','dayboard_invite',[board.workspace.id,emails.member]);
  await rpc('member','dayboard_accept_invite',[invite.token]);
  return {id:board.workspace.id,invite};
}
function code(expected){return error=>{assert.equal(error.code,expected,error.message);return true;};}

test('team APIs reject anonymous, unverified, banned, and missing identities and expose no direct write path',async()=>{
  for(const name of [null,'unverified','anonymous','banned']) await assert.rejects(create(name),code('42501'));
  await assert.rejects(as(null,tx=>tx.query('select public.dayboard_workspaces()'),{role:'anon'}),code('42501'));
  const {rows}=await db.query(`select
    has_table_privilege('authenticated','public.dayboard_workspaces','insert') as public_write,
    has_table_privilege('authenticated','dayboard_private.tasks','select') as private_read,
    has_function_privilege('anon','public.dayboard_snapshot(uuid)','execute') as anonymous_rpc,
    has_function_privilege('authenticated','dayboard_private.lock_workspace(uuid,boolean)','execute') as internal_lock,
    (select bool_and(not p.prosecdef) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dayboard_%') as invoker_wrappers,
    (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='dayboard_private' or c.relname='dayboard_workspaces')) as rls_enabled`);
  assert.deepEqual(rows[0],{public_write:false,private_read:false,anonymous_rpc:false,internal_lock:false,invoker_wrappers:true,rls_enabled:true});
});

test('workspace creation is idempotent, has a valid empty catalog, and list/RLS reads are membership scoped',async()=>{
  const request=crypto.randomUUID();
  const first=await create('owner',request,'  First team  ');
  const second=await create('owner',request,'First team');
  assert.equal(second.workspace.id,first.workspace.id);
  assert.equal(first.workspace.role,'owner');
  assert.equal(first.workspace.name,'First team');
  assert.deepEqual(first.data.areas,[{id:'general',name:'General',color:'blue'}]);
  assert.deepEqual(first.data.tasks,[]);
  assert.deepEqual(normalizeWorkspace(first.data).areas,first.data.areas);
  await assert.rejects(create('owner',request,'Changed request'),code('22023'));
  const other=await create('other');
  const lists=await rpc('owner','dayboard_workspaces');
  assert(lists.some(item=>item.id===first.workspace.id));
  assert(!lists.some(item=>item.id===other.workspace.id));
  const ownRows=await as('owner',tx=>tx.query('select id from public.dayboard_workspaces'));
  assert(!ownRows.rows.some(row=>row.id===other.workspace.id));
  await assert.rejects(snapshot(other.workspace.id),code('42501'));
  await assert.rejects(commit(other.workspace.id,[]),code('42501'));
});

test('invitations preview only for the bound verified email and join is explicit and idempotent',async()=>{
  const board=await create();const id=board.workspace.id;
  const invite=await rpc('owner','dayboard_invite',[id,emails.member.toUpperCase()]);
  assert.match(invite.token,/^[a-f0-9]{64}$/);
  const stored=(await db.query('select token_hash from dayboard_private.invitations where id=$1',[invite.id])).rows[0].token_hash;
  assert.notEqual(stored,invite.token);
  await assert.rejects(rpc('other','dayboard_invitation_preview',[invite.token]),code('42501'));
  await assert.rejects(rpc('other','dayboard_accept_invite',[invite.token]),code('42501'));
  const preview=await rpc('member','dayboard_invitation_preview',[invite.token]);
  assert.equal(preview.workspaceName,board.workspace.name);
  assert.equal(preview.email,emails.member);
  assert.equal(preview.alreadyJoined,false);
  await assert.rejects(snapshot(id,'member'),code('42501'));
  const accepted=await rpc('member','dayboard_accept_invite',[invite.token]);
  assert.equal(accepted.workspace.role,'member');
  assert.equal(accepted.members.length,2);
  assert.equal((await rpc('member','dayboard_accept_invite',[invite.token])).workspace.revision,accepted.workspace.revision);
  await assert.rejects(rpc('member','dayboard_invite',[id,emails.other]),code('42501'));
  await assert.rejects(rpc('member','dayboard_invitations',[id]),code('42501'));
});

test('revoked and expired invitations fail, and pending invitation replacement revokes the earlier link',async()=>{
  const {workspace:{id}}=await create();
  const old=await rpc('owner','dayboard_invite',[id,emails.member]);
  const next=await rpc('owner','dayboard_invite',[id,emails.member]);
  await assert.rejects(rpc('member','dayboard_accept_invite',[old.token]),code('42501'));
  await rpc('owner','dayboard_revoke_invite',[id,next.id]);
  await assert.rejects(rpc('member','dayboard_accept_invite',[next.token]),code('42501'));
  const expired=await rpc('owner','dayboard_invite',[id,emails.member]);
  await db.query("update dayboard_private.invitations set expires_at=now()-interval '1 second' where id=$1",[expired.id]);
  await assert.rejects(rpc('member','dayboard_invitation_preview',[expired.token]),code('42501'));
});

test('independent edits survive, same-record stale edits fail, and retry receipts never duplicate or replay an old write',async()=>{
  const {id}=await joined();
  const seeded=await commit(id,[put('task',task('a')),put('task',task('b'))]);
  const a=seeded.data.tasks.find(item=>item.id==='a'),b=seeded.data.tasks.find(item=>item.id==='b');
  const request=crypto.randomUUID();
  const aChanges=[put('task',{...a,title:'Owner changed A'},seeded.versions.tasks.a)];
  const first=await commit(id,aChanges,'owner',request);
  const second=await commit(id,[put('task',{...b,title:'Member changed B'},seeded.versions.tasks.b)],'member');
  assert.equal(second.data.tasks.find(item=>item.id==='a').title,'Owner changed A');
  assert.equal(second.data.tasks.find(item=>item.id==='b').title,'Member changed B');
  await assert.rejects(commit(id,[put('task',{...a,title:'Stale edit'},1)],'member'),code('40001'));
  const currentA=second.data.tasks.find(item=>item.id==='a');
  await commit(id,[put('task',{...currentA,title:'A newer member edit'},2)],'member');
  const replay=await commit(id,aChanges,'owner',request);
  assert.equal(replay.receipt.replayed,true);
  assert.equal(replay.receipt.versions.tasks.a,first.receipt.versions.tasks.a);
  assert.equal(replay.versions.tasks.a,3);
  assert.equal(replay.data.tasks.find(item=>item.id==='a').title,'A newer member edit');
  assert.equal(replay.data.tasks.length,2);
  await assert.rejects(commit(id,[put('task',task('different'))],'owner',request),code('22023'));
  assert.deepEqual(replay.audit.a,{createdBy:ids.owner,updatedBy:ids.member});
});

test('task numbering is server allocated and task timestamps normalize into the existing model',async()=>{
  const {workspace:{id}}=await create();
  const result=await commit(id,[put('task',task('first','First',{number:500,createdAt:NOW})),put('task',task('second','Second',{number:500}))]);
  assert.deepEqual(result.data.tasks.map(item=>item.number),[1,2]);
  const normalized=normalizeWorkspace(result.data);
  assert.equal(normalized.tasks.length,2);
  assert.match(result.data.updatedAt,/\.\d{3}Z$/);
  assert.notEqual(normalized.tasks[0].createdAt,NOW);
  const changed=await commit(id,[put('task',{...result.data.tasks[0],number:900,createdAt:'2001-01-01T00:00:00.000Z'},1)]);
  assert.equal(changed.data.tasks[0].number,1);
  assert.equal(changed.data.tasks[0].createdAt,result.data.tasks[0].createdAt);
});

test('Today selections are personal, versioned, and removed from completed shared tasks',async()=>{
  const {id}=await joined();
  let board=await commit(id,[put('task',task('pinned'))]);
  board=await commit(id,[pin('pinned',true)]);
  assert.equal(board.data.tasks[0].today,true);
  assert.equal((await snapshot(id,'member')).data.tasks[0].today,false);
  await commit(id,[pin('pinned',true)],'member');
  const done=await commit(id,[put('task',{...board.data.tasks[0],status:'done',completedAt:NOW,today:false},1),pin('pinned',false,1)]);
  assert.equal(done.data.tasks[0].today,false);
  assert.equal((await snapshot(id,'member')).data.tasks[0].today,false);
  assert.equal(done.versions.pins.pinned,2);
  assert.equal((await snapshot(id,'member')).versions.pins.pinned,2);
  assert(!done.activity.some(item=>item.entity==='pin'),'shared activity does not expose personal shortlist actions');
  await assert.rejects(commit(id,[pin('pinned',true,1)],'member'),code('40001'));
});

test('deleting a pinned task and its pin is atomic in either order and can be conditionally undone',async()=>{
  const {workspace:{id}}=await create();
  const seeded=await commit(id,[put('task',task('first-pin')),pin('first-pin',true),put('task',task('second-pin')),pin('second-pin',true)]);
  const deleted=await commit(id,[remove('task','first-pin',1),remove('pin','first-pin',1),pin('second-pin',false,1),remove('task','second-pin',1)]);
  assert.equal(deleted.data.tasks.length,0);
  assert.deepEqual(deleted.receipt.versions.pins,{'first-pin':2,'second-pin':2});
  const restored=await commit(id,[put('task',seeded.data.tasks[0],deleted.receipt.versions.tasks['first-pin']),pin('first-pin',true,deleted.receipt.versions.pins['first-pin'])]);
  assert.equal(restored.data.tasks[0].today,true);
  assert.equal(restored.data.tasks[0].number,seeded.data.tasks[0].number);
});

test('area renames preserve tab order and browser string normalization cannot make snapshots unreadable',async()=>{
  const {workspace:{id}}=await create();
  await commit(id,[put('area',{id:'work',name:'Work',color:'amber'}),put('area',{id:'life',name:'Life',color:'green'})]);
  // Timestamp precision must not turn insertion order into alphabetical order.
  await db.query('update dayboard_private.areas set created_at=$2 where workspace_id=$1',[id,NOW]);
  const renamed=await commit(id,[put('area',{id:'general',name:'\t General team \u00a0',color:'blue'},1)]);
  assert.deepEqual(renamed.data.areas.map(item=>item.id),['general','work','life']);
  assert.equal(renamed.data.areas[0].name,'General team');
  const normal=await commit(id,[put('task',{...task('unicode'),title:'😀'.repeat(250),checklist:[{id:' step ',text:'\t Finish \n',done:false}]})]);
  assert.deepEqual(normalizeWorkspace(normal.data).tasks,normal.data.tasks);
  for(const value of [
    {...task('too-long'),title:'😀'.repeat(251)},
    {...task('empty'),title:'\u00a0\t\uFEFF'},
    {...task('bad-id'),id:' bad-id '},
    {...task('duplicate-step'),checklist:[{id:'x',text:'One',done:false},{id:' x ',text:'Two',done:false}]},
  ]) await assert.rejects(commit(id,[put('task',value)]),code('22023'));
});

test('action-level undo preserves unrelated work and cannot overwrite a later edit to its affected record',async()=>{
  const {id}=await joined();
  const seeded=await commit(id,[put('task',task('undo-a')),put('task',task('undo-b'))]);
  const original=seeded.data.tasks.find(item=>item.id==='undo-a');
  const edit=await commit(id,[put('task',{...original,status:'doing'},1)]);
  await commit(id,[put('task',{...seeded.data.tasks.find(item=>item.id==='undo-b'),title:'Keep teammate edit'},1)],'member');
  const undone=await commit(id,[put('task',original,edit.receipt.versions.tasks['undo-a'])]);
  assert.equal(undone.data.tasks.find(item=>item.id==='undo-a').status,'inbox');
  assert.equal(undone.data.tasks.find(item=>item.id==='undo-b').title,'Keep teammate edit');
  await assert.rejects(commit(id,[put('task',original,edit.receipt.versions.tasks['undo-a'])]),code('40001'));
  const deleted=await commit(id,[remove('task','undo-a',undone.versions.tasks['undo-a'])]);
  assert(!deleted.data.tasks.some(item=>item.id==='undo-a'));
  assert.equal(deleted.versions.tasks['undo-a'],4);
  const restored=await commit(id,[put('task',original,deleted.versions.tasks['undo-a'])]);
  assert.equal(restored.data.tasks.find(item=>item.id==='undo-a').number,original.number);
});

test('cross-workspace references, mismatched projects, invalid assignees, malformed values, and final area removal are atomic failures',async()=>{
  const {workspace:{id}}=await create();
  const {workspace:{id:otherId}}=await create('other');
  await commit(otherId,[put('area',{id:'elsewhere',name:'Elsewhere',color:'rose'}),put('project',project('foreign','elsewhere'))],'other');
  const baseline=await snapshot(id);
  const invalidBatches=[
    [put('task',task('bad-area','Bad',{area:'elsewhere'}))],
    [put('task',task('bad-project','Bad',{projectId:'foreign'}))],
    [put('task',task('bad-assignee'),0,{assigneeId:ids.other})],
    [put('task',{...task('bad-status'),status:'unknown'})],
    [put('task',{...task('bad-url'),url:'javascript:alert(1)'})],
    [put('task',{...task('bad-credentials'),url:'https://user:pass@example.com'})],
    [put('task',{...task('bad-ipv6'),url:'https://[face]/'})],
    [put('task',{...task('bad-ipv4'),url:'https://999.1.1.1/'})],
    [put('task',{...task('bad-numeric-host'),url:'https://foo.42/'})],
    [put('task',{...task('bad-date'),due:'2026-02-30'})],
    [put('task',{...task('bad-keys'),workspace_id:otherId})],
    [put('area',{id:'bad-area',name:'General',color:'blue'})],
    [remove('area','general',1)],
    [put('area',{id:'another',name:'Another',color:'teal'}),put('project',project('wrong-area','another')),put('task',task('project-mismatch','Bad',{projectId:'wrong-area'}))],
    [put('task',task('valid-first')),put('task',{...task('invalid-later'),priority:'urgent'})],
  ];
  for(const changes of invalidBatches){
    await assert.rejects(commit(id,changes));
    assert.deepEqual((await snapshot(id)).data,baseline.data,'a rejected batch must leave the workspace unchanged');
  }
});

test('project area changes and their task references move together or roll back together',async()=>{
  const {workspace:{id}}=await create();
  const seeded=await commit(id,[put('area',{id:'work',name:'Work',color:'amber'}),put('project',project('project')),put('task',task('project-task','Task',{projectId:'project'}))]);
  await assert.rejects(commit(id,[put('project',{...seeded.data.projects[0],area:'work'},1)]),code('22023'));
  const moved=await commit(id,[put('project',{...seeded.data.projects[0],area:'work'},1),put('task',{...seeded.data.tasks[0],area:'work'},1)]);
  assert.equal(moved.data.projects[0].area,'work');
  assert.equal(moved.data.tasks[0].area,'work');
});

test('recurring completion, successor creation, request retry, and a competing completion remain one atomic change',async()=>{
  const {id}=await joined();
  const seeded=await commit(id,[put('task',task('repeat-parent','Repeat',{repeat:'weekly',due:'2026-11-16',status:'next'}))]);
  const draft=structuredClone(normalizeWorkspace(seeded.data));
  transitionTask(draft,'repeat-parent','done',{today:'2026-11-16',now:NOW});
  const parent=draft.tasks.find(item=>item.id==='repeat-parent'),next=draft.tasks.find(item=>item.id===parent.repeatNextId);
  const changes=[put('task',parent,1),put('task',next)];const request=crypto.randomUUID();
  const completed=await commit(id,changes,'owner',request);
  assert.equal(completed.data.tasks.length,2);
  assert.equal((await commit(id,changes,'owner',request)).data.tasks.length,2);
  const competingNext={...next,id:'competing-next'};
  await assert.rejects(commit(id,[put('task',competingNext),put('task',{...parent,repeatNextId:competingNext.id},1)],'member'),code('40001'));
  assert.equal((await snapshot(id)).data.tasks.length,2);
  const restored=await commit(id,[put('task',seeded.data.tasks[0],2),remove('task',next.id,1)]);
  assert.equal(restored.data.tasks.length,1);
  assert.equal(restored.data.tasks[0].status,'next');
});

test('removing a member revokes reads, writes, realtime metadata, and old invitations while preserving work',async()=>{
  const {id,invite}=await joined();
  const seeded=await commit(id,[put('task',task('assigned'),0,{assigneeId:ids.member})]);
  await commit(id,[pin('assigned',true)],'member');
  await assert.rejects(rpc('member','dayboard_remove_member',[id,ids.owner]),code('42501'));
  await assert.rejects(rpc('owner','dayboard_remove_member',[id,ids.owner]),code('22023'));
  const removed=await rpc('owner','dayboard_remove_member',[id,ids.member]);
  assert.equal(removed.data.tasks.length,1);
  assert.equal(removed.assignees.assigned,null);
  assert.equal(removed.versions.tasks.assigned,seeded.versions.tasks.assigned+1);
  await assert.rejects(snapshot(id,'member'),code('42501'));
  await assert.rejects(commit(id,[],'member'),code('42501'));
  await assert.rejects(rpc('member','dayboard_accept_invite',[invite.token]),code('42501'));
  assert.equal((await as('member',tx=>tx.query('select id from public.dayboard_workspaces where id=$1',[id]))).rows.length,0);
  assert.equal((await rpc('member','dayboard_workspaces')).some(workspace=>workspace.id===id),false);
});
