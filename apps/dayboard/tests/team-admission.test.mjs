import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {makeTask} from '../public/model.mjs';

// Synthetic identities only. These tests execute every production migration,
// including an initially empty approval registry, under actual database roles.
const NOW='2026-11-16T12:00:00.000Z';
let db;
before(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role supabase_auth_admin nologin;
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
  const directory=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
  for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) await db.exec(readFileSync(`${directory}/${file}`,'utf8'));
});
after(async()=>{await db?.close();});

async function identity(email=`person-${crypto.randomUUID()}@dayboard.invalid`){
  const user={id:crypto.randomUUID(),email};
  await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',
    [user.id,user.email,NOW,JSON.stringify({role:'owner',organizer:true,workspace_limit:100})]);
  return user;
}
async function as(role,user,callback,claims={}){
  assert(['anon','authenticated','supabase_auth_admin'].includes(role));
  return db.transaction(async tx=>{
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({...user,sub:user?.id,role,...claims})]);
    return callback(tx);
  });
}
async function rpc(user,name,args=[]){
  return as('authenticated',user,async tx=>(await tx.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,
    args.map(value=>typeof value==='object'&&value!==null?JSON.stringify(value):value))).rows[0].result);
}
const create=(user,request=crypto.randomUUID(),name='Synthetic pilot board')=>rpc(user,'dayboard_create_workspace',[name,request]);
const capabilities=user=>rpc(user,'dayboard_capabilities');
const snapshot=(user,id)=>rpc(user,'dayboard_snapshot',[id]);
async function approve(user,limit){
  if(limit===undefined) await db.query('insert into dayboard_private.organizer_approvals(email) values($1)',[user.email]);
  else await db.query('insert into dayboard_private.organizer_approvals(email,workspace_limit) values($1,$2)',[user.email,limit]);
}
async function hook(email,fields={}){
  const event={user:{id:crypto.randomUUID(),email,is_anonymous:false,...fields}};
  return as('supabase_auth_admin',null,async tx=>(await tx.query('select dayboard_private.before_user_created($1::jsonb) as result',[JSON.stringify(event)])).rows[0].result);
}
function code(expected){return error=>{assert.equal(error.code,expected,error.message);return true;};}
const put=(entity,value)=>({entity,id:value.id,operation:'put',expectedVersion:0,value});

test('the pilot starts closed and profile metadata cannot create an organizer',async()=>{
  assert.equal((await db.query('select count(*)::int as count from dayboard_private.organizer_approvals')).rows[0].count,0);
  const user=await identity();
  assert.deepEqual(await capabilities(user),{mayCreateWorkspace:false,workspaceLimit:0,ownedWorkspaceCount:0});
  await assert.rejects(create(user),code('42501'));
  await assert.rejects(as('authenticated',user,tx=>tx.query('select dayboard_private.create_workspace($1,$2)', ['Direct call',crypto.randomUUID()])),code('42501'));
  assert.equal((await db.query('select count(*)::int as count from public.dayboard_workspaces')).rows[0].count,0);
  await assert.rejects(as('anon',null,tx=>tx.query('select public.dayboard_capabilities()')),code('42501'));
  await assert.rejects(as('anon',null,tx=>tx.query('select public.dayboard_create_workspace($1,$2)',['Anonymous',crypto.randomUUID()])),code('42501'));
});

test('the invoker signup hook rejects unrelated, anonymous, and malformed requests with one generic response',async()=>{
  const rejected=await hook('unrelated@dayboard.invalid',{user_metadata:{role:'owner',organizer:true}});
  assert.equal(rejected.error.http_code,403);
  assert(!JSON.stringify(rejected).includes('unrelated@dayboard.invalid'));
  for(const email of [null,'','missing-domain','other@dayboard.invalid']) assert.deepEqual(await hook(email),rejected);
  const organizer=await identity();
  await approve(organizer);
  assert.deepEqual(await hook(`  ${organizer.email.toUpperCase()}  `),{});
  assert.deepEqual(await hook(organizer.email,{is_anonymous:true}),rejected);
  assert.deepEqual(await hook(organizer.email,{is_anonymous:'false'}),rejected);
  await db.query('update dayboard_private.organizer_approvals set enabled=false where email=$1',[organizer.email]);
  assert.deepEqual(await hook(organizer.email),rejected);
});

