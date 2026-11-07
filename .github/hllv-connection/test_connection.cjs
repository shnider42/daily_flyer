'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../hllv-pilot/suggestions.js');
const c={enabled:false,connection_mode:'read_only',supabase_url:'https://qa-fixture.supabase.co',publishable_key:'sb_publishable_qa_fixture_only'};
test('only explicit read-only connection is accepted',()=>{
 assert.equal(E.validReadOnlyConfig(c),true);
 for(const invalid of [{...c,enabled:true},{...c,connection_mode:'pilot'},{...c,supabase_url:'https://attacker.example'},{...c,publishable_key:'sb_secret_not_for_browsers'}])assert.equal(E.validReadOnlyConfig(invalid),false);
 assert.equal(E.validConfig({...c,enabled:true,participant_contact:'test@example.invalid',retention_notice:'Synthetic notice with sufficient text.',policy_version:'pilot-2026-10-08'}),false);
});
test('read-only client cannot request a write or private RPC',async()=>{
 const client=E.readOnlyClient(c);
 assert.equal(client.auth,undefined);
 for(const method of ['hllv_submit','hllv_review','hllv_vote','hllv_queue','hllv_my_submissions']){
  const result=await client.rpc(method);assert.ok(result.error);assert.equal(result.data,null);
 }
});
