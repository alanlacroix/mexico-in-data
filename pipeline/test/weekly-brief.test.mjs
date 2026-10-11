import assert from 'node:assert/strict';
import fs from 'node:fs';
import lib from '../lib/public-edition.cjs';
import weekly from '../lib/weekly-brief.cjs';
import nunjucks from 'nunjucks';
import reading from '../lib/weekly-reading.cjs';
const edition=JSON.parse(fs.readFileSync('docs/pilot/candidate-2026-09-24.json'));
assert.deepEqual(weekly.validateWeekly(edition.weeklyBrief,edition.editorialDate),[]);
assert.equal(lib.validateEdition(edition).ok,true);
for(const mutate of [w=>w.through='2026-09-25',w=>w.items[1].id=w.items[0].id,w=>w.items[0].sources[0].url='javascript:alert(1)',w=>delete w.items[0].es.context,w=>w.dates[0].date='2026-09-20',w=>w.items[1].es.now='Septiembre: 9.50%, unanimidad']){
 const w=structuredClone(edition.weeklyBrief);mutate(w);assert.ok(weekly.validateWeekly(w,edition.editorialDate).length);
}
const env=new nunjucks.Environment();env.addFilter('longDate',d=>d);
env.addFilter('weeklyReading', reading.weeklyReading);
env.addFilter('uniqueSourceLinks', reading.uniqueSourceLinks);
const template=fs.readFileSync('_includes/partials/weekly-brief.njk','utf8');
for(const locale of ['en','es']){const html=env.renderString(template,{weeklyBrief:edition.weeklyBrief,locale});assert.equal((html.match(/class="weekly-item"/g)||[]).length,3);assert.ok(!html.includes(`${edition.weeklyBrief.start} — ${edition.weeklyBrief.through}`),'the weekly heading must not repeat an ISO date range');assert.ok(!html.includes('class="editor-margin"'),'repetitive weekly margins stay hidden');assert.ok(html.indexOf('class="weekly-reading"')<html.indexOf('class="weekly-thread"'),'story context must precede the supporting comparison');assert.ok(html.includes(locale==='es'?'Contexto':'Context'),'the explanatory paragraph must be labeled');for(const i of edition.weeklyBrief.items){assert.ok(html.includes(i[locale].headline));for(const s of i.sources)assert.ok(html.includes(s.url));}assert.ok(weekly.readingMinutes(edition.weeklyBrief,locale)<=5);}
const withSubstantiveMargin=structuredClone(edition.weeklyBrief);withSubstantiveMargin.items[0].showMargin=true;
assert.ok(env.renderString(template,{weeklyBrief:withSubstantiveMargin,locale:'en'}).includes('class="editor-margin"'),'editors can opt in a substantive margin note');
console.log('weekly brief: coverage, ranking, source safety, bilingual fidelity and rendering pass');

// Generated current and archived stories keep their exact copy in distinct blocks.
const current = JSON.parse(fs.readFileSync('data/edition.json'));
const escaped = text => env.renderString('{{ text }}', { text });
for (const locale of ['en', 'es']) {
 const html = env.renderString(template, { weeklyBrief: current.weeklyBrief, weeklyStories: current.stories, locale });
 for (const item of current.weeklyBrief.items) {
  const story = current.stories.find(s => s.id === item.id);
  const result = reading.weeklyReading(item, current.stories, locale);
  assert.deepEqual(result, { background: story[locale].background, view: story[locale].view });
  assert.ok(html.includes(`<p>${escaped(story[locale].background)}</p>`));
  assert.ok(html.includes(`<p>${escaped(story[locale].view)}</p>`));
  assert.ok(html.indexOf(escaped(story[locale].background)) < html.indexOf(escaped(story[locale].view)));
  assert.ok(!html.includes(`<p>${escaped(item[locale].context)}</p>`), 'do not concatenate explanation and analysis');
 }
 assert.equal((html.match(new RegExp(`<h3>${locale === 'es' ? 'Por qué importa' : 'Why it matters'}</h3>`, 'g')) || []).length, current.stories.length);
 const item = current.weeklyBrief.items[0];
 assert.equal(reading.weeklyReading(item, [], locale), null);
 assert.equal(reading.weeklyReading(item, [...current.stories, current.stories[0]], locale), null);
 for (const key of ['context', 'reason']) {
  const legacy = structuredClone(item); legacy[locale][key] = 'Independently authored historical explanation.';
  assert.equal(reading.weeklyReading(legacy, current.stories, locale), null);
 }
 const legacy = structuredClone(current.weeklyBrief);
 legacy.items[0][locale].context = 'Preserve this separately authored historical context.';
 const legacyHtml = env.renderString(template, { weeklyBrief: legacy, weeklyStories: current.stories, locale });
 assert.ok(legacyHtml.includes('<p>Preserve this separately authored historical context.</p>'));
 const daily = env.renderString(fs.readFileSync('_includes/partials/brief-story.njk', 'utf8'), {
  locale, loop: { index: 1, first: true }, story: { id: 'example', title: 'Title', dek: 'Summary', bg: 'Background.', view: 'Analysis.', watch: 'Next step.', sources: [] },
 });
 assert.ok(daily.indexOf('Background.') < daily.indexOf('Analysis.'));
 assert.ok(daily.includes(locale === 'es' ? 'Por qué importa' : 'Why it matters'));
 assert.ok(daily.includes('Next step.'));
}
console.log('weekly reading: separate ordered blocks and untouched legacy explanations pass');

