// buildTime.js — the build/deploy timestamp, for sitemap <lastmod> and structured-data
// dateModified. The site rebuilds and redeploys on every data refresh (~4x/day), so this
// is an honest freshness signal for crawlers. Plain build-time Node; new Date() is fine here.
module.exports = () => new Date().toISOString();
