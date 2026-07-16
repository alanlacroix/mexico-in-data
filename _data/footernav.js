// The footer keeps the two utility links. About now lives in the masthead.
// Rendered identically on every page by _includes/partials/footer.njk.
module.exports = [
  { label: 'Latest', href: '/latest.html' },
  { label: 'Explore', href: '/explore.html' },
  { label: 'Sources', href: '/sources.html' },
  { label: 'About', href: '/about.html' },
  { label: 'Weekly',  href: '/weekly.html' },
  // Demoted from the top nav in the 2026-07-16 prune — kept reachable here, not orphaned.
  // Atlas is receipts (official municipal data) but moves on an annual cadence; Payments is
  // depth that folds under Economy. Both cited-worthy, neither a masthead item.
  { label: 'Atlas',    href: '/atlas.html' },
  { label: 'Payments', href: '/payments.html' },
  { label: 'Privacy', href: '/privacy.html' },
];
