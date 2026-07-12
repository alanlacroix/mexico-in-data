// check-links.mjs — a small link checker for the trust-critical sources page.
//
// It reads sources.njk (or any files passed as args), pulls every http(s) href,
// and requests each one. It FLAGS only real dead links (404 / 410). It IGNORES
// 401 / 403 / 429 and timeouts / network errors, because government and agency
// sites routinely block automated clients — a 403 is "you are a bot", not "this
// page is gone". Exit code is 1 only when a real dead link is found.
//
//   node check-links.mjs                # checks ../sources.njk
//   node check-links.mjs ../about.njk   # checks specific files
//
// No dependencies: Node 20+ global fetch.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TIMEOUT_MS = 15000;
const DEAD = new Set([404, 410]); // the only statuses we treat as a real failure

const files = process.argv.slice(2);
if (!files.length) files.push(path.join(__dirname, '..', 'sources.njk'));

function extractUrls(text) {
  const urls = new Set();
  const re = /href="(https?:\/\/[^"]+)"/g;
  let m;
  while ((m = re.exec(text))) urls.add(m[1]);
  return [...urls];
}

async function head(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA } });
    // Some servers reject HEAD (405) but answer GET — retry once with GET.
    if (r.status === 405 || r.status === 501) {
      r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA } });
    }
    return { status: r.status };
  } catch (e) {
    return { status: 0, err: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const urls = new Set();
  for (const f of files) extractUrls(fs.readFileSync(f, 'utf8')).forEach((u) => urls.add(u));
  const list = [...urls].sort();
  console.log(`checking ${list.length} links from ${files.map((f) => path.basename(f)).join(', ')}\n`);

  const dead = [];
  const skipped = [];
  let ok = 0;
  // Small concurrency so we do not hammer any one host.
  const queue = list.slice();
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const { status, err } = await head(url);
      if (DEAD.has(status)) { dead.push({ url, status }); console.log(`DEAD  ${status}  ${url}`); }
      else if (status >= 200 && status < 400) { ok++; }
      else { skipped.push({ url, status: status || err }); console.log(`skip  ${status || err}  ${url}`); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);

  console.log(`\n${ok} ok · ${skipped.length} skipped (blocked/timeout) · ${dead.length} dead`);
  if (dead.length) {
    console.log('\nDead links (real 404/410):');
    for (const d of dead) console.log(`  ${d.status}  ${d.url}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('check-links error:', e); process.exit(1); });
