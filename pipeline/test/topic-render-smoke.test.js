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
  if (storyPage && (output.match(/class="story-so"/g) || []).length < 3) throw new Error(`${route.key}: story page carries fewer than 3 So-what strips`);
  for (const required of storyPage
    ? ["What's moving", 'Sources and method', 'What it does not show']
    : ['Snapshot', 'What changed', 'Sources and method']) {
    if (!output.includes(required)) throw new Error(`${route.key}: missing ${required}`);
  }
  if (['society', 'usmexico'].includes(route.key) && !output.includes(expectedRemittance)) {
    throw new Error(`${route.key}: remittances do not match the latest million-US-dollar source value (${expectedRemittance})`);
  }
  if (route.key === 'usmexico' && output.includes('$0.0bn')) throw new Error('usmexico: remittances were rounded from the wrong unit');
  if (route.key === 'society') {
    if (!output.includes(expectedMinimumWage)) throw new Error(`society: minimum wage must identify Mexican pesos (${expectedMinimumWage})`);
    if (!output.includes(expectedCrimePeriod)) throw new Error(`society: SESNSP period must render as ${expectedCrimePeriod}`);
    if (output.includes('raw annual count') || output.includes('annual reported-offense count')) {
      throw new Error('society: the SESNSP year-to-date total must not be described as annual');
    }
    if (!output.includes('year-to-date count')) throw new Error('society: SESNSP total must be labeled year to date');
  }
  if (route.key === 'payments') {
    // Story contract (Fable plan 2026-07-20): five sections, every judgment word derived.
    for (const headline of ['Cash is still how most of Mexico pays', 'When money moves digitally, it moves over SPEI', 'CoDi never took off', 'Online card buying is still a fraction of in-store card use']) {
      if (!output.includes(headline)) throw new Error(`payments: missing story section "${headline}"`);
    }
    if (!output.includes(`${expectedCardPurchases} billion purchases a quarter`)) throw new Error(`payments: combined card purchases do not match the source operations (${expectedCardPurchases}bn)`);
    if (!output.includes(`${expectedDebitShare}%</b> of those purchases used a debit card`)) throw new Error(`payments: debit share is not computed from the same quarter (${expectedDebitShare}%)`);
    if (!output.includes('85.2%</b> of adults said cash was their usual payment method')) throw new Error('payments: ENIF cash figure must preserve the adult-response denominator');
    if (!output.includes('ENIF 2024')) throw new Error('payments: the survey vintage must appear in the sentence');
    if (!/under review after a jump far outside its own history|series SF62279 is excluded/.test(output)) throw new Error('payments: anomalous debit-card value is not visibly quarantined');
    if (output.includes('1,169bn MXN')) throw new Error('payments: quarantined debit-card value still appears editorially');
    const storyCharts = (output.match(/evidence-shell/g) || []).length;
    if (storyCharts < 4) throw new Error(`payments: expected at least 4 inline charts, found ${storyCharts}`);
    for (const banned of ['—', 'surged', 'soared', 'plunged', 'robust', 'landscape', 'ecosystem', 'testament', 'currently']) {
      if (output.includes(banned)) throw new Error(`payments: banned word or mark in story prose: "${banned}"`);
    }
  }
  if (output.includes('waiting for its required source data')) throw new Error(`${route.key}: failed closed with complete fixture data`);
}

Object.assign(globalThis, original);
console.log('topic-render-smoke: ok');
