// US — public invite page (invito.html), opened from the link a partner shares.
// Standalone: no service worker, no app boot, no Supabase. The code rides in
// the fragment (/invito#CODE), so it never reaches a server log; the page only
// shows it, copies it on its own and opens the web app with it.
(function(root){
'use strict';

// The same Crockford code as onboarding.js (validCode, normalizeCode).
const normalize=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
function inviteFromHash(hash){
  let raw='';
  try{raw=decodeURIComponent(String(hash||'').replace(/^#/,''));}catch(_e){return '';}
  const code=normalize(raw);
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(code)?code:'';
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={inviteFromHash};
  return;
}

const doc=root.document;
const $=id=>doc.getElementById(id);

function boot(){
  const code=inviteFromHash(root.location.hash);
  $('inviteMissing').hidden=Boolean(code);
  $('inviteReady').hidden=!code;
  $('inviteSteps').hidden=!code;
  if(!code)return;
  $('inviteCode').textContent=code;
  $('openWeb').href=`/#invito=${code}`;
  $('copyCode').addEventListener('click',async()=>{
    const status=$('copyStatus');
    try{await root.navigator.clipboard.writeText(code);status.textContent='Codice copiato.';}
    catch(_e){
      const range=doc.createRange();range.selectNodeContents($('inviteCode'));
      const selection=root.getSelection();selection.removeAllRanges();selection.addRange(range);
      status.textContent='Codice selezionato: copialo.';
    }
  });
}

if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);else boot();
})(typeof window!=='undefined'?window:globalThis);
