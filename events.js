
(() => {
  'use strict';
  if (window.__usSharedEventsInstalled) return;
  window.__usSharedEventsInstalled = true;

  let rows = [];
  let editingId = null;
  let busy = false;
  let deepLinkPending = false;

  const $ = (id) => document.getElementById(id);
  const esc = (value='') => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function localTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function occurrence(row) {
    const today = localTodayISO();
    const raw = row.event_date;
    if (!raw) return null;
    let effective = raw;
    if (row.recurs_yearly) {
      const [,month,day] = raw.split('-');
      const year = Number(today.slice(0,4));
      effective = `${year}-${month}-${day}`;
      if (effective < today) effective = `${year+1}-${month}-${day}`;
    } else if (raw < today) return null;
    const [ty,tm,td] = today.split('-').map(Number);
    const [ey,em,ed] = effective.split('-').map(Number);
    const daysLeft = Math.round((Date.UTC(ey,em-1,ed)-Date.UTC(ty,tm-1,td))/86400000);
    return {...row,effective_date:effective,days_left:daysLeft};
  }

  function upcomingRows() {
    return rows.map(occurrence).filter(Boolean).sort((a,b) => {
      const dateCmp = a.effective_date.localeCompare(b.effective_date);
      if (dateCmp) return dateCmp;
      return String(a.event_time||'23:59:59').localeCompare(String(b.event_time||'23:59:59'));
    });
  }

  function formatDate(value, long=true) {
    if (!value) return '';
    const [y,m,d] = value.split('-').map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString('it-IT', long
      ? {weekday:'long',day:'numeric',month:'long',year:y!==new Date().getFullYear()?'numeric':undefined}
      : {day:'numeric',month:'short'});
  }

  function monthShort(value) {
    const [y,m,d] = value.split('-').map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString('it-IT',{month:'short'}).replace('.','');
  }

  function countdown(days) {
    if (days === 0) return 'Oggi';
    if (days === 1) return 'Domani';
    return `Tra ${days} giorni`;
  }

  function detailLine(row) {
    const bits = [];
    if (row.event_time) bits.push(String(row.event_time).slice(0,5));
    if (row.location) bits.push(row.location);
    if (row.recurs_yearly) bits.push('ogni anno');
    return bits.length ? bits.join(' · ') : countdown(row.days_left);
  }

  function render() {
    const upcoming = upcomingRows();
    const list = $('usEventsList');
    const count = $('usEventsCount');
    const card = $('usNextEventCard');
    const dot = $('usCalendarDot');

    if (count) count.textContent = upcoming.length ? `${upcoming.length} ${upcoming.length===1?'evento':'eventi'}` : '';
    if (dot) dot.hidden = !(upcoming[0] && upcoming[0].days_left <= 7);

    if (!upcoming.length) {
      if (card) card.hidden = true;
      if (list) list.innerHTML = '<div class="us-events-empty"><b>Niente in programma per ora.</b><br>Aggiungete solo le date che vale davvero la pena aspettare insieme.</div>';
      return;
    }

    const next = upcoming[0];
    if (card) {
      card.hidden = false;
      card.dataset.id = next.id;
      card.onclick = () => editEvent(next.id);
      $('usNextEventTitle').textContent = next.title;
      $('usNextEventDate').textContent = formatDate(next.effective_date) + (next.event_time ? ` · ${String(next.event_time).slice(0,5)}` : '');
      $('usNextEventCountdown').textContent = countdown(next.days_left);
    }

    if (list) list.innerHTML = upcoming.map(row => {
      const [, , day] = row.effective_date.split('-');
      return `<button type="button" class="us-event-item" data-id="${esc(row.id)}">
        <span class="us-event-datebox"><small>${esc(monthShort(row.effective_date))}</small><b>${Number(day)}</b></span>
        <span class="us-event-main"><b>${esc(row.title)}</b><small>${esc(detailLine(row))}</small></span>
        <span class="us-event-chevron">›</span>
      </button>`;
    }).join('');

    list?.querySelectorAll('.us-event-item').forEach(btn => btn.addEventListener('click', () => editEvent(btn.dataset.id)));
  }

  async function hydrateEvents() {
    if (!window.usProfile) return;
    const list = $('usEventsList');
    try {
      const {data,error} = await sb.from('shared_events')
        .select('id,couple_id,created_by,title,event_date,event_time,location,note,recurs_yearly,created_at,updated_at')
        .eq('couple_id', window.usProfile.couple_id)
        .order('event_date',{ascending:true});
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      render();
    } catch (error) {
      console.warn('[US Events] load', error);
      if (list) list.innerHTML = '<div class="us-events-empty">Non riesco a caricare gli eventi. Controlla la connessione e riprova.</div>';
    }
  }

  function showBrowse() {
    $('usEventsBrowse').hidden = false;
    $('usEventForm').hidden = true;
    editingId = null;
  }

  function showForm() {
    $('usEventsBrowse').hidden = true;
    $('usEventForm').hidden = false;
    setTimeout(() => $('usEventTitleInput')?.focus({preventScroll:true}), 80);
  }

  function resetForm() {
    $('usEventForm')?.reset();
    $('usEventStatus').textContent = '';
    $('usEventDeleteBtn').hidden = true;
    $('usEventSaveBtn').textContent = 'Salva evento';
    $('usEventFormKicker').textContent = 'NUOVO EVENTO';
    $('usEventFormTitle').textContent = 'Aggiungi qualcosa da aspettare insieme';
  }

  function beginAddEvent() {
    editingId = null;
    resetForm();
    $('usEventDateInput').value = localTodayISO();
    showForm();
  }

  function editEvent(id) {
    const row = rows.find(item => item.id === id);
    if (!row) return;
    editingId = id;
    resetForm();
    $('usEventFormKicker').textContent = 'MODIFICA EVENTO';
    $('usEventFormTitle').textContent = row.title;
    $('usEventTitleInput').value = row.title || '';
    $('usEventDateInput').value = row.event_date || '';
    $('usEventTimeInput').value = row.event_time ? String(row.event_time).slice(0,5) : '';
    $('usEventLocationInput').value = row.location || '';
    $('usEventNoteInput').value = row.note || '';
    $('usEventRecurringInput').checked = Boolean(row.recurs_yearly);
    $('usEventDeleteBtn').hidden = false;
    $('usEventSaveBtn').textContent = 'Salva modifiche';
    showForm();
  }

  function cancelEventEdit() {
    resetForm();
    showBrowse();
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (busy || !window.usProfile) return;
    if (!navigator.onLine) { toast('Sei offline. Riprova quando torni online.'); return; }

    const title = $('usEventTitleInput').value.trim();
    const date = $('usEventDateInput').value;
    if (!title || !date) return;

    const payload = {
      title,
      event_date: date,
      event_time: $('usEventTimeInput').value || null,
      location: $('usEventLocationInput').value.trim() || null,
      note: $('usEventNoteInput').value.trim() || null,
      recurs_yearly: $('usEventRecurringInput').checked
    };

    busy = true;
    const saveBtn = $('usEventSaveBtn');
    saveBtn.disabled = true;
    $('usEventStatus').textContent = 'Salvo…';

    try {
      let result;
      if (editingId) {
        result = await sb.from('shared_events').update(payload).eq('id',editingId);
      } else {
        result = await sb.from('shared_events').insert({
          ...payload,
          couple_id: window.usProfile.couple_id,
          created_by: window.usProfile.id
        });
      }
      if (result.error) throw result.error;
      const wasEditing = Boolean(editingId);
      await hydrateEvents();
      cancelEventEdit();
      toast(wasEditing ? 'Evento aggiornato' : 'Evento aggiunto');
    } catch (error) {
      console.warn('[US Events] save', error);
      $('usEventStatus').textContent = 'Non riesco a salvarlo. Riprova.';
    } finally {
      busy = false;
      saveBtn.disabled = false;
    }
  }

  async function deleteEvent() {
    if (!editingId || busy || !window.usProfile) return;
    if (!confirm('Eliminare questo evento per entrambi?')) return;
    if (!navigator.onLine) { toast('Sei offline. Riprova quando torni online.'); return; }
    busy = true;
    const btn = $('usEventDeleteBtn');
    btn.disabled = true;
    $('usEventStatus').textContent = 'Elimino…';
    try {
      const {error} = await sb.from('shared_events').delete().eq('id',editingId);
      if (error) throw error;
      await hydrateEvents();
      cancelEventEdit();
      toast('Evento eliminato');
    } catch (error) {
      console.warn('[US Events] delete', error);
      $('usEventStatus').textContent = 'Non riesco a eliminarlo. Riprova.';
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  async function openEvents() {
    const overlay = $('usEventsOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('us-events-open');
    showBrowse();
    if (!window.usProfile) {
      $('usEventsList').innerHTML = '<div class="us-events-empty">Aspetto la sincronizzazione di US…</div>';
      return;
    }
    await hydrateEvents();
  }

  function closeEvents() {
    if (busy) return;
    const overlay = $('usEventsOverlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden','true');
    document.body.classList.remove('us-events-open');
    resetForm();
    showBrowse();
  }

  function captureDeepLink() {
    try {
      const url = new URL(location.href);
      deepLinkPending = url.searchParams.get('open') === 'events';
      if (!deepLinkPending) return;
      url.searchParams.delete('open');
      history.replaceState({},'',url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function flushDeepLink() {
    if (deepLinkPending && window.usProfile) {
      deepLinkPending = false;
      openEvents();
    }
  }

  window.openEvents = openEvents;
  window.closeEvents = closeEvents;
  window.beginAddEvent = beginAddEvent;
  window.editEvent = editEvent;
  window.cancelEventEdit = cancelEventEdit;
  window.hydrateEvents = hydrateEvents;

  $('usEventForm')?.addEventListener('submit', saveEvent);
  $('usEventDeleteBtn')?.addEventListener('click', deleteEvent);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('usEventsOverlay')?.classList.contains('open')) closeEvents(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('usEventsOverlay')?.classList.contains('open')) hydrateEvents(); });
  window.addEventListener('online', () => { if ($('usEventsOverlay')?.classList.contains('open')) hydrateEvents(); });

  captureDeepLink();
  const bootTimer = setInterval(() => {
    flushDeepLink();
    if (window.usProfile) clearInterval(bootTimer);
  }, 300);
  setTimeout(() => clearInterval(bootTimer), 30000);

  setInterval(() => {
    if (!document.hidden && $('usEventsOverlay')?.classList.contains('open') && window.usProfile) hydrateEvents();
  }, 60000);

  console.info('[US Events] calendario condiviso attivo · fallback 60s');
})();
