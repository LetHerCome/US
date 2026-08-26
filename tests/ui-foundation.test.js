const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeElement {
  constructor(doc, tagName, options = {}) {
    this.ownerDocument = doc;
    this.tagName = tagName.toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.classList = new FakeClassList(options.classes || []);
    this.hidden = Boolean(options.hidden);
    this.disabled = Boolean(options.disabled);
    this.tabIndex = options.tabIndex ?? 0;
    this.focusable = Boolean(options.focusable);
    if (options.id) this.setAttribute('id', options.id);
    Object.entries(options.attributes || {}).forEach(([name, value]) => this.setAttribute(name, value));
  }
  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }
  setAttribute(name, value = '') { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(candidate) {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }
  matches(selector) {
    if (selector === '[data-us-modal]') return this.hasAttribute('data-us-modal');
    if (selector === '[data-us-modal-panel]') return this.hasAttribute('data-us-modal-panel');
    if (selector === '[data-us-modal-close]') return this.hasAttribute('data-us-modal-close');
    if (selector === '.nav button') return this.tagName === 'BUTTON' && this.parentElement?.classList.contains('nav');
    if (selector === 'button.active') return this.tagName === 'BUTTON' && this.classList.contains('active');
    if (selector.includes('button') || selector.includes('[href]') || selector.includes('[tabindex]') || selector.includes('input') || selector.includes('textarea') || selector.includes('select')) return this.focusable;
    return false;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map((part) => part.trim());
    const found = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (selectors.some((part) => child.matches(part))) found.push(child);
        visit(child);
      });
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.ownerDocument.activeElement = this; }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.body = new FakeElement(this, 'body');
    this.documentElement = new FakeElement(this, 'html');
    this.documentElement.append(this.body);
    this.activeElement = this.body;
  }
  querySelectorAll(selector) {
    const found = this.body.matches(selector) ? [this.body] : [];
    return found.concat(this.body.querySelectorAll(selector));
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  keydown(options) {
    const event = { key: 'Tab', shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...options };
    this.listeners.get('keydown')?.(event);
    return event;
  }
}

function createMotionMedia(initialMatches = false) {
  const listeners = new Set();
  return {
    matches: initialMatches,
    addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); },
    setMatches(matches) {
      this.matches = matches;
      listeners.forEach((listener) => listener({ matches }));
    }
  };
}

function modalFixture() {
  const document = new FakeDocument();
  const app = new FakeElement(document, 'main');
  const opener = new FakeElement(document, 'button', { focusable: true });
  app.append(opener);
  const modal = new FakeElement(document, 'div', { attributes: { 'data-us-modal': '', 'aria-hidden': 'true' } });
  const panel = new FakeElement(document, 'section', { attributes: { 'data-us-modal-panel': '' } });
  const close = new FakeElement(document, 'button', { focusable: true, attributes: { 'data-us-modal-close': '' } });
  const action = new FakeElement(document, 'button', { focusable: true });
  panel.append(close, action);
  modal.append(panel);
  document.body.append(app, modal);
  return { document, app, opener, modal, close, action };
}

test('index carica il layer UI Foundation prima dei fogli e script che lo consumano', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);

  const foundationStyle = styles.findIndex((src) => src.startsWith('/ui-foundation.css'));
  const fixStyle = styles.findIndex((src) => src.startsWith('/fix4.css'));
  const foundationScript = scripts.findIndex((src) => src.startsWith('/ui-foundation.js'));
  const navigationScript = scripts.findIndex((src) => src.startsWith('/navigation.js'));

  assert.ok(fs.existsSync(path.join(ROOT, 'ui-foundation.css')), 'ui-foundation.css deve esistere');
  assert.ok(fs.existsSync(path.join(ROOT, 'ui-foundation.js')), 'ui-foundation.js deve esistere');
  assert.ok(foundationStyle >= 0 && foundationStyle < fixStyle, 'i token devono precedere i fogli consumer');
  assert.ok(foundationScript > navigationScript, 'il comportamento trasversale deve installarsi dopo i runtime esistenti');
});

