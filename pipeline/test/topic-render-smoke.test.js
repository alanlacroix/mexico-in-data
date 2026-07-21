import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { trendWord, bandWord, stanceWord, staleness, balanceWord } from '../../assets/prose.js';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const routes = require(path.join(root, '_data', 'topicRoutes.js'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const remittances = JSON.parse(fs.readFileSync(path.join(root, 'data', 'series', 'banxico-remesas.json'), 'utf8'));
const latestRemittanceBillions = Number(remittances.data.at(-1).value) / 1000;
const expectedRemittance = `$${latestRemittanceBillions.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}bn`;
const minimumWage = JSON.parse(fs.readFileSync(path.join(root, 'data', 'series', 'banxico-salario-minimo.json'), 'utf8'));
const expectedMinimumWage = `MX$${Number(minimumWage.data.at(-1).value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
const crime = JSON.parse(fs.readFileSync(path.join(root, 'data', 'layers', 'sesnsp-delitos.json'), 'utf8'));
const crimeVintage = /^(\d{4})-(\d{2})/.exec(String(crime.meta?.vintage || ''));
if (!crimeVintage || !/acumulado del año/i.test(`${crime.meta?.units || ''} ${crime.meta?.notes || ''}`)) {
  throw new Error('society: SESNSP fixture must identify a cumulative year-to-date observation');
}
const crimeEndMonth = new Date(`${crimeVintage[1]}-${crimeVintage[2]}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const expectedCrimePeriod = crimeEndMonth === 'Jan' ? `Jan ${crimeVintage[1]}` : `Jan–${crimeEndMonth} ${crimeVintage[1]}`;

const original = {
  document: globalThis.document,
  fetch: globalThis.fetch,
  window: globalThis.window,
  innerWidth: globalThis.innerWidth,
  location: globalThis.location,
  scrollTo: globalThis.scrollTo,
};

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
  for (const required of storyPage
    ? ['class="lead"', "What's moving", 'What could change this page', 'Sources and method']
    : ['Snapshot', 'What changed', 'Sources and method']) {
    if (!output.includes(required)) throw new Error(`${route.key}: missing ${required}`);
  }
  // Fable's anti-relapse guard (2026-07-20): the letter register is enforced by budget,
  // not judgment. Prose = the lead + story paragraphs; scaffolding strings are banned.
  if (storyPage) {
    for (const banned of ['So what', 'What it shows', 'What it does not show']) {
      if (output.includes(banned)) throw new Error(`${route.key}: banned scaffolding string "${banned}"`);
    }
    const prose = [...output.matchAll(/<p class="(?:lead|story-p)">([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, ' '));
    const words = prose.join(' ').split(/\s+/).filter(Boolean).length;
    if (words > 520) throw new Error(`${route.key}: ${words} prose words (cap 520)`);
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
    if (pageNums > 13) throw new Error(`${route.key}: ${pageNums} prose numbers (cap 13)`);
  }
  // One home per series (Fable 2026-07-20): the remittances number lives on Society only.
  if (route.key === 'society' && !output.includes(expectedRemittance)) {
    throw new Error(`society: remittances do not match the latest million-US-dollar source value (${expectedRemittance})`);
  }
  const proseOnly = [...output.matchAll(/<p class="(?:lead|story-p)">([\s\S]*?)<\/p>/g)].map((m) => m[1]).join(' ');
  if (proseOnly.includes('$0.0')) throw new Error(`${route.key}: a prose value was rounded from the wrong unit`);
  // One home per series (Fable 2026-07-20): the wage lives on Economy; Society links to it.
  if (route.key === 'economy') {
    if (!output.includes(expectedMinimumWage)) throw new Error(`economy: minimum wage must identify Mexican pesos (${expectedMinimumWage})`);
  }
  if (route.key === 'society') {
    if (!output.includes(expectedCrimePeriod)) throw new Error(`society: SESNSP period must render as ${expectedCrimePeriod}`);
    if (output.includes('raw annual count') || output.includes('annual reported-offense count')) {
      throw new Error('society: the SESNSP year-to-date total must not be described as annual');
    }
    if (!output.includes('year-to-date count')) throw new Error('society: SESNSP total must be labeled year to date');
  }
  if (route.key === 'payments') {
    // Headings are findings with numbers (business-writing house rules, 2026-07-21), so they
    // interpolate. Assert the shape, not a frozen string.
    for (const headline of [/Cash still wins [\d.]+% of everyday purchases/, /SPEI carries [\d,]+ million transfers a day/, /[\d.]+% of card purchases are debit, not credit/]) {
      if (!headline.test(output)) throw new Error(`payments: missing section matching ${headline}`);
    }
    if (!output.includes(`${expectedCardPurchases} billion`)) throw new Error(`payments: card purchases do not match the source operations (${expectedCardPurchases}bn)`);
    if (!output.includes(`${expectedDebitShare}% used a debit card`)) throw new Error(`payments: debit share is not computed from the same quarter (${expectedDebitShare}%)`);
    if (!output.includes('of adults told INEGI')) throw new Error('payments: the ENIF survey figure and vintage must appear in the prose');
    if (output.includes('1,169bn MXN')) throw new Error('payments: quarantined debit-card value still appears editorially');
  }
  if (output.includes('waiting for its required source data')) throw new Error(`${route.key}: failed closed with complete fixture data`);
}

Object.assign(globalThis, original);
console.log('topic-render-smoke: ok');
