import assert from 'node:assert/strict';
import fs from 'node:fs';

const en = fs.readFileSync('_site/index.html', 'utf8');
const es = fs.readFileSync('_site/es/index.html', 'utf8');
for (const [html, range, label] of [
  [en, 'September 21–24, 2026', 'The week so far'],
  [es, '21–24 de septiembre de 2026', 'La semana hasta ahora'],
]) {
  assert.ok(html.includes(range), `missing readable weekly range: ${range}`);
  assert.ok(html.includes(label), `missing weekly label: ${label}`);
  assert.ok(!html.includes('2026-09-21 — 2026-09-24'), 'ISO range must not appear in the header');
}
assert.match(en, /<a class="edition-date" href="\/editions\/2026-09-24\/">/);
assert.match(es, /<a class="edition-date" href="\/es\/editions\/2026-09-24\/">/);
assert.ok(!en.includes('Prepared Sep 24'), 'preview-only publication time must not crowd the weekly header');
console.log('weekly header: readable ranges and archive links pass');
