/* Account forms use the existing, verified Supabase user. No registration/admin API. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HLLVPassword=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let recovery=false,active=null,nextMail=0;
 const knownRole=r=>['participant','moderator','reviewer'].includes(r);
 function errorText(error,operation){
  const code=error?.code;
  if(code==='over_email_send_rate_limit')return 'Email sending is temporarily rate-limited. Password sign-in does not send an email. An unused, unexpired code can still be entered below.';
  if(error?.status===429)return 'Too many requests. Pause before trying this action again.';
  if(operation==='password-save'){
   if(code==='weak_password')return 'Supabase rejected this password as too weak. Choose a stronger, unique password.';
   if(code==='same_password')return 'That is already your current password. Choose a different one to change it.';
   if(['reauthentication_needed','reauthentication_not_valid','session_not_found'].includes(code))return 'Please sign in again before changing your password. Use your existing password or the email-link option.';
   if(code==='invalid_credentials')return 'The current password was not accepted.';
   return 'The password update could not be confirmed. Your account and moderator permissions have not been replaced. Try signing in with the new password before requesting a reset.';
  }
  if(operation==='password-login')return 'Sign-in was not confirmed. Check your email and password, or use the email-link option if you have not set a site password yet.';
  if(operation==='verify')return 'The code was not accepted. Use the newest unused code for the email address shown.';
  return 'The email request could not be confirmed. Check the inbox before requesting another message.';
 }
 function notifyOpen(target){document.dispatchEvent(new CustomEvent('hllv-account-open',{detail:target}));}
 function status({profile=null,email='',available=true,checking=false}={}){
  const host=document.getElementById('hllvAccountBar');if(!host)return;
  if(checking){host.innerHTML='<span role="status">Checking sign-in…</span>';return;}
  if(!available){host.innerHTML='<span>Sign-in unavailable. The patch archive and bug tracker remain readable.</span>';return;}
  const signed=profile&&knownRole(profile.role);
  host.innerHTML=signed?`<span><strong>Signed in</strong> · ${esc(email)} · ${esc(profile.role)}</span><div class="account-bar-actions">${['moderator','reviewer'].includes(profile.role)?'<button type="button" data-account="review">Review desk</button>':''}<button type="button" data-account="password">Account &amp; password</button><button type="button" id="globalSignOut">Sign out</button></div>`:'<span>Not signed in</span><button type="button" data-account="sign-in">Sign in</button>';
  host.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>notifyOpen(b.dataset.account));
  const out=host.querySelector('#globalSignOut');if(out)out.onclick=()=>document.dispatchEvent(new Event('hllv-account-signout'));
 }
 function open(target='sign-in'){
  if(!active)return;
  const host=active;
  const panel=host.querySelector(target==='password'?'#sgSecurity':'#sgSignIn');
  if(panel){panel.open=true;panel.scrollIntoView({block:'start',behavior:'instant'});panel.querySelector('input:not([type="hidden"])')?.focus({preventScroll:true});}
 }
 function markRecovery(value){recovery=Boolean(value);}
 function mount({container,client,profile,email='',persistence,onIdentity,signOut,isCurrent=()=>true}){
  active=container;const find=id=>container.querySelector('#'+id);const live=()=>container.isConnected&&isCurrent();let busy=false;
  const message=(value,bad=false)=>{if(!live())return;const box=find('authFeedback');if(box){box.textContent=value;box.dataset.error=String(bad);box.setAttribute('tabindex','-1');box.focus({preventScroll:true});}};
  const policyNote=persistence.shareAvailable()?'Unchecked: available across open tabs in this browser. Checked: also keep the session after reopening this browser.':'This browser cannot share temporary sessions across tabs. Choose Keep me signed in for persistent access.';
  const remember=`<label class="sg-check"><input id="authRemember" name="remember" type="checkbox" ${persistence.remembered()?'checked':''}><span>Keep me signed in on this device</span></label><p class="sg-muted">${esc(policyNote)} Use only on a device you trust. Browser privacy settings or session expiry can still sign you out.</p>`;
  const feedback='<p id="authFeedback" class="auth-feedback" role="status" aria-live="polite"></p>';
  status({profile,email});
  if(profile){
   container.innerHTML=`<p><strong>Signed in as an invited ${esc(profile.role)}</strong> · ${esc(email)}</p>${feedback}<details id="sgSecurity" ${recovery?'open':''}><summary>${recovery?'Choose your new password':'Set or change your site password'}</summary><p>This password is for Infierno Liberado, not your email mailbox, GitHub, or Supabase dashboard. Your existing account and permissions stay the same.</p><form class="sg-form" id="sgSetPassword"><input type="text" name="username" autocomplete="username" value="${esc(email)}" hidden><label for="sgCurrentPassword">Current site password (leave blank when setting your first password or using a recovery link)</label><input id="sgCurrentPassword" type="password" name="current_password" autocomplete="current-password"><label for="sgNewPassword">New site password · at least 12 characters</label><input id="sgNewPassword" type="password" name="new_password" autocomplete="new-password" minlength="12" required><label for="sgConfirmPassword">Confirm new password</label><input id="sgConfirmPassword" type="password" name="confirmation" autocomplete="new-password" minlength="12" required>${remember}<div class="sg-actions"><button class="sg-button" type="submit">Save password</button></div></form></details><div class="sg-actions"><button class="sg-button secondary" id="sgSignOut" type="button">Sign out</button></div>`;
   find('sgSignOut').onclick=signOut;
   find('sgSetPassword').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const form=e.target,password=find('sgNewPassword').value,confirmation=find('sgConfirmPassword').value,current=find('sgCurrentPassword').value;
    if(password!==confirmation){message('The two new passwords do not match.',true);return;}
    if([...password].length<12){message('Use at least 12 characters for your site password.',true);return;}
    busy=true;e.submitter.disabled=true;message('Saving your password…');
    try{
     const checked=await client.auth.getUser();if(checked.error||!checked.data?.user||checked.data.user.email!==email)throw new Error('Session changed');
     if(!live())return;
     const attributes={password};if(current)attributes.current_password=current;
     const result=await client.auth.updateUser(attributes);if(result.error)throw result.error;
     if(result.data?.user?.id!==checked.data.user.id)throw new Error('Unexpected account result');
     if(!live())return;
     try{await persistence.setRemember(find('authRemember').checked);}catch(_){message('Password saved. This browser could not change its keep-signed-in setting.',true);return;}
     recovery=false;message('✓ Password saved for your existing account. Use your email and this site password next time—no sign-in email needed.');
    }catch(error){message(errorText(error,'password-save'),true);}
    finally{form.querySelectorAll('input[type="password"]').forEach(x=>x.value='');busy=false;if(e.submitter.isConnected)e.submitter.disabled=false;}
   };
   return;
  }
  container.innerHTML=`${feedback}<details id="sgSignIn" open><summary>Sign in</summary><p>Invited accounts only. Use your email and your Infierno Liberado password.</p><form class="sg-form" id="sgPasswordLogin"><label for="sgLoginEmail">Email</label><input id="sgLoginEmail" name="email" type="email" autocomplete="username" maxlength="254" required><label for="sgLoginPassword">Site password</label><input id="sgLoginPassword" name="password" type="password" autocomplete="current-password" required>${remember}<div class="sg-actions"><button class="sg-button" type="submit">Sign in with password</button></div></form><details id="sgPasswordHelp"><summary>First password, forgotten password, or email sign-in</summary><p>Already signed in elsewhere? Set a password there under Account &amp; password. Otherwise, request one email below. Do not use your mailbox password.</p><form class="sg-form" id="sgEmailForm"><label for="sgEmail">Invited email address</label><input id="sgEmail" name="email" type="email" autocomplete="email" maxlength="254" required><div class="sg-actions"><button class="sg-button secondary" type="submit">Email me a sign-in link or code</button><button class="sg-button secondary" type="button" id="sgResetPassword">Send password reset email</button></div></form><form class="sg-form" id="sgCodeForm"><label for="sgCode">Verification code (only when the email includes one)</label><input id="sgCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required><button class="sg-button secondary" type="submit">Verify code</button></form><p class="sg-muted">A link-only email has no numeric code. Open its newest Sign in link instead. Never share links, codes, or passwords in chat. Reset emails may also be rate-limited.</p></details></details>`;
  let requestEmail='',codeType='email';
  const run=async(button,operation,fn)=>{
   if(busy||!live())return;busy=true;button.disabled=true;
   try{await fn();}catch(error){message(errorText(error,operation),true);}finally{busy=false;if(button.isConnected)button.disabled=false;}
  };
  find('sgPasswordLogin').onsubmit=e=>{
   e.preventDefault();const password=find('sgLoginPassword').value,loginEmail=find('sgLoginEmail').value.trim();
   run(e.submitter,'password-login',async()=>{
    message('Checking your sign-in…');await persistence.setRemember(find('authRemember').checked);
    const result=await client.auth.signInWithPassword({email:loginEmail,password});if(result.error)throw result.error;
    if(!result.data?.session)throw new Error('No session');if(live())await onIdentity();
   }).finally(()=>{const input=find('sgLoginPassword');if(input)input.value='';});
  };
  find('sgPasswordHelp').ontoggle=()=>{if(find('sgPasswordHelp').open&&!find('sgEmail').value)find('sgEmail').value=find('sgLoginEmail').value;};
  async function sendMail(button,reset){
   if(!find('sgEmail').reportValidity())return;
   if(Date.now()<nextMail){message('An email was just requested. Check your inbox before requesting another.',true);return;}
   await run(button,'email',async()=>{
    requestEmail=find('sgEmail').value.trim();codeType=reset?'recovery':'email';await persistence.setRemember(find('authRemember').checked);
    const redirect=location.origin+location.pathname;
    const result=reset?await client.auth.resetPasswordForEmail(requestEmail,{redirectTo:redirect}):await client.auth.signInWithOtp({email:requestEmail,options:{shouldCreateUser:false,emailRedirectTo:redirect}});
    if(result.error)throw result.error;nextMail=Date.now()+60000;
    message('Email request accepted. Check that inbox for the newest message. No new account was created by this form.');
   });
  }
  find('sgEmailForm').onsubmit=e=>{e.preventDefault();sendMail(e.submitter,false);};
  find('sgResetPassword').onclick=e=>sendMail(e.currentTarget,true);
  find('sgCodeForm').onsubmit=e=>{
   e.preventDefault();if(!find('sgEmail').reportValidity())return;
   run(e.submitter,'verify',async()=>{const result=await client.auth.verifyOtp({email:requestEmail||find('sgEmail').value.trim(),token:find('sgCode').value.trim(),type:codeType});if(result.error)throw result.error;if(codeType==='recovery')recovery=true;if(live())await onIdentity();});
  };
 }
 return Object.freeze({mount,status,open,markRecovery,errorText,esc});
});
