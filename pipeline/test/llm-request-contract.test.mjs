// The request the pipeline actually sends has to be one the model accepts. This is not
// theoretical: effort:'low' was added to three Haiku call sites during the cost pass and
// every one of them 400'd on every call for days. Fail-soft hid it — the site kept
// publishing, just with untranslated headlines and deterministic fallbacks.
import assert from 'node:assert/strict';

const sent = [];
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
};
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.LLM_BUDGET_OVERRIDE = '1';

const { askJSON, models } = await import('../lib/anthropic.js');

await askJSON({ system: 's', user: 'u', effort: 'low', model: models.HAIKU });
assert.equal(sent.at(-1).model, 'claude-haiku-4-5');
assert.equal(sent.at(-1).output_config?.effort, undefined,
  'effort must never be sent to Haiku: the API rejects it with HTTP 400');

await askJSON({ system: 's', user: 'u', effort: 'low', model: models.SONNET });
assert.equal(sent.at(-1).output_config?.effort, 'low',
  'effort must still reach Sonnet, which is where the cost saving comes from');

// A schema still has to survive alongside a stripped effort.
await askJSON({ system: 's', user: 'u', effort: 'low', model: models.HAIKU, schema: { type: 'object' } });
assert.equal(sent.at(-1).output_config?.format?.type, 'json_schema');
assert.equal(sent.at(-1).output_config?.effort, undefined);

console.log('llm-request-contract: ok');
