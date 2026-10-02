import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import newsDay from '../lib/news-day.cjs';
import { publicationPlan } from '../publication-plan.mjs';
import {
  MAX_REQUEST_WINDOW_MS, readPublicationRequest, requirePublicationRequest, validatePublicationRequest,
} from '../lib/publication-request.mjs';

const now = new Date('2026-10-02T05:55:00Z'); // Still October 1 in Mexico City.
const request = { editorialDate: '2026-10-01', slot: 'morning', expiresAt: '2026-10-02T06:05:00Z', purpose: 'Recover a delayed scheduled edition' };
assert.deepEqual(validatePublicationRequest(request, now), request);
assert.equal(validatePublicationRequest({ ...request, editorialDate: '2026-10-02' }, now), null,
  'the request day is the Mexico City date, not UTC');
assert.equal(validatePublicationRequest(request, new Date('2026-10-02T06:00:00Z')), null,
  'crossing the editorial day invalidates yesterday’s request even before expiry');
for (const invalid of [null, [], {}, { ...request, slot: 'migration' }, { ...request, purpose: '' },
  { ...request, purpose: '   ' }, { ...request, purpose: 'x'.repeat(201) }, { ...request, purpose: 'a\nb' },
  { ...request, expiresAt: now.toISOString() }, { ...request, expiresAt: 'invalid' },
  { ...request, expiresAt: new Date(now.getTime() + MAX_REQUEST_WINDOW_MS + 1).toISOString() },
  { ...request, budgetOverride: true }, { ...request, retry: true }, { ...request, expiresAt: 123 },
]) assert.equal(validatePublicationRequest(invalid, now), null, JSON.stringify(invalid));
assert.ok(validatePublicationRequest({ ...request, expiresAt: new Date(now.getTime() + MAX_REQUEST_WINDOW_MS).toISOString() }, now));

const date = request.editorialDate;
const row = (state, extra = {}) => ({ editorialDate: date, slot: 'morning', state, calls: 1, costUSD: 0.01, artifactHash: 'live', ...extra });
const plan = (rows = [], extra = {}) => publicationPlan({ event: 'push', date, now, publicationRequest: request,
  attempts: { attempts: rows }, edition: { editorialDate: date, artifactHash: 'live' }, ...extra });
assert.deepEqual(plan(), { run: true, slot: 'morning', retry: false });
assert.deepEqual(plan([], { publicationRequest: { ...request, slot: 'noon' } }), { run: true, slot: 'noon', retry: false });
assert.deepEqual(plan([row('published')]), { run: false, slot: 'morning', retry: false, verify: true });
assert.deepEqual(plan([row('review-required')]), { run: false, slot: 'morning', retry: false });
assert.deepEqual(plan([row('failed')]), { run: true, slot: 'morning', retry: true });
assert.deepEqual(plan([row('failed', { recoveries: [{}] })]), { run: true, slot: 'noon', retry: false });
assert.throws(() => plan([row('failed', { slot: 'noon', recoveries: [{}] })]), /exhausted/);
assert.throws(() => plan([row('started')]), /requires diagnosis/);
assert.throws(() => plan([row('published')], { edition: { editorialDate: date, artifactHash: 'wrong' } }), /does not match/);
assert.deepEqual(plan([row('failed')], { publicationRequest: null }), { run: false, slot: 'morning', retry: false },
  'an invalid push cannot borrow permission from a failed attempt');
assert.equal(plan([], { event: 'workflow_run' }).run, false, 'ordinary code checks still cannot start a new edition');

