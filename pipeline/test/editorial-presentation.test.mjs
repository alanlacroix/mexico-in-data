import assert from 'node:assert/strict';
import fs from 'node:fs';
import lib from '../lib/public-edition.cjs';
import daily from '../../_data/dailyBrief.js';
import nunjucks from 'nunjucks';
const template = fs.readFileSync(new URL('../../_includes/partials/brief-story.njk',import.meta.url),'utf8');
const candidate=JSON.parse(fs.readFileSync(new URL('../../docs/pilot/candidate-2026-09-24.json',import.meta.url)));
assert.equal(lib.validateEdition(candidate).ok,true);
for(const locale of ['en','es']){
 const stories=daily(new Date(candidate.generatedAt),{edition:candidate},locale).stories;
 for (const story of stories) {
  const html=nunjucks.renderString(template,{story,locale,loop:{index:1,first:true}});
  assert.equal((html.match(/class="source-index"/g)||[]).length,story.sources.length,'all evidence must render');
  const refs=[...html.matchAll(/href="#(source-[^"]+)"/g)].map(match=>match[1]);
  assert.equal(refs.length,story.editorial.timeline.reduce((sum,step)=>sum+step.sources.length,0)+story.editorial.marginSources.length);
  for(const ref of refs) assert.ok(html.includes(`id="${ref}"`),'every citation must resolve');
 }
 assert.equal(stories[0].editorial.timeline.length,3);
 assert.equal(stories[0].editorial.margin,candidate.stories[0].editorial.margin[locale]);
 assert.ok(stories[1].editorial.timeline.every(step=>step.sources.every(source=>source.url.startsWith('https://'))));
}
const bad=structuredClone(candidate);bad.stories[0].editorial.timeline[0].refs=['invented'];
assert.equal(lib.validateEdition(lib.withArtifactHash(bad)).ok,false);
const untranslated=structuredClone(candidate);delete untranslated.stories[0].editorial.margin.es;
assert.equal(lib.validateEdition(lib.withArtifactHash(untranslated)).ok,false);
console.log('editorial presentation: bilingual and source-bound');

const wrongNumber=structuredClone(candidate);
wrongNumber.stories[0].editorial.timeline[0].es.text='Se mantuvo en 9.50%';
assert.equal(lib.validateEdition(lib.withArtifactHash(wrongNumber)).ok,false, 'timeline translation cannot change the rate');
const reversedMargin=structuredClone(candidate);
reversedMargin.stories[0].editorial.margin.en='This does not establish a slowdown.';
reversedMargin.stories[0].editorial.margin.es='Esto demuestra una desaceleración.';
assert.equal(lib.validateEdition(lib.withArtifactHash(reversedMargin)).ok,false, 'margin translation cannot drop a negation');
