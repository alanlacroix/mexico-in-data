const fs = require('node:fs');
const path = require('node:path');
const { editorialDay } = require('../pipeline/lib/news-day.cjs');
const { plainExplanation, plainHeadline } = require('../pipeline/lib/plain-language.cjs');
const nowBoard = require('./nowBoard.js');

const read = (rel, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', rel), 'utf8')); }
  catch { return fallback; }
};
const clean = (value) => String(value || '').trim();

module.exports = function (now = new Date()) {
  const editorial = read('home-editorial.json');
  const brief = read('brief.json', {});
  const clock = now instanceof Date || typeof now === 'string' || typeof now === 'number' ? now : new Date();
  const forDate = editorialDay(clock);
  if (clean(brief.meta?.editorialDate) !== forDate) return null;

  const numbersById = new Map(nowBoard().map((item) => [item.id, item]));
  const withNumbers = (entry) => ({
    ...entry,
    text: plainExplanation(entry.text),
    storyLabel: plainHeadline(entry.storyLabel),
    numbers: (entry.seriesIds || []).map((id) => numbersById.get(id)).filter(Boolean),
  });
  const reviewed = editorial?.forDate === forDate ? editorial : null;
  let myRead = reviewed?.myRead ? withNumbers({ label: 'My read', ...reviewed.myRead }) : null;

  if (!myRead) {
    const claims = [brief.lead, ...(Array.isArray(brief.items) ? brief.items : [])]
      .filter(Boolean);
    for (const rule of read('connection-rules.json', { rules: [] }).rules || []) {
      let pattern;
      try { pattern = new RegExp(rule.pattern, 'i'); } catch { continue; }
      const claim = claims.find((item) => pattern.test(`${item.h1 || item.headline || ''} ${item.context || ''}`));
      if (!claim) continue;
      myRead = withNumbers({
        label: 'Connection to watch', text: clean(rule.text),
        storyLabel: clean(claim.h1 || claim.headline), storyUrl: clean(claim.href || claim.url),
        seriesIds: rule.seriesIds || [],
      });
      break;
    }
  }

  const sourceState = reviewed?.sourceState || null;
  return myRead || sourceState ? { forDate, myRead, sourceState } : null;
};
