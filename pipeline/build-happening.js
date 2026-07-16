// build-happening.js — the cross-domain event log generator behind "What's happening",
// the homepage lead. This is the radar half of the product: while the number pipeline
// (run.js) tracks scheduled DATA RELEASES, this tracks EVENTS — a decree in the DOF, a
// Banxico decision, a court ruling, a security development, a tariff or USMCA move, a
// major deal — across every domain, not just economics.
//
// It reads the collected news wire (all beats), asks the model to SELECT the genuine
// dated developments a reader tracking Mexico needs, assign each a section + importance
// + a clean title + one honest line on why it matters, then MERGES them append-only into
// data/happening.json. It never invents: title and why are written only from the item's
// own headline + dek, and every entry keeps its source link and date.
//
// Fail-soft by design: with no ANTHROPIC_API_KEY it falls back to a deterministic pick
// (top-tier, most-recent, spread across sections) so the log still refreshes — the model
// only sharpens the selection and the "why". Existing entries always win a dedup, so the
// hand-seeded events (the ones curated before the pipeline existed) are never clobbered.
//
//   node build-happening.js                    # update data/happening.json in place
//   HAPPENING_OUT=/tmp/h.json node build-happening.js   # write elsewhere (dry test)
//
// Honesty law: cross-domain by construction (a per-section cap on the homepage keeps any
// one beat from dominating), every entry dated + linked to its source, model writes only
// from provided text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, usage, model } from './lib/anthropic.js';
import { REPORT, BAN } from './lib/voice.js';   // shared voice (Fable 2026-07-12): headlines + context REPORT plain
import { lintReportText, slopFlags, isSlop } from './lib/lint.js';
import { reconcileHappeningFactCopy } from './lib/fact-copy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const D = (...p) => path.join(ROOT, 'data', ...p);
const OUT = process.env.HAPPENING_OUT || D('happening.json');
const QUARANTINE_OUT = D('happening-quarantine.json');

// Canonical description of the log. Overrides any stale note carried in the existing
// file (the old "hand-curated for now" note was wrong once the pipeline took over).
const NOTE = "Curated cross-domain event log — the developments moving Mexico, each rewritten in plain English, dated, and linked to a first-party or record source. Auto-generated from the news wire on every refresh; raw or non-English items are quarantined, never published.";

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const arr = (v) => (Array.isArray(v) ? v : []);

// Items rejected this run (raw source language, feed boilerplate, truncation, or a
// missing link/date). They never reach the log; they are written to a quarantine file
// for visibility and are re-encountered from the news ledger on the next run, so a
// down-LLM cycle retries automatically. See lib/lint.js slopFlags.
const QUARANTINE = [];
function quarantine(ev, flags) {
  QUARANTINE.push({ ...ev, _flags: flags });
  console.warn(`  quarantine ${ev.id || ev.title?.slice(0, 40)}: ${flags.join('; ')}`);
}

const WINDOW_DAYS = 30;      // consider news from the last 30 days
const KEEP_DAYS = 60;        // the stored log holds a rolling ~60-day window (older ages out, unless imp 5)
const MAX_STORE = 60;        // hard cap on stored entries
const MAX_NEW = 16;          // model returns at most this many new events per run
const MAX_CANDIDATES = 90;

const SECTIONS = ['economy', 'money', 'politics', 'security', 'us-mexico', 'society'];

// Fallback section routing when the model isn't available (the model assigns section otherwise).
const SEC_RX  = /homicid|violen|c[áa]rtel|cartel|narco|crimen|segurid|extradi|fentanil|desaparec|security|militar|guardia nacional/i;
const USMX_RX = /usmca|t-?mec|arancel|tariff|frontera|border|trump|ustr|deporta|migra|remesa|remittanc|censo de comercio|section 2(32|01|22)/i;
const POL_RX  = /sheinbaum|morena|reforma|congreso|senado|diputad|judicial|corte|elecci|gobernad|amlo|pol[íi]tic|decreto|\bdof\b|constituc/i;
const MONEY_RX= /banxico|peso|inflaci|tasa de inter|bono|cetes|mercado|bolsa|\bbmv\b|rating|calificaci|moody|fitch|s&p/i;

