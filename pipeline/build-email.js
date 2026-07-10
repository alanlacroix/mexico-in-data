// build-email.js — the weekly issue generator. Runs Saturday. Reads the news
// ledger + the wired data series, ranks the week, summarizes only the two-or-three
// lead stories from their actual article text, assembles the data board by code,
// and writes a draft + a rendered email + a preview page. It NEVER sends. Sending
// is a separate, manual step (send-email.js), so nothing goes out without a look.
//
// The model (Haiku 4.5) does exactly two things: score/route candidates, and
// summarize the lead stories from fetched text. With no ANTHROPIC_API_KEY it falls
// back to a deterministic heuristic and still produces a real, honest issue.
//
//   node build-email.js            # build this week's draft + preview
//
// Cost: cents per issue. Honesty law: lead summaries use only fetched article
// text; the board is computed from wired sources; nothing is invented.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, model } from './lib/anthropic.js';
import { renderEmail, renderPreview, domainOf } from './lib/email-template.js';
import { fetchArticle } from './lib/fetch-article.js';
import { hasStore, upsertItems, upsertIssue, recentIssues } from './lib/store.js';
import { lintSummary } from './lib/lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const STYLE = fs.readFileSync(path.join(__dirname, 'email-style.md'), 'utf8');   // the editorial contract, compiled into the summary prompt
const TOP_THRESHOLD = 7.5;               // score to earn a "top of the week" lead slot
const ROOM_THRESHOLD = 4.0;              // score to appear in a room at all
const MAX_LEADS = 3, MAX_PER_ROOM = 3, MAX_CANDIDATES = 70;

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MOF = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const fmtDay = (s) => { const d = new Date(s); return Number.isFinite(d.getTime()) ? `${MO[d.getUTCMonth()]} ${d.getUTCDate()}` : ''; };
const fmtMon = (s) => { const d = new Date(s); return Number.isFinite(d.getTime()) ? MO[d.getUTCMonth()] : ''; };
const fmtFull = (d) => `${WD[d.getUTCDay()]}, ${MOF[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const shorten = (s, n) => (s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s || '');
const numWord = (n) => ['zero','One','Two','Three','Four','Five'][n] || String(n);

// (article fetch + text extraction moved to lib/fetch-article.js, shared with archive-bodies.js)

// ---- data board (deterministic; every row from a wired source) ----
function loadSeries(id) {
  const j = readJson(D('series', id + '.json'), null);
  return (j?.data || []).filter((x) => x && x.value != null)
    .map((x) => ({ t: Date.parse(x.date), v: +x.value, date: x.date }))
    .filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
}
const nearest = (arr, ms) => arr.reduce((best, x) => (Math.abs(x.t - ms) < Math.abs((best?.t ?? Infinity) - ms) ? x : best), null);
const nearestWithin = (arr, ms, days) => { const n = nearest(arr, ms); return n && Math.abs(n.t - ms) <= days * 864e5 ? n : null; };  // null unless a point lands close enough to the target date
const arr = (v) => (Array.isArray(v) ? v : []);
const dir = (x, eps) => (x > eps ? 'up' : x < -eps ? 'down' : 'flat');
const signed = (x, dp, suf = '') => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(dp) + suf;

function buildBoard() {
  const rows = [];
  // Peso per USD (business-daily) — vs ~1 week ago
  const px = loadSeries('banxico-usdmxn-fix');
  if (px.length > 1) {
    const last = px.at(-1), wk = nearestWithin(px, last.t - 7 * 864e5, 12);
    const c = wk ? (last.v / wk.v - 1) * 100 : null;
    rows.push({ arrow: c == null ? 'flat' : dir(c, 0.05), name: 'Peso per USD', sub: `Banxico · ${fmtDay(last.date)}`, val: last.v.toFixed(2), pillTxt: c == null ? 'latest' : signed(c, 1, '%'), note: c == null ? 'daily' : c > 0 ? 'weaker on wk' : c < 0 ? 'stronger on wk' : 'flat on wk' });
  }
  // Headline + core inflation (monthly YoY) — vs prior month, in points
  for (const [id, label] of [['banxico-inflacion', 'Headline inflation'], ['banxico-inflacion-subyacente', 'Core inflation']]) {
    const s = loadSeries(id);
    if (s.length > 1) {
      const last = s.at(-1), prev = s.at(-2), d = last.v - prev.v;
      rows.push({ arrow: dir(d, 0.02), name: label, sub: `INEGI · ${fmtMon(last.date)}`, val: last.v.toFixed(2) + '%', pillTxt: signed(d, 2, ' pts'), note: 'vs prior mo' });
    }
  }
  // Banxico policy rate — held, or last move
  const rt = loadSeries('banxico-tasa-objetivo');
  if (rt.length > 1) {
    const last = rt.at(-1); let ch = null, chFrom = null;
    for (let i = rt.length - 1; i > 0; i--) if (rt[i].v !== rt[i - 1].v) { ch = rt[i]; chFrom = rt[i - 1].v; break; }
    const recent = ch && (last.t - ch.t) < 45 * 864e5;
    if (recent) { const bps = Math.round((last.v - chFrom) * 100); rows.push({ arrow: dir(bps, 0), name: 'Banxico rate', sub: `Banxico · ${fmtDay(ch.date)}`, val: last.v.toFixed(2) + '%', pillTxt: signed(bps, 0, 'bp'), note: bps < 0 ? 'cut' : 'hiked' }); }
    else { rows.push({ arrow: 'flat', name: 'Banxico rate', sub: `Banxico${ch ? ' · since ' + fmtMon(ch.date) : ''}`, val: last.v.toFixed(2) + '%', pillTxt: 'held', note: 'unchanged' }); }
  }
  // Remittances (monthly, US$m) — year-over-year only if a genuine year-ago point exists, else month-over-month
  const rem = loadSeries('banxico-remesas');
  if (rem.length) {
    const last = rem.at(-1);
    const ya = nearestWithin(rem, last.t - 365 * 864e5, 45);
    let chg = null, pill = 'latest', note = 'monthly';
    if (ya) { chg = (last.v / ya.v - 1) * 100; pill = signed(chg, 1, '% y/y'); note = 'vs year ago'; }
    else if (rem.length > 1) { const prev = rem.at(-2); chg = (last.v / prev.v - 1) * 100; pill = signed(chg, 1, '% m/m'); note = 'vs prior mo'; }
    rows.push({ arrow: chg == null ? 'flat' : dir(chg, 0.1), name: 'Remittances', sub: `Banxico · ${fmtMon(last.date)}`, val: '$' + (last.v / 1000).toFixed(2) + 'bn', pillTxt: pill, note });
  }
  // US–Mexico two-way trade (Census) — vs prior month
  const tj = readJson(D('trade-us.json'), null);
  if (tj?.latest?.twoway_bn) {
    const imp = tj.series?.imports || [], exp = tj.series?.exports || [];
    let note = 'two-way goods', arrow = 'flat', pill = 'latest';
    if (imp.length > 1 && exp.length > 1) {
      const cur = tj.latest.twoway_bn, prev = (imp.at(-2).value + exp.at(-2).value);
      const c = (cur / prev - 1) * 100; arrow = dir(c, 0.1); pill = signed(c, 1, '% m/m');
    }
    rows.push({ arrow, name: 'US–MX trade (2-way)', sub: `Census · ${fmtMon(tj.latest.month + '-01')}`, val: '$' + Math.round(tj.latest.twoway_bn) + 'bn', pillTxt: pill, note });
  }
  return rows;
}

// ---- what to watch (deterministic; upcoming dated events) ----
function buildWatch(now) {
  const ev = readJson(D('events.json'), { events: [] }).events || [];
  return ev.filter((e) => e && e.date && typeof e.label === 'string' && Date.parse(e.date) >= now.getTime() - 864e5)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
    .map((e) => { let w = e.label.split(' (')[0].split(' — ')[0]; return { dt: fmtDay(e.date), w: shorten(w, 96) }; });
}

// ---- candidate news (dedup, window, drop aggregator) ----
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').replace(/\s+/g, ' ').trim();
function jaccard(a, b) {
  const A = new Set(a.split(' ').filter((w) => w.length > 3)), B = new Set(b.split(' ').filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}
const tierW = (t) => (t === 1 ? 3 : t === 'specialist' ? 2.5 : t === 2 ? 2 : 1);

function candidates(now) {
  const wk = (dt) => { const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0'); };
  const thisW = wk(now), prevW = wk(new Date(now.getTime() - 7 * 864e5));
  const all = [...arr(readJson(D('news', thisW + '.json'), [])), ...arr(readJson(D('news', prevW + '.json'), []))];
  const cutoff = now.getTime() - 7 * 864e5;
  const pool = all.filter((x) => x.source !== 'news.google.com' && Date.parse(x.published_at) >= cutoff && x.title);
  pool.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const kept = [];
  for (const x of pool) {
    const n = normTitle(x.title);
    if (kept.some((k) => jaccard(k._n, n) >= 0.6)) continue;   // collapse near-duplicate stories
    x._n = n; kept.push(x);
    if (kept.length >= MAX_CANDIDATES) break;
  }
  return kept;
}

// ---- scoring: LLM if available, deterministic otherwise ----
const ROOM_OF_BEAT = { fintech: 'fintech', companies: 'companies', deals: 'companies', economy: 'economy', politics: 'politics', 'us-mexico': 'us-mexico' };
const KW = /\b(ipo|banxico|sheinbaum|arancel|tariff|usmca|tmec|adquisic|adquiere|acquir|merger|raise[sd]?|ronda|series\s?[a-e]\b|million|millones|licencia|cnbv|femsa|oxxo|pemex|nearshor|reforma|neobank|neobanco|s[ao]fipo|remesas|remittanc)\b/i;

const NONMX = /\b(colombia|brasil|brazil|argentin|chile|per[úu]|ecuador|bolivia|venezuela|uruguay|paraguay|guatemala|hondur|el salvador|nicaragua|centroam[eé]ric|espa[ñn]a|spain)/i;
const MXTERMS = /m[eé]xic|mexican|\bcdmx\b|banxico|sheinbaum|\bpemex\b|\bfemsa\b|\boxxo\b|\bmorena\b|\binegi\b|\bcnbv\b|\bpeso(s)?\b|monterrey|guadalajara|\bbmv\b|nearshor|maquila|tmec|usmca/i;

async function scoreAll(cands) {
  const heur = (x) => {
    let s = tierW(x.tier) * 1.4;
    s += { fintech: 2.6, 'us-mexico': 2.1, deals: 1.7, companies: 1.6, economy: 1.6, politics: 1.2 }[x.beat] || 1;
    const age = (Date.now() - Date.parse(x.published_at)) / 864e5;
    s += age < 2 ? 1.5 : age < 4 ? 0.6 : 0;
    const txt = x.title + ' ' + (x.dek || '');
    const hits = (txt.match(new RegExp(KW, 'gi')) || []).length;
    s += Math.min(hits, 3);
    if (!x.dek) s -= 1.6;                                 // dek-less wire backstop items don't lead
    if (NONMX.test(txt) && !MXTERMS.test(txt)) s -= 5;   // it's a Mexico brief: drop other-country stories
    return { score: Math.max(0, Math.min(10, +s.toFixed(1))), room: ROOM_OF_BEAT[x.beat] || 'economy' };
  };
  if (!hasLLM()) return cands.map((x) => ({ ...x, ...heur(x) }));

  const schema = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'score', 'room'], properties: { i: { type: 'integer' }, score: { type: 'number' }, room: { type: 'string', enum: ['fintech', 'companies', 'economy', 'politics', 'us-mexico'] } } } } } };
  const system = `You are the editor of The Mexico Brief, a weekly executive briefing on Mexico. The primary reader runs a payments and fintech company in Mexico and wants to stay sharp on: Mexican macro (peso, inflation, Banxico), politics and policy (Sheinbaum, reforms, security), US–Mexico trade and tariffs, payments and fintech, big company news (Femsa/OXXO, IPOs, executive moves), and money and deals (venture funding, nearshoring, M&A).
