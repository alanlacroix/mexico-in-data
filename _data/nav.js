// The header navigation — rendered identically on every page (see partials/header.njk). The current
// page ("here") is DERIVED from the URL, never hand-set. The topic rooms and the Model live under a single
// "Topics" dropdown — one identity with rooms off it, not ten competing links. Sources NEVER leaves the
// top level (a trust product shows its receipts in the masthead). About is also top-level: the site is
// personal, and Alan wants the method and authorship visible rather than buried in the footer.
// Subscribe remains the one call-to-action. `match` lists the pages that light "Topics" as active.
// Prune (Fable 2026-07-16, "less but more relevant" — a surface stays only if the pipeline
// keeps it true AND a reader would cite it): Overview and The Model are CUT (a rotting static
// guide; a scenario tool is opinion-by-slider on a receipts site — both parked + redirected).
// Payments MERGES into Economy and Atlas is DEMOTED — both leave the top nav for the footer so
// the masthead reads as the reader's map of Mexico, not the founder's résumé. Sources stays
// top-level (a trust product shows its receipts); About stays (method + authorship visible).
module.exports = [
  { label: 'Brief', href: '/' },
  { label: 'Charts', href: '/chart.html' },         // the metric explorer: every variable, one place
  {
    label: 'Topics',
    match: ['/economy.html', '/payments.html', '/trade.html', '/politics.html', '/society.html', '/us-mexico.html'],
    menu: [
      { group: 'Sections', links: [
        { label: 'Economy & money', href: '/economy.html' },
        { label: 'Trade', href: '/trade.html' },
        { label: 'Politics', href: '/politics.html' },
        { label: 'Society & security', href: '/society.html' },
        { label: 'U.S.–Mexico', href: '/us-mexico.html' },
      ] },
    ],
  },
  { label: 'Sources', href: '/sources.html' },
  { label: 'About', href: '/about.html' },
  { label: 'Subscribe', href: '/weekly.html', cta: true },
];
