// The one and only site navigation. Order + labels live here and NOWHERE else.
// The header and footer both render from this array; the current page ("here")
// is DERIVED from the URL, never hand-set — which kills the nav/footer drift the
// old hand-copied pages suffered from. On narrow screens the header collapses
// these behind the menu button.
module.exports = [
  { label: 'Briefing', href: '/' },
  { label: 'Economy',  href: '/economy.html' },
  { label: 'Model',    href: '/model.html' },
  { label: 'Atlas',    href: '/atlas.html' },
  { label: 'Sources',  href: '/sources.html' },
  { label: 'Weekly',   href: '/weekly.html' },
  { label: 'About',    href: '/about.html' },
];
