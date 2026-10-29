// Il vostro anno V1 — the couple's year as a few full-screen cards, made only
// of their own data (get_couple_year_recap: counts, dates and two photo
// paths, never written text). Private: nothing to share outside US, no
// score, no ranking. Spec: docs/missions/year-recap-v1.md.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsYearRecap=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=v=>`<span translate="no">${esc(v)}</span>`;
const count=(n,one,many)=>`${n} ${n===1?one:many}`;
const num=v=>Number(v)||0;

function title(r){
  const p=r?.period||{};
  if(p.first_year){
    const m=num(p.months);
    return m<1?'I vostri primi giorni':m===1?'Il vostro primo mese':`I vostri primi ${m} mesi`;
  }
  if(p.full_year)return num(p.years)===1?'Il vostro primo anno':`${num(p.years)} anni insieme`;
  return 'Il vostro anno, finora';
}
// Said to the one who reads it: never who "won".
function thinkLine(t,names,me){
  const f=num(t?.francesco),b=num(t?.beatrice);
  if(!f&&!b)return '';
  if(f===b)return 'Pari: vi siete pensati tanto quanto';
  const more=f>b?'francesco':'beatrice';
  return more===me?'Hai pensato tu un po’ di più':`${names?.[more]||'La tua persona'} ti ha pensato un po’ di più`;
}
function cards(r){
  if(!r?.period)return [];
  const out=[{kind:'intro'}];
  const m=r.moments||{};
  if(num(m.count))out.push({kind:'moments',photo:m.first});
  if(num(m.top_month_count)>1&&m.top_month)out.push({kind:'top_month'});
  if(num(r.think?.total))out.push({kind:'think'});
  if(num(r.daily?.answered_together)||num(r.daily?.kept))out.push({kind:'daily'});
  const together=[['games','completed','partita finita','partite finite'],['missions','completed','missione insieme','missioni insieme'],
    ['events','lived','evento vissuto','eventi vissuti'],['left_for_you','count','cosa lasciata per te','cose lasciate per voi']]
    .map(([k,f,one,many])=>({n:num(r[k]?.[f]),one,many})).filter(x=>x.n);
  if(together.length)out.push({kind:'together',items:together});
  out.push({kind:'outro',photo:m.last||m.first});
  return out.map(c=>({...c,recap:r}));
}
// Founder, 29/10/2026: «Il vostro anno su US» shows only when the couple
// completes a year on US (couples.created_at, the day in Rome), for 30 days.
// Returns which year (1, 2, …) or 0 outside the window.
const romeDay=at=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date(at));}catch(_){return '';}};
function usYear(createdAt,todayISO){
  const from=romeDay(createdAt);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(String(todayISO||'')))return 0;
  const [y,m,d]=from.split('-').map(Number),[ty]=todayISO.split('-').map(Number);
  const today=Date.parse(`${todayISO}T00:00:00Z`);
  for(const year of [ty,ty-1]){
    const n=year-y;if(n<1)continue;
    // 29 February has its anniversary on the 28th in the other years.
    const start=Date.UTC(year,m-1,Math.min(d,new Date(Date.UTC(year,m,0)).getUTCDate()));
    if(today>=start&&today<start+30*864e5)return n;
  }
  return 0;
}
const tag=()=>(globalThis.UsI18n?.tag)||'it-IT';
function day(iso,withYear=true){
  try{return new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag(),{day:'numeric',month:'long',...(withYear?{year:'numeric'}:{}),timeZone:'UTC'});}catch(_){return iso;}
}
function monthLabel(ym){
  try{const s=new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(tag(),{month:'long',year:'numeric',timeZone:'UTC'});return s.charAt(0).toLocaleUpperCase(tag())+s.slice(1);}catch(_){return ym;}
}
function renderCard(c,ctx={}){
  const r=c.recap||{},names=ctx.names||{},photo=ctx.photo||(()=>'');
  const bg=c.photo?photo(c.photo):'';
  const media=bg?`<span class="us-recap-photo" style="background-image:url('${esc(bg)}')" aria-hidden="true"></span>`:'';
  const big=(n,label,sub='')=>`<b class="us-recap-number">${esc(n)}</b><span class="us-recap-label">${esc(label)}</span>${sub?`<span class="us-recap-sub">${sub}</span>`:''}`;
  let body='';
  if(c.kind==='intro'){
    const p=r.period||{};
    const span=p.full_year?`${esc(day(p.start))} – ${esc(day(p.end))}`:`Dal ${esc(day(p.start))} a oggi`;
    body=`<span class="us-recap-kicker">${span}</span><h2 class="us-recap-title">${esc(title(r))}</h2><span class="us-recap-sub">${esc(count(num(r.days_together),'giorno insieme','giorni insieme'))}</span>`;
  }else if(c.kind==='moments'){
    const m=r.moments;body=big(num(m.count),num(m.count)===1?'ricordo':'ricordi',esc(count(num(m.photos),'foto','foto')));
  }else if(c.kind==='top_month'){
    const m=r.moments;body=`<span class="us-recap-kicker">Il mese più vostro</span><h2 class="us-recap-title">${esc(monthLabel(m.top_month))}</h2><span class="us-recap-sub">${esc(count(num(m.top_month_count),'ricordo','ricordi'))}</span>`;
  }else if(c.kind==='think'){
    const t=r.think,line=thinkLine(t,names,ctx.me);
    const f=num(t.francesco),b=num(t.beatrice),more=f>b?'francesco':'beatrice';
    const sub=!line?'':f===b||more===ctx.me?esc(line):`${name(names[more]||'La tua persona')} ti ha pensato un po’ di più`;
    body=big(num(t.total),'Ti penso',sub);
  }else if(c.kind==='daily'){
    const d=r.daily;body=big(num(d.answered_together),num(d.answered_together)===1?'domanda a cui avete risposto voi due':'domande a cui avete risposto voi due',
      num(d.kept)?esc(count(num(d.kept),'conservata in Ricordi','conservate in Ricordi')):'');
  }else if(c.kind==='together'){
    body=`<span class="us-recap-kicker">Insieme</span><ul class="us-recap-grid">${c.items.map(x=>`<li><b>${esc(x.n)}</b><span>${esc(x.n===1?x.one:x.many)}</span></li>`).join('')}</ul>`;
  }else if(c.kind==='outro'){
    body=`<h2 class="us-recap-title">Il prossimo anno comincia oggi</h2><span class="us-recap-sub">Grazie per tutto quello che vi siete dati.</span><button type="button" class="primary us-recap-done" data-recap-close>Chiudi</button>`;
  }
  return `<article class="us-recap-card is-${esc(c.kind)}${bg?' has-photo':''}" data-recap-card="${esc(c.kind)}">${media}<div class="us-recap-copy">${body}</div></article>`;
}

