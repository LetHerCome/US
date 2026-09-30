(() => {
'use strict';
if(window.__usExtraGamesInstalled)return;
window.__usExtraGamesInstalled=true;

let gameData=null;
let knowledgeData=null;
let signature='';
let knowledgeDeck=null;
let knowledgeQuestions=[];
let knowledgeIndex=0;
let knowledgeGuesses={};
let knowledgeBusy=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const meta={
  never_have_i:{eyebrow:'NON HO MAI',title:'Non ho mai',desc:'Rispondete entrambi e scoprite cosa avete fatto davvero.',icon:'✦'},
  agree_disagree:{eyebrow:'OPINIONI',title:'D’accordo / In disaccordo',desc:'Stessa frase, due punti di vista.',icon:'≈'},
  would_you_rather:{eyebrow:'SCELTE',title:'Quale preferisci?',desc:'Due opzioni. Niente “dipende”.',icon:'↔'}
};
function ensureKnowledgeUi(){
  if(document.getElementById('usKnowledgePlay'))return;
  const result=document.getElementById('quizResult');if(!result)return;
  result.insertAdjacentHTML('afterend',`<div id="usKnowledgePlay" class="us-knowledge hidden"><div class="us-knowledge-card"><div class="us-knowledge-top"><div><span id="usKnowledgeKicker">QUANTO CONOSCI</span><b id="usKnowledgeTitle">La tua persona</b></div><span id="usKnowledgeCounter">1/5</span></div><div class="us-knowledge-progress"><i id="usKnowledgeProgress"></i></div><h3 id="usKnowledgeQuestion"></h3><p id="usKnowledgeHint">Scegli cosa pensi abbia risposto l’altra persona.</p><div id="usKnowledgeAnswers" class="us-knowledge-answers"></div><button type="button" class="primary us-knowledge-next" id="usKnowledgeNext" disabled>Conferma</button></div></div><div id="usKnowledgeResult" class="us-knowledge hidden"></div>`);
  document.getElementById('usKnowledgeNext')?.addEventListener('click',nextKnowledge);
}
function card(set,index){return `<button type="button" class="us-game-card" data-game-slug="${esc(set.slug)}"><span class="us-game-number">0${index+1}</span><b>${esc(set.title.replace(/ · \d+$/,''))}</b><small>6 domande</small><i>Apri ›</i></button>`;}
function knowledgeCard(deck,index){const done=deck.completed;return `<button type="button" class="us-game-card us-knowledge-card-button ${done?'done':''}" data-knowledge-deck="${deck.deck}"><span class="us-game-number">0${index+1}</span><b>Round ${index+1}</b><small>${done?`${deck.score}/5 · +${deck.xp_awarded} XP`:'5 domande'}</small><i>${done?'Rivedi ✓':'Gioca ›'}</i></button>`;}
function section(mode,sets){const m=meta[mode];return `<section class="us-game-section"><header><div><span>${m.eyebrow}</span><h3>${m.title}</h3><p>${m.desc}</p></div><i>${m.icon}</i></header><div class="us-game-row">${(sets||[]).map(card).join('')}</div></section>`;}
function renderHub(){
  const root=document.getElementById('usExtraGames');if(!root)return;const partner=knowledgeData?.partner_name||'l’altra persona';const decks=knowledgeData?.decks||[];
  root.innerHTML=`<section class="us-game-section us-knowledge-section"><header><div><span>QUANTO CONOSCI</span><h3>Quanto conosci ${esc(partner)}?</h3><p>Le risposte giuste arrivano da ciò che ${esc(partner)} ha davvero risposto su US.</p></div><i>◉</i></header><div class="us-game-row">${decks.length?decks.map(knowledgeCard).join(''):'<div class="us-game-empty">Servono prima alcune risposte ai quiz classici.</div>'}</div></section>${section('never_have_i',gameData?.never_have_i)}${section('agree_disagree',gameData?.agree_disagree)}${section('would_you_rather',gameData?.would_you_rather)}`;
  root.querySelectorAll('[data-game-slug]').forEach(btn=>btn.addEventListener('click',()=>window.startQuiz?.(btn.dataset.gameSlug)));
  root.querySelectorAll('[data-knowledge-deck]').forEach(btn=>btn.addEventListener('click',()=>startPartnerKnowledge(Number(btn.dataset.knowledgeDeck))));
}
async function loadUsExtraGames(force=false){
  if(!window.usProfile)return;const root=document.getElementById('usExtraGames');if(!root)return;
  try{const [games,knowledge]=await Promise.all([sb.rpc('get_weekly_game_sets'),sb.rpc('get_partner_knowledge_hub')]);if(games.error)throw games.error;if(knowledge.error)throw knowledge.error;const sig=JSON.stringify([games.data?.week_start,knowledge.data?.week_start,knowledge.data?.decks?.map(d=>[d.deck,d.completed,d.score])]);if(!force&&sig===signature)return;signature=sig;gameData=games.data||{};knowledgeData=knowledge.data||{};renderHub();}
  catch(error){console.warn('[US Games] hub',error);root.innerHTML='<div class="us-game-empty">Non riesco a caricare gli altri giochi. Riprova tra poco.</div>';}
}
window.loadUsExtraGames=loadUsExtraGames;

async function startPartnerKnowledge(deckNumber){
  window.USCustomGames?.close({silent:true});
  ensureKnowledgeUi();if(!knowledgeData)await loadUsExtraGames(true);knowledgeDeck=(knowledgeData?.decks||[]).find(d=>Number(d.deck)===Number(deckNumber));if(!knowledgeDeck)return toast('Questo round non è ancora disponibile');
  if(knowledgeDeck.completed){const {data,error}=await sb.rpc('complete_partner_knowledge_deck',{target_deck:deckNumber,target_guesses:{}});if(error){console.warn(error);return toast('Non riesco a riaprire il risultato');}return showKnowledgeResult(data);}
  knowledgeQuestions=knowledgeDeck.questions||[];knowledgeIndex=0;knowledgeGuesses={};document.getElementById('quizHub')?.classList.add('hidden');document.getElementById('quizPlay')?.classList.add('hidden');document.getElementById('quizResult')?.classList.add('hidden');document.getElementById('usKnowledgeResult')?.classList.add('hidden');document.getElementById('usKnowledgePlay')?.classList.remove('hidden');renderKnowledgeQuestion();
}
window.startPartnerKnowledge=startPartnerKnowledge;
function renderKnowledgeQuestion(){
  const q=knowledgeQuestions[knowledgeIndex];if(!q)return;const partner=knowledgeData?.partner_name||'l’altra persona';document.getElementById('usKnowledgeKicker').textContent='QUANTO CONOSCI';document.getElementById('usKnowledgeTitle').textContent=partner;document.getElementById('usKnowledgeCounter').textContent=`${knowledgeIndex+1}/${knowledgeQuestions.length}`;document.getElementById('usKnowledgeProgress').style.width=`${((knowledgeIndex+1)/Math.max(1,knowledgeQuestions.length))*100}%`;document.getElementById('usKnowledgeQuestion').textContent=q.question;document.getElementById('usKnowledgeHint').textContent=`Cosa pensi abbia risposto ${partner}?`;
  const box=document.getElementById('usKnowledgeAnswers');box.innerHTML='';(q.options||[]).forEach((answer,index)=>{const btn=document.createElement('button');btn.type='button';btn.textContent=answer;btn.className='us-knowledge-answer';btn.addEventListener('click',()=>{box.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');knowledgeGuesses[String(q.id)]=index;document.getElementById('usKnowledgeNext').disabled=false;});box.appendChild(btn);});const next=document.getElementById('usKnowledgeNext');next.disabled=true;next.textContent=knowledgeIndex===knowledgeQuestions.length-1?'Scopri il risultato':'Conferma';
}
async function nextKnowledge(){if(knowledgeBusy)return;const q=knowledgeQuestions[knowledgeIndex];if(!q||knowledgeGuesses[String(q.id)]===undefined)return;if(knowledgeIndex<knowledgeQuestions.length-1){knowledgeIndex++;renderKnowledgeQuestion();return;}knowledgeBusy=true;const btn=document.getElementById('usKnowledgeNext');btn.disabled=true;btn.textContent='Calcolo…';try{const {data,error}=await sb.rpc('complete_partner_knowledge_deck',{target_deck:Number(knowledgeDeck.deck),target_guesses:knowledgeGuesses});if(error)throw error;showKnowledgeResult(data);await window.hydrateBondSummary?.();if(data?.reward_granted_now){if(window.usCelebrateXp)window.usCelebrateXp(Number(data.xp_awarded||0),'Quanto conosci');else toast(`+${data.xp_awarded||0} XP Bond ✦`);}await loadUsExtraGames(true);}catch(error){console.warn('[US Games] knowledge',error);toast('Non riesco a calcolare il risultato');btn.disabled=false;btn.textContent='Riprova';}finally{knowledgeBusy=false;}}
function showKnowledgeResult(data){
  ensureKnowledgeUi();document.getElementById('quizHub')?.classList.add('hidden');document.getElementById('quizPlay')?.classList.add('hidden');document.getElementById('quizResult')?.classList.add('hidden');document.getElementById('usKnowledgePlay')?.classList.add('hidden');const root=document.getElementById('usKnowledgeResult');root.classList.remove('hidden');const partner=data?.partner_name||knowledgeData?.partner_name||'Partner';const questions=data?.questions||[];root.innerHTML=`<div class="us-knowledge-result-card"><span class="us-knowledge-result-kicker">QUANTO CONOSCI ${esc(partner).toUpperCase()}</span><div class="us-knowledge-score"><b>${Number(data?.score||0)}/5</b><span>risposte indovinate</span></div><div class="us-knowledge-xp">✦ +${Number(data?.xp_awarded||0)} XP Bond</div><div class="us-knowledge-review">${questions.map(q=>{const mine=(q.options||[])[Number(q.your_answer)]??'—',actual=(q.options||[])[Number(q.partner_answer)]??'—';return `<article class="${q.correct?'correct':'wrong'}"><small>${esc(q.question)}</small><div><span>Tu pensavi</span><b>${esc(mine)}</b></div><div><span>${esc(partner)} aveva risposto</span><b>${esc(actual)}</b></div></article>`;}).join('')}</div><button type="button" class="primary us-knowledge-back">Torna ai giochi</button></div>`;root.querySelector('.us-knowledge-back')?.addEventListener('click',()=>resetPartnerKnowledge());
}
function resetPartnerKnowledge(options={}){document.getElementById('usKnowledgePlay')?.classList.add('hidden');document.getElementById('usKnowledgeResult')?.classList.add('hidden');if(!options.silent)document.getElementById('quizHub')?.classList.remove('hidden');knowledgeDeck=null;knowledgeQuestions=[];knowledgeIndex=0;knowledgeGuesses={};}
window.resetPartnerKnowledge=resetPartnerKnowledge;
function boot(){ensureKnowledgeUi();if(window.usProfile)loadUsExtraGames();else setTimeout(boot,250);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('quiz')?.classList.contains('active'))loadUsExtraGames();});
console.info('[US Games] weekly social games + partner knowledge attivi');
})();

// M11A — couple-created questions
(() => {
'use strict';
if (window.USCustomGames) return;

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = role => role === 'francesco' ? 'Francesco' : 'Bea';
const partnerName = () => label(window.usProfile?.role === 'francesco' ? 'beatrice' : 'francesco');
let questions = [];
let sessionRows = [];
let current = null;
let editing = null;
let busy = false;
let createRequestId = null;
const startRequestIds = new Map();

function status(row) {
  if (row.reveal_ready) return row.my_reveal_seen_at ? 'Rivedi le risposte' : 'Le vostre risposte sono pronte';
  if (row.my_complete) return `Hai risposto. Aspettiamo ${partnerName()}.`;
  if (row.partner_complete) return 'Tocca a te';
  return 'Da giocare';
}

function renderHub() {
  const root = byId('usCustomGamesHub');
  if (!root) return;
  const sessionsHtml = sessionRows.length ? `<div class="us-cg-sessions"><span class="us-cg-kicker">LE VOSTRE PARTITE</span>${sessionRows.map(row => `<article class="us-cg-session-row"><div><b>${esc(row.question_preview || 'Una vostra domanda')}</b><small>${esc(status(row))}</small></div><button type="button" data-cg-session="${esc(row.id)}">Apri</button></article>`).join('')}</div>` : '';
  const libraryHtml = questions.length ? questions.map(q => {
    const mine = q.author_role === window.usProfile?.role;
    const detail = q.answer_kind === 'choice' ? `Scelta · ${q.options.length} opzioni` : 'Risposta libera';
    return `<article class="us-cg-question"><p>${esc(q.question_text)}</p><small>${esc(detail)} · Creata da ${label(q.author_role)}</small><div class="us-cg-actions"><button type="button" data-cg-start="${esc(q.id)}">Gioca</button>${mine ? `<button type="button" data-cg-edit="${esc(q.id)}">Modifica</button><button type="button" data-cg-archive="${esc(q.id)}">Elimina</button>` : ''}</div></article>`;
  }).join('') : '<p class="us-cg-empty">La prima domanda potete scriverla voi.</p>';
  root.innerHTML = `<section class="us-cg-hub"><div class="us-cg-heading"><div><span class="us-cg-kicker">LE VOSTRE DOMANDE</span><h3>Le vostre domande</h3><p>Quelle che solo voi sapreste chiedervi.</p></div><button type="button" class="us-cg-create" data-cg-create>Crea una domanda</button></div>${sessionsHtml}<div class="us-cg-library">${libraryHtml}</div></section>`;
}

async function load() {
  if (!window.usProfile || !byId('usCustomGamesHub')) return;
  try {
    const [q, s] = await Promise.all([sb.rpc('list_couple_questions'), sb.rpc('list_game_sessions')]);
    if (q.error) throw q.error;
    if (s.error) throw s.error;
    questions = Array.isArray(q.data) ? q.data : [];
    sessionRows = Array.isArray(s.data) ? s.data : [];
    renderHub();
  } catch (error) {
    console.warn('[US custom games] hub', error);
    byId('usCustomGamesHub').innerHTML = '<div class="us-game-empty">Non riesco a caricare le vostre domande. <button type="button" data-cg-retry>Riprova</button></div>';
  }
}

function showPanel() {
  byId('quizHub')?.classList.add('hidden');
  byId('quizPlay')?.classList.add('hidden');
  byId('quizResult')?.classList.add('hidden');
  byId('usKnowledgePlay')?.classList.add('hidden');
  byId('usKnowledgeResult')?.classList.add('hidden');
  byId('usCustomGamePanel')?.classList.remove('hidden');
}

function close({ silent = false } = {}) {
  current = null;
  editing = null;
  byId('usCustomGamePanel')?.classList.add('hidden');
  if (!silent) {
    byId('quizHub')?.classList.remove('hidden');
    load();
  }
}

function renderQuestionForm() {
  const root = byId('usCustomGamePanel');
  if (!root) return;
  showPanel();
  const q = editing;
  root.innerHTML = `<div class="us-cg-panel"><button type="button" class="us-cg-back" data-cg-back>Torna a Gioca</button><span class="us-cg-kicker">LE VOSTRE DOMANDE</span><h2>${q ? 'Modifica la domanda' : 'Crea una domanda'}</h2><form id="usCgQuestionForm"><label for="usCgQuestionText">La vostra domanda</label><textarea id="usCgQuestionText" name="question_text" maxlength="300" required rows="3" placeholder="Un ricordo, una scelta, qualcosa che è solo vostro…">${esc(q?.question_text || '')}</textarea><label for="usCgKind">Tipo di risposta</label><select id="usCgKind" name="answer_kind"><option value="open" ${q?.answer_kind !== 'choice' ? 'selected' : ''}>Risposta libera</option><option value="choice" ${q?.answer_kind === 'choice' ? 'selected' : ''}>Scelta</option></select><div id="usCgOptions" ${q?.answer_kind === 'choice' ? '' : 'hidden'}><p>Scrivi da 2 a 4 possibilità.</p>${[0,1,2,3].map(i => `<label for="usCgOption${i}">Opzione ${i + 1}</label><input id="usCgOption${i}" name="option_${i}" maxlength="120" value="${esc(q?.options?.[i] || '')}" ${i < 2 ? 'data-cg-required' : ''}>`).join('')}</div><p id="usCgFormError" class="us-cg-error" role="alert" hidden></p><button class="primary us-cg-submit" type="submit">Salva domanda</button></form></div>`;
  root.querySelector('#usCgKind')?.addEventListener('change', event => {
    const box = root.querySelector('#usCgOptions');
    if (box) box.hidden = event.target.value !== 'choice';
  });
  root.querySelector('#usCgQuestionForm')?.addEventListener('input', () => { createRequestId = null; });
  root.querySelector('#usCgQuestionForm')?.addEventListener('submit', submitQuestionForm);
}

function openCreate() { editing = null; createRequestId = null; renderQuestionForm(); }
function openEdit(id) {
  const q = questions.find(value => value.id === id);
  if (!q || q.author_role !== window.usProfile?.role) return;
  editing = q;
  renderQuestionForm();
}

async function submitQuestionForm(event) {
  event.preventDefault();
  if (busy) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const text = String(data.get('question_text') || '').trim();
  const kind = data.get('answer_kind');
  const rawOptions = [0,1,2,3].map(i => String(data.get(`option_${i}`) || '').trim());
  const options = kind === 'choice' ? rawOptions.filter(Boolean) : [];
  const errorRoot = byId('usCgFormError');
  const error = !text || text.length > 300 ? 'Scrivi una domanda di massimo 300 caratteri.'
    : kind === 'choice' && (!rawOptions[0] || !rawOptions[1] || options.length > 4 || options.some(option => option.length > 120)) ? 'Scrivi le prime due opzioni e, se vuoi, altre due. Massimo 120 caratteri ciascuna.' : '';
  if (error) { errorRoot.textContent = error; errorRoot.hidden = false; return; }
  busy = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = editing
      ? await sb.rpc('update_couple_question', { target_question_id: editing.id, expected_version: editing.version, question_text: text, answer_kind: kind, options })
      : await sb.rpc('create_couple_question', { request_id: (createRequestId ||= window.crypto.randomUUID()), question_text: text, answer_kind: kind, options });
    if (result.error) throw result.error;
    createRequestId = null;
    close();
  } catch (error) {
    console.warn('[US custom games] save question', error);
    errorRoot.textContent = 'Non riesco a salvare la domanda. Riprova.';
    errorRoot.hidden = false;
  } finally { busy = false; button.disabled = false; }
}

async function archiveQuestion(id) {
  const q = questions.find(value => value.id === id);
  if (!q || q.author_role !== window.usProfile?.role || busy) return;
  if (!window.confirm('Eliminare questa domanda dalle vostre domande? Le partite già giocate resteranno disponibili.')) return;
  busy = true;
  try {
    const { error } = await sb.rpc('archive_couple_question', { target_question_id: id });
    if (error) throw error;
    await load();
  } catch (error) { console.warn('[US custom games] archive', error); toast('Non riesco a eliminare la domanda.'); }
  finally { busy = false; }
}

async function startQuestion(id) {
  if (busy) return;
  busy = true;
  try {
    const requestId = startRequestIds.get(id) || window.crypto.randomUUID();
    startRequestIds.set(id, requestId);
    const { data, error } = await sb.rpc('start_custom_game_session', { target_question_id: id, request_id: requestId });
    if (error) throw error;
    startRequestIds.delete(id);
    await presentSession(data);
  } catch (error) { console.warn('[US custom games] start', error); toast('Non riesco ad aprire la partita. Riprova.'); }
  finally { busy = false; }
}

function answerLabel(item, index) { return item.options?.[Number(index)] ?? '—'; }
function answerCard(title, value) { return `<div class="us-cg-answer"><span>${esc(title)}</span><p>${esc(value)}</p></div>`; }

function renderSession() {
  if (!current) return;
  const root = byId('usCustomGamePanel');
  if (!root) return;
  showPanel();
  const item = current.items?.[0];
  if (!item) { root.innerHTML = '<div class="us-cg-panel"><button type="button" data-cg-back>Torna a Gioca</button><p>Questa partita non è disponibile.</p></div>'; return; }
  let body;
  if (current.reveal_ready) {
    body = `<span class="us-cg-state">LE VOSTRE RISPOSTE SONO PRONTE</span>${item.answer_kind === 'choice' ? `<h3 class="us-cg-outcome">${item.my_answer_index === item.partner_answer_index ? 'Uguale ♡' : 'Una sorpresa'}</h3>${answerCard('LA TUA RISPOSTA', answerLabel(item, item.my_answer_index))}${answerCard(partnerName().toUpperCase(), answerLabel(item, item.partner_answer_index))}` : `${answerCard('LA TUA RISPOSTA', item.my_answer_text)}${answerCard(partnerName().toUpperCase(), item.partner_answer_text)}`}`;
  } else if (current.my_complete) {
    const mine = item.answer_kind === 'choice' ? answerLabel(item, item.my_answer_index) : item.my_answer_text;
    body = `<p class="us-cg-state">Hai risposto. Aspettiamo ${partnerName()}.</p>${answerCard('LA TUA RISPOSTA', mine)}<button type="button" class="us-cg-refresh" data-cg-refresh>Aggiorna</button>`;
  } else {
    const intro = current.partner_complete ? `${partnerName()} ha già risposto. Tocca a te.` : 'Tocca a te';
    const input = item.answer_kind === 'open'
      ? `<label for="usCgAnswer">La tua risposta</label><textarea id="usCgAnswer" maxlength="1000" rows="4" required placeholder="Scrivi la tua risposta…">${esc(item.my_answer_text || '')}</textarea>`
      : `<fieldset class="us-cg-choices"><legend>La tua scelta</legend>${(item.options || []).map((option, index) => `<label><input type="radio" name="choice" value="${index}" ${item.my_answer_index === index ? 'checked' : ''}><span>${esc(option)}</span></label>`).join('')}</fieldset>`;
    body = `<p class="us-cg-state">${esc(intro)}</p><form id="usCgAnswerForm">${input}<p id="usCgAnswerError" class="us-cg-error" role="alert" hidden></p><button class="primary us-cg-submit" type="submit">Conferma risposta</button></form>`;
  }
  root.innerHTML = `<div class="us-cg-panel"><button type="button" class="us-cg-back" data-cg-back>Torna a Gioca</button><span class="us-cg-kicker">LE VOSTRE DOMANDE</span><h2>${esc(item.question_text)}</h2>${body}</div>`;
  root.querySelector('#usCgAnswerForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const text = item.answer_kind === 'open' ? root.querySelector('#usCgAnswer')?.value : null;
    const selected = item.answer_kind === 'choice' ? root.querySelector('input[name="choice"]:checked')?.value : null;
    submitAnswer(text, selected === null || selected === undefined ? null : Number(selected));
  });
}

async function presentSession(data) {
  if (!data?.id || !Array.isArray(data.items)) throw new Error('invalid game session');
  current = data;
  renderSession();
  if (data.reveal_ready && !data.my_reveal_seen_at) {
    try {
      const result = await sb.rpc('mark_game_session_reveal_seen', { target_session_id: data.id });
      if (result.error) throw result.error;
      if (result.data?.id === data.id) current = result.data;
    } catch (error) { console.warn('[US custom games] reveal receipt', error); }
  }
}

async function openSession(id) {
  try {
    const { data, error } = await sb.rpc('get_game_session', { target_session_id: id });
    if (error) throw error;
    await presentSession(data);
  } catch (error) { console.warn('[US custom games] session', error); toast('Non riesco ad aprire la partita.'); }
}

async function submitAnswer(text, index) {
  if (!current || current.my_complete || busy) return;
  const item = current.items?.[0];
  if (!item) return;
  const answerText = item.answer_kind === 'open' ? String(text || '').trim() : null;
  const answerIndex = item.answer_kind === 'choice' ? index : null;
  const errorRoot = byId('usCgAnswerError');
  if ((item.answer_kind === 'open' && (!answerText || answerText.length > 1000)) ||
      (item.answer_kind === 'choice' && (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= item.options.length))) {
    if (errorRoot) { errorRoot.textContent = 'Scrivi una risposta o scegli un’opzione.'; errorRoot.hidden = false; }
    return;
  }
  busy = true;
  try {
    const saved = await sb.rpc('save_game_session_answer', { target_session_id: current.id, target_item_id: item.id, target_answer_text: answerText, target_answer_index: answerIndex });
    if (saved.error) throw saved.error;
    current = saved.data;
    const finished = await sb.rpc('complete_game_session_side', { target_session_id: current.id });
    if (finished.error) throw finished.error;
    await presentSession(finished.data);
    await load();
  } catch (error) {
    console.warn('[US custom games] answer', error);
    renderSession();
    const message = byId('usCgAnswerError');
    if (message) { message.textContent = 'Non riesco a confermare la risposta. Riprova.'; message.hidden = false; }
  } finally { busy = false; }
}

async function refresh() { if (current?.id) await openSession(current.id); else await load(); }

function boot() {
  const hub = byId('usCustomGamesHub'), panel = byId('usCustomGamePanel');
  if (!hub || !panel) return;
  hub.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-cg-create')) openCreate();
    else if (button.dataset.cgStart) startQuestion(button.dataset.cgStart);
    else if (button.dataset.cgEdit) openEdit(button.dataset.cgEdit);
    else if (button.dataset.cgArchive) archiveQuestion(button.dataset.cgArchive);
    else if (button.dataset.cgSession) openSession(button.dataset.cgSession);
    else if (button.hasAttribute('data-cg-retry')) load();
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-cg-back')) close();
    else if (button.hasAttribute('data-cg-refresh')) refresh();
  });
  if (window.usProfile) load(); else setTimeout(boot, 250);
}

window.USCustomGames = { load, openCreate, openEdit, start: startQuestion, openSession, submitAnswer, close, refresh };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && byId('quiz')?.classList.contains('active')) {
    if (current) refresh(); else load();
  }
});
})();
