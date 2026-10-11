import assert from 'node:assert/strict';
import { mock } from 'node:test';
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
// Advance the request clock explicitly: loaded CI runners need not execute a
// real timer within an arbitrary wall-clock allowance.
mock.timers.enable({ apis: ['setTimeout'] });
try {
  const starts = [Promise.withResolvers(), Promise.withResolvers()];
  const signals = [];
  let redirects = 0;
  const request = fetchBoundedText('https://example.com/start', {
    allowedHosts: ['example.com'], timeoutMs: 35, redirects: 4,
    lookup: publicLookup,
    fetchImpl: async (url, { signal }) => {
      const hop = signals.length;
      signals.push(signal);
      starts[hop].resolve();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 18);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
      redirects += 1;
      return new Response('', { status: 302, headers: { location: `/hop-${redirects}` } });
    },
  });
  const rejected = assert.rejects(request, /deadline|abort/i);
  await starts[0].promise;
  mock.timers.tick(18);
  await starts[1].promise;
  assert.equal(signals[1], signals[0], 'redirects must share the request cancellation signal');
  mock.timers.tick(16);
  assert.equal(signals[0].aborted, false, 'deadline must not expire before 35ms');
  mock.timers.tick(1);
  assert.equal(signals[0].aborted, true, 'the original deadline must expire during the second hop');
  await rejected;
  assert.equal(redirects, 1, 'the second redirect must be cancelled at the shared deadline');
} finally {
  mock.timers.reset();
}

mock.timers.enable({ apis: ['setTimeout'] });
try {
  const lookupStarted = Promise.withResolvers();
  let fetchCalls = 0;
  let settled = false;
  const request = fetchBoundedText('https://example.com/start', {
    allowedHosts: ['example.com'], timeoutMs: 25,
    lookup: async () => { lookupStarted.resolve(); return new Promise(() => {}); },
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not fetch'); },
  });
  const rejected = assert.rejects(request, /deadline|abort/i).then(() => { settled = true; });
  await lookupStarted.promise;
  mock.timers.tick(24);
  // Flush promise rejection handlers without advancing the mocked deadline.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'DNS must remain pending before the deadline');
  mock.timers.tick(1);
  await rejected;
  assert.equal(fetchCalls, 0, 'a DNS timeout must prevent any HTTP request');
} finally {
  mock.timers.reset();
}

console.log('url-safety tests: ok');
