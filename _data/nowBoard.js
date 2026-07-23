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
const percentVsYear = (value, higher, lower) => value === 0
  ? 'Unchanged from a year ago'
  : `${number(Math.abs(value), 1)}% ${value > 0 ? higher : lower} than a year ago`;
const relativeTo = (value, reference) => value === 0
  ? `In line with ${reference}`
  : `${number(Math.abs(value), 2)} pp ${value > 0 ? 'above' : 'below'} ${reference}`;
const percentChange = (current, prior) => prior ? (current / prior - 1) * 100 : null;
const link = (id) => `/chart.html?v=${id}`;
const observed = (date, cadence) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', cadence === 'monthly'
    ? { timeZone: 'UTC', month: 'short', year: 'numeric' }
    : { timeZone: 'UTC', month: 'short', day: 'numeric' });
};
const addObservedLabels = (cards) => cards.map((card) => ({
  ...card,
  observed: observed(card.date, card.cadence),
}));

module.exports = function () {
  const peso = readSeries('banxico-usdmxn-fix');
  const inflation = readSeries('banxico-inflacion');
  const rate = readSeries('banxico-tasa-objetivo');
  const activity = readSeries('banxico-igae');
  const exportsTotal = readSeries('banxico-exports-total');
  const remittances = readSeries('banxico-remesas');
  const cards = [];

  if (peso) {
    const current = latest(peso), priorYear = yearAgo(peso);
    const change = percentChange(current.value, priorYear?.value);
    cards.push({ id: peso.id, label: 'Peso', display: number(current.value), unit: 'MXN/US$',
      compare: change == null ? 'Latest official fixing' : percentVsYear(change, 'weaker', 'stronger'),
      date: current.date, cadence: 'daily', source: 'Banco de México', href: link(peso.id) });
  }

  if (inflation) {
    const current = latest(inflation), gap = current.value - 3;
    cards.push({ id: inflation.id, label: 'Inflation', display: number(current.value), unit: '% y/y',
      compare: `${number(Math.abs(gap), 2)} pp ${gap >= 0 ? 'above' : 'below'} the central bank’s 3% target`,
      date: current.date, cadence: 'monthly', source: 'Mexico statistics agency · central bank target', href: link(inflation.id) });
  }

  if (rate) {
    const current = latest(rate), inflationNow = latest(inflation);
    const gap = inflationNow ? current.value - inflationNow.value : null;
    cards.push({ id: rate.id, label: 'Policy rate', display: number(current.value), unit: '%',
      compare: gap == null ? 'Latest policy setting' : relativeTo(gap, `${observed(inflationNow.date, 'monthly')} inflation`),
      date: current.date, cadence: 'daily', source: 'Banco de México', href: link(rate.id) });
  }

  if (activity) {
    const current = latest(activity), prior = previous(activity);
    cards.push({ id: activity.id, label: 'Economic activity', display: `${current.value >= 0 ? '+' : ''}${number(current.value)}`, unit: '% y/y',
      compare: prior ? movementFromPrior(current.value - prior.value) : 'Latest annual change',
      date: current.date, cadence: 'monthly', source: 'Mexico statistics agency', href: link(activity.id) });
  }

  if (exportsTotal) {
    const current = latest(exportsTotal), priorYear = yearAgo(exportsTotal);
    const change = percentChange(current.value, priorYear?.value);
    cards.push({ id: exportsTotal.id, label: 'Goods exports', display: `US$${number(current.value / 1_000_000, 1)}bn`, unit: '',
      compare: change == null ? 'Latest monthly total' : percentVsYear(change, 'higher', 'lower'),
      date: current.date, cadence: 'monthly', source: 'Banco de México', href: link(exportsTotal.id) });
  }

  if (remittances) {
    const current = latest(remittances), priorYear = yearAgo(remittances);
    const change = percentChange(current.value, priorYear?.value);
    cards.push({ id: remittances.id, label: 'Remittances', display: `US$${number(current.value / 1_000, 2)}bn`, unit: '',
      compare: change == null ? 'Latest monthly inflow' : percentVsYear(change, 'higher', 'lower'),
      date: current.date, cadence: 'monthly', source: 'Banco de México', href: link(remittances.id) });
  }

  return addObservedLabels(cards);
};
