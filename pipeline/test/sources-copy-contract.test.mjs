import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'sources.njk'), 'utf8');
const sourceHelpers = fs.readFileSync(path.join(root, 'assets', 'mb.js'), 'utf8');
const overview = fs.readFileSync(path.join(root, 'reports', 'mexico-overview-2026.html'), 'utf8');
const topicPages = fs.readFileSync(path.join(root, 'topic-pages.njk'), 'utf8');
const briefData = fs.readFileSync(path.join(root, 'data', 'brief.json'), 'utf8');
const areasData = fs.readFileSync(path.join(root, 'data', 'areas.json'), 'utf8');
const happeningData = fs.readFileSync(path.join(root, 'data', 'happening.json'), 'utf8');

const internalOrOverstatedCopy = [
  /verify endpoint/i,
  /verify paths/i,
  /definitive external diagnosis/i,
  /best public high-frequency activity nowcast/i,
  /almost nobody wires/i,
  /most briefings never wire/i,
  /pipeline check:/i,
  /pipeline connector paused/i,
];

for (const phrase of internalOrOverstatedCopy) {
  assert.doesNotMatch(source, phrase, `Sources page must not publish internal or overstated copy: ${phrase}`);
}

assert.match(source, /Last checked:/, 'feed health should use reader-facing check language');
assert.match(source, /supporting signals, not substitutes for the official releases/i,
  'alternative sources should be framed as supporting evidence');

// Public source links should open something a person can read. Raw endpoints
// remain valid pipeline inputs, but must not be the link exposed in the UI.
assert.match(sourceHelpers, /data\.worldbank\.org\/indicator\//,
  'World Bank API sources should resolve to human-readable indicator pages');
assert.match(sourceHelpers, /cne\.gob\.mx\/ConsultaPrecios\/GasolinasyDiesel/,
  'fuel-price sources should resolve to CNE’s official lookup, not an XML download');
for (const rawLink of [
  /api\.worldbank\.org\/v2\/country\/MEX\/indicator\//i,
  /repodatos\.atdt\.gob\.mx\/CONAPO\/.*\.csv/i,
  /wsDataService\.svc/i,
]) {
  assert.doesNotMatch(overview, rawLink, `overview must not expose a raw data endpoint: ${rawLink}`);
}
assert.doesNotMatch(topicPages, /www\.cnbv\.gob\.mx\/Inclusi%C3%B3n\/Paginas\/Bases-de-Datos\.aspx/i,
  'Payments must not link to CNBV’s certificate-failing legacy database page');
assert.match(topicPages, /pnif\.cnbv\.gob\.mx\/dnoticia\/basededatosinclusionfinanciera2024/i,
  'Payments should link to CNBV’s readable financial-inclusion release');
for (const renderedData of [briefData, areasData, happeningData]) {
  assert.doesNotMatch(renderedData, /dof\.gob\.mx\/abrirPDF\.php/i,
    'Brief links should use the readable DOF issue page, not a PDF download endpoint');
}

console.log('sources-copy-contract: ok');
