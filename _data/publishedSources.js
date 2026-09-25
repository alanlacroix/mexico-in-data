const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function sourcesFromEdition(edition) {
  if (!edition) return [];
  const stories = [...(edition.stories || []), ...(edition.weekStories || [])];
  const storySources = stories.flatMap((story) => story.sources || story.evidence || []);
  const weeklySources = (edition.weeklyBrief?.items || []).flatMap((item) => item.sources || []);
  return [...storySources, ...weeklySources];
}

module.exports = function () {
  const current = readJson(path.join(ROOT, 'data', 'edition.json'));
  const historyDir = path.join(ROOT, 'data', 'editions');
  const history = fs.existsSync(historyDir)
    ? fs.readdirSync(historyDir).filter((name) => name.endsWith('.json')).map((name) => readJson(path.join(historyDir, name)))
    : [];
  const unique = new Map();
  for (const source of [current, ...history].flatMap(sourcesFromEdition)) {
    const name = source.source || source.name;
    if (!name || !source.url) continue;
    const key = `${name}\n${source.url}`;
    if (!unique.has(key)) unique.set(key, { name, url: source.url });
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
};
