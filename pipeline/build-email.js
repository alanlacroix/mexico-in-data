// build-email.js — builds the Sunday draft. It never sends.
//
// The draft has one possible lead, up to three supporting items, only the
// official numbers that actually changed during the week, up to four headline
// updates, and three upcoming dates. Article summaries are only written from a
// fetched source body. If the body cannot be fetched, the preview says so and
// the item is never given a made-up or broken summary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, model } from './lib/anthropic.js';
import { renderEmail, renderPreview, domainOf } from './lib/email-template.js';
import { fetchArticle } from './lib/fetch-article.js';
import { hasStore, upsertItems, upsertIssue, recentIssues } from './lib/store.js';
import { lintReportText } from './lib/lint.js';
import { EMAIL, LAW } from './lib/voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...parts) => path.join(ROOT, 'data', ...parts);

const LEAD_THRESHOLD = 8.5;
const SUPPORT_THRESHOLD = 6.5;
const QUICK_THRESHOLD = 4.5;
const MAX_SUPPORTING = 3;
const MAX_QUICK = 4;
const MAX_CANDIDATES = 70;

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MOF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const list = (value) => (Array.isArray(value) ? value : []);
const fmtDay = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${MO[date.getUTCMonth()]} ${date.getUTCDate()}` : '';
};
const fmtFull = (date) => `${WD[date.getUTCDay()]}, ${MOF[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
const shorten = (value, max) => {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
};
const signed = (value, digits, suffix = '') => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}${suffix}`;
const direction = (value, epsilon = 0) => (value > epsilon ? 'up' : value < -epsilon ? 'down' : 'flat');
const isoWeek = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 864e5) + 1) / 7)).padStart(2, '0')}`;
};

function loadSeries(id) {
  const json = readJson(D('series', `${id}.json`), null);
  return list(json?.data)
    .filter((point) => point && point.value != null)
    .map((point) => ({ t: Date.parse(point.date), v: Number(point.value), date: point.date }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
}

function nearestWithin(points, timestamp, maxDays) {
  let best = null;
  for (const point of points) {
    if (!best || Math.abs(point.t - timestamp) < Math.abs(best.t - timestamp)) best = point;
  }
  return best && Math.abs(best.t - timestamp) <= maxDays * 864e5 ? best : null;
}

// ---- Numbers that changed -------------------------------------------------

const NUMBER_LABELS = {
  'banxico-inflacion': 'Headline inflation',
  'banxico-inflacion-subyacente': 'Core inflation',
  'banxico-tasa-objetivo': 'Banxico policy rate',
  'banxico-remesas': 'Remittances',
  'banxico-pib-crecimiento': 'GDP growth',
  'banxico-igae': 'Economic activity',
  'banxico-trade-balance': 'Trade balance',
  'banxico-exports-total': 'Exports',
  'banxico-imports-total': 'Imports',
  'banxico-reservas': 'International reserves',
  'se-ied': 'Foreign direct investment',
};
const NUMBER_PRIORITY = {
  'banxico-inflacion': 10,
  'banxico-inflacion-subyacente': 9,
  'banxico-tasa-objetivo': 10,
  'banxico-pib-crecimiento': 10,
  'banxico-igae': 9,
  'banxico-remesas': 8,
  'banxico-trade-balance': 8,
  'banxico-exports-total': 7,
  'banxico-imports-total': 7,
  'se-ied': 8,
  'banxico-reservas': 5,
};
const humanize = (value) => {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
};
const cleanSource = (value) => shorten(String(value || '').replace(/\s*\(SIE[^)]*\)/g, '').trim(), 54);
const PUBLIC_SOURCE_URLS = {
  'banxico-inflacion': 'https://www.inegi.org.mx/temas/inpc/',
  'banxico-inflacion-subyacente': 'https://www.inegi.org.mx/temas/inpc/',
  'banxico-tasa-objetivo': 'https://www.banxico.org.mx/publicaciones-y-prensa/anuncios-de-las-decisiones-de-politica-monetaria/anuncios-politica-monetaria-t.html',
  'banxico-remesas': 'https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=1&accion=consultarCuadro&idCuadro=CE81&locale=es',
  'banxico-pib-crecimiento': 'https://www.inegi.org.mx/temas/pib/',
  'banxico-igae': 'https://www.inegi.org.mx/temas/igae/',
  'banxico-trade-balance': 'https://www.inegi.org.mx/programas/comext/',
  'banxico-exports-total': 'https://www.inegi.org.mx/programas/comext/',
  'banxico-imports-total': 'https://www.inegi.org.mx/programas/comext/',
  'banxico-reservas': 'https://www.banxico.org.mx/publicaciones-y-prensa/estado-de-cuenta-semanal/estado-cuenta-semanal-reserva.html',
  'se-ied': 'https://www.economia.gob.mx/fdi-statistics/formulario-gobmx_es.html',
};
const publicSourceUrl = (series, fallback = '') => {
  if (PUBLIC_SOURCE_URLS[series]) return PUBLIC_SOURCE_URLS[series];
  return /\/SieAPIRest\//i.test(fallback) ? 'https://www.banxico.org.mx/SieInternet/' : fallback;
};

function periodLabel(value, cadence, now) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return text;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = match[3] ? Number(match[3]) : null;
  if (month < 0 || month > 11) return text;
  if (/daily|weekly|hourly/i.test(cadence || '') && day) return `${MO[month]} ${day}`;
  return year === now.getUTCFullYear() ? MOF[month] : `${MOF[month]} ${year}`;
}

