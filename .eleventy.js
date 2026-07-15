// Eleventy config. All pages are Nunjucks templates that render through
// _includes/base.njk (one <head>, one masthead component, one footer component,
// one nav in _data/nav.js). Output is pure static HTML to _site.
//
// design/ and runtime data are copied verbatim. Email drafts are private review
// artifacts and never enter the public build. We do NOT pass through root-level
// page *.html files: production pages are built from .njk templates.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

module.exports = function (ec) {
  ec.addPassthroughCopy('design');
  ec.addPassthroughCopy('assets');   // shared JS toolkit (mb.js) the section pages import
  // Only runtime data belongs in the public artifact. Email drafts and raw
  // source snapshots are review/audit material, not website assets.
  for (const entry of fs.readdirSync('data', { withFileTypes: true })) {
    if (['email', 'source-snapshots'].includes(entry.name)) continue;
    ec.addPassthroughCopy(path.join('data', entry.name));
  }
  ec.addPassthroughCopy('reports'); // the Mexico overview in web and PDF editions
  ec.addPassthroughCopy('_headers');   // Cloudflare Pages cache policy
  ec.addPassthroughCopy('_redirects'); // retired URLs must follow the same rules in the built site

  // Cloudflare Pages serves root-level .html files at clean URLs. Keep canonical and
  // Open Graph URLs on that public form so /trade and /trade.html do not compete.
  ec.addFilter('canonicalPath', (url) => {
    const value = String(url || '/');
    return value === '/' ? '/' : value.replace(/\.html$/, '');
  });

  // Cache-busting: a short content hash of the stylesheet. base.njk appends it to
  // the CSS URL (?v=hash), so the URL changes whenever the CSS changes and a browser
  // can never serve a stale stylesheet against fresh HTML (the bug that made the nav
  // render unstyled). The CSS itself is then safe to cache immutably (see _headers).
  ec.addGlobalData('cssv', () => {
    try { return crypto.createHash('md5').update(fs.readFileSync('design/mckinsey-mx.css')).digest('hex').slice(0, 8); }
    catch { return 'v1'; }
  });

  return {
    dir: { input: '.', output: '_site', includes: '_includes', data: '_data' },
    templateFormats: ['njk'],
  };
};
