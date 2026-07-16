// anthropic.js — the pipeline's one and only LLM touchpoint. Zero-dependency raw
// fetch to the Messages API, so the pipeline stays dependency-free. Used by
// build-email.js to score news and summarize the week's lead items. Everything
// else in the pipeline is deterministic code with no model in the loop.
//
// Fail-soft by design: with no ANTHROPIC_API_KEY set, askJSON() returns null and
// the caller falls back to a deterministic heuristic. The email still builds; the
// model only sharpens it.
//
// Model: Sonnet 5 for ALL jobs (rank + write), per Fable's Fork 1 ruling. Tiering
// to Haiku saved nothing here (one Saturday batch over ~70 headline-length items,
// cents either way) and put the most damaging judgment — significance ranking, i.e.
// what leads the email — on the weakest model. One model, one voice. Still a few
// dollars a month at most.

const MODEL = 'claude-sonnet-5';         // $3/M in · $15/M out — one weekly batch, still cents/issue
const KEY = process.env.ANTHROPIC_API_KEY || '';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

let _in = 0, _out = 0, _calls = 0;

export const hasLLM = () => !!KEY;
export const model = MODEL;

// Cumulative token usage + Sonnet-5-priced cost estimate for the run.
export function usage() {
  const costUSD = (_in / 1e6) * 3 + (_out / 1e6) * 15;
  return { calls: _calls, input: _in, output: _out, costUSD };
}

// Ask the model for a JSON answer. With `schema`, structured outputs guarantee the
// first content block is valid JSON. Returns the parsed object, or null on any
// failure (no key, HTTP error, unparseable) so callers degrade instead of crash.
export async function askJSON({ system, user, schema, maxTokens = 1500 }) {
  if (!KEY) return null;
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (schema) body.output_config = { format: { type: 'json_schema', schema } };
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
  _in += j.usage?.input_tokens || 0;
  _out += j.usage?.output_tokens || 0;
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
