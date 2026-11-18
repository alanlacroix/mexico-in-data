import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publishEditorialRecovery, fetchRecoveryEvidence, validateRecoveryRequest } from '../publish-editorial-recovery.mjs';
import { digest, editorialPublicationPlan } from '../lib/editorial-publication.mjs';
import { publicationPlan } from '../publication-plan.mjs';
import lib from '../lib/public-edition.cjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-recovery-'));
const write = (p, value) => { fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(value,null,2)+'\n'); };
try {
  // Synthetic source bodies are test fixtures only, never production evidence.
  let candidate = JSON.parse(fs.readFileSync(new URL('../../data/editions/2026-11-17.json',import.meta.url)));
  for(const story of candidate.stories) {
    story.evidence=['headline','dek','background','view','watch'].map((f,i)=>({id:i===0?'article':f,kind:'article-body',source:story.source,url:story.url}));
    story.evidenceRefs=Object.fromEntries(['headline','dek','background','view','watch'].map((f,i)=>[f,[i===0?'article':f]]));
  }
  candidate.weekStories = candidate.stories;
  candidate.publicationStatus = 'candidate'; delete candidate.approval; candidate=lib.withArtifactHash(candidate);
  const date = candidate.editorialDate;
  const evidence = candidate.stories.map(s => ({storyId:s.id,evidence:s.evidence.map(e=>({...e,text:s.en[e.id==='article'?'headline':e.id]+' '+s.es[e.id==='article'?'headline':e.id]}))}));
  const sources = evidence.map(r=>({storyId:r.storyId,evidence:r.evidence.map(({text,...e})=>({...e,textSha256:digest(text)}))}));
  const prior=JSON.parse(fs.readFileSync(new URL('../../docs/pilot/candidate-2026-09-22.json',import.meta.url))); prior.publicationStatus='approved';
  write('data/edition.json',lib.withArtifactHash(prior));
  const attempts={schemaVersion:1,attempts:[{editorialDate:date,slot:'morning',state:'failed',calls:1,costUSD:0.01,reason:'preserved failure',completedAt:'2026-11-17T14:00:00Z',diagnostics:[{reason:'failed draft preserved'}],recoveries:[{reason:'original failure',calls:1,costUSD:0.01}],modelAccounting:{version:1,receipts:[{id:'settled-fixture',reservedUSD:0.02,accountedUSD:0.01,state:'settled'}]}}]};
  const withdrawals={schemaVersion:1,withdrawals:[]};
  write('data/edition-attempts.json',attempts);write('data/llm-spend.json',{'2026-11':0});write('ops/withdrawn-editions.json',withdrawals);
  const accounting={attemptsSha256:digest(fs.readFileSync(path.join(root,'data/edition-attempts.json'))),spendSha256:digest(fs.readFileSync(path.join(root,'data/llm-spend.json')))};
  const packet={schemaVersion:1,kind:'fresh-independent-editorial-recovery',author:'fixture-author',candidate,priorArtifactHash:lib.withArtifactHash(prior).artifactHash,accounting,sources,review:{reviewer:'fixture-reviewer',freshlyAuthored:true,candidateHash:candidate.artifactHash,sourcesHash:digest(sources),reviewedAt:'2026-11-17T15:00:00Z',summaryAndWeeklyMirrors:'pass',stories:candidate.stories.map(s=>({storyId:s.id,fields:Object.fromEntries(['headline','dek','background','view','watch'].map(f=>[f,{en:'pass',es:'pass'}]))}))}};
  const packetFile=`ops/editorial-recovery/${date}.json`;
  const args={root,packetHash:digest(packet),date,evidence,now:new Date('2026-11-17T16:00:00Z')};
  write(packetFile,packet);
  assert.throws(()=>validateRecoveryRequest({editorialDate:'../../secret',packetHash:args.packetHash,expiresAt:'2026-11-17T16:20:00Z'},args.now),/Invalid/);
  assert.throws(()=>validateRecoveryRequest({editorialDate:date,packetHash:args.packetHash,expiresAt:'2026-11-17T16:20:00Z',extra:true},args.now),/Invalid/);
  assert.throws(()=>publishEditorialRecovery({...args,packetHash:'0'.repeat(64)}),/mismatch/);
  assert.throws(()=>publishEditorialRecovery({...args,now:new Date('2026-11-18T16:00:00Z')}),/Only today/);
  for (const mutate of [p=>{p.accounting.kind='override';},p=>{p.sources[1].storyId=p.sources[0].storyId;},p=>{p.review.reviewedAt='not-a-date';},p=>{p.sources[0].evidence[0].text='must not be public';},p=>{p.sources[0].evidence.push({...p.sources[0].evidence[0],id:'extra'});}]) {
    const bad=structuredClone(packet);mutate(bad);write(packetFile,bad);assert.throws(()=>publishEditorialRecovery({...args,packetHash:digest(bad)}));
  }
  write(packetFile,packet);
  const noReview=structuredClone(packet);noReview.review.stories[0].fields.dek.es='fail';write(packetFile,noReview);
  assert.throws(()=>publishEditorialRecovery({...args,packetHash:digest(noReview)}),/review required/);
  write(packetFile,packet);
  const changed=structuredClone(evidence);changed[0].evidence[0].text+=' changed';assert.throws(()=>publishEditorialRecovery({...args,evidence:changed}),/differs/);
  fs.appendFileSync(path.join(root,'data/llm-spend.json'),' ');assert.throws(()=>publishEditorialRecovery(args),/snapshot changed/);write('data/llm-spend.json',{'2026-11':0});
  const started=structuredClone(attempts);started.attempts[0].state='started';write('data/edition-attempts.json',started);const startedPacket=structuredClone(packet);startedPacket.accounting.attemptsSha256=digest(fs.readFileSync(path.join(root,'data/edition-attempts.json')));write(packetFile,startedPacket);assert.throws(()=>publishEditorialRecovery({...args,packetHash:digest(startedPacket)}),/Unsettled/);write('data/edition-attempts.json',attempts);write(packetFile,packet);
  const reserved=structuredClone(attempts);reserved.attempts[0].modelAccounting.receipts[0].state='reserved';reserved.attempts[0].modelAccounting.receipts[0].accountedUSD=0.02;reserved.attempts[0].costUSD=0.02;write('data/edition-attempts.json',reserved);const reservedPacket=structuredClone(packet);reservedPacket.accounting.attemptsSha256=digest(fs.readFileSync(path.join(root,'data/edition-attempts.json')));write(packetFile,reservedPacket);assert.throws(()=>publishEditorialRecovery({...args,packetHash:digest(reservedPacket)}),/Unsettled/);write('data/edition-attempts.json',attempts);write(packetFile,packet);
  const modified=structuredClone(packet);modified.candidate.summary.en+=' Changed.';modified.candidate=lib.withArtifactHash(modified.candidate);write(packetFile,modified);assert.throws(()=>publishEditorialRecovery({...args,packetHash:digest(modified)}),/Invalid reviewed candidate/);write(packetFile,packet);
  const missing=structuredClone(packet);delete missing.review;write(packetFile,missing);assert.throws(()=>publishEditorialRecovery({...args,packetHash:digest(missing)}));write(packetFile,packet);
  const conflicting=structuredClone(prior);conflicting.summary.en+=' newer';write('data/edition.json',lib.withArtifactHash(conflicting));assert.throws(()=>publishEditorialRecovery(args),/Stale\/conflicting/);write('data/edition.json',lib.withArtifactHash(prior));
  const budgetAttempts={schemaVersion:1,attempts:[{editorialDate:date,slot:'morning',state:'failed',calls:0,costUSD:0,reason:'model budget preflight blocked: spent=0',completedAt:'2026-11-17T14:00:00Z',recoveries:[]}]};assert.equal(publicationPlan({event:'schedule',date,attempts:budgetAttempts,edition:lib.withArtifactHash(prior),withdrawals}).held,true);
  const beforeAttempts=fs.readFileSync(path.join(root,'data/edition-attempts.json'));const beforeSpend=fs.readFileSync(path.join(root,'data/llm-spend.json'));
  const approved=publishEditorialRecovery(args);
  assert.ok(beforeAttempts.equals(fs.readFileSync(path.join(root,'data/edition-attempts.json'))));assert.ok(beforeSpend.equals(fs.readFileSync(path.join(root,'data/llm-spend.json'))));
  assert.deepEqual(publishEditorialRecovery(args),approved);
  const receipt=JSON.parse(fs.readFileSync(path.join(root,`ops/editorial-publications/${date}.json`)));
  assert.deepEqual(publicationPlan({event:'schedule',date,attempts,edition:approved,editorialReceipt:receipt,withdrawals}),{run:false,slot:candidate.slot,retry:false,verify:true});
  const changedAccounting=structuredClone(attempts);changedAccounting.attempts[0].costUSD=1;
  assert.throws(()=>editorialPublicationPlan({receipt,edition:approved,attempts:changedAccounting,date,withdrawals}),/receipt/);
  assert.throws(()=>editorialPublicationPlan({receipt,edition:approved,attempts,date,withdrawals:{schemaVersion:1,withdrawals:[{withdrawnHash:approved.artifactHash}]}}),/withdrawn/);
  const unsafe=structuredClone(packet);unsafe.sources[0].evidence[0].url='https://127.0.0.1/';let fetched=0;await assert.rejects(fetchRecoveryEvidence(unsafe,{fetcher:async()=>{fetched++;return {};}}),/Unregistered/);assert.equal(fetched,0);
  const successPacket=structuredClone(packet);for(const row of successPacket.sources)for(const e of row.evidence){e.url='https://www.elfinanciero.com.mx/test';e.kind='article-body';e.textSha256=digest('full verified fixture body');}let refetches=0;const fetchedBodies=await fetchRecoveryEvidence(successPacket,{fetcher:async()=>{refetches++;return {ok:true,articleBody:true,text:'full verified fixture body'};}});assert.equal(fetchedBodies.length,3);assert.ok(refetches>0);
  const changedBody=structuredClone(packet);changedBody.sources.forEach(r=>r.evidence.forEach(e=>{e.url='https://www.elfinanciero.com.mx/test';e.kind='article-body';}));await assert.rejects(fetchRecoveryEvidence(changedBody,{fetcher:async()=>({ok:true,articleBody:true,text:'changed'})}),/changed/);
  const workflow=fs.readFileSync(new URL('../../.github/workflows/editorial-recovery.yml',import.meta.url),'utf8');
  assert.match(workflow,/group: mexico-brief-production-write/);assert.match(workflow,/git diff --exit-code -- data\/edition-attempts.json data\/llm-spend.json/);assert.ok(!workflow.includes('ANTHROPIC_API_KEY'));assert.ok(!workflow.includes('upload-artifact'));assert.ok(!workflow.includes('EDITORIAL_EVIDENCE_FILE'));
  const ignore=fs.readFileSync(new URL('../../.eleventyignore',import.meta.url),'utf8');for(const p of ['ops/editorial-recovery','ops/editorial-publications'])assert.ok(ignore.includes(p));
  console.log('independent editorial recovery: ok');
} finally {fs.rmSync(root,{recursive:true,force:true});}
