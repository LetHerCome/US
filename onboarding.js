(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.UsOnboarding=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const ERROR='ERROR_OR_INELIGIBLE';
  const CHECK_MS=10000;
  const unavailable='Non riesco a verificare il tuo spazio. Riprova quando la connessione è disponibile.';
  const validName=value=>typeof value==='string'&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value)&&Array.from(value.trim()).length>=1&&Array.from(value.trim()).length<=40;
  const normalizeCode=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
  const validCode=value=>/^[0-9A-HJKMNP-TV-Z]{26}$/.test(normalizeCode(value));
  // WhatsApp copies a whole message, never one line: the code is found in
  // what was pasted (the code typed by hand, the invite link, an old message).
  function inviteCodeIn(value){
    const text=String(value||'');
    if(validCode(text))return normalizeCode(text);
    const hit=text.split(/[^0-9A-Za-z]+/).find(word=>word.length===26&&validCode(word));
    return hit?normalizeCode(hit):'';
  }
  function romeToday(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=type=>parts.find(p=>p.type===type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  // «Insieme dal»: three selects (day, month, year), newest year first.
  function togetherDate(day,month,year){
    if(!(day&&month&&year))return '';
    return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function togetherYears(today=romeToday()){
    const last=Number(String(today).slice(0,4));
    return Array.from({length:last-1899},(_,i)=>last-i);
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
  function createController({readProfile,rpc,onChange=()=>{},onJoined=()=>{}}){
    let state={kind:'SIGNED_OUT',code:'',busy:false},session=null,epoch=0,flight=null,quiet=0;
    // Suspension invalidates results, not the transaction already sent. Keep a
    // per-account mutation guard until the actual transport promise settles.
    const mutations=new Map();
    // The code this phone created last, in memory only: never in storage, and
    // off the screen while US is hidden or locked. It comes back as long as the
    // server still has that same invite pending (same expiry); anything else
    // the server says about the invite forgets it. A reload forgets it too.
    let kept=null;
    function withKept(next){
      if(!kept||next?.kind===ERROR)return next;
      const invite=next?.membership?.invite;
      if(next?.kind==='MEMBER_WAITING_PARTNER'&&kept.userId===session?.user?.id&&invite?.status==='pending'&&Date.parse(invite.expires_at)===kept.expires)return {...next,code:kept.code};
      kept=null;return next;
    }
    const publish=next=>{state={code:'',busy:false,...next};if(mutations.has(session?.user?.id))state.busy=true;onChange(state);return state;};
    const current=ticket=>ticket===epoch&&Boolean(session?.user?.id);
    const purge=()=>{state={...state,code:''};onChange(state);};
    const reset=()=>{epoch++;session=null;flight=null;kept=null;publish({kind:'SIGNED_OUT'});};
    const suspend=()=>{epoch++;flight=null;publish(state.kind==='PAIRED'?{...state,code:''}:{kind:session?ERROR:'SIGNED_OUT',message:unavailable});};
    async function read(ticket){
      const id=session.user.id;quiet++;
      try{
        const [p,m]=await Promise.all([readProfile(id),rpc('get_couple_membership')]);
        if(!current(ticket)||session.user.id!==id)return null;
        // A failed read (offline, a slow network, the server restarting) says
        // nothing about the couple: transient, so the shell keeps this phone's
        // notifications and widgets (bug 25/10/2026).
        if(p?.error||m?.error)return publish({kind:ERROR,message:unavailable,transient:true});
        return publish(withKept(route(session,p?.data,m?.data)));
      }catch(_error){if(current(ticket))return publish({kind:ERROR,message:unavailable,transient:true});return null;}
    }
    async function load(nextSession){
      if(!nextSession?.user?.id){reset();return state;}
      if(kept&&kept.userId!==nextSession.user.id)kept=null;
      // Every boot/foreground verification invalidates previously suspended work.
      epoch++;flight=null;session=nextSession;purge();
      return read(epoch);
    }
    async function refresh(){
      if(!session||flight||mutations.has(session.user.id))return null;
      const ticket=epoch;publish({...state,busy:true});
      const work=read(ticket);flight=work;
      try{return await work;}finally{if(current(ticket))flight=null;}
    }
    // The automatic check while waiting: the same reads, without the busy
    // screen and without ever blocking a tap. Anything the person starts in the
    // meantime wins, and a failed check stays silent (the next one retries).
    async function check(){
      if(!session||flight||state.busy||mutations.has(session.user.id)||state.kind!=='MEMBER_WAITING_PARTNER')return null;
      const ticket=epoch,id=session.user.id,mine=++quiet;
      try{
        const [p,m]=await Promise.all([readProfile(id),rpc('get_couple_membership')]);
        if(!current(ticket)||session.user.id!==id||mine!==quiet||flight||mutations.has(id))return null;
        if(p?.error||m?.error)return null;
        return publish(withKept(route(session,p?.data,m?.data)));
      }catch(_error){return null;}
    }
    async function mutate(name,args,{membership=false}={}){
      if(!session||flight)return null;
      const ticket=epoch,prior={...state,code:''},userId=session.user.id;
      if(mutations.has(userId))return null;
      const marker={};mutations.set(userId,marker);quiet++;
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
          kept={userId,code:result.data.code,expires:Date.parse(result.data.expires_at)};
          return publish({...prior,code:result.data.code,membership:{...prior.membership,invite:{status:'pending',expires_at:result.data.expires_at}}});
        }
        if(name==='revoke_partner_invite'&&typeof result?.data?.revoked!=='boolean')return publish({...prior,code:'',message:unavailable});
        if(membership){
          const statuses=name==='create_couple'?['created','already_member']:['joined','already_joined'];
          if(!statuses.includes(result?.data?.status)||!result?.data?.couple_id)return publish({kind:ERROR,message:unavailable});
          const verified=await read(ticket);
          if(current(ticket)&&verified?.profile?.couple_id!==result.data.couple_id)return publish({kind:ERROR,message:unavailable});
          // A first join tells both phones the space is ready (the server checks it).
          if(name==='accept_partner_invite'&&result.data.status==='joined'){try{onJoined(result.data.couple_id);}catch(_e){}}
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
    return {get state(){return state;},get epoch(){return epoch;},get userId(){return session?.user?.id||'';},load,reset,suspend,refresh,check,purge,
      create(fields){
        if(state.kind!=='AUTHENTICATED_NO_PROFILE')return Promise.resolve(null);
        if(!validName(fields.name)||!validDate(fields.date)||!validName(fields.coupleName?.trim()||'US.'))return Promise.resolve(publish({...state,message:'Inserisci un nome da 1 a 40 caratteri e una data valida, dal 1900 a oggi.'}));
        return mutate('create_couple',{p_display_name:fields.name.trim(),p_started_on:fields.date,p_couple_name:fields.coupleName?.trim()||'US.'},{membership:true});
      },
      join(fields){
        if(state.kind!=='AUTHENTICATED_NO_PROFILE')return Promise.resolve(null);
        const code=inviteCodeIn(fields.code);
        if(!validName(fields.name)||!code)return Promise.resolve(publish({...state,message:'Controlla il nome (1–40 caratteri) e il codice d’invito (26 caratteri).'}));
        return mutate('accept_partner_invite',{p_code:code,p_display_name:fields.name.trim()},{membership:true});
      },
      generate(){return state.kind==='MEMBER_WAITING_PARTNER'?mutate('create_partner_invite'):Promise.resolve(null);},
      revoke(){return state.kind==='MEMBER_WAITING_PARTNER'?mutate('revoke_partner_invite'):Promise.resolve(null);}
    };
  }


  // ---------- First run (Due colori, dc-primo) ----------
  // The tour before the account, the "Tu" step with an optional birthday, the
  // person colour and the one-time phone setup after pairing. Pure helpers
  // first (tested in Node), then the DOM wiring used by mount().
  const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  const MONTH_DAYS=[31,29,31,30,31,30,31,31,30,31,30,31];
  const FIRST_RUN_KEYS=Object.freeze({
    tourSeen:'us:tour:v1:seen',
    deviceProfile:'us:fix4:last-profile',
    passwordSignIn:'us:setup:v1:password-sign-in',
    birthdayPending:id=>`us:onboarding:v1:birthday:${id}`,
    birthdaySaved:id=>`us:onboarding:v1:birthday-saved:${id}`,
    setupPending:id=>`us:setup:v1:pending:${id}`,
    setupDone:id=>`us:setup:v1:done:${id}`
  });
  const storeGet=(store,key)=>{try{return store?.getItem?.(key)??null;}catch(_e){return null;}};
  const storeSet=(store,key,value)=>{try{store.setItem(key,value);return true;}catch(_e){return false;}};
  const storeRemove=(store,key)=>{try{store?.removeItem?.(key);}catch(_e){}};
  // The invite page (invito.html) opens the web app on /#invito=CODE: the code
  // leaves the address bar and waits in this tab until the join step uses it.
  const PENDING_INVITE='us:onboarding:v1:pending-invite';
  function takeInvite({location,history,session,used=false}={}){
    if(used){storeRemove(session,PENDING_INVITE);return '';}
    const hit=/^#invito=([0-9A-Za-z-]+)$/.exec(String(location?.hash||''));
    const code=hit?inviteCodeIn(decodeURIComponent(hit[1])):'';
    if(hit){
      try{history?.replaceState?.(null,'',`${location.pathname||'/'}${location.search||''}`);}catch(_e){}
      if(code)storeSet(session,PENDING_INVITE,code);
    }
    return inviteCodeIn(storeGet(session,PENDING_INVITE));
  }
  const pad2=n=>String(n).padStart(2,'0');
  const leapYear=year=>year%4===0&&(year%100!==0||year%400===0);
  const colourName=role=>role==='beatrice'?'il lilla':'il rosa';
  const partnerColourName=role=>role==='beatrice'?'il rosa':'il lilla';

  // The tour is for a phone where nobody has signed in yet.
  function tourWanted(storage){
    if(storeGet(storage,FIRST_RUN_KEYS.tourSeen))return false;
    try{if(JSON.parse(storeGet(storage,FIRST_RUN_KEYS.deviceProfile)||'null')?.id)return false;}catch(_e){}
    return true;
  }
  function birthdayCheck(day,month){
    const d=Number(day)||0,m=Number(month)||0;
    if(!d&&!m)return {ok:true,value:null};
    if(!d||!m)return {ok:false,message:'Scegli giorno e mese, oppure lasciali vuoti.'};
    if(!Number.isInteger(d)||!Number.isInteger(m)||m<1||m>12||d<1||d>MONTH_DAYS[m-1])return {ok:false,message:'Questo giorno non esiste in quel mese.'};
    return {ok:true,value:{day:d,month:m}};
  }
  // The next time this day and month come round in Rome, today included.
  // 29 February waits for the next leap year.
  function nextBirthday(day,month,today=romeToday()){
    const check=birthdayCheck(day,month);
    if(!check.ok||!check.value||!/^\d{4}-\d{2}-\d{2}$/.test(String(today)))return null;
    const year=Number(today.slice(0,4));
    for(let y=year;y<=year+8;y++){
      if(check.value.month===2&&check.value.day===29&&!leapYear(y))continue;
      const date=`${y}-${pad2(check.value.month)}-${pad2(check.value.day)}`;
      if(date>=today)return date;
    }
    return null;
  }
  // Exactly the eight columns events.js writes.
  function birthdayEvent({name,day,month,profile,today=romeToday()}){
    const clean=typeof name==='string'?name.trim():'';
    const date=nextBirthday(day,month,today);
    if(!validName(clean)||!date||!profile?.id||!profile?.couple_id)return null;
    return {title:`Compleanno di ${clean}`,event_date:date,event_time:null,location:null,note:null,recurs_yearly:true,couple_id:profile.couple_id,created_by:profile.id};
  }
  // Between the "Tu" step and the moment the couple exists, per user, this tab only.
  function rememberBirthday(session,userId,value){
    if(!userId)return false;
    const key=FIRST_RUN_KEYS.birthdayPending(userId);
    if(!value){storeRemove(session,key);return true;}
    return storeSet(session,key,JSON.stringify({day:value.day,month:value.month}));
  }
  function pendingBirthday(session,userId){
    if(!userId)return null;
    try{
      const value=JSON.parse(storeGet(session,FIRST_RUN_KEYS.birthdayPending(userId))||'null');
      const check=birthdayCheck(value?.day,value?.month);
      return check.ok?check.value:null;
    }catch(_e){return null;}
  }
  // Best effort, at most once per user: the marker is written before the
  // request, so a lost answer can never turn into a second birthday.
  async function saveBirthday({profile,local,session,insertEvent,today=romeToday()}){
    const id=profile?.id;
    if(!id||!profile.couple_id||typeof insertEvent!=='function')return {ok:false,kind:'skipped'};
    const value=pendingBirthday(session,id);
    if(!value)return {ok:false,kind:'none'};
    storeRemove(session,FIRST_RUN_KEYS.birthdayPending(id));
    if(storeGet(local,FIRST_RUN_KEYS.birthdaySaved(id)))return {ok:false,kind:'already'};
    const row=birthdayEvent({name:profile.display_name,day:value.day,month:value.month,profile,today});
    if(!row)return {ok:false,kind:'invalid'};
    if(!storeSet(local,FIRST_RUN_KEYS.birthdaySaved(id),'1'))return {ok:false,kind:'storage'};
    try{const result=await insertEvent(row);return result?.error?{ok:false,kind:'error'}:{ok:true,row};}
    catch(_e){return {ok:false,kind:'error'};}
  }
  // The phone setup after pairing: once per user on this phone, only after
  // onboarding here or after an email and password sign-in in this tab.
  function setupMode({userId,local,session}){
    if(!userId||storeGet(local,FIRST_RUN_KEYS.setupDone(userId)))return null;
    const pending=storeGet(local,FIRST_RUN_KEYS.setupPending(userId));
    if(pending==='created'||pending==='joined')return pending;
    if(storeGet(session,FIRST_RUN_KEYS.passwordSignIn)===userId)return 'device';
    return null;
  }
  function setupSteps({mode,push,place}){
    if(!mode)return [];
    if(mode==='device'&&!push&&!place)return [];
    const steps=[];
    if(mode==='created')steps.push('noi');
    if(mode==='joined')steps.push('color');
    if(push)steps.push('push');
    if(place)steps.push('place');
    steps.push('ready');
    return steps;
  }
  async function pushStepState(notifications){
    if(!notifications?.supported?.())return {wanted:false,kind:'unsupported'};
    try{
      const state=await notifications.getState();
      const kind=state?.supported===false?'unsupported':state?.kind||'unknown';
      return {wanted:!['active','unavailable','unsupported'].includes(kind),kind};
    }catch(_e){return {wanted:false,kind:'unknown'};}
  }
  // "Tutto pronto" on Android: offer the Ti penso widget when the launcher can
  // pin it and none is on the Home screen yet. Never on the web or on iOS.
  async function widgetOfferWanted(widgets){
    if(typeof widgets?.isAvailable!=='function'||typeof widgets.installed!=='function'||typeof widgets.requestPin!=='function')return false;
    try{
      if(!widgets.isAvailable())return false;
      const device=await widgets.installed();
      return device?.pinSupported===true&&!(Number(device?.installed?.think)>0);
    }catch(_e){return false;}
  }
  function placeStepWanted(location,hasGeolocation){
    if(!hasGeolocation||typeof location?.start!=='function')return false;
    try{return !location.isSharing?.();}catch(_e){return false;}
  }
  function daysTogether(startedOn,now=new Date()){
    const [y,m,d]=String(startedOn||'').split('-').map(Number);
    if(!y||!m||!d)return null;
    const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
    return Math.max(0,Math.floor((today-Date.UTC(y,m-1,d))/86400000));
  }
  const italianDate=iso=>{const [y,m,d]=String(iso||'').split('-').map(Number);if(!(y&&m&&d))return '';const tag=globalThis.UsI18n?.tag||'it-IT';return tag==='it-IT'?`${d} ${MONTHS[m-1]} ${y}`:new Date(Date.UTC(y,m-1,d)).toLocaleDateString(tag,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});};
  function inviteExpiry(iso){
    const date=new Date(iso);if(!Number.isFinite(+date))return '';
    try{
      const parts=new Intl.DateTimeFormat((globalThis.UsI18n?.tag||'it-IT'),{timeZone:'Europe/Rome',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
      const part=type=>parts.find(p=>p.type===type)?.value||'';
      return `scade il ${part('day')} ${part('month')} alle ${part('hour')}:${part('minute')}`;
    }catch(_e){return '';}
  }
  // The invite page (invito.html) on this site; from the Android app, on the
  // production site. The code rides in the fragment: it never reaches a server log.
  const INVITE_SITE='https://us-a33.pages.dev';
  function inviteLink(code,origin=globalThis.location?.origin){
    const site=/^https:\/\/(?!localhost\b)[a-z0-9.-]+$/i.test(String(origin||''))?origin:INVITE_SITE;
    return `${site}/invito#${encodeURIComponent(String(code||''))}`;
  }
  // What "Condividi" sends: in the sender's language, the link on its own line,
  // never translated. No expiry: the one who invites says it, if needed.
  function inviteMessage(code,t,origin){
    const say=typeof t==='function'?t:(text=>text);
    return [say('Ti aspetto su US ♡'),say('Apri il mio invito:'),inviteLink(code,origin)].join('\n');
  }
  // The share sheet where the phone has one (web, iOS); otherwise the message
  // goes to the clipboard. The Android app has no share sheet without a plugin.
  async function shareInvite(text,nav=globalThis.navigator){
    if(typeof nav?.share==='function'){
      let can=true;try{if(typeof nav.canShare==='function')can=nav.canShare({text});}catch(_e){can=false;}
      if(can){
        try{await nav.share({text});return 'shared';}
        catch(error){if(error?.name==='AbortError')return 'cancelled';}
      }
    }
    try{await nav.clipboard.writeText(text);return 'copied';}catch(_e){return 'failed';}
  }

  // ---------- DOM: motion helpers ----------
  const EASE={out:'cubic-bezier(.2,.8,.2,1)',io:'cubic-bezier(.7,0,.2,1)',spring:'cubic-bezier(.34,1.56,.64,1)',soft:'cubic-bezier(.22,1.15,.36,1)'};
  function reducedMotion(){
    if(document.documentElement.dataset.usMotion==='reduced')return true;
    try{if(window.UsUiFoundation?.isReducedMotion?.())return true;}catch(_e){}
    return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function animate(el,frames,options){
    if(!el||typeof el.animate!=='function')return null;
    try{return el.animate(frames,{fill:'both',...options});}catch(_e){return null;}
  }
  function setTitle(el,plain,accent){
    el.textContent=plain;
    if(accent){const em=document.createElement('em');em.textContent=accent;el.append(em);}
  }
  // ---------- DOM: one screen gives way to the next (the mockup's show()) ----------
  // The old screen leaves first: 180 ms, 24 px towards where you came from,
  // ease-in. Then the new one arrives block by block: 380 ms, 24 px, 30 ms
  // apart (260 ms + 40 ms apart when the door first opens, after a 620 ms
  // circle reveal). The page itself switches at once (ids, focus, screen
  // readers); what leaves is a still copy without ids, painted in its place.
  const EASE_IN='cubic-bezier(.4,0,1,1)',LEAVE_MS=180;
  const SCREEN_ORDER={tour:0,authLogin:1,usSignup:2,usVerifyEmail:3,usForgotPassword:4,usRecovery:5,me:6,error:6,choice:7,create:8,join:9,color:10,noi:10,waiting:11,push:12,place:13,ready:14};
  const HEADER='.tiny,.us-ob-progress';
  const FREEZE=['display','position','top','right','bottom','left','width','height','min-width','max-width','min-height','box-sizing',
    'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
    'order','flex-grow','flex-shrink','flex-basis','align-self','justify-self','flex-direction','flex-wrap','align-items','justify-content','align-content','justify-items',
    'row-gap','column-gap','grid-template-columns','grid-template-rows','grid-column-start','grid-column-end','grid-row-start','grid-row-end',
    'font-family','font-size','font-weight','font-style','font-variant-numeric','line-height','letter-spacing','word-spacing','text-transform','text-align',
    'text-decoration-line','text-decoration-color','text-underline-offset','white-space','overflow-wrap','color','background-color','background-image',
    'background-size','background-position','background-repeat','border-top-width','border-right-width','border-bottom-width','border-left-width',
    'border-top-style','border-right-style','border-bottom-style','border-left-style','border-top-color','border-right-color','border-bottom-color','border-left-color',
    'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius','box-shadow','opacity','visibility',
    'transform','translate','scale','rotate','object-fit','overflow-x','overflow-y','clip-path','appearance','outline-style'];
  const isShown=el=>Boolean(el&&el.isConnected&&el.getClientRects().length);
  // A still copy of what is on screen: computed styles written in, ids moved
  // to data-us-gid (nothing can find it), inert and hidden from screen readers.
  // Only what is painted is copied: a hidden part is dropped and the inside of
  // a select or an svg keeps its classes, so the copy costs a few ms on a
  // phone instead of a frame or more (the step holds every hidden form too).
  function stillCopy(src,{root=false}={}){
    const copy=src.cloneNode(true);
    const freeze=(el,out,top)=>{
      const cs=getComputedStyle(el);
      if(!top&&cs.display==='none'){out.remove();return;}
      for(const prop of FREEZE){
        if(top&&root&&['opacity','transform','translate','position','top','left','right','bottom'].includes(prop))continue;
        const value=cs.getPropertyValue(prop);if(value)out.style.setProperty(prop,value,'important');
      }
      // Fields keep what was typed (cloneNode keeps values; selects need help).
      if(el instanceof HTMLSelectElement){out.selectedIndex=el.selectedIndex;return;}
      const kids=[...el.children],copies=[...out.children];
      kids.forEach((kid,i)=>{if(kid instanceof HTMLElement)freeze(kid,copies[i],false);});
    };
    freeze(src,copy,true);
    for(const out of [copy,...copy.querySelectorAll('[id],[for],[name]')]){
      if(out.id){out.dataset.usGid=out.id;out.removeAttribute('id');}
      out.removeAttribute('for');out.removeAttribute('name');
    }
    copy.inert=true;copy.setAttribute('aria-hidden','true');
    return copy;
  }
  function placeCopy(src,host,copy){
    const r=src.getBoundingClientRect(),h=host.getBoundingClientRect();
    const s=copy.style;
    s.setProperty('position','absolute','important');
    s.setProperty('left',`${r.left-h.left+host.scrollLeft-host.clientLeft}px`,'important');
    s.setProperty('top',`${r.top-h.top+host.scrollTop-host.clientTop}px`,'important');
    s.setProperty('width',`${r.width}px`,'important');s.setProperty('height',`${r.height}px`,'important');
    s.setProperty('margin','0','important');s.setProperty('pointer-events','none','important');
    host.append(copy);
    // Scrolled things (the tour track) stay where they were.
    const track=src.querySelector('.us-tour-track');
    if(track?.scrollLeft){const still=copy.querySelector('.us-tour-track');if(still)still.scrollLeft=track.scrollLeft;}
    return copy;
  }
  let swapPending=null,revealedAt=-1e9;
  // Set by the onboarding while a paired step is kept on screen (mount: keeping).
  let releaseKept=null;
  // Starts a change of screen: the copy of `from` leaves, the header holds.
  // `hold`: the copy stays still until swap.go() (the next screen is not ready yet).
  function beginSwap({from,host,dir=1,header=[],hold=false}={}){
    if(swapPending)return swapPending;
    const swap={dir,after:0,first:false,gone:[]};
    if(reducedMotion()||!from||!isShown(from)||performance.now()-revealedAt<120){
      // Nothing on screen yet (or the door is just opening): the new screen arrives as the first one.
      // As in the design, the first screen comes from the right, timed from the door
      // (a screen drawn a few ms after the door starts that far into its entrance).
      if(!reducedMotion()&&from&&performance.now()-revealedAt<120){swap.first=true;swap.dir=1;swap.door=revealedAt;stopEnter(from);}
      swapPending=swap;return swap;
    }
    host=host||from.parentElement;
    const held=[...header,...from.querySelectorAll(':scope>'+HEADER.split(',').join(',:scope>'))].filter(isShown);
    const copy=stillCopy(from,{root:true});
    copy.querySelectorAll(':scope>'+HEADER.split(',').join(',:scope>')).forEach(el=>el.remove());
    copy.classList.remove('active');copy.classList.add('us-step-ghost');
    placeCopy(from,host,copy);swap.gone.push(copy);
    held.forEach(el=>{const still=stillCopy(el);placeCopy(el,host,still);still.style.setProperty('z-index','4','important');swap.gone.push(still);});
    const drop=()=>swap.gone.forEach(el=>el.remove());
    swap.drop=drop;
    swap.go=()=>{
      swap.go=null;
      const out=animate(copy,[{opacity:1,translate:'0 0'},{opacity:0,translate:`${-dir*24}px 0`}],{duration:LEAVE_MS,easing:EASE_IN,fill:'forwards'});
      if(out)out.finished.then(drop,drop);else drop();
      setTimeout(drop,LEAVE_MS+120);
    };
    swap.after=LEAVE_MS;
    if(hold)return swap;
    swap.go();
    swapPending=swap;setTimeout(()=>{if(swapPending===swap)swapPending=null;},LEAVE_MS);
    return swap;
  }
  function stopEnter(el){try{el.getAnimations({subtree:true}).forEach(a=>{if(a.effect?.getTiming?.().fill==='backwards')a.cancel();});}catch(_e){}}
  // What arrives, in the order it is seen: forms join the column, a pair of
  // buttons or a split card moves as one block (data-us-enter="with-prev").
  // The children of a display:contents wrapper are items of the column itself:
  // they take their place by their own `order` (the cards of "Il vostro US"
  // come after the title, "Indietro" last). A "flat" block is entered at its
  // own place, its children in turn. An empty status line counts as a block,
  // as in the design (data-us-enter="skip" where the design has none).
  function enterItems(container){
    const out=[];
    const walk=parent=>{
      const items=[];
      const lift=box=>{
        for(const el of box.children){
          if(el.hidden||el.matches(HEADER)||el.classList.contains('us-sr-only')||el.classList.contains('us-step-ghost')||el.dataset.usEnter==='skip')continue;
          const cs=getComputedStyle(el);
          if(cs.display==='contents'){lift(el);continue;}
          items.push({el,cs,i:items.length,order:Number(cs.order)||0});
        }
      };
      lift(parent);
      // `order` moves things only in a flex or grid box.
      if(/flex|grid/.test(getComputedStyle(parent).display))items.sort((a,b)=>a.order-b.order||a.i-b.i);
      items.forEach(({el,cs})=>{
        if(el.dataset.usEnter==='flat'){walk(el);return;}
        if(cs.position==='absolute'&&!el.classList.contains('auth-status'))return;
        if(cs.display==='none'&&!el.classList.contains('auth-status'))return;
        out.push(el);
      });
    };
    walk(container);
    return out;
  }
  // The new screen comes in. `still` holds things that do not slide (the two circles).
  function arriveSwap(container,{extra=[],header=[],swap=swapPending}={}){
    swapPending=null;
    if(!container||!swap||reducedMotion())return swap?.after||0;
    // A first screen drawn some ms after its door starts that far into its entrance.
    if(swap.first&&swap.door!=null){swap.late=Math.max(0,Math.round(performance.now()-swap.door));swap.after=-swap.late;}
    const items=[...enterItems(container),...extra.filter(isShown)];
    let n=-1;
    items.forEach(el=>{
      // What does not slide takes no turn either (the design leaves .no-st out of the count).
      if(el.classList.contains('us-ob-venn')||el.dataset.usEnter==='still'){
        if(swap.after>0)animate(el,[{opacity:0},{opacity:0}],{duration:swap.after,fill:'none'});
        return;
      }
      if(!(el.dataset.usEnter==='with-prev'&&n>=0))n++;
      const delay=swap.after+(swap.first?260+n*40:n*30);
      const run=animate(el,[{opacity:0,translate:`${swap.dir*24}px 0`},{opacity:1,translate:'0 0'}],{duration:380,delay:Math.max(0,delay),easing:EASE.out,fill:'backwards'});
      // Late (the door opened before the screen was ready): start where the design already is.
      if(run&&delay<0)run.currentTime=-delay;
    });
    const heads=[...header,...container.querySelectorAll(':scope>'+HEADER.split(',').join(',:scope>'))].filter(isShown);
    if(swap.after>0)heads.forEach(el=>animate(el,[{opacity:0},{opacity:0}],{duration:swap.after,fill:'none'}));
    // (Negative for a late first screen: what follows it is timed from the door as well.)
    return swap.after;
  }
  // The door opens: a circle from the middle, 620 ms.
  // A wrong answer: the status line shakes (−4, 4, 260 ms).
  function shake(el,px=4,ms=260){
    if(!el||reducedMotion())return;
    animate(el,[{translate:'0 0'},{translate:`-${px}px 0`},{translate:`${px}px 0`},{translate:'0 0'}],{duration:ms,fill:'none',composite:'add'});
  }
  function revealDoor(el){
    revealedAt=performance.now();
    if(!el||reducedMotion())return;
    animate(el,[{clipPath:'circle(0% at 50% 50%)'},{clipPath:'circle(150% at 50% 50%)'}],{duration:620,easing:EASE.io,fill:'none'});
  }
  // The auth door (app.js showAuthStep): from what is on screen to `id`.
  function authSwap(id){
    const overlay=document.getElementById('authOverlay');
    if(!overlay||overlay.classList.contains('hidden')||!isShown(overlay))return null;
    const tour=document.getElementById('usTour');
    const tourOn=tour&&!tour.hidden;
    const from=tourOn?tour:overlay.querySelector('.auth-step.active');
    const fromKey=tourOn?'tour':from?.id||'';
    const target=document.getElementById(id);
    if(!target)return null;
    const firstTime=overlay.dataset.usShown!=='1';
    if(firstTime){overlay.dataset.usShown='1';revealDoor(overlay);swapPending=null;const swap={dir:1,after:0,first:true,gone:[],door:revealedAt};swapPending=swap;return swap;}
    if(from===target&&!swapPending)return null;
    const dir=(SCREEN_ORDER[id]??1)<(SCREEN_ORDER[fromKey]??0)?-1:1;
    return beginSwap({from,host:overlay.querySelector('.auth-card'),dir});
  }
  function authArrive(id){
    const target=document.getElementById(id),install=document.getElementById('usAuthInstall');
    if(!swapPending)return;
    arriveSwap(target,{extra:id==='authLogin'&&install?[install]:[]});
  }
  if(typeof document==='object'&&typeof MutationObserver==='function'){
    // Once the door closes (signed in), the next opening is a first one again.
    const watchDoor=()=>{
      const overlay=document.getElementById('authOverlay');if(!overlay)return;
      new MutationObserver(()=>{if(overlay.classList.contains('hidden'))delete overlay.dataset.usShown;}).observe(overlay,{attributes:true,attributeFilter:['class']});
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchDoor,{once:true});else watchDoor();
  }

  // The two circles: my colour, the other person's, and the Noi where they meet.
  // Rosa (role francesco, who created the couple) on the left, lilla on the right.
  const LENS='M100 25.36A40 40 0 0 1 100 94.64A40 40 0 0 1 100 25.36Z';
  function drawVenn(host,{kind,role,partner}){
    const mine=role==='beatrice'?'b':'a',other=mine==='a'?'b':'a',x=side=>side==='a'?80:120;
    host.dataset.kind=kind;
    host.innerHTML=kind==='wait'
      ?`<svg viewBox="0 0 200 120" focusable="false"><circle class="ov-${mine} ov-me" cx="${x(mine)}" cy="60" r="40"/><circle class="ov-wait ov-wait-${other}" cx="${x(other)}" cy="60" r="39"/></svg>`
      :`<svg viewBox="0 0 200 120" focusable="false"><circle class="ov-a ${mine==='a'?'ov-me':'ov-partner'}" cx="80" cy="60" r="40"/><circle class="ov-b ${mine==='b'?'ov-me':'ov-partner'}" cx="120" cy="60" r="40"/>${kind==='joined'?`<circle class="ov-wait ov-wait-${other} is-gone" cx="${x(other)}" cy="60" r="39"/>`:''}<path class="ov-n" d="${LENS}"/><circle class="ov-halo" cx="100" cy="60" r="40"/></svg>`;
    const legend=document.createElement('div');legend.className='ov-l';
    for(const side of ['a','b']){
      const item=document.createElement('span'),dot=document.createElement('i'),label=document.createElement('span');
      dot.className=`ov-dot ov-dot-${side}`;
      label.className=side===mine?'ov-l-me':'ov-l-partner';
      label.textContent=side===mine?'Tu':(partner||'La tua persona');
      // Their real name stays as written; "Tu" and "La tua persona" follow the language.
      if(side!==mine&&partner&&partner!=='La tua persona')label.translate=false;
      item.append(dot,label);legend.append(item);
    }
    host.append(legend);
  }
  // The colour fills the screen, then shrinks into your circle (or theirs, when they arrive).
  // `wait`: it starts with the new step (after the old one has gone), as colorOn() in the design.
  function playColour(overlay,host,wait=0){
    if(!overlay||!host||reducedMotion())return;
    const kind=host.dataset.kind,q=selector=>host.querySelector(selector);
    const target=q(kind==='joined'?'.ov-partner':'.ov-me');
    const rect=target?.getBoundingClientRect();
    if(!rect?.width)return;
    const flood=document.createElement('span');
    flood.className='us-ob-flood';flood.setAttribute('aria-hidden','true');
    flood.style.background=kind==='joined'?'var(--us-partner)':'var(--us-tu)';
    overlay.append(flood);
    // The circle is drawn in the flood's own box (the phone screen, also when
    // the app sits in a phone-sized stage on a computer), as the design measures
    // from its .auth.
    const box=flood.getBoundingClientRect();
    const W=box.width||window.innerWidth,H=box.height||window.innerHeight;
    const cx=Math.round(rect.left+rect.width/2-box.left),cy=Math.round(rect.top+rect.height/2-box.top),at=`at ${cx}px ${cy}px`;
    const big=Math.ceil(Math.hypot(W,H));
    const drop=()=>flood.remove();
    const wave=animate(flood,[{clipPath:`circle(0px ${at})`},{clipPath:`circle(${big}px ${at})`,offset:.45},{clipPath:`circle(${Math.round(rect.width/2)}px ${at})`}],{duration:1150,delay:wait,easing:EASE.io,fill:'both'});
    if(wave)wave.finished.then(drop,drop);else drop();
    // The design's light tap (14 ms) when the colour has filled the screen.
    setTimeout(()=>{if(flood.isConnected)window.UsFeedback?.landing?.();},wait+500);
    if(kind==='wait')animate(q('.ov-wait'),[{opacity:0,transform:'scale(.85)'},{opacity:1,transform:'none'}],{duration:520,delay:wait+1050,easing:EASE.out});
    if(kind==='join'){const partner=q('.ov-partner');animate(partner,[{opacity:0,transform:`translateX(${partner?.classList.contains('ov-a')?-36:36}px)`},{opacity:1,transform:'none'}],{duration:620,delay:wait+950,easing:EASE.io});}
    if(kind==='joined'){
      animate(q('.ov-partner'),[{opacity:0},{opacity:0,offset:.99},{opacity:1}],{duration:520,delay:wait});
      animate(q('.ov-wait'),[{opacity:1},{opacity:1,offset:.99},{opacity:0}],{duration:520,delay:wait});
    }
    if(kind!=='wait'){
      animate(q('.ov-n'),[{opacity:0,transform:'scale(.4)'},{opacity:1,transform:'scale(1.1)',offset:.6},{opacity:1,transform:'none'}],{duration:560,delay:wait+(kind==='join'?1500:1250),easing:EASE.out});
      animate(q('.ov-halo'),[{opacity:.8,transform:'scale(.9)'},{opacity:0,transform:'scale(1.7)'}],{duration:820,delay:wait+(kind==='join'?1560:1310),easing:EASE.out,fill:'forwards'});
    }
  }

  // ---------- DOM: the tour (three cards, before the account; no network) ----------
  function tourAnimations(i,slide){
    const q=selector=>slide.querySelector(selector),list=[];
    const an=(el,frames,options)=>{const run=animate(el,frames,options);if(run)list.push(run);};
    if(i===0){
      an(q('.t1-a'),[{transform:'translate(-44px,0) scale(.7)',opacity:0},{transform:'none',opacity:1}],{duration:900,delay:250,easing:EASE.io});
      an(q('.t1-b'),[{transform:'translate(44px,0) scale(.7)',opacity:0},{transform:'none',opacity:1}],{duration:900,delay:250,easing:EASE.io});
      an(q('.t1-n'),[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.08)',offset:.6},{opacity:1,transform:'none'}],{duration:600,delay:1000,easing:EASE.out});
      an(q('.t1-w'),[{opacity:.8,transform:'scale(.9)'},{opacity:0,transform:'scale(1.6)'}],{duration:900,delay:1150,easing:EASE.out,fill:'forwards'});
    }
    if(i===1){
      const P=[[70,46],[120,2],[170,46]],frames=[];
      for(let j=0;j<=8;j++){
        const t=j/8,u=1-t;
        frames.push({transform:`translate(${(u*u*P[0][0]+2*u*t*P[1][0]+t*t*P[2][0]-11.6).toFixed(1)}px,${(u*u*P[0][1]+2*u*t*P[1][1]+t*t*P[2][1]-9.7).toFixed(1)}px) scale(1.35)`,opacity:j===0||j===8?0:1});
      }
      an(q('.t2-h'),frames,{duration:1000,delay:400,easing:'ease-in-out'});
      an(q('.t2-b'),[{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:420,delay:1350,easing:EASE.out});
      slide.querySelectorAll('.t2-d').forEach(dot=>an(dot,[{opacity:1},{opacity:0}],{duration:240,delay:1650}));
      slide.querySelectorAll('.t2-l').forEach(line=>an(line,[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:380,delay:1760,easing:EASE.out}));
    }
    if(i===2){
      an(q('.t3-pl'),[{transform:'translate(0px,24px) rotate(0deg) scale(.8)',opacity:0},{transform:'translate(-82px,14px) rotate(-12deg)',opacity:1}],{duration:700,delay:250,easing:EASE.out});
      an(q('.t3-pr'),[{transform:'translate(0px,24px) rotate(0deg) scale(.8)',opacity:0},{transform:'translate(82px,8px) rotate(10deg)',opacity:1}],{duration:700,delay:330,easing:EASE.out});
      an(q('.t3-r'),[{strokeDashoffset:72},{strokeDashoffset:22}],{duration:1100,delay:500,easing:EASE.io});
      an(q('.t3-x'),[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(-4px)',offset:.3},{opacity:1,transform:'translateY(-8px)',offset:.7},{opacity:0,transform:'translateY(-14px)'}],{duration:1300,delay:700,easing:EASE.out});
      an(q('.t3-c'),[{opacity:0,transform:'translateY(8px) scale(.9)'},{opacity:1,transform:'none'}],{duration:460,delay:1450,easing:EASE.spring});
    }
    return list;
  }
  // The two photos of the third card: painted here (sea at sunset, flowers),
  // as in the design; no network, no real photos before the account.
  function tourRng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function paintTourPhoto(kind){
    const w=540,h=720,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');if(!g)return '';
    const r=tourRng(kind.length*97+7);
    const lg=(y0,y1,stops)=>{const l=g.createLinearGradient(0,y0,0,y1);stops.forEach(([o,col])=>l.addColorStop(o,col));return l;};
    if(kind==='mare'){
      g.fillStyle=lg(0,430,[[0,'#2a1838'],[.45,'#7c3a5c'],[.8,'#ee8a6c'],[1,'#ffc98f']]);g.fillRect(0,0,w,430);
      const sun=g.createRadialGradient(330,420,10,330,420,190);sun.addColorStop(0,'rgba(255,224,170,.95)');sun.addColorStop(.25,'rgba(255,190,140,.5)');sun.addColorStop(1,'rgba(255,150,120,0)');g.fillStyle=sun;g.fillRect(0,200,w,240);
      g.fillStyle='#ffe2b0';g.beginPath();g.arc(330,430,46,Math.PI,0);g.fill();
      g.fillStyle=lg(430,h,[[0,'#5a2e4a'],[.3,'#2e1a33'],[1,'#120c18']]);g.fillRect(0,430,w,h-430);
      for(let i=0;i<34;i++){const y=436+i*i*.32,ww=(120-i*3)*(.6+r()*.6);g.fillStyle=`rgba(255,${200-i*2},150,${.5-i*.013})`;g.fillRect(330-ww/2+(r()-.5)*20,y,ww,2);}
      g.fillStyle='#0c0810';g.fillRect(0,640,w,80);g.beginPath();g.moveTo(0,640);g.quadraticCurveTo(270,612,540,640);g.fill();
      [[118,0],[140,4]].forEach(([x,o])=>{g.beginPath();g.arc(x,566+o,11,0,7);g.fill();g.beginPath();if(g.roundRect)g.roundRect(x-12,578+o,24,50,10);else g.rect(x-12,578+o,24,50);g.fill();});
    }else{
      g.fillStyle='#24182c';g.fillRect(0,0,w,h);
      for(let i=0;i<46;i++){const x=r()*w,y=r()*h,R=20+r()*46;g.fillStyle=['#ff7c96','#ffb3a1','#f3b76e','#d98be0','#fff1e6'][i%5];for(let p=0;p<5;p++){const a=p/5*6.283+r();g.beginPath();g.ellipse(x+Math.cos(a)*R*.45,y+Math.sin(a)*R*.45,R*.42,R*.26,a,0,7);g.fill();}g.fillStyle='#5a3a1c';g.beginPath();g.arc(x,y,R*.16,0,7);g.fill();}
    }
    // Film grain, as on every photo of the design.
    const t=document.createElement('canvas');t.width=t.height=96;const x=t.getContext('2d'),d=x.createImageData(96,96);
    for(let i=0;i<d.data.length;i+=4){const v=r()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=26;}
    x.putImageData(d,0,0);g.save();g.globalCompositeOperation='overlay';g.fillStyle=g.createPattern(t,'repeat');g.fillRect(0,0,w,h);g.restore();
    return c.toDataURL('image/jpeg',.86);
  }
  function paintTourPhotos(root){
    for(const [selector,kind] of [['.t3-pl','mare'],['.t3-pr','fiori']]){
      const img=root.querySelector(selector);
      if(!img||img.getAttribute('src'))continue;
      try{const url=paintTourPhoto(kind);if(url)img.src=url;}catch(_e){}
    }
  }
  function mountTour({openStep}){
    const root=document.getElementById('usTour'),overlay=document.getElementById('authOverlay');
    const track=document.getElementById('usTourTrack'),next=document.getElementById('usTourNext');
    if(!root||!overlay||!track||!next)return Object.freeze({maybeOpen:()=>false,close(){},markSeen(){},get open(){return false;}});
    const slides=[...track.children],dots=[...root.querySelectorAll('[data-us-tour-dot]')];
    // aria-roledescription is not one of the attributes i18n.js follows.
    const t=window.UsI18n?.t;
    if(typeof t==='function')root.querySelectorAll('[aria-roledescription]').forEach(el=>el.setAttribute('aria-roledescription',t(el.getAttribute('aria-roledescription'))));
    let current=-1,runs=[],isOpen=false;
    const markSeen=()=>storeSet(localStorage,FIRST_RUN_KEYS.tourSeen,'1');
    function select(i){
      if(i===current||i<0||i>=slides.length)return;
      current=i;
      dots.forEach((dot,j)=>{if(j===i)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
      next.textContent=i===slides.length-1?'Iniziamo':'Avanti';
      // Each card plays once, when it arrives.
      (runs[i]||[]).forEach(run=>{if(run.playState==='paused'&&run.currentTime===0)run.play();});
    }
    const indexNow=()=>Math.round(track.scrollLeft/Math.max(1,track.clientWidth));
    function go(i){
      const left=Math.max(0,Math.min(slides.length-1,i))*track.clientWidth;
      try{track.scrollTo({left,behavior:reducedMotion()?'auto':'smooth'});}catch(_e){track.scrollLeft=left;}
      if(reducedMotion())select(indexNow());
    }
    track.addEventListener('scroll',()=>{if(isOpen)select(indexNow());},{passive:true});
    dots.forEach((dot,i)=>dot.addEventListener('click',()=>go(i)));
    function close(){
      if(!isOpen)return;
      isOpen=false;markSeen();
      root.hidden=true;overlay.classList.remove('us-tour-active');
      runs.flat().forEach(run=>{try{run.cancel();}catch(_e){}});runs=[];
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
    }
    function focusHeading(id){
      const heading=document.querySelector(`#${id} h2`);if(!heading)return;
      if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    }
    function leave(target){
      // The tour leaves like any step (to the right, 180 ms).
      beginSwap({from:root,host:overlay.querySelector('.auth-card'),dir:1});
      close();
      if(target==='signup'&&window.usS31Auth?.go){window.usS31Auth.go('signup');focusHeading('usSignup');return;}
      openStep?.('authLogin');focusHeading('authLogin');
    }
    next.addEventListener('click',()=>{const i=current<0?0:current;if(i<slides.length-1)go(i+1);else leave('signup');});
    document.getElementById('usTourSkip')?.addEventListener('click',()=>leave('login'));
    document.getElementById('usTourLogin')?.addEventListener('click',()=>leave('login'));
    function maybeOpen({returningDevice=false}={}){
      if(isOpen)return true;
      if(returningDevice||!tourWanted(localStorage))return false;
      isOpen=true;current=-1;
      // Opened over the sign-in: the tour arrives in its place.
      const login=overlay.querySelector('.auth-step.active');
      const swap=beginSwap({from:login,host:overlay.querySelector('.auth-card'),dir:-1});
      overlay.classList.add('us-tour-active');root.hidden=false;track.scrollLeft=0;
      paintTourPhotos(root);
      runs=reducedMotion()?[]:slides.map((slide,i)=>{const list=tourAnimations(i,slide);list.forEach(run=>run.pause());return list;});
      select(0);
      arriveSwap(root,{swap});
      // The first card's drawing is timed from the door too.
      if(swap?.late)(runs[0]||[]).forEach(run=>{try{run.currentTime=swap.late;}catch(_e){}});
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
      return true;
    }
    return Object.freeze({maybeOpen,close,markSeen,get open(){return isOpen;}});
  }

  // ---------- DOM: the phone setup after pairing ----------
  // What was typed in the "Tu" step in this tab, for the summary only.
  let typedBirthday={userId:'',value:null};
  function mountSetup(){
    const overlay=document.getElementById('usDeviceSetup');
    const $=id=>document.getElementById(id);
    if(!overlay)return Object.freeze({maybeOpen:async()=>false,close(){},markPasswordSignIn(){},get open(){return false;}});
    const primary=$('usSetupPrimary'),secondary=$('usSetupSecondary'),body=$('usSetupBody');
    let isOpen=false,userId='',mode=null,profile=null,steps=[],index=0,busy=false,run=0,pushKind='unknown',results={push:null,place:null},isolated=[];
    // The widget row of "Tutto pronto": idle → pending → asked → placed (or retry / missed / unsupported).
    let widget={offer:false,state:'idle',at:0},widgetTimer=0;
    const partnerName=()=>{try{return window.UsIdentity?.current?.()?.partnerName||'La tua persona';}catch(_e){return 'La tua persona';}};
    // Modal: the app behind cannot be reached while this is open.
    function isolate(on){
      if(on&&!isolated.length){
        for(const el of document.body.children){
          if(el===overlay||el.id==='usAppLock'||['SCRIPT','STYLE','TEMPLATE'].includes(el.tagName))continue;
          // An inert set by the app lock belongs to the lock, which lifts it itself.
          isolated.push([el,el.dataset?.usAppLockInert?false:el.inert,el.getAttribute('aria-hidden')]);el.inert=true;el.setAttribute('aria-hidden','true');
        }
      }else if(!on){
        for(const [el,inert,aria] of isolated){
          if(!el.dataset?.usAppLockInert)el.inert=inert;
          if(aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',aria);
        }
        isolated=[];
      }
    }
    function status(text,kind){
      const node=$('usSetupStatus');node.textContent=text||'';
      if(text&&kind)node.dataset.kind=kind;else node.removeAttribute('data-kind');
      if(text&&kind==='error')shake(node);
    }
    function setBusy(on){busy=on;primary.disabled=on;secondary.disabled=on;}
    function sharingNow(){try{return Boolean(window.UsLocation?.isSharing?.());}catch(_e){return false;}}
    function kickerFor(step){
      if(step==='noi'||step==='color')return {text:'Voi · 2 di 4',progress:.5};
      if(step==='push'||step==='place'){
        const label=step==='push'?'Notifiche':'Posizione';
        if(mode==='device'){const own=steps.filter(s=>s==='push'||s==='place'),n=own.indexOf(step)+1;return {text:`${label} · ${n} di ${own.length}`,progress:n/own.length};}
        return {text:step==='push'?'Notifiche · 3 di 4':'Posizione · 4 di 4',progress:step==='push'?.75:1};
      }
      return {text:mode==='device'?'US · Questo telefono':'US · Tutto pronto',progress:1};
    }
    function copyFor(step){
      const partner=partnerName(),role=profile?.role;
      if(step==='noi')return `${partner} ha accettato l’invito ed è ${partnerColourName(role)}, tu ${colourName(role)}. Dove vi incontrate nasce il vostro colore.`;
      if(step==='color')return `${partner} è ${partnerColourName(role)}. Ognuno ha il suo colore, uguale su entrambi i telefoni: dove vi incontrate nasce il Noi.`;
      if(step==='push')return 'Solo per le cose vostre, anche a US chiusa. Cosa ricevere lo scegli tu.';
      if(step==='place')return 'Se la attivi, in Oggi vedete la distanza tra voi.';
      return mode==='device'?'Su questo telefono è tutto a posto.':'';
    }
    function refreshPartner(redrawReady=true){
      if(!isOpen)return;
      const partner=partnerName(),step=steps[index];
      $('usSetupCopy').textContent=copyFor(step);
      $('usSetupPushPartner').textContent=`${partner} ti pensa ♡`;
      $('usSetupPointPartner').textContent=`${partner} vede solo la distanza, mai dove sei.`;
      const label=$('usSetupVenn').querySelector('.ov-l-partner');if(label){label.textContent=partner;label.translate=partner==='La tua persona';}
      if(step==='ready'&&redrawReady)drawReady(false);
    }
    function readyRows(){
      const rows=[];
      if(mode!=='device'){
        const typed=typedBirthday.userId===userId?typedBirthday.value:null;
        const saved=storeGet(localStorage,FIRST_RUN_KEYS.birthdaySaved(userId));
        rows.push({icon:'user',title:profile?.display_name||'Tu',detail:typed?`Compleanno il ${typed.day} ${MONTHS[typed.month-1]}`:saved?'Compleanno nel vostro calendario':'Compleanno da aggiungere in Noi',ok:true});
        let started='';try{started=window.UsCoupleContext?.snapshot?.()?.couple?.started_on||'';}catch(_e){}
        const days=daysTogether(started);
        rows.push({icon:'heart',title:days===null?'I vostri giorni insieme':`Insieme da ${days.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} ${days===1?'giorno':'giorni'}`,detail:days===null?'Li contate in Oggi':`Dal ${italianDate(started)}`,ok:true});
      }
      if(window.UsNotifications?.supported?.()){
        const on=results.push===true||pushKind==='active';
        rows.push({icon:'bell',title:on?'Notifiche attive':'Notifiche non attive',detail:on?'Le scegli dalle Impostazioni':'Le attivi quando vuoi',ok:on});
      }
      const place=results.place===true||sharingNow();
      rows.push({icon:'pin',title:place?'Distanza attiva':'Distanza non attiva',detail:place?'Solo la distanza, mai dove sei':'La attivi quando vuoi da Oggi',ok:place});
      if(widget.offer)rows.push(widgetRow());
      return rows;
    }
    const WIDGET_DETAIL={
      idle:'Un pensiero con un tocco, anche con US chiusa.',
      pending:'Preparo il widget…',
      asked:'Conferma sulla schermata che si è aperta.',
      placed:'Aggiunto alla Home',
      retry:'Il telefono non ha aperto la richiesta. Riprova.',
      missed:'Non aggiunto. Riprova oppure usa la sezione Widget della Home Android.',
      unsupported:'Il launcher non supporta aggiunta automatica. Usa i widget della Home.'
    };
    function widgetRow(){
      const state=widget.state,placed=state==='placed';
      const action=placed||state==='unsupported'?'':state==='retry'||state==='missed'?'Riprova':'Aggiungi il widget';
      return {key:'widget',icon:'widget',title:placed?'Widget sulla Home':'Widget Ti penso',detail:WIDGET_DETAIL[state]||WIDGET_DETAIL.idle,ok:placed,action,waiting:state==='pending'||state==='asked'};
    }
    // Rows are drawn once; the widget row then changes in place, so its
    // status line is read out and the button keeps its focus.
    function paintRow(li,row){
      li.className=row.ok?'is-ok':'';
      li.querySelector('b').textContent=row.title;
      li.querySelector('small').textContent=row.detail;
      const mark=li.querySelector('i');mark.hidden=Boolean(row.action);
      let button=li.querySelector('.us-setup-ready-action');
      if(row.action){
        if(!button){button=document.createElement('button');button.type='button';button.className='us-setup-ready-action';button.dataset.usSetupWidget='';li.insertBefore(button,mark);}
        // aria-disabled, not disabled: the button keeps its focus while the phone asks.
        button.textContent=row.action;if(row.waiting)button.setAttribute('aria-disabled','true');else button.removeAttribute('aria-disabled');
      }else if(button){
        const had=button===document.activeElement;button.remove();
        if(had)primary.focus({preventScroll:true});
      }
    }
    function drawReady(play,after=0){
      const list=$('usSetupReady');list.replaceChildren();
      for(const row of readyRows()){
        const li=document.createElement('li'),icon=document.createElement('span'),text=document.createElement('span'),title=document.createElement('b'),detail=document.createElement('small'),mark=document.createElement('i');
        icon.className=`us-setup-ready-icon us-setup-ready-icon--${row.icon}`;icon.setAttribute('aria-hidden','true');
        if(row.icon==='user'&&profile?.display_name)title.translate=false;text.append(title,detail);mark.setAttribute('aria-hidden','true');
        if(row.key){li.dataset.row=row.key;detail.setAttribute('aria-live','polite');}
        li.append(icon,text,mark);paintRow(li,row);list.append(li);
      }
      if(play&&!reducedMotion()){
        [...list.children].forEach((li,i)=>{if(li.classList.contains('is-ok'))animate(li.lastElementChild,[{transform:'scale(0)'},{transform:'scale(1.25)',offset:.6},{transform:'none'}],{duration:420,delay:after+520+i*150,easing:EASE.out});});
        const ticket=run;setTimeout(()=>{if(ticket===run&&isOpen)window.UsFeedback?.success?.();},after+700);
      }
    }
    function paintWidget(){
      const li=$('usSetupReady').querySelector('[data-row="widget"]');
      if(li)paintRow(li,widgetRow());else if(steps[index]==='ready')drawReady(false);
    }
    function placedWidget(){
      clearTimeout(widgetTimer);widget.state='placed';paintWidget();
      const mark=$('usSetupReady').querySelector('[data-row="widget"]>i');
      if(mark&&!reducedMotion())animate(mark,[{transform:'scale(0)'},{transform:'scale(1.25)',offset:.6},{transform:'none'}],{duration:420,easing:EASE.out});
    }
    // Same route as Impostazioni › Widget: the launcher's own request, then a
    // look at the Home screen every 1.5 s for 20 s.
    function watchWidget(){
      clearTimeout(widgetTimer);
      const ticket=run;
      widgetTimer=setTimeout(async()=>{
        if(ticket!==run||!isOpen||widget.state!=='asked')return;
        let count=0;try{count=Number((await window.UsWidgets.installed())?.installed?.think)||0;}catch(_e){}
        if(ticket!==run||!isOpen||widget.state!=='asked')return;
        if(count>0)return placedWidget();
        if(Date.now()-widget.at>20000){widget.state='missed';paintWidget();return;}
        watchWidget();
      },1500);
    }
    async function addWidget(){
      if(!isOpen||!widget.offer||['pending','asked','placed','unsupported'].includes(widget.state))return;
      const ticket=run;
      widget.state='pending';paintWidget();
      let result=null;
      try{result=await window.UsWidgets.requestPin('think');}catch(_e){}
      if(ticket!==run||!isOpen||widget.state!=='pending')return;
      if(!result?.requested){widget.state=result?.supported?'retry':'unsupported';paintWidget();return;}
      widget.state='asked';widget.at=Date.now();paintWidget();watchWidget();
    }
    $('usSetupReady').addEventListener('click',event=>{if(event.target.closest('[data-us-setup-widget]'))addWidget();});
    window.addEventListener('us:widget-pinned',event=>{if(isOpen&&widget.offer&&event.detail?.kind==='think'&&widget.state!=='placed')placedWidget();});
    function playVisual(step,after=0){
      if(reducedMotion())return;
      if(step==='push')$('usSetupPushVis').querySelectorAll('.us-setup-note').forEach((note,i)=>animate(note,[{opacity:0,translate:'0 -20px',offset:0}],{duration:520,delay:after+320+i*170,easing:EASE.soft,fill:'backwards'}));
      if(step==='place'){
        const vis=$('usSetupPlaceVis');
        vis.querySelectorAll('.pl-d').forEach((dot,i)=>animate(dot,[{transform:'scale(0)'},{transform:'none'}],{duration:460,delay:after+260+i*120,easing:EASE.spring}));
        vis.querySelectorAll('.pl-h').forEach((halo,i)=>animate(halo,[{transform:'scale(.3)',opacity:0},{transform:'none',opacity:1}],{duration:700,delay:after+420+i*120,easing:EASE.out}));
        animate(vis.querySelector('.pl-ln'),[{transform:'scaleX(0)'},{transform:'none'}],{duration:640,delay:after+640,easing:EASE.io});
        animate(vis.querySelector('.pl-chip'),[{opacity:0,scale:.85},{opacity:1,scale:1}],{duration:420,delay:after+1000,easing:EASE.spring});
      }
    }
    // What leaves when the setup opens: the invite (or the sign-in) under it.
    let openSwap=null,shownStep='';
    const card=overlay.querySelector('.us-setup-card'),head=()=>[$('usSetupKicker'),$('usSetupProgress')];
    function show(i){
      const step=steps[i],prevStep=shownStep;
      // Same screen engine as the sign-in: the old step leaves, the new one comes in.
      let swap;
      if(prevStep&&prevStep!==step&&!overlay.classList.contains('is-pending'))swap=beginSwap({from:body,host:card,dir:(SCREEN_ORDER[step]??12)<(SCREEN_ORDER[prevStep]??12)?-1:1,header:head()});
      else if(openSwap){openSwap.swap.go?.();swap={dir:1,first:false,gone:[],after:LEAVE_MS};swapPending=swap;}
      else{revealDoor(overlay);swap={dir:1,first:true,gone:[],after:0,door:revealedAt};swapPending=swap;}
      if(!prevStep){
        // The first step: the bar is there already (where the step that left had
        // it, or at its place when there was none), as the design's .a-prog.
        const bar=$('usSetupProgress'),fill=bar.firstElementChild,was=openSwap?.bar;
        if(fill){
          fill.style.transition='none';
          bar.style.setProperty('--us-progress',was?was.progress:String(kickerFor(step).progress));
          if(was?.color)fill.style.backgroundColor=was.color;
          fill.getBoundingClientRect();
          fill.style.removeProperty('transition');fill.style.removeProperty('background-color');
        }
      }
      openSwap=null;shownStep=step;
      index=i;setBusy(false);status('');
      const role=profile?.role,kicker=kickerFor(step);
      overlay.classList.remove('is-pending');
      overlay.dataset.step=step;
      $('usSetupKicker').textContent=kicker.text;
      $('usSetupProgress').style.setProperty('--us-ob-delay',`${Math.max(0,swap?.after||0)}ms`);
      $('usSetupProgress').style.setProperty('--us-progress',String(kicker.progress));
      // Your colour and "Tutto pronto" have no status line in the design.
      if(['noi','color','ready'].includes(step))$('usSetupStatus').dataset.usEnter='skip';else delete $('usSetupStatus').dataset.usEnter;
      const venn=$('usSetupVenn');
      venn.hidden=!(step==='noi'||step==='color');
      $('usSetupPushVis').hidden=step!=='push';
      $('usSetupPlaceVis').hidden=step!=='place';
      $('usSetupPoints').hidden=step!=='place';
      $('usSetupReady').hidden=step!=='ready';
      secondary.hidden=!(step==='push'||step==='place');
      const title=$('usSetupTitle');
      if(step==='noi'){setTitle(title,'Ora siete ','un Noi');drawVenn(venn,{kind:'joined',role,partner:partnerName()});primary.textContent='Continua';}
      if(step==='color'){setTitle(title,'Il tuo colore è ',colourName(role));drawVenn(venn,{kind:'join',role,partner:partnerName()});primary.textContent='Continua';}
      if(step==='push'){setTitle(title,'Non perderti ','un Ti penso');primary.textContent='Attiva le notifiche';}
      if(step==='place'){setTitle(title,'Anche da ','lontano');primary.textContent='Attiva la posizione';}
      if(step==='ready'){if(mode==='device')setTitle(title,'Eccoti ','di nuovo');else setTitle(title,'Il vostro US ','è pronto');primary.textContent='Entra in US';drawReady(false);}
      refreshPartner(false);
      overlay.scrollTop=0;
      title.focus({preventScroll:true});
      // While the shell reveals itself the overlay can be one frame from visible.
      if(document.activeElement!==title)requestAnimationFrame(()=>{if(isOpen&&steps[index]===step&&!overlay.contains(document.activeElement))title.focus({preventScroll:true});});
      const after=arriveSwap(body,{swap,header:head()});
      if(step==='noi'||step==='color')playColour(overlay,venn,after);
      if(step==='ready')drawReady(true,after);
      playVisual(step,after);
    }
    function advance(){if(!isOpen)return;if(index<steps.length-1)show(index+1);else finish();}
    function later(fn,ms){const ticket=run;setTimeout(()=>{if(ticket===run&&isOpen)fn();},reducedMotion()?Math.min(ms,600):ms);}
    async function activatePush(){
      setBusy(true);status('Attivo…');
      const ticket=run;let result={ok:false,kind:'error'};
      try{result=await window.UsNotifications.enable();}catch(_e){}
      if(ticket!==run||!isOpen)return;
      Promise.resolve().then(()=>window.refreshWebPushUi?.()).catch(()=>{});
      if(result?.ok){results.push=true;status('Notifiche attive ♡','success');later(advance,900);return;}
      setBusy(false);
      if(result?.kind==='busy'){status('');return;}
      status(result?.kind==='denied'?'Permesso negato: puoi consentirle dalle impostazioni del telefono'
        :result?.kind==='unavailable'?'Notifiche non disponibili in questa versione di US':`${result?.kind==='network'&&result?.pending?'La rete non risponde: le attivo da solo appena può':result?.kind==='network'?'Rete lenta: riprova tra poco, oppure con il Wi-Fi':'Non riesco ad attivare le notifiche'}${result?.code?` · ${result.code}`:''}`,'error');
    }
    function activatePlace(){
      setBusy(true);
      let ok=false;try{ok=window.UsLocation?.start?.()===true;}catch(_e){ok=false;}
      results.place=ok;
      if(ok){status('Distanza attiva ♡','success');later(advance,900);return;}
      setBusy(false);status('Non riesco ad attivare la posizione','error');
    }
    // "Entra in US": the setup fades (260 ms), then the two circles meet and
    // become the logo, the words come, and a circle closes on the app.
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    async function playIntro(ticket){
      const intro=$('usSetupIntro');
      const [a,b]=intro.querySelectorAll('.c'),logo=intro.querySelector('.logo'),word=intro.querySelector('.word');
      const live=()=>ticket===run;
      if(reducedMotion()){
        overlay.classList.add('is-intro');intro.hidden=false;logo.style.opacity='1';
        await wait(700);logo.style.opacity='';return live();
      }
      try{await animate(overlay,[{opacity:1},{opacity:0}],{duration:260,fill:'forwards'})?.finished;}catch(_e){return false;}
      if(!live())return false;
      overlay.classList.add('is-intro');intro.hidden=false;
      overlay.getAnimations().forEach(x=>x.cancel());
      const fill={fill:'forwards'};
      const meet=animate(a,[{translate:'-120px 0',scale:.6,opacity:0},{translate:'-38px 0',scale:1,opacity:1,offset:.5},{translate:'0 0',scale:1.05,opacity:1}],{duration:1100,easing:EASE.io,...fill});
      animate(b,[{translate:'120px 0',scale:.6,opacity:0},{translate:'38px 0',scale:1,opacity:1,offset:.5},{translate:'0 0',scale:1.05,opacity:1}],{duration:1100,easing:EASE.io,...fill});
      try{await meet?.finished;}catch(_e){return false;}
      if(!live())return false;
      [a,b].forEach(circle=>animate(circle,[{scale:1.05,opacity:1},{scale:.2,opacity:0}],{duration:420,easing:EASE.io,...fill}));
      animate(logo,[{opacity:0,scale:.6},{opacity:1,scale:1.06,offset:.7},{opacity:1,scale:1}],{duration:520,delay:140,easing:'ease-out',...fill});
      try{await animate(word,[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:420,delay:420,easing:EASE.out,...fill})?.finished;}catch(_e){return false;}
      await wait(450);if(!live())return false;
      try{await animate(intro,[{clipPath:'circle(150% at 50% 46%)'},{clipPath:'circle(0% at 50% 46%)'}],{duration:620,easing:EASE.io,...fill})?.finished;}catch(_e){return false;}
      return live();
    }
    async function finish({silent=false}={}){
      if(!isOpen)return;
      const id=userId,ticket=++run;
      storeSet(localStorage,FIRST_RUN_KEYS.setupDone(id),'1');
      storeRemove(localStorage,FIRST_RUN_KEYS.setupPending(id));
      if(storeGet(sessionStorage,FIRST_RUN_KEYS.passwordSignIn)===id)storeRemove(sessionStorage,FIRST_RUN_KEYS.passwordSignIn);
      if(!silent){setBusy(true);if(!await playIntro(ticket)&&ticket!==run)return;}
      close();
      // Mockup UP.intro: once the circle has closed on the app, Oggi's blocks rise in.
      if(!silent&&!reducedMotion()){try{window.UsDueColori?.stagger?.(document.querySelector('.page.active')?.id||'home',0);}catch(_e){}}
    }
    function close(){
      run++;
      const hadFocus=overlay.contains(document.activeElement);
      isOpen=false;busy=false;userId='';mode=null;profile=null;steps=[];index=0;shownStep='';
      openSwap?.swap.drop();openSwap=null;
      overlay.classList.remove('is-intro');
      clearTimeout(widgetTimer);widget={offer:false,state:'idle',at:0};
      overlay.hidden=true;overlay.classList.remove('is-pending');delete overlay.dataset.step;delete overlay.dataset.mode;
      $('usSetupIntro').hidden=true;
      overlay.querySelectorAll('.us-ob-flood').forEach(el=>el.remove());
      try{overlay.getAnimations({subtree:true}).forEach(a=>a.cancel());}catch(_e){}
      isolate(false);
      if(hadFocus)document.activeElement?.blur?.();
    }
    primary.addEventListener('click',()=>{
      if(busy||!isOpen)return;
      const step=steps[index];
      if(step==='push')return activatePush();
      if(step==='place')return activatePlace();
      if(step==='ready')return finish();
      advance();
    });
    secondary.addEventListener('click',()=>{
      if(busy||!isOpen)return;
      const step=steps[index];
      if(step==='push')results.push=false;
      if(step==='place')results.place=false;
      advance();
    });
    window.addEventListener('us-identity-change',()=>refreshPartner(true));
    async function maybeOpen(nextProfile){
      const id=nextProfile?.id||'';
      const nextMode=setupMode({userId:id,local:localStorage,session:sessionStorage});
      if(!nextMode){
        // A password sign-in that has nothing left to set up is spent.
        if(id&&storeGet(sessionStorage,FIRST_RUN_KEYS.passwordSignIn)===id)storeRemove(sessionStorage,FIRST_RUN_KEYS.passwordSignIn);
        return false;
      }
      if(isOpen&&userId===id)return true;
      if(isOpen)close();
      const ticket=++run;
      isOpen=true;userId=id;mode=nextMode;profile=nextProfile;steps=[];index=0;results={push:null,place:null};pushKind='unknown';
      // The invite (or the sign-in) still on screen leaves into the setup.
      const auth=document.getElementById('authOverlay'),onb=document.getElementById('usOnboarding');
      const from=auth&&!auth.classList.contains('hidden')?(onb?.classList.contains('active')?onb:auth.querySelector('.auth-step.active')):null;
      overlay.dataset.mode=nextMode;overlay.classList.add('is-pending');overlay.hidden=false;
      overlay.scrollTop=0;isolate(true);
      openSwap?.swap.drop();openSwap=null;
      if(from&&isShown(from)&&!reducedMotion()){
        // The step kept on screen has its words back before it is copied (busy() ends before show()).
        if(from===onb)releaseKept?.();
        swapPending=null;
        // The bar of the step that leaves goes on in the setup (same place, same colour, then on).
        const fromBar=from.querySelector(':scope>.us-ob-progress:not([hidden])>i');
        const bar=fromBar&&isShown(fromBar)?{progress:fromBar.parentElement.style.getPropertyValue('--us-progress')||'0',color:getComputedStyle(fromBar).backgroundColor}:null;
        // It stays, still, until the first step is ready, then leaves as in show().
        const swap=beginSwap({from,host:card,dir:1,hold:true});
        if(swap?.gone.length)openSwap={swap,bar};
      }
      const [push,offer]=await Promise.all([pushStepState(window.UsNotifications),widgetOfferWanted(window.UsWidgets)]);
      if(ticket!==run||!isOpen)return false;
      widget={offer,state:'idle',at:0};
      pushKind=push.kind;
      steps=setupSteps({mode:nextMode,push:push.wanted,place:placeStepWanted(window.UsLocation,typeof navigator!=='undefined'&&Boolean(navigator.geolocation))});
      if(!steps.length){await finish({silent:true});return false;}
      show(0);
      return true;
    }
    function markPasswordSignIn(id){if(id)storeSet(sessionStorage,FIRST_RUN_KEYS.passwordSignIn,String(id));}
    return Object.freeze({maybeOpen,close,markPasswordSignIn,get open(){return isOpen;}});
  }

  function mount({readProfile,rpc,resume,signOut,openStep,insertEvent}){
    const root=document.getElementById('usOnboarding');
    const node=id=>document.getElementById(id);
    let mode='me',lastKind='',lastView='',lastInvite='',hiddenPrivate=[],me={name:'',birthday:null},meFor='',justCreated=false,note={text:'',kind:''},dismissed='';
    // The button you pressed says what is happening while it works (the design's busy()).
    let pressed=null;
    // Paired from a step on screen: that step stays, still, until the setup takes its place.
    let keeping=false;
    function letGo(){
      if(!keeping)return;
      keeping=false;
      releaseKept?.();
      const overlay=node('authOverlay');
      overlay.style.removeProperty('--us-tu');overlay.style.removeProperty('--us-partner');
      delete root.dataset.usBusy;
      node('mc3CodeShown').textContent='';
      if(!['SIGNED_OUT','PAIRED'].includes(controller.state.kind))return;
      root.classList.remove('active');root.dataset.view='';
    }
    const clearForms=()=>root.querySelectorAll('input,textarea,.us-ob-together select').forEach(el=>{el.value='';});
    // An invite link opened this tab: keep its code before anything else reads the address.
    if(typeof location==='object')takeInvite({location,history:globalThis.history,session:globalThis.sessionStorage});
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
    const daySelect=node('mc3BirthDay'),monthSelect=node('mc3BirthMonth');
    for(let day=1;day<=31;day++)daySelect.add(new Option(String(day),String(day)));
    MONTHS.forEach((month,i)=>monthSelect.add(new Option(month,String(i+1))));
    const dateDay=node('mc3DateDay'),dateMonth=node('mc3DateMonth'),dateYear=node('mc3DateYear');
    for(let day=1;day<=31;day++)dateDay.add(new Option(String(day),String(day)));
    MONTHS.forEach((month,i)=>dateMonth.add(new Option(month,String(i+1))));
    togetherYears().forEach(year=>dateYear.add(new Option(String(year),String(year))));
    const tour=mountTour({openStep});
    const setup=mountSetup();
    function fillMe(){
      node('mc3Name').value=me.name;
      daySelect.value=me.birthday?String(me.birthday.day):'';
      monthSelect.value=me.birthday?String(me.birthday.month):'';
    }
    function viewFor(state){
      if(state.kind==='AUTHENTICATED_NO_PROFILE')return ['me','choice','create','join'].includes(mode)?mode:'me';
      if(state.kind==='MEMBER_WAITING_PARTNER')return mode==='color'?'color':'waiting';
      return 'error';
    }
    function render(state){
      // What was typed in "Tu" belongs to one account: never carry it across a switch.
      const uid=controller.userId;
      if(uid&&uid!==meFor){me={name:'',birthday:null};justCreated=false;meFor=uid;}
      const active=!['SIGNED_OUT','PAIRED'].includes(state.kind);
      const changed=state.kind!==lastKind;
      if(changed){
        note={text:'',kind:''};dismissed='';
        if(state.kind==='SIGNED_OUT'){me={name:'',birthday:null};justCreated=false;}
        mode=state.kind==='MEMBER_WAITING_PARTNER'&&justCreated?'color':me.name?'choice':'me';
      }
      // Paired from a step on screen (the join, or the invite that found its
      // partner): as in the design the step stays until the next one takes its
      // place (the setup, with the usual change of screen), never an empty screen
      // while the app checks the couple. Nothing on it can be used meanwhile.
      if(state.kind==='PAIRED'&&(keeping||(lastView&&root.classList.contains('active')&&isShown(root)))){
        if(!keeping){
          keeping=true;
          const overlay=node('authOverlay'),cs=getComputedStyle(overlay);
          // Its colours are the onboarding's (they follow html.us-onboarding-active).
          for(const name of ['--us-tu','--us-partner']){const value=cs.getPropertyValue(name).trim();if(value)overlay.style.setProperty(name,value);}
          // The pressed button keeps saying what is happening until the step leaves.
          releaseKept=()=>{releaseKept=null;if(pressed){if(pressed.text)pressed.button.textContent=pressed.text;delete pressed.button.dataset.usBusy;pressed=null;}};
          root.dataset.usBusy='';
          root.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=true;});
          // Nothing typed or copyable stays behind (the code shown is a picture until it leaves).
          clearForms();
          protect(false);
        }
        lastKind=state.kind;lastView='';
        if(state.profile?.couple_id)saveBirthday({profile:state.profile,local:localStorage,session:sessionStorage,insertEvent}).catch(()=>{});
        scheduleCheck(state);
        window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
        return;
      }
      letGo();
      const view=viewFor(state),waiting=state.kind==='MEMBER_WAITING_PARTNER',role=state.profile?.role;
      // A new screen (or, on the invite, a new code): what is on screen leaves first.
      const inviteKey=waiting?`${state.membership?.invite?.status}|${state.code}`:'';
      let swap=null;
      // A new code replaces the old one in one change, once it has arrived (the old one stays while "Genero…").
      if(active&&(view!==lastView||(view==='waiting'&&!state.busy&&inviteKey!==lastInvite))){
        const overlay=node('authOverlay'),tourRoot=node('usTour');
        const from=lastView?root:tourRoot&&!tourRoot.hidden?tourRoot:overlay.querySelector('.auth-step.active');
        const dir=view===lastView?0:(SCREEN_ORDER[view]??6)<(SCREEN_ORDER[lastView||from?.id]??1)?-1:1;
        swap=beginSwap({from,host:overlay.querySelector('.auth-card'),dir});
        // A new code is a new screen: what was said about the old one goes with it.
        if(view===lastView)note={text:'',kind:''};
      }
      if(!state.busy)lastInvite=inviteKey;
      protect(active);
      root.classList.toggle('active',active);
      if(active){
        node('authOverlay').querySelectorAll('.auth-step.active').forEach(step=>{if(step!==root)step.classList.remove('active');});
        node('authOverlay').classList.remove('hidden');
        document.documentElement.classList.remove('us-auth-pending','us-returning-device','us-auth-ready');
        tour.close();
      }
      if(changed){
        clearForms();
        if(state.kind==='AUTHENTICATED_NO_PROFILE')fillMe();else{daySelect.value='';monthSelect.value='';}
      }
      root.dataset.view=active?view:'';
      if(waiting&&role==='beatrice')node('authOverlay').dataset.usTone='beatrice';else delete node('authOverlay').dataset.usTone;
      node('mc3Kicker').textContent=view==='me'?'Tu · 1 di 4':view==='error'?'US · Spazio privato':'Voi · 2 di 4';
      node('mc3Progress').hidden=view==='error';
      // The bar moves once the old step has gone (a copied step leaves for 180 ms).
      node('mc3Progress').style.setProperty('--us-ob-delay',`${Math.max(0,swap?.after||0)}ms`);
      node('mc3Progress').style.setProperty('--us-progress',view==='me'?'.25':'.5');
      const titles={me:['Iniziamo da ','te'],choice:['Il vostro US, ','da qui'],create:['Crea il ','vostro spazio'],join:['Entra nel ','vostro US'],color:['Il tuo colore è ',colourName(role)],waiting:['Il tuo spazio ','è pronto'],error:['Verifichiamo il tuo accesso','']};
      setTitle(node('mc3Title'),...titles[view]);
      const ownName=waiting?state.profile.display_name.trim():me.name;
      const copy={
        me:'Il tuo nome lo vede la tua persona, accanto a quello che fai in US.',
        choice:me.name?`${me.name}, ora crea il vostro spazio o raggiungi la tua persona.`:'Ora crea il vostro spazio o raggiungi la tua persona.',
        create:'Da questa data partono i giorni insieme, il mesiversario e l’anniversario.',
        join:'Scrivi il codice che ti ha mandato la tua persona.',
        color:`Ognuno ha il suo colore, uguale su entrambi i telefoni. La tua persona sarà ${partnerColourName(role)}: dove vi incontrate nasce il Noi.`,
        waiting:state.code?`${ownName}, invita la tua persona: mandale questo codice.`:`${ownName}, invita la tua persona. Quando entrerà, troverete qui il vostro spazio.`,
        error:'La sessione è conservata. Puoi riprovare o uscire.'
      }[view];
      // In the colour step the words follow the two circles.
      node('mc3Copy').textContent=view==='color'?'':copy;node('mc3Copy').hidden=view==='color';
      node('mc3ColorCopy').textContent=view==='color'?copy:'';
      node('mc3Me').hidden=view!=='me';node('mc3Choice').hidden=view!=='choice';node('mc3Create').hidden=view!=='create';node('mc3Join').hidden=view!=='join';
      node('mc3Color').hidden=view!=='color';node('mc3Waiting').hidden=view!=='waiting';node('mc3Retry').hidden=state.kind!==ERROR;
      const status=node('mc3Status');
      // An error stays with the screen it belongs to: moving to another step dismisses it.
      if(!state.message)dismissed='';
      const message=state.message&&state.message!==dismissed?state.message:'';
      const said=`${status.textContent}|${status.dataset.kind||''}`;
      // Busy: the pressed button carries the words, the status line stays as it was (design).
      status.textContent=message||note.text||(state.busy&&!pressed?'Verifica in corso…':'');
      if(message)status.dataset.kind='error';else if(note.text)status.dataset.kind=note.kind||'neutral';else status.removeAttribute('data-kind');
      if(status.dataset.kind==='error'&&status.textContent&&said!==`${status.textContent}|error`)shake(status);
      // "Il vostro US" and the colour have no status line in the design: an empty one is not a step of the entrance.
      if(!message&&!note.text&&(view==='choice'||view==='color'))status.dataset.usEnter='skip';else delete status.dataset.usEnter;
      const labels={none:'Nessun invito attivo',pending:'Invito in attesa',expired:'Invito scaduto',revoked:'Invito revocato',used:'Invito utilizzato'};
      const invite=state.membership?.invite;
      node('mc3InviteStatus').textContent=waiting?(labels[invite.status]||'')+(invite.status==='pending'&&invite.expires_at&&inviteExpiry(invite.expires_at)?' · '+inviteExpiry(invite.expires_at):''):'';
      node('mc3InviteStatus').dataset.status=waiting?invite.status:'';
      node('mc3Code').value=waiting?state.code:'';
      // While a new code is made the old one stays on screen (not copyable: everything waits).
      const holdCode=waiting&&state.busy&&!state.code&&lastView==='waiting'&&!node('mc3CodeArea').hidden;
      if(!holdCode){
        node('mc3CodeArea').hidden=!waiting||!state.code;
        node('mc3CodeShown').textContent=waiting&&state.code?state.code.replace(/(.{5})/g,'$1 ').trim():'';
        node('mc3Waiting').classList.toggle('has-code',Boolean(waiting&&state.code));
      }
      node('mc3Generate').textContent=invite?.status==='none'?'Crea invito':'Genera nuovo codice';
      node('mc3Revoke').hidden=!waiting||invite?.status!=='pending';
      root.querySelectorAll('button,input,select').forEach(el=>{el.disabled=state.busy&&el.id!=='mc3Exit';});
      if(pressed&&state.busy&&active){if(pressed.label)pressed.button.textContent=pressed.label;pressed.button.dataset.usBusy='';root.dataset.usBusy='';}
      else{
        if(pressed){delete pressed.button.dataset.usBusy;if(pressed.text)pressed.button.textContent=pressed.text;pressed=null;}
        delete root.dataset.usBusy;
      }
      if(view==='color'&&lastView!=='color')drawVenn(node('mc3Venn'),{kind:'wait',role,partner:''});
      if(active&&changed){node('mc3Title').focus({preventScroll:true});node('authOverlay').scrollTop=0;}
      if(swap){
        const after=arriveSwap(root,{swap});
        if(view==='color')playColour(node('authOverlay'),node('mc3Venn'),after);
      }
      lastKind=state.kind;lastView=active?view:'';
      if(state.profile?.couple_id)saveBirthday({profile:state.profile,local:localStorage,session:sessionStorage,insertEvent}).catch(()=>{});
      scheduleCheck(state);
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
    }
    // While the invite screen is on and its code can still be used, look for
    // the partner every 10 s. Hidden or locked: suspend() stops it, the return
    // to the foreground reloads and starts it again. Paired: it stops.
    let checkTimer=0;
    const checkWanted=state=>state.kind==='MEMBER_WAITING_PARTNER'&&lastView==='waiting'&&state.membership?.invite?.status==='pending'&&!document.hidden&&!window.UsAppLock?.isLocked?.();
    function scheduleCheck(state){
      clearTimeout(checkTimer);checkTimer=0;
      if(!checkWanted(state))return;
      checkTimer=setTimeout(async()=>{
        checkTimer=0;
        if(!checkWanted(controller.state))return;
        const result=await controller.check();
        if(result?.kind==='PAIRED')return resume();
        // Nothing published (skipped, failed or overtaken): try again later.
        if(!result&&!checkTimer)scheduleCheck(controller.state);
      },CHECK_MS);
    }
    const controller=createController({readProfile,rpc,onChange:render,onJoined:coupleId=>{window.sendWebPushEvent?.('partner_joined',coupleId);}});
    const run=async(action,kind)=>{
      const result=await action();
      const joined=result?.profile?.couple_id&&(result.kind==='PAIRED'||result.kind==='MEMBER_WAITING_PARTNER');
      if(kind&&joined)storeSet(localStorage,FIRST_RUN_KEYS.setupPending(result.profile.id),kind==='create'?'created':'joined');
      if(kind==='create'&&result?.kind!=='MEMBER_WAITING_PARTNER')justCreated=false;
      if(result?.kind==='PAIRED'){if(kind==='join')takeInvite({session:sessionStorage,used:true});resume();}
    };
    const switchTo=(next,focusId)=>{
      clearForms();mode=next;note={text:'',kind:''};
      if(controller.state.kind==='AUTHENTICATED_NO_PROFILE')dismissed=controller.state.message||'';
      if(next==='me')fillMe();
      if(next==='create')node('mc3CreateName').value=me.name;
      if(next==='join'){node('mc3JoinName').value=me.name;node('mc3JoinCode').value=takeInvite({location,history,session:sessionStorage});}
      render(controller.state);node(focusId).focus();
    };
    // A step of this phone only (Tu, Voi, create, join, the colour to the
    // invite) changes as in the design (show()): what is on screen leaves
    // first, 180 ms towards where you came from, with what was typed in it,
    // and the next step is drawn once it has gone. The tap answers at once:
    // nothing is copied. Without motion the step changes at once.
    let leaving=null;
    const goTo=(next,focusId)=>{
      if(leaving)return;
      const dir=(SCREEN_ORDER[next]??6)<(SCREEN_ORDER[lastView]??6)?-1:1;
      const items=next!==lastView&&lastView&&!reducedMotion()&&isShown(root)?enterItems(root).filter(isShown):[];
      if(!items.length){switchTo(next,focusId);return;}
      const kind=controller.state.kind,ticket={};leaving=ticket;
      const runs=items.map(el=>animate(el,[{opacity:1,translate:'0 0'},{opacity:0,translate:`${-dir*24}px 0`}],{duration:LEAVE_MS,easing:EASE_IN,fill:'forwards'})).filter(Boolean);
      const done=()=>{
        if(leaving!==ticket)return;
        leaving=null;
        runs.forEach(run=>{try{run.cancel();}catch(_e){}});
        // Something else took the screen meanwhile (a new state, signed out): it stays.
        if(controller.state.kind!==kind||!root.classList.contains('active'))return;
        swapPending={dir,after:0,first:false,gone:[]};
        switchTo(next,focusId);
      };
      Promise.all(runs.map(run=>run.finished)).then(done,done);
    };
    node('mc3Me').addEventListener('submit',event=>{
      event.preventDefault();
      const name=node('mc3Name').value,check=birthdayCheck(daySelect.value,monthSelect.value);
      if(!validName(name)){note={text:'Scrivi il tuo nome (1–40 caratteri).',kind:'error'};render(controller.state);node('mc3Name').focus();return;}
      if(!check.ok){note={text:check.message,kind:'error'};render(controller.state);(daySelect.value?monthSelect:daySelect).focus();return;}
      me={name:name.trim(),birthday:check.value};note={text:'',kind:''};
      const id=controller.userId;rememberBirthday(sessionStorage,id,check.value);typedBirthday={userId:id,value:check.value};
      goTo('choice','mc3Title');
    });
    for(const [id,next,focusId] of [['mc3ChooseCreate','create','mc3DateDay'],['mc3ChooseJoin','join','mc3JoinCode'],['mc3BackCreate','choice','mc3Title'],['mc3BackJoin','choice','mc3Title'],['mc3BackMe','me','mc3Title']])node(id).addEventListener('click',()=>goTo(next,focusId));
    node('mc3ColorNext').addEventListener('click',()=>{justCreated=false;goTo('waiting','mc3Title');});
    const press=(button,label,text='')=>{if(button&&!controller.state.busy)pressed={button,label,text};};
    node('mc3Create').addEventListener('submit',event=>{event.preventDefault();justCreated=true;press(event.submitter||node('mc3Create').querySelector('[type=submit]'),'Creo…','Crea il nostro spazio');run(()=>controller.create({name:node('mc3CreateName').value,date:togetherDate(dateDay.value,dateMonth.value,dateYear.value),coupleName:node('mc3CoupleName').value}),'create');});
    // The code box is a textarea (two lines, as in the design): Enter still sends.
    node('mc3JoinCode').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();node('mc3Join').requestSubmit?.();}});
    node('mc3Join').addEventListener('submit',event=>{event.preventDefault();press(event.submitter||node('mc3Join').querySelector('[type=submit]'),'Entro…','Entra nel nostro US');const fields={name:node('mc3JoinName').value,code:node('mc3JoinCode').value};node('mc3JoinCode').value='';run(()=>controller.join(fields),'join');});
    node('mc3Generate').addEventListener('click',()=>{press(node('mc3Generate'),'Genero…');run(()=>controller.generate());});
    node('mc3Revoke').addEventListener('click',()=>{press(node('mc3Revoke'),'');run(()=>controller.revoke());});
    node('mc3Refresh').addEventListener('click',()=>{press(node('mc3Refresh'),'Verifico…','Verifica accesso partner');run(()=>controller.refresh());});
    node('mc3Retry').addEventListener('click',()=>run(()=>controller.refresh()));
    // A line under the invite that stays through the automatic checks.
    const say=(text,kind)=>{note={text,kind};render(controller.state);};
    const selectCode=()=>{node('mc3Code').focus();node('mc3Code').select();say('Seleziona e copia il codice.','neutral');};
    node('mc3CopyCode').addEventListener('click',async()=>{
      const code=controller.state.code,ticket=controller.epoch;if(!code)return;
      const still=()=>controller.epoch===ticket&&controller.state.code===code;
      try{await navigator.clipboard.writeText(code);if(still())say('Codice copiato. Condividilo soltanto con la tua persona.','success');}
      catch(_error){if(still())selectCode();}
    });
    node('mc3ShareCode').addEventListener('click',async()=>{
      const code=controller.state.code,ticket=controller.epoch;if(!code)return;
      const still=()=>controller.epoch===ticket&&controller.state.code===code;
      const how=await shareInvite(inviteMessage(code,window.UsI18n?.t));
      if(!still())return;
      if(how==='shared')say('Fatto. Appena la tua persona entra, lo vedi qui.','success');
      else if(how==='copied')say('Messaggio copiato: incollalo nella chat con la tua persona.','success');
      else if(how==='failed')selectCode();
    });
    node('mc3Exit').addEventListener('click',async()=>{const id=controller.userId;controller.suspend();clearForms();rememberBirthday(sessionStorage,id,null);me={name:'',birthday:null};justCreated=false;await signOut();});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){controller.suspend();clearForms();}
      else if(controller.state.kind!== 'SIGNED_OUT'&&controller.state.kind!=='PAIRED')resume();
    });
    window.addEventListener('us-app-lock-change',event=>{if(event.detail?.locked){controller.suspend();clearForms();}else resume();});
    window.addEventListener('pagehide',()=>{controller.suspend();clearForms();});
    // Once the sign-in closes (the setup or the app took the screen), the kept step goes.
    if(typeof MutationObserver==='function'&&node('authOverlay'))new MutationObserver(()=>{if(keeping&&node('authOverlay').classList.contains('hidden'))letGo();}).observe(node('authOverlay'),{attributes:true,attributeFilter:['class']});
    controller.tour=tour;controller.setup=setup;
    return controller;
  }
  return Object.freeze({route,validName,validDate,normalizeCode,validCode,inviteCodeIn,inviteLink,takeInvite,togetherDate,togetherYears,romeToday,errorMessage,createController,mount,
    FIRST_RUN_KEYS,tourWanted,birthdayCheck,nextBirthday,birthdayEvent,rememberBirthday,saveBirthday,setupMode,setupSteps,pushStepState,placeStepWanted,daysTogether,inviteExpiry,
    inviteMessage,shareInvite,widgetOfferWanted,CHECK_MS,authSwap,authArrive,shake});
});
