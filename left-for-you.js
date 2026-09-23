((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsLeftForYou = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const kinds = new Set(['text', 'photo', 'audio', 'video', 'music']);
  let items = [];
  let currentIndex = 0;
  let busy = false;
  let profiles = new Map();

  function getClient() {
    try { return sb; } catch (_) { return window.sb || null; }
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const isUnseen = (item) => !item?.seen_at;
  const partner = () => profiles.get(items[0]?.sender_id) || [...profiles.values()].find((p) => p.id !== window.usProfile?.id) || null;
  const labelForKind = (kind) => ({ text: 'Un pensiero', photo: 'Una foto', audio: 'Una voce', video: 'Un momento', music: 'Musica' }[kind] || 'Lasciato per te');

  function renderItemMarkup(item, mediaUrl = '') {
    const kind = kinds.has(item?.kind) ? item.kind : 'text';
    const body = item?.body ? `<p class="left-for-you-note">${escapeHtml(item.body)}</p>` : '';
    let content = '';
    if (kind === 'text') content = `<div class="left-for-you-text">${escapeHtml(item?.body || 'Un pensiero per te.')}</div>`;
    if (kind === 'photo') content = `<img class="left-for-you-photo" src="${escapeHtml(mediaUrl)}" alt="Foto lasciata per te" loading="eager">${body}`;
    if (kind === 'audio') content = `<div class="left-for-you-media-shell"><span class="left-for-you-media-mark" aria-hidden="true">◖</span><audio controls preload="metadata" src="${escapeHtml(mediaUrl)}"></audio></div>${body}`;
    if (kind === 'video') content = `<video class="left-for-you-video" controls preload="metadata" playsinline src="${escapeHtml(mediaUrl)}"></video>${body}`;
    if (kind === 'music') content = `<a class="left-for-you-music" href="${escapeHtml(item?.media_path || '')}" target="_blank" rel="noreferrer noopener"><span class="left-for-you-music-mark" aria-hidden="true">♪</span><span><b>Apri il brano</b><small>${escapeHtml(item?.media_path || '')}</small></span><span aria-hidden="true">↗</span></a>${body}`;
    return `<article class="left-for-you-item" data-left-kind="${kind}"><div class="left-for-you-kind">${labelForKind(kind)}</div>${content}</article>`;
  }

  function root() { return document.getElementById('leftForYouOverlay'); }
  function setStatus(message, kind = '') {
    const status = document.getElementById('leftForYouStatus');
    if (status) { status.textContent = message || ''; status.dataset.kind = kind; }
  }
  function setVisible(id, visible) { const el = document.getElementById(id); if (el) el.hidden = !visible; }
  function partnerName() { return partner()?.display_name || 'La tua persona'; }

  function updateEntry(unseenCount = 0) {
    const entry = document.getElementById('leftForYouPartnerEntry');
    const badge = document.getElementById('leftForYouPartnerBadge');
    if (!entry) return;
    entry.hidden = false;
    entry.classList.toggle('has-unseen', unseenCount > 0);
    if (badge) { badge.hidden = unseenCount < 1; badge.textContent = unseenCount > 9 ? '9+' : String(unseenCount); }
    entry.setAttribute('aria-label', unseenCount ? `Apri Lasciato per te · ${unseenCount} nuovo` : 'Apri Lasciato per te');
  }

  async function loadProfiles() {
    const client = getClient();
    if (!window.usProfile || !client) return;
    const { data, error } = await client.from('profiles').select('id,display_name,role,avatar_path').eq('couple_id', window.usProfile.couple_id);
    if (error) throw error;
    profiles = new Map((data || []).map((profile) => [profile.id, profile]));
    const other = [...profiles.values()].find((profile) => profile.id !== window.usProfile.id);
    const name = document.getElementById('leftForYouPartnerName');
    const fromName = document.getElementById('leftForYouFromName');
    const fallback = document.getElementById('leftForYouPartnerFallback');
    const fromFallback = document.getElementById('leftForYouFromFallback');
    if (name) name.textContent = other?.display_name || 'La tua persona';
    if (fromName) fromName.textContent = other?.display_name || 'la tua persona';
    if (fallback) fallback.textContent = (other?.display_name || '♡').slice(0, 1).toUpperCase();
    if (fromFallback) fromFallback.textContent = (other?.display_name || '♡').slice(0, 1).toUpperCase();
    if (other?.avatar_path && typeof window.usGetSignedUrl === 'function') {
      const url = await window.usGetSignedUrl(other.avatar_path);
      const image = document.getElementById('leftForYouPartnerImg');
      if (url && image) { image.src = url; image.hidden = false; if (fallback) fallback.hidden = true; }
    }
  }

  async function fetchItems() {
    const client = getClient();
    if (!window.usProfile || !client) throw new Error('sync_unavailable');
    const { data, error } = await client.from('left_for_you')
      .select('id,sender_id,recipient_id,kind,body,media_path,created_at,seen_at')
      .eq('recipient_id', window.usProfile.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    items = (data || []).filter((item) => kinds.has(item.kind));
    currentIndex = 0;
    updateEntry(items.filter(isUnseen).length);
    return items;
  }

  async function markSeen(item) {
    const client = getClient();
    if (!item || item.seen_at || !client) return;
    const { data, error } = await client.rpc('mark_left_item_seen', { target_item_id: item.id });
    if (error) throw error;
    item.seen_at = data?.seen_at || new Date().toISOString();
    updateEntry(items.filter(isUnseen).length);
  }

  async function mediaUrl(item) {
    if (!item?.media_path || item.kind === 'music') return '';
    if (typeof window.usGetSignedUrl !== 'function') return '';
    return window.usGetSignedUrl(item.media_path);
  }

  async function renderCurrent() {
    const item = items[currentIndex];
    const content = document.getElementById('leftForYouContent');
    const counter = document.getElementById('leftForYouCounter');
    const conserve = document.getElementById('leftForYouConserve');
    if (!item || !content) return;
    content.innerHTML = '<div class="left-for-you-loading-inline" aria-busy="true">Apro il tuo messaggio…</div>';
    const url = await mediaUrl(item);
    content.innerHTML = renderItemMarkup(item, url);
    if (counter) counter.textContent = items.length > 1 ? `${currentIndex + 1} di ${items.length}` : '';
    if (conserve) {
      conserve.disabled = false;
      conserve.classList.toggle('is-conserved', Boolean(item.conserved));
      conserve.innerHTML = item.conserved ? '✓ Conservato' : 'Conserva';
    }
    await markSeen(item);
  }

  function showState(state) {
    setVisible('leftForYouLoading', state === 'loading');
    setVisible('leftForYouEmpty', state === 'empty');
    setVisible('leftForYouError', state === 'error');
    setVisible('leftForYouCard', state === 'ready');
  }

  async function load() {
    showState('loading'); setStatus('');
    try {
      await loadProfiles();
      await fetchItems();
      if (!items.length) { showState('empty'); return; }
      showState('ready');
      await renderCurrent();
    } catch (error) {
      console.warn('[US Left for You]', error);
      showState('error'); setStatus('Non riesco ad aprire questo messaggio.', 'error');
    }
  }

  async function open() {
    const modal = root();
    if (!modal) return;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    await load();
  }

  function close() {
    const modal = root();
    if (!modal) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
  }

  async function conserve() {
    const item = items[currentIndex];
    const client = getClient();
    if (!item || busy || item.conserved || !client) return;
    busy = true; const button = document.getElementById('leftForYouConserve');
    if (button) { button.disabled = true; button.textContent = 'Conservo…'; }
    try {
      const { data, error } = await client.rpc('conserve_left_for_you', { target_item_id: item.id });
      if (error) throw error;
      item.conserved = true;
      if (button) { button.classList.add('is-conserved'); button.textContent = data?.status === 'existing' ? '✓ Già conservato' : '✓ Conservato'; }
      setStatus(data?.status === 'existing' ? 'Era già tra le cose da custodire.' : 'Conservato per voi.', 'success');
    } catch (error) {
      console.warn('[US Left for You] conserve', error);
      if (button) { button.disabled = false; button.textContent = 'Conserva'; }
      setStatus('Non riesco a conservarlo. Riprova.', 'error');
    } finally { busy = false; }
  }

  async function retry() { await load(); }

  function boot() {
    document.getElementById('leftForYouClose')?.addEventListener('click', close);
    document.getElementById('leftForYouBackdrop')?.addEventListener('click', close);
    document.getElementById('leftForYouRetry')?.addEventListener('click', retry);
    document.getElementById('leftForYouConserve')?.addEventListener('click', conserve);
    document.getElementById('leftForYouNext')?.addEventListener('click', async () => {
      if (currentIndex >= items.length - 1) return;
      currentIndex += 1; await renderCurrent();
    });
    window.addEventListener('us-auth-resolved', (event) => { if (event.detail?.paired) { fetchItems().catch(() => {}); } });
    window.addEventListener('left-for-you-refresh', () => { if (root()?.classList.contains('open')) load(); else fetchItems().catch(() => {}); });
    if (window.usProfile) fetchItems().catch(() => {});
  }

  const api = { isUnseen, renderItemMarkup, labelForKind, open, close, load, conserve, retry, boot };
  if (typeof window !== 'undefined') window.openLeftForYou = open;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }
  return api;
});
