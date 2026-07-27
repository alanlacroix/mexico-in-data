import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { trendWord, bandWord, stanceWord, staleness, balanceWord } from '../../assets/prose.mjs';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const routes = require(path.join(root, '_data', 'topicRoutes.js'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const paymentSeries = (id) => JSON.parse(fs.readFileSync(path.join(root, 'data', 'series', `${id}.json`), 'utf8')).data;
const debitOps = paymentSeries('banxico-tpv-debito-ops');
const creditOps = paymentSeries('banxico-tpv-credito-ops');
const sharedCardDates = debitOps.map((row) => row.date).filter((date) => creditOps.some((row) => row.date === date)).sort();
const latestCardDate = sharedCardDates.at(-1);
const latestDebitOps = debitOps.find((row) => row.date === latestCardDate);
const latestCreditOps = creditOps.find((row) => row.date === latestCardDate);
const expectedCardPurchases = ((Number(latestDebitOps.value) + Number(latestCreditOps.value)) / 1e9)
  .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const expectedDebitShare = (Number(latestDebitOps.value) / (Number(latestDebitOps.value) + Number(latestCreditOps.value)) * 100)
  .toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const original = {
  document: globalThis.document,
  fetch: globalThis.fetch,
  window: globalThis.window,
  innerWidth: globalThis.innerWidth,
  location: globalThis.location,
  scrollTo: globalThis.scrollTo,
};
const quarterlyLeads = [];

for (const route of routes) {
  const html = fs.readFileSync(path.join(root, '_site', route.permalink.slice(1)), 'utf8');
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`${route.key}: module script missing`);
  const code = match[1].replace(/import \{treemapSVG,humanSrc\} from '[^']+';/,
    "const treemapSVG=()=>'<svg role=\"img\"></svg>'; const humanSrc=(u)=>u; ")
    .replace(/import \{trendWord,bandWord,stanceWord,staleness,balanceWord\} from '[^']+';/, '');

  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', className: '', value: '',
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {},
    });
    return nodes.get(selector);
  };
  globalThis.document = { querySelector: node, querySelectorAll: () => [] };
  globalThis.window = globalThis;
  globalThis.innerWidth = 1200;
  globalThis.location = { href: route.permalink };
  globalThis.scrollTo = () => {};
  let reported = '';
  globalThis.reportMexicoDataError = (resource) => { reported = resource; };
  globalThis.fetch = async (url) => {
    const relative = String(url).replace(/^\//, '');
    const file = path.join(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  await new AsyncFunction('trendWord', 'bandWord', 'stanceWord', 'staleness', 'balanceWord', code)(trendWord, bandWord, stanceWord, staleness, balanceWord);
  const output = node('#topicApp').innerHTML;
  if (reported) throw new Error(`${route.key}: rendered the failure state (${reported})`);
  const storyPage = output.includes('story-sec');
  for (const required of [
    'Quarterly review', 'class="lead"',
    'What changed this quarter', 'What I expect by the next review', 'What to watch',
    'Sources and method', 'Published Jul 24, 2026', 'Data through Jun 30, 2026'
  ]) {
    if (!output.includes(required)) throw new Error(`${route.key}: missing ${required}`);
  }
  const watchIndex = output.indexOf('What to watch');
  const latestIndex = output.indexOf('Latest developments');
  if (latestIndex !== -1 && latestIndex < watchIndex) {
    throw new Error(`${route.key}: latest developments must follow the quarterly analysis and watch list`);
  }
  if (output.includes('Last revised')) throw new Error(`${route.key}: quarterly analysis must not claim a live revision date`);
  for (const removed of ['Latest readings', 'Where things stand', 'class="reading-card"']) {
    if (output.includes(removed)) throw new Error(`${route.key}: removed dashboard block returned (${removed})`);
  }
  const outlookCount = (output.match(/class="outlook-item"/g) || []).length;
  if (outlookCount < 1 || outlookCount > 3) throw new Error(`${route.key}: expected one to three outlook calls, found ${outlookCount}`);
  // Fable's anti-relapse guard (2026-07-20): the letter register is enforced by budget,
  // not judgment. Prose = the lead + story paragraphs; scaffolding strings are banned.
  if (storyPage) {
    for (const banned of ['So what', 'What it shows', 'What it does not show']) {
      if (output.includes(banned)) throw new Error(`${route.key}: banned scaffolding string "${banned}"`);
    }
    const prose = [...output.matchAll(/<p class="(?:lead|story-p)">([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, ' '));
    const words = prose.join(' ').split(/\s+/).filter(Boolean).length;
    if (words > 700) throw new Error(`${route.key}: ${words} prose words (cap 700)`);
    const chartCount = (output.match(/class="chart-card/g) || []).length;
    if (chartCount > 4) throw new Error(`${route.key}: ${chartCount} charts (cap 4)`);
    const countNums = (text) => {
      const cleaned = text
        .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{1,2}\b/g, ' ')
        .replace(/\b(?:19|20)\d{2}\b/g, ' ')
        .replace(/\bQ[1-4]\b/g, ' ')
        .replace(/\b\d+-year\b/g, ' ');
      return (cleaned.match(/\d[\d,.]*(?:\s*(?:to|-)\s*\d[\d,.]*)?%?/g) || []).length;
    };
    let pageNums = 0;
    for (const p of prose) {
      const n = countNums(p);
      pageNums += n;
      if (n > 4) throw new Error(`${route.key}: a paragraph carries ${n} numbers (cap 4): "${p.slice(0, 80)}"`);
    }
    if (pageNums > 18) throw new Error(`${route.key}: ${pageNums} prose numbers (cap 18)`);
    if (!/\b(?:My concern is|My expectation is|My working assumption is|My base case is|I expect|I think|I prefer|I would|I am|I do not)\b/.test(output)) {
      throw new Error(`${route.key}: substantial analysis must state Alan's view in ordinary first-person language`);
    }
    if (!/\b(?:I would (?:change|revisit|become|turn)|would make me|would do the opposite|would change the picture)\b/i.test(output)) {
      throw new Error(`${route.key}: substantial analysis must say what evidence would change Alan's view`);
    }
  }
  const leadHtml = output.match(/<p class="lead">([\s\S]*?)<\/p>/)?.[1] || '';
  const leadParagraphs = leadHtml.split('<br><br>').map((p) => p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  if (leadParagraphs.length !== 2 || leadParagraphs.some((p) => !p)) {
    throw new Error(`${route.key}: My view must contain exactly two substantial paragraphs`);
  }
  if (!/\b(?:but|because|while|means|which|so|whether|tells us|leaves|gives)\b/i.test(leadParagraphs[0])) {
    throw new Error(`${route.key}: first My view paragraph must explain the relationship behind its evidence`);
  }
  if (!/\b(?:investor|operator|company|companies|business|bank|retailer|processor|merchant|lender|employer|supplier|factory|plant)\w*\b/i.test(leadParagraphs[1])) {
    throw new Error(`${route.key}: second My view paragraph must end in a practical implication`);
  }
  quarterlyLeads.push({ topic: route.key, p1: leadParagraphs[0], p2: leadParagraphs[1] });
  const proseOnly = [...output.matchAll(/<p class="(?:lead|story-p)">([\s\S]*?)<\/p>/g)].map((m) => m[1]).join(' ');
  if (proseOnly.includes('$0.0')) throw new Error(`${route.key}: a prose value was rounded from the wrong unit`);
  if (route.key === 'economy') {
    if (!output.includes('Mexico looks stable, but it is not growing much')) {
      throw new Error('economy: My view must make the stability/weak-growth argument');
    }
    for (const required of [
      'The figures are sourced. The argument and forecasts are mine.',
      'higher than a year earlier in Q1 2026',
      "target range applies to headline inflation, not core",
      'nominal stock of commercial-bank credit',
      'Real fixed investment was 5.1% higher than a year earlier in April 2026'
    ]) {
      if (!output.includes(required)) throw new Error(`economy: missing evidence guard "${required}"`);
    }
    for (const banned of ['Two growth numbers disagree', 'target band tops out at 4%', 'Fixed investment fell from 23.8%']) {
      if (output.includes(banned)) throw new Error(`economy: stale or misleading claim "${banned}"`);
    }
  }
  if (route.key === 'payments') {
    // Headings are findings with numbers (business-writing house rules, 2026-07-21), so they
    // interpolate. Assert the shape, not a frozen string.
    for (const headline of [/Cash in circulation grew [\d.]+% in a year|Cash in circulation/, /lost to plain transfers/, /counter still beats the internet/]) {
      if (!headline.test(output)) throw new Error(`payments: missing section matching ${headline}`);
    }
    if (!output.includes(`${expectedCardPurchases} billion`)) throw new Error(`payments: card purchases do not match the source operations (${expectedCardPurchases}bn)`);
    if (!output.includes(expectedDebitShare)) throw new Error(`payments: debit share is not computed from the same quarter (${expectedDebitShare}%)`);
    if (!["INEGI's 2024 survey", 'more than eight in ten adults', 'cash for small purchases'].every((text) => output.includes(text))) {
      throw new Error('payments: the ENIF survey attribution, vintage and scope must appear in the prose');
    }
    if (output.includes('1,169bn MXN')) throw new Error('payments: quarantined debit-card value still appears editorially');
  }
  if (route.key === 'usmexico' && !output.includes('United States–Mexico–Canada Agreement (USMCA)')) {
    throw new Error('usmexico: USMCA must be written out on first use');
  }
  if (output.includes('waiting for its required source data')) throw new Error(`${route.key}: failed closed with complete fixture data`);
}

const allLeadCopy = quarterlyLeads.map(({ p1, p2 }) => `${p1} ${p2}`).join(' ');
if ((allLeadCopy.match(/My base case/g) || []).length > 1) {
  throw new Error('quarterly views: "My base case" may appear on at most one topic');
}
const p2Openers = new Map();
for (const { topic, p2 } of quarterlyLeads) {
  const opener = p2.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  const topics = p2Openers.get(opener) || [];
  topics.push(topic);
  p2Openers.set(opener, topics);
}
for (const [opener, topics] of p2Openers) {
  if (topics.length > 2) throw new Error(`quarterly views: repeated paragraph-two opening "${opener}" on ${topics.join(', ')}`);
}

Object.assign(globalThis, original);
console.log('topic-render-smoke: ok');
