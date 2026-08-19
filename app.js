const pages=['home','today','moments','together','foryou','quiz'];
function go(id){
  pages.forEach(p=>document.getElementById(p).classList.toggle('active',p===id));
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  scrollTo({top:0,behavior:'smooth'});
  if(id==='moments' && window.usProfile) hydrateMoments();
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1700)}
function toggleDone(el){
  el.classList.toggle('done');el.querySelector('.check').textContent=el.classList.contains('done')?'✓':'';
  toast(el.classList.contains('done')?'+15 Bond XP':'Riaperta');
}
function addWish(){
  const t=prompt('Cosa volete fare insieme?'); if(!t)return;
  const d=document.createElement('div');d.className='item';d.onclick=function(){toggleDone(this)};
  d.innerHTML='<div class="check"></div><div class="txt">'+t+'<div class="tiny">bucket list</div></div>';
  document.getElementById('bucket').appendChild(d);toast('Aggiunta ♡');
}
function openMsg(title,text){
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalText').textContent=text;
  document.getElementById('modal').classList.add('show');
}
function closeModal(e){if(e.target.id==='modal')e.currentTarget.classList.remove('show')}
let quizCat='',quizPos=0,quizSelected=null,quizQuestions=[],quizSet=null,quizState=null;
function openQuizHub(){go('quiz');resetQuiz()}
async function startQuiz(cat){
  if(!window.usProfile){toast('Sync non pronta');return;}
  quizCat=cat;quizPos=0;quizSelected=null;quizQuestions=[];quizSet=null;quizState=null;
  document.getElementById('quizHub').classList.add('hidden');
  document.getElementById('quizResult').classList.add('hidden');
  document.getElementById('quizPlay').classList.remove('hidden');
  document.getElementById('quizQuestion').textContent='Carico il set…';
  document.getElementById('quizAnswers').innerHTML='';
  try{
    const {data:set,error:setError}=await sb.from('quiz_sets').select('id,slug,title,category').eq('slug',cat).single();
    if(setError) throw setError;
    const {data:questions,error:qError}=await sb.from('quiz_questions').select('id,position,question,options').eq('set_id',set.id).order('position',{ascending:true});
    if(qError) throw qError;
    if(!questions || !questions.length) throw new Error('Set vuoto');
    quizSet=set;quizQuestions=questions;
    const {data:state,error:stateError}=await sb.rpc('get_quiz_state',{target_set_id:set.id});
    if(stateError) throw stateError;
    quizState=state;
    if(state?.my_complete){
      showQuizState(state,false);
      return;
    }
    const mine=state?.my_answers||{};
    const first=quizQuestions.findIndex(q=>mine[String(q.id)]===undefined);
    quizPos=first>=0?first:0;
    renderQuiz();
  }catch(e){
    console.warn(e);
    resetQuiz();
    toast('Errore caricamento quiz');
  }
}
function renderQuiz(){
  const item=quizQuestions[quizPos];if(!item)return;
  quizSelected=null;
  document.getElementById('quizCategory').textContent=(quizSet?.title||quizCat).toUpperCase();
  document.getElementById('quizIndex').textContent=quizPos+1;
  document.getElementById('quizProgress').style.width=(((quizPos+1)/quizQuestions.length)*100)+'%';
  document.getElementById('quizQuestion').textContent=item.question;
  document.getElementById('quizWho').textContent='Rispondi per te. Il confronto resta nascosto fino alla fine.';
  const box=document.getElementById('quizAnswers');box.innerHTML='';
  (item.options||[]).forEach((ans,i)=>{
    const b=document.createElement('button');b.className='answer-btn';b.textContent=ans;
    b.onclick=()=>{document.querySelectorAll('#quizAnswers .answer-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');quizSelected=i;document.getElementById('quizNext').disabled=false};
    box.appendChild(b);
  });
  document.getElementById('quizNext').disabled=true;
  document.getElementById('quizNext').textContent=quizPos===quizQuestions.length-1?'Completa':'Conferma';
}
async function nextQuiz(){
  if(quizSelected===null || !quizSet)return;
  const btn=document.getElementById('quizNext');btn.disabled=true;btn.textContent='Salvo…';
  const item=quizQuestions[quizPos];
  const {error}=await sb.rpc('save_quiz_answer',{target_question_id:item.id,target_answer_index:quizSelected});
  if(error){console.warn(error);toast('Errore sync quiz');renderQuiz();return;}
  const {data:state,error:stateError}=await sb.rpc('get_quiz_state',{target_set_id:quizSet.id});
  if(stateError){console.warn(stateError);toast('Errore stato quiz');renderQuiz();return;}
  quizState=state;
  updateHomeStatus();
  if(state.my_complete){showQuizState(state,true);return;}
  const mine=state.my_answers||{};
  const next=quizQuestions.findIndex((q,i)=>i>quizPos && mine[String(q.id)]===undefined);
  const any=quizQuestions.findIndex(q=>mine[String(q.id)]===undefined);
  quizPos=next>=0?next:any;
  renderQuiz();
}
function showQuizState(state,notify=false){
  document.getElementById('quizPlay').classList.add('hidden');
  document.getElementById('quizResult').classList.remove('hidden');
  if(state.both_complete){
    const score=Number(state.score||0),total=Number(state.total||10);
    document.getElementById('scoreValue').textContent=score+'/'+total;
    document.getElementById('scoreRing').style.setProperty('--score',Math.round(score/total*100));
    document.getElementById('scoreText').textContent=score>=9?'Siete praticamente sincronizzati 😏':score>=7?'Molto allineati ❤️':score>=5?'Niente male, ma avete ancora cose da scoprire 👀':'Due teste, parecchie sorprese 😂';
    document.getElementById('scoreSub').textContent='Avete completato entrambi il set. Questo confronto usa solo le risposte completate da entrambi.';
    if(notify) toast('Confronto sbloccato ♡');
  }else{
    document.getElementById('scoreValue').textContent='✓';
    document.getElementById('scoreRing').style.setProperty('--score',100);
    document.getElementById('scoreText').textContent='Hai completato il set ♡';
    const partner=window.usProfile?.role==='francesco'?'Bea':'Francesco';
    document.getElementById('scoreSub').textContent='Ora aspettiamo '+partner+'. Il risultato resta nascosto finché non completa anche '+partner+'.';
  }
}
async function refreshQuizState(){
  if(!quizSet || !window.usProfile)return;
  const resultVisible=!document.getElementById('quizResult').classList.contains('hidden');
  if(!resultVisible)return;
  const wasBoth=Boolean(quizState?.both_complete);
  const {data:state}=await sb.rpc('get_quiz_state',{target_set_id:quizSet.id});
  if(state){quizState=state;showQuizState(state,!wasBoth && Boolean(state.both_complete));updateHomeStatus();}
}
function resetQuiz(){
  quizSet=null;quizQuestions=[];quizState=null;quizPos=0;quizSelected=null;
  document.getElementById('quizHub').classList.remove('hidden');
  document.getElementById('quizPlay').classList.add('hidden');
  document.getElementById('quizResult').classList.add('hidden');
}

