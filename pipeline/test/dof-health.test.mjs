import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { parseDof } from '../collect-news.js';

// Official https://www.diariooficial.gob.mx/sumario.xml, captured 2026-10-17
// at 04:13 UTC. Stored as UTF-8 text; mock transport restores original Latin-1.
const realFeed = fs.readFileSync(new URL('./fixtures/dof/2026-10-16.xml', import.meta.url), 'utf8');
assert.equal(parseDof(realFeed, { includeFiltered: true }).length, 16);
assert.deepEqual(parseDof(realFeed), [], 'the observed feed contains no editorially eligible acts');
const item = (description) => `<item><title>SECRETARIA DE HACIENDA</title><description>${description}</description><link>https://www.diariooficial.gob.mx/nota_detalle.php?codigo=123&amp;fecha=16/10/2026</link></item>`;
const feed = (body) => `<rss><channel>${body}</channel></rss>`;
const eligible = feed(item('Decreto por el que se modifica el arancel de México.'));
assert.equal(parseDof(eligible).length, 1);
assert.deepEqual(parseDof(eligible), parseDof(eligible, { includeFiltered: true }));
const originalFetch = globalThis.fetch;
const originalLookup = dns.lookup;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-dof-health-'));
try {
  fs.mkdirSync(path.join(root, 'pipeline/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data/news'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  for (const file of ['collect-news.js', 'lib/news-trust.js', 'lib/url-safety.js']) {
    fs.copyFileSync(new URL(`../${file}`, import.meta.url), path.join(root, 'pipeline', file));
  }
  fs.writeFileSync(path.join(root, 'pipeline/news-sources.json'), JSON.stringify({ meta: { beatToTag: {} }, sources: [{ id: 'dof-sumario', name: 'DOF', url: 'https://www.diariooficial.gob.mx/sumario.xml', format: 'dof', charset: 'latin1', tier: 'specialist', beat: 'politics', lang: 'es' }] }));
  const { collectNews } = await import(pathToFileURL(path.join(root, 'pipeline/collect-news.js')));
  dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  for (const [label, body, status, throws, count, selected] of [
    ['observed filtered-only', realFeed, 200, false, 16, 0],
    ['eligible', eligible, 200, false, 1, 1],
    ['normal closing whitespace', feed(item('Aviso administrativo.')).replace('</channel>', '</channel >').replace('</rss>', '</rss >'), 200, false, 1, 0],
    ['valid extension name', feed(item('Aviso administrativo.').replace('<item>', '<item-extension>').replace('</item>', '</item-extension>').replace('16/10/2026', '17/10/2026') + item('Aviso administrativo.')), 200, false, 1, 0],
    ['malformed', '<rss><channel><item><title>Broken', 200, false, 0, 0],
    ['HTML error', '<html><body>Unavailable</body></html>', 200, false, 0, 0],
    ['HTML item fragment', `<html>${item('Aviso administrativo.')}</html>`, 200, false, 0, 0],
    ['truncated envelope', feed(item('Aviso administrativo.')).replace('</rss>', ''), 200, false, 0, 0],
    ['partial additional item', feed(item('Aviso administrativo.') + '<item>broken'), 200, false, 0, 0],
    ['unterminated comment', `<rss><channel><!--${item('Aviso administrativo.')}</channel></rss>`, 200, false, 0, 0],
    ['CDATA-only item', feed(`<![CDATA[${item('Aviso administrativo.')}]]>`), 200, false, 0, 0],
    ['unclosed nested tag', feed(`<broken>${item('Aviso administrativo.')}`), 200, false, 0, 0],
    ['lookalike item tag', feed(item('Aviso administrativo.').replace('<item>', '<item-example>')), 200, false, 0, 0],
    ['nested item', feed(`<item>${item('Aviso administrativo.')}</item>`), 200, false, 0, 0],
    ['commented item', feed(`<!--${item('Aviso administrativo.')}-->`), 200, false, 0, 0],
    ['duplicate date parameter', feed(item('Aviso administrativo.')).replace('16/10/2026', '16/10/2026&amp;fecha=15/10/2026'), 200, false, 0, 0],
    ['fake date parameter', feed(item('Aviso administrativo.')).replace('amp;fecha=', 'amp;error=fecha='), 200, false, 0, 0],
    ['invalid calendar date', feed(item('Aviso administrativo.')).replace('16/10/2026', '31/02/2026'), 200, false, 0, 0],
    ['HTTP error', realFeed, 503, false, 0, 0],
    ['transport error', realFeed, 200, true, 0, 0],
    ['empty feed', feed(''), 200, false, 0, 0],
    ['missing date', eligible.replace('16/10/2026', ''), 200, false, 0, 1],
  ]) {
    const dir = path.join(root, 'data/news');
    fs.writeFileSync(path.join(dir, 'health.json'), JSON.stringify({ 'dof-sumario': { consecutive_failures: 3, last_success: '2026-10-15T12:00:00Z' } }));
    fs.writeFileSync(path.join(dir, '2026-W42.json'), '[]');
    const lastGood = '{"meta":{"lastGood":true},"articles":[]}';
    fs.writeFileSync(path.join(dir, 'wire.json'), lastGood);
    globalThis.fetch = async () => {
      if (throws) throw new Error('network unavailable');
      return new Response(Buffer.from(body, 'latin1'), { status });
    };
    try { await collectNews({ now: new Date('2026-10-17T04:11:05Z') }); }
    catch (error) {
      assert.notEqual(label, 'eligible', 'eligible Mexico story must complete collection');
      assert.match(error.message, /catastrophic news collection failure/);
      assert.equal(fs.readFileSync(path.join(dir, 'wire.json'), 'utf8'), lastGood);
    }
    const health = JSON.parse(fs.readFileSync(path.join(dir, 'health.json')))['dof-sumario'];
    assert.equal(health.fetch_ok, count > 0, label);
    assert.equal(health.parsed_items, count, label);
    assert.equal(health.eligible_items, selected, label);
    assert.equal(health.newest_published_at, count ? '2026-10-16T12:00:00.000Z' : null, label);
    assert.equal(health.consecutive_failures, count ? 0 : 4, label);
    assert.equal(health.last_success, count ? '2026-10-17T04:11:05.000Z' : '2026-10-15T12:00:00Z', label);
    if (!selected) assert.equal(health.new_items, 0, label);
    if (label === 'eligible') {
      const ledger = JSON.parse(fs.readFileSync(path.join(dir, '2026-W42.json')));
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0].published_at, '2026-10-16T12:00:00.000Z');
      assert.equal(ledger[0].title, parseDof(eligible)[0].title);
      assert.equal(ledger[0].url, 'https://diariooficial.gob.mx/nota_detalle.php?codigo=123&fecha=16/10/2026');
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  dns.lookup = originalLookup;
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('DOF availability is independent of unchanged editorial eligibility: ok');
