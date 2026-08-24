const fs = require('node:fs');
const path = require('node:path');

const readSeries = (id) => {
  try {
    const series = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'series', `${id}.json`), 'utf8'));
    const data = (series.data || []).filter((row) => row && Number.isFinite(Number(row.value)));
    return data.length ? { id, meta: series.meta || {}, data } : null;
  } catch { return null; }
};

const latest = (series) => series && series.data.at(-1);
const previous = (series) => series && series.data.at(-2);
const DAY_MS = 86_400_000;
// Markets do not all publish on the same calendar. Compare each latest reading with
// the observation closest to seven calendar days earlier, so weekends and holidays
// do not turn a Friday close into a misleading "daily" move on Monday.
const weekAgo = (series) => {
  const current = latest(series);
  if (!current) return null;
  const target = Date.parse(current.date) - 7 * DAY_MS;
  let best = null, distance = Infinity;
  for (const row of series.data.slice(0, -1)) {
    const nextDistance = Math.abs(Date.parse(row.date) - target);
    if (nextDistance < distance) { best = row; distance = nextDistance; }
  }
  return distance <= 3 * DAY_MS ? best : null;
};
const yearAgo = (series) => {
  const current = latest(series);
  if (!current) return null;
  const target = Date.parse(current.date) - 365 * 86_400_000;
  let best = null, distance = Infinity;
  for (const row of series.data) {
    const nextDistance = Math.abs(Date.parse(row.date) - target);
    if (nextDistance < distance) { best = row; distance = nextDistance; }
  }
  return distance <= 45 * 86_400_000 ? best : null;
};

const number = (value, digits = 2) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});
const movementFromPrior = (value) => value === 0
  ? 'Unchanged from the prior reading'
  : `${number(Math.abs(value), 2)} pp ${value > 0 ? 'higher' : 'lower'} than the prior reading`;
const movementFromWeek = (value) => value === 0
  ? 'Unchanged from seven days earlier'
  : `${number(Math.abs(value), 2)} pp ${value > 0 ? 'higher' : 'lower'} than seven days earlier`;
const percentVsYear = (value, higher, lower) => value === 0
  ? 'Unchanged from a year ago'
  : `${number(Math.abs(value), 1)}% ${value > 0 ? higher : lower} than a year ago`;
const percentFromWeek = (value, higher = 'higher', lower = 'lower') => value === 0
  ? 'Unchanged from seven days earlier'
  : `${number(Math.abs(value), 2)}% ${value > 0 ? higher : lower} than seven days earlier`;
const relativeTo = (value, reference) => value === 0
  ? `In line with ${reference}`
  : `${number(Math.abs(value), 2)} pp ${value > 0 ? 'above' : 'below'} ${reference}`;
// The market strip prints the seven-day change as a short signed figure rather than a
// sentence, so it stays readable on a phone.
// Direction is stated three ways that all say the same thing: an arrow, a sign, and the
// word in the comparison line. None of them is colour, because colour on these would be
// read as good and bad, and a falling MXN/US$ is the peso getting stronger.
const arrow = (value) => value > 0 ? '↑' : value < 0 ? '↓' : '→';
const signedPercent = (value) => `${arrow(value)} ${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), 2)}%`;
const signedPoints = (value) => `${arrow(value)} ${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), 2)} pp`;
const percentChange = (current, prior) => prior ? (current / prior - 1) * 100 : null;
const sourceAction = (series) => {
  const href = series?.meta?.sourceUrl || '/';
  return { href, actionLabel: 'Open source', external: /^https?:\/\//.test(href) };
};
const LIVE_PESO_URL = 'https://www.google.com/finance/quote/USD-MXN?hl=en';
const observed = (date, cadence) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', cadence === 'monthly'
    ? { timeZone: 'UTC', month: 'short', year: 'numeric' }
    : { timeZone: 'UTC', month: 'short', day: 'numeric' });
};
// `compare` is the full read that the economy cards print. `move` is the short
// line the daily strip prints instead, so a tile stays three lines tall.
const addObservedLabels = (cards) => cards.map((card) => ({
  ...card,
  move: card.move || card.compare,
  observed: observed(card.date, card.cadence),
}));

