import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const filters = {};
require('../../.eleventy.js')({
  setNunjucksEnvironmentOptions() {}, addPassthroughCopy() {}, addGlobalData() {},
  addFilter(name, fn) { filters[name] = fn; },
});
for (const [start, end, enExpected, esExpected] of [
  ['2026-09-28', '2026-09-30', 'September 28–30, 2026', '28–30 de septiembre de 2026'],
  ['2026-09-28', '2026-10-01', 'Sep 28–Oct 1, 2026', '28 de septiembre–1 de octubre de 2026'],
  ['2026-12-28', '2027-01-01', 'Dec 28–Jan 1, 2027', '28 de diciembre–1 de enero de 2027'],
]) {
  assert.equal(filters.weekRange(start, end, 'en'), enExpected);
  assert.equal(filters.weekRange(start, end, 'es'), esExpected);
}

const en = fs.readFileSync('_site/index.html', 'utf8');
const es = fs.readFileSync('_site/es/index.html', 'utf8');
const edition = JSON.parse(fs.readFileSync('data/edition.json', 'utf8'));
const start = new Date(`${edition.weeklyBrief.start}T12:00:00Z`);
const through = new Date(`${edition.weeklyBrief.through}T12:00:00Z`);
const enMonth = start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' });
for (const [html, range, label] of [
  [en, filters.weekRange(edition.weeklyBrief.start, edition.weeklyBrief.through, 'en'), 'The week so far'],
  [es, filters.weekRange(edition.weeklyBrief.start, edition.weeklyBrief.through, 'es'), 'La semana hasta ahora'],
]) {
  assert.ok(html.includes(range), `missing readable weekly range: ${range}`);
  assert.ok(html.includes(label), `missing weekly label: ${label}`);
  assert.ok(!html.includes(`${edition.weeklyBrief.start} — ${edition.weeklyBrief.through}`), 'ISO range must not appear in the header');
}
assert.ok(en.includes(`<a class="edition-date" href="/editions/${edition.editorialDate}/">`));
assert.ok(es.includes(`<a class="edition-date" href="/es/editions/${edition.editorialDate}/">`));
assert.ok(!en.includes(`Prepared ${enMonth.slice(0, 3)} ${through.getUTCDate()}`), 'preview-only publication time must not crowd the weekly header');
console.log('weekly header: readable ranges and archive links pass');
