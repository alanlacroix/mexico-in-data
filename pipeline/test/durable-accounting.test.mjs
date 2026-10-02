import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { persistModelAccounting, ACCOUNTING_FILES } from '../lib/persist-model-accounting.mjs';
import attemptsContract from '../lib/edition-attempts.cjs';
import { recoverInterruptedAttempts, publicationPlan } from '../publication-plan.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-accounting-'));
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let n = 0;
async function fixture(ledger = {'2026-09': 0}) {
  const file = path.join(tmp, `ledger-${++n}.json`);
  fs.writeFileSync(file, JSON.stringify(ledger));
  process.env.ANTHROPIC_API_KEY = 'test-only';
  process.env.LLM_LEDGER_PATH = file;
  process.env.LLM_BUDGET_DATE = '2026-09-30T12:00:00Z';
  process.env.GITHUB_ACTIONS = 'true';
  delete process.env.LLM_BUDGET_OVERRIDE;
  return { ...(await import(`../lib/anthropic.js?fixture=${n}`)), file, read: () => JSON.parse(fs.readFileSync(file))['2026-09'] };
}
const request = {system:'s', user:'u', maxTokens:10, model:'claude-haiku-4-5', priority:'core'};
const valid = () => ({ok:true, json:async()=>({usage:{input_tokens:1,output_tokens:1},content:[{type:'text',text:'{}'}]})});
try {
  let f = await fixture();
  let events = [];
  const initialReceipts = [];
  globalThis.fetch = async () => { events.push('fetch'); assert.ok(f.read() > 0); return valid(); };
  await f.askJSON({...request,onAccounting:async receipt=>{events.push(receipt.state);initialReceipts.push(receipt);assert.equal(f.read(),receipt.accountedUSD);}});
  assert.deepEqual(events,['reserved','fetch','settled']);
  assert.equal(f.read(),0.000006);
  assert.equal(f.usage().costUSD,0.000006);
  assert.deepEqual(initialReceipts[1].usage,{input_tokens:1,output_tokens:1});
  assert.equal('usage' in initialReceipts[0],false,'reservations must not invent observed tokens');
  assert.equal('responseModel' in initialReceipts[1],false);
  assert.equal('stopReason' in initialReceipts[1],false);

  for (const response of [
    () => {throw new Error('network timeout');},
    () => ({ok:true,json:async()=>{throw new Error('body timeout');}}),
    () => ({ok:false,status:500,text:async()=>''}),
    () => ({ok:true,json:async()=>({usage:{input_tokens:-1,output_tokens:1}})}),
    () => ({ok:true,json:async()=>({usage:{input_tokens:'1',output_tokens:1}})}),
    () => ({ok:true,json:async()=>({usage:{input_tokens:1,output_tokens:1,cache_creation_input_tokens:1}})}),
    () => ({ok:true,json:async()=>({usage:{input_tokens:1,output_tokens:1,cache_read_input_tokens:1}})}),
    () => ({ok:true,json:async()=>({content:[]})}),
  ]) {
    f = await fixture(); events=[];
    globalThis.fetch = async () => response();
    assert.equal(await f.askJSON({...request,onAccounting:async receipt=>events.push(receipt)}),null);
    assert.equal(events.length,1);
    assert.equal(f.read(),events[0].reservedUSD);
    assert.equal(f.usage().calls,1);
    assert.equal(f.usage().costUSD,events[0].reservedUSD);
    assert.equal('usage' in events[0],false,'ambiguous calls retain the maximum without invented usage');
    assert.equal('responseModel' in events[0],false);
    assert.equal('stopReason' in events[0],false);
  }
  f = await fixture(); let fetched=0;
  globalThis.fetch = async()=>{fetched++;return valid();};
  await assert.rejects(f.askJSON({...request,onAccounting:async()=>{throw new Error('push rejected');}}),/push rejected/);
  assert.equal(fetched,0); assert.ok(f.read()>0); assert.equal(f.usage().costUSD,f.read());
  f = await fixture();
  await assert.rejects(f.askJSON(request),/durable accounting/); assert.equal(fetched,0);
  f = await fixture();
  assert.equal(await f.askJSON({...request,maxCostUSD:0.000001,onAccounting:async()=>assert.fail()}),null);
  assert.equal(f.read(),0);assert.equal(fetched,0);
  f = await fixture({'2026-09':'0'});
  await assert.rejects(f.askJSON({...request,onAccounting:async()=>{}}),/safely read/);
  f = await fixture({'2026-09':-1});
  await assert.rejects(f.askJSON({...request,onAccounting:async()=>{}}),/safely read/);
  f = await fixture();fs.writeFileSync(f.file,'{');
  await assert.rejects(f.askJSON({...request,onAccounting:async()=>{}}),/safely read/);
  f = await fixture();fs.unlinkSync(f.file);
  await assert.rejects(f.askJSON({...request,onAccounting:async()=>{}}),/safely read/);

  // Real local Git remotes exercise the durability boundary without network/model calls.
  const remote=path.join(tmp,'remote.git'), repo=path.join(tmp,'repo');
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(tmp,'init','--bare',remote);git(tmp,'clone',remote,repo);
  git(repo,'checkout','-b','main');git(repo,'config','user.name','test');git(repo,'config','user.email','test@example.invalid');
  fs.mkdirSync(path.join(repo,'data'));
  for (const file of ACCOUNTING_FILES) fs.writeFileSync(path.join(repo,file),'{}\n');
  git(repo,'add','.');git(repo,'commit','-m','initial');git(repo,'push','origin','HEAD:main');
  fs.writeFileSync(path.join(repo,'unrelated.txt'),'do not publish');git(repo,'add','unrelated.txt');
  fs.writeFileSync(path.join(repo,ACCOUNTING_FILES[0]),'{"2026-09":0.1}\n');
  persistModelAccounting({cwd:repo});
  assert.equal(git(remote,'show','main:data/llm-spend.json').trim(),'{"2026-09":0.1}');
  assert.throws(()=>git(remote,'show','main:unrelated.txt'));
  assert.match(git(repo,'diff','--cached','--name-only'),/unrelated/);
  // A competing commit must reject the next reservation, never rebase it silently.
  const other=path.join(tmp,'other');git(tmp,'clone','--branch','main',remote,other);
  git(other,'config','user.name','test');git(other,'config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(other,'other.txt'),'new');git(other,'add','.');git(other,'commit','-m','competing');git(other,'push','origin','main');
  fs.writeFileSync(path.join(repo,ACCOUNTING_FILES[0]),'{"2026-09":0.2}\n');
  assert.throws(()=>persistModelAccounting({cwd:repo}));
  assert.equal(git(remote,'show','main:data/llm-spend.json').trim(),'{"2026-09":0.1}');

  // Kill the process exactly when it would contact the provider. The pushed
  // reservation survives independently of runner-local files/finally handlers.
  const killedRepo=path.join(tmp,'killed');git(tmp,'clone','--branch','main',remote,killedRepo);
  git(killedRepo,'config','user.name','test');git(killedRepo,'config','user.email','test@example.invalid');
  const moduleUrl=new URL('../lib/anthropic.js',import.meta.url).href;
  const persistenceUrl=new URL('../lib/persist-model-accounting.mjs',import.meta.url).href;
  const child=`
    import fs from 'node:fs';
    import {persistModelAccounting} from ${JSON.stringify(persistenceUrl)};
    process.env.ANTHROPIC_API_KEY='test-only';
    process.env.GITHUB_ACTIONS='true';
    process.env.LLM_LEDGER_PATH=${JSON.stringify(path.join(killedRepo,ACCOUNTING_FILES[0]))};
    process.env.LLM_BUDGET_DATE='2026-09-30T12:00:00Z';
    delete process.env.LLM_BUDGET_OVERRIDE;
    globalThis.fetch=async()=>{process.kill(process.pid,'SIGKILL');};
    const {askJSON}=await import(${JSON.stringify(moduleUrl)});
    await askJSON({...${JSON.stringify(request)},onAccounting:async receipt=>{
      fs.writeFileSync(${JSON.stringify(path.join(killedRepo,ACCOUNTING_FILES[1]))},JSON.stringify({receipt}));
      persistModelAccounting({cwd:${JSON.stringify(killedRepo)}});
    }});
  `;
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module','-e',child],{stdio:'pipe'}),error=>error.signal==='SIGKILL');
  const durableReceipt=JSON.parse(git(remote,'show','main:data/edition-attempts.json')).receipt;
  const durableSpend=JSON.parse(git(remote,'show','main:data/llm-spend.json'))['2026-09'];
  assert.equal(durableReceipt.state,'reserved');
  assert.equal(Math.round((durableSpend-0.1)*1e6)/1e6,durableReceipt.reservedUSD);
  assert.equal('usage' in durableReceipt,false);

  // Provider-reported metrics survive the same durable persistence path even when
  // output is truncated. The accounting receipt never retains response prose.
  const metricsRepo=path.join(tmp,'metrics');git(tmp,'clone','--branch','main',remote,metricsRepo);
  git(metricsRepo,'config','user.name','test');git(metricsRepo,'config','user.email','test@example.invalid');
  f=await fixture({'2026-09':durableSpend});
  globalThis.fetch=async()=>({ok:true,json:async()=>({
    model:'claude-haiku-4-5-provider-version',stop_reason:'max_tokens',
    usage:{input_tokens:123,output_tokens:10,cache_creation_input_tokens:0,cache_read_input_tokens:0,unrelated:'private response data'},
    content:[{type:'text',text:'{"unfinished":'}],
  })});
  assert.equal(await f.askJSON({...request,onAccounting:async receipt=>{
    fs.copyFileSync(f.file,path.join(metricsRepo,ACCOUNTING_FILES[0]));
    fs.writeFileSync(path.join(metricsRepo,ACCOUNTING_FILES[1]),JSON.stringify({attempts:[{
      editorialDate:'2026-09-30',slot:'morning',calls:f.usage().calls,costUSD:f.usage().costUSD,
      modelAccounting:{version:1,receipts:[receipt]},
    }]}));
    persistModelAccounting({cwd:metricsRepo});
  }}),null);
  const persistedMetrics=JSON.parse(git(remote,'show','main:data/edition-attempts.json'));
  assert.doesNotThrow(()=>attemptsContract.readAccountingAttempts(persistedMetrics));
  const settledReceipt=persistedMetrics.attempts[0].modelAccounting.receipts[0];
  assert.equal(settledReceipt.state,'settled');
  assert.equal(settledReceipt.model,request.model,'the requested billing route remains unchanged');
  assert.equal(settledReceipt.responseModel,'claude-haiku-4-5-provider-version');
  assert.equal(settledReceipt.stopReason,'max_tokens');
  assert.deepEqual(settledReceipt.usage,{input_tokens:123,output_tokens:10,cache_creation_input_tokens:0,cache_read_input_tokens:0});
  assert.equal(settledReceipt.accountedUSD,0.000173);
  assert.equal(JSON.parse(git(remote,'show','main:data/llm-spend.json'))['2026-09'],f.read());
  assert.equal(JSON.stringify(persistedMetrics).includes('private response data'),false);
  assert.equal(JSON.stringify(persistedMetrics).includes('unfinished'),false);

  // An actual response can be reconciled locally even if the second push fails;
  // remote remains conservatively reserved and no subsequent call is made.
  f=await fixture();let pushedReserve;
  globalThis.fetch=async()=>valid();
  await assert.rejects(f.askJSON({...request,onAccounting:async receipt=>{
    if(receipt.state==='reserved') pushedReserve=receipt.accountedUSD;
    else throw new Error('reconcile push failed');
  }}),/reconcile push failed/);
  assert.ok(pushedReserve>f.read());assert.equal(f.read(),0.000006);
  assert.equal(f.usage().calls,1);assert.equal(f.usage().costUSD,0.000006);
  f=await fixture();
  globalThis.fetch=async()=>{process.env.LLM_BUDGET_DATE='2026-10-01T00:00:00Z';return valid();};
  await f.askJSON({...request,onAccounting:async()=>{}});
  assert.equal(f.read(),0.000006,'refund uses captured reservation month');

  // Restart keeps the interrupted charge and consumes only the existing bounded recovery.
  const row={editorialDate:'2026-09-30',slot:'morning',state:'started',calls:1,costUSD:0.1,
    modelAccounting:{version:1,runId:'101',receipts:[{accountedUSD:0.1,state:'reserved'}]},recoveries:[]};
  const attempts={attempts:[row]};
  recoverInterruptedAttempts(attempts,row.editorialDate,'102');
  assert.equal(row.state,'failed');assert.equal(row.costUSD,0.1);assert.equal(row.calls,1);
  assert.equal(publicationPlan({event:'schedule',date:row.editorialDate,attempts}).retry,true);
  row.state='started';row.slot='noon';row.recoveries=[{}];
  recoverInterruptedAttempts(attempts,row.editorialDate,'103');
  assert.throws(()=>publicationPlan({event:'schedule',date:row.editorialDate,attempts}),/exhausted/);
  row.state='started';delete row.modelAccounting;
  recoverInterruptedAttempts(attempts,row.editorialDate,'104');assert.equal(row.state,'started');
  assert.throws(()=>publicationPlan({event:'schedule',date:row.editorialDate,attempts}),/diagnosis/);

  const strictRow={editorialDate:'2026-09-30',slot:'morning',state:'failed',calls:1,costUSD:0.1,
    modelAccounting:{version:1,receipts:[{id:'call-1',state:'reserved',reservedUSD:0.1,accountedUSD:0.1}]}};
  assert.doesNotThrow(()=>attemptsContract.readAccountingAttempts({attempts:[strictRow]}));
  for (const invalid of [
    {...strictRow,costUSD:0}, {...strictRow,calls:0},
    {...strictRow,modelAccounting:{version:1,receipts:[{id:'call-1',state:'reserved',reservedUSD:0.2,accountedUSD:0.1}]}},
    {...strictRow,modelAccounting:{version:1,receipts:[strictRow.modelAccounting.receipts[0],strictRow.modelAccounting.receipts[0]]}},
  ]) assert.throws(()=>attemptsContract.readAccountingAttempts({attempts:[invalid]}),/Invalid durable/);
  row.modelAccounting={version:1,runId:'104',runAttempt:'1',receipts:[{accountedUSD:0.1}]};
  recoverInterruptedAttempts(attempts,row.editorialDate,'104','1');assert.equal(row.state,'started');
  recoverInterruptedAttempts(attempts,row.editorialDate,'104','2');assert.equal(row.state,'failed');

  const workflow=fs.readFileSync(new URL('../../.github/workflows/happening.yml',import.meta.url),'utf8');
  assert.ok(workflow.indexOf('gh auth setup-git')<workflow.indexOf('run: node pipeline/build-edition.mjs'));
  assert.match(workflow,/group: mexico-brief-production-write\s+cancel-in-progress: false/);
  console.log('durable accounting: ok');
} finally {
  globalThis.fetch=originalFetch;
  for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env,originalEnv);
  fs.rmSync(tmp,{recursive:true,force:true});
}
