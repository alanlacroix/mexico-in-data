// The header navigation — rendered identically on every page (see partials/header.njk). The current
// page ("here") is DERIVED from the URL, never hand-set. Fable's nav ruling (2026-07-11): six top-level
// slots, one spine. The six topic rooms + the two analyst tools (Model, Journal) live under a single
// "Topics" dropdown — one identity with rooms off it, not ten competing links. Sources NEVER leaves the
// top level (a trust product shows its receipts in the masthead). Subscribe is the one call-to-action;
// About lives in the footer. `match` lists the pages that light "Topics" as the active section.
module.exports = [
  { label: 'Brief', href: '/' },
  {
    label: 'Topics',
    match: ['/economy.html', '/money.html', '/payments.html', '/trade.html', '/politics.html', '/security.html', '/society.html', '/us-mexico.html', '/trade.html', '/model.html', '/the-read.html'],
    menu: [
      { group: 'Sections', links: [
        { label: 'Economy', href: '/economy.html' },
        { label: 'Money', href: '/money.html' },
        { label: 'Payments', href: '/payments.html' },
        { label: 'Trade', href: '/trade.html' },
        { label: 'Politics', href: '/politics.html' },
        { label: 'Security', href: '/security.html' },
        { label: 'Society', href: '/society.html' },
        { label: 'U.S.–Mexico', href: '/us-mexico.html' },
      ] },
      { group: 'Lab', links: [
        { label: 'The Read', href: '/the-read.html' },
        { label: 'The Model', href: '/model.html' },
        // Decision Journal cut from the nav (Fable 2026-07-11): a standalone tool disconnected from the
        // briefing confuses even its owner. It returns only when it's fed by real briefing items ("pin
        // this number to my journal") AND Alan uses it weekly. The page still exists at /journal.html.
      ] },
    ],
  },
  { label: 'Atlas', href: '/atlas.html' },
  { label: 'Sources', href: '/sources.html' },
  { label: 'About', href: '/about.html' },
  { label: 'Subscribe', href: '/weekly.html', cta: true },
];