Score each candidate 0 to 10 for how much it belongs in this week's brief. 10 = a defining event of the week (a Banxico rate decision, a major IPO, a tariff action, a large fintech raise or a new regulation). 5 = solid sector news worth a line. 0 = routine, hyper-local, listicle, or off-topic. Route each to exactly one room: fintech, companies (company news, M&A, IPOs, venture deals, nearshoring investments), economy, politics, or us-mexico. Only score and route the items given. Return JSON.`;
  const payload = cands.map((x, i) => ({ i, beat: x.beat, title: x.title, dek: (x.dek || '').slice(0, 180) }));
  const out = await askJSON({ system, user: JSON.stringify(payload), schema, maxTokens: 4000 });
  if (!out?.items) { console.warn('  scorer: no result, using heuristic'); return cands.map((x) => ({ ...x, ...heur(x) })); }
  const byI = new Map(out.items.map((r) => [r.i, r]));
  return cands.map((x, i) => { const r = byI.get(i); return r ? { ...x, score: Math.max(0, Math.min(10, +r.score || 0)), room: r.room || ROOM_OF_BEAT[x.beat] || 'economy' } : { ...x, ...heur(x) }; });
}

// ---- summarize a lead story from its own article text only ----
// Voice is the compiled email-style.md contract; every model draft is lint-gated and
// rewritten once on a hard violation. Fallback (no key / no text) uses the source dek
// verbatim, unlinted (it's the outlet's own words, not ours to enforce).
async function summarizeLead(item, continuityCtx) {
  const dek = (item.dek || '').trim();
  const real = /federalregister\.gov/.test(item.url);
  if (!hasLLM()) return { summary: dek, why: '', real, source: 'dek', flags: [] };
  const { ok, text } = await fetchArticle(item.url);
  if (!ok) return { summary: dek || 'See the linked report.', why: '', real, source: 'dek', flags: [] };
  const schema = { type: 'object', additionalProperties: false, required: ['summary', 'why'], properties: { summary: { type: 'string' }, why: { type: 'string' } } };
  const system = STYLE + (continuityCtx ? `\n\n## Prior issues (continuity only — you may reference these, but only if you cite the issue's date)\n${continuityCtx}` : '');
  const baseUser = `TITLE: ${item.title}\nSOURCE: ${item.sourceName || domainOf(item.url)}\nURL: ${item.url}\n\nARTICLE TEXT:\n${text.slice(0, 6000)}`;
  let out = await askJSON({ system, user: baseUser, schema, maxTokens: 500 });
  if (!out?.summary) return { summary: dek || 'See the linked report.', why: '', real, source: 'dek', flags: [] };
  let lint = lintSummary(out);
  if (lint.hard) {   // one enforced rewrite on a hard voice violation (em-dash / hype)
    const retry = await askJSON({ system, user: `${baseUser}\n\nYour previous draft broke the style rules (${lint.flags.join('; ')}). Rewrite it obeying every rule, same facts, from the article text only.`, schema, maxTokens: 500 });
    if (retry?.summary) { const rl = lintSummary(retry); if (rl.flags.length <= lint.flags.length) { out = retry; lint = rl; } }
  }
  return { summary: (out.summary || '').trim(), why: (out.why || '').trim(), real, source: 'llm', flags: lint.flags };
}

