// US — public account deletion page (elimina-account.html).
// Standalone: no service worker, no app boot, no persisted session.
// The password only goes to Supabase Auth; it is never logged or stored.
(function(root){
'use strict';

// Production Supabase project (same public values as app.js). Only the
// production addresses (the Pages host and its preview subdomains, and the
// US domain with www) may use them; any other host gets no configuration and
// the form stays disabled.
const PRODUCTION_HOSTS=['us-a33.pages.dev','uscouple.app'];
const PRODUCTION_CONFIG=Object.freeze({
  supabaseUrl:'https://iiakdfsxpywdkxravqjh.supabase.co',
  apiKey:'sb_publishable_JAB6USqhccAUg8_0ujgQ1A_NkRJRv_A'
});

function configForHost(hostname){
  const host=String(hostname||'').toLowerCase();
  if(PRODUCTION_HOSTS.some(h=>host===h||host.endsWith(`.${h}`)))return PRODUCTION_CONFIG;
  return null;
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={configForHost,PRODUCTION_HOSTS};
  return;
}

const doc=root.document;
const $=id=>doc.getElementById(id);

function setStatus(text,tone){
  const status=$('deleteStatus');
  if(!status)return;
  status.textContent=text||'';
  if(tone)status.dataset.tone=tone;else delete status.dataset.tone;
}

function boot(){
  const api=root.UsAccountDeletion;
  const support=api?.US_SUPPORT_EMAIL||'';
  doc.querySelectorAll('[data-us-support-email]').forEach(el=>{el.textContent=support||'—';});
  doc.querySelectorAll('[data-us-support-link]').forEach(el=>{if(support)el.setAttribute('href',`mailto:${support}`);});
  doc.querySelectorAll('[data-us-developer-name]').forEach(el=>{el.textContent=api?.US_DEVELOPER_NAME||'—';});

  const fieldset=$('deleteFieldset');
  const form=$('deleteForm');
  const email=$('deleteEmail');
  const password=$('deletePassword');
  const confirm=$('deleteConfirm');
  const submit=$('deleteSubmit');
  const config=configForHost(root.location?.hostname);

  if(!config){
    const notice=$('hostNotice');if(notice)notice.hidden=false;
    if(fieldset)fieldset.disabled=true;
    if(submit)submit.disabled=true;
    return;
  }
  if(!api||!root.supabase?.createClient){
    if(fieldset)fieldset.disabled=true;
    setStatus(api?api.message('unavailable',support):'Servizio non disponibile. Riprova più tardi.','error');
    return;
  }

  // In-memory session only: nothing of the account stays in this browser.
  const client=root.supabase.createClient(config.supabaseUrl,config.apiKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });

  let busy=false;
  let completed=false;
  const sync=()=>{
    if(submit)submit.disabled=busy||completed||!(email?.value.trim())||!api.canSubmit({password:password?.value,confirm:confirm?.value});
  };
  if(fieldset)fieldset.disabled=false;
  [email,password,confirm].forEach(input=>input?.addEventListener('input',sync));
  sync();

  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||completed)return;
    const address=email?.value.trim()||'';
    const secret=password?.value||'';
    if(!address||!api.canSubmit({password:secret,confirm:confirm?.value})){
      setStatus(`Inserisci email e password e scrivi ${api.CONFIRM_WORD}.`,'error');
      return;
    }
    busy=true;
    if(password)password.value='';
    if(fieldset)fieldset.disabled=true;
    if(submit)submit.textContent='Elimino…';
    setStatus('Accesso ed eliminazione in corso…');
    let result;
    try{
      result=await api.reauthenticateAndDelete({
        client,
        email:address,
        password:secret,
        channel:'web',
        supabaseUrl:config.supabaseUrl,
        apiKey:config.apiKey
      });
    }catch(_){
      result={kind:'deletion_failed',done:false};
    }
    try{await client.auth.signOut({scope:'local'});}catch(_){}
    busy=false;
    if(result.done){
      completed=true;
      if(form)form.reset();
      if(submit)submit.textContent='Account eliminato';
      setStatus(`${api.message(result.kind,support)} Grazie per aver usato US.`,'ok');
    }else{
      if(fieldset)fieldset.disabled=false;
      if(submit)submit.textContent='Elimina definitivamente';
      setStatus(api.message(result.kind,support),'error');
    }
    sync();
    $('deleteStatus')?.focus();
  });
}

if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(typeof globalThis!=='undefined'?globalThis:this);
