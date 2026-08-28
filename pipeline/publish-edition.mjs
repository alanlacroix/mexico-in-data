// One command owns a Mexico Brief publication attempt. The editorial scripts remain
// deliberately separate and testable; this file owns their order and the single final
// state transition: published, deferred, or blocked. Nothing outside this command may
// assemble or certify a homepage edition.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { curationReadiness } = require('./lib/freshness-contract.cjs');
const { briefReadiness } = require('./lib/brief-readiness.cjs');
const { ANALYSIS_POLICY } = require('./lib/analysis-contract.cjs');

const FILE = fileURLToPath(import.meta.url);
const PIPELINE = path.dirname(FILE);
const ROOT = path.resolve(PIPELINE, '..');
const DATA = path.join(ROOT, 'data');
const NODE = process.execPath;
const editorialDate = process.env.PUBLICATION_DATE || '';
const slot = process.env.PUBLICATION_SLOT || '';
const publicationId = process.env.PUBLICATION_ID || '';

class DeferredEdition extends Error {}
class StageFailure extends Error {
  constructor(stage, detail) {
    super(`${stage} failed${detail ? `: ${detail}` : ''}`);
    this.stage = stage;
  }
}

const read = (name, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch { return fallback; }
};

function run(stage, command, args, options = {}) {
  console.log(`\n== ${stage} ==`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new StageFailure(stage, result.error.message);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '')
      .replace(/\s+/g, ' ').trim().slice(-500);
    throw new StageFailure(stage, detail || `exit ${result.status}`);
  }
}

const node = (stage, script, args = [], options = {}) => run(
  stage,
  NODE,
  [path.join(PIPELINE, script), ...args],
  options,
);

function writeOutputs(state, reason, stagingSafe = false) {
  const cleanReason = String(reason || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 600);
  const lines = [`state=${state}`, `staging_safe=${stagingSafe}`, `reason=${cleanReason}`].join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(`\npublication outcome: ${state}${cleanReason ? ` · ${cleanReason}` : ''}`);
}

function writeNonPublishedReceipt(state, reason) {
  node(`Write ${state} receipt`, 'write-publication-status.mjs', [], {
    env: { PUBLICATION_STATE: state, PUBLICATION_REASON: reason },
  });
}

function requireFreshCuration() {
  const happening = read('happening.json');
  const result = curationReadiness(happening.meta?.curation, editorialDate);
  if (!result.ok) throw new DeferredEdition(result.reason);
}

function requireScheduledOutcomes() {
  const status = read('event-status.json');
  if (status.meta?.editorialDate !== editorialDate) {
    throw new StageFailure('Scheduled-outcome audit', 'the audit has the wrong editorial date');
  }
  if (Number(status.meta?.blockers) > 0) {
    const names = (status.outcomes || [])
      .filter((outcome) => outcome.hardBlock || outcome.status === 'missing')
      .map((outcome) => outcome.label || outcome.id)
      .filter(Boolean);
    throw new DeferredEdition(`scheduled outcome awaiting a verified report${names.length ? `: ${names.join(', ')}` : ''}`);
  }
}

// A field-rejected or budget-blocked explanation already received its one bounded
// attempt against this exact locked selection. When the source ledger is unchanged,
// another run would buy the same work again. A low-importance optional tail may be
// omitted by the final builder; a lead, scheduled item, or importance-7+ fact blocks.
export function priorTerminalAnalysisAttempt(brief, happening) {
  const selectedIds = Array.isArray(brief.meta?.selection?.lockedIds)
    ? brief.meta.selection.lockedIds : [];
  const target = happening.meta?.analysisTarget;
  if (!selectedIds.length || !Array.isArray(target?.ids)) return '';
  if (target.policy !== ANALYSIS_POLICY) return '';
  if (JSON.stringify(selectedIds) !== JSON.stringify(target.ids)) return '';
  if ((Number(target.attempt) || 1) < 2) return '';
  const terminal = (target.outcomes || []).filter((outcome) => outcome?.ready !== true
    && ['budget-unavailable', 'field-rejected'].includes(outcome?.reason));
  if (!terminal.length) return '';
  return `prior attempt cannot produce a complete panel (${[...new Set(terminal.map((outcome) => outcome.reason))].join(', ')})`;
}

function requireSelectedExplanations() {
  const result = briefReadiness(read('brief.json'));
  if (result.targetMet) return;
  const target = read('happening.json').meta?.analysisTarget;
  const failures = (target?.outcomes || [])
    .filter((item) => item?.ready !== true)
    .map((item) => `${item.id}: ${item.reason}`);
  throw new DeferredEdition(`Briefly Explained incomplete for ${result.missingTarget.join(', ')}${failures.length ? ` (${failures.join('; ')})` : ''}`);
}

function validateInputs() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(editorialDate)) throw new Error('PUBLICATION_DATE is required');
  if (slot !== 'morning') throw new Error('PUBLICATION_SLOT must be morning');
  if (!publicationId) throw new Error('PUBLICATION_ID is required');
}

function buildEdition() {
  let stagingSafe = false;
  node('Collect news', 'collect-news.js', [], { cwd: PIPELINE });
  node('Curate current events', 'build-happening.js', ['--skip-analysis', '--resume-current-edition'], { cwd: PIPELINE });
  // The reviewed source ledger is safe to persist even when it proves the edition is
  // not publishable yet. Keeping that checkpoint prevents an unchanged copy rejection
  // from rebuying the full curation call every hour; new reporting changes its signature
  // and naturally reopens assessment.
  stagingSafe = true;

  try {
    requireFreshCuration();
    node('Reconcile scheduled outcomes', 'reconcile-scheduled-events.mjs', [], {
      cwd: PIPELINE,
      env: { EDITORIAL_DATE: editorialDate },
    });
    requireScheduledOutcomes();

    node('Lock ranked stories', 'build-brief.js', ['--selection-only'], { cwd: PIPELINE });
    const priorAttempt = priorTerminalAnalysisAttempt(read('brief.json'), read('happening.json'));
    if (priorAttempt) console.log(`\n== Explain ranked stories ==\n  skipped: ${priorAttempt}`);
    else node('Explain ranked stories', 'build-happening.js', ['--analysis-for-brief'], { cwd: PIPELINE });
    node('Build final English edition', 'build-brief.js', ['--omit-unready-tail'], { cwd: PIPELINE });
    requireSelectedExplanations();

    node('Validate editorial data', 'assert-data.js');
    node('Translate selected edition', 'translate-es.mjs', ['--critical'], { cwd: PIPELINE });
    node('Validate final homepage', 'test/homepage-feed-contract.test.mjs');
    node('Write published receipt', 'write-publication-status.mjs', [], {
      env: { PUBLICATION_STATE: 'published' },
    });
    run('Build exact production artifact', 'npm', ['run', 'release']);
    return { state: 'published', reason: 'complete edition ready', stagingSafe: true };
  } catch (error) {
    if (error instanceof DeferredEdition) error.stagingSafe = stagingSafe;
    throw error;
  }
}

function main() {
  validateInputs();
  try {
    const result = buildEdition();
    writeOutputs(result.state, result.reason, result.stagingSafe);
  } catch (error) {
    if (error instanceof DeferredEdition) {
      writeNonPublishedReceipt('deferred', error.message);
      writeOutputs('deferred', error.message, error.stagingSafe === true);
      return;
    }
    const reason = error instanceof Error ? error.message : String(error);
    try {
      writeNonPublishedReceipt('blocked', reason);
    } catch (receiptError) {
      console.error('could not write blocked publication receipt:', receiptError.message);
    }
    writeOutputs('blocked', reason, false);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === FILE) main();
