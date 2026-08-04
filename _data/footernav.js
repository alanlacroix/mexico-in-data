// The footer keeps the two utility links. About now lives in the masthead.
// Rendered identically on every page by _includes/partials/footer.njk.
// Atlas and About are promoted to the masthead (Alan 2026-07-17: "why are they hidden in the
// footer"). The footer keeps utility + secondary depth.
// Utility only. The quarterly rooms render in the footer straight from nav.js
// (2026-08-03) — the stray hand-kept 'Payments' entry here was the drift that
// prompted the change.
// Privacy withdrawn 2026-08-03 (Alan). The page existed for a subscribe form that is
// no longer rendered anywhere; nothing on the site collects a reader's data now.
module.exports = [
  { label: 'Sources', href: '/sources.html' },
];
