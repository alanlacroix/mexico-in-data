// pageDates.js — a real published/modified date per page, for the sitemap and the
// structured data.
//
// Why these are declared rather than computed. Both surfaces used to stamp the build
// time on every URL, which told Google that all thirteen pages changed on every deploy.
// Google discounts a lastmod that obviously tracks the deploy, so a wrong date is worse
// than none: it can get the signal ignored on the homepage, which genuinely does change
// daily.
//
// The obvious fix, reading the last commit that touched each template, works locally and
// silently fails in production: Cloudflare Pages builds from a SHALLOW clone, so `git log`
// there returns the same single commit for every file. Confirmed on 2026-08-04, when the
// deployed sitemap gave all twelve static pages one identical timestamp while the local
// build dated the annual report correctly to July. A date source that is right on my
// machine and wrong on the server is worse than one that is simply honest.
//
// So the editorial dates live here, in the open, next to a test that fails when a template
// changes and its date does not (pipeline/test/page-dates.test.mjs, which checks against
// real git history wherever that history exists). The daily edition still comes from the
// publication receipt, because that one is genuinely automatic and always correct.
//
// WHEN YOU MEANINGFULLY REVISE A PAGE, UPDATE ITS DATE HERE. Formatting, a typo or a CSS
// tweak is not a revision; new or rewritten content is.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// route -> { revised, source }. `source` is the template the guard test watches.
const PAGES = {
  '/economy': { revised: '2026-08-06', source: 'topic-pages.njk' },
  '/payments': { revised: '2026-08-06', source: 'topic-pages.njk' },
  '/politics': { revised: '2026-08-06', source: 'topic-pages.njk' },
  '/society': { revised: '2026-08-06', source: 'topic-pages.njk' },
  '/us-mexico': { revised: '2026-08-06', source: 'topic-pages.njk' },
  '/deals': { revised: '2026-08-06', source: 'deals.njk' },
  '/energy': { revised: '2026-08-06', source: 'energy.njk' },
  '/sources': { revised: '2026-08-04', source: 'sources.njk' },
  '/about': { revised: '2026-08-03', source: 'about.njk' },
  '/reports/mexico-overview-2026': { revised: '2026-07-15', source: 'reports/mexico-overview-2026.html' },
};

// Noon UTC, so the date a reader sees is the date every timezone agrees on.
const atNoon = (day) => `${day}T12:00:00Z`;

module.exports = function () {
  const receipt = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'publication-status.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  const editionAt = receipt.generatedAt || new Date().toISOString();

  const out = {
    '/': { modified: editionAt, published: editionAt, daily: true },
    '/es/': { modified: editionAt, published: editionAt, daily: true },
  };
  for (const [route, page] of Object.entries(PAGES)) {
    out[route] = { modified: atNoon(page.revised), published: atNoon(page.revised), daily: false };
  }
  return out;
};

// Exported for the guard test, which needs the declared dates and the files they claim.
module.exports.PAGES = PAGES;
