// feed.js — the homepage content schema from the design handoff (2026-08-02).
//
// Everything here is derived from data the pipeline already holds: the series files, the
// curated event log, the brief and the calendar. Nothing is invented. Where the handoff
// asks for a sentence, it is composed from real figures with no judgment added; where it
// asks for a verdict, the verdict comes from a per-series rule written down below rather
// than from the sign of the number, because the sign lies (a falling MXN/US$ is the peso
// getting stronger).

const fs = require('node:fs');
const path = require('node:path');
const dailyBrief = require('./dailyBrief.js');
const boards = require('./boards.js');
const weeklyTop = require('./weeklyTop.js');
const calendar = require('./calendar.js');

const DATA = path.join(__dirname, '..', 'data');
const read = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')); }
  catch { return fallback; }
};

// Which way is good for a reader, per series. This is the mapping the handoff insists on:
// "A red/green verdict is a judgment about the reader's world, not the arithmetic sign."
// `up` is the word when the latest reading is higher than the one before it.
const VERDICT = {
  'banxico-usdmxn-fix':   { up: ['WEAKER', 'bad'],     down: ['STRONGER', 'good'] },
  'cre-gasolina-regular': { up: ['PRICIER', 'bad'],    down: ['CHEAPER', 'good'] },
  'banxico-cetes-28d':    { up: ['PAYS MORE', 'good'], down: ['PAYS LESS', 'bad'] },
  'fred-ust10':           { up: ['COSTLIER', 'bad'],   down: ['CHEAPER', 'good'] },
  'banxico-bmv-ipc':      { up: ['HIGHER', 'good'],    down: ['LOWER', 'bad'] },
};
const FLAT = ['BARELY MOVED', 'flat'];
// Smallest move, in each series' own units, that is worth calling a direction.
const FLAT_BAND = {
  'banxico-usdmxn-fix': 0.005,    // half a centavo on the peso quote
  'cre-gasolina-regular': 0.005,  // half a centavo a litre
  'banxico-cetes-28d': 0.03,      // three hundredths of a point of yield
  'fred-ust10': 0.03,
  'banxico-bmv-ipc': 50,          // index points
};

const TONE = { good: '#0B6E4F', bad: '#B4483A', flat: '#6B6D73' };

const num = (value, digits = 2) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const monthDay = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
};
const monthName = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' });
};

