// The header navigation — rendered identically on every page (see partials/header.njk). The current
// page ("here") is DERIVED from the URL, never hand-set. The topic rooms and the Model live under a single
// "Topics" dropdown — one identity with rooms off it, not ten competing links. Sources NEVER leaves the
// top level (a trust product shows its receipts in the masthead). About is also top-level: the site is
// personal, and Alan wants the method and authorship visible rather than buried in the footer.
// Subscribe remains the one call-to-action. `match` lists the pages that light "Topics" as active.
module.exports = [
  { label: 'Brief', href: '/' },
  { label: 'Overview', href: '/overview.html' },
  // The Read removed (Alan 2026-07-13): the Brief already carries the analysis, numbers and data. Keep only
  // what stays incredibly accurate and name-worthy; the standalone opinion surface was neither.
  { label: 'Charts', href: '/chart.html' },         // the metric explorer: every variable, one place (Alan 2026-07-12)
  {
    label: 'Topics',
    match: ['/economy.html', '/payments.html', '/trade.html', '/politics.html', '/society.html', '/us-mexico.html', '/model.html'],
    menu: [
      { group: 'Sections', links: [
        { label: 'Economy & money', href: '/economy.html' },
        { label: 'Payments', href: '/payments.html' },
        { label: 'Trade', href: '/trade.html' },
        { label: 'Politics', href: '/politics.html' },
        { label: 'Society & security', href: '/society.html' },
        { label: 'U.S.–Mexico', href: '/us-mexico.html' },
      ] },
      { group: 'Lab', links: [
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