function currentValue(event) {
  const value = Number(event.value);
  const units = String(event.units || '').trim();
  if (!Number.isFinite(value)) return '';
  if (/^%/.test(units)) return `${value.toFixed(Math.abs(value) < 10 ? 2 : 1).replace(/\.00$/, '')}%`;
  if (/US\$m|USD million/i.test(units)) return value >= 1000 ? `$${(value / 1000).toFixed(2)}bn` : `$${value.toFixed(0)}m`;
  if (/MXN per USD/i.test(units)) return value.toFixed(2);
  if (/MXN per liter/i.test(units)) return `$${value.toFixed(2)}/l`;
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US');
  return `${value.toFixed(2).replace(/\.00$/, '')}${units ? ` ${units}` : ''}`;
}

function comparisonText(event, now) {
  const value = Number(event.value);
  const previous = Number(event.prev_value);
  if (!Number.isFinite(value) || !Number.isFinite(previous)) return '';
  const previousPeriod = periodLabel(event.prev_period, event.cadence, now);
  if (/^%/.test(String(event.units || ''))) {
    return `${signed(value - previous, 2, ' pp')}${previousPeriod ? ` vs ${previousPeriod}` : ''}`;
  }
  if (previous !== 0) {
    return `${signed((value / previous - 1) * 100, 1, '%')}${previousPeriod ? ` vs ${previousPeriod}` : ''}`;
  }
  return '';
}