function beatSection(x) {
  const t = (x.title || '') + ' ' + (x.dek || '') + ' ' + (x.beat || '');
  if (SEC_RX.test(t)) return 'security';
  if (USMX_RX.test(t)) return 'us-mexico';
  if (POL_RX.test(t)) return 'politics';
  if (MONEY_RX.test(t)) return 'money';
  return 'economy';   // companies / deals / fintech / generic → economy
}

// ---- candidate gathering (dedup, 30-day window) — mirrors build-email's candidates() ----
const normTitle = (t) => (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').replace(/\s+/g, ' ').trim();
function jaccard(a, b) {
  const A = new Set(a.split(' ').filter((w) => w.length > 3)), B = new Set(b.split(' ').filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}
function weekKey(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 864e5) + 1) / 7)).padStart(2, '0');
}
function candidates(now) {
  const seen = new Set(), all = [];
  for (let i = 0; i <= 5; i++) {                         // last ~6 ISO-week files cover a 30-day window
    const w = weekKey(new Date(now.getTime() - i * 7 * 864e5));
    for (const x of arr(readJson(D('news', w + '.json'), []))) {
      if (x && x.url && x.title && !seen.has(x.url)) { seen.add(x.url); all.push(x); }
    }
  }
  const cutoff = now.getTime() - WINDOW_DAYS * 864e5;
  // Keep google-news aggregator items here (unlike the email, which prefers clean links):
  // politics and security coverage largely comes through them, and the redirect resolves to
  // the real article. The model does the quality filtering; breadth matters more for the log.
  const pool = all.filter((x) => Date.parse(x.published_at) >= cutoff);
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

// ---- shape an event-log entry from a news item ----
const clampImp = (n) => Math.max(0, Math.min(10, Math.round(+n || 5)));   // 0-10 Brief rubric (see BRIEF-RUBRIC.md)
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52);
function mkEvent(x, section, importance, title, why) {
  const date = (x.published_at || '').slice(0, 10);
  return {
    id: 'n-' + slug(x.title) + '-' + date,
    date, section, title: (title || x.title || '').trim(), why: (why || '').trim(),
    source: x.sourceName || x.source || '', url: x.url, importance: clampImp(importance), kind: 'event',
  };
}

// Without the model we can't reliably tell an event from a listicle, so the fallback is
// deliberately conservative: skip obvious non-events, require a Mexico signal, and cap
// importance at 2 so a fallback item never outranks a real (model- or hand-curated) event
// on the homepage. It's a safety net to keep the log fresh when the LLM is down, not a
// substitute for it.
// Bars the soft-feature classes a keyless fallback can't tell from real events: quizzes, versus
// listicles, "the N most ___" rankings, brand-history features ("la historia de…"), routine FX
// open/close recaps ("así abre el tipo de cambio", "peso busca rescatar…"), forecast-cut rehashes,
// sports, how-tos, entertainment. The model path filters on meaning; this keeps the fallback honest.
const JUNK_RX = /¿(qui[eé]n|c[óo]mo|qu[eé]|cu[áa]l)|vs\.?\s|los? m[áa]s (barat|car|vendid)|entre l[ao]s \d+ m[áa]s|la historia de|as[íi] (abre|cierra)|busca rescatar|(d[óo]lar|tipo de cambio) hoy|precio del d[óo]lar|recorte de expectativas|\branking\b|paso a paso|hor[óo]scopo|receta|qu[eé] ver|streaming|nfl|nba|mlb|liga mx|fichaje|premios|celebr|tel[ei]nov|checa (las|los)|te decimos|aqu[íi] (los|las)/i;
const MX_RX = /m[eé]xic|mexican|\bcdmx\b|banxico|sheinbaum|\bpemex\b|\bfemsa\b|\boxxo\b|\bmorena\b|\binegi\b|\bcnbv\b|\bpeso(s)?\b|monterrey|guadalajara|\bbmv\b|nearshor|maquila|tmec|usmca|\bdof\b|hacienda|sat\b/i;
function curateFallback(cands, now) {
  const tierW = (t) => (t === 1 ? 4 : t === 'specialist' ? 3 : t === 2 ? 2 : 1);
  const scored = cands
    .filter((x) => (x.dek || '').trim())                                  // need a dek to justify a "why"
    .filter((x) => x.tier === 1 || x.tier === 2 || x.tier === 'specialist') // drop raw aggregator items
    .filter((x) => !JUNK_RX.test((x.title || '') + ' ' + (x.dek || '')))  // no listicles / sports / how-tos
    .filter((x) => MX_RX.test((x.title || '') + ' ' + (x.dek || '')))     // must be about Mexico, not off-topic
    .map((x) => ({ x, w: tierW(x.tier) * 2 + (Date.parse(x.published_at) > now.getTime() - 4 * 864e5 ? 2 : 0) }));
  scored.sort((a, b) => b.w - a.w || Date.parse(b.x.published_at) - Date.parse(a.x.published_at));
  const out = [], cap = {};
  for (const { x } of scored) {
    const s = beatSection(x);
    if ((cap[s] || 0) >= 2) continue;                                     // ≤2 per section, keep it cross-domain
    const ev = mkEvent(x, s, 2, x.title, (x.dek || '').slice(0, 180));    // imp 2: never outranks a real event
    const flags = slopFlags(ev);
    if (flags.length) { quarantine(ev, flags); continue; }                // no LLM to translate/clean → raw source is quarantined, never published
    cap[s] = (cap[s] || 0) + 1;
    out.push(ev);
    if (out.length >= MAX_NEW) break;
  }
  return out;
}

