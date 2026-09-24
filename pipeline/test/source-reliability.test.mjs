import assert from 'node:assert/strict';
import registry from '../news-sources.json' with { type: 'json' };
import {
  editorialSourceTier, eventCandidateEligible, normalizeSourceTier, registeredSourceFor,
} from '../lib/news-trust.js';

assert.equal(normalizeSourceTier('1'), 1);
assert.equal(normalizeSourceTier('2'), 2);
assert.equal(normalizeSourceTier(1), 1);
assert.equal(normalizeSourceTier('specialist'), 'specialist');
assert.equal(editorialSourceTier('2'), true, 'legacy string-number tiers remain eligible');
assert.equal(editorialSourceTier('aggregator'), false, 'aggregation is discovery-only');
assert.equal(editorialSourceTier('unknown'), false, 'unknown metadata never becomes eligible');

const direct = registeredSourceFor({
  sourceId: 'el-economista', sourceName: 'El Economista', url: 'https://www.eleconomista.com.mx/mercados/x',
}, registry.sources);
assert.equal(direct?.id, 'el-economista');
const legacyDirect = registeredSourceFor({
  sourceName: 'El Economista', url: 'https://www.eleconomista.com.mx/mercados/x',
}, registry.sources);
assert.equal(legacyDirect?.id, 'el-economista', 'legacy direct articles resolve by configured publisher host');
const legacyAggregator = registeredSourceFor({
  sourceName: 'El Economista', url: 'https://news.google.com/rss/articles/x',
}, registry.sources);
assert.equal(legacyAggregator?.id, 'gnews-eleconomista', 'duplicate publisher names do not collapse to the direct feed');
assert.equal(eventCandidateEligible({
  sourceId: 'el-economista', sourceName: 'El Economista', url: 'https://www.eleconomista.com.mx/opinion/x',
}, registry.sources), false, 'stable IDs do not weaken the opinion exclusion');

console.log('source reliability: ok');