function buildNumbers(now) {
  const cutoff = now.getTime() - 7 * 864e5;
  const releaseLog = readJson(D('releases.json'), { events: [] });
  const bySeries = new Map();

  for (const event of list(releaseLog?.events)) {
    const seen = Date.parse(event.detected_at || event.published_at || event.fetched_at);
    if (!Number.isFinite(seen) || seen < cutoff || !event.series) continue;
    const continuous = /daily|hourly/i.test(event.cadence || '');
    const actualRateMove = event.series === 'banxico-tasa-objetivo' && Number(event.value) !== Number(event.prev_value);
    if (continuous && !actualRateMove) continue;
    if (!NUMBER_PRIORITY[event.series]) continue;
    const prior = bySeries.get(event.series);
    if (!prior || seen > prior.seen) bySeries.set(event.series, { event, seen });
  }

  const rows = [...bySeries.values()]
    .sort((a, b) => (NUMBER_PRIORITY[b.event.series] - NUMBER_PRIORITY[a.event.series]) || b.seen - a.seen)
    .map(({ event }) => ({
      name: NUMBER_LABELS[event.series] || humanize(event.metric || event.title || event.series),
      current: currentValue(event),
      change: comparisonText(event, now),
      period: periodLabel(event.period, event.cadence, now),
      source: cleanSource(event.source),
      sourceUrl: publicSourceUrl(event.series, event.sourceUrl || ''),
      status: event.fetch_issue ? 'Fetch issue' : '',
      arrow: direction(Number(event.value) - Number(event.prev_value)),
      _priority: NUMBER_PRIORITY[event.series] || 1,
    }))
    .filter((row) => row.name && row.current);

  // The peso is a market price, not a scheduled release. Include it only when
  // the weekly move is large enough to add information.
  const peso = loadSeries('banxico-usdmxn-fix');
  if (peso.length > 1) {
    const last = peso.at(-1);
    const weekAgo = nearestWithin(peso, last.t - 7 * 864e5, 4);
    if (weekAgo) {
      const move = (last.v / weekAgo.v - 1) * 100;
      if (Math.abs(move) >= 0.5) {
        rows.push({
          name: 'Peso per US dollar',
          current: last.v.toFixed(2),
          change: `${signed(move, 1, '%')} over the week${move > 0 ? ' (weaker peso)' : ' (stronger peso)'}`,
          period: `${fmtDay(weekAgo.date)} to ${fmtDay(last.date)}`,
          source: 'Banco de México',
          sourceUrl: 'https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=6&accion=consultarCuadro&idCuadro=CF102&locale=es',
          status: '',
          arrow: direction(move, 0.05),
          _priority: 8,
        });
      }
    }
  }

  return rows
    .sort((a, b) => b._priority - a._priority)
    .slice(0, 5)
    .map(({ _priority, ...row }) => row);
}

// ---- Next week ------------------------------------------------------------

function buildWatch(now) {
  const events = readJson(D('events.json'), { events: [] });
  return list(events?.events)
    .filter((event) => event?.date && event.label && Date.parse(event.date) >= now.getTime() - 864e5)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((event) => ({
      dt: `${event.approx ? 'Week of ' : ''}${fmtDay(event.date)}`,
      w: shorten(event.label.split(' — ')[0], 100),
      why: shorten(event.mechanism || '', 150),
      source: event.source || '',
      sourceUrl: event.sourceUrl || '',
    }));
}

// ---- News candidates ------------------------------------------------------

const normalizeTitle = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').replace(/\s+/g, ' ').trim();
function jaccard(a, b) {
  const A = new Set(a.split(' ').filter((word) => word.length > 3));
  const B = new Set(b.split(' ').filter((word) => word.length > 3));
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const word of A) if (B.has(word)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}
const tierWeight = (tier) => (tier === 1 ? 3 : tier === 'specialist' ? 2.5 : tier === 2 ? 2 : 1);
const NON_MEXICO = /\b(colombia|brasil|brazil|argentin|chile|per[úu]|ecuador|bolivia|venezuela|uruguay|paraguay|guatemala|hondur|el salvador|nicaragua|centroam[eé]ric|espa[ñn]a|spain)\b/i;
const MEXICO = /m[eé]xic|mexican|\bcdmx\b|banxico|sheinbaum|\bpemex\b|\bfemsa\b|\boxxo\b|\bmorena\b|\binegi\b|\bcnbv\b|\bpeso(s)?\b|monterrey|guadalajara|\bbmv\b|nearshor|maquila|tmec|usmca/i;
const IMPORTANT = /\b(banxico|sheinbaum|arancel|tariff|usmca|tmec|adquisic|acquir|merger|million|millones|cnbv|pemex|nearshor|reforma|remesas|remittanc|inflaci[oó]n|tasa|trade|comercio|homicid|elecci[oó]n)\b/i;

