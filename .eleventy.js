// Eleventy config for one product in two languages: / and /es/.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

module.exports = function (ec) {
  // External headlines and source labels are data, never markup. Autoescape is the
  // final browser boundary; the few intentional HTML fragments use an explicit | safe.
  ec.setNunjucksEnvironmentOptions({ autoescape: true });
  ec.addPassthroughCopy('design');
  ec.addPassthroughCopy('assets/og.png');
  ec.addPassthroughCopy('assets/og.svg');
  // The watchdog reads this receipt to verify the exact edition that reached
  // production. All other data is compiled into the homepage and stays private.
  for (const file of ['publication-status.json', 'brief.json', 'event-status.json']) {
    ec.addPassthroughCopy(`data/${file}`);
  }
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
