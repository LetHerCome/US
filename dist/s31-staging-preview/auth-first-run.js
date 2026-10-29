(() => {
  'use strict';

  let deferredInstallPrompt = null;
  let installMode = 'none';

  const isIos = () => {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const isStandalone = () =>
    Boolean(window.UsPlatform?.isNative) ||
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true;

  function nodes() {
    return {
      root: document.getElementById('usAuthInstall'),
      button: document.getElementById('usAuthInstallBtn'),
      title: document.getElementById('usAuthInstallTitle'),
      copy: document.getElementById('usAuthInstallCopy'),
      help: document.getElementById('usAuthInstallHelp')
    };
  }

  function hideInstall() {
    const n = nodes();
    if (n.root) n.root.hidden = true;
    if (n.help) n.help.hidden = true;
    installMode = 'none';
  }

  function renderInstall() {
    const n = nodes();
    if (!n.root || !n.button || !n.title || !n.copy) return;

    if (isStandalone() || !document.getElementById('authLogin')?.classList.contains('active')) {
      hideInstall();
      return;
    }

    if (deferredInstallPrompt) {
      installMode = 'prompt';
      n.root.hidden = false;
      n.title.textContent = 'Tieni US sul telefono';
      n.copy.textContent = 'Dal browser, si apre come un’app.';
      n.button.textContent = 'Installa';
      if (n.help) n.help.hidden = true;
      return;
    }

    if (isIos()) {
      installMode = 'ios';
      n.root.hidden = false;
      n.title.textContent = 'Tieni US sull’iPhone';
      n.copy.textContent = 'Puoi aggiungerla alla schermata Home.';
      n.button.textContent = 'Come fare';
      return;
    }

    hideInstall();
  }

  async function install() {
    const n = nodes();
    if (!n.button) return;

    if (installMode === 'prompt' && deferredInstallPrompt) {
      n.button.disabled = true;
      try {
        await deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice.catch(() => null);
      } finally {
        deferredInstallPrompt = null;
        n.button.disabled = false;
        renderInstall();
      }
      return;
    }

    if (installMode === 'ios' && n.help) {
      n.help.hidden = !n.help.hidden;
      n.button.setAttribute('aria-expanded', String(!n.help.hidden));
    }
  }

  // Beta fix (28/10/2026): every password on the door can be shown with one
  // tap, and goes back to dots when the step changes.
  const passwordToggles = [];
  function mountPasswordToggles() {
    document.querySelectorAll('#authOverlay .us-auth-field input[type="password"]').forEach((input) => {
      if (input.dataset.usPassToggle) return;
      input.dataset.usPassToggle = 'on';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'us-pass-toggle';
      button.setAttribute('aria-controls', input.id);
      const sync = () => {
        const shown = input.type === 'text';
        button.dataset.shown = String(shown);
        button.setAttribute('aria-pressed', String(shown));
        button.setAttribute('aria-label', shown ? 'Nascondi password' : 'Mostra password');
      };
      button.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        sync();
        input.focus({ preventScroll: true });
      });
      input.insertAdjacentElement('afterend', button);
      passwordToggles.push({ input, sync });
      sync();
    });
  }
  function hidePasswords() {
    for (const { input, sync } of passwordToggles) { input.type = 'password'; sync(); }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstall();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstall();
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('usAuthInstallBtn')?.addEventListener('click', install);
    mountPasswordToggles();
    renderInstall();
  });
  window.addEventListener('us-onboarding-view-change', () => { hidePasswords(); renderInstall(); });
})();