// ---- room chips (deterministic label from the story) ----
function chipFor(x) {
  const s = (x.title + ' ' + (x.dek || '')).toLowerCase();
  if (/\bipo\b|sale a bolsa|debut burs/.test(s)) return 'ipo';
  if (/raise|ronda|series\s?[a-e]\b|levant[óa]|funding|inversión de|\$\d/.test(s)) return 'funding';
  if (/cnbv|regula|licencia|law|ley|norma|sofipo/.test(s)) return 'regulation';
  if (/nombra|appoint|new (ceo|head|chief)|renuncia|sale de|ficha a/.test(s)) return 'people';
  if (/adquiere|acquir|merger|fusión|compra/.test(s)) return 'deal';
  if (/arancel|tariff|usmca|tmec/.test(s)) return 'tariff';
  if (/nearshor|planta|invertir|inversión|fábrica/.test(s)) return 'nearshoring';
  return { fintech: 'fintech', companies: 'company', deals: 'deals', economy: 'economy', politics: 'policy', 'us-mexico': 'us–mexico' }[x.beat] || '';
}

async function main() {
  const now = new Date();
  const isoWk = (() => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0'); })();
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7));

  console.log(`\nbuild-email ${isoWk} · model ${hasLLM() ? model : 'none (deterministic fallback)'}`);

  const board = buildBoard();
  const watch = buildWatch(now);
  const cands = candidates(now);
  console.log(`  board ${board.length} rows · watch ${watch.length} · candidates ${cands.length}`);

  const scored = (await scoreAll(cands)).sort((a, b) => b.score - a.score);

  // top of the week: everything above the bar (cap 3), else the single strongest
  let leadPicks = scored.filter((x) => x.score >= TOP_THRESHOLD).slice(0, MAX_LEADS);
  if (!leadPicks.length && scored.length) leadPicks = scored.slice(0, 1);
  const leadIds = new Set(leadPicks.map((x) => x.id));

  // continuity context: what recent issues led with (from the store; empty without it)
  const priorIssues = await recentIssues(8).catch(() => []);
  const continuityCtx = priorIssues.map((r) => {
    const leads = (r.draft?.topOfWeek || []).map((t) => t.headline).slice(0, 3).join(' · ');
    return `- ${r.week}${r.issue_no ? ' (issue ' + r.issue_no + ')' : ''}: ${leads || '(no leads)'}`;
  }).join('\n');

  const topOfWeek = [];
  const lintFlags = [];
  for (const p of leadPicks) {
    const s = await summarizeLead(p, continuityCtx);
    topOfWeek.push({ room: p.room, headline: p.title, summary: s.summary, why: s.why, url: p.url, sourceName: p.sourceName, date: fmtDay(p.published_at), real: s.real, flags: s.flags });
    if (s.flags?.length) lintFlags.push(`${shorten(p.title, 40)} — ${s.flags.join(', ')}`);
    console.log(`  lead [${p.score}] ${p.room} · ${shorten(p.title, 58)}${s.flags?.length ? '  ⚠ ' + s.flags.join(', ') : ''}`);
  }

  // rooms: remaining above the room bar, grouped, top N each
  const ROOMS = [
    { key: 'fintech', eyebrow: 'Payments & fintech' },
    { key: 'companies', eyebrow: 'Companies & deals' },
    { key: 'economy', eyebrow: 'Economy' },
    { key: 'politics', eyebrow: 'Politics & policy' },
    { key: 'us-mexico', eyebrow: 'US–Mexico' },
  ];
  const roomIds = new Set();
  const rooms = ROOMS.map((r) => {
    const picks = scored.filter((x) => !leadIds.has(x.id) && x.room === r.key && x.score >= ROOM_THRESHOLD).slice(0, MAX_PER_ROOM);
    picks.forEach((x) => roomIds.add(x.id));
    return { eyebrow: r.eyebrow, floor: r.floor, items: picks.map((x) => ({ t: x.title, d: shorten(x.dek || '', 165), chip: chipFor(x), source: x.sourceName, date: fmtDay(x.published_at), url: x.url })) };
  }).filter((r) => r.items.length);

  // intro + read-time + subject + issue
  const roomCount = rooms.reduce((s, r) => s + r.items.length, 0);
  const readMin = Math.max(2, Math.round((topOfWeek.length * 45 + roomCount * 8 + 30 + (watch.length ? 15 : 0)) / 60));
  const n = topOfWeek.length;
  const leadClause = n === 0 ? 'A quiet week for headlines. The board is below.'
    : n === 1 ? 'One story led the week.'
      : `${numWord(n)} stories led the week.`;
  const intro = `<b>Good ${WD[monday.getUTCDay()]}.</b> ${leadClause} About a ${readMin}-minute read.`;
  const prev = readJson(D('email', 'latest.json'), null);
  const issue = prev && prev.week === isoWk ? prev.issue : (prev?.issue || 0) + 1;
  const lead0 = topOfWeek[0];
  const subject = lead0 ? `The Mexico Brief — ${shorten(lead0.headline, 66)}` : `The Mexico Brief — week of ${fmtDay(monday.toISOString())}`;

  const draft = {
    week: isoWk, issue, subject, status: 'draft',
    dateLabel: fmtFull(monday), readMin, builtAt: now.toISOString(),
    intro, topOfWeek, board, rooms, watch, lintFlags,
    footerExtra: '<br>You are getting this because you subscribed at mexicobrief.com. One tap unsubscribes.',
    _cost: usage().costUSD, _llm: hasLLM(),
  };

  // write outputs: draft JSON (approvable), exact send HTML, and the preview page
  fs.mkdirSync(D('email'), { recursive: true });
  const html = renderEmail(draft);
  fs.writeFileSync(D('email', isoWk + '.json'), JSON.stringify(draft, null, 2));
  fs.writeFileSync(D('email', isoWk + '.html'), html);
  fs.writeFileSync(path.join(ROOT, 'email-preview.html'), renderPreview(draft));   // Alan's review copy (draft banner)
  fs.writeFileSync(path.join(ROOT, 'weekly-sample.html'), html);                   // clean public sample for the site
  fs.writeFileSync(D('email', 'latest.json'), JSON.stringify({
    week: isoWk, issue, subject, status: 'draft', htmlPath: `data/email/${isoWk}.html`,
    builtAt: now.toISOString(), cost: usage().costUSD,
  }, null, 2));

  // capture: persist the issue + this week's item judgments to the store (fail-soft)
  if (hasStore()) {
    try {
      const published = new Set([...leadIds, ...roomIds]);
      await upsertItems(scored.map((x) => ({
        id: x.id, url: x.url, source: x.source, source_name: x.sourceName, tier: String(x.tier ?? ''),
        beat: x.beat, lang: x.lang, title: x.title, dek: x.dek,
        published_at: x.published_at || null, first_seen: x.first_seen || null,
        score: x.score, room: x.room, published_in: published.has(x.id) ? isoWk : null,
      })));
      await upsertIssue({ week: isoWk, issue_no: issue, subject, status: 'draft', draft, built_at: now.toISOString() });
      console.log(`  store: issue + ${scored.length} item judgments upserted`);
    } catch (e) { console.warn('  store: upsert failed —', e.message); }
  }

  const u = usage();
  console.log(`\n  issue ${issue} · ${topOfWeek.length} leads · ${rooms.length} rooms (${roomCount} items) · ${readMin}-min`);
  console.log(`  llm: ${u.calls} calls · ${u.input}+${u.output} tok · ~$${u.costUSD.toFixed(4)}`);
  console.log(`  wrote data/email/${isoWk}.json + .html · email-preview.html · latest.json (status: draft)`);
  console.log(`  to send: node send-email.js --week ${isoWk} --confirm  (or run the send-email Action)\n`);
}

main().catch((e) => { console.error('build-email failed:', e.stack || e.message); process.exit(1); });
