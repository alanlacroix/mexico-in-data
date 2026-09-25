import assert from 'node:assert/strict';
import fs from 'node:fs';
import lib from '../lib/public-edition.cjs';
import weekly from '../lib/weekly-brief.cjs';
import nunjucks from 'nunjucks';
const edition=JSON.parse(fs.readFileSync('docs/pilot/candidate-2026-09-24.json'));
assert.deepEqual(weekly.validateWeekly(edition.weeklyBrief,edition.editorialDate),[]);
assert.equal(lib.validateEdition(edition).ok,true);
for(const mutate of [w=>w.through='2026-09-25',w=>w.items[1].id=w.items[0].id,w=>w.items[0].sources[0].url='javascript:alert(1)',w=>delete w.items[0].es.context,w=>w.dates[0].date='2026-09-20',w=>w.items[1].es.now='Septiembre: 9.50%, unanimidad']){
 const w=structuredClone(edition.weeklyBrief);mutate(w);assert.ok(weekly.validateWeekly(w,edition.editorialDate).length);
}
const env=new nunjucks.Environment();env.addFilter('longDate',d=>d);
const template=fs.readFileSync('_includes/partials/weekly-brief.njk','utf8');
for(const locale of ['en','es']){const html=env.renderString(template,{weeklyBrief:edition.weeklyBrief,locale});assert.equal((html.match(/class="weekly-item"/g)||[]).length,3);assert.ok(!html.includes(`${edition.weeklyBrief.start} — ${edition.weeklyBrief.through}`),'the weekly heading must not repeat an ISO date range');assert.ok(!html.includes('class="editor-margin"'),'repetitive weekly margins stay hidden');assert.ok(html.indexOf('class="weekly-reading"')<html.indexOf('class="weekly-thread"'),'story context must precede the supporting comparison');for(const i of edition.weeklyBrief.items){assert.ok(html.includes(i[locale].headline));for(const s of i.sources)assert.ok(html.includes(s.url));}assert.ok(weekly.readingMinutes(edition.weeklyBrief,locale)<=5);}
const withSubstantiveMargin=structuredClone(edition.weeklyBrief);withSubstantiveMargin.items[0].showMargin=true;
assert.ok(env.renderString(template,{weeklyBrief:withSubstantiveMargin,locale:'en'}).includes('class="editor-margin"'),'editors can opt in a substantive margin note');
console.log('weekly brief: coverage, ranking, source safety, bilingual fidelity and rendering pass');