test('current pending email-bound invitations admit signup; wrong, revoked, expired, and consumed invitations do not',async()=>{
  const owner=await identity();await approve(owner);
  const {workspace:{id}}=await create(owner);
  const member=await identity();
  const rejected=await hook('not-invited@dayboard.invalid');
  const invite=await rpc(owner,'dayboard_invite',[id,member.email]);
  assert.deepEqual(await hook(member.email),{});
  assert.deepEqual(await hook(`wrong-${member.email}`),rejected);
  await rpc(owner,'dayboard_revoke_invite',[id,invite.id]);
  assert.deepEqual(await hook(member.email),rejected);
  const expired=await rpc(owner,'dayboard_invite',[id,member.email]);
  await db.query("update dayboard_private.invitations set expires_at=now()-interval '1 second' where id=$1",[expired.id]);
  assert.deepEqual(await hook(member.email),rejected);
  const current=await rpc(owner,'dayboard_invite',[id,member.email]);
  assert.deepEqual(await hook(member.email),{});
  assert.equal((await rpc(member,'dayboard_workspaces')).length,0,'admission does not itself join a board');
  await assert.rejects(snapshot(member,id),code('42501'));
  await rpc(member,'dayboard_accept_invite',[current.token]);
  assert.deepEqual(await hook(member.email),rejected,'a consumed invitation is not new-account admission');
  assert.equal((await snapshot(member,id)).workspace.role,'member');
  assert.deepEqual(await capabilities(member),{mayCreateWorkspace:false,workspaceLimit:0,ownedWorkspaceCount:0});
  await assert.rejects(create(member),code('42501'));
});

test('verified approved organizers have a server-enforced default quota, and retries allocate no extra workspaces',async()=>{
  const owner=await identity();await approve(owner);
  assert.deepEqual(await capabilities(owner),{mayCreateWorkspace:true,workspaceLimit:3,ownedWorkspaceCount:0});
  const request=crypto.randomUUID();
  const first=await create(owner,request);
  await create(owner);await create(owner);
  assert.deepEqual(await capabilities(owner),{mayCreateWorkspace:false,workspaceLimit:3,ownedWorkspaceCount:3});
  await assert.rejects(create(owner),code('22023'));
  assert.equal((await create(owner,request)).workspace.id,first.workspace.id);
  assert.equal((await rpc(owner,'dayboard_workspaces')).length,3);
  await db.query('update dayboard_private.organizer_approvals set workspace_limit=4,updated_at=now() where email=$1',[owner.email]);
  assert.equal((await capabilities(owner)).mayCreateWorkspace,true);
  await create(owner);
  await assert.rejects(create(owner),code('22023'));
  const unapproved=await identity();
  await assert.rejects(as('authenticated',unapproved,tx=>tx.query('select public.dayboard_create_workspace($1,$2)',['Forged approval',crypto.randomUUID()]),
    {email:owner.email,user_metadata:{role:'owner',organizer:true}}),code('42501'));
});

test('disabling organizer approval stops new creation while preserving existing memberships and successful retries',async()=>{
  const owner=await identity();await approve(owner);
  const request=crypto.randomUUID();const board=await create(owner,request);
  await db.query('update dayboard_private.organizer_approvals set enabled=false,updated_at=now() where email=$1',[owner.email]);
  assert.deepEqual(await capabilities(owner),{mayCreateWorkspace:false,workspaceLimit:0,ownedWorkspaceCount:1});
  await assert.rejects(create(owner),code('42501'));
  assert.equal((await snapshot(owner,board.workspace.id)).workspace.id,board.workspace.id);
  assert.equal((await create(owner,request)).workspace.id,board.workspace.id);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[owner.id]);
  await assert.rejects(snapshot(owner,board.workspace.id),code('42501'));
  await assert.rejects(capabilities(owner),code('42501'));
  await assert.rejects(create(owner,request),code('42501'));
});

