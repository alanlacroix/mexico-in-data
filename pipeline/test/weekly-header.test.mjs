import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import nunjucks from 'nunjucks';
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
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('_includes'), { autoescape: true });
for (const [name, fn] of Object.entries(filters)) env.addFilter(name, fn);
const templates = Object.fromEntries(['index', 'edition'].map(name => [name, fs.readFileSync(`${name}.njk`, 'utf8').replace(/^---[\s\S]*?---\s*/, '')]));
const edition = JSON.parse(fs.readFileSync('data/edition.json', 'utf8'));
function render(name, locale, type, date = edition.editorialDate, weekly = true) {
  const e = { ...edition, editionType: type, editorialDate: date, weeklyBrief: weekly ? edition.weeklyBrief : null };
  const feed = { date, editionType: type, artifactHash: e.artifactHash, updated: e.generatedAt, weeklyBrief: e.weeklyBrief, weeklyStories: e.stories, stories: [] };
  return env.renderString(templates[name], { locale, feed, feedEs: feed, archiveEditions: [], archived: { locale, edition: e, stories: [], minutes: 5 } });
}
for (const locale of ['en', 'es']) {
  for (const name of ['index', 'edition']) {
    for (const weekly of [true, false]) {
      const html = render(name, locale, 'daily', edition.editorialDate, weekly);
      assert.ok(html.includes(locale === 'es' ? 'Hoy en México' : 'Today in Mexico'));
      assert.ok(html.includes(name === 'index' ? (locale === 'es' ? 'De tres a cinco noticias' : 'Three to five important stories') : (locale === 'es' ? 'Las noticias de esta edición' : 'The stories in this edition')));
      assert.ok(html.includes(filters.longDate(edition.editorialDate, locale)));
      assert.ok(!html.includes(locale === 'es' ? 'La semana hasta ahora' : 'The week so far'));
      if (weekly) for (const story of edition.stories) {
        for (const field of ['headline', 'dek', 'background', 'view']) {
          assert.ok(html.includes(env.renderString('{{ text }}', { text: story[locale][field] })), `lost ${locale} ${field}`);
        }
      }
    }
    const recap = render(name, locale, 'weekend-recap');
    assert.ok(recap.includes(locale === 'es' ? 'Esta semana en México' : 'This week in Mexico'));
    assert.ok(!recap.includes(locale === 'es' ? 'Hoy en México' : 'Today in Mexico'));
    assert.ok(recap.includes(env.renderString('{{ text }}', { text: edition.weeklyBrief[locale].overview })));
    if (name === 'index') assert.ok(recap.includes(filters.weekRange(edition.weeklyBrief.start, edition.weeklyBrief.through, locale)));
  }
}
function hiddenAt(now, date, type = 'daily') {
  const html = render('index', 'en', type, date);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const alert = { hidden: true };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).getTime(); } }
  vm.runInNewContext(script, { Date: Clock, Intl, document: { querySelector: () => ({ getAttribute: () => edition.generatedAt }), getElementById: () => alert } });
  return alert.hidden;
}
// The reader deadline is 07:00 Mexico City every day, including Saturday/Sunday.
for (const [day, prior] of [['2026-10-09', '2026-10-08'], ['2026-10-10', '2026-10-09'], ['2026-10-11', '2026-10-10'], ['2026-10-12', '2026-10-11']]) {
  assert.equal(hiddenAt(`${day}T12:59:59Z`, prior), true);
  assert.equal(hiddenAt(`${day}T13:00:00Z`, prior), false);
  assert.equal(hiddenAt(`${day}T13:00:00Z`, day), true);
  assert.equal(hiddenAt(`${day}T06:00:00Z`, prior), true, 'midnight retains yesterday');
}
assert.equal(hiddenAt('2026-10-09T05:59:59Z', '2026-10-08'), true);
for (const date of ['invalid', '2026-02-30', '2026-10-10']) assert.equal(hiddenAt('2026-10-09T13:00:00Z', date), false, `invalid/future date ${date}`);
const through = new Date(`${edition.weeklyBrief.through}T23:59:59-06:00`);
assert.equal(hiddenAt(new Date(+through + 86400000).toISOString(), edition.editorialDate, 'weekend-recap'), true);
assert.equal(hiddenAt(new Date(+through + 7 * 86400000).toISOString(), edition.editorialDate, 'weekend-recap'), false);
for (const locale of ['en', 'es']) {
  const html = fs.readFileSync(locale === 'es' ? '_site/es/index.html' : '_site/index.html', 'utf8');
  assert.ok(html.includes(edition.editionType === 'daily' ? (locale === 'es' ? 'Hoy en México' : 'Today in Mexico') : (locale === 'es' ? 'Esta semana en México' : 'This week in Mexico')));
  assert.ok(html.includes(`<a class="edition-date" href="${locale === 'es' ? '/es' : ''}/editions/${edition.editorialDate}/">`));
}
console.log('edition headers: daily/recap EN/ES templates, exact dates, preserved copy and daily deadline boundaries pass');
