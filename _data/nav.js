// The header navigation — one array, rendered identically on every page. The
// current page ("here") is DERIVED from the URL, never hand-set. Weekly is the
// single call-to-action (cta). Six sections + two tools; the brand goes home.
// Sources + About live in the footer (see _data/footernav.js).
module.exports = [
  { label: 'Economy',     href: '/economy.html' },
  { label: 'Money',       href: '/money.html' },
  { label: 'Politics',    href: '/politics.html' },
  { label: 'Security',    href: '/security.html' },
  { label: 'Society',     href: '/society.html' },
  { label: 'U.S.–Mexico', href: '/us-mexico.html' },
  { label: 'Atlas',       href: '/atlas.html' },
  { label: 'Model',       href: '/model.html' },
  { label: 'Weekly',      href: '/weekly.html', cta: true },
];
