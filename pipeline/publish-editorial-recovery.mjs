// Zero-provider-call promotion of a freshly authored, independently reviewed packet.
// Review attestations are supplied by an authorized editor, not inferred from tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import editionLib from './lib/public-edition.cjs';
import history from './lib/edition-history.cjs';
import { digest, readJson, settledAccounting, editorialPublicationPlan } from './lib/editorial-publication.mjs';
import { fetchArticle } from './lib/fetch-article.js';
import { sourceHosts } from './lib/url-safety.js';
import { deterministicDraftCheck } from './build-edition.mjs';
export async function fetchRecoveryEvidence(packet, { fetcher = fetchArticle } = {}) {
  const registry = readJson(new URL('./news-sources.json', import.meta.url));
  const hosts = new Set(registry.sources.flatMap(sourceHosts));
  if (!Array.isArray(packet.sources) || packet.sources.length < 3 || packet.sources.length > 5) throw new Error('Bounded source manifest required');
  const results = [];
  for (const row of packet.sources) {
    if (!Array.isArray(row.evidence) || row.evidence.length < 1 || row.evidence.length > 6) throw new Error('Bounded evidence manifest required');
    const evidence = [];
    for (const source of row.evidence) {
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || url.username || url.password || !hosts.has(url.hostname)
        || !['article-body', 'prior-article-body'].includes(source.kind)
        || !/^[a-f0-9]{64}$/.test(source.textSha256 || '')) throw new Error('Unregistered or invalid source manifest');
      const page = await fetcher(source.url, { allowedHosts: [url.hostname] });
      if (!page.ok || !page.articleBody || !page.text || digest(page.text) !== source.textSha256) throw new Error('Reviewed source body changed or unavailable: '+source.url);
      evidence.push({ id: source.id, kind: source.kind, source: source.source, url: source.url, text: page.text });
    }
    results.push({ storyId: row.storyId, evidence });
  }
  return results;
}
const fields = ['headline', 'dek', 'background', 'view', 'watch'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k=>Object.hasOwn(value,k));
export function validateRecoveryRequest(request, now = new Date()) {
  if (!exactKeys(request,['editorialDate','packetHash','expiresAt']) || !/^\d{4}-\d{2}-\d{2}$/.test(request.editorialDate) || !/^[a-f0-9]{64}$/.test(request.packetHash || '') || !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt)<=now.getTime() || Date.parse(request.expiresAt)>now.getTime()+30*60000) throw new Error('Invalid or expired editorial request');
  return request;
}
export function publishEditorialRecovery({ root, packetHash, date, evidence, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-f0-9]{64}$/.test(packetHash || '')) throw new Error('Exact date and packet hash required');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (today !== date) throw new Error('Only today may be published');
  const packet = readJson(path.join(root, 'ops/editorial-recovery', `${date}.json`));
  if (digest(packet) !== packetHash || packet.kind !== 'fresh-independent-editorial-recovery' || packet.schemaVersion !== 1) throw new Error('Reviewed packet mismatch');
  if (!exactKeys(packet.accounting,['attemptsSha256','spendSha256']) || Object.values(packet.accounting).some(v=>! /^[a-f0-9]{64}$/.test(v))) throw new Error('Invalid accounting snapshot fields');
  if (!exactKeys(packet,['schemaVersion','kind','author','candidate','priorArtifactHash','accounting','sources','review']) || !Array.isArray(packet.sources) || packet.sources.some(row=>!exactKeys(row,['storyId','evidence']) || !Array.isArray(row.evidence) || row.evidence.some(e=>!exactKeys(e,['id','kind','source','url','textSha256'])))) throw new Error('Invalid public packet/source manifest fields');
  const candidate = packet.candidate;
  if (candidate?.editorialDate !== date || candidate.publicationStatus !== 'candidate' || !['morning','noon'].includes(candidate.slot)
    || candidate.stories.length < 3 || !editionLib.validateEdition(candidate).ok || candidate.artifactHash !== packet.review?.candidateHash) throw new Error('Invalid reviewed candidate');
  for (const story of [...candidate.stories, ...candidate.weekStories]) for (const e of story.evidence || []) if (!exactKeys(e,['id','kind','source','url'])) throw new Error('Source bodies may not enter public artifact');
  const review = packet.review;
  if (!packet.author?.trim() || !review.reviewer?.trim() || packet.author === review.reviewer
    || review.freshlyAuthored !== true || review.sourcesHash !== digest(packet.sources)
    || !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt) > now.getTime()
    || Date.parse(review.reviewedAt) < Date.parse(candidate.generatedAt)
    || review.summaryAndWeeklyMirrors !== 'pass') throw new Error('Independent source and bilingual review required');
  if (!Array.isArray(packet.sources) || new Set(packet.sources.map(r=>r.storyId)).size !== candidate.stories.length || packet.sources.length !== candidate.stories.length || !Array.isArray(evidence) || evidence.length !== candidate.stories.length || !Array.isArray(review.stories) || review.stories.length !== candidate.stories.length) throw new Error('Complete story evidence/review required');
  for (const story of candidate.stories) {
    const sourceRows = evidence.filter(row => row.storyId === story.id);
    const reviews = review.stories.filter(row => row.storyId === story.id);
    if (sourceRows.length !== 1 || reviews.length !== 1) throw new Error('Duplicate or missing source/review');
    const sourceEvidence = sourceRows[0].evidence;
    if (!Array.isArray(sourceEvidence) || !sourceEvidence.length || new Set(sourceEvidence.map(e => e.id)).size !== sourceEvidence.length
      || sourceEvidence.some(e => !e.text?.trim())) throw new Error('Exact fetched source bodies required');
    const manifest = packet.sources.filter(row => row.storyId === story.id);
    if (manifest.length !== 1 || manifest[0].evidence.length !== sourceEvidence.length || sourceEvidence.some(e => !manifest[0].evidence.some(m => m.id === e.id && m.kind === e.kind && m.url === e.url && m.source === e.source && m.textSha256 === digest(e.text)))) throw new Error('Private evidence differs from reviewed manifest');
    if (story.evidence.length !== sourceEvidence.length || new Set(sourceEvidence.map(e=>e.id)).size !== sourceEvidence.length) throw new Error('Extra or duplicate source identity');
    for (const e of story.evidence) if (!sourceEvidence.some(s => s.id === e.id && s.url === e.url && s.kind === e.kind && s.source === e.source)) throw new Error('Candidate source identity mismatch');
    if (!sourceEvidence.some(e => e.id === 'article' && e.kind === 'article-body' && e.url === story.url)) throw new Error('Lead source body required');
    for (const field of fields) if (reviews[0].fields?.[field]?.en !== 'pass' || reviews[0].fields?.[field]?.es !== 'pass') throw new Error('Field-by-field bilingual review required');
    const draft = { ...story.en, es: story.es };
    for (const field of fields) draft[field+'Refs'] = story.evidenceRefs[field];
    const checked = deterministicDraftCheck({ item: story, evidence: sourceEvidence }, draft);
    if (checked.length) throw new Error(`Deterministic story gate: ${story.id}: ${JSON.stringify(checked)}`);
  }
  const attemptsFile = path.join(root, 'data/edition-attempts.json');
  const spendFile = path.join(root, 'data/llm-spend.json');
  const attemptsBytes = fs.readFileSync(attemptsFile), spendBytes = fs.readFileSync(spendFile);
  if (digest(attemptsBytes) !== packet.accounting?.attemptsSha256 || digest(spendBytes) !== packet.accounting?.spendSha256) throw new Error('Accounting snapshot changed');
  const attempts = JSON.parse(attemptsBytes), accountingDateHash = settledAccounting(attempts, date);
  const currentFile = path.join(root, 'data/edition.json'), current = readJson(currentFile);
  if (current.publicationStatus !== 'approved' || !editionLib.validateEdition(current).ok) throw new Error('Invalid prior approved edition');
  const withdrawals = readJson(path.join(root, 'ops/withdrawn-editions.json'));
  if (withdrawals.schemaVersion !== 1 || !Array.isArray(withdrawals.withdrawals)) throw new Error('Invalid withdrawals');
  const receiptFile = path.join(root, 'ops/editorial-publications', `${date}.json`);
  if (fs.existsSync(receiptFile)) {
    const receipt = readJson(receiptFile);
    if (receipt.packetHash !== packetHash) throw new Error('Immutable editorial receipt conflict');
    editorialPublicationPlan({ receipt, edition: current, attempts, date, withdrawals });
    return current;
  }
  if (current.artifactHash !== packet.priorArtifactHash || current.editorialDate >= date || Date.parse(current.generatedAt) >= Date.parse(candidate.generatedAt)) throw new Error('Stale/conflicting prior edition');
  const approved = editionLib.withArtifactHash({ ...candidate, publicationStatus: 'approved', approval: { candidateHash: candidate.artifactHash, reviewer: review.reviewer, approvedAt: review.reviewedAt } });
  if (withdrawals.withdrawals.some(row => [candidate.artifactHash, approved.artifactHash].includes(row.withdrawnHash))) throw new Error('Withdrawn artifact');
  const receipt = { schemaVersion: 1, kind: 'independent-editorial-publication', editorialDate: date, packetHash, candidateHash: candidate.artifactHash, artifactHash: approved.artifactHash, priorArtifactHash: current.artifactHash, reviewer: review.reviewer, approvedAt: review.reviewedAt, additionalProviderCalls: 0, accountingDateHash, attemptsSha256: packet.accounting.attemptsSha256, spendSha256: packet.accounting.spendSha256 };
  editorialPublicationPlan({ receipt, edition: approved, attempts, date, withdrawals });
  // All validation precedes writes. The workflow commits these files atomically only
  // after the full release checks; partial local writes never reach production.
  history.archivePublishedEdition(current, { directory: path.join(root, 'data/editions') });
  history.archivePublishedEdition(approved, { directory: path.join(root, 'data/editions') });
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2)+'\n', { flag: 'wx' });
  editionLib.atomicWriteEdition(currentFile, approved);
  if (!fs.readFileSync(attemptsFile).equals(attemptsBytes) || !fs.readFileSync(spendFile).equals(spendBytes)) throw new Error('Accounting bytes changed');
  return approved;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const request = validateRecoveryRequest(readJson(path.join(root, 'ops/editorial-recovery-request.json')));
  const packet = readJson(path.join(root, 'ops/editorial-recovery', `${request.editorialDate}.json`));
  if (digest(packet) !== request.packetHash) throw new Error('Requested packet mismatch');
  const evidence = await fetchRecoveryEvidence(packet);
  const approved = publishEditorialRecovery({ root, date: request.editorialDate, packetHash: request.packetHash, evidence });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `editorial_date=${approved.editorialDate}\nartifact_hash=${approved.artifactHash}\n`);
  console.log(`Independently curated publication ${approved.editorialDate}: ${approved.artifactHash}`);
}