function updateTogetherDays(){
  const start = new Date('2026-04-21T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.max(0,Math.floor((today - start)/86400000));
  document.getElementById('daysTogether').textContent = diff.toLocaleString('it-IT');
  const milestones=[100,200,365,500,730,1000,1500,2000,3000,5000];
  const next=milestones.find(x=>x>diff) || (Math.ceil((diff+1)/1000)*1000);
  const prev=[0,...milestones].filter(x=>x<=diff).pop() || 0;
  const progress=Math.max(0,Math.min(100,((diff-prev)/(next-prev))*100));
  document.getElementById('milestoneLabel').textContent=next.toLocaleString('it-IT')+' giorni';
  document.getElementById('bondFill').style.width=progress+'%';
}
updateTogetherDays();


const SB_URL = 'https://iiakdfsxpywdkxravqjh.supabase.co';
const SB_KEY = 'sb_publishable_JAB6USqhccAUg8_0ujgQ1A_NkRJRv_A';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

let selectedRole = null;

async function initCloud(){
  const { data: { session } } = await sb.auth.getSession();
  if(!session){
    window.usProfile = null;
    setCloudBadge(false,'offline');
    document.getElementById('authOverlay').classList.remove('hidden');
    showAuthStep('authPair');
    return;
  }
  const {data:profile,error} = await sb.from('profiles').select('id,display_name,role,couple_id,avatar_path').eq('id',session.user.id).maybeSingle();
  if(error) console.warn(error);
  if(!profile){
    window.usProfile = null;
    setCloudBadge(false,'da collegare');
    document.getElementById('authOverlay').classList.remove('hidden');
    showAuthStep('authPair');
    return;
  }
  window.usProfile = profile;
  selectedRole = profile.role;
  document.getElementById('authOverlay').classList.add('hidden');
  setCloudBadge(true, profile.display_name);
  const syncBadge=document.getElementById('syncReadyBadge'); if(syncBadge) syncBadge.textContent='SYNC ATTIVO';
  await hydrateProfileAvatars();
  await hydrateCloud();
}

function showAuthStep(id){
  document.querySelectorAll('.auth-step').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setCloudBadge(ok,text){
  const b=document.getElementById('onlineBadge');
  b.className='online-badge '+(ok?'ok':'warn');
  b.textContent=(ok?'● sync · ':'● ')+text;
}

function setAvatarSlot(containerId,signedUrl){
  const root=document.getElementById(containerId);if(!root)return;
  const img=root.querySelector('img'),fallback=root.querySelector('.fallback');
  if(signedUrl){img.src=signedUrl;img.hidden=false;if(fallback)fallback.style.display='none';}
  else{img.removeAttribute('src');img.hidden=true;if(fallback)fallback.style.display='grid';}
}

async function signedAvatarUrl(path){
  if(!path)return null;
  const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,21600);
  if(error){console.warn(error);return null;}
  return data?.signedUrl||null;
}

async function hydrateProfileAvatars(){
  if(!window.usProfile)return;
  const fallback=document.getElementById('profileAvatarFallback');
  if(fallback)fallback.textContent=(window.usProfile.display_name||'?').slice(0,1).toUpperCase();
  const {data:profiles,error}=await sb.from('profiles').select('id,display_name,role,avatar_path').eq('couple_id',window.usProfile.couple_id);
  if(error){console.warn(error);return;}
  for(const profile of profiles||[]){
    const url=await signedAvatarUrl(profile.avatar_path);
    if(profile.role==='francesco')setAvatarSlot('pairAvatarFrancesco',url);
    if(profile.role==='beatrice')setAvatarSlot('pairAvatarBeatrice',url);
    if(profile.id===window.usProfile.id){
      const img=document.getElementById('profileAvatarImg');
      if(url){img.src=url;img.hidden=false;if(fallback)fallback.style.display='none';}
      else{img.removeAttribute('src');img.hidden=true;if(fallback)fallback.style.display='grid';}
      window.usProfile.avatar_path=profile.avatar_path||null;
    }
  }
}
window.hydrateProfileAvatars=hydrateProfileAvatars;

function pickProfilePhoto(){
  if(!window.usProfile)return toast('Connessione non pronta');
  document.getElementById('profileAvatarFile').click();
}
window.pickProfilePhoto=pickProfilePhoto;

function avatarExt(file){
  if(file.type==='image/png')return 'png';
  if(file.type==='image/webp')return 'webp';
  return 'jpg';
}

async function uploadProfilePhoto(file){
  if(!window.usProfile||!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('Per ora usa JPG, PNG o WebP');
  if(file.size>8*1024*1024)return toast('Foto troppo grande: massimo 8 MB');
  const oldPath=window.usProfile.avatar_path||null;
  const path=`${window.usProfile.couple_id}/${window.usProfile.id}/avatar-${Date.now()}-${crypto.randomUUID()}.${avatarExt(file)}`;
  const btn=document.getElementById('profileAvatarBtn');btn.disabled=true;
  try{
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const {error:updateError}=await sb.from('profiles').update({avatar_path:path}).eq('id',window.usProfile.id);
    if(updateError){await sb.storage.from('us-media').remove([path]);throw updateError;}
    window.usProfile.avatar_path=path;
    if(oldPath && oldPath!==path)await sb.storage.from('us-media').remove([oldPath]);
    toast('Foto profilo aggiornata ♡');
    await hydrateProfileAvatars();
  }catch(err){console.warn(err);toast('Non riesco ad aggiornare la foto');}
  finally{btn.disabled=false;document.getElementById('profileAvatarFile').value='';}
}

const profileAvatarFile=document.getElementById('profileAvatarFile');
if(profileAvatarFile)profileAvatarFile.addEventListener('change',(event)=>uploadProfilePhoto(event.target.files?.[0]||null));

function selectRole(role){
  selectedRole=role;
  document.querySelectorAll('.role-btn').forEach(btn=>btn.classList.toggle('selected',btn.dataset.role===role));
  document.getElementById('pairStatus').textContent='';
}
window.selectRole=selectRole;

async function pairAccount(){
  const code=document.getElementById('pairCode').value.trim().toUpperCase();
  const s=document.getElementById('pairStatus');
  const btn=document.getElementById('pairBtn');
  if(!selectedRole){s.textContent='Prima scegli Francesco o Beatrice.';return;}
  if(!code){s.textContent='Inserisci il codice privato.';return;}
  btn.disabled=true;
  s.textContent='Accesso…';
  try{
    let {data:{session},error:sessionError}=await sb.auth.getSession();
    if(sessionError) throw sessionError;
    if(!session){
      const anon = await sb.auth.signInAnonymously();
      if(anon.error) throw anon.error;
      session = anon.data.session;
    }
    const {error}=await sb.rpc('claim_us_role',{invite_code:code,chosen_role:selectedRole});
    if(error) throw error;
    s.textContent='Questo telefono è collegato ♡';
    document.getElementById('pairCode').value='';
    await initCloud();
  }catch(err){
    const msg=String(err?.message||'accesso non riuscito');
    if(/anonymous sign-ins are disabled|anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)){
      s.textContent='Accesso anonimo non ancora attivo su Supabase.';
    }else if(/Invalid private code/i.test(msg)){
      s.textContent='Codice privato non corretto.';
    }else{
      s.textContent='Errore: '+msg;
    }
  }finally{
    btn.disabled=false;
  }
}
window.pairAccount=pairAccount;

function localDateISO(){
  const d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
async function hydrateToday(){
  if(!window.usProfile)return;
  const {data:q,error:qError}=await sb.from('daily_questions').select('id,question').eq('question_date',localDateISO()).maybeSingle();
  if(qError){console.warn(qError);return;}
  const qel=document.querySelector('#today .qtext');
  const locked=document.getElementById('locked'), reveal=document.getElementById('todayReveal'), btn=document.getElementById('todaySaveBtn');
  const answerEl=document.getElementById('answer');
  if(!q){
    window.todayQuestion=null; window.todayState=null;
    if(qel)qel.textContent='La prossima domanda sta arrivando…';
    locked.textContent='Nessuna domanda disponibile per oggi.';
    reveal.classList.add('hidden');
    answerEl.disabled=true; btn.disabled=true; btn.textContent='Nessuna domanda';
    updateHomeStatus();
    return;
  }
  answerEl.disabled=false; btn.disabled=false;
  window.todayQuestion=q;if(qel)qel.textContent=q.question;
  const {data:state,error}=await sb.rpc('get_daily_state',{target_question_id:q.id});
  if(error){console.warn(error);return;}
  window.todayState=state;
  if(state?.my_answer){
    document.getElementById('answer').value=state.my_answer;
    btn.textContent='Aggiorna risposta';
  }else{
    btn.textContent='Rispondi';
  }
  if(state?.both_answered){
    const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
    locked.innerHTML='♡ <b>Reveal sbloccato.</b> Avete risposto entrambi.';
    reveal.className='today-reveal';
    reveal.innerHTML='<div class="today-answer"><b>La tua risposta</b><p>'+escapeHtml(state.my_answer||'')+'</p></div><div class="today-answer"><b>'+partner+'</b><p>'+escapeHtml(state.partner_answer||'')+'</p></div>';
    answerEl.disabled=true; btn.disabled=true; btn.textContent='Risposte sbloccate';
  }else{
    reveal.classList.add('hidden');reveal.innerHTML='';
    if(state?.my_answer){
      const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
      locked.innerHTML='✓ Hai risposto. <b>In attesa di '+partner+'…</b>';
    }else if(state?.partner_has_answer){
      locked.innerHTML='🔒 L’altra risposta è già arrivata. <b>Rispondi per sbloccarla.</b>';
    }else{
      locked.innerHTML='🔒 Le risposte si sbloccano quando avete risposto entrambi.';
    }
  }
  updateHomeStatus();
}

async function updateHomeStatus(){
  if(!window.usProfile)return;
  const todayPill=document.getElementById('todayStatusPill');
  const quizPill=document.getElementById('quizStatusPill');
  const st=window.todayState;
  const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
  if(todayPill){
    if(st?.both_answered) todayPill.textContent='💬 Today · reveal sbloccato';
    else if(st?.my_answer) todayPill.textContent='💬 Today · in attesa di '+partner;
    else if(st?.partner_has_answer) todayPill.textContent='💬 Today · risposta in attesa';
    else todayPill.textContent='💬 Today · da fare';
  }
  try{
    const {count,error}=await sb.from('quiz_responses').select('id',{count:'exact',head:true});
    if(!error && quizPill) quizPill.textContent='🎯 Quiz · '+Number(count||0)+'/40';
  }catch(_e){}
}

let pendingMomentFile=null;

function initMomentDate(){
  const el=document.getElementById('momentDate');
  if(el && !el.value) el.value=localDateISO();
}
initMomentDate();

function pickMomentPhoto(){
  document.getElementById('momentFile').click();
}
window.pickMomentPhoto=pickMomentPhoto;

document.getElementById('momentFile').addEventListener('change',(event)=>{
  const file=event.target.files?.[0]||null;
  pendingMomentFile=file;
  const wrap=document.getElementById('momentPreview');
  const img=document.getElementById('momentPreviewImg');
  if(!file){wrap.classList.remove('show');img.removeAttribute('src');return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
    pendingMomentFile=null;event.target.value='';wrap.classList.remove('show');
    return toast('Per ora usa JPG, PNG o WebP');
  }
  if(file.size>8*1024*1024){
    pendingMomentFile=null;event.target.value='';wrap.classList.remove('show');
    return toast('Foto troppo grande: massimo 8 MB');
  }
  img.src=URL.createObjectURL(file);wrap.classList.add('show');
});

function momentExt(file){
  if(file.type==='image/png')return 'png';
  if(file.type==='image/webp')return 'webp';
  return 'jpg';
}

async function uploadMoment(){
  if(!window.usProfile)return toast('Connessione non pronta');
  if(!pendingMomentFile)return toast('Scegli prima una foto');
  const btn=document.getElementById('momentUploadBtn');
  const caption=document.getElementById('momentCaption').value.trim();
  const momentDate=document.getElementById('momentDate').value||localDateISO();
  const file=pendingMomentFile;
  const safeName=`${Date.now()}-${crypto.randomUUID()}.${momentExt(file)}`;
  const path=`${window.usProfile.couple_id}/${window.usProfile.id}/${safeName}`;
  btn.disabled=true;btn.textContent='Carico…';
  try{
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const {error:rowError}=await sb.from('moments').insert({
      couple_id:window.usProfile.couple_id,
      created_by:window.usProfile.id,
      storage_path:path,
      caption:caption||null,
      moment_date:momentDate
    });
    if(rowError){await sb.storage.from('us-media').remove([path]);throw rowError;}
    pendingMomentFile=null;
    document.getElementById('momentFile').value='';
    document.getElementById('momentCaption').value='';
    document.getElementById('momentPreview').classList.remove('show');
    document.getElementById('momentPreviewImg').removeAttribute('src');
    initMomentDate();
    toast('Ricordo aggiunto ♡');
    await hydrateMoments();
  }catch(err){console.warn(err);toast('Upload non riuscito');}
  finally{btn.disabled=false;btn.textContent='Aggiungi a Moments';}
}
window.uploadMoment=uploadMoment;

async function hydrateMoments(){
  if(!window.usProfile)return;
  const grid=document.getElementById('momentsGrid');
  const pill=document.getElementById('momentsStatusPill');
  grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">↻</div><b>Carico i vostri ricordi…</b></div>';
  const [{data:rows,error},{data:profiles, error:profilesError}]=await Promise.all([
    sb.from('moments').select('id,created_by,storage_path,caption,moment_date,created_at').order('moment_date',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  if(error){console.warn(error);grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Moments non disponibile</b><p>Riprova tra un momento.</p></div>';return;}
  if(profilesError)console.warn(profilesError);
  const names=new Map((profiles||[]).map(profile=>[profile.id,profile.display_name||'Noi']));
  if(pill)pill.textContent='📸 Moments · '+(rows?.length||0);
  if(!rows?.length){grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">📸</div><b>Il primo ricordo parte da qui.</b><p>Scegli una foto e aggiungi una piccola nota.</p></div>';return;}
  const cards=[];
  for(const row of rows){
    const {data:signed,error:signedError}=await sb.storage.from('us-media').createSignedUrl(row.storage_path,3600);
    if(signedError||!signed?.signedUrl){console.warn(signedError);continue;}
    const dateLabel=new Date(row.moment_date+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});
    const own=row.created_by===window.usProfile.id;
    const author=names.get(row.created_by)||(own?window.usProfile.display_name:'Noi');
    cards.push(`<article class="moment-card" role="button" tabindex="0" data-url="${escapeHtml(signed.signedUrl)}" data-author="${escapeHtml(author||'Noi')}" data-date="${escapeHtml(dateLabel)}" data-caption="${escapeHtml(row.caption||'')}" onclick="openMomentViewer(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMomentViewer(this)}"><img src="${escapeHtml(signed.signedUrl)}" alt="Ricordo condiviso" loading="lazy">${own?`<button class="moment-delete" type="button" aria-label="Elimina ricordo" onclick="event.stopPropagation();deleteMoment('${row.id}','${escapeHtml(row.storage_path)}')">×</button>`:''}<div class="moment-meta"><div class="moment-by">${escapeHtml(author||'Noi')}</div><b>${dateLabel}</b>${row.caption?`<p>${escapeHtml(row.caption)}</p>`:''}</div></article>`);
  }
  grid.innerHTML=cards.join('')||'<div class="empty-state moment-loading"><div class="emoji">!</div><b>Foto non disponibili</b><p>Riprova tra un momento.</p></div>';
}
window.hydrateMoments=hydrateMoments;

function openMomentViewer(card){
  const viewer=document.getElementById('momentViewer');
  document.getElementById('momentViewerImg').src=card.dataset.url||'';
  document.getElementById('momentViewerAuthor').textContent=card.dataset.author||'Noi';
  document.getElementById('momentViewerDate').textContent=card.dataset.date||'';
  const caption=document.getElementById('momentViewerCaption');
  caption.textContent=card.dataset.caption||'';
  caption.hidden=!card.dataset.caption;
  viewer.classList.add('show');
  viewer.setAttribute('aria-hidden','false');
  document.body.classList.add('viewer-open');
}
window.openMomentViewer=openMomentViewer;

function closeMomentViewer(){
  const viewer=document.getElementById('momentViewer');
  if(!viewer?.classList.contains('show'))return;
  viewer.classList.remove('show');
  viewer.setAttribute('aria-hidden','true');
  document.body.classList.remove('viewer-open');
  setTimeout(()=>document.getElementById('momentViewerImg').removeAttribute('src'),180);
}
window.closeMomentViewer=closeMomentViewer;

document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMomentViewer();});

let momentViewerTouchY=null;
const momentViewer=document.getElementById('momentViewer');
if(momentViewer){
  momentViewer.addEventListener('touchstart',(event)=>{momentViewerTouchY=event.touches?.[0]?.clientY??null;},{passive:true});
  momentViewer.addEventListener('touchend',(event)=>{
    if(momentViewerTouchY===null)return;
    const endY=event.changedTouches?.[0]?.clientY??momentViewerTouchY;
    if(endY-momentViewerTouchY>70)closeMomentViewer();
    momentViewerTouchY=null;
  },{passive:true});
}

async function deleteMoment(id,path){
  if(!window.usProfile)return;
  if(!confirm('Eliminare questo ricordo?'))return;
  const {error:storageError}=await sb.storage.from('us-media').remove([path]);
  if(storageError){console.warn(storageError);return toast('Non riesco a eliminare la foto');}
  const {error:rowError}=await sb.from('moments').delete().eq('id',id).eq('created_by',window.usProfile.id);
  if(rowError){console.warn(rowError);return toast('Foto eliminata, aggiorno Moments');}
  toast('Ricordo eliminato');
  await hydrateMoments();
}
window.deleteMoment=deleteMoment;

async function hydrateCloud(){
  try{
    // Shared bucket list
    const {data:items,error:bucketError}=await sb.from('bucket_items').select('*').order('created_at',{ascending:true});
    const bucket=document.getElementById('bucket');
    if(bucketError){
      console.warn(bucketError);
      bucket.innerHTML='<div class="empty-state"><div class="emoji">!</div><b>Lista non disponibile</b><p>Riprova tra un momento.</p></div>';
    }else if(!items || items.length===0){
      bucket.innerHTML='<div class="empty-state"><div class="emoji">🗺️</div><b>La lista è ancora vuota.</b><p>Aggiungete la prima cosa che volete vivere insieme.</p></div>';
    }else{
      bucket.innerHTML='';
      items.forEach(item=>{
        const d=document.createElement('div');
        d.className='item '+(item.completed?'done':'');
        d.dataset.id=item.id;
        d.onclick=()=>toggleCloudBucket(d);
        d.innerHTML='<div class="check">'+(item.completed?'✓':'')+'</div><div class="txt">'+escapeHtml(item.title)+'<div class="tiny">'+(item.completed?'completata':'bucket list')+'</div></div>';
        bucket.appendChild(d);
      });
    }

    await hydrateToday();
    await hydrateMoments();
    await updateHomeStatus();
  }catch(e){console.warn(e)}
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

saveAnswer = async function(){
  if(!window.usProfile || !window.todayQuestion){toast('Sync non pronta, riprova tra un attimo');return;}
  const v=document.getElementById('answer').value.trim();
  if(!v)return toast('Scrivi qualcosa prima :)');
  const btn=document.getElementById('todaySaveBtn');btn.disabled=true;btn.textContent='Salvo…';
  const {error}=await sb.from('daily_answers').upsert({
    question_id:window.todayQuestion.id,
    user_id:window.usProfile.id,
    couple_id:window.usProfile.couple_id,
    answer:v,
    updated_at:new Date().toISOString()
  },{onConflict:'question_id,user_id'});
  btn.disabled=false;
  if(error){console.warn(error);btn.textContent='Riprova';return toast('Errore sync Today');}
  toast('Salvato online ♡');
  await hydrateToday();
}
window.saveAnswer=saveAnswer;

addWish = async function(){
  if(!window.usProfile) return toast('Connessione non pronta');
  const t=prompt('Cosa volete fare insieme?'); if(!t)return;
  const {error}=await sb.from('bucket_items').insert({
    couple_id:window.usProfile.couple_id,
    created_by:window.usProfile.id,
    title:t
  });
  if(error)return toast('Errore sync');
  toast('Aggiunta online ♡');
  hydrateCloud();
}

async function toggleCloudBucket(el){
  const id=el.dataset.id;if(!id)return;
  const completed=!el.classList.contains('done');
  const {error}=await sb.from('bucket_items').update({
    completed,
    completed_at: completed ? new Date().toISOString() : null
  }).eq('id',id);
  if(error)return toast('Errore sync');
  toast(completed?'+15 Bond XP':'Riaperta');
  hydrateCloud();
}

setInterval(()=>{ if(window.usProfile){ hydrateToday(); refreshQuizState(); } },15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && window.usProfile){hydrateCloud();refreshQuizState();}});
sb.auth.onAuthStateChange((_event,_session)=>{ setTimeout(initCloud,0); });
const pairBtn=document.getElementById('pairBtn');
if(pairBtn) pairBtn.addEventListener('click', pairAccount);

initCloud();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"}).catch((err) => {
      console.warn("US. service worker non registrato:", err);
    });
  });
}
