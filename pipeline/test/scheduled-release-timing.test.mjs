import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import scheduled from '../lib/scheduled-candidate.cjs';
import { publicationCoverage } from '../build-edition.mjs';

const { scheduledReleaseState, dueScheduledRows, linkScheduledCandidate, seedScheduledCandidate } = scheduled;
const row = JSON.parse(fs.readFileSync(new URL('../../data/events.json', import.meta.url))).events
  .find(event => event.id === 'banxico-policy-2026-11-05');
const before = new Date('2026-11-05T18:59:59.999Z');
const exact = new Date('2026-11-05T19:00:00Z');
const after = new Date('2026-11-05T19:00:00.001Z');
const morning = new Date('2026-11-05T12:05:00Z');
const tomorrow = new Date('2026-11-06T12:05:00Z');
const official = '05/11/26 | El objetivo para la tasa de interés de Banco de México se mantiene sin cambio en 6.50 por ciento Texto completo';
const outcome = {
  title: 'Banxico mantiene sin cambios la tasa de interés',
  dek: 'Banco de México dejó sin cambios la tasa objetivo.',
  published_at: row.releaseAt,
};
const forecast = {
  title: 'Analistas ven más riesgos que beneficios si Banxico decide recortar la tasa de interés',
  dek: 'Un ajuste a la baja se tomaría como sorpresivo.',
  published_at: '2026-11-05T10:00:00Z',
};
const ordinary = [0, 1, 2].map(index => ({ index, item: { _editorialDate: row.date } }));
const required = { index: 3, item: { ...outcome, _editorialDate: row.date, _scheduled: row } };
const locked = [...ordinary, required];

assert.equal(row.releaseAt, '2026-11-05T19:00:00Z');
assert.equal(row.timeZone, 'America/Mexico_City');
assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: row.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(exact), '13:00');
assert.equal(row.releaseSourceUrl, 'https://www.banxico.org.mx/politica-monetaria/d/%7B3B4BDA5B-E7E8-E414-2066-DA0CB3F7C36F%7D.pdf');
for (const now of [morning, before, exact, after]) {
  const released = now >= exact;
  assert.equal(scheduledReleaseState(row, now), released ? 'released' : 'future');
  assert.deepEqual(dueScheduledRows([row], row.date, row.date, now), released ? [row] : []);
  assert.equal(linkScheduledCandidate(outcome, [row], row.date, now)?.id || null, released ? row.id : null);
  const seed = seedScheduledCandidate(row, official, now);
  assert.equal(seed?._scheduled?.id || null, released ? row.id : null);
  if (seed) {
    assert.equal(seed.published_at, row.date, 'an official day must not invent a publication hour');
    assert.equal(seed.first_seen, now.toISOString());
    assert.equal(seed._scheduled.releaseAt, row.releaseAt, 'carry timing through the publication gate');
  }
  assert.equal(publicationCoverage(ordinary, locked, row.date, now), !released,
    'only an available required outcome is mandatory');
  assert.equal(publicationCoverage(locked, locked, row.date, now), released,
    'including a future outcome cannot satisfy coverage');
}
assert.deepEqual(dueScheduledRows([row], row.date, '2026-11-06', tomorrow), [row],
  'an unresolved previous-day outcome remains mandatory');
const nextDay = ordinary.map(entry => ({ ...entry, item: { _editorialDate: '2026-11-06' } }));
assert.equal(publicationCoverage(nextDay, [...nextDay, required], '2026-11-06', tomorrow), false);
assert.equal(publicationCoverage([...nextDay, required], [...nextDay, required], '2026-11-06', tomorrow), true);
assert.equal(linkScheduledCandidate({ ...outcome, published_at: '2026-11-05T20:00:00Z' }, [row], row.date, after), null,
  'an already due event does not make a future article available');
const premature = { ...outcome, published_at: '2026-11-05T10:00:00Z' };
assert.equal(linkScheduledCandidate(premature, [row], row.date, after), null,
  'an article predating the verified release cannot prove its outcome afterward');
const prematureRequired = { ...required, item: { ...required.item, ...premature } };
assert.equal(publicationCoverage([...ordinary, prematureRequired], locked, row.date, after), false);
for (const report of [forecast, { ...forecast, published_at: row.releaseAt }]) {
  assert.equal(linkScheduledCandidate(report, [row], row.date, after), null,
    'the actual Spanish conditional forecast remains a forecast after release');
}
assert.equal(linkScheduledCandidate({ ...outcome, title: 'Analysts expect Banxico to hold its benchmark interest rate' }, [row], row.date, after), null);
assert.equal(linkScheduledCandidate({ ...outcome, title: 'Banxico holds its benchmark interest rate unchanged, as expected' }, [row], row.date, after)?.id, row.id);

const { releaseAt, timeZone, ...unknown } = row;
assert.equal(scheduledReleaseState(unknown, morning), 'unknown');
assert.deepEqual(dueScheduledRows([unknown], row.date, row.date, morning), [unknown],
  'unknown timing cannot defer an existing mandatory obligation');
