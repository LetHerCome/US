(() => {
  'use strict';

  const IMAGE_ACCEPT = 'image/*';
  const DEFAULT_TIMEOUT_MS = 120000;
  let activeSheet = null;

  function isNative() {
    return Boolean(window.UsPlatform?.isNative);
  }

  function safeFileName(file, fallback = 'foto.jpg') {
    const name = String(file?.name || '').trim();
    return name || fallback;
  }

  function createFileInput({ source = 'library', multiple = false, accept = IMAGE_ACCEPT } = {}) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = Boolean(multiple);
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    return input;
  }

  function pickFiles(options = {}) {
    return new Promise((resolve) => {
      const input = createFileInput(options);
      let settled = false;
      let timer = null;

      const finish = (files = []) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('focus', onFocus);
        input.remove();
        resolve(Array.from(files || []));
      };

      const onFocus = () => {
        setTimeout(() => {
          if (!settled && !input.files?.length) finish([]);
        }, 450);
      };

      input.addEventListener('change', () => finish(input.files), { once: true });
      input.addEventListener('cancel', () => finish([]), { once: true });
      window.addEventListener('focus', onFocus);
      timer = setTimeout(() => finish(input.files), Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);

      try {
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
      } catch (_) {
        input.click();
      }
    });
  }

  async function pickImage({ source = 'library' } = {}) {
    const files = await pickFiles({ source, multiple: false, accept: IMAGE_ACCEPT });
    return files[0] || null;
  }

  function closeSheet(result = null) {
    const state = activeSheet;
    if (!state) return;
    activeSheet = null;
    state.root.remove();
    state.resolve(result);
  }

  function sourceSheet({ title = 'Aggiungi una foto', libraryLabel = 'Scegli dalla galleria', cameraLabel = 'Scatta una foto' } = {}) {
    if (!isNative()) return Promise.resolve('library');
    if (activeSheet) closeSheet(null);

    return new Promise((resolve) => {
      const root = document.createElement('div');
      root.className = 'us-media-source-sheet';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', title);
      root.innerHTML = `
        <button type="button" class="us-media-source-backdrop" data-us-media-source="cancel" aria-label="Chiudi"></button>
        <div class="us-media-source-panel">
          <div class="us-media-source-head"><b>${title}</b><small>Solo da questo telefono</small></div>
          <button type="button" class="us-media-source-action" data-us-media-source="camera">
            <span class="us-icon" data-us-icon="camera" aria-hidden="true"></span><span>${cameraLabel}</span>
          </button>
          <button type="button" class="us-media-source-action" data-us-media-source="library">
            <span class="us-icon" data-us-icon="images" aria-hidden="true"></span><span>${libraryLabel}</span>
          </button>
          <button type="button" class="us-media-source-cancel" data-us-media-source="cancel">Annulla</button>
        </div>`;
      root.addEventListener('click', (event) => {
        const action = event.target.closest('[data-us-media-source]')?.dataset?.usMediaSource;
        if (!action) return;
        closeSheet(action === 'cancel' ? null : action);
      });
      document.body.appendChild(root);
      activeSheet = { root, resolve };
      requestAnimationFrame(() => root.classList.add('open'));
    });
  }

  async function chooseImage(options = {}) {
    const source = await sourceSheet(options);
    if (!source) return null;
    return pickImage({ source });
  }

  window.UsMediaPicker = Object.freeze({
    isNative,
    pickImage,
    chooseImage,
    pickFiles,
    safeFileName
  });
})();