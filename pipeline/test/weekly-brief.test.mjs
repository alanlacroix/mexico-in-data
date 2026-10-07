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
