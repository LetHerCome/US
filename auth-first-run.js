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
      n.copy.textContent = 'Si apre come un’app, senza barra del browser.';
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
    renderInstall();
  });
  window.addEventListener('us-onboarding-view-change', renderInstall);
})();
