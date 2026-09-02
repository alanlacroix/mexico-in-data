import dns from 'node:dns/promises';
import net from 'node:net';

const cleanHost = (value) => String(value || '').trim().toLowerCase().replace(/\.$/, '');
const SECRET_QUERY = /(?:^|[?&])(?:token|apikey|api_key|key)=/i;

export function sourceHosts(source = {}) {
  if (Array.isArray(source.articleDomains) && source.articleDomains.length) {
    return source.articleDomains.map(cleanHost).filter(Boolean);
  }
  try {
    const host = cleanHost(new URL(source.baseUrl || source.url).hostname);
    const base = host.replace(/^(?:www|feeds?|rss|editorial|blog)\./, '');
    const extras = source.id === 'bbc-latam' ? ['bbc.com', 'bbc.co.uk', 'bbci.co.uk'] : [];
    return [...new Set([host, base, ...extras])];
  } catch { return []; }
}

export function hostAllowed(host, allowedHosts = []) {
  const candidate = cleanHost(host).replace(/^www\./, '');
  return allowedHosts.some((allowed) => {
    const base = cleanHost(allowed).replace(/^www\./, '');
    return candidate === base || candidate.endsWith(`.${base}`);
  });
}

export function isPublicIp(value) {
  const ip = cleanHost(value).replace(/^\[|\]$/g, '');
  const family = net.isIP(ip);
  if (!family) return false;
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0));
  }
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1'
      || normalized.startsWith('fc') || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized) || normalized.startsWith('2001:db8:')) return false;
  if (normalized.startsWith('::ffff:')) return isPublicIp(normalized.slice(7));
  return true;
}

export function safeHttpsUrl(value, allowedHosts = []) {
  try {
    const url = new URL(String(value || ''));
    const host = cleanHost(url.hostname);
    const ipHost = host.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || SECRET_QUERY.test(url.search)) return null;
    if (!host || /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host)) return null;
    if (net.isIP(ipHost) && !isPublicIp(ipHost)) return null;
    if (allowedHosts.length && !hostAllowed(host, allowedHosts)) return null;
    return url;
  } catch { return null; }
}

export function articleUrlAllowed(source, value) {
  return Boolean(safeHttpsUrl(value, sourceHosts(source)));
}

async function assertPublicDns(host, lookup, abortPromise) {
  const ipHost = cleanHost(host).replace(/^\[|\]$/g, '');
  if (net.isIP(ipHost)) {
    if (!isPublicIp(ipHost)) throw new Error('destination is not public');
    return;
  }
  const answers = await Promise.race([lookup(host, { all: true, verbatim: true }), abortPromise]);
  if (!answers.length || answers.some((answer) => !isPublicIp(answer.address))) {
    throw new Error('destination did not resolve exclusively to public addresses');
  }
}

async function boundedBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('response exceeds size limit');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('response exceeds size limit');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

export async function fetchBounded(urlValue, {
  allowedHosts = [], headers = {}, timeoutMs = 12000, maxBytes = 5 * 1024 * 1024, redirects = 4,
  lookup = dns.lookup, fetchImpl = globalThis.fetch,
} = {}) {
  let url = safeHttpsUrl(urlValue, allowedHosts);
  if (!url) throw new Error('URL is not an allowed public HTTPS destination');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('request deadline exceeded')), timeoutMs);
  const abortPromise = new Promise((resolve, reject) => controller.signal.addEventListener('abort', () => {
    reject(controller.signal.reason || new Error('request deadline exceeded'));
  }, { once: true }));
  try {
    for (let hop = 0; hop <= redirects; hop += 1) {
      await assertPublicDns(url.hostname, lookup, abortPromise);
      const response = await Promise.race([fetchImpl(url, {
        headers, redirect: 'manual', signal: controller.signal,
      }), abortPromise]);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === redirects) throw new Error('redirect limit reached');
        url = safeHttpsUrl(new URL(location, url).toString(), allowedHosts);
        if (!url) throw new Error('redirect left the allowed public destination');
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { body: await Promise.race([boundedBody(response, maxBytes), abortPromise]), url: url.toString(), headers: response.headers };
    }
    throw new Error('redirect limit reached');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBoundedText(url, options = {}) {
  const result = await fetchBounded(url, options);
  const charset = options.charset === 'latin1' ? 'iso-8859-1' : (options.charset || 'utf-8');
  return { ...result, text: new TextDecoder(charset).decode(result.body) };
}

export async function mapLimit(values, limit, task) {
  const items = Array.from(values || []);
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
