// build-read.js — the LLM narrative layer for The Read (Fable's hybrid pattern, done safely).
//
// The model NEVER emits a number. It writes prose that references facts by placeholder ({{key}}); we
// resolve each placeholder from the deterministic facts pack at build time. A validator then FAILS
// CLOSED on two conditions: any bare digit in the model's raw output that isn't inside a placeholder,
// or any placeholder that doesn't resolve. Output is a DRAFT (data/analysis/read-draft.json) for Alan
// to review before it's shown — he already reviews each weekly issue, so this adds no new workflow.
//
// Fail-soft: no ANTHROPIC_API_KEY → no-op. Uses raw fetch (the pipeline is dependency-light by design,
// same as lib/store.js). Meant for a WEEKLY cadence, not the 6-hourly pull — the model doesn't need to
// re-narrate every 6 hours, and this is the only step here that costs money.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FACTS = path.join(__dirname, '..', 'data', 'analysis', 'facts.json');
const OUT = path.join(__dirname, '..', 'data', 'analysis', 'read-draft.json');
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.READ_MODEL || 'claude-opus-4-8';

// Flatten the facts pack into a small dictionary of {key -> {value, label}} the model may cite.
function factDict(f) {
  const d = {};
  for (const m of f.whatMoved.items || []) { d[`moved.${m.id}.value`] = { value: m.value, label: `${m.label} latest` }; if (m.changePct != null) d[`moved.${m.id}.changePct`] = { value: m.changePct, label: `${m.label} % change` }; }
  for (const [k, c] of Object.entries(f.cross || {})) { if (c.value != null) d[`cross.${k}`] = { value: c.value, label: c.label }; if (c.latest && c.latest.value != null) d[`cross.${k}.latest`] = { value: Math.round(c.latest.value), label: c.label }; }
  const keep = ['banxico-inflacion','banxico-inflacion-subyacente','banxico-tasa-objetivo','banxico-usdmxn-fix','banxico-reservas','banxico-remesas','banxico-exports-total','banxico-igae'];
  for (const id of keep) { const m = f.metrics[id]; if (m) { d[`m.${id}.value`] = { value: m.value, label: id }; if (m.trend12 != null) d[`m.${id}.trend12`] = { value: m.trend12, label: `${id} 12-month change` }; } }
  return d;
}

function validateAndResolve(text, dict) {
  // resolve placeholders, collecting any that don't exist
  const missing = [];
  const resolved = text.replace(/\{\{([a-zA-Z0-9._-]+)\}\}/g, (_, k) => { if (dict[k] && dict[k].value != null) return String(dict[k].value); missing.push(k); return `{{${k}}}`; });
  if (missing.length) return { ok: false, reason: `unresolved placeholders: ${missing.join(', ')}` };
  // after resolving, no BARE number may remain that wasn't ours: strip resolved placeholders' digits are fine;
  // the check is on the model's RAW output — any digit run outside a {{...}} is a fabricated number.
  const stripped = text.replace(/\{\{[a-zA-Z0-9._-]+\}\}/g, '');
  const stray = stripped.match(/(?<![A-Za-z])\d[\d.,]*/g);
  // allow years and the target-band shorthand as words, not as data claims
  const bad = (stray || []).filter((s) => !/^(19|20)\d\d$/.test(s.replace(/[.,]/g, '')) && !['2','3','4','1'].includes(s));
  if (bad.length) return { ok: false, reason: `bare numbers not from a placeholder: ${bad.slice(0, 6).join(', ')}` };
  return { ok: true, text: resolved };
}

async function callClaude(system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, thinking: { type: 'adaptive' }, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

(async () => {
  if (!KEY) { console.log('build-read: no ANTHROPIC_API_KEY — skipping (The Read still renders the deterministic facts).'); return; }
  if (!fs.existsSync(FACTS)) { console.log('build-read: no facts pack; run build-analysis.js first.'); return; }
  const f = JSON.parse(fs.readFileSync(FACTS, 'utf8'));
  const dict = factDict(f);

  const system = [
    'You write "The Read" for The Mexico Brief: a short, sober weekly analysis of Mexico\'s official data — the voice of a careful analyst, plain and human, no hype.',
    'ABSOLUTE RULE: you may NOT write any number. Every figure must be a placeholder token of the form {{key}} chosen from the ALLOWED FACTS list. Never type a digit yourself. If a number you want isn\'t in the list, describe it in words instead ("cooling", "near neutral") or omit it.',
    'You may only make claims the facts support. No forecasts. Two short paragraphs, ~120 words. Lead with what moved (or that it was quiet); close with why it matters to someone watching Mexico\'s economy.',
  ].join('\n');
  const user = 'ALLOWED FACTS (key → what it is):\n' + Object.entries(dict).map(([k, v]) => `{{${k}}} = ${v.label}`).join('\n') +
    '\n\nWhat moved this week: ' + (f.whatMoved.quiet ? 'nothing beyond the normal range (a quiet week).' : f.whatMoved.items.map((m) => `${m.label} (${m.flags.join('; ') || 'notable move'})`).join('; ')) +
    '\n\nWrite The Read now, numbers as {{placeholders}} only.';

  let raw; try { raw = await callClaude(system, user); } catch (e) { console.error('build-read: model call failed (non-fatal):', e.message); process.exit(0); }
  const v = validateAndResolve(raw, dict);
  if (!v.ok) { console.error(`build-read: validation FAILED — ${v.reason}. Draft NOT written (fail-closed).`); process.exit(0); }

  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, status: 'draft', factsGeneratedAt: f.generatedAt, text: v.text, raw }, null, 2));
  console.log(`build-read: draft written to data/analysis/read-draft.json (${v.text.length} chars) — review before publishing.`);
})().catch((e) => { console.error('build-read error (non-fatal):', e.message); process.exit(0); });
