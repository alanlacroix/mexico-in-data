'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateEdition } = require('./public-edition.cjs');
const DEFAULT_DIRECTORY = path.join(__dirname, '../../data/editions');

function assertEdition(edition) {
  const validation = validateEdition(edition);
  if (!validation.ok) throw new Error(`Cannot archive invalid edition: ${validation.errors.join('; ')}`);
}

// Only validated public artifacts enter history. A late retry cannot replace a newer
// edition for the same day. Sources and original dates remain attached to every item.
function archivePublishedEdition(edition, { directory = DEFAULT_DIRECTORY } = {}) {
  assertEdition(edition);
  if (edition.publicationStatus === 'candidate') throw new Error('A candidate must be editorially approved before archiving');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${edition.editorialDate}.json`);
  if (fs.existsSync(file)) {
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    assertEdition(previous);
    if (previous.artifactHash === edition.artifactHash) return file;
    if (Date.parse(previous.generatedAt) >= Date.parse(edition.generatedAt)) {
      throw new Error('Cannot overwrite archive with an older or conflicting edition');
    }
  }
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(edition, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return file;
}

function loadHistory({ directory = DEFAULT_DIRECTORY, current } = {}) {
  const byDay = new Map();
  if (fs.existsSync(directory)) {
    for (const name of fs.readdirSync(directory).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
      const edition = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      assertEdition(edition);
      if (name !== `${edition.editorialDate}.json`) throw new Error(`Archive date mismatch: ${name}`);
      byDay.set(edition.editorialDate, edition);
    }
  }
  if (current) {
    assertEdition(current);
    const previous = byDay.get(current.editorialDate);
    if (previous && previous.generatedAt === current.generatedAt && previous.artifactHash !== current.artifactHash) {
      throw new Error('Current edition conflicts with archive at the same timestamp');
    }
    if (!previous || Date.parse(current.generatedAt) >= Date.parse(previous.generatedAt)) byDay.set(current.editorialDate, current);
  }
  return [...byDay.values()].sort((a, b) => b.editorialDate.localeCompare(a.editorialDate));
}

function editionPath(day, locale = 'en') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid edition path date');
  return `${locale === 'es' ? '/es' : ''}/editions/${day}/`;
}

function archiveRoutes(editions) {
  return ['en', 'es'].flatMap(locale => {
    const root = `${locale === 'es' ? '/es' : ''}/editions/`;
    return [root, ...editions.map(edition => editionPath(edition.editorialDate, locale))].map(route => ({
      route, canonical: route, file: `${route.slice(1)}index.html`,
    }));
  });
}

// Prior published copy is a retrieval index, never independent evidence. The draft
// writer must reopen its source URLs before treating any remembered claim as fact.
function issueMemory(editions, { before, limit = 30 } = {}) {
  const seen = new Set();
  return editions.filter(edition => !before || edition.editorialDate < before).flatMap(edition =>
    edition.stories.map(story => ({
      id: story.id, editionDate: edition.editorialDate, eventDate: story.date,
      section: story.section, headline: story.en.headline, reportedChange: story.en.dek,
      openQuestion: story.en.watch,
      sourceUrls: [...new Set(story.evidence.map(item => item.url))],
      editionUrl: editionPath(edition.editorialDate),
      evidenceStatus: 'retrieval-only-recheck-original-sources',
    }))
  ).filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; }).slice(0, limit);
}

const STOP = new Set('about after before business change changes mexico mexican news report reports reported government year years million billion first latest today more from with that this into have will over under says said policy next'.split(' '));
const terms = text => new Set(String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z]{4,}/g)?.filter(term => !STOP.has(term)) || []);
function relatedMemory(item, memory, limit = 2) {
  const query = terms(`${item.title || ''} ${item.dek || ''}`);
  return memory.map(row => {
    const overlap = [...terms(`${row.headline} ${row.reportedChange}`)].filter(term => query.has(term)).length;
    return { row, score: row.sourceUrls.includes(item.url) ? 100 : overlap };
  }).filter(result => result.score >= 2)
    .sort((a, b) => b.score - a.score || b.row.editionDate.localeCompare(a.row.editionDate))
    .slice(0, limit).map(result => result.row);
}

module.exports = { archivePublishedEdition, loadHistory, editionPath, archiveRoutes, issueMemory, relatedMemory };
