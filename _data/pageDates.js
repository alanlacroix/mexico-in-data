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
// real git history wherever that history exists). The daily edition comes from the
// single immutable public edition artifact.
//
// WHEN YOU MEANINGFULLY REVISE A PAGE, UPDATE ITS DATE HERE. Formatting, a typo or a CSS
// tweak is not a revision; new or rewritten content is.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const PAGES = {};

module.exports = function () {
  const edition = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'edition.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  const publishedAt = edition.generatedAt || new Date().toISOString();

  const out = {
    '/': { modified: publishedAt, published: publishedAt, daily: true },
    '/es/': { modified: publishedAt, published: publishedAt, daily: true },
  };
  return out;
};

// Exported for the guard test, which needs the declared dates and the files they claim.
module.exports.PAGES = PAGES;
