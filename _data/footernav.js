// The footer keeps the two utility links. About now lives in the masthead.
// Rendered identically on every page by _includes/partials/footer.njk.
// Atlas and About are promoted to the masthead (Alan 2026-07-17: "why are they hidden in the
// footer"). The footer keeps utility + secondary depth.
module.exports = [
  { label: 'Explore', href: '/explore.html' },
  { label: 'Sources', href: '/sources.html' },
  { label: 'Weekly',  href: '/weekly.html' },
  { label: 'Payments', href: '/payments.html' },
  { label: 'Privacy', href: '/privacy.html' },
];
