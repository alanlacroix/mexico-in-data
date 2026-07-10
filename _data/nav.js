// The one and only site navigation. Order + labels live here and NOWHERE else.
// The header and footer both render from this array; the current page ("here") is
// DERIVED from the URL, never hand-set. The brand goes home (the mast is sticky),
// so there is no "Briefing" link. Weekly is the single call-to-action (cta).
module.exports = [
  { label: 'Economy', href: '/economy.html' },
  { label: 'Money',   href: '/money.html' },
  { label: 'Model',   href: '/model.html' },
  { label: 'Atlas',   href: '/atlas.html' },
  { label: 'Sources', href: '/sources.html' },
  { label: 'About',   href: '/about.html' },
  { label: 'Weekly',  href: '/weekly.html', cta: true },
];
