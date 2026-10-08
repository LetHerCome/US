(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.UsOnboarding=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const ERROR='ERROR_OR_INELIGIBLE';
  const unavailable='Non riesco a verificare il tuo spazio. Riprova quando la connessione è disponibile.';
  const validName=value=>typeof value==='string'&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value)&&Array.from(value.trim()).length>=1&&Array.from(value.trim()).length<=40;
  const normalizeCode=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
  const validCode=value=>/^[0-9A-HJKMNP-TV-Z]{26}$/.test(normalizeCode(value));
  function romeToday(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=type=>parts.find(p=>p.type===type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function validDate(value,today=romeToday()){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>today)return false;
    const date=new Date(value+'T12:00:00Z');
    return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;
  }
  function route(session,profile,membership){
    if(!session?.user?.id)return {kind:'SIGNED_OUT'};
    const fail=()=>({kind:ERROR,message:unavailable});
    if(!membership||typeof membership.member!=='boolean')return fail();
    if(!membership.member)return profile?fail():{kind:'AUTHENTICATED_NO_PROFILE'};
    if(!profile||profile.id!==session.user.id||!profile.couple_id||profile.couple_id!==membership.couple_id||typeof membership.partner_joined!=='boolean')return fail();
    if(!membership.invite||!['none','pending','expired','revoked','used'].includes(membership.invite.status))return fail();
    return {kind:membership.partner_joined?'PAIRED':'MEMBER_WAITING_PARTNER',profile,membership};
  }
  function errorMessage(error){
    if(error?.code==='42501')return 'Questo account non può completare l’accesso. Contatta chi ti ha invitato o esci.';
    if(error?.code==='22023')return 'Controlla nome e data: il nome deve avere da 1 a 40 caratteri e la data deve essere valida.';
    if(error?.code==='P0001')return 'Codice non valido, scaduto o già utilizzato. Verifica con la tua persona.';
    return unavailable;
  }
  function createController({readProfile,rpc,onChange=()=>{}}){
    let state={kind:'SIGNED_OUT',code:'',busy:false},session=null,epoch=0,flight=null;
    // Suspension invalidates results, not the transaction already sent. Keep a
    // per-account mutation guard until the actual transport promise settles.
    const mutations=new Map();
    const publish=next=>{state={code:'',busy:false,...next};if(mutations.has(session?.user?.id))state.busy=true;onChange(state);return state;};
    const current=ticket=>ticket===epoch&&Boolean(session?.user?.id);
    const purge=()=>{state={...state,code:''};onChange(state);};
    const reset=()=>{epoch++;session=null;flight=null;publish({kind:'SIGNED_OUT'});};
    const suspend=()=>{epoch++;flight=null;publish(state.kind==='PAIRED'?{...state,code:''}:{kind:session?ERROR:'SIGNED_OUT',message:unavailable});};
    async function read(ticket){
      const id=session.user.id;
      try{
        const [p,m]=await Promise.all([readProfile(id),rpc('get_couple_membership')]);
        if(!current(ticket)||session.user.id!==id)return null;
        if(p?.error||m?.error)return publish({kind:ERROR,message:unavailable});
        return publish(route(session,p?.data,m?.data));
      }catch(_error){if(current(ticket))return publish({kind:ERROR,message:unavailable});return null;}
    }
    async function load(nextSession){
      if(!nextSession?.user?.id){reset();return state;}
      // Every boot/foreground verification invalidates previously suspended work.
      epoch++;flight=null;session=nextSession;purge();
      return read(epoch);
    }
    async function refresh(){
      if(!session||flight||mutations.has(session.user.id))return null;
      purge();const ticket=epoch;publish({...state,busy:true});
      const work=read(ticket);flight=work;
      try{return await work;}finally{if(current(ticket))flight=null;}
    }
    async function mutate(name,args,{membership=false}={}){
      if(!session||flight)return null;
      const ticket=epoch,prior={...state,code:''},userId=session.user.id;
      if(mutations.has(userId))return null;
      const marker={};mutations.set(userId,marker);
      publish({...prior,code:'',busy:true,message:''});
      // Set the guard before invoking the RPC (including synchronous test adapters).
      flight=Promise.resolve();
      const work=(async()=>{
        let result;
        try{result=await rpc(name,args);}catch(_error){result={error:{}};}
        if(!current(ticket))return null;
        if(result?.error){
          // A lost response can hide a committed create/join. Resolve server state
          // before allowing another attempt; never repeat generate automatically.
          if(membership&&!result.error.code){
            const reconciled=await read(ticket);
            if(reconciled?.kind==='PAIRED'||reconciled?.kind==='MEMBER_WAITING_PARTNER')return reconciled;
            if(reconciled?.kind===ERROR)return reconciled;
          }
          if(result.error.message==='couple_full')return read(ticket);
          if(result.error.code==='42501')return publish({kind:ERROR,message:errorMessage(result.error)});
          return publish({...prior,code:'',message:errorMessage(result.error)});
        }
        if(name==='create_partner_invite'){
          if(!validCode(result?.data?.code)||!Number.isFinite(Date.parse(result?.data?.expires_at)))return publish({...prior,code:'',message:unavailable});
          return publish({...prior,code:result.data.code,membership:{...prior.membership,invite:{status:'pending',expires_at:result.data.expires_at}}});
        }
        if(name==='revoke_partner_invite'&&typeof result?.data?.revoked!=='boolean')return publish({...prior,code:'',message:unavailable});
        if(membership){
          const statuses=name==='create_couple'?['created','already_member']:['joined','already_joined'];
          if(!statuses.includes(result?.data?.status)||!result?.data?.couple_id)return publish({kind:ERROR,message:unavailable});
          const verified=await read(ticket);
          if(current(ticket)&&verified?.profile?.couple_id!==result.data.couple_id)return publish({kind:ERROR,message:unavailable});
          return verified;
        }
        return read(ticket);
      })();
      flight=work;
      try{return await work;}finally{
        if(mutations.get(userId)===marker)mutations.delete(userId);
        if(current(ticket))flight=null;
        if(session?.user?.id===userId)publish({...state,busy:false});
      }
    }
    return {get state(){return state;},get epoch(){return epoch;},load,reset,suspend,refresh,purge,
      create(fields){
        if(state.kind!=='AUTHENTICATED_NO_PROFILE')return Promise.resolve(null);
        if(!validName(fields.name)||!validDate(fields.date)||!validName(fields.coupleName?.trim()||'US.'))return Promise.resolve(publish({...state,message:'Inserisci un nome da 1 a 40 caratteri e una data valida, dal 1900 a oggi.'}));
        return mutate('create_couple',{p_display_name:fields.name.trim(),p_started_on:fields.date,p_couple_name:fields.coupleName?.trim()||'US.'},{membership:true});
      },
      join(fields){
        if(state.kind!=='AUTHENTICATED_NO_PROFILE')return Promise.resolve(null);
        if(!validName(fields.name)||!validCode(fields.code))return Promise.resolve(publish({...state,message:'Controlla il nome (1–40 caratteri) e il codice d’invito (26 caratteri).'}));
        return mutate('accept_partner_invite',{p_code:normalizeCode(fields.code),p_display_name:fields.name.trim()},{membership:true});
      },
      generate(){return state.kind==='MEMBER_WAITING_PARTNER'?mutate('create_partner_invite'):Promise.resolve(null);},
      revoke(){return state.kind==='MEMBER_WAITING_PARTNER'?mutate('revoke_partner_invite'):Promise.resolve(null);}
    };
  }

  function mount({readProfile,rpc,resume,signOut}){
    const root=document.getElementById('usOnboarding');
    const node=id=>document.getElementById(id);
    let mode='choice',lastKind='',hiddenPrivate=[];
    const clearForms=()=>root.querySelectorAll('input,textarea').forEach(el=>{el.value='';});
    function protect(active){
      document.documentElement.classList.toggle('us-onboarding-active',active);
      if(active&&!hiddenPrivate.length){
        for(const el of document.body.children){
          if(['authOverlay','usAppLock'].includes(el.id)||['SCRIPT','STYLE'].includes(el.tagName))continue;
          hiddenPrivate.push([el,el.inert,el.getAttribute('aria-hidden')]);el.inert=true;el.setAttribute('aria-hidden','true');
        }
      }else if(!active){
        for(const [el,inert,aria] of hiddenPrivate){el.inert=inert;if(aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',aria);}
        hiddenPrivate=[];
      }
    }
    function render(state){
      const active=!['SIGNED_OUT','PAIRED'].includes(state.kind);
      protect(active);
      root.classList.toggle('active',active);
      if(active){
        node('authLogin').classList.remove('active');node('authOverlay').classList.remove('hidden');
        document.documentElement.classList.remove('us-auth-pending','us-returning-device','us-auth-ready');
      }
      if(state.kind!==lastKind){clearForms();mode='choice';}
      const waiting=state.kind==='MEMBER_WAITING_PARTNER',choice=state.kind==='AUTHENTICATED_NO_PROFILE';
      node('mc3Title').textContent=waiting?'Il tuo spazio è pronto':choice?'Il vostro US, da qui':'Verifichiamo il tuo accesso';
      node('mc3Copy').textContent=waiting?`${state.profile.display_name.trim()}, invita la tua persona. Quando entrerà, troverete qui il vostro spazio.`:choice?'Hai già un account privato. Ora crea il vostro spazio o raggiungi la tua persona.':'La sessione è conservata. Puoi riprovare o uscire.';
      node('mc3Choice').hidden=!choice||mode!=='choice';node('mc3Create').hidden=!choice||mode!=='create';node('mc3Join').hidden=!choice||mode!=='join';
      node('mc3Waiting').hidden=!waiting;node('mc3Retry').hidden=state.kind!==ERROR;
      node('mc3Status').textContent=state.message||(state.busy?'Verifica in corso…':'');
      const labels={none:'Nessun invito attivo',pending:'Invito in attesa',expired:'Invito scaduto',revoked:'Invito revocato',used:'Invito utilizzato'};
      const invite=state.membership?.invite;
      node('mc3InviteStatus').textContent=waiting?(labels[invite.status]||'')+(invite.expires_at?' · Scadenza: '+new Date(invite.expires_at).toLocaleString('it-IT'):''):'';
      node('mc3Code').value=waiting?state.code:'';node('mc3CodeArea').hidden=!waiting||!state.code;
      node('mc3Generate').textContent=invite?.status==='none'?'Crea invito':'Genera nuovo codice';
      node('mc3Revoke').hidden=!waiting||invite?.status!=='pending';
      root.querySelectorAll('button,input').forEach(el=>{el.disabled=state.busy&&el.id!=='mc3Exit';});
      if(active&&state.kind!==lastKind){node('mc3Title').focus({preventScroll:true});node('authOverlay').scrollTop=0;}
      lastKind=state.kind;
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
    }
    const controller=createController({readProfile,rpc,onChange:render});
    const run=async action=>{const result=await action();if(result?.kind==='PAIRED')resume();};
    for(const [id,next] of [['mc3ChooseCreate','create'],['mc3ChooseJoin','join'],['mc3BackCreate','choice'],['mc3BackJoin','choice']])node(id).addEventListener('click',()=>{clearForms();mode=next;render(controller.state);(next==='choice'?node('mc3Title'):node(next==='create'?'mc3CreateName':'mc3JoinName')).focus();});
    node('mc3Date').max=romeToday();
    node('mc3Create').addEventListener('submit',event=>{event.preventDefault();run(()=>controller.create({name:node('mc3CreateName').value,date:node('mc3Date').value,coupleName:node('mc3CoupleName').value}));});
    node('mc3Join').addEventListener('submit',event=>{event.preventDefault();const fields={name:node('mc3JoinName').value,code:node('mc3JoinCode').value};node('mc3JoinCode').value='';run(()=>controller.join(fields));});
    node('mc3Generate').addEventListener('click',()=>run(()=>controller.generate()));
    node('mc3Revoke').addEventListener('click',()=>run(()=>controller.revoke()));
    for(const id of ['mc3Refresh','mc3Retry'])node(id).addEventListener('click',()=>run(()=>controller.refresh()));
    node('mc3CopyCode').addEventListener('click',async()=>{
      const code=controller.state.code,ticket=controller.epoch;if(!code)return;
      try{await navigator.clipboard.writeText(code);if(controller.epoch===ticket&&controller.state.code===code)node('mc3Status').textContent='Codice copiato. Condividilo soltanto con la tua persona.';}
      catch(_error){if(controller.epoch===ticket&&controller.state.code===code){node('mc3Code').focus();node('mc3Code').select();node('mc3Status').textContent='Seleziona e copia il codice.';}}
    });
    node('mc3Exit').addEventListener('click',async()=>{controller.suspend();clearForms();await signOut();});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){controller.suspend();clearForms();}
      else if(controller.state.kind!== 'SIGNED_OUT'&&controller.state.kind!=='PAIRED')resume();
    });
    window.addEventListener('us-app-lock-change',event=>{if(event.detail?.locked){controller.suspend();clearForms();}else resume();});
    window.addEventListener('pagehide',()=>{controller.suspend();clearForms();});
    return controller;
  }
  return Object.freeze({route,validName,validDate,normalizeCode,validCode,romeToday,errorMessage,createController,mount});
});
