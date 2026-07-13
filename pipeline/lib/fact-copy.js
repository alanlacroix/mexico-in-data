// Deterministic copy for public claims that are calculated from stored source data.
// A curated event may choose the fact and its framing, but the values themselves
// stay attached to the dataset so a corrected source cannot leave stale prose behind.

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const money1 = (value) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const money2 = (value) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function monthName(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error(`Invalid source month: ${month}`);
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

function sharedTradeMonths(trade) {
  const imports = new Map((trade?.series?.imports || []).map((point) => [point.month, Number(point.value)]));
  const exports = new Map((trade?.series?.exports || []).map((point) => [point.month, Number(point.value)]));
  return [...imports.keys()]
    .filter((month) => exports.has(month) && Number.isFinite(imports.get(month)) && Number.isFinite(exports.get(month)))
    .sort()
    .map((month) => ({
      month,
      imports: imports.get(month),
      exports: exports.get(month),
      balance: exports.get(month) - imports.get(month),
    }));
}

export function censusMexicoBalanceForMonth(trade, month) {
  const observations = sharedTradeMonths(trade);
  const index = observations.findIndex((point) => point.month === month);
  if (index < 1) throw new Error(`Census Mexico balance needs ${month} and its prior month in trade-us.json`);
  return { current: observations[index], previous: observations[index - 1] };
}

function balanceKind(value) {
  return value < 0 ? 'deficit' : 'surplus';
}

export function copyForCensusMexicoBalance(trade, month) {
  const { current, previous } = censusMexicoBalanceForMonth(trade, month);
  const currentKind = balanceKind(current.balance);
  const previousKind = balanceKind(previous.balance);
  const currentValue = Math.abs(current.balance);
  const previousValue = Math.abs(previous.balance);
  const currentMonth = monthName(current.month);
  const previousMonth = monthName(previous.month);

  if (currentKind !== previousKind) {
    return {
      title: `${currentMonth} U.S. goods balance with Mexico moves to a US$${money1(currentValue)}bn ${currentKind}`,
      context: `The U.S. goods balance with Mexico moved from a US$${money2(previousValue)}bn ${previousKind} in ${previousMonth} to a US$${money2(currentValue)}bn ${currentKind} in ${currentMonth}.`,
      why: `The monthly U.S. Census ledger shows the bilateral goods balance changing sides between ${previousMonth} and ${currentMonth}.`,
    };
  }

  const delta = currentValue - previousValue;
  const verb = delta > 0 ? 'widens to' : delta < 0 ? 'narrows to' : 'holds at';
  const movement = delta > 0 ? 'widening' : delta < 0 ? 'narrowing' : 'unchanged';
  const comparison = delta > 0 ? 'up from' : delta < 0 ? 'down from' : 'unchanged from';
  return {
    title: `${currentMonth} U.S. goods ${currentKind} with Mexico ${verb} US$${money1(currentValue)}bn`,
    context: `The U.S. goods ${currentKind} with Mexico was US$${money2(currentValue)}bn in ${currentMonth}, ${comparison} US$${money2(previousValue)}bn in ${previousMonth}.`,
    why: delta === 0
      ? `The monthly U.S. Census ledger shows the bilateral goods gap unchanged from ${previousMonth}.`
      : `The monthly U.S. Census ledger shows the bilateral goods gap ${movement} by US$${money2(Math.abs(delta))}bn from ${previousMonth}.`,
  };
}

export function reconcileHappeningFactCopy(events, { tradeUS } = {}) {
  return (Array.isArray(events) ? events : []).map((event) => {
    const ref = event?.dataRef;
    if (ref?.dataset !== 'trade-us' || ref?.metric !== 'us-goods-balance') return event;
    if (!tradeUS) throw new Error(`Missing trade-us.json for referenced event ${event.id || event.title}`);
    return { ...event, ...copyForCensusMexicoBalance(tradeUS, ref.month) };
  });
}
