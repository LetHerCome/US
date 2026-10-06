// App links — platform-neutral foundation for opening US at a primary page
// from outside the WebView (iOS URL scheme today; Universal Links, Quick
// Actions and Share Extension later). Bundled into native-entry.js only.
//
// Public form: com.usapp.us://open/<oggi|noi|ricordi|gioca>
// Anything else is ignored: no actions, no data, no query parameters are
// interpreted, so an external caller can at most switch tab. Widget links
// (us://widget/<kind>) stay owned by widgets.js.

export const APP_LINK_SCHEME = 'com.usapp.us';

export const APP_LINK_PAGES = Object.freeze({
  oggi: 'home',
  noi: 'bond',
  ricordi: 'moments',
  gioca: 'quiz'
});

export function parseAppLink(value) {
  const raw = typeof value === 'string' ? value : value?.url;
  if (typeof raw !== 'string' || !raw || raw.length > 256) return null;
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  if (url.protocol !== `${APP_LINK_SCHEME}:` || url.hostname !== 'open') return null;
  const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.length !== 1) return null;
  const key = segments[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(APP_LINK_PAGES, key)
    ? { page: APP_LINK_PAGES[key], url: raw }
    : null;
}

export function openAppPage(target, page) {
  if (page === 'quiz' && typeof target.openQuizHub === 'function') {
    target.openQuizHub({ nav: true });
    return true;
  }
  if (typeof target.go !== 'function') return false;
  target.go(page, { nav: true });
  return true;
}

// Cold start delivers the same URL twice (launch URL + appUrlOpen), and a
// link can arrive before the shell has a paired profile: hold it until
// `us-auth-resolved` says the couple shell is ready.
export function installAppLinks({ app, target = globalThis, now = () => Date.now() } = {}) {
  if (!app || typeof app.addListener !== 'function') return null;
  let pending = '';
  let last = { url: '', at: 0 };

  function accept(value) {
    const link = parseAppLink(value);
    if (!link) return false;
    const at = now();
    if (last.url === link.url && at - last.at < 1500) return true;
    last = { url: link.url, at };
    if (target.usProfile) {
      pending = '';
      openAppPage(target, link.page);
    } else {
      pending = link.page;
    }
    return true;
  }

  target.addEventListener?.('us-auth-resolved', (event) => {
    const page = pending;
    pending = '';
    if (page && event?.detail?.paired) setTimeout(() => openAppPage(target, page), 60);
  });

  Promise.resolve(app.addListener('appUrlOpen', (event) => accept(event))).catch(() => {});
  Promise.resolve(typeof app.getLaunchUrl === 'function' ? app.getLaunchUrl() : null)
    .then((launch) => accept(launch))
    .catch(() => {});

  return { accept, pending: () => pending };
}
