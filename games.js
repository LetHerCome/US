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