test('browser roles cannot read or change operator records or call the Auth hook, and Auth gets only admission columns',async()=>{
  const user=await identity();
  for(const role of ['anon','authenticated']){
    for(const query of [
      'select * from dayboard_private.organizer_approvals',
      'select * from dayboard_private.host_inventory',
      "insert into dayboard_private.organizer_approvals(email) values('self-approved@dayboard.invalid')",
      "select dayboard_private.before_user_created('{}'::jsonb)",
    ]) await assert.rejects(as(role,user,tx=>tx.query(query)),code('42501'));
  }
  await assert.rejects(as('supabase_auth_admin',null,tx=>tx.query('select token_hash from dayboard_private.invitations')),code('42501'));
  await assert.rejects(as('supabase_auth_admin',null,tx=>tx.query('select workspace_limit from dayboard_private.organizer_approvals')),code('42501'));
  await assert.rejects(as('supabase_auth_admin',null,tx=>tx.query('update dayboard_private.organizer_approvals set enabled=true')),code('42501'));
  await assert.rejects(as('supabase_auth_admin',null,tx=>tx.query('select * from dayboard_private.host_inventory')),code('42501'));
  const {rows}=await db.query(`select
    (select not prosecdef from pg_proc where oid='dayboard_private.before_user_created(jsonb)'::regprocedure) as hook_invoker,
    (select not prosecdef from pg_proc where oid='public.dayboard_capabilities()'::regprocedure) as rpc_invoker,
    (select relrowsecurity from pg_class where oid='dayboard_private.organizer_approvals'::regclass) as registry_rls,
    (select 'security_invoker=true'=any(reloptions) from pg_class where oid='dayboard_private.host_inventory'::regclass) as inventory_invoker`);
  assert.deepEqual(rows[0],{hook_invoker:true,rpc_invoker:true,registry_rls:true,inventory_invoker:true});
});

test('operator inventory reports accurate live and retained metadata without task bodies or invitation credentials',async()=>{
  const owner=await identity();await approve(owner);
  const {workspace:{id}}=await create(owner);
  const member=await identity();const invite=await rpc(owner,'dayboard_invite',[id,member.email]);
  await rpc(member,'dayboard_accept_invite',[invite.token]);
  const pending=await rpc(owner,'dayboard_invite',[id,'pending-inventory@dayboard.invalid']);
  const secret='Private body excluded from the operator inventory';
  await rpc(owner,'dayboard_commit',[id,crypto.randomUUID(),[
    put('area',{id:'second',name:'Second',color:'green'}),
    put('project',{id:'project',name:'Project',area:'general',url:'',description:secret,starter:false,archived:false}),
    put('task',makeTask({id:'keep',title:secret,area:'general',projectId:'project'},NOW)),
    put('task',makeTask({id:'remove',title:secret,area:'general'},NOW)),
  ]]);
  await rpc(owner,'dayboard_commit',[id,crypto.randomUUID(),[{entity:'task',id:'remove',operation:'delete',expectedVersion:1}]]);
  const row=(await db.query('select * from dayboard_private.host_inventory where workspace_id=$1',[id])).rows[0];
  assert.equal(row.owner_id,owner.id);assert.equal(row.owner_email,owner.email);
  for(const [key,expected] of Object.entries({member_count:2,pending_invitation_count:1,invitation_history_count:2,
    task_count:1,project_count:1,area_count:2,removed_record_count:1,receipt_count:3,activity_count:7})) assert.equal(Number(row[key]),expected,key);
  assert(Number(row.live_model_bytes)>0);
  assert(Number(row.retained_model_bytes)>Number(row.live_model_bytes),'removed task payload remains accounted for');
  assert(row.last_activity_at);
  for(const hidden of [secret,invite.token,pending.token,'token_hash','"value"']) assert(!JSON.stringify(row).includes(hidden));
  assert.equal(Object.keys(row).some(key=>/body|notes|token|hash/.test(key)),false);
});