assert.equal(publicationCoverage(ordinary, [...ordinary, { ...required, item: { _scheduled: unknown } }], row.date, morning), false);
assert.equal(seedScheduledCandidate(unknown, 'No published decision', morning), null);
const badRows = [
  { ...row, releaseAt: '' }, { ...row, releaseAt: null }, { ...row, releaseAt: '2026-11-05' },
  { ...row, releaseAt: '2026-11-05T25:00:00Z' }, { ...row, releaseAt: '2026-11-05T24:00:00Z' },
  { ...row, releaseAt: '2026-02-30T19:00:00Z', date: '2026-03-02' },
  { ...row, releaseAt: '2026-11-06T19:00:00Z' }, { ...row, timeZone: 'Not/A_Zone' },
  { ...row, timeZone: '' }, { ...row, timeZone: null }, { ...row, timeZone: undefined },
  { ...unknown, timeZone },
];
for (const invalid of badRows) {
  assert.equal(scheduledReleaseState(invalid, after), 'invalid');
  assert.throws(() => dueScheduledRows([invalid], invalid.date, invalid.date, after), /invalid scheduled release timing/);
  assert.equal(linkScheduledCandidate(outcome, [invalid], invalid.date, after), null);
  assert.equal(seedScheduledCandidate(invalid, official, after), null);
  assert.equal(publicationCoverage(ordinary, [...ordinary, { ...required, item: { _scheduled: invalid } }], row.date, after), false);
}
assert.equal(scheduledReleaseState(row, new Date('invalid')), 'invalid');
assert.equal(scheduledReleaseState({ ...row, releaseAt: exact.toISOString() }, exact), 'released');

// Exercise real selection without network, models, current editions or accounting
// writes. A stub official page is consulted only when the release is actually due.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-release-timing-'));
try {
  fs.cpSync(new URL('../', import.meta.url), path.join(temp, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'data/news'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(temp, 'pipeline/lib/fetch-article.js'), `
    let calls = 0, text = '';
    export function configure(value) { calls = 0; text = value; }
    export function count() { return calls; }
    export async function fetchArticle() { calls++; return { ok: true, text }; }
  `);
  const { candidateUniverse } = await import(pathToFileURL(path.join(temp, 'pipeline/build-edition.mjs')));
  const source = await import(pathToFileURL(path.join(temp, 'pipeline/lib/fetch-article.js')));
  const newsFile = path.join(temp, 'data/news/2026-W45.json');
  const feed = {
    ...outcome, id: 'published-decision', url: 'https://www.elfinanciero.com.mx/economia/2026/11/05/banxico/',
    sourceId: 'elfin-economia', sourceName: 'El Financiero', source: 'elfinanciero.com.mx', tier: 2,
  };
  const select = (now, schedule = [row], date = row.date) => candidateUniverse(now, schedule, date, []);
  fs.writeFileSync(newsFile, JSON.stringify([feed]));
  source.configure(official);
  assert.deepEqual(await select(morning), [], 'future feed evidence is not published news');
  assert.equal(source.count(), 0, 'no pre-release seeding fetch');
  for (const now of [exact, after]) {
    const universe = await select(now);
    assert.equal(universe.length, 1);
    assert.equal(universe[0]._scheduled.id, row.id);
  }
  assert.equal(source.count(), 0, 'a valid post-release report can satisfy the obligation');
  fs.writeFileSync(newsFile, '[]');
  source.configure(official);
  assert.deepEqual(await select(before), []);
  assert.equal(source.count(), 0);
  for (const now of [exact, after, tomorrow]) {
    const universe = await select(now, [row], now === tomorrow ? '2026-11-06' : row.date);
    assert.equal(universe.length, 1);
    assert.equal(universe[0]._scheduled.id, row.id);
    assert.equal(universe[0].published_at, row.date);
  }
  assert.equal(source.count(), 3, 'available unresolved outcomes require source-backed seeding');
  source.configure('No published decision');
  await assert.rejects(select(exact), /required scheduled outcome unavailable/);
  await assert.rejects(select(tomorrow, [row], '2026-11-06'), /required scheduled outcome unavailable/);
  await assert.rejects(select(morning, [unknown]), /required scheduled outcome unavailable/,
    'unknown timing still fails closed when the required result is missing');
  await assert.rejects(select(morning, [badRows[0]]), /invalid scheduled release timing/);
  fs.writeFileSync(newsFile, JSON.stringify([{ ...feed, ...forecast, published_at: row.releaseAt }]));
  await assert.rejects(select(exact), /required scheduled outcome unavailable/,
    'the Spanish forecast cannot close the due obligation');
  fs.writeFileSync(newsFile, JSON.stringify([{ ...feed, published_at: '2026-11-05T20:00:00Z' }]));
  await assert.rejects(select(after), /required scheduled outcome unavailable/,
    'future evidence cannot close an already-due obligation');
  assert.deepEqual(await select(morning, []), [], 'future feed timestamps are rejected even without a schedule');
  assert.equal(fs.existsSync(path.join(temp, 'data/edition.json')), false);
  assert.equal(fs.existsSync(path.join(temp, 'data/edition-attempts.json')), false);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('scheduled release timing: before/exact/after, carryover, malformed timing and forecast gates pass');
