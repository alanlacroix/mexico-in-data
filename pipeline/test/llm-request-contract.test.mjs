// The request the pipeline actually sends has to be one the model accepts. This is not
// theoretical: effort:'low' was added to three Haiku call sites during the cost pass and
// every one of them 400'd on every call for days. Fail-soft hid it — the site kept
// publishing, just with untranslated headlines and deterministic fallbacks.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const sent = [];
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
};
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.LLM_BUDGET_OVERRIDE = '1';
// Never settle fake usage into the real ledger: that ledger is the enforcement mechanism
// for Alan's $2/month cap, and a test that runs on every CI push would spend it down with
// numbers nobody was billed for.
process.env.LLM_LEDGER_PATH = path.join(os.tmpdir(), 'mb-test-ledger.json');

const { askJSON, budgetStatus, models } = await import('../lib/anthropic.js');

assert.ok(budgetStatus('core').limitUSD > budgetStatus('standard').limitUSD,
  'the fixed monthly cap must reserve budget for ranking and selected-story analysis');

await askJSON({ system: 's', user: 'u', effort: 'low', model: models.HAIKU });
assert.equal(sent.at(-1).model, 'claude-haiku-4-5');
assert.equal(sent.at(-1).output_config?.effort, undefined,
  'effort must never be sent to Haiku: the API rejects it with HTTP 400');

await askJSON({ system: 's', user: 'u', effort: 'low', model: models.SONNET });
assert.equal(sent.at(-1).output_config?.effort, 'low',
  'effort must still reach Sonnet, which is where the cost saving comes from');

await askJSON({ system: 's', user: 'u', model: models.SONNET, priority: 'core' });
assert.equal(sent.at(-1).priority, undefined, 'internal budget priority must never leak into the provider request');

// A schema still has to survive alongside a stripped effort.
await askJSON({ system: 's', user: 'u', effort: 'low', model: models.HAIKU, schema: { type: 'object' } });
assert.equal(sent.at(-1).output_config?.format?.type, 'json_schema');
assert.equal(sent.at(-1).output_config?.effort, undefined);

// The production ledger must be untouched by this run.
const prodLedger = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'data', 'llm-spend.json');
const before = fs.readFileSync(prodLedger, 'utf8');
await askJSON({ system: 's', user: 'u', model: models.SONNET });
assert.equal(fs.readFileSync(prodLedger, 'utf8'), before,
  'the test must never write spend into the production budget ledger');

console.log('llm-request-contract: ok');
