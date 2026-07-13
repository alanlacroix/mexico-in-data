// http.js — fetch with a browser User-Agent + retry/backoff.
// Several Mexican gov hosts sit behind an Imperva/Incapsula WAF that 403/503s
// bare scripted requests; a realistic UA + polite retry gets through. This is
// the ONLY place network access lives, so every connector inherits the same
// WAF-handling and timeout behavior.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SECURITY: several gov APIs (INEGI, Banxico) carry the token in the URL itself.
// Error messages flow into data/health.json, which is PUBLISHED — so every
// error string must have secrets scrubbed before it leaves this module.
export function redact(text) {
  let s = String(text);
  for (const key of ['INEGI_TOKEN', 'BANXICO_TOKEN', 'FRED_API_KEY', 'CENSUS_API_KEY']) {
    const v = process.env[key];
    if (v && v.length > 4) s = s.split(v).join('***');
  }
  return s;
}

/**
 * Fetch a URL as text, with retry/backoff for WAF hiccups.
 * Throws (after retries) so the connector fails closed rather than emitting
 * a challenge/error page as if it were data.
 */
export async function getText(url, opts = {}) {
  const {
    retries = 3,
    backoffMs = 1500,
    timeoutMs = 60_000,
    headers = {},
    // A guard against the classic WAF failure: an HTML challenge page served
    // with a 200. If the body looks like the expected type, we accept it.
    expect = null, // 'json' | 'csv' | 'xml' | null
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      const body = await res.text();
      if (!res.ok) throw new Error(redact(`HTTP ${res.status} for ${url}`));
      assertNotChallenge(body, expect, url);
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(backoffMs * (attempt + 1));
    }
  }
  throw new Error(redact(`fetch failed after ${retries + 1} tries: ${lastErr?.message || lastErr}`));
}

export async function getJson(url, opts = {}) {
  const body = await getText(url, { ...opts, expect: 'json' });
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(redact(`invalid JSON from ${url} (first 120 chars: ${body.slice(0, 120)})`));
  }
}

/**
 * Fetch a binary file with the same retry, timeout, redirect, and WAF rules as
 * getText. Official agencies often publish the current table as XLSX or ZIP;
 * decoding it as text first would corrupt the archive.
 */
export async function getBuffer(url, opts = {}) {
  const {
    retries = 3,
    backoffMs = 1500,
    timeoutMs = 60_000,
    headers = {},
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(redact(`HTTP ${res.status} for ${url}`));
      const body = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      if (!body.length) throw new Error(`empty body from ${redact(url)}`);
      // A SharePoint sign-in page or WAF challenge can arrive with HTTP 200.
      // Checking the first bytes prevents either from reaching an archive parser.
      assertNotChallenge(body.subarray(0, 800).toString('utf8'), null, url);
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(backoffMs * (attempt + 1));
    }
  }
  throw new Error(redact(`fetch failed after ${retries + 1} tries: ${lastErr?.message || lastErr}`));
}

// Reject obvious WAF challenge / error pages that masquerade as a 200 body.
// (urls passed through here are redacted by the throw sites above)
function assertNotChallenge(body, expect, url) {
  url = redact(url);
  const head = body.slice(0, 600).toLowerCase();
  const looksHtml = head.includes('<!doctype html') || head.includes('<html');
  const wafHints =
    head.includes('incapsula') ||
    head.includes('_incap_') ||
    head.includes('request unsuccessful') ||
    head.includes('access denied') ||
    head.includes('captcha');
  if (wafHints) throw new Error(`WAF challenge page returned for ${url}`);
  if (expect === 'json' && looksHtml) throw new Error(`expected JSON but got HTML from ${url}`);
  if (expect === 'csv' && looksHtml) throw new Error(`expected CSV but got HTML from ${url}`);
  if (expect === 'xml' && looksHtml && !head.includes('<?xml'))
    throw new Error(`expected XML but got HTML from ${url}`);
  if (body.trim().length === 0) throw new Error(`empty body from ${url}`);
}

export const USER_AGENT = UA;
