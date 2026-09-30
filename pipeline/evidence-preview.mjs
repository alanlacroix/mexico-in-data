// Read-only evidence packet for human/independent recovery review. No model calls,
// publication or accounting mutation. Uploaded only as a short-lived CI artifact.
import fs from 'node:fs';
import { candidateUniverse, evidenceFor } from './build-edition.mjs';
import newsDay from './lib/news-day.cjs';
import publicEdition from './lib/public-edition.cjs';
import editionHistory from './lib/edition-history.cjs';
const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const now = new Date();
const date = newsDay.editorialDay(now);
const current = read('edition.json');
if (current.editorialDate === date) {
  console.log(JSON.stringify({editorialDate:date, needed:false}));
} else {
  const schedule = read('events.json');
  const universe = await candidateUniverse(now, schedule, date);
  const memory = editionHistory.issueMemory(editionHistory.loadHistory({current}), {before:date});
  const standing = read('standing.json').facts || [];
  const calendar = (schedule.events || []).filter(event => event.date >= publicEdition.previousDay(date));
  const rows = await Promise.all(universe.slice(0,5).map(async (item,index) => ({
    index, item, evidence:await evidenceFor(item,standing,calendar,memory),
  })));
  console.log(JSON.stringify({editorialDate:date,capturedAt:now.toISOString(),rows},null,2));
}
