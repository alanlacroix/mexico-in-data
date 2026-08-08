// anthropic.js — the pipeline's one and only LLM touchpoint. Zero-dependency raw
// fetch to the Messages API, so the pipeline stays dependency-free. Used by
// build-email.js to score news and summarize the week's lead items. Everything
// else in the pipeline is deterministic code with no model in the loop.
//
// Fail-soft by design: with no ANTHROPIC_API_KEY set, askJSON() returns null and
// the caller falls back to a deterministic heuristic. The email still builds; the
// model only sharpens it.
//
// Model tier, per Fable 2026-08-02, amending the earlier one-model ruling. That
// ruling's premise ("one Saturday batch, cents either way") expired: the pipeline
// now runs ~11 model-calling jobs a day across six scripts. The principle it was
// really protecting was one VOICE, and that survives.
//
//   Sonnet where the site has a view; Haiku where it has a task.
//   If a wrong output would embarrass the analyst, Sonnet.
//   If it would only embarrass the translator, Haiku.
//
// So ranking, "our view", the brief and the email stay on Sonnet. Literal
// translation of a headline is mechanical and checkable, and is the single most
// expensive line measured ($0.44 in one refresh), so it drops to Haiku.
//
// Not doing prompt caching. Fable proposed it, but the minimum cacheable prefix is
// 1024 tokens on Sonnet 5 and 4096 on Haiku 4.5, and the largest system prompt here
// is ~713 tokens. It would silently never engage — cache_creation_input_tokens: 0,
// no error. The input tokens are content anyway (22,715 in vs 14,593 out on a real
// run), not a repeated prompt, so there was little to cache even in principle.

const SONNET = 'claude-sonnet-5';        // $3/M in · $15/M out (intro $2/$10 to 2026-08-31)
const HAIKU = 'claude-haiku-4-5';        // $1/M in · $5/M out — mechanical, checkable jobs
const DEFAULT_MODEL = SONNET;
const KEY = process.env.ANTHROPIC_API_KEY || '';

// output_config.effort is a Sonnet 5 / Opus feature. Haiku 4.5 rejects it outright with
// "This model does not support the effort parameter" — an HTTP 400, not a warning. When
// the cost pass added effort:'low' to the three Haiku call sites (the wire translator,
// the topic areas and the story selection), all three began failing every call and
// falling back silently: fail-soft did its job so nothing broke visibly, but Spanish
// headlines published untranslated on the English page for days. Stripping the parameter
// here rather than at each call site means a future caller cannot reintroduce it.
const EFFORT_MODELS = new Set([SONNET]);

// ---- The budget, enforced rather than hoped for -----------------------------
// Alan's ceiling is $2/month, hard. Estimates have been wrong twice this session,
// so the ceiling is code: every call settles into a committed ledger
// (data/llm-spend.json, pushed by the same CI steps that commit data/), and once
// the month's total crosses the cap, askJSON returns null. Every caller already
// treats null as "keep last-good content" — the pipeline was built fail-soft, so
// a capped month degrades to a slightly staler site, never a broken one.
// The guard opens again on the 1st. Manual override for debugging:
// LLM_BUDGET_OVERRIDE=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MONTHLY_CAP_USD = 2.0;
// Preserve most of the small budget for the two jobs that define the product:
// selecting the Brief and explaining its top stories. Translation, topic synthesis
// and other fail-soft polish stop first. This changes allocation, never Alan's cap.
const CORE_RESERVE_USD = 1.4;
// LLM_LEDGER_PATH redirects the ledger so a test can exercise the real settle path
// without spending against Alan's actual monthly cap. Only tests set it.
const LEDGER = process.env.LLM_LEDGER_PATH
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'llm-spend.json');

