// US — account deletion, shared by the app (settings.js, loaded on demand) and
// the public page (elimina-account.html). Also "Esci dalla coppia" and
// "Segnala un problema" (app only, 1.0). Policy A v1: deletion is immediate
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

async function callEdge({fn,payload,supabaseUrl,apiKey,accessToken,fetchImpl,toOutcome}){
  const doFetch=fetchImpl||root.fetch;
  if(!supabaseUrl||!apiKey||!accessToken||typeof doFetch!=='function')return {kind:'unavailable',done:false};
  let response;
  try{
    response=await doFetch(`${String(supabaseUrl).replace(/\/+$/,'')}/functions/v1/${fn}`,{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${accessToken}`,
        'apikey':apiKey,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(payload),
      cache:'no-store'
    });
  }catch(_){
    return {kind:'network',done:false};
  }
  let body=null;
  try{body=await response.json();}catch(_){body=null;}
  return toOutcome(Number(response.status)||0,body);
}

async function requestDeletion({supabaseUrl,apiKey,accessToken,channel,fetchImpl}={}){
  if(!CHANNELS.includes(channel))throw new Error('invalid deletion channel');
  return callEdge({fn:'delete-account',payload:{confirm:CONFIRM_WORD,channel},supabaseUrl,apiKey,accessToken,fetchImpl,toOutcome:outcome});
}

// Fresh password sign-in (the Edge functions require a password `amr` < 10
// minutes old). Returns the new access token, or the outcome to show.
async function freshAccessToken({client,email,password}={}){
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
  return {accessToken};
}

async function reauthenticateAndDelete({client,email,password,channel,supabaseUrl,apiKey,fetchImpl}={}){
  const fresh=await freshAccessToken({client,email,password});
  if(!fresh.accessToken)return fresh;
  return requestDeletion({supabaseUrl,apiKey,accessToken:fresh.accessToken,channel,fetchImpl});
}

// ------------------------------------------------ Esci dalla coppia (1.0) ---
// Closes the couple space like a deletion does (the partner keeps the shared
// memories, without your name) but keeps the account: back to onboarding.
// Only from the app; the server (Edge `leave-couple`) owns every rule.
const LEAVE_WORD='ESCI';
function isLeaveWord(value){return String(value??'').trim()===LEAVE_WORD;}
function canLeave({password,confirm}={}){
  return typeof password==='string'&&password.length>0&&isLeaveWord(confirm);
}
function leaveOutcome(status,body){
  const error=body&&typeof body.error==='string'?body.error:'';
  if(status===200)return {kind:'left',done:true};
  if(status===202)return {kind:'left_pending_cleanup',done:true};
  // Already out (the other phone, or a retry): same screen as leaving.
  if(status===409||error==='not_in_couple')return {kind:'not_in_couple',done:true};
  if(status===401||error==='reauth_required')return {kind:'reauth_required',done:false};
  if(status===400||error==='confirm_required')return {kind:'leave_confirm_required',done:false};
  if(status===503||error==='leave_disabled')return {kind:'leave_disabled',done:false};
  return {kind:'leave_failed',done:false};
}
function leaveMessage(kind,supportEmail=US_SUPPORT_EMAIL){
  switch(kind){
    case 'left':return 'Lo spazio di coppia è chiuso. Il tuo account resta attivo.';
    case 'left_pending_cleanup':return 'Lo spazio di coppia è chiuso. Il tuo account resta attivo. Stiamo completando la rimozione degli ultimi file.';
    case 'not_in_couple':return 'Non fai più parte di questa coppia. Il tuo account resta attivo.';
    case 'leave_confirm_required':return `Scrivi ${LEAVE_WORD} per confermare.`;
    case 'leave_disabled':return `Uscita dalla coppia non ancora disponibile, scrivi a ${supportEmail}.`;
    case 'leave_failed':return 'Uscita non riuscita: non è cambiato nulla. Riprova tra poco.';
    default:return message(kind,supportEmail,'app');
  }
}
async function requestLeave({supabaseUrl,apiKey,accessToken,fetchImpl}={}){
  return callEdge({fn:'leave-couple',payload:{confirm:LEAVE_WORD,channel:'app'},supabaseUrl,apiKey,accessToken,fetchImpl,toOutcome:leaveOutcome});
}
async function reauthenticateAndLeave({client,email,password,supabaseUrl,apiKey,fetchImpl}={}){
  const fresh=await freshAccessToken({client,email,password});
  if(!fresh.accessToken)return fresh;
  return requestLeave({supabaseUrl,apiKey,accessToken:fresh.accessToken,fetchImpl});
}

// ------------------------------------------- Segnala un problema (1.0) ---
// Goes to the US team only (never to the partner). Moderation procedure:
// docs/store/US_MODERATION_PROCEDURE.md.
const REPORT_CATEGORIES=Object.freeze([
  Object.freeze({key:'content',label:'Un contenuto offensivo o inappropriato'}),
  Object.freeze({key:'person',label:'Il comportamento di una persona'}),
  Object.freeze({key:'minor_safety',label:'La sicurezza di un minore'}),
  Object.freeze({key:'app_problem',label:'Un problema dell’app'})
]);
const REPORT_MAX_LENGTH=2000;
function canReport({category,details}={}){
  const text=String(details??'').trim();
  return REPORT_CATEGORIES.some(c=>c.key===category)&&text.length>0&&text.length<=REPORT_MAX_LENGTH;
}
function reportMessage(kind,supportEmail=US_SUPPORT_EMAIL){
  switch(kind){
    case 'received':return 'Segnalazione inviata al team di US. Se qualcuno è in pericolo chiama subito il 112.';
    case 'rate_limited':return `Hai già inviato diverse segnalazioni oggi. Per altro scrivi a ${supportEmail}.`;
    case 'invalid':return 'Scegli un motivo e scrivi cosa è successo.';
    case 'network':return 'Non riesco a raggiungere US. Controlla la connessione e riprova.';
    default:return `Segnalazione non inviata. Riprova o scrivi a ${supportEmail}.`;
  }
}
async function submitReport({client,category,details}={}){
  if(!canReport({category,details}))return {kind:'invalid',done:false};
  if(typeof client?.rpc!=='function')return {kind:'failed',done:false};
  let result;
  try{
    result=await client.rpc('submit_user_report',{p_category:category,p_details:String(details).trim()});
  }catch(_){
    return {kind:'network',done:false};
  }
  if(result?.error){
    const text=String(result.error.message||'');
    if(text.includes('report_rate_limited'))return {kind:'rate_limited',done:false};
    if(text.includes('report_category_invalid')||text.includes('report_details_invalid'))return {kind:'invalid',done:false};
    if(/fetch|network/i.test(text)||Number(result.error.status)===0)return {kind:'network',done:false};
    return {kind:'failed',done:false};
  }
  return {kind:'received',done:true};
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
  reauthenticateAndDelete,
  LEAVE_WORD,
  isLeaveWord,
  canLeave,
  leaveOutcome,
  leaveMessage,
  requestLeave,
  reauthenticateAndLeave,
  REPORT_CATEGORIES,
  REPORT_MAX_LENGTH,
  canReport,
  reportMessage,
  submitReport
});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.UsAccountDeletion=api;
})(typeof globalThis!=='undefined'?globalThis:this);
