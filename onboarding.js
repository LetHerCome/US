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
  // On screen the code reads in groups of four (14/11/2026): the server's code
  // already carries dashes, and a space every five made «M3WJ- NXY3-».
  const codeGroups=value=>(normalizeCode(value).match(/.{1,4}/g)||[]).join(' ');
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
    if(error?.code==='22023')return 'Controlla il nome (1–40 caratteri) e la data.';
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


  // ---------- L'entrata (Il diario, ma pulito, 15/11/2026) ----------
  // Mockup v4.1 «L'entrata», docs/missions/diario-pulito.md: the welcome, the
  // account, «Da dove partite?», «Tu» (name, character, colour, birthday),
  // «Da quando state insieme?» for whoever creates, the code for the other
  // person («Il suo posto è pronto», with the notifications and today's
  // question once it is sent) and the arrival «Ora siete in due». Pure
  // helpers first (tested in Node), then the DOM wiring used by mount().
  const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  const MONTH_DAYS=[31,29,31,30,31,30,31,31,30,31,30,31];
  const FIRST_RUN_KEYS=Object.freeze({
    tourSeen:'us:tour:v1:seen',
    deviceProfile:'us:fix4:last-profile',
    passwordSignIn:'us:setup:v1:password-sign-in',
    birthdayPending:id=>`us:onboarding:v1:birthday:${id}`,
    birthdaySaved:id=>`us:onboarding:v1:birthday-saved:${id}`,
    setupPending:id=>`us:setup:v1:pending:${id}`,
    setupDone:id=>`us:setup:v1:done:${id}`,
    // The shape picked in «Tu» while set_my_character_shape is not on the
    // server yet (migration 20261115183900, staging only).
    characterShape:id=>`us:character-shape:${id}`
  });
  const storeGet=(store,key)=>{try{return store?.getItem?.(key)??null;}catch(_e){return null;}};
  const storeSet=(store,key,value)=>{try{store.setItem(key,value);return true;}catch(_e){return false;}};
  const storeRemove=(store,key)=>{try{store?.removeItem?.(key);}catch(_e){}};
  // The invite page (invito.html) opens the web app on /#invito=CODE: the code
  // leaves the address bar and waits in this tab until the join step uses it.
  const PENDING_INVITE='us:onboarding:v1:pending-invite';
  // App Links (29/10/2026): the shared link opens the Android app with its URL
  // (https://<US site>/invito#CODE). Only the US sites' invite page counts:
  // www.uscouple.app (30/10/2026), and the old address for links already shared.
  const INVITE_HOSTS=['www.uscouple.app','uscouple.app','us-a33.pages.dev','us-staging-s31.pages.dev'];
  function inviteFromLink(value){
    try{
      const url=new URL(String((typeof value==='object'?value?.url:value)||''));
      if(url.protocol!=='https:'||!INVITE_HOSTS.includes(url.hostname)||!/^\/invito(\.html)?$/.test(url.pathname))return '';
      return inviteCodeIn(decodeURIComponent(url.hash.slice(1)));
    }catch(_e){return '';}
  }
  function takeInvite({location,history,session,url,used=false}={}){
    if(used){storeRemove(session,PENDING_INVITE);return '';}
    const linked=url?inviteFromLink(url):'';
    if(linked)storeSet(session,PENDING_INVITE,linked);
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

  // The welcome is for a phone where nobody has signed in yet.
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
  // The arrival after pairing: once per user on this phone, only after the
  // onboarding here. A password sign-in on a new phone (mode "device") has
  // nothing left to ask: notifications are asked on the invite or on Oggi,
  // the position the first time the distance is opened.
  function setupMode({userId,local,session}){
    if(!userId||storeGet(local,FIRST_RUN_KEYS.setupDone(userId)))return null;
    const pending=storeGet(local,FIRST_RUN_KEYS.setupPending(userId));
    if(pending==='created'||pending==='joined')return pending;
    if(storeGet(session,FIRST_RUN_KEYS.passwordSignIn)===userId)return 'device';
    return null;
  }
  function setupSteps({mode}={}){
    return mode==='created'||mode==='joined'?['arrivo']:[];
  }
  function daysTogether(startedOn,now=new Date()){
    const [y,m,d]=String(startedOn||'').split('-').map(Number);
    if(!y||!m||!d)return null;
    const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
    return Math.max(0,Math.floor((today-Date.UTC(y,m-1,d))/86400000));
  }
  function inviteExpiry(iso){
    const date=new Date(iso);if(!Number.isFinite(+date))return '';
    try{
      const parts=new Intl.DateTimeFormat((globalThis.UsI18n?.tag||'it-IT'),{timeZone:'Europe/Rome',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
      const part=type=>parts.find(p=>p.type===type)?.value||'';
      return `scade il ${part('day')} ${part('month')} alle ${part('hour')}:${part('minute')}`;
    }catch(_e){return '';}
  }
  // The invite page (invito.html) on this site; from the Android app and from
  // any address of production, on www.uscouple.app. The code rides in the
  // fragment: it never reaches a server log.
  const INVITE_SITE='https://www.uscouple.app';
  const PRODUCTION_SITES=['https://www.uscouple.app','https://uscouple.app','https://us-a33.pages.dev'];
  function inviteLink(code,origin=globalThis.location?.origin){
    const own=/^https:\/\/(?!localhost\b)[a-z0-9.-]+$/i.test(String(origin||''))&&!PRODUCTION_SITES.includes(origin);
    const site=own?origin:INVITE_SITE;
    return `${site}/invito#${encodeURIComponent(String(code||''))}`;
  }
  // What "Condividi" sends: in the sender's language, the link on its own line,
  // never translated. No expiry: the one who invites says it, if needed.
  // Answered today's question while waiting (09/11/2026): one more line, and
  // the partner answers to see it (the reveal of Oggi).
  function inviteMessage(code,t,origin,{answered=false}={}){
    const say=typeof t==='function'?t:(text=>text);
    const hook=answered?[say('Ho già risposto alla domanda di oggi: rispondi anche tu per vedere la mia.')]:[];
    return [say('Ti aspetto su US ♡'),...hook,say('Apri il mio invito:'),inviteLink(code,origin)].join('\n');
  }
  // Waiting for the partner (09/11/2026): who waits can already answer
  // today's question, with the same RPC and the same answer row as Oggi
  // (the server only asks for a couple, and the waiting one has it). It never
  // holds the invite up: if anything fails, the card simply does not appear.
  // The draft stays in memory only, like everything typed in the onboarding.
  function waitingToday(daily,{now=()=>new Date()}={}){
    const FAILED='Non riesco a salvare la risposta. Riprova.';
    let key='',flight=null,state={status:'off',question:null,answer:'',error:''};
    const api={draft:'',get state(){return state;},answered:()=>state.status==='answered'};
    api.load=profile=>{
      if(!daily||!profile?.id||!profile?.couple_id){key='';state={status:'off',question:null,answer:'',error:''};return Promise.resolve(state);}
      const next=`${profile.id}|${profile.couple_id}|${romeToday(now())}`;
      if(next===key)return flight||Promise.resolve(state);
      key=next;api.draft='';state={status:'loading',question:null,answer:'',error:''};
      const mine=flight=(async()=>{
        let result={status:'off',question:null,answer:'',error:''};
        try{
          const asked=await daily.question();
          const q=asked?.data;
          if(!asked?.error&&q?.id&&typeof q.question==='string'&&q.question.trim()){
            const read=await daily.readAnswer(q.id,profile.id);
            if(!read?.error){
              const answer=String(read?.data?.answer||'');
              result={status:answer?'answered':'open',question:{id:q.id,text:q.question.trim()},answer,error:''};
            }
          }
        }catch(_e){}
        if(flight===mine&&key===next){state=result;flight=null;}
        return state;
      })();
      return mine;
    };
    api.save=async(profile,text)=>{
      if(!['open'].includes(state.status)||!state.question||!profile?.id)return state;
      const answer=String(text||'').trim().slice(0,1000);
      if(!answer){state={...state,error:'Scrivi qualcosa prima'};return state;}
      const asked=state.question.id,owner=key;
      state={...state,status:'saving',error:''};
      let ok=false;
      try{const result=await daily.saveAnswer({question_id:asked,user_id:profile.id,couple_id:profile.couple_id,answer});ok=!result?.error;}catch(_e){ok=false;}
      if(key!==owner)return state;
      state=ok?{...state,status:'answered',answer,error:''}:{...state,status:'open',error:FAILED};
      if(ok)api.draft='';
      return state;
    };
    return api;
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
  // The characters (founder, 15/11/2026): five shapes; without a choice the
  // ball for whoever creates, the square for whoever joins. Two people may
  // share a shape, never a colour.
  const SHAPES=Object.freeze(['palla','quadrato','triangolo','goccia','nuvola']);
  const SHAPE_NAMES=Object.freeze({palla:'Tondo',quadrato:'Quadrato',triangolo:'Triangolo',goccia:'Goccia',nuvola:'Nuvola'});
  const defaultShape=role=>role==='beatrice'?'quadrato':'palla';
  const defaultColour=role=>role==='beatrice'?'lilla':'rosa';
  // The colour that is saved after create or join: the one picked, unless it
  // is the other person's (then the first free one). `colors` is UsPersonColors.
  function lookColour(picked,profiles,meId,colors){
    if(!colors?.choices)return picked||null;
    const list=colors.choices(profiles,meId),theirs=list.find(c=>c.taken)?.id||null;
    if(picked&&colors.PALETTE?.[picked]&&picked!==theirs)return picked;
    return list.find(c=>!c.taken)?.id||null;
  }

  // ---------- DOM helpers ----------
  function reducedMotion(){
    if(document.documentElement.dataset.usMotion==='reduced')return true;
    try{if(window.UsUiFoundation?.isReducedMotion?.())return true;}catch(_e){}
    return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function setTitle(el,plain,accent){
    el.textContent=plain;
    if(accent){const em=document.createElement('em');em.textContent=accent;el.append(em);}
  }
  // A wrong answer: the status line shakes (−4, 4, 260 ms).
  function shake(el,px=4,ms=260){
    if(!el||reducedMotion()||typeof el.animate!=='function')return;
    try{el.animate([{translate:'0 0'},{translate:`-${px}px 0`},{translate:`${px}px 0`},{translate:'0 0'}],{duration:ms,composite:'add'});}catch(_e){}
  }
  // A one-time CSS move, on purpose (the hop when you pick a shape).
  function replay(el,cls){
    if(!el||reducedMotion())return;
    el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);
    el.addEventListener('animationend',()=>el.classList.remove(cls),{once:true});
  }
  const diary=()=>globalThis.UsDiario||null;
  const personColors=()=>globalThis.UsPersonColors||null;
  const hexOf=id=>personColors()?.PALETTE?.[id]||'';
  const colourWord=id=>{const name=personColors()?.NAMES?.[id];return name?`il ${name.toLowerCase()}`:'';};
  const shapeName=key=>diary()?.SHAPE_NAMES?.[key]||SHAPE_NAMES[key]||key;
  // A character as a sticker, or the dashed place of who has not arrived yet.
  function sticker(look,{size,dx=0,mood='',cls='',label=''}={}){
    const d=diary();if(!d)return '';
    return `<span class="dy-stk${cls?` ${cls}`:''}">${d.character({shape:look.shape,color:look.color},{size,dx,mood,label})}</span>`;
  }
  function place(shape,size,q=true){const d=diary();return d?`<span class="dy-ent-slot">${d.slot(shape,size,q)}</span>`:'';}
  // diario.js loads after this file: anything drawn before it waits for it.
  function whenDiary(fn){
    let tries=0;
    const tick=()=>{if(diary())fn();else if(tries++<60)setTimeout(tick,50);};
    tick();
  }
  // The reads and writes of the look (colour, character) come from app.js through mount().
  let colourIO=null;
  // Shape and colour picked in «Tu», saved once the couple exists: the colour
  // with set_my_color, the shape with set_my_character_shape (on this phone
  // only while that function is not on the server yet).
  async function saveLook(profile,look){
    if(!profile?.id||!profile.couple_id||!look||!colourIO)return null;
    const colors=personColors();
    let profiles=[{id:profile.id,role:profile.role,person_color:null}];
    try{const {data}=await colourIO.readCouple(profile.couple_id);if(Array.isArray(data)&&data.length)profiles=data;}catch(_e){}
    const colour=lookColour(look.colour,profiles,profile.id,colors);
    let saved=null;
    if(colour){
      try{
        const {error}=await colourIO.rpc('set_my_color',{p_color:colour});
        if(!error){saved=colour;const me=profiles.find(p=>p.id===profile.id);if(me)me.person_color=colour;colors?.applyCoupleColors?.(profiles);}
      }catch(_e){}
    }
    if(SHAPES.includes(look.shape)){
      let ok=false;
      try{const result=await colourIO.rpc('set_my_character_shape',{p_shape:look.shape});ok=!result?.error;}catch(_e){}
      if(!ok)storeSet(localStorage,FIRST_RUN_KEYS.characterShape(profile.id),look.shape);
    }
    return saved;
  }
  // Mine on this phone: what was picked in this tab, or kept, or the default.
  function storedShape(userId,role){
    const kept=storeGet(localStorage,FIRST_RUN_KEYS.characterShape(userId));
    return SHAPES.includes(kept)?kept:defaultShape(role);
  }
  // Today's answer while waiting, for the arrival's card (this tab only).
  let answeredWhileWaiting='';

  // ---------- DOM: the welcome (before the account; no network) ----------
  function mountTour({openStep}){
    const root=document.getElementById('usTour'),overlay=document.getElementById('authOverlay');
    const next=document.getElementById('usTourNext');
    if(!root||!overlay||!next)return Object.freeze({maybeOpen:()=>false,show(){},close(){},markSeen(){},get open(){return false;}});
    let isOpen=false;
    const markSeen=()=>storeSet(localStorage,FIRST_RUN_KEYS.tourSeen,'1');
    // The two of you, not members yet: the ball in rosa, the square in lilla, winking.
    const paintArt=()=>{
      const duo=document.getElementById('usTourDuo');if(!duo||duo.childElementCount)return;
      duo.innerHTML=sticker({shape:'palla',color:'var(--us-rosa)'},{size:128,dx:3,cls:'dy-ent-tilt-l'})+sticker({shape:'quadrato',color:'var(--us-lilla)'},{size:136,dx:-3,mood:'occhiolino',cls:'dy-ent-tilt-r'});
    };
    function close(){
      if(!isOpen)return;
      isOpen=false;markSeen();
      root.hidden=true;overlay.classList.remove('us-tour-active');
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
    }
    function focusHeading(id){
      const heading=document.querySelector(`#${id} h2`);if(!heading)return;
      if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    }
    function leave(target){
      close();
      if(target==='signup'&&window.usS31Auth?.go){window.usS31Auth.go('signup');focusHeading('usSignup');return;}
      openStep?.('authLogin');focusHeading('authLogin');
    }
    next.addEventListener('click',()=>leave('signup'));
    document.getElementById('usTourLogin')?.addEventListener('click',()=>leave('login'));
    function show(){
      if(isOpen)return true;
      isOpen=true;
      overlay.classList.add('us-tour-active');root.hidden=false;overlay.scrollTop=0;
      whenDiary(paintArt);
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
      return true;
    }
    function maybeOpen({returningDevice=false}={}){
      if(isOpen)return true;
      if(returningDevice||!tourWanted(localStorage))return false;
      return show();
    }
    // «Indietro» on the account goes back to the welcome.
    document.getElementById('usSignupHome')?.addEventListener('click',()=>{show();document.getElementById('usTourTitle')?.focus({preventScroll:true});});
    return Object.freeze({maybeOpen,show,close,markSeen,get open(){return isOpen;}});
  }

  // ---------- DOM: the arrival after pairing («Ora siete in due») ----------
  function mountSetup(){
    const overlay=document.getElementById('usDeviceSetup');
    const $=id=>document.getElementById(id);
    if(!overlay)return Object.freeze({maybeOpen:async()=>false,close(){},markPasswordSignIn(){},get open(){return false;}});
    const primary=$('usSetupPrimary');
    let isOpen=false,userId='',mode=null,profile=null,run=0,isolated=[],couple=null;
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
    // The two characters, in the order of every screen: who created, then who joined.
    // Who arrives now drops into the place; who was waiting hops (the mockup's .drop and .hop).
    function looks(){
      const colors=personColors(),role=profile?.role,other=role==='beatrice'?'francesco':'beatrice';
      const list=couple||[{id:profile?.id,role,person_color:null}];
      const effective=p=>colors?.idOf?.(p?.person_color)||defaultColour(p?.role);
      const meRow=list.find(p=>p.id===profile?.id)||{role},partnerRow=list.find(p=>p.id!==profile?.id)||{role:other};
      const mine={shape:storedShape(userId,role),colour:effective(meRow)};
      const theirs={shape:diary()?.shapeOf?.(other)||defaultShape(other),colour:effective(partnerRow)};
      return {mine,theirs,role};
    }
    function paint(play){
      const {mine,theirs,role}=looks(),partner=partnerName();
      const meFirst=role!=='beatrice';
      const draw=(look,arriving,first)=>sticker({shape:look.shape,color:hexOf(look.colour)||`var(--us-${look.colour})`},{size:arriving?120:112,dx:first?3:-3,mood:arriving?'occhiolino':'',cls:play?(arriving?'dy-ent-drop':'dy-ent-hop-late'):''});
      // created: the partner arrives; joined: I arrive.
      const meArrive=mode==='joined';
      const a=meFirst?draw(mine,meArrive,true):draw(theirs,!meArrive,true);
      const b=meFirst?draw(theirs,!meArrive,false):draw(mine,meArrive,false);
      $('usSetupPair').innerHTML=a+b;
      const theirWord=couple?colourWord(theirs.colour):'',myWord=couple?colourWord(mine.colour):'';
      $('usSetupCopy').textContent=mode==='joined'
        ?`${partner} ti aspettava.${theirWord?` Il suo colore è ${theirWord}${myWord?`, il tuo ${myWord}`:''}.`:''}`
        :`${partner} è qui, adesso.${theirWord?` Il suo colore è ${theirWord}.`:''}`;
      const answered=mode==='created'&&answeredWhileWaiting===userId;
      $('usSetupToday').hidden=!answered;
      $('usSetupTodayText').textContent=answered?`Hai già risposto. La risposta di ${partner} si apre appena risponde anche ${partner}.`:'';
    }
    async function finish(){
      if(!isOpen)return;
      const id=userId;
      storeSet(localStorage,FIRST_RUN_KEYS.setupDone(id),'1');
      storeRemove(localStorage,FIRST_RUN_KEYS.setupPending(id));
      if(storeGet(sessionStorage,FIRST_RUN_KEYS.passwordSignIn)===id)storeRemove(sessionStorage,FIRST_RUN_KEYS.passwordSignIn);
      close();
    }
    function close(){
      run++;
      const hadFocus=overlay.contains(document.activeElement);
      isOpen=false;userId='';mode=null;profile=null;couple=null;
      overlay.hidden=true;delete overlay.dataset.step;delete overlay.dataset.mode;
      $('usSetupPair').innerHTML='';
      isolate(false);
      if(hadFocus)document.activeElement?.blur?.();
    }
    primary.addEventListener('click',()=>{if(isOpen)finish();});
    window.addEventListener('us-identity-change',()=>{if(isOpen)paint(false);});
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
      if(!setupSteps({mode:nextMode}).length){
        // Nothing to show on this phone: done, quietly.
        storeSet(localStorage,FIRST_RUN_KEYS.setupDone(id),'1');
        storeRemove(localStorage,FIRST_RUN_KEYS.setupPending(id));
        if(storeGet(sessionStorage,FIRST_RUN_KEYS.passwordSignIn)===id)storeRemove(sessionStorage,FIRST_RUN_KEYS.passwordSignIn);
        return false;
      }
      const ticket=++run;
      isOpen=true;userId=id;mode=nextMode;profile=nextProfile;couple=null;
      overlay.dataset.mode=nextMode;overlay.dataset.step='arrivo';overlay.hidden=false;overlay.scrollTop=0;
      isolate(true);
      whenDiary(()=>{if(ticket===run&&isOpen)paint(true);});
      // The heading takes the focus; while the shell reveals itself the overlay
      // can be a frame or two from visible, so it tries again.
      const title=$('usSetupTitle');
      const focusTitle=()=>{if(ticket===run&&isOpen&&!overlay.contains(document.activeElement))title.focus({preventScroll:true});};
      let frames=0;
      const untilShown=()=>{focusTitle();if(ticket===run&&isOpen&&document.activeElement!==title&&frames++<60)requestAnimationFrame(untilShown);};
      untilShown();
      // The colours of both of you, then the words say them (the characters already have them).
      if(colourIO&&nextProfile?.couple_id){
        try{const {data}=await colourIO.readCouple(nextProfile.couple_id);if(ticket===run&&isOpen&&Array.isArray(data)&&data.length){couple=data;paint(false);focusTitle();}}catch(_e){}
      }
      return true;
    }
    function markPasswordSignIn(id){if(id)storeSet(sessionStorage,FIRST_RUN_KEYS.passwordSignIn,String(id));}
    return Object.freeze({maybeOpen,close,markPasswordSignIn,get open(){return isOpen;}});
  }

  // ---------- DOM: from «Da dove partite?» to the code ----------
  function mount({readProfile,readCouple,rpc,resume,signOut,openStep,insertEvent,daily,waitingPush}){
    colourIO=typeof readCouple==='function'&&typeof rpc==='function'?{readCouple,rpc}:null;
    const waitingDay=waitingToday(daily);
    const root=document.getElementById('usOnboarding');
    const node=id=>document.getElementById(id);
    const fresh=()=>({name:'',birthday:null,shape:'',colour:'',code:'',path:''});
    let mode='choice',lastKind='',lastView='',lastInvite='',hiddenPrivate=[],me=fresh(),meFor='',justCreated=false,note={text:'',kind:''},dismissed='';
    // The button you pressed says what is happening while it works.
    let pressed=null,releaseKept=null;
    // Paired from a step on screen: that step stays, still, until the arrival or the app takes its place.
    let keeping=false;
    function letGo(){
      if(!keeping)return;
      keeping=false;
      releaseKept?.();
      delete root.dataset.usBusy;
      node('mc3CodeShown').textContent='';node('mc3CodeSmall').textContent='';
      if(!['SIGNED_OUT','PAIRED'].includes(controller.state.kind))return;
      root.classList.remove('active');root.dataset.view='';
    }
    const clearForms=()=>root.querySelectorAll('input,textarea,select').forEach(el=>{el.value='';});
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
    // Accedi con Apple (05/11/2026): Apple gives the name only at the first sign-in
    // (app.js keeps it for this session); the field starts from it, still editable.
    function appleName(uid){
      try{const saved=JSON.parse(sessionStorage.getItem('us:apple-name:v1')||'null');return saved&&uid&&saved.uid===uid&&validName(saved.name)?saved.name.trim():'';}
      catch(_){return '';}
    }
    // ---- «Tu»: the big character takes your shape and your colour at once.
    const pickRole=()=>me.path==='join'?'beatrice':'francesco';
    function ensureLook(){
      if(!SHAPES.includes(me.shape))me.shape=defaultShape(pickRole());
      if(!personColors()?.PALETTE?.[me.colour])me.colour=defaultColour(pickRole());
    }
    function paintPick(){root.style.setProperty('--dy-pick',hexOf(me.colour)||'var(--us-rosa)');}
    function paintBig(hop=false){
      const big=node('mc3Big'),d=diary();
      big.innerHTML=d?d.character({shape:me.shape,color:'var(--dy-pick)'},{size:104,label:'Il tuo personaggio'}):'';
      if(hop)replay(big,'dy-hop');
    }
    function paintTu(){
      ensureLook();paintPick();
      const d=diary(),colors=personColors();
      node('mc3Shapes').innerHTML=SHAPES.map(k=>`<button type="button" class="dy-ent-shape" data-shape="${k}" aria-pressed="${me.shape===k}"><span class="dy-ent-shape-art" aria-hidden="true">${d?d.character({shape:k,color:'var(--dy-pick)'},{size:34}):''}</span>${shapeName(k)}</button>`).join('');
      node('mc3Colors').innerHTML=Object.entries(colors?.PALETTE||{}).map(([id,hex])=>`<button type="button" class="dy-ent-swatch" data-colour="${id}" aria-pressed="${me.colour===id}" aria-label="${colors.NAMES[id]}"><i style="background:${hex}"></i></button>`).join('');
      paintBig(false);
      node('mc3BigName').textContent=node('mc3Name').value||me.name||'';
    }
    function fillMe(){
      node('mc3Name').value=me.name||appleName(meFor);
      daySelect.value=me.birthday?String(me.birthday.day):'';
      monthSelect.value=me.birthday?String(me.birthday.month):'';
      whenDiary(paintTu);
    }
    node('mc3Shapes').addEventListener('click',event=>{
      const button=event.target.closest?.('[data-shape]');if(!button||button.disabled)return;
      me.shape=button.dataset.shape;
      node('mc3Shapes').querySelectorAll('[data-shape]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      paintBig(true);
    });
    node('mc3Colors').addEventListener('click',event=>{
      const button=event.target.closest?.('[data-colour]');if(!button||button.disabled)return;
      me.colour=button.dataset.colour;
      node('mc3Colors').querySelectorAll('[data-colour]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      paintPick();
    });
    node('mc3Name').addEventListener('input',event=>{node('mc3BigName').textContent=event.target.value;});
    // ---- «Da quando state insieme?»: the first label counts your days as you pick.
    function paintDays(){
      const date=togetherDate(dateDay.value,dateMonth.value,dateYear.value),days=validDate(date)?daysTogether(date):null;
      node('mc3DaysTag').textContent=days===null?'i vostri giorni insieme':`${days.toLocaleString(globalThis.UsI18n?.tag||'it-IT')} ${days===1?'giorno':'giorni'} insieme`;
    }
    for(const select of [dateDay,dateMonth,dateYear])select.addEventListener('change',paintDays);
    // ---- The code and the people on the invite.
    const myLook=state=>{
      const id=state.profile?.id||'',role=state.profile?.role;
      if(id&&id===meFor&&SHAPES.includes(me.shape))return {shape:me.shape,colour:me.colour||defaultColour(role)};
      return {shape:storedShape(id,role),colour:waitingColour.userId===id&&waitingColour.colour||defaultColour(role)};
    };
    // After a reload my colour is on the server only: read once per account.
    let waitingColour={userId:'',colour:''};
    function readWaitingColour(profile){
      if(!colourIO||!profile?.couple_id||waitingColour.userId===profile.id)return;
      waitingColour={userId:profile.id,colour:''};
      colourIO.readCouple(profile.couple_id).then(({data})=>{
        const row=Array.isArray(data)?data.find(p=>p.id===profile.id):null;
        const id=personColors()?.idOf?.(row?.person_color);
        if(id&&waitingColour.userId===profile.id){waitingColour.colour=id;if(lastView==='waiting')paintPair(controller.state);}
      }).catch(()=>{});
    }
    function paintPair(state){
      const look=myLook(state),role=state.profile?.role,other=role==='beatrice'?'francesco':'beatrice';
      const mine=sticker({shape:look.shape,color:hexOf(look.colour)||`var(--us-${look.colour})`},{size:84,dx:3});
      const slot=place(defaultShape(other),88);
      node('mc3Pair').innerHTML=role==='beatrice'?slot+mine:mine+slot;
    }
    function viewFor(state){
      if(state.kind==='AUTHENTICATED_NO_PROFILE')return ['choice','join','me','create'].includes(mode)?mode:'choice';
      if(state.kind==='MEMBER_WAITING_PARTNER')return 'waiting';
      return 'error';
    }
    // Back: Tu → the code (or «Da dove partite?»), the date → Tu, the code → «Da dove partite?».
    const backOf=view=>view==='me'?(me.path==='join'?'join':'choice'):view==='create'?'me':view==='join'?'choice':'';
    function kickerFor(view){
      if(me.path==='join')return view==='join'?'1 di 2':view==='me'?'2 di 2':'';
      return view==='me'?'1 di 3':view==='create'?'2 di 3':view==='waiting'?'3 di 3':'';
    }
    function render(state){
      // What was typed in "Tu" belongs to one account: never carry it across a switch.
      const uid=controller.userId;
      if(uid&&uid!==meFor){me=fresh();justCreated=false;meFor=uid;}
      const active=!['SIGNED_OUT','PAIRED'].includes(state.kind);
      const changed=state.kind!==lastKind;
      if(changed){
        note={text:'',kind:''};dismissed='';
        if(state.kind==='SIGNED_OUT'){me=fresh();justCreated=false;}
        if(state.kind==='AUTHENTICATED_NO_PROFILE')mode='choice';
      }
      // Paired from a step on screen (Tu for whoever joins, or the invite that
      // found its partner): the step stays until the arrival or the app takes
      // its place, never an empty screen while the app checks the couple.
      // Nothing on it can be used meanwhile.
      if(state.kind==='PAIRED'&&(keeping||(lastView&&root.classList.contains('active')&&isShown(root)))){
        if(!keeping){
          keeping=true;
          // The pressed button keeps saying what is happening until the step leaves.
          releaseKept=()=>{releaseKept=null;if(pressed){if(pressed.text)pressed.button.textContent=pressed.text;delete pressed.button.dataset.usBusy;pressed=null;}};
          root.dataset.usBusy='';
          root.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=true;});
          // Nothing typed or copyable stays behind.
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
      const inviteKey=waiting?`${state.membership?.invite?.status}|${state.code}`:'';
      // A new code is a new screen: what was said about the old one goes with it.
      if(active&&view===lastView&&view==='waiting'&&!state.busy&&inviteKey!==lastInvite)note={text:'',kind:''};
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
        if(state.kind!=='AUTHENTICATED_NO_PROFILE'){daySelect.value='';monthSelect.value='';}
      }
      root.dataset.view=active?view:'';
      const kicker=kickerFor(view);
      node('mc3Kicker').textContent=kicker;node('mc3Kicker').hidden=!kicker;
      const back=backOf(view);node('mc3Back').hidden=!back;
      const titles={choice:['Da dove ','partite?'],join:['Il vostro ','codice'],me:['Iniziamo ','da te'],create:['Da quando ','state insieme?'],waiting:['Il suo posto ','è pronto'],error:['Verifichiamo il tuo accesso','']};
      setTitle(node('mc3Title'),...titles[view]);
      const copy={
        choice:'Uno dei due apre il diario, l’altro entra con il codice.',
        join:'Scrivi o incolla il codice che ti ha mandato la tua persona.',
        me:'',create:'',
        waiting:state.code?'':'Crea il codice e mandalo alla tua persona: quando entra, il diario è di tutti e due.',
        error:'Il tuo accesso resta valido: puoi riprovare o uscire.'
      }[view];
      node('mc3Copy').textContent=copy;node('mc3Copy').hidden=!copy;
      node('mc3Choice').hidden=view!=='choice';node('mc3Me').hidden=view!=='me';node('mc3Create').hidden=view!=='create';node('mc3Join').hidden=view!=='join';
      node('mc3Waiting').hidden=view!=='waiting';node('mc3Retry').hidden=state.kind!==ERROR;
      // Esci only where nothing else leads back: «Da dove partite?», the invite and the error.
      node('mc3Exit').hidden=Boolean(back);
      const status=node('mc3Status');
      // An error stays with the screen it belongs to: moving to another step dismisses it.
      if(!state.message)dismissed='';
      const message=state.message&&state.message!==dismissed?state.message:'';
      const said=`${status.textContent}|${status.dataset.kind||''}`;
      // Busy: the pressed button carries the words, the status line stays as it was.
      status.textContent=message||note.text||(state.busy&&!pressed?'Verifica in corso…':'');
      if(message)status.dataset.kind='error';else if(note.text)status.dataset.kind=note.kind||'neutral';else status.removeAttribute('data-kind');
      if(status.dataset.kind==='error'&&status.textContent&&said!==`${status.textContent}|error`)shake(status);
      const labels={none:'Nessun codice attivo',pending:'Invito in attesa',expired:'Invito scaduto',revoked:'Invito revocato',used:'Invito utilizzato'};
      const invite=state.membership?.invite;
      node('mc3InviteStatus').textContent=waiting?(labels[invite.status]||'')+(invite.status==='pending'&&invite.expires_at&&inviteExpiry(invite.expires_at)?' · '+inviteExpiry(invite.expires_at):''):'';
      node('mc3InviteStatus').dataset.status=waiting?invite.status:'';
      node('mc3Code').value=waiting?state.code:'';
      // While a new code is made the old one stays on screen (not copyable: everything waits).
      const holdCode=waiting&&state.busy&&!state.code&&lastView==='waiting'&&!node('mc3CodeArea').hidden;
      const hasCode=Boolean(waiting&&state.code);
      if(!holdCode){
        node('mc3CodeArea').hidden=!hasCode;
        node('mc3CodeShown').textContent=hasCode?codeGroups(state.code):'';
        node('mc3CodeSmall').textContent=hasCode?codeGroups(state.code):'';
        node('mc3Waiting').classList.toggle('has-code',hasCode);
      }
      const sent=waiting&&inviteSent(state.profile);
      node('mc3CodeArea').toggleAttribute('data-sent',Boolean(sent));
      node('mc3Generate').hidden=!waiting||hasCode||holdCode;
      node('mc3Generate').textContent=invite?.status==='none'?'Crea il codice':'Genera un nuovo codice';
      node('mc3Revoke').hidden=!waiting||invite?.status!=='pending'||!hasCode;
      root.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=state.busy&&el.id!=='mc3Exit';});
      if(pressed&&state.busy&&active){if(pressed.label)pressed.button.textContent=pressed.label;pressed.button.dataset.usBusy='';root.dataset.usBusy='';}
      else{
        if(pressed){delete pressed.button.dataset.usBusy;if(pressed.text)pressed.button.textContent=pressed.text;pressed=null;}
        delete root.dataset.usBusy;
      }
      if(active&&(changed||view!==lastView)){
        if(view==='me')fillMe();
        if(view==='create')paintDays();
        if(view==='choice')whenDiary(paintChoice);
      }
      if(view==='waiting'){readWaitingColour(state.profile);whenDiary(()=>paintPair(controller.state));}
      if(active&&(changed||view!==lastView)){node('mc3Title').focus({preventScroll:true});node('authOverlay').scrollTop=0;}
      lastKind=state.kind;lastView=active?view:'';
      // The first code comes by itself, right after the diary is opened.
      if(view==='waiting'&&justCreated&&!state.busy&&!state.code&&invite?.status==='none'){
        justCreated=false;
        setTimeout(()=>{const now=controller.state;if(lastView==='waiting'&&!now.busy&&!now.code&&now.membership?.invite?.status==='none'){press(node('mc3Generate'),'Creo il codice…');run(()=>controller.generate());}},0);
      }
      // Today's question and the notifications under the code: painted after
      // the buttons above took their busy state, loaded once per account and day.
      waitingProfile=state.profile||null;
      paintToday(state.busy);paintNotify();
      if(lastView==='waiting'){
        waitingDay.load(state.profile).then(()=>paintToday(Boolean(controllerRef?.state?.busy)),()=>{});
        loadNotify(state.profile);
      }
      if(state.profile?.couple_id)saveBirthday({profile:state.profile,local:localStorage,session:sessionStorage,insertEvent}).catch(()=>{});
      scheduleCheck(state);
      window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
    }
    // «Da dove partite?»: you and the other person's place, the place and the other person.
    function paintChoice(){
      const art=kind=>root.querySelector(`[data-ent-art="${kind}"]`);
      const you={shape:'palla',color:'var(--us-rosa)'},them={shape:'quadrato',color:'var(--us-lilla)'};
      if(art('create')&&!art('create').childElementCount)art('create').innerHTML=sticker(you,{size:50})+place('quadrato',50,false);
      if(art('join')&&!art('join').childElementCount)art('join').innerHTML=place('palla',50,false)+sticker(them,{size:52});
    }
    const isShown=el=>Boolean(el&&el.isConnected&&el.getClientRects().length);
    // Waiting for the partner (09/11/2026): the card of today's question. The
    // controller does not exist yet during its first renders, hence the ref.
    let controllerRef=null,waitingProfile=null;
    // Shared or copied the code: remembered per account, so the question and
    // the notifications stay after closing and reopening US.
    const sentKey=profile=>profile?.id?`us:ob:invite-sent:${profile.id}`:'';
    const inviteSent=profile=>Boolean(sentKey(profile)&&storeGet(localStorage,sentKey(profile)));
    function markInviteSent(){const key=sentKey(waitingProfile);if(key)storeSet(localStorage,key,'1');if(controllerRef)render(controllerRef.state);}
    function paintToday(busy=false){
      const box=node('mc3Today');if(!box)return;
      // 14/11/2026 (founder): first the code, then the question. It shows once
      // the code was shared or copied (remembered for this account), or when
      // today's answer is already there.
      const day=waitingDay.state,ready=day.status==='answered'||inviteSent(waitingProfile);
      const show=lastView==='waiting'&&ready&&['open','saving','answered'].includes(day.status);
      box.hidden=!show;
      if(day.status==='answered'&&waitingProfile?.id)answeredWhileWaiting=waitingProfile.id;
      if(!show)return;
      node('mc3TodayQuestion').textContent=day.question.text;
      const field=node('mc3TodayAnswer'),button=node('mc3TodaySave'),status=node('mc3TodayStatus');
      if(day.status==='answered')field.value=day.answer;
      else if(!field.value&&waitingDay.draft)field.value=waitingDay.draft;
      field.readOnly=day.status==='answered';
      field.disabled=day.status==='saving';
      button.hidden=day.status==='answered';
      button.disabled=day.status==='saving'||Boolean(busy);
      button.textContent=day.status==='saving'?'Salvo…':'Rispondi';
      node('mc3TodayDone').hidden=day.status!=='answered';
      node('mc3TodayHint').hidden=day.status==='answered';
      status.textContent=day.error||'';status.hidden=!day.error;
      if(day.error)status.dataset.kind='error';else delete status.dataset.kind;
    }
    // «Ti avviso quando entra?» (founder, 15/11/2026): the notifications are
    // asked here now, with the same enable flow as Oggi (app.js waitingPush).
    let notify={userId:'',wanted:false,state:'idle',message:''};
    async function loadNotify(profile){
      if(!waitingPush||!profile?.id||notify.userId===profile.id)return;
      notify={userId:profile.id,wanted:false,state:'idle',message:''};
      let wanted=false;try{wanted=Boolean(await waitingPush.wanted(profile));}catch(_e){}
      if(notify.userId!==profile.id)return;
      notify.wanted=wanted;paintNotify();
    }
    function paintNotify(){
      const card=node('mc3Notify');if(!card)return;
      const show=lastView==='waiting'&&inviteSent(waitingProfile)&&notify.userId===waitingProfile?.id&&(notify.wanted||notify.state==='on');
      card.hidden=!show;if(!show)return;
      const on=notify.state==='on';
      card.classList.toggle('is-on',on);
      node('mc3NotifyTitle').textContent=on?'Ti avviso io':'Ti avviso quando entra?';
      node('mc3NotifyText').textContent=notify.message||(on?'Quando entra, ti arriva una notifica':'Così non devi controllare tu');
      const yes=node('mc3NotifyYes');yes.hidden=on;yes.disabled=notify.state==='asking'||Boolean(controllerRef?.state?.busy);
      yes.textContent=notify.state==='asking'?'Attivo…':notify.state==='error'?'Riprova':'Sì';
    }
    node('mc3NotifyYes').addEventListener('click',async()=>{
      const profile=waitingProfile;if(!waitingPush||!profile?.id||notify.state==='asking')return;
      notify.state='asking';notify.message='';paintNotify();
      let result={ok:false,kind:'error'};try{result=await waitingPush.enable(profile)||result;}catch(_e){}
      if(notify.userId!==profile.id)return;
      if(result.ok){notify.state='on';notify.message='';window.UsFeedback?.success?.();}
      else{
        notify.state=result.kind==='busy'?'idle':'error';
        // The words of the enable flow (the old Notifiche step, Oggi): a slow
        // network with the permission given finishes by itself later.
        notify.message=result.kind==='denied'?'Permesso negato: puoi consentirle dalle impostazioni del telefono'
          :result.kind==='unavailable'?'Notifiche non disponibili su questo telefono'
          :result.kind==='busy'?''
          :`${result?.kind==='network'&&result?.pending?'La rete non risponde: le attivo appena torna':result?.kind==='network'?'Rete lenta: riprova tra poco, oppure con il Wi-Fi':'Non riesco ad attivare le notifiche'}${result?.code?` · ${result.code}`:''}`;
        if(result.kind==='denied'||result.kind==='unavailable')notify.wanted=false,notify.state='idle';
      }
      paintNotify();
    });
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
    controllerRef=controller;
    const run=async(action,kind)=>{
      const look=kind?{shape:me.shape,colour:me.colour}:null;
      const result=await action();
      const joined=result?.profile?.couple_id&&(result.kind==='PAIRED'||result.kind==='MEMBER_WAITING_PARTNER');
      if(kind&&joined){
        storeSet(localStorage,FIRST_RUN_KEYS.setupPending(result.profile.id),kind==='create'?'created':'joined');
        // The character and the colour picked in «Tu», before the app shows them.
        await saveLook(result.profile,look);
      }
      if(kind==='create'&&result?.kind!=='MEMBER_WAITING_PARTNER')justCreated=false;
      // A code refused by the server: back to the code, with the reason.
      if(kind==='join'&&result?.kind==='AUTHENTICATED_NO_PROFILE'&&result.message){mode='join';render(controller.state);node('mc3JoinCode').value=me.code;node('mc3JoinCode').focus();}
      if(result?.kind==='PAIRED'){if(kind==='join')takeInvite({session:sessionStorage,used:true});resume();}
    };
    const switchTo=(next,focusId)=>{
      clearForms();mode=next;note={text:'',kind:''};
      if(controller.state.kind==='AUTHENTICATED_NO_PROFILE')dismissed=controller.state.message||'';
      if(next==='create')node('mc3CreateName').value=me.name;
      if(next==='join'){node('mc3JoinName').value=me.name;node('mc3JoinCode').value=me.code||takeInvite({location,history,session:sessionStorage});}
      render(controller.state);if(focusId)node(focusId)?.focus();
    };
    const goTo=switchTo;
    node('mc3Back').addEventListener('click',()=>{const back=backOf(lastView);if(back)goTo(back,'mc3Title');});
    node('mc3ChooseCreate').addEventListener('click',()=>{if(me.path!=='create'){me.path='create';me.shape='';me.colour='';}goTo('me','mc3Title');});
    node('mc3ChooseJoin').addEventListener('click',()=>{if(me.path!=='join'){me.path='join';me.shape='';me.colour='';}goTo('join','mc3JoinCode');});
    // The code box is a textarea (two lines): Enter still goes on.
    node('mc3JoinCode').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();node('mc3Join').requestSubmit?.();}});
    node('mc3Join').addEventListener('submit',event=>{
      event.preventDefault();
      const code=inviteCodeIn(node('mc3JoinCode').value);
      if(!code){note={text:'Controlla il codice d’invito: sono 26 caratteri.',kind:'error'};render(controller.state);node('mc3JoinCode').focus();return;}
      me.code=code;note={text:'',kind:''};
      goTo('me','mc3Title');
    });
    node('mc3Me').addEventListener('submit',event=>{
      event.preventDefault();
      const name=node('mc3Name').value,check=birthdayCheck(daySelect.value,monthSelect.value);
      if(!validName(name)){note={text:'Scrivi il tuo nome (1–40 caratteri).',kind:'error'};render(controller.state);node('mc3Name').focus();return;}
      if(!check.ok){note={text:check.message,kind:'error'};render(controller.state);(daySelect.value?monthSelect:daySelect).focus();return;}
      me.name=name.trim();me.birthday=check.value;note={text:'',kind:''};
      const id=controller.userId;rememberBirthday(sessionStorage,id,check.value);
      if(me.path!=='join'){goTo('create','mc3DateDay');return;}
      // Whoever joins enters here: the name from «Tu», the code from the step before.
      node('mc3JoinName').value=me.name;node('mc3JoinCode').value=me.code;
      press(event.submitter||node('mc3MeNext'),'Entro…','Entra nel diario');
      const fields={name:node('mc3JoinName').value,code:node('mc3JoinCode').value};node('mc3JoinCode').value='';
      run(()=>controller.join(fields),'join');
    });
    // App Links: an invite link opened the app (or the app was already open).
    // The code waits for «Ho un codice»; from «Da dove partite?» it goes straight there.
    const acceptInviteLink=value=>{
      const code=takeInvite({url:value,session:sessionStorage});
      if(!code||!inviteFromLink(value))return false;
      if(mode==='join'&&root.dataset.view==='join')node('mc3JoinCode').value=code;
      else if(mode==='choice'&&root.dataset.view==='choice'){me.path='join';me.shape='';me.colour='';goTo('join','mc3JoinCode');}
      return true;
    };
    window.UsPlatform?.listenForNativeAppUrl?.(acceptInviteLink);
    Promise.resolve(window.UsPlatform?.getNativeLaunchUrl?.()).then(acceptInviteLink).catch(()=>{});
    const press=(button,label,text='')=>{if(button&&!controller.state.busy)pressed={button,label,text};};
    node('mc3Create').addEventListener('submit',event=>{
      event.preventDefault();justCreated=true;
      node('mc3CreateName').value=me.name;
      press(event.submitter||node('mc3CreateNext'),'Apro il diario…','Apri il nostro diario');
      run(()=>controller.create({name:node('mc3CreateName').value,date:togetherDate(dateDay.value,dateMonth.value,dateYear.value),coupleName:node('mc3CoupleName').value}),'create');
    });
    node('mc3Generate').addEventListener('click',()=>{press(node('mc3Generate'),'Creo il codice…');run(()=>controller.generate());});
    node('mc3Revoke').addEventListener('click',()=>{press(node('mc3Revoke'),'');run(()=>controller.revoke());});
    node('mc3Refresh').addEventListener('click',()=>{press(node('mc3Refresh'),'Verifico…','Verifica accesso');run(()=>controller.refresh());});
    node('mc3Retry').addEventListener('click',()=>run(()=>controller.refresh()));
    // A line under the invite that stays through the automatic checks.
    const say=(text,kind)=>{note={text,kind};render(controller.state);};
    // No clipboard: the plain code shows in its field, selected, to copy by hand.
    const selectCode=()=>{node('mc3CodeArea').dataset.manual='';node('mc3Code').focus();node('mc3Code').select();say('Seleziona e copia il codice.','neutral');};
    const copyCode=async()=>{
      const code=controller.state.code,ticket=controller.epoch;if(!code)return;
      const still=()=>controller.epoch===ticket&&controller.state.code===code;
      try{await navigator.clipboard.writeText(code);if(still()){note={text:'Codice copiato. Condividilo soltanto con la tua persona.',kind:'success'};markInviteSent();}}
      catch(_error){if(still())selectCode();}
    };
    node('mc3CopyCode').addEventListener('click',copyCode);
    node('mc3CopyAgain').addEventListener('click',copyCode);
    node('mc3ShareCode').addEventListener('click',async()=>{
      const code=controller.state.code,ticket=controller.epoch;if(!code)return;
      const still=()=>controller.epoch===ticket&&controller.state.code===code;
      const how=await shareInvite(inviteMessage(code,window.UsI18n?.t,undefined,{answered:waitingDay.answered()}));
      if(!still())return;
      if(how==='shared')note={text:'Fatto. Appena la tua persona entra, lo vedi qui.',kind:'success'};
      else if(how==='copied')note={text:'Messaggio copiato: incollalo nella chat con la tua persona.',kind:'success'};
      if(how==='shared'||how==='copied')markInviteSent();
      else if(how==='failed')selectCode();
    });
    // Today's question while waiting: the draft lives in memory (the onboarding
    // empties its fields when the app goes to the background).
    node('mc3TodayAnswer')?.addEventListener('input',event=>{waitingDay.draft=event.target.value;});
    node('mc3TodaySave')?.addEventListener('click',async()=>{
      const state=controller.state;
      if(state.kind!=='MEMBER_WAITING_PARTNER'||state.busy)return;
      const saving=waitingDay.save(state.profile,node('mc3TodayAnswer').value);
      paintToday(state.busy);
      await saving;
      paintToday(controller.state.busy);
      if(waitingDay.answered())window.UsFeedback?.success?.();
      else if(waitingDay.state.error)window.UsFeedback?.error?.();
    });
    node('mc3Exit').addEventListener('click',async()=>{const id=controller.userId;controller.suspend();clearForms();rememberBirthday(sessionStorage,id,null);me=fresh();justCreated=false;await signOut();});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){controller.suspend();clearForms();}
      else if(controller.state.kind!=='SIGNED_OUT'&&controller.state.kind!=='PAIRED')resume();
    });
    window.addEventListener('us-app-lock-change',event=>{if(event.detail?.locked){controller.suspend();clearForms();}else resume();});
    window.addEventListener('pagehide',()=>{controller.suspend();clearForms();});
    // Once the sign-in closes (the arrival or the app took the screen), the kept step goes.
    if(typeof MutationObserver==='function'&&node('authOverlay'))new MutationObserver(()=>{if(keeping&&node('authOverlay').classList.contains('hidden'))letGo();}).observe(node('authOverlay'),{attributes:true,attributeFilter:['class']});
    controller.tour=tour;controller.setup=setup;
    return controller;
  }
  return Object.freeze({route,validName,validDate,normalizeCode,validCode,inviteCodeIn,inviteLink,inviteFromLink,takeInvite,togetherDate,togetherYears,romeToday,errorMessage,createController,mount,
    FIRST_RUN_KEYS,tourWanted,birthdayCheck,nextBirthday,birthdayEvent,rememberBirthday,saveBirthday,setupMode,setupSteps,daysTogether,inviteExpiry,
    inviteMessage,shareInvite,waitingToday,codeGroups,CHECK_MS,shake,SHAPES,lookColour});
});
