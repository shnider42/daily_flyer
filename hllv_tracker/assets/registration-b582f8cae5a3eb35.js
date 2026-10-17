/* Public member signup uses Supabase Auth, never an administrator API.
   Role/ownership checks stay in the database. No passwords or email drafts are persisted here. */
(function(root){
 'use strict';
 let config=null, active=null, cooldownUntil=0, sequence=0;
 const redirect='https://hllv-bug-track.onrender.com/';
 const configure=c=>{config=c;};
 const enabled=()=>config?.account_registration==='self_service';
 function errorText(e){
  if(e?.code==='over_email_send_rate_limit'||e?.code==='over_request_rate_limit'||e?.status===429)return 'Verification email requests are temporarily limited. Check your inbox and spam folder before trying again. Existing members can still sign in with a verified email and password.';
  if(e?.code==='email_address_not_authorized')return 'The site’s email service is not ready to send verification to this address. The site owner needs to finish email delivery setup. You have not received verified Member access.';
  if(e?.code==='signup_disabled'||e?.code==='email_provider_disabled')return 'New account registration is currently paused. Existing members can still sign in.';
  if(e?.code==='weak_password')return 'Choose a stronger, unique site password with at least 12 characters.';
  if(e?.code==='email_address_invalid'||e?.code==='validation_failed')return 'Check the email address and required fields, then try again.';
  if(e?.code==='user_already_exists'||e?.code==='email_exists')return 'Use Sign in or password recovery for an existing account. To finish a pending registration, request a verification email below.';
  if(e?.code==='captcha_failed')return 'The site’s verification check could not be completed. No Member access has been confirmed; please try again later.';
  if(e?.code==='verification_required')return 'Registration is unavailable because email verification is not configured correctly. Existing sign-in is unchanged.';
  return 'We could not confirm the registration request. Check your inbox before retrying. No verified Member access has been confirmed; your email address is still here.';
 }
 async function settings(){
  if(!enabled())throw {code:'signup_disabled'};
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabase_url)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishable_key))throw Error('Invalid configuration');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const r=await fetch(config.supabase_url+'/auth/v1/settings',{headers:{apikey:config.publishable_key},cache:'no-store',signal:controller.signal});
   if(!r.ok)throw Error('Settings unavailable');const s=await r.json();
   if(s.disable_signup!==false||s.external?.email!==true)throw {code:'signup_disabled'};
   if(s.mailer_autoconfirm!==false)throw {code:'verification_required'};
  }finally{clearTimeout(timer);}
 }
 function clear(){sequence++;active=null;}
 function open(){
  if(!active)return false;
  const {container}=active,section=container.querySelector('#sgCreateAccount');
  if(!section)return false;
  container.querySelector('#sgSignIn').hidden=true;section.hidden=false;section.open=true;
  section.scrollIntoView({block:'start',behavior:'instant'});section.querySelector('input')?.focus({preventScroll:true});return true;
 }
 function mount({container,client,isCurrent=()=>true}){
  clear();if(!enabled())return;
  const ticket=sequence;let busy=false;
  active={container};const find=id=>container.querySelector('#'+id);
  const live=()=>ticket===sequence&&container.isConnected&&isCurrent();
  const say=(text,bad=false)=>{if(!live())return;const n=find('signupFeedback');n.textContent=text;n.dataset.error=String(bad);n.focus({preventScroll:true});};
  const signIn=()=>{if(busy||!live())return;const email=find('sgSignupEmail').value.trim();find('sgCreateAccount').hidden=true;const n=find('sgSignIn');n.hidden=false;n.open=true;find('sgLoginEmail').value=email;find('sgLoginPassword').focus({preventScroll:true});};
  const lock=value=>find('sgCreateAccount').querySelectorAll('input,button').forEach(n=>n.disabled=value);
  const pause=()=>{if(Date.now()<cooldownUntil){say('An email was just requested. Check your inbox and wait at least a minute before requesting another.',true);return true;}return false;};
  container.insertAdjacentHTML('beforeend',`<details id="sgCreateAccount" class="member-registration" hidden open><summary>Create a Member account</summary><p>Share an idea, report a problem, or support a published submission.</p><p class="member-steps">Create account <span aria-hidden="true">→</span> Verify email <span aria-hidden="true">→</span> Submit or vote</p><p id="signupFeedback" class="auth-feedback" role="status" aria-live="polite" tabindex="-1"></p><form id="sgSignupForm" class="sg-form"><label for="sgSignupEmail">Email</label><input id="sgSignupEmail" name="email" type="email" autocomplete="username" maxlength="254" required><label for="sgSignupPassword">Choose a site password · at least 12 characters</label><input id="sgSignupPassword" name="password" type="password" autocomplete="new-password" minlength="12" required><label for="sgSignupConfirm">Confirm site password</label><input id="sgSignupConfirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" required><label class="sg-check"><input id="sgSignupConsent" type="checkbox" required><span>I have read the <a href="#communityPrivacy" id="sgSignupPrivacy">privacy notice</a>. Approved submissions become public; my sign-in email is not displayed on the board.</span></label><p class="sg-muted">Member accounts can submit three entries per rolling 24 hours, vote, and see their own submissions and replies. This does not grant moderator access.</p><button class="sg-button" type="submit" id="sgSignupSend">Create account &amp; verify email</button></form><section id="sgSignupReceipt" class="member-email-receipt" hidden><h3>Check your email to finish</h3><p>Registration request accepted for <strong id="sgSignupReceiptEmail"></strong>. Verification is still required. If this address needs confirmation, use the newest confirmation link in its inbox or spam folder.</p><p>You are not signed in yet. Already have an account? Sign in below; signing up again will not replace your existing account.</p></section><details id="sgSignupEmailHelp"><summary>Need a verification email?</summary><p>Use this for an account you have already registered. It does not create another account or reset a password.</p><label for="sgVerificationEmail">Email to verify</label><input id="sgVerificationEmail" type="email" autocomplete="email" maxlength="254"><button id="sgSignupResend" class="sg-button secondary" type="button">Resend verification email</button></details><div class="sg-actions"><button id="sgSignupSignIn" class="sg-button secondary" type="button">Already verified? Sign in</button></div></details>`);
  find('sgSignupSignIn').onclick=signIn;
  find('sgSignupEmailHelp').ontoggle=()=>{if(!find('sgVerificationEmail').value)find('sgVerificationEmail').value=find('sgSignupEmail').value.trim();};
  find('sgSignupPrivacy').onclick=e=>{e.preventDefault();const n=document.getElementById('communityPrivacy');if(n){n.open=true;n.scrollIntoView({block:'start',behavior:'instant'});}};
  find('sgSignupForm').onsubmit=async e=>{
   e.preventDefault();if(busy||!live()||pause())return;
   const form=e.target,email=find('sgSignupEmail').value.trim(),password=find('sgSignupPassword').value;
   if(!form.reportValidity())return;
   if(password!==find('sgSignupConfirm').value){say('The passwords do not match.',true);return;}
   if([...password].length<12){say('Use at least 12 characters for your site password.',true);return;}
   busy=true;lock(true);say('Requesting your account verification…');
   try{
    await settings();if(!live())return;
    const check=await client.auth.getSession();if(check.error||check.data?.session)throw Error('Sign-in state changed');
    if(!live())return;cooldownUntil=Date.now()+60000;
    const result=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect}});
    if(result.error)throw result.error;
    if(result.data?.session){await client.auth.signOut({scope:'local'});throw {code:'verification_required'};}
    if(!result.data?.user)throw Error('Registration not confirmed');
    if(!live())return;
    find('sgSignupReceiptEmail').textContent=email;find('sgVerificationEmail').value=email;
    find('sgSignupForm').hidden=true;find('sgSignupReceipt').hidden=false;
    say('Request accepted. Verify your email before signing in to submit or vote.');
   }catch(e){say(errorText(e),true);}
   finally{form.querySelectorAll('input[type="password"]').forEach(n=>n.value='');busy=false;if(live())lock(false);}
  };
  find('sgSignupResend').onclick=async()=>{
   if(busy||!live()||pause())return;const input=find('sgVerificationEmail');input.required=true;if(!input.reportValidity())return;
   busy=true;lock(true);say('Requesting a verification email…');
   try{
    await settings();if(!live())return;cooldownUntil=Date.now()+60000;
    const result=await client.auth.resend({type:'signup',email:input.value.trim(),options:{emailRedirectTo:redirect}});
    if(result.error)throw result.error;
    say('Request accepted. If this account needs verification, check its inbox and spam folder for the newest confirmation link.');
   }catch(e){say(errorText(e),true);}finally{busy=false;if(live())lock(false);}
  };
 }
 return root.HLLVRegistration=Object.freeze({configure,enabled,mount,open,clear,errorText});
})(globalThis);
