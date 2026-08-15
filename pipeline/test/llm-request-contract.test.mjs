// The request the pipeline actually sends has to be one the model accepts. This is not
// theoretical: effort:'low' was added to three Haiku call sites during the cost pass and
// every one of them 400'd on every call for days. Fail-soft hid it — the site kept
// publishing, just with untranslated headlines and deterministic fallbacks.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const sent = [];
let response = () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) });
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return response();
};
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.LLM_BUDGET_OVERRIDE = '1';
// Never settle fake usage into the real ledger: that ledger is the enforcement mechanism
// for Alan's $5/month cap, and a test that runs on every CI push would spend it down with
// numbers nobody was billed for.
process.env.LLM_LEDGER_PATH = path.join(os.tmpdir(), 'mb-test-ledger.json');

const { askJSON, budgetStatus, models } = await import('../lib/anthropic.js');

assert.ok(budgetStatus('core').limitUSD > budgetStatus('standard').limitUSD,
  'the fixed monthly cap must reserve budget for ranking and selected-story analysis');
assert.equal(budgetStatus('core').limitUSD, 5, 'the total monthly ceiling must be exactly $5');
assert.equal(budgetStatus('standard').limitUSD, 2.5, 'half the ceiling must remain reserved for the Brief');

await askJSON({ system: 's', user: 'u', effort: 'low', model: models.HAIKU });
assert.equal(sent.at(-1).model, 'claude-haiku-4-5');
assert.equal(sent.at(-1).output_config?.effort, undefined,
  'effort must never be sent to Haiku: the API rejects it with HTTP 400');

await askJSON({ system: 's', user: 'u', effort: 'low', model: models.SONNET });
assert.equal(sent.at(-1).output_config?.effort, 'low',
  'effort must still reach Sonnet, which is where the cost saving comes from');

await askJSON({ system: 's', user: 'u', model: models.SONNET, priority: 'core' });
assert.equal(sent.at(-1).priority, undefined, 'internal budget priority must never leak into the provider request');

// Brief research uses one bounded server-side search batch. The helper must pass
// the tool through, expose only URLs the provider actually returned, and settle the
// search fee into the same hard monthly ledger as token usage.
response = () => ({
  ok: true,
  json: async () => ({
    content: [
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://agency.gov/record', title: 'Agency record' }] },
      { type: 'text', text: '{"sources":[]}' },
    ],
    usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 2 } },
  }),
});
const researchLedgerBefore = Number((JSON.parse(fs.readFileSync(process.env.LLM_LEDGER_PATH, 'utf8')))[new Date().toISOString().slice(0, 7)] || 0);
const researched = await askJSON({
  system: 's', user: 'u', model: models.SONNET, priority: 'core', returnMeta: true,
  schema: { type: 'object', properties: { sources: { type: 'array' } } },
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
});
assert.equal(sent.at(-1).tools[0].max_uses, 2);
assert.deepEqual(researched.webSources, [{ url: 'https://agency.gov/record', title: 'Agency record' }]);
const researchLedgerAfter = Number((JSON.parse(fs.readFileSync(process.env.LLM_LEDGER_PATH, 'utf8')))[new Date().toISOString().slice(0, 7)] || 0);
assert.ok(researchLedgerAfter - researchLedgerBefore >= 0.02, 'web search fees must count toward the monthly cap');
response = () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) });

// A schema still has to survive alongside a stripped effort.
await askJSON({ system: 's', user: 'u', effort: 'low', model: models.HAIKU, schema: { type: 'object' } });
assert.equal(sent.at(-1).output_config?.format?.type, 'json_schema');
assert.equal(sent.at(-1).output_config?.effort, undefined);

// Anthropic rejects numeric range keywords in structured-output schemas. This exact
// request bug disabled the event curator on August 8 and must be stripped centrally.
await askJSON({
  system: 's', user: 'u', model: models.HAIKU,
  schema: { type: 'object', properties: { score: { type: 'integer', minimum: 0, maximum: 2 } } },
});
const scoreSchema = sent.at(-1).output_config.format.schema.properties.score;
assert.deepEqual(scoreSchema, { type: 'integer' });

// The production ledger must be untouched by this run.
const prodLedger = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'data', 'llm-spend.json');
const before = fs.readFileSync(prodLedger, 'utf8');
await askJSON({ system: 's', user: 'u', model: models.SONNET });
assert.equal(fs.readFileSync(prodLedger, 'utf8'), before,
  'the test must never write spend into the production budget ledger');

// The guard is prospective: a call that could take the ledger over $5 is refused
// before any request leaves the process, even when the settled balance is still $4.99.
delete process.env.LLM_BUDGET_OVERRIDE;
fs.writeFileSync(process.env.LLM_LEDGER_PATH, `${JSON.stringify({ [new Date().toISOString().slice(0, 7)]: 4.99 })}\n`);
const sentBeforeCapCheck = sent.length;
assert.equal(
  await askJSON({ system: 's', user: 'u', model: models.SONNET, priority: 'core', maxTokens: 1500 }),
  null,
  'a request whose maximum bill could exceed $5 must be skipped',
);
assert.equal(sent.length, sentBeforeCapCheck, 'a cap-blocked request must never reach the provider');
assert.equal(budgetStatus('core').blockedThisRun, true,
  'callers must be able to distinguish a prospective budget refusal from a transient model failure');
assert.equal(budgetStatus('core').available, false,
  'a blocked essential call must stop lower-value retries in the same run');
fs.writeFileSync(process.env.LLM_LEDGER_PATH, `${JSON.stringify({ [new Date().toISOString().slice(0, 7)]: 4.96 })}\n`);
const sentBeforeSearchCapCheck = sent.length;
assert.equal(
  await askJSON({
    system: 's', user: 'u', model: models.SONNET, priority: 'core', maxTokens: 1,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
  }),
  null,
  'the prospective guard must include the maximum server-side search fee',
);
assert.equal(sent.length, sentBeforeSearchCapCheck, 'a search batch that could cross $5 must never reach the provider');
process.env.LLM_BUDGET_OVERRIDE = '1';

// Permanent request bugs in ranking or Briefly Explained must stop publication.
// Optional model jobs may still degrade on the same provider response.
response = () => ({ ok: false, status: 400, text: async () => 'invalid request fixture' });
await assert.rejects(
  askJSON({ system: 's', user: 'u', priority: 'core' }),
  /core LLM request rejected with HTTP 400/,
);
assert.equal(
  await askJSON({ system: 's', user: 'u', priority: 'standard' }),
  null,
  'optional model work may still fail soft on HTTP 400',
);

console.log('llm-request-contract: ok');
