/* US 1.0 languages: Italian (the source) and English.
   Italian stays the language the app is written in. In English, every text
   the app shows is looked up in the English dictionary (i18n-en.js) by its
   Italian wording: once for the page as it is parsed, then for every node,
   text or label the app adds or changes later. What people write (names,
   captions, messages, notes) lives under translate="no" and is never touched.
   Loaded in <head> before the body, so nothing paints in the wrong language.
   Choice: ?us-lang=en|it (kept on this device), then the saved choice, then
   the phone's language (Italian phones get Italian, every other one English). */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.UsI18n = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const STORE_KEY = 'us:lang:v1';
  const SUPPORTED = ['it', 'en'];
  const TAGS = Object.freeze({ it: 'it-IT', en: 'en-US' });
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE', 'svg', 'SVG']);
  const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/gi;
  const HAS_PLACEHOLDER = /\{[a-z][a-z0-9_]*\}/i;
  const dictionaries = new Map();

  const collapse = (text) => String(text).replace(/\s+/g, ' ').trim();
  const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // "Lasciato per {name} ♡" -> /^Lasciato per (.+?) ♡$/ with names ['name'].
  function compilePattern(source) {
    const names = [];
    let at = 0;
    let re = '';
    source.replace(PLACEHOLDER, (match, name, offset) => {
      re += escapeRe(source.slice(at, offset)) + '(.+?)';
      names.push(name);
      at = offset + match.length;
      return match;
    });
    re += escapeRe(source.slice(at));
    return { re: new RegExp(`^${re}$`), names };
  }

  // A dictionary is { 'Italian text': 'English text' }. Keys with {name}
  // placeholders are patterns: the same names must appear in the value.
  function compile(entries) {
    const exact = new Map();
    const patterns = [];
    for (const [it, out] of Object.entries(entries || {})) {
      const key = collapse(it);
      if (!key || typeof out !== 'string') continue;
      if (HAS_PLACEHOLDER.test(key)) patterns.push({ ...compilePattern(key), out, literal: key.replace(PLACEHOLDER, '').length });
      else exact.set(key, out);
    }
    // The most specific pattern (most fixed text) wins.
    patterns.sort((a, b) => b.literal - a.literal);
    return { exact, patterns };
  }

  function lookup(dict, text) {
    const raw = String(text ?? '');
    const key = collapse(raw);
    if (!key || !/[A-Za-zÀ-ÿ]/.test(key)) return null;
    let out = dict.exact.get(key);
    if (out === undefined) {
      for (const pattern of dict.patterns) {
        const match = pattern.re.exec(key);
        if (!match) continue;
        const values = {};
        pattern.names.forEach((name, index) => {
          const value = match[index + 1];
          values[name] = dict.exact.get(value) ?? value;
        });
        out = pattern.out.replace(PLACEHOLDER, (all, name) => (name in values ? values[name] : all));
        break;
      }
    }
    if (out === undefined || out === key) return null;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    return lead + out + trail;
  }

  function fill(text, vars) {
    if (!vars) return text;
    return String(text).replace(PLACEHOLDER, (all, name) => (vars[name] ?? all));
  }

  function chooseLocale(win) {
    let saved = null;
    try {
      const asked = new URL(win.location.href).searchParams.get('us-lang');
      if (SUPPORTED.includes(asked)) win.localStorage?.setItem(STORE_KEY, asked);
      saved = win.localStorage?.getItem(STORE_KEY);
    } catch (_) { /* storage blocked: fall back to the phone */ }
    if (SUPPORTED.includes(saved)) return saved;
    const first = (win.navigator?.languages?.[0] || win.navigator?.language || 'it').toLowerCase();
    return first.startsWith('it') ? 'it' : 'en';
  }

  const locale = w ? chooseLocale(w) : 'it';
  let active = null;
  let observer = null;
  const written = new WeakMap();

  function blocked(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return true;
    if (SKIP.has(el.tagName)) return true;
    return Boolean(el.closest('[translate="no"],[contenteditable="true"],script,style,textarea,svg'));
  }

  function translateTextNode(node) {
    if (!active || written.get(node) === node.data || blocked(node)) return;
    const out = lookup(active, node.data);
    if (out === null) return;
    written.set(node, out);
    node.data = out;
  }

  function translateAttributes(el) {
    if (!active || el.nodeType !== 1 || blocked(el)) return;
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (!value) continue;
      const out = lookup(active, value);
      if (out !== null) el.setAttribute(name, out);
    }
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) {
      const out = lookup(active, el.value);
      if (out !== null) el.value = out;
    }
  }

  function translateTree(rootNode) {
    if (!active || !rootNode) return;
    if (rootNode.nodeType === 3) { translateTextNode(rootNode); return; }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) {
      if (blocked(rootNode)) return;
      translateAttributes(rootNode);
    }
    const doc = rootNode.ownerDocument || rootNode;
    const walker = doc.createTreeWalker(rootNode, 1 | 4, {
      acceptNode(node) {
        if (node.nodeType === 1) return SKIP.has(node.tagName) || node.getAttribute('translate') === 'no' || node.getAttribute('contenteditable') === 'true' ? 2 : 1;
        return 1;
      }
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 3) translateTextNode(node);
      else translateAttributes(node);
    }
  }

  function onMutations(records) {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(translateTree);
      else if (record.type === 'characterData') translateTextNode(record.target);
      else if (record.type === 'attributes') translateAttributes(record.target);
    }
  }

  function start(win) {
    if (!active || observer || !win?.MutationObserver) return;
    const doc = win.document;
    observer = new win.MutationObserver(onMutations);
    observer.observe(doc, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'value'] });
    translateTree(doc);
    // Native dialogs and the tab title are not DOM text the observer sees.
    for (const name of ['alert', 'confirm', 'prompt']) {
      const original = win[name];
      if (typeof original !== 'function') continue;
      win[name] = function usTranslatedDialog(message, ...rest) {
        return original.call(this, t(message), ...rest);
      };
    }
  }

  // Only the language in use is compiled; Italian needs no dictionary.
  function register(lang, entries) {
    dictionaries.set(lang, entries);
    if (lang !== locale || locale === 'it' || active) return false;
    active = compile(entries);
    if (w?.document) {
      w.document.documentElement.lang = lang;
      start(w);
    }
    return true;
  }

  // Settings: keep the choice on this device and start again in that language.
  function choose(lang) {
    if (!SUPPORTED.includes(lang) || !w) return false;
    try { w.localStorage?.setItem(STORE_KEY, lang); } catch (_) { return false; }
    if (lang !== locale) w.location.reload();
    return true;
  }

  // For text that never reaches the DOM (share sheets, canvases, dialogs):
  // t('Lasciato per {name}', { name }) returns it in the current language.
  function t(text, vars) {
    const source = String(text ?? '');
    return fill((active && lookup(active, source)) || source, vars);
  }

  if (w) w.usT = t;

  return Object.freeze({
    locale,
    tag: TAGS[locale],
    supported: SUPPORTED.slice(),
    STORE_KEY,
    t,
    register,
    choose,
    translateTree,
    // Pure helpers, used by tests and the dictionary checker.
    compile,
    lookup,
    chooseLocale
  });
});