// ---- select + rank + write, via the model (fail-soft) ----
async function curate(cands, now) {
  if (!cands.length) return [];
  if (!hasLLM()) return curateFallback(cands, now);
  const schema = { type: 'object', additionalProperties: false, required: ['events'], properties: { events: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['i', 'section', 'importance', 'title', 'why'], properties: {
      i: { type: 'integer' }, section: { type: 'string', enum: SECTIONS }, importance: { type: 'integer' },
      title: { type: 'string' }, why: { type: 'string' },
    } } } } };
  const system = `You are the editor of The Mexico Brief's event log — "What's happening", the homepage lead. From the candidate news items, SELECT only the genuine, dated developments someone tracking Mexico needs to know: a decree or law (DOF), a Banxico or government policy decision, a court ruling, a security development, a tariff or USMCA move, an election or cabinet change, a major deal or company event. SKIP routine market recaps, price blurbs, listicles, opinion, sports, and near-duplicates of items you already picked.
For each item you select, return:
- i: its index in the list
- section: exactly one of economy | money | politics | security | us-mexico | society
- importance: 0-10, scored by the Brief rubric — add 0, 1, or 2 on EACH of five criteria: (1) national consequence, (2) US-Mexico stakes, (3) model impact (does it move or explain the peso, inflation, the policy rate, or growth?), (4) durability (still matters in 30 days — a first report of a real change scores; commentary and re-reports score 0), (5) officialness (a primary source like Banxico, INEGI, DOF, SHCP, or USTR is available). A defining national event (USMCA, a constitutional reform) scores 9-10; a solid worth-a-line item lands 5-6; anything below 5 will not make the Brief.
- title: a clean, factual headline in the present tense — rewrite the source headline for clarity, no hype, no em-dash, no clickbait
- why: ONE or two sentences of CONTEXT on why it matters — enough to actually explain the story, not just restate the headline. Write ONLY from the provided title and dek. State the stakes plainly; no invented facts, no numbers not present in the source, no adjectives doing the work of an argument.
Aim for BREADTH across sections — a reader should see politics, security, and U.S.–Mexico, not only economics. Prefer the most consequential item when several cover the same story. Select at most ${MAX_NEW}. Return JSON.

${REPORT}

${BAN}`;
  const payload = cands.map((x, i) => ({ i, beat: x.beat, date: (x.published_at || '').slice(0, 10), title: x.title, dek: (x.dek || '').slice(0, 200) }));
  // Headroom matters: up to MAX_NEW events with a rewritten title + 1-2 sentence why
  // each can exceed a few thousand output tokens, and a truncated JSON body silently
  // fails to parse and drops the ENTIRE clean batch to the raw-source fallback. That
  // was the real "slop" engine. Budget well above the worst case; the gate still caps
  // event count and why length, so actual output stays small.
  const out = await askJSON({ system, user: JSON.stringify(payload), schema, maxTokens: 8000 });
  if (!out || !Array.isArray(out.events)) { console.warn('  curate: no model result — deterministic fallback'); return curateFallback(cands, now); }
  const events = [];
  for (const r of out.events) {
    const x = cands[r.i]; if (!x) continue;
    const sec = SECTIONS.includes(r.section) ? r.section : beatSection(x);
    const report = `${String(r.title || '').trim()}. ${String(r.why || '').trim()}`;
    const gate = lintReportText({
      text: report,
      inputs: [x.published_at, x.title, x.dek],
      maxWords: 70,
      maxSentences: 3,
    });
    if (!gate.ok) {
      console.warn(`  reject generated event ${r.i}: ${gate.flags.join('; ')}`);
      continue;
    }
    const ev = mkEvent(x, sec, r.importance, r.title, r.why);
    const slop = slopFlags(ev);                                           // enforce the copy contract even on model output (link/date/language/whole-sentence)
    if (slop.length) { quarantine(ev, slop); continue; }
    events.push(ev);
  }
  return events.slice(0, MAX_NEW);
}

