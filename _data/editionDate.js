// editionDate.js — the current edition's date, preformatted per language.
//
// The homepage headline in the structured data needs a human date in the reader's
// language. The longDate filter does this correctly in the template body but returned
// English inside eleventyComputed, where the frontmatter is rendered by a different
// Nunjucks pass. Rather than depend on that behaviour, format it here once, in plain
// JavaScript, where it is deterministic and testable.
const fs = require('node:fs');
const path = require('node:path');

const longDate = (iso, locale) => {
  const parsed = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  const text = parsed.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  return locale === 'es' ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

module.exports = function () {
  let iso = new Date().toISOString().slice(0, 10);
  try {
    const receipt = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'publication-status.json'), 'utf8'));
    iso = (receipt.state === 'deferred' ? receipt.contentEditorialDate : receipt.editorialDate) || iso;
  } catch { /* fall back to today */ }
  return { iso, en: longDate(iso, 'en'), es: longDate(iso, 'es') };
};