test('la primitive aggiunge inert e focus senza sostituire open/close, poi ripristina tutto', () => {
  const { install } = require('../ui-foundation.js');
  const { document, app, opener, modal, close } = modalFixture();
  const alreadyInert = new FakeElement(document, 'aside', { attributes: { inert: '' } });
  document.body.append(alreadyInert);
  const controller = install(document, { MutationObserver: null });

  opener.focus();
  modal.setAttribute('aria-hidden', 'false');
  controller.sync();

  assert.equal(document.activeElement, close, 'il primo focus deve andare al close della superficie');
  assert.equal(app.hasAttribute('inert'), true, 'il contenuto dietro la superficie deve essere inert');

  modal.setAttribute('aria-hidden', 'true');
  controller.sync();

  assert.equal(app.hasAttribute('inert'), false, 'inert deve essere rimosso alla chiusura');
  assert.equal(alreadyInert.hasAttribute('inert'), true, 'un inert preesistente deve essere preservato');
  assert.equal(document.activeElement, opener, 'il focus deve tornare al controllo che ha aperto la superficie');
  controller.destroy();
});

test('la primitive trattiene Tab e Shift+Tab nella superficie attiva', () => {
  const { install } = require('../ui-foundation.js');
  const { document, modal, close, action } = modalFixture();
  const controller = install(document, { MutationObserver: null });
  modal.setAttribute('aria-hidden', 'false');
  controller.sync();

  action.focus();
  const forward = document.keydown({ shiftKey: false });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(document.activeElement, close);

  close.focus();
  const backward = document.keydown({ shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.equal(document.activeElement, action);
  controller.destroy();
});

test('chiudendo una superficie sovrapposta il focus torna al suo opener nello sheet sottostante', () => {
  const { install } = require('../ui-foundation.js');
  const { document, opener, modal: sheet, action: photo } = modalFixture();
  const lightbox = new FakeElement(document, 'div', { attributes: { 'data-us-modal': '', 'data-us-modal-panel': '', 'aria-hidden': 'true' } });
  const lightboxClose = new FakeElement(document, 'button', { focusable: true, attributes: { 'data-us-modal-close': '' } });
  lightbox.append(lightboxClose);
  document.body.append(lightbox);
  const controller = install(document, { MutationObserver: null });

  opener.focus();
  sheet.setAttribute('aria-hidden', 'false');
  controller.sync();
  photo.focus();
  lightbox.setAttribute('aria-hidden', 'false');
  controller.sync();
  assert.equal(document.activeElement, lightboxClose);

  lightbox.setAttribute('aria-hidden', 'true');
  controller.sync();
  assert.equal(document.activeElement, photo, 'il lightbox deve restituire il focus alla foto che lo ha aperto');

  sheet.setAttribute('aria-hidden', 'true');
  controller.sync();
  assert.equal(document.activeElement, opener, 'lo sheet deve conservare il proprio opener originale');
  controller.destroy();
});

test('un close nascosto viene ignorato a favore del primo controllo visibile', () => {
  const { install } = require('../ui-foundation.js');
  const { document, modal, close, action } = modalFixture();
  close.hidden = true;
  const controller = install(document, { MutationObserver: null });

  modal.setAttribute('aria-hidden', 'false');
  controller.sync();

  assert.equal(document.activeElement, action);
  controller.destroy();
});

test('se il focus viene perso mentre il modal è aperto, Tab lo riporta nella superficie', () => {
  const { install } = require('../ui-foundation.js');
  const { document, modal, close } = modalFixture();
  const controller = install(document, { MutationObserver: null });
  modal.setAttribute('aria-hidden', 'false');
  controller.sync();

  document.activeElement = document.body;
  const event = document.keydown({ shiftKey: false });

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, close);
  controller.destroy();
});

test('la bottom navigation espone una sola pagina corrente', () => {
  const { install } = require('../ui-foundation.js');
  const document = new FakeDocument();
  const nav = new FakeElement(document, 'nav', { classes: ['nav'] });
  const home = new FakeElement(document, 'button', { focusable: true, classes: ['active'] });
  const games = new FakeElement(document, 'button', { focusable: true, attributes: { 'aria-current': 'page' } });
  nav.append(home, games);
  document.body.append(nav);
  const controller = install(document, { MutationObserver: null });

  assert.equal(home.getAttribute('aria-current'), 'page');
  assert.equal(games.hasAttribute('aria-current'), false);

  home.classList.remove('active');
  games.classList.add('active');
  controller.sync();
  assert.equal(home.hasAttribute('aria-current'), false);
  assert.equal(games.getAttribute('aria-current'), 'page');
  controller.destroy();
});

test('la foundation centralizza reduced motion e segue i cambiamenti di preferenza live', () => {
  const foundation = require('../ui-foundation.js');
  const document = new FakeDocument();
  const media = createMotionMedia(false);
  const controller = foundation.install(document, {
    MutationObserver: null,
    matchMedia: (query) => {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return media;
    }
  });
  const changes = [];
  const unsubscribe = controller.onMotionPreferenceChange((reduced) => changes.push(reduced));

  assert.equal(controller.isReducedMotion(), false);
  assert.equal(document.documentElement.getAttribute('data-us-motion'), 'full');

  media.setMatches(true);
  assert.equal(controller.isReducedMotion(), true);
  assert.equal(document.documentElement.getAttribute('data-us-motion'), 'reduced');
  assert.deepEqual(changes, [true]);

  media.setMatches(false);
  assert.equal(controller.isReducedMotion(), false);
  assert.equal(document.documentElement.getAttribute('data-us-motion'), 'full');
  assert.deepEqual(changes, [true, false]);

  unsubscribe();
  controller.destroy();
  media.setMatches(true);
  assert.deepEqual(changes, [true, false]);
});

test('le superfici semplici adottano la primitive e Auth resta fuori', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const albums = fs.readFileSync(path.join(ROOT, 'moments-albums.js'), 'utf8');
  const stories = fs.readFileSync(path.join(ROOT, 'stories.js'), 'utf8');

  ['today', 'usEventsOverlay', 'usSettingsOverlay', 'momentViewer'].forEach((id) => {
    assert.match(html, new RegExp(`id=["']${id}["'][^>]*data-us-modal`));
  });
  assert.doesNotMatch(html, /id=["']authOverlay["'][^>]*data-us-modal/);
  assert.match(albums, /id="usAlbumOverlay"[^>]*data-us-modal/);
  assert.match(albums, /id="usAlbumLightbox"[^>]*data-us-modal/);
  assert.match(stories, /viewer\.setAttribute\('data-us-modal',''\)/);
  assert.match(stories, /camera\.setAttribute\('data-us-modal',''\)/);
  assert.match(stories, /confirmation\.setAttribute\('data-us-modal',''\)/);
});

test('il foglio fondazionale espone token conservativi e target comuni da 44px', () => {
  const css = fs.readFileSync(path.join(ROOT, 'ui-foundation.css'), 'utf8');
  assert.match(css, /--us-space-5:16px/);
  assert.match(css, /--us-radius-card:20px/);
  assert.match(css, /--us-radius-sheet:29px/);
  assert.match(css, /--us-shadow-card:0 10px 28px/);
  assert.match(css, /--us-motion-press:90ms/);
  assert.match(css, /--us-motion-micro:140ms/);
  assert.match(css, /--us-motion-fast:180ms/);
  assert.match(css, /--us-motion-base:220ms/);
  assert.match(css, /--us-motion-surface:260ms/);
  assert.match(css, /--us-motion-immersive:300ms/);
  assert.match(css, /--us-motion-photo:360ms/);
  assert.match(css, /--us-motion-photo-slow:420ms/);
  assert.match(css, /--us-ease-enter:cubic-bezier\(\.16,1,\.3,1\)/);
  assert.match(css, /--us-ease-exit:cubic-bezier\(\.4,0,1,1\)/);
  assert.match(css, /:where\(button:not\(:disabled\):not\(\[data-us-motion-tap="off"\]\)\):active\s*\{\s*transform:scale\(\.985\)/);
  assert.match(css, /:root\[data-us-motion="reduced"\]/);
  assert.match(css, /--us-text-meta:11px/);
  assert.match(css, /--us-text-secondary:12px/);
  assert.match(css, /\.us-modal-close[\s\S]*min-width:44px;[\s\S]*min-height:44px/);
});

test('i token motion legacy preservano le superfici rinviate alle milestone successive', () => {
  const foundation = fs.readFileSync(path.join(ROOT, 'ui-foundation.css'), 'utf8');
  const settings = fs.readFileSync(path.join(ROOT, 'settings.css'), 'utf8');
  const events = fs.readFileSync(path.join(ROOT, 'events.css'), 'utf8');
  const games = fs.readFileSync(path.join(ROOT, 'games.css'), 'utf8');

  assert.match(foundation, /--us-motion-legacy-fast:160ms/);
  assert.match(foundation, /--us-motion-legacy-base:200ms/);
  assert.match(settings, /var\(--us-motion-legacy-fast\)/);
  assert.match(settings, /var\(--us-motion-legacy-base\)/);
  assert.match(events, /var\(--us-motion-legacy-base\)/);
  assert.match(games, /var\(--us-motion-legacy-base\)/);
});
