// The header navigation — rendered identically on every page (see partials/header.njk). The current
// page ("here") is DERIVED from the URL, never hand-set. Sources NEVER leaves the top level (a trust
// product shows its receipts in the masthead). About stays top-level: the site is personal, and Alan
// wants method and authorship visible. The Subscribe call-to-action is withdrawn with the weekly email (2026-08-03).
// 2026-07-20 (Alan: "any better way to access these pages"): the six topic story pages come out from
// behind Explore and live in a Topics dropdown — one click from anywhere. `match` lights it as active.
// 2026-08-01 (Alan landed the seven-section structure): Topics becomes Sections; Payments & fintech
// leads (his lane), Deals and Energy & infrastructure join as new pages, Trade folds into U.S.–Mexico
// (trade.html stays live and reachable from that room, just off the menu).
module.exports = [
  { label: 'Brief', href: '/' },
  { label: 'Atlas', href: '/atlas.html' },
  { label: 'Quarterly review',
    match: ['/economy.html', '/payments.html', '/deals.html', '/politics.html', '/society.html', '/us-mexico.html', '/energy.html'],
    menu: [
      { group: 'Mexico by topic', links: [
        { label: 'Payments & fintech', href: '/payments.html' },
        { label: 'Deals & investment', href: '/deals.html' },
        { label: 'Economy & money', href: '/economy.html' },
        { label: 'US & Mexico', href: '/us-mexico.html' },
        { label: 'Politics', href: '/politics.html' },
        { label: 'Security & society', href: '/society.html' },
        { label: 'Energy & infrastructure', href: '/energy.html' },
      ] },
    ] },
  { label: 'Sources', href: '/sources.html' },
  { label: 'About', href: '/about.html' },
];