function candidates(now) {
  const currentWeek = isoWeek(now);
  const priorWeek = isoWeek(new Date(now.getTime() - 7 * 864e5));
  const all = [...list(readJson(D('news', `${currentWeek}.json`), [])), ...list(readJson(D('news', `${priorWeek}.json`), []))];
  const cutoff = now.getTime() - 7 * 864e5;
  const pool = all
    .filter((item) => item?.title && item.url && item.source !== 'news.google.com')
    .filter((item) => Date.parse(item.published_at) >= cutoff)
    .filter((item) => !/\/opinion\/|\b(opini[oó]n|columnista|editorial)\b/i.test(`${item.url} ${item.title}`))
    .filter((item) => !(NON_MEXICO.test(`${item.title} ${item.dek || ''}`) && !MEXICO.test(`${item.title} ${item.dek || ''}`)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));

  const kept = [];
  for (const item of pool) {
    const normalized = normalizeTitle(item.title);
    if (kept.some((saved) => jaccard(saved._normalized, normalized) >= 0.6)) continue;
    kept.push({ ...item, _normalized: normalized });
    if (kept.length >= MAX_CANDIDATES) break;
  }
  return kept;
}

async function scoreAll(items) {
  const heuristic = (item) => {
    let score = tierWeight(item.tier) * 1.5;
    score += { 'us-mexico': 2.4, economy: 2.2, politics: 2, fintech: 1.8, deals: 1.4, companies: 1.2 }[item.beat] || 1;
    const age = (Date.now() - Date.parse(item.published_at)) / 864e5;
    score += age < 2 ? 1.2 : age < 4 ? 0.5 : 0;
    score += Math.min((`${item.title} ${item.dek || ''}`.match(new RegExp(IMPORTANT, 'gi')) || []).length, 3);
    if (!item.dek) score -= 1.5;
    return { score: Math.max(0, Math.min(12, Number(score.toFixed(1)))) };
  };

  if (!hasLLM()) return items.map((item) => ({ ...item, ...heuristic(item) }));

  const schema = {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['i', 'score', 'headline'],
          properties: {
            i: { type: 'integer' },
            score: { type: 'number' },
            headline: { type: 'string' },
          },
        },
      },
    },
  };
  const system = `Rank stories for a weekly briefing on Mexico. Score each item from 0 to 12 using six tests, each worth 0 to 2: consequence for Mexico, usefulness to a decision or change of view, genuinely new information this week, durability beyond the news cycle, evidence quality, and relevance to Mexico's economy, politics, or relationship with the United States. Routine company promotion, opinion, rewrites, and headlines without evidence score low. Also rewrite each title as a short, plain English statement of what happened. Use only the supplied title and description. Do not add a consequence or inference. Maximum 14 words. Return only the requested JSON.`;
  const payload = items.map((item, i) => ({ i, source: item.sourceName, title: item.title, dek: shorten(item.dek, 220), beat: item.beat }));
  const result = await askJSON({ system, user: JSON.stringify(payload), schema, maxTokens: 3000 });
  if (!result?.items) return items.map((item) => ({ ...item, ...heuristic(item) }));
  const scores = new Map(result.items.map((row) => [row.i, row]));
  return items.map((item, i) => ({
    ...item,
    score: scores.has(i) ? Math.max(0, Math.min(12, Number(scores.get(i).score) || 0)) : heuristic(item).score,
    plainHeadline: scores.get(i)?.headline?.trim() || item.title,
  }));
}

function sourceDek(value, title) {
  let text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const boilerplate = text.toLowerCase().indexOf('la publicación ');
  if (boilerplate >= 0) text = text.slice(0, boilerplate).trim();
  if (title && normalizeTitle(text) === normalizeTitle(title)) return '';
  if (text.length < 70 || /(?:\.\.\.|…|<[a-z/?][^>]*$)/i.test(text)) return '';
  return text;
}

