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

  // The dateline, formatted at build time so it is in the HTML rather than painted in
  // after the page loads.
  ec.addFilter('longDate', (iso, locale) => {
    const parsed = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return iso;
    // es-MX for the Spanish edition; capitalized to sit as the page's dateline.
    const text = parsed.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US',
      { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return locale === 'es' ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  });

  // Category dots, from the design handoff. Equal lightness and chroma, hue varies, so
  // no dot reads as louder than another. An unknown category falls back to grey rather
  // than inventing a colour.
  const CATEGORY_DOTS = {
    usmexico: 'oklch(0.55 0.12 255)',
    economy: 'oklch(0.52 0.10 165)',
    payments: 'oklch(0.55 0.12 305)',
    society: 'oklch(0.58 0.11 60)',
    deals: 'oklch(0.55 0.11 200)',
    politics: 'oklch(0.55 0.12 15)',
    energy: 'oklch(0.55 0.11 140)',
  };
  ec.addFilter('catColor', (key) => CATEGORY_DOTS[String(key || '')] || '#86888E');

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
