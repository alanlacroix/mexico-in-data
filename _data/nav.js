// The header navigation — rendered identically on every page (see partials/header.njk). The current
// page ("here") is DERIVED from the URL, never hand-set. Sources NEVER leaves the top level (a trust
// product shows its receipts in the masthead). About stays top-level: the site is personal, and Alan
// wants method and authorship visible. Subscribe remains the one call-to-action.
// 2026-07-20 (Alan: "any better way to access these pages"): the six topic story pages come out from
// behind Explore and live in a Topics dropdown — one click from anywhere. `match` lights it as active.
module.exports = [
  { label: 'Brief', href: '/' },
  { label: 'Numbers', href: '/chart.html' },
  { label: 'Atlas', href: '/atlas.html' },
  { label: 'Topics',
    match: ['/economy.html', '/payments.html', '/trade.html', '/politics.html', '/society.html', '/us-mexico.html'],
    menu: [
      { group: 'Mexico by topic', links: [
        { label: 'Economy & money', href: '/economy.html' },
        { label: 'Payments', href: '/payments.html' },
        { label: 'Trade', href: '/trade.html' },
        { label: 'Politics', href: '/politics.html' },
        { label: 'Society & security', href: '/society.html' },
        { label: 'U.S.–Mexico', href: '/us-mexico.html' },
      ] },
    ] },
  { label: 'Sources', href: '/sources.html' },
  { label: 'About', href: '/about.html' },
  { label: 'Subscribe', href: '/weekly.html', cta: true },
];
