// US — account deletion, shared by the app (settings.js, loaded on demand) and
// the public page (elimina-account.html). Policy A v1: deletion is immediate
// and irreversible after confirmation; the server (Edge `delete-account`) owns
// every rule about what is deleted and what stays for the partner.
//
// Never log, store or echo the password: it only travels to Supabase Auth.
(function(root){
'use strict';

// Support/privacy contact (founder, 14/10: Gmail until the US domain exists).
// TODO founder: developer name as in the Play listing.
// This is the only place where they are defined (app + public page read them here).
const US_SUPPORT_EMAIL='moonee.team@gmail.com';
const US_DEVELOPER_NAME='[TODO founder: nome sviluppatore]';

const CONFIRM_WORD='ELIMINA';
const CHANNELS=Object.freeze(['app','web']);

function isConfirmWord(value){return String(value??'').trim()===CONFIRM_WORD;}
function canSubmit({password,confirm}={}){
  return typeof password==='string'&&password.length>0&&isConfirmWord(confirm);
}

// Server contract → one outcome per response. Only `deleted` and
// `pending_cleanup` mean the account is gone for the user.
function outcome(status,body){
  const error=body&&typeof body.error==='string'?body.error:'';
  if(status===200)return {kind:'deleted',done:true};
  if(status===202)return {kind:'pending_cleanup',done:true};
  if(status===401||error==='reauth_required')return {kind:'reauth_required',done:false};
  if(status===400||error==='confirm_required')return {kind:'confirm_required',done:false};
  if(status===503||error==='deletion_disabled')return {kind:'deletion_disabled',done:false};
  return {kind:'deletion_failed',done:false};
}

// In the app the email is already known and only the password is asked.
function message(kind,supportEmail=US_SUPPORT_EMAIL,channel='web'){
  switch(kind){
    case 'deleted':return 'Account eliminato.';
    case 'pending_cleanup':return 'Account eliminato. Stiamo completando la rimozione degli ultimi file.';
    case 'wrong_password':return channel==='app'?'Password non corretta. Riprova.':'Email o password non corrette. Riprova.';
    case 'reauth_required':return 'Per sicurezza inserisci di nuovo la password e riprova.';
    case 'confirm_required':return `Scrivi ${CONFIRM_WORD} per confermare.`;
    case 'deletion_disabled':return `Eliminazione non ancora disponibile, scrivi a ${supportEmail}.`;
    case 'network':return 'Non riesco a raggiungere US. Controlla la connessione e riprova.';
    case 'no_email':return `Non trovo l'email del tuo account. Scrivi a ${supportEmail}.`;
    case 'unavailable':return `Servizio non disponibile. Scrivi a ${supportEmail}.`;
    default:return 'Eliminazione non riuscita: non è stato eliminato nulla. Riprova tra poco.';
  }
}

async function requestDeletion({supabaseUrl,apiKey,accessToken,channel,fetchImpl}={}){
  if(!CHANNELS.includes(channel))throw new Error('invalid deletion channel');
  const doFetch=fetchImpl||root.fetch;
  if(!supabaseUrl||!apiKey||!accessToken||typeof doFetch!=='function')return {kind:'unavailable',done:false};
  let response;
  try{
    response=await doFetch(`${String(supabaseUrl).replace(/\/+$/,'')}/functions/v1/delete-account`,{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${accessToken}`,
        'apikey':apiKey,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({confirm:CONFIRM_WORD,channel}),
      cache:'no-store'
    });
  }catch(_){
    return {kind:'network',done:false};
  }
  let body=null;
  try{body=await response.json();}catch(_){body=null;}
  return outcome(Number(response.status)||0,body);
}

// Fresh password sign-in (the Edge requires a password `amr` < 10 minutes
// old), then the deletion request with that new access token.
async function reauthenticateAndDelete({client,email,password,channel,supabaseUrl,apiKey,fetchImpl}={}){
  if(!client?.auth?.signInWithPassword)return {kind:'unavailable',done:false};
  if(!email)return {kind:'no_email',done:false};
  if(typeof password!=='string'||!password)return {kind:'wrong_password',done:false};
  let result;
  try{
    result=await client.auth.signInWithPassword({email,password});
  }catch(_){
    return {kind:'network',done:false};
  }
  if(result?.error){
    const status=Number(result.error.status||0);
    const retryable=result.error.name==='AuthRetryableFetchError'||status===0;
    return {kind:retryable?'network':'wrong_password',done:false};
  }
  const accessToken=result?.data?.session?.access_token;
  if(!accessToken)return {kind:'wrong_password',done:false};
  return requestDeletion({supabaseUrl,apiKey,accessToken,channel,fetchImpl});
}

const api=Object.freeze({
  US_SUPPORT_EMAIL,
  US_DEVELOPER_NAME,
  CONFIRM_WORD,
  isConfirmWord,
  canSubmit,
  outcome,
  message,
  requestDeletion,
  reauthenticateAndDelete
});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.UsAccountDeletion=api;
})(typeof globalThis!=='undefined'?globalThis:this);
