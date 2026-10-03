// Exercise the real builder through collection-independent fixtures and stubbed
// provider responses. Published Oct 1 prose is an immutable regression fixture;
// no source fetch, paid request, production ledger or public file is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createEditionQuarantine } from '../lib/edition-quarantine.mjs';
import editionContract from '../lib/public-edition.cjs';
import { deterministicDraftCheck } from '../build-edition.mjs';
import { bilingualFidelityFlags } from '../lib/bilingual-fidelity.cjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'data/editions/2026-10-01.json')));
const priorFixture = JSON.parse(fs.readFileSync(path.join(root, 'data/editions/2026-09-30.json')));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-flow-'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-quarantine-test-'));
try {
  // A rejected candidate is diagnostic evidence, never an alternate public file.
  const evidence = [{ id: 'article', url: 'https://example.com/report', text: 'Exact bounded source evidence.' }];
  const auditedDrafts = [{ index: 0, storyId: 'test-story', draft: { en: 'Exact draft' }, evidence }];
  const audit = { inputs: [{ i: 0 }], response: { reviews: { s0: { ok: true, problems: [] } } } };
  const capture = createEditionQuarantine({ repositoryRoot: tmp, directory: path.join(artifacts, 'unit'),
    metadata: { editorialDate: '2026-10-01', slot: 'morning' }, drafts: auditedDrafts, audit });
  const invalidCandidate = editionContract.withArtifactHash({ ...fixture, slot: 'invalid' });
  const lastGood = path.join(tmp, 'last-good.json');
  fs.writeFileSync(lastGood, JSON.stringify(priorFixture));
  const originalBytes = fs.readFileSync(lastGood);
  capture.recordCandidate(invalidCandidate);
  try { editionContract.atomicWriteEdition(lastGood, invalidCandidate); assert.fail('invalid candidate was published'); }
  catch (error) { capture.recordFailure(error, 'final-artifact-validation'); }
  const saved = JSON.parse(fs.readFileSync(capture.file));
  assert.deepEqual(saved.candidate, invalidCandidate);
  assert.equal(saved.candidateHash, editionContract.editionHash(invalidCandidate));
  assert.deepEqual(saved.drafts, auditedDrafts);
  assert.deepEqual(saved.audit, audit);
  assert.equal(saved.auditedPayloadHash, crypto.createHash('sha256').update(JSON.stringify({ drafts: auditedDrafts, audit })).digest('hex'));
  assert.equal(saved.validation.ok, false);
  assert.ok(saved.failure.reasons.some(reason => reason.includes('slot must be')));
  assert.equal(saved.publicationAllowed, false);
  assert.deepEqual(fs.readFileSync(lastGood), originalBytes);
  const missingAudit = createEditionQuarantine({ repositoryRoot: tmp, directory: path.join(artifacts, 'missing-audit'),
    metadata: {}, drafts: auditedDrafts, audit: null });
  assert.equal(JSON.parse(fs.readFileSync(missingAudit.file)).publicationAllowed, false,
    'a saved draft with no audit cannot acquire publication permission');
  assert.throws(() => createEditionQuarantine({ repositoryRoot: tmp, directory: path.join(tmp, 'data/quarantine'),
    metadata: {}, drafts: auditedDrafts, audit }), /outside the repository/);
  const linked = path.join(artifacts, 'repo-link');
  fs.symlinkSync(tmp, linked);
  assert.throws(() => createEditionQuarantine({ repositoryRoot: tmp, directory: linked,
    metadata: {}, drafts: auditedDrafts, audit }), /outside the repository/);

  // Evidence-only actor additions must fail before paying for an audit, using
  // the same evidence-free gate as the final public artifact.
  const english = 'The authority published a report.';
  const spanish = 'Banxico publicó un informe.';
  assert.deepEqual(bilingualFidelityFlags({ english, spanish, evidence: ['Banxico published a report.'] }), []);
  const identityDraft = { ...fixture.stories[0].en, es: { ...fixture.stories[0].es },
    ...Object.fromEntries(['headline','dek','background','view','watch'].map(field => [`${field}Refs`, ['article']])) };
  identityDraft.background = english;
  identityDraft.es.background = spanish;
  const identityRow = { evidence: [{ id: 'article', text: 'Banxico published a report.' }] };
  assert.ok(deterministicDraftCheck(identityRow, identityDraft).some(flag => flag === 'background: banxico was introduced in Spanish'));
  identityDraft.background = 'The Finance Committee sent the bill to the full chamber.';
  identityDraft.es.background = 'La Comisión de Hacienda envió el dictamen al pleno.';
  identityRow.evidence[0].text = `${identityDraft.background} ${identityDraft.es.background}`;
  assert.ok(!deterministicDraftCheck(identityRow, identityDraft).some(flag => /background: (?:hacienda|finance committee) was/.test(flag)),
    'recognized committee translation still passes the early identity gate');

  fs.cpSync(path.join(root,'pipeline'),path.join(tmp,'pipeline'),{recursive:true});
  fs.writeFileSync(path.join(tmp,'package.json'),'{"type":"module"}');
  const sources=JSON.parse(fs.readFileSync(path.join(root,'pipeline/news-sources.json'))).sources;
  const drafts=Object.fromEntries(fixture.stories.map(story=>[story.url,{
    ...story.en,es:story.es,...Object.fromEntries(['headline','dek','background','view','watch'].map(field=>[`${field}Refs`,['article']])),
  }]));
  const rows=fixture.stories.map(story=>{
    const source=sources.find(source=>new URL(source.url).hostname.replace(/^www\./,'')===new URL(story.url).hostname.replace(/^www\./,''));
    assert.ok(source,story.url);
    return {id:story.id,url:story.url,title:story.es.headline,dek:story.es.dek + ' Información de México.',source:new URL(story.url).hostname,
      sourceName:story.source,sourceId:source.id,tier:source.tier,beat:'economy',lang:'es',published_at:'2026-10-01T12:00:00Z'};
  });
  const runner=`
    import fs from 'node:fs';
    import dns from 'node:dns/promises';
    import editionContract from './pipeline/lib/public-edition.cjs';
    if (process.env.FLOW_CASE === 'artifact-reject') {
      // Inject a final-boundary rejection after the real deterministic and audit
      // flow. The unit case above independently exercises a real invalid artifact.
      editionContract.atomicWriteEdition = () => { throw new Error('Injected final artifact rejection'); };
    }
    if (process.env.FLOW_CASE.startsWith('diagnostic-write-fail')) {
      const writeFileSync = fs.writeFileSync;
      let diagnosticWrites = 0;
      fs.writeFileSync = (file, ...args) => {
        if (String(file).startsWith(process.env.EDITION_QUARANTINE_DIRECTORY + '/') && ++diagnosticWrites > 1) {
          throw Object.assign(new Error('Injected diagnostic disk failure'), { code: 'ENOSPC' });
        }
        return writeFileSync(file, ...args);
      };
    }
    if (process.env.FLOW_CASE === 'diagnostic-write-fail-invalid') {
      // Produce genuinely invalid final content while keeping the real atomic
      // validator intact. Diagnostic write failures cannot bypass this gate.
      const withArtifactHash = editionContract.withArtifactHash;
      editionContract.withArtifactHash = candidate => withArtifactHash({ ...candidate, slot: 'invalid' });
    }
    dns.lookup=async()=>[{address:'93.184.216.34',family:4}];
    const drafts=${JSON.stringify(drafts)};
    const calls=[];
    globalThis.fetch=async(url,init)=>{
      if(String(url).includes('api.anthropic.com')){
        const body=JSON.parse(init.body);const inputs=JSON.parse(body.messages[0].content);
        if (!body.output_config.format.schema.required.includes('reviews') && !body.system.includes('If cited evidence spells a quantity in words, preserve it in words in both languages; do not convert it to digits. For example, casi un millón stays almost one million / casi un millón.')) throw new Error('Writer must preserve word-form quantities');
        const audit=body.output_config.format.schema.required.includes('reviews');
        const patch=body.output_config.format.schema.required.includes('repairs');
        calls.push({audit,patch,maxTokens:body.max_tokens,indices:inputs.map(row=>row.i),fields:patch?inputs.map(row=>Object.keys(row.repairFields)):[]});
        const key=audit?'reviews':patch?'repairs':'stories';
        let values=inputs.map((row,index)=>['s'+row.i,audit?{ok:!['audit-reject','diagnostic-capture-fail-audit-reject'].includes(process.env.FLOW_CASE),problems:[]}:drafts[row.story?.url]||drafts[Object.keys(drafts).find(url=>inputs.length===1)]]);
        if(!audit && calls.length===1 && ['partial','partial-unrepairable'].includes(process.env.FLOW_CASE))values=values.slice(0,1);
        if(!audit && calls.length===1 && ['field-patch','extra-patch-field'].includes(process.env.FLOW_CASE)){
          values[0][1]=structuredClone(values[0][1]);
          values[0][1].dek+=' '+values[0][1].dek;
          values[0][1].es.dek+=' '+values[0][1].es.dek;
        }
        if(patch){
          values=inputs.map(row=>{
            const url=row.evidence.find(e=>e.id==='article').url; const d=drafts[url];
            const fields=Object.fromEntries(Object.keys(row.repairFields).map(f=>[f,{en:d[f],es:d.es[f],refs:d[f+'Refs']}]));
            if(process.env.FLOW_CASE==='extra-patch-field')fields.headline={en:'Unrequested replacement',es:'Cambio no solicitado',refs:['article']};
            return ['s'+row.i,fields];
          });
        }
        fs.writeFileSync('calls.json',JSON.stringify(calls));
        const maximumUsage=process.env.FLOW_CASE==='partial-unrepairable' && calls.length===1;
        return {ok:true,json:async()=>({usage:{input_tokens:maximumUsage?new TextEncoder().encode(JSON.stringify(body)).byteLength+1024:1,output_tokens:maximumUsage?body.max_tokens:1},content:[{type:'text',text:JSON.stringify({[key]:Object.fromEntries(values)})}]})};
      }
      const draft=drafts[String(url)];
      if(!draft)return new Response('',{status:404});
      const text=[...Object.values(draft.es),...['headline','dek','background','view','watch'].map(f=>draft[f])].join(' ');
      return new Response('<html><article class="article-body"><p>'+text+'</p></article></html>',{headers:{'content-type':'text/html'}});
    };
    const {main}=await import('./pipeline/build-edition.mjs');
    await main();
  `;
  fs.writeFileSync(path.join(tmp,'run.mjs'),runner);
  for(const scenario of ['complete','partial','field-patch','extra-patch-field','partial-unrepairable','audit-reject','artifact-reject','budget-block','diagnostic-capture-fail','diagnostic-capture-fail-audit-reject','diagnostic-write-fail','diagnostic-write-fail-invalid']){
    fs.mkdirSync(path.join(tmp,'data/news'),{recursive:true});
    fs.writeFileSync(path.join(tmp,'data/edition.json'),JSON.stringify(priorFixture));
    fs.writeFileSync(path.join(tmp,'data/edition-attempts.json'),'{"schemaVersion":1,"attempts":[]}');
    fs.writeFileSync(path.join(tmp,'data/llm-spend.json'),JSON.stringify({'2026-10':scenario==='budget-block'?6:scenario==='partial-unrepairable'?0.02:0}));
    fs.writeFileSync(path.join(tmp,'data/events.json'),'{"events":[]}');
    fs.writeFileSync(path.join(tmp,'data/standing.json'),'{"facts":[]}');
    fs.writeFileSync(path.join(tmp,'data/news/2026-W40.json'),JSON.stringify(rows));
    fs.rmSync(path.join(tmp,'calls.json'),{force:true});
    const diagnosticDirectory=path.join(artifacts,scenario);
    if(scenario.startsWith('diagnostic-capture-fail'))fs.writeFileSync(diagnosticDirectory,'not a directory');
    const before=fs.readFileSync(path.join(tmp,'data/edition.json'),'utf8');
    const result=spawnSync(process.execPath,['run.mjs'],{cwd:tmp,encoding:'utf8',timeout:30000,
      env:{...process.env,GITHUB_ACTIONS:'false',ANTHROPIC_API_KEY:'test-only',LLM_BUDGET_OVERRIDE:'',
        LLM_LEDGER_PATH:path.join(tmp,'data/llm-spend.json'),EDITION_NOW_ISO:'2026-10-01T12:30:00Z',
        EDITION_QUARANTINE_DIRECTORY:diagnosticDirectory,
        PUBLICATION_DATE:'2026-10-01',PUBLICATION_SLOT:'morning',EDITION_SKIP_COLLECTION:'1',
        EDITION_RETRY_FAILED:'0',EDITION_REQUIRE_REVIEW:'0',FLOW_CASE:scenario}});
    const calls=fs.existsSync(path.join(tmp,'calls.json'))?JSON.parse(fs.readFileSync(path.join(tmp,'calls.json'))):[];
    if(['complete','partial','field-patch','diagnostic-capture-fail','diagnostic-write-fail'].includes(scenario)){
      assert.equal(result.status,0,`${scenario}: ${result.stderr}\n${result.stdout}`);
      const out=JSON.parse(fs.readFileSync(path.join(tmp,'data/edition.json')));
      assert.equal(out.stories.length,3,scenario);
      assert.equal(editionContract.validateEdition(out).ok,true,'diagnostic failure cannot excuse invalid publication');
      assert.ok(calls.some(call=>call.audit),'publication always includes independent audit');
      if(scenario.startsWith('diagnostic-')){
        assert.match(result.stderr,/Optional edition diagnostics unavailable|Could not save optional edition candidate diagnostics/);
        assert.notEqual(fs.readFileSync(path.join(tmp,'data/edition.json'),'utf8'),before,'valid publication survives optional storage failure');
      }
      assert.equal(calls.length,['partial','field-patch'].includes(scenario)?3:2,scenario);
      if(scenario==='field-patch'){
        assert.equal(calls[1].patch,true);
        assert.deepEqual(calls[1].fields,[['dek']],'only failed summary is regenerated');
        assert.ok(calls[1].maxTokens<1400,'small patch reserves less than a whole story');
        assert.equal(calls[2].audit,true,'all complete stories still reach independent audit');
        const published=JSON.parse(fs.readFileSync(path.join(tmp,'data/edition.json')));
        for(const story of published.stories)for(const field of ['headline','background','view','watch']){
          assert.equal(story.en[field],drafts[story.url][field]);
          assert.equal(story.es[field],drafts[story.url].es[field]);
        }
      }
      if(scenario==='partial'){
        assert.equal(calls[1].indices.length,2,'only missing units are repaired');
        assert.ok(!calls[1].indices.includes(calls[0].indices[0]),'passing unit is preserved');
        assert.equal(calls[2].indices.length,3,'independent audit checks all restored units');
      }
    }else{
      assert.notEqual(result.status,0,scenario);
      assert.equal(fs.readFileSync(path.join(tmp,'data/edition.json'),'utf8'),before,'failure preserves last-good bytes');
      if(scenario==='extra-patch-field'){
        assert.equal(calls.filter(call=>call.audit).length,0,'an unrequested mutation never reaches audit or publication');
        const record=JSON.parse(fs.readFileSync(path.join(diagnosticDirectory,'candidate.json')));
        assert.equal(record.audit,null);
        assert.equal(record.auditedPayloadHash,null);
        assert.equal(record.publicationAllowed,false);
        assert.ok(record.generationStages.some(stage=>stage.stage==='initial-draft'));
        const patchStage=record.generationStages.find(stage=>stage.stage==='field-repair-response');
        assert.ok(patchStage.details.patchResponse.repairs,'exact invalid provider patch is preserved');
        assert.ok(record.drafts.every(row=>row.evidence.every(item=>typeof item.text==='string')));
        assert.equal(record.failure.stage,'deterministic-repair');
      }
      if(scenario==='budget-block')assert.equal(calls.length,0,'budget refusal occurs before provider fetch');
      if(scenario==='partial-unrepairable')assert.equal(calls.filter(call=>call.audit).length,0,'an unaffordable partial draft must not spend on an unusable audit');
      if(scenario==='diagnostic-capture-fail-audit-reject'){
        assert.equal(calls.length,2);
        assert.match(result.stderr,/Optional edition diagnostics unavailable/);
        assert.match(result.stderr,/all selected stories failed the independent evidence audit/);
      }
      if(scenario==='diagnostic-write-fail-invalid'){
        assert.equal(calls.length,2,'mandatory final gate still follows independent audit');
        assert.match(result.stderr,/Could not save optional edition candidate diagnostics/);
        assert.match(result.stderr,/Could not append quarantine failure details/);
        assert.match(result.stderr,/invalid edition: slot must be/,'original gate error survives diagnostic append failure');
      }
      if(scenario==='artifact-reject'){
        assert.equal(calls.length,2,'the final rejection follows the independent audit');
        const record=JSON.parse(fs.readFileSync(path.join(artifacts,scenario,'candidate.json')));
        assert.equal(record.failure.stage,'final-artifact-validation');
        assert.match(record.failure.message,/Injected final artifact rejection/);
        assert.deepEqual(record.failure.reasons,['Injected final artifact rejection']);
        assert.equal(record.candidate.stories.length,3);
        assert.equal(record.candidateHash,record.candidate.artifactHash);
        assert.equal(record.candidateHash,editionContract.editionHash(record.candidate));
        assert.ok(record.drafts.every(row=>row.evidence.every(item=>typeof item.text==='string')));
        assert.ok(record.audit.inputs.length===3 && Object.values(record.audit.response.reviews).every(review=>review.ok));
        assert.equal(record.publicationAllowed,false);
        assert.match(result.stdout,/quarantine_ready=true/);
        assert.equal(fs.existsSync(path.join(tmp,'data/candidates')),false,'raw evidence never enters committed candidates');
      }
    }
    assert.ok(calls.length<=3,'no internal model retry runaway');
    if(scenario.startsWith('diagnostic-')){
      assert.equal(fs.existsSync(path.join(tmp,'data/candidates')),false,'diagnostic failure never falls back to source evidence in Git');
      assert.equal(fs.existsSync(path.join(tmp,'edition-quarantine')),false);
    }
  }
  console.log('edition generation flow: ok');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/happening.yml'),'utf8');
  assert.match(workflow,/if: always\(\) && steps\.edition\.outputs\.quarantine_ready == 'true'/);
  assert.match(workflow,/path: \$\{\{ runner\.temp \}\}\/edition-quarantine\/candidate\.json\s+if-no-files-found: ignore\s+retention-days: 1/);
  assert.doesNotMatch(workflow,/git add[^\n]*quarantine/);
} finally {fs.rmSync(tmp,{recursive:true,force:true});fs.rmSync(artifacts,{recursive:true,force:true});}
