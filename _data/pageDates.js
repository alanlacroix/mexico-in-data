// pageDates.js — a real published/modified date per page.
//
// Both the sitemap and the structured data used to stamp every URL with the build time.
// That is not a signal, it is noise: it told Google that all thirteen pages changed at
// 13:55:35.679Z, every build, including the quarterly reviews that had not changed in
// days. Google discounts lastmod when it obviously tracks the deploy rather than the
// content, so a wrong date is worse than none: it can get the whole signal ignored,
// including on the homepage, which genuinely does change daily.
//
// So: the homepage takes its date from the publication receipt, which is the real
// editorial date. Everything else takes the last commit that touched its source
// template, which is the real answer to "when did this page last change".
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// Route to the template that owns it. Explicit because it is short and because guessing
// wrong here publishes a wrong date, which is the failure this file exists to fix.
const SOURCE = {
  '/': 'index.njk',
  '/es/': 'index.njk',
  '/economy': 'topic-pages.njk',
  '/payments': 'topic-pages.njk',
  '/politics': 'topic-pages.njk',
  '/society': 'topic-pages.njk',
  '/us-mexico': 'topic-pages.njk',
  '/deals': 'deals.njk',
  '/energy': 'energy.njk',
  '/atlas': 'atlas.njk',
  '/sources': 'sources.njk',
  '/about': 'about.njk',
  '/reports/mexico-overview-2026': 'reports/mexico-overview-2026.html',
};

const gitDate = (file) => {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    return iso || null;
  } catch {
    return null;
  }
};

module.exports = function () {
  const receipt = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'publication-status.json'), 'utf8')); } catch { return {}; }
  })();
  // The edition's own timestamp, not the deploy's. Falls back to the build only if the
  // receipt is unreadable, which would itself be a bigger problem than a date.
  const editionAt = receipt.generatedAt || new Date().toISOString();

  const cache = new Map();
  const out = {};
  for (const [route, file] of Object.entries(SOURCE)) {
    if (route === '/' || route === '/es/') {
      out[route] = { modified: editionAt, published: editionAt, daily: true };
      continue;
    }
    if (!cache.has(file)) cache.set(file, gitDate(file) || editionAt);
    out[route] = { modified: cache.get(file), published: cache.get(file), daily: false };
  }
  return out;
};
