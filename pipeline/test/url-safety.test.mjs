import assert from 'node:assert/strict';
import { articleUrlAllowed, fetchBoundedText, hostAllowed, isPublicIp, mapLimit, safeHttpsUrl, sourceHosts } from '../lib/url-safety.js';

assert.deepEqual(sourceHosts({ id: 'elpais-mexico', url: 'https://feeds.elpais.com/rss' }), ['feeds.elpais.com', 'elpais.com']);
assert.equal(articleUrlAllowed({ url: 'https://feeds.elpais.com/rss' }, 'https://elpais.com/mexico/story'), true);
assert.equal(articleUrlAllowed({ url: 'https://feeds.elpais.com/rss' }, 'https://attacker.example/story'), false,
  'a trusted feed label cannot bless an unrelated article domain');
assert.equal(Boolean(safeHttpsUrl('http://example.com', ['example.com'])), false);
assert.equal(Boolean(safeHttpsUrl('https://user:pass@example.com', ['example.com'])), false);
assert.equal(Boolean(safeHttpsUrl('https://example.com/?token=secret', ['example.com'])), false);
assert.equal(Boolean(safeHttpsUrl('https://127.0.0.1/private', ['127.0.0.1'])), false);
assert.equal(Boolean(safeHttpsUrl('https://[::1]/private', ['[::1]'])), false);
assert.equal(Boolean(safeHttpsUrl('https://metadata.google.internal/', ['metadata.google.internal'])), false);
assert.equal(hostAllowed('news.example.com', ['example.com']), true);
assert.equal(isPublicIp('8.8.8.8'), true);
assert.equal(isPublicIp('10.0.0.1'), false);
assert.equal(isPublicIp('::1'), false);

let active = 0;
let peak = 0;
const results = await mapLimit([1, 2, 3, 4, 5, 6], 3, async (value) => {
  active += 1; peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, 5));
  active -= 1;
  return value * 2;
});
assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
assert.equal(peak, 3, 'collection concurrency must be bounded');

const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];
let redirects = 0;
const slowRedirectFetch = async (url, { signal }) => {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 18);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  redirects += 1;
  return new Response('', { status: 302, headers: { location: `/hop-${redirects}` } });
};
const redirectStart = Date.now();
await assert.rejects(fetchBoundedText('https://example.com/start', {
  allowedHosts: ['example.com'], timeoutMs: 35, redirects: 4,
  lookup: publicLookup, fetchImpl: slowRedirectFetch,
}), /deadline|abort/i);
assert.ok(Date.now() - redirectStart < 120, 'redirects must share one absolute deadline');

const dnsStart = Date.now();
await assert.rejects(fetchBoundedText('https://example.com/start', {
  allowedHosts: ['example.com'], timeoutMs: 25,
  lookup: async () => new Promise(() => {}), fetchImpl: async () => { throw new Error('must not fetch'); },
}), /deadline|abort/i);
assert.ok(Date.now() - dnsStart < 100, 'DNS must share the same absolute deadline');

console.log('url-safety tests: ok');
