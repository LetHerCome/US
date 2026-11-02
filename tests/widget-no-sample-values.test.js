// Sample values ("Bea", "Lisbona", "12 km", "78%", "195", "10 min fa") belong
// to the picker previews only. A widget on the Home screen shows what the
// snapshot says, or an honest empty state: never an example that reads as
// real (02/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RES = path.resolve(__dirname, '../native-plugins/us-widget-bridge/android/src/main/res');
const SAMPLES = /\bBea\b|Beatrice|Francesco|Lisbona|12 km|78\s*%|\b195\b|\b365\b|10 min fa|2 min fa|da 1 ora|da 20 min/;

test('no layout on the Home screen carries a sample value or a preview string', () => {
  const layouts = fs.readdirSync(path.join(RES, 'layout')).filter((f) => /^us_widget_/.test(f) && !/^us_widget_preview_/.test(f));
  assert.ok(layouts.length >= 15);
  const strings = fs.readFileSync(path.join(RES, 'values/strings.xml'), 'utf8');
  const value = (name) => (strings.match(new RegExp(`<string name="${name}"[^>]*>([^<]*)</string>`)) || [])[1] || '';
  for (const file of layouts) {
    const xml = fs.readFileSync(path.join(RES, 'layout', file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(xml, /@string\/us_widget_preview_/, `${file} uses a preview string`);
    assert.doesNotMatch(xml, SAMPLES, `${file} has a sample value`);
    for (const [, name] of xml.matchAll(/@string\/([a-z_]+)/g)) assert.doesNotMatch(value(name), SAMPLES, `${file}: @string/${name}`);
  }
});

test('the widgets\' initial layouts are the same ones, never a preview', () => {
  for (const file of fs.readdirSync(path.join(RES, 'xml')).filter((f) => /^us_widget_.*_info\.xml$/.test(f))) {
    const xml = fs.readFileSync(path.join(RES, 'xml', file), 'utf8');
    assert.doesNotMatch(xml, /android:initialLayout="@layout\/us_widget_preview_/, file);
  }
});