const monthKey = () => new Date().toISOString().slice(0, 7);   // "2026-08"
function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return {}; }
}
function spentThisMonth() {
  return Number(readLedger()[monthKey()]) || 0;
}
function settle(costUSD) {
  const ledger = readLedger();
  ledger[monthKey()] = Math.round(((Number(ledger[monthKey()]) || 0) + costUSD) * 1e6) / 1e6;
  // keep only the last 3 months so the file never grows
  for (const k of Object.keys(ledger)) if (k < monthKey() && Object.keys(ledger).length > 3) delete ledger[k];
  try { fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`); } catch { /* read-only fs: skip */ }
}
function budgetLimit(priority = 'standard') {
  return priority === 'core' ? MONTHLY_CAP_USD : MONTHLY_CAP_USD - CORE_RESERVE_USD;
}
function overBudget(priority = 'standard') {
  if (process.env.LLM_BUDGET_OVERRIDE) return false;
  return spentThisMonth() >= budgetLimit(priority);
}
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Per-model rates, so a mixed-tier run reports what it actually cost rather than
// pricing a Haiku call as if it were Sonnet.
const RATES = {
  [SONNET]: { in: 3, out: 15 },
  [HAIKU]: { in: 1, out: 5 },
};

let _calls = 0;
let _badRequests = 0;               // permanent request bugs (HTTP 400), reported by usage()
const _tok = {};                         // model -> { in, out }

export const hasLLM = () => !!KEY;
export const model = DEFAULT_MODEL;
export const models = { SONNET, HAIKU };
export function budgetStatus(priority = 'standard') {
  const spentUSD = spentThisMonth();
  const limitUSD = budgetLimit(priority);
  return {
    priority,
    spentUSD,
    limitUSD,
    remainingUSD: Math.max(0, limitUSD - spentUSD),
    available: Boolean(process.env.LLM_BUDGET_OVERRIDE) || spentUSD < limitUSD,
  };
}

// Cumulative token usage and cost for the run, priced per model.
export function usage() {
  let input = 0, output = 0, costUSD = 0;
  for (const [m, t] of Object.entries(_tok)) {
    const rate = RATES[m] || RATES[SONNET];
    input += t.in;
    output += t.out;
    costUSD += (t.in / 1e6) * rate.in + (t.out / 1e6) * rate.out;
  }
  return { calls: _calls, badRequests: _badRequests, input, output, costUSD, byModel: { ..._tok } };
}

// Ask the model for a JSON answer. With `schema`, structured outputs guarantee the
// first content block is valid JSON. Transient errors and optional jobs return null.
// A malformed core request throws because deterministic fallback cannot repair code
// that will send the same rejected request on every future publication.
// Effort, which is the whole ballgame on cost here. Sonnet 5 runs ADAPTIVE THINKING
// BY DEFAULT and bills that reasoning as output tokens, and output is priced 5x input.
// Measured 2026-08-02 on the curation pass: 26,038 input against 15,519 output for two
// calls — roughly $0.23 of a $0.31 run was the model thinking, on a job that picks
// items from a list against a written rubric. Nobody asked for it; the client simply
// never set `effort` and inherited the `high` default.
//
//   'low'  — mechanical: select from a list, rank, translate, classify.
//   default — anything carrying the site's voice or judgment.
//
// This is not a quality knob turned down to save money. Extraction against an explicit
// rubric is the case where low effort costs nothing real, and Sonnet 5 respects the
// level strictly, which is exactly what a deterministic pass wants.
export async function askJSON({ system, user, schema, maxTokens = 1500, model: modelId = DEFAULT_MODEL, effort, priority = 'standard' }) {
  if (!KEY) return null;
  if (overBudget(priority)) {
    const status = budgetStatus(priority);
    const reason = priority === 'core' ? 'monthly cap reached' : 'core Brief reserve reached';
    console.warn(`  llm: ${reason} ($${status.spentUSD.toFixed(2)} of $${status.limitUSD.toFixed(2)}) — skipping ${priority} call`);
    return null;
  }
  const body = {
    model: modelId,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (effort && EFFORT_MODELS.has(modelId)) body.output_config = { ...(body.output_config || {}), effort };
  if (schema) {
    // Anthropic's structured-output subset rejects numeric range keywords such as
    // minimum/maximum. A single unsupported keyword used to turn every curation
    // request into the same permanent HTTP 400 while fail-soft fallback hid the
    // request bug. Range checks belong in deterministic code after parsing anyway.
    const cleanSchema = JSON.parse(JSON.stringify(schema, (key, value) => (
      ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].includes(key)
        ? undefined
        : value
    )));
    body.output_config = { ...(body.output_config || {}), format: { type: 'json_schema', schema: cleanSchema } };
  }
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    console.warn('  llm: request failed —', e.message);
    return null;
  }
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 180);
    // A 400 is a malformed request: it will fail identically on every retry and every
    // future run. Fail-soft is right for a timeout or a 429, but treating a permanent
    // request bug the same way is how three call sites 400'd on every call for days
    // without anyone noticing. Say plainly which kind this is.
    if (r.status === 400) _badRequests++;
    console.warn('  llm: HTTP', r.status, detail,
      r.status === 400 ? '\n  ^ REQUEST BUG, not a transient failure: this will fail every run until the code changes.' : '');
    if (r.status === 400 && priority === 'core') {
      throw new Error(`core LLM request rejected with HTTP 400${detail ? `: ${detail}` : ''}`);
    }
    return null;
  }
  const j = await r.json().catch(() => null);
  if (!j) return null;
  _calls++;
  const bucket = (_tok[modelId] ||= { in: 0, out: 0 });
  bucket.in += j.usage?.input_tokens || 0;
  bucket.out += j.usage?.output_tokens || 0;
  {
    const rate = RATES[modelId] || RATES[SONNET];
    settle(((j.usage?.input_tokens || 0) / 1e6) * rate.in + ((j.usage?.output_tokens || 0) / 1e6) * rate.out);
  }
  if (j.stop_reason === 'refusal') { console.warn('  llm: refusal'); return null; }
  const txt = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(txt); }
  catch {
    // tolerate a stray code fence if structured output wasn't used
    const m = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    // Loud on failure: a max_tokens truncation used to fall through silently to the
    // caller's fallback, which is how a capped curation batch became published slop.
    console.warn(`  llm: unparseable JSON (stop_reason=${j.stop_reason}, ${txt.length} chars)${j.stop_reason === 'max_tokens' ? ' — RAISE maxTokens' : ''}`);
    return null;
  }
}
