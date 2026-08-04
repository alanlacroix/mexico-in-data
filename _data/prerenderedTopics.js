// The build-time render of each quarterly review, produced by
// pipeline/prerender-topics.mjs before eleventy runs. Missing or unreadable means every
// room falls back to the static core in topic-pages.njk, which is the whole point of
// keeping that core around.
const fs = require('node:fs');
const path = require('node:path');

module.exports = function () {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'prerendered-topics.json'), 'utf8'));
  } catch {
    return {};
  }
};
