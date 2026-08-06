import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { trendWord, bandWord, stanceWord, staleness, balanceWord } from '../../assets/prose.mjs';
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

// Fable's guard (2026-08-01): in an anatomy builder, the hand-written judgment
// strings — My view, its falsifier, and What changed this quarter — may
// interpolate number formatters but must contain NO conditionals. A view that
// flips direction when data crosses a threshold is judgment laundered as
// computation; it must change by revision, not by ternary. The twin failure,
// hardcoding today's values, is caught by the live reads around it.
{
  const src = fs.readFileSync(path.join(root, 'topic-pages.njk'), 'utf8');
  for (const m of src.matchAll(/function (\w+Topic)\(\)\{/g)) {
    const from = m.index;
    const next = src.indexOf('\nfunction ', from + 1);
    const body = src.slice(from, next < 0 ? src.length : next);
    if (!/anatomy:\s*true/.test(body)) continue;
    for (const field of ['view:', 'quarter:']) {
      const at = body.indexOf(field);
      if (at < 0) throw new Error(`${m[1]}: anatomy builder is missing ${field}`);
      const chunk = body.slice(at, body.indexOf('\n    ', at + 200) + 1 || undefined).slice(0, 3000);
      if (/\?[^:]{0,120}:/.test(chunk.replace(/https?:[^\s'"`]+/g, '')) || /&&|\|\|/.test(chunk)) {
        throw new Error(`${m[1]}: ${field} contains a conditional — judgment must change by revision, not by ternary`);
      }
    }
  }
}

// The claims ledger: each converted page keeps the judgment its letter earned.
// Re-pointed 2026-08-03 after the plain-language rewrite. The ledger protects the
// JUDGMENT, not the wording, and every one of these judgments survived the rewrite
// stated more concretely. Each anchor below was checked against the new prose:
//   economy   'central fact'          -> 'one number explains most of this page'
//   usmexico  'long horizon'          -> 'the horizon is the more expensive loss'
//   politics  'missed statutory date' -> 'slips past its constitutional date'
//   payments  'what adoption displaces' -> 'adding occasions to pay rather than taking'
// If a rewrite ever drops the judgment rather than rephrasing it, restore the sentence.
// Do not weaken an anchor to make a test pass.
const CLAIMS = {
  economy: 'one number explains most of this page',
  usmexico: 'the horizon is the more expensive loss',
  politics: 'slips past its constitutional date',
  society: 'cost of operating',
  payments: 'adding occasions to pay rather than taking',
};

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
  // ===== THE SECTION ANATOMY (Fable ruling 2026-08-01) =====
  // Converted pages must meet the reader in ONE fixed order. This is the
  // anti-drift test: it is what makes seven sections feel like one publication.
  // Remote's edition contract (2026-08-01) holds on every quarterly page whatever
  // its internal module names: the quarterly label, the dated edition stamps, and
  // the sourcing contract line. The anatomy governs the modules; this governs the head.
  for (const required of ['Quarterly review', 'class="lead"', 'Published Jul 24, 2026', 'Data through Jun 30, 2026', 'The figures are sourced']) {
    if (!output.includes(required)) throw new Error(`${route.key}: missing ${required}`);
  }
  const anatomyPage = output.includes('anatomy-page');
  const storyPage = !anatomyPage && output.includes('story-sec');
  if (anatomyPage) {
    const ORDER = ['Start here', 'How it works', 'The numbers', 'What changed this quarter', "What's ahead", 'My view', 'The record', 'Sources and method'];
    let cursor = -1;
    for (const heading of ORDER) {
      const at = output.indexOf('>' + heading + '<');
      if (at < 0) throw new Error(`${route.key}: anatomy is missing the "${heading}" module`);
      if (at < cursor) throw new Error(`${route.key}: "${heading}" is out of the fixed anatomy order`);
      cursor = at;
    }
    if (!/Last revised \w{3} \d{1,2}, \d{4}/.test(output)) throw new Error(`${route.key}: the walkthrough must carry a revised date`);
    for (const label of ['What is true now', 'What changed', 'What to watch']) {
      if (!output.includes(label)) throw new Error(`${route.key}: Start here is missing "${label}"`);
    }
    const slotCount = (output.match(/class="slot"/g) || []).length;
    const readCount = (output.match(/class="slot-read"/g) || []).length;
    if (!slotCount) throw new Error(`${route.key}: the anatomy needs at least one number slot`);
    if (slotCount !== readCount) throw new Error(`${route.key}: ${slotCount} slots but ${readCount} reads — every slot carries a read`);
    if (!output.includes('What would change my mind')) throw new Error(`${route.key}: My view must end with what would change it`);
    if (/opens in October|first quarterly view/i.test(output)) throw new Error(`${route.key}: placeholder copy must not ship`);
  } else {
    for (const required of storyPage
      ? ['class="lead"', "What's moving", 'What could change this page', 'Sources and method']
      : ['Snapshot', 'What changed', 'Sources and method']) {
      if (!output.includes(required)) throw new Error(`${route.key}: missing ${required}`);
    }
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
    if (words > 850) throw new Error(`${route.key}: ${words} prose words (cap 850)`);
    const chartCount = (output.match(/class="chart-card/g) || []).length;
    if (chartCount > 5) throw new Error(`${route.key}: ${chartCount} charts (cap 5)`);
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
    // A figure states its case ONCE (Alan 2026-07-21: "this just sounds clunky, hard for me
    // to read"). The lead and section one were repeating the same number 40 words apart, so
    // the reader read it twice and the page dragged. The lead makes the claim; a section
    // must advance it, not restate it.
    // Strip trailing punctuation BEFORE testing for a year, or "2026." slips past the year
    // filter and reads as a repeated figure.
    const figures = (text) => new Set((text.match(/\d[\d,]*\.?\d*%?/g) || [])
      .map((n) => n.replace(/[,.]$/, ''))
      .filter((n) => !/^(?:19|20)\d{2}$/.test(n.replace('%', ''))));
    const leadFigures = figures(prose[0] || '');
    const bodyFigures = figures(prose.slice(1).join(' '));
    const echoed = [...leadFigures].filter((n) => bodyFigures.has(n));
    if (echoed.length) throw new Error(`${route.key}: the lead's figure(s) ${echoed.join(', ')} reappear in the body; a number gets one home`);
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
  if (anatomyPage && CLAIMS[route.key] && !output.includes(CLAIMS[route.key])) {
    throw new Error(`${route.key}: My view lost its preserved claim ("${CLAIMS[route.key]}")`);
  }
  if (route.key === 'payments') {
    // Data integrity survives the anatomy change: figures still come from the
    // same series and the same quarter.
    if (!output.includes(`${expectedCardPurchases} billion`)) throw new Error(`payments: card purchases do not match the source operations (${expectedCardPurchases}bn)`);
    // The debit share states its case once, in the lead, at full precision.
    // Wording re-pointed 2026-08-03 for the plain-language rewrite ("are debit" became
    // "were on debit cards"). The check itself is unchanged and is the point: the share
    // must still be computed from the same quarter as the card count, at full precision.
    if (!output.includes(`${expectedDebitShare}% of them were on debit cards`)) throw new Error(`payments: debit share is not computed from the same quarter (${expectedDebitShare}%)`);
    if (!/told INEGI's 2024 survey/.test(output)) throw new Error('payments: the ENIF survey attribution and vintage must appear in the prose');
    if (output.includes('1,169bn MXN')) throw new Error('payments: quarantined debit-card value still appears editorially');
  }
  if (output.includes('waiting for its required source data')) throw new Error(`${route.key}: failed closed with complete fixture data`);
}

Object.assign(globalThis, original);
console.log('topic-render-smoke: ok');