async function summarizeStory(item, kind) {
  const fetched = await fetchArticle(item.url);
  if (!fetched.ok) {
    return { ok: false, error: 'Source text could not be fetched. The item is headline-only until it is checked.' };
  }
  if (!hasLLM()) {
    const excerpt = sourceDek(item.dek, item.title);
    if (!excerpt) return { ok: false, error: 'Source text was fetched, but no finished summary was generated without the model.' };
    return {
      ok: true,
      headline: item.title,
      summary: excerpt,
      sourceMode: 'source description',
      flags: ['Source description used in fallback mode; Alan must review it before sending.'],
    };
  }

  const lead = kind === 'lead';
  const maxWords = lead ? 350 : 140;
  const schema = {
    type: 'object', additionalProperties: false, required: ['headline', 'summary'],
    properties: { headline: { type: 'string' }, summary: { type: 'string' } },
  };
  const system = `${LAW}\n\n${EMAIL}\n\nWrite the factual part of a weekly email in clear English. Use only the supplied article text. Do not add an opinion, a prediction, a generic significance line, a \"why it matters\" label, or a joke. Write a short English headline that says what happened. Do not pad it to meet a word count. Maximum 14 words. Then state what changed, the useful comparison, the context needed to read it correctly, and the next known step if the article supplies one. Write connected paragraphs. Use less space when the source supports less. Never repeat a point to reach a word count. The editor will add his own read later.`;
  const user = `ROLE: ${kind}\nMAXIMUM: ${maxWords} words\nTITLE: ${item.title}\nSOURCE: ${item.sourceName || domainOf(item.url)}\nURL: ${item.url}\n\nARTICLE TEXT:\n${fetched.text.slice(0, 9000)}`;

  let output = await askJSON({ system, user, schema, maxTokens: lead ? 1000 : 550 });
  if (!output?.headline || !output?.summary) return { ok: false, error: 'The source was fetched, but the summary model returned incomplete copy.' };

  const check = (copy) => {
    const headlineLint = lintReportText({
      text: copy.headline,
      inputs: [item.title, fetched.text],
      maxWords: 14,
      maxSentences: 1,
    });
    if (/[?!]/.test(copy.headline)) headlineLint.flags.push('headline uses a question or exclamation mark');
    const lint = lintReportText({
      text: copy.summary,
      inputs: [item.title, fetched.text],
      maxWords,
      maxSentences: lead ? 14 : 7,
    });
    lint.flags.unshift(...headlineLint.flags.map((flag) => `headline: ${flag}`));
    return { ok: lint.flags.length === 0, flags: lint.flags };
  };

  let lint = check(output);
  if (!lint.ok) {
    const retry = await askJSON({
      system,
      user: `${user}\n\nThe first draft failed these checks: ${lint.flags.join('; ')}. Rewrite it from the same source text and fix every one.`,
      schema,
      maxTokens: lead ? 1000 : 550,
    });
    if (retry?.headline && retry?.summary) {
      const retryLint = check(retry);
      if (retryLint.flags.length < lint.flags.length) {
        output = retry;
        lint = retryLint;
      }
    }
  }
  if (!lint.ok) return { ok: false, error: `Generated summary failed review checks: ${lint.flags.join('; ')}` };

  return { ok: true, headline: output.headline.trim(), summary: output.summary.trim(), sourceMode: 'fetched article', flags: [] };
}

const storyRecord = (item, summary) => ({
  itemId: item.id,
  headline: summary.headline || item.title,
  summary: summary.summary,
  editorNote: '',
  url: item.url,
  sourceName: item.sourceName || domainOf(item.url),
  date: fmtDay(item.published_at),
  sourceMode: summary.sourceMode,
  flags: summary.flags || [],
});

