// stream.js — stream a large remote file line-by-line via a `curl` subprocess.
// Why not node fetch? Several gov hosts (IMSS especially) sit behind an Imperva
// WAF that fingerprints the TLS client (JA3) and 403s node's undici, while it
// lets curl (with a browser UA) through. curl is present on macOS and the CI
// ubuntu runner. This keeps the 400MB IMSS file out of memory and out of git —
// only the aggregated result is kept.

import { spawn } from 'node:child_process';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Stream a URL through curl, invoking onLine for each line. Resolves on clean exit. */
export function curlLines(url, onLine, { encoding = 'latin1' } = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn('curl', ['-sS', '--fail', '--connect-timeout', '30', '--max-time', '600', '-A', UA, url]);
    const dec = new TextDecoder(encoding);
    let buf = '';
    let stderr = '';
    cp.stdout.on('data', (chunk) => {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        onLine(buf.slice(0, nl).replace(/\r$/, ''));
        buf = buf.slice(nl + 1);
      }
    });
    cp.stderr.on('data', (d) => { stderr += d.toString(); });
    cp.on('error', reject);
    cp.on('close', (code) => {
      if (buf) onLine(buf.replace(/\r$/, ''));
      if (code === 0) resolve();
      else reject(new Error(`curl exit ${code}${stderr ? ': ' + stderr.slice(0, 200) : ''}`));
    });
  });
}

/** HEAD a URL via curl. Returns { status, lastModified } (status 0 on transport error). */
export function curlHead(url) {
  return new Promise((resolve) => {
    const cp = spawn('curl', ['-sI', '--connect-timeout', '20', '-A', UA, url]);
    let out = '';
    cp.stdout.on('data', (d) => (out += d.toString()));
    cp.on('error', () => resolve({ status: 0 }));
    cp.on('close', () => {
      const status = Number((out.match(/HTTP\/[\d.]+ (\d+)/) || [])[1] || 0);
      const lastModified = (out.match(/Last-Modified: (.+)/i) || [])[1]?.trim();
      resolve({ status, lastModified });
    });
  });
}