function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usRecapSheet');
  if(!root)return;
  const stage=$('usRecapStage'),bars=$('usRecapBars'),row=$('noiRecapRow');
  let list=[],index=0,owner='',token=0,urls=new Map();
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const opened=()=>root.classList.contains('open');
  const reduced=()=>Boolean(w.UsUiFoundation?.isReducedMotion?.());
  const names=()=>{try{const i=w.usIdentity?.();return {francesco:i?.nameForRole?.('francesco')||'',beatrice:i?.nameForRole?.('beatrice')||''};}catch(_){return {};}};
  const pathOf=p=>p?.thumbnail_path||p?.storage_path||'';
  function paint(dir=0){
    const c=list[index];if(!c)return;
    stage.innerHTML=renderCard(c,{names:names(),me:w.usProfile?.role,photo:p=>urls.get(pathOf(p))||''});
    bars.innerHTML=list.map((_,i)=>`<i class="${i<index?'is-done':i===index?'is-on':''}"></i>`).join('');
    stage.setAttribute('aria-label',`Scheda ${index+1} di ${list.length}`);
    const el=stage.firstElementChild;
    if(dir&&el&&!reduced()&&typeof el.animate==='function')el.animate([{opacity:0,translate:`${dir*24}px 0`},{opacity:1,translate:'0 0'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  function go(step){
    const next=index+step;
    if(next<0)return;
    if(next>=list.length)return close();
    index=next;w.UsFeedback?.tap?.();paint(step);
  }
  async function open(){
    if(!key()||typeof sb==='undefined')return;
    owner=key();const mine=++token;
    w.UsUiFoundation?.cancelSurfaceExit?.(root);root.setAttribute('aria-hidden','false');root.classList.add('open');
    stage.innerHTML='<div class="us-skeleton-rows" role="status"><span class="us-sr">Preparo il vostro anno…</span><i class="us-skeleton"></i><i class="us-skeleton"></i></div>';
    bars.innerHTML='';
    try{
      const {data,error}=await sb.rpc('get_couple_year_recap');
      if(mine!==token||key()!==owner)return;
      if(error||!data?.period)throw error||new Error('invalid_recap');
      list=cards(data);index=0;
      const paths=[data.moments?.first,data.moments?.last].map(pathOf).filter(Boolean);
      if(paths.length&&typeof w.usGetSignedUrls==='function'){try{urls=await w.usGetSignedUrls(paths);}catch(_){urls=new Map();}}
      if(mine!==token||key()!==owner)return;
      paint(0);
    }catch(err){
      if(mine!==token)return;
      console.warn('[US Il vostro anno]',err);
      stage.innerHTML='<div class="us-recap-card"><div class="us-recap-copy"><h2 class="us-recap-title">Non riesco a preparare il vostro anno</h2><button type="button" class="ghost" data-recap-retry>Riprova</button></div></div>';
    }
  }
  function close(){
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    if(!opened())return;root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
  }
  function reset(){token++;list=[];index=0;urls=new Map();close();}
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-recap-close]'))return close();
    if(event.target.closest('[data-recap-retry]'))return open();
    if(!list.length||!event.target.closest('#usRecapStage'))return;
    const r=stage.getBoundingClientRect();
    go(event.clientX<r.left+r.width*.35?-1:1);
  });
  d.addEventListener('keydown',event=>{
    if(!opened())return;
    if(event.key==='ArrowRight'){event.preventDefault();go(1);}
    if(event.key==='ArrowLeft'){event.preventDefault();go(-1);}
  });
  row?.addEventListener('click',open);
  const createdAt=()=>{try{return w.UsCoupleContext?.snapshot?.()?.couple?.created_at||null;}catch(_){return null;}};
  const showRow=()=>{if(row)row.hidden=!key()||!usYear(createdAt(),romeDay(Date.now()));};
  showRow();w.setInterval(()=>{if(key()!==owner&&opened())reset();showRow();},2000);
  const api=w.UsYearRecap;api.open=open;api.close=close;api.reset=reset;
}
return {title,thinkLine,cards,count,renderCard,usYear,install};
});