// ---- merge append-only into the existing log ----
function mergeLog(existing, fresh, now) {
  let events = arr(existing.events).slice();
  const before = events.length;
  // Self-heal: purge any stored entry that no longer meets the copy contract (raw
  // source language, feed boilerplate, truncation, missing link/date). Legacy fallback
  // pollution and any future regression get swept every run, not only the day they land.
  events = events.filter((e) => {
    const flags = slopFlags(e);
    if (flags.length) { quarantine(e, ['purged: ' + flags.join('; ')]); return false; }
    return true;
  });
  const nn = (e) => normTitle(e.title || '');
  for (const e of fresh) {
    const dup = events.find((o) =>
      (o.url && e.url && o.url === e.url) ||
      (o.id && e.id && o.id === e.id) ||
      (jaccard(nn(o), nn(e)) >= 0.6 && Math.abs((Date.parse(o.date) || 0) - (Date.parse(e.date) || 0)) <= 5 * 864e5));
    if (dup) continue;                    // existing wins — hand-seeded + earlier entries are canonical
    events.push(e);
  }
  const cutoff = now.getTime() - KEEP_DAYS * 864e5;
  const kept = events.filter((e) => { const t = Date.parse(e.date) || 0; return t >= cutoff || (e.importance || 0) >= 5; });
  kept.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return { events: kept.slice(0, MAX_STORE), added: kept.length - before > 0 ? kept.length - before : Math.max(0, events.length - before) };
}

async function main() {
  const now = new Date();
  console.log(`\nbuild-happening · model ${hasLLM() ? model : 'none (deterministic fallback)'}`);
  const existing = readJson(D('happening.json'), { meta: {}, events: [] });
  const cands = candidates(now);
  console.log(`  candidates ${cands.length} (last ${WINDOW_DAYS}d) · existing log ${arr(existing.events).length}`);
  const fresh = await curate(cands, now);
  console.log(`  curated ${fresh.length} fresh events`);
  const merged = mergeLog(existing, fresh, now).events;
  // Curated framing stays human; referenced values are re-derived from the stored
  // first-party dataset on every run so corrected source data cannot leave stale copy.
  const events = reconcileHappeningFactCopy(merged, { tradeUS: readJson(D('trade-us.json'), null) });

  const out = {
    meta: {
      title: "What's happening",
      note: NOTE,
      updated: now.toISOString().slice(0, 10),
      source: 'The Mexico Brief', sourceUrl: 'https://mexicobrief.com/sources',
      count: events.length, generatedAt: now.toISOString(), llm: hasLLM(),
    },
    events,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

  // Persist this run's rejects for visibility + the "should we keep quarantining"
  // risk check (gitignored — never a site input, never committed).
  const qOut = { meta: { note: 'Items rejected by the slop gate this run — never published. See pipeline/lib/lint.js slopFlags.', generatedAt: now.toISOString(), count: QUARANTINE.length }, items: QUARANTINE.slice(0, 120) };
  fs.writeFileSync(QUARANTINE_OUT, JSON.stringify(qOut, null, 2));

  const bySec = {}; events.forEach((e) => { bySec[e.section] = (bySec[e.section] || 0) + 1; });
  const u = usage();
  console.log(`  wrote ${path.relative(ROOT, OUT)} · ${events.length} events · ${QUARANTINE.length} quarantined · sections ${JSON.stringify(bySec)}`);
  console.log(`  llm: ${u.calls} calls · ${u.input}+${u.output} tok · ~$${u.costUSD.toFixed(4)}\n`);
}

main().catch((e) => { console.error('build-happening failed:', e.stack || e.message); process.exit(1); });