// A polyline over the last 30 observations, normalised into the handoff's 0 0 100 26 box
// with y inverted. Flat series collapse to the middle rather than dividing by zero.
const sparkline = (series, count = 30) => {
  const rows = (series || []).slice(-count).filter((r) => Number.isFinite(Number(r.value)));
  if (rows.length < 2) return '';
  const values = rows.map((r) => Number(r.value));
  const low = Math.min(...values), high = Math.max(...values), span = high - low;
  return rows.map((r, i) => {
    const x = (i / (rows.length - 1)) * 100;
    const y = span === 0 ? 13 : 26 - ((Number(r.value) - low) / span) * 24 - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const seriesOf = (id) => (read(`series/${id}.json`, {}).data || [])
  .filter((r) => r && Number.isFinite(Number(r.value)));

// A short label for a story's jump chip, taken from the words of its own headline so it
// can never assert something the headline does not.
const JOINERS = new Set(['and', 'of', 'the', 'in', 'to', 'for', 'with', 'on', 'at', 'a', 'an', 'as', 'by']);
const chipFor = (title) => {
  const words = String(title || '').replace(/[“”"']/g, '').split(/\s+/).filter(Boolean);
  const picked = [];
  let solid = 0;
  for (const word of words) {
    picked.push(word);
    if (!JOINERS.has(word.toLowerCase())) solid += 1;
    if (solid >= 2 && !JOINERS.has(word.toLowerCase())) break;
    if (picked.length >= 4) break;
  }
  while (picked.length && JOINERS.has(picked[picked.length - 1].toLowerCase())) picked.pop();
  return picked.join(' ').replace(/[,.:;]$/, '') || 'Story';
};

module.exports = function () {
  const brief = dailyBrief();
  const board = boards();
  const week = weeklyTop();

  // ---- Numbers -------------------------------------------------------------
  const numbers = board.today.map((card) => {
    const rows = seriesOf(card.id);
    const latest = rows.at(-1), prior = rows.at(-2);
    const change = latest && prior ? Number(latest.value) - Number(prior.value) : null;
    const pct = latest && prior && Number(prior.value) !== 0
      ? (Number(latest.value) / Number(prior.value) - 1) * 100 : null;
    const rule = VERDICT[card.id];
    const band = FLAT_BAND[card.id];
    let tag = FLAT[0], mood = FLAT[1];
    if (rule && change != null && band != null && Math.abs(change) >= band) {
      [tag, mood] = change > 0 ? rule.up : rule.down;
    }
    return {
      id: card.id,
      label: card.label,
      value: card.display,
      unit: card.unit,
      asOf: card.observed,
      delta: card.delta || card.move,
      tag, mood, tone: TONE[mood],
      points: sparkline(rows),
      why: card.compare || card.move || '',
      href: card.href,
      external: Boolean(card.external),
    };
  });

  // ---- Today's stories -----------------------------------------------------
  const stories = brief.stories.map((story) => ({
    id: story.id,
    chip: chipFor(story.title),
    date: monthDay(story.date),
    cat: story.topic,
    catKey: story.topicKey,
    source: story.source,
    url: story.url,
    title: story.title,
    dek: story.summary,
    // The three-part shape Alan asked to keep: what the background is, what the view is,
    // and what would confirm or weaken it. Merging the first two into one "why" lost the
    // line between the reported context and the judgment.
    bg: story.bg || '',
    view: story.view || '',
    watch: story.prediction || '',
    why: story.view || story.bg || '',
  }));

  // ---- This week -----------------------------------------------------------
  const weekItems = [];
  for (const group of week.groups) {
    for (const item of group.items) {
      if (item.shownToday) continue;
      if (!item.bg && !item.view) continue;
      weekItems.push({
        id: `${group.key}-${weekItems.length}`,
        date: item.dayLabel || monthDay(item.date),
        cat: group.label,
        catKey: group.key,
        source: item.sourceName,
        lang: item.originalTitle && item.originalTitle !== item.title ? 'ES' : '',
        orig: item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : '',
        url: item.url,
        title: item.title,
        dek: item.dek || '',
        bg: item.bg || '',
        view: item.view || '',
        watch: item.next || '',
        why: item.view || item.bg || '',
      });
    }
  }

  // ---- Coming up -----------------------------------------------------------
  const groupsByWhen = new Map();
  for (const event of (typeof calendar === 'function' ? calendar() : calendar)) {
    const when = event.approx ? `Week of ${monthDay(event.date)}` : monthDay(event.date);
    if (!groupsByWhen.has(when)) {
      groupsByWhen.set(when, { when, date: event.date, approx: Boolean(event.approx), items: [] });
    }
    groupsByWhen.get(when).items.push({
      title: event.title, what: event.why || '', source: event.source, url: event.sourceUrl,
    });
  }
  const today = brief.editorialDate;
  const upcoming = [...groupsByWhen.values()].map((group) => {
    const days = Math.round((Date.parse(`${group.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5);
    return {
      ...group,
      rel: days <= 0 ? 'today' : days === 1 ? 'tomorrow' : days <= 7 ? `in ${days} days` : 'next week',
      soon: days <= 2,
    };
  });

  // ---- Where the economy stands -------------------------------------------
  // Every row compares against something named. A number with nothing to compare
  // against does not belong in this block, per the handoff.
  const inflationNow = seriesOf('banxico-inflacion').at(-1);
  const REFERENCE = {
    'banxico-inflacion': () => ({ label: 'TARGET', value: 3, text: '3.00%' }),
    'banxico-tasa-objetivo': () => inflationNow
      ? { label: 'INFLATION', value: Number(inflationNow.value), text: `${num(inflationNow.value)}%` } : null,
    'banxico-igae': () => {
      const prior = seriesOf('banxico-igae').at(-2);
      return prior ? { label: 'MONTH BEFORE', value: Number(prior.value), text: `${num(prior.value)}%` } : null;
    },
    'banxico-exports-total': () => {
      const rows = seriesOf('banxico-exports-total'), prior = rows.at(-13);
      return prior ? { label: 'YEAR EARLIER', value: Number(prior.value) / 1e6, text: `US$${num(Number(prior.value) / 1e6, 1)} bn` } : null;
    },
    'banxico-remesas': () => {
      const rows = seriesOf('banxico-remesas'), prior = rows.at(-13);
      return prior ? { label: 'YEAR EARLIER', value: Number(prior.value) / 1e3, text: `US$${num(Number(prior.value) / 1e3, 2)} bn` } : null;
    },
  };

  // The note names both comparisons in words. No "pp", no bare percentages.
  const NOTE = {
    'banxico-inflacion': (card) => `Prices rose ${card.display}% over the year to ${monthName(card.date)}, against a central bank target of 3%.`,
    'banxico-tasa-objetivo': (card) => inflationNow
      ? `Banco de México is holding its rate at ${card.display}%, well above the ${num(inflationNow.value)}% pace of inflation.`
      : `Banco de México is holding its rate at ${card.display}%.`,
    'banxico-igae': (card) => `The economy was ${card.display.replace('+', '')}% larger in ${monthName(card.date)} than a year earlier.`,
    'banxico-exports-total': (card) => `Mexico shipped US$${card.display} bn of goods in ${monthName(card.date)}.`,
    'banxico-remesas': (card) => `Mexicans abroad sent home US$${card.display} bn in ${monthName(card.date)}.`,
  };

  const econ = board.economy.map((card) => {
    const reference = REFERENCE[card.id] ? REFERENCE[card.id]() : null;
    const value = Number(String(card.display).replace(/[^0-9.-]/g, ''));
    const scale = reference ? Math.max(Math.abs(value), Math.abs(reference.value)) : Math.abs(value);
    return {
      id: card.id,
      name: card.label,
      period: card.observed,
      value: card.display,
      unit: card.unit,
      nowPct: scale ? Math.min(100, (Math.abs(value) / scale) * 100) : 0,
      nowText: `${card.display}${card.unit && card.unit.startsWith('%') ? '%' : ''}`,
      refLabel: reference ? reference.label : '',
      refText: reference ? reference.text : '',
      refPct: reference && scale ? Math.min(100, (Math.abs(reference.value) / scale) * 100) : 0,
      note: NOTE[card.id] ? NOTE[card.id](card) : card.compare,
      href: card.href,
    };
  }).filter((row) => row.refLabel);

  return {
    date: brief.editorialDate,
    updated: brief.newsThrough,
    carrying: brief.carryingLastBrief,
    brief: brief.summaryLead,
    briefSources: brief.briefSources,
    numbers,
    stories,
    week: weekItems,
    weekLabel: week.weekLabel,
    upcoming,
    econ,
  };
};
