import assert from 'node:assert/strict';
import fs from 'node:fs';

const en = fs.readFileSync('_site/index.html', 'utf8');
const es = fs.readFileSync('_site/es/index.html', 'utf8');
const edition = JSON.parse(fs.readFileSync('data/edition.json', 'utf8'));
const start = new Date(`${edition.weeklyBrief.start}T12:00:00Z`);
const through = new Date(`${edition.weeklyBrief.through}T12:00:00Z`);
const enMonth = start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' });
const esMonth = start.toLocaleDateString('es-MX', { timeZone: 'UTC', month: 'long' });
const year = start.getUTCFullYear();
for (const [html, range, label] of [
  [en, `${enMonth} ${start.getUTCDate()}–${through.getUTCDate()}, ${year}`, 'The week so far'],
  [es, `${start.getUTCDate()}–${through.getUTCDate()} de ${esMonth} de ${year}`, 'La semana hasta ahora'],
]) {
  assert.ok(html.includes(range), `missing readable weekly range: ${range}`);
  assert.ok(html.includes(label), `missing weekly label: ${label}`);
  assert.ok(!html.includes(`${edition.weeklyBrief.start} — ${edition.weeklyBrief.through}`), 'ISO range must not appear in the header');
}
assert.ok(en.includes(`<a class="edition-date" href="/editions/${edition.editorialDate}/">`));
assert.ok(es.includes(`<a class="edition-date" href="/es/editions/${edition.editorialDate}/">`));
assert.ok(!en.includes(`Prepared ${enMonth.slice(0, 3)} ${through.getUTCDate()}`), 'preview-only publication time must not crowd the weekly header');
console.log('weekly header: readable ranges and archive links pass');
