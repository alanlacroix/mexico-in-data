// translate-es.mjs — fill the Spanish edition's translation cache.
//
// The /es/ page (Alan, 2026-08-03) renders from data/es/strings.json: a map of
// sha256(english)[:16] -> spanish. This script finds the editorial strings the
// Spanish feed would need, translates the missing ones ONCE under the es-MX
// contract below, and commits the cache. Fixed vocabulary never comes through
// here (hand-written in _data/uiStrings.js), and native-Spanish wire headlines
// never come through here (shown verbatim). Only free editorial English does.
//
// The current Brief is atomic by language. When all of its required strings are
// translated, this script saves a complete Spanish snapshot. If translation is
// unavailable, /es/ carries that snapshot instead of mixing English into Spanish.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { askJSON, hasLLM, models, usage } from './lib/anthropic.js';

const require = createRequire(import.meta.url);
const feed = require('../_data/feed.js');
const { hash, criticalStrings, translatedBriefSnapshot } = require('./lib/es-translation.cjs');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'es', 'strings.json');
const BRIEF_OUT = path.join(ROOT, 'data', 'es', 'brief.json');
const BATCH = 25;
const MAX_PER_RUN = 120;   // backlog ceiling; a first run fills over a few windows
const criticalOnly = process.argv.includes('--critical');

// The es-MX contract. The traps are named because each one is a real slop signature.
const SYSTEM = [
  'Translate the given English news strings into Mexican Spanish for a financial-press reader',
  '(the register of El CEO or Expansión): plain, direct, professional. Not Spain Spanish, not',
  'neutral-LatAm dubbing Spanish.',
  'Hard rules, they win over fluency:',
  '- NUMBERS ARE UNTOUCHABLE: every figure, percentage, date and unit appears verbatim.',
  '- The English "billion" is "mil millones" and "trillion" is "billón". Never confuse them.',
  '- "pp" (percentage points) is "puntos porcentuales" on first use, pp after.',
  '- Keep institution names in their known Spanish forms (Banxico, la Fed, el T-MEC for USMCA,',
  '  la oficina comercial de EE. UU. for US trade office). Never invent an acronym.',
  '- No anglicisms where a plain Spanish word exists. No em dash; use commas or two sentences.',
  '- Translate meaning, not word order. If the English is two sentences, the Spanish may be too.',
  '- Never add, drop, soften or strengthen a claim. This is translation, not editing.',
  'Return one object per input index.',
].join('\n');

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['i', 'es'],
    properties: { i: { type: 'integer' }, es: { type: 'string' } },
  } } },
};

// Exactly the strings feedEs.js would look up. Kept in one place: if feedEs grows a
// field, add it here or the fallback shows English (visible, not broken).
function collect(f) {
  const out = [];
  const push = (s) => { const c = String(s || '').trim(); if (c) out.push(c); };
  push(f.brief);
  for (const s of f.stories) { push(s.title); push(s.dek); push(s.bg); push(s.view); push(s.watch); }
  for (const w of f.week) if (w.lang !== 'ES') { push(w.title); push(w.dek); }
  for (const n of f.numbers) push(n.compare);
  for (const g of f.upcoming) for (const e of g.items) { push(e.title); push(e.what); push(e.why); }
  for (const r of f.econ) push(r.note);
  return [...new Set(out)];
}

async function main() {
  const cache = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; } })();
  const currentFeed = feed();
  const wanted = criticalOnly ? criticalStrings(currentFeed) : collect(currentFeed);
  const pending = wanted.filter((s) => !cache[hash(s)]).slice(0, MAX_PER_RUN);
  if (!pending.length) console.log(`translate-es: ${criticalOnly ? 'critical ' : ''}cache is current.`);
  else if (!hasLLM()) console.log(`translate-es: ${pending.length} strings untranslated, no ANTHROPIC_API_KEY — keeping the last complete Spanish Brief.`);

  let done = 0;
  for (let start = 0; hasLLM() && start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);
    const answer = await askJSON({
      system: SYSTEM,
      user: JSON.stringify(batch.map((text, i) => ({ i, en: text }))),
      schema: SCHEMA,
      maxTokens: 6000,
      // Translation is mechanical and number-checked. Haiku keeps the required
      // bilingual surface affordable; the written register contract does the
      // editorial work rather than open-ended model reasoning.
      model: models.HAIKU,
      effort: 'low',
      // Every selected story is part of the product, not optional polish.
      // Broad wire/context translation keeps the lower standard budget priority.
      priority: criticalOnly ? 'core' : 'standard',
    });
    if (!answer?.items) { console.warn(`  batch ${start / BATCH + 1}: no usable answer`); continue; }
    for (const row of answer.items) {
      const en = batch[row.i];
      const es = String(row.es || '').trim();
      if (!en || !es) continue;
      // Number integrity: every digit-bearing token in the English must survive.
      // A translation that loses or changes a figure is dropped — English shows
      // instead, which is accurate, and the string retries next window.
      const figures = (en.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, ''));
      const ok = figures.every((fig) => es.includes(fig));
      if (!ok) { console.warn(`  figure lost in translation, kept English: "${en.slice(0, 60)}"`); continue; }
      cache[hash(en)] = es;
      done++;
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(cache, null, 1)}\n`);
  const translated = translatedBriefSnapshot(currentFeed, cache);
  if (translated.ok) {
    const briefData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'brief.json'), 'utf8'));
    const snapshotContent = {
      ...translated.snapshot,
      contentSig: briefData.meta?.contentSig || '',
    };
    const prior = (() => { try { return JSON.parse(fs.readFileSync(BRIEF_OUT, 'utf8')); } catch { return null; } })();
    const { savedAt: _priorSavedAt, ...priorContent } = prior || {};
    if (JSON.stringify(priorContent) !== JSON.stringify(snapshotContent)) {
      const snapshot = { ...snapshotContent, savedAt: new Date().toISOString() };
      fs.writeFileSync(BRIEF_OUT, `${JSON.stringify(snapshot, null, 1)}\n`);
      console.log(`translate-es: complete Spanish Brief saved (${snapshot.contentSig.slice(0, 12) || 'no signature'}).`);
    } else {
      console.log(`translate-es: complete Spanish Brief unchanged (${snapshotContent.contentSig.slice(0, 12) || 'no signature'}).`);
    }
  } else {
    console.warn(`translate-es: Spanish Brief incomplete (${translated.missing.length} missing); keeping last complete snapshot.`);
  }
  const { calls, costUSD } = usage();
  console.log(`translate-es: ${done} translated · ${Object.keys(cache).length} cached · ${calls} calls · ~$${costUSD.toFixed(4)}`);
}

main().catch((error) => { console.error('translate-es failed:', error.message); process.exitCode = 0; });