const repeatedLinks = [{ source: 'First', url: 'https://example.com/report?edition=1' },
 { source: 'Same document, second evidence section', url: 'https://example.com/report?edition=1' },
 { source: 'Different edition', url: 'https://example.com/report?edition=2' },
 { source: 'Specific page', url: 'https://example.com/report?edition=1#page=2' }];
const unchangedLinks = JSON.stringify(repeatedLinks);
assert.deepEqual(reading.uniqueSourceLinks(repeatedLinks), [repeatedLinks[0], repeatedLinks[2], repeatedLinks[3]]);
assert.equal(JSON.stringify(repeatedLinks), unchangedLinks, 'display filtering never mutates evidence');
for (const locale of ['en', 'es']) {
 const repeated = structuredClone(edition.weeklyBrief); repeated.items[0].sources = repeatedLinks;
 const html = env.renderString(template, { weeklyBrief: repeated, locale });
 assert.equal(html.split('href="https://example.com/report?edition=1"').length - 1, 1);
 assert.ok(html.includes('href="https://example.com/report?edition=2"'));
 assert.ok(html.includes('href="https://example.com/report?edition=1#page=2"'));
}
console.log('weekly source links: exact duplicate display removed without changing evidence or distinct URLs');

// Capacity applies to prior history only after preserving current story mirrors.
const { buildWeekStories } = await import('../build-edition.mjs');
const historyStory = (id, publishedAt, overrides = {}) => ({
 id, date: publishedAt.slice(0, 10), section: 'economy', source: 'Official source',
 url: `https://example.com/${id}`, publishedAt,
 en: { headline: `English ${id}`, dek: `English summary ${id}` },
 es: { headline: `Español ${id}`, dek: `Resumen ${id}` }, ...overrides,
});
const historyRows = Array.from({ length: 21 }, (_, i) => historyStory(`prior-${i}`, `2026-10-10T${String(i).padStart(2, '0')}:00:00Z`));
const olderSelected = historyStory('selected-old', '2026-10-06T12:00:00Z');
const inputs = { weekStories: [...historyRows].reverse() };
const inputsBefore = JSON.stringify(inputs);
const selectedBefore = JSON.stringify(olderSelected);
let retained = buildWeekStories(inputs, [olderSelected], '2026-10-11');
assert.equal(retained.length, 21);
assert.deepEqual(retained.at(-1), olderSelected);
assert.ok(!retained.some(row => row.id === 'prior-0'));
assert.equal(JSON.stringify(inputs), inputsBefore);
assert.equal(JSON.stringify(olderSelected), selectedBefore);
const otherSelected = historyStory('selected-other', '2026-10-05T12:00:00Z');
retained = buildWeekStories({ weekStories: [...historyRows.slice(10), ...historyRows.slice(0, 10), historyRows[20]] }, [olderSelected, otherSelected], '2026-10-11');
assert.equal(retained.length, 21);
assert.ok(retained.some(row => row.id === olderSelected.id));
assert.ok(retained.some(row => row.id === otherSelected.id));
assert.ok(!retained.some(row => ['prior-0', 'prior-1'].includes(row.id)));
assert.deepEqual(retained.map(row => row.publishedAt), retained.map(row => row.publishedAt).sort().reverse());
const oldCopy = { ...olderSelected, publishedAt: '2026-10-10T23:00:00Z', en: { headline: 'Old', dek: 'Old copy' } };
const sameUrl = historyStory('different-id', '2026-10-10T22:00:00Z', { url: olderSelected.url });
const firstDuplicate = historyStory('first-copy', '2026-10-07T10:00:00Z');
retained = buildWeekStories({ weekStories: [oldCopy, sameUrl, firstDuplicate, { ...firstDuplicate, publishedAt: '2026-10-10T23:00:00Z' }, ...historyRows] }, [olderSelected, olderSelected], '2026-10-11');
assert.equal(retained.filter(row => row.id === olderSelected.id).length, 1);
assert.deepEqual(retained.find(row => row.id === olderSelected.id), olderSelected);
assert.ok(!retained.some(row => row.id === 'different-id'));
const duplicateResult = buildWeekStories({ weekStories: [firstDuplicate, { ...firstDuplicate, publishedAt: '2026-10-10T23:00:00Z' }] }, [], '2026-10-11');
assert.deepEqual(duplicateResult, [firstDuplicate], 'first-seen historical duplicate remains authoritative');
const sunday = historyStory('sunday', '2026-10-11T09:00:00Z');
const monday = historyStory('monday', '2026-10-12T09:00:00Z');
const future = historyStory('future', '2026-10-13T09:00:00Z');
assert.deepEqual(buildWeekStories({ weekStories: [olderSelected, sunday, future] }, [sunday, monday], '2026-10-12'), [monday, sunday]);
const recent = historyStory('recent', '2026-10-11T09:00:00Z');
assert.deepEqual(buildWeekStories({ weekStories: historyRows }, [recent], '2026-10-11'), [recent, ...historyRows.slice(1).reverse()]);
assert.throws(() => buildWeekStories(null, Array.from({ length: 22 }, (_, i) => historyStory(`overflow-${i}`, '2026-10-11T09:00:00Z')), '2026-10-11'), /exceed weekly history capacity/);
console.log('weekly history: current mirrors, bounded capacity, first-seen dedupe, chronology and date boundaries pass');