const root = fileURLToPath(new URL('../../', import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'ops/publication-request.schema.json')));
assert.equal(schema.additionalProperties, false);
assert.deepEqual(schema.required, ['editorialDate', 'slot', 'expiresAt', 'purpose']);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-request-'));
try {
  fs.cpSync(path.join(root, 'pipeline'), path.join(tmp, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'ops'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const file = path.join(tmp, 'ops/publication-request.json');
  const attemptFile = path.join(tmp, 'data/edition-attempts.json');
  const editionFile = path.join(tmp, 'data/edition.json');
  const env = { ...process.env, TRIGGER_EVENT: 'push', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '900', GITHUB_RUN_ATTEMPT: '1' };
  const cli = () => spawnSync(process.execPath, ['pipeline/publication-plan.mjs'], { cwd: tmp, env, encoding: 'utf8', timeout: 5000 });
  fs.writeFileSync(attemptFile, 'not even a valid ledger');
  fs.writeFileSync(editionFile, 'not even a valid edition');
  for (const contents of [undefined, '{invalid', JSON.stringify(request), JSON.stringify({ ...request, extra: true })]) {
    if (contents === undefined) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, contents);
    // Historical fixture is guaranteed invalid against the real invocation date/time.
    if (contents === JSON.stringify(request)) fs.writeFileSync(file, JSON.stringify({ ...request, expiresAt: '2000-01-01T00:00:00Z' }));
    const before = fs.readFileSync(attemptFile, 'utf8');
    const result = cli();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /run=false/);
    assert.match(result.stdout, /verify=false/);
    assert.equal(fs.readFileSync(attemptFile, 'utf8'), before, 'ignored requests cannot rewrite recovery state');
    assert.equal(readPublicationRequest(file), null);
    assert.throws(() => requirePublicationRequest({ event: 'push', file }), /invalid or expired/);
  }
  const freshNow = new Date();
  const fresh = { ...request, editorialDate: newsDay.editorialDay(freshNow), expiresAt: new Date(freshNow.getTime() + 5 * 60000).toISOString() };
  fs.writeFileSync(file, JSON.stringify(fresh));
  assert.deepEqual(readPublicationRequest(file, freshNow), fresh);
  assert.doesNotThrow(() => requirePublicationRequest({ event: 'push', file, now: freshNow }));
  assert.throws(() => requirePublicationRequest({ event: 'push', file, now: new Date(fresh.expiresAt) }), /expired/);
  assert.doesNotThrow(() => requirePublicationRequest({ event: 'schedule', file: '/does-not-exist' }));
  fs.writeFileSync(attemptFile, '{"attempts":[]}');
  fs.writeFileSync(editionFile, JSON.stringify({ editorialDate: fresh.editorialDate, artifactHash: 'live' }));
  const started = cli();
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stdout, /run=true/);
  fs.writeFileSync(attemptFile, JSON.stringify({ attempts: [row('published', { editorialDate: fresh.editorialDate })] }));
  const replay = cli();
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /run=false/);
  assert.match(replay.stdout, /verify=true/);

  // Exercise the actual builder entrypoint: invalid push requests stop before
  // any source or model fetch and before the attempt ledger is touched.
  fs.writeFileSync(file, '{invalid');
  const before = fs.readFileSync(attemptFile, 'utf8');
  fs.writeFileSync(path.join(tmp, 'guard.mjs'), `
    import assert from 'node:assert/strict';
    let fetched = 0;
    globalThis.fetch = async () => { fetched++; throw new Error('Unexpected fetch'); };
    const { main } = await import('./pipeline/build-edition.mjs');
    await assert.rejects(main(), /Repository publication request/);
    assert.equal(fetched, 0);
  `);
  const guarded = spawnSync(process.execPath, ['guard.mjs'], { cwd: tmp, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(guarded.status, 0, guarded.stderr);
  assert.equal(fs.readFileSync(attemptFile, 'utf8'), before);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

const builder = fs.readFileSync(path.join(root, 'pipeline/build-edition.mjs'), 'utf8');
assert.match(builder, /const call = async \(request\) => \{\s+requirePublicationRequest\(\)/);
assert.match(builder, /persistModelAccounting\(\{ cwd: ROOT \}\);[\s\S]*?if \(receipt\.state === 'reserved'\) requirePublicationRequest\(\)/,
  'expiry is rechecked after the durable push and before provider fetch');
console.log('publication request: ok');
