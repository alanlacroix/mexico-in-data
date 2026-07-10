// Eleventy config. STEP 1 = pass-through: existing .html are copied verbatim
// (byte-identical, same URLs) while the component migration happens page by page.
// As each page is converted to a Nunjucks template, it moves out of the passthrough
// glob below and into the template system. Output is pure static HTML to _site.
module.exports = function (ec) {
  ec.addPassthroughCopy('*.html');   // existing pages, verbatim — no template processing yet
  ec.addPassthroughCopy('design');   // stylesheet
  ec.addPassthroughCopy('data');     // the pre-baked JSON the site fetches
  return {
    dir: { input: '.', output: '_site', includes: '_includes', data: '_data' },
    templateFormats: ['njk'],        // only .njk are processed; .html pass through
  };
};
