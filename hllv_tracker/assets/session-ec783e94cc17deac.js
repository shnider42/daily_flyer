/* Session persistence only. Supabase verifies credentials and tokens. No passwords here.
   Unchecked: tab storage shared with other OPEN same-origin tabs. Checked: localStorage.
   A shared logout generation prevents dormant tabs from restoring a signed-out session. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HLLVSession=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const KEY='hllv-pilot-session',POLICY='hllv-auth-policy-v1',CHANNEL='hllv-auth-session-v1';
 function create(env=globalThis){
  const local=env.localStorage,tab=env.sessionStorage;
  const id=()=>env.crypto.randomUUID();
  const test=s=>{const k='hllv-storage-test-'+id();s.setItem(k,'1');s.removeItem(k);};
  test(tab);test(local);
  function policy(){let p;try{p=JSON.parse(local.getItem(POLICY));}catch(_){}if(!p||typeof p.epoch!=='string'||typeof p.remember!=='boolean'){p={epoch:id(),remember:false};local.setItem(POLICY,JSON.stringify(p));}return p;}
  let current=policy(),listener=()=>{},closed=false;
  const meta=KEY+'-generation';
  if(tab.getItem(KEY)&&!tab.getItem(meta))tab.setItem(meta,current.epoch);
  const pending=new Map();
  const channel=typeof env.BroadcastChannel==='function'?new env.BroadcastChannel(CHANNEL):null;
  const send=data=>{if(channel&&!closed)channel.postMessage(data);};
  const user=value=>{try{return JSON.parse(value)?.user?.id||null;}catch(_){return null;}};
  function refreshPolicy(){const next=policy();if(next.epoch!==current.epoch||tab.getItem(meta)!==next.epoch){tab.removeItem(KEY);tab.setItem(meta,next.epoch);}current=next;return next;}
  function read(){const p=refreshPolicy();return (p.remember?local:tab).getItem(KEY);}
  function put(value){const p=refreshPolicy();if(p.remember){local.setItem(KEY,value);tab.removeItem(KEY);}else{tab.setItem(KEY,value);tab.setItem(meta,p.epoch);local.removeItem(KEY);}}
  function notice(before,after){if(user(before)!==user(after)||Boolean(before)!==Boolean(after))listener();}
  if(channel)channel.onmessage=e=>{
   const m=e.data;if(!m||typeof m!=='object')return;
   if(m.type==='request'){
    const value=read();if(value&&m.epoch===current.epoch&&typeof m.request==='string')send({type:'response',request:m.request,epoch:current.epoch,value});return;
   }
   if(m.type==='response'){
    if(m.epoch!==policy().epoch||!pending.has(m.request)||typeof m.value!=='string')return;
    const resolve=pending.get(m.request);pending.delete(m.request);if(!read())put(m.value);resolve(read());return;
   }
   if(m.type==='sync'){
    if(m.epoch!==policy().epoch||typeof m.value!=='string')return;
    const before=read();put(m.value);notice(before,m.value);return;
   }
   if(m.type==='logout'){refreshPolicy();tab.removeItem(KEY);listener();}
  };
  const storageListener=e=>{if(e.key===POLICY){const prior=current.epoch;refreshPolicy();if(prior!==current.epoch)listener();}};
  env.addEventListener?.('storage',storageListener);
  return {
   key:KEY,
   remembered:()=>policy().remember,
   shareAvailable:()=>Boolean(channel),
   onChange:fn=>{listener=fn;},
   async setRemember(remember){
    const value=read();current={...policy(),remember:Boolean(remember)};local.setItem(POLICY,JSON.stringify(current));
    if(value){put(value);send({type:'sync',epoch:current.epoch,value});}
   },
   storage:{
    async getItem(key){
     if(key!==KEY)return tab.getItem(key);
     const value=read();if(value||!channel||closed)return value;
     const request=id();return new Promise(resolve=>{pending.set(request,resolve);send({type:'request',request,epoch:current.epoch});env.setTimeout(()=>{if(pending.has(request)){pending.delete(request);resolve(read());}},200);});
    },
    async setItem(key,value){
     if(key!==KEY){tab.setItem(key,value);return;}
     if(policy().epoch!==current.epoch)throw new Error('Session changed. Sign in again.');
     put(value);send({type:'sync',epoch:current.epoch,value});
    },
    async removeItem(key){
     if(key!==KEY){tab.removeItem(key);return;}
     current={epoch:id(),remember:policy().remember};local.removeItem(KEY);tab.removeItem(KEY);tab.setItem(meta,current.epoch);local.setItem(POLICY,JSON.stringify(current));send({type:'logout',epoch:current.epoch});
    }
   },
   destroy(){closed=true;channel?.close();env.removeEventListener?.('storage',storageListener);for(const resolve of pending.values())resolve(null);pending.clear();}
  };
 }
 return Object.freeze({create,KEY,POLICY});
});