module.exports = function () {
  const peso = readSeries('banxico-usdmxn-fix');
  const inflation = readSeries('banxico-inflacion');
  const rate = readSeries('banxico-tasa-objetivo');
  const activity = readSeries('banxico-igae');
  const exportsTotal = readSeries('banxico-exports-total');
  const remittances = readSeries('banxico-remesas');
  const fuel = readSeries('cre-gasolina-regular');
  const cetes = readSeries('banxico-cetes-28d');
  const ust10 = readSeries('fred-ust10');
  const ipc = readSeries('banxico-bmv-ipc');
  const cards = [];

  if (peso) {
    const current = latest(peso), reference = weekAgo(peso);
    const change = percentChange(current.value, reference?.value);
    cards.push({ id: peso.id, label: 'Peso', display: number(current.value), unit: 'MXN/US$',
      compare: change == null ? 'Latest official fixing' : percentFromWeek(change, 'weaker', 'stronger'),
      delta: change == null ? null : signedPercent(change), moveValue: reference ? current.value - reference.value : null,
      comparisonDate: reference?.date || null,
      date: current.date, cadence: 'daily', dateLead: 'Official fixing', updateLabel: 'New fixing each trading day',
      source: 'Banco de México', href: LIVE_PESO_URL, actionLabel: 'Open live quote', external: true });
  }

  // Station-level national average, refreshed every four hours. The most felt number here.
  if (fuel) {
    const current = latest(fuel), reference = weekAgo(fuel);
    const change = percentChange(current.value, reference?.value);
    cards.push({ id: fuel.id, label: 'Gasoline', display: number(current.value), unit: 'MXN/L',
      compare: change == null ? 'Latest national average' : percentFromWeek(change, 'more expensive', 'cheaper'),
      delta: change == null ? null : signedPercent(change), moveValue: reference ? current.value - reference.value : null,
      comparisonDate: reference?.date || null,
      date: current.date, cadence: 'daily', dateLead: 'National average', updateLabel: 'Refreshed through the day',
      source: 'Mexico energy regulator', ...sourceAction(fuel) });
  }

  if (cetes) {
    const current = latest(cetes), reference = weekAgo(cetes);
    const change = reference ? current.value - reference.value : null;
    cards.push({ id: cetes.id, label: 'Cetes 28-day', display: number(current.value), unit: '%',
      compare: change == null ? 'Latest yield' : movementFromWeek(change),
      delta: change == null ? null : signedPoints(change), moveValue: change,
      comparisonDate: reference?.date || null,
      date: current.date, cadence: 'daily', dateLead: 'Latest yield', updateLabel: 'New reading each trading day',
      source: 'Banco de México', ...sourceAction(cetes) });
  }

  // Not a Mexican number, but on most days it is why the peso moved.
  if (ust10) {
    const current = latest(ust10), reference = weekAgo(ust10);
    const change = reference ? current.value - reference.value : null;
    cards.push({ id: ust10.id, label: 'US 10-year', display: number(current.value), unit: '%',
      compare: change == null ? 'Latest close' : movementFromWeek(change),
      delta: change == null ? null : signedPoints(change), moveValue: change,
      comparisonDate: reference?.date || null,
      date: current.date, cadence: 'daily', dateLead: 'Latest close', updateLabel: 'New close each trading day',
      source: 'US Federal Reserve', ...sourceAction(ust10) });
  }

  if (ipc) {
    const current = latest(ipc), reference = weekAgo(ipc);
    const change = percentChange(current.value, reference?.value);
    cards.push({ id: ipc.id, label: 'Stock market', display: number(current.value, 0), unit: 'IPC',
      compare: change == null ? 'Latest close' : percentFromWeek(change),
      delta: change == null ? null : signedPercent(change), moveValue: reference ? current.value - reference.value : null,
      comparisonDate: reference?.date || null,
      date: current.date, cadence: 'daily', dateLead: 'Latest close', updateLabel: 'New close each trading day',
      source: 'Banco de México', ...sourceAction(ipc) });
  }

  if (inflation) {
    const current = latest(inflation), priorInflation = previous(inflation), gap = current.value - 3;
    cards.push({ id: inflation.id, label: 'Inflation', display: number(current.value), unit: '% y/y',
      compare: `${number(Math.abs(gap), 2)} pp ${gap >= 0 ? 'above' : 'below'} the central bank’s 3% target`,
      delta: priorInflation ? signedPoints(current.value - priorInflation.value) : null,
      date: current.date, cadence: 'monthly', dateLead: 'Latest release', updateLabel: 'New release each month',
      source: 'Mexico statistics agency · central bank target', ...sourceAction(inflation) });
  }

  if (rate) {
    const current = latest(rate), priorRate = previous(rate), inflationNow = latest(inflation);
    const gap = inflationNow ? current.value - inflationNow.value : null;
    cards.push({ id: rate.id, label: 'Policy rate', display: number(current.value), unit: '%',
      compare: gap == null ? 'Latest policy setting' : relativeTo(gap, `${observed(inflationNow.date, 'monthly')} inflation`),
      delta: priorRate ? signedPoints(current.value - priorRate.value) : null,
      date: current.date, cadence: 'meeting', dateLead: 'Current setting', updateLabel: 'Can change at policy meetings',
      source: 'Banco de México', ...sourceAction(rate) });
  }

  if (activity) {
    const current = latest(activity), prior = previous(activity);
    cards.push({ id: activity.id, label: 'Economic activity', display: `${current.value >= 0 ? '+' : ''}${number(current.value)}`, unit: '% y/y',
      compare: prior ? movementFromPrior(current.value - prior.value) : 'Latest annual change',
      delta: prior ? signedPoints(current.value - prior.value) : null,
      date: current.date, cadence: 'monthly', dateLead: 'Latest release', updateLabel: 'New release each month',
      source: 'Mexico statistics agency', ...sourceAction(activity) });
  }

  if (exportsTotal) {
    const current = latest(exportsTotal), priorMonth = previous(exportsTotal), priorYear = yearAgo(exportsTotal);
    const change = percentChange(current.value, priorYear?.value);
    const monthChange = percentChange(current.value, priorMonth?.value);
    cards.push({ id: exportsTotal.id, label: 'Goods exports', display: number(current.value / 1_000_000, 1), unit: 'US$ bn',
      compare: change == null ? 'Latest monthly total' : percentVsYear(change, 'higher', 'lower'),
      delta: monthChange == null ? null : signedPercent(monthChange),
      date: current.date, cadence: 'monthly', dateLead: 'Latest release', updateLabel: 'New release each month',
      source: 'Banco de México', ...sourceAction(exportsTotal) });
  }

  if (remittances) {
    const current = latest(remittances), priorMonth = previous(remittances), priorYear = yearAgo(remittances);
    const change = percentChange(current.value, priorYear?.value);
    const monthChange = percentChange(current.value, priorMonth?.value);
    cards.push({ id: remittances.id, label: 'Remittances', display: number(current.value / 1_000, 2), unit: 'US$ bn',
      compare: change == null ? 'Latest monthly inflow' : percentVsYear(change, 'higher', 'lower'),
      delta: monthChange == null ? null : signedPercent(monthChange),
      date: current.date, cadence: 'monthly', dateLead: 'Latest release', updateLabel: 'New release each month',
      source: 'Banco de México', ...sourceAction(remittances) });
  }

  return addObservedLabels(cards);
};