function readingMinutes(draft) {
  const parts = [draft.intro];
  if (draft.lead) parts.push(draft.lead.headline, draft.lead.summary, draft.lead.editorNote);
  for (const item of draft.supporting) parts.push(item.headline, item.summary, item.editorNote);
  for (const row of draft.numbers) parts.push(row.name, row.current, row.change, row.period);
  for (const item of draft.quickUpdates) parts.push(item.headline);
  for (const item of draft.watch) parts.push(item.w, item.why);
  const words = parts.join(' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function makeAtAGlance(lead, supporting, numbers, watch) {
  const lines = [];
  if (lead) lines.push({ text: lead.headline, href: lead.url });
  supporting.forEach((item) => lines.push({ text: item.headline, href: item.url }));
  if (lines.length < 3 && numbers[0]) lines.push({ text: `${numbers[0].name}: ${numbers[0].current}${numbers[0].change ? ` (${numbers[0].change})` : ''}`, href: numbers[0].sourceUrl });
  if (lines.length < 3 && watch[0]) lines.push({ text: `${watch[0].dt}: ${watch[0].w}`, href: watch[0].sourceUrl });
  return lines.slice(0, 5);
}

async function main() {
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7));
  const week = isoWeek(monday);

  console.log(`\nbuild-email ${week} · model ${hasLLM() ? model : 'none (review fallback)'}`);

  const numbers = buildNumbers(now);
  const watch = buildWatch(now);
  const scored = (await scoreAll(candidates(now))).sort((a, b) => b.score - a.score);

  // Exact URLs used in recent issues do not get another full slot.
  const priorIssues = await recentIssues(8).catch(() => []);
  const priorUrls = new Set();
  for (const issue of priorIssues) {
    if (issue?.week === week) continue;
    const oldDraft = issue?.draft || {};
    if (oldDraft.lead?.url) priorUrls.add(oldDraft.lead.url);
    for (const item of list(oldDraft.supporting)) if (item?.url) priorUrls.add(item.url);
    for (const item of list(oldDraft.topOfWeek)) if (item?.url) priorUrls.add(item.url);
  }
  const ranked = scored.filter((item) => !priorUrls.has(item.url));

  const draftErrors = [];
  const selectedIds = new Set();
  let lead = null;

  for (const candidate of ranked.filter((item) => item.score >= LEAD_THRESHOLD).slice(0, 3)) {
    const summary = await summarizeStory(candidate, 'lead');
    if (!summary.ok) {
      draftErrors.push({ slot: 'lead candidate', headline: candidate.title, url: candidate.url, error: summary.error });
      continue;
    }
    lead = storyRecord(candidate, summary);
    selectedIds.add(candidate.id);
    console.log(`  lead [${candidate.score}] ${shorten(candidate.title, 68)}`);
    break;
  }

  const supporting = [];
  for (const candidate of ranked.filter((item) => !selectedIds.has(item.id) && item.score >= SUPPORT_THRESHOLD).slice(0, 7)) {
    if (supporting.length >= MAX_SUPPORTING) break;
    const summary = await summarizeStory(candidate, 'supporting');
    if (!summary.ok) {
      draftErrors.push({ slot: 'supporting candidate', headline: candidate.title, url: candidate.url, error: summary.error });
      continue;
    }
    supporting.push(storyRecord(candidate, summary));
    selectedIds.add(candidate.id);
    console.log(`  supporting [${candidate.score}] ${shorten(candidate.title, 62)}`);
  }

  const quickUpdates = (hasLLM() ? ranked : [])
    .filter((item) => !selectedIds.has(item.id) && item.score >= QUICK_THRESHOLD)
    .slice(0, MAX_QUICK)
    .map((item) => ({
      itemId: item.id,
      headline: item.plainHeadline || item.title,
      url: item.url,
      sourceName: item.sourceName || domainOf(item.url),
      date: fmtDay(item.published_at),
    }));
  quickUpdates.forEach((item) => selectedIds.add(item.itemId));

  const subjectLead = lead?.headline || supporting[0]?.headline || quickUpdates[0]?.headline || 'the numbers that changed';
  const subject = `Mexico this week: ${shorten(subjectLead, 47)}`;
  const second = supporting[0]?.headline || quickUpdates[0]?.headline || '';
  const contextLine = numbers[0]
    ? `${numbers[0].name} is ${numbers[0].current}.`
    : watch[0]
      ? `Next: ${watch[0].w}, ${watch[0].dt}.`
      : '';
  const previewText = shorten([second ? `${second}.` : '', contextLine].filter(Boolean).join(' '), 150) || '[PREVIEW TEXT NEEDED]';
  if (previewText === '[PREVIEW TEXT NEEDED]') {
    draftErrors.push({ slot: 'preview text', headline: '', url: '', error: 'No specific preview text could be built.' });
  }

  const draft = {
    week,
    subject,
    previewText,
    status: 'draft',
    dateLabel: fmtFull(monday),
    builtAt: now.toISOString(),
    intro: '',
    lead,
    supporting,
    numbers,
    quickUpdates,
    watch,
    atAGlance: makeAtAGlance(lead, supporting, numbers, watch),
    reviewQuestions: [
      'Is this the right lead? If not, which candidate should replace it?',
      'Do you have a read on the lead? One or two rough sentences are enough. “None this week” is fine.',
      'What is missing, or what should be cut?',
    ],
    draftErrors,
    lintFlags: [
      ...list(lead?.flags).map((flag) => `${lead.headline}: ${flag}`),
      ...supporting.flatMap((item) => list(item.flags).map((flag) => `${item.headline}: ${flag}`)),
    ],
    footerExtra: '',
    _cost: usage().costUSD,
    _llm: hasLLM(),
  };
  draft.readMin = readingMinutes(draft);

  fs.mkdirSync(D('email'), { recursive: true });
  const html = renderEmail(draft);
  fs.writeFileSync(D('email', `${week}.json`), JSON.stringify(draft, null, 2));
  fs.writeFileSync(D('email', `${week}.html`), html);
  fs.writeFileSync(path.join(ROOT, 'email-preview.html'), renderPreview(draft));
  fs.writeFileSync(D('email', 'latest.json'), JSON.stringify({
    week,
    subject,
    status: 'draft',
    htmlPath: `data/email/${week}.html`,
    builtAt: now.toISOString(),
    cost: usage().costUSD,
  }, null, 2));

  if (hasStore()) {
    try {
      await upsertItems(scored.map((item) => ({
        id: item.id,
        url: item.url,
        source: item.source,
        source_name: item.sourceName,
        tier: String(item.tier ?? ''),
        beat: item.beat,
        lang: item.lang,
        title: item.title,
        dek: item.dek,
        published_at: item.published_at || null,
        first_seen: item.first_seen || null,
        score: item.score,
        room: null,
        published_in: selectedIds.has(item.id) ? week : null,
      })));
      await upsertIssue({ week, issue_no: Number(week.slice(-2)), subject, status: 'draft', draft, built_at: now.toISOString() });
      console.log(`  store: issue + ${scored.length} item judgments upserted`);
    } catch (error) {
      console.warn('  store: upsert failed —', error.message);
    }
  }

  const used = usage();
  console.log(`\n  ${week} · ${lead ? '1 lead' : 'no lead'} · ${supporting.length} supporting · ${numbers.length} numbers · ${quickUpdates.length} quick · ${draft.readMin}-min`);
  console.log(`  source problems: ${draftErrors.length} · review flags: ${draft.lintFlags.length}`);
  console.log(`  llm: ${used.calls} calls · ${used.input}+${used.output} tok · ~$${used.costUSD.toFixed(4)}`);
  console.log(`  wrote data/email/${week}.json + .html · email-preview.html · latest.json (status: draft)\n`);
}

main().catch((error) => {
  console.error('build-email failed:', error.stack || error.message);
  process.exit(1);
});
