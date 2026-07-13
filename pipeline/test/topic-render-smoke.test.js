import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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
  const code = match[1].replace(/import \{treemapSVG\} from '[^']+';/, "const treemapSVG=()=>'<svg role=\"img\"></svg>'; ");

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

  await new AsyncFunction(code)();
  const output = node('#topicApp').innerHTML;
  if (reported) throw new Error(`${route.key}: rendered the failure state (${reported})`);
  for (const required of ['Snapshot', 'What changed', 'Sources and method']) {
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
  if (output.includes('waiting for its required source data')) throw new Error(`${route.key}: failed closed with complete fixture data`);
}

Object.assign(globalThis, original);
console.log('topic-render-smoke: ok');
