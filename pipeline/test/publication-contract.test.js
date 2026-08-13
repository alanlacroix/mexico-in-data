import assert from 'node:assert/strict';
import {
  isSafeHttpUrl, validateNarrativeText,
  validateSeriesDocument, validateHealthDocument,
} from '../lib/publication-contract.js';
import { observationPeriodEnd, freshnessStatus, stalenessFlag } from '../lib/freshness.js';

const NOW = new Date('2026-07-13T12:00:00Z');
const baseSeries = () => ({
  meta: {
    id: 'example', title: 'Example', metric: 'test', source: 'Official source',
    sourceUrl: 'https://example.gob.mx/data', license: 'Open', units: '%',
    cadence: 'monthly', track: 'pulse', kind: 'series', vintage: '2026-05-01',
    fetchedAt: '2026-07-13T11:00:00Z', rowCount: 2, flags: [],
  },
  data: [{ date: '2026-04-01', value: 1 }, { date: '2026-05-01', value: 2 }],
});

assert.equal(validateSeriesDocument(baseSeries(), 'example', NOW).length, 0);
{
  const bad = baseSeries(); bad.data[1].date = '2026-04-01';
  assert(validateSeriesDocument(bad, 'example', NOW).some((error) => /duplicate|strictly increasing/.test(error)));
}
{
  const bad = baseSeries(); bad.meta.rowCount = 99;
  assert(validateSeriesDocument(bad, 'example', NOW).some((error) => /rowCount/.test(error)));
}
{
  const bad = baseSeries(); bad.meta.sourceUrl = 'https://example.gob.mx/data?token=secret';
  assert(validateSeriesDocument(bad, 'example', NOW).some((error) => /secret/.test(error)));
}

assert.equal(observationPeriodEnd('2025', 'annual').toISOString().slice(0, 10), '2025-12-31');
assert.equal(observationPeriodEnd('2026-04-01', 'monthly').toISOString().slice(0, 10), '2026-04-30');
assert.equal(observationPeriodEnd('2026-01-01', 'quarterly').toISOString().slice(0, 10), '2026-03-31');
assert.equal(freshnessStatus({ cadence: 'annual' }, '2025', NOW).stale, false);
assert.equal(freshnessStatus({ cadence: '~5-yearly' }, '2020', NOW).key, 'multi-year');
assert.equal(stalenessFlag({ cadence: 'quarterly' }, '2024-10', NOW)?.startsWith('stale_quarter_'), true);
assert.equal(stalenessFlag({ cadence: 'monthly' }, '2026-04-01', NOW), null);

{
  const doc = baseSeries();
  const health = { generatedAt: NOW.toISOString(), summary: { ok: 1, flagged: 0, failed: 0, skipped: 0, darkSources: [] }, sources: [
    { id: 'example', status: 'ok', flags: [], vintage: doc.meta.vintage },
  ] };
  assert.equal(validateHealthDocument(health, new Map([['example', doc]])).length, 0);
  health.summary.ok = 2;
  assert(validateHealthDocument(health, new Map([['example', doc]])).some((error) => /summary.ok/.test(error)));
}

assert(validateNarrativeText('&lt;img src=x onerror=alert(1)&gt;').some((error) => /markup/.test(error)));
assert(validateNarrativeText('&amp;lt;img src=x onerror=alert(1)&amp;gt;').some((error) => /markup/.test(error)));
assert(validateNarrativeText('Normal source name').length === 0);
assert(validateNarrativeText('Line%0Abreak').some((error) => /control/.test(error)));
assert(validateNarrativeText("Moody's affirmed the state power utility Mexico's state power company.")
  .some((error) => /duplicated institutional label/.test(error)));
assert.equal(validateNarrativeText("Moody's affirmed Mexico's state-owned electricity utility." ).length, 0);
assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
assert.equal(isSafeHttpUrl('https://example.com/story'), true);

console.log('publication-contract tests: ok');
