import assert from 'node:assert/strict';
import fs from 'node:fs';
import lib from '../lib/public-edition.cjs';
import daily from '../../_data/dailyBrief.js';
const candidate=JSON.parse(fs.readFileSync(new URL('../../docs/pilot/candidate-2026-09-24.json',import.meta.url)));
assert.equal(lib.validateEdition(candidate).ok,true);
for(const locale of ['en','es']){
 const stories=daily(new Date(candidate.generatedAt),{edition:candidate},locale).stories;
 assert.equal(stories[0].editorial.timeline.length,3);
 assert.equal(stories[0].editorial.margin,candidate.stories[0].editorial.margin[locale]);
 assert.ok(stories[1].editorial.timeline.every(step=>step.sources.every(source=>source.url.startsWith('https://'))));
}
const bad=structuredClone(candidate);bad.stories[0].editorial.timeline[0].refs=['invented'];
assert.equal(lib.validateEdition(lib.withArtifactHash(bad)).ok,false);
const untranslated=structuredClone(candidate);delete untranslated.stories[0].editorial.margin.es;
assert.equal(lib.validateEdition(lib.withArtifactHash(untranslated)).ok,false);
console.log('editorial presentation: bilingual and source-bound');
