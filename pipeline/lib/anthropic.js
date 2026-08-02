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
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Per-model rates, so a mixed-tier run reports what it actually cost rather than
// pricing a Haiku call as if it were Sonnet.
const RATES = {
  [SONNET]: { in: 3, out: 15 },
  [HAIKU]: { in: 1, out: 5 },
};

let _calls = 0;
const _tok = {};                         // model -> { in, out }

export const hasLLM = () => !!KEY;
export const model = DEFAULT_MODEL;
export const models = { SONNET, HAIKU };

// Cumulative token usage and cost for the run, priced per model.
export function usage() {
  let input = 0, output = 0, costUSD = 0;
  for (const [m, t] of Object.entries(_tok)) {
    const rate = RATES[m] || RATES[SONNET];
    input += t.in;
    output += t.out;
    costUSD += (t.in / 1e6) * rate.in + (t.out / 1e6) * rate.out;
  }
  return { calls: _calls, input, output, costUSD, byModel: { ..._tok } };
}

// Ask the model for a JSON answer. With `schema`, structured outputs guarantee the
// first content block is valid JSON. Returns the parsed object, or null on any
// failure (no key, HTTP error, unparseable) so callers degrade instead of crash.
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
export async function askJSON({ system, user, schema, maxTokens = 1500, model: modelId = DEFAULT_MODEL, effort }) {
  if (!KEY) return null;
  const body = {
    model: modelId,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (effort) body.output_config = { ...(body.output_config || {}), effort };
  if (schema) body.output_config = { ...(body.output_config || {}), format: { type: 'json_schema', schema } };
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
    console.warn('  llm: HTTP', r.status, (await r.text().catch(() => '')).slice(0, 180));
    return null;
  }
  const j = await r.json().catch(() => null);
  if (!j) return null;
  _calls++;
  const bucket = (_tok[modelId] ||= { in: 0, out: 0 });
  bucket.in += j.usage?.input_tokens || 0;
  bucket.out += j.usage?.output_tokens || 0;
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
