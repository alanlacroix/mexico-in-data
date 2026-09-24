import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-collection-failure-'));
try {
  const pipeline = path.join(root, 'pipeline');
  const news = path.join(root, 'data', 'news');
  fs.mkdirSync(path.join(pipeline, 'lib'), { recursive: true });
  fs.mkdirSync(news, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  for (const file of ['collect-news.js', 'lib/news-trust.js', 'lib/url-safety.js']) {
    fs.copyFileSync(new URL(`../${file}`, import.meta.url), path.join(pipeline, file));
  }
  // Deliberately prohibited URL fails before any network access.
  fs.writeFileSync(path.join(pipeline, 'news-sources.json'), JSON.stringify({ meta: { beatToTag: {} }, sources: [{ id: 'blocked', name: 'Blocked test source', url: 'https://127.0.0.1/feed', tier: 1 }] }));
  const wire = '{"meta":{"lastGood":true},"articles":[]}';
  fs.writeFileSync(path.join(news, 'wire.json'), wire);
  fs.writeFileSync(path.join(news, '2026-W39.json'), '[]');
  fs.writeFileSync(path.join(news, 'health.json'), JSON.stringify({ blocked: { consecutive_failures: 2, last_success: '2026-09-20T00:00:00Z' } }));
  const { collectNews } = await import(pathToFileURL(path.join(pipeline, 'collect-news.js')));
  await assert.rejects(collectNews({ now: new Date('2026-09-24T12:05:00Z') }), error => {
    assert.equal(error.collection.ok, false);
    assert.deepEqual(error.collection.failedSourceIds, ['blocked']);
    return /catastrophic/.test(error.message);
  });
  const health = JSON.parse(fs.readFileSync(path.join(news, 'health.json')));
  assert.equal(health.blocked.last_run, '2026-09-24T12:05:00.000Z');
  assert.equal(health.blocked.consecutive_failures, 3);
  assert.equal(health.blocked.last_success, '2026-09-20T00:00:00Z');
  assert.equal(fs.readFileSync(path.join(news, 'wire.json'), 'utf8'), wire);
  assert.equal(fs.readFileSync(path.join(news, '2026-W39.json'), 'utf8'), '[]');
  console.log('collection failure preserves health and last-good data: ok');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
