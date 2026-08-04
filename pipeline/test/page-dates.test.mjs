// The declared page dates in _data/pageDates.js feed the sitemap's lastmod and the
// structured data's datePublished/dateModified. Declared dates rot: someone rewrites a
// page and the date keeps claiming the old one, and now we are telling Google something
// false on the surface whose entire job is being trustworthy.
//
// So check them against real git history. This cannot run on Cloudflare, which builds
// from a shallow clone (that is the whole reason the dates are declared instead of
// computed), so the test skips itself when the history is not there rather than failing
// for the wrong reason.
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { PAGES } = (await import(path.join(ROOT, '_data', 'pageDates.js'))).default
  ? await import(path.join(ROOT, '_data', 'pageDates.js'))
  : {};

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

let shallow = true;
try {
  shallow = git(['rev-parse', '--is-shallow-repository']) === 'true';
} catch {
  console.log('page-dates: no git available, skipping');
  process.exit(0);
}
if (shallow) {
  console.log('page-dates: shallow clone, skipping (dates are declared precisely because of this)');
  process.exit(0);
}

const pages = PAGES || (await import(path.join(ROOT, '_data', 'pageDates.js'))).PAGES;
assert.ok(pages && Object.keys(pages).length, 'pageDates must export its PAGES map for this check');

const stale = [];
for (const [route, page] of Object.entries(pages)) {
  let lastCommit;
  try {
    lastCommit = git(['log', '-1', '--format=%cs', '--', page.source]);
  } catch {
    continue;
  }
  if (!lastCommit) continue;
  // A commit newer than the declared date means the page changed and nobody said so.
  // One day of slack: a same-day follow-up commit is the same revision.
  const declared = new Date(`${page.revised}T12:00:00Z`).getTime();
  const committed = new Date(`${lastCommit}T12:00:00Z`).getTime();
  if (committed > declared + 86400000) {
    stale.push(`${route}: declares ${page.revised} but ${page.source} last changed ${lastCommit}`);
  }
}

assert.deepEqual(stale, [], `page dates are stale, update _data/pageDates.js:\n  ${stale.join('\n  ')}`);
console.log(`page-dates: ok (${Object.keys(pages).length} pages checked against git history)`);
