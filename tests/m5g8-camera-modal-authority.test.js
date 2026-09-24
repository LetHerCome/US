const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M5G8 camera surface is registered in the existing modal foundation', () => {
  const html = read('index.html');
  assert.match(html, /id="leftForYouCameraOverlay"[^>]*data-us-modal[^>]*data-us-motion-surface/);
  assert.match(html, /class="left-for-you-sheet left-for-you-camera-sheet"[^>]*data-us-modal-panel/);
  assert.match(html, /id="leftForYouCameraClose"[^>]*data-us-modal-close/);
});

class Node {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
    this.disabled = false;
    this.inert = false;
    this.focusable = false;
    this.classList = { contains: () => false };
  }
  append(...children) { children.forEach((child) => { child.parentElement = this; child.ownerDocument = this.ownerDocument; this.children.push(child); }); }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value = '') { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  matches(selector) {
    if (selector === '[data-us-modal]') return this.hasAttribute('data-us-modal');
    if (selector === '[data-us-modal-panel]') return this.hasAttribute('data-us-modal-panel');
    if (selector === '[data-us-modal-close]') return this.hasAttribute('data-us-modal-close');
    if (selector.includes('button')) return this.focusable;
    return false;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => node.children.forEach((child) => { if (child.matches(selector)) found.push(child); visit(child); });
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getClientRects() { return [1]; }
  focus() {
    let root = this;
    while (root.parentElement) root = root.parentElement;
    root.ownerDocument.activeElement = this;
  }
}

function modalFoundationFixture() {
  const document = {
    activeElement: null,
    documentElement: new Node(),
    body: new Node(),
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    addEventListener() {},
    removeEventListener() {},
  };
  document.body.ownerDocument = document;
  document.documentElement.ownerDocument = document;
  document.body.ownerDocument = document;
  document.documentElement.ownerDocument = document;
  const composer = new Node({ 'data-us-modal': '', 'aria-hidden': 'false' });
  const composerPanel = new Node({ 'data-us-modal-panel': '' });
  const composerClose = new Node({ 'data-us-modal-close': '' }); composerClose.focusable = true;
  composerPanel.append(composerClose); composer.append(composerPanel);
  const camera = new Node({ 'data-us-modal': '', 'data-us-motion-surface': '', 'aria-hidden': 'true' });
  const cameraPanel = new Node({ 'data-us-modal-panel': '' });
  const cameraClose = new Node({ 'data-us-modal-close': '' }); cameraClose.focusable = true;
  const capture = new Node(); capture.focusable = true;
  cameraPanel.append(cameraClose, capture); camera.append(cameraPanel);
  document.body.append(composer, camera);
  return { document, composer, camera };
}

test('M5G8 modal foundation makes camera active and composer inert, then restores composer', () => {
  const { install } = require('../ui-foundation.js');
  const fixture = modalFoundationFixture();
  const controller = install(fixture.document, { MutationObserver: null });
  controller.sync();
  fixture.camera.setAttribute('aria-hidden', 'false');
  controller.sync();
  assert.equal(fixture.camera.hasAttribute('inert'), false);
  assert.equal(fixture.composer.hasAttribute('inert'), true);
  fixture.camera.setAttribute('aria-hidden', 'true');
  controller.sync();
  assert.equal(fixture.composer.hasAttribute('inert'), false);
  controller.destroy();
});
