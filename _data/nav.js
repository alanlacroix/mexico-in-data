// The one and only site navigation. Order, labels, and which links collapse on
// mobile (`opt`) live here and NOWHERE else. The header and footer both render
// from this array; the current page ("here") is DERIVED from the URL, never
// hand-set — which is exactly what kills the nav/footer drift the old
// hand-copied pages suffered from.
module.exports = [
  { label: 'Briefing', href: '/' },
  { label: 'Economy',  href: '/economy.html', opt: true },
  { label: 'Model',    href: '/model.html',   opt: true },
  { label: 'Atlas',    href: '/atlas.html',   opt: true },
  { label: 'Sources',  href: '/data.html' },
  { label: 'Weekly',   href: '/weekly.html' },
  { label: 'About',    href: '/about.html' },
];